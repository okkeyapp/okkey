import { decryptCapsulePayload } from "@okkey/crypto";
import type { CapsuleMetadataDto, CapsuleOpenResponseDto, ItemPlaintextV2 } from "@okkey/types";
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
  | "login"
  | "password"
  | "approval"
  | "waiting"
  | "denied"
  | "decrypting"
  | "content";

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
  const [payload, setPayload] = useState<unknown>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    const referrerMeta = document.createElement("meta");
    referrerMeta.name = "referrer";
    referrerMeta.content = "no-referrer";
    document.head.append(referrerMeta);
    const fragmentKey = captureCapsuleFragmentKey(capsuleId);
    if (!fragmentKey) {
      setState("unavailable");
      return;
    }
    void publicApi.current
      .get<CapsuleMetadataDto>(`/capsules/${encodeURIComponent(capsuleId)}`)
      .then((result) => {
        setMetadata(result);
        if (result.state !== "active") {
          setState("unavailable");
        } else if ((result.recipientRestricted || result.approvalRequired) && !accessToken) {
          setState("login");
        } else if (result.passwordRequired) {
          setState("password");
        } else if (result.approvalRequired) {
          setState("approval");
        } else {
          setState("decrypting");
        }
      })
      .catch(() => setState("unavailable"));
    return () => referrerMeta.remove();
  }, [accessToken, capsuleId]);

  const open = useCallback(async () => {
    if (openedRef.current || !metadata) return;
    openedRef.current = true;
    setState("decrypting");
    setPasswordError(null);
    try {
      const response = core
        ? await core.openCapsule(capsuleId, {
            ...(password ? { password } : {}),
            ...(approvalToken ? { approvalToken } : {}),
          })
        : await publicApi.current.post<CapsuleOpenResponseDto>(
            `/capsules/${encodeURIComponent(capsuleId)}/open`,
            { ...(password ? { password } : {}) },
          );
      const fragment = sessionStorage.getItem(`okkey:capsule-key:${capsuleId}`);
      if (!fragment) throw new Error("missing key");
      const { decodeCapsuleKeyFragment } = await import("@okkey/crypto");
      const capsuleKey = decodeCapsuleKeyFragment(fragment);
      try {
        const decrypted = await decryptCapsulePayload(capsuleKey, blobToBytes(response.encryptedPayload));
        setPayload(JSON.parse(new TextDecoder().decode(decrypted)));
        if (response.filePayload) {
          setFileBytes(await decryptCapsulePayload(capsuleKey, blobToBytes(response.filePayload)));
        }
      } finally {
        capsuleKey.fill(0);
      }
      setState("content");
    } catch (cause) {
      openedRef.current = false;
      const message = cause instanceof Error ? cause.message : "";
      if (message.includes("PASSWORD")) {
        setPasswordError(message.includes("ATTEMPTS") ? "Лимит попыток исчерпан" : "Неверный пароль");
        setState("password");
      } else if (message.includes("APPROVAL")) {
        setState("approval");
      } else {
        setState("unavailable");
      }
    }
  }, [approvalToken, capsuleId, core, metadata, password]);

  useEffect(() => {
    if (state === "decrypting") void open();
  }, [open, state]);

  useEffect(() => {
    if (state !== "waiting" || !approvalRequestId || !core) return;
    const timer = window.setInterval(() => {
      void core.getCapsuleApprovalStatus(approvalRequestId).then((result) => {
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
  }, [approvalRequestId, core, metadata?.passwordRequired, state]);

  const requestApproval = async () => {
    if (!core) {
      setState("login");
      return;
    }
    const result = await core.requestCapsuleApproval(capsuleId, {
      deviceLabel: navigator.userAgent,
      platform: navigator.platform,
    });
    setApprovalRequestId(result.requestId);
    setState("waiting");
  };

  const returnUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);

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

        {state === "loading" || state === "decrypting" ? <Centered><Spinner />Расшифровка…</Centered> : null}
        {state === "unavailable" ? <Centered>Капсула недоступна, не активирована или срок её действия закончился.</Centered> : null}
        {state === "login" ? (
          <Centered>
            Для просмотра этой капсулы войдите в Okkey.
            <Button asChild>
              <Link
                to={`/auth/email?returnTo=${returnUrl}`}
                onClick={() => storeCapsuleReturnUrl(`${window.location.pathname}${window.location.search}`)}
              >
                Войти
              </Link>
            </Button>
          </Centered>
        ) : null}
        {state === "password" ? (
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void open(); }}>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <LockKeyholeIcon className="size-5" />Пароль
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
            </label>
            {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
            <Button type="submit" disabled={!password}>Разблокировать</Button>
          </form>
        ) : null}
        {state === "approval" ? <Centered>Владелец должен подтвердить показ.<Button onClick={() => void requestApproval()}>Показать</Button></Centered> : null}
        {state === "waiting" ? <Centered><Spinner />Ожидание подтверждения владельца…</Centered> : null}
        {state === "denied" ? <Centered>Владелец запретил показ этой капсулы.</Centered> : null}
        {state === "content" ? <CapsuleContent payload={payload} fileBytes={fileBytes} /> : null}
      </section>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

function CapsuleContent({ payload, fileBytes }: { payload: unknown; fileBytes: Uint8Array | null }) {
  if (!payload || typeof payload !== "object") return <p>Пустая капсула</p>;
  const data = payload as { type?: string; text?: string; name?: string; item?: ItemPlaintextV2 };
  if (data.type === "text") return <pre className="whitespace-pre-wrap break-words font-sans text-sm">{data.text}</pre>;
  if (data.type === "file" && fileBytes) {
    const download = () => {
      const url = URL.createObjectURL(new Blob([fileBytes]));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.name || "capsule-file";
      anchor.click();
      URL.revokeObjectURL(url);
    };
    return <Button onClick={download}><DownloadIcon data-icon="inline-start" />Скачать {data.name || "файл"}</Button>;
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
