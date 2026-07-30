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

type SharedVaultsUpsellProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

export default function SharedVaultsUpsell({ t }: SharedVaultsUpsellProps) {
  return (
    <Alert variant="default">
      <AlertInfoIcon className="size-4" />
      <AlertTitle>{t("web.workspaceSettings.vaults.upsellNoteTitle")}</AlertTitle>
      <AlertDescription>
        {t("web.workspaceSettings.vaults.upsellPrefix")}
        <Link to={settingsPath("plan")} className="font-medium text-foreground underline underline-offset-4">
          {t("web.workspaceSettings.vaults.upsellPlanLink")}
        </Link>
        {t("web.workspaceSettings.vaults.upsellSuffix")}
      </AlertDescription>
    </Alert>
  );
}
