type Props = {
  apiBaseUrl: string;
  jwt: string;
  expectedNetwork: string;
  busy: boolean;
  onApiBaseUrlChange(value: string): void;
  onJwtChange(value: string): void;
  onTest(): void;
  onClear(): void;
};

export function ConfigurationPanel({
  apiBaseUrl,
  jwt,
  expectedNetwork,
  busy,
  onApiBaseUrlChange,
  onJwtChange,
  onTest,
  onClear,
}: Props) {
  return (
    <section>
      <h2>1. Configuration</h2>
      <div className="field-grid">
        <label>
          Backend base URL
          <input
            type="url"
            value={apiBaseUrl}
            onChange={(event) => onApiBaseUrlChange(event.target.value)}
            placeholder="http://localhost:3000"
          />
        </label>
        <label>
          Bearer JWT (session only)
          <input
            type="password"
            value={jwt}
            onChange={(event) => onJwtChange(event.target.value)}
            autoComplete="off"
            placeholder="Paste a test-user JWT"
          />
        </label>
      </div>
      <p>
        Expected network: <strong>{expectedNetwork}</strong>
      </p>
      <div className="actions">
        <button onClick={onTest} disabled={busy || !apiBaseUrl.trim() || !jwt.trim()}>
          {busy ? "Testing…" : "Test API"}
        </button>
        <button className="secondary" onClick={onClear}>Clear session</button>
      </div>
    </section>
  );
}
