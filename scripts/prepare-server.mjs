import { cp, access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");

async function requirePath(path, message) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(message);
  }
}

await requirePath(resolve(standalone, "server.js"), "Missing .next/standalone/server.js. Run the Next.js build first.");
await requirePath(resolve(root, "node_modules/.prisma/client"), "Prisma Client has not been generated.");

await mkdir(resolve(standalone, ".next"), { recursive: true });
await cp(resolve(root, "public"), resolve(standalone, "public"), { recursive: true, force: true });
await cp(resolve(root, ".next/static"), resolve(standalone, ".next/static"), { recursive: true, force: true });

console.log("Server bundle prepared at .next/standalone (including traced Prisma Client files).");
