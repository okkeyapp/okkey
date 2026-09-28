import React from "react";
import ReactDOM from "react-dom/client";

import "@/assets/popup.css";
import { AuthCallbackApp } from "./AuthCallbackApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthCallbackApp />
  </React.StrictMode>,
);
