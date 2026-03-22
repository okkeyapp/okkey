export interface Logger {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

function write(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  extra?: Record<string, unknown>,
): void {
  const payload = {
    level,
    message,
    ts: new Date().toISOString(),
    ...extra,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function createLogger(): Logger {
  return {
    info(message, extra) {
      write("INFO", message, extra);
    },
    warn(message, extra) {
      write("WARN", message, extra);
    },
    error(message, extra) {
      write("ERROR", message, extra);
    },
  };
}
