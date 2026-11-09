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
import { HEROES, CITY_DEFS, riverBetween } from './data.js';
import {
  battleParams, marchCost, marchDecree, troopCap, supplyMap, GEO, VICE_COST_GOLD,
} from './rules.js';
import {
  buildingLevels, buildCost, heroRecord, MAX_BUILDING_LEVEL, DISPATCH_PER_TURN,
} from './economy.js';

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
  if (s.scenario) return s.scenario.name;      // 短剧本有自己的军令，不套三阶段
  const kf = s.cities.kaifeng.owner === 'song';
  const yj = s.cities.yanjing.owner === 'song';
  if (kf && yj) return '中兴有成';
  if (kf) return '取燕云';
  const central = CENTRAL.filter(id => s.cities[id].owner === 'song').length;
  return (central >= 4 && s.turn >= 7) ? '复旧都' : '固淮北';
}

/**
 * 阶段偏向：短剧本只认 strategy.targets，其余州郡一律不取，
 * 免得托管在九回合的守城关里仍按「复旧都→取燕云」满图乱攻。
 */
function biasFor(s, phase) {
  const sc = s.scenario;
  if (!sc) return PHASE_BIAS[phase] || {};
  const bias = Object.fromEntries(CITY_DEFS.map(d => [d.id, 0]));
  (sc.strategy?.targets || []).forEach((id, i) => { bias[id] = 1.5 - i * 0.18; });
  // 必守之州一旦易主，权重压过所有进取目标：先夺回，再论破阵
  for (const id of sc.strategy?.guard || []) {
    if (s.cities[id]?.owner !== 'song') bias[id] = 1.9;
  }
  return bias;
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
    cost: marchCost(s, from, to, send),
    decreeCost: marchDecree(s, from, to),
    // >1 表示期望上可破城；双方各有 ±20% 随机，故实际阈值还要留余量
    ratio: P.atkBase / P.defBase,
    cross: P.cross,
    isolated: P.isolated,
  };
}

/**
 * 择将而任：统计当前可攻目标的地形与涉水情形，逐员估算战法收益。
/**
 * 械客（squad: true）只在「清河烽火」剧本登场；其余局只见原八员。
 * 这样长局与旧短剧本的拜将候选集与分支基线完全一致，不因新增五人组而漂移。
 */
export function heroPool(s) {
  const qinghe = s.scenarioId === 'qinghe';
  return HEROES.filter(h => !!h.squad === qinghe);
}

/**
 * 平原多用岳飞、水网多用韩世忠、山险多用吴玠——不再是固定一将到底。
 */
export function bestHero(s, phase = phaseOf(s)) {
  const bias = biasFor(s, phase);
  const targets = [];
  for (const from of s.songCities) {
    for (const id of from.links) {
      const to = s.cities[id];
      if (to.owner !== 'jin' || bias[to.id] === 0) continue;
      targets.push({ from, to, weight: (bias[to.id] ?? 1) * (STRATEGIC_VALUE[to.id] ?? 8) });
    }
  }
  if (!targets.length) return BEST_HERO;
  const totalW = targets.reduce((n, t) => n + t.weight, 0) || 1;
  let best = BEST_HERO, top = -Infinity;
  for (const h of heroPool(s)) {
    const gain = targets.reduce((n, { from, to, weight }) => n + weight * (
      (h.art?.terrain?.[to.terrain] || 0)
      + (riverBetween(from, to)
        ? -GEO.crossAtk * (h.art?.river || 0) + (h.art?.amphibious || 0)
          - 0.10 * (1 - (h.art?.river || 0))   // 无水师则每渡一次多耗一道政令
        : 0)
    ), 0) / totalW;
    const score = h.atk + gain + (h.decree || 0) * 0.05 + (h.zhanDelta || 0) * 0.003;
    if (score > top) { top = score; best = h.id; }
  }
  return best;
}

/** 主帅驻节：优先选当前最有把握出兵的前线城，且避开分帅已驻之州 */
export function bestStation(s, opts = []) {
  const taken = s.viceHeroCity;
  const from = opts.map(o => o.from).find(id => id !== taken && s.cities[id]?.owner === 'song')
    || s.frontCities.filter(c => c.id !== taken).sort((a, b) => b.troops - a.troops)[0]?.id;
  if (from && s.cities[from]?.owner === 'song') return from;
  return s.songCities.find(c => c.id !== taken)?.id || null;
}

