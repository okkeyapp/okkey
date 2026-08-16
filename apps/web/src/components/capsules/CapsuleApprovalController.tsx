import type { CapsuleApprovalRequestDto } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { decryptOwnerCapsuleMetadata } from "../../capsules/crypto";

export default function CapsuleApprovalController() {
  const core = useAuthenticatedCoreClient();
  const { vaultKey } = useAuthVault();
  const [requests, setRequests] = useState<CapsuleApprovalRequestDto[]>([]);
  const [capsuleName, setCapsuleName] = useState("Капсула");
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
    if (!current || !vaultKey || !current.encryptedCapsuleMetadata || !current.ownerKeyWrap) {
      setCapsuleName("Капсула");
      return;
    }
    void decryptOwnerCapsuleMetadata(
      vaultKey,
      current.encryptedCapsuleMetadata,
      current.ownerKeyWrap,
    ).then((metadata) => setCapsuleName(metadata.name)).catch(() => setCapsuleName("Капсула"));
  }, [current, vaultKey]);

  const requester = useMemo(
    () => current?.requesterName?.trim() || current?.requesterEmail || "Неизвестный пользователь",
    [current],
  );

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
      header="Подтвердите показ капсулы"
      width={520}
      closeDisabled
      closeLabel="Решите запрос"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="destructive" disabled={resolving} onClick={() => void resolve("deny")}>
            Запретить показ
          </Button>
          <Button disabled={resolving} onClick={() => void resolve("approve")}>
            Одобрить
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p>
          <strong>{requester}</strong> хочет просмотреть капсулу «{capsuleName}».
        </p>
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 rounded-lg bg-secondary p-4">
          <dt className="text-muted-foreground">Устройство</dt><dd>{current.deviceLabel}</dd>
          <dt className="text-muted-foreground">Система</dt><dd>{current.platform}</dd>
          <dt className="text-muted-foreground">IP</dt><dd>{current.ipAddress}</dd>
          <dt className="text-muted-foreground">Страна</dt><dd>{current.country ?? "Неизвестно"}</dd>
          <dt className="text-muted-foreground">Город</dt><dd>{current.city ?? "Неизвестно"}</dd>
          <dt className="text-muted-foreground">Время</dt><dd>{new Date(current.requestedAt).toLocaleString()}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          Геолокация по IP:{" "}
          <a className="underline" href="https://db-ip.com" target="_blank" rel="noreferrer">DB-IP City Lite</a>.
        </p>
      </div>
    </Popup>
  );
}
