import type { SpaceDashboardFlow } from "./useSpaceDashboard";

type Props = { configured: boolean; flow: SpaceDashboardFlow };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function balanceLabel(total: number | undefined, partial: boolean): string {
  if (total === undefined) return "Balance unavailable";
  return `${partial ? "At least " : ""}${usd.format(total)}`;
}

export function SpaceBrowserPanel({ configured, flow }: Props) {
  return (
    <section aria-labelledby="space-browser-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Shared wallets</p>
          <h2 id="space-browser-title">Your Spaces</h2>
          <p>Select an active Space to inspect its shared balance, vaults, chains, and members.</p>
        </div>
        <button
          className="secondary"
          onClick={() => void flow.refreshList()}
          disabled={!configured || flow.loadingList}
        >
          {flow.loadingList ? "Loading…" : "Refresh Spaces"}
        </button>
      </div>

      {!configured && <p className="empty">Enter an API URL and JWT to load your Spaces.</p>}
      {configured && flow.loadingList && !flow.spaces.length && <p className="empty">Loading Spaces…</p>}
      {flow.listError && (
        <div className="inline-error" role="alert">
          <strong>Could not load Spaces</strong>
          <p>{flow.listError.message}</p>
        </div>
      )}
      {configured && !flow.loadingList && !flow.listError && !flow.spaces.length && (
        <p className="empty">No active or pending Spaces were found.</p>
      )}

      <div className="space-picker-grid">
        {flow.spaces.map((space) => {
          const active = space.membershipStatus === "ACTIVE";
          const selected = flow.selectedSpaceId === space.spaceId;
          return (
            <button
              className={`space-picker-card${selected ? " selected" : ""}`}
              key={space.spaceId}
              onClick={() => active && flow.selectSpace(space.spaceId)}
              disabled={!active}
              aria-current={selected ? "true" : undefined}
              aria-label={`${active ? "Open" : "Pending"} ${space.name} Space`}
            >
              <span className="space-picker-heading">
                {space.photo ? <img src={space.photo} alt="" /> : <span className="space-avatar">{space.name.slice(0, 1).toUpperCase()}</span>}
                <span>
                  <strong>{space.name}</strong>
                  <small>{space.purpose} · {space.role}</small>
                </span>
                <span className={`status status-${space.membershipStatus.toLowerCase()}`}>{space.membershipStatus}</span>
              </span>
              <span className="space-picker-balance">
                {active
                  ? balanceLabel(space.balance?.totalUsd, space.balance?.partial === true)
                  : `Join request ${space.status?.toLowerCase() ?? "pending"}`}
              </span>
              <small>{space.memberCount === undefined ? "Waiting for membership" : `${space.memberCount} active members`}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
