// The app version, from package.json (see docs/development/releasing.md).

import { readFileSync } from "node:fs";

export const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
