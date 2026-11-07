/**
 * 托管推演 · 决策引擎
 *
 * 纯逻辑模块，不依赖 DOM：浏览器里由 UI 逐帧驱动同一个 GameState，
 * Node 里可直接批量模拟整局。策略是「一次一步」的贪心决策——
 * 每步都基于当前真实状态重算，避免计划赶不上战局变化。
 *
 * 为了让推演像一位稳健的统帅而非开挂的读档玩家，托管遵守三条自律：
 *   1) 三段战略：固淮 → 复旧都 → 取燕云，不越的阶段城池不攻；
 *   2) 用兵节律：每回合至多两度进军、两处整军；
 *   3) 攻城留余量：期望攻守比不足阈值便先蓄势，不赌运气。
 */
import { battleParams } from './rules.js';

export const BEST_HERO = 'yuefei';

const MARCH_LIMIT = 2;
const TRAIN_LIMIT = 2;
const ATTACK_THRESHOLD = 1.26;

/** 战略权重：按「复旧都 → 取燕云」的进军路线排定 */
const STRATEGIC_VALUE = {
  yanjing: 120, kaifeng: 110,
  daming: 46, zhending: 38, yingtian: 30,
  xuzhou: 26, jinan: 20, caizhou: 18, haizhou: 14,
  dengzhou: 12, luoyang: 12, taiyuan: 8,
};

const CENTRAL = ['xuzhou', 'yingtian', 'caizhou', 'haizhou', 'jinan', 'dengzhou', 'luoyang', 'daming', 'zhending'];

/** 三段战略：先固淮北外围，再复东京，最后经大名／真定取燕京 */
export function phaseOf(s) {
  const kf = s.cities.kaifeng.owner === 'song';
  const yj = s.cities.yanjing.owner === 'song';
  if (kf && yj) return '中兴有成';
  if (kf) return '取燕云';
  const central = CENTRAL.filter(id => s.cities[id].owner === 'song').length;
  return (central >= 4 && s.turn >= 7) ? '复旧都' : '固淮北';
}

/** 各阶段对目标的偏向；0 表示此阶段不取该城 */
const PHASE_BIAS = {
  固淮北: {
    kaifeng: 0, yanjing: 0, daming: 0, zhending: 0, taiyuan: 0,
    jinan: 0.35, luoyang: 0.3,
    xuzhou: 1.3, haizhou: 1.25, caizhou: 1.25, yingtian: 1.15, dengzhou: 1.05,
  },
  复旧都: { kaifeng: 2.4, daming: 0.5, zhending: 0.3, taiyuan: 0.3 },
  取燕云: {
    yanjing: 2.6, daming: 1.9, zhending: 1.7, jinan: 0.8,
    xuzhou: 0.5, haizhou: 0.4, caizhou: 0.4, dengzhou: 0.4, luoyang: 0.4, taiyuan: 0.4,
  },
};

/** 与 rules.js :: battleParams() 同源，托管不再另算一套攻守系数 */
export function battleOdds(s, from, to) {
  const send = Math.max(2, Math.floor(from.troops * 0.70));
  const P = battleParams(s, from, to, 'song', send);
  return {
    send,
    cost: Math.round(send * 1.6),
    // >1 表示期望上可破城；双方各有 ±20% 随机，故实际阈值还要留余量
    ratio: P.atkBase / P.defBase,
  };
}

function attackOptions(s, phase) {
  const bias = PHASE_BIAS[phase] || {};
  const out = [];
  for (const from of s.songCities) {
    if (from.troops <= 2) continue;
    for (const id of from.links) {
      const to = s.cities[id];
      if (to.owner !== 'jin') continue;
      const weight = bias[to.id];
      if (weight === 0) continue;
      const o = battleOdds(s, from, to);
      if (s.grain < o.cost || s.decree < 1) continue;
      out.push({
        from: from.id, to: to.id, ...o,
        value: (STRATEGIC_VALUE[to.id] ?? 8) * (weight ?? 1),
      });
    }
  }
  // 价值 × 把握：既不轻率送死，也不贪图无关紧要的弱城
  out.sort((a, b) => b.value * Math.min(a.ratio, 2) - a.value * Math.min(b.ratio, 2));
  return out;
}

