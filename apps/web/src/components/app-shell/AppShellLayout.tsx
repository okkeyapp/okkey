import { getWebLocaleNativeName, WEB_LOCALES, type WebLocale } from "@okkey/i18n";
import { cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@okkey/ui";
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
    <div className="relative isolate min-h-dvh min-h-screen overflow-x-hidden bg-background text-foreground">
      <BodyGradient />

      {topLeft != null ? <div className="absolute left-10 top-10 z-10">{topLeft}</div> : null}

      {busy ? null : (
        <div className="absolute right-10 top-10 z-10">
          <Select value={locale} onValueChange={(v) => setLocale(v as WebLocale)} variant="inline">
            <SelectTrigger aria-label={t("web.shell.language.ariaLabel")} className="text-sm font-medium text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEB_LOCALES.map((code) => (
                <SelectItem key={code} value={code}>
                  {getWebLocaleNativeName(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="relative flex min-h-dvh min-h-screen flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className={cn(
              "flex min-h-full flex-1 flex-col items-center justify-center",
              busy ? "px-10 py-10" : "py-10 pb-20",
              !busy && (frameClassName ?? "px-10"),
            )}
          >
            {busy ? (
              <div
                className={cn("flex w-full flex-col items-center justify-center", childrenClassName)}
                role="status"
                aria-busy="true"
              >
                {children}
              </div>
            ) : (
              <div className={cn("flex w-full flex-col items-center gap-6", contentClassName ?? "max-w-sm")}>
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
        </div>

        {busy ? null : (
          <footer className="pointer-events-none absolute inset-x-0 bottom-8 okkey-body px-10 text-center text-copy-secondary">
            {resolvedCopyright}
          </footer>
        )}
      </div>

      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
        aria-hidden
      />
    </div>
  );
}
