import { SystemUpdateError } from "./errors.ts";
import type { RegistryPullCredentials, SignedOfflinePackage } from "./package-format.ts";
import type { UpdateAgentClient, UpdateJob } from "./service.ts";

export function createHttpUpdateAgentClient(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): UpdateAgentClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.trim().replace(/\/$/, "");
  const token = options.token.trim();

  return {
    async start(
      document: SignedOfflinePackage,
      startOptions?: { registryCredentials?: RegistryPullCredentials },
    ): Promise<UpdateJob> {
      const credentials = startOptions?.registryCredentials;
      const body = credentials ? { ...document, registryCredentials: credentials } : document;
      try {
        const job = await request(baseUrl, token, fetchImpl, "POST", "/v1/jobs", body);
        return redactJob(job, credentials);
      } catch (error) {
        if (credentials && error instanceof SystemUpdateError) {
          throw new SystemUpdateError(error.statusCode, error.code, redactSecrets(error.message, credentials));
        }
        throw error;
      }
    },
    async get(jobId: string): Promise<UpdateJob | null> {
      try {
        return await request(baseUrl, token, fetchImpl, "GET", `/v1/jobs/${encodeURIComponent(jobId)}`);
      } catch (error) {
        if (error instanceof SystemUpdateError && error.statusCode === 404) {
          return null;
        }
        throw error;
      }
    },
  };
}

export function unavailableUpdateAgent(): UpdateAgentClient {
  return {
    async start(): Promise<UpdateJob> {
      throw new SystemUpdateError(
        503,
        "UPDATE_AGENT_UNAVAILABLE",
        "The update agent is not available. Nothing was applied",
      );
    },
    async get(): Promise<UpdateJob | null> {
      throw new SystemUpdateError(
        503,
        "UPDATE_AGENT_UNAVAILABLE",
        "The update agent is not available",
      );
    },
  };
}

async function request(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<UpdateJob> {
  if (!baseUrl || !token) {
    throw new SystemUpdateError(
      503,
      "UPDATE_AGENT_UNAVAILABLE",
      "The update agent is not configured. Nothing was applied",
    );
  }
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SystemUpdateError(
      503,
      "UPDATE_AGENT_UNAVAILABLE",
      "The update agent could not be reached. Nothing was applied",
    );
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok) {
    const record = parsed && typeof parsed === "object" ? (parsed as { error?: string; message?: string }) : {};
    throw new SystemUpdateError(
      response.status,
      record.error || "APPLY_FAILED",
      record.message || "The update agent rejected the request. Nothing was applied",
    );
  }
  const job = parsed && typeof parsed === "object" ? (parsed as { job?: UpdateJob }).job : undefined;
  if (!job || typeof job.id !== "string") {
    throw new SystemUpdateError(502, "APPLY_FAILED", "The update agent returned an invalid job");
  }
  return job;
}

function redactJob(job: UpdateJob, credentials: RegistryPullCredentials | undefined): UpdateJob {
  if (!credentials || !job.errorMessage) {
    return job;
  }
  return { ...job, errorMessage: redactSecrets(job.errorMessage, credentials) };
}

function redactSecrets(message: string, credentials: RegistryPullCredentials): string {
  return [credentials.password, credentials.username, credentials.server].reduce(
    (text, secret) => (secret ? text.split(secret).join("[redacted]") : text),
    message,
  );
}
