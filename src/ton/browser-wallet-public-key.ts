import { ensureBrowserBuffer } from "./browser-buffer";

export async function verifiedTonPublicKeyInBrowser(
  publicKey: string,
  address: string,
  network: string,
): Promise<string> {
  ensureBrowserBuffer();
  const { verifiedTonPublicKey } = await import("./wallet-public-key");
  return verifiedTonPublicKey(publicKey, address, network);
}
