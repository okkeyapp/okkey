import WorkspaceErrorState from "./WorkspaceErrorState";

export default function WorkspaceForbiddenPage() {
  return (
    <WorkspaceErrorState titleKey="web.forbidden.title" descriptionKey="web.forbidden.description" />
  );
}
