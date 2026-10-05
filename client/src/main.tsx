import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./design/fonts";
import "./design/tokens.css";
import "./design/texture.css";
import "./design/station.css";
import "./styles/base.css";
import "./styles/site.css";
import "./styles/ride.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
