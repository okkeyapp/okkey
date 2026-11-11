import { decryptCapsulePayload } from "@okkey/crypto";
import type {
  CapsuleApprovalEligibilityDto,
  CapsuleApprovalStatusDto,
  CapsuleMetadataDto,
  CapsuleOpenResponseDto,
  ItemPlaintextV2,
} from "@okkey/types";
import { Button, cn, Spinner } from "@okkey/ui";
import type { KeyFieldFileValue } from "@okkey/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { createPublicApiClient } from "../../api/client";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { blobToBytes } from "../../capsules/crypto";
import { decryptCapsuleAttachmentFiles, openCapsuleItemFileFromVault } from "../../capsules/itemAttachments";
import { storeCapsuleReturnUrl } from "../../auth/capsuleReturnUrl";
import { captureCapsuleFragmentKey } from "../../capsules/fragmentKey";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";
import PublicCapsuleContent from "./PublicCapsuleContent";
import { useLocale } from "../../locale/LocaleContext";
import workspaceCapsulesModule from "@okkey-enterprise/workspace-capsules";

const capsulePanelClassName = cn(
  "w-full rounded-3xl bg-background text-foreground",
  "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
);

type PasswordErrorKey =
  | "web.capsules.public.wrongPassword"
  | "web.capsules.public.passwordAttemptsExceeded";

type ViewerState =
  | "loading"
  | "unavailable"
  | "view_limit"
  | "missing_key"
  | "login"
  | "password"
  | "approval"
  | "waiting"
  | "denied"
  | "blacklisted"
  | "decrypting"
  | "content";

type OpenedCapsuleContent = {
  payload: unknown;
  fileBytes: Uint8Array | null;
  attachmentFiles: Map<string, Uint8Array>;
};

/** Survives React Strict Mode remounts so a single view is not consumed twice. */
const capsuleOpenInflight = new Map<string, Promise<OpenedCapsuleContent>>();
const capsuleOpenCache = new Map<string, OpenedCapsuleContent>();

function errorCode(cause: unknown): string {
  if (!(cause instanceof Error)) return "";
  return cause.message.split(":")[0]?.trim() ?? "";
}

function guestSessionKey(capsuleId: string): string {
  return `okkey:capsule-guest:${capsuleId}`;
}

function getOrCreateGuestSessionId(capsuleId: string): string {
  const key = guestSessionKey(capsuleId);
  const existing = sessionStorage.getItem(key)?.trim();
  if (existing) return existing;
  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, created);
  return created;
}

