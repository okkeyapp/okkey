import { cn } from "@okkey/ui";
import type { ReactNode } from "react";

export type AppShellLayoutProps = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  /** Logo mark above the title */
  logo?: ReactNode;
  /** Footer line; default includes current year */
  copyright?: string;
  /** Max width for header + main column (e.g. wide row of cards). */
  contentClassName?: string;
};

const defaultCopyright = () =>
  `Okkey © ${new Date().getFullYear()} — your trusted password manager`;

export default function AppShellLayout({
  title,
  description,
  children,
  logo,
  copyright = defaultCopyright(),
  contentClassName,
}: AppShellLayoutProps) {
  return (
    <div className="relative isolate min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 dark:hidden"
        style={{
          backgroundImage:
            "linear-gradient(136.85deg, rgba(255, 248, 239, 0) 8.44%, rgb(255, 248, 239) 91.56%), linear-gradient(180deg, rgb(234, 240, 250) 0%, rgb(242, 255, 252) 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 hidden bg-gradient-to-b from-secondary/80 via-background to-background dark:block"
        aria-hidden
      />

      <div className="relative flex min-h-screen flex-col px-10 py-10">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-6">
          <div className={cn("flex w-full flex-col items-center gap-6", contentClassName ?? "max-w-sm")}>
            <header className="flex w-full flex-col items-center gap-2 text-center">
              {logo != null ? <div className="mb-2 shrink-0">{logo}</div> : null}
              <h1 data-testid="app-shell-title" className="okkey-heading-xl w-full text-center">
                {title}
              </h1>
              <p className="okkey-body text-center text-copy-secondary">{description}</p>
            </header>

            <div className="w-full">{children}</div>
          </div>
        </div>

        <footer className="okkey-body mt-8 shrink-0 text-center text-copy-secondary">
          {copyright}
        </footer>
      </div>

      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]"
        aria-hidden
      />
    </div>
  );
}
