import { cn } from "@okkey/ui";

/** Shared segmented-control tab chrome (matches Generator / Import tools). */
export function settingsSegmentedTabClassName(active: boolean): string {
  return cn(
    "relative min-w-0 shrink gap-2 overflow-hidden border",
    active
      ? cn(
          "z-10",
          "!bg-background hover:!bg-background active:!bg-background",
          "hover:!border-input focus:!border-input focus-visible:!border-input",
          "focus:hover:!border-input focus-visible:hover:!border-input",
          "!shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          "focus:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          "focus:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          "dark:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
          "dark:focus:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
          "dark:focus:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
        )
      : cn(
          "z-0 border-transparent shadow-none",
          "hover:border-transparent hover:bg-foreground/5",
          "focus:shadow-none focus-visible:shadow-none",
          "dark:focus:shadow-none dark:focus-visible:shadow-none",
          "focus:bg-foreground/10 focus-visible:bg-foreground/10",
          "active:bg-foreground/10",
        ),
  );
}
