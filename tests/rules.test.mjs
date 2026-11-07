/**
 * 规则层单测：纯 Node，不依赖 DOM / WebGL。
 *   npm test
 * 覆盖可复现随机流、存档续玩、粮道缓存、政令与亲征约束、
 * 战前推演与实战同源、胜负判定、事件边界。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GameState, supplyMap, marchCost, battleParams, previewBattle, winChance,
  MAX_CHARGE, VICTORY_JIN_LIMIT, VICE_COST_GOLD, VICE_COURT_HE,
} from '../src/rules.js';
import { serialize, restore } from '../src/save.js';
import {
  chooseAction, applyAction, chooseEvent, newTurnContext,
} from '../src/autoplay.js';
import { EVENTS, DIFFICULTIES, CITY_DEFS } from '../src/data.js';

const snapshot = s => JSON.stringify({
  turn: s.turn, grain: s.grain, gold: s.gold, morale: s.morale,
  popularity: s.popularity, decree: s.decree, rng: s.rngState,
  over: s.over, heroId: s.heroId, heroCity: s.heroCity, chargeUsed: s.chargeUsed,
  viceHeroId: s.viceHeroId, viceHeroCity: s.viceHeroCity,
  flags: [...(s.flags || [])],
  cities: CITY_DEFS.map(d => [d.id, s.cities[d.id].owner, s.cities[d.id].troops]),
  logs: s.logs.map(l => l.text),
});

/** 用托管 AI 推进整局；与 scripts/simulate.mjs 同一套驱动 */
function step(s, maxTurns = 60) {
  let n = 0;
  while (!s.over && n++ < maxTurns) {
    if (s.pendingEvent) { s.resolveEvent(chooseEvent(s)); continue; }
    const ctx = newTurnContext(s);
    let k = 0;
    while (!s.over && !s.pendingEvent && s.decree > 0 && k++ < 14) {
      const a = chooseAction(s, ctx);
      if (!a || !applyAction(s, a, ctx)) break;
    }
    if (s.over || s.pendingEvent) continue;
    s.endTurn();
  }
}

test('同一局号 + 同一指令序列，必得完全相同的一局', () => {
  const a = new GameState({ seed: 2026 });
  const b = new GameState({ seed: 2026 });
  const c = new GameState({ seed: 2027 });
  step(a); step(b); step(c);
  assert.equal(snapshot(a), snapshot(b));
  assert.notEqual(snapshot(a), snapshot(c));
});

test('random:false 不抽开局变局，随机流仍可用', () => {
  const s = new GameState({ seed: 5, random: false });
  assert.equal(s.variant.notes.length, 0);
  const v = s.nextRandom();
  assert.ok(v >= 0 && v < 1);
  assert.ok(Number.isFinite(s.rngState));
});

test('rngState 随掷点推进，且存档往返后掷点序列延续', () => {
  const s = new GameState({ seed: 6 });
  const before = s.rngState;
  s.nextRandom();
  assert.notEqual(s.rngState, before);
  const t = new GameState({ seed: 1 });
  assert.ok(restore(t, serialize(s)));
  assert.equal(t.rngState, s.rngState);
  assert.equal(t.nextRandom(), s.nextRandom());
});

test('存档往返保留督军、亲征次数与随机流；旧档缺字段有兜底', () => {
  const s = new GameState({ seed: 9 });
  s.decree = 9;
  assert.equal(s.renming('yuefei'), true);
  assert.equal(s.dujun('jiankang'), true);
  assert.equal(s.qinzheng(), true);
  const raw = serialize(s);
  assert.equal(JSON.parse(raw).chargeUsed, 1);

  const t = new GameState({ seed: 1 });
  assert.ok(restore(t, raw));
  assert.equal(t.heroCity, s.heroCity);
  assert.equal(t.chargeUsed, 1);
  assert.equal(t.rngState, s.rngState);

  const old = JSON.parse(raw);
  delete old.rngState; delete old.chargeUsed; delete old.heroCity;
  const u = new GameState({ seed: 1 });
  assert.ok(restore(u, JSON.stringify(old)));
  assert.equal(u.chargeUsed, 0);
  assert.equal(u.heroCity, null);
  assert.ok(Number.isFinite(u.rngState));
});

