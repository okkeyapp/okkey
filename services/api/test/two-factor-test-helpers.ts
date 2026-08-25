import { testEntityId } from "./test-entity-id.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authStateRedisKey, AuthService } from "../src/auth/service.ts";
import type { ApiConfig } from "../src/config.ts";
import { initEntityIdGenerator } from "../src/entity-id.ts";
import { base32Decode, totpAt } from "../src/crypto/totp-rfc6238.ts";
import { EmailTemplateService } from "../src/email/service.ts";
import { RegistrationService } from "../src/registration/service.ts";
import { SessionService } from "../src/session/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));

export function createLoggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

export async function applyMigrations(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
): Promise<void> {
  initEntityIdGenerator(1);
  const usersTable = await storage.postgres.query<{ regclass: string | null }>(
    "SELECT to_regclass('public.users') AS regclass",
  );
  const usersExists = Boolean(usersTable[0]?.regclass);

  if (usersExists) {
    const idColumn = await storage.postgres.query<{ data_type: string }>(
      `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'id'
      `,
    );
    if (idColumn[0]?.data_type !== "bigint") {
      await storage.postgres.query("DROP SCHEMA public CASCADE");
      await storage.postgres.query("CREATE SCHEMA public");
    }
  }

  const baseSchema = await storage.postgres.query<{ exists: boolean }>(
    "SELECT to_regclass('public.users') IS NOT NULL AS exists",
  );
  if (!baseSchema[0]?.exists) {
    const migration0001 = readFileSync(
      path.resolve(helpersDir, "../migrations/0001_init.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0001);
  }

  const personalEventsTable = await storage.postgres.query<{ exists: boolean }>(
    "SELECT to_regclass('public.workspace_personal_events') IS NOT NULL AS exists",
  );
  if (!personalEventsTable[0]?.exists) {
    const migration0002 = readFileSync(
      path.resolve(helpersDir, "../migrations/0002_workspace_personal_events.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0002);
  }

  const deletedRetentionColumn = await storage.postgres.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'deleted_items_retention_days'
      ) AS exists
    `,
  );
  if (!deletedRetentionColumn[0]?.exists) {
    const migration0003 = readFileSync(
      path.resolve(helpersDir, "../migrations/0003_deleted_items_retention.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0003);
  }

  const templatesTable = await storage.postgres.query<{ exists: boolean }>(
    "SELECT to_regclass('public.workspace_item_templates') IS NOT NULL AS exists",
  );
  if (!templatesTable[0]?.exists) {
    const migration0005 = readFileSync(
      path.resolve(helpersDir, "../migrations/0005_workspace_item_templates.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0005);
  }

  const favoriteOrderColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspace_member_item_category_preferences'
        AND column_name = 'favorite_order'
    ) AS exists`,
  );
  if (!favoriteOrderColumn[0]?.exists) {
    const migration0006 = readFileSync(
      path.resolve(helpersDir, "../migrations/0006_favorite_order.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0006);
  }

  const attachmentsItemFk = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'attachments'
        AND constraint_name = 'attachments_item_id_fkey'
    ) AS exists`,
  );
  if (attachmentsItemFk[0]?.exists) {
    const migration0007 = readFileSync(
      path.resolve(helpersDir, "../migrations/0007_attachments_event_log_items.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0007);
  }

  const legacyFaviconsTable = await storage.postgres.query<{ exists: boolean }>(
    "SELECT to_regclass('public.vault_item_favicons') IS NOT NULL AS exists",
  );
  if (legacyFaviconsTable[0]?.exists) {
    const migration0008 = readFileSync(
      path.resolve(helpersDir, "../migrations/0008_drop_vault_item_favicons.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0008);
  }

  const workspaceTileColorColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
        AND column_name = 'tile_color'
    ) AS exists`,
  );
  if (!workspaceTileColorColumn[0]?.exists) {
    const migration0009 = readFileSync(
      path.resolve(helpersDir, "../migrations/0009_workspace_branding.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0009);
  }

  const roleBuiltinKeyColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'roles'
        AND column_name = 'builtin_key'
    ) AS exists`,
  );
  if (!roleBuiltinKeyColumn[0]?.exists) {
    const migration0010 = readFileSync(
      path.resolve(helpersDir, "../migrations/0010_workspace_roles.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0010);
  }

  const fileUploadSettingsColumn = await storage.postgres.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'allowed_file_extensions'
      ) AS exists
    `,
  );
  if (!fileUploadSettingsColumn[0]?.exists) {
    const migration0012 = readFileSync(
      path.resolve(helpersDir, "../migrations/0012_workspace_file_upload_settings.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0012);
  }

  const maxFileSizeDecimalColumn = await storage.postgres.query<{ data_type: string }>(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
        AND column_name = 'max_file_size_mb'
    `,
  );
  if (maxFileSizeDecimalColumn[0]?.data_type !== "numeric") {
    const migration0013 = readFileSync(
      path.resolve(helpersDir, "../migrations/0013_workspace_max_file_size_decimal.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0013);
  }

  const maxFileSizeIntegerColumn = await storage.postgres.query<{ data_type: string }>(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspaces'
        AND column_name = 'max_file_size_mb'
    `,
  );
  if (maxFileSizeIntegerColumn[0]?.data_type !== "integer") {
    const migration0014 = readFileSync(
      path.resolve(helpersDir, "../migrations/0014_workspace_max_file_size_integer.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0014);
  }

  const filesInItemsEnabledColumn = await storage.postgres.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'files_in_items_enabled'
      ) AS exists
    `,
  );
  if (!filesInItemsEnabledColumn[0]?.exists) {
    const migration0015 = readFileSync(
      path.resolve(helpersDir, "../migrations/0015_workspace_files_in_items_enabled.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0015);
  }

  const profileBuiltinKeyColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'builtin_key'
    ) AS exists`,
  );
  if (!profileBuiltinKeyColumn[0]?.exists) {
    const migration0016 = readFileSync(
      path.resolve(helpersDir, "../migrations/0016_workspace_profiles.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0016);
  }

  const vaultDescriptionColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vaults'
        AND column_name = 'description'
    ) AS exists`,
  );
  if (!vaultDescriptionColumn[0]?.exists) {
    const migration0017 = readFileSync(
      path.resolve(helpersDir, "../migrations/0017_vault_metadata.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0017);
  }

  const workspaceInvitationsTable = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'workspace_invitations'
    ) AS exists`,
  );
  if (!workspaceInvitationsTable[0]?.exists) {
    const migration0018 = readFileSync(
      path.resolve(helpersDir, "../migrations/0018_workspace_members_invites.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0018);
  }

  const invitationVaultAccessTable = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'workspace_invitation_vault_access'
    ) AS exists`,
  );
  if (!invitationVaultAccessTable[0]?.exists) {
    const migration0019 = readFileSync(
      path.resolve(helpersDir, "../migrations/0019_invitation_vault_access.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0019);
  }

  const invitationRoleChangedColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workspace_invitations'
        AND column_name = 'role_changed_at'
    ) AS exists`,
  );
  if (!invitationRoleChangedColumn[0]?.exists) {
    const migration0020 = readFileSync(
      path.resolve(helpersDir, "../migrations/0020_invitation_role_changed.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0020);
  }

  const lastVaultUnlockedAtColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'last_vault_unlocked_at'
    ) AS exists`,
  );
  if (!lastVaultUnlockedAtColumn[0]?.exists) {
    const migration0021 = readFileSync(
      path.resolve(helpersDir, "../migrations/0021_user_last_vault_unlocked_at.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0021);
  }

  const rolesCreatedByColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'roles'
        AND column_name = 'created_by'
    ) AS exists`,
  );
  if (!rolesCreatedByColumn[0]?.exists) {
    const migration0022 = readFileSync(
      path.resolve(helpersDir, "../migrations/0022_roles_profiles_created_by.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0022);
  }

  const capsuleStateColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'capsules'
        AND column_name = 'state'
    ) AS exists`,
  );
  if (!capsuleStateColumn[0]?.exists) {
    const migration0023 = readFileSync(
      path.resolve(helpersDir, "../migrations/0023_capsules_v2.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0023);
  }

  const capsuleDefaultsTable = await storage.postgres.query<{ exists: boolean }>(
    "SELECT to_regclass('public.workspace_member_capsule_defaults') IS NOT NULL AS exists",
  );
  if (!capsuleDefaultsTable[0]?.exists) {
    const migration0024 = readFileSync(
      path.resolve(helpersDir, "../migrations/0024_workspace_member_capsule_defaults.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0024);
  }

  const guestSessionColumn = await storage.postgres.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'capsule_view_requests'
        AND column_name = 'guest_session_id'
    ) AS exists`,
  );
  if (!guestSessionColumn[0]?.exists) {
    const migration0025 = readFileSync(
      path.resolve(helpersDir, "../migrations/0025_capsule_guest_approval.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0025);
  }

  const blacklistTable = await storage.postgres.query<{ exists: boolean }>(
    "SELECT to_regclass('public.capsule_approval_blacklist') IS NOT NULL AS exists",
  );
  if (!blacklistTable[0]?.exists) {
    const migration0026 = readFileSync(
      path.resolve(helpersDir, "../migrations/0026_capsule_approval_blacklist.sql"),
      "utf8",
    );
    await storage.postgres.query(migration0026);
  }
}

export async function cleanupUserData(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
  email: string,
): Promise<void> {
  await storage.postgres.query(
    "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  await storage.postgres.query(
    "DELETE FROM user_backup_codes WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  await storage.postgres.query(
    "DELETE FROM user_totp_credentials WHERE user_id IN (SELECT id FROM users WHERE email = $1)",
    [email],
  );
  await storage.postgres.query("DELETE FROM devices WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [
    email,
  ]);
  await storage.postgres.query(
    "DELETE FROM vaults WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1))",
    [email],
  );
  await storage.postgres.query("DELETE FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = $1)", [
    email,
  ]);
  await storage.postgres.query("DELETE FROM users WHERE email = $1", [email]);
}

export interface RegisteredUser {
  userId: string;
  email: string;
  authStateId: string;
}

export async function registerUser(
  storage: Awaited<ReturnType<typeof createStorageLayer>>,
  config: ApiConfig,
  email: string,
): Promise<RegisteredUser> {
  const authStateId = testEntityId();
  const emailTemplates = new EmailTemplateService({ send: async () => {} }, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
  });
  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates,
    config,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
  });
  const registrationService = new RegistrationService({
    authService,
    users: storage.repositories.users,
    postgres: storage.postgres,
    redis: storage.redis,
    sessionService,
    config,
  });

  await storage.redis.setWithTtl(
    authStateRedisKey(authStateId),
    JSON.stringify({
      id: authStateId,
      email,
      userId: null,
      createdAt: new Date().toISOString(),
    }),
    3600,
  );

  const share32 = new Uint8Array(32).fill(11);
  const salt16 = new Uint8Array(16).fill(22);
  const encPriv = {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(new Uint8Array(2473).fill(33)).toString("base64"),
    meta: {},
  };
  const pkB64 = Buffer.alloc(32, 5).toString("base64");
  const pqPkB64 = Buffer.alloc(1184, 6).toString("base64");
  const passwordKdfParamsVersion = config.allowedCryptoProfileVersions.includes(2) ? 2 : 1;
  const deviceCryptoCapable = config.cryptoRolloutMode === "strict" ? true : undefined;

  const result = await registrationService.completeRegistration({
    authStateId,
    userPublicKey: pkB64,
    userPublicPqKey: pqPkB64,
    encryptedPrivateKey: encPriv,
    serverKeyShare: share32,
    passwordKdfSalt: salt16,
    passwordKdfParamsVersion,
    deviceFingerprint: "f".repeat(64),
    deviceName: "2FA test device",
    devicePublicKey: Buffer.from("2fa-dpk").toString("base64"),
    deviceShare: share32,
    platform: "desktop",
    osName: "macOS",
    osVersion: "14.0",
    appVersion: "1.0.0",
    clientType: "desktop",
    userAgent: "test",
    requestIp: "127.0.0.1",
    deviceCryptoCapable,
  });

  return { userId: result.userId, email, authStateId };
}

export function totpCodeForSecret(secretBase32: string, fixed: Date): string {
  const secret = base32Decode(secretBase32);
  const unixSeconds = Math.floor(fixed.getTime() / 1000);
  return totpAt(secret, unixSeconds, 30, 6);
}

/** Lets fire-and-forget `void emailTemplates.send…BestEffort` promises settle in tests. */
export async function flushOutboundEmailTasks(): Promise<void> {
  for (let i = 0; i < 24; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
