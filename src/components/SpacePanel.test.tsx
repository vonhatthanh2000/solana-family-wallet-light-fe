import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SpacePanel } from "./SpacePanel";

describe("SpacePanel", () => {
  it("shows a Create Space backend error beside the Create button", () => {
    const html = renderToStaticMarkup(
      <SpacePanel
        spaceName="My space"
        spaceId=""
        canCreate
        createError={{
          source: "backend",
          status: 400,
          code: "INVALID_APPROVAL_RULE",
          message: "Invalid approval rule",
          raw: { message: "Invalid approval rule" },
        }}
        onNameChange={vi.fn()}
        onSpaceIdChange={vi.fn()}
        onCreate={vi.fn()}
        onLoadPayload={vi.fn()}
      />,
    );

    expect(html).toContain("Create Space failed · HTTP 400 · INVALID_APPROVAL_RULE");
    expect(html).toContain("Invalid approval rule");
  });
});