test('存档续玩与不中断的一局完全一致', () => {
  const a = new GameState({ seed: 11 });
  step(a, 4);
  const b = new GameState({ seed: 1 });
  assert.ok(restore(b, serialize(a)));
  step(a, 50); step(b, 50);
  assert.equal(snapshot(a), snapshot(b));
});

test('粮道：行在跳数为 0，长安开局孤悬；归属变化后缓存自动失效', () => {
  const s = new GameState({ seed: 3, random: false });
  const a = supplyMap(s);
  assert.equal(a.dist.jiankang, 0);
  assert.equal(a.dist.linan, 0);
  assert.ok(a.dist.shouchun > 0);
  assert.ok(a.isolated.includes('changan'));
  assert.equal(a.dist.changan, Infinity);

  s.cities.luoyang.owner = 'song';
  s.cities.dengzhou.owner = 'song';   // 打通「长安—洛阳—邓州—襄阳」一线
  const b = supplyMap(s);
  assert.ok(b.linked.has('changan'));
  assert.ok(Number.isFinite(b.dist.changan));
  assert.notEqual(b, a);
});

test('行军粮耗随粮道变远而增加，孤城按转运上限计', () => {
  const s = new GameState({ seed: 4, random: false });
  const near = marchCost(s, s.cities.linan, s.cities.jiankang, 10);
  assert.equal(near, 16);            // 行在起兵：1.6／营，无涉水、无远征附加
  const far = marchCost(s, s.cities.changan, s.cities.luoyang, 10);
  assert.ok(far > near);
});

test('渡河另需舟楫粮耗与额外政令', () => {
  const s = new GameState({ seed: 4, random: false });
  const wet = previewBattle(s, 'chuzhou', 'xuzhou');
  assert.ok(wet.cross);
  assert.equal(wet.decreeCost, 2);
  assert.equal(wet.cost, marchCost(s, s.cities.chuzhou, s.cities.xuzhou, wet.send));
  const dry = previewBattle(s, 'linan', 'jiankang');
  assert.equal(dry.decreeCost, 1);
});

test('攻守系数确定性，胜率边界收敛', () => {
  const s = new GameState({ seed: 6, random: false });
  const from = s.cities.chuzhou, to = s.cities.xuzhou;
  assert.deepEqual(battleParams(s, from, to, 'song', 5), battleParams(s, from, to, 'song', 5));
  assert.equal(winChance(0, 100), 0);
  assert.equal(winChance(1000, 1), 1);
});

test('御驾亲征：两道政令、每局至多 MAX_CHARGE 次', () => {
  const s = new GameState({ seed: 8, random: false });
  s.decree = 99;
  for (let i = 0; i < MAX_CHARGE; i++) {
    assert.equal(s.canQinzheng, true);
    assert.equal(s.qinzheng(), true);
    s.charge = 0;              // 模拟 endTurn 复位黄旗
  }
  assert.equal(s.chargeUsed, MAX_CHARGE);
  assert.equal(s.canQinzheng, false);
  assert.equal(s.qinzheng(), false);
});

test('两京已复而中原残敌尚众，不算中兴', () => {
  const s = new GameState({ seed: 9, random: false });
  s.cities.kaifeng.owner = 'song';
  s.cities.yanjing.owner = 'song';
  s.changed();
  assert.equal(s.over, null);
  assert.ok(s.objective.remain > VICTORY_JIN_LIMIT);
  assert.match(s.objective.text, /扫清中原/);

  for (const c of s.jinCities.slice(0, s.jinCities.length - VICTORY_JIN_LIMIT)) c.owner = 'song';
  s.changed();
  assert.equal(s.over?.kind, 'win');
});

