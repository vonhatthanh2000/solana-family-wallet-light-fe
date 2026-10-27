import { Buffer } from "buffer";
import { afterEach, describe, expect, it } from "vitest";
import { installBrowserPolyfills } from "./browser-polyfills";

const originalBuffer = globalThis.Buffer;

afterEach(() => {
  globalThis.Buffer = originalBuffer;
});

describe("browser startup polyfills", () => {
  it("installs Buffer before browser-only Solana modules are loaded", () => {
    globalThis.Buffer = undefined as unknown as typeof Buffer;

    installBrowserPolyfills();

    expect(globalThis.Buffer).toBe(Buffer);
    expect(globalThis.Buffer.from([1, 2, 3])).toEqual(Buffer.from([1, 2, 3]));
  });

  it("preserves an existing host Buffer implementation", () => {
    const existing = Buffer;
    globalThis.Buffer = existing;

    installBrowserPolyfills();

    expect(globalThis.Buffer).toBe(existing);
  });
});
