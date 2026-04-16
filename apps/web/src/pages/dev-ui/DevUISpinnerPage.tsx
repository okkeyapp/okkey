import { Spinner } from "@okkey/ui";

export default function DevUISpinnerPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Spinner</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Indeterminate loader (<code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code>
            ). Track: <code className="rounded bg-muted px-1 py-0.5 text-xs">muted-foreground / 20%</code>; arc:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">accent</code> (opaque), 25% of the ring.{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">size=&quot;small&quot;</code> 24×24px / 2px stroke,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">default</code> 36×36px / 3px,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">large</code> 48×48px / 4px (stroke scales via 24px
            viewBox).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-8 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-[24px] w-[24px] items-center justify-center">
              <Spinner size="small" />
            </div>
            <span className="text-xs text-muted-foreground">small · 24px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-[36px] w-[36px] items-center justify-center">
              <Spinner size="default" />
            </div>
            <span className="text-xs text-muted-foreground">default · 36px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-[48px] w-[48px] items-center justify-center">
              <Spinner size="large" />
            </div>
            <span className="text-xs text-muted-foreground">large · 48px</span>
          </div>
        </div>
      </section>
    </div>
  );
}
