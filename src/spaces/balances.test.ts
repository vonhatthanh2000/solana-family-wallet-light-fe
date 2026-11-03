import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey, type AccountInfo } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { readWalletBalances } from "./balances";

/** A classic SPL token account: mint, owner, then the u64 amount. */
function tokenAccount(mint: PublicKey, owner: PublicKey, amount: bigint): AccountInfo<Buffer> {
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data, 0);
  owner.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(amount, 64);
  data.writeUInt32LE(1, 108); // state: initialized
  return { lamports: 2_039_280, owner: TOKEN_PROGRAM_ID, executable: false, rentEpoch: 0, data };
}

const lamportsOnly = (lamports: number): AccountInfo<Buffer> => ({
  lamports, owner: new PublicKey("11111111111111111111111111111111"),
  executable: false, rentEpoch: 0, data: Buffer.alloc(0),
});

describe("wallet balances", () => {
  it("reads native and SPL balances for a wallet and a PDA in one round trip", async () => {
    const sender = Keypair.generate().publicKey;
    const space = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const senderAta = getAssociatedTokenAddressSync(mint, sender, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const spaceAta = getAssociatedTokenAddressSync(mint, space, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const getMultipleAccountsInfo = vi.fn(async (keys: PublicKey[]) => keys.map((key) => {
      if (key.equals(sender)) return lamportsOnly(1_500_000);
      if (key.equals(space)) return lamportsOnly(2_136_720);
      if (key.equals(senderAta)) return tokenAccount(mint, sender, 25_000_000n);
      if (key.equals(spaceAta)) return tokenAccount(mint, space, 10_000_000n);
      return null;
    }));

    const balances = await readWalletBalances({
      wallets: [
        { label: "Personal wallet", address: sender.toBase58() },
        { label: "Space wallet", address: space.toBase58(), ownerOffCurve: true },
      ],
      tokens: [{ mint: mint.toBase58(), symbol: "dUSDT", decimals: 6 }],
      rpcUrl: "https://rpc.example.test",
      connection: { getMultipleAccountsInfo } as never,
    });

    expect(getMultipleAccountsInfo).toHaveBeenCalledTimes(1);
    expect(balances).toEqual([
      {
        label: "Personal wallet", address: sender.toBase58(), lamports: "1500000",
        tokens: [{ mint: mint.toBase58(), symbol: "dUSDT", decimals: 6, baseUnits: "25000000", ata: senderAta.toBase58() }],
      },
      {
        // The Space PDA is off-curve, so its ATA only resolves with allowOwnerOffCurve.
        label: "Space wallet", address: space.toBase58(), lamports: "2136720",
        tokens: [{ mint: mint.toBase58(), symbol: "dUSDT", decimals: 6, baseUnits: "10000000", ata: spaceAta.toBase58() }],
      },
    ]);
  });

  it("separates an unopened token account from a zero balance, and an unseen address from an error", async () => {
    const sender = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const ata = getAssociatedTokenAddressSync(mint, sender, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

    const [missing] = await readWalletBalances({
      wallets: [{ label: "Personal wallet", address: sender.toBase58() }],
      tokens: [{ mint: mint.toBase58(), symbol: "dUSDT", decimals: 6 }],
      rpcUrl: "https://rpc.example.test",
      connection: { getMultipleAccountsInfo: vi.fn(async (keys: PublicKey[]) => keys.map(() => null)) } as never,
    });

    expect(missing?.lamports).toBe("0");
    expect(missing?.tokens[0]?.baseUnits).toBeUndefined();

    const [zero] = await readWalletBalances({
      wallets: [{ label: "Personal wallet", address: sender.toBase58() }],
      tokens: [{ mint: mint.toBase58(), symbol: "dUSDT", decimals: 6 }],
      rpcUrl: "https://rpc.example.test",
      connection: {
        getMultipleAccountsInfo: vi.fn(async (keys: PublicKey[]) => keys.map((key) => (
          key.equals(ata) ? tokenAccount(mint, sender, 0n) : lamportsOnly(5_000)
        ))),
      } as never,
    });

    expect(zero?.tokens[0]?.baseUnits).toBe("0");
  });

  it("reports an account that is not a classic SPL token account as unopened", async () => {
    const sender = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    const [balance] = await readWalletBalances({
      wallets: [{ label: "Personal wallet", address: sender.toBase58() }],
      tokens: [{ mint: mint.toBase58(), symbol: "dUSDT", decimals: 6 }],
      rpcUrl: "https://rpc.example.test",
      // Right address, wrong contents: Token-2022 or a foreign account must not read as a balance.
      connection: { getMultipleAccountsInfo: vi.fn(async (keys: PublicKey[]) => keys.map(() => lamportsOnly(2_039_280))) } as never,
    });

    expect(balance?.tokens[0]?.baseUnits).toBeUndefined();
  });

  it("asks for nothing when there are no wallets to read", async () => {
    const getMultipleAccountsInfo = vi.fn();
    await expect(readWalletBalances({
      wallets: [], tokens: [], rpcUrl: "https://rpc.example.test",
      connection: { getMultipleAccountsInfo } as never,
    })).resolves.toEqual([]);
    expect(getMultipleAccountsInfo).not.toHaveBeenCalled();
  });
});
