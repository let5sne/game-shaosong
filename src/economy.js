/**
 * 治略 · 经营养成层（模拟经营 + 角色成长）
 *
 * 设计约束：不另开一套回合阶段、不新增胜负条件、不替换粮／缗钱。
 * 城池从「纯格子」变成可营建的经营单元，将领从「静态数据表」变成可成长的角色，
 * 两条线都消耗同一份稀缺政令，产出再经 rules.js :: battleParams() 回到战斗。
 *
 * 本模块是纯数据 + 纯函数，不碰 DOM，可在 Node 里跑整局。
 * 每个对外查询都先判 economyActive(state)：模式关闭时一律返回中性值（0 / 1 / 空），
 * 因此 `npm run balance` 的 seed=1..N 固定序列与原版逐字节一致。
 */
import { HEROES } from './data.js';

export const MAX_BUILDING_LEVEL = 3;
export const MAX_HERO_LEVEL = 6;
export const ARMS_CAP = 60;
export const DISPATCH_PER_TURN = 2;
export const TRAIN_ARMS_COST = 6;

/** 累计阅历门槛：LEVEL_XP[lv-1] 为升到该级所需阅历 */
export const LEVEL_XP = Object.freeze([0, 30, 70, 120, 180, 250]);

export const BUILDINGS = Object.freeze([
  {
    id: 'tuntian', name: '屯田', glyph: '田', desc: '募民垦荒、军屯自给。每级使本城岁赋 +18%。',
    effect: lv => `岁赋 +${lv * 18}%`,
  },
  {
    id: 'canglin', name: '仓廪', glyph: '仓', desc: '积谷备荒。每级减本城戍守粮耗 0.25；仓中有粮可抵一次饥荒。',
    effect: lv => `戍耗 -${(lv * 0.25).toFixed(2)} · 备荒 ${lv} 次`,
  },
  {
    id: 'zuofang', name: '军器作坊', glyph: '械', desc: '铸神臂弓、铁札甲。每级每回合产出 2 军械；军械可加攻势，整军时亦可耗用。',
    effect: lv => `军械 +${lv * 2}/回合`,
  },
  {
    id: 'shibo', name: '市舶', glyph: '市', desc: '通商抽分、和籴平准。每级每回合进缗钱 3 万贯。',
    effect: lv => `缗钱 +${lv * 3}/回合`,
  },
]);
export const BUILDING_IDS = BUILDINGS.map(b => b.id);

export const DISPATCH_TASKS = Object.freeze([
  {
    id: 'tunken', name: '督屯', desc: '赴州郡劝课农桑，得粮；若该城已置屯田，所获更丰。',
    tag: '农政',
  },
  {
    id: 'xunbian', name: '巡边', desc: '点验乡兵、收拢散卒，该城增 2 营（不逾兵额），民心稍安。',
    tag: '军务',
  },
  {
    id: 'duzao', name: '督造', desc: '赴军器监督造器械，耗缗钱 8 万贯，得军械 8。',
    tag: '匠作',
  },
]);
export const DISPATCH_IDS = DISPATCH_TASKS.map(t => t.id);

/**
 * 里程碑战法：每人两级，Lv3 / Lv5 解锁。
 * 效果只对「在任」（主帅／分帅）的将领生效，故「先培养谁、再拜谁」本身成为策略。
 * 秦桧的两条刻意带负面守势——养成不等于一律变强，人物设定仍要作数。
 */
export const HERO_MILESTONES = Object.freeze({
  yuefei: [
    { at: 3, name: '连结河朔', desc: '河朔义军相附，全军攻势 +3%', atk: 0.03 },
    { at: 5, name: '背嵬亲军', desc: '亲军成阵，攻势 +5%、守势 +2%', atk: 0.05, defend: 0.02 },
  ],
  hanshizhong: [
    { at: 3, name: '黄天荡习流', desc: '舟师熟水，攻势 +3%、守势 +2%', atk: 0.03, defend: 0.02 },
    { at: 5, name: '淮上舟师', desc: '江淮水网皆为我用，攻势 +4%、守势 +4%', atk: 0.04, defend: 0.04 },
  ],
  liqi: [
    { at: 3, name: '婴城挫敌', desc: '善以少击众，全军守势 +6%', defend: 0.06 },
    { at: 5, name: '顺昌壁垒', desc: '壁垒既固，守势 +8%、攻势 +1%', defend: 0.08, atk: 0.01 },
  ],
  wujie: [
    { at: 3, name: '关陕据险', desc: '据险自持，全军守势 +5%', defend: 0.05 },
    { at: 5, name: '和尚原之守', desc: '险要尽在掌中，守势 +7%、攻势 +2%', defend: 0.07, atk: 0.02 },
  ],
  zhangjun: [
    { at: 3, name: '行营广募', desc: '诸军辐辏，各城兵额 +10%', cap: 0.10 },
    { at: 5, name: '部曲成军', desc: '兵额 +12%、攻势 +2%，然耗费如旧', cap: 0.12, atk: 0.02 },
  ],
  ligang: [
    { at: 3, name: '庙堂定算', desc: '经画有方，粮赋 +6%', income: 0.06 },
    { at: 5, name: '朝论归一', desc: '粮赋 +8%、攻势 +1%', income: 0.08, atk: 0.01 },
  ],
  zhaoding: [
    { at: 3, name: '漕运足食', desc: '转输不匮，粮赋 +8%', income: 0.08 },
    { at: 5, name: '丰财和众', desc: '粮赋 +10%、筹粮另得 4 粮', income: 0.10, grainBonus: 4 },
  ],
  qinhui: [
    { at: 3, name: '南自南、北自北', desc: '省兵息民，府库 +4 钱/回合', goldBonus: 4 },
    { at: 5, name: '绍兴和议', desc: '府库 +6 钱/回合，然军备废弛、守势 -2%', goldBonus: 6, defend: -0.02 },
  ],
});

