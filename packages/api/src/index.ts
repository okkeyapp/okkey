import type { CoreApiErrorBody } from "../../types/src/index.js";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Merged into every request after defaults (e.g. `X-User-Id` for authenticated routes). */
  defaultHeaders?: Record<string, string>;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: CoreApiErrorBody;

  constructor(status: number, body: CoreApiErrorBody) {
    super(`${body.error}: ${body.message}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private defaultHeaders: Record<string, string>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { ...this.defaultHeaders };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const raw: unknown = await res.json().catch(() => null);
      throw new ApiRequestError(res.status, parseCoreApiErrorBody(raw, res));
    }

    return (await res.json()) as T;
  }
}

function parseCoreApiErrorBody(raw: unknown, res: Response): CoreApiErrorBody {
  if (
    raw &&
    typeof raw === "object" &&
    "error" in raw &&
    "message" in raw &&
    "requestId" in raw
  ) {
    const o = raw as Record<string, unknown>;
    const details = o.details;
    return {
      error: String(o.error),
      message: String(o.message),
      requestId: String(o.requestId),
      ...(details !== undefined &&
      details !== null &&
      typeof details === "object" &&
      !Array.isArray(details)
        ? { details: details as Record<string, unknown> }
        : {}),
    };
  }

  return {
    error: "UNKNOWN",
    message: res.statusText || "request failed",
    requestId: "unknown",
  };
}
