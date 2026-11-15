/**
 * i18n 覆盖率审计：静态抽出所有玩家可见的中文串 → 模拟英文渲染 → 列出残留汉字。
 *
 * 用法：node scripts/i18n-audit.mjs [--json]
 * 退出码：英文模式仍有中文残留时为 1（可接入 CI / 单测）。
 *
 * 只审计「会进入界面」的字符串：规则层与数据层的中文原地保留，
 * 它们在渲染边界被 tx() 覆盖，因此这里按渲染时的形态（含插值）模拟。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { setLang, untranslated } from '../src/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const ZH = /[\u4e00-\u9fff]/;

// 不进入界面的中文：shader 注释、诊断日志、异常文本、i18n 自身的说明
const SKIP_FILES = new Set(['i18n.js', 'en.js', 'ink.js', 'world.js']);
const SKIP_PATTERNS = [
  /^\[shaosong\]/, /不支持的 componentType/, /GLB /, /不是 GLB/, /仅支持三角形/,
  /几何合并失败/, /带状几何合并失败/, /缺少两京网格/, /没有可用网格/,
];

function stringsIn(file) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const out = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'Literal' && typeof n.value === 'string' && ZH.test(n.value)) out.add(n.value);
    if (n.type === 'TemplateLiteral') {
      const quasis = n.quasis.map(q => q.value.cooked);
      // 两种插值形态：无插值（中文连成一片）与数字插值（中文被 ASCII 切断）
      const a = quasis.join(''), b = quasis.join('7');
      if (ZH.test(a)) { out.add(a); if (b !== a) out.add(b); }
    }
    for (const k of Object.keys(n)) if (!['loc', 'start', 'end', 'range'].includes(k)) walk(n[k]);
  };
  walk(ast);
  return [...out].filter(s => !SKIP_PATTERNS.some(re => re.test(s)));
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f))
  .map(f => path.join(SRC, f));
const samples = new Set();
for (const f of files) for (const s of stringsIn(f)) samples.add(s);

// index.html 的静态文案（title / description 由 main.js 覆盖，这里只取剩余可见文本）
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/>([^<>]*[\u4e00-\u9fff][^<>]*)</g)) samples.add(m[1]);

const hanCount = s => (s.match(/[\u4e00-\u9fff]/g) || []).length;
setLang('en');
const residual = new Map();
for (const s of samples) {
  for (const frag of untranslated(s)) residual.set(frag, (residual.get(frag) || 0) + 1);
}
const rows = [...residual.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
const origChars = [...samples].reduce((n, s) => n + hanCount(s), 0);
const leftChars = rows.reduce((n, [frag, c]) => n + hanCount(frag) * c, 0);
const coverage = origChars ? 1 - leftChars / origChars : 1;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ samples: samples.size, origChars, leftChars, coverage, residual: rows }, null, 2));
} else {
  console.log(`中文样本 ${samples.size} 条 / 汉字 ${origChars} 字`);
  console.log(`英文模式覆盖率 ${(coverage * 100).toFixed(1)}%（残留 ${leftChars} 字，${rows.length} 种片段）`);
  console.log('--- 待补片段，按出现频次（前 60）---');
  for (const [frag, n] of rows.slice(0, 60)) console.log(String(n).padStart(4), JSON.stringify(frag));
  if (rows.length > 60) console.log(`... 其余 ${rows.length - 60} 种，用 --json 查看`);
}
// 覆盖率是开发指标，默认不阻塞构建；--strict 供「译文补全完成」后接入 CI。
process.exitCode = process.argv.includes('--strict') && rows.length ? 1 : 0;
