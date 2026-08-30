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
import Approvals from "./(private)/pages/Approvals";
import AdminHome from "./(private)/pages/admin/AdminHome";
import AdminChurches from "./(private)/pages/admin/AdminChurches";
import AdminAccounts from "./(private)/pages/admin/AdminAccounts";
import AdminAudit from "./(private)/pages/admin/AdminAudit";
import RequireActive from "./(private)/RequireActive";
import { PrefsProvider } from "./lib/PrefsContext";
import { ToastProvider } from "./lib/ToastContext";
import ForceUpdate from "./components/ForceUpdate";

function Root() {
  return (
    <PrefsProvider>
      <ToastProvider>
        <ForceUpdate />
        <Outlet />
      </ToastProvider>
    </PrefsProvider>
  );
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const isProjectorWindow = Boolean(
  (window as Window & { __MC_IS_PROJECTOR__?: boolean }).__MC_IS_PROJECTOR__,
);
let projectorId = "";
if (isProjectorWindow) {
  try {
    projectorId =
      (window as Window & { __MC_OUTPUT__?: string }).__MC_OUTPUT__ ||
      sessionStorage.getItem("mc.outputPresentation") ||
      "";
  } catch {
    projectorId = (window as Window & { __MC_OUTPUT__?: string }).__MC_OUTPUT__ || "";
  }
}
if (isTauri && isProjectorWindow && projectorId && !window.location.hash.includes("/output")) {
  window.location.hash = `#/output?presentation=${encodeURIComponent(projectorId)}`;
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
          { path: "/live", element: <Live /> },
          {
            element: <PrivateLayout />,
            children: [
              { path: "/admin", element: <AdminHome /> },
              { path: "/admin/approvals", element: <Approvals /> },
              { path: "/admin/churches", element: <AdminChurches /> },
              { path: "/admin/accounts", element: <AdminAccounts /> },
              { path: "/admin/audit", element: <AdminAudit /> },
              { path: "/dashboard", element: <Dashboard /> },
              { path: "/setlists", element: <Setlists /> },
              { path: "/songs", element: <Songs /> },
              { path: "/categories", element: <Categories /> },
              { path: "/settings", element: <Settings /> },
              { path: "/sermon", element: <Sermon /> },
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
