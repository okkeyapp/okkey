import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import WorkspacesContent from "./WorkspacesContent";

export default function WorkspacesPage() {
  return (
    <AppShellLayout
      title="Welcome to Okkey"
      description="Choose a workspace"
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      contentClassName="max-w-3xl"
    >
      <WorkspacesContent />
    </AppShellLayout>
  );
}