/** 模式是否生效：数据与开关分离，关掉时进度冻结而不丢失 */
export function economyActive(s) {
  return !!(s && s.economyOn && s.economy);
}

export function createEconomy() {
  return {
    v: 1,
    buildings: {},        // cityId -> { tuntian: lv, ... }，只记非零城
    heroes: {},           // heroId -> { exp, lastDispatchTurn, count }
    arms: 0,              // 军械存量
    dispatchTurn: 0,      // 本回合已差遣的将领人次（用于上限）
    dispatchCount: 0,
    built: 0,             // 累计营建次数
    dispatches: 0,        // 累计差遣次数
  };
}

/** 存档恢复：旧档没有此字段，损坏档按新建处理，绝不把 NaN 带进规则层 */
export function normalizeEconomy(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  const ec = createEconomy();
  if (raw.buildings && typeof raw.buildings === 'object') {
    for (const [cid, b] of Object.entries(raw.buildings)) {
      if (!b || typeof b !== 'object') continue;
      const levels = {};
      for (const id of BUILDING_IDS) {
        const lv = Number(b[id]);
        if (Number.isFinite(lv) && lv > 0) levels[id] = Math.min(MAX_BUILDING_LEVEL, Math.floor(lv));
      }
      if (Object.keys(levels).length) ec.buildings[cid] = levels;
    }
  }
  if (raw.heroes && typeof raw.heroes === 'object') {
    for (const [hid, h] of Object.entries(raw.heroes)) {
      if (!HEROES.some(x => x.id === hid) || !h || typeof h !== 'object') continue;
      const exp = Number(h.exp);
      ec.heroes[hid] = {
        exp: Number.isFinite(exp) && exp > 0 ? Math.min(9999, Math.floor(exp)) : 0,
        lastDispatchTurn: Number.isFinite(h.lastDispatchTurn) ? h.lastDispatchTurn : 0,
        count: Number.isFinite(h.count) ? h.count : 0,
      };
    }
  }
  const arms = Number(raw.arms);
  ec.arms = Number.isFinite(arms) ? Math.max(0, Math.min(ARMS_CAP, Math.round(arms))) : 0;
  ec.dispatchTurn = Number.isFinite(raw.dispatchTurn) ? raw.dispatchTurn : 0;
  ec.dispatchCount = Number.isFinite(raw.dispatchCount) ? raw.dispatchCount : 0;
  ec.built = Number.isFinite(raw.built) ? raw.built : 0;
  ec.dispatches = Number.isFinite(raw.dispatches) ? raw.dispatches : 0;
  return ec;
}

/** 升到 level+1 的代价；level 为当前等级（0 起） */
export function buildCost(level) {
  const lv = Math.max(0, Math.min(MAX_BUILDING_LEVEL, Number(level) || 0));
  return { gold: 18 + 12 * lv, grain: 10 + 8 * lv, decree: 1 };
}

export function buildingLevels(ec, cityId) {
  const src = ec?.buildings?.[cityId] || {};
  const out = {};
  for (const id of BUILDING_IDS) {
    // 上下界都要钳：存档已由 normalizeEconomy 过滤，但运行时若被写入负数，
    // economyYield() 的 `if (b.zuofang)` 会把 -5 当成有效等级，产出负军械。
    const n = Number(src[id]);
    out[id] = Number.isFinite(n) ? Math.max(0, Math.min(MAX_BUILDING_LEVEL, Math.floor(n))) : 0;
  }
  return out;
}

/** 城池失守：经营成果一并付之东流，这是种田流的战略风险 */
export function razeBuildings(ec, cityId) {
  if (!ec?.buildings?.[cityId]) return false;
  delete ec.buildings[cityId];
  return true;
}

export function heroRecord(ec, heroId) {
  return ec?.heroes?.[heroId] || { exp: 0, lastDispatchTurn: 0, count: 0 };
}

export function heroLevelFromExp(exp) {
  const e = Math.max(0, Number(exp) || 0);
  let lv = 1;
  for (let i = 1; i < MAX_HERO_LEVEL; i++) if (e >= LEVEL_XP[i]) lv = i + 1;
  return lv;
}

export function milestonesFor(heroId) {
  return HERO_MILESTONES[heroId] || [];
}

