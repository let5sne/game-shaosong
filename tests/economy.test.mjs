/**
 * 治略层单测：纯 Node，不依赖 DOM / WebGL。
 *   npm test
 *
 * 四件事：
 *   1. economy.js 的纯函数（等级、造价、里程碑、军械、备荒、存档归一化）
 *   2. rules.js 的接线（营建／差遣政令、回合度支、实战阅历、城陷清零）
 *   3. 关闭态必须完全中性 —— 这是原版 seed=1..N 胜率基线不动的前提
 *   4. battleParams 仍是实战／推演／托管共用的唯一真源
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  economyActive, createEconomy, normalizeEconomy,
  buildCost, buildingLevels, razeBuildings, consumeGranary,
  BUILDINGS, BUILDING_IDS, DISPATCH_TASKS, DISPATCH_IDS,
  MAX_BUILDING_LEVEL, MAX_HERO_LEVEL, ARMS_CAP, DISPATCH_PER_TURN,
  LEVEL_XP, HERO_MILESTONES, heroRecord, heroLevelFromExp, heroProgress,
  heroBonus, officeBonus, armsAttackBonus, economyCombatBonus,
  economyCapBonus, economyIncome, economyYield,
} from '../src/economy.js';
import {
  GameState, battleParams, previewBattle, troopCap,
} from '../src/rules.js';
import { serialize, restore } from '../src/save.js';
import { HEROES } from '../src/data.js';

/** 造一局有钱有粮有政令的治略局，省得每条断言都先跟资源门槛较劲 */
function funded(opts = {}) {
  const s = new GameState({ seed: 11, economy: true, ...opts });
  s.gold = 600; s.grain = 600; s.decree = 30;
  return s;
}

// ── 纯函数 ────────────────────────────────────────────────

test('设施与差遣表自洽：id 唯一、级数与文案齐全', () => {
  assert.equal(BUILDINGS.length, 4);
  assert.equal(new Set(BUILDING_IDS).size, BUILDING_IDS.length);
  assert.equal(new Set(DISPATCH_IDS).size, DISPATCH_IDS.length);
  for (const b of BUILDINGS) {
    assert.ok(b.id && b.name && b.glyph && b.desc);
    assert.ok(b.effect(1) && b.effect(MAX_BUILDING_LEVEL));
  }
  for (const t of DISPATCH_TASKS) assert.ok(t.id && t.name && t.tag && t.desc);
  assert.equal(LEVEL_XP.length, MAX_HERO_LEVEL);
  assert.ok(LEVEL_XP.every((v, i) => i === 0 || v > LEVEL_XP[i - 1]), '阅历门槛严格递增');
});

test('createEconomy 形状完整，且每次返回独立对象', () => {
  const a = createEconomy(), b = createEconomy();
  assert.notEqual(a, b);
  assert.notEqual(a.buildings, b.buildings);
  assert.equal(a.v, 1);
  assert.equal(a.arms, 0);
  assert.equal(a.dispatchTurn, 0);
  assert.equal(a.built, 0);
  assert.equal(a.dispatches, 0);
  assert.deepEqual(Object.keys(a.heroes), []);
});

test('buildCost 逐级递增、恒占一道政令，越界钳到满级', () => {
  const costs = [0, 1, 2, 3].map(buildCost);
  for (const c of costs) assert.equal(c.decree, 1);
  assert.ok(costs.every((c, i) => i === 0 || (c.gold > costs[i - 1].gold && c.grain > costs[i - 1].grain)));
  assert.deepEqual(buildCost(9), buildCost(MAX_BUILDING_LEVEL));
  assert.deepEqual(buildCost(-3), buildCost(0));
});

test('buildingLevels 缺城返回全零，越界等级钳到 3', () => {
  const ec = createEconomy();
  const zero = buildingLevels(ec, 'linan');
  assert.equal(Object.keys(zero).length, BUILDING_IDS.length);
  assert.ok(BUILDING_IDS.every(id => zero[id] === 0));
  ec.buildings.linan = { tuntian: 99, zuofang: -5, unknown: 7 };
  const lv = buildingLevels(ec, 'linan');
  assert.equal(lv.tuntian, MAX_BUILDING_LEVEL);
  assert.equal(lv.zuofang, 0);
  assert.equal(lv.unknown, undefined, '未登记的设施不许混进来');
});

