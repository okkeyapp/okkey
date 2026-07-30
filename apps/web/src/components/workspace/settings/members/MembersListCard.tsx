import type { WorkspaceMemberDto } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";
import { useState } from "react";

import { memberDisplayName } from "../vaults/vaultAccessHelpers";

type MembersListCardProps = {
  members: readonly WorkspaceMemberDto[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onMemberClick?: (member: WorkspaceMemberDto) => void;
  onRevokeInvite?: (member: WorkspaceMemberDto) => void;
  className?: string;
};

function roleLabel(member: WorkspaceMemberDto, t: MembersListCardProps["t"]): string {
  if (member.roleBuiltinKey === "owner") {
    return t("web.workspaceSettings.roles.builtIn.owner");
  }
  if (member.roleBuiltinKey === "admin") {
    return t("web.workspaceSettings.roles.builtIn.admin");
  }
  if (member.roleBuiltinKey === "user") {
    return t("web.workspaceSettings.roles.builtIn.user");
  }
  return member.roleName?.trim() || t("web.workspaceSettings.members.roleUnknown");
}

export default function MembersListCard({
  members,
  t,
  onMemberClick,
  onRevokeInvite,
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
        const clickable = member.status === "active" && Boolean(member.userId) && onMemberClick;
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
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
              <div className="flex min-w-0 items-center gap-2">
                {showName ? (
                  <p className="truncate text-sm leading-5 text-muted-foreground">{name}</p>
                ) : null}
                {member.status === "pending" ? (
                  <span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
                    {t("web.workspaceSettings.members.pendingBadge")}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm font-medium leading-5 text-foreground">{member.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm leading-5 text-muted-foreground">
                {roleLabel(member, t)}
              </span>
              {member.status === "pending" && member.invitationId && onRevokeInvite ? (
                <button
                  type="button"
                  className="text-sm font-medium text-destructive hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRevokeInvite(member);
                  }}
                >
                  {t("web.workspaceSettings.members.invite.revoke")}
                </button>
              ) : null}
            </div>
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
