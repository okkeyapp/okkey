import { Input } from "@okkey/ui";

export default function DevUIInputPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Input</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Base field styled like the <code className="rounded bg-muted px-1 py-0.5 text-xs">outline</code> button
            (background, border, shadow, height <code className="rounded bg-muted px-1 py-0.5 text-xs">h-9</code>),
            horizontal padding <code className="rounded bg-muted px-1 py-0.5 text-xs">12px</code>.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <div className="flex max-w-md flex-col gap-2">
            <label htmlFor="dev-ui-input-default" className="text-sm font-medium">
              Label
            </label>
            <Input id="dev-ui-input-default" type="text" placeholder="Placeholder" />
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <label htmlFor="dev-ui-input-disabled" className="text-sm font-medium text-muted-foreground">
              Disabled
            </label>
            <Input id="dev-ui-input-disabled" type="text" placeholder="Unavailable" disabled />
          </div>
        </div>
      </section>
    </div>
  );
}
