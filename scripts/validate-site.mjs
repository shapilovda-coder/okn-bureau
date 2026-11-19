import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { extname } from "node:path";
import { readRouteMap } from "./site-routes.mjs";

const ORIGIN = "https://oknproekt.ru";
const errors = [];
const routes = await readRouteMap();
const routeByPath = new Map(routes.map((route) => [route.source, route.destination]));
const pageIds = new Map();
const titles = new Map();
const descriptions = new Map();
for (const { source, destination } of routes) {
  try {
    const html = await readFile(destination, "utf8");
    pageIds.set(source, new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1])));
  } catch { /* The main pass reports missing files. */ }
}

function fail(message) {
  errors.push(message);
}

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function decodeText(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleText(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  return decodeText(
    body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " "),
  );
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

for (const { source: route, destination } of routes) {
  if (!(await exists(destination))) {
    fail(`${route}: отсутствует ${destination}`);
    continue;
  }

  if (extname(destination) !== ".html") continue;

  const html = await readFile(destination, "utf8");
  const text = visibleText(html);
  const h1Count = count(html, /<h1\b/gi);
  const titleCount = count(html, /<title\b/gi);
  const canonicalMatches = [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi)];
  const expectedCanonical = route === "/" ? `${ORIGIN}/` : `${ORIGIN}${route}`;

  if (h1Count !== 1) fail(`${route}: H1=${h1Count}`);
  if (titleCount !== 1) fail(`${route}: Title=${titleCount}`);
  const title = decodeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim() || "";
  for (const [label, value, seen] of [["Title", title, titles], ["Description", description, descriptions]]) {
    if (!value) fail(`${route}: пустой ${label}`);
    else if (seen.has(value)) fail(`${route}: ${label} совпадает с ${seen.get(value)}`);
    else seen.set(value, route);
  }
  if (canonicalMatches.length !== 1) {
    fail(`${route}: canonical=${canonicalMatches.length}`);
  } else if (canonicalMatches[0][1] !== expectedCanonical) {
    fail(`${route}: canonical ${canonicalMatches[0][1]} вместо ${expectedCanonical}`);
  }

  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";
  if (/noindex/i.test(robots)) fail(`${route}: accidental noindex`);

  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const schemas = [];
  for (const [index, block] of jsonLdBlocks.entries()) {
    try {
      const schema = JSON.parse(block[1]);
      schemas.push(...(schema["@graph"] || [schema]));
    } catch (error) {
      fail(`${route}: JSON-LD ${index + 1}: ${error.message}`);
    }
  }

  for (const faq of schemas.filter((schema) => schema["@type"] === "FAQPage")) {
    for (const [index, entity] of (faq.mainEntity || []).entries()) {
      const question = decodeText(entity?.name || "");
      const answer = decodeText(entity?.acceptedAnswer?.text || "");
      if (!question || !text.includes(question)) fail(`${route}: FAQ вопрос ${index + 1} не виден на странице`);
      if (!answer || !text.includes(answer)) fail(`${route}: FAQ ответ ${index + 1} не совпадает с видимым текстом`);
    }
  }

  const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)]
    .map((match) => match[1])
    .filter((value) => value.startsWith("/") && /\.(?:css|js|png|jpe?g|webp|svg|gif|ico|mp4|woff2?)$/i.test(value));

  for (const asset of new Set(assetPaths)) {
    if (!(await exists(asset.slice(1)))) fail(`${route}: отсутствует ресурс ${asset}`);
  }

  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((value) => (value.startsWith("/") && !value.startsWith("//")) || value.startsWith("#"));

  for (const href of new Set(links)) {
    const target = new URL(href, `${ORIGIN}${route}`);
    const pathname = target.pathname.replace(/\/$/, "") || "/";
    if (routeByPath.has(pathname)) {
      if (target.hash && !pageIds.get(pathname)?.has(decodeURIComponent(target.hash.slice(1)))) {
        fail(`${route}: отсутствует якорь ${href}`);
      }
      continue;
    }
    if (extname(pathname) && (await exists(pathname.slice(1)))) continue;
    fail(`${route}: внутренняя ссылка без маршрута ${href}`);
  }
}

const sitemap = await readFile("sitemap.xml", "utf8");
const sitemapRoutes = [...sitemap.matchAll(/<loc>https:\/\/oknproekt\.ru([^<]*)<\/loc>/g)]
  .map((match) => match[1] || "/")
  .map((route) => route.replace(/\/$/, "") || "/");
const routeNames = [...routeByPath.keys()].sort();
const sitemapNames = [...new Set(sitemapRoutes)].sort();
if (JSON.stringify(routeNames) !== JSON.stringify(sitemapNames)) {
  fail("sitemap.xml и routeMap содержат разные URL");
}

const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
const vercelRoutes = new Map((vercel.rewrites || []).map((rewrite) => [rewrite.source, rewrite.destination.replace(/^\//, "")]));
for (const { source, destination } of routes) {
  if (vercelRoutes.get(source) !== destination) fail(`${source}: маршрут Vercel не синхронизирован`);
}
if (vercelRoutes.size !== routes.length) fail("vercel.json содержит лишние маршруты");
const robotHeader = (vercel.headers || []).flatMap((entry) => entry.headers || []).find((header) => header.key.toLowerCase() === "x-robots-tag");
if (!robotHeader || !/noindex/i.test(robotHeader.value)) fail("Vercel Preview не защищён X-Robots-Tag: noindex");

const nginx = await readFile("deploy/nginx/oknproekt.ru.conf", "utf8");
for (const { source, destination } of routes) {
  const redirect = `location = /${destination} { return 301 ${ORIGIN}${source}$is_args$args; }`;
  if (!nginx.includes(redirect)) fail(`${source}: nginx не перенаправляет /${destination} на canonical`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${routes.length} routes and ${sitemapNames.length} sitemap URLs.`);
