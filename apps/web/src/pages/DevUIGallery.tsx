import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@okkey/ui";

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
          <h2 className="text-lg font-medium">Components</h2>
          <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-card p-6">
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
          <p className="text-sm text-muted-foreground">
            More shadcn primitives will land with task 7.4 (`npx shadcn@latest add …` using{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">apps/web/components.json</code>).
          </p>
        </section>
      </div>
    </main>
  );
}
