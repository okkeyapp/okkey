import { getWebLocaleNativeName, READY_WEB_LOCALES, type WebLocale } from "@okkey/i18n";
import {
  authShellCenteredCardClassName,
  authShellRootClassName,
  authShellScrollClassName,
  cn,
  safeAreaPaddingClassName,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@okkey/ui";
import type { ReactNode } from "react";

import { useLocale } from "../../locale/LocaleContext";
import { BodyGradient } from "../BodyGradient";

export type AppShellLayoutProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /**
   * Auth bootstrap: hide header/footer and center `children` in the viewport.
   * Use for the first-paint loader, then render the normal shell with content.
   */
  busy?: boolean;
  /** Logo mark above the title */
  logo?: ReactNode;
  /** Absolute top-left chrome (e.g. back link on legal pages). */
  topLeft?: ReactNode;
  /** Footer line; default uses i18n `web.shell.copyright` */
  copyright?: string;
  /** Max width for header + main column (e.g. wide row of cards). */
  contentClassName?: string;
  /** Horizontal padding around the content column (outside max-width). Default: px-10. */
  frameClassName?: string;
  /** Extra classes for the title/description header. */
  headerClassName?: string;
  /** Extra classes for the main slot wrapper. */
  childrenClassName?: string;
};

export default function AppShellLayout({
  title,
  description,
  children,
  logo,
  topLeft,
  copyright,
  contentClassName,
  frameClassName,
  headerClassName,
  childrenClassName,
  busy = false,
}: AppShellLayoutProps) {
  const { locale, setLocale, t } = useLocale();

  const resolvedCopyright =
    copyright ?? t("web.shell.copyright", { year: new Date().getFullYear() });

  return (
    // h-dvh flex column: flex-1 scrollport gets a definite height; card uses my-auto
    // so it centers when short and stays top-reachable when taller than the viewport.
    <div
      className={cn(
        "relative isolate max-w-[100vw] overflow-x-hidden bg-background text-foreground",
        authShellRootClassName,
        safeAreaPaddingClassName,
      )}
    >
      <BodyGradient />

      {topLeft != null ? <div className="absolute left-4 top-10 z-10 sm:left-10">{topLeft}</div> : null}

      {busy ? null : (
        <div className="absolute right-4 top-10 z-10 sm:right-10">
          <Select value={locale} onValueChange={(v) => setLocale(v as WebLocale)} variant="inline">
            <SelectTrigger aria-label={t("web.shell.language.ariaLabel")} className="text-sm font-medium text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {READY_WEB_LOCALES.map((code) => (
                <SelectItem key={code} value={code}>
                  {getWebLocaleNativeName(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div
        className={cn(
          authShellScrollClassName,
          busy ? "px-4 py-10 sm:px-10" : "py-10 pb-20",
          !busy && (frameClassName ?? "px-4 sm:px-10"),
        )}
        data-testid="app-shell-scroll"
      >
        {busy ? (
          <div
            className={cn(authShellCenteredCardClassName, childrenClassName)}
            data-testid="app-shell-card"
            role="status"
            aria-busy="true"
          >
            {children}
          </div>
        ) : (
          <div
            className={cn(authShellCenteredCardClassName, "gap-6", contentClassName ?? "max-w-sm")}
            data-testid="app-shell-card"
          >
            <header
              className={cn("flex w-full flex-col items-center gap-2 text-center", headerClassName)}
            >
              {logo != null ? <div className="mb-2 shrink-0">{logo}</div> : null}
              <h1 data-testid="app-shell-title" className="okkey-heading-xl w-full text-center">
                {title}
              </h1>
              {description != null && description !== "" ? (
                <p className="okkey-body text-center text-copy-secondary">{description}</p>
              ) : null}
            </header>

            <div className={cn("w-full", childrenClassName)}>{children}</div>
          </div>
        )}
      </div>

      {busy ? null : (
        <footer className="pointer-events-none absolute inset-x-0 bottom-8 okkey-body px-4 text-center text-copy-secondary sm:px-10">
          {resolvedCopyright}
        </footer>
      )}

      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
        aria-hidden
      />
    </div>
  );
}
