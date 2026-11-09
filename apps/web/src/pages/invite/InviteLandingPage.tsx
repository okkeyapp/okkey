import { ApiRequestError, CoreApiClient } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import type { InvitationPreviewDto } from "@okkey/types";
import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@okkey/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { createAuthenticatedCoreClient, createPublicApiClient } from "@/api/client";
import { useAuthVault } from "@/auth/AuthVaultContext";
import { normalizeAccountProfileWire } from "@/auth/normalizeAccountProfileWire";
import {
  clearPendingInviteToken,
  writePendingInviteToken,
} from "@/auth/pendingInviteStorage";
import { writeStoredCurrentWorkspaceId } from "@/auth/workspaceStorage";
import AppShellLayout from "@/components/app-shell/AppShellLayout";
import OkkeyLogoMark from "@/components/app-shell/OkkeyLogoMark";
import { useLocale } from "@/locale/LocaleContext";
import {
  AUTH_EMAIL_PATH,
  accountLockWithRedirectQuery,
  invitePath,
  workspaceShellPath,
  ITEMS_PATH,
} from "@/routes/paths";

import { invitePreviewErrorFromUnknown } from "./invitePreviewErrors";

function previewClient(accessToken: string | null): CoreApiClient {
  if (accessToken) {
    return createAuthenticatedCoreClient(accessToken);
  }
  return new CoreApiClient(createPublicApiClient());
}

