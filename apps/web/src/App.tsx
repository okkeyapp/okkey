import { Fragment, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import AuthSessionGate from "./auth/AuthSessionGate";
import { AuthVaultProvider, useAuthVault } from "./auth/AuthVaultContext";
import ProtectedVaultLayout from "./auth/ProtectedVaultLayout";
import { LocaleProvider } from "./locale/LocaleContext";
import AuthEmailPage from "./pages/auth/AuthEmailPage";
import AuthOtpPage from "./pages/auth/AuthOtpPage";
import AuthRegistrationPage from "./pages/auth/AuthRegistrationPage";
import AuthTwoFactorPage from "./pages/auth/AuthTwoFactorPage";
import AccountRestorePage from "./pages/account/AccountRestorePage";
import UnlockPasswordPage from "./pages/unlock/UnlockPasswordPage";
import DevUIAlertPage from "./pages/dev-ui/DevUIAlertPage";
import DevUIButtonPage from "./pages/dev-ui/DevUIButtonPage";
import DevUIControlGroupingPage from "./pages/dev-ui/DevUIControlGroupingPage";
import DevUIFoundationPage from "./pages/dev-ui/DevUIFoundationPage";
import DevUIGalleryLayout from "./pages/dev-ui/DevUIGalleryLayout";
import DevUIInputPage from "./pages/dev-ui/DevUIInputPage";
import DevUISelectPage from "./pages/dev-ui/DevUISelectPage";
import DevUISidebarPage from "./pages/dev-ui/DevUISidebarPage";
import DevUISpinnerPage from "./pages/dev-ui/DevUISpinnerPage";
import DevUISwitchPage from "./pages/dev-ui/DevUISwitchPage";
import DevUIWorkspaceTilePage from "./pages/dev-ui/DevUIWorkspaceTilePage";
import WorkspacesPage from "./pages/workspaces/WorkspacesPage";
import WorkspaceDetailPage from "./pages/workspaces/WorkspaceDetailPage";
import { ACCOUNT_LOCK_PATH, ACCOUNT_NEW_PATH } from "./routes/paths";

function RootRedirect() {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    return <Navigate to="/workspaces" replace />;
  }
  return <Navigate to="/auth/email" replace />;
}

/** Login/registration screens only when there is no Bearer session (no effect timing). */
function GuestAuthOnly({ children }: { children: ReactNode }) {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    return <Navigate to="/workspaces" replace />;
  }
  return children;
}

/** Preserve query string when redirecting legacy routes. */
function LegacyNavigate({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthVaultProvider>
        <Fragment>
          <AuthSessionGate />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/dev/ui" element={<DevUIGalleryLayout />}>
              <Route index element={<DevUIFoundationPage />} />
              <Route path="sidebar" element={<DevUISidebarPage />} />
              <Route path="button" element={<DevUIButtonPage />} />
              <Route path="input" element={<DevUIInputPage />} />
              <Route path="switch" element={<DevUISwitchPage />} />
              <Route path="select" element={<DevUISelectPage />} />
              <Route path="control-grouping" element={<DevUIControlGroupingPage />} />
              <Route path="spinner" element={<DevUISpinnerPage />} />
              <Route path="workspace-tile" element={<DevUIWorkspaceTilePage />} />
              <Route path="alert" element={<DevUIAlertPage />} />
            </Route>
            <Route
              path="/auth/email"
              element={
                <GuestAuthOnly>
                  <AuthEmailPage />
                </GuestAuthOnly>
              }
            />
            <Route
              path="/auth/otp"
              element={
                <GuestAuthOnly>
                  <AuthOtpPage />
                </GuestAuthOnly>
              }
            />
            <Route path={ACCOUNT_NEW_PATH} element={<AuthRegistrationPage />} />
            <Route path="/auth/registration" element={<LegacyNavigate to={ACCOUNT_NEW_PATH} />} />
            <Route
              path="/auth/two-factor"
              element={
                <GuestAuthOnly>
                  <AuthTwoFactorPage />
                </GuestAuthOnly>
              }
            />
            <Route path={ACCOUNT_LOCK_PATH} element={<UnlockPasswordPage />} />
            <Route path="/unlock/password" element={<LegacyNavigate to={ACCOUNT_LOCK_PATH} />} />
            <Route path="/account/restore" element={<AccountRestorePage />} />
            <Route element={<ProtectedVaultLayout />}>
              <Route path="/workspaces" element={<WorkspacesPage />} />
              <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
            </Route>
          </Routes>
        </Fragment>
      </AuthVaultProvider>
    </LocaleProvider>
  );
}
