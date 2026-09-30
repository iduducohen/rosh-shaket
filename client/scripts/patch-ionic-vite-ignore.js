// Vite cannot statically analyze some dynamic imports. Add /* @vite-ignore */ where needed.
// Ionic's ES5 build and pdfjs-dist both ship webpackIgnore-only comments.
const fs = require('node:fs');
const path = require('node:path');

patchIonic();
patchPdfjs();

function patchIonic() {
  const dir = path.join(__dirname, '../node_modules/@ionic/pwa-elements/dist/esm-es5');
  if (!fs.existsSync(dir)) return;

  const needle = 'import("./".concat(a,".entry.js").concat(""))';
  const fixed = 'import(/* @vite-ignore */ "./".concat(a,".entry.js").concat(""))';

  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const file = path.join(dir, name);
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(needle)) continue;
    fs.writeFileSync(file, text.split(needle).join(fixed));
  }
}

function patchPdfjs() {
  const needle = 'import(/*webpackIgnore: true*/this.workerSrc)';
  const fixed = 'import(/*webpackIgnore: true*/ /* @vite-ignore */ this.workerSrc)';
  const files = [
    path.join(__dirname, '../node_modules/pdfjs-dist/build/pdf.mjs'),
    path.join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs')
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(needle) || text.includes('@vite-ignore')) continue;
    fs.writeFileSync(file, text.split(needle).join(fixed));
  }
}
