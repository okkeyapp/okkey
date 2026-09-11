import { Alert, AlertDescription, AlertTitle } from "@okkey/ui";

import { AlertErrorIcon, AlertInfoIcon, AlertWarningIcon } from "./DevUiIcons";

export default function DevUIAlertPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Alert</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            shadcn-style <code className="rounded bg-muted px-1 py-0.5 text-xs">Alert</code> with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">default</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">info</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">warning</code>, and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">error</code> variants (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code>).
          </p>
        </div>
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <Alert variant="default">
            <AlertInfoIcon className="size-4" />
            <AlertTitle>Note</AlertTitle>
            <AlertDescription>Default: neutral surface for tips or non-blocking context.</AlertDescription>
          </Alert>
          <Alert variant="info">
            <AlertInfoIcon className="size-4" />
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>Info: primary-tinted surface for informational notes.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertWarningIcon className="size-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>Something may need attention before you continue.</AlertDescription>
          </Alert>
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>An action failed or validation blocked progress.</AlertDescription>
          </Alert>
        </div>
      </section>
    </div>
  );
}
