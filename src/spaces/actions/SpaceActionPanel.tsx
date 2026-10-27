import { useMemo, useState, type FormEvent } from "react";
import bs58 from "bs58";
import { CopyButton } from "../../components/CopyButton";
import type { FamilyRoleDto, MemberSendDto } from "../../members/contracts";
import type { ConnectedSigner } from "../../solana/signers/types";
import type { SpaceDashboard } from "../contracts";
import { DepositPanel } from "../DepositPanel";
import { baseUnitsToDecimal, decimalToBaseUnits } from "../deposits";
import { hasActiveSolanaChain } from "./action-availability";
import type { SpacePermission, SpendDto } from "./contracts";
import { SignaturePrompt } from "../signing/SignaturePrompt";
import { pendingSignatures, type SignatureItem } from "../signing/signature-queue";
import { useSpaceActions } from "./useSpaceActions";

type Props = {
  dashboard: SpaceDashboard;
  role?: FamilyRoleDto;
  actorUserId?: string;
  signer?: ConnectedSigner;
  fallbackNetwork: string;
  onChanged(): Promise<void>;
  // Member sends are owned by the member flow, but their signatures belong in the one signing window.
  memberSends?: readonly MemberSendDto[];
  onSignMemberSend?(send: MemberSendDto): void;
};

const permissionLabels: Record<SpacePermission, string> = {
  VIEW: "View", SPEND: "Spend", VOTE: "Vote", MANAGE_VAULT: "Manage vaults",
  MANAGE_ASSETS: "Manage Space", INVITE: "Invite", PROPOSE_MEMBER_CHANGE: "Manage members",
  TRANSFER_OWNERSHIP: "Transfer ownership",
};

