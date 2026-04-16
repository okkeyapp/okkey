import { useState, type ReactNode, type SVGProps } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  OkkeyAppSidebar,
  OkkeyAppSidebarToolbar,
  OkkeySidebarFoldersMenu,
  OkkeySidebarPlainLinksMenu,
  OkkeySidebarVaultsMenu,
  OkkeySidebarWorkspaceMenu,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sidebar,
  SidebarContent,
  SidebarProvider,
  Spinner,
  Switch,
  WorkspaceTile,
  type OkkeySidebarFolderTreeNode,
  type OkkeySidebarPlainLinkItem,
  type OkkeySidebarVaultItem,
  type OkkeySidebarWorkspaceNavItem,
} from "@okkey/ui";

import { readAccentTintEnabled, writeAccentTintEnabled } from "../theme/accentSemanticTint";
import {
  applyStoredTheme,
  readStoredThemePreference,
  type ThemePreference,
} from "../theme/applyTheme";
import { BodyGradient } from "../components/BodyGradient";

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

const DEV_UI_SELECT_BUTTON_VARIANTS = ["default", "secondary", "outline", "destructive", "ghost"] as const;

const DEV_UI_ICON_BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive"] as const;

const DEV_UI_YANDEX_FAVICON = "https://favicon.yandex.net/favicon/yandex.ru?size=120";

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

function ThemeCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SettingsGearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuEditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function MenuShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98" />
      <path d="m15.41 6.51-6.82 3.98" />
    </svg>
  );
}

function MenuDeleteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function AlertInfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function AlertWarningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function AlertErrorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
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

function devUiEmoji(emoji: string) {
  return (
    <span className="text-base leading-none" aria-hidden>
      {emoji}
    </span>
  );
}

function DevUiDemoUsersIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      {...props}
    >
      <path
        d="M10.6667 14V12.6667C10.6667 11.9594 10.3858 11.2811 9.88566 10.781C9.38556 10.281 8.70728 10 8.00004 10H4.00004C3.2928 10 2.61452 10.281 2.11442 10.781C1.61433 11.2811 1.33337 11.9594 1.33337 12.6667V14M14.6667 13.9999V12.6666C14.6663 12.0757 14.4696 11.5018 14.1076 11.0348C13.7456 10.5678 13.2388 10.2343 12.6667 10.0866M10.6667 2.08659C11.2403 2.23346 11.7487 2.56706 12.1118 3.0348C12.4749 3.50254 12.6719 4.07781 12.6719 4.66992C12.6719 5.26204 12.4749 5.83731 12.1118 6.30505C11.7487 6.77279 11.2403 7.10639 10.6667 7.25326M8.66671 4.66667C8.66671 6.13943 7.4728 7.33333 6.00004 7.33333C4.52728 7.33333 3.33337 6.13943 3.33337 4.66667C3.33337 3.19391 4.52728 2 6.00004 2C7.4728 2 8.66671 3.19391 8.66671 4.66667Z"
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DevUiFolderLeafIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M1.5 6.5H14.5M13.1667 13.5C13.5203 13.5 13.8594 13.3595 14.1095 13.1095C14.3595 12.8594 14.5 12.5203 14.5 12.1667V5.83333C14.5 5.47971 14.3595 5.14057 14.1095 4.89052C13.8594 4.64048 13.5203 4.5 13.1667 4.5H8.06671C7.84372 4.50219 7.62374 4.44841 7.42691 4.34359C7.23008 4.23877 7.06268 4.08625 6.94004 3.9L6.40004 3.1C6.27863 2.91565 6.11336 2.76432 5.91904 2.6596C5.72472 2.55488 5.50745 2.50004 5.28671 2.5H2.83333C2.47971 2.5 2.14057 2.64048 1.89052 2.89052C1.64048 3.14057 1.5 3.47971 1.5 3.83333V12.1667C1.5 12.5203 1.64048 12.8594 1.89052 13.1095C2.14057 13.3595 2.47971 13.5 2.83333 13.5H13.1667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DEV_UI_WORKSPACE_NAV: OkkeySidebarWorkspaceNavItem[] = [
  {
    id: "w-all",
    icon: devUiEmoji("📋"),
    label: "All items",
    trailingPlus: true,
    addAriaLabel: "Add item",
  },
  {
    id: "w-cap",
    icon: devUiEmoji("💊"),
    label: "Capsules",
    trailingPlus: true,
    addAriaLabel: "Add capsule",
  },
  { id: "w-mon", icon: devUiEmoji("📊"), label: "Monitoring" },
];

