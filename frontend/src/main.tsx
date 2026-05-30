import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import WelcomePage from "./(public)/Welcome";
import Dashboard from "./(private)/pages/Dashboard";
import PrivateLayout from "./(private)/layout/PrivateLayout";
import Setlists from "./(private)/pages/Setlists";
import Songs from "./(private)/pages/Songs";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route element={<PrivateLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setlists" element={<Setlists />} />
          <Route path="/songs" element={<Songs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
