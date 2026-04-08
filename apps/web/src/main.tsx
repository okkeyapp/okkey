import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { initCrypto } from "@okkey/crypto";
import "./index.css";
import App from "./App.tsx";
import { applyLocaleToDocument, readStoredLocale } from "./locale/localeStorage";
import { applyStoredTheme } from "./theme/applyTheme";

applyStoredTheme();
applyLocaleToDocument(readStoredLocale());

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