test('阅历等级按门槛递进并有上限，进度条在满级封顶', () => {
  assert.equal(heroLevelFromExp(0), 1);
  assert.equal(heroLevelFromExp(LEVEL_XP[1] - 1), 1);
  assert.equal(heroLevelFromExp(LEVEL_XP[1]), 2);
  assert.equal(heroLevelFromExp(LEVEL_XP[MAX_HERO_LEVEL - 1]), MAX_HERO_LEVEL);
  assert.equal(heroLevelFromExp(99999), MAX_HERO_LEVEL);
  const ec = createEconomy();
  ec.heroes.yuefei = { exp: LEVEL_XP[2], lastDispatchTurn: 0, count: 3 };
  const p = heroProgress(ec, 'yuefei');
  assert.equal(p.level, 3);
  assert.equal(p.maxed, false);
  assert.equal(p.ratio, 0, '刚够门槛升级时进度条回到起点');
  ec.heroes.yuefei.exp += 25;
  const mid = heroProgress(ec, 'yuefei');
  assert.ok(mid.ratio > 0 && mid.ratio < 1, '过半阅历时进度条落在 0~1 之间');
  ec.heroes.yuefei.exp = LEVEL_XP[2];
  assert.equal(p.dispatches, 3);
  assert.equal(p.unlocked.length, 1, 'Lv3 恰好解锁第一条专属战法');
  assert.equal(p.locked.length, 1);
  ec.heroes.yuefei.exp = 99999;
  const max = heroProgress(ec, 'yuefei');
  assert.equal(max.maxed, true);
  assert.equal(max.ratio, 1);
  assert.equal(max.unlocked.length, 2);
});

test('heroBonus 只在达到里程碑时挂专属战法，秦桧带负面守势', () => {
  const ec = createEconomy();
  const before = heroBonus(ec, 'yuefei');
  assert.equal(before.atk, 0);
  ec.heroes.yuefei = { exp: LEVEL_XP[2], lastDispatchTurn: 0, count: 0 };
  const lv3 = heroBonus(ec, 'yuefei');
  assert.ok(lv3.atk > 0);
  assert.ok(Math.abs(lv3.atk - (2 * 0.012 + HERO_MILESTONES.yuefei[0].atk)) < 1e-9);
  ec.heroes.qinhui = { exp: 99999, lastDispatchTurn: 0, count: 0 };
  assert.ok(heroBonus(ec, 'qinhui').defend < 0, '人物设定仍要作数，养成不等于一律变强');
  assert.ok(heroBonus(ec, 'qinhui').goldBonus > 0);
  assert.equal(heroBonus(ec, 'nobody').atk, 0);
  assert.equal(Object.keys(HERO_MILESTONES).length, HEROES.length, '八员皆有两级里程碑');
});

test('军械攻势封顶 12%，不会因囤积把棋盘玩成刷子', () => {
  assert.equal(armsAttackBonus(0), 0);
  assert.equal(armsAttackBonus(-10), 0);
  assert.ok(Math.abs(armsAttackBonus(20) - 0.06) < 1e-9);
  assert.equal(armsAttackBonus(40), 0.12);
  assert.equal(armsAttackBonus(ARMS_CAP), 0.12);
  assert.equal(armsAttackBonus(9999), 0.12);
});

test('备荒按最高级仓廪开仓，级数耗尽即移除，不误删同城其他设施', () => {
  const ec = createEconomy();
  assert.equal(consumeGranary(ec), null);
  ec.buildings = { a: { canglin: 2, tuntian: 1 }, b: { canglin: 1 } };
  assert.equal(consumeGranary(ec), 'a');
  assert.equal(ec.buildings.a.canglin, 1);
  assert.equal(ec.buildings.a.tuntian, 1, '别把同城其他设施一起烧了');
  assert.equal(consumeGranary(ec), 'a');
  assert.equal(ec.buildings.a.canglin, undefined, '仓廪级数耗尽');
  assert.equal(ec.buildings.a.tuntian, 1);
  assert.equal(consumeGranary(ec), 'b', 'a 已无仓，转去 b');
  assert.equal(ec.buildings.b, undefined, 'b 只剩仓廪，整条记录清空');
  assert.equal(consumeGranary(ec), null, '再无仓可开');
  assert.deepEqual(ec.buildings, { a: { tuntian: 1 } });
});

