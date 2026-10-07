import { writeFile } from "node:fs/promises";
import { readRouteMap } from "./site-routes.mjs";

const routes = await readRouteMap();
const config = {
  "$schema": "https://openapi.vercel.sh/vercel.json",
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
      ]
    }
  ],
  rewrites: routes.map(({ source, destination }) => ({
    source,
    destination: `/${destination}`
  }))
};

await writeFile("vercel.json", `${JSON.stringify(config, null, 2)}\n`);
console.log(`Vercel routes generated: ${routes.length}`);
