import React from "react";
import ReactDOM from "react-dom/client";

import "../../assets/popup.css";
import { PopupShell } from "./PopupShell";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Okkey extension popup root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PopupShell />
  </React.StrictMode>,
);
