import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const output = resolve(process.argv[2] || ".release");
const root = process.cwd();

if (output === root || !basename(output).startsWith(".release")) {
  throw new Error("Release output must be a dedicated .release* directory");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
const rootFiles = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => /\.html$|\.xml$/.test(name) || ["robots.txt", "favicon.ico", "favicon.svg", "package.json"].includes(name));

for (const file of rootFiles) {
  await cp(join(root, file), join(output, file));
}

for (const directory of ["assets", "icons", "server"]) {
  await cp(join(root, directory), join(output, directory), { recursive: true });
}

console.log(`Release assembled in ${output}`);
