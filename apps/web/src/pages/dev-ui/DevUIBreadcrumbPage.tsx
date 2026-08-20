import {
  Breadcrumb,
  BreadcrumbBar,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@okkey/ui";

export default function DevUIBreadcrumbPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Breadcrumb</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Page trail for workspace shells (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">BreadcrumbBar</code> +{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Breadcrumb*</code> from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code>). Links use ghost
            chip styling; the current page is static text. Compose with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">asChild</code> + router{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Link</code> in app code.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
          <BreadcrumbBar className="flex">
            <Breadcrumb aria-label="Example breadcrumbs">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#workspace" title="Okkey team">
                    <span className="truncate">Okkey team</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="#settings" title="Workspace settings">
                    <span className="truncate">Workspace settings</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage title="General">General</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </BreadcrumbBar>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
          <BreadcrumbBar className="flex">
            <Breadcrumb aria-label="Capsules breadcrumbs">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#workspace" title="Okkey team">
                    <span className="truncate">Okkey team</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage title="Capsules">Capsules</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </BreadcrumbBar>
        </div>
      </section>
    </div>
  );
}
