import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { readRouteMap } from "./site-routes.mjs";

const routes = await readRouteMap();
const root = resolve(process.env.TEST_PUBLIC_DIR || ".");
let child;
let origin;

before(async () => {
  child = spawn(process.execPath, [resolve(root, "server/server.js")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", PUBLIC_DIR: root, TELEGRAM_BOT_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (chunk) => { logs += chunk; });
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${logs}`)), 5000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}, ${logs}`)); });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { origin = match[0]; clearTimeout(timer); done(); }
    });
  });
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
});

test("all canonical pages return their expected HTML without redirects", async () => {
  for (const { source, destination } of routes) {
    const response = await fetch(origin + source, { redirect: "manual" });
    assert.equal(response.status, 200, source);
    assert.equal(await response.text(), await readFile(resolve(root, destination), "utf8"), source);
  }
});

test("every HTML alias and trailing slash redirects to its canonical URL, preserving query parameters", async () => {
  for (const { source, destination } of routes) {
    const paths = [`/${destination}`, `/${destination}/`];
    if (source !== "/") paths.push(`${source}/`);
    for (const path of paths) {
      const response = await fetch(origin + path + "?utm_source=audit&ref=1", { redirect: "manual" });
      assert.equal(response.status, 301, path);
      assert.equal(response.headers.get("location"), source + "?utm_source=audit&ref=1", path);
      await response.text();
    }
  }
});

test("malformed encoded URLs return 400 and do not stop the server", async () => {
  for (const path of ["/%", "/%E0%A4%A", "/%00"]) {
    const bad = await fetch(origin + path);
    assert.equal(bad.status, 400, path);
    await bad.text();
    const healthy = await fetch(origin + "/");
    assert.equal(healthy.status, 200);
    await healthy.text();
    assert.equal(child.exitCode, null);
  }
});

test("unknown pages are 404 and crawl control files must revalidate", async () => {
  const missing = await fetch(origin + "/page-that-must-not-exist-audit");
  assert.equal(missing.status, 404);
  await missing.text();
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    await response.text();
  }
});

test("lead endpoint retains its read-only method rejection", async () => {
  const response = await fetch(origin + "/api/lead");
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { ok: false, error: "Method not allowed" });
});
