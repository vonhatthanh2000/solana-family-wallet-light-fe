import type { SpaceChainDto } from "../api/types";

type Props = {
  status: string;
  deployment?: SpaceChainDto;
  hasSignature: boolean;
  polling: boolean;
  busyAction?: string;
  onSubmit(): void;
  onStartPolling(): void;
  onStopPolling(): void;
  onFreshPayload(): void;
};

export function DeploymentPanel({
  status,
  deployment,
  hasSignature,
  polling,
  busyAction,
  onSubmit,
  onStartPolling,
  onStopPolling,
  onFreshPayload,
}: Props) {
  const passed = deployment?.isDeployed === true && Boolean(deployment.address);
  return (
    <section>
      <h2>6. Activation and deployment</h2>
      <div className="actions">
        <button
          onClick={onSubmit}
          disabled={!hasSignature || busyAction === "submit-signature" || status === "pending"}
        >
          {busyAction === "submit-signature" ? "Submitting…" : "Submit signature"}
        </button>
        {polling ? (
          <button className="secondary" onClick={onStopPolling}>Stop polling</button>
        ) : (
          <button className="secondary" onClick={onStartPolling}>Start / continue polling</button>
        )}
        <button className="secondary" onClick={onFreshPayload}>Fetch fresh payload and retry</button>
      </div>
      <dl>
        <dt>Client status</dt>
        <dd>{status}</dd>
        <dt>Deploy state</dt>
        <dd>{deployment?.deployState ?? "—"}</dd>
        <dt>isDeployed</dt>
        <dd>{deployment ? String(deployment.isDeployed) : "—"}</dd>
        <dt>Deposit / PDA address</dt>
        <dd className="mono wrap">{deployment?.address ?? "—"}</dd>
        <dt>Deploy error</dt>
        <dd>{deployment?.deployError ?? "—"}</dd>
      </dl>
      {passed ? (
        <div className="result success"><strong>PASS</strong> — deployed with a non-null address.</div>
      ) : status === "pending" ? (
        <div className="result warning">Queued or deploying. Pending is not a pass.</div>
      ) : null}
    </section>
  );
}
