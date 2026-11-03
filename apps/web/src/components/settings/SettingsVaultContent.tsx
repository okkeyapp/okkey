import type { WebMessageValues } from "@okkey/i18n";
import {
  Button,
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroupLabel,
  MultiSelectItem,
  MultiSelectTrigger,
} from "@okkey/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthVault } from "../../auth/AuthVaultContext";
import {
  patchVaultDevicePrefs,
  readVaultDevicePrefs,
  type SectionReauthZoneId,
  type VaultDevicePrefs,
} from "../../auth/vaultDevicePrefs";
import { clearDeviceUnlockSecrets } from "../../auth/vaultDeviceUnlockStore";
import { useLocale } from "../../locale/LocaleContext";
import ChangeMasterPasswordPopup from "./ChangeMasterPasswordPopup";
import { SettingsRow } from "./SettingsRows";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";
import { toast } from "sonner";

type SettingsVaultContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceIds: string[];
};

function notifySaved(t: SettingsVaultContentProps["t"]) {
  toast.success(t("web.toast.save.success"));
}

function formatRelativePast(
  iso: string | null,
  locale: string,
  t: SettingsVaultContentProps["t"],
): string {
  if (!iso) {
    return t("web.settingsPopup.vault.masterPassword.unknownDate");
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("web.settingsPopup.vault.masterPassword.unknownDate");
  }
  const absolute = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  // Compare local calendar days, not a rolling 24h window.
  const days = Math.max(0, calendarDaysBetween(date));
  if (days === 0) {
    return t("web.settingsPopup.vault.masterPassword.changedToday", { date: absolute });
  }
  if (days === 1) {
    return t("web.settingsPopup.vault.masterPassword.changedYesterday", { date: absolute });
  }
  return t("web.settingsPopup.vault.masterPassword.changedAgo", {
    date: absolute,
    days: String(days),
  });
}

export default function SettingsVaultContent({ t, workspaceIds }: SettingsVaultContentProps) {
  const { locale } = useLocale();
  const {
    userId,
    masterPasswordChangedAt,
    changeMasterPassword,
  } = useAuthVault();

  const [prefs, setPrefs] = useState<VaultDevicePrefs>(() => readVaultDevicePrefs(userId));
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeSubmitting, setChangeSubmitting] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changedAt, setChangedAt] = useState(masterPasswordChangedAt);

  useEffect(() => {
    setPrefs(readVaultDevicePrefs(userId));
  }, [userId]);

  useEffect(() => {
    setChangedAt(masterPasswordChangedAt);
  }, [masterPasswordChangedAt]);

  const updatePrefs = useCallback(
    (patch: Partial<VaultDevicePrefs>) => {
      if (!userId) {
        return;
      }
      setPrefs(patchVaultDevicePrefs(userId, patch));
      notifySaved(t);
    },
    [userId, t],
  );

  const zoneGroups = useMemo(
    () =>
      [
        {
          label: t("web.settingsPopup.vault.zones.group.sections"),
          zones: [
            { id: "capsules" as const, label: t("web.settingsPopup.vault.zones.capsules") },
            { id: "monitoring" as const, label: t("web.settingsPopup.vault.zones.monitoring") },
            { id: "tools" as const, label: t("web.settingsPopup.vault.zones.tools") },
            {
              id: "workspaceSettings" as const,
              label: t("web.settingsPopup.vault.zones.workspaceSettings"),
            },
          ],
        },
        {
          label: t("web.settingsPopup.vault.zones.group.popups"),
          zones: [
            {
              id: "personalSettings" as const,
              label: t("web.settingsPopup.vault.zones.personalSettings"),
            },
            { id: "itemPopups" as const, label: t("web.settingsPopup.vault.zones.itemPopups") },
            {
              id: "capsulePopups" as const,
              label: t("web.settingsPopup.vault.zones.capsulePopups"),
            },
            { id: "vaultPopups" as const, label: t("web.settingsPopup.vault.zones.vaultPopups") },
            { id: "foldersPopup" as const, label: t("web.settingsPopup.vault.zones.foldersPopup") },
          ],
        },
        {
          label: t("web.settingsPopup.vault.zones.group.actions"),
          zones: [{ id: "deletion" as const, label: t("web.settingsPopup.vault.zones.deletion") }],
        },
      ] satisfies Array<{
        label: string;
        zones: Array<{ id: SectionReauthZoneId; label: string }>;
      }>,
    [t],
  );

  return (
    <div className="min-h-[420px] pb-1">
      <section>
        <SettingsRow
          border={false}
          label={t("web.settingsPopup.vault.masterPassword.lastSet")}
          description={formatRelativePast(changedAt, locale, t)}
          controlClassName="w-auto"
        >
          <Button type="button" onClick={() => setChangeOpen(true)}>
            {t("web.settingsPopup.vault.masterPassword.change")}
          </Button>
        </SettingsRow>

        <SettingsRow
          label={t("web.settingsPopup.vault.requirePassword.label")}
          description={t("web.settingsPopup.vault.requirePassword.description")}
          controlClassName="w-[150px]"
        >
          <MultiSelect
            displayMode="summary"
            selectionCountLabel={t("web.settingsPopup.vault.requirePassword.selectedCount")}
            value={prefs.requireReauthZones}
            onValueChange={(value) =>
              updatePrefs({ requireReauthZones: value as SectionReauthZoneId[] })
            }
            placeholder={t("web.settingsPopup.vault.requirePassword.placeholder")}
          >
            <MultiSelectTrigger className="w-full font-normal" />
            <MultiSelectContent align="end" className="w-[280px] min-w-[280px]">
              {zoneGroups.map((group) => (
                <div key={group.label}>
                  <MultiSelectGroupLabel>{group.label}</MultiSelectGroupLabel>
                  {group.zones.map((zone) => (
                    <MultiSelectItem key={zone.id} value={zone.id}>
                      {zone.label}
                    </MultiSelectItem>
                  ))}
                </div>
              ))}
            </MultiSelectContent>
          </MultiSelect>
        </SettingsRow>
      </section>

      <ChangeMasterPasswordPopup
        open={changeOpen}
        submitting={changeSubmitting}
        errorMessage={changeError}
        t={t}
        onClose={() => {
          if (!changeSubmitting) {
            setChangeOpen(false);
            setChangeError(null);
          }
        }}
        onSubmit={({ oldPassword, newPassword }) => {
          void (async () => {
            setChangeSubmitting(true);
            setChangeError(null);
            const result = await changeMasterPassword({
              oldPassword,
              newPassword,
              workspaceIds,
            });
            setChangeSubmitting(false);
            if (!result.ok) {
              setChangeError(
                result.error === "wrong_old_password"
                  ? t("web.settingsPopup.vault.changePassword.wrongOld")
                  : t("web.settingsPopup.vault.changePassword.failed"),
              );
              return;
            }
            setChangedAt(result.masterPasswordChangedAt);
            updatePrefs({ pinEnabled: false, biometricEnabled: false });
            if (userId) {
              clearDeviceUnlockSecrets(userId);
            }
            setChangeOpen(false);
          })();
        }}
      />
    </div>
  );
}
