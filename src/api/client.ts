import type { ApiErrorBody, DebugEvent } from "./types";

export type RuntimeConfiguration = {
  apiBaseUrl: string;
  jwt: string;
};

export type ApiRequestDetails = {
  method: string;
  path: string;
  body?: unknown;
};

export type ApiFailureNotice = {
  id: number;
  at: string;
  status: number;
  code?: string;
  message: string;
  request: ApiRequestDetails;
  response: unknown;
};

let runtimeConfiguration: RuntimeConfiguration = { apiBaseUrl: "", jwt: "" };
let debugListener: ((event: DebugEvent) => void) | undefined;
const apiFailureListeners = new Set<(failure: ApiFailureNotice | undefined) => void>();
let latestApiFailure: ApiFailureNotice | undefined;
let nextFailureId = 1;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;
  readonly request: ApiRequestDetails;

  constructor(status: number, body: unknown, request: ApiRequestDetails) {
    const candidate = body as ApiErrorBody | null;
    const rawMessage = typeof body === "string" ? body : candidate?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join("; ")
      : rawMessage || `Request failed with HTTP ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = candidate?.code;
    this.body = body;
    this.request = request;
  }
}

export function setApiClientConfiguration(configuration: RuntimeConfiguration): void {
  runtimeConfiguration = {
    apiBaseUrl: configuration.apiBaseUrl.trim().replace(/\/+$/, ""),
    jwt: configuration.jwt.trim(),
  };
}

export function setApiDebugListener(
  listener: ((event: DebugEvent) => void) | undefined,
): void {
  debugListener = listener;
}

export function subscribeApiFailures(listener: (failure: ApiFailureNotice | undefined) => void): () => void {
  apiFailureListeners.add(listener);
  if (latestApiFailure) listener(latestApiFailure);
  return () => apiFailureListeners.delete(listener);
}

export function clearApiFailure(id: number): void {
  if (latestApiFailure?.id !== id) return;
  latestApiFailure = undefined;
  apiFailureListeners.forEach((listener) => listener(undefined));
}

export function clearApiFailuresForPath(pathPrefix: string): void {
  if (!latestApiFailure?.request.path.startsWith(pathPrefix)) return;
  const id = latestApiFailure.id;
  clearApiFailure(id);
}

function reportApiFailure(error: ApiError): void {
  latestApiFailure = {
    id: nextFailureId++,
    at: new Date().toISOString(),
    status: error.status,
    code: error.code,
    message: error.message,
    request: error.request,
    response: redactDebugValue(error.body),
  };
  apiFailureListeners.forEach((listener) => listener(latestApiFailure!));
}

function emit(event: Omit<DebugEvent, "at">): void {
  debugListener?.({ at: new Date().toISOString(), ...event });
}

const SECRET_KEY = /authorization|jwt|token|secret|private|mnemonic|seed/i;

export function redactDebugValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => redactDebugValue(item, seen));
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : redactDebugValue(item, seen),
    ]),
  );
}

function requestBodyForLog(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body ? "[non-text request body]" : undefined;
  try {
    return redactDebugValue(JSON.parse(body));
  } catch {
    return body;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  const step = `HTTP ${method} ${path}`;
  const request: ApiRequestDetails = {
    method,
    path,
    body: requestBodyForLog(init.body),
  };
  emit({
    step,
    outcome: "start",
    detail: request,
  });

  if (!runtimeConfiguration.apiBaseUrl || !runtimeConfiguration.jwt) {
    const error = new Error("API base URL and JWT are required");
    emit({ step, outcome: "failure", detail: { message: error.message } });
    throw error;
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${runtimeConfiguration.jwt}`);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${runtimeConfiguration.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    emit({
      step,
      outcome: "failure",
      detail: { message: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  emit({
    step,
    outcome: response.ok ? "success" : "failure",
    detail: { status: response.status, response: redactDebugValue(body) },
  });

  if (!response.ok) {
    console.error("[API response error]", {
      method,
      path,
      status: response.status,
      response: redactDebugValue(body),
    });
    const error = new ApiError(response.status, body, request);
    reportApiFailure(error);
    throw error;
  }
  return body as T;
}
