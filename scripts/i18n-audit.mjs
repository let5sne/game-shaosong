/**
 * i18n 覆盖率审计：按真实渲染边界抽出玩家可见的中文文本段 → 模拟英文翻译 → 列出残留汉字。
 *
 * 用法：node scripts/i18n-audit.mjs [--json] [--strict]
 * 退出码：--strict 且英文模式仍有中文残留时为 1（接入 CI）。
 *
 * 取样形态与 src/i18n.js 严格对齐：
 * - 规则层与数据层的中文原地保留，只在渲染边界被 tx() 覆盖，故按渲染时形态模拟；
 * - 模板字符串的插值统一写作 `#`（运行时为数字／人名／城名），与 EN_TEMPLATES 的键一致；
 * - tx() 对含标签的串按 `[^<>]+` 分段处理，因此审计的最小单位也是「文本段」而非整段 HTML。
 * 局限：插值处若传入未被词表覆盖的中文（例如新增人名），静态审计看不到，由英文实机 smoke 兜底。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { setLang, tx, untranslated } from '../src/i18n.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const ZH = /[\u4e00-\u9fff]/;

// 不进入界面的中文：shader 注释、诊断日志、异常文本、i18n 自身的说明
const SKIP_FILES = new Set(['i18n.js', 'en.js', 'ink.js', 'world.js']);
const SKIP_PATTERNS = [
  /^\[shaosong\]/, /不支持的 componentType/, /GLB /, /不是 GLB/, /仅支持三角形/,
  /几何合并失败/, /带状几何合并失败/, /缺少两京网格/, /没有可用网格/,
];

function samplesIn(file) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const out = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'Literal' && typeof n.value === 'string' && ZH.test(n.value)) out.add(n.value);
    if (n.type === 'TemplateLiteral') {
      // `#` 代表任意一个插值，与运行时「数字／专名」的位置一致；无插值时即原串。
      const joined = n.quasis.map(q => q.value.cooked).join('#');
      if (ZH.test(joined)) out.add(joined);
    }
    for (const k of Object.keys(n)) if (!['loc', 'start', 'end', 'range'].includes(k)) walk(n[k]);
  };
  walk(ast);
  return [...out].filter(s => !SKIP_PATTERNS.some(re => re.test(s)));
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f));
const raw = new Map();
const addSample = (s, file) => {
  if (!raw.has(s)) raw.set(s, []);
  if (!raw.get(s).includes(file)) raw.get(s).push(file);
};
for (const f of files) for (const s of samplesIn(path.join(SRC, f))) addSample(s, f);

// index.html 的静态文案（title / description 由 main.js 覆盖，这里取剩余可见文本）
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/>([^<>]*[\u4e00-\u9fff][^<>]*)</g)) addSample(m[1], 'index.html');

// 拆成 tx() 实际处理的文本段，避免把同一段说明在多个模板里重复计数
const segments = new Map();
for (const [s, from] of raw) {
  const parts = s.includes('<') ? (s.match(/[^<>]+/g) || []) : [s];
  for (const p of parts) {
    const seg = p.trim();
    if (!ZH.test(seg)) continue;
    if (!segments.has(seg)) segments.set(seg, []);
    for (const f of from) if (!segments.get(seg).includes(f)) segments.get(seg).push(f);
  }
}

const hanCount = s => (s.match(/[\u4e00-\u9fff]/g) || []).length;
setLang('en');
const residual = [];
for (const [seg, from] of segments) {
  const left = untranslated(seg);
  if (left.length) residual.push({ seg, from, left, after: tx(seg) });
}
residual.sort((a, b) => b.seg.length - a.seg.length);
const origChars = [...segments.keys()].reduce((n, s) => n + hanCount(s), 0);
const leftChars = residual.reduce((n, r) => n + r.left.reduce((m, f) => m + hanCount(f), 0), 0);
const coverage = origChars ? 1 - leftChars / origChars : 1;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ segments: segments.size, origChars, leftChars, coverage, residual }, null, 2));
} else {
  console.log(`中文文本段 ${segments.size} 条 / 汉字 ${origChars} 字`);
  console.log(`英文模式覆盖率 ${(coverage * 100).toFixed(2)}%（残留 ${leftChars} 字，涉及 ${residual.length} 段）`);
  console.log('--- 未完全覆盖的文本段，按长度（前 60）---');
  for (const r of residual.slice(0, 60)) console.log(`[${r.from.join(',')}] ${JSON.stringify(r.seg)}\n   残留 ${r.left.join('|')}`);
  if (residual.length > 60) console.log(`... 其余 ${residual.length - 60} 段，用 --json 查看`);
}
// 覆盖率是开发指标，默认不阻塞构建；--strict 供「译文补全完成」后接入 CI。
process.exitCode = process.argv.includes('--strict') && leftChars ? 1 : 0;
