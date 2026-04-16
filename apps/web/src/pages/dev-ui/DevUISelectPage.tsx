import { useState } from "react";
import {
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

import {
  DEV_UI_ICON_BUTTON_VARIANTS,
  DEV_UI_SELECT_BUTTON_VARIANTS,
  GALLERY_FRUITS,
  MOCK_USERS,
} from "./devUiConstants";
import { SettingsGearIcon } from "./DevUiIcons";

export default function DevUISelectPage() {
  const [multiFruits, setMultiFruits] = useState<string[]>([]);
  const [multiSummary, setMultiSummary] = useState<string[]>([]);
  const [multiUsers, setMultiUsers] = useState<string[]>([]);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Select</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Radix-based select (shadcn/ui pattern) with the same trigger surface as{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Input</code> (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@radix-ui/react-select</code>
            ). <code className="rounded bg-muted px-1 py-0.5 text-xs">variant=&quot;inline&quot;</code> is borderless text +
            chevron (dropdown <code className="rounded bg-muted px-1 py-0.5 text-xs">min-width: 180px</code>
            ). <code className="rounded bg-muted px-1 py-0.5 text-xs">variant=&quot;button&quot;</code> uses{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">buttonVariant</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">buttonSize</code> like{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Button</code>. Icon-only triggers use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">buttonSize=&quot;icon&quot;</code>,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">iconSm</code>, or{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">iconLg</code> with any{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">buttonVariant</code> (no chevron).
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <div className="flex max-w-md flex-col gap-2">
            <label htmlFor="dev-ui-select" className="text-sm font-medium">
              Select
            </label>
            <Select defaultValue="banana">
              <SelectTrigger id="dev-ui-select">
                <SelectValue placeholder="Choose a fruit" />
              </SelectTrigger>
              <SelectContent>
                {GALLERY_FRUITS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <label htmlFor="dev-ui-select-disabled" className="text-sm font-medium text-muted-foreground">
              Disabled
            </label>
            <Select disabled defaultValue="apple">
              <SelectTrigger id="dev-ui-select-disabled">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GALLERY_FRUITS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Inline</span>
            <Select variant="inline" defaultValue="banana">
              <SelectTrigger id="dev-ui-select-inline" aria-label="Inline select">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {GALLERY_FRUITS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Button (default size)</span>
              <div className="flex flex-wrap items-center gap-2">
                {DEV_UI_SELECT_BUTTON_VARIANTS.map((buttonVariant, i) => (
                  <Select
                    key={`select-btn-md-${buttonVariant}`}
                    variant="button"
                    buttonVariant={buttonVariant}
                    defaultValue={GALLERY_FRUITS[i][0]}
                  >
                    <SelectTrigger id={`dev-ui-select-btn-md-${buttonVariant}`} aria-label={`${buttonVariant} select`}>
                      <SelectValue placeholder="Fruit" />
                    </SelectTrigger>
                    <SelectContent>
                      {GALLERY_FRUITS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Button (small)</span>
              <div className="flex flex-wrap items-center gap-2">
                {DEV_UI_SELECT_BUTTON_VARIANTS.map((buttonVariant, i) => (
                  <Select
                    key={`select-btn-sm-${buttonVariant}`}
                    variant="button"
                    buttonVariant={buttonVariant}
                    buttonSize="sm"
                    defaultValue={GALLERY_FRUITS[i][0]}
                  >
                    <SelectTrigger
                      id={`dev-ui-select-btn-sm-${buttonVariant}`}
                      aria-label={`${buttonVariant} small select`}
                    >
                      <SelectValue placeholder="Fruit" />
                    </SelectTrigger>
                    <SelectContent>
                      {GALLERY_FRUITS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Button (icon sizes × variants)</span>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {DEV_UI_ICON_BUTTON_VARIANTS.map((bv, i) => (
                    <Select
                      key={`select-icon-${bv}`}
                      variant="button"
                      buttonVariant={bv}
                      buttonSize="icon"
                      defaultValue={GALLERY_FRUITS[i][0]}
                    >
                      <SelectTrigger id={`dev-ui-select-btn-icon-${bv}`} aria-label={`${bv} icon select`}>
                        <SettingsGearIcon className="size-4 shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GALLERY_FRUITS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {DEV_UI_ICON_BUTTON_VARIANTS.map((bv, i) => (
                    <Select
                      key={`select-iconsm-${bv}`}
                      variant="button"
                      buttonVariant={bv}
                      buttonSize="iconSm"
                      defaultValue={GALLERY_FRUITS[i][0]}
                    >
                      <SelectTrigger id={`dev-ui-select-btn-iconsm-${bv}`} aria-label={`${bv} icon select small`}>
                        <SettingsGearIcon className="size-[14px] shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GALLERY_FRUITS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Multi-select</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Same trigger surface as single <code className="rounded bg-muted px-1 py-0.5 text-xs">Select</code>. Default{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">displayMode=&quot;chips&quot;</code> uses removable
            secondary chips; <code className="rounded bg-muted px-1 py-0.5 text-xs">summary</code> shows{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">selectionCountLabel: count</code> (label from the app,
            e.g. i18n). With <code className="rounded bg-muted px-1 py-0.5 text-xs">filterable</code>, a search field
            filters items by <code className="rounded bg-muted px-1 py-0.5 text-xs">searchText</code>; use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">chipLabel</code> for compact chips (e.g. email) while{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">children</code> can be a richer row.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <div className="flex max-w-md flex-col gap-2">
            <label htmlFor="dev-ui-multiselect-users" className="text-sm font-medium">
              Users (search + chips by email)
            </label>
            <MultiSelect
              filterable
              searchPlaceholder="Name, surname, or email…"
              searchEmptyMessage="No users found"
              value={multiUsers}
              onValueChange={setMultiUsers}
              placeholder="Select users"
            >
              <MultiSelectTrigger id="dev-ui-multiselect-users" />
              <MultiSelectContent className="min-w-[min(100vw-2rem,22rem)]">
                {MOCK_USERS.map((u) => (
                  <MultiSelectItem
                    key={u.id}
                    value={u.id}
                    chipLabel={u.email}
                    searchText={`${u.first} ${u.last} ${u.email}`}
                    className="items-start py-2"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                      <span className="font-medium text-foreground">
                        {u.first} {u.last}
                      </span>
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    </span>
                  </MultiSelectItem>
                ))}
              </MultiSelectContent>
            </MultiSelect>
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <label htmlFor="dev-ui-multiselect" className="text-sm font-medium">
              Fruits
            </label>
            <MultiSelect value={multiFruits} onValueChange={setMultiFruits} placeholder="Choose fruits">
              <MultiSelectTrigger id="dev-ui-multiselect" />
              <MultiSelectContent>
                {GALLERY_FRUITS.map(([value, label]) => (
                  <MultiSelectItem key={value} value={value}>
                    {label}
                  </MultiSelectItem>
                ))}
              </MultiSelectContent>
            </MultiSelect>
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <label htmlFor="dev-ui-multiselect-summary" className="text-sm font-medium">
              Summary (no chip remove buttons)
            </label>
            <MultiSelect
              displayMode="summary"
              selectionCountLabel="Selected"
              value={multiSummary}
              onValueChange={setMultiSummary}
            >
              <MultiSelectTrigger id="dev-ui-multiselect-summary" />
              <MultiSelectContent>
                {GALLERY_FRUITS.map(([value, label]) => (
                  <MultiSelectItem key={value} value={value}>
                    {label}
                  </MultiSelectItem>
                ))}
              </MultiSelectContent>
            </MultiSelect>
          </div>
        </div>
      </section>
    </div>
  );
}
