/**
 * Shared layout helpers for account settings sections (General, Vault, …).
 */
import { cn } from "@okkey/ui";
import type { ReactNode } from "react";

export function SettingsRow({
  label,
  description,
  children,
  border = true,
  controlClassName,
  stackOnMobile = true,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  border?: boolean;
  controlClassName?: string;
  stackOnMobile?: boolean;
}) {
  return (
    <div className={cn("py-4", border && "border-t border-border")}>
      <div
        className={cn(
          "flex items-center gap-3",
          stackOnMobile && "max-md:flex-col max-md:items-stretch",
        )}
      >
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-sm font-medium leading-5 text-foreground">{label}</p>
          {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        <div
          className={cn(
            "flex min-h-12 w-[250px] shrink-0 items-center justify-end",
            stackOnMobile ? "max-md:w-full" : "max-md:w-auto",
            controlClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function SettingsSectionDivider() {
  return <div className="my-2 h-2 rounded-full bg-secondary" aria-hidden />;
}

export function SettingsSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-3 text-base font-medium leading-7 text-muted-foreground">{children}</h3>
  );
}
