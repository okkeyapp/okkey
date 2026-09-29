import workspaceTenancyModule from "@okkey-enterprise/workspace-tenancy";
import workspaceMembersModule from "@okkey-enterprise/workspace-members";
import legalModule from "@okkey-enterprise/legal";
import { Spinner } from "@okkey/ui";
import { type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuthVault } from "../auth/AuthVaultContext";
import { hasExtensionAuthPending } from "../auth/extensionAuthPendingStorage";
import AccountRestorePage from "../pages/account/AccountRestorePage";
import DevicePendingPage from "../pages/account/DevicePendingPage";
import AuthEmailPage from "../pages/auth/AuthEmailPage";
import AuthOtpPage from "../pages/auth/AuthOtpPage";
import AuthRegistrationPage from "../pages/auth/AuthRegistrationPage";
import AuthTwoFactorPage from "../pages/auth/AuthTwoFactorPage";
import AuthWebAuthnPage from "../pages/auth/AuthWebAuthnPage";
import ExtensionAuthStartPage from "../pages/auth/ExtensionAuthStartPage";
import DevUIAlertPage from "../pages/dev-ui/DevUIAlertPage";
import DevUIBreadcrumbPage from "../pages/dev-ui/DevUIBreadcrumbPage";
import DevUITooltipPage from "../pages/dev-ui/DevUITooltipPage";
import DevUIButtonPage from "../pages/dev-ui/DevUIButtonPage";
import DevUIControlGroupingPage from "../pages/dev-ui/DevUIControlGroupingPage";
import DevUIFoundationPage from "../pages/dev-ui/DevUIFoundationPage";
import DevUIGalleryLayout from "../pages/dev-ui/DevUIGalleryLayout";
import DevUIInputPage from "../pages/dev-ui/DevUIInputPage";
import DevUIKeyFormPage from "../pages/dev-ui/DevUIKeyFormPage";
import DevUIPopupPage from "../pages/dev-ui/DevUIPopupPage";
import DevUISelectPage from "../pages/dev-ui/DevUISelectPage";
import DevUISidebarPage from "../pages/dev-ui/DevUISidebarPage";
import DevUISpinnerPage from "../pages/dev-ui/DevUISpinnerPage";
import DevUISwitchPage from "../pages/dev-ui/DevUISwitchPage";
import DevUIFaviconPage from "../pages/dev-ui/DevUIFaviconPage";
import DevUIWorkspaceTilePage from "../pages/dev-ui/DevUIWorkspaceTilePage";
import UnlockPasswordPage from "../pages/unlock/UnlockPasswordPage";
import LegacyWorkspaceNestedRedirect from "../pages/workspace/LegacyWorkspaceNestedRedirect";
import WorkspaceNotFoundPage from "../pages/workspace/WorkspaceNotFoundPage";
import WorkspaceSectionPage from "../pages/workspace/WorkspaceSectionPage";
import SettingsIndexRedirect from "../pages/workspace/SettingsIndexRedirect";
import PersonalDevicesSettingsRedirect from "../pages/workspace/PersonalDevicesSettingsRedirect";
import ToolsIndexRedirect from "../pages/workspace/ToolsIndexRedirect";
import WorkspacesPage from "../pages/workspaces/WorkspacesPage";
import ProtectedVaultLayout from "../auth/ProtectedVaultLayout";
import WorkspaceRoutesLayout from "../workspace/WorkspaceRoutesLayout";
import PublicCapsulePage from "../pages/capsules/PublicCapsulePage";
import {
  ACCOUNT_DEVICE_PENDING_PATH,
  ACCOUNT_LOCK_PATH,
  ACCOUNT_NEW_PATH,
  ACCOUNT_RESTORE_PATH,
  AUTH_EMAIL_PATH,
  AUTH_EXTENSION_START_PATH,
  AUTH_OTP_PATH,
  AUTH_REGISTRATION_LEGACY_PATH,
  AUTH_TWO_FACTOR_PATH,
  AUTH_WEBAUTHN_PATH,
  CAPSULES_PATH,
  CAPSULE_PUBLIC_PATH_PATTERN,
  DEFAULT_AUTHENTICATED_PATH,
  DEV_UI_BASE_PATH,
  INVITE_PATH_PATTERN,
  ITEMS_PATH,
  LEGACY_WORKSPACE_DETAIL_PATH_PATTERN,
  MONITORING_PATH,
  PRIVACY_POLICY_LEGACY_PATH,
  PRIVACY_POLICY_PATH,
  ROOT_PATH,
  SETTINGS_DEVICES_PATH,
  SETTINGS_PATH,
  TOOLS_PATH,
  UNLOCK_PASSWORD_LEGACY_PATH,
  WORKSPACES_PATH,
} from "./paths";

