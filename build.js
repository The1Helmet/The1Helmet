// Bundles the ES modules + CSS into a single self-contained HTML file that runs
// by just opening it in a browser (no server, no install). Strips import/export
// and concatenates modules in dependency order into one classic <script>.
const fs = require('fs');
const path = require('path');

const ORDER = ['geometry', 'camera', 'renderer', 'entities', 'prefabs', 'store', 'tools', 'blueprint', 'panels', 'main'];
const jsDir = path.join(__dirname, 'app', 'js');

function strip(src) {
  return src
    .split('\n')
    .filter((l) => !/^\s*import\s.+from\s+['"].+['"];?\s*$/.test(l))
    .map((l) => l.replace(/^(\s*)export\s+(default\s+)?/, '$1'))
    .join('\n');
}

const css = fs.readFileSync(path.join(__dirname, 'app', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'app', 'index.html'), 'utf8');

// Take the <body> contents from index.html, drop the module <script> tag.
const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
let body = bodyMatch[1].replace(/<script[^>]*><\/script>/g, '');

const code = ORDER.map((name) => `// ===== ${name}.js =====\n` + strip(fs.readFileSync(path.join(jsDir, name + '.js'), 'utf8'))).join('\n\n');

const outHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Helmet CAD</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script>
"use strict";
(function(){
${code}
})();
</script>
</body>
</html>
`;

const outFile = path.join(__dirname, 'helmet-cad.html');
fs.writeFileSync(outFile, outHtml);
console.log('built', outFile, (outHtml.length / 1024).toFixed(1) + ' KB');
