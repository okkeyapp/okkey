import { type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuthVault } from "../auth/AuthVaultContext";
import AccountRestorePage from "../pages/account/AccountRestorePage";
import AuthEmailPage from "../pages/auth/AuthEmailPage";
import AuthOtpPage from "../pages/auth/AuthOtpPage";
import AuthRegistrationPage from "../pages/auth/AuthRegistrationPage";
import AuthTwoFactorPage from "../pages/auth/AuthTwoFactorPage";
import DevUIAlertPage from "../pages/dev-ui/DevUIAlertPage";
import DevUITooltipPage from "../pages/dev-ui/DevUITooltipPage";
import DevUIButtonPage from "../pages/dev-ui/DevUIButtonPage";
import DevUIControlGroupingPage from "../pages/dev-ui/DevUIControlGroupingPage";
import DevUIFoundationPage from "../pages/dev-ui/DevUIFoundationPage";
import DevUIGalleryLayout from "../pages/dev-ui/DevUIGalleryLayout";
import DevUIInputPage from "../pages/dev-ui/DevUIInputPage";
import DevUIPopupPage from "../pages/dev-ui/DevUIPopupPage";
import DevUISelectPage from "../pages/dev-ui/DevUISelectPage";
import DevUISidebarPage from "../pages/dev-ui/DevUISidebarPage";
import DevUISpinnerPage from "../pages/dev-ui/DevUISpinnerPage";
import DevUISwitchPage from "../pages/dev-ui/DevUISwitchPage";
import DevUIFaviconPage from "../pages/dev-ui/DevUIFaviconPage";
import DevUIWorkspaceTilePage from "../pages/dev-ui/DevUIWorkspaceTilePage";
import UnlockPasswordPage from "../pages/unlock/UnlockPasswordPage";
import LegacyWorkspaceNestedRedirect from "../pages/workspace/LegacyWorkspaceNestedRedirect";
import WorkspaceSectionPage from "../pages/workspace/WorkspaceSectionPage";
import WorkspacesPage from "../pages/workspaces/WorkspacesPage";
import ProtectedVaultLayout from "../auth/ProtectedVaultLayout";
import WorkspaceRoutesLayout from "../workspace/WorkspaceRoutesLayout";
import {
  ACCOUNT_LOCK_PATH,
  ACCOUNT_NEW_PATH,
  ACCOUNT_RESTORE_PATH,
  AUTH_EMAIL_PATH,
  AUTH_OTP_PATH,
  AUTH_REGISTRATION_LEGACY_PATH,
  AUTH_TWO_FACTOR_PATH,
  CAPSULES_PATH,
  DEFAULT_AUTHENTICATED_PATH,
  DEV_UI_BASE_PATH,
  ITEMS_PATH,
  LEGACY_WORKSPACE_DETAIL_PATH_PATTERN,
  MONITORING_PATH,
  ROOT_PATH,
  SETTINGS_PATH,
  TOOLS_PATH,
  UNLOCK_PASSWORD_LEGACY_PATH,
  WORKSPACES_PATH,
} from "./paths";

function RootRedirect() {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    return <Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />;
  }
  return <Navigate to={AUTH_EMAIL_PATH} replace />;
}

/** Login/registration screens only when there is no Bearer session (no effect timing). */
function GuestAuthOnly({ children }: { children: ReactNode }) {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    return <Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />;
  }
  return children;
}

/** Preserve query string when redirecting legacy routes. */
function LegacyNavigate({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path={ROOT_PATH} element={<RootRedirect />} />
      <Route path={DEV_UI_BASE_PATH} element={<DevUIGalleryLayout />}>
        <Route index element={<DevUIFoundationPage />} />
        <Route path="sidebar" element={<DevUISidebarPage />} />
        <Route path="button" element={<DevUIButtonPage />} />
        <Route path="input" element={<DevUIInputPage />} />
        <Route path="switch" element={<DevUISwitchPage />} />
        <Route path="select" element={<DevUISelectPage />} />
        <Route path="control-grouping" element={<DevUIControlGroupingPage />} />
        <Route path="spinner" element={<DevUISpinnerPage />} />
        <Route path="workspace-tile" element={<DevUIWorkspaceTilePage />} />
        <Route path="popup" element={<DevUIPopupPage />} />
        <Route path="alert" element={<DevUIAlertPage />} />
        <Route path="tooltip" element={<DevUITooltipPage />} />
        <Route path="favicon" element={<DevUIFaviconPage />} />
      </Route>
      <Route
        path={AUTH_EMAIL_PATH}
        element={
          <GuestAuthOnly>
            <AuthEmailPage />
          </GuestAuthOnly>
        }
      />
      <Route
        path={AUTH_OTP_PATH}
        element={
          <GuestAuthOnly>
            <AuthOtpPage />
          </GuestAuthOnly>
        }
      />
      <Route path={ACCOUNT_NEW_PATH} element={<AuthRegistrationPage />} />
      <Route path={AUTH_REGISTRATION_LEGACY_PATH} element={<LegacyNavigate to={ACCOUNT_NEW_PATH} />} />
      <Route
        path={AUTH_TWO_FACTOR_PATH}
        element={
          <GuestAuthOnly>
            <AuthTwoFactorPage />
          </GuestAuthOnly>
        }
      />
      <Route path={ACCOUNT_LOCK_PATH} element={<UnlockPasswordPage />} />
      <Route path={UNLOCK_PASSWORD_LEGACY_PATH} element={<LegacyNavigate to={ACCOUNT_LOCK_PATH} />} />
      <Route path={ACCOUNT_RESTORE_PATH} element={<AccountRestorePage />} />
      <Route element={<ProtectedVaultLayout />}>
        <Route path={WORKSPACES_PATH} element={<WorkspacesPage />} />
        <Route path={LEGACY_WORKSPACE_DETAIL_PATH_PATTERN} element={<LegacyWorkspaceNestedRedirect />} />
        <Route element={<WorkspaceRoutesLayout />}>
          <Route path={ITEMS_PATH} element={<WorkspaceSectionPage />} />
          <Route path={CAPSULES_PATH} element={<WorkspaceSectionPage />} />
          <Route path={MONITORING_PATH} element={<WorkspaceSectionPage />} />
          <Route path={TOOLS_PATH} element={<WorkspaceSectionPage />} />
          <Route path={SETTINGS_PATH} element={<WorkspaceSectionPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
