import WorkspaceErrorState from "./WorkspaceErrorState";

export default function WorkspaceNotFoundPage() {
  return (
    <WorkspaceErrorState titleKey="web.notFound.title" descriptionKey="web.notFound.description" />
  );
}