function RootRedirect() {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    if (hasExtensionAuthPending()) {
      return <ExtensionHandoffBusy />;
    }
    return <Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />;
  }
  return <Navigate to={AUTH_EMAIL_PATH} replace />;
}

function ExtensionHandoffBusy() {
  return (
    <div
      className="flex min-h-[50vh] w-full items-center justify-center okkey-body text-copy-secondary"
      role="status"
      aria-busy="true"
    >
      <Spinner />
    </div>
  );
}

/** Login/registration screens only when there is no Bearer session (no effect timing). */
function GuestAuthOnly({ children }: { children: ReactNode }) {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    // Extension PKCE: never bounce into vault unlock / workspaces while handoff is pending.
    if (hasExtensionAuthPending()) {
      return <ExtensionHandoffBusy />;
    }
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
        <Route path="key-form" element={<DevUIKeyFormPage />} />
        <Route path="alert" element={<DevUIAlertPage />} />
        <Route path="breadcrumb" element={<DevUIBreadcrumbPage />} />
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
      <Route path={AUTH_EXTENSION_START_PATH} element={<ExtensionAuthStartPage />} />
      <Route
        path={AUTH_WEBAUTHN_PATH}
        element={
          <GuestAuthOnly>
            <AuthWebAuthnPage />
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
      <Route path={ACCOUNT_DEVICE_PENDING_PATH} element={<DevicePendingPage />} />
      <Route path={ACCOUNT_RESTORE_PATH} element={<AccountRestorePage />} />
      <Route path={INVITE_PATH_PATTERN} element={<workspaceMembersModule.InviteLandingPage />} />
      <Route path={PRIVACY_POLICY_PATH} element={<legalModule.PrivacyPolicyPage />} />
      <Route path={PRIVACY_POLICY_LEGACY_PATH} element={<LegacyNavigate to={PRIVACY_POLICY_PATH} />} />
      <Route path={CAPSULE_PUBLIC_PATH_PATTERN} element={<PublicCapsulePage />} />
      <Route element={<ProtectedVaultLayout />}>
        <Route
          path={WORKSPACES_PATH}
          element={
            workspaceTenancyModule.canCreateWorkspace ? (
              <WorkspacesPage />
            ) : (
              <Navigate to={ITEMS_PATH} replace />
            )
          }
        />
        <Route path={LEGACY_WORKSPACE_DETAIL_PATH_PATTERN} element={<LegacyWorkspaceNestedRedirect />} />
        <Route element={<WorkspaceRoutesLayout />}>
          <Route path={ITEMS_PATH} element={<WorkspaceSectionPage />} />
          <Route path={CAPSULES_PATH} element={<WorkspaceSectionPage />} />
          <Route path={MONITORING_PATH} element={<WorkspaceSectionPage />} />
          <Route path={TOOLS_PATH} element={<ToolsIndexRedirect />} />
          <Route path={`${TOOLS_PATH}/:sectionSlug`} element={<WorkspaceSectionPage />} />
          <Route path={SETTINGS_PATH} element={<SettingsIndexRedirect />} />
          <Route path={SETTINGS_DEVICES_PATH} element={<PersonalDevicesSettingsRedirect />} />
          <Route path={`${SETTINGS_PATH}/:sectionSlug`} element={<WorkspaceSectionPage />} />
          <Route path="*" element={<WorkspaceNotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
