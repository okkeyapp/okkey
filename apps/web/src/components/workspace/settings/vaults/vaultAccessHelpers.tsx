import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Favicon,
  Input,
  cn,
} from "@okkey/ui";
import { useMemo, useState } from "react";

import { IconActions16, IconDelete16 } from "../../../items/itemCategoryIcons";

type VaultCardActionsMenuProps = {
  t: (key: string) => string;
  disabled?: boolean;
  onDelete: () => void;
  deleteLabel?: string;
};

export default function VaultCardActionsMenu({
  t,
  disabled = false,
  onDelete,
  deleteLabel,
}: VaultCardActionsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn(
            "shrink-0 gap-2",
            "max-md:!size-9 max-md:!min-h-9 max-md:!min-w-9 max-md:gap-0 max-md:rounded-md max-md:px-0",
          )}
          disabled={disabled}
          aria-label={t("web.items.list.actions")}
        >
          <span className="hidden md:inline">{t("web.items.list.actions")}</span>
          <IconActions16 className="size-4 shrink-0 text-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56 p-1">
        <DropdownMenuItem
          className="gap-2 text-destructive focus:text-destructive"
          onSelect={() => {
            setOpen(false);
            onDelete();
          }}
        >
          <IconDelete16 className="size-4" />
          {deleteLabel ?? t("web.workspaceSettings.vaults.deleteConfirm.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type AccessFilterValue = "all" | "with_access" | "without_access" | `profile:${string}`;

function displayNameFromEmail(email: string): string {
  const local = email.trim().split("@")[0]?.trim() ?? "";
  return local.length > 0 ? local : email.trim();
}

export function memberDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const parts = [input.firstName, input.lastName].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return displayNameFromEmail(input.email);
}

export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function MemberFavicon({
  firstName,
  lastName,
  email,
  size = 40,
  className,
}: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  size?: number;
  className?: string;
}) {
  const name = memberDisplayName({
    firstName: firstName ?? null,
    lastName: lastName ?? null,
    email,
  });
  return <Favicon name={name} size={size} className={className} />;
}

export function useFilteredMembers<
  T extends {
    userId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileId: string | null;
  },
>(members: readonly T[], query: string, filter: AccessFilterValue): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      const hasAccess = Boolean(member.profileId);
      if (filter === "with_access" && !hasAccess) {
        return false;
      }
      if (filter === "without_access" && hasAccess) {
        return false;
      }
      if (filter.startsWith("profile:")) {
        const profileId = filter.slice("profile:".length);
        if (member.profileId !== profileId) {
          return false;
        }
      }
      if (!q) {
        return true;
      }
      const haystack = `${member.firstName ?? ""} ${member.lastName ?? ""} ${member.email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [members, query, filter]);
}
