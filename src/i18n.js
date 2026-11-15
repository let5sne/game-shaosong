/**
 * 轻量 i18n 覆盖层：中文是唯一真源，英文是渲染期的覆盖表。
 *
 * 设计取舍（见 README「声明」与 AGENTS.md 判据 4）：
 * - `data.js` / `rules.js` 里的中文**原地不动**。它们同时是显示文案、存档内容、
 *   平衡护栏与 132 条单测的断言依据；抽出或改写会扰动可复现基线。
 * - 翻译只发生在渲染边界：`tt` 包住 HTML 模板，`tx` 处理动态串与画布文字。
 * - 默认 `lang='zh'`，此时 `tt` / `tx` 逐字返回原串，旧路径与关闭态完全一致。
 * - 语言不进规则层、不进随机源、不写存档，只影响屏幕上的字。
 *
 * 覆盖策略：`EN_STRINGS` 整句精译 > `EN_TEMPLATES` 含变量的整句精译 >
 * `EN_PHRASES` 长词优先的短语替换。剩余中文由 `scripts/i18n-audit.mjs`
 * 定量报告，不静默丢字。
 */
import { EN_STRINGS, EN_TEMPLATES, EN_PHRASES } from './locales/en.js';

export const LANGS = ['zh', 'en'];
let lang = 'zh';

export const getLang = () => lang;
export function setLang(v) {
  lang = v === 'en' ? 'en' : 'zh';
  return lang;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 战报常把数句拼成一行，整段精译此时不会精确命中。把 EN_STRINGS 也并入短语表，
// 长句优先，让拼接串里的每一句仍取到人工精译，而不是退回逐字词典。
const ALL_PHRASES = { ...EN_PHRASES, ...EN_STRINGS };
const PHRASE_KEYS = Object.keys(ALL_PHRASES).sort((a, b) => b.length - a.length);
const PHRASE_RE = PHRASE_KEYS.length
  ? new RegExp(PHRASE_KEYS.map(escapeRe).join('|'), 'g')
  : null;
const NON_ASCII = /([^\x00-\x7f]+)/g;
const HAS_ZH = /[\u4e00-\u9fff]/;
// 模板键里的 # 是变量位（数字／人名／城名／短评语），编译成整段锚定的正则。
// 按固定中文部分由长到短比对，短模板不会抢走长句；变量上限 40 字，避免跨段误命中。
const TEMPLATES = Object.entries(EN_TEMPLATES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([key, tpl]) => ({
    re: new RegExp(`^${key.split('#').map(escapeRe).join('([\\s\\S]{0,40}?)')}$`),
    tpl,
  }));

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

/** 把取到的变量过一遍翻译后填回整句译文（人名／城名不会被漏掉）。 */
function fillTemplate(tpl, vals) {
  return tpl.replace(/\{(\d+)\}/g, (_, i) => {
    const v = vals[Number(i)];
    return v === undefined ? '' : tx(v);
  });
}

/** 翻一段不含尖括号的文本：整段精译 > 含变量整句精译 > 短语替换。 */
function translatePlain(text) {
  if (!HAS_ZH.test(text)) return text;
  // HTML 文本段常带缩进与换行；查表用去空白的核心，输出再嵌回原空白里。
  // 审计脚本按同样的 trim 取样，保证「静态覆盖」与「实机命中」是同一份键。
  const core = text.trim();
  const wrap = s => (core === text ? s : text.replace(core, () => s));
  if (has(EN_STRINGS, text)) return EN_STRINGS[text];
  if (has(EN_STRINGS, core)) return wrap(EN_STRINGS[core]);
  for (const { re, tpl } of TEMPLATES) {
    const m = core.match(re);
    if (m) return wrap(fillTemplate(tpl, m.slice(1)));
  }
  return text.replace(NON_ASCII, (frag) => {
    if (has(EN_STRINGS, frag)) return EN_STRINGS[frag];
    if (!PHRASE_RE) return frag;
    PHRASE_RE.lastIndex = 0;
    return frag.replace(PHRASE_RE, k => ALL_PHRASES[k]);
  });
}

/**
 * 翻译任意写入界面的字符串：纯文本走 translatePlain，HTML 则逐段处理
 * （标签之间的文本节点与标签内部的 title/placeholder 属性都会覆盖，标签本身不动）。
 */
export function tx(text) {
  if (lang === 'zh' || typeof text !== 'string' || !text || !HAS_ZH.test(text)) return text;
  if (has(EN_STRINGS, text)) return EN_STRINGS[text];
  return text.includes('<') ? text.replace(/[^<>]+/g, translatePlain) : translatePlain(text);
}

/**
 * tagged template：静态片段与插值都过一遍翻译。
 * 中文模式直接按原顺序拼接，不做任何字符串处理。
 */
export function tt(strings, ...values) {
  const vals = values.map(v => (typeof v === 'string' ? tx(v) : v));
  const parts = lang === 'zh' ? strings : strings.map(tx);
  return parts.reduce((acc, s, i) => acc + s + (i < vals.length ? vals[i] : ''), '');
}

/** 审计用：返回仍含中文的片段清单，用于定量核对覆盖率。 */
export function untranslated(text) {
  if (typeof text !== 'string') return [];
  const out = tx(text);
  return (out.match(/[^\x00-\x7f]+/g) || []).filter(s => HAS_ZH.test(s));
}
