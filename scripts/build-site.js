// ============================================================
// build-site.js
//
// Roda na GitHub Actions (e localmente). Gera docs/index.html
// embutindo os dados de site-data/data.json e o app em
// assets/site-app.js dentro do template
// assets/Deco Investimentos - Site.html.
//
// Também grava docs/CNAME para o domínio personalizado.
//
// Uso:
//   node "scripts/build-site.js"
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_FILE = path.join(ROOT, 'assets', 'Deco Investimentos - Site.html');
const DATA_FILE = path.join(ROOT, 'site-data', 'data.json');
const APP_FILE = path.join(ROOT, 'assets', 'site-app.js');
const OUT_DIR = path.join(ROOT, 'docs');
const OUT_FILE = path.join(OUT_DIR, 'index.html');
const CNAME = process.env.DECOAI_SITE_CNAME || 'www.decoinvestimentos.com.br';

const DATA_MARKER = '/*__DECO_SITE_DATA__*/';
const APP_MARKER = '/*__DECO_SITE_APP__*/';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function main() {
  let template = readText(TEMPLATE_FILE);
  const data = readText(DATA_FILE);
  const app = readText(APP_FILE);

  if (!template.includes(DATA_MARKER)) {
    throw new Error(`Marcador ${DATA_MARKER} não encontrado no template.`);
  }
  if (!template.includes(APP_MARKER)) {
    throw new Error(`Marcador ${APP_MARKER} não encontrado no template.`);
  }

  const dataInjection = `window.DECO_SITE_DATA = ${data};`;
  template = template.split(DATA_MARKER).join(dataInjection);
  template = template.split(APP_MARKER).join(app);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, template, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'CNAME'), `${CNAME}\n`, 'utf8');

  console.log(`site gerado -> ${OUT_FILE} (${template.length} bytes)`);
  console.log(`CNAME -> ${CNAME}`);
}

main();