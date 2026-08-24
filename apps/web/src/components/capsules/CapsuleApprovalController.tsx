import type { CapsuleApprovalRequestDto } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { decryptOwnerCapsuleMetadata } from "../../capsules/crypto";
import { useLocale } from "../../locale/LocaleContext";

export default function CapsuleApprovalController() {
  const { t } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { vaultKey } = useAuthVault();
  const [requests, setRequests] = useState<CapsuleApprovalRequestDto[]>([]);
  const [capsuleName, setCapsuleName] = useState(() => t("web.capsules.approval.defaultCapsuleName"));
  const [resolving, setResolving] = useState(false);
  const current = requests[0];

  useEffect(() => {
    if (!core) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await core.listPendingCapsuleApprovals();
        if (active) setRequests(result.requests);
      } catch {
        // Polling is best-effort; the next interval retries.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [core]);

  useEffect(() => {
    const defaultName = t("web.capsules.approval.defaultCapsuleName");
    if (!current || !vaultKey || !current.encryptedCapsuleMetadata || !current.ownerKeyWrap) {
      setCapsuleName(defaultName);
      return;
    }
    void decryptOwnerCapsuleMetadata(
      vaultKey,
      current.encryptedCapsuleMetadata,
      current.ownerKeyWrap,
    )
      .then((metadata) => setCapsuleName(metadata.name))
      .catch(() => setCapsuleName(defaultName));
  }, [current, t, vaultKey]);

  const requester = useMemo(() => {
    if (!current) return t("web.capsules.approval.unknownUser");
    const named = current.requesterName?.trim();
    if (named) return named;
    if (current.requesterUserId) return current.requesterEmail;
    return current.requesterEmail === "guest"
      ? t("web.capsules.approval.guest")
      : current.requesterEmail || t("web.capsules.approval.guest");
  }, [current, t]);

  if (!current || !core) return null;

  const resolve = async (decision: "approve" | "deny") => {
    setResolving(true);
    try {
      await core.resolveCapsuleApproval(current.requestId, decision);
      setRequests((items) => items.filter((item) => item.requestId !== current.requestId));
    } finally {
      setResolving(false);
    }
  };

  return (
    <Popup
      header={t("web.capsules.approval.title")}
      width={520}
      closeDisabled
      closeLabel={t("web.capsules.approval.closeLabel")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="destructive" disabled={resolving} onClick={() => void resolve("deny")}>
            {t("web.capsules.approval.deny")}
          </Button>
          <Button disabled={resolving} onClick={() => void resolve("approve")}>
            {t("web.capsules.approval.approve")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p>
          {t("web.capsules.approval.requestMessage", { requester, capsuleName })}
        </p>
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 rounded-lg bg-secondary p-4">
          <dt className="text-muted-foreground">{t("web.capsules.approval.device")}</dt>
          <dd>{current.deviceLabel}</dd>
          <dt className="text-muted-foreground">{t("web.capsules.approval.platform")}</dt>
          <dd>{current.platform}</dd>
          <dt className="text-muted-foreground">IP</dt>
          <dd>{current.ipAddress}</dd>
          <dt className="text-muted-foreground">{t("web.capsules.approval.country")}</dt>
          <dd>{current.country ?? t("web.capsules.approval.unknown")}</dd>
          <dt className="text-muted-foreground">{t("web.capsules.approval.city")}</dt>
          <dd>{current.city ?? t("web.capsules.approval.unknown")}</dd>
          <dt className="text-muted-foreground">{t("web.capsules.approval.time")}</dt>
          <dd>{new Date(current.requestedAt).toLocaleString()}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          {t("web.capsules.approval.geoNote")}{" "}
          <a className="underline" href="https://db-ip.com" target="_blank" rel="noreferrer">
            DB-IP City Lite
          </a>
          .
        </p>
      </div>
    </Popup>
  );
}
