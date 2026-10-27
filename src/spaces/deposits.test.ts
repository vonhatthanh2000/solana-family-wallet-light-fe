import { Keypair, SystemInstruction, Transaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import type { ConnectedSigner } from "../solana/signers/types";
import { baseUnitsToDecimal, decimalToBaseUnits, sendDeposit, solanaNetwork, walletStandardChain } from "./deposits";

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
});