test('razeBuildings 只删指定州郡，重复删返回 false', () => {
  const ec = createEconomy();
  ec.buildings = { linan: { tuntian: 2 }, jiankang: { shibo: 1 } };
  assert.equal(razeBuildings(ec, 'linan'), true);
  assert.equal(ec.buildings.linan, undefined);
  assert.equal(ec.buildings.jiankang.shibo, 1);
  assert.equal(razeBuildings(ec, 'linan'), false);
  assert.equal(razeBuildings(null, 'linan'), false);
});

test('normalizeEconomy 兼容旧档、坏档，并钳制非法数值', () => {
  assert.equal(normalizeEconomy(undefined), null);
  assert.equal(normalizeEconomy(null), null);
  assert.equal(normalizeEconomy({ v: 999 }), null, '版本号不符一律按新建处理');
  const ec = normalizeEconomy({
    v: 1,
    buildings: { linan: { tuntian: 99, zuofang: -1, bogus: 5 }, bad: null, ghost: { shibo: 2 } },
    heroes: { yuefei: { exp: -5, count: 2 }, fake: { exp: 500 } },
    arms: 9999, dispatchTurn: 7, built: 3, dispatches: 4,
  });
  assert.equal(ec.buildings.linan.tuntian, MAX_BUILDING_LEVEL);
  assert.equal(ec.buildings.linan.zuofang, undefined);
  assert.equal(ec.buildings.linan.bogus, undefined);
  assert.equal(ec.buildings.bad, undefined);
  assert.equal(ec.heroes.yuefei.exp, 0);
  assert.equal(ec.heroes.yuefei.count, 2);
  assert.equal(ec.heroes.fake, undefined, '未登记将领不能混进存档');
  assert.equal(ec.arms, ARMS_CAP);
  assert.equal(ec.dispatchTurn, 7);
  assert.equal(ec.built, 3);
  const nan = normalizeEconomy({ v: 1, arms: 'abc', heroes: { yuefei: { exp: NaN } } });
  assert.equal(nan.arms, 0);
  assert.equal(nan.heroes.yuefei.exp, 0, '绝不把 NaN 带进规则层');
});

// ── 关闭态中性 ────────────────────────────────────────────

test('默认关闭：数据与开关皆空，所有查询返回中性值', () => {
  const s = new GameState({ seed: 2026 });
  assert.equal(s.economyOn, false);
  assert.equal(s.economy, null);
  assert.equal(economyActive(s), false);
  assert.deepEqual(economyCombatBonus(s), { atk: 0, defend: 0, arms: 0, levelAtk: 0 });
  assert.equal(economyCapBonus(s), 0);
  assert.deepEqual(economyIncome(s), { flat: 0, ratio: 0, farms: 0 });
  assert.ok(Object.values(economyYield(s)).every(v => v === 0));
  assert.ok(Object.values(officeBonus(s)).every(v => v === 0));
  const P = battleParams(s, s.cities.shouchun, s.cities.caizhou, 'song', 3);
  assert.equal(P.atkParts.some(([n]) => n.includes('治略')), false);
});

test('关闭时营建／差遣一律拒绝，且不扣政令钱粮', () => {
  const s = new GameState({ seed: 5 });
  const before = { decree: s.decree, gold: s.gold, grain: s.grain };
  assert.equal(s.yingjian('linan', 'tuntian'), false);
  assert.equal(s.chaiqian('yuefei', 'linan', 'tunken'), false);
  assert.equal(s.decree, before.decree);
  assert.equal(s.gold, before.gold);
  assert.equal(s.grain, before.grain);
});

test('开启后再冻结：战斗系数逐项回到原版，且进度封存不丢', () => {
  const off = new GameState({ seed: 3 });
  off.heroId = 'yuefei';
  const on = new GameState({ seed: 3, economy: true });
  on.heroId = 'yuefei';
  on.economy.arms = 40;
  on.economy.heroes.yuefei = { exp: 99999, lastDispatchTurn: 0, count: 0 };
  const from = on.cities.shouchun, to = on.cities.caizhou;
  const send = Math.max(2, Math.floor(from.troops * 0.7));
  const hot = battleParams(on, from, to, 'song', send);
  const cold = battleParams(off, off.cities.shouchun, off.cities.caizhou, 'song', send);
  assert.ok(hot.atkBonus > cold.atkBonus, '开启时加成确实生效');
  assert.deepEqual(hot.atkParts.filter(([n]) => n.includes('治略')).length, 1);
  assert.equal(on.setEconomy(false), true);
  assert.equal(on.economyOn, false);
  assert.ok(on.economy && on.economy.arms === 40, '冻结只停结算，不清进度');
  const frozen = battleParams(on, from, to, 'song', send);
  assert.equal(frozen.atkBonus, cold.atkBonus, '冻结态与原版逐字节一致');
  assert.equal(frozen.defBonus, cold.defBonus);
  assert.equal(troopCap(on, on.cities.linan), troopCap(off, off.cities.linan));
  assert.equal(economyCombatBonus(on).atk, 0);
  assert.equal(on.setEconomy(false), false, '重复切换不算一次变更');
  assert.equal(on.setEconomy(true), true);
  assert.equal(on.economy.arms, 40, '复行新法续用旧进度');
  assert.equal(on.setEconomy(true), false);
});

