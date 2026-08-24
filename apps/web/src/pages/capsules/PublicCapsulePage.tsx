import { decryptCapsulePayload } from "@okkey/crypto";
import type {
  CapsuleApprovalStatusDto,
  CapsuleMetadataDto,
  CapsuleOpenResponseDto,
  ItemPlaintextV2,
} from "@okkey/types";
import { Button, Input, Spinner } from "@okkey/ui";
import { DownloadIcon, LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { createPublicApiClient } from "../../api/client";
import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { blobToBytes } from "../../capsules/crypto";
import { storeCapsuleReturnUrl } from "../../auth/capsuleReturnUrl";
import { captureCapsuleFragmentKey } from "../../capsules/fragmentKey";

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
  | "decrypting"
  | "content";

type OpenedCapsuleContent = {
  payload: unknown;
  fileBytes: Uint8Array | null;
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
  const { capsuleId = "" } = useParams();
  const publicApi = useRef(createPublicApiClient());
  const core = useAuthenticatedCoreClient();
  const { accessToken } = useAuthVault();
  const [metadata, setMetadata] = useState<CapsuleMetadataDto | null>(null);
  const [state, setState] = useState<ViewerState>("loading");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [approvalRequestId, setApprovalRequestId] = useState("");
  const [approvalToken, setApprovalToken] = useState("");
  const [guestSessionId, setGuestSessionId] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

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
        setState("content");
        return;
      }
      setState("loading");
      void publicApi.current
        .get<CapsuleMetadataDto>(`/capsules/${encodeURIComponent(capsuleId)}`)
        .then((result) => {
          if (cancelled) return;
          setMetadata(result);
          const next = resolveViewerState(result);
          if (next === "content") {
            const opened = capsuleOpenCache.get(capsuleId);
            if (opened) {
              setPayload(opened.payload);
              setFileBytes(opened.fileBytes);
            }
          }
          setState(next);
        })
        .catch(() => {
          if (!cancelled) setState("unavailable");
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

  const open = useCallback(async () => {
    if (!metadata || !capsuleId) return;
    setState("decrypting");
    setPasswordError(null);
    try {
      const cached = capsuleOpenCache.get(capsuleId);
      if (cached) {
        setPayload(cached.payload);
        setFileBytes(cached.fileBytes);
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
          const { decodeCapsuleKeyFragment } = await import("@okkey/crypto");
          const capsuleKey = decodeCapsuleKeyFragment(fragment);
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
            const opened: OpenedCapsuleContent = {
              payload: nextPayload,
              fileBytes: nextFileBytes,
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
      setState("content");
    } catch (cause) {
      capsuleOpenInflight.delete(capsuleId);
      const code = errorCode(cause);
      if (code === "CAPSULE_PASSWORD_REQUIRED" || code === "CAPSULE_PASSWORD_INVALID") {
        setPasswordError(code === "CAPSULE_PASSWORD_INVALID" ? "Неверный пароль" : null);
        setState("password");
      } else if (code === "CAPSULE_PASSWORD_ATTEMPTS_EXCEEDED") {
        setPasswordError("Лимит попыток исчерпан");
        setState("password");
      } else if (code === "CAPSULE_APPROVAL_REQUIRED") {
        setState("approval");
      } else if (code === "CAPSULE_APPROVAL_DENIED") {
        setState("denied");
      } else if (code === "CAPSULE_RECIPIENT_REQUIRED" || code === "CAPSULE_RECIPIENT_FORBIDDEN") {
        setState(accessToken ? "unavailable" : "login");
      } else if (code === "CAPSULE_VIEW_LIMIT_EXCEEDED") {
        setState("view_limit");
      } else {
        setState("unavailable");
      }
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
      void poll().then((result) => {
        if (result.status === "approved" && result.approvalToken) {
          setApprovalToken(result.approvalToken);
          window.clearInterval(timer);
          setState(metadata?.passwordRequired ? "password" : "decrypting");
        } else if (result.status === "denied") {
          window.clearInterval(timer);
          setState("denied");
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

  const requestApproval = async () => {
    if (metadata?.recipientRestricted && !core) {
      setState("login");
      return;
    }
    const device = {
      deviceLabel: navigator.userAgent,
      platform: navigator.platform,
    };
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
  };

  const capsuleReturnPath = `/capsule/${encodeURIComponent(capsuleId)}`;
  const returnUrl = encodeURIComponent(capsuleReturnPath);
  const loginMessage = "Для просмотра этой капсулы войдите в Okkey.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-5">
      <section className="w-full max-w-2xl rounded-xl border bg-background p-6 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheckIcon className="size-7" />
          <div>
            <h1 className="text-lg font-semibold">Защищённая капсула Okkey</h1>
            <p className="text-sm text-muted-foreground">Содержимое расшифровывается только в вашем браузере.</p>
          </div>
        </div>

        {state === "loading" || state === "decrypting" ? (
          <Centered>
            <Spinner />
            Расшифровка…
          </Centered>
        ) : null}
        {state === "missing_key" ? (
          <Centered>
            В ссылке нет ключа расшифровки. Скопируйте ссылку кнопкой «Копировать ссылку» в Okkey
            (должен быть фрагмент #key=…) и вставьте её целиком — мессенджеры часто обрезают часть после #.
          </Centered>
        ) : null}
        {state === "view_limit" ? (
          <Centered>Лимит просмотров этой капсулы исчерпан.</Centered>
        ) : null}
        {state === "unavailable" ? (
          <Centered>
            Капсула недоступна, не активирована или срок её действия закончился.
          </Centered>
        ) : null}
        {state === "login" ? (
          <Centered>
            {loginMessage}
            <Button asChild>
              <Link
                to={`/auth/email?returnTo=${returnUrl}`}
                onClick={() => storeCapsuleReturnUrl(capsuleReturnPath)}
              >
                Войти
              </Link>
            </Button>
          </Centered>
        ) : null}
        {state === "password" ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void open();
            }}
          >
            <label className="flex flex-col gap-2 text-sm font-medium">
              <LockKeyholeIcon className="size-5" />
              Пароль
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
              />
            </label>
            {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
            <Button type="submit" disabled={!password}>
              Разблокировать
            </Button>
          </form>
        ) : null}
        {state === "approval" ? (
          <Centered>
            Владелец должен подтвердить показ.
            <Button onClick={() => void requestApproval()}>Показать</Button>
          </Centered>
        ) : null}
        {state === "waiting" ? (
          <Centered>
            <Spinner />
            Ожидание подтверждения владельца…
          </Centered>
        ) : null}
        {state === "denied" ? <Centered>Владелец запретил показ этой капсулы.</Centered> : null}
        {state === "content" ? <CapsuleContent payload={payload} fileBytes={fileBytes} /> : null}
      </section>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function CapsuleContent({ payload, fileBytes }: { payload: unknown; fileBytes: Uint8Array | null }) {
  if (!payload || typeof payload !== "object") return <p>Пустая капсула</p>;
  const data = payload as { type?: string; text?: string; name?: string; item?: ItemPlaintextV2 };
  if (data.type === "text") {
    return <pre className="whitespace-pre-wrap break-words font-sans text-sm">{data.text}</pre>;
  }
  if (data.type === "file" && fileBytes) {
    const download = () => {
      const url = URL.createObjectURL(new Blob([fileBytes]));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.name || "capsule-file";
      anchor.click();
      URL.revokeObjectURL(url);
    };
    return (
      <Button onClick={download}>
        <DownloadIcon data-icon="inline-start" />
        Скачать {data.name || "файл"}
      </Button>
    );
  }
  if (data.type === "item" && data.item) {
    return (
      <article className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{data.item.title}</h2>
        <dl className="flex flex-col gap-3">
          {data.item.fields.map((field) => (
            <div key={field.id} className="rounded-lg bg-secondary p-3">
              <dt className="text-xs text-muted-foreground">{field.label || field.type}</dt>
              <dd className="mt-1 break-words text-sm">{fieldValueToText(field.value)}</dd>
            </div>
          ))}
        </dl>
      </article>
    );
  }
  return <p className="text-sm text-muted-foreground">Неизвестный тип капсулы</p>;
}

function fieldValueToText(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  const candidate = value as Record<string, unknown>;
  return String(candidate.value ?? candidate.text ?? candidate.name ?? "••••••");
}
