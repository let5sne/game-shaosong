/**
 * 局中存档：把 GameState 的纯数据快照写入 localStorage。
 *
 * 事件卡带 apply 函数，不能进 JSON，故只存 id，恢复时回查 EVENTS。
 * listeners 是运行时订阅，不参与序列化。
 * 本模块不碰 DOM，serialize / restore 可在 Node 里直接测试。
 */
import { EVENTS, findScenario } from './data.js';
import { normalizeEconomy } from './economy.js';

export const SAVE_KEY = 'shaosong.save.v1';        // 旧单槽；首次访问三槽时迁入槽 1
export const SLOT_KEY = 'shaosong.save.v1.slot';   // shaosong.save.v1.slot1..3
export const ACTIVE_KEY = 'shaosong.save.active'; // 当前自动存档写哪个槽
export const SAVE_SLOTS = 3;
const VERSION = 1;

const FIELDS = [
  'turn', 'grain', 'gold', 'popularity', 'morale', 'court',
  'heroId', 'heroCity', 'heroTurn', 'gearBonus', 'jinFury', 'jinMight', 'charge', 'truce', 'famine',
  'viceHeroId', 'viceHeroCity', 'viceHeroTurn',
  'lastCaptureTurn', 'logs', 'over', 'decree', 'lastBattle',
  'difficulty', 'maxTurns', 'seed', 'random', 'variant', 'rngState', 'chargeUsed', 'scenarioId',
  'economy', 'economyOn',   // 治略：设施／阅历为纯 JSON；旧档无此二字段时按「未开启」续玩
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
  // 剧本只认已登记的 id；旧档没有此字段，一律按长局续玩
  state.scenarioId = findScenario(d.scenarioId)?.id ?? null;
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
  // 治略档：结构校验后恢复；冻结态（economyOn=false）仍保留设施与阅历数据，复行新法即可续用
  state.economy = normalizeEconomy(d.economy);
  state.economyOn = !!d.economyOn && !!state.economy;
  state._supplyKey = null;
  state._supply = null;
  return true;
}

export function readSave(slot) {
  const s = store();
  if (!s) return null;
  migrateLegacy();
  return s.getItem(slotKeyId(slot ?? activeSlot())) || null;
}

export function writeSave(state, slot) {
  const s = store();
  if (!s) return false;
  const i = slot ?? activeSlot();
  try { s.setItem(slotKeyId(i), serialize(state)); setActiveSlot(i); return true; } catch (_) { return false; }
}

export function clearSave(slot) {
  const s = store();
  if (!s) return;
  try { s.removeItem(slotKeyId(slot ?? activeSlot())); } catch (_) { /* 隐私模式下忽略 */ }
}

// ── 三槽 ──────────────────────────────────────────────────
export const slotKeyId = i => `${SLOT_KEY}${i}`;

export function activeSlot() {
  const s = store();
  if (!s) return 1;
  try {
    const v = Number(s.getItem(ACTIVE_KEY));
    return Number.isInteger(v) && v >= 1 && v <= SAVE_SLOTS ? v : 1;
  } catch (_) { return 1; }
}
export function setActiveSlot(i) {
  const s = store();
  if (!s) return;
  try { s.setItem(ACTIVE_KEY, String(i)); } catch (_) { /* 隐私模式 */ }
}

/** 旧单槽 → 槽 1：只在三槽还全空且旧键有值时迁移一次，随后清掉旧键。 */
export function migrateLegacy() {
  const s = store();
  if (!s) return false;
  try {
    const old = s.getItem(SAVE_KEY);
    if (!old) return false;
    const anySlot = Array.from({ length: SAVE_SLOTS }, (_, k) => s.getItem(slotKeyId(k + 1))).some(Boolean);
    if (!anySlot) s.setItem(slotKeyId(1), old);
    s.removeItem(SAVE_KEY);
    return true;
  } catch (_) { return false; }
}

/** 开场页「续上一局」与存档面板的槽位摘要；优先给最近更新的可续档。 */
export function bestSlot() {
  const s = store();
  if (!s) return null;
  migrateLegacy();
  let best = null;
  for (let i = 1; i <= SAVE_SLOTS; i++) {
    const raw = s.getItem(slotKeyId(i));
    const info = saveInfo(raw);
    if (!info) continue;
    if (!best || info.at > best.info.at) best = { slot: i, info };
  }
  return best;
}

/** 三槽摘要（含终局档）：UI 面板用，坏档标记 broken 便于「删」而不可「载入」。 */
export function slotSummaries() {
  const s = store();
  if (!s) return [];
  migrateLegacy();
  const out = [];
  for (let i = 1; i <= SAVE_SLOTS; i++) {
    const raw = s.getItem(slotKeyId(i));
    if (!raw) { out.push({ slot: i, empty: true }); continue; }
    try {
      const d = JSON.parse(raw);
      const songN = d.cities ? Object.values(d.cities).filter(c => c && c.owner === 'song').length : 0;
      const totalN = d.cities ? Object.keys(d.cities).length : 0;
      out.push({
        slot: i, empty: false, over: !!d.over, turn: d.turn ?? 0, seed: d.seed,
        difficulty: d.difficulty, scenarioId: findScenario(d.scenarioId)?.id ?? null,
        at: d.at ?? 0, songN, totalN,
        broken: d.v !== VERSION || !d.cities,
      });
    } catch (_) {
      out.push({ slot: i, empty: false, broken: true, over: false, at: 0 });
    }
  }
  return out;
}

/** 开场页「继续上一局」按钮的摘要；存档损坏时返回 null */
export function saveInfo(raw = readSave()) {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (d.v !== VERSION || !d.cities || d.over) return null;
    return { turn: d.turn, seed: d.seed, difficulty: d.difficulty, scenarioId: findScenario(d.scenarioId)?.id ?? null, at: d.at };
  } catch (_) { return null; }
}
