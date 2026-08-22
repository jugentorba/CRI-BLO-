import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("CRI BLO: root element #root is missing");

function BootstrapError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return (
    <div style={{ minHeight: "100vh", boxSizing: "border-box", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111", overflow: "auto" }}>
      <h1 style={{ marginBottom: 12 }}>CRI BLO — startup error</h1>
      <p style={{ marginBottom: 12 }}>The application could not load its interface.</p>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f5f5f5", padding: 16, borderRadius: 12 }}>{message}{stack ? "\n\n" + stack : ""}</pre>
    </div>
  );
}

const appRoot = createRoot(root);

document.documentElement.lang = "fr";

// Register the lightweight runtime cache only in production. It makes the PWA
// reopen offline after the shell/chunks have been visited once, including in
// Android WebView/APK wrappers.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error) => {
    console.warn("CRI BLO service worker registration failed", error);
  });
}

// Keep the router out of the initial static module graph. In an Android WebView,
// a failure in any route/module dependency can otherwise happen before React
// renders anything, producing an indistinguishable blank screen.
Promise.all([import("./router"), import("@tanstack/react-router")])
  .then(([{ getRouter }, { RouterProvider }]) => {
    const router = getRouter();
    appRoot.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  })
  .catch((error) => {
    console.error("CRI BLO startup failure", error);
    appRoot.render(
      <StrictMode>
        <BootstrapError error={error} />
      </StrictMode>,
    );
  });

