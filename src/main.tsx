// Must come first: initialising i18next is a side effect of this import, and
// modules imported below may translate strings at module scope.
import "./lib/i18n";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TerminalWindowApp from "./TerminalWindowApp";
import { windowKindFromSearch } from "./lib/windowRoute";
import { syncLanguageFromSettings } from "./hooks/useLanguage";
import "./styles/globals.css";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { installContextMenuGuard } from "./lib/contextMenuGuard";
import { installSpellingPolicy } from "./lib/spellingPolicy";

installContextMenuGuard();
// Both windows type the same kinds of values (branch names, paths, commands),
// so the spelling default is installed at the shared entry point.
installSpellingPolicy();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const windowKind = windowKindFromSearch(window.location.search);

// settings.json wins over the localStorage hint used for the pre-paint frame.
void syncLanguageFromSettings();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      {windowKind === "terminal" ? <TerminalWindowApp /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
