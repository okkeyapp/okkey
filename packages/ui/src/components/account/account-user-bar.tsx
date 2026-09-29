import type { ReactNode, SVGProps } from "react";

import { Button } from "../ui/button.js";
import { Favicon } from "../ui/favicon.js";

function LogOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

export type AccountUserBarProps = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  signOutLabel: string;
  onSignOut: () => void;
  /** Optional trailing control (defaults to sign-out button). */
  action?: ReactNode;
};

/**
 * Presentational account identity row (avatar / name / email / sign out).
 * Host apps supply profile fields — no router or auth context here.
 */
export function AccountUserBar({
  email = "",
  firstName = "",
  lastName = "",
  signOutLabel,
  onSignOut,
  action,
}: AccountUserBarProps) {
  const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const hasDisplayName = displayName.length > 0;
  const emailValue = email?.trim() ?? "";
  const faviconName = hasDisplayName ? displayName : emailValue || "?";

  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-border p-2">
      <Favicon name={faviconName} size={40} aria-hidden />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate okkey-small font-semibold text-copy-primary">
          {hasDisplayName ? displayName : emailValue || "—"}
        </p>
        {hasDisplayName && emailValue ? (
          <p className="truncate text-xs leading-4 text-copy-secondary">{emailValue}</p>
        ) : null}
      </div>
      {action ?? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5"
          onClick={onSignOut}
        >
          <LogOutIcon className="size-4" />
          {signOutLabel}
        </Button>
      )}
    </div>
  );
}
