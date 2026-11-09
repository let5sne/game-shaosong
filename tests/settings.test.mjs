/** 统一配置层回归测试：历史 URL 语义、优先级、持久化与链接往返。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTING_ITEMS, SETTING_GROUPS, readSettings, writeSetting, resetSettings,
  encodeSearch, applyUrl, derive, knownUrlKeys, STORE_KEY, LEGACY_KEYS, settingById,
} from '../src/settings.js';

const makeStore = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _map: m,
  };
};
const defaults = () => Object.fromEntries(SETTING_ITEMS.map(it => [it.id, it.default]));

test('出厂默认：增强与贴图全关，资产全开，自动档', () => {
  const { values, sources } = readSettings('', makeStore());
  assert.equal(values.ink, false);
  assert.equal(values.terrain, 'paper');
  assert.equal(values.ground, false);
  assert.equal(values.city, false);
  assert.equal(values.units, true);
  assert.equal(values.capitals, true);
  assert.equal(values.trees, true);
  assert.equal(values.mat, true);
  assert.equal(values.grade, true);
  assert.equal(values.economy, false, '治略默认关闭，守住可复现的胜率基线');
  assert.equal(values.quality, 'auto');
  assert.equal(values.motion, 'auto');
  assert.equal(values.scenario, 'campaign');
  assert.equal(values.difficulty, 'normal');
  assert.equal(values.seed, '');
  assert.equal(values.auto, false);
  assert.equal(values.mute, false);
  assert.ok(Object.values(sources).every(s => s === 'default'));
  assert.equal(SETTING_GROUPS.length, 3);
  assert.equal(SETTING_ITEMS.length, 17);
});

test('历史 URL 参数语义全部保留', () => {
  const all = '?tex=1&ink=1&units=0&capitals=0&trees=0&mat=0&grade=0&economy=1&quality=low&auto=1&seed=123456&scenario=yancheng';
  const { values } = readSettings(all, makeStore());
  assert.equal(values.ground, true, '?tex=1 开地表');
  assert.equal(values.city, true, '?tex=1 同时开城池');
  assert.equal(values.ink, true);
  assert.equal(values.units, false);
  assert.equal(values.capitals, false);
  assert.equal(values.trees, false);
  assert.equal(values.mat, false, '?mat=0 关掉质感层');
  assert.equal(values.grade, false, '?grade=0 关掉开场页电影感');
  assert.equal(values.economy, true, '?economy=1 开启治略');
  assert.equal(readSettings('?grade=1', makeStore()).values.grade, true);
  assert.equal(readSettings('?economy=0', makeStore()).values.economy, false);
  assert.equal(values.quality, 'low');
  assert.equal(values.auto, true);
  assert.equal(values.seed, '123456');
  assert.equal(values.scenario, 'yancheng');

  assert.equal(readSettings('?ctex=1', makeStore()).values.ground, false, '?ctex=1 只开城池');
  assert.equal(readSettings('?ctex=1', makeStore()).values.city, true);
  assert.equal(readSettings('?ink=0', makeStore()).values.ink, false);
  assert.equal(readSettings('?ink=0', makeStore()).sources.ink, 'url', '显式关也要算链接指定');
  assert.equal(readSettings('?quality=high', makeStore()).values.quality, 'high');
  assert.equal(readSettings('?motion=0', makeStore()).values.motion, 'off');
  assert.equal(readSettings('?motion=1', makeStore()).values.motion, 'on');
  assert.equal(readSettings('?terrain=real', makeStore()).values.terrain, 'real');
  assert.equal(readSettings('?terrain=paper', makeStore()).values.terrain, 'paper');
  assert.equal(readSettings('?terrain=nope', makeStore()).values.terrain, 'paper');
  assert.equal(readSettings('?seed=abc', makeStore()).values.seed, '', '局号只收数字');
  assert.equal(readSettings('?scenario=nope', makeStore()).values.scenario, 'campaign');
  assert.deepEqual(new Set(knownUrlKeys), new Set([
    'ink', 'mat', 'grade', 'trees', 'tex', 'ctex', 'units', 'capitals', 'quality', 'motion', 'terrain',
    'scenario', 'difficulty', 'seed', 'auto', 'mute', 'economy',
  ]));
});

test('优先级：URL 显式 > 已保存 > 默认，并如实标注来源', () => {
  const store = makeStore({ [STORE_KEY]: JSON.stringify({ ink: true, units: false, ground: true }) });
  const { values, sources } = readSettings('?ink=0', store);
  assert.equal(values.ink, false); assert.equal(sources.ink, 'url');
  assert.equal(values.units, false); assert.equal(sources.units, 'saved');
  assert.equal(values.ground, true); assert.equal(sources.ground, 'saved');
  assert.equal(values.capitals, true); assert.equal(sources.capitals, 'default');
});

test('战局是链接级指令：择关记忆键不能劫持裸链接', () => {
  // 开场页点剧本会写 shaosong.scenario（便捷预选）；主 store 里也可能有旧值。
  // 两者都不得让 ?seed=123456 这样的裸链接被强制加载剧本关。
  const store = makeStore({
    [LEGACY_KEYS.scenario]: 'shunchang',
    [STORE_KEY]: JSON.stringify({ scenario: 'yancheng' }),
  });
  const bare = readSettings('?seed=123456', store);
  assert.equal(bare.values.scenario, 'campaign');
  assert.equal(bare.sources.scenario, 'default');
  assert.equal(derive(bare.values, {}).scenario, null);

  const explicit = readSettings('?scenario=yancheng', store);
  assert.equal(derive(explicit.values, {}).scenario, 'yancheng');
  assert.equal(explicit.sources.scenario, 'url');

  // 面板改战局由 syncUrl 写链接即可，不应落盘
  writeSetting('scenario', 'shunchang', store);
  assert.equal(readSettings('', store).values.scenario, 'campaign');
  assert.equal(settingById('scenario').urlOnly, true);
});

test('写入单项偏好，legacy 项复用 ui.js 的旧键', () => {
  const store = makeStore();
  writeSetting('ink', true, store);
  writeSetting('mute', true, store);
  writeSetting('difficulty', 'hard', store);
  writeSetting('seed', '12a34', store);
  assert.equal(store.getItem(LEGACY_KEYS.mute), '1');
  assert.equal(store.getItem(LEGACY_KEYS.difficulty), 'hard');
  const { values, sources } = readSettings('', store);
  assert.equal(values.ink, true); assert.equal(sources.ink, 'saved');
  assert.equal(values.mute, true); assert.equal(sources.mute, 'saved');
  assert.equal(values.difficulty, 'hard');
  assert.equal(values.seed, '1234', '文本项写入时即被清洗');
  assert.equal(settingById('nope'), undefined);
});

test('链接往返：联动的 tex/ctex 不能互相隐含打开', () => {
  const cases = [
    { ground: true, city: false },
    { ground: false, city: true },
    { ground: true, city: true },
    { ground: false, city: false },
  ];
  for (const c of cases) {
    const values = { ...defaults(), ...c, ink: true, units: false, capitals: false, trees: false, mat: false, grade: false, quality: 'low', motion: 'off', seed: '42', scenario: 'shunchang', difficulty: 'easy', auto: true, mute: true };
    const search = encodeSearch(values);
    const back = readSettings(search, makeStore()).values;
    assert.deepEqual(back, values, `往返不一致：${search}`);
  }
  assert.equal(encodeSearch({ ...defaults(), ground: true, city: false }), 'tex=1&ctex=0');
  assert.equal(encodeSearch({ ...defaults(), ground: false, city: true }), 'tex=0&ctex=1');
  assert.equal(encodeSearch(defaults()), '', '全默认时链接保持干净');
});

test('编码保留无关参数，恢复默认清空全部偏好', () => {
  const search = encodeSearch({ ...defaults(), ink: true }, '?foo=bar&ink=0');
  assert.equal(search, 'foo=bar&ink=1');
  assert.equal(applyUrl({ ...defaults(), quality: 'low' }, 'http://x.test/game/?foo=bar'),
    'http://x.test/game/?foo=bar&quality=low');

  const store = makeStore({ [STORE_KEY]: JSON.stringify({ ink: true }), [LEGACY_KEYS.mute]: '1', [LEGACY_KEYS.difficulty]: 'hard' });
  resetSettings(store);
  assert.equal(store.getItem(STORE_KEY), null);
  assert.equal(store.getItem(LEGACY_KEYS.mute), null);
  assert.deepEqual(readSettings('', store).values, defaults());
});

test('derive 派生出渲染层与开局层实际需要的字段', () => {
  const d = derive({ ...defaults(), quality: 'auto', motion: 'off', seed: '123456', scenario: 'yancheng', difficulty: 'hard' },
    { autoQuality: 'low', systemReducedMotion: false });
  assert.equal(d.quality, 'low', '自动档交给设备判定');
  assert.equal(d.reducedMotion, true, '强制关动效覆盖系统偏好');
  assert.equal(d.seed, 123456);
  assert.equal(d.scenario, 'yancheng');
  assert.equal(d.difficulty, 'hard');
  assert.equal(d.tex, false);
  assert.equal(d.ctex, false);
  assert.equal(d.trees, true);
  assert.equal(d.mat, true, '默认开材质质感');
  assert.equal(derive({ ...defaults(), trees: false }, {}).trees, false);
  assert.equal(derive({ ...defaults(), mat: false }, {}).mat, false);
  assert.equal(d.grade, true, '默认开开场页电影感');
  assert.equal(derive({ ...defaults(), grade: false }, {}).grade, false);
  assert.equal(d.economy, false, '治略默认关闭');
  assert.equal(derive({ ...defaults(), economy: true }, {}).economy, true);
  assert.equal(settingById('economy').effect, 'live', '治略可即时开关，不必重载');
  assert.equal(derive({ ...defaults(), motion: 'on' }, { systemReducedMotion: true }).reducedMotion, false);
  assert.equal(derive({ ...defaults(), scenario: 'campaign' }, {}).scenario, null);
  assert.equal(derive({ ...defaults(), seed: '0' }, {}).seed, null);
});
