import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { getWallets } from "@wallet-standard/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectStandardWallet,
  listCompatibleSolanaWallets,
  subscribeToCompatibleSolanaWallets,
  subscribeToStandardWallet,
} from "./wallet-standard";

const icon = "data:image/svg+xml;base64,PHN2Zy8+" as const;
const account: WalletAccount = {
  address: "solflare-address",
  publicKey: new Uint8Array(32).fill(3),
  chains: ["solana:devnet"],
  features: ["solana:signMessage"],
};

const unregister: Array<() => void> = [];

function wallet(
  name: string,
  overrides: Partial<Wallet["features"]> = {},
  accounts: readonly WalletAccount[] = [],
): Wallet {
  return {
    version: "1.0.0",
    name,
    icon,
    chains: ["solana:devnet"],
    accounts,
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: vi.fn(async () => ({ accounts: accounts.length ? accounts : [account] })),
      },
      "standard:events": {
        version: "1.0.0",
        on: vi.fn(() => () => undefined),
      },
      "solana:signMessage": {
        version: "1.1.0",
        signMessage: vi.fn(),
      },
      ...overrides,
    },
  };
}

afterEach(() => {
  unregister.splice(0).forEach((cleanup) => cleanup());
});

describe("Wallet Standard signer adapter", () => {
  it("discovers only Solana wallets that support connect, events, and raw message signing", () => {
    const solflare = wallet("Solflare");
    const noRawSigning = wallet("No raw signing", {
      "solana:signMessage": undefined,
    });
    const noEvents = wallet("No events", {
      "standard:events": undefined,
    });
    unregister.push(getWallets().register(solflare, noRawSigning, noEvents));

    const choices = listCompatibleSolanaWallets();

    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({ name: "Solflare", icon });
    expect(choices[0]?.id).toEqual(expect.any(String));
    expect(choices[0]?.id).not.toBe("Solflare");
  });

  it("offers only Solflare among compatible Wallet Standard wallets", () => {
    unregister.push(getWallets().register(wallet("Other wallet"), wallet("Solflare")));

    expect(listCompatibleSolanaWallets().map((choice) => choice.name)).toEqual(["Solflare"]);
  });

  it("publishes the current wallets when discovery subscribes after registration", () => {
    unregister.push(getWallets().register(wallet("Solflare")));
    const snapshots: string[][] = [];

    const unsubscribe = subscribeToCompatibleSolanaWallets((wallets) => {
      snapshots.push(wallets.map((choice) => choice.name));
    });
    unregister.push(unsubscribe);

    expect(snapshots).toEqual([["Solflare"]]);
  });

  it("connects the selected wallet and exposes its exact account", async () => {
    const solflare = wallet("Solflare");
    unregister.push(getWallets().register(solflare));
    const [choice] = listCompatibleSolanaWallets();

    const signer = await connectStandardWallet(choice!.id);

    expect(signer.address).toBe(account.address);
    expect(signer.provider).toBe("Solflare");
    expect(signer.publicKeyBytes()).toEqual(account.publicKey);
    expect(signer.canSignDigest).toBe(true);
    expect(signer.canSignTransaction).toBe(false);
  });

  it("uses Wallet Standard sign-and-send for serialized deposit transactions", async () => {
    const transactionAccount: WalletAccount = {
      ...account,
      features: ["solana:signMessage", "solana:signAndSendTransaction"],
    };
    const signature = new Uint8Array(64).fill(9);
    const signAndSendTransaction = vi.fn(async () => [{ signature }]);
    const solflare = wallet("Solflare", {
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy"],
        signAndSendTransaction,
      },
    }, [transactionAccount]);
    unregister.push(getWallets().register(solflare));
    const [choice] = listCompatibleSolanaWallets();
    const signer = await connectStandardWallet(choice!.id);
    const transaction = new Uint8Array([1, 2, 3]);

    expect(signer.canSignTransaction).toBe(true);
    await expect(signer.signAndSendTransaction!(transaction, "solana:devnet")).resolves.toEqual(expect.any(String));
    expect(signAndSendTransaction).toHaveBeenCalledWith({
      account: transactionAccount,
      transaction,
      chain: "solana:devnet",
      options: { preflightCommitment: "confirmed" },
    });
  });

  it("passes exactly 32 bytes to raw signMessage and returns its 64-byte signature", async () => {
    const signature = new Uint8Array(64).fill(7);
    const signMessage = vi.fn(async (...inputs: Array<{ account: WalletAccount; message: Uint8Array }>) =>
      inputs.map((input) => ({
        signedMessage: Uint8Array.from(input.message),
        signature,
        signatureType: "ed25519" as const,
      })),
    );
    const solflare = wallet("Solflare", {
      "solana:signMessage": { version: "1.1.0", signMessage },
    }, [account]);
    unregister.push(getWallets().register(solflare));
    const [choice] = listCompatibleSolanaWallets();
    const signer = await connectStandardWallet(choice!.id);
    const digest = Uint8Array.from({ length: 32 }, (_, index) => index);

    await expect(signer.signDigest32(digest)).resolves.toEqual(signature);
    expect(signMessage).toHaveBeenCalledWith({ account, message: digest });
  });

  it("re-resolves a compatible wallet that re-registers after an extension restart", async () => {
    const original = wallet("Solflare", {}, [account]);
    const unregisterOriginal = getWallets().register(original);
    unregister.push(unregisterOriginal);
    const [choice] = listCompatibleSolanaWallets();
    const signer = await connectStandardWallet(choice!.id);
    unregisterOriginal();

    const signature = new Uint8Array(64).fill(8);
    const replacementSignMessage = vi.fn(async (...inputs: Array<{ message: Uint8Array }>) =>
      inputs.map((input) => ({ signedMessage: input.message, signature })),
    );
    const replacement = wallet("Solflare", {
      "solana:signMessage": { version: "1.1.0", signMessage: replacementSignMessage },
    }, [account]);
    unregister.push(getWallets().register(replacement));

    await expect(signer.signDigest32(new Uint8Array(32))).resolves.toEqual(signature);
    expect(replacementSignMessage).toHaveBeenCalledOnce();
  });

  it("publishes account changes and disconnects from standard events", async () => {
    let emitChange: ((value: { accounts?: readonly WalletAccount[] }) => void) | undefined;
    const solflare = wallet("Solflare", {
      "standard:events": {
        version: "1.0.0",
        on: vi.fn((_event, listener) => {
          emitChange = listener;
          return () => undefined;
        }),
      },
    }, [account]);
    unregister.push(getWallets().register(solflare));
    const [choice] = listCompatibleSolanaWallets();
    await connectStandardWallet(choice!.id);
    const changes: Array<string | undefined> = [];

    const unsubscribe = subscribeToStandardWallet(choice!.id, (signer) => {
      changes.push(signer?.address);
    });
    const changedAccount = { ...account, address: "changed-address" };
    emitChange?.({ accounts: [changedAccount] });
    emitChange?.({ accounts: [] });
    unsubscribe();

    expect(changes).toEqual(["changed-address", undefined]);
  });

  it("rejects transformed message bytes and non-64-byte signatures", async () => {
    const transformed = new Uint8Array(32).fill(4);
    const transformedWallet = wallet("Solflare", {
      "solana:signMessage": {
        version: "1.1.0",
        signMessage: vi.fn(async () => [{
          signedMessage: transformed,
          signature: new Uint8Array(64),
        }]),
      },
    }, [account]);
    const unregisterTransformed = getWallets().register(transformedWallet);
    unregister.push(unregisterTransformed);
    let [choice] = listCompatibleSolanaWallets();
    let signer = await connectStandardWallet(choice!.id);

    await expect(signer.signDigest32(new Uint8Array(32))).rejects.toThrow(
      "exact raw 32-byte digest",
    );
    unregisterTransformed();

    const shortSignatureWallet = wallet("Solflare", {
      "solana:signMessage": {
        version: "1.1.0",
        signMessage: vi.fn(async (...inputs: Array<{ message: Uint8Array }>) =>
          inputs.map((input) => ({
            signedMessage: input.message,
            signature: new Uint8Array(63),
          })),
        ),
      },
    }, [account]);
    unregister.push(getWallets().register(shortSignatureWallet));
    [choice] = listCompatibleSolanaWallets();
    signer = await connectStandardWallet(choice!.id);

    await expect(signer.signDigest32(new Uint8Array(32))).rejects.toThrow(
      "exactly 64 bytes",
    );
  });

  it("rejects an account change before asking the wallet to sign", async () => {
    const signMessage = vi.fn();
    const solflare = wallet("Solflare", {
      "solana:signMessage": { version: "1.1.0", signMessage },
    }, [account]);
    unregister.push(getWallets().register(solflare));
    const [choice] = listCompatibleSolanaWallets();
    const signer = await connectStandardWallet(choice!.id);
    Object.defineProperty(solflare, "accounts", {
      value: [{ ...account, address: "changed-address" }],
    });

    await expect(signer.signDigest32(new Uint8Array(32))).rejects.toThrow("account changed");
    expect(signMessage).not.toHaveBeenCalled();
  });
});
