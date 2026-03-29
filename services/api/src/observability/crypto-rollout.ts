import type { Logger } from "../logger.ts";

type MetricKind = "counter" | "histogram";
type MetricTags = Record<string, string | number | boolean | null | undefined>;

interface CryptoMetricInput {
  name: string;
  kind: MetricKind;
  value: number;
  tags?: MetricTags;
}

interface CryptoOperationStart {
  operation: string;
  deployEnv: string;
  rolloutMode?: string;
}

interface CryptoOperationOutcome {
  operation: string;
  deployEnv: string;
  rolloutMode?: string;
  outcome: "success" | "error" | "blocked";
  code?: string;
}

function normalizeTags(tags: MetricTags | undefined): Record<string, string | number | boolean | null> {
  if (!tags) {
    return {};
  }
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function emitCryptoMetric(logger: Logger | undefined, input: CryptoMetricInput): void {
  if (!logger) {
    return;
  }
  logger.info("crypto_metric", {
    event: "crypto_metric",
    metric_name: input.name,
    metric_kind: input.kind,
    metric_value: input.value,
    tags: normalizeTags(input.tags),
  });
}

export function incrementCryptoMetric(
  logger: Logger | undefined,
  name: string,
  tags?: MetricTags,
  value = 1,
): void {
  emitCryptoMetric(logger, {
    name,
    kind: "counter",
    value,
    tags,
  });
}

export function observeCryptoLatencyMs(
  logger: Logger | undefined,
  name: string,
  startedAtMs: number,
  tags?: MetricTags,
): void {
  const durationMs = Math.max(0, Date.now() - startedAtMs);
  emitCryptoMetric(logger, {
    name,
    kind: "histogram",
    value: durationMs,
    tags,
  });
}

export function startCryptoOperationTimer(
  logger: Logger | undefined,
  input: CryptoOperationStart,
): () => void {
  const startedAt = Date.now();
  return () => {
    observeCryptoLatencyMs(logger, "crypto.operation_duration_ms", startedAt, {
      operation: input.operation,
      deploy_env: input.deployEnv,
      rollout_mode: input.rolloutMode,
    });
  };
}

export function recordCryptoOperationOutcome(
  logger: Logger | undefined,
  input: CryptoOperationOutcome,
): void {
  incrementCryptoMetric(logger, "crypto.operation_total", {
    operation: input.operation,
    deploy_env: input.deployEnv,
    rollout_mode: input.rolloutMode,
    outcome: input.outcome,
    code: input.code ?? "none",
  });
}

export function recordCapabilityDecision(
  logger: Logger | undefined,
  input: {
    operation: string;
    mode: string;
    allowed: boolean;
    deployEnv: string;
    subject: "user" | "device" | "recipient";
  },
): void {
  incrementCryptoMetric(logger, "crypto.capability_coverage_total", {
    operation: input.operation,
    mode: input.mode,
    deploy_env: input.deployEnv,
    subject: input.subject,
    result: input.allowed ? "allowed" : "blocked",
  });
}