/** UI 用：等级、阅历进度、已解锁／待解锁战法 */
export function heroProgress(ec, heroId) {
  const rec = heroRecord(ec, heroId);
  const level = heroLevelFromExp(rec.exp);
  const prev = LEVEL_XP[level - 1] || 0;
  const next = LEVEL_XP[level] ?? null;
  const all = milestonesFor(heroId);
  return {
    level, exp: rec.exp, prev, next,
    maxed: next === null,
    ratio: next === null ? 1 : Math.max(0, Math.min(1, (rec.exp - prev) / (next - prev))),
    unlocked: all.filter(m => level >= m.at),
    locked: all.filter(m => level < m.at),
    dispatches: rec.count || 0,
  };
}

/** 单员养成效果：等级给基础成长，里程碑挂专属战法 */
export function heroBonus(ec, heroId) {
  const z = { atk: 0, defend: 0, income: 0, cap: 0, grainBonus: 0, goldBonus: 0 };
  if (!ec || !heroId) return z;
  const level = heroLevelFromExp(heroRecord(ec, heroId).exp) - 1;
  z.atk += level * 0.012;
  z.income += level * 0.010;
  for (const m of milestonesFor(heroId)) {
    if (level + 1 < m.at) continue;
    for (const k of Object.keys(z)) z[k] += m[k] || 0;
  }
  return z;
}

/** 在任将领的合成效果：主帅全额、分帅半额，与既有战法的两路约定一致 */
export function officeBonus(state) {
  const z = { atk: 0, defend: 0, income: 0, cap: 0, grainBonus: 0, goldBonus: 0 };
  if (!economyActive(state)) return z;
  const main = heroBonus(state.economy, state.heroId);
  const vice = heroBonus(state.economy, state.viceHeroId);
  for (const k of Object.keys(z)) z[k] = main[k] + vice[k] * 0.5;
  return z;
}

/** 军械存量转成攻势，封顶 12%，避免无限囤积把棋盘玩成刷子 */
export function armsAttackBonus(arms) {
  return Math.min(0.12, Math.max(0, Number(arms) || 0) * 0.003);
}

/**
 * 战斗层的唯一出口：battleParams() 只取这里两个数，实战／推演／托管自动同源。
 * 关闭时 { atk: 0, defend: 0 }，加进系数和不改变任何结果。
 */
export function economyCombatBonus(state) {
  if (!economyActive(state)) return { atk: 0, defend: 0, arms: 0, levelAtk: 0 };
  const o = officeBonus(state);
  const arms = armsAttackBonus(state.economy.arms);
  return { atk: o.atk + arms, defend: o.defend, arms, levelAtk: o.atk };
}

/** 兵额加成（里程碑「行营广募」等）；关闭时 +0 不改变 Math.round 结果 */
export function economyCapBonus(state) {
  return economyActive(state) ? officeBonus(state).cap : 0;
}

/** 粮赋加成：加到 endTurn() 的 yieldSum 上，与民心／主帅战法同乘一个系数 */
export function economyIncome(state) {
  if (!economyActive(state)) return { flat: 0, ratio: 0, farms: 0 };
  let flat = 0, farms = 0;
  for (const c of state.songCities) {
    const lv = buildingLevels(state.economy, c.id).tuntian;
    if (!lv) continue;
    flat += c.yieldGrain * 0.18 * lv;
    farms += lv;
  }
  return { flat, ratio: officeBonus(state).income, farms };
}

/**
 * 回合度支的经营侧：市舶进钱、作坊进军械、仓廪减戍耗。
 * 返回纯数值，由 rules.js :: endTurn() 统一记账与写战报。
 */
export function economyYield(state) {
  if (!economyActive(state)) return { gold: 0, arms: 0, upkeepRelief: 0, workshops: 0, markets: 0, granaries: 0 };
  const o = officeBonus(state);
  let gold = o.goldBonus, arms = 0, upkeepRelief = 0;
  let workshops = 0, markets = 0, granaries = 0;
  for (const c of state.songCities) {
    const b = buildingLevels(state.economy, c.id);
    if (b.zuofang) { arms += 2 * b.zuofang; workshops += b.zuofang; }
    if (b.shibo) { gold += 3 * b.shibo; markets += b.shibo; }
    if (b.canglin) { upkeepRelief += 0.25 * b.canglin; granaries += b.canglin; }
  }
  return { gold, arms, upkeepRelief, workshops, markets, granaries };
}

/** 开仓放赈：粮尽时消耗一级仓廪抵一次饥荒，返回被消耗的州郡名 */
export function consumeGranary(ec) {
  if (!ec) return null;
  const hits = Object.entries(ec.buildings || {})
    .filter(([, b]) => (Number(b?.canglin) || 0) > 0)
    .sort((a, b) => (b[1].canglin - a[1].canglin));
  if (!hits.length) return null;
  const [cid, levels] = hits[0];
  levels.canglin -= 1;
  if (levels.canglin <= 0) delete levels.canglin;
  if (!Object.keys(levels).length) delete ec.buildings[cid];
  return cid;
}
