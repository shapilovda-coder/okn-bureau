import { readFile } from "node:fs/promises";

export async function readRouteMap(serverPath = "server/server.js") {
  const source = await readFile(serverPath, "utf8");
  const block = source.match(/const routeMap = new Map\(\[([\s\S]*?)\]\);/);

  if (!block) {
    throw new Error(`Не найден routeMap в ${serverPath}`);
  }

  const routes = [];
  const pattern = /\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g;
  let match;

  while ((match = pattern.exec(block[1])) !== null) {
    routes.push({ source: match[1], destination: match[2] });
  }

  if (!routes.length) {
    throw new Error(`routeMap в ${serverPath} пуст`);
  }

  return routes;
}
