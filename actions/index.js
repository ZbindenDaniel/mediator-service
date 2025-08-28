// Auto-load all actions in this folder (except index.js)
const fs = require("fs");
const path = require("path");

function loadActions() {
  const dir = __dirname;
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".js") && f !== "index.js")
    .map(f => require(path.join(dir, f)))
    .sort((a,b) => (a.order||100)-(b.order||100));
}

module.exports = {
  loadActions
};
