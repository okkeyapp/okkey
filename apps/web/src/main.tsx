import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { initCrypto } from "@okkey/crypto";
import "./index.css";
import App from "./App.tsx";
import {
  applyLocaleFromUrlAndStrip,
  applyLocaleToDocument,
  readStoredLocale,
} from "./locale/localeStorage";
import { applyStoredTheme } from "./theme/applyTheme";
import { captureCapsuleFragmentKey } from "./capsules/fragmentKey";
import { syncBackendEnterpriseModules } from "./workspace/syncBackendEnterpriseModules";

applyStoredTheme();
{
  const fromUrl = applyLocaleFromUrlAndStrip();
  applyLocaleToDocument(fromUrl ?? readStoredLocale());
}

const capsulePathMatch = window.location.pathname.match(/^\/capsule\/([^/]+)\/?$/u);
if (capsulePathMatch?.[1]) {
  captureCapsuleFragmentKey(capsulePathMatch[1]);
}

const root = document.getElementById("root")!;

void Promise.all([initCrypto(), syncBackendEnterpriseModules()]).then(() => {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
