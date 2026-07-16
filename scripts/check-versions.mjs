import { readFileSync } from "node:fs";

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const cargoManifest = readFileSync("src-tauri/Cargo.toml", "utf8");
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const readme = readFileSync("README.md", "utf8");

const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const expectedReadmeBadge = `v${packageVersion}`;
const mismatches = [
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
].filter(([, version]) => version !== packageVersion);

if (!readme.includes(expectedReadmeBadge)) {
  mismatches.push(["README.md", `missing ${expectedReadmeBadge}`]);
}

if (mismatches.length > 0) {
  console.error(`Version mismatch: package.json is ${packageVersion}.`);
  for (const [source, version] of mismatches) {
    console.error(`- ${source}: ${version}`);
  }
  process.exit(1);
}

console.log(`Version consistency check passed: ${packageVersion}`);
