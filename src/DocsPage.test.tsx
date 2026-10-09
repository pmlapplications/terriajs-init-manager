import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocsPage } from "./DocsPage";

/**
 * Pretends the frame has loaded `pathname` (jsdom doesn't load frames), or a
 * page on another site, whose address the browser won't reveal.
 */
function frameLoads(pathname: string | "another site") {
  const frame = screen.getByTitle("Documentation") as HTMLIFrameElement;
  const contentWindow = {
    get location() {
      if (pathname === "another site") throw new DOMException("Blocked a frame", "SecurityError");
      return { pathname };
    },
  };
  Object.defineProperty(frame, "contentWindow", { configurable: true, value: contentWindow });
  fireEvent.load(frame);
}

describe("DocsPage", () => {
  it("shows the docs home page, or the page asked for", () => {
    const { unmount } = render(<DocsPage page="" />);
    expect(screen.getByTitle("Documentation")).toHaveAttribute("src", "/docs/");
    unmount();
    render(<DocsPage page="user-guide/catalog.html" />);
    expect(screen.getByTitle("Documentation")).toHaveAttribute("src", "/docs/user-guide/catalog.html");
    expect(screen.getByRole("link", { name: "Open in a new tab" })).toHaveAttribute("href", "/docs/user-guide/catalog.html");
  });

  it("keeps the address bar and new-tab link on the page being read", () => {
    location.hash = "#/docs";
    render(<DocsPage page="" />);
    frameLoads("/docs/deployment/database.html");
    expect(location.hash).toBe("#/docs/deployment/database.html");
    expect(screen.getByRole("link", { name: "Open in a new tab" })).toHaveAttribute("href", "/docs/deployment/database.html");
  });

  it("leaves the address alone for pages outside the docs", () => {
    location.hash = "#/docs/index.html";
    render(<DocsPage page="index.html" />);
    frameLoads("/elsewhere");
    expect(location.hash).toBe("#/docs/index.html");
    frameLoads("another site");
    expect(location.hash).toBe("#/docs/index.html");
  });
});
