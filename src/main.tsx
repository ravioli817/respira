// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
