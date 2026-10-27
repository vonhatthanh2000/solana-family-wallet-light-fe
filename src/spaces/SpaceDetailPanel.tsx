import type {
  ApprovalRuleDto,
  DashboardMemberDto,
  SpaceTokenBalanceDto,
  VaultDto,
} from "./contracts";
import type { SpaceDashboardFlow } from "./useSpaceDashboard";
import { CopyButton } from "../components/CopyButton";

type Props = { flow: SpaceDashboardFlow };
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function ruleLabel(rule: ApprovalRuleDto): string {
  const approval = rule.alwaysAsk || !rule.thresholdUsd ? "Always ask" : `Ask above ${usd.format(Number(rule.thresholdUsd))}`;
  return `${approval} · ${rule.quorumPercent ?? 50}% quorum`;
}

function memberName(member: DashboardMemberDto): string {
  const fullName = [member.profile?.firstName, member.profile?.lastName].filter(Boolean).join(" ");
  if (member.profile?.displayName) return member.profile.displayName;
  return fullName || member.profile?.username || `${member.userId.slice(0, 6)}…${member.userId.slice(-4)}`;
}

function TokenRow({ token }: { token: SpaceTokenBalanceDto }) {
  return (
    <article className="asset-row">
      {token.logoURI && <img src={token.logoURI} alt="" />}
      <div>
        <strong>{token.symbol ?? token.token}</strong>
        <span>{token.formatted ?? "Unavailable"}</span>
      </div>
      <div className="asset-values">
        <strong>{token.valueUsd === null ? "—" : usd.format(token.valueUsd)}</strong>
        <span>{token.vaultCount ? `${token.inVaultFormatted ?? "?"} in ${token.vaultCount} vault${token.vaultCount === 1 ? "" : "s"}` : "Unallocated"}</span>
      </div>
    </article>
  );
}

function VaultCard({ vault }: { vault: VaultDto }) {
  const balance = Number(vault.balance.formatted);
  const goal = vault.goalAmount === undefined ? undefined : Number(vault.goalAmount);
  const progress = goal && Number.isFinite(balance) && Number.isFinite(goal)
    ? Math.min(100, Math.max(0, (balance / goal) * 100))
    : undefined;
  return (
    <article className="vault-card">
      {vault.photos[0] ? <img className="vault-photo" src={vault.photos[0].url} alt="" /> : <div className="vault-photo vault-placeholder" />}
      <div className="vault-card-body">
        <span className="eyebrow">{vault.token.chainType} vault</span>
        <h4>{vault.name}</h4>
        <strong className="vault-amount">{vault.balance.formatted} {vault.token.symbol}</strong>
        {vault.goalAmount && (
          <>
            <div className="goal-track" aria-label={`${progress?.toFixed(0) ?? 0}% of goal`}><span style={{ width: `${progress ?? 0}%` }} /></div>
            <small>Goal: {vault.goalAmount} {vault.token.symbol}</small>
          </>
        )}
        <small>{vault.usesDefaultRule ? "Uses Space approval rule" : ruleLabel(vault.approvalRule)}</small>
      </div>
    </article>
  );
}

export function SpaceDetailPanel({ flow }: Props) {
  if (!flow.selectedSpaceId) return null;
  if (flow.loadingDetail && !flow.selected) return <section><p className="empty">Loading Space information…</p></section>;
  if (flow.detailError) return (
    <section>
      <div className="inline-error" role="alert">
        <strong>Could not load this Space</strong><p>{flow.detailError.message}</p>
        <button onClick={() => void flow.refreshSelected()}>Try again</button>
      </div>
    </section>
  );
  if (!flow.selected) return null;

  const { space, vaults, members } = flow.selected;
  const balance = space.balance;
  return (
    <section className="space-dashboard" aria-labelledby="space-detail-title">
      <div className="space-dashboard-header">
        <div className="space-identity">
          {space.photo ? <img src={space.photo} alt="" /> : <span className="space-avatar large">{space.name.slice(0, 1).toUpperCase()}</span>}
          <div><p className="eyebrow">{space.purpose} Space</p><h2 id="space-detail-title">{space.name}</h2><p>{space.role} · {space.memberCount} active members</p></div>
        </div>
        <div className="button-row">
          {space.memberChangeInProgress && <span className="status status-pending">Member update in progress</span>}
          <button className="secondary" onClick={() => void flow.refreshSelected()} disabled={flow.loadingDetail}>{flow.loadingDetail ? "Refreshing…" : "Refresh details"}</button>
        </div>
      </div>

      <div className="balance-hero">
        <div><span>Total Space balance</span><strong>{balance ? `${balance.partial ? "At least " : ""}${usd.format(balance.totalUsd)}` : "Unavailable"}</strong></div>
        <div><span>Unallocated</span><strong>{balance ? usd.format(balance.unallocatedUsd) : "Unavailable"}</strong></div>
        <div><span>Approval policy</span><strong>{ruleLabel(space.defaultRule)}</strong></div>
      </div>
      {balance?.partial && <div className="result warning">Some chain balances or prices are unavailable. The displayed USD total is understated.</div>}

      <div className="dashboard-block">
        <div className="section-heading"><div><h3>Assets by chain</h3><p>On-chain holdings and the portion assigned to vaults.</p></div></div>
        {!balance?.chains.length && <p className="empty">No readable chain balances yet.</p>}
        <div className="chain-balance-grid">
          {balance?.chains.map((chain) => (
            <article className="chain-balance-card" key={chain.chainObjectId}>
              <div className="chain-card-heading">
                <div>{chain.chainLogoURI && <img src={chain.chainLogoURI} alt="" />}<strong>{chain.chainType} · {chain.chainId}</strong></div>
                <span className="copyable"><code>{chain.address}</code><CopyButton value={chain.address} label="deposit address" /></span>
              </div>
              {chain.tokens.map((token) => <TokenRow token={token} key={token.token} />)}
            </article>
          ))}
        </div>
      </div>

      <div className="dashboard-block">
        <div className="section-heading"><div><h3>Vaults</h3><p>Allocations within the shared wallet; vaults do not have separate addresses.</p></div><span className="status">{vaults.length}</span></div>
        {!vaults.length && <p className="empty">This Space has no vaults yet.</p>}
        <div className="vault-grid">{vaults.map((vault) => <VaultCard vault={vault} key={vault.vaultId} />)}</div>
      </div>

      <div className="dashboard-columns">
        <div className="dashboard-block">
          <h3>Chains and deposits</h3>
          <div className="space-chains">{space.chains.map((chain) => <div key={chain.chainObjectId}><strong>{chain.chainType} · {chain.chainId}</strong><span>{chain.isDeployed ? "Deployed" : chain.deployState ?? chain.status ?? "Not deployed"}</span><span className="copyable"><code>{chain.address ?? "No deposit address"}</code><CopyButton value={chain.address} label="deposit address" /></span>{chain.deployError && <span className="bad">{chain.deployError}</span>}</div>)}</div>
        </div>
        <div className="dashboard-block">
          <h3>Members</h3><p>{members.voterCount} eligible voter{members.voterCount === 1 ? "" : "s"}</p>
          <div className="dashboard-member-list">{members.members.map((member) => <div key={member.userId}><span>{memberName(member)}</span><strong>{member.role}</strong>{member.chainPending && <small>Chain update pending</small>}</div>)}</div>
        </div>
      </div>
      {flow.lastRefreshed && <p className="refresh-note">Last refreshed {flow.lastRefreshed.toLocaleTimeString()}</p>}
    </section>
  );
}
