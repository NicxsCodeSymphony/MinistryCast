import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/set-release-version.mjs 1.2.3");
  process.exit(1);
}

const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const confPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);

const cargoPath = new URL("../src-tauri/Cargo.toml", import.meta.url);
const cargo = readFileSync(cargoPath, "utf8").replace(
  /^version = ".*"$/m,
  `version = "${version}"`,
);
writeFileSync(cargoPath, cargo);

console.log(`Set app version to ${version}`);
