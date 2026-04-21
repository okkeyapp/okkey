import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ITEMS_PATH, WORKSPACE_QUERY_PARAM, WORKSPACES_PATH } from "../../routes/paths";

/** Old `/workspaces/:workspaceId` bookmarks → `/items?workspace=…` (then layout persists + strips query). */
export default function LegacyWorkspaceNestedRedirect() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const id = workspaceId?.trim();
    if (!id) {
      navigate(WORKSPACES_PATH, { replace: true });
      return;
    }
    const q = new URLSearchParams({ [WORKSPACE_QUERY_PARAM]: id });
    navigate(`${ITEMS_PATH}?${q.toString()}`, { replace: true });
  }, [workspaceId, navigate]);

  return null;
}
