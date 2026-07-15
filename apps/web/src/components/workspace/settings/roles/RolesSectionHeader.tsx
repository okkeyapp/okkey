import type { WebMessageValues } from "@okkey/i18n";

type RolesSectionHeaderProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function ExternalLinkIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className="size-4 shrink-0">
      <path
        d="M12 8.66667V12.6667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H7.33333M10 2H14M14 2V6M14 2L6.66667 9.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function RolesSectionHeader({ t }: RolesSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">{t("web.workspaceSettings.sections.roles")}</h2>
      <p className="text-sm leading-5 text-muted-foreground">
        {t("web.workspaceSettings.roles.intro")}{" "}
        <a
          href={t("web.workspaceSettings.roles.learnMoreUrl")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
        >
          {t("web.workspaceSettings.roles.learnMore")}
          <ExternalLinkIcon />
        </a>
      </p>
    </div>
  );
}
