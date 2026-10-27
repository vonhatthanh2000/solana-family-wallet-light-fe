import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  it("renders an accessible copy icon only when a value exists", () => {
    expect(renderToStaticMarkup(<CopyButton value="address" label="wallet address" />)).toContain('aria-label="Copy wallet address"');
    expect(renderToStaticMarkup(<CopyButton value="" label="wallet address" />)).toBe("");
  });
});
