import type { DiagnosticError } from "../api/types";

type Props = {
  spaceName: string;
  spaceId: string;
  skippedReason?: string;
  canCreate: boolean;
  createError?: DiagnosticError;
  busyAction?: string;
  onNameChange(value: string): void;
  onSpaceIdChange(value: string): void;
  onCreate(): void;
  onLoadPayload(): void;
};

export function SpacePanel({
  spaceName,
  spaceId,
  skippedReason,
  canCreate,
  createError,
  busyAction,
  onNameChange,
  onSpaceIdChange,
  onCreate,
  onLoadPayload,
}: Props) {
  return (
    <section>
      <h2>4. Create or resume Space</h2>
      <label>
        New Space name
        <input value={spaceName} onChange={(event) => onNameChange(event.target.value)} />
      </label>
      <div className="actions">
        <button
          onClick={onCreate}
          disabled={!canCreate || !spaceName.trim() || busyAction === "create-space"}
        >
          {busyAction === "create-space" ? "Creating…" : "Create Space"}
        </button>
      </div>
      {createError && (
        <div className="result failure" role="alert">
          <strong>
            Create Space failed
            {createError.status ? ` · HTTP ${createError.status}` : ""}
            {createError.code ? ` · ${createError.code}` : ""}
          </strong>
          <p>{createError.message}</p>
          {createError.raw !== undefined && (
            <details>
              <summary>Backend response</summary>
              <pre>{JSON.stringify(createError.raw, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
      <label>
        Existing / created Space id
        <input
          className="mono"
          value={spaceId}
          onChange={(event) => onSpaceIdChange(event.target.value)}
          placeholder="0x…"
        />
      </label>
      <div className="actions">
        <button
          onClick={onLoadPayload}
          disabled={!spaceId || busyAction === "load-payload"}
        >
          {busyAction === "load-payload" ? "Loading…" : "Load fresh Solana payload"}
        </button>
      </div>
      {skippedReason && (
        <div className="result warning">
          Solana initialization was skipped: {skippedReason}. Fix the backend condition, then load a
          fresh payload with the retained Space id.
        </div>
      )}
      <p className="hint">Create is never retried automatically after a network failure.</p>
    </section>
  );
}
