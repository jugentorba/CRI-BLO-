import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// APK Forge versions vary in which plain web-output folder they inspect.
// Keep the canonical Vite dist/ output and expose an identical copy.
const root = process.cwd();
const dist = resolve(root, "dist");
const plain = resolve(root, "dist-apkforge");

if (!existsSync(resolve(dist, "index.html"))) {
  console.error("APK Forge postbuild: dist/index.html was not generated.");
  process.exit(1);
}

await rm(plain, { recursive: true, force: true });
await mkdir(plain, { recursive: true });
await cp(dist, plain, { recursive: true });
console.log("APK Forge postbuild: copied dist -> dist-apkforge");
