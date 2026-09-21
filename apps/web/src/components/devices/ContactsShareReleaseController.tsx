import { createBearerApiClient } from "@okkey/api";
import {
  base64ToBytes,
  unsealContactShare,
  wipeBytes,
  wrapShareForRelease,
} from "@okkey-enterprise/recovery-crypto";
import type { EnterpriseContactRecoveryRequestDto } from "@okkey-enterprise/types";
import { EnterpriseAccountRecoveryClient } from "@okkey-enterprise/api";
import {
  decryptUserIdentityFromEncryptedBlob,
  initCrypto,
  unwrapVaultKeyForSelf,
} from "@okkey/crypto";
import { Button, Popup } from "@okkey/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import accountRecoveryModule from "@okkey-enterprise/account-recovery";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { readVaultBundle } from "../../auth/localVaultBundle";
import { readStoredLocale } from "../../locale/localeStorage";
import { useLocale } from "../../locale/LocaleContext";
import {
  MemberFavicon,
  memberDisplayName,
} from "../workspace/settings/vaults/vaultAccessHelpers";

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === "string" && raw.trim() && raw !== "undefined") {
    return raw.trim().replace(/\/$/, "");
  }
  return "http://localhost:4000";
}

function isExpired(expiresAt: string): boolean {
  const ms = new Date(expiresAt).getTime();
  return Number.isNaN(ms) || ms <= Date.now();
}

function formatAbsoluteDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Popup for pending contact share-release requests
 * (owner card matches TrustedContactInviteController / MembersListCard).
 */
export default function ContactsShareReleaseController() {
  const enterpriseEnabled = Boolean(accountRecoveryModule.ContactsRestorePanel);
  const { t, locale } = useLocale();
  const { accessToken, userId, vaultUnlocked, vaultKey } = useAuthVault();
  const [pending, setPending] = useState<EnterpriseContactRecoveryRequestDto[]>([]);
  const [resolving, setResolving] = useState(false);
  const dismissedIdsRef = useRef(new Set<string>());

  const client = useMemo(() => {
    if (!accessToken || !enterpriseEnabled) {
      return null;
    }
    return new EnterpriseAccountRecoveryClient(
      createBearerApiClient(apiBase(), accessToken, {
        "Accept-Language": readStoredLocale(),
      }),
    );
  }, [accessToken, enterpriseEnabled]);

  useEffect(() => {
    if (!client || !vaultUnlocked) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const result = await client.listContactRequests("contact");
        if (active) {
          setPending(
            result.requests.filter(
              (r) =>
                r.status === "pending" &&
                !isExpired(r.expiresAt) &&
                !dismissedIdsRef.current.has(r.id),
            ),
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
  }, [client, vaultUnlocked]);

  const current = pending[0];
  if (!enterpriseEnabled || !current || !client || !userId || !vaultKey) {
    return null;
  }

  const ownerEmail = current.ownerEmail ?? "";
  const ownerName = memberDisplayName({
    firstName: current.ownerFirstName ?? null,
    lastName: current.ownerLastName ?? null,
    email: ownerEmail,
  });
  const showName = ownerName.trim().length > 0 && ownerName !== ownerEmail;

  const dismissRequest = (requestId: string) => {
    dismissedIdsRef.current.add(requestId);
    setPending((items) => items.filter((item) => item.id !== requestId));
  };

  const release = async () => {
    if (resolving) {
      return;
    }
    setResolving(true);
    let sealKey: Uint8Array | null = null;
    let share: Uint8Array | null = null;
    try {
      await initCrypto();
      const material = await client.getContactShareMaterial(current.id);
      const bundle = readVaultBundle(userId);
      if (!bundle) {
        throw new Error("missing vault bundle");
      }
      const identity = await decryptUserIdentityFromEncryptedBlob(
        vaultKey,
        bundle.encrypted_private_key.payload,
      );
      sealKey = await unwrapVaultKeyForSelf({
        encryptedVaultKey: material.sealedKeyBlob as never,
        recipientPrivateKey: identity.ed25519SecretKey,
        recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
      });
      share = await unsealContactShare(base64ToBytes(material.sealedShareB64), sealKey);
      const releaseWrap = await wrapShareForRelease(
        share,
        base64ToBytes(material.requestEphemeralPublicB64),
      );
      await client.releaseContactShare(current.id, releaseWrap);
      dismissRequest(current.id);
      toast.success(t("account.restore.enterprise.contacts.toast.released"));
      setResolving(false);
    } catch {
      toast.error(t("web.settingsPopup.recovery.error.generic"));
      setResolving(false);
    } finally {
      if (sealKey) {
        wipeBytes(sealKey);
      }
      if (share) {
        wipeBytes(share);
      }
    }
  };

  return (
    <Popup
      header={t("account.restore.enterprise.contacts.popup.title")}
      width={520}
      closeDisabled
      closeLabel={t("web.capsules.approval.closeLabel")}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            className="gap-2"
            disabled={resolving}
            onClick={() => void release()}
          >
            {t("account.restore.enterprise.contacts.release")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          {t("account.restore.enterprise.contacts.popup.body")}
        </p>
        <div className="flex flex-col gap-3 rounded-xl bg-secondary p-4">
          <div className="flex items-center gap-4">
            <MemberFavicon
              firstName={current.ownerFirstName}
              lastName={current.ownerLastName}
              email={ownerEmail}
              size={40}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
              {showName ? (
                <p className="truncate text-sm font-bold leading-5 text-foreground">{ownerName}</p>
              ) : null}
              <p
                className={
                  showName
                    ? "truncate text-sm font-normal leading-5 text-muted-foreground"
                    : "truncate text-sm font-bold leading-5 text-foreground"
                }
              >
                {ownerEmail}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 text-sm leading-5 text-muted-foreground">
            <p>
              {t("account.restore.enterprise.contacts.popup.requested", {
                when: formatAbsoluteDate(current.createdAt, locale),
              })}
            </p>
            <p>
              {t("account.restore.enterprise.contacts.popup.expires", {
                when: formatAbsoluteDate(current.expiresAt, locale),
              })}
            </p>
          </div>
        </div>
      </div>
    </Popup>
  );
}
