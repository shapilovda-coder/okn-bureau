import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR || process.cwd());
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "144216447";
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "dmitry_helper_bot";
const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 5;

const routeMap = new Map([
  ["/", "index.html"],
  ["/blog", "blog-static.html"],
  ["/blog/arendator-obekta-kulturnogo-naslediya", "blog-arendator-okn.html"],
  ["/blog/sobstvennik-obekta-kulturnogo-naslediya-chto-delat", "blog-sobstvennik-okn.html"],
  ["/blog/federalnyy-zakon-180-fz-okn-2027", "blog-180-fz-okn-2027.html"],
  ["/blog/investicii-v-obekty-kulturnogo-naslediya-kak-klass-aktivov", "blog-investicii-okn.html"],
  ["/blog/predpisaniya-i-shtrafy-po-okn-chto-delat-sobstvenniku", "blog-predpisaniya-okn.html"],
  ["/blog/predmet-ohrany-okn", "blog-predmet-ohrany-okn.html"],
  ["/blog/akt-tehnicheskogo-sostoyaniya-okn", "blog-akt-tehsostoyaniya-okn.html"],
  ["/blog/remont-v-obekte-kulturnogo-naslediya", "blog-remont-okn.html"],
  ["/blog/istoriko-kulturnaya-ekspertiza-okn-kogda-nuzhna-gike", "blog-gike-okn.html"],
  ["/blog/zadanie-na-provedenie-rabot-po-sohraneniyu-okn", "blog-zadanie-na-raboty-okn.html"],
  ["/cases", "cases-static.html"],
  ["/contacts", "contacts-static.html"],
  ["/pereplanirovka-okn", "service-pereplanirovka.html"],
  ["/razdel-obespecheniya-sohrannosti-okn", "service-sohrannost.html"],
  ["/proekt-restavratsii-okn", "service-restavratsiya.html"],
  ["/proekt-prisposobleniya-okn", "service-prisposoblenie.html"],
  ["/soglasovanie-mosgornasledie", "service-soglasovanie.html"],
  ["/ohrannoe-obyazatelstvo-okn", "service-ohrannoe.html"],
  ["/kapitalnyy-remont-okn", "service-kapremont.html"],
  ["/rekonstruktsiya-obekta-kulturnogo-naslediya", "service-rekonstruktsiya.html"],
  ["/obsledovanie-obektov-kulturnogo-naslediya", "service-obsledovanie.html"],
  ["/istoriko-kulturnaya-ekspertiza-okn", "service-gike.html"],
  ["/razreshenie-na-provedenie-rabot-po-sohraneniyu-okn", "service-razreshenie-dkn.html"],
  ["/o-kompanii", "about-static.html"]
]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const rateStore = new Map();
function sendJson(res, status, payload) {
  res.writeHead(status, {"Content-Type": "application/json; charset=utf-8","Cache-Control": "no-store","X-Content-Type-Options": "nosniff"});
  res.end(JSON.stringify(payload));
}
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateStore.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  hits.push(now);
  rateStore.set(ip, hits);
  return hits.length > RATE_LIMIT;
}
function sanitize(value, maxLength = 1000) { return String(value || "").replace(/[<>]/g, "").trim().slice(0, maxLength); }
function validateLead(data) {
  const name = sanitize(data.name, 120);
  const phone = sanitize(data.phone, 80);
  const service = sanitize(data.service, 160);
  const description = sanitize(data.description, 1200);
  const websiteUrl = sanitize(data.website_url, 200);
  if (websiteUrl) return { ok: false, bot: true };
  if (!name) return { ok: false, error: "Укажите имя" };
  if (!/^[\d\s()+-]{7,}$/.test(phone)) return { ok: false, error: "Укажите корректный телефон" };
  return { ok: true, lead: { name, phone, service, description } };
}
function formatTelegramMessage(lead, ip) {
  return ["Новая заявка с oknproekt.ru","",`Имя: ${lead.name}`,`Телефон: ${lead.phone}`,`Задача: ${lead.service || "не указана"}`,"",`Описание: ${lead.description || "не указано"}`,"",`IP: ${ip}`,`Бот: @${TELEGRAM_BOT_USERNAME}`].join("\n");
}
async function sendToTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true})});
  if (!response.ok) throw new Error(`Telegram API error: ${response.status} ${await response.text()}`);
}
async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error("Request body is too large");
  }
  return JSON.parse(body || "{}");
}
async function handleLead(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  const ip = getClientIp(req);
  if (isRateLimited(ip)) return sendJson(res, 429, { ok: false, error: "Too many requests" });
  try {
    const data = await readJsonBody(req);
    const validation = validateLead(data);
    if (validation.bot) return sendJson(res, 200, { ok: true });
    if (!validation.ok) return sendJson(res, 400, { ok: false, error: validation.error });
    await sendToTelegram(formatTelegramMessage(validation.lead, ip));
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: "Lead delivery failed" });
  }
}
function resolveStaticPath(pathname) {
  const normalizedPathname = pathname !== "/" ? pathname.replace(/\/+$/, "") || "/" : "/";
  const mapped = routeMap.get(normalizedPathname);
  if (mapped) return join(PUBLIC_DIR, mapped);
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^([.][.][/\\])+/, "");
  return safePath === "/" ? join(PUBLIC_DIR, "index.html") : join(PUBLIC_DIR, safePath);
}
async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end("Forbidden"); return; }
  try {
    const file = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const cacheControl = ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable";
    res.writeHead(200, {"Content-Type": contentTypes[ext] || "application/octet-stream","Cache-Control": cacheControl,"X-Content-Type-Options": "nosniff"});
    res.end(file);
  } catch {
    try {
      const fallback404 = await readFile(join(PUBLIC_DIR, "404.html"));
      res.writeHead(404, {"Content-Type": contentTypes[".html"],"Cache-Control": "no-cache","X-Content-Type-Options": "nosniff"});
      res.end(fallback404);
    } catch {
      res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8","Cache-Control": "no-cache","X-Content-Type-Options": "nosniff"});
      res.end("Not Found");
    }
  }
}
const server = createServer(async (req, res) => {
  if ((req.url || "").startsWith("/api/lead")) return handleLead(req, res);
  await serveStatic(req, res);
});
server.listen(PORT, HOST, () => { console.log(`ОКН.Проект server listening on http://${HOST}:${PORT}`); });
