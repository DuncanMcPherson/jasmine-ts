const fs = require("fs");
const path = require("path");

function main() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'package.json')).toString("utf-8");
  const sourceObj = JSON.parse(source);
  const version = sourceObj.version;

  const versionParts = version.split('.');
  let patch = +versionParts[2];
  let minor = +versionParts[1];
  let major = +versionParts[0];

  if (patch++ >= 10) {
    minor++;
    patch = 0;
  }
  if (minor === 10) {
    major++;
    minor = 0;
  }

  const newVersion = `${major}.${minor}.${patch}`;
  sourceObj.version = newVersion;
  console.log("new version: ", newVersion);
  fs.writeFileSync(path.join(__dirname, '..', 'package.json'), Buffer.from(JSON.stringify(sourceObj, null, 2), 'utf-8'));
}

main();