export default function InviteLandingPage() {
  const { setLocale, t } = useLocale();
  const navigate = useNavigate();
  const { token: rawToken } = useParams();
  const token = rawToken ? decodeURIComponent(rawToken) : "";
  const { accessToken, userId, profile, vaultUnlocked, logout } = useAuthVault();

  const [preview, setPreview] = useState<InvitationPreviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorValues, setErrorValues] = useState<WebMessageValues>({});
  // Logged-in invite screens (esp. expired) must use account language, not a stale localStorage locale.
  const [accountLocaleReady, setAccountLocaleReady] = useState(() => !accessToken);
  const acceptInFlightRef = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      setAccountLocaleReady(true);
      return;
    }
    let cancelled = false;
    setAccountLocaleReady(false);
    void (async () => {
      try {
        const client = createAuthenticatedCoreClient(accessToken);
        const dto = normalizeAccountProfileWire(await client.getAccountProfile());
        if (!cancelled && dto && (dto.locale === "en" || dto.locale === "ru")) {
          setLocale(dto.locale);
        }
      } catch {
        /* Keep stored locale if profile is unavailable. */
      } finally {
        if (!cancelled) {
          setAccountLocaleReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, setLocale]);

  const loadPreview = useCallback(async () => {
    if (!token) {
      setErrorKey("web.invite.invalid");
      setErrorValues({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorKey(null);
    setErrorValues({});
    try {
      const client = previewClient(accessToken);
      const next = await client.getInvitationByToken(token);
      setPreview(next);
    } catch (error) {
      const mapped = invitePreviewErrorFromUnknown(error);
      setErrorKey(mapped.key);
      setErrorValues("values" in mapped ? mapped.values : {});
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    acceptInFlightRef.current = false;
  }, [token]);

  const goToWorkspace = useCallback(
    (workspaceId: string) => {
      if (userId) {
        writeStoredCurrentWorkspaceId(userId, workspaceId);
      }
      clearPendingInviteToken();
      navigate(workspaceShellPath(ITEMS_PATH, workspaceId), { replace: true });
    },
    [navigate, userId],
  );

  const accept = useCallback(async () => {
    if (!token || !accessToken || acceptInFlightRef.current) {
      return;
    }
    acceptInFlightRef.current = true;
    setAccepting(true);
    setErrorKey(null);
    setErrorValues({});
    try {
      const client = createAuthenticatedCoreClient(accessToken);
      const result = await client.acceptInvitation(token);
      goToWorkspace(result.workspaceId);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const code = error.body.error;
        if (code === "INVITE_EMAIL_MISMATCH") {
          setErrorKey("web.invite.emailMismatch");
        } else if (code === "INVITE_EXPIRED") {
          setErrorKey("web.invite.expired");
        } else if (code === "INVITE_REVOKED") {
          setErrorKey("web.invite.revoked");
        } else if (code === "CONFLICT") {
          setErrorKey("web.invite.alreadyMember");
        } else if (code === "AUTH_RATE_LIMITED" || error.status === 429) {
          const mapped = invitePreviewErrorFromUnknown(error);
          setErrorKey(mapped.key);
          setErrorValues("values" in mapped ? mapped.values : {});
        } else {
          setErrorKey("web.invite.errorGeneric");
        }
      } else {
        setErrorKey("web.invite.errorGeneric");
      }
      acceptInFlightRef.current = false;
      setAccepting(false);
    }
  }, [accessToken, goToWorkspace, token]);

  useEffect(() => {
    if (!preview || preview.status !== "pending" || !accessToken || !vaultUnlocked) {
      return;
    }
    const sessionEmail = profile?.email?.trim().toLowerCase() ?? "";
    if (!sessionEmail || sessionEmail !== preview.email.trim().toLowerCase()) {
      return;
    }
    void accept();
  }, [accept, accessToken, preview, profile?.email, vaultUnlocked]);

  function continueAsGuest() {
    if (!token || !preview) {
      return;
    }
    writePendingInviteToken(token);
    const q = new URLSearchParams({ email: preview.email });
    navigate(`${AUTH_EMAIL_PATH}?${q.toString()}`, { replace: true });
  }

  function continueLocked() {
    if (!token) {
      return;
    }
    writePendingInviteToken(token);
    navigate(accountLockWithRedirectQuery(encodeURIComponent(invitePath(token))), { replace: true });
  }

  const status = preview?.status;
  const sessionEmail = profile?.email?.trim().toLowerCase() ?? "";
  const emailMatches = Boolean(
    sessionEmail && preview && sessionEmail === preview.email.trim().toLowerCase(),
  );

  let body: ReactNode;
  if (loading || accepting || !accountLocaleReady) {
    body = (
      <div className="flex w-full justify-center py-6" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  } else if (errorKey && !preview) {
    body = (
      <Alert variant="error">
        <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
        <AlertDescription>{t(errorKey, errorValues)}</AlertDescription>
      </Alert>
    );
  } else if (status === "expired") {
    body = <p className="okkey-body text-copy-secondary">{t("web.invite.expired")}</p>;
  } else if (status === "revoked") {
    body = <p className="okkey-body text-copy-secondary">{t("web.invite.revoked")}</p>;
  } else if (status === "accepted") {
    body = (
      <div className="flex w-full flex-col gap-4">
        <p className="okkey-body text-copy-secondary">{t("web.invite.alreadyAccepted")}</p>
        {accessToken && emailMatches ? (
          <Button type="button" onClick={() => void accept()}>
            {t("web.invite.openWorkspace")}
          </Button>
        ) : null}
      </div>
    );
  } else if (preview && status === "pending") {
    if (!accessToken) {
      body = (
        <div className="flex w-full flex-col gap-4">
          <p className="okkey-body text-copy-secondary">
            {t("web.invite.intro", {
              workspace: preview.workspaceName,
              inviter: preview.inviterDisplayName || preview.email,
            })}
          </p>
          <Button type="button" onClick={continueAsGuest}>
            {t("web.invite.continue")}
          </Button>
        </div>
      );
    } else if (!emailMatches) {
      body = (
        <div className="flex w-full flex-col gap-4">
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{t("web.invite.emailMismatch")}</AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              logout();
              writePendingInviteToken(token);
              const q = new URLSearchParams({ email: preview.email });
              navigate(`${AUTH_EMAIL_PATH}?${q.toString()}`, { replace: true });
            }}
          >
            {t("web.invite.switchAccount")}
          </Button>
        </div>
      );
    } else if (!vaultUnlocked) {
      body = (
        <div className="flex w-full flex-col gap-4">
          <p className="okkey-body text-copy-secondary">{t("web.invite.unlockToJoin")}</p>
          <Button type="button" onClick={continueLocked}>
            {t("web.invite.unlock")}
          </Button>
        </div>
      );
    } else if (errorKey) {
      body = (
        <Alert variant="error">
          <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
          <AlertDescription>{t(errorKey, errorValues)}</AlertDescription>
        </Alert>
      );
    } else {
      body = (
        <div className="flex w-full justify-center py-6" role="status" aria-busy="true">
          <Spinner />
        </div>
      );
    }
  } else {
    body = <p className="okkey-body text-copy-secondary">{t("web.invite.invalid")}</p>;
  }

  return (
    <AppShellLayout
      title={t("web.invite.title")}
      description={preview ? preview.workspaceName : t("web.invite.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      {body}
    </AppShellLayout>
  );
}
