import React from "react";
import ReactDOM from "react-dom/client";

import "@/assets/http-auth-prompt.css";
import { HttpAuthPromptApp } from "./HttpAuthPromptApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HttpAuthPromptApp />
  </React.StrictMode>,
);