/**
 * 择分帅：与主帅互补，而非再挑一个「攻势最高」。
 * 守势吃紧则重城守，孤城未通粮道则重漕运／据险，粮紧则重理政，
 * 涉水多则重舟师——如此八员各有其时，不会永远只拜一人。
 */
export function bestViceHero(s, mainId = s.heroId, phase = phaseOf(s)) {
  if (!mainId) return null;
  const bias = biasFor(s, phase);
  const sup = supplyMap(s);
  const targets = [];
  for (const from of s.songCities) {
    for (const id of from.links) {
      const to = s.cities[id];
      if (to.owner !== 'jin' || bias[to.id] === 0) continue;
      targets.push({ from, to, weight: (bias[to.id] ?? 1) * (STRATEGIC_VALUE[to.id] ?? 8) });
    }
  }
  const totalW = targets.reduce((n, t) => n + t.weight, 0) || 1;
  const weakest = s.frontCities.slice().sort((a, b) => a.troops - b.troops)[0];
  const guardW = (!isWindowSeason(s) || (weakest && weakest.troops < 8)) ? 2.6 : 1.0;
  const isoW = sup.isolated.length ? 2.2 : 0.4;
  const grainW = s.grain < 95 ? 1.4 : 0.4;
  const decreeW = s.decree <= 4 ? 0.07 : 0.03;
  const capped = s.frontCities.filter(c => c.troops >= troopCap(s, c) - 1).length;
  const capW = capped >= 2 ? 0.6 : 0.2;
  const wet = targets.filter(({ from, to }) => riverBetween(from, to)).length / Math.max(1, targets.length);

  let best = null, top = -Infinity;
  for (const h of heroPool(s)) {
    if (h.id === mainId) continue;
    const a = h.art || {};
    const gain = targets.reduce((n, { from, to, weight }) => n + weight * (
      (a.terrain?.[to.terrain] || 0)
      + (riverBetween(from, to) ? -GEO.crossAtk * (a.river || 0) + (a.amphibious || 0) : 0)
    ), 0) / totalW;
    // 局面原型：粮紧用赵鼎、主和盛用李纲、兵额满用张俊、多涉水用水师、
    // 孤城未通用吴玠、秋冬守势用刘锜——八员各有其时，不再固定一将到底
    const situational =
      (s.grain < 85 && h.id === 'zhaoding' ? 0.12 : 0)
      + (s.court.he > 55 && h.id === 'ligang' ? 0.12 : 0)
      + (capped >= 3 && h.id === 'zhangjun' ? 0.10 : 0)
      + (wet >= 0.35 && h.id === 'hanshizhong' ? 0.10 : 0)
      + (sup.isolated.length && h.id === 'wujie' ? 0.08 : 0)
      + (!isWindowSeason(s) && h.id === 'liqi' ? 0.06 : 0);
    const score = situational + h.atk * 0.35 + gain
      + (a.defend || 0) * guardW + (a.supply || 0) * isoW * 0.2
      + (a.income || 0) * grainW + (a.cap || 0) * capW
      + (h.decree || 0) * decreeW + (h.grainBonus || 0) * 0.004
      + (h.zhanDelta || 0) * 0.002 - (h.heDelta || 0) * 0.012
      - (h.upkeep || 0) * 0.02 - (h.atk < 0 ? 0.3 : 0);
    if (score > top) { top = score; best = h.id; }
  }
  return best;
}

/** 分帅驻节：与主帅分镇，优先补最弱的一处前线；水师则择临津之州 */
export function bestViceStation(s) {
  const taken = new Set([s.heroCity, s.viceHeroCity]);
  const front = s.frontCities.filter(c => !taken.has(c.id));
  const wet = (s.viceHeroArt?.river || 0) >= 0.5;
  const score = c => c.troops - (wet ? c.links.filter(id => riverBetween(c, s.cities[id])).length * 6 : 0);
  const pick = front.slice().sort((a, b) => score(a) - score(b))[0];
  return pick?.id || s.songCities.find(c => !taken.has(c.id))?.id || null;
}

