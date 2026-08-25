import type { CapsuleApprovalRequestDto } from "@okkey/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popup,
  cn,
} from "@okkey/ui";
import { useEffect, useMemo, useState, type SVGProps } from "react";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { decryptOwnerCapsuleMetadata } from "../../capsules/crypto";
import { useLocale } from "../../locale/LocaleContext";

function DenyShowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M2 8C2 8.78793 2.15519 9.56815 2.45672 10.2961C2.75825 11.0241 3.20021 11.6855 3.75736 12.2426C4.31451 12.7998 4.97595 13.2417 5.7039 13.5433C6.43185 13.8448 7.21207 14 8 14C8.78793 14 9.56815 13.8448 10.2961 13.5433C11.0241 13.2417 11.6855 12.7998 12.2426 12.2426C12.7998 11.6855 13.2417 11.0241 13.5433 10.2961C13.8448 9.56815 14 8.78793 14 8C14 7.21207 13.8448 6.43185 13.5433 5.7039C13.2417 4.97595 12.7998 4.31451 12.2426 3.75736C11.6855 3.20021 11.0241 2.75825 10.2961 2.45672C9.56815 2.15519 8.78793 2 8 2C7.21207 2 6.43185 2.15519 5.7039 2.45672C4.97595 2.75825 4.31451 3.20021 3.75736 3.75736C3.20021 4.31451 2.75825 4.97595 2.45672 5.7039C2.15519 6.43185 2 7.21207 2 8Z"
        stroke="#EF4444"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.66663 6.6665H11.3333V9.33317H4.66663V6.6665Z"
        stroke="#EF4444"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ApproveCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M3.33337 7.99984L6.66671 11.3332L13.3334 4.6665"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isPublicLookupIp(ipAddress: string): boolean {
  const ip = ipAddress.trim().toLowerCase();
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") {
    return false;
  }
  if (ip.includes(":")) {
    return !(
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("fe80:") ||
      ip === "::"
    );
  }
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return !(
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

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
    if (!current.requesterUserId || current.requesterEmail === "guest") {
      return t("web.capsules.approval.guest");
    }
    return current.requesterEmail || t("web.capsules.approval.guest");
  }, [current, t]);

  const requestMessage = useMemo(() => {
    const marker = "\u0001";
    const pattern = t("web.capsules.approval.requestMessage", {
      requester: marker,
      capsuleName,
    });
    const markerIndex = pattern.indexOf(marker);
    if (markerIndex < 0) {
      return { before: pattern, after: "" };
    }
    return {
      before: pattern.slice(0, markerIndex),
      after: pattern.slice(markerIndex + marker.length),
    };
  }, [capsuleName, t]);

  const detailRows = useMemo(() => {
    if (!current) return [];
    return [
      { label: t("web.capsules.approval.device"), value: current.deviceLabel },
      { label: t("web.capsules.approval.platform"), value: current.platform },
      {
        label: "IP",
        value: current.ipAddress,
        href: isPublicLookupIp(current.ipAddress)
          ? `https://db-ip.com/${encodeURIComponent(current.ipAddress)}`
          : undefined,
      },
      {
        label: t("web.capsules.approval.country"),
        value: current.country || t("web.capsules.approval.unknown"),
      },
      {
        label: t("web.capsules.approval.city"),
        value: current.city || t("web.capsules.approval.unknown"),
      },
      {
        label: t("web.capsules.approval.time"),
        value: new Date(current.requestedAt).toLocaleString(),
      },
    ];
  }, [current, t]);

  if (!current || !core) return null;

  const resolve = async (decision: "approve" | "deny" | "blacklist") => {
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
          <div className="inline-flex">
            <Button
              type="button"
              variant="outline"
              disabled={resolving}
              className="relative rounded-r-none border-r-0 focus:z-10"
              onClick={() => void resolve("deny")}
            >
              <DenyShowIcon />
              {t("web.capsules.approval.deny")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={resolving}
                  aria-label={t("web.capsules.approval.denyMore")}
                  className="relative rounded-l-none focus:z-10"
                >
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-1">
                <DropdownMenuItem
                  className="h-auto cursor-pointer flex-col items-start gap-1 py-2"
                  disabled={resolving}
                  onSelect={() => void resolve("blacklist")}
                >
                  <span className="font-medium text-foreground">
                    {t("web.capsules.approval.blacklist")}
                  </span>
                  <span className="whitespace-normal text-xs text-muted-foreground">
                    {t("web.capsules.approval.blacklistDescription")}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button type="button" disabled={resolving} onClick={() => void resolve("approve")}>
            <ApproveCheckIcon />
            {t("web.capsules.approval.approve")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p>
          {requestMessage.before}
          <span className="font-semibold">{requester}</span>
          {requestMessage.after}
        </p>
        <div className="overflow-hidden rounded-lg bg-secondary">
          <dl className="divide-y divide-border">
            {detailRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[120px_1fr] gap-x-3 px-4 py-2.5">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className={cn(row.href && "min-w-0")}>
                  {row.href ? (
                    <a className="underline break-all" href={row.href} target="_blank" rel="noreferrer">
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
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
