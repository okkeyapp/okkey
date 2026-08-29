import { Navigate, useLocation } from "react-router-dom";

import { toolsPath } from "../../routes/paths";

/** `/tools` → default tool section. */
export default function ToolsIndexRedirect() {
  const { search } = useLocation();
  return <Navigate to={`${toolsPath()}${search}`} replace />;
}
