import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installBrowserPolyfills } from "./browser-polyfills";
import "./styles.css";

installBrowserPolyfills();

const root = document.getElementById("root")!;

void import("./App")
  .then(({ default: App }) => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("Application startup failed", error);
    root.textContent = "Application startup failed. Check the browser console and reload after fixing the error.";
    root.className = "startup-error";
  });
