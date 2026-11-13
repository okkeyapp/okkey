import { useEffect, useMemo, useRef, useState } from "react";
import { formatWebMessage, type WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button } from "@okkey/ui";

import { applyExtensionStoredTheme } from "../../lib/applyExtensionTheme";
import {
  HTTP_AUTH_DECISION,
  HTTP_AUTH_PORT_PREFIX,
  HTTP_AUTH_READY,
  parseHttpAuthPromptResponse,
  type HttpAuthPromptView,
} from "../../lib/httpAuthMessages";
import { loadExtensionLocale, readStoredExtensionLocale } from "../../lib/locale";

type Phase = "loading" | "choose" | "http-warning" | "gone";

export function HttpAuthPromptApp() {
  const [locale, setLocale] = useState(readStoredExtensionLocale);
  const t = useMemo(
    () => (key: string, values?: WebMessageValues) => formatWebMessage(locale, key, values ?? {}),
    [locale],
  );
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<HttpAuthPromptView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const challengeIdRef = useRef("");
  const decidedRef = useRef(false);

  useEffect(() => {
    void applyExtensionStoredTheme();
    void loadExtensionLocale().then(setLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("extension.httpAuth.prompt.documentTitle");
  }, [locale, t]);

  useEffect(() => {
    const challengeId = new URLSearchParams(window.location.search).get("challenge")?.trim() ?? "";
    challengeIdRef.current = challengeId;
    if (!challengeId) {
      setPhase("gone");
      return;
    }
    try {
      browser.runtime.connect({ name: `${HTTP_AUTH_PORT_PREFIX}${challengeId}` });
    } catch {
      setPhase("gone");
      return;
    }
    let cancelled = false;
    void browser.runtime
      .sendMessage({ type: HTTP_AUTH_READY, challengeId })
      .then((response: unknown) => {
        if (cancelled) {
          return;
        }
        const prompt = parseHttpAuthPromptResponse(response);
        if (!prompt) {
          setPhase("gone");
          return;
        }
        setView(prompt);
        setSelectedId(prompt.items.length === 1 ? (prompt.items[0]?.itemId ?? null) : null);
        setPhase("choose");
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("gone");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendDecision(body: {
    outcome: "decline" | "confirm";
    itemId?: string;
    insecureHttpConfirmed?: boolean;
  }): Promise<void> {
    if (decidedRef.current) {
      return;
    }
    decidedRef.current = true;
    const challengeId = challengeIdRef.current;
    try {
      await browser.runtime.sendMessage({
        type: HTTP_AUTH_DECISION,
        challengeId,
        outcome: body.outcome,
        ...(body.itemId ? { itemId: body.itemId } : {}),
        insecureHttpConfirmed: body.insecureHttpConfirmed === true,
      });
    } catch {
      // The service worker may already have closed this window.
    }
    window.close();
  }

  function onConfirm(): void {
    if (!view || !selectedId) {
      return;
    }
    if (view.insecureHttp) {
      setPhase("http-warning");
      return;
    }
    void sendDecision({
      outcome: "confirm",
      itemId: selectedId,
      insecureHttpConfirmed: false,
    });
  }

  if (phase === "loading") {
    return (
      <main className="flex h-full w-full items-center justify-center bg-background p-4 text-sm text-muted-foreground">
        {t("extension.httpAuth.prompt.loading")}
      </main>
    );
  }

  if (phase === "gone" || !view) {
    return (
      <main className="flex h-full w-full flex-col justify-between bg-background p-4 text-foreground">
        <p className="text-sm leading-5">{t("extension.httpAuth.prompt.unavailable")}</p>
        <Button type="button" variant="secondary" onClick={() => window.close()}>
          {t("extension.httpAuth.prompt.close")}
        </Button>
      </main>
    );
  }

  if (phase === "http-warning") {
    return (
      <main className="flex h-full w-full flex-col bg-background text-foreground">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Alert variant="warning">
            <AlertTitle>{t("extension.httpAuth.prompt.httpWarningTitle")}</AlertTitle>
            <AlertDescription>{t("extension.httpAuth.prompt.httpWarningBody")}</AlertDescription>
          </Alert>
          <p className="break-all font-mono text-sm">{view.origin}</p>
        </div>
        <footer className="flex gap-2 border-t border-border p-4">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setPhase("choose")}>
            {t("extension.httpAuth.prompt.httpWarningBack")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1 whitespace-normal"
            onClick={() => {
              if (!selectedId) {
                return;
              }
              void sendDecision({
                outcome: "confirm",
                itemId: selectedId,
                insecureHttpConfirmed: true,
              });
            }}
          >
            {t("extension.httpAuth.prompt.httpWarningConfirm")}
          </Button>
        </footer>
      </main>
    );
  }

  return (
    <main className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold leading-6">{t("extension.httpAuth.prompt.title")}</h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{t("extension.httpAuth.prompt.body")}</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("extension.httpAuth.prompt.originLabel")}</p>
          <p className="mt-1 break-all font-mono text-sm">{view.origin}</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-muted-foreground">
            {t("extension.httpAuth.prompt.chooseItem")}
          </legend>
          {view.items.map((item) => {
            const checked = selectedId === item.itemId;
            return (
              <label
                key={item.itemId}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2"
              >
                <input
                  type="radio"
                  name="http-auth-item"
                  className="mt-1"
                  checked={checked}
                  onChange={() => setSelectedId(item.itemId)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                    {t("extension.httpAuth.prompt.username")}: {item.username}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
      <footer className="flex gap-2 border-t border-border p-4">
        <Button type="button" variant="secondary" className="flex-1" onClick={() => void sendDecision({ outcome: "decline" })}>
          {t("extension.httpAuth.prompt.decline")}
        </Button>
        <Button type="button" className="flex-1" disabled={!selectedId} onClick={onConfirm}>
          {t("extension.httpAuth.prompt.confirm")}
        </Button>
      </footer>
    </main>
  );
}
