import { useState } from "react";
import {
  Button,
  buttonVariants,
  cn,
  ControlGroup,
  controlGroupItemFixedClassName,
  controlGroupItemGrowClassName,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@okkey/ui";

import { GALLERY_FRUITS } from "./devUiConstants";
import { MenuDeleteIcon, MenuEditIcon, MenuShareIcon, SettingsGearIcon } from "./DevUiIcons";

export default function DevUIControlGroupingPage() {
  const [controlGroupScope, setControlGroupScope] = useState<string[]>(["apple", "banana"]);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Control grouping</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Several buttons, fields, or selects on one row with no gap: shared outer{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">border-radius</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">0</code> at inner seams, and one border line (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">ControlGroup</code> from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code>). Children must be direct DOM
            descendants (typically <code className="rounded bg-muted px-1 py-0.5 text-xs">Button</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Input</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Select</code> trigger).
          </p>
        </div>

        <div className="space-y-6 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Buttons + icon menu</h3>
            <p className="text-xs text-muted-foreground">
              Context-style menu: on open, focus moves to the menu surface (focus trap); no item is highlighted until
              ArrowDown / ArrowUp or hover. Do not call{" "}
              <code className="rounded bg-muted px-1 py-0.5">preventDefault()</code> on{" "}
              <code className="rounded bg-muted px-1 py-0.5">onOpenAutoFocus</code> — that skips Radix focus-into-menu
              and Tab will jump to controls outside the menu.
            </p>
            <ControlGroup className="max-w-xl" aria-label="Actions and menu">
              <Button type="button" variant="outline">
                Settings
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), controlGroupItemFixedClassName)}
                    aria-label="Action menu"
                  >
                    <SettingsGearIcon className="size-4 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[10rem] p-1">
                  <DropdownMenuItem>
                    <MenuEditIcon className="size-4 shrink-0 text-muted-foreground" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <MenuShareIcon className="size-4 shrink-0 text-muted-foreground" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive data-[highlighted]:text-destructive">
                    <MenuDeleteIcon className="size-4 shrink-0" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ControlGroup>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Three inputs</h3>
            <ControlGroup className="max-w-xl" aria-label="Compound field">
              <Input className={controlGroupItemGrowClassName} placeholder="First name" aria-label="First name" />
              <Input className={controlGroupItemGrowClassName} placeholder="Last name" aria-label="Last name" />
              <Input className={controlGroupItemGrowClassName} placeholder="Email" type="email" aria-label="Email" />
            </ControlGroup>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Input + select + multi-select (summary) + button</h3>
            <ControlGroup className="max-w-3xl" aria-label="Search, filters, and action">
              <Input
                className={controlGroupItemGrowClassName}
                placeholder="Search query…"
                aria-label="Search query"
              />
              <Select defaultValue="banana">
                <SelectTrigger aria-label="Category" className={cn(controlGroupItemFixedClassName, "min-w-[10rem]")}>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {GALLERY_FRUITS.slice(0, 6).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MultiSelect
                displayMode="summary"
                selectionCountLabel="Selected"
                value={controlGroupScope}
                onValueChange={setControlGroupScope}
                placeholder="Tags"
              >
                <MultiSelectTrigger
                  id="dev-ui-control-group-scope-ms"
                  aria-label="Additional tags"
                  className={cn(controlGroupItemFixedClassName, "min-w-[9.5rem] max-w-[14rem]")}
                />
                <MultiSelectContent className="min-w-[var(--radix-popover-trigger-width)]">
                  {GALLERY_FRUITS.slice(0, 8).map(([value, label]) => (
                    <MultiSelectItem key={value} value={value}>
                      {label}
                    </MultiSelectItem>
                  ))}
                </MultiSelectContent>
              </MultiSelect>
              <Button type="button" variant="outline" className={controlGroupItemFixedClassName}>
                Search
              </Button>
            </ControlGroup>
          </div>
        </div>
      </section>
    </div>
  );
}
