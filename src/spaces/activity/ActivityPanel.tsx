import { useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import type { VaultDto } from "../contracts";
import { activityText, badgeText, formatAmountView, formatBaseUnits } from "./activity-copy";
import type { ActivityDetailDto, ActivityRowDto } from "./contracts";
import type { SpaceActivityFlow } from "./useSpaceActivity";

type Props = {
  flow: SpaceActivityFlow;
  vaults: VaultDto[];
  categories: Array<{ id: string; name: string }>;
};

const TONE_CLASSES: Record<string, string> = {
  amber: "status-pending", green: "status-deployed", red: "status-failed", grey: "status-expired",
};

const ICON_GLYPHS: Record<string, string> = {
  money_in: "↓", money_out: "↑", failed: "!", request: "?", rule: "§",
  member: "@", rejected: "✕", cancelled: "–", plan: "★",
};

function occurredLabel(occurredAt: string): string {
  const stamp = new Date(occurredAt);
  return Number.isNaN(stamp.getTime()) ? occurredAt : stamp.toLocaleString();
}

function ActivityRow({ row, onOpen }: { row: ActivityRowDto; onOpen(id: string): void }) {
  return (
    <article className="request-card activity-row">
      <div className="request-title">
        <div className="activity-headline">
          <span className="activity-icon" aria-hidden="true">{ICON_GLYPHS[row.icon] ?? "•"}</span>
          <div>
            <strong className="action-label">{activityText(row.title)}</strong>
            <span className="muted">{activityText(row.subLine)}</span>
          </div>
        </div>
        {row.amount && (
          <strong className={row.amount.muted ? "activity-amount muted" : "activity-amount"}>
            {formatAmountView(row.amount)}
          </strong>
        )}
      </div>
      <div className="button-row">
        {row.badge && <span className={`status ${TONE_CLASSES[row.badge.tone] ?? ""}`}>{badgeText(row.badge)}</span>}
        <span className="muted">{occurredLabel(row.occurredAt)}</span>
        {row.target && <button type="button" className="secondary" onClick={() => onOpen(row.id)}>Details</button>}
      </div>
    </article>
  );
}

function detailEntries(detail: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(detail).flatMap(([key, value]) => {
    const rendered = renderDetailValue(key, value);
    return rendered ? [[humanize(key), rendered] as [string, string]] : [];
  });
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// The detail block is an open-ended record, so render the shapes the contract documents and stringify the rest.
function renderDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => renderDetailValue(key, item)).filter(Boolean).join(", ");
  const row = value as Record<string, unknown>;
  if (typeof row.name === "string" && row.name) return row.isYou === true ? `${row.name} (you)` : row.name;
  if (row.isYou === true) return "You";
  if (typeof row.address === "string") return row.address;
  if (typeof row.envelope === "string") return row.envelope;
  if (typeof row.value === "string" && typeof row.decimals === "number") {
    const symbol = typeof row.symbol === "string" ? ` ${row.symbol}` : "";
    const usd = typeof row.usd === "string" ? ` (≈ $${row.usd})` : "";
    return `${formatBaseUnits(row.value, row.decimals)}${symbol}${usd}`;
  }
  return Object.entries(row)
    .map(([innerKey, innerValue]) => {
      const rendered = renderDetailValue(innerKey, innerValue);
      return rendered ? `${humanize(innerKey)}: ${rendered}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function ActivityDetail({ detail, onClose }: { detail: ActivityDetailDto; onClose(): void }) {
  const chain = detail.detail.chain as Record<string, unknown> | undefined;
  const txHash = typeof chain?.txHash === "string" ? chain.txHash : undefined;
  const explorerUrl = typeof chain?.explorerUrl === "string" ? chain.explorerUrl : undefined;
  return (
    <div className="request-card">
      <div className="request-title">
        <strong className="action-label">{activityText(detail.title)}</strong>
        <button type="button" className="secondary" onClick={onClose}>Close details</button>
      </div>
      <p className="muted">{activityText(detail.subLine)} · {occurredLabel(detail.occurredAt)}</p>
      <dl className="compact-details">
        <div><dt>Kind</dt><dd>{detail.kind}</dd></div>
        <div><dt>Status</dt><dd>{detail.status} ({detail.state})</dd></div>
        {detail.amount && <div><dt>Amount</dt><dd>{formatAmountView(detail.amount)}</dd></div>}
        {detailEntries(detail.detail).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {txHash && (
        <span className="copyable">
          <code className="wrap">{txHash}</code>
          <CopyButton value={txHash} label="transaction identifier" />
          {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer">View in explorer ↗</a>}
        </span>
      )}
    </div>
  );
}

function HistoryFilters({ flow, vaults, categories }: Props) {
  const [vaultId, setVaultId] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        flow.applyFilter({
          vaultId: vaultId || undefined,
          category: category || undefined,
          from: from || undefined,
          to: to || undefined,
        });
      }}
    >
      <label>Vault
        <select value={vaultId} onChange={(event) => setVaultId(event.target.value)}>
          <option value="">Every envelope</option>
          {vaults.map((vault) => <option key={vault.vaultId} value={vault.vaultId}>{vault.name}</option>)}
        </select>
      </label>
      <label>Category
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Every category</option>
          <option value="others">Others</option>
          {categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" disabled={flow.loading}>Apply filters</button>
    </form>
  );
}

function LedgerTable({ flow }: { flow: SpaceActivityFlow }) {
  const rows = flow.ledger ?? [];
  return (
    <>
      <p className="hint">Scanner-derived deposit and payout history. It is an indexed projection, so it can lag the live balance.</p>
      {!rows.length && <p className="empty">{flow.loading ? "Loading ledger…" : "No ledger rows on this page."}</p>}
      {rows.map((row) => (
        <article className="request-card" key={`${row.txHash}:${row.direction}:${row.timestamp}`}>
          <div className="request-title">
            <div>
              <strong className="action-label">{row.direction === "in" ? "Deposit" : "Payout"} · {row.symbol ?? row.token}</strong>
              <span className="muted">{new Date(row.timestamp * 1000).toLocaleString()}</span>
            </div>
            <strong className="activity-amount">
              {row.direction === "in" ? "+" : "-"}{row.decimals === undefined ? row.amount : formatBaseUnits(row.amount, row.decimals)} {row.symbol ?? ""}
            </strong>
          </div>
          <dl className="compact-details">
            <div><dt>Counterparty</dt><dd><code className="wrap">{row.counterparty}</code></dd></div>
            <div><dt>Network fee</dt><dd>{row.fee ?? "Not recorded"}</dd></div>
          </dl>
          <span className="copyable"><code className="wrap">{row.txHash}</code><CopyButton value={row.txHash} label="transaction identifier" /></span>
        </article>
      ))}
      <div className="button-row">
        <button type="button" className="secondary" disabled={flow.ledgerPage <= 1 || flow.loading} onClick={() => flow.goToLedgerPage(flow.ledgerPage - 1)}>Previous</button>
        <span className="status">Page {flow.ledgerPage}</span>
        <button type="button" className="secondary" disabled={flow.loading || rows.length === 0} onClick={() => flow.goToLedgerPage(flow.ledgerPage + 1)}>Next</button>
      </div>
    </>
  );
}

export function ActivityPanel({ flow, vaults, categories }: Props) {
  const { recent, history } = flow;
  const pending = flow.view === "history" ? history?.pending ?? [] : recent?.pending ?? [];
  const settled = flow.view === "history" ? history?.data ?? [] : recent?.settled ?? [];
  const meta = history?.meta;

  return (
    <section className="dashboard-block activity-panel" aria-labelledby="activity-title">
      <div className="section-heading">
        <div>
          <h3 id="activity-title">Activity</h3>
          <p>Pending requests first, then settled rows. A pending row keeps refreshing until it settles.</p>
        </div>
        <div className="button-row">
          <button type="button" className={flow.view === "recent" ? "" : "secondary"} onClick={() => flow.showView("recent")}>Recent</button>
          <button type="button" className={flow.view === "history" ? "" : "secondary"} onClick={() => flow.showView("history")}>View all</button>
          <button type="button" className={flow.view === "ledger" ? "" : "secondary"} onClick={() => flow.showView("ledger")}>Ledger</button>
          <button type="button" className="secondary" onClick={() => void flow.refresh()} disabled={flow.loading}>{flow.loading ? "Refreshing…" : "Refresh status"}</button>
        </div>
      </div>

      {flow.error && (
        <div className="inline-error" role="alert">
          <strong>Could not load activity</strong><p>{flow.error.message}</p>
          <button type="button" onClick={() => void flow.refresh()}>Try again</button>
        </div>
      )}

      {flow.detail && <ActivityDetail detail={flow.detail} onClose={flow.closeDetail} />}

      {flow.view === "ledger" ? <LedgerTable flow={flow} /> : (
        <>
          {flow.view === "history" && <HistoryFilters flow={flow} vaults={vaults} categories={categories} />}

          <h4>Waiting on the family{pending.length ? ` (${pending.length})` : ""}</h4>
          {!pending.length && <p className="empty">Nothing is waiting for a vote or a send.</p>}
          {pending.map((row) => <ActivityRow row={row} key={row.id} onOpen={(id) => void flow.openDetail(id)} />)}

          <h4>Settled</h4>
          {!settled.length && <p className="empty">{flow.loading ? "Loading activity…" : "No settled activity yet."}</p>}
          {settled.map((row) => <ActivityRow row={row} key={row.id} onOpen={(id) => void flow.openDetail(id)} />)}

          {flow.view === "recent" && recent?.hasMore && (
            <div className="button-row"><button type="button" className="secondary" onClick={() => flow.showView("history")}>View all activity</button></div>
          )}

          {flow.view === "history" && meta && (
            <div className="button-row">
              <button type="button" className="secondary" disabled={meta.currentPage <= 1 || flow.loading} onClick={() => flow.goToPage(meta.currentPage - 1)}>Previous</button>
              <span className="status">Page {meta.currentPage} of {Math.max(1, meta.lastPage)} · {meta.total} rows</span>
              <button type="button" className="secondary" disabled={meta.currentPage >= meta.lastPage || flow.loading} onClick={() => flow.goToPage(meta.currentPage + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
