/**
 * Shared surface styles for single-line controls (Input, Select trigger, etc.).
 * Matches outline-style field: border, shadow, hover border, focus ring.
 */
export const inputLikeControlClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition-[color,box-shadow,border-color] " +
  "shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(255,255,255,0.05)] " +
  "placeholder:text-muted-foreground " +
  "hover:border-[hsl(var(--foreground)_/_0.22)] hover:shadow-none dark:hover:border-[hsl(var(--foreground)_/_0.28)] " +
  "focus:bg-background focus-visible:bg-background active:bg-background " +
  "focus:outline-none focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "dark:focus:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "focus:hover:border-accent focus-visible:hover:border-accent dark:focus:hover:border-accent dark:focus-visible:hover:border-accent " +
  "focus:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "dark:focus:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-visible:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] " +
  "focus:border-accent focus-visible:border-accent " +
  "disabled:cursor-not-allowed disabled:opacity-50";
