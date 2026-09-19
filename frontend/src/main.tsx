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
import SignUp from "./(public)/SignUp";
import Register from "./(public)/Register";
import ForgotPassword from "./(public)/ForgotPassword";
import ResetPassword from "./(public)/ResetPassword";
import Onboarding from "./(public)/Onboarding";
import Dashboard from "./(private)/pages/Dashboard";
import PrivateLayout from "./(private)/layout/PrivateLayout";
import Setlists from "./(private)/pages/Setlists";
import Songs from "./(private)/pages/Songs";
import Categories from "./(private)/pages/Categories";
import Settings from "./(private)/pages/Settings";
import Sermon from "./(private)/pages/Sermon";
import Live from "./(private)/pages/Live";
import Output from "./(private)/pages/Output";
import Chat from "./(private)/pages/Chat";
import ApprovalsRedirect from "./(private)/pages/ApprovalsRedirect";
import AdminHome from "./(private)/pages/admin/AdminHome";
import AdminChurches from "./(private)/pages/admin/AdminChurches";
import AdminAccounts from "./(private)/pages/admin/AdminAccounts";
import AdminAudit from "./(private)/pages/admin/AdminAudit";
import RequireActive from "./(private)/RequireActive";
import { PrefsProvider } from "./lib/PrefsContext";
import { ToastProvider } from "./lib/ToastContext";
import ForceUpdate from "./components/ForceUpdate";
import { ensureBibleCacheFresh } from "./lib/bible";
import { invalidateQueries } from "./lib/offline/queryCache";
import { missingSupabaseEnv } from "./lib/supabase";

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

  const routes = [
    {
      element: <Root />,
      children: [
        { path: "/output", element: <Output /> },
        {
          element: <AnimatedOutlet />,
          children: [
            { path: "/", element: <App /> },
            { path: "/welcome", element: <WelcomePage /> },
            { path: "/register", element: <Register /> },
            { path: "/forgot-password", element: <ForgotPassword /> },
            { path: "/reset-password", element: <ResetPassword /> },
            { path: "/signup", element: <SignUp /> },
          ],
        },
        {
          element: <RequireActive />,
          children: [
            { path: "/onboarding", element: <Onboarding /> },
            {
              element: <PrivateLayout />,
              children: [
                { path: "/admin", element: <AdminHome /> },
                {
                  path: "/admin/approvals",
                  element: <ApprovalsRedirect />,
                },
                {
                  path: "/approvals",
                  element: <ApprovalsRedirect />,
                },
                { path: "/admin/churches", element: <AdminChurches /> },
                { path: "/admin/accounts", element: <AdminAccounts /> },
                { path: "/admin/audit", element: <AdminAudit /> },
                { path: "/dashboard", element: <Dashboard /> },
                { path: "/setlists", element: <Setlists /> },
                { path: "/songs", element: <Songs /> },
                { path: "/chat", element: <Chat /> },
                { path: "/categories", element: <Categories /> },
                { path: "/settings", element: <Settings /> },
                { path: "/sermon", element: <Sermon /> },
                { path: "/live", element: <Live /> },
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

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <PrefsProvider>
        <RouterProvider router={router} />
      </PrefsProvider>
    </React.StrictMode>,
  );
}
