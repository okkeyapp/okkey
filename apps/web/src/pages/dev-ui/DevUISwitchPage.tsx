import { useState } from "react";
import { Switch } from "@okkey/ui";

export default function DevUISwitchPage() {
  const [switchOn, setSwitchOn] = useState(true);
  const [switchOnLg, setSwitchOnLg] = useState(true);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Switch</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Radix-based toggle (shadcn/ui pattern,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@radix-ui/react-switch</code>).
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <div className="flex max-w-md items-center justify-between gap-4">
            <label htmlFor="dev-ui-switch" className="text-sm font-medium">
              Notifications (default)
            </label>
            <Switch id="dev-ui-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
          </div>
          <div className="flex max-w-md items-center justify-between gap-4">
            <label htmlFor="dev-ui-switch-lg" className="text-sm font-medium">
              Large (44×24px)
            </label>
            <Switch id="dev-ui-switch-lg" size="lg" checked={switchOnLg} onCheckedChange={setSwitchOnLg} />
          </div>
          <div className="flex max-w-md items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">Disabled (off)</span>
            <Switch disabled checked={false} aria-label="Disabled off" />
          </div>
          <div className="flex max-w-md items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">Disabled (on)</span>
            <Switch disabled checked aria-label="Disabled on" />
          </div>
        </div>
      </section>
    </div>
  );
}
