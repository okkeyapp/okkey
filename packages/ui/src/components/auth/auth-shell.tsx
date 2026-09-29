import type { ReactNode } from "react";

import { cn } from "../../lib/utils.js";
import { BodyGradient } from "./body-gradient.js";

export type AuthShellLocaleOption = {
  value: string;
  label: string;
};

export type AuthShellProps = {
  title?: string;
  description?: ReactNode;
  children?: ReactNode;
  logo?: ReactNode;
  /** Absolute top-left chrome. */
  topLeft?: ReactNode;
  /** Absolute top-right chrome (language select). */
  topRight?: ReactNode;
  copyright?: string;
  contentClassName?: string;
  frameClassName?: string;
  headerClassName?: string;
  childrenClassName?: string;
  /** Fill the host (popup) instead of min-h-screen. */
  compact?: boolean;
  /** Hide title/description header block (e.g. loading-only). */
  hideHeader?: boolean;
  className?: string;
};

/**
 * Presentational auth/device shell shared by web and extension.
 * Host apps wire locale switcher into `topRight` (no router / locale context here).
 */
export function AuthShell({
  title,
  description,
  children,
  logo,
  topLeft,
  topRight,
  copyright,
  contentClassName,
  frameClassName,
  headerClassName,
  childrenClassName,
  compact = false,
  hideHeader = false,
  className,
}: AuthShellProps) {
  return (
    <div
      className={cn(
        "relative isolate overflow-x-hidden bg-background text-foreground",
        compact ? "flex h-full min-h-0 w-full flex-col" : "min-h-screen",
        className,
      )}
    >
      <BodyGradient />

      {topLeft != null ? <div className="absolute left-4 top-4 z-10 sm:left-10 sm:top-10">{topLeft}</div> : null}
      {topRight != null ? <div className="absolute right-4 top-4 z-10 sm:right-10 sm:top-10">{topRight}</div> : null}

      <div className={cn("relative flex flex-col py-6", compact ? "min-h-0 flex-1" : "min-h-screen py-10")}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col items-center justify-center py-4",
              frameClassName ?? (compact ? "px-6" : "px-10"),
            )}
          >
            <div className={cn("flex w-full flex-col items-center gap-6", contentClassName ?? "max-w-sm")}>
              {!hideHeader ? (
                <header className={cn("flex w-full flex-col items-center gap-2 text-center", headerClassName)}>
                  {logo != null ? <div className="mb-2 shrink-0">{logo}</div> : null}
                  {title ? (
                    <h1 data-testid="app-shell-title" className="okkey-heading-xl w-full text-center text-xl font-semibold">
                      {title}
                    </h1>
                  ) : null}
                  {description != null && description !== "" ? (
                    <p className="okkey-body text-center text-sm text-muted-foreground">{description}</p>
                  ) : null}
                </header>
              ) : logo != null ? (
                <div className="mb-2 shrink-0">{logo}</div>
              ) : null}

              {children != null ? <div className={cn("w-full", childrenClassName)}>{children}</div> : null}
            </div>
          </div>
        </div>

        {copyright ? (
          <footer className="okkey-body mt-4 shrink-0 px-6 text-center text-xs text-muted-foreground sm:px-10">
            {copyright}
          </footer>
        ) : null}
      </div>

      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
        aria-hidden
      />
    </div>
  );
}
