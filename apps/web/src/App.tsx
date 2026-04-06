import { Route, Routes } from "react-router-dom";

import { LocaleProvider } from "./locale/LocaleContext";
import AuthEmailPage from "./pages/auth/AuthEmailPage";
import AuthOtpPage from "./pages/auth/AuthOtpPage";
import AuthRegistrationPage from "./pages/auth/AuthRegistrationPage";
import UnlockPasswordPage from "./pages/unlock/UnlockPasswordPage";
import DevUIGallery from "./pages/DevUIGallery";
import Home from "./pages/Home";
import WorkspacesPage from "./pages/workspaces/WorkspacesPage";

export default function App() {
  return (
    <LocaleProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dev/ui" element={<DevUIGallery />} />
        <Route path="/auth/email" element={<AuthEmailPage />} />
        <Route path="/auth/otp" element={<AuthOtpPage />} />
        <Route path="/auth/registration" element={<AuthRegistrationPage />} />
        <Route path="/unlock/password" element={<UnlockPasswordPage />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
      </Routes>
    </LocaleProvider>
  );
}
