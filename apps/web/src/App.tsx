import { Route, Routes } from "react-router-dom";

import { AuthVaultProvider } from "./auth/AuthVaultContext";
import { LocaleProvider } from "./locale/LocaleContext";
import AuthEmailPage from "./pages/auth/AuthEmailPage";
import AuthOtpPage from "./pages/auth/AuthOtpPage";
import AuthRegistrationPage from "./pages/auth/AuthRegistrationPage";
import AuthTwoFactorPage from "./pages/auth/AuthTwoFactorPage";
import UnlockPasswordPage from "./pages/unlock/UnlockPasswordPage";
import DevUIGallery from "./pages/DevUIGallery";
import Home from "./pages/Home";
import WorkspacesPage from "./pages/workspaces/WorkspacesPage";
import WorkspaceDetailPage from "./pages/workspaces/WorkspaceDetailPage";

export default function App() {
  return (
    <LocaleProvider>
      <AuthVaultProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dev/ui" element={<DevUIGallery />} />
          <Route path="/auth/email" element={<AuthEmailPage />} />
          <Route path="/auth/otp" element={<AuthOtpPage />} />
          <Route path="/auth/registration" element={<AuthRegistrationPage />} />
          <Route path="/auth/two-factor" element={<AuthTwoFactorPage />} />
          <Route path="/unlock/password" element={<UnlockPasswordPage />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        </Routes>
      </AuthVaultProvider>
    </LocaleProvider>
  );
}
