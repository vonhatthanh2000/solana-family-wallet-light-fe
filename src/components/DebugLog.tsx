import { useState } from "react";
import type { DebugEvent } from "../api/types";

type Props = {
  events: DebugEvent[];
  onClear(): void;
};

export function DebugLog({ events, onClear }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <section>
      <h2>Debug event log</h2>
      <div className="actions">
        <button className="secondary" onClick={() => void copy()} disabled={events.length === 0}>
          {copied ? "Copied" : "Copy log"}
        </button>
        <button className="secondary" onClick={onClear} disabled={events.length === 0}>
          Clear log
        </button>
      </div>
      <pre className="log" aria-live="polite">
        {events.length ? JSON.stringify(events, null, 2) : "No events yet."}
      </pre>
    </section>
  );
}
