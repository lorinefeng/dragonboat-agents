import { serve } from "@hono/node-server";
import { createDemoApi } from "./demoApi";

const port = Number(process.env.PORT ?? 8787);
const app = createDemoApi();

serve({
  fetch: app.fetch,
  port
});

console.log(`DragonBoat demo API listening on http://127.0.0.1:${port}`);
