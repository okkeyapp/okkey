import type { WorkspaceProfileSummary } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, cn } from "@okkey/ui";
import { useState, type ReactNode } from "react";

type ProfilesListCardProps = {
  profiles: readonly WorkspaceProfileSummary[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onProfileClick?: (profile: WorkspaceProfileSummary) => void;
  /** Renders below the list as a full-width secondary button (e.g. "+ Create profile"). */
  footerAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  renderTrailing?: (profile: WorkspaceProfileSummary) => ReactNode;
  className?: string;
};

function applicationCountLabel(count: number | undefined, t: ProfilesListCardProps["t"]): string {
  const safeCount = typeof count === "number" && Number.isFinite(count) ? count : 0;
  return t("web.workspaceSettings.profiles.applicationCount", { count: safeCount });
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

export default function ProfilesListCard({
  profiles,
  t,
  onProfileClick,
  footerAction,
  renderTrailing,
  className,
}: ProfilesListCardProps) {
  const [focusedProfileId, setFocusedProfileId] = useState<string | null>(null);

  if (profiles.length === 0) {
    return null;
  }

  const lastIndex = profiles.length - 1;

  return (
    <div className={cn("flex flex-col gap-4 px-px", className)}>
      <div>
        {profiles.map((profile, index) => {
          const content = (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <p className="truncate text-sm font-medium leading-5 text-foreground">{profile.name}</p>
                <p className="truncate text-sm leading-5 text-muted-foreground">{profile.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm leading-5 text-muted-foreground">
                  {applicationCountLabel(profile.applicationCount, t)}
                </span>
                {renderTrailing?.(profile)}
              </div>
            </>
          );

          const isFirst = index === 0;
          const isLast = index === lastIndex;
          const isFocused = onProfileClick != null && focusedProfileId === profile.id;
          const rowClassName = cn(
            "relative -mt-px flex h-[78px] w-full items-center gap-4 border border-border px-4 text-left outline-none",
            "transition-[color,box-shadow,background-color,border-color]",
            isFirst && "mt-0",
            isFirst && isLast && "rounded-lg",
            isFirst && !isLast && "rounded-t-lg",
            isLast && !isFirst && "rounded-b-lg",
            onProfileClick && "cursor-pointer hover:bg-secondary",
            isFocused && [
              "z-10 bg-secondary",
              "!border-accent",
              "shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
            ],
          );

          if (onProfileClick) {
            return (
              <button
                key={profile.id}
                type="button"
                className={rowClassName}
                onClick={() => onProfileClick(profile)}
                onFocus={() => setFocusedProfileId(profile.id)}
                onBlur={() =>
                  setFocusedProfileId((current) => (current === profile.id ? null : current))
                }
              >
                {content}
              </button>
            );
          }

          return (
            <div key={profile.id} className={rowClassName}>
              {content}
            </div>
          );
        })}
      </div>

      {footerAction ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full gap-1 font-medium"
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
