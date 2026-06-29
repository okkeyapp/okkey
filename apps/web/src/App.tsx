import { Fragment } from "react";

import AuthSessionGate from "./auth/AuthSessionGate";
import { AuthVaultProvider } from "./auth/AuthVaultContext";
import { LocaleProvider } from "./locale/LocaleContext";
import AppRoutes from "./routes/AppRoutes";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <LocaleProvider>
      <AuthVaultProvider>
        <Fragment>
          <Toaster />
          <AuthSessionGate />
          <AppRoutes />
        </Fragment>
      </AuthVaultProvider>
    </LocaleProvider>
  );
}
