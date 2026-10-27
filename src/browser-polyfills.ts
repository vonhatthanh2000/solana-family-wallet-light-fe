import { Buffer } from "buffer";

export function installBrowserPolyfills(): void {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
}
