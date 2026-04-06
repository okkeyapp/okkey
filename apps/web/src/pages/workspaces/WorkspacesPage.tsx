import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useLocale } from "../../locale/LocaleContext";
import WorkspacesContent from "./WorkspacesContent";

export default function WorkspacesPage() {
  const { t } = useLocale();

  return (
    <AppShellLayout
      title={t("workspaces.title")}
      description={t("workspaces.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      contentClassName="max-w-3xl"
    >
      <WorkspacesContent />
    </AppShellLayout>
  );
}
