import { Fragment } from "react";

import AuthSessionGate from "./auth/AuthSessionGate";
import ExtensionAuthHandoffGate from "./auth/ExtensionAuthHandoffGate";
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
          <ExtensionAuthHandoffGate />
          <AppRoutes />
        </Fragment>
      </AuthVaultProvider>
    </LocaleProvider>
  );
}
