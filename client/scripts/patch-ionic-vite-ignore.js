// Ionic's ES5 build lazy-loads entries with a dynamic import Vite cannot analyze.
// The comment has to be in that file; Vite's prebundle drops it from the modern build.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../node_modules/@ionic/pwa-elements/dist/esm-es5');
if (!fs.existsSync(dir)) process.exit(0);

const needle = 'import("./".concat(a,".entry.js").concat(""))';
const fixed = 'import(/* @vite-ignore */ "./".concat(a,".entry.js").concat(""))';

for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.js')) continue;
  const file = path.join(dir, name);
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(needle)) continue;
  fs.writeFileSync(file, text.split(needle).join(fixed));
}