export function SpaceActionPanel({ dashboard, role, actorUserId, signer, fallbackNetwork, onChanged, memberSends = [], onSignMemberSend }: Props) {
  const actions = useSpaceActions({
    spaceId: dashboard.space.spaceId, chains: dashboard.space.chains, vaults: dashboard.vaults,
    role, actorUserId, signer, onChanged,
  });
  const [spaceName, setSpaceName] = useState(dashboard.space.name);
  const [categoryName, setCategoryName] = useState("");
  const [vaultName, setVaultName] = useState("");
  const [vaultTokenId, setVaultTokenId] = useState("");
  const [vaultGoal, setVaultGoal] = useState("");
  const [vaultRuleMode, setVaultRuleMode] = useState<"default" | "custom">("default");
  const [vaultAlwaysAsk, setVaultAlwaysAsk] = useState(true);
  const [vaultThresholdUsd, setVaultThresholdUsd] = useState("");
  const [vaultQuorumPercent, setVaultQuorumPercent] = useState("50");
  const [vaultRequiredMembers, setVaultRequiredMembers] = useState<string[]>([]);
  const [moneyVaultId, setMoneyVaultId] = useState("");
  const [moneyDirection, setMoneyDirection] = useState<"add-money" | "move-to-shared">("add-money");
  const [moneyAmount, setMoneyAmount] = useState("");
  const [spendChainId, setSpendChainId] = useState(() => dashboard.space.chains.find((chain) => chain.chainType === "SOL")?.chainId ?? dashboard.space.chains[0]?.chainId ?? "");
  const [spendToken, setSpendToken] = useState("native");
  const [spendDisplayAmount, setSpendDisplayAmount] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [spendVaultId, setSpendVaultId] = useState("");
  const [spendCategoryId, setSpendCategoryId] = useState("");
  const [spendNote, setSpendNote] = useState("");
  const [guardianOperation, setGuardianOperation] = useState("propose_guardian_removal");
  const [targetGuardian, setTargetGuardian] = useState("");
  const busy = Boolean(actions.busyAction);
  const chainTokens = useMemo(
    () => actions.vaultTokens.filter((token) => token.chainId === spendChainId),
    [actions.vaultTokens, spendChainId],
  );
  const selectedSpendToken = chainTokens.find((token) => token.tokenAddress === spendToken);
  const spendDecimals = spendToken === "native" ? 9 : selectedSpendToken?.decimals;
  const spendSymbol = spendToken === "native" ? "SOL" : selectedSpendToken?.symbol ?? "Token";
  const actorMember = dashboard.members.members.find((member) => member.userId === actorUserId);
  const activeSolana = hasActiveSolanaChain(dashboard.space.chains);

  const signatureItems = pendingSignatures({
    spends: actions.spends,
    guardianActions: actions.guardianActions,
    memberSends,
    actorUserId,
    canVote: actions.can("VOTE"),
    onChainSigner: role?.onChainSigner === true,
    signerAddress: signer?.address,
  });

  const signItem = (item: SignatureItem) => {
    const id = item.id.slice(item.id.indexOf(":") + 1);
    if (item.kind === "spend-approval") {
      const spend = actions.spends.find((row) => row.spendId === id);
      if (spend) void actions.approveSpend(spend);
      return;
    }
    if (item.kind === "spend-execution") {
      const spend = actions.spends.find((row) => row.spendId === id);
      if (spend) void actions.executeSpend(spend);
      return;
    }
    if (item.kind === "member-send") {
      const send = memberSends.find((row) => row.memberSendId === id);
      if (send) onSignMemberSend?.(send);
    }
  };

  const submit = (operation: () => unknown) => (event: FormEvent) => {
    event.preventDefault();
    operation();
  };
  const tokenVaults = spendToken === "native"
    ? dashboard.vaults.filter((vault) => vault.token.chainId === spendChainId && vault.token.symbol !== "USDT")
    : dashboard.vaults.filter((vault) => vault.token.chainId === spendChainId && vault.token.symbol === selectedSpendToken?.symbol);
  const sourceVaults = actions.roleKey === "CHILD"
    ? tokenVaults.filter((vault) => actorMember?.spendVaultIds.includes(vault.vaultId))
    : tokenVaults;
  const quoteMatches = actions.quoteFor === `${moneyVaultId}:${moneyDirection}:${moneyAmount}`;
  const guardianTargetValid = (() => {
    if (guardianOperation !== "rotate_guardian") return true;
    try { return bs58.decode(targetGuardian.trim()).length === 32; }
    catch { return false; }
  })();
  const canManageVault = actions.can("MANAGE_VAULT");
  const quorumPercent = Number(vaultQuorumPercent);
  const customVaultRuleValid = vaultRuleMode === "default" || (
    Number.isInteger(quorumPercent) && quorumPercent >= 1 && quorumPercent <= 100 &&
    (vaultAlwaysAsk || /^\d+(?:\.\d+)?$/.test(vaultThresholdUsd.trim()))
  );
  const createVault = () => actions.createVault({
    name: vaultName.trim(),
    tokenId: vaultTokenId,
    ...(vaultGoal.trim() ? { goalAmount: vaultGoal.trim() } : {}),
    ...(vaultRuleMode === "custom" ? {
      approvalRule: {
        alwaysAsk: vaultAlwaysAsk,
        ...(!vaultAlwaysAsk ? { thresholdUsd: vaultThresholdUsd.trim() } : {}),
        quorumPercent,
        ...(vaultRequiredMembers.length ? { mustIncludeMemberIds: vaultRequiredMembers } : {}),
      },
    } : {}),
  });
  const changeSpendDisplayAmount = (value: string) => {
    setSpendDisplayAmount(value);
    if (spendDecimals === undefined) { setSpendAmount(""); return; }
    try { setSpendAmount(decimalToBaseUnits(value, spendDecimals).toString()); }
    catch { setSpendAmount(""); }
  };
  const changeSpendBaseUnits = (value: string) => {
    setSpendAmount(value);
    if (spendDecimals === undefined || !/^\d+$/.test(value)) { setSpendDisplayAmount(""); return; }
    try { setSpendDisplayAmount(baseUnitsToDecimal(value, spendDecimals)); }
    catch { setSpendDisplayAmount(""); }
  };
  const resetSpendAmounts = () => { setSpendDisplayAmount(""); setSpendAmount(""); };

  return (
    <section className="space-actions" aria-labelledby="space-actions-title">
      <div className="section-heading">
        <div><p className="eyebrow">Role-aware workspace</p><h2 id="space-actions-title">Space actions</h2><p>The backend remains authoritative if membership or on-chain state changes.</p></div>
        <button className="secondary" onClick={() => void actions.refresh()} disabled={busy}>{actions.busyAction === "refresh-actions" ? "Refreshing…" : "Refresh actions"}</button>
      </div>

      <SignaturePrompt
        items={signatureItems}
        busy={busy}
        walletLabel={signer ? `${signer.address.slice(0, 4)}…${signer.address.slice(-4)}` : undefined}
        onSign={signItem}
      />

      <div className="capability-strip">
        <strong>{role?.labels.en ?? role?.key ?? "Loading role"}</strong>
        {(role?.permissions ?? []).map((permission) => <span className="permission-chip" key={permission}>{permissionLabels[permission as SpacePermission] ?? permission}</span>)}
      </div>
      {actions.error && <div className="inline-error" role="alert"><strong>Action failed{actions.error.code ? ` · ${actions.error.code}` : ""}</strong><p>{actions.error.message}</p><button className="secondary" onClick={actions.clearError}>Dismiss</button></div>}
      {actions.notice && <div className="result success">{actions.notice}</div>}
      {dashboard.space.memberChangeInProgress && <div className="result warning">A member change is reaching the chains. Actions sharing the Space nonce may queue or be refused until it settles.</div>}

      <DepositPanel
        chain={dashboard.space.chains.find((chain) => chain.chainType === "SOL")}
        tokens={actions.vaultTokens}
        signer={signer}
        fallbackNetwork={fallbackNetwork}
        onSettled={onChanged}
      />

      {actions.can("MANAGE_ASSETS") && (
        <div className="action-group">
          <h3>Space setup</h3>
          <div className="action-grid">
            <form onSubmit={submit(() => void actions.renameSpace(spaceName))}>
              <h4>Rename Space</h4><label>Name<input maxLength={24} value={spaceName} onChange={(event) => setSpaceName(event.target.value)} /></label>
              <button disabled={busy || !spaceName.trim()}>Save name</button>
              <label>Photo (JPG/PNG, up to 5 MB)<input type="file" accept="image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void actions.setSpacePhoto(file); }} /></label>
              {dashboard.space.photo && <button type="button" className="danger" disabled={busy} onClick={() => void actions.removeSpacePhoto()}>Remove photo</button>}
            </form>
            <form onSubmit={submit(() => { void actions.createCategory(categoryName); setCategoryName(""); })}>
              <h4>Spend categories</h4><label>New category<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /></label>
              <button disabled={busy || !categoryName.trim()}>Add category</button>
              <div className="category-list">{actions.categories.map((category) => <CategoryAction key={category.id} category={category} actions={actions} busy={busy} />)}</div>
            </form>
          </div>
        </div>
      )}

      <div className="action-group">
          <h3>Create Vault</h3>
          {!role && <div className="result warning">Role permissions are still loading or could not be read. Refresh actions before creating a Vault.</div>}
          {role && !canManageVault && <div className="result warning">Your {role.labels.en ?? role.key} role does not grant Manage Vault permission.</div>}
          <form className="vault-create-form" onSubmit={submit(() => void createVault())}>
            <div className="inline-form">
            <label>Name<input value={vaultName} onChange={(event) => setVaultName(event.target.value)} maxLength={24} /></label>
            <label>Token<select value={vaultTokenId} onChange={(event) => setVaultTokenId(event.target.value)}><option value="">Select token</option>{actions.vaultTokens.map((token) => <option value={token.tokenId} key={token.tokenId}>{token.symbol} · {token.chainName}</option>)}</select></label>
            <label>Goal (optional)<input inputMode="decimal" value={vaultGoal} onChange={(event) => setVaultGoal(event.target.value)} placeholder="2500" /></label>
            <label>Approval rule<select value={vaultRuleMode} onChange={(event) => setVaultRuleMode(event.target.value as typeof vaultRuleMode)}><option value="default">Use Space default</option><option value="custom">Custom rule</option></select></label>
            </div>
            {vaultRuleMode === "custom" && <fieldset className="approval-rule-fields"><legend>Custom approval rule</legend><label className="checkbox-label"><input type="checkbox" checked={vaultAlwaysAsk} onChange={(event) => setVaultAlwaysAsk(event.target.checked)} />Always require approval</label>{!vaultAlwaysAsk && <label>Ask above USD<input inputMode="decimal" value={vaultThresholdUsd} onChange={(event) => setVaultThresholdUsd(event.target.value)} placeholder="200" /></label>}<label>Quorum percent<input type="number" min="1" max="100" step="1" value={vaultQuorumPercent} onChange={(event) => setVaultQuorumPercent(event.target.value)} /></label><div><strong>Required voters (optional)</strong><div className="required-voter-list">{dashboard.members.members.filter((member) => member.isVoter && member.status === "ACTIVE").map((member) => <label className="checkbox-label" key={member.userId}><input type="checkbox" checked={vaultRequiredMembers.includes(member.userId)} onChange={(event) => setVaultRequiredMembers((current) => event.target.checked ? [...current, member.userId] : current.filter((id) => id !== member.userId))} />{memberNameForRule(member)}</label>)}</div></div></fieldset>}
            <button disabled={busy || !canManageVault || !vaultName.trim() || !vaultTokenId || !customVaultRuleValid}>Create vault</button>
          </form>
        </div>

      {dashboard.vaults.length > 0 && (
        <div className="action-group">
          <h3>Vault details and album</h3>
          <div className="action-grid">{dashboard.vaults.map((vault) => <VaultActionCard key={vault.vaultId} vault={vault} members={dashboard.members.members} canManage={actions.can("MANAGE_VAULT")} actions={actions} busy={busy} />)}</div>
        </div>
      )}

      {actions.roleKey !== "CHILD" && dashboard.vaults.length > 0 && (
        <div className="action-group">
          <h3>Move money between Shared Wallet and Vault</h3>
          <form className="inline-form" onSubmit={submit(() => void actions.moveVaultMoney(moneyVaultId, moneyDirection, moneyAmount))}>
            <label>Vault<select value={moneyVaultId} onChange={(event) => setMoneyVaultId(event.target.value)}><option value="">Select vault</option>{dashboard.vaults.map((vault) => <option value={vault.vaultId} key={vault.vaultId}>{vault.name} · {vault.token.symbol}</option>)}</select></label>
            <label>Direction<select value={moneyDirection} onChange={(event) => setMoneyDirection(event.target.value as typeof moneyDirection)}><option value="add-money">Shared Wallet → Vault</option><option value="move-to-shared">Vault → Shared Wallet</option></select></label>
            <label>Decimal amount<input inputMode="decimal" value={moneyAmount} onChange={(event) => setMoneyAmount(event.target.value)} /></label>
            <div className="button-row"><button type="button" className="secondary" disabled={busy || !moneyVaultId || !moneyAmount} onClick={() => void actions.quoteVaultMoney(moneyVaultId, moneyDirection, moneyAmount)}>Get quote</button><button disabled={busy || !moneyVaultId || !moneyAmount || !quoteMatches || actions.quote?.insufficient}>Move / request</button></div>
          </form>
          {actions.quote && <div className={`result ${actions.quote.insufficient ? "failure" : "warning"}`}>Available: {actions.quote.available.formatted} · Path: {actions.quote.path ?? "rule preview"} · Needs {actions.quote.need} of {actions.quote.voters} voters{actions.quote.reason ? ` · ${actions.quote.reason}` : ""}</div>}
        </div>
      )}

      {actions.can("SPEND") && (
        <div className="action-group">
          <h3>Propose external spend</h3><p>Amount is the smallest-unit integer: lamports for SOL or mint base units for SPL. A proposal does not move money.</p>
          <form className="action-grid spend-form" onSubmit={submit(() => void actions.proposeSpend({ chainId: spendChainId, token: spendToken, amount: spendAmount, destination, ...(spendVaultId ? { vaultId: spendVaultId } : {}), ...(spendCategoryId ? { categoryId: spendCategoryId } : {}), ...(spendNote ? { note: spendNote } : {}) }))}>
            <label>Chain<select value={spendChainId} onChange={(event) => { setSpendChainId(event.target.value); setSpendToken("native"); resetSpendAmounts(); }}><option value="">Select chain</option>{dashboard.space.chains.filter((chain) => chain.isDeployed).map((chain) => <option key={chain.chainObjectId} value={chain.chainId}>{chain.chainType} · {chain.chainId}</option>)}</select></label>
            <label>Token<select value={spendToken} onChange={(event) => { setSpendToken(event.target.value); resetSpendAmounts(); }}><option value="native">Native coin</option>{chainTokens.filter((token) => !token.isNative).map((token) => <option key={token.tokenId} value={token.tokenAddress}>{token.symbol}</option>)}</select></label>
            <label>{spendSymbol} amount<input inputMode="decimal" placeholder={spendToken === "native" ? "0.1" : "1.0"} value={spendDisplayAmount} onChange={(event) => changeSpendDisplayAmount(event.target.value)} /></label>
            <label>{spendToken === "native" ? "Lamports" : "Base units"}<input inputMode="numeric" pattern="[1-9][0-9]*" value={spendAmount} onChange={(event) => changeSpendBaseUnits(event.target.value)} /></label>
            <label>Destination<input className="mono" value={destination} onChange={(event) => setDestination(event.target.value)} /></label>
            <label>Source<select value={spendVaultId} onChange={(event) => setSpendVaultId(event.target.value)}><option value="">{actions.roleKey === "CHILD" ? "Select assigned Vault" : "Shared Wallet"}</option>{sourceVaults.map((vault) => <option value={vault.vaultId} key={vault.vaultId}>{vault.name}</option>)}</select></label>
            <label>Category<select value={spendCategoryId} onChange={(event) => setSpendCategoryId(event.target.value)}><option value="">No category</option>{actions.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            <label>Note<input maxLength={60} value={spendNote} onChange={(event) => setSpendNote(event.target.value)} /></label>
            <div className="button-row"><button type="button" className="secondary" disabled={busy || !spendChainId} onClick={() => void actions.previewSpendFee(spendChainId)}>Preview fee</button><button disabled={busy || !spendChainId || !/^[1-9]\d*$/.test(spendAmount) || !destination || (actions.roleKey === "CHILD" && !spendVaultId)}>Propose spend</button></div>
          </form>
          {actions.feePreview && <div className="result warning"><strong>Network fee preview</strong><pre>{JSON.stringify(actions.feePreview, null, 2)}</pre></div>}
        </div>
      )}

      <div className="action-group">
        <h3>Open and submitted spends</h3>
        {!actions.spends.length && <p className="empty">No spends are waiting or in flight.</p>}
        <div className="request-list">{actions.spends.map((spend) => <SpendActionCard key={spend.spendId} spend={spend} actions={actions} busy={busy} />)}</div>
      </div>

      {actions.roleKey === "OWNER" && !activeSolana && (
        <div className="result warning">Solana guardian controls will be available after this Space's Solana deployment completes.</div>
      )}

      {actions.roleKey === "OWNER" && activeSolana && (
        <div className="action-group guardian-panel">
          <h3>Solana guardian security</h3><p>Owner-only. Signed actions are not complete until their persisted status becomes executed.</p>
          <form className="inline-form" onSubmit={submit(() => void actions.guardianAction(guardianOperation, guardianOperation === "rotate_guardian" ? targetGuardian : undefined))}>
            <label>Operation<select value={guardianOperation} onChange={(event) => setGuardianOperation(event.target.value)}><option value="rotate_guardian">Rotate guardian</option><option value="install_guardian">Install guardian</option><option value="propose_guardian_removal">Propose removal</option><option value="cancel_guardian_removal">Cancel removal</option></select></label>
            {guardianOperation === "rotate_guardian" && <label>New guardian public key<input className="mono" value={targetGuardian} onChange={(event) => setTargetGuardian(event.target.value)} /></label>}
            <button disabled={busy || !guardianTargetValid}>Build, sign, and submit</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void actions.executeGuardianRemoval()}>Relay due removal</button>
          </form>
          {guardianOperation === "rotate_guardian" && targetGuardian && !guardianTargetValid && <p className="bad">Enter a valid 32-byte base58 Solana public key.</p>}
          <div className="request-list">{actions.guardianActions.map((action) => <article className="request-card" key={action.actionId}><div className="request-title"><strong>{action.operation.replaceAll("_", " ")}</strong><span className={`status status-${action.status}`}>{action.status}</span></div>{action.failReason && <p className="bad">{action.failReason}</p>}{action.txHash && <span className="copyable"><code className="wrap">{action.txHash}</code><CopyButton value={action.txHash} label="guardian transaction hash" /></span>}</article>)}</div>
        </div>
      )}
    </section>
  );
}

