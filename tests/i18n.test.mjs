import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setLang, getLang, tx, tt, untranslated } from '../src/i18n.js';
import { readSettings, encodeSearch, derive } from '../src/settings.js';

const zh = s => /[\u4e00-\u9fff]/.test(s);

test('中文模式：tx 与 tt 逐字原样，旧路径不变', () => {
  assert.equal(setLang('zh'), 'zh');
  assert.equal(getLang(), 'zh');
  assert.equal(tx('收复开封与燕京，尽逐北军'), '收复开封与燕京，尽逐北军');
  assert.equal(tx('<b>政令</b>用尽 · 第 7 回合'), '<b>政令</b>用尽 · 第 7 回合');
  assert.equal(tt`第 ${7} / ${30} 回合 · 行台 ${12} 州`, '第 7 / 30 回合 · 行台 12 州');
  assert.equal(tx(''), '');
  assert.equal(tx(null), null);
  assert.equal(tx(42), 42);
});

test('英文模式：核心文案与专有名词一致，且不留中文', () => {
  setLang('en');
  const cases = [
    '版籍', '行台', '北廷', '政令', '粮秣', '旧都开封', '燕京', '寿春婴城',
    '叶锐', '重锋叠阵', '收复开封与燕京，尽逐北军', '目标：收复旧都开封与燕京，重振版籍。',
  ];
  for (const c of cases) {
    const out = tx(c);
    assert.ok(out && !zh(out), `应译为英文且无中文：${c} → ${out}`);
    assert.deepEqual(untranslated(c), [], `不应有残留：${c}`);
  }
  assert.equal(tx('政令'), 'decree');
  assert.equal(tx('叶锐'), 'Ye Rui');
  assert.equal(tx('旧都开封'), 'Kaifeng, the Old Capital');
  assert.equal(tx('寿春婴城'), 'The Stand at Shouchun');
});

test('英文模式：HTML 标签与插值结构不被破坏', () => {
  setLang('en');
  const out = tx('<div class="stat"><span>政令</span><b>3</b><small>道</small></div>');
  assert.match(out, /<div class="stat">/);
  assert.match(out, /<b>3<\/b>/);
  assert.ok(!zh(out), `标签内容应已翻译：${out}`);
  const t2 = tt`第 ${7} 回合`;
  assert.ok(!zh(t2), `插值模板不应残留中文：${t2}`);
  assert.match(t2, /7/);
  assert.match(t2, /Turn/i);
});

test('语言不进规则层、不进随机源、不写存档', () => {
  const rules = fs.readFileSync(new URL('../src/rules.js', import.meta.url), 'utf8');
  assert.ok(!rules.includes('i18n'), 'rules.js 不应依赖 i18n');
  assert.ok(!rules.includes('setLang'), 'rules.js 不应读取语言');
  const save = fs.readFileSync(new URL('../src/save.js', import.meta.url), 'utf8');
  assert.ok(!save.includes('i18n'), 'save.js 不应依赖 i18n');
});

test('lang 是标准设置项：链接优先、可持久化、默认不写参数', () => {
  assert.equal(readSettings('?lang=en').values.lang, 'en');
  assert.equal(readSettings('?seed=123456').values.lang, 'zh');
  assert.equal(readSettings('?lang=en').sources.lang, 'url');
  assert.equal(derive(readSettings('?lang=en').values).lang, 'en');
  const values = readSettings('').values;
  assert.ok(!encodeSearch(values).includes('lang='), '中文默认不应污染分享链接');
  assert.match(encodeSearch({ ...values, lang: 'en' }), /lang=en/);
});

test('英文模式：门面文案整句精译（不由词典拼凑）', () => {
  setLang('en');
  assert.equal(tx('受命临朝'), 'Take the Mandate');
  assert.equal(tx('你是任期三年的监国执政：整军、筹粮、平朝议、复旧都——'),
    'You are the Regent, elected for a three-year mandate: muster, levy, hold the Council, recover the old capital —');
  assert.equal(tx('在北廷再度南下之前，把版籍一寸一寸收回来。'),
    'before the Northern Court drives south again, win the register back, prefecture by prefecture.');
  setLang('zh');
});
