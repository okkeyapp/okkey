import { createDockerApplyEngine, unixSocketTransport } from "./docker-engine.ts";
import { startUpdateAgentServer } from "./server.ts";

const port = Number(process.env.OKKEY_UPDATE_AGENT_PORT ?? "8090");
const token = process.env.OKKEY_UPDATE_AGENT_TOKEN ?? "";
const publicKeyPem = process.env.OKKEY_UPDATE_TRUSTED_PUBLIC_KEY ?? "";
const enterprisePublicKeyPem = process.env.OKKEY_UPDATE_ENTERPRISE_TRUSTED_PUBLIC_KEY ?? "";
const coreVersion = process.env.OKKEY_VERSION ?? "";
const isolated = ["1", "true", "yes"].includes(
  (process.env.OKKEY_UPDATE_ISOLATED ?? "").trim().toLowerCase(),
);
const project = (process.env.OKKEY_COMPOSE_PROJECT ?? "okkey").trim() || "okkey";
const installDir = (process.env.OKKEY_INSTALL_DIR ?? "/okkey").replace(/\/$/, "");
const socketPath = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";

const server = startUpdateAgentServer({
  port,
  token,
  publicKeyPem,
  enterprisePublicKeyPem,
  coreVersion,
  isolated,
  project,
  envFilePath: `${installDir}/.env`,
  engine: createDockerApplyEngine(unixSocketTransport(socketPath)),
});

server.on("listening", () => {
  process.stdout.write(`okkey update agent listening on ${port}\n`);
});
