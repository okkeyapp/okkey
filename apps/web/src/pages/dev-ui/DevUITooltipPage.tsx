import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@okkey/ui";

export default function DevUITooltipPage() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="mx-auto max-w-4xl space-y-10">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Tooltip</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Radix <code className="rounded bg-muted px-1 py-0.5 text-xs">Tooltip</code> via shadcn-style primitives in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code>. Wrap feature areas with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">TooltipProvider</code> (here the page is wrapped for
              the demo). Surface is always high-contrast: <code className="rounded bg-muted px-1 py-0.5 text-xs">foreground</code>{" "}
              background, <code className="rounded bg-muted px-1 py-0.5 text-xs">background</code> text, no border, with
              arrow.
            </p>
          </div>

          <div className="space-y-6 rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline">
                    Hover or focus
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Short hint for the control.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Help">
                    ?
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Icon trigger with accessible name on the button.</TooltipContent>
              </Tooltip>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-muted-foreground">Placement (side)</p>
              <div className="flex flex-wrap gap-6">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="secondary" size="sm">
                      Top
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Opens above the trigger.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="secondary" size="sm">
                      Bottom
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Opens below the trigger.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="secondary" size="sm">
                      Left
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Opens to the left.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="secondary" size="sm">
                      Right
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Opens to the right.</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="link" className="h-auto p-0">
                  Longer content
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                Tooltips can wrap longer explanations. Keep copy concise in product UI; this block only illustrates max
                width and line wrapping inside the tooltip surface.
              </TooltipContent>
            </Tooltip>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}
