import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { applyLocaleToDocument, readStoredLocale } from "./locale/localeStorage";
import { applyStoredTheme } from "./theme/applyTheme";

applyStoredTheme();
applyLocaleToDocument(readStoredLocale());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