test('分路都督：另置幕府耗钱加耗粮，主帅常效与本路战法并存', () => {
  const s = new GameState({ seed: 12, random: false });
  s.decree = 99;
  const gold0 = s.gold, he0 = s.court.he;
  assert.equal(s.renming('yuefei'), true);
  assert.equal(s.renming('liqi', 'vice'), true);
  assert.equal(s.viceHero.name, '刘锜');
  assert.equal(s.gold, gold0 - VICE_COST_GOLD);
  assert.ok(s.court.he >= he0 + VICE_COURT_HE);   // 诸将不相统属，主和渐长
  assert.equal(s.renming('yuefei', 'vice'), false);  // 一人不兼两路
  assert.equal(s.renming('liqi'), false);            // 分帅不可同时总戎事

  assert.equal(s.dujun('jiankang', 'main'), true);
  assert.equal(s.dujun('chuzhou', 'vice'), true);
  const P = battleParams(s, s.cities.chuzhou, s.cities.xuzhou, 'song', 8);
  assert.ok(P.atkParts.some(([k]) => k.includes('分路')), '分帅本城应有分路战法／督军加成');
  assert.ok(P.atkParts.some(([k]) => k.startsWith('步阵')), '主帅常效不应被分镇削弱');
  const Q = battleParams(s, s.cities.jiankang, s.cities.luzhou, 'song', 8);
  assert.ok(!Q.atkParts.some(([k]) => k.includes('分路')), '他城不应吃到分帅战法');

  const raw = serialize(s);
  const t = new GameState({ seed: 1 });
  assert.ok(restore(t, raw));
  assert.equal(t.viceHeroId, 'liqi');
  assert.equal(t.viceHeroCity, 'chuzhou');
  assert.equal(t.heroCity, 'jiankang');
});

test('一州不置二节；分帅驻节城陷落则还朝，罢分路省下幕府', () => {
  const s = new GameState({ seed: 13, random: false });
  s.decree = 99;
  s.renming('yuefei'); s.renming('liqi', 'vice');
  assert.equal(s.dujun('shouchun', 'main'), true);
  assert.equal(s.dujun('shouchun', 'vice'), false);
  assert.equal(s.dujun('chuzhou', 'vice'), true);

  const from = s.cities.xuzhou, to = s.cities.chuzhou;
  from.troops = 40; to.troops = 1;
  s.battle(from, to, 25, 'jin');
  assert.equal(to.owner, 'jin');
  assert.equal(s.viceHeroCity, 'yangzhou');   // 就近移节，不必重下驻节令
  assert.equal(s.heroCity, 'shouchun');

  // 四周皆非我有，则幕府还朝
  const s2 = new GameState({ seed: 14, random: false });
  s2.decree = 99;
  s2.renming('yuefei'); s2.renming('liqi', 'vice');
  s2.dujun('jiankang', 'main'); s2.dujun('chuzhou', 'vice');
  for (const id of s2.cities.chuzhou.links) s2.cities[id].owner = 'jin';
  s2.cities.xuzhou.troops = 40; s2.cities.chuzhou.troops = 1;
  s2.battle(s2.cities.xuzhou, s2.cities.chuzhou, 25, 'jin');
  assert.equal(s2.viceHeroCity, null);

  assert.equal(s.dismissVice(), true);
  assert.equal(s.viceHero, null);
  assert.equal(s.hasVice, false);
});

