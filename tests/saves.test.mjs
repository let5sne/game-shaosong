/**
 * 三槽存档单测：纯 Node，注入 localStorage 模拟。
 *   node --test tests/saves.test.mjs
 *
 * 覆盖：
 *   1. 槽位读写与「当前卷」指针（writeSave 会把当前卷切到目标槽）
 *   2. 旧单槽（shaosong.save.v1）一次性迁入槽 1，且幂等
 *   3. bestSlot 取最近更新的可续档（终局／坏档不算）
 *   4. slotSummaries 给 UI 的三卷摘要（空卷／终局／坏档／宋州计数）
 *   5. clearSave 只清目标槽
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/rules.js';
import {
  serialize, restore, readSave, writeSave, clearSave, saveInfo,
  SAVE_KEY, SLOT_KEY, ACTIVE_KEY, SAVE_SLOTS, slotKeyId,
  activeSlot, setActiveSlot, bestSlot, slotSummaries, migrateLegacy,
} from '../src/save.js';

const mkStore = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    dump: () => Object.fromEntries(m),
  };
};
const game = (seed = 1) => {
  const s = new GameState({ seed });
  s.gold = 300; s.grain = 300;
  return s;
};

test('三槽读写：writeSave 指定槽即切「当前卷」，readSave 默认读当前卷', () => {
  globalThis.localStorage = mkStore();
  const a = game(1), b = game(2);
  assert.equal(writeSave(a, 2), true);
  assert.equal(activeSlot(), 2, '写入第 2 卷后当前卷切到 2');
  assert.ok(readSave().includes('"seed":1'));
  assert.equal(readSave(2), readSave());
  assert.equal(readSave(1), null, '第 1 卷仍空');
  writeSave(b, 1);
  assert.equal(activeSlot(), 1);
  assert.ok(readSave(1).includes('"seed":2'));
  assert.ok(readSave(2).includes('"seed":1'), '换当前卷不动他卷');
  setActiveSlot(3);
  assert.equal(activeSlot(), 3);
  assert.equal(readSave(), null, '当前卷为空时读到 null');
});

test('旧单槽迁入槽 1：只迁一次、迁后清旧键、幂等', () => {
  globalThis.localStorage = mkStore();
  const s = game(7);
  globalThis.localStorage.setItem(SAVE_KEY, serialize(s));
  assert.equal(migrateLegacy(), true);
  assert.ok(globalThis.localStorage.getItem(slotKeyId(1))?.includes('"seed":7'));
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), null, '旧键迁后即清');
  assert.equal(migrateLegacy(), false, '旧键已无，第二次迁移是空操作');
  // readSave 也会顺路迁移：模拟「老版本升级上来直接续局」
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(SAVE_KEY, serialize(s));
  assert.ok(readSave().includes('"seed":7'));
  assert.equal(activeSlot(), 1, '迁移落位槽 1');
});

test('三槽已有内容时旧键不再强迁，直接丢弃旧键', () => {
  globalThis.localStorage = mkStore();
  const s = game(9);
  globalThis.localStorage.setItem(slotKeyId(2), serialize(game(2)));
  globalThis.localStorage.setItem(SAVE_KEY, serialize(s));
  migrateLegacy();
  assert.equal(readSave(1), null, '槽 1 不被旧档覆盖');
  assert.ok(readSave(2).includes('"seed":2'));
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), null);
});

test('bestSlot 取最近更新的可续档；终局档不可续', () => {
  globalThis.localStorage = mkStore();
  const older = game(3), newer = game(4);
  writeSave(older, 1);
  writeSave(newer, 2);
  // 把槽 1 的时间戳改早，让「最近」不依赖同毫秒
  const d = JSON.parse(readSave(1)); d.at -= 60000;
  globalThis.localStorage.setItem(slotKeyId(1), JSON.stringify(d));
  assert.equal(bestSlot().slot, 2);

  const done = game(5);
  done.over = { kind: 'win', title: '中兴', text: '', turn: 20 };
  writeSave(done, 3);
  const finished = JSON.parse(readSave(3));
  assert.equal(saveInfo(JSON.stringify(finished)), null, '终局档不出现在续局入口');
  // 只有终局档时没有可续档
  globalThis.localStorage.removeItem(slotKeyId(1));
  globalThis.localStorage.removeItem(slotKeyId(2));
  assert.equal(bestSlot(), null);
});

test('slotSummaries：空卷／正常卷／终局卷／坏档一目了然', () => {
  globalThis.localStorage = mkStore();
  const s = game(11);
  // 占两座金城造出 22 宋州局面，验证计数
  const ids = Object.keys(s.cities);
  const songBefore = ids.filter(id => s.cities[id].owner === 'song').length;
  const jin = ids.filter(id => s.cities[id].owner === 'jin').slice(0, 2);
  for (const id of jin) s.cities[id].owner = 'song';
  writeSave(s, 1);
  const sum = slotSummaries();
  assert.equal(sum.length, SAVE_SLOTS);
  assert.equal(sum[0].slot, 1);
  assert.equal(sum[0].empty, false);
  assert.equal(sum[0].broken, false);
  assert.equal(sum[0].over, false);
  assert.equal(sum[0].songN, songBefore + jin.length, '宋州计数与实际一致');
  assert.equal(sum[0].totalN, ids.length);
  assert.equal(sum[1].empty, true);
  assert.equal(sum[2].empty, true);

  // 坏档：不合法 JSON 与结构错档都标记 broken
  globalThis.localStorage.setItem(slotKeyId(2), '{oops');
  globalThis.localStorage.setItem(slotKeyId(3), JSON.stringify({ v: 99 }));
  const bad = slotSummaries();
  assert.equal(bad[1].broken, true);
  assert.equal(bad[2].broken, true);
  assert.equal(bad[2].over, false);
});

test('clearSave 只清目标槽，restore 往返仍成立', () => {
  globalThis.localStorage = mkStore();
  const s = game(12);
  s.chouliang();
  writeSave(s, 2);
  writeSave(game(13), 3);
  clearSave(2);
  assert.equal(readSave(2), null);
  assert.ok(readSave(3).includes('"seed":13'), '邻卷无恙');
  assert.equal(activeSlot(), 3);

  const fresh = new GameState({ seed: 1 });
  assert.equal(restore(fresh, readSave(3)), true);
  assert.equal(fresh.seed, 13);
  assert.ok(Array.isArray(fresh.logs));
});
