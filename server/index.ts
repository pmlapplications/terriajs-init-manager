// Runs the API server (server/app.ts) on PORT, default 3000.

import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { VERSION } from "./version.ts";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => console.log(`TerriaJS Init Manager ${VERSION} listening on http://localhost:${port}`));
