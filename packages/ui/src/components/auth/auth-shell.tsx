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
  /**
   * Extension popup layout: fill host and vertically center content (scroll only if overflow).
   * Web auth uses `AppShellLayout` instead — do not change default (`false`) behavior for web.
   */
  compact?: boolean;
  /** Hide title/description header block (e.g. loading-only). */
  hideHeader?: boolean;
  className?: string;
};

function AuthHeader({
  title,
  description,
  logo,
  hideHeader,
  headerClassName,
}: {
  title?: string;
  description?: ReactNode;
  logo?: ReactNode;
  hideHeader: boolean;
  headerClassName?: string;
}) {
  if (hideHeader) {
    return logo != null ? <div className="mb-2 shrink-0">{logo}</div> : null;
  }
  return (
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
  );
}

/**
 * Shared presentational shell. Web login/auth pages use `AppShellLayout` (apps/web) — not this.
 * Extension popup passes `compact` for the 600×450 layout.
 * Auth-callback (full tab) uses the non-compact path for viewport centering.
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
  // Non-compact (auth-callback tab): fill the viewport and center the column on both axes.
  // Avoid nested `min-h-0 flex-1` under `min-h-screen` only — that often fails to grow in
  // extension pages, leaving content top/left. Use an explicit full-height flex center.
  if (!compact) {
    return (
      <div
        className={cn(
          "relative isolate flex h-full min-h-dvh w-full flex-col overflow-x-hidden bg-background text-foreground",
          className,
        )}
      >
        <BodyGradient />

        {topLeft != null ? <div className="absolute left-10 top-10 z-10">{topLeft}</div> : null}
        {topRight != null ? <div className="absolute right-10 top-10 z-10">{topRight}</div> : null}

        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col items-center justify-center",
            frameClassName ?? "px-10 py-10",
          )}
        >
          <div className={cn("flex w-full flex-col items-center gap-6", contentClassName ?? "max-w-sm")}>
            <AuthHeader
              title={title}
              description={description}
              logo={logo}
              hideHeader={hideHeader}
              headerClassName={headerClassName}
            />
            {children != null ? <div className={cn("w-full", childrenClassName)}>{children}</div> : null}
            {copyright ? (
              <footer className="okkey-body w-full text-center text-xs text-muted-foreground">{copyright}</footer>
            ) : null}
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
          aria-hidden
        />
      </div>
    );
  }

  // Compact (extension): fill host, vertically center content (same flex pattern as web AppShellLayout).
  return (
    <div
      className={cn(
        "relative isolate flex h-full min-h-0 w-full flex-col overflow-x-hidden bg-background text-foreground",
        className,
      )}
    >
      <BodyGradient />

      {topLeft != null ? <div className="absolute left-4 top-4 z-10">{topLeft}</div> : null}
      {topRight != null ? <div className="absolute right-4 top-4 z-10">{topRight}</div> : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div
            className={cn(
              "flex min-h-full flex-1 flex-col items-center justify-center",
              frameClassName ?? "px-6 py-6",
            )}
          >
            <div className={cn("flex w-full flex-col items-center gap-6", contentClassName ?? "max-w-[340px]")}>
              <AuthHeader
                title={title}
                description={description}
                logo={logo}
                hideHeader={hideHeader}
                headerClassName={headerClassName}
              />
              {children != null ? <div className={cn("w-full", childrenClassName)}>{children}</div> : null}
              {copyright ? (
                <footer className="okkey-body w-full text-center text-xs text-muted-foreground">{copyright}</footer>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
        aria-hidden
      />
    </div>
  );
}
