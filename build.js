const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const SRC_DIR = path.join(ROOT, 'src');

const FORBIDDEN_PATTERNS = [
  { name: 'Node tls module', re: /\brequire\(["'](?:node:)?tls["']\)/ },
  { name: 'Node crypto module', re: /\brequire\(["'](?:node:)?crypto["']\)/ },
  { name: 'Node http/https module', re: /\brequire\(["'](?:node:)?https?["']\)/ },
  { name: 'Node fs/path/zlib module', re: /\brequire\(["'](?:node:)?(?:fs|path|zlib)["']\)/ },
  { name: 'Node Buffer global', re: /\bBuffer\.(?:from|alloc|allocUnsafe|concat|isBuffer)\b/ },
  { name: 'AbortSignal.timeout (missing in QuickJS)', re: /\bAbortSignal\.timeout\s*\(/ },
  { name: 'Response.arrayBuffer (missing in Nuvio FetchBridge)', re: /\.arrayBuffer\s*\(/ },
  { name: 'Hardcoded proxy IP spoofing', re: /185\.112\.156\.1/ }
];

async function buildAll() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const scrapers = Array.isArray(manifest.scrapers) ? manifest.scrapers : [];
  if (scrapers.length === 0) {
    throw new Error('manifest.json contains no scrapers.');
  }

  fs.mkdirSync(path.join(ROOT, 'providers'), { recursive: true });

  const results = [];
  for (const scraper of scrapers) {
    const entryPath = path.join(SRC_DIR, scraper.id, 'index.js');
    const outPath = path.join(ROOT, scraper.filename);
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Missing source entrypoint for ${scraper.id}: ${entryPath}`);
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      platform: 'neutral',
      format: 'cjs',
      target: 'es2016',
      mainFields: ['module', 'main'],
      external: ['cheerio-without-node-native', 'react-native-cheerio', 'cheerio', 'crypto-js', 'axios'],
      loader: { '.json': 'json' },
      minify: process.argv.includes('--minify'),
      outfile: outPath
    });

    const compiled = fs.readFileSync(outPath, 'utf8');
    for (const check of FORBIDDEN_PATTERNS) {
      if (check.re.test(compiled)) {
        throw new Error(`Safety check failed in ${scraper.filename}: matched "${check.name}" (${check.re})`);
      }
    }

    const kb = (Buffer.byteLength(compiled, 'utf8') / 1024).toFixed(1);
    results.push({ id: scraper.id, file: scraper.filename, kb });
    console.log(`[build] ${scraper.id.padEnd(15)} -> ${scraper.filename.padEnd(28)} (${kb} KB)`);
  }

  console.log(`\nBuilt ${results.length} Nuvio provider bundles cleanly.`);
}

buildAll().catch((err) => {
  console.error('[build] Failed:', err.message || err);
  process.exit(1);
});
