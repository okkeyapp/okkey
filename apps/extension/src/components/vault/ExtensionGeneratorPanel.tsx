import { Button, ScrollArea, cn } from "@okkey/ui";
import { GeneratorSection } from "@okkey/vault-ui";
import { toast } from "sonner";

type ExtensionGeneratorPanelProps = {
  onBack: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
};

function BackChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4", className)}
    >
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExtensionGeneratorPanel({ onBack, t }: ExtensionGeneratorPanelProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={onBack}
          aria-label={t("web.settingsPopup.close")}
        >
          <BackChevronIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
            {t("web.tools.sections.generator")}
          </h1>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4 sm:px-6 sm:py-6">
          <GeneratorSection
            t={t}
            hideIntro
            className="gap-6"
            onCopied={() => {
              toast.success(t("web.keyForm.copied"));
            }}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