function memberNameForRule(member: SpaceDashboard["members"]["members"][number]): string {
  const profile = member.profile;
  return profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.username || member.userId;
}

function SpendActionCard({ spend, actions, busy }: { spend: SpendDto; actions: ReturnType<typeof useSpaceActions>; busy: boolean }) {
  const mine = spend.proposedBy === actions.actorUserId;
  const voted = Boolean(actions.actorUserId && spend.approverIds.includes(actions.actorUserId));
  const open = ["open", "queued", "signing"].includes(spend.status);
  const [categoryId, setCategoryId] = useState(spend.categoryId ?? "");
  return (
    <article className="request-card">
      <div className="request-title"><strong>{spend.action.amount} {spend.action.token} → {spend.action.destination.slice(0, 8)}…</strong><span className={`status status-${spend.status}`}>{spend.status}</span></div>
      <span>{spend.approverIds.length} / {spend.requiredApprovals} approvals · {spend.chainType} {spend.chainId}</span>
      {spend.note && <p>{spend.note}</p>}
      <div className="button-row">
        {actions.can("VOTE") && !mine && !voted && spend.status === "open" && <button disabled={busy} onClick={() => void actions.approveSpend(spend)}>Sign approval</button>}
        {actions.can("VOTE") && !mine && spend.status === "open" && <button className="danger" disabled={busy} onClick={() => void actions.declineSpend(spend.spendId)}>Decline</button>}
        {mine && spend.readyToSend && open && <button disabled={busy} onClick={() => void actions.executeSpend(spend)}>Sign and execute</button>}
        {(mine || actions.roleKey === "OWNER") && spend.status === "open" && <button className="secondary" disabled={busy} onClick={() => void actions.cancelSpend(spend.spendId)}>Cancel</button>}
      </div>
      {actions.can("MANAGE_ASSETS") && <div className="button-row"><select aria-label="Spend category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">No category</option>{actions.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className="secondary" disabled={busy || categoryId === (spend.categoryId ?? "")} onClick={() => void actions.setSpendCategory(spend.spendId, categoryId || null)}>Save category</button></div>}
      {spend.txHash && <span className="copyable"><code className="wrap">Broadcast: {spend.txHash} (not final until executed)</code><CopyButton value={spend.txHash} label="spend transaction hash" /></span>}
    </article>
  );
}

function CategoryAction({ category, actions, busy }: { category: ReturnType<typeof useSpaceActions>["categories"][number]; actions: ReturnType<typeof useSpaceActions>; busy: boolean }) {
  const [name, setName] = useState(category.name);
  return <div className="category-action"><input aria-label={`Category name ${category.name}`} value={name} disabled={category.isOthers} onChange={(event) => setName(event.target.value)} /><button type="button" className="secondary" disabled={busy || category.isOthers || !name.trim() || name.trim() === category.name} onClick={() => void actions.renameCategory(category.id, name.trim())}>Rename</button>{!category.isOthers && <button type="button" className="danger" disabled={busy} onClick={() => void actions.deleteCategory(category.id)}>Delete</button>}</div>;
}

function VaultActionCard({ vault, members, canManage, actions, busy }: { vault: SpaceDashboard["vaults"][number]; members: SpaceDashboard["members"]["members"]; canManage: boolean; actions: ReturnType<typeof useSpaceActions>; busy: boolean }) {
  const [name, setName] = useState(vault.name);
  const [goal, setGoal] = useState(vault.goalAmount ?? "");
  const [editingRule, setEditingRule] = useState(false);
  const [alwaysAsk, setAlwaysAsk] = useState(vault.approvalRule.alwaysAsk === true || !vault.approvalRule.thresholdUsd);
  const [thresholdUsd, setThresholdUsd] = useState(vault.approvalRule.thresholdUsd ?? "");
  const [quorum, setQuorum] = useState(String(vault.approvalRule.quorumPercent ?? 50));
  const [requiredMembers, setRequiredMembers] = useState<string[]>(vault.approvalRule.mustIncludeMemberIds ?? []);
  const quorumPercent = Number(quorum);
  const proposedRule = {
    alwaysAsk,
    ...(!alwaysAsk ? { thresholdUsd: thresholdUsd.trim() } : {}),
    quorumPercent,
    mustIncludeMemberIds: [...requiredMembers].sort(),
  };
  const currentRule = {
    alwaysAsk: vault.approvalRule.alwaysAsk === true || !vault.approvalRule.thresholdUsd,
    ...(!(vault.approvalRule.alwaysAsk === true || !vault.approvalRule.thresholdUsd) ? { thresholdUsd: vault.approvalRule.thresholdUsd } : {}),
    quorumPercent: vault.approvalRule.quorumPercent ?? 50,
    mustIncludeMemberIds: [...(vault.approvalRule.mustIncludeMemberIds ?? [])].sort(),
  };
  const ruleValid = Number.isInteger(quorumPercent) && quorumPercent >= 1 && quorumPercent <= 100 && (alwaysAsk || /^\d+(?:\.\d+)?$/.test(thresholdUsd.trim()));
  const ruleChanged = JSON.stringify(proposedRule) !== JSON.stringify(currentRule);
  const voters = members.filter((member) => member.isVoter && member.status === "ACTIVE");
  return <article className="request-card"><strong>{vault.name} · {vault.token.symbol}</strong>{canManage && <><label>Name<input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} /></label><label>Goal (blank removes it)<input inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} /></label><button disabled={busy || !name.trim()} onClick={() => void actions.updateVault(vault.vaultId, { name: name.trim(), goalAmount: goal.trim() || null })}>Save Vault</button></>}<div className="vault-rule-summary"><strong>Current approval rule</strong><span>{currentRule.alwaysAsk ? "Always ask" : `Ask above $${currentRule.thresholdUsd}`} · {currentRule.quorumPercent}% quorum{currentRule.mustIncludeMemberIds.length ? ` · ${currentRule.mustIncludeMemberIds.length} required voter(s)` : ""}</span><button type="button" className="secondary" onClick={() => setEditingRule((open) => !open)}>{editingRule ? "Close rule editor" : "Propose rule change"}</button></div>{editingRule && <div className="approval-rule-fields"><label className="checkbox-label"><input type="checkbox" checked={alwaysAsk} onChange={(event) => setAlwaysAsk(event.target.checked)} />Always require approval</label>{!alwaysAsk && <label>Ask above USD<input inputMode="decimal" value={thresholdUsd} onChange={(event) => setThresholdUsd(event.target.value)} /></label>}<label>Quorum percent<input type="number" min="1" max="100" step="1" value={quorum} onChange={(event) => setQuorum(event.target.value)} /></label><div><strong>Required voters (optional)</strong><div className="required-voter-list">{voters.map((member) => <label className="checkbox-label" key={member.userId}><input type="checkbox" checked={requiredMembers.includes(member.userId)} onChange={(event) => setRequiredMembers((current) => event.target.checked ? [...current, member.userId] : current.filter((id) => id !== member.userId))} />{memberNameForRule(member)}</label>)}</div></div><p className="muted">Submitting creates an approval request. The current rule stays active until a majority approves.</p><button disabled={busy || !ruleValid || !ruleChanged} onClick={() => void actions.proposeVaultRuleChange(vault.vaultId, proposedRule)}>Propose rule change</button></div>}<label>Add album photo<input type="file" accept="image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void actions.addVaultPhoto(vault.vaultId, file); }} /></label><div className="vault-album">{vault.photos.map((photo) => <div key={photo.photoId}><img src={photo.url} alt="" /><button className="danger" disabled={busy} onClick={() => void actions.removeVaultPhoto(vault.vaultId, photo.photoId)}>Remove</button></div>)}</div></article>;
}
