// The documentation (built by Sphinx and served by the server at /docs/),
// shown in a frame below the app's menu. The page being read is kept in the
// address bar as #/docs/<page>, so it can be bookmarked or shared.

import { useRef, useState } from "react";

const DOCS_ROOT = "/docs/";

/** The docs page shown in the frame, relative to /docs/, or null outside the docs. */
function docsPage(pathname: string): string | null {
  return pathname.startsWith(DOCS_ROOT) ? pathname.slice(DOCS_ROOT.length) : null;
}

export function DocsPage({ page }: { page: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const src = DOCS_ROOT + page;
  // The page shown now, which changes as links in the frame are followed.
  const [shown, setShown] = useState(page);

  // Follow navigation inside the frame. replaceState doesn't fire hashchange,
  // so the frame isn't reloaded.
  const onLoad = () => {
    let current: string | null = null;
    try {
      current = docsPage(frame.current?.contentWindow?.location.pathname ?? "");
    } catch {
      // A link to another site: its address can't be read from here.
    }
    if (current === null) return;
    setShown(current);
    history.replaceState(null, "", `#/docs/${current}`);
  };

  return (
    <main className="docs-page">
      <div className="docs-bar">
        <a className="link" href={DOCS_ROOT + shown} target="_blank" rel="noreferrer">
          Open in a new tab
        </a>
      </div>
      <iframe ref={frame} className="docs-frame" title="Documentation" src={src} onLoad={onLoad} />
    </main>
  );
}
