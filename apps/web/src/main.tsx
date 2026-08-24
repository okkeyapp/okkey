import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { initCrypto } from "@okkey/crypto";
import "./index.css";
import App from "./App.tsx";
import { applyLocaleToDocument, readStoredLocale } from "./locale/localeStorage";
import { applyStoredTheme } from "./theme/applyTheme";
import { captureCapsuleFragmentKey } from "./capsules/fragmentKey";

applyStoredTheme();
applyLocaleToDocument(readStoredLocale());

const capsulePathMatch = window.location.pathname.match(/^\/capsule\/([^/]+)\/?$/u);
if (capsulePathMatch?.[1]) {
  captureCapsuleFragmentKey(capsulePathMatch[1]);
}

const root = document.getElementById("root")!;

void initCrypto().then(() => {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
