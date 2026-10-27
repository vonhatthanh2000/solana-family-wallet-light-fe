export function backendRecoveryHint(status: number): string {
  if (status === 400) return "Review the submitted values below, correct them, and try again.";
  if (status === 401) return "The JWT is missing or expired. Enter a fresh token and retry.";
  if (status === 403) return "Your current role or membership no longer permits this action. Refresh the Space and role state.";
  if (status === 409) return "The resource changed or an equivalent request already exists. Refresh its status before retrying; do not create a duplicate.";
  if (status >= 500) return "The backend could not complete the request. Keep your input and retry after the service recovers.";
  return "Review the backend message and refresh the affected section before retrying.";
}
