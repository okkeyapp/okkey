import type { Workspace } from "@okkey/types";
import { Button, Input, Spinner } from "@okkey/ui";
import { useCallback, useEffect, useState } from "react";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { useLocale } from "../../locale/LocaleContext";

type WorkspaceSettingsSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
};

export default function WorkspaceSettingsSection({
  workspaceId,
  workspace,
}: WorkspaceSettingsSectionProps) {
  const { t } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { userId } = useAuthVault();
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isOwner = Boolean(workspace && userId && workspace.ownerId === userId);

  const loadSettings = useCallback(async () => {
    if (!core || !workspaceId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const settings = await core.getWorkspaceSettings(workspaceId);
      setRetentionDays(settings.deleted_items_retention_days);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "settings load failed");
    } finally {
      setLoading(false);
    }
  }, [core, workspaceId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave() {
    if (!core || !isOwner) {
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await core.updateWorkspaceSettings(workspaceId, {
        deleted_items_retention_days: retentionDays,
      });
      setRetentionDays(updated.deleted_items_retention_days);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "settings save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">{t("web.workspaceSettings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.description")}</p>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <label htmlFor="deleted-items-retention-days" className="text-sm font-medium text-foreground">
          {t("web.workspaceSettings.deletedItemsRetention.label")}
        </label>
        <p className="text-sm text-muted-foreground">
          {t("web.workspaceSettings.deletedItemsRetention.description")}
        </p>
        <Input
          id="deleted-items-retention-days"
          type="number"
          min={1}
          max={3650}
          value={retentionDays}
          disabled={!isOwner || saving}
          onChange={(event) => {
            setSaved(false);
            setRetentionDays(Number(event.target.value));
          }}
        />
        {!isOwner ? (
          <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.ownerOnly")}</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? (
          <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.saved")}</p>
        ) : null}
        {isOwner ? (
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("web.workspaceSettings.saving") : t("web.workspaceSettings.save")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