const troopCap = c => Math.max(12, Math.round(c.yieldGrain * 2.8));
const canTrain = (s, c, ctx) => c && c.owner === 'song' && ctx.trains < TRAIN_LIMIT
  && s.decree >= 1 && s.grain >= 18 && s.gold >= 12
  && c.lastTrainTurn !== s.turn && c.troops < troopCap(c);

/** 春、夏金骑北还，是北伐窗口；秋、冬则须厚集边防 */
const isWindowSeason = s => (s.turn - 1) % 4 < 2;

function weakestFront(s) {
  const front = s.frontCities;
  if (!front.length) return null;
  return front.slice().sort((a, b) => a.troops - b.troops)[0];
}

/** 从后方闲州调兵实边：只挑不与金接壤、且兵力有余的城 */
function reinforceOption(s, targetId) {
  const target = s.cities[targetId];
  if (!target || target.owner !== 'song') return null;
  let best = null;
  for (const c of s.songCities) {
    if (c.id === targetId || c.troops < 7) continue;
    if (c.links.some(id => s.cities[id].owner === 'jin')) continue;
    if (!target.links.includes(c.id)) continue;
    if (!best || c.troops > best.troops) best = c;
  }
  if (!best) return null;
  const gain = Math.floor(Math.floor(best.troops * 0.70) * 0.6);
  return gain >= 2 ? { from: best.id, to: targetId, gain } : null;
}

/** 每回合新建一次：{ turn, marches, trains } */
export function newTurnContext(s) {
  return { turn: s.turn, marches: 0, trains: 0, phase: phaseOf(s) };
}

/**
 * 选出下一步指令。返回 null 表示本回合无事可做，可以结束回合。
 * 每个分支都保证消耗政令或改变状态，不会原地打转。
 */
export function chooseAction(s, ctx = newTurnContext(s)) {
  if (s.over || s.pendingEvent || s.decree <= 0) return null;
  if (ctx.turn !== s.turn) Object.assign(ctx, newTurnContext(s));

  // 一、开局拜都督：岳飞攻势 +28%，主战 +8，是本局最重要的第一步
  if (s.heroId !== BEST_HERO && s.turn <= 2 && s.decree >= 2) {
    return { type: 'hero', id: BEST_HERO, desc: `拜岳飞为都督诸军事，诸军攻势 +28%` };
  }

  const phase = ctx.phase;
  const opts = attackOptions(s, phase);
  const canMarch = ctx.marches < MARCH_LIMIT;
  const ready = canMarch ? opts.find(o => o.ratio >= ATTACK_THRESHOLD) : null;
  const best = opts[0] || null;

  // 二、粮为军命：进军需粮甚巨，先立仓廪
  if (s.grain < 44 && s.decree >= 2) {
    return { type: 'chouliang', desc: `仓廪将竭，遣转运使督办粮纲` };
  }
  // 三、民心既关粮赋，亦系败亡
  if (s.popularity < 38 && s.grain >= 15 && s.decree >= 2) {
    return { type: 'anfu', desc: `民心浮动，减免两浙赋役以固根本` };
  }

  // 四、有必胜之战而未亲征，先树黄旗：本回合攻势再 +25%
  if ((ready || (best && best.ratio >= 0.95)) && !s.charge && s.decree >= 3) {
    return { type: 'qinzheng', desc: `御驾亲征，本回合诸军攻势 +25%` };
  }

  // 五、攻城
  if (ready) {
    return {
      type: 'jinjun', from: ready.from, to: ready.to, attack: true,
      desc: `【${phase}】自${s.cities[ready.from].name}出 ${ready.send} 营，进取${s.cities[ready.to].name}`,
    };
  }

  // 六、力有未逮，则先厚集兵力：挑「再进一步便能破城」的方向蓄势
  const hopeful = opts.filter(o => o.ratio > 0.72).sort((a, b) => b.ratio - a.ratio)[0] || best;
  if (hopeful && canMarch) {
    const from = s.cities[hopeful.from];
    if (s.decree >= 2 && canTrain(s, from, ctx)) {
      return { type: 'zhengjun', city: hopeful.from, desc: `${from.name}整军，为取${s.cities[hopeful.to].name}蓄势` };
    }
    const rf = s.decree >= 2 ? reinforceOption(s, hopeful.from) : null;
    if (rf && s.grain >= Math.round(Math.floor(s.cities[rf.from].troops * 0.7) * 1.6)) {
      return { type: 'jinjun', from: rf.from, to: rf.to, desc: `自${s.cities[rf.from].name}移防 ${rf.gain} 营实${s.cities[rf.to].name}边` };
    }
  }

  // 七、秋冬金骑南下，最弱的前线州郡须补兵，谨防长驱入江
  if (!isWindowSeason(s) || !best) {
    const weak = weakestFront(s);
    if (weak && weak.troops < 10 && canTrain(s, weak, ctx) && s.decree >= 2) {
      return { type: 'zhengjun', city: weak.id, desc: `${weak.name}当金骑之冲，增兵固守` };
    }
    const rf = weak && weak.troops < 7 && s.decree >= 2 ? reinforceOption(s, weak.id) : null;
    if (rf && s.grain >= 40) {
      return { type: 'jinjun', from: rf.from, to: rf.to, desc: `调${s.cities[rf.from].name}之兵赴${s.cities[rf.to].name}，以备秋冬` };
    }
  }

  // 八、余政令尽作积贮：粮、民心、兵额，按紧缺程度取一
  if (s.decree >= 1) {
    if (s.grain < 95) return { type: 'chouliang', desc: `积谷以备北伐` };
    if (s.popularity < 62 && s.grain >= 15) return { type: 'anfu', desc: `存问生民，以固粮赋` };
    const trainable = (s.frontCities.length ? s.frontCities : s.songCities)
      .filter(c => canTrain(s, c, ctx))
      .sort((a, b) => a.troops - b.troops)[0];
    if (trainable) return { type: 'zhengjun', city: trainable.id, desc: `${trainable.name}募练新军，充实边备` };
  }
  return null;
}