test('兵额加成同样只在开启态生效', () => {
  const off = new GameState({ seed: 4 });
  off.heroId = 'zhangjun';
  const on = new GameState({ seed: 4, economy: true });
  on.heroId = 'zhangjun';
  on.economy.heroes.zhangjun = { exp: 99999, lastDispatchTurn: 0, count: 0 };
  assert.equal(economyCapBonus(off), 0);
  assert.ok(economyCapBonus(on) > 0);
  assert.ok(troopCap(on, on.cities.linan) >= troopCap(off, off.cities.linan));
});

// ── 规则接线 ──────────────────────────────────────────────

test('营建扣政令钱粮、逐级涨价，满级与非己方州郡皆拒', () => {
  const s = funded();
  const c0 = buildCost(0);
  assert.equal(s.yingjian('linan', 'tuntian'), true);
  assert.equal(buildingLevels(s.economy, 'linan').tuntian, 1);
  assert.equal(s.gold, 600 - c0.gold);
  assert.equal(s.grain, 600 - c0.grain);
  assert.equal(s.decree, 30 - 1);
  assert.equal(s.economy.built, 1);
  assert.equal(s.yingjian('linan', 'tuntian'), true);
  assert.equal(s.yingjian('linan', 'tuntian'), true);
  assert.equal(s.yingjian('linan', 'tuntian'), false, '第 4 次应撞上 3 级上限');
  assert.equal(buildingLevels(s.economy, 'linan').tuntian, MAX_BUILDING_LEVEL);
  const spent = s.decree;
  assert.equal(s.yingjian('linan', 'bogus'), false);
  assert.equal(s.yingjian('kaifeng', 'tuntian'), false, '金人州郡不能营建');
  assert.equal(s.yingjian('nowhere', 'tuntian'), false);
  assert.equal(s.decree, spent, '被拒的指令不许扣政令');
});

test('差遣：每员每回合一次、全朝至多两遣，三类任务各有产出', () => {
  const s = funded();
  const grain0 = s.grain, gold0 = s.gold;
  assert.equal(s.chaiqian('yuefei', 'linan', 'tunken'), true);
  assert.ok(s.grain > grain0, '督屯得粮');
  assert.ok(heroRecord(s.economy, 'yuefei').exp > 0);
  assert.equal(s.chaiqian('yuefei', 'linan', 'tunken'), false, '同一员本回合不可再遣');
  assert.equal(s.chaiqian('ligang', 'linan', 'duzao'), true);
  assert.ok(s.gold < gold0, '督造耗钱');
  assert.ok(s.economy.arms >= 8, '督造进军械');
  assert.equal(s.chaiqian('hanshizhong', 'linan', 'xunbian'), false, '全朝两遣已满');
  assert.equal(s.economy.dispatches, 2);
  assert.equal(s.chaiqian('nobody', 'linan', 'tunken'), false);
  assert.equal(s.chaiqian('ligang', 'nowhere', 'tunken'), false);
  assert.equal(s.chaiqian('ligang', 'linan', 'bogus'), false);
});

test('差遣额度按回合重置，巡边增兵不逾兵额', () => {
  const s = funded();
  const c = s.cities.linan;
  c.troops = troopCap(s, c);
  assert.equal(s.chaiqian('yuefei', 'linan', 'xunbian'), true);
  assert.equal(c.troops, troopCap(s, c), '兵额已满时不许溢出');
  assert.equal(s.economy.dispatchTurn, 1);
  s.endTurn();
  assert.equal(s.economy.dispatchTurn, 0, '新回合恢复差遣额度');
  assert.equal(s.chaiqian('yuefei', 'linan', 'tunken'), true, '上回合的差遣记录不再拦人');
});

