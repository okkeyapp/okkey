import { Button } from "@okkey/ui";

import { DEV_UI_ICON_BUTTON_VARIANTS } from "./devUiConstants";
import { SettingsGearIcon } from "./DevUiIcons";

export default function DevUIButtonPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Button</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Standard shadcn/ui variants and sizes from <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code> (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">default</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">sm</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">lg</code>).
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <h3 className="text-sm font-medium text-muted-foreground">Default size</h3>
          <div className="flex flex-wrap gap-3">
            <Button type="button">Primary</Button>
            <Button type="button" variant="secondary">
              Secondary
            </Button>
            <Button type="button" variant="outline">
              Outline
            </Button>
            <Button type="button" variant="ghost">
              Ghost
            </Button>
            <Button type="button" variant="destructive">
              Destructive
            </Button>
            <Button type="button" variant="link">
              Link
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <h3 className="text-sm font-medium text-muted-foreground">Small size</h3>
          <div className="flex flex-wrap gap-3">
            <Button type="button" size="sm">
              Primary
            </Button>
            <Button type="button" size="sm" variant="secondary">
              Secondary
            </Button>
            <Button type="button" size="sm" variant="outline">
              Outline
            </Button>
            <Button type="button" size="sm" variant="ghost">
              Ghost
            </Button>
            <Button type="button" size="sm" variant="destructive">
              Destructive
            </Button>
            <Button type="button" size="sm" variant="link">
              Link
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <h3 className="text-sm font-medium text-muted-foreground">Icon sizes (any variant)</h3>
          <p className="text-xs text-muted-foreground">
            Use <code className="rounded bg-muted px-1 py-0.5">size=&quot;icon&quot;</code> (36px),{" "}
            <code className="rounded bg-muted px-1 py-0.5">iconSm</code> (32px), or{" "}
            <code className="rounded bg-muted px-1 py-0.5">iconLg</code> (44px) with{" "}
            <code className="rounded bg-muted px-1 py-0.5">variant</code>{" "}
            <code className="rounded bg-muted px-1 py-0.5">default</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5">secondary</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5">outline</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5">ghost</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5">destructive</code>.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {DEV_UI_ICON_BUTTON_VARIANTS.map((v) => (
                <Button key={`icon-${v}`} type="button" variant={v} size="icon" aria-label={`${v} icon`}>
                  <SettingsGearIcon className="size-4" />
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {DEV_UI_ICON_BUTTON_VARIANTS.map((v) => (
                <Button key={`iconsm-${v}`} type="button" variant={v} size="iconSm" aria-label={`${v} icon small`}>
                  <SettingsGearIcon className="size-[14px]" />
                </Button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Next for 7.4: remaining primitives via{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">apps/web/components.json</code>.
        </p>
      </section>
    </div>
  );
}
