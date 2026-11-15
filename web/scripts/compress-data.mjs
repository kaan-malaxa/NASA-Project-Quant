import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Keep source publications readable. The deployed copy uses lossless compression and matching hashes.
const root = new URL("../dist/data/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const changed = new Map();
const fingerprint = (bytes) => ({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const folder = new URL(`${entry.name}/`, root);
  for (const file of await readdir(folder, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith(".json") || file.name.endsWith("_index.json")) continue;
    const path = join(file.parentPath, file.name);
    const original = await readFile(path);
    const compressed = gzipSync(original, { level: 9 });
    if (compressed.length >= original.length) continue;
    await writeFile(path, compressed);
    const name = `${entry.name}/${relative(fileURLToPath(folder), path).replaceAll("\\", "/")}`;
    changed.set(name, fingerprint(compressed));
  }
  for (const name of ["period_index.json", "spatial_index.json"]) {
    const url = new URL(name, folder);
    let index;
    try { index = JSON.parse(await readFile(url, "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const item of index.periods || index.years || []) {
      const hash = changed.get(`${entry.name}/${item.path}`);
      if (hash) Object.assign(item, hash);
    }
    const bytes = Buffer.from(JSON.stringify(index) + "\n");
    await writeFile(url, bytes);
    changed.set(`${entry.name}/${name}`, fingerprint(bytes));
  }
}
for (const entry of manifest.files) {
  const hash = changed.get(entry.path);
  if (hash) Object.assign(entry, hash);
}
await writeFile(new URL("manifest.json", root), JSON.stringify(manifest) + "\n");
console.log(`Compressed ${changed.size} deployed data files.`);