function attackOptions(s, phase) {
  const bias = biasFor(s, phase);
  const out = [];
  for (const from of s.songCities) {
    if (from.troops <= 2) continue;
    for (const id of from.links) {
      const to = s.cities[id];
      if (to.owner !== 'jin') continue;
      const weight = bias[to.id];
      if (weight === 0) continue;
      const o = battleOdds(s, from, to);
      if (s.grain < o.cost || s.decree < o.decreeCost) continue;
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

const canTrain = (s, c, ctx) => c && c.owner === 'song' && ctx.trains < TRAIN_LIMIT
  && s.decree >= 1 && s.grain >= 18 && s.gold >= 12
  && c.lastTrainTurn !== s.turn && c.troops < troopCap(s, c);

/** 春、夏金骑北还，是北伐窗口；秋、冬则须厚集边防。短剧本金人每回合叩城，无窗口可言 */
const isWindowSeason = s => !s.scenario?.jinEveryTurn && (s.turn - 1) % 4 < 2;

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

/** 每回合新建一次：{ turn, marches, trains, builds, dispatches } */
export function newTurnContext(s) {
  return { turn: s.turn, marches: 0, trains: 0, builds: 0, dispatches: 0, phase: phaseOf(s) };
}

/**
 * 治略模式的余力决策：只在开启时进入，且排在「积谷／整军」之前但要求余 2 道政令，
 * 免得托管把北伐的政令全花在种田上。后方城（不与金接壤）才营建，避免投入当场被打掉。
 * 关闭时此函数根本不会被调用，托管决策序列与基线逐字节一致。
 */
function economyAction(s, ctx) {
  const ec = s.economy;
  const rear = s.songCities
    .filter(c => !c.links.some(id => s.cities[id].owner === 'jin'))
    .sort((a, b) => b.yieldGrain - a.yieldGrain);
  const city = rear[0];
  if (!city) return null;
  if (ctx.dispatches < 1 && ec.dispatchTurn < DISPATCH_PER_TURN) {
    const hid = heroPool(s).map(h => h.id).sort((a, b) => heroRecord(ec, a).exp - heroRecord(ec, b).exp)[0];
    const h = HEROES.find(x => x.id === hid);
    const task = s.grain < 95 ? 'tunken' : 'duzao';
    return {
      type: 'chaiqian', hero: hid, city: city.id, task,
      desc: `遣${h.name}赴${city.name}${task === 'tunken' ? '督屯积谷' : '督造军械'}，兼积阅历`,
    };
  }
  if (ctx.builds >= 2) return null;
  const levels = buildingLevels(ec, city.id);
  const order = s.grain < 95
    ? ['tuntian', 'zuofang', 'canglin', 'shibo']
    : ['zuofang', 'tuntian', 'canglin', 'shibo'];
  for (const bid of order) {
    const lv = levels[bid];
    if (lv >= MAX_BUILDING_LEVEL) continue;
    const cost = buildCost(lv);
    if (s.gold < cost.gold || s.grain < cost.grain) continue;
    const b = { tuntian: '屯田', canglin: '仓廪', zuofang: '军器作坊', shibo: '市舶' }[bid];
    return { type: 'yingjian', city: city.id, building: bid, desc: `${city.name}营建${b}至 ${lv + 1} 级，以固根本` };
  }
  return null;
}

/**
 * 选出下一步指令。返回 null 表示本回合无事可做，可以结束回合。
 * 每个分支都保证消耗政令或改变状态，不会原地打转。
 */
export function chooseAction(s, ctx = newTurnContext(s)) {
  if (s.over || s.pendingEvent || s.decree <= 0) return null;
  if (ctx.turn !== s.turn) Object.assign(ctx, newTurnContext(s));

  // 一、择将而任：渡淮阶段重水师，转入中原平原则改任步阵；
  //    阶段转折时准许换将一次，但距上次拜将须隔六回合，免得朝令夕改。
  const phase = ctx.phase;
  const sc = s.scenario;
  const wantHero = sc ? sc.heroId : bestHero(s, phase);
  const opening = s.turn <= 3;
  const turnPoint = phase !== '固淮北' && s.turn - (s.heroTurn || 0) >= 6;
  // 短剧本开局既定主帅与驻节，不再择将、不另置幕府：政令要尽数用于守城或破阵
  if (!sc && s.heroId !== wantHero && (opening || turnPoint) && s.decree >= (opening ? 2 : 4)) {
    const h = HEROES.find(x => x.id === wantHero);
    const why = opening ? '以应淮上水势' : '中原平原，宜改步阵';
    return { type: 'hero', id: wantHero, desc: `拜${h.name}为都督，领「${h.art?.name}」——${why}` };
  }
  // 一之二、分路都督：战线拉长后置一帅分镇，择与主帅互补之将
  if (!sc && !s.viceHeroId && s.hero && s.turn >= 6 && s.decree >= 3
      && s.gold >= VICE_COST_GOLD && s.frontCities.length >= 2) {
    const vid = bestViceHero(s, s.heroId, phase);
    if (vid) {
      const v = HEROES.find(x => x.id === vid);
      return { type: 'hero', id: vid, route: 'vice', desc: `置${v.name}为分路都督，领「${v.art?.name}」别当一面` };
    }
  }

  const opts = attackOptions(s, phase);
  const canMarch = ctx.marches < MARCH_LIMIT;
  const ready = canMarch ? opts.find(o => o.ratio >= ATTACK_THRESHOLD) : null;
  const best = opts[0] || null;

  // 二、都督驻节：战法在本城加倍，只费一道政令，是本局性价比最高的一步
  if (!s.heroCity && s.hero && s.decree >= 2) {
    const city = bestStation(s, opts);
    if (city) return { type: 'dujun', city, desc: s.scenarioId === 'qinghe'
      ? `${s.hero.name}坐镇${s.cities[city].name}，本城战法加倍、城守益固`
      : `都督持节驻${s.cities[city].name}，本路战法加倍、城守益固` };
  }
  // 二之二、分帅持节：与主帅分镇，补最吃紧的一处防线
  if (s.viceHero && !s.viceHeroCity && s.decree >= 2) {
    const city = bestViceStation(s);
    if (city) return { type: 'dujun', city, route: 'vice', desc: s.scenarioId === 'qinghe'
      ? `${s.viceHero.name}领组坐镇${s.cities[city].name}，专当一面`
      : `分帅${s.viceHero.name}持节驻${s.cities[city].name}，专当一面` };
  }

  // 三、粮为军命：进军需粮甚巨，先立仓廪
  if (s.grain < 75 && s.decree >= 2) {
    return { type: 'chouliang', desc: `仓廪将竭，遣转运使督办粮纲` };
  }
  // 四、民心既关粮赋，亦系败亡
  if (s.popularity < 38 && s.grain >= 15 && s.decree >= 2) {
    return { type: 'anfu', desc: s.scenarioId === 'qinghe' ? '民心浮动，开棚抚恤乡民以固寨心' : '民心浮动，减免两浙赋役以固根本' };
  }

  // 五、有必胜之战而未亲征，先树黄旗：本回合攻势再 +25%
  if ((ready || (best && best.ratio >= 0.95)) && s.canQinzheng && s.decree >= 3) {
    return { type: 'qinzheng', desc: s.scenarioId === 'qinghe' ? '全员压上，本回合攻势 +25%' : '御驾亲征，本回合诸军攻势 +25%' };
  }

  // 六、攻城
  if (ready) {
    return {
      type: 'jinjun', from: ready.from, to: ready.to, attack: true,
      desc: `【${phase}】自${s.cities[ready.from].name}出 ${ready.send} 营，进取${s.cities[ready.to].name}`,
    };
  }

  // 七、力有未逮，则先厚集兵力：挑「再进一步便能破城」的方向蓄势
  const hopeful = opts.filter(o => o.ratio > 0.72).sort((a, b) => b.ratio - a.ratio)[0] || best;
  if (hopeful && canMarch) {
    const from = s.cities[hopeful.from];
    if (s.decree >= 2 && canTrain(s, from, ctx)) {
      return { type: 'zhengjun', city: hopeful.from, desc: `${from.name}整军，为取${s.cities[hopeful.to].name}蓄势` };
    }
    const rf = s.decree >= 2 ? reinforceOption(s, hopeful.from) : null;
    if (rf) {
      const f = s.cities[rf.from], t = s.cities[rf.to];
      const send = Math.floor(f.troops * 0.7);
      if (s.grain >= marchCost(s, f, t, send) && s.decree >= marchDecree(s, f, t)) {
        return { type: 'jinjun', from: rf.from, to: rf.to, desc: `自${f.name}移防 ${rf.gain} 营实${t.name}边` };
      }
    }
  }

  // 八、秋冬金骑南下，最弱的前线州郡须补兵，谨防长驱入江
  if (!isWindowSeason(s) || !best) {
    const weak = weakestFront(s);
    if (weak && weak.troops < 10 && canTrain(s, weak, ctx) && s.decree >= 2) {
      return { type: 'zhengjun', city: weak.id, desc: `${weak.name}当${s.scenarioId === 'qinghe' ? '蕃骑' : '金骑'}之冲，增兵固守` };
    }
    const rf = weak && weak.troops < 7 && s.decree >= 2 ? reinforceOption(s, weak.id) : null;
    if (rf) {
      const f = s.cities[rf.from], t = s.cities[rf.to];
      if (s.grain >= 40 && s.decree >= marchDecree(s, f, t)) {
        return { type: 'jinjun', from: rf.from, to: rf.to, desc: `调${f.name}之兵赴${t.name}，以备秋冬` };
      }
    }
  }

  // 八之二、治略余力：短剧本是固定题解，不种田；长局且余 2 道政令才动工。
  // 关闭时整段短路，前面的决策与基线完全一致。
  if (!sc && s.economyOn && s.economy && s.decree >= 2) {
    const eco = economyAction(s, ctx);
    if (eco) return eco;
  }

  // 九、余政令尽作积贮：粮、民心、兵额，按紧缺程度取一
  if (s.decree >= 1) {
    if (s.grain < 150) return { type: 'chouliang', desc: s.scenarioId === 'qinghe' ? '积粮备守，以待蕃骑' : '积谷以备北伐' };
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
    // 国势已成颓势时才转向和议（稳健统帅平日不问和议，危机时求一回合喘息）
    qinhui_gui: () => (s.popularity < 42 || s.morale < 42 || s.grain < 60 || s.gold < 40) ? 0 : 1,
    heyi_zhao: () => (s.court.zhan < 46 && s.morale < 50) ? 0 : 1,
    fengboting: () => 1,   // 力保岳侯：解兵柄是自毁长城
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
    // 短剧本：守关优先挫敌锐气，攻关优先步阵迎击；粮秣见底才收敛
    shunchang_zaozhou: () => 0,
    shunchang_yezhuo: () => (s.grain < 45 || s.cities.shouchun.troops < 7) ? 1 : 0,
    yancheng_guazima: () => (s.grain < 40 ? 1 : 0),
    // 清河：粮足先强军，粮紧先收粮；钱紧卖货，士气低时优先抚恤
    qinghe_luojia: () => (s.cities.changan.troops < 9 ? 0 : 1),
    qinghe_yaobu: () => (s.cities.changan.troops >= 9 || s.court.zhan >= 55) ? 0 : 1,
    qinghe_fuke: () => (s.gold >= 45 ? 0 : 1),
    qinghe_zuwang: () => 0,
    qinghe_jiuzhi: () => (s.morale < 50 ? 0 : 1),
    qinghe_danyao: () => (s.gearBonus >= 0.08 ? 0 : 1),
    qinghe_zhaolao: () => (s.grain < 70 ? 0 : 1),
    qinghe_liumin: () => (s.popularity < 45 ? 1 : 0),
    qinghe_shangdui: () => (s.gold < 55 ? 0 : 1),
  };
  const i = table[ev.id] ? table[ev.id]() : 0;
  return Math.min(i, ev.options.length - 1);
}

/** 执行一步；返回是否真的改变了局面 */
export function applyAction(s, a, ctx) {
  if (!a) return false;
  let ok = false;
  switch (a.type) {
    case 'hero': ok = s.renming(a.id, a.route); break;
    case 'vice-dismiss': ok = s.dismissVice(); break;
    case 'dujun': ok = s.dujun(a.city, a.route); break;
    case 'qinzheng': ok = s.qinzheng(); break;
    case 'chouliang': ok = s.chouliang(); break;
    case 'anfu': ok = s.anfu(); break;
    case 'heyi': ok = s.heyi(); break;
    case 'zhengjun': ok = s.zhengjun(a.city); break;
    case 'jinjun': ok = s.jinjun(a.from, a.to); break;
    case 'yingjian': ok = s.yingjian(a.city, a.building); break;
    case 'chaiqian': ok = s.chaiqian(a.hero, a.city, a.task); break;
    default: return false;
  }
  if (ok) {
    if (ctx) {
      if (a.attack || a.type === 'jinjun') ctx.marches++;
      if (a.type === 'zhengjun') ctx.trains++;
      if (a.type === 'yingjian') ctx.builds++;
      if (a.type === 'chaiqian') ctx.dispatches++;
    }
    s.emit('auto', { action: a, desc: a.desc || '' });
  }
  return ok;
}
