import type { IncomingMessage } from "node:http";

import type { ApiConfig } from "../config.ts";
import type { HttpApp } from "../http.ts";
import type { QueryExecutor } from "../storage/postgres.ts";
import type { WorkspacesRepository } from "../storage/repositories.ts";

export type ApiEnterprisePluginContext = {
  app: HttpApp;
  config: ApiConfig;
  resolveUserId: (req: IncomingMessage) => Promise<string | null>;
  postgres: QueryExecutor;
  repositories: {
    workspaces: Pick<WorkspacesRepository, "findById" | "hasAccess">;
  };
};

export interface ApiEnterprisePlugin {
  readonly id: string;
  register(ctx: ApiEnterprisePluginContext): void | Promise<void>;
}
