import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import WelcomePage from "./(public)/Welcome";
import SignUp from "./(public)/SignUp";
import Dashboard from "./(private)/pages/Dashboard";
import PrivateLayout from "./(private)/layout/PrivateLayout";
import Setlists from "./(private)/pages/Setlists";
import Songs from "./(private)/pages/Songs";
import Categories from "./(private)/pages/Categories";
import Settings from "./(private)/pages/Settings";
import Sermon from "./(private)/pages/Sermon";
import Live from "./(private)/pages/Live";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/live" element={<Live />} />
        <Route element={<PrivateLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setlists" element={<Setlists />} />
          <Route path="/songs" element={<Songs />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/sermon" element={<Sermon />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
