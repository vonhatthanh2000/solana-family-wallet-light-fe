import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiagnosticError } from "../../api/types";
import { pollIntervalMs } from "../../flow/poll-interval";
import { normalizeError } from "../../flow/state";
import { signRawSolanaDigest } from "../../solana/signing";
import type { ConnectedSigner } from "../../solana/signers/types";
import type { FamilyRoleDto } from "../../members/contracts";
import type { SpaceChainDto, VaultDto } from "../contracts";
import type {
  GuardianActionDto, MoneyQuoteDto, SpaceCategoryDto, SpacePermission, SpendDto,
  VaultTokenOptionDto,
} from "./contracts";
import { shouldLoadGuardianActions } from "./action-availability";
import { spaceActionApi, type CreateVaultInput, type SpendInput } from "./space-action-api";

type Inputs = {
  spaceId: string;
  chains: SpaceChainDto[];
  vaults: VaultDto[];
  role?: FamilyRoleDto;
  actorUserId?: string;
  signer?: ConnectedSigner;
  onChanged(): Promise<void>;
};

export function useSpaceActions({ spaceId, chains, vaults, role, actorUserId, signer, onChanged }: Inputs) {
  const [categories, setCategories] = useState<SpaceCategoryDto[]>([]);
  const [vaultTokens, setVaultTokens] = useState<VaultTokenOptionDto[]>([]);
  const [spends, setSpends] = useState<SpendDto[]>([]);
  const [guardianActions, setGuardianActions] = useState<GuardianActionDto[]>([]);
  const [quote, setQuote] = useState<MoneyQuoteDto>();
  const [quoteFor, setQuoteFor] = useState<string>();
  const [feePreview, setFeePreview] = useState<Record<string, unknown>>();
  const [busyAction, setBusyAction] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<DiagnosticError>();
  const busyRef = useRef(false);
  const permissions = useMemo(() => new Set(role?.permissions ?? []), [role]);
  const can = useCallback((permission: SpacePermission) => permissions.has(permission), [permissions]);

  const run = useCallback(async <T,>(name: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusyAction(name); setError(undefined); setNotice(undefined);
    try { return await action(); }
    catch (failure) {
      const diagnostic = normalizeError(failure, "backend");
      setError(diagnostic);
      if (["ROLE_NOT_ALLOWED", "NOT_A_MEMBER", "VAULT_NOT_ALLOWED", "NOT_A_SIGNER"].includes(diagnostic.code ?? "")) {
        void onChanged().catch(() => undefined);
      }
      return undefined;
    }
    finally { busyRef.current = false; setBusyAction(undefined); }
  }, [onChanged]);

  const loadSupport = useCallback(async () => {
    if (!spaceId) return;
    const spendTasks = chains.filter((chain) => chain.isDeployed).map((chain) => spaceActionApi.listSpends(spaceId, chain.chainId));
    const [categoryResult, tokenResult, spendResults, guardianResult] = await Promise.all([
      spaceActionApi.listCategories(spaceId),
      spaceActionApi.listVaultTokens(spaceId),
      Promise.all(spendTasks),
      shouldLoadGuardianActions(role?.key, chains) ? spaceActionApi.listGuardianActions(spaceId) : Promise.resolve([]),
    ]);
    setCategories(categoryResult); setVaultTokens(tokenResult); setSpends(spendResults.flat()); setGuardianActions(guardianResult);
  }, [chains, role?.key, spaceId]);

  const refresh = useCallback(async () => {
    await run("refresh-actions", loadSupport);
  }, [loadSupport, run]);

  useEffect(() => {
    setCategories([]); setVaultTokens([]); setSpends([]); setGuardianActions([]); setQuote(undefined); setQuoteFor(undefined); setFeePreview(undefined);
    if (spaceId && role) void refresh();
  }, [refresh, role?.key, spaceId]);

  // A spend another member proposes arrives only from the backend, so an idle Space keeps a slower
  // heartbeat instead of waiting for a manual refresh.
  const activeWork = spends.some((spend) => ["open", "queued", "signing", "submitted"].includes(spend.status)) ||
    guardianActions.some((action) => ["signing", "submitted"].includes(action.status));
  const interval = pollIntervalMs(activeWork);
  useEffect(() => {
    if (!spaceId || !role) return;
    const timer = window.setInterval(() => {
      if (!busyRef.current) void loadSupport().catch((failure) => setError(normalizeError(failure, "poll")));
    }, interval);
    return () => window.clearInterval(timer);
  }, [interval, loadSupport, role, spaceId]);

  const changed = useCallback(async (message: string) => {
    setNotice(message);
    await Promise.all([onChanged(), loadSupport()]);
  }, [loadSupport, onChanged]);

  return {
    categories, vaultTokens, spends, guardianActions, quote, quoteFor, feePreview, busyAction, notice, error, can,
    roleKey: role?.key, actorUserId, signer, vaults,
    clearError: () => setError(undefined), refresh,
    renameSpace: (name: string) => run("rename-space", async () => { await spaceActionApi.renameSpace(spaceId, name); await changed("Space renamed for every member."); }),
    setSpacePhoto: (file: File) => run("set-space-photo", async () => { validatePhoto(file); await spaceActionApi.setSpacePhoto(spaceId, file); await changed("Space photo updated."); }),
    removeSpacePhoto: () => run("remove-space-photo", async () => { await spaceActionApi.removeSpacePhoto(spaceId); await changed("Space photo removed."); }),
    createCategory: (name: string) => run("create-category", async () => { await spaceActionApi.createCategory(spaceId, name); await changed("Category created."); }),
    renameCategory: (categoryId: string, name: string) => run(`rename-category:${categoryId}`, async () => { await spaceActionApi.renameCategory(spaceId, categoryId, name); await changed("Category renamed."); }),
    deleteCategory: (categoryId: string) => run(`delete-category:${categoryId}`, async () => { await spaceActionApi.deleteCategory(spaceId, categoryId); await changed("Category deleted."); }),
    createVault: (input: CreateVaultInput) => run("create-vault", async () => { await spaceActionApi.createVault(spaceId, input); await changed("Vault created."); }),
    updateVault: (vaultId: string, input: { name?: string; goalAmount?: string | null }) => run(`update-vault:${vaultId}`, async () => { await spaceActionApi.updateVault(spaceId, vaultId, input); await changed("Vault updated."); }),
    proposeVaultRuleChange: (vaultId: string, rule: import("../contracts").ApprovalRuleDto) => run(`vault-rule:${vaultId}`, async () => { await spaceActionApi.proposeVaultRuleChange(spaceId, vaultId, rule); await changed("Vault rule change proposed. The current rule remains active until the family approves it."); }),
    addVaultPhoto: (vaultId: string, file: File) => run(`add-vault-photo:${vaultId}`, async () => { validatePhoto(file); await spaceActionApi.addVaultPhoto(spaceId, vaultId, file); await changed("Vault photo added."); }),
    removeVaultPhoto: (vaultId: string, photoId: string) => run(`remove-vault-photo:${photoId}`, async () => { await spaceActionApi.removeVaultPhoto(spaceId, vaultId, photoId); await changed("Vault photo removed."); }),
    quoteVaultMoney: (vaultId: string, direction: "add-money" | "move-to-shared", amount: string) => run("quote-vault-money", async () => {
      setQuote(undefined); setQuoteFor(undefined);
      const result = await spaceActionApi.quoteVaultMoney(spaceId, vaultId, direction, amount);
      setQuote(result); setQuoteFor(`${vaultId}:${direction}:${amount}`); return result;
    }),
    moveVaultMoney: (vaultId: string, direction: "add-money" | "move-to-shared", amount: string) => run("move-vault-money", async () => {
      if (quoteFor !== `${vaultId}:${direction}:${amount}` || !quote) throw new Error("Get a fresh quote for this exact transfer first");
      if (quote.insufficient) throw new Error("The quoted source balance is insufficient");
      const result = await spaceActionApi.moveVaultMoney(spaceId, vaultId, direction, amount, crypto.randomUUID());
      setQuote(undefined); setQuoteFor(undefined);
      await changed(result.outcome === "MOVED" ? "Money moved immediately." : "Approval request created.");
    }),
    proposeSpend: (input: SpendInput) => run("propose-spend", async () => { const result = await spaceActionApi.proposeSpend(spaceId, input); await changed(`Spend ${result.spendId} proposed; broadcast has not happened yet.`); }),
    previewSpendFee: (chainId: string) => run("preview-spend-fee", async () => { const result = await spaceActionApi.getSpendFee(spaceId, chainId); setFeePreview(result); return result; }),
    approveSpend: (spend: SpendDto) => run(`approve-spend:${spend.spendId}`, async () => { if (!signer) throw new Error("Connect the assigned Solana signing wallet first"); if (spend.chainType !== "SOL") throw new Error("This diagnostic client currently signs Solana spends only"); const signature = await signRawSolanaDigest(spend.intent.digest, signer); await spaceActionApi.voteSpend(spaceId, spend.spendId, signature); await changed("Spend approval recorded; no money has moved yet."); }),
    declineSpend: (spendId: string) => run(`decline-spend:${spendId}`, async () => { await spaceActionApi.declineSpend(spaceId, spendId); await changed("Spend declined."); }),
    executeSpend: (spend: SpendDto) => run(`execute-spend:${spend.spendId}`, async () => {
      if (!signer) throw new Error("Connect the proposer Solana wallet first");
      const first = await spaceActionApi.executeSpend(spaceId, spend.spendId);
      if (first.status === "queued") { setNotice("Spend is queued behind another Space action. Refresh and retry."); return; }
      if (first.status !== "signing") { setNotice(`Spend status: ${String(first.status)}. Submitted is not final; keep polling.`); await refresh(); return; }
      const send = first.send as { digest?: unknown } | undefined;
      if (typeof send?.digest !== "string") throw new Error("Signing response is missing send.digest");
      const signature = await signRawSolanaDigest(send.digest, signer);
      const submitted = await spaceActionApi.executeSpend(spaceId, spend.spendId, signature);
      setNotice(`Spend status: ${String(submitted.status)}. Broadcast is not settlement; keep polling.`);
      await refresh();
    }),
    cancelSpend: (spendId: string) => run(`cancel-spend:${spendId}`, async () => { await spaceActionApi.cancelSpend(spaceId, spendId); await changed("Spend cancelled and its reservation released."); }),
    setSpendCategory: (spendId: string, categoryId: string | null) => run(`spend-category:${spendId}`, async () => { await spaceActionApi.setSpendCategory(spaceId, spendId, categoryId); await changed("Spend category updated."); }),
    guardianAction: (operation: string, targetGuardian?: string) => run(`guardian:${operation}`, async () => {
      if (!signer) throw new Error("Connect the Owner Solana wallet first");
      const payload = await spaceActionApi.guardianPayload(spaceId, operation, targetGuardian);
      const fields = spaceActionApi.guardianPayloadFields(payload);
      if (!fields.actionId || !fields.digest) throw new Error("Guardian payload is missing actionId or digest");
      const signature = await signRawSolanaDigest(fields.digest, signer);
      await spaceActionApi.submitGuardian(spaceId, fields.actionId, signature);
      await changed("Guardian action submitted; poll until executed or failed.");
    }),
    executeGuardianRemoval: () => run("guardian:execute-removal", async () => { await spaceActionApi.executeGuardianRemoval(spaceId); await changed("Due guardian removal relayed; poll its action status."); }),
  };
}

function validatePhoto(file: File): void {
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Photo must be a JPG or PNG image");
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be 5 MB or smaller");
}
