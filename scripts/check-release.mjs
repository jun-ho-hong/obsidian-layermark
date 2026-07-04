import { readFile, stat } from "node:fs/promises";

const requiredAssets = ["manifest.json", "main.js", "styles.css"];

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

const errors = [];

if (!manifest.id) {
  errors.push("manifest.json is missing id.");
}

if (!manifest.version) {
  errors.push("manifest.json is missing version.");
}

if (manifest.version !== packageJson.version) {
  errors.push(`manifest.json version (${manifest.version}) does not match package.json version (${packageJson.version}).`);
}

if (!versions[manifest.version]) {
  errors.push(`versions.json is missing an entry for ${manifest.version}.`);
}

for (const asset of requiredAssets) {
  try {
    const file = await stat(asset);
    if (!file.isFile() || file.size === 0) {
      errors.push(`${asset} is missing or empty.`);
    }
  } catch {
    errors.push(`${asset} is missing.`);
  }
}

if (manifest.isDesktopOnly !== false) {
  errors.push("manifest.json should keep isDesktopOnly=false for Mac/iOS BRAT testing.");
}

if (errors.length > 0) {
  console.error("Release check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Release check passed for ${manifest.id} ${manifest.version}.`);