test('事件链：选项留旗标、priority 优先接续，旗标随存档往返', () => {
  const s = new GameState({ seed: 20, random: false });
  s.pendingEvent = EVENTS.find(e => e.id === 'qinhui_gui');
  s.resolveEvent(0);
  assert.equal(s.pendingEvent, null);
  assert.ok(s.flags.has('qinhui_at_court'));

  s.turn = 6;
  s.maybeEvent();                       // 连锁事件不受随机门槛，条件成立即接续
  assert.equal(s.pendingEvent?.id, 'heyi_zhao');
  s.resolveEvent(0);
  assert.ok(s.flags.has('heyi_signed'));
  assert.equal(s.truce, 1);

  s.turn = 8;
  s.decree = 9;
  assert.equal(s.renming('yuefei'), true);
  s.maybeEvent();
  assert.equal(s.pendingEvent?.id, 'fengboting');
  s.resolveEvent(0);
  assert.equal(s.heroId, null);        // 收兵柄：自毁长城
  assert.ok(s.flags.has('yuefei_dismissed'));

  const t = new GameState({ seed: 1 });
  assert.ok(restore(t, serialize(s)));
  assert.ok(t.flags.has('qinhui_at_court'));
  assert.ok(t.flags.has('heyi_signed'));
  assert.ok(t.flags.has('yuefei_dismissed'));
  assert.equal(t.heroId, null);
});

test('无旗标时，链式事件不会凭空出现', () => {
  const s = new GameState({ seed: 21, random: false });
  s.turn = 10;                          // 5 的倍数，必有普通事件
  s.maybeEvent();
  assert.ok(s.pendingEvent);
  assert.ok(!['heyi_zhao', 'fengboting'].includes(s.pendingEvent.id));
});

test('文臣任分路：庙算补半道政令、漕运补半额漕粮', () => {
  const a = new GameState({ seed: 22, random: false });
  a.decree = 99; a.renming('yuefei');
  const d0 = a.calcDecree();
  a.viceHeroId = 'ligang';           // 直接置位，排除拜将时朝局变动的干扰
  const d1 = a.calcDecree();
  assert.ok(d1 >= d0 && d1 <= d0 + 1);

  const b = new GameState({ seed: 22, random: false });
  b.decree = 99; b.renming('yuefei');
  const grain0 = b.grain;
  b.chouliang();
  const plain = b.grain - grain0;
  const c = new GameState({ seed: 22, random: false });
  c.decree = 99; c.renming('yuefei'); c.viceHeroId = 'zhaoding';
  c.chouliang();
  assert.equal(c.grain - grain0 - plain, 3);   // 赵鼎 grainBonus 6 的半额
});

test('悔棋快照：逐令入栈后逆序恢复，局面、旗标与随机流均回到下令前', () => {
  const s = new GameState({ seed: 31, random: false });
  s.decree = 99;
  const stack = [serialize(s)];
  s.renming('yuefei'); s.renming('liqi', 'vice');
  s.dujun('chuzhou', 'vice');
  s.flags.add('qinhui_at_court');
  const before = snapshot(s);

  stack.push(serialize(s));
  s.chouliang();
  assert.notEqual(snapshot(s), before);

  const t = new GameState({ seed: 1 });
  assert.ok(restore(t, stack.pop()));
  assert.equal(snapshot(t), before);
  assert.ok(t.flags.has('qinhui_at_court'));
  assert.equal(t.viceHeroCity, 'chuzhou');

  assert.ok(restore(t, stack[0]));
  assert.equal(t.heroId, null);
  assert.equal(t.viceHeroId, null);
  assert.equal(t.flags.size, 0);
});

test('事件裁断：越界索引不消费事件', () => {
  const s = new GameState({ seed: 10, random: false });
  s.pendingEvent = EVENTS[0];
  s.resolveEvent(99);
  assert.equal(s.pendingEvent, EVENTS[0]);
  s.resolveEvent(0);
  assert.equal(s.pendingEvent, null);
});

test('三档国势的回合上限依次收紧', () => {
  const [easy, normal, hard] = DIFFICULTIES;
  assert.ok(easy.maxTurns > normal.maxTurns);
  assert.ok(normal.maxTurns > hard.maxTurns);
  assert.ok(hard.jinMight > normal.jinMight);
});
