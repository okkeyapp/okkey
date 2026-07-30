import type { WorkspaceRoleSummary } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, cn } from "@okkey/ui";
import { useState, type ReactNode } from "react";

type RolesListCardProps = {
  roles: readonly WorkspaceRoleSummary[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onRoleClick?: (role: WorkspaceRoleSummary) => void;
  /** Renders below the list as a full-width secondary button (e.g. "+ Create role"). */
  footerAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  renderTrailing?: (role: WorkspaceRoleSummary) => ReactNode;
  className?: string;
};

function memberCountLabel(count: number, t: RolesListCardProps["t"]): string {
  return t("web.workspaceSettings.roles.memberCount", { count });
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path
        d="M3.33337 8H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function RolesListCard({
  roles,
  t,
  onRoleClick,
  footerAction,
  renderTrailing,
  className,
}: RolesListCardProps) {
  const [focusedRoleId, setFocusedRoleId] = useState<string | null>(null);

  if (roles.length === 0) {
    return null;
  }

  const lastIndex = roles.length - 1;

  return (
    <div className={cn("flex flex-col gap-4 px-px", className)}>
      <div className="rounded-lg border border-border">
        {roles.map((role, index) => {
          const content = (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">{role.name}</p>
                <p className="truncate text-sm text-muted-foreground">{role.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm text-muted-foreground">{memberCountLabel(role.memberCount, t)}</span>
                {renderTrailing?.(role)}
              </div>
            </>
          );

          const isLastRole = index === lastIndex;
          const isFocused = onRoleClick != null && focusedRoleId === role.id;
          const rowClassName = cn(
            "relative -mt-px flex w-full items-center gap-4 border border-x-transparent border-y-border px-4 py-4 text-left outline-none",
            "transition-[color,box-shadow,background-color,border-color]",
            index === 0 && "mt-0 rounded-t-lg border-t-transparent",
            isLastRole && "rounded-b-lg border-b-transparent",
            onRoleClick && "cursor-pointer hover:bg-secondary",
            isFocused && [
              "z-10 bg-secondary",
              "!border-accent",
              "shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
            ],
          );

          if (onRoleClick) {
            return (
              <button
                key={role.id}
                type="button"
                className={rowClassName}
                onClick={() => onRoleClick(role)}
                onFocus={() => setFocusedRoleId(role.id)}
                onBlur={() => setFocusedRoleId((current) => (current === role.id ? null : current))}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={role.id} className={rowClassName}>
              {content}
            </div>
          );
        })}
      </div>

      {footerAction ? (
        <Button
          type="button"
          variant="secondary"
          className="h-8 w-full gap-1 px-3 font-medium"
          onClick={footerAction.onClick}
          disabled={footerAction.disabled}
        >
          <PlusIcon className="size-4" />
          {footerAction.label}
        </Button>
      ) : null}
    </div>
  );
}
