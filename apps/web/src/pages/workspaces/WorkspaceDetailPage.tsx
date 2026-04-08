import { useParams } from "react-router-dom";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useLocale } from "../../locale/LocaleContext";

/** Placeholder until vault UI is implemented; route exists for post-login deep links. */
export default function WorkspaceDetailPage() {
  const { t } = useLocale();
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <AppShellLayout
      title={t("workspaces.title")}
      description={workspaceId ? `Workspace ${workspaceId}` : t("workspaces.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      contentClassName="max-w-3xl"
    >
      <p className="okkey-body text-copy-secondary text-center">{t("workspaces.description")}</p>
    </AppShellLayout>
  );
}
