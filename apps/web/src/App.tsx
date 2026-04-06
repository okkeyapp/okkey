import { Route, Routes } from "react-router-dom";

import AuthEmailPage from "./pages/auth/AuthEmailPage";
import AuthOtpPage from "./pages/auth/AuthOtpPage";
import AuthPasswordPage from "./pages/auth/AuthPasswordPage";
import AuthRegistrationPage from "./pages/auth/AuthRegistrationPage";
import DevUIGallery from "./pages/DevUIGallery";
import Home from "./pages/Home";
import WorkspacesPage from "./pages/workspaces/WorkspacesPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dev/ui" element={<DevUIGallery />} />
      <Route path="/auth/email" element={<AuthEmailPage />} />
      <Route path="/auth/otp" element={<AuthOtpPage />} />
      <Route path="/auth/registration" element={<AuthRegistrationPage />} />
      <Route path="/auth/password" element={<AuthPasswordPage />} />
      <Route path="/workspaces" element={<WorkspacesPage />} />
    </Routes>
  );
}
