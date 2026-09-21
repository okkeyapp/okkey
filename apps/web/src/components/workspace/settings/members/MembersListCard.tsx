import type { WorkspaceMemberDto } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, cn } from "@okkey/ui";
import { useState } from "react";

import { localizedRoleLabel } from "../localizedWorkspaceLabels";
import { MemberFavicon, memberDisplayName } from "../vaults/vaultAccessHelpers";

type MembersListCardProps = {
  members: readonly WorkspaceMemberDto[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onMemberClick?: (member: WorkspaceMemberDto) => void;
  /** Renders below the list as a full-width secondary button (e.g. "+ Invite members"). */
  footerAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  className?: string;
};

function roleLabel(member: WorkspaceMemberDto, t: MembersListCardProps["t"]): string {
  return localizedRoleLabel(
    {
      builtinId: member.roleBuiltinKey,
      name: member.roleName?.trim() || t("web.workspaceSettings.members.roleUnknown"),
    },
    t,
  );
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

export default function MembersListCard({
  members,
  t,
  onMemberClick,
  footerAction,
  className,
}: MembersListCardProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  if (members.length === 0) {
    return null;
  }

  const lastIndex = members.length - 1;

  return (
    <div className={cn("flex flex-col gap-4 px-px", className)}>
      <div>
        {members.map((member, index) => {
          const rowKey = member.userId ?? member.invitationId ?? member.email;
          const isFirst = index === 0;
          const isLast = index === lastIndex;
          const clickable = Boolean(onMemberClick) && Boolean(member.userId || member.invitationId);
          const isFocused = clickable && focusedId === rowKey;
          const name = memberDisplayName(member);
          const showName = name.trim().length > 0 && name !== member.email;

          const rowClassName = cn(
            "relative -mt-px flex h-[78px] w-full items-center gap-4 border border-border px-4 text-left outline-none",
            "transition-[color,box-shadow,background-color,border-color]",
            isFirst && "mt-0",
            isFirst && isLast && "rounded-lg",
            isFirst && !isLast && "rounded-t-lg",
            isLast && !isFirst && "rounded-b-lg",
            clickable && "cursor-pointer hover:bg-secondary",
            isFocused && [
              "z-10 bg-secondary",
              "!border-accent",
              "shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
            ],
          );

          const content = (
            <>
              <MemberFavicon
                firstName={member.firstName}
                lastName={member.lastName}
                email={member.email}
                size={40}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <div className="flex min-w-0 items-center gap-2">
                  {showName ? (
                    <p className="truncate text-sm font-bold leading-5 text-foreground">{name}</p>
                  ) : null}
                  {member.status === "pending" ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-foreground px-2 text-xs font-normal leading-none text-background">
                      {t("web.workspaceSettings.members.pendingBadge")}
                    </span>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "truncate text-sm leading-5",
                    showName ? "font-normal text-muted-foreground" : "font-bold text-foreground",
                  )}
                >
                  {member.email}
                </p>
              </div>
              <span className="shrink-0 text-sm leading-5 text-muted-foreground">
                {roleLabel(member, t)}
              </span>
            </>
          );

          if (clickable) {
            return (
              <button
                key={rowKey}
                type="button"
                className={rowClassName}
                onClick={() => onMemberClick?.(member)}
                onFocus={() => setFocusedId(rowKey)}
                onBlur={() => setFocusedId((current) => (current === rowKey ? null : current))}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={rowKey} className={rowClassName}>
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