const DEV_UI_VAULT_ITEMS: OkkeySidebarVaultItem[] = [
  { id: "v-p", leading: devUiEmoji("🏠"), label: "Personal" },
  {
    id: "v-e",
    leading: devUiEmoji("💼"),
    label: "Engineering",
    rightIcon: <DevUiDemoUsersIcon />,
  },
  {
    id: "v-m",
    leading: devUiEmoji("🎨"),
    label: "Marketing",
    rightIcon: <DevUiDemoUsersIcon />,
  },
];

const DEV_UI_FOLDER_TREE: OkkeySidebarFolderTreeNode[] = [
  {
    id: "my",
    label: "My folder",
    defaultOpen: true,
    children: [
      {
        id: "web",
        label: "Web",
        defaultOpen: true,
        children: [
          { id: "design", label: "Design" },
          { id: "frontend", label: "Frontend" },
        ],
      },
      { id: "ai", label: "AI" },
    ],
  },
  { id: "company", label: "Company" },
];

const DEV_UI_PLAIN_LINKS: OkkeySidebarPlainLinkItem[] = [
  { id: "doc", icon: devUiEmoji("📖"), label: "Documentation" },
  { id: "help", icon: devUiEmoji("❓"), label: "Help" },
];

const devUiDropdownPanelClassName = "flex w-[min(100vw-2rem,280px)] min-w-56 flex-col overflow-hidden p-0";

function DevUiSidebarMenuShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultExpanded>
      <div className="h-[min(420px,55vh)] w-[280px] max-w-full shrink-0 overflow-hidden rounded-lg border border-border">
        <Sidebar className="h-full border-0 bg-sidebar">
          <SidebarContent className="overflow-y-auto p-0">
            <div className="flex flex-col gap-6 p-2">{children}</div>
          </SidebarContent>
        </Sidebar>
      </div>
    </SidebarProvider>
  );
}

