// Icons for catalog types, drawn as 24×24 strokes in currentColor.

import type { ReactNode } from "react";
import { iconFor, type IconName } from "./terria/type-categories";

const FOLDER = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";

const PATHS: Record<IconName, ReactNode> = {
  folder: <path d={FOLDER} />,
  folderServer: (
    <>
      <path d={FOLDER} />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8.5 13.5h7M12 10a5.5 5.5 0 0 1 0 7M12 10a5.5 5.5 0 0 0 0 7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  shapes: (
    <>
      <path d="M6 8 13 4l6 6-3 9H7z" />
      <circle cx="6" cy="8" r="1.5" />
      <circle cx="13" cy="4" r="1.5" />
      <circle cx="19" cy="10" r="1.5" />
      <circle cx="16" cy="19" r="1.5" />
      <circle cx="7" cy="19" r="1.5" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
    </>
  ),
  rss: (
    <>
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 4v16" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  cube: <path d="M12 2 21 7v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10" />,
  mountain: <path d="m8 4 4 7 4-4 6 13H2z" />,
  layers: <path d="m12 2 10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5" />,
  stub: <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" />,
};

export function TypeIcon({ type, size = 24 }: { type: string; size?: number }) {
  return (
    <svg
      className="type-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[iconFor(type)]}
    </svg>
  );
}
