import React from "react";
import ReactDOM from "react-dom/client";

// Side-effect: registerWasmModulePath before any ensureWasm race from vault UI.
import "../../lib/initExtensionCrypto";
import "@/assets/popup.css";
import { PopupApp } from "./PopupApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