export default function PublicCapsulePage() {
  const { t } = useLocale();
  const PublicCapsuleAccessGate = workspaceCapsulesModule.PublicCapsuleAccessGate;
  const { capsuleId = "" } = useParams();
  const publicApi = useRef(createPublicApiClient());
  const core = useAuthenticatedCoreClient();
  const { accessToken, vaultKey: accountVaultKey, userId } = useAuthVault();
  const [metadata, setMetadata] = useState<CapsuleMetadataDto | null>(null);
  const [state, setState] = useState<ViewerState>("loading");
  const [password, setPassword] = useState("");
  const [passwordErrorKey, setPasswordErrorKey] = useState<PasswordErrorKey | null>(null);
  const [passwordUnlocking, setPasswordUnlocking] = useState(false);
  const [approvalRequestId, setApprovalRequestId] = useState("");
  const [approvalToken, setApprovalToken] = useState("");
  const [guestSessionId, setGuestSessionId] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<Map<string, Uint8Array>>(
    () => new Map(),
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const handleVaultFileOpen = useCallback(
    async (file: KeyFieldFileValue, item: ItemPlaintextV2) => {
      if (!accessToken || !accountVaultKey || !core) {
        throw new Error("missing file");
      }
      return openCapsuleItemFileFromVault({
        accessToken,
        accountVaultKey,
        core,
        userId,
        item,
        file,
      });
    },
    [accessToken, accountVaultKey, core, userId],
  );

  const resolveViewerState = useCallback(
    (result: CapsuleMetadataDto): ViewerState => {
      if (capsuleOpenCache.has(capsuleId)) {
        return "content";
      }
      if (result.state !== "active") {
        if (result.maxViews !== null && result.viewCount >= result.maxViews) {
          return "view_limit";
        }
        return "unavailable";
      }
      // «Доступ» — вход обязателен. «Подтверждение» без доступа — только экран подтверждения.
      if (result.recipientRestricted && !accessToken) {
        return "login";
      }
      if (result.passwordRequired) {
        return "password";
      }
      if (result.approvalRequired) {
        return "approval";
      }
      return "decrypting";
    },
    [accessToken, capsuleId],
  );

  useEffect(() => {
    const referrerMeta = document.createElement("meta");
    referrerMeta.name = "referrer";
    referrerMeta.content = "no-referrer";
    document.head.append(referrerMeta);

    let cancelled = false;
    const loadMetadata = () => {
      const fragmentKey = captureCapsuleFragmentKey(capsuleId);
      if (!fragmentKey) {
        setState("missing_key");
        return;
      }
      const cached = capsuleOpenCache.get(capsuleId);
      if (cached) {
        setPayload(cached.payload);
        setFileBytes(cached.fileBytes);
        setAttachmentFiles(cached.attachmentFiles ?? new Map());
        setState("content");
      } else {
        setState("loading");
      }
      void publicApi.current
        .get<CapsuleMetadataDto>(`/capsules/${encodeURIComponent(capsuleId)}`)
        .then((result) => {
          if (cancelled) return;
          setMetadata(result);
          if (cached) return;
          const next = resolveViewerState(result);
          if (next === "content") {
            const opened = capsuleOpenCache.get(capsuleId);
            if (opened) {
              setPayload(opened.payload);
              setFileBytes(opened.fileBytes);
              setAttachmentFiles(opened.attachmentFiles);
            }
          }
          setState(next);
        })
        .catch(() => {
          if (!cancelled && !cached) setState("unavailable");
        });
    };

    loadMetadata();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (stateRef.current !== "unavailable" && stateRef.current !== "view_limit") return;
      loadMetadata();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      referrerMeta.remove();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accessToken, capsuleId, resolveViewerState]);

  const open = useCallback(async (options?: { fromPassword?: boolean }) => {
    if (!metadata || !capsuleId) return;
    const fromPasswordForm = options?.fromPassword === true || stateRef.current === "password";
    if (fromPasswordForm) {
      setPasswordUnlocking(true);
    } else {
      setState("decrypting");
      setPasswordErrorKey(null);
    }
    try {
      const cached = capsuleOpenCache.get(capsuleId);
      if (cached) {
        setPayload(cached.payload);
        setFileBytes(cached.fileBytes);
        setAttachmentFiles(cached.attachmentFiles ?? new Map());
        setState("content");
        return;
      }

      let inflight = capsuleOpenInflight.get(capsuleId);
      if (!inflight) {
        inflight = (async () => {
          const openBody = {
            ...(password ? { password } : {}),
            ...(approvalToken ? { approvalToken } : {}),
            ...(guestSessionId && !accessToken ? { guestSessionId } : {}),
          };
          const response =
            metadata.recipientRestricted && core
              ? await core.openCapsule(capsuleId, openBody)
              : accessToken && core && metadata.approvalRequired
                ? await core.openCapsule(capsuleId, openBody)
                : await publicApi.current.post<CapsuleOpenResponseDto>(
                    `/capsules/${encodeURIComponent(capsuleId)}/open`,
                    openBody,
                  );
          const fragment = sessionStorage.getItem(`okkey:capsule-key:${capsuleId}`);
          if (!fragment) throw new Error("missing key");
          const { readCapsuleGuestKey } = await import("@okkey/crypto");
          const capsuleKey = await readCapsuleGuestKey(fragment);
          try {
            const decrypted = await decryptCapsulePayload(
              capsuleKey,
              blobToBytes(response.encryptedPayload),
            );
            const nextPayload: unknown = JSON.parse(new TextDecoder().decode(decrypted));
            let nextFileBytes: Uint8Array | null = null;
            if (response.filePayload) {
              nextFileBytes = await decryptCapsulePayload(
                capsuleKey,
                blobToBytes(response.filePayload),
              );
            }
            const nextAttachmentFiles = await decryptCapsuleAttachmentFiles(
              capsuleKey,
              response.attachmentPayloads,
            );
            const opened: OpenedCapsuleContent = {
              payload: nextPayload,
              fileBytes: nextFileBytes,
              attachmentFiles: nextAttachmentFiles,
            };
            capsuleOpenCache.set(capsuleId, opened);
            return opened;
          } finally {
            capsuleKey.fill(0);
          }
        })();
        capsuleOpenInflight.set(capsuleId, inflight);
      }

      const opened = await inflight;
      capsuleOpenInflight.delete(capsuleId);
      setPayload(opened.payload);
      setFileBytes(opened.fileBytes);
      setAttachmentFiles(opened.attachmentFiles);
      setState("content");
    } catch (cause) {
      capsuleOpenInflight.delete(capsuleId);
      const code = errorCode(cause);
      if (code === "CAPSULE_PASSWORD_REQUIRED" || code === "CAPSULE_PASSWORD_INVALID") {
        setPasswordErrorKey(code === "CAPSULE_PASSWORD_INVALID" ? "web.capsules.public.wrongPassword" : null);
        setState("password");
      } else if (code === "CAPSULE_PASSWORD_ATTEMPTS_EXCEEDED") {
        setPasswordErrorKey("web.capsules.public.passwordAttemptsExceeded");
        setState("password");
      } else if (code === "CAPSULE_APPROVAL_REQUIRED") {
        setState("approval");
      } else if (code === "CAPSULE_APPROVAL_BLACKLISTED") {
        setState("blacklisted");
      } else if (code === "CAPSULE_APPROVAL_DENIED") {
        setState("denied");
      } else if (code === "CAPSULE_RECIPIENT_REQUIRED" || code === "CAPSULE_RECIPIENT_FORBIDDEN") {
        setState(accessToken ? "unavailable" : "login");
      } else if (code === "CAPSULE_VIEW_LIMIT_EXCEEDED") {
        setState("view_limit");
      } else {
        setState("unavailable");
      }
    } finally {
      setPasswordUnlocking(false);
    }
  }, [accessToken, approvalToken, capsuleId, core, guestSessionId, metadata, password]);

  useEffect(() => {
    if (state === "decrypting") void open();
  }, [open, state]);

  useEffect(() => {
    if (state !== "waiting" || !approvalRequestId) return;
    const poll = async (): Promise<CapsuleApprovalStatusDto> => {
      if (core && accessToken) {
        return core.getCapsuleApprovalStatus(approvalRequestId);
      }
      const sessionId = guestSessionId || getOrCreateGuestSessionId(capsuleId);
      return publicApi.current.get<CapsuleApprovalStatusDto>(
        `/capsule-approval-requests/${encodeURIComponent(approvalRequestId)}?guestSessionId=${encodeURIComponent(sessionId)}`,
      );
    };
    const timer = window.setInterval(() => {
      void poll().then(async (result) => {
        if (result.status === "approved" && result.approvalToken) {
          setApprovalToken(result.approvalToken);
          window.clearInterval(timer);
          setState(metadata?.passwordRequired ? "password" : "decrypting");
        } else if (result.status === "denied") {
          window.clearInterval(timer);
          try {
            const eligibility: CapsuleApprovalEligibilityDto =
              core && accessToken
                ? await core.getCapsuleApprovalEligibility(capsuleId)
                : await publicApi.current.get<CapsuleApprovalEligibilityDto>(
                    `/capsules/${encodeURIComponent(capsuleId)}/approval-eligibility`,
                  );
            setState(
              !eligibility.eligible && eligibility.reason === "blacklisted"
                ? "blacklisted"
                : "denied",
            );
          } catch {
            setState("denied");
          }
        }
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [
    accessToken,
    approvalRequestId,
    capsuleId,
    core,
    guestSessionId,
    metadata?.passwordRequired,
    state,
  ]);

  useEffect(() => {
    if (state !== "approval" || !capsuleId) return;
    let active = true;
    const checkEligibility = async () => {
      try {
        const result: CapsuleApprovalEligibilityDto =
          core && accessToken
            ? await core.getCapsuleApprovalEligibility(capsuleId)
            : await publicApi.current.get<CapsuleApprovalEligibilityDto>(
                `/capsules/${encodeURIComponent(capsuleId)}/approval-eligibility`,
              );
        if (!active) return;
        if (!result.eligible && result.reason === "blacklisted") {
          setState("blacklisted");
        }
      } catch {
        // Eligibility check is best-effort; request button still handles blacklist errors.
      }
    };
    void checkEligibility();
    return () => {
      active = false;
    };
  }, [accessToken, capsuleId, core, state]);

  const requestApproval = async () => {
    if (metadata?.recipientRestricted && !core) {
      setState("login");
      return;
    }
    const device = {
      deviceLabel: navigator.userAgent,
      platform: navigator.platform,
    };
    try {
      const result =
        core && accessToken
          ? await core.requestCapsuleApproval(capsuleId, device)
          : await (async () => {
              const sessionId = getOrCreateGuestSessionId(capsuleId);
              setGuestSessionId(sessionId);
              return publicApi.current.post<CapsuleApprovalStatusDto>(
                `/capsules/${encodeURIComponent(capsuleId)}/approval-requests`,
                { ...device, guestSessionId: sessionId },
              );
            })();
      setApprovalRequestId(result.requestId);
      setState("waiting");
    } catch (cause) {
      const code = errorCode(cause);
      if (code === "CAPSULE_APPROVAL_BLACKLISTED") {
        setState("blacklisted");
        return;
      }
      if (code === "CAPSULE_APPROVAL_DENIED") {
        setState("denied");
        return;
      }
      throw cause;
    }
  };

  const capsuleReturnPath = `/capsule/${encodeURIComponent(capsuleId)}`;
  const returnUrl = encodeURIComponent(capsuleReturnPath);

  return (
    <AppShellLayout
      title={t("web.capsules.public.title")}
      description={t("web.capsules.public.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      contentClassName="max-w-[600px]"
      frameClassName="px-4 md:px-10"
      headerClassName="px-6 md:px-0"
    >
      <div className={cn(capsulePanelClassName, "relative p-6")}>
        {state === "loading" || (state === "decrypting" && !passwordUnlocking) ? (
          <Centered>
            <Spinner />
            {t("web.capsules.public.decrypting")}
          </Centered>
        ) : null}
        {state === "missing_key" ? (
          <Centered>{t("web.capsules.public.missingKey")}</Centered>
        ) : null}
        {state === "view_limit" ? (
          <Centered>{t("web.capsules.public.viewLimit")}</Centered>
        ) : null}
        {state === "unavailable" ? (
          <Centered>{t("web.capsules.public.unavailable")}</Centered>
        ) : null}
        {state === "login" ? (
          <Centered>
            {t("web.capsules.public.loginMessage")}
            <Button asChild>
              <Link
                to={`/auth/email?returnTo=${returnUrl}`}
                onClick={() => storeCapsuleReturnUrl(capsuleReturnPath)}
              >
                {t("web.capsules.public.signIn")}
              </Link>
            </Button>
          </Centered>
        ) : null}
        {state === "password" ||
        state === "approval" ||
        state === "waiting" ||
        state === "denied" ||
        state === "blacklisted" ||
        (passwordUnlocking && state !== "content") ? (
          PublicCapsuleAccessGate ? (
            <PublicCapsuleAccessGate
              mode={
                state === "approval" ||
                state === "waiting" ||
                state === "denied" ||
                state === "blacklisted"
                  ? state
                  : "password"
              }
              t={t}
              password={password}
              onPasswordChange={setPassword}
              passwordErrorKey={passwordErrorKey}
              passwordUnlocking={passwordUnlocking}
              onUnlock={() => void open({ fromPassword: true })}
              onRequestApproval={() => void requestApproval()}
            />
          ) : (
            <Centered>{t("web.capsules.public.unavailable")}</Centered>
          )
        ) : null}
        {state === "content" ? (
          <PublicCapsuleLimitsNotice metadata={metadata}>
            <PublicCapsuleContent
              payload={payload}
              fileBytes={fileBytes}
              attachmentFiles={attachmentFiles}
              onVaultFileOpen={handleVaultFileOpen}
            />
          </PublicCapsuleLimitsNotice>
        ) : null}
        {passwordUnlocking ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-background/70">
            <Spinner />
          </div>
        ) : null}
      </div>
    </AppShellLayout>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center text-sm text-copy-secondary">
      {children}
    </div>
  );
}

function PublicCapsuleLimitsNotice({
  metadata,
  children,
}: {
  metadata: CapsuleMetadataDto | null;
  children: ReactNode;
}) {
  const { locale, t } = useLocale();
  const maxViews = metadata?.maxViews ?? null;
  const untilAt = metadata?.deactivateAt ?? metadata?.deleteAt ?? null;
  if (maxViews === null && !untilAt) {
    return children;
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 pb-6 pt-0 text-center text-sm text-copy-secondary">
        {maxViews !== null ? (
          <p>{t("web.capsules.public.viewLimitNotice", { count: maxViews })}</p>
        ) : null}
        {untilAt ? (
          <p>
            {t("web.capsules.public.timeLimitNotice", {
              date: formatScheduleDate(untilAt, locale, t),
            })}
          </p>
        ) : null}
      </div>
      <div className="-mx-6 border-t border-border" />
      <div className="pt-6">{children}</div>
    </div>
  );
}

function formatTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function calendarDayOffset(date: Date, now = new Date()): number {
  return -calendarDaysBetween(date, now);
}

function formatScheduleDate(
  value: string,
  locale: string,
  t: (messageKey: string, values?: Record<string, string | number>) => string,
): string {
  const date = new Date(value);
  const dayOffset = calendarDayOffset(date);
  if (dayOffset === 0) {
    return formatTime(date, locale);
  }
  if (dayOffset === 1) {
    return t("web.capsules.list.scheduleTomorrow", { time: formatTime(date, locale) });
  }
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    ...(includeYear ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
