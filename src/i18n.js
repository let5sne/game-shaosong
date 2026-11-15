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
 * 覆盖策略：`EN_STRINGS` 整句精译优先；未命中时按 `EN_PHRASES` 长词优先的
 * 短语表逐段替换。剩余中文由 `scripts/i18n-audit.mjs` 定量报告，不静默丢字。
 */
import { EN_STRINGS, EN_PHRASES } from './locales/en.js';

export const LANGS = ['zh', 'en'];
let lang = 'zh';

export const getLang = () => lang;
export function setLang(v) {
  lang = v === 'en' ? 'en' : 'zh';
  return lang;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASE_KEYS = Object.keys(EN_PHRASES).sort((a, b) => b.length - a.length);
const PHRASE_RE = PHRASE_KEYS.length
  ? new RegExp(PHRASE_KEYS.map(escapeRe).join('|'), 'g')
  : null;
const NON_ASCII = /([^\x00-\x7f]+)/g;
const HAS_ZH = /[\u4e00-\u9fff]/;

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

/** 翻一段不含尖括号的文本：整段精译 > 中文片段精译 > 长词优先的短语替换。 */
function translatePlain(text) {
  if (!HAS_ZH.test(text)) return text;
  if (has(EN_STRINGS, text)) return EN_STRINGS[text];
  return text.replace(NON_ASCII, (frag) => {
    if (has(EN_STRINGS, frag)) return EN_STRINGS[frag];
    if (!PHRASE_RE) return frag;
    PHRASE_RE.lastIndex = 0;
    return frag.replace(PHRASE_RE, k => EN_PHRASES[k]);
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