export default function DevUIGallery() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStoredThemePreference());
  const [accent, setAccent] = useState<AccentId>(readAccentFromStorage);
  const [multiFruits, setMultiFruits] = useState<string[]>([]);
  const [multiSummary, setMultiSummary] = useState<string[]>([]);
  const [multiUsers, setMultiUsers] = useState<string[]>([]);
  const [controlGroupScope, setControlGroupScope] = useState<string[]>(["apple", "banana"]);
  const [switchOn, setSwitchOn] = useState(true);
  const [switchOnLg, setSwitchOnLg] = useState(true);
  const [accentTintEnabled, setAccentTintEnabled] = useState(readAccentTintEnabled);
  const [devUiVaultOpen, setDevUiVaultOpen] = useState(true);

  function setStoredThemePreference(preference: ThemePreference) {
    window.localStorage.setItem("okkey.theme", preference);
    setThemePreference(preference);
    applyStoredTheme();
  }

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
            <h1 className="mt-2 text-2xl font-semibold">Design system</h1>
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
          <p className="text-sm text-muted-foreground">
            Stored as <code className="rounded bg-muted px-1 py-0.5 text-xs">okkey.theme</code>.{" "}
            <strong>Auto</strong> follows the OS / browser via{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">prefers-color-scheme</code> (macOS, Windows,
            Linux).
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
                Subtle accent hue on background, card, secondary, muted, border, and foreground tokens. Off by
                default.
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
          <h2 className="text-lg font-medium">Typography</h2>
          <div className="space-y-2 rounded-lg border border-border bg-card p-6 text-card-foreground">
            <h3 className="okkey-heading-xl">Heading xl</h3>
            <h4 className="text-lg font-medium">Heading lg</h4>
            <p className="okkey-body text-copy-secondary">
              Body: The quick brown fox jumps over the lazy dog. 01456789
            </p>
            <p className="okkey-small text-copy-secondary">Small muted caption text.</p>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Sidebar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Primitives follow the shadcn/ui sidebar pattern (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarProvider</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeyAppSidebarToolbar</code> in the main column,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarMenuButton</code>, collapsible groups,
              tree). The scrollable block uses{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">ScrollArea</code>. Colors use{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">sidebar-*</code> tokens and shared{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">foreground</code> /{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">primary</code>.
            </p>
          </div>
          <div className="relative isolate overflow-x-auto rounded-lg">
            <BodyGradient />
            <div className="relative flex h-[min(640px,75vh)] min-h-[360px] w-max min-w-full">
              <OkkeyAppSidebar className="h-full min-h-0">
                <OkkeyAppSidebarToolbar />
                <div
                  className="mt-2 mr-2 mb-2 flex min-h-0 flex-1 items-center justify-center rounded-xl bg-background px-6 text-sm text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
                >
                  Main content
                </div>
              </OkkeyAppSidebar>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Shell: page gradient & sidebar menus</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Standalone building blocks from <code className="rounded bg-muted px-1 py-0.5 text-xs">apps/web</code>{" "}
              (<code className="rounded bg-muted px-1 py-0.5 text-xs">BodyGradient</code>) and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code> (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarWorkspaceMenu</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarVaultsMenu</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarFoldersMenu</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">OkkeySidebarPlainLinksMenu</code>). Menus expect{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarProvider</code> +{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">Sidebar</code> /{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">SidebarContent</code> for expanded layout.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">BodyGradient</h3>
            <div className="relative isolate h-36 overflow-hidden rounded-lg border border-border bg-background">
              <BodyGradient />
              <p className="relative flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                Same overlay as <code className="rounded bg-muted px-1 py-0.5 text-xs">AppShellLayout</code> — cropped
                for preview.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Menu blocks (expanded)</h3>
            <DevUiSidebarMenuShell>
              <OkkeySidebarWorkspaceMenu labelText="Workspace" items={DEV_UI_WORKSPACE_NAV} />
              <OkkeySidebarVaultsMenu
                surface="sidebar-expanded"
                sectionTitle="Vaults"
                collapsibleGroupName="dev-ui-vaults"
                open={devUiVaultOpen}
                onOpenChange={setDevUiVaultOpen}
                items={DEV_UI_VAULT_ITEMS}
                showHeaderPlus
                headerPlusAriaLabel="Add vault"
              />
              <OkkeySidebarFoldersMenu
                surface="sidebar-expanded"
                sectionTitle="Folders"
                collapsibleGroupName="dev-ui-folders"
                tree={DEV_UI_FOLDER_TREE}
                leafIcon={<DevUiFolderLeafIcon />}
                showHeaderPlus
                headerPlusAriaLabel="Add folder"
              />
              <OkkeySidebarPlainLinksMenu items={DEV_UI_PLAIN_LINKS} />
            </DevUiSidebarMenuShell>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Menu panels (dropdown surface)</h3>
            <p className="text-sm text-muted-foreground">
              Same components with <code className="rounded bg-muted px-1 py-0.5 text-xs">surface=&quot;dropdown&quot;</code>{" "}
              as in the collapsed rail.
            </p>
            <div className="flex flex-wrap gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Vaults panel
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6} className={devUiDropdownPanelClassName}>
                  <OkkeySidebarVaultsMenu
                    surface="dropdown"
                    sectionTitle="Vaults"
                    collapsibleGroupName="dev-ui-vaults-dd"
                    items={DEV_UI_VAULT_ITEMS}
                    showHeaderPlus
                    headerPlusAriaLabel="Add vault"
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    Folders panel
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6} className={devUiDropdownPanelClassName}>
                  <OkkeySidebarFoldersMenu
                    surface="dropdown"
                    sectionTitle="Folders"
                    collapsibleGroupName="dev-ui-folders-dd"
                    tree={DEV_UI_FOLDER_TREE}
                    leafIcon={<DevUiFolderLeafIcon />}
                    showHeaderPlus
                    headerPlusAriaLabel="Add folder"
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
            <h2 className="text-lg font-medium">Switch</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Radix-based toggle (shadcn/ui pattern,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@radix-ui/react-switch</code>
              ).
            </p>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex max-w-md items-center justify-between gap-4">
              <label htmlFor="dev-ui-switch" className="text-sm font-medium">
                Notifications (default)
              </label>
              <Switch id="dev-ui-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
            </div>
            <div className="flex max-w-md items-center justify-between gap-4">
              <label htmlFor="dev-ui-switch-lg" className="text-sm font-medium">
                Large (44×24px)
              </label>
              <Switch id="dev-ui-switch-lg" size="lg" checked={switchOnLg} onCheckedChange={setSwitchOnLg} />
            </div>
            <div className="flex max-w-md items-center justify-between gap-4">
              <span className="text-sm font-medium text-muted-foreground">Disabled (off)</span>
              <Switch disabled checked={false} aria-label="Disabled off" />
            </div>
            <div className="flex max-w-md items-center justify-between gap-4">
              <span className="text-sm font-medium text-muted-foreground">Disabled (on)</span>
              <Switch disabled checked aria-label="Disabled on" />
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
              ). <code className="rounded bg-muted px-1 py-0.5 text-xs">variant=&quot;inline&quot;</code> is borderless
              text + chevron (dropdown <code className="rounded bg-muted px-1 py-0.5 text-xs">min-width: 180px</code>
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
                      <SelectTrigger
                        id={`dev-ui-select-btn-md-${buttonVariant}`}
                        aria-label={`${buttonVariant} select`}
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
                Context-style menu: on open, focus moves to the menu surface (focus trap); no item is
                highlighted until ArrowDown / ArrowUp or hover. Do not call{" "}
                <code className="rounded bg-muted px-1 py-0.5">preventDefault()</code> on{" "}
                <code className="rounded bg-muted px-1 py-0.5">onOpenAutoFocus</code> — that skips
                Radix focus-into-menu and Tab will jump to controls outside the menu.
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
              <h3 className="text-sm font-medium text-muted-foreground">
                Input + select + multi-select (summary) + button
              </h3>
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

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Spinner</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Indeterminate loader (<code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code>
              ). Track: <code className="rounded bg-muted px-1 py-0.5 text-xs">muted-foreground / 20%</code>; arc:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">accent</code> (opaque), 25% of the ring.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">size=&quot;small&quot;</code> 24×24px / 2px stroke,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">default</code> 36×36px / 3px,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">large</code> 48×48px / 4px (stroke scales via 24px
              viewBox).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-8 rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-[24px] w-[24px] items-center justify-center">
                <Spinner size="small" />
              </div>
              <span className="text-xs text-muted-foreground">small · 24px</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-[36px] w-[36px] items-center justify-center">
                <Spinner size="default" />
              </div>
              <span className="text-xs text-muted-foreground">default · 36px</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-[48px] w-[48px] items-center justify-center">
                <Spinner size="large" />
              </div>
              <span className="text-xs text-muted-foreground">large · 48px</span>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Workspace tile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5 text-xs">tileColor</code> fills the personal-workspace SVG;{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">imageSrc</code> overrides it and shows an image;{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">business</code> adds the briefcase badge at the bottom-right.
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
              <WorkspaceTile
                type="button"
                title="Image only"
                description="No business badge"
                imageSrc={DEV_UI_YANDEX_FAVICON}
                imageAlt=""
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Alert</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              shadcn-style <code className="rounded bg-muted px-1 py-0.5 text-xs">Alert</code> with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">default</code> (info),{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">warning</code>, and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">error</code> variants (
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@okkey/ui</code>).
            </p>
          </div>
          <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
            <Alert variant="default">
              <AlertInfoIcon className="size-4" />
              <AlertTitle>Note</AlertTitle>
              <AlertDescription>
                Default (info): neutral surface for tips or non-blocking context.
              </AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertWarningIcon className="size-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>Something may need attention before you continue.</AlertDescription>
            </Alert>
            <Alert variant="error">
              <AlertErrorIcon className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>An action failed or validation blocked progress.</AlertDescription>
            </Alert>
          </div>
        </section>
      </div>
    </main>
  );
}
