import type { WebMessageValues } from "@okkey/i18n";
import {
  authShellRootClassName,
  BodyGradient,
  cn,
  safeAreaPaddingClassName,
} from "@okkey/ui";
import {
  Check,
  KeyRound,
  Lock,
  Mail,
  Server,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type SetupWizardNavStep = "mail" | "server" | "owner" | "password" | "recovery";

export const SETUP_WIZARD_NAV_STEPS: readonly SetupWizardNavStep[] = [
  "mail",
  "server",
  "owner",
  "password",
  "recovery",
] as const;

const STEP_ICONS: Record<SetupWizardNavStep, LucideIcon> = {
  mail: Mail,
  server: Server,
  owner: UserRound,
  password: Lock,
  recovery: KeyRound,
};

type SetupWizardShellProps = {
  activeStep: SetupWizardNavStep;
  /** Highest step index the user may open (completed + current). */
  reachableIndex: number;
  onSelectStep: (step: SetupWizardNavStep) => void;
  t: (messageKey: string, values?: WebMessageValues) => string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

function stepIndex(step: SetupWizardNavStep): number {
  return SETUP_WIZARD_NAV_STEPS.indexOf(step);
}

/**
 * Post-code setup wizard chrome: auth gradient background, centered max-width
 * container with a step sidebar (collapses on narrow screens).
 */
export function SetupWizardShell({
  activeStep,
  reachableIndex,
  onSelectStep,
  t,
  title,
  description,
  children,
  footer,
}: SetupWizardShellProps) {
  return (
    <div
      className={cn(
        "relative isolate max-w-[100vw] overflow-x-hidden bg-background text-foreground",
        authShellRootClassName,
        safeAreaPaddingClassName,
      )}
    >
      <BodyGradient />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto px-[30px] py-[30px]">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[1200px] flex-1 flex-col overflow-hidden rounded-2xl",
            "border border-border bg-card text-card-foreground shadow-sm",
            "lg:flex-row",
          )}
          data-testid="setup-wizard-shell"
        >
          <aside
            className="flex w-full shrink-0 flex-col gap-4 border-b border-border p-4 lg:w-[280px] lg:border-b-0 lg:border-r lg:p-5"
            aria-label={t("web.setupWizard.sidebarAria")}
          >
            <div className="flex items-center gap-2 px-1">
              <Shield className="size-5 shrink-0 text-copy-secondary" aria-hidden />
              <div className="min-w-0">
                <p className="okkey-small font-semibold text-copy-primary">
                  {t("web.setupWizard.shellTitle")}
                </p>
                <p className="text-xs text-copy-secondary">{t("web.setupWizard.shellSubtitle")}</p>
              </div>
            </div>

            <nav className="min-w-0">
              <ol className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                {SETUP_WIZARD_NAV_STEPS.map((step) => {
                  const index = stepIndex(step);
                  const active = step === activeStep;
                  const completed = index < reachableIndex && !active;
                  const reachable = index <= reachableIndex;
                  const Icon = STEP_ICONS[step];
                  return (
                    <li key={step} className="min-w-[11rem] shrink-0 lg:min-w-0">
                      <button
                        type="button"
                        disabled={!reachable}
                        aria-current={active ? "step" : undefined}
                        onClick={() => {
                          if (reachable) {
                            onSelectStep(step);
                          }
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                          active && "bg-muted",
                          !active && reachable && "hover:bg-muted/70",
                          !reachable && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
                            active && "border-border bg-background text-copy-primary",
                            completed && "border-transparent bg-primary/10 text-primary",
                            !active && !completed && "border-border text-copy-secondary",
                          )}
                        >
                          {completed ? (
                            <Check className="size-4" aria-hidden />
                          ) : (
                            <Icon className="size-4" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-copy-primary">
                            {t(`web.setupWizard.step.${step}.title`)}
                          </span>
                          <span className="mt-0.5 block text-xs text-copy-secondary">
                            {t(`web.setupWizard.step.${step}.description`)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex items-center gap-2 text-copy-secondary">
                {(() => {
                  const Icon = STEP_ICONS[activeStep];
                  return <Icon className="size-4 shrink-0" aria-hidden />;
                })()}
                <span className="okkey-small">{t(`web.setupWizard.step.${activeStep}.title`)}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-copy-primary">{title}</h1>
              {description != null && description !== "" ? (
                <p className="okkey-body max-w-2xl text-copy-secondary">{description}</p>
              ) : null}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
              {children}
            </div>
            {footer != null ? (
              <div className="border-t border-border px-5 py-4 sm:px-8">{footer}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
