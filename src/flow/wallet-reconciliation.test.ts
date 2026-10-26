import { describe, expect, it, vi } from "vitest";
import type { ChainDto, WalletDto, WalletGroupDto } from "../api/types";
import {
  createSpaceWithEffectiveWallet,
  reconcileEffectiveWallets,
} from "./wallet-reconciliation";

const tonChain: ChainDto = {
  _id: "ton-chain",
  chainId: "0x0",
  chainType: "TON",
  network: "testnet",
  name: "TON Testnet",
  isActive: true,
};
const solanaChain: ChainDto = {
  _id: "solana-chain",
  chainId: "0x67",
  chainType: "SOL",
  network: "testnet",
  name: "Solana Devnet",
  isActive: true,
};
const group: WalletGroupDto = {
  _id: "group-zero",
  name: "Main Wallet",
  walletIndex: 0,
  selected: true,
  isHidden: false,
};

function wallet(
  chain: string,
  address: string,
  walletIndex: number,
  overrides: Partial<WalletDto> = {},
): WalletDto {
  return {
    _id: `${chain}-${address}-${walletIndex}`,
    chainId: chain === "TON" ? tonChain._id : solanaChain._id,
    chain,
    address,
    walletIndex,
    isActive: true,
    ...overrides,
  };
}

describe("wallet reconciliation", () => {
  it("registers at the effective TON index and proves the reloaded Solana winner", async () => {
    const tonWallet = wallet("TON", "ton-address", 0, { publicKey: "ab".repeat(32) });
    const higherSolanaWallet = wallet("SOL", "other-solana", 3);
    const connectedSolanaWallet = wallet("SOL", "connected-solana", 0);
    let solanaReads = 0;
    const getWallets = vi.fn(async (chainId: string) => {
      if (chainId === tonChain._id) return [tonWallet];
      solanaReads += 1;
      return solanaReads === 1
        ? [higherSolanaWallet]
        : [connectedSolanaWallet, higherSolanaWallet];
    });
    const registerWallet = vi.fn(async () => connectedSolanaWallet);

    const result = await reconcileEffectiveWallets(
      {
        connectedAddress: "connected-solana",
        expectedNetwork: "testnet",
        allowRegistration: true,
      },
      {
        getChains: vi.fn(async () => ({ items: [tonChain, solanaChain], meta: { page: 1, limit: 100, total: 2 } })),
        getWalletGroups: vi.fn(async () => [group]),
        getWallets,
        registerWallet,
        verifyTonPublicKey: vi.fn(() => "ab".repeat(32)),
      },
    );

    expect(registerWallet).toHaveBeenCalledWith({
      chainId: solanaChain._id,
      address: "connected-solana",
      publicKey: "connected-solana",
      walletIndex: 0,
    });
    expect(solanaReads).toBe(2);
    expect(result.solanaWallet.address).toBe("connected-solana");
    expect(result.walletGroup).toEqual(group);
  });

  it("does not create a Space while another Solana wallet remains backend-effective", async () => {
    const createSpace = vi.fn();
    const tonWallet = wallet("TON", "ton-address", 1, { publicKey: "ab".repeat(32) });
    const otherSolanaWallet = wallet("SOL", "other-solana", 0);

    await expect(
      createSpaceWithEffectiveWallet(
        {
          name: "Family",
          connectedAddress: "connected-solana",
          expectedNetwork: "testnet",
        },
        {
          getChains: vi.fn(async () => ({ items: [tonChain, solanaChain], meta: { page: 1, limit: 100, total: 2 } })),
          getWalletGroups: vi.fn(async () => [group]),
          getWallets: vi.fn(async (chainId: string) =>
            chainId === tonChain._id ? [tonWallet] : [otherSolanaWallet]),
          registerWallet: vi.fn(),
          verifyTonPublicKey: vi.fn(() => "ab".repeat(32)),
          createSpace,
        },
      ),
    ).rejects.toThrow("other-solana");

    expect(createSpace).not.toHaveBeenCalled();
  });

  it("treats registration output as untrusted and rejects a different returned address", async () => {
    const tonWallet = wallet("TON", "ton-address", 0, { publicKey: "ab".repeat(32) });
    const otherSolanaWallet = wallet("SOL", "other-solana", 3);

    await expect(
      reconcileEffectiveWallets(
        {
          connectedAddress: "connected-solana",
          expectedNetwork: "testnet",
          allowRegistration: true,
        },
        {
          getChains: vi.fn(async () => ({ items: [tonChain, solanaChain], meta: { page: 1, limit: 100, total: 2 } })),
          getWalletGroups: vi.fn(async () => [group]),
          getWallets: vi.fn(async (chainId: string) =>
            chainId === tonChain._id ? [tonWallet] : [otherSolanaWallet]),
          registerWallet: vi.fn(async () => otherSolanaWallet),
          verifyTonPublicKey: vi.fn(() => "ab".repeat(32)),
        },
      ),
    ).rejects.toThrow("preferred index is occupied");
  });

  it("rejects registration when the reloaded effective wallet still differs", async () => {
    const tonWallet = wallet("TON", "ton-address", 0, { publicKey: "ab".repeat(32) });
    const otherSolanaWallet = wallet("SOL", "other-solana", 3);
    const connectedSolanaWallet = wallet("SOL", "connected-solana", 0);

    await expect(
      reconcileEffectiveWallets(
        {
          connectedAddress: "connected-solana",
          expectedNetwork: "testnet",
          allowRegistration: true,
        },
        {
          getChains: vi.fn(async () => ({ items: [tonChain, solanaChain], meta: { page: 1, limit: 100, total: 2 } })),
          getWalletGroups: vi.fn(async () => [group]),
          getWallets: vi.fn(async (chainId: string) =>
            chainId === tonChain._id ? [tonWallet] : [otherSolanaWallet]),
          registerWallet: vi.fn(async () => connectedSolanaWallet),
          verifyTonPublicKey: vi.fn(() => "ab".repeat(32)),
        },
      ),
    ).rejects.toThrow("still other-solana");
  });
});
