/** 存档三卷面板回归：空卷／终局／坏档／短剧本／当前卷的文案与按钮去留。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { savesHtml } from '../src/ui-saves.js';

const empty = slot => ({ slot, empty: true });
const full = (slot, over = {}) => ({
  slot, empty: false, broken: false, over: false, turn: 7, seed: 123456,
  difficulty: 'normal', scenarioId: null, at: 0, songN: 12, totalN: 24, ...over,
});

test('空卷：对局中给「存此卷」，不在对局则提示尚无存档', () => {
  const inGame = savesHtml({ act: 1, inGame: true, slots: [empty(1), empty(2), empty(3)] });
  assert.match(inGame, /第 1 卷/);
  assert.equal((inGame.match(/存此卷/g) || []).length, 3);
  assert.match(inGame, /空卷/);

  const idle = savesHtml({ act: 1, inGame: false, slots: [empty(1)] });
  assert.ok(!idle.includes('存此卷'));
  assert.match(idle, /尚无存档/);
});

test('当前卷：摘要标「· 当前」，逐令自动写入的卷号与 act 一致', () => {
  const html = savesHtml({ act: 2, inGame: true, slots: [full(1), full(2), full(3)] });
  assert.match(html, /第 2 卷 · 当前/);
  assert.match(html, /第 2 卷）；/);   // 说明行里的「当前卷（第 2 卷）」
  assert.ok(!/第 1 卷 · 当前/.test(html));
});

test('普通卷：难度名、回合、版籍与局号齐备，并可载入', () => {
  const html = savesHtml({ act: 1, inGame: true, slots: [full(1)] });
  assert.match(html, /建炎北伐/);
  assert.match(html, /第 7 回合 · 宋 12／24 州 · 局号 #123456/);
  assert.match(html, /data-act="save-load" data-slot="1"/);
});

test('短剧本卷：优先显示剧本名，而非难度名', () => {
  const html = savesHtml({
    act: 1, inGame: true,
    slots: [full(1, { scenarioId: 'yancheng' })],
  });
  assert.match(html, /郾城破阵/);
  assert.ok(!html.includes('建炎北伐'));
});

test('未登记的剧本 id 回退「短剧本」，未登记难度回退「建炎北伐」', () => {
  const html = savesHtml({
    act: 1, inGame: true,
    slots: [full(1, { scenarioId: 'nope' }), full(2, { difficulty: 'nope' })],
  });
  assert.match(html, /短剧本/);
  assert.match(html, /建炎北伐/);
});

test('终局卷：标「终局」且不可载入，但仍可删', () => {
  const html = savesHtml({ act: 1, inGame: true, slots: [full(1, { over: true })] });
  assert.match(html, /终局/);
  assert.match(html, /此卷不可载入/);
  assert.ok(!html.includes('save-load'));
  assert.match(html, /data-act="save-del" data-slot="1"/);
});

test('坏档卷：标「已损」，只给删', () => {
  const html = savesHtml({
    act: 1, inGame: true,
    slots: [{ slot: 3, empty: false, broken: true, over: false, at: 0 }],
  });
  assert.match(html, /卷宗漫漶 · 已损/);
  assert.ok(!html.includes('save-load'));
  assert.match(html, /data-act="save-del" data-slot="3"/);
});

test('坏档没有回合数时不渲染 undefined', () => {
  const html = savesHtml({
    act: 1, inGame: true,
    slots: [{ slot: 3, empty: false, broken: true, over: false, at: 0 }],
  });
  assert.ok(!html.includes('undefined'));
  assert.ok(!html.includes('NaN'));
});

test('面板骨架与按钮固定：三卷列表、关闭按钮、说明行', () => {
  const html = savesHtml({ act: 1, inGame: true, slots: [full(1)] });
  assert.match(html, /<div class="saves-card">/);
  assert.match(html, /<h2>存 档 · 三 卷<\/h2>/);
  assert.match(html, /data-act="close-saves"/);
  assert.ok(html.trimEnd().endsWith('</div>'), '以模板结尾收尾');
});