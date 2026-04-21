import { useParams } from "react-router-dom";

import WorkspaceSidebarLayout from "../../components/workspace/WorkspaceSidebarLayout";
import { useLocale } from "../../locale/LocaleContext";

/** Placeholder until vault UI is implemented; route exists for post-login deep links. */
export default function WorkspaceDetailPage() {
  const { t } = useLocale();
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const description = workspaceId
    ? t("workspaces.shellId", { id: workspaceId })
    : t("workspaces.description");

  return (
    <WorkspaceSidebarLayout title={t("workspaces.shellTitle")} description={description}>
      <p className="okkey-body text-copy-secondary">{t("workspaces.shellPlaceholder")}</p>
    </WorkspaceSidebarLayout>
  );
}