test('grantExp 是升级播报的唯一入口，跨度升级一次补齐两条战法', () => {
  const s = funded();
  // say() 用 unshift，最新战报在队首；按条数差统计才不会取到旧日志
  const notes = () => s.logs.filter(l => l.text.includes('【进阶】'));
  const before = notes().length;
  s.grantExp('yuefei', LEVEL_XP[4]);
  const note = notes();
  assert.equal(note.length - before, 1, '一次授历练只播报一次');
  assert.ok(note[0].text.includes('连结河朔') && note[0].text.includes('背嵬亲军'));
  assert.equal(heroProgress(s.economy, 'yuefei').level, 5);
  const n = s.logs.length;
  s.grantExp('yuefei', 1);
  assert.equal(s.logs.length, n, '未升级不刷屏');
  s.grantExp(null, 100);
  s.grantExp('yuefei', -5);
  assert.equal(heroRecord(s.economy, 'yuefei').exp, LEVEL_XP[4] + 1);
});

test('回合度支：市舶进钱、作坊进军械、屯田增赋、仓廪省戍粮', () => {
  const s = funded();
  s.economy.buildings.linan = { shibo: 2, zuofang: 2, canglin: 2, tuntian: 2 };
  const y = economyYield(s);
  assert.equal(y.gold, 6);
  assert.equal(y.arms, 4);
  assert.equal(y.upkeepRelief, 0.5);
  assert.equal(y.markets, 2);
  assert.equal(y.workshops, 2);
  assert.equal(y.granaries, 2);
  assert.ok(economyIncome(s).flat > 0);
  assert.equal(economyIncome(s).farms, 2);
  const arms0 = s.economy.arms;
  s.endTurn();
  assert.equal(s.economy.arms, Math.min(ARMS_CAP, arms0 + 4));
  assert.ok(s.logs.some(l => l.text.includes('【治略·度支】')));
});

test('在任将领的合成效果：主帅全额、分帅半额', () => {
  const s = funded();
  s.heroId = 'liqi';
  s.viceHeroId = 'wujie';
  s.economy.heroes.liqi = { exp: 99999, lastDispatchTurn: 0, count: 0 };
  s.economy.heroes.wujie = { exp: 99999, lastDispatchTurn: 0, count: 0 };
  const main = heroBonus(s.economy, 'liqi');
  const vice = heroBonus(s.economy, 'wujie');
  const both = officeBonus(s);
  assert.ok(Math.abs(both.defend - (main.defend + vice.defend * 0.5)) < 1e-9);
  assert.ok(economyCombatBonus(s).defend > 0);
  s.viceHeroId = null;
  assert.ok(Math.abs(officeBonus(s).defend - main.defend) < 1e-9);
});

test('缺粮时开仓放赈，仓廪降一级而非常规饥荒', () => {
  const s = funded();
  s.economy.buildings.jiankang = { canglin: 2 };
  s.grain = -5000;   // 压到岁入也补不回来，确保走备荒分支而非普通度支
  s.endTurn();
  assert.ok(s.logs.some(l => l.text.includes('【备荒】')), '备荒日志应出现');
  assert.equal(s.economy.buildings.jiankang.canglin, 1);
});

test('实战论功积阅历，城池易主则历年营建尽付兵燹', () => {
  const s = funded();
  s.heroId = 'yuefei';
  s.cities.caizhou.owner = 'song';   // 临时归宋以便营建
  s._supplyKey = null;
  assert.equal(s.yingjian('caizhou', 'tuntian'), true);
  assert.equal(buildingLevels(s.economy, 'caizhou').tuntian, 1);
  s.cities.caizhou.owner = 'jin';
  s._supplyKey = null;
  const exp0 = heroRecord(s.economy, 'yuefei').exp;
  const r = s.battle(s.cities.shouchun, s.cities.caizhou, 80, 'song');
  assert.equal(r.win, true, '压倒性兵力应稳克，便于稳定断言');
  assert.ok(heroRecord(s.economy, 'yuefei').exp > exp0, '胜仗给在任将领记功');
  assert.equal(s.economy.buildings.caizhou, undefined, '城陷即清零');
  assert.ok(s.logs.some(l => l.text.includes('尽付兵燹')));
});

// ── 唯一真源与存档 ────────────────────────────────────────

