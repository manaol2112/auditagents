import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// Clickjacking backstop for environments that strip the frame-ancestors header: never render inside a frame.
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
} else {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
}
