import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type NodeEnv = "development" | "test" | "production";

export interface ApiConfig {
  nodeEnv: NodeEnv;
  port: number;
  logLevel: string;
  corsOrigin: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, "..");

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex < 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  const rawValue = trimmed.slice(separatorIndex + 1).trim();
  const value = rawValue.replace(/^['"]|['"]$/g, "");

  if (!key) {
    return null;
  }

  return [key, value];
}

function loadEnvFile(filename: string): void {
  const filePath = path.join(serviceRoot, filename);
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? "4000");
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return 4000;
  }
  return parsed;
}

export function loadConfig(): ApiConfig {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const nodeEnv = (process.env.NODE_ENV ?? "development") as NodeEnv;
  return {
    nodeEnv,
    port: parsePort(process.env.PORT),
    logLevel: process.env.LOG_LEVEL ?? "info",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
  };
}
