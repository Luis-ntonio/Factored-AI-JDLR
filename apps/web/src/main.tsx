import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AdminApp } from "./admin/AdminApp";
import "./styles.css";

// Sin react-router (no está instalado, una sola página admin no lo
// justifica) -- rama simple por pathname antes de montar. CloudFront ya
// tiene un custom_error_response 403/404 -> index.html
// (terraform/modules/frontend/main.tf), así que navegar directo a /admin
// sirve este mismo bundle sin cambios de infra.
const isAdminRoute = window.location.pathname.startsWith("/admin");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isAdminRoute ? <AdminApp /> : <App />}</React.StrictMode>,
);