/** 事件裁断：军事优先，民生告急时改抚民 */
export function chooseEvent(s) {
  const ev = s.pendingEvent;
  if (!ev) return 0;
  const poorGrain = s.grain < 55;
  const poorPop = s.popularity < 45;
  const table = {
    mingdao: () => poorPop ? 1 : 0,
    kuibing: () => poorPop ? 1 : 0,
    junxie: () => s.gold >= 45 ? 0 : 1,
    ersheng: () => poorPop ? 0 : 1,
    qinhui_gui: () => 1,
    caoyun: () => poorGrain ? 0 : 1,
    hanhuang: () => (poorGrain && !poorPop) ? 1 : 0,
    jinshi: () => (s.morale < 45 && s.gold >= 25) ? 1 : 0,
    qingzhan: () => 0,
    yancheng: () => 0,
    huaixi: () => poorPop ? 1 : 0,
    minxian: () => 0,
    guanshan: () => s.grain >= 55 ? 0 : 1,
    haishang: () => s.gold < 55 ? 0 : 1,
    zhongxing: () => 0,
  };
  const i = table[ev.id] ? table[ev.id]() : 0;
  return Math.min(i, ev.options.length - 1);
}

/** 执行一步；返回是否真的改变了局面 */
export function applyAction(s, a, ctx) {
  if (!a) return false;
  let ok = false;
  switch (a.type) {
    case 'hero': ok = s.renming(a.id); break;
    case 'qinzheng': ok = s.qinzheng(); break;
    case 'chouliang': ok = s.chouliang(); break;
    case 'anfu': ok = s.anfu(); break;
    case 'heyi': ok = s.heyi(); break;
    case 'zhengjun': ok = s.zhengjun(a.city); break;
    case 'jinjun': ok = s.jinjun(a.from, a.to); break;
    default: return false;
  }
  if (ok) {
    if (ctx) {
      if (a.attack || a.type === 'jinjun') ctx.marches++;
      if (a.type === 'zhengjun') ctx.trains++;
    }
    s.emit('auto', { action: a, desc: a.desc || '' });
  }
  return ok;
}
