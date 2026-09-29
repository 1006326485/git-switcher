import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TerminalWindowApp from "./TerminalWindowApp";
import { windowKindFromSearch } from "./lib/windowRoute";
import "./styles/globals.css";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const windowKind = windowKindFromSearch(window.location.search);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      {windowKind === "terminal" ? <TerminalWindowApp /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
