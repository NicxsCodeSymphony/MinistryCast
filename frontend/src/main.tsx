import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  createHashRouter,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import AnimatedOutlet from "./components/AnimatedOutlet";
import App from "./App";
import WelcomePage from "./(public)/Welcome";
import PrivateLayout from "./(private)/layout/PrivateLayout";
import RequireActive from "./(private)/RequireActive";
import { PrefsProvider } from "./lib/PrefsContext";
import { ToastProvider } from "./lib/ToastContext";
import ForceUpdate from "./components/ForceUpdate";
import { ensureBibleCacheFresh } from "./lib/bible";
import { invalidateQueries } from "./lib/offline/queryCache";
import { missingSupabaseEnv } from "./lib/supabase";
import { applyPalette, readStoredPalette } from "./lib/palettes";

// Declared before bootApp() runs below (page() registers into this list).
type PageModule = { default: React.ComponentType };
const pageLoaders: Array<() => Promise<PageModule>> = [];
const CHUNK_RELOAD_KEY = "mc.chunkReloadAt";

// Apply the saved color palette before first paint (no flash of default colors).
applyPalette(readStoredPalette());

const root = document.getElementById("root") as HTMLElement;

if (missingSupabaseEnv) {
  ReactDOM.createRoot(root).render(
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#0B0B14",
        color: "#f4f4f5",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <p style={{ letterSpacing: "0.2em", fontSize: 11, color: "#4FACFE" }}>
          MINISTRYCAST
        </p>
        <h1 style={{ fontSize: 22, marginTop: 16 }}>App config missing</h1>
        <p style={{ marginTop: 12, color: "#a1a1aa", lineHeight: 1.5 }}>
          This build was compiled without Supabase keys. Set{" "}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{" "}
          in GitHub Actions secrets, then publish a new desktop release.
        </p>
      </div>
    </div>,
  );
} else {
  bootApp();
}

/**
 * Route-level code splitting: the sign-in screen, route guard and app shell
 * stay in the entry chunk; every other page is its own chunk, loaded when the
 * route opens.
 */

function page(load: () => Promise<PageModule>) {
  pageLoaders.push(load);
  return async () => {
    try {
      return { Component: (await load()).default };
    } catch (err) {
      // A new web deploy removed this chunk's old hash: reload once to pick up
      // the current build instead of showing a broken page.
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (navigator.onLine && Date.now() - last > 60_000) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return new Promise<never>(() => undefined);
      }
      throw err;
    }
  };
}

/**
 * Web only: once the app is idle, pull the remaining page chunks (static app
 * code from our own origin; no API calls, no data) so pages still open if the
 * connection drops mid-session. The desktop app serves chunks from disk.
 */
function warmPageChunks() {
  const idle = (run: () => void) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 5_000 });
    } else {
      setTimeout(run, 1_500);
    }
  };
  const queue = [...pageLoaders];
  const next = () => {
    const load = queue.shift();
    if (!load) {
      // Marker for tests/diagnostics: every page can now open offline.
      document.documentElement.dataset.pagesReady = "1";
      return;
    }
    if (!navigator.onLine) return;
    void load()
      .catch(() => undefined)
      .finally(() => idle(next));
  };
  // First idle moment after load: requestIdleCallback only runs when the
  // main thread has nothing else to do, so it never competes with the UI.
  const start = () => idle(next);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

function bootApp() {
  void ensureBibleCacheFresh().then(() => invalidateQueries());

  function Root() {
    return (
      <ToastProvider>
        <ForceUpdate />
        <Outlet />
      </ToastProvider>
    );
  }

  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const projectorGlobals = window as Window & {
    __MC_IS_PROJECTOR__?: boolean;
    __MC_OUTPUT__?: string;
  };

  function readProjectorId() {
    try {
      return (
        projectorGlobals.__MC_OUTPUT__ ||
        sessionStorage.getItem("mc.outputPresentation") ||
        ""
      );
    } catch {
      return projectorGlobals.__MC_OUTPUT__ || "";
    }
  }

  function ensureProjectorRoute(presentationId: string) {
    if (!presentationId || window.location.hash.includes("/output")) return;
    window.location.hash = `#/output?presentation=${encodeURIComponent(presentationId)}`;
  }

  const flaggedProjector = Boolean(projectorGlobals.__MC_IS_PROJECTOR__);
  const projectorId = flaggedProjector ? readProjectorId() : "";
  if (isTauri && flaggedProjector) {
    ensureProjectorRoute(projectorId);
  }

  // Windows WebView2 can miss the init-script flag; recover via window label.
  if (isTauri && !flaggedProjector) {
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        if (getCurrentWindow().label !== "projector") return;
        projectorGlobals.__MC_IS_PROJECTOR__ = true;
        const id = readProjectorId();
        if (id) projectorGlobals.__MC_OUTPUT__ = id;
        ensureProjectorRoute(id);
      })
      .catch(() => undefined);
  }

  const approvalsRedirect = page(() => import("./(private)/pages/ApprovalsRedirect"));

  const routes = [
    {
      element: <Root />,
      children: [
        { path: "/output", lazy: page(() => import("./(private)/pages/Output")) },
        {
          element: <AnimatedOutlet />,
          children: [
            { path: "/", element: <App /> },
            { path: "/welcome", element: <WelcomePage /> },
            { path: "/register", lazy: page(() => import("./(public)/Register")) },
            { path: "/forgot-password", lazy: page(() => import("./(public)/ForgotPassword")) },
            { path: "/reset-password", lazy: page(() => import("./(public)/ResetPassword")) },
            { path: "/signup", lazy: page(() => import("./(public)/SignUp")) },
          ],
        },
        {
          element: <RequireActive />,
          children: [
            { path: "/onboarding", lazy: page(() => import("./(public)/Onboarding")) },
            {
              element: <PrivateLayout />,
              children: [
                { path: "/admin", lazy: page(() => import("./(private)/pages/admin/AdminHome")) },
                { path: "/admin/approvals", lazy: approvalsRedirect },
                { path: "/approvals", lazy: approvalsRedirect },
                { path: "/admin/churches", lazy: page(() => import("./(private)/pages/admin/AdminChurches")) },
                { path: "/admin/accounts", lazy: page(() => import("./(private)/pages/admin/AdminAccounts")) },
                { path: "/admin/audit", lazy: page(() => import("./(private)/pages/admin/AdminAudit")) },
                { path: "/dashboard", lazy: page(() => import("./(private)/pages/Dashboard")) },
                { path: "/setlists", lazy: page(() => import("./(private)/pages/Setlists")) },
                { path: "/songs", lazy: page(() => import("./(private)/pages/Songs")) },
                { path: "/chat", lazy: page(() => import("./(private)/pages/Chat")) },
                { path: "/categories", lazy: page(() => import("./(private)/pages/Categories")) },
                { path: "/settings", lazy: page(() => import("./(private)/pages/Settings")) },
                { path: "/sermon", lazy: page(() => import("./(private)/pages/Sermon")) },
                { path: "/live", lazy: page(() => import("./(private)/pages/Live")) },
              ],
            },
          ],
        },
      ],
    },
  ];

  const router = isTauri
    ? createHashRouter(routes)
    : createBrowserRouter(routes, { basename });

  if (!isTauri) warmPageChunks();

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <PrefsProvider>
        <RouterProvider router={router} />
      </PrefsProvider>
    </React.StrictMode>,
  );
}
