// Runs before every frontend test file (vite.config.ts): DOM matchers such as
// toBeInTheDocument, and a clean DOM, storage and fetch for each test.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { closeAllDialogs } from "../dialogs";

// jsdom doesn't lay out pages, so has no scrolling.
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  closeAllDialogs();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  location.hash = "";
});
