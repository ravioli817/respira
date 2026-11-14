// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The app's typeface, bundled so it works offline and nothing is fetched from another site.
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "./index.css";
import App from "./App.tsx";
import {
  installPracticeMachine,
  practiceRequested,
} from "./practice/practiceMachine";

// ?practice in the address swaps the real machine for a pretend one
if (practiceRequested()) installPracticeMachine();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
