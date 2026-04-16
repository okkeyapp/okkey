import { WorkspaceTile } from "@okkey/ui";

import { DEV_UI_YANDEX_FAVICON } from "./devUiConstants";

export default function DevUIWorkspaceTilePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Workspace tile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5 text-xs">tileColor</code> fills the personal-workspace SVG;{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">imageSrc</code> overrides it and shows an image;{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">business</code> adds the briefcase badge at the
            bottom-right.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
          <div className="flex flex-wrap items-start justify-center gap-4">
            <WorkspaceTile type="button" title="Personal" description="Free" tileColor="#3B82F6" />
            <WorkspaceTile type="button" title="Custom color" description="tileColor (#10B981)" tileColor="#10B981" />
            <WorkspaceTile
              type="button"
              title="Yandex team"
              description="Enterprise"
              imageSrc={DEV_UI_YANDEX_FAVICON}
              imageAlt=""
              business
            />
            <WorkspaceTile type="button" title="Image only" description="No business badge" imageSrc={DEV_UI_YANDEX_FAVICON} imageAlt="" />
          </div>
        </div>
      </section>
    </div>
  );
}
