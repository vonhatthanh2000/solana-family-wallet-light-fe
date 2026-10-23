import { ConfigurationPanel } from "./components/ConfigurationPanel";
import { DebugLog } from "./components/DebugLog";
import { DeploymentPanel } from "./components/DeploymentPanel";
import { PayloadPanel } from "./components/PayloadPanel";
import { SpacePanel } from "./components/SpacePanel";
import { WalletPanel } from "./components/WalletPanel";
import { useSolanaSpaceFlow } from "./flow/useSolanaSpaceFlow";

export default function App() {
  const flow = useSolanaSpaceFlow();
  const { state } = flow;
  const shortWallet = state.connectedWallet
    ? `${state.connectedWallet.address.slice(0, 4)}…${state.connectedWallet.address.slice(-4)}`
    : undefined;

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Backend diagnostic client</p>
          <h1>Solana Space signing test</h1>
          <p>Inspect every boundary from Phantom connection through verified PDA deployment.</p>
        </div>
        <div className="header-actions">
          {shortWallet && <span className="wallet-address mono">{shortWallet}</span>}
          <button
            className="secondary"
            onClick={() => void flow.reopenPhantom()}
            disabled={Boolean(flow.busyAction) || state.status === "awaiting-wallet-approval"}
          >
            {flow.busyAction === "reopen-phantom"
              ? "Opening Phantom…"
              : state.connectedWallet
                ? "Reconnect Phantom"
                : "Connect Phantom"}
          </button>
          <span className={`status status-${state.status}`}>{state.status}</span>
        </div>
      </header>

      {state.error && (
        <aside className="error" role="alert">
          <strong>{state.error.source} error</strong>
          {state.error.status && <span> · HTTP {state.error.status}</span>}
          {state.error.code && <span> · {state.error.code}</span>}
          <p>{state.error.message}</p>
          {state.error.request && (
            <div>
              <strong>Failed request</strong>
              <p className="mono">
                {state.error.request.method} {state.error.request.path}
              </p>
              <strong>Request body</strong>
              <pre>
                {state.error.request.body === undefined
                  ? "(no request body)"
                  : JSON.stringify(state.error.request.body, null, 2)}
              </pre>
            </div>
          )}
          {state.error.raw !== undefined && (
            <details>
              <summary>Raw backend response</summary>
              <pre>{JSON.stringify(state.error.raw, null, 2)}</pre>
            </details>
          )}
        </aside>
      )}

      <ConfigurationPanel
        apiBaseUrl={flow.apiBaseUrl}
        jwt={flow.jwt}
        expectedNetwork={flow.expectedNetwork}
        busy={flow.busyAction === "test-api"}
        onApiBaseUrlChange={flow.setApiBaseUrl}
        onJwtChange={flow.setJwt}
        onTest={() => void flow.testApi()}
        onClear={flow.clearSession}
      />
      <WalletPanel
        wallet={state.connectedWallet}
        chain={state.solanaChain}
        selectedGroup={state.walletGroup}
        storedWallet={state.storedWallet}
        busyAction={flow.busyAction}
        onRegister={() => void flow.registerWallet()}
        onGetWallet={() => void flow.getExistingWallet()}
      />
      <SpacePanel
        spaceName={flow.spaceName}
        spaceId={state.spaceId ?? ""}
        skippedReason={state.skippedReason}
        canCreate={Boolean(state.storedWallet)}
        createError={flow.createSpaceError}
        busyAction={flow.busyAction}
        onNameChange={flow.setSpaceName}
        onSpaceIdChange={flow.setSpaceId}
        onCreate={() => void flow.createSpace()}
        onLoadPayload={() => void flow.loadFreshPayload()}
      />
      <PayloadPanel
        payload={state.payload}
        wallet={state.connectedWallet}
        signatureHex={state.signatureHex}
        secondsRemaining={flow.secondsRemaining}
        signabilityError={flow.signabilityError}
        awaitingApproval={state.status === "awaiting-wallet-approval"}
        onSign={() => void flow.signPayload()}
      />
      <DeploymentPanel
        status={state.status}
        deployment={state.deployment}
        hasSignature={Boolean(state.signatureHex)}
        polling={flow.polling}
        busyAction={flow.busyAction}
        onSubmit={() => void flow.submitSignature()}
        onStartPolling={flow.startPolling}
        onStopPolling={flow.stopPolling}
        onFreshPayload={() => void flow.loadFreshPayload()}
      />
      <DebugLog events={state.events} onClear={flow.clearLog} />
    </main>
  );
}
