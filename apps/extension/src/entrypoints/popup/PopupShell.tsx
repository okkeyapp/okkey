import { Button } from "@okkey/ui";

import {
  EXTENSION_DEVICE_CHANNEL,
  EXTENSION_FINGERPRINT_PREFIX,
  OKKEY_SAAS_WEB_BASE_URL,
} from "../../lib/deviceChannel";

/**
 * E0 placeholder popup — proves React + shared `@okkey/ui` load unpacked.
 * Auth, vault, and autofill are intentionally out of scope here.
 */
export function PopupShell() {
  return (
    <div className="flex min-h-[420px] w-[320px] flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Okkey
        </p>
        <h1 className="text-lg font-semibold text-foreground">Extension shell</h1>
        <p className="text-sm text-muted-foreground">
          Scaffold only — sign-in and vault unlock arrive in later phases.
        </p>
      </header>

      <dl className="grid gap-2 rounded-md border border-border bg-card p-3 text-sm text-card-foreground">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Channel</dt>
          <dd className="font-medium">{EXTENSION_DEVICE_CHANNEL}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Fingerprint</dt>
          <dd className="font-mono text-xs">{EXTENSION_FINGERPRINT_PREFIX}-…</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">SaaS preset</dt>
          <dd className="truncate font-mono text-xs">{OKKEY_SAAS_WEB_BASE_URL}</dd>
        </div>
      </dl>

      <div className="mt-auto">
        <Button type="button" className="w-full" disabled>
          Continue (E1)
        </Button>
      </div>
    </div>
  );
}
