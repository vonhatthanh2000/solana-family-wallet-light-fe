import { Buffer } from "buffer";

type BrowserGlobal = typeof globalThis & { Buffer?: typeof Buffer };

export function ensureBrowserBuffer(): typeof Buffer {
  const browserGlobal = globalThis as BrowserGlobal;
  if (!browserGlobal.Buffer) browserGlobal.Buffer = Buffer;
  return browserGlobal.Buffer;
}
