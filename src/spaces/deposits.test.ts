import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, SystemInstruction, Transaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import type { ConnectedSigner } from "../solana/signers/types";
import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  estimateDepositCost,
  sendDeposit,
  solanaNetwork,
  walletStandardChain,
} from "./deposits";

function testSigner(sender: Keypair, signAndSendTransaction = vi.fn(async () => "transaction-signature")): ConnectedSigner {
  return {
    address: sender.publicKey.toBase58(), provider: "Test wallet",
    canSignDigest: true, canSignTransaction: true,
    publicKeyBytes: () => sender.publicKey.toBytes(), signDigest32: vi.fn(),
    signAndSendTransaction: signAndSendTransaction as unknown as ConnectedSigner["signAndSendTransaction"],
  };
}

function spaceAtaFor(mint: Keypair, space: Keypair) {
  // allowOwnerOffCurve: the Space owner is a program PDA, not a keypair.
  return getAssociatedTokenAddressSync(mint.publicKey, space.publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

describe("Space deposits", () => {
  it("converts display amounts to base units without JavaScript number rounding", () => {
    expect(decimalToBaseUnits("0.000000001", 9)).toBe(1n);
    expect(decimalToBaseUnits("9007199254740993.123456", 6)).toBe(9007199254740993123456n);
    expect(() => decimalToBaseUnits("1.0000001", 6)).toThrow("at most 6 decimal places");
    expect(() => decimalToBaseUnits("0", 9)).toThrow("greater than zero");
  });

  it("converts base units back to a readable amount without losing precision", () => {
    expect(baseUnitsToDecimal("100000000", 9)).toBe("0.1");
    expect(baseUnitsToDecimal("1000000000", 9)).toBe("1");
    expect(baseUnitsToDecimal("9007199254740993123456", 6)).toBe("9007199254740993.123456");
    expect(() => baseUnitsToDecimal("0.1", 9)).toThrow("must be an integer");
  });

  it("maps backend networks to Wallet Standard chain identifiers", () => {
    expect(solanaNetwork("devnet", "testnet")).toBe("devnet");
    expect(solanaNetwork("unknown", "testnet")).toBe("testnet");
    expect(walletStandardChain("mainnet-beta")).toBe("solana:mainnet");
  });

  it("builds a native transfer to the Space PDA and asks the wallet to send it", async () => {
    const sender = Keypair.generate();
    const space = Keypair.generate().publicKey;
    const blockhash = Keypair.generate().publicKey.toBase58();
    const signAndSendTransaction = vi.fn(async (
      ...args: [Uint8Array, `${string}:${string}`]
    ) => {
      void args;
      return "transaction-signature";
    });
    const signer: ConnectedSigner = {
      address: sender.publicKey.toBase58(),
      provider: "Test wallet",
      canSignDigest: true,
      canSignTransaction: true,
      publicKeyBytes: () => sender.publicKey.toBytes(),
      signDigest32: vi.fn(),
      signAndSendTransaction,
    };

    const result = await sendDeposit({
      signer,
      spaceAddress: space.toBase58(),
      chainId: "devnet",
      fallbackNetwork: "testnet",
      amount: "1.25",
      rpcUrl: "https://rpc.example.test",
      connection: { getLatestBlockhash: vi.fn(async () => ({ blockhash, lastValidBlockHeight: 1 })) } as never,
    });

    expect(result).toMatchObject({
      signature: "transaction-signature",
      destinationAddress: space.toBase58(),
      baseUnits: "1250000000",
      network: "devnet",
    });
    expect(signAndSendTransaction).toHaveBeenCalledWith(expect.any(Uint8Array), "solana:devnet");
    const transaction = Transaction.from(signAndSendTransaction.mock.calls[0]![0]);
    expect(transaction.instructions).toHaveLength(1);
    expect(SystemInstruction.decodeTransfer(transaction.instructions[0]!).lamports).toBe(1_250_000_000n);
  });

  it("pairs an idempotent ATA creation paid by the sender with the checked transfer, even when the ATA is ready", async () => {
    for (const rentLamports of ["2039280", "0", undefined]) {
      const sender = Keypair.generate();
      const space = Keypair.generate();
      const mint = Keypair.generate();
      const spaceAta = spaceAtaFor(mint, space);
      const blockhash = Keypair.generate().publicKey.toBase58();
      const signAndSendTransaction = vi.fn(async () => "transaction-signature");

      const result = await sendDeposit({
        signer: testSigner(sender, signAndSendTransaction),
        spaceAddress: space.publicKey.toBase58(),
        chainId: "devnet",
        fallbackNetwork: "devnet",
        amount: "2.5",
        token: {
          tokenAddress: mint.publicKey.toBase58(),
          symbol: "dUSDT",
          decimals: 6,
          depositAddress: spaceAta.toBase58(),
          rentLamports,
        },
        rpcUrl: "https://rpc.example.test",
        connection: { getLatestBlockhash: vi.fn(async () => ({ blockhash, lastValidBlockHeight: 1 })) } as never,
      });

      expect(result).toMatchObject({
        destinationAddress: spaceAta.toBase58(),
        baseUnits: "2500000",
        opensTokenAccount: true,
      });
      const transaction = Transaction.from((signAndSendTransaction.mock.calls[0] as unknown as [Uint8Array])[0]);
      expect(transaction.instructions).toHaveLength(2);
      const [create, transfer] = transaction.instructions;
      expect(create!.programId.toBase58()).toBe(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
      // Rent payer first, then the ATA, its PDA owner, and the mint.
      expect(create!.keys[0]!.pubkey.toBase58()).toBe(sender.publicKey.toBase58());
      expect(create!.keys[0]!.isSigner).toBe(true);
      expect(create!.keys[1]!.pubkey.toBase58()).toBe(spaceAta.toBase58());
      expect(create!.keys[2]!.pubkey.toBase58()).toBe(space.publicKey.toBase58());
      expect(create!.keys[3]!.pubkey.toBase58()).toBe(mint.publicKey.toBase58());
      expect(transfer!.programId.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
      expect(transfer!.keys[2]!.pubkey.toBase58()).toBe(spaceAta.toBase58());
      expect(transaction.feePayer!.toBase58()).toBe(sender.publicKey.toBase58());
    }
  });

  it("refuses a published deposit address that is not the ATA of this Space and mint", async () => {
    const sender = Keypair.generate();
    const signer = testSigner(sender, vi.fn(async () => "never"));

    await expect(sendDeposit({
      signer,
      spaceAddress: Keypair.generate().publicKey.toBase58(),
      chainId: "devnet",
      fallbackNetwork: "devnet",
      amount: "1",
      token: {
        tokenAddress: Keypair.generate().publicKey.toBase58(),
        symbol: "dUSDT",
        decimals: 6,
        depositAddress: Keypair.generate().publicKey.toBase58(),
        rentLamports: "2039280",
      },
      rpcUrl: "https://rpc.example.test",
      connection: { getLatestBlockhash: vi.fn() } as never,
    })).rejects.toThrow(/not the associated token account/);
    expect(signer.signAndSendTransaction).not.toHaveBeenCalled();
  });

  it("prices the built message with the RPC and adds the one-off rent the sender pays", async () => {
    const sender = Keypair.generate();
    const space = Keypair.generate();
    const mint = Keypair.generate();
    const blockhash = Keypair.generate().publicKey.toBase58();
    const connection = {
      getLatestBlockhash: vi.fn(async () => ({ blockhash, lastValidBlockHeight: 1 })),
      getFeeForMessage: vi.fn(async () => ({ context: { slot: 1 }, value: 5_000 })),
      getBalance: vi.fn(async () => 3_000_000),
    } as never;
    const request = {
      senderAddress: sender.publicKey.toBase58(),
      spaceAddress: space.publicKey.toBase58(),
      chainId: "devnet",
      fallbackNetwork: "devnet",
      amount: "2.5",
      rpcUrl: "https://rpc.example.test",
      connection,
    };
    const token = {
      tokenAddress: mint.publicKey.toBase58(),
      symbol: "dUSDT",
      decimals: 6,
      depositAddress: spaceAtaFor(mint, space).toBase58(),
    };

    await expect(estimateDepositCost({ ...request, token: { ...token, rentLamports: "2039280" } })).resolves.toEqual({
      feeLamports: "5000",
      rentLamports: "2039280",
      requiredLamports: "2044280",
      senderLamports: "3000000",
      sufficient: true,
      shortfallLamports: "0",
      opensTokenAccount: true,
    });

    // Absent rent is unknown, so no total can be claimed and nothing is called sufficient.
    await expect(estimateDepositCost({ ...request, token })).resolves.toMatchObject({
      rentLamports: undefined,
      requiredLamports: undefined,
      sufficient: undefined,
      shortfallLamports: undefined,
    });

    // A native deposit owes no rent, and the transferred lamports count towards what is needed.
    await expect(estimateDepositCost(request)).resolves.toMatchObject({
      rentLamports: "0",
      requiredLamports: "2500005000",
      sufficient: false,
      // 2.5 SOL plus the fee, against a 0.003 SOL balance.
      shortfallLamports: "2497005000",
      opensTokenAccount: false,
    });
  });
});
