import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { TrayWidget } from "./widgets/tray-widget/ui/TrayWidget";
import "./app/styles/index.css";

const isTrayWidgetView =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("view") === "tray-widget";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isTrayWidgetView ? <TrayWidget /> : <App />}
  </React.StrictMode>,
);
