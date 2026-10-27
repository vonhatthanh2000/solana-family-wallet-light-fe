import { useCallback } from "react";
import { ConfigurationPanel } from "./components/ConfigurationPanel";
import { CopyButton } from "./components/CopyButton";
import { DebugLog } from "./components/DebugLog";
import { DeploymentPanel } from "./components/DeploymentPanel";
import { PayloadPanel } from "./components/PayloadPanel";
import { SpacePanel } from "./components/SpacePanel";
import { WalletPanel } from "./components/WalletPanel";
import { useSolanaSpaceFlow } from "./flow/useSolanaSpaceFlow";
import { MemberManagementPanel } from "./members/MemberManagementPanel";
import { useSolanaMemberFlow } from "./members/useSolanaMemberFlow";
import { SpaceActionPanel } from "./spaces/actions/SpaceActionPanel";
import { SpaceBrowserPanel } from "./spaces/SpaceBrowserPanel";
import { SpaceDetailPanel } from "./spaces/SpaceDetailPanel";
import { useSpaceDashboard } from "./spaces/useSpaceDashboard";

export default function App() {
  const flow = useSolanaSpaceFlow();
  const { state } = flow;
  const shortWallet = state.connectedWallet
    ? `${state.connectedWallet.address.slice(0, 4)}…${state.connectedWallet.address.slice(-4)}`
    : undefined;
  const selectedWalletOption = flow.walletOptions.find(
    (wallet) => wallet.id === flow.selectedWalletId,
  );
  const memberFlow = useSolanaMemberFlow({
    jwt: flow.jwt,
    spaceId: state.spaceId ?? "",
    solanaChainObjectId: state.solanaChain?._id,
    connectedSigner: state.connectedWallet,
    storedAddress: state.storedWallet?.address,
    onSpaceIdChange: flow.setSpaceId,
  });
  const configured = Boolean(flow.apiBaseUrl.trim() && flow.jwt.trim());
  const spaceDashboard = useSpaceDashboard({
    enabled: configured,
    configurationKey: `${flow.apiBaseUrl}\u0000${flow.jwt}`,
    selectedSpaceId: state.spaceId ?? "",
    onSelectSpace: flow.setSpaceId,
  });
  const refreshSpaceWorkspace = useCallback(async () => {
    await Promise.all([
      spaceDashboard.refreshList(),
      spaceDashboard.refreshSelected(),
      memberFlow.refresh(),
    ]);
  }, [memberFlow.refresh, spaceDashboard.refreshList, spaceDashboard.refreshSelected]);

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Backend diagnostic client</p>
          <h1>Solana Space signing test</h1>
          <p>Inspect every boundary from signing wallet through verified PDA deployment.</p>
        </div>
        <div className="header-actions">
          {shortWallet && <span className="wallet-address mono copyable">{shortWallet}<CopyButton value={state.connectedWallet?.address} label="connected wallet address" /></span>}
          {selectedWalletOption && (
            <img
              className="wallet-icon"
              src={selectedWalletOption.icon}
              alt={`${selectedWalletOption.name} icon`}
            />
          )}
          <label className="wallet-select">
            <span>Signing wallet</span>
            <select
              aria-label="Select wallet"
              value={flow.selectedWalletId}
              onChange={(event) => flow.selectWallet(event.target.value)}
              disabled={Boolean(flow.busyAction) || state.status === "awaiting-wallet-approval"}
            >
              <option value="">
                {flow.walletOptions.length ? "Select wallet" : "No compatible wallet found"}
              </option>
              {flow.walletOptions.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
              ))}
            </select>
            {!flow.walletOptions.length && (
              <small>Install or unlock Solflare in this browser profile, then reload.</small>
            )}
          </label>
          <button
            className="secondary"
            onClick={() => void flow.connectWallet()}
            disabled={
              !flow.selectedWalletId ||
              Boolean(flow.busyAction) ||
              state.status === "awaiting-wallet-approval"
            }
          >
            {flow.busyAction === "connect-wallet"
              ? "Opening wallet…"
              : state.connectedWallet && state.connectedWallet.provider !== "Test keypair"
                ? "Reconnect wallet"
                : "Connect wallet"}
          </button>
          {import.meta.env.DEV && (
            <button
              className="secondary"
              onClick={() => void flow.useTestSigner()}
              disabled={Boolean(flow.busyAction) || state.status === "awaiting-wallet-approval"}
            >
              {flow.busyAction === "connect-test-signer" ? "Creating test signer…" : "Use test signer"}
            </button>
          )}
          <span className={`status status-${state.status}`}>{state.status}</span>
        </div>
      </header>

      {import.meta.env.DEV && state.connectedWallet?.provider === "Test keypair" && (
        <aside className="error" role="alert">
          <strong>TEST SIGNER</strong>
          <p>Development only. Do not fund this address.</p>
        </aside>
      )}

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
      <SpaceBrowserPanel configured={configured} flow={spaceDashboard} />
      <SpaceDetailPanel flow={spaceDashboard} />
      {spaceDashboard.selected && (
        <SpaceActionPanel
          dashboard={spaceDashboard.selected}
          role={memberFlow.role}
          actorUserId={memberFlow.actorUserId}
          signer={state.connectedWallet}
          fallbackNetwork={flow.expectedNetwork}
          onChanged={refreshSpaceWorkspace}
        />
      )}
      <MemberManagementPanel
        flow={memberFlow}
        spaceId={state.spaceId ?? ""}
      />
      <DebugLog events={state.events} onClear={flow.clearLog} />
    </main>
  );
}
