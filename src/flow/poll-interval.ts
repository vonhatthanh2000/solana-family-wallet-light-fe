// Live work moves on its own and needs the plan's 3-5s cadence; an empty queue still needs a slower
// heartbeat, because a request another member proposes only ever arrives from the backend.
export const ACTIVE_POLL_MS = 4_000;
export const IDLE_POLL_MS = 20_000;

export function pollIntervalMs(hasActiveWork: boolean): number {
  return hasActiveWork ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}
