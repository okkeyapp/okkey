import { useState } from "react";
import { Button, Switch } from "@okkey/ui";

import { BodyGradient } from "../../components/BodyGradient";
import { readAccentTintEnabled, writeAccentTintEnabled } from "../../theme/accentSemanticTint";
import { applyStoredTheme, readStoredThemePreference, type ThemePreference } from "../../theme/applyTheme";
import { ACCENT_IDS, readAccentFromStorage, setStoredAccent, type AccentId } from "./devUiConstants";
import { ColorSwatch, ThemeCheckIcon } from "./DevUiIcons";

export default function DevUIFoundationPage() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStoredThemePreference());
  const [accent, setAccent] = useState<AccentId>(readAccentFromStorage);
  const [accentTintEnabled, setAccentTintEnabled] = useState(readAccentTintEnabled);

  function setStoredThemePreference(preference: ThemePreference) {
    window.localStorage.setItem("okkey.theme", preference);
    setThemePreference(preference);
    applyStoredTheme();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Theme</h2>
        <p className="text-sm text-muted-foreground">
          Stored as <code className="rounded bg-muted px-1 py-0.5 text-xs">okkey.theme</code>.{" "}
          <strong>Auto</strong> follows the OS / browser via{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">prefers-color-scheme</code> (macOS, Windows, Linux).
        </p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["light", "Light"] as const,
              ["dark", "Dark"] as const,
              ["auto", "Auto"] as const,
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={themePreference === value ? "default" : "secondary"}
              className="inline-flex items-center gap-2"
              onClick={() => setStoredThemePreference(value)}
            >
              {themePreference === value ? <ThemeCheckIcon className="size-4 shrink-0" /> : null}
              {label}
            </Button>
          ))}
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
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">Accent tint</p>
            <p className="text-sm text-muted-foreground">
              Subtle accent hue on background, card, secondary, muted, border, and foreground tokens. Off by default.
            </p>
          </div>
          <Switch
            checked={accentTintEnabled}
            onCheckedChange={(on) => {
              setAccentTintEnabled(on);
              writeAccentTintEnabled(on);
              applyStoredTheme();
            }}
            aria-label="Apply accent tint to semantic colors"
          />
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
        <h2 className="text-lg font-medium">Page gradient</h2>
        <p className="text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">BodyGradient</code> from{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">apps/web</code> — same overlay as{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">AppShellLayout</code> behind the app chrome.
        </p>
        <div className="relative isolate h-36 overflow-hidden rounded-lg border border-border bg-background">
          <BodyGradient />
          <p className="relative flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            Cropped preview of the page background gradient.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Typography</h2>
        <div className="space-y-2 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <h3 className="okkey-heading-xl">Heading xl</h3>
          <h4 className="text-lg font-medium">Heading lg</h4>
          <p className="okkey-body text-copy-secondary">Body: The quick brown fox jumps over the lazy dog. 01456789</p>
          <p className="okkey-small text-copy-secondary">Small muted caption text.</p>
        </div>
      </section>
    </div>
  );
}
