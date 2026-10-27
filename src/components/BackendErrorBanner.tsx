import { useEffect, useState } from "react";
import {
  clearApiFailure,
  subscribeApiFailures,
  type ApiFailureNotice,
} from "../api/client";
import { backendRecoveryHint } from "./backend-error-help";

export function BackendErrorBanner() {
  const [failure, setFailure] = useState<ApiFailureNotice>();

  useEffect(() => subscribeApiFailures(setFailure), []);
  if (!failure) return null;

  const dismiss = () => {
    clearApiFailure(failure.id);
    setFailure(undefined);
  };

  return (
    <aside className="error backend-error-banner" role="alert" aria-live="assertive">
      <div className="section-heading">
        <div>
          <strong>Backend request failed · HTTP {failure.status}{failure.code ? ` · ${failure.code}` : ""}</strong>
          <p>{failure.message}</p>
        </div>
        <button type="button" className="secondary" onClick={dismiss}>Dismiss</button>
      </div>
      <p className="recovery-hint">{backendRecoveryHint(failure.status)}</p>
      <dl className="compact-details">
        <div><dt>Request</dt><dd className="mono wrap">{failure.request.method} {failure.request.path}</dd></div>
        <div><dt>Time</dt><dd>{new Date(failure.at).toLocaleTimeString()}</dd></div>
      </dl>
      {(failure.request.body !== undefined || failure.response !== null) && <details><summary>Request and backend response</summary><pre>{JSON.stringify({ requestBody: failure.request.body, response: failure.response }, null, 2)}</pre></details>}
    </aside>
  );
}
