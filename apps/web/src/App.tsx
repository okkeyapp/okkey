import { Fragment, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AuthSessionGate from "./auth/AuthSessionGate";
import { AuthVaultProvider, useAuthVault } from "./auth/AuthVaultContext";
import ProtectedVaultLayout from "./auth/ProtectedVaultLayout";
import { LocaleProvider } from "./locale/LocaleContext";
import AuthEmailPage from "./pages/auth/AuthEmailPage";
import AuthOtpPage from "./pages/auth/AuthOtpPage";
import AuthRegistrationPage from "./pages/auth/AuthRegistrationPage";
import AuthTwoFactorPage from "./pages/auth/AuthTwoFactorPage";
import UnlockPasswordPage from "./pages/unlock/UnlockPasswordPage";
import DevUIGallery from "./pages/DevUIGallery";
import WorkspacesPage from "./pages/workspaces/WorkspacesPage";
import WorkspaceDetailPage from "./pages/workspaces/WorkspaceDetailPage";

function RootRedirect() {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    return <Navigate to="/workspaces" replace />;
  }
  return <Navigate to="/auth/email" replace />;
}

/** Экраны входа/регистрации только без Bearer-сессии (без ожидания эффектов). */
function GuestAuthOnly({ children }: { children: ReactNode }) {
  const { accessToken } = useAuthVault();
  if (accessToken) {
    return <Navigate to="/workspaces" replace />;
  }
  return children;
}

export default function App() {
  return (
    <LocaleProvider>
      <AuthVaultProvider>
        <Fragment>
          <AuthSessionGate />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/dev/ui" element={<DevUIGallery />} />
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
            <Route
              path="/auth/registration"
              element={
                <GuestAuthOnly>
                  <AuthRegistrationPage />
                </GuestAuthOnly>
              }
            />
            <Route
              path="/auth/two-factor"
              element={
                <GuestAuthOnly>
                  <AuthTwoFactorPage />
                </GuestAuthOnly>
              }
            />
            <Route path="/unlock/password" element={<UnlockPasswordPage />} />
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
