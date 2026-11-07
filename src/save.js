/**
 * 局中存档：把 GameState 的纯数据快照写入 localStorage。
 *
 * 事件卡带 apply 函数，不能进 JSON，故只存 id，恢复时回查 EVENTS。
 * listeners 是运行时订阅，不参与序列化。
 * 本模块不碰 DOM，serialize / restore 可在 Node 里直接测试。
 */
import { EVENTS } from './data.js';

export const SAVE_KEY = 'shaosong.save.v1';
const VERSION = 1;

const FIELDS = [
  'turn', 'grain', 'gold', 'popularity', 'morale', 'court',
  'heroId', 'heroCity', 'heroTurn', 'gearBonus', 'jinFury', 'jinMight', 'charge', 'truce', 'famine',
  'viceHeroId', 'viceHeroCity', 'viceHeroTurn',
  'lastCaptureTurn', 'logs', 'over', 'decree', 'lastBattle',
  'difficulty', 'maxTurns', 'seed', 'random', 'variant', 'rngState', 'chargeUsed',
];

const store = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch (_) { return null; }
};

export function serialize(state) {
  const data = { v: VERSION, at: Date.now(), cities: state.cities };
  for (const k of FIELDS) data[k] = state[k];
  data.seenEvents = [...(state.seenEvents || [])];
  data.flags = [...(state.flags || [])];
  data.pendingEventId = state.pendingEvent?.id ?? null;
  return JSON.stringify(data);
}

/** 把快照写回既有 GameState 实例（保留其 listeners），成功返回 true */
export function restore(state, raw) {
  let d;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (_) { return false; }
  if (!d || d.v !== VERSION || !d.cities || typeof d.cities !== 'object') return false;
  if (!d.cities.kaifeng || !d.cities.linan || !Array.isArray(d.cities.kaifeng.links)) return false;

  state.cities = d.cities;
  for (const k of FIELDS) if (d[k] !== undefined) state[k] = d[k];
  state.maxTurns = Number.isFinite(d.maxTurns) ? d.maxTurns : state.diffDef.maxTurns;
  state.seenEvents = new Set(Array.isArray(d.seenEvents) ? d.seenEvents : []);
  state.flags = new Set(Array.isArray(d.flags) ? d.flags : []);
  state.pendingEvent = EVENTS.find(e => e.id === d.pendingEventId) || null;
  if (!Array.isArray(state.logs)) state.logs = [];
  if (!state.court) state.court = { zhan: 58, he: 42 };
  if (!state.variant) state.variant = { seed: state.seed || 0, notes: [] };
  // 旧档或异常档的兜底：不要让难度参数缺失导致战斗系数 NaN
  if (!Number.isFinite(state.jinMight)) state.jinMight = 0;
  // 旧档没有督军驻节、分路与粮道缓存，补齐即可续玩
  if (state.heroCity === undefined) state.heroCity = null;
  if (state.heroCity && state.cities[state.heroCity]?.owner !== 'song') state.heroCity = null;
  if (state.viceHeroId === undefined) state.viceHeroId = null;
  if (state.viceHeroCity === undefined) state.viceHeroCity = null;
  if (state.viceHeroCity && state.cities[state.viceHeroCity]?.owner !== 'song') state.viceHeroCity = null;
  if (state.viceHeroCity && state.viceHeroCity === state.heroCity) state.viceHeroCity = null;
  if (!Number.isFinite(state.viceHeroTurn)) state.viceHeroTurn = 0;
  if (!state.flags) state.flags = new Set();
  // v1 早期档没有可复现随机流与亲征次数：补一份确定值，续玩不至于掷出 NaN
  if (!Number.isFinite(state.rngState)) state.rngState = (Number(state.seed) || 1) >>> 0;
  if (!Number.isFinite(state.chargeUsed)) state.chargeUsed = 0;
  state._twoCapitalsNoted = !!(state.cities.kaifeng?.owner === 'song' && state.cities.yanjing?.owner === 'song');
  state._supplyKey = null;
  state._supply = null;
  return true;
}

export function readSave() {
  const s = store();
  if (!s) return null;
  try { return s.getItem(SAVE_KEY); } catch (_) { return null; }
}

export function writeSave(state) {
  const s = store();
  if (!s) return false;
  try { s.setItem(SAVE_KEY, serialize(state)); return true; } catch (_) { return false; }
}

export function clearSave() {
  const s = store();
  if (!s) return;
  try { s.removeItem(SAVE_KEY); } catch (_) { /* 隐私模式下忽略 */ }
}

/** 开场页「继续上一局」按钮的摘要；存档损坏时返回 null */
export function saveInfo(raw = readSave()) {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (d.v !== VERSION || !d.cities || d.over) return null;
    return { turn: d.turn, seed: d.seed, difficulty: d.difficulty, at: d.at };
  } catch (_) { return null; }
}