test('battleParams 是唯一真源：实战明细与战前推演同源', () => {
  const s = funded();
  s.heroId = 'yuefei';
  s.economy.arms = 40;
  s.economy.heroes.yuefei = { exp: 99999, lastDispatchTurn: 0, count: 0 };
  const from = s.cities.shouchun, to = s.cities.caizhou;
  const send = Math.max(2, Math.floor(from.troops * 0.7));
  const P = battleParams(s, from, to, 'song', send);
  const pv = previewBattle(s, 'shouchun', 'caizhou');
  assert.equal(pv.kind, 'attack');
  assert.deepEqual(pv.atkParts, P.atkParts, '推演把同一份攻守明细摊给玩家');
  assert.equal(pv.atkMin, P.atkBase * 0.85);
  assert.ok(pv.atkParts.some(([n]) => n.includes('治略·器械与阅历')));
  const bonus = economyCombatBonus(s);
  assert.ok(bonus.atk === bonus.arms + bonus.levelAtk, '军械与阅历合成一个数进公式');
});

test('存档往返保留设施与阅历；冻结态封存、复行新法可续用', () => {
  const s = funded({ seed: 9 });
  assert.equal(s.yingjian('linan', 'tuntian'), true);
  assert.equal(s.chaiqian('yuefei', 'linan', 'tunken'), true);
  const raw = serialize(s);
  const t = new GameState({ seed: 1 });
  assert.equal(restore(t, raw), true);
  assert.equal(t.economyOn, true);
  assert.equal(buildingLevels(t.economy, 'linan').tuntian, 1);
  assert.ok(heroRecord(t.economy, 'yuefei').exp > 0);

  assert.equal(s.setEconomy(false), true);
  const frozen = new GameState({ seed: 1 });
  assert.equal(restore(frozen, serialize(s)), true);
  assert.equal(frozen.economyOn, false);
  assert.equal(buildingLevels(frozen.economy, 'linan').tuntian, 1, '关掉只冻结，不丢进度');
  assert.equal(frozen.setEconomy(true), true);
  assert.equal(frozen.economyOn, true);
  assert.equal(buildingLevels(frozen.economy, 'linan').tuntian, 1);
});

test('旧档无经营字段可按未开启续玩，坏档清洗后不带 NaN 进规则层', () => {
  const s = funded({ seed: 9 });
  const legacy = JSON.parse(serialize(s));
  delete legacy.economy;
  delete legacy.economyOn;
  const a = new GameState({ seed: 1 });
  assert.equal(restore(a, JSON.stringify(legacy)), true);
  assert.equal(a.economy, null);
  assert.equal(a.economyOn, false);
  assert.equal(economyCombatBonus(a).atk, 0);

  // 版本号相符但字段全坏：按「空进度」清洗，不使整档失效
  const broken = JSON.parse(serialize(s));
  broken.economy = { v: 1, arms: NaN, buildings: 'oops' };
  broken.economyOn = true;
  const b = new GameState({ seed: 1 });
  assert.equal(restore(b, JSON.stringify(broken)), true);
  assert.ok(b.economy, '坏字段清洗成一份干净空数据');
  assert.equal(b.economy.arms, 0);
  assert.deepEqual(b.economy.buildings, {});
  assert.equal(economyCombatBonus(b).atk, 0, 'NaN 不得流入战斗系数');

  // 版本号不符：整份经营数据作废，开关一并关掉
  const wrong = JSON.parse(serialize(s));
  wrong.economy = { v: 999 };
  wrong.economyOn = true;
  const c = new GameState({ seed: 1 });
  assert.equal(restore(c, JSON.stringify(wrong)), true);
  assert.equal(c.economy, null);
  assert.equal(c.economyOn, false, '开关不能比数据更真');
});

test('新局默认关闭；重开(reset)不带 economy 时沿用本局开关，不会偷偷退出治略', () => {
  assert.equal(new GameState({ seed: 2 }).economyOn, false);
  assert.equal(new GameState({ seed: 2, economy: false }).economy, null);
  assert.equal(new GameState({ seed: 2, economy: 1 }).economyOn, true);

  const s = new GameState({ seed: 1, economy: true });
  s.economy.buildings.linan = { tuntian: 2 };
  s.reset({ seed: 2 });                 // ui.js :: restart() 走的就是这条
  assert.equal(s.economyOn, true, '重开不退出当前玩法');
  assert.equal(buildingLevels(s.economy, 'linan').tuntian, 0, '但进度随新局清空');
  s.reset({ seed: 3, economy: false });
  assert.equal(s.economyOn, false, '显式传参可覆盖');
  assert.equal(s.economy, null);
});
