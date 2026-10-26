import { Address } from "@ton/core";
import { WalletContractV4, WalletContractV5R1 } from "@ton/ton";
import { ensureBrowserBuffer } from "./browser-buffer";

export function verifiedTonPublicKey(
  publicKey: string,
  address: string,
  network: string,
): string {
  if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
    throw new Error("TON publicKey must be 32 bytes of hex");
  }

  try {
    const Buffer = ensureBrowserBuffer();
    const key = Buffer.from(publicKey, "hex");
    const expected = Address.parse(address);
    const v4 = WalletContractV4.create({ workchain: 0, publicKey: key });
    const networkGlobalId = network === "mainnet" ? -239 : -3;
    const v5 = WalletContractV5R1.create({
      workchain: 0,
      publicKey: key,
      walletId: { networkGlobalId } as never,
    });
    if (!v4.address.equals(expected) && !v5.address.equals(expected)) {
      throw new Error("address mismatch");
    }
  } catch {
    throw new Error("TON publicKey does not match the wallet address");
  }

  return publicKey.toLowerCase();
}
