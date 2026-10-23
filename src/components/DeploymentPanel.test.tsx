import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DeploymentPanel } from "./DeploymentPanel";

const handlers = {
  onSubmit: vi.fn(),
  onStartPolling: vi.fn(),
  onStopPolling: vi.fn(),
  onFreshPayload: vi.fn(),
};

describe("DeploymentPanel", () => {
  it("keeps deposits disabled while Solana deployment is pending", () => {
    const html = renderToStaticMarkup(
      <DeploymentPanel
        {...handlers}
        status="pending"
        deployment={{
          chainObjectId: "chain",
          chainId: "67",
          chainType: "SOL",
          address: "derived-address",
          isDeployed: false,
          deployState: "pending",
        }}
        hasSignature
        polling
      />,
    );

    expect(html).toContain("Deposits disabled");
    expect(html).not.toContain("Deposits enabled");
  });

  it("enables deposits only after deployment has a confirmed address", () => {
    const html = renderToStaticMarkup(
      <DeploymentPanel
        {...handlers}
        status="deployed"
        deployment={{
          chainObjectId: "chain",
          chainId: "67",
          chainType: "SOL",
          address: "deployed-address",
          isDeployed: true,
        }}
        hasSignature={false}
        polling={false}
      />,
    );

    expect(html).toContain("Deposits enabled");
    expect(html).not.toContain("Deposits disabled");
  });
});
