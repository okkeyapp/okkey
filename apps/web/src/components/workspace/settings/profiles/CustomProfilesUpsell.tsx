import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle } from "@okkey/ui";
import type { SVGProps } from "react";
import { Link } from "react-router-dom";

import { settingsPath } from "../../../../routes/paths";

function AlertInfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

type CustomProfilesUpsellProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

export default function CustomProfilesUpsell({ t }: CustomProfilesUpsellProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {t("web.workspaceSettings.profiles.custom.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("web.workspaceSettings.profiles.custom.subtitle")}
        </p>
      </div>

      <Alert variant="default">
        <AlertInfoIcon className="size-4" />
        <AlertTitle>{t("web.workspaceSettings.profiles.upsellNoteTitle")}</AlertTitle>
        <AlertDescription>
          {t("web.workspaceSettings.profiles.upsellPrefix")}
          <Link
            to={settingsPath("plan")}
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
          >
            {t("web.workspaceSettings.profiles.upsellPlanLink")}
          </Link>
          {t("web.workspaceSettings.profiles.upsellSuffix")}
        </AlertDescription>
      </Alert>
    </section>
  );
}
