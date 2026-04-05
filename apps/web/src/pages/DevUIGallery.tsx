import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
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

import { applyStoredTheme } from "../theme/applyTheme";

const ACCENT_IDS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"] as const;

type AccentId = (typeof ACCENT_IDS)[number];

function readAccentFromStorage(): AccentId {
  try {
    const raw = window.localStorage.getItem("okkey.accent");
    return raw && (ACCENT_IDS as readonly string[]).includes(raw) ? (raw as AccentId) : "a2";
  } catch {
    return "a2";
  }
}

function setStoredTheme(theme: "light" | "dark") {
  window.localStorage.setItem("okkey.theme", theme);
  applyStoredTheme();
}

function setStoredAccent(accent: AccentId) {
  window.localStorage.setItem("okkey.accent", accent);
  applyStoredTheme();
}

const GALLERY_FRUITS = [
  ["apple", "Apple"],
  ["apricot", "Apricot"],
  ["banana", "Banana"],
  ["cherry", "Cherry"],
  ["fig", "Fig"],
  ["grape", "Grape"],
  ["kiwi", "Kiwi"],
  ["lemon", "Lemon"],
  ["lime", "Lime"],
  ["mango", "Mango"],
  ["melon", "Melon"],
  ["orange", "Orange"],
  ["peach", "Peach"],
  ["pear", "Pear"],
  ["plum", "Plum"],
] as const;

const MOCK_USERS = [
  { id: "u1", first: "Alice", last: "Anderson", email: "alice.anderson@example.com" },
  { id: "u2", first: "Bob", last: "Bennett", email: "bob.bennett@example.com" },
  { id: "u3", first: "Claire", last: "Collins", email: "claire.collins@example.com" },
  { id: "u4", first: "David", last: "Dawson", email: "david.dawson@example.com" },
  { id: "u5", first: "Emma", last: "Ellis", email: "emma.ellis@example.com" },
  { id: "u6", first: "Frank", last: "Foster", email: "frank.foster@example.com" },
  { id: "u7", first: "Grace", last: "Graham", email: "grace.graham@example.com" },
  { id: "u8", first: "Henry", last: "Hughes", email: "henry.hughes@example.com" },
  { id: "u9", first: "Ivy", last: "Irwin", email: "ivy.irwin@example.com" },
  { id: "u10", first: "Jack", last: "Jordan", email: "jack.jordan@example.com" },
] as const;

function ColorSwatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`h-14 rounded-md border border-border ${className}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function DevUIGallery() {
  const [accent, setAccent] = useState<AccentId>(readAccentFromStorage);
  const [multiFruits, setMultiFruits] = useState<string[]>([]);
  const [multiSummary, setMultiSummary] = useState<string[]>([]);
  const [multiUsers, setMultiUsers] = useState<string[]>([]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-10 p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              <Link to="/" className="text-primary hover:underline">
                ← Home
              </Link>
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Design system</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dev gallery — theme tokens and UI primitives (Okkey / shadcn)
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="https://ui.shadcn.com/" target="_blank" rel="noreferrer">
              shadcn docs
            </a>
          </Button>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Theme</h2>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => setStoredTheme("light")}>
              Light
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStoredTheme("dark")}>
              Dark
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Accent (current: {accent})</h2>
          <div className="flex flex-wrap gap-2">
            {ACCENT_IDS.map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={accent === id ? "default" : "outline"}
                onClick={() => {
                  setStoredAccent(id);
                  setAccent(id);
                }}
              >
                {id}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Semantic colors</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            <ColorSwatch label="background" className="bg-background" />
            <ColorSwatch label="foreground" className="bg-foreground" />
            <ColorSwatch label="primary" className="bg-primary" />
            <ColorSwatch label="secondary" className="bg-secondary" />
            <ColorSwatch label="muted" className="bg-muted" />
            <ColorSwatch label="accent" className="bg-accent" />
            <ColorSwatch label="destructive" className="bg-destructive" />
            <ColorSwatch label="card" className="bg-card" />
            <ColorSwatch label="border" className="bg-border" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Typography</h2>
          <div className="space-y-2 rounded-lg border border-border bg-card p-6 text-card-foreground">
            <h3 className="text-xl font-semibold">Heading xl</h3>
            <h4 className="text-lg font-medium">Heading lg</h4>
            <p className="text-base leading-relaxed text-muted-foreground">
              Body: The quick brown fox jumps over the lazy dog. 01456789
            </p>
            <p className="text-sm text-muted-foreground">Small muted caption text.</p>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Buttons</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Standard shadcn/ui variants and sizes from{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code> (
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

          <p className="text-sm text-muted-foreground">
            Next for 7.4: remaining primitives via{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">apps/web/components.json</code>.
          </p>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Input</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Base field styled like the{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">outline</code> button (background,
              border, shadow, height{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">h-9</code>
              ), horizontal padding{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">12px</code>.
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

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Select</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Radix-based select (shadcn/ui pattern) with the same trigger surface as{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">Input</code> (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@radix-ui/react-select</code>
              ). Use <code className="rounded bg-muted px-1 py-0.5 text-xs">variant=&quot;inline&quot;</code> for
              borderless text + chevron; dropdown uses <code className="rounded bg-muted px-1 py-0.5 text-xs">min-width: 220px</code>.
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
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Multi-select</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Same trigger surface as single <code className="rounded bg-muted px-1 py-0.5 text-xs">Select</code>.
              Default <code className="rounded bg-muted px-1 py-0.5 text-xs">displayMode=&quot;chips&quot;</code> uses
              removable secondary chips; <code className="rounded bg-muted px-1 py-0.5 text-xs">summary</code> shows{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">selectionCountLabel: count</code> (label from the
              app, e.g. i18n). With <code className="rounded bg-muted px-1 py-0.5 text-xs">filterable</code>, a search
              field filters items by <code className="rounded bg-muted px-1 py-0.5 text-xs">searchText</code>; use{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">chipLabel</code> for compact chips (e.g. email)
              while <code className="rounded bg-muted px-1 py-0.5 text-xs">children</code> can be a richer row.
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
              <MultiSelect
                value={multiFruits}
                onValueChange={setMultiFruits}
                placeholder="Choose fruits"
              >
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
    </main>
  );
}
