// Run after changing public files. Checked-in outputs keep GitHub Pages build-free.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file));
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const files = [
  "app.js",
  "scoring.js",
  "sync.js",
  "pwa.js",
  "vendor/supabase-2.118.0.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];
const versioned = new Map(
  files.map((file) => [file, `/${file}?v=${hash(read(file))}`]),
);
const manifest = JSON.parse(read("manifest.webmanifest"));
for (const icon of manifest.icons)
  icon.src = versioned.get(icon.src.split("?")[0].slice(1));
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
versioned.set(
  "manifest.webmanifest",
  `/manifest.webmanifest?v=${hash(manifestText)}`,
);
let html = read("index.html").toString();
for (const [file, url] of versioned) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  html = html.replace(
    new RegExp(`((?:src|href)=")/?${escaped}(?:\\?v=[a-f0-9]+)?(")`, "g"),
    (_, prefix, suffix) => prefix + url + suffix,
  );
}
const marker =
  /\/\/ BEGIN GENERATED PWA ASSETS[\s\S]*?\/\/ END GENERATED PWA ASSETS/;
const worker = read("sw.js").toString();
const assets = ["/", ...versioned.values()];
const release = hash(
  Buffer.concat([
    Buffer.from(html),
    Buffer.from(manifestText),
    ...files.map(read),
    Buffer.from(worker.replace(marker, "")),
  ]),
);
const generated = `// BEGIN GENERATED PWA ASSETS\nconst RELEASE = ${JSON.stringify(release)};\nconst SHELL_HASH = ${JSON.stringify(hash(html))};\nconst PUBLIC_ASSETS = ${JSON.stringify(assets, null, 2)};\n// END GENERATED PWA ASSETS`;
const outputs = {
  "index.html": html,
  "manifest.webmanifest": manifestText,
  "sw.js": worker.replace(marker, generated),
};
let stale = false;
for (const [file, content] of Object.entries(outputs)) {
  if (read(file).toString() === content) continue;
  if (process.argv.includes("--check")) {
    console.error(`${file} is stale; run npm run prepare:pwa`);
    stale = true;
  } else fs.writeFileSync(path.join(root, file), content);
}
if (stale) process.exitCode = 1;
else
  console.log(
    `PWA release ${release}: ${assets.length} public assets verified`,
  );
