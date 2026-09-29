import type { ReactNode } from "react";

import { cn } from "../../lib/utils.js";
import { ScrollArea } from "../ui/scroll-area.js";
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
   * Extension popup layout: ScrollArea fills host; paddings + content + footer scroll together.
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
  // Non-compact: match historical web AppShellLayout (vertical center + footer outside scroll).
  if (!compact) {
    return (
      <div
        className={cn(
          "relative isolate min-h-screen overflow-x-hidden bg-background text-foreground",
          className,
        )}
      >
        <BodyGradient />

        {topLeft != null ? <div className="absolute left-10 top-10 z-10">{topLeft}</div> : null}
        {topRight != null ? <div className="absolute right-10 top-10 z-10">{topRight}</div> : null}

        <div className="relative flex min-h-screen flex-col py-10">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col items-center justify-center py-6",
                frameClassName ?? "px-10",
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
              </div>
            </div>
          </div>

          {copyright ? (
            <footer className="okkey-body mt-8 shrink-0 px-10 text-center text-xs text-muted-foreground">
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

  // Compact (extension popup): full-height ScrollArea; only language chrome floats; footer in-flow.
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

      <ScrollArea
        className={cn(
          "relative min-h-0 h-full w-full flex-1",
          "[&>[data-radix-scroll-area-viewport]]:h-full",
          "[&>[data-radix-scroll-area-viewport]>div]:!min-h-full",
          "[&>[data-radix-scroll-area-viewport]>div]:!block",
        )}
      >
        <div className={cn("flex min-h-full flex-col items-center", frameClassName ?? "px-6 py-6")}>
          <div className="flex w-full flex-1 flex-col items-center justify-center py-4">
            <div className={cn("flex w-full flex-col items-center gap-6", contentClassName ?? "max-w-[340px]")}>
              <AuthHeader
                title={title}
                description={description}
                logo={logo}
                hideHeader={hideHeader}
                headerClassName={headerClassName}
              />
              {children != null ? <div className={cn("w-full", childrenClassName)}>{children}</div> : null}
            </div>
          </div>

          {copyright ? (
            <footer className="okkey-body mt-4 w-full shrink-0 text-center text-xs text-muted-foreground">
              {copyright}
            </footer>
          ) : null}
        </div>
      </ScrollArea>

      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
        aria-hidden
      />
    </div>
  );
}
