const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'index.source.html');
const outputPath = path.join(root, 'index.html');
const terserPath = '/Users/sodrulislam/Documents/Codex/2026-08-24/it-is-still-not-fully-connected/work/legacy99-admin/node_modules/.pnpm/terser@5.50.0/node_modules/terser';

let terser = null;
try {
  terser = require(terserPath);
} catch (error) {
  console.warn('Terser not found. JavaScript will only be lightly compacted.');
}

function ensureSourceCopy() {
  if (fs.existsSync(sourcePath)) return fs.readFileSync(sourcePath, 'utf8');
  const source = fs.readFileSync(outputPath, 'utf8');
  fs.writeFileSync(sourcePath, source);
  return source;
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

async function minifyJs(js) {
  if (!js.trim()) return '';
  if (!terser) return js.replace(/\s+/g, ' ').trim();
  try {
    const result = await terser.minify(js, {
      compress: {
        passes: 2
      },
      mangle: true,
      format: {
        comments: false
      }
    });
    return result.code || js;
  } catch (error) {
    console.warn('Could not fully minify one inline script:', error.message);
    return js.replace(/\n\s*/g, '');
  }
}

async function minifyHtml(html) {
  const blocks = [];
  function stash(value) {
    const token = `___QIBLAH_MINIFY_BLOCK_${blocks.length}___`;
    blocks.push(value);
    return token;
  }

  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, function(_, attrs, css) {
    return stash(`<style${attrs}>${minifyCss(css)}</style>`);
  });

  const scriptJobs = [];
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function(_, attrs, js) {
    if (/\bsrc\s*=/.test(attrs)) return stash(`<script${attrs}></script>`);
    const token = `___QIBLAH_SCRIPT_BLOCK_${scriptJobs.length}___`;
    scriptJobs.push(
      minifyJs(js).then(function(code) {
        return `<script${attrs}>${code}</script>`;
      })
    );
    return token;
  });

  const scripts = await Promise.all(scriptJobs);
  scripts.forEach(function(value, index) {
    html = html.replace(`___QIBLAH_SCRIPT_BLOCK_${index}___`, stash(value));
  });

  html = html
    .replace(/<!--(?!\[if\b)[\s\S]*?-->/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();

  blocks.forEach(function(value, index) {
    html = html.replace(`___QIBLAH_MINIFY_BLOCK_${index}___`, value);
  });

  return html;
}

(async function main() {
  const source = ensureSourceCopy();
  const minified = await minifyHtml(source);
  fs.writeFileSync(outputPath, minified);
  const before = Buffer.byteLength(source);
  const after = Buffer.byteLength(minified);
  const saved = Math.round((1 - after / before) * 100);
  console.log(`Minified index.html: ${(before / 1024).toFixed(1)} KB -> ${(after / 1024).toFixed(1)} KB (${saved}% smaller)`);
})();
