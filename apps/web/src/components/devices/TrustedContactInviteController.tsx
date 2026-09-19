import type { TrustedContactInviteDto } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { useLocale } from "../../locale/LocaleContext";
import { IconCheck16, IconNotNow16 } from "../items/itemCategoryIcons";

function formatAbsoluteDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Popup for pending trusted-contact invitations (Accept / Reject),
 * same UX pattern as DeviceApprovalController.
 */
export default function TrustedContactInviteController() {
  const { t, locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { vaultUnlocked } = useAuthVault();
  const [pending, setPending] = useState<TrustedContactInviteDto[]>([]);
  const [resolving, setResolving] = useState(false);
  const dismissedIdsRef = useRef(new Set<string>());
  const current = pending[0];

  useEffect(() => {
    if (!core || !vaultUnlocked) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const status = await core.getAccountRecoveryStatus();
        if (active) {
          setPending(
            status.pendingInvites.filter((invite) => !dismissedIdsRef.current.has(invite.id)),
          );
        }
      } catch {
        // Best-effort polling.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [core, vaultUnlocked]);

  if (!current || !core) {
    return null;
  }

  const dismissInvite = (inviteId: string) => {
    dismissedIdsRef.current.add(inviteId);
    setPending((items) => items.filter((item) => item.id !== inviteId));
  };

  const resolve = async (decision: "accept" | "reject") => {
    if (resolving) {
      return;
    }
    setResolving(true);
    try {
      if (decision === "accept") {
        await core.acceptTrustedContactInvite(current.id);
        toast.success(t("web.settingsPopup.recovery.invites.toast.accepted"));
      } else {
        await core.rejectTrustedContactInvite(current.id);
        toast.success(t("web.settingsPopup.recovery.invites.toast.rejected"));
      }
      dismissInvite(current.id);
    } catch {
      toast.error(t("web.settingsPopup.recovery.error.generic"));
      setResolving(false);
    }
  };

  return (
    <Popup
      header={t("web.settingsPopup.recovery.invites.popup.title")}
      width={520}
      closeDisabled
      closeLabel={t("web.capsules.approval.closeLabel")}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={resolving}
            onClick={() => void resolve("accept")}
          >
            <IconCheck16 className="size-4 shrink-0" />
            {t("web.settingsPopup.recovery.invites.popup.accept")}
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={resolving}
            onClick={() => void resolve("reject")}
          >
            <IconNotNow16 className="size-4 shrink-0" />
            {t("web.settingsPopup.recovery.invites.popup.reject")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          {t("web.settingsPopup.recovery.invites.popup.body")}
        </p>
        <div className="flex flex-col gap-1 rounded-xl bg-secondary p-4">
          <p className="truncate text-sm font-medium text-foreground">{current.ownerEmail}</p>
          <p className="text-sm text-muted-foreground">
            {formatAbsoluteDate(current.createdAt, locale)}
          </p>
        </div>
      </div>
    </Popup>
  );
}
