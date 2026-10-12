import React from "react";
import ReactDOM from "react-dom/client";

import "../../lib/initExtensionCrypto";
import "@/assets/extension.css";
import { SavePromptFormApp } from "./SavePromptFormApp";

document.documentElement.style.background = "transparent";
document.body.style.margin = "0";
document.body.style.background = "transparent";
document.body.style.minHeight = "100vh";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SavePromptFormApp />
  </React.StrictMode>,
);
