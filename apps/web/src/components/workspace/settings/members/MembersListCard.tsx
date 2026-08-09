import type { WorkspaceMemberDto } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";
import { useState } from "react";

import { localizedRoleLabel } from "../localizedWorkspaceLabels";
import { MemberFavicon, memberDisplayName } from "../vaults/vaultAccessHelpers";

type MembersListCardProps = {
  members: readonly WorkspaceMemberDto[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onMemberClick?: (member: WorkspaceMemberDto) => void;
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

export default function MembersListCard({
  members,
  t,
  onMemberClick,
  className,
}: MembersListCardProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  if (members.length === 0) {
    return null;
  }

  const lastIndex = members.length - 1;

  return (
    <div className={cn("px-px", className)}>
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
                  <p className="truncate text-sm leading-5 text-muted-foreground">{name}</p>
                ) : null}
                {member.status === "pending" ? (
                  <span className="shrink-0 rounded-md bg-foreground px-2 py-0.5 text-xs font-normal leading-5 text-background">
                    {t("web.workspaceSettings.members.pendingBadge")}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm font-medium leading-5 text-foreground">{member.email}</p>
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
  );
}
