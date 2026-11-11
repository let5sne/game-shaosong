import {
  CITY_DEFS, HEROES, EVENTS, TERRAIN_DEFENSE, TERRAIN_LABEL, DIFFICULTIES,
  findScenario, riverBetween,
} from './data.js';
import {
  economyActive, createEconomy, buildingLevels, buildCost, BUILDINGS,
  DISPATCH_TASKS, DISPATCH_PER_TURN, MAX_BUILDING_LEVEL, ARMS_CAP, TRAIN_ARMS_COST,
  heroProgress, officeBonus, economyCombatBonus, economyCapBonus,
  economyIncome, economyYield, consumeGranary, razeBuildings,
} from './economy.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── 地理与补给的公共系数（规则、战前推演、托管 AI 三处共用） ──
export const GEO = {
  crossAtk: -0.20,      // 攻方涉水之阻
  crossDef: 0.14,       // 守方据河之利
  crossGrain: 0.5,      // 每营额外的舟楫粮耗
  supportAtk: 0.03,     // 每一处友邻连营的攻势
  supportDef: 0.04,     // 每一处友邻连营的守势
  isolatedAtk: -0.18,   // 孤军无继，出兵之弊
  isolatedDef: -0.10,   // 孤城无援，守备之弊
  supportMax: 3,        // 连营计数上限
  stationedAtk: 0.10,   // 都督驻节本城出兵
  stationedDef: 0.12,   // 都督坐镇本城守备
  stationedMul: 1.6,    // 驻节时战法加成倍率
  farPerHop: 0.14,      // 粮道每远一跳，每营额外粮耗
  farMax: 1.35,         // 远征粮耗上限（孤城按上限计）
  garrisonBase: 1.0,    // 每座己方州郡的常例戍守粮耗
  garrisonPerHop: 0.22, // 离行在越远，转运越贵
  garrisonFarMax: 1.8,
  viceUpkeep: 2,        // 分路都督另置幕府，每回合额外耗粮
  viceAtk: 0.50,        // 分帅驻节本城出兵时，其攻势按半额计入
};

/** 两京既复，仍须把金人压到这个州数以内，才算真正「中兴」 */
export const VICTORY_JIN_LIMIT = 3;
/** 御驾亲征一局至多几次：黄旗不可轻树 */
export const MAX_CHARGE = 4;
/** 分路都督：主帅之外至多再置一帅，诸将不相统属，须有代价 */
export const VICE_COST_GOLD = 20;
export const VICE_COURT_HE = 2;

/**
 * 剧本目标的通用解释器：数据层只声明城池 id，这里负责进度、文案与胜负。
 * 纯函数、不碰 DOM，Node 里可直接测；两关共用一套判定，不会各写一套账。
 */
export function scenarioProgress(s, sc) {
  const nameOf = id => s.cities[id]?.name || id;
  const holds = sc.hold || [];
  const want = sc.capture || [];
  const extra = sc.bonus || [];
  const lost = holds.filter(id => s.cities[id]?.owner !== 'song');
  const need = want.filter(id => s.cities[id]?.owner !== 'song');
  const bonusLeft = extra.filter(id => s.cities[id]?.owner !== 'song');
  const items = [
    ...holds.map(id => ({ label: `守${nameOf(id)}`, done: s.cities[id]?.owner === 'song' })),
    ...want.map(id => ({ label: `克${nameOf(id)}`, done: s.cities[id]?.owner === 'song' })),
    ...extra.map(id => ({ label: `取${nameOf(id)}`, done: s.cities[id]?.owner === 'song', optional: true })),
  ];
  return {
    items, lost, need, bonusLeft,
    holdDone: lost.length === 0,
    captureDone: want.length > 0 && need.length === 0,
    bonusDone: extra.length > 0 && bonusLeft.length === 0,
    text: lost.length ? `已失 ${lost.map(nameOf).join('、')}`
      : need.length ? `待克 ${need.map(nameOf).join('、')}`
        : sc.winKind === 'hold'
          ? `守土 ${holds.length}/${holds.length} · 第 ${Math.min(s.turn, sc.maxTurns)}/${sc.maxTurns} 回合`
          : bonusLeft.length ? `本务已竟 · 可进取 ${bonusLeft.map(nameOf).join('、')}`
            : '军令已竟',
  };
}

/** 剧本关的胜负：先通用硬性败因，再守土／克复／回合上限 */
export function scenarioResult(s, sc) {
  if (s.cities.linan.owner === 'jin' || s.cities.jiankang.owner === 'jin') {
    return { kind: 'lose', title: '江左失守', text: '行在陷落，朝廷再无立足之地。' };
  }
  if (s.popularity <= 0) {
    return { kind: 'lose', title: '民心尽失', text: '赋重役繁，民不聊生。守城之师，未待敌至而先散。' };
  }
  if (s.famine >= 3) {
    return { kind: 'lose', title: '仓廪告罄', text: '连岁乏粮，诸军自溃。' };
  }
  const p = scenarioProgress(s, sc);
  if (p.captureDone && p.holdDone) {
    const great = p.bonusDone && sc.greatTitle;
    return {
      kind: 'win',
      title: great ? sc.greatTitle : sc.winTitle,
      text: great ? (sc.greatText || sc.winText) : sc.winText,
    };
  }
  // 守势关另有「反客为主」：袭取 bonus 城即刻大捷，不必苦撑到回合上限
  if (sc.winKind === 'hold' && p.bonusDone && p.holdDone) {
    return { kind: 'win', title: sc.winTitle, text: sc.winText };
  }
  // 必守之州中途易主不立刻判负：尚有余裕反攻夺回，终局时仍在敌手才算败
  if (s.turn > s.maxTurns) {
    if (!p.holdDone) return { kind: 'lose', title: sc.loseHoldTitle, text: sc.loseHoldText };
    return sc.winKind === 'hold'
      ? { kind: 'win', title: sc.holdTitle, text: sc.holdText }
      : { kind: 'lose', title: sc.timeoutTitle, text: sc.timeoutText };
  }
  return null;
}

/** 开场军令一行：把声明式目标转成玩家读得懂的短句 */
export function scenarioGoalText(sc) {
  const nameOf = id => CITY_DEFS.find(d => d.id === id)?.name || id;
  const hold = (sc.hold || []).map(nameOf).join('、');
  const take = (sc.capture || []).map(nameOf).join('、');
  const extra = (sc.bonus || []).map(nameOf).join('、');
  return `守 ${hold}${take ? `，克 ${take}` : ''}${extra ? `；能取 ${extra} 则为大捷` : ''}，${sc.maxTurns} 回合为限`;
}

/**
 * 一路都督只在一州持节。主帅（heroId）总戎事、其战法为全军常效；
 * 分帅（viceHeroId）只在驻节本城供给战法，全局朝政与粮赋不叠加。
 */
export function commanderAt(state, cityId) {
  if (!cityId) return null;
  if (state.heroCity === cityId) return 'main';
  if (state.viceHeroCity === cityId) return 'vice';
  return null;
}
/** 无将领驻节的州郡，仍受主帅的全局战法节制 */
export function heroAt(state, cityId) {
  const route = commanderAt(state, cityId);
  if (route === 'main') return state.hero;
  if (route === 'vice') return state.viceHero;
  return state.hero;
}
export function artAt(state, cityId) {
  return heroAt(state, cityId)?.art || null;
}
/**
 * 本城实际生效的战法：主帅常效 + 分帅驻节时本路额外一份。
 * 分镇不削弱主帅的常效，代价另由幕府粮耗与朝局承担。
 */
export function artStack(state, cityId) {
  const main = state.heroArt;
  const vice = commanderAt(state, cityId) === 'vice' ? artAt(state, cityId) : null;
  return { main, vice };
}
/** 常效类战法（兵额、漕运、舟师等）取两路较大者，不叠加也不可被削弱 */
export function artValue(state, cityId, key) {
  const A = artStack(state, cityId);
  return Math.max(A.main?.[key] || 0, A.vice?.[key] || 0);
}

/**
 * 粮道：自行在（临安）与旧都（建康）起算，只经己方州郡连通。
 * 不通者为孤城；support 记录每城相邻的同阵营州郡数（犄角连营）；
 * dist 是距行在的粮道跳数，远征粮耗据此递增。
 * 结果按「回合 + 全图归属」缓存，攻城易主后自动失效。
 */
export function supplyMap(state) {
  const cities = state.cities;
  const ids = Object.keys(cities);
  // 用固定城序生成 key：存档恢复后对象键顺序可能变化，不能依赖 Object.keys
  const key = `${state.turn}|${CITY_DEFS.map(d => cities[d.id]?.owner === 'song' ? 'S' : 'J').join('')}`;
  if (state._supplyKey === key && state._supply) return state._supply;

  const support = {};
  for (const id of ids) support[id] = cities[id].links.filter(
    l => cities[l] && cities[l].owner === cities[id].owner,
  ).length;

  const linked = new Set();
  const dist = {};
  for (const id of ids) dist[id] = Infinity;
  const queue = ids.filter(id => cities[id].owner === 'song' && (cities[id].seat || cities[id].capitalOfSong));
  queue.forEach(id => { linked.add(id); dist[id] = 0; });
  while (queue.length) {
    const id = queue.shift();
    for (const l of cities[id].links) {
      if (linked.has(l) || !cities[l] || cities[l].owner !== 'song') continue;
      linked.add(l);
      dist[l] = dist[id] + 1;
      queue.push(l);
    }
  }
  const isolated = ids.filter(id => cities[id].owner === 'song' && !linked.has(id));
  state._supply = { linked, isolated, support, dist };
  state._supplyKey = key;
  return state._supply;
}

/** 城池兵额：受岁赋、本城节制将领的战法与粮道共同约束 */
export function troopCap(state, c) {
  const base = Math.max(12, Math.round(c.yieldGrain * 2.8));
  // 治略：里程碑「行营广募」等只在开启时贡献兵额，关闭时 +0 不改变取整结果
  const withArt = Math.round(base * (1 + artValue(state, c.id, 'cap') + economyCapBonus(state)));
  const isolated = c.owner === 'song' && !supplyMap(state).linked.has(c.id)
    && !artValue(state, c.id, 'supply');
  return isolated ? Math.max(8, Math.round(withArt * 0.6)) : withArt;
}

/**
 * 行军粮耗：常规 1.6／营，涉水另需舟楫，粮道越远转运越贵。
 * 战前推演、托管 AI、实际扣粮三处共用同一公式，避免账目分叉。
 */
export function marchCost(state, from, to, send) {
  const cross = riverBetween(from, to);
  const hops = supplyMap(state).dist[from.id];
  const far = Number.isFinite(hops) ? Math.min(GEO.farMax, hops * GEO.farPerHop) : GEO.farMax;
  return Math.round(send * (1.6 + (cross ? GEO.crossGrain : 0) + far));
}

/**
 * 渡河须另下「调舟楫、备津渡」一道政令；水师都督自备舟师，
 * 或官家亲征时御营统筹，皆可免。这让「拜谁为帅」与「何时渡淮」互相牵动。
 */
export function marchDecree(state, from, to) {
  if (!riverBetween(from, to)) return 1;
  return artValue(state, from.id, 'river') >= 0.5 || state.charge ? 1 : 2;
}

/** 冬季黄河冰合，涉水之阻与据河之利俱减；其余季节如常 */
function riverSeasonFactor(state, river) {
  const winter = (state.turn - 1) % 4 === 3;
  return winter && river?.id === 'huanghe' ? 0.4 : 1;
}

/**
 * 可复现随机源：一步 mulberry32，返回 [新状态, 0~1)。
 * 状态就是一个 uint32，既能挂在 GameState 上随存档走，也能独立派生开局变局序列。
 */
function rngStep(t) {
  const nt = (t + 0x6D2B79F5) >>> 0;
  let x = Math.imul(nt ^ (nt >>> 15), 1 | nt);
  x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
  return [nt, ((x ^ (x >>> 14)) >>> 0) / 4294967296];
}
/** 开局变局专用流：由局号独立派生，不与战斗/事件争用同一序列 */
function makeRng(seed) {
  let t = seed >>> 0;
  return () => { const [nt, v] = rngStep(t); t = nt; return v; };
}

/**
 * 每局抽两条开局变局，写入 state.variant.notes。
 * easy 偏吉、hard 偏凶、normal 吉凶参半，让「再开一局」不是同一道题。
 */
function rollVariant(s, r, luck) {
  const jinIds = CITY_DEFS.filter(d => d.owner === 'jin').map(d => d.id);
  const songIds = CITY_DEFS.filter(d => d.owner === 'song').map(d => d.id);
  const some = list => list[Math.floor(r() * list.length)];
  const pool = [
    { tone: 'bad', make: () => { const id = some(jinIds); return {
      text: `金人重兵屯于${s.cities[id].name}`, apply: () => { s.cities[id].troops += 3; } }; } },
    { tone: 'bad', make: () => { const id = some(songIds); return {
      text: `${s.cities[id].name}边备未修`, apply: () => { s.cities[id].troops = Math.max(2, s.cities[id].troops - 2); } }; } },
    { tone: 'bad', make: () => ({ text: '去岁歉收，仓廪未实', apply: () => { s.grain -= 20; } }) },
    { tone: 'bad', make: () => ({ text: '朝中苟安之论渐起', apply: () => { s.court.he += 8; s.court.zhan -= 4; } }) },
    { tone: 'good', make: () => ({ text: '江淮丰稔，仓廪有余', apply: () => { s.grain += 30; } }) },
    { tone: 'good', make: () => ({ text: '府库充实，缗钱可用', apply: () => { s.gold += 30; } }) },
    { tone: 'good', make: () => ({ text: '朝中主战之声甚高', apply: () => { s.court.zhan += 8; s.court.he -= 4; } }) },
    { tone: 'good', make: () => ({ text: '诸军思战，士气颇盛', apply: () => { s.morale += 8; } }) },
    { tone: 'good', make: () => ({ text: '江南民心可用', apply: () => { s.popularity += 8; } }) },
    { tone: 'good', make: () => { const ids = [some(jinIds), some(jinIds)]; return {
      text: '金人内乱，北边兵势稍减', apply: () => { ids.forEach(id => { s.cities[id].troops = Math.max(2, s.cities[id].troops - 2); }); } }; } },
    { tone: 'mixed', make: () => { const id = some(songIds); return {
      text: `${s.cities[id].name}旧部尚完`, apply: () => { s.cities[id].troops += 2; } }; } },
    { tone: 'mixed', make: () => ({ text: '关陕劲旅可用', apply: () => { s.cities.changan.troops += 2; } }) },
  ];
  const allowed = luck === 'good' ? pool.filter(v => v.tone !== 'bad')
    : luck === 'bad' ? pool.filter(v => v.tone !== 'good') : pool;
  const bag = allowed.slice();
  const notes = [];
  while (notes.length < 2 && bag.length) {
    const v = bag.splice(Math.floor(r() * bag.length), 1)[0].make();
    v.apply();
    notes.push(v.text);
  }
  return notes;
}

export class GameState {
  constructor(opts = {}) {
    this.listeners = {};
    this.reset(opts);
  }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); return this; }
  emit(name, payload) { (this.listeners[name] || []).forEach(fn => fn(payload)); }

  // ── 随机源 ────────────────────────────────────────────────
  // 整局所有掷点都走这里，状态随存档序列化：同局号 + 同指令序列 = 同战报。
  nextRandom() {
    const [nt, v] = rngStep(this.rngState);
    this.rngState = nt;
    return v;
  }
  rand(a, b) { return a + this.nextRandom() * (b - a); }
  pick(arr) { return arr[Math.floor(this.nextRandom() * arr.length)]; }

  reset(opts = {}) {
    const id = opts.difficulty ?? this.difficulty ?? 'normal';
    const D = DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
    // 未带 scenario 参数的 reset 视为「重开当前这一关」，故沿用旧 scenarioId。
    // 要从开场页回到长局，须显式传 scenario: null。
    const sc = opts.scenario !== undefined ? findScenario(opts.scenario) : findScenario(this.scenarioId);
    this.scenarioId = sc?.id ?? null;
    const D0 = sc ? (DIFFICULTIES.find(d => d.id === sc.difficulty) || D) : D;
    this.difficulty = D0.id;
    this.maxTurns = sc?.maxTurns ?? D.maxTurns;
    this.jinMight = sc ? (sc.jinMight ?? D0.jinMight) : D.jinMight;
    this.seed = Number.isFinite(opts.seed) ? opts.seed : (Math.floor(Math.random() * 900000) + 100000);
    // 剧本是固定开局的题解，不抽两条随机变局；但战斗／事件仍走同一条可复现随机流
    this.random = opts.random !== false && !sc;
    // 战斗流与开局变局流分离，但都由局号派生，故整局可复现
    this.rngState = (this.seed ^ 0x5f3759df) >>> 0;

    this.cities = {};
    CITY_DEFS.forEach(d => {
      this.cities[d.id] = { ...d, links: [...d.links], troops0: d.troops, owner: d.owner, lastTrainTurn: 0 };
    });
    if (sc) {
      for (const [cid, owner] of Object.entries(sc.owners || {})) {
        if (this.cities[cid]) this.cities[cid].owner = owner;
      }
      for (const [cid, n] of Object.entries(sc.troops || {})) {
        if (!this.cities[cid]) continue;
        this.cities[cid].troops = n;
        this.cities[cid].troops0 = n;   // 自然征募的上限也以固定开局为准
      }
    }
    // 补全双向邻接
    Object.values(this.cities).forEach(c => {
      c.links.forEach(id2 => {
        const other = this.cities[id2];
        if (other && !other.links.includes(c.id)) other.links.push(c.id);
      });
    });
    // 难度先落到金军兵额上，之后变局再叠一层；剧本兵力完全由定义给定
    if (!sc && D.jinTroops) this.jinCities.forEach(c => { c.troops = Math.max(2, c.troops + D.jinTroops); });

    this.turn = 1;
    this.grain = sc?.grain ?? D.grain;
    this.gold = sc?.gold ?? D.gold;
    this.popularity = sc?.popularity ?? 62;
    this.morale = sc?.morale ?? 58;
    this.court = sc?.court ? { ...sc.court }
      : { zhan: clamp(58 + D.zhanDelta, 0, 100), he: clamp(42 - D.zhanDelta, 0, 100) };
    this.heroId = sc?.heroId ?? null;
    this.heroCity = sc?.heroCity ?? null;      // 主帅驻节州郡
    if (this.heroCity && this.cities[this.heroCity]?.owner !== 'song') this.heroCity = null;
    this.heroTurn = 0;         // 上次拜主帅所在回合，供「阶段转折换将」节流
    this.viceHeroId = null;    // 分路都督：与主帅分镇，战法只及本城
    this.viceHeroCity = null;
    this.viceHeroTurn = 0;
    this.flags = new Set();    // 事件链的记忆：某选项留下的朝局后果
    this.gearBonus = 0;
    // 治略（经营养成）：默认关闭。未显式传参时沿用当前模式，故重开一局不会偷偷退出。
    // 关闭时 economy 为 null，所有规则分支短路，批量模拟的 seed=1..N 基线逐字节不变。
    const ecoOn = opts.economy !== undefined ? !!opts.economy : !!this.economyOn;
    this.economyOn = ecoOn;
    this.economy = ecoOn ? createEconomy() : null;
    this.jinFury = sc?.jinFury ?? D.jinFury;
    this._supplyKey = null;
    this._supply = null;
    this.charge = 0;
    this.chargeUsed = 0;
    this.truce = 0;
    this.famine = 0;
    this.seenEvents = new Set();
    this._twoCapitalsNoted = false;
    this.lastCaptureTurn = 0;
    this.pendingEvent = null;
    this.logs = [];
    this.over = null;
    this.decree = this.calcDecree();
    this.lastBattle = null;
    this.variant = { seed: this.seed, notes: [] };
    if (this.random) this.variant.notes = rollVariant(this, makeRng(this.seed), D.luck);

    if (sc) {
      this.say(`【短剧本 · ${sc.name}】${sc.era}。${sc.brief.split('\n')[0]}`, 'event');
      this.say(`【军令】${scenarioGoalText(sc)}。`, 'info');
      this.say(`【开局】固定局面 · 局号 #${this.seed}；不抽变局，掷点仍随局号可复现。`, 'event');
    } else {
      this.say('建炎之末，行在草创。官家立于江左，北望中原。', 'event');
      const extra = this.variant.notes.length ? `｜${this.variant.notes.join('，')}` : '';
      this.say(`【开局】${D.name} · 局号 #${this.seed}${extra}`, 'event');
      this.say('目标：收复东京开封与燕京，重振版籍。', 'info');
    }
  }

  // ── 查询 ──────────────────────────────────────────────────
  get diffDef() { return DIFFICULTIES.find(d => d.id === this.difficulty) || DIFFICULTIES[1]; }
  /** 当前短剧本；长局为 null。存档只存 id，回查数据表 */
  get scenario() { return findScenario(this.scenarioId); }
  /** 亲征须两道政令，且一局至多 MAX_CHARGE 次 */
  get canQinzheng() { return !this.charge && this.chargeUsed < MAX_CHARGE && !this.over; }
  get hero() { return HEROES.find(h => h.id === this.heroId) || null; }
  get heroArt() { return this.hero?.art || null; }
  get viceHero() { return HEROES.find(h => h.id === this.viceHeroId) || null; }
  get viceHeroArt() { return this.viceHero?.art || null; }
  /** 本城节制者：主帅／分帅／无（无则受主帅全局战法节制） */
  commanderForCity(cityId) { return commanderAt(this, cityId); }
  artForCity(cityId) { return artAt(this, cityId); }
  stationAt(cityId) { return commanderAt(this, cityId) !== null; }
  get hasVice() { return !!this.viceHero; }
  /** 兵额：城池岁赋为基，本城都督「众兵」可增，孤城粮道不通则减半 */
  get troopCap() { return c => troopCap(this, c); }
  get songCities() { return Object.values(this.cities).filter(c => c.owner === 'song'); }
  get jinCities() { return Object.values(this.cities).filter(c => c.owner === 'jin'); }
  get totalTroops() { return this.songCities.reduce((n, c) => n + c.troops, 0); }
  get jinTroops() { return this.jinCities.reduce((n, c) => n + c.troops, 0); }
  get frontCities() {
    return this.songCities.filter(c => c.links.some(id => this.cities[id].owner === 'jin'));
  }
  get yearName() {
    const t = this.turn;
    if (t <= 8) return `建炎${['三年', '三年', '三年', '三年', '四年', '四年', '四年', '四年'][t - 1]} · ${['春', '夏', '秋', '冬'][(t - 1) % 4]}`;
    const y = Math.ceil((t - 8) / 4);
    const cn = ['元', '二', '三', '四', '五', '六', '七', '八'][y - 1] || String(y);
    return `绍兴${cn}年 · ${['春', '夏', '秋', '冬'][(t - 1) % 4]}`;
  }
  get objective() {
    const sc = this.scenario;
    if (sc) {
      const p = scenarioProgress(this, sc);
      return {
        text: `${sc.name} · ${p.text}`, items: p.items, scenario: sc,
        kaifeng: false, yanjing: false, remain: this.jinCities.length,
      };
    }
    const kf = this.cities.kaifeng.owner === 'song';
    const yj = this.cities.yanjing.owner === 'song';
    const rest = this.jinCities.length;
    const text = !kf ? '收复东京开封'
      : !yj ? '旧都已复 · 进取燕京'
        : rest > VICTORY_JIN_LIMIT ? `两京已复 · 扫清中原（金余 ${rest} 州）`
          : '燕云已归 · 中原底定';
    return { kaifeng: kf, yanjing: yj, remain: rest, text, scenario: null, items: null };
  }

  say(text, type = 'info') {
    this.logs.unshift({ text, type, turn: this.turn, tag: this.yearName });
    if (this.logs.length > 80) this.logs.pop();
    this.emit('log', { text, type });
  }

  clampAll() {
    this.grain = Math.max(0, Math.round(this.grain));
    this.gold = Math.max(0, Math.round(this.gold));
    this.popularity = clamp(Math.round(this.popularity), 0, 100);
    this.morale = clamp(Math.round(this.morale), 0, 100);
    this.court.zhan = clamp(Math.round(this.court.zhan), 0, 100);
    this.court.he = clamp(Math.round(this.court.he), 0, 100);
  }

  reinforceFront(n) {
    const targets = this.frontCities.length ? this.frontCities : this.songCities;
    if (!targets.length) return;
    for (let i = 0; i < n; i++) targets[i % targets.length].troops += 1;
  }

  calcDecree() {
    const hero = this.hero;
    // 政令是全局最稀缺的资源：主战再盛也不过五道，须在进军、整军、积谷、抚民之间取舍
    // 分帅若为理政之才，其「庙算」只补半道，不与主帅的全额加成叠加
    let d = 3 + Math.round((this.court.zhan - this.court.he) / 50 + (this.viceHero?.decree || 0) * 0.5);
    if (this.popularity >= 75) d += 1;
    if (this.popularity <= 30) d -= 1;
    if (hero?.decree) d += hero.decree;
    if (this.court.he >= 80) d -= 1;
    d += this.diffDef.decreeBonus || 0;
    return clamp(d, 2, 6);
  }

  // ── 治略：即时开关与阅历 ─────────────────────────────────
  /**
   * 即时切换经营养成。关掉只冻结生效、不销毁数据，再开可续用已置设施与诸臣阅历；
   * 这让设置面板能「即时生效」，又不至于一次误点抹掉半局经营成果。
   */
  setEconomy(on) {
    const next = !!on;
    if (next === this.economyOn && (!next || this.economy)) return false;
    this.economyOn = next;
    if (next && !this.economy) this.economy = createEconomy();
    this.say(next
      ? '【治略】推行营建与差遣之法：州郡可置屯田、仓廪、军器作坊、市舶；在朝诸臣可历练积功、进阶战法。'
      : '【治略】新法暂罢，已置设施与诸臣阅历封存；复行时仍可续用。', 'event');
    this.changed();
    return true;
  }

  /** 阅历与升级提示的唯一入口：差遣、实战、驻节三处共用 */
  grantExp(heroId, amount) {
    if (!economyActive(this) || !heroId || !(amount > 0)) return;
    const rec = this.economy.heroes[heroId]
      || (this.economy.heroes[heroId] = { exp: 0, lastDispatchTurn: 0, count: 0 });
    const before = heroProgress(this.economy, heroId).level;
    rec.exp += Math.round(amount);
    const after = heroProgress(this.economy, heroId);
    if (after.level <= before) return;
    const h = HEROES.find(x => x.id === heroId);
    const gained = after.unlocked.filter(m => m.at > before && m.at <= after.level);
    this.say(`【进阶】${h?.name || heroId}积功至 ${after.level} 级${gained.length
      ? `，悟「${gained.map(m => m.name).join('」「')}」——${gained.map(m => m.desc).join('；')}`
      : '。'}`, 'event');
  }

  // ── 指令 ──────────────────────────────────────────────────
  _spend(cost = 1) {
    if (this.over) return false;
    if (this.decree < cost) { this.say(cost > 1 ? `此令需 ${cost} 道政令，余者不足。` : '政令已尽，且待来日。', 'bad'); return false; }
    this.decree -= cost;
    return true;
  }

  zhengjun(cityId) {
    const c = this.cities[cityId];
    if (!c || c.owner !== 'song') return false;
    if (c.lastTrainTurn === this.turn) { this.say(`${c.name}本回合已点验过军伍。`, 'bad'); return false; }
    const cap = troopCap(this, c);
    if (c.troops >= cap) { this.say(`${c.name}兵额已满（${cap} 营），当分驻他州。`, 'bad'); return false; }
    if (this.grain < 18 || this.gold < 12) { this.say('粮饷不足，无法整军。', 'bad'); return false; }
    if (!this._spend()) return false;
    // 治略：军械足则器械精利，耗械 6 多募一营、省粮 3；攒械加攻势还是花械换兵，是一层真取舍
    const armed = economyActive(this) && this.economy.arms >= TRAIN_ARMS_COST;
    if (armed) this.economy.arms -= TRAIN_ARMS_COST;
    const add = Math.min(3 + (this.morale >= 70 ? 1 : 0) + (armed ? 1 : 0), cap - c.troops);
    this.grain -= 18 - (armed ? 3 : 0); this.gold -= 12;
    c.troops += add; this.morale += 3;
    c.lastTrainTurn = this.turn;
    const iso = !supplyMap(this).linked.has(c.id);
    this.say(`【整军】${c.name}募练新军，兵力 +${add}，现 ${c.troops}／${cap} 营。${iso ? '（粮道未通，兵额减半）' : ''}${armed ? `（耗军械 ${TRAIN_ARMS_COST}，器械精利）` : ''}`, 'good');
    this.changed(); return true;
  }

  chouliang() {
    if (!this._spend()) return false;
    const gain = 38 + (this.hero?.grainBonus || 0) + Math.round(this.popularity / 12)
      + Math.round((this.viceHero?.grainBonus || 0) * 0.5)
      + (economyActive(this) ? officeBonus(this).grainBonus : 0);
    this.grain += gain; this.gold += 18; this.popularity -= 4;
    this.say(`【筹粮】江南转运使督办粮纲，得粮 +${gain}、缗钱 +18，民力稍困。`, 'good');
    this.changed(); return true;
  }

  anfu() {
    if (!this._spend() || this.grain < 15) { this.say('仓廪不足以赈抚。', 'bad'); return false; }
    this.grain -= 15; this.popularity += 9; this.morale += 1; this.court.zhan -= 2;
    this.say('【安抚】减免两浙赋役，遣使存问，民心 +9。', 'good');
    this.changed(); return true;
  }

  /** 拜将：主帅总戎事（全军常效），分帅另置幕府（战法只及驻节本城） */
  renming(heroId, route = 'main') {
    const h = HEROES.find(x => x.id === heroId);
    if (!h) return false;
    const vice = route === 'vice';
    if (vice) {
      if (!this.hero) { this.say('未拜主帅，不可先置分路。', 'bad'); return false; }
      if (heroId === this.heroId) { this.say('一人不可兼领两路。', 'bad'); return false; }
      if (this.viceHeroId === heroId) { this.say(`${h.name}已领分路。`, 'info'); return false; }
      if (this.gold < VICE_COST_GOLD) { this.say(`分置幕府需缗钱 ${VICE_COST_GOLD}，府库不足。`, 'bad'); return false; }
    } else {
      if (this.heroId === heroId) { this.say(`${h.name}已总戎事。`, 'info'); return false; }
      if (this.viceHeroId === heroId) { this.say(`${h.name}方领分路，不可同时总戎事；请先罢其幕府。`, 'bad'); return false; }
    }
    if (!this._spend()) return false;

    if (vice) {
      this.gold -= VICE_COST_GOLD;
      this.viceHeroId = heroId;
      this.viceHeroCity = null;
      this.viceHeroTurn = this.turn;
      this.court.zhan = clamp(this.court.zhan + Math.round((h.zhanDelta || 0) / 2), 0, 100);
      this.court.he = clamp(this.court.he + Math.round((h.heDelta || 0) / 2) + VICE_COURT_HE, 0, 100);
      this.morale = clamp(this.morale + (h.morale || 0) * 0.25, 0, 100);
      this.say(`【分路】以${h.name}为${h.title}，领「${h.art?.name || '诸军'}」别镇一路。另置幕府耗缗钱 ${VICE_COST_GOLD}、每回合加耗 ${GEO.viceUpkeep} 粮；诸将不相统属，主和 +${VICE_COURT_HE}。`, 'event');
    } else {
      this.heroId = heroId;
      this.heroCity = null;   // 更易主帅，旧日驻节自然作废
      this.heroTurn = this.turn;
      this.court.zhan = clamp(this.court.zhan + (h.zhanDelta || 0), 0, 100);
      this.court.he = clamp(this.court.he + (h.heDelta || 0), 0, 100);
      this.morale = clamp(this.morale + (h.morale || 0) * 0.5, 0, 100);
      this.say(`【拜将】以${h.name}为都督诸军事，领「${h.art?.name || '诸军'}」。朝野议论纷然：${h.desc}`, 'event');
    }
    this.changed(); return true;
  }

  /** 罢分路：诸军复归一帅，省下幕府粮耗 */
  dismissVice() {
    if (!this.viceHero) return false;
    const name = this.viceHero.name;
    this.viceHeroId = null;
    this.viceHeroCity = null;
    this.court.zhan = clamp(this.court.zhan + 2, 0, 100);
    this.say(`【分路】罢${name}幕府，诸军复归一帅节制，戍守转运如旧。`, 'info');
    this.changed(); return true;
  }

  /** 督军驻节：两路可各驻一州，本城出兵与守备俱得厚益 */
  dujun(cityId, route) {
    const which = route || (this.hero && !this.heroCity ? 'main' : this.viceHero && !this.viceHeroCity ? 'vice' : 'main');
    const vice = which === 'vice';
    const h = vice ? this.viceHero : this.hero;
    const key = vice ? 'viceHeroCity' : 'heroCity';
    const other = vice ? 'heroCity' : 'viceHeroCity';
    if (!h) { this.say(vice ? '未置分路都督，无从驻节。' : '未拜都督，无从驻节。', 'bad'); return false; }
    const c = this.cities[cityId];
    if (!c || c.owner !== 'song') { this.say('须择己方州郡驻节。', 'bad'); return false; }
    if (this[other] === cityId) { this.say(`${c.name}已有他路持节，一州不置二节。`, 'bad'); return false; }
    if (this[key] === cityId) { this.say(`${h.name}已驻节${c.name}。`, 'info'); return false; }
    if (!this._spend()) return false;
    this[key] = cityId;
    this.morale += 2;
    this.say(`【督军】${h.name}持节驻${c.name}${vice ? '（分路）' : ''}，领「${h.art?.name || '诸军'}」：自此出兵战法加倍，本城守备益固。`, 'event');
    this.changed(); return true;
  }

  qinzheng() {
    if (this.charge) { this.say('黄旗已出，本回合无须再树。', 'info'); return false; }
    if (this.chargeUsed >= MAX_CHARGE) { this.say('亲征之令已尽，官家不宜再轻身出驻。', 'bad'); return false; }
    if (!this._spend(2)) return false;
    this.charge = 1; this.chargeUsed++;
    this.morale += 10; this.popularity -= 4; this.court.zhan += 4;
    this.jinFury += 1;
    this.say(`【御驾亲征】官家出驻建康，黄旗渡江。本回合诸军攻势 +25%，然民力稍扰、金人知我主力所在（余 ${MAX_CHARGE - this.chargeUsed} 次）。`, 'event');
    this.changed(); return true;
  }

  heyi() {
    if (this.gold < 55) { this.say('府库不足，无从输岁币。', 'bad'); return false; }
    if (!this._spend()) return false;
    this.gold -= 55; this.truce = 2;
    this.court.zhan -= 16; this.court.he += 16; this.popularity -= 8; this.morale -= 6;
    this.say('【和议】遣使奉表、输岁币。金人暂缓南下，然北伐之议几熄。', 'bad');
    this.changed(); return true;
  }

  /**
   * 营建：一类设施 0→3 级，级越高越贵。占一道政令，故「种田」与「北伐」争的是同一份稀缺资源。
   * 城池易主时设施归零（见 battle），把经营投入变成可被打掉的沉没成本。
   */
  yingjian(cityId, buildingId) {
    if (!economyActive(this)) { this.say('治略未行，无从营建。', 'bad'); return false; }
    const b = BUILDINGS.find(x => x.id === buildingId);
    const c = this.cities[cityId];
    if (!b || !c || c.owner !== 'song') { this.say('须于己方州郡营建。', 'bad'); return false; }
    const lv = buildingLevels(this.economy, cityId)[buildingId];
    if (lv >= MAX_BUILDING_LEVEL) { this.say(`${c.name}${b.name}已至 ${MAX_BUILDING_LEVEL} 级，无可复加。`, 'bad'); return false; }
    const cost = buildCost(lv);
    if (this.gold < cost.gold || this.grain < cost.grain) {
      this.say(`府库或仓廪不足：营建需缗钱 ${cost.gold}、粮 ${cost.grain}。`, 'bad'); return false;
    }
    if (!this._spend(cost.decree)) return false;
    this.gold -= cost.gold; this.grain -= cost.grain;
    const rec = this.economy.buildings[cityId] || (this.economy.buildings[cityId] = {});
    rec[buildingId] = lv + 1;
    this.economy.built++;
    this.say(`【营建】${c.name}置${b.name}至 ${lv + 1} 级（耗钱 ${cost.gold}、粮 ${cost.grain}、政令 ${cost.decree}）：${b.effect(lv + 1)}。`, 'good');
    this.changed(); return true;
  }

  /**
   * 差遣：八员皆可历练，不必先拜将；但成长只在「在任」时生效，故培养谁与拜谁互相牵动。
   * 每员每回合至多一次，全朝每回合至多两遣，掷点走 rngState 保持整局可复现。
   */
  chaiqian(heroId, cityId, taskId) {
    if (!economyActive(this)) { this.say('治略未行，无从差遣。', 'bad'); return false; }
    const h = HEROES.find(x => x.id === heroId);
    const t = DISPATCH_TASKS.find(x => x.id === taskId);
    const c = this.cities[cityId];
    if (!h || !t || !c || c.owner !== 'song') { this.say('差遣须择在朝之臣与己方州郡。', 'bad'); return false; }
    const rec = this.economy.heroes[heroId] || (this.economy.heroes[heroId] = { exp: 0, lastDispatchTurn: 0, count: 0 });
    if (rec.lastDispatchTurn === this.turn) { this.say(`${h.name}本回合已有差遣。`, 'bad'); return false; }
    if (this.economy.dispatchTurn >= DISPATCH_PER_TURN) {
      this.say(`本回合差遣已足 ${DISPATCH_PER_TURN} 员，朝中不可一日无人。`, 'bad'); return false;
    }
    if (taskId === 'duzao' && this.gold < 8) { this.say('督造需缗钱 8 万贯，府库不足。', 'bad'); return false; }
    if (!this._spend()) return false;
    rec.lastDispatchTurn = this.turn;
    rec.count++;
    this.economy.dispatchTurn++;
    this.economy.dispatches++;
    const exp = 12 + Math.round(this.rand(0, 8)) + Math.round((h.politics || 0) / 3);
    let extra = '';
    if (taskId === 'tunken') {
      const farm = buildingLevels(this.economy, cityId).tuntian;
      const gain = 12 + farm * 6 + Math.round(this.rand(0, 6));
      this.grain += gain;
      extra = `劝课得粮 +${gain}${farm ? `（屯田 ${farm} 级）` : ''}`;
    } else if (taskId === 'xunbian') {
      const add = Math.min(2, Math.max(0, troopCap(this, c) - c.troops));
      c.troops += add; this.popularity += 1;
      extra = `收拢乡兵 +${add} 营`;
    } else {
      this.gold -= 8;
      const gain = Math.max(0, Math.min(8, ARMS_CAP - this.economy.arms));
      this.economy.arms += gain;
      extra = `督造军械 +${gain}（耗钱 8）`;
    }
    this.say(`【差遣】${h.name}赴${c.name}${t.name}：${extra}，阅历 +${exp}。`, 'good');
    this.grantExp(heroId, exp);
    this.changed(); return true;
  }

  /** 进军：己→己为移防，己→金为攻城 */
  jinjun(fromId, toId) {
    const from = this.cities[fromId], to = this.cities[toId];
    if (!from || !to || from.owner !== 'song' || !from.links.includes(toId)) return false;
    const send = Math.max(2, Math.floor(from.troops * 0.70));
    if (send < 2 || from.troops <= 2) { this.say(`${from.name}兵力过寡，不可轻动。`, 'bad'); return false; }
    const cost = marchCost(this, from, to, send);
    const cross = riverBetween(from, to);
    if (this.grain < cost) { this.say(`粮秣不足，此番${cross ? `渡${cross.name}` : '进军'}需 ${cost} 粮。`, 'bad'); return false; }
    if (!this._spend(marchDecree(this, from, to))) return false;
    this.grain -= cost;

    if (to.owner === 'song') {
      from.troops -= Math.floor(send * 0.6);
      to.troops += Math.floor(send * 0.6);
      this.say(`【移防】自${from.name}调 ${Math.floor(send * 0.6)} 营赴${to.name}${cross ? `，舟楫渡${cross.name}` : ''}，以固防线。`, 'info');
      this.emit('march', { from: fromId, to: toId, owner: 'song', result: 'move' });
    } else {
      from.troops -= send;
      const res = this.battle(from, to, send, 'song');
      this.emit('march', { from: fromId, to: toId, owner: 'song', result: res.win ? 'win' : 'lose' });
    }
    this.changed();
    return true;
  }

  /** 战斗判定：攻守系数由 battleParams 统一提供，战前预估与托管 AI 共用同一份 */
  battle(from, to, send, side) {
    const defenderTroops = to.troops;   // 战报须记战前守军，克城后 to.troops 会被覆盖
    const P = battleParams(this, from, to, side, send);
    const atk = send * this.rand(0.85, 1.20) * P.atkBonus;
    const def = to.troops * this.rand(0.90, 1.15) * P.defBonus;
    const win = atk > def;

    let detail = '';
    if (win) {
      const survivors = clamp(Math.round(send * (0.36 + clamp((atk - def) / atk, 0, 1) * 0.34)), 2, send);
      to.owner = side;
      to.troops = survivors;
      // 治略：城池易主，历年营建一并付之东流——种田是有战略风险的投入
      if (economyActive(this) && razeBuildings(this.economy, to.id)) {
        this.say(`【治略】${to.name}易主，所置屯田仓廪尽付兵燹。`, 'bad');
      }
      detail = `克${to.name}，存 ${survivors} 营，须再整军。`;
      if (side === 'jin') {
        for (const [key, name] of [['heroCity', '都督'], ['viceHeroCity', '分路都督']]) {
          if (this[key] !== to.id) continue;
          const other = key === 'heroCity' ? this.viceHeroCity : this.heroCity;
          // 城虽陷，幕府就近移节：不必每失一城便重下一道驻节令
          const next = to.links.find(id => this.cities[id]?.owner === 'song' && id !== other);
          this[key] = next || null;
          this.say(next
            ? `【督军】${to.name}陷落，${name}移节${this.cities[next].name}，节制之命不废。`
            : `【督军】${to.name}陷落，${name}退守，驻节之命遂废。`, 'bad');
        }
      }
      if (side === 'song') {
        this.lastCaptureTurn = this.turn;
        this.morale += 8; this.popularity += 3; this.court.zhan += 5; this.court.he -= 2;
        if (to.id === 'kaifeng') this.say('★ 东京开封光复！旧都父老夹道，官家入城，百官泣拜。', 'event');
        if (to.id === 'yanjing') this.say('★ 燕京旗下！自石晋以来四百余年，燕云终归版籍。', 'event');
      } else {
        this.popularity -= 4; this.morale -= 5;
        if (to.seat) this.say('行在失守！', 'bad');
      }
    } else {
      const back = Math.round(send * 0.28);
      from.troops = Math.max(1, from.troops + back);
      to.troops = Math.max(1, Math.round(to.troops - send * 0.32));
      detail = `攻${to.name}不克，折兵 ${send - back} 营，余部退还。`;
      if (side === 'song') { this.morale -= 8; this.popularity -= 3; }
    }

    const label = side === 'song' ? '【北伐】' : '【金军南下】';
    const stationTag = side === 'song' ? '都督亲督' : '都督坐镇';
    const geo = [P.cross ? `渡${P.cross}` : '', P.isolated ? (side === 'song' ? '孤军' : '孤城') : '', P.stationed ? stationTag : ''].filter(Boolean).join(' · ');
    this.say(`${label}${geo ? `〔${geo}〕` : ''}${from.name}出 ${send} 营（攻势 ${atk.toFixed(1)}）／${to.name}守军 ${defenderTroops} 营（守势 ${def.toFixed(1)}）：${detail}`, win ? (side === 'song' ? 'good' : 'bad') : (side === 'song' ? 'bad' : 'good'));
    // 治略：战罢论功，在任将领按胜败累积阅历；金军叩边时守城亦算历练
    if (economyActive(this)) {
      const gain = win ? (side === 'song' ? 18 : 8) : 6;
      for (const hid of [this.heroId, this.viceHeroId]) if (hid) this.grantExp(hid, gain);
    }
    this.lastBattle = { from: from.id, to: to.id, side, win, atk, def };
    return { win, atk, def };
  }

  // ── 回合推进 ──────────────────────────────────────────────
  endTurn() {
    if (this.over || this.pendingEvent) return;
    this.say(`── ${this.yearName} · 第 ${this.turn} 回合终 ──`, 'divider');

    // 驻节城若已易主，该路都督还朝
    for (const [key, name] of [['heroCity', '都督'], ['viceHeroCity', '分路都督']]) {
      if (this[key] && this.cities[this[key]]?.owner !== 'song') {
        this.say(`【督军】${this.cities[this[key]].name}已非我有，${name}还朝，驻节之命遂废。`, 'bad');
        this[key] = null;
      }
    }

    // 财政 / 粮秣：孤城岁赋折半，「漕运」可免此弊
    const sup = supplyMap(this);
    const art = this.heroArt;   // 全局粮赋、军械加成只归主帅，分帅不叠加
    const yieldSum = this.songCities.reduce((n, c) => {
      const relief = sup.linked.has(c.id) || artValue(this, c.id, 'supply') ? 1 : 0.4;
      // 分帅「漕运」一类理政战法只增益驻节本城岁赋，不及于全局
      const localIncome = artStack(this, c.id).vice?.income || 0;
      return n + c.yieldGrain * relief * (1 + localIncome);
    }, 0);
    // 治略：屯田增岁赋、诸臣理政加成，都并入同一条度支公式；关闭时两项皆为 0
    const eco = economyYield(this);
    const inc = economyIncome(this);
    const income = Math.round((yieldSum + inc.flat) * (0.55 + this.popularity / 190)
      * (1 + (art?.income || 0) + inc.ratio));
    // 戍守转运：占得越远、越散，每回合的后勤负担越重，北伐不能只算进兵那一笔账
    const garrisonRaw = this.songCities.reduce((n, c) => {
      const hops = sup.dist[c.id];
      const far = Number.isFinite(hops) ? Math.min(GEO.garrisonFarMax, hops * GEO.garrisonPerHop) : GEO.garrisonFarMax;
      return n + GEO.garrisonBase + far;
    }, 0);
    const garrison = Math.max(0, Math.round(garrisonRaw - eco.upkeepRelief));
    const staffCost = this.viceHero ? GEO.viceUpkeep : 0;
    const upkeep = Math.round(this.totalTroops * 0.32) + garrison + staffCost + (this.hero?.upkeep || 0);
    const net = income - upkeep;
    this.grain += net;
    this.gold += Math.round(this.songCities.length * 1.6) + (this.hero?.goldBonus || 0) + eco.gold;
    if (economyActive(this)) this.economy.arms = Math.min(ARMS_CAP, this.economy.arms + eco.arms);
    this.say(`【度支】岁入 ${income}，军耗 ${upkeep}（戍守转运 ${garrison}${staffCost ? `，分路幕府 ${staffCost}` : ''}），仓廪净 ${net >= 0 ? '+' : ''}${net}；府库进钱。${sup.isolated.length ? `（孤城 ${sup.isolated.length} 处，粮道未通）` : ''}`, net >= 0 ? 'info' : 'bad');
    if (economyActive(this) && (eco.gold || eco.arms || eco.upkeepRelief || inc.farms || inc.ratio)) {
      this.say(`【治略·度支】屯田增赋 ${Math.round(inc.flat)}，市舶 +${eco.gold} 钱，作坊 +${eco.arms} 军械（存 ${this.economy.arms}），仓廪省戍粮 ${eco.upkeepRelief.toFixed(2)}${inc.ratio ? `，诸臣理政粮赋 +${Math.round(inc.ratio * 100)}%` : ''}。`, 'info');
    }
    if (this.grain <= 0) {
      const relief = economyActive(this) ? consumeGranary(this.economy) : null;
      if (relief) {
        this.grain = 12;
        this.say(`【备荒】${this.cities[relief]?.name || relief}开仓放赈，仓廪降一级，暂免一岁之饥。`, 'good');
      } else {
        this.famine++; this.morale -= 8; this.popularity -= 5;
        this.say('军中乏食，已有逃亡。', 'bad');
      }
    } else this.famine = 0;

    // 自然征募 / 士气回复
    this.songCities.forEach(c => { if (this.grain > 30 && c.troops < c.troops0 + 4 && this.nextRandom() < 0.45) c.troops += 1; });
    this.morale = clamp(this.morale + 2, 0, 100);
    // 治略：持节在外的将领每回合自然积 2 点阅历
    if (economyActive(this)) {
      for (const [hid, city] of [[this.heroId, this.heroCity], [this.viceHeroId, this.viceHeroCity]]) {
        if (hid && city && this.cities[city]?.owner === 'song') this.grantExp(hid, 2);
      }
    }

    // 粮道不通：士气渐堕，久戍逃亡；打通间道方可解
    if (sup.isolated.length) {
      this.morale -= 1;
      const bleed = this.turn % 3 === 0;
      if (bleed) sup.isolated.forEach(id => {
        const c = this.cities[id];
        if (c.troops > 2 && !artValue(this, id, 'supply')) c.troops -= 1;
      });
      this.say(`【粮道】${sup.isolated.map(id => this.cities[id].name).join('、')}孤悬，不通行在：士气 -1${bleed ? '，久戍有逃亡' : ''}。`, 'bad');
    }

    // 金军行动：前线每回合都在集结，久拖必有大举南下
    const frontier = this.jinCities.filter(c => c.links.some(id => this.cities[id].owner === 'song'));
    // 兵源有额，前线金军不会无限膨胀
    frontier.filter(c => c.troops < 15).forEach(c => { c.troops += 1; });
    // 金人秋高马肥方南牧：春、夏两季休兵，正是官家北伐的窗口
    const season = (this.turn - 1) % 4;
    if (this.truce > 0) {
      this.truce--;
      this.say('【和议】金人按兵不动，边境暂宁。', 'info');
    } else if (season < 2 && !this.scenario?.jinEveryTurn) {
      this.say('【边报】春夏天暖，金骑北还，淮上暂宁——此正用兵之时。', 'good');
    } else {
      this.jinAI();
    }
    if (this.turn % 2 === 0 && frontier.length) {
      const c = this.pick(frontier);
      if (c.troops < 18) c.troops += 3 + this.jinFury * 2;
      this.say(`【谍报】金人于${c.name}增兵，其势益盛。`, 'bad');
    }

    // 每四回合无北复之音，朝中苟安之气渐长
    const idle = this.turn - this.lastCaptureTurn;
    if (idle > 0 && idle % 4 === 0) {
      this.court.he += 4; this.court.zhan -= 2; this.popularity -= 1;
      this.say('【朝议】久无北复之音，苟安之论渐起，主和益盛。', 'bad');
    }

    // 朝局自然演变
    if (this.court.he > 72) this.say('朝中议和之声日盛，北伐之议渐寝。', 'bad');
    if (this.court.zhan > 75 && this.grain < 60) { this.morale -= 2; }
    this.clampAll();
    this.checkEnd();

    if (!this.over) {
      this.turn++;
      if (this.economy) this.economy.dispatchTurn = 0;   // 差遣额度按回合重置
      this.decree = this.calcDecree();
      this.charge = 0;
      this.clampAll();
      this.checkEnd();
      if (!this.over) this.maybeEvent();
    }
    this.changed();
  }

  jinAI() {
    const candidates = [];
    this.jinCities.forEach(c => {
      c.links.forEach(id => {
        const t = this.cities[id];
        if (t.owner !== 'song') return;
        // 旧都与燕云是金人命脉，失之必以重兵反扑；行在、建康亦为南下所图
        const prize = (t.seat ? 6 : 0) + (t.capitalOfSong ? 3 : 0)
          + (t.id === 'kaifeng' || t.id === 'yanjing' ? 5 : 0);
        const score = c.troops - t.troops * 0.6 + prize + this.rand(0, 4);
        if (c.troops >= 5) candidates.push({ c, t, score });
      });
    });
    candidates.sort((a, b) => b.score - a.score);
    // 秋冬季大举南下，随国势与积怒增兵，最多三路并进
    let attacks = Math.min(2 + (this.turn >= 16 ? 1 : 0) + (this.jinFury >= 4 ? 1 : 0), 3);
    let done = 0;
    const used = new Set();
    for (const { c, t } of candidates) {
      if (attacks <= 0) break;
      if (used.has(c.id) || c.owner !== 'jin' || t.owner !== 'song' || c.troops < 5) continue;
      const send = Math.max(3, Math.floor(c.troops * 0.70));
      // 明显寡不敌众时才继续蓄势；否则主动叩边，以消耗战磨薄江防
      if (send < t.troops * 0.45) continue;
      used.add(c.id);
      c.troops -= send;
      const res = this.battle(c, t, send, 'jin');
      this.emit('march', { from: c.id, to: t.id, owner: 'jin', result: res.win ? 'win' : 'lose' });
      attacks--; done++;
    }
    if (!done) this.say('【谍报】金军于北岸集结，尚未举兵。', 'info');
  }

  maybeEvent() {
    const sc = this.scenario;
    // 短剧本只放自己的事件，免得「秦桧归→和议→风波亭」这类长线朝局串进九回合的攻城关
    const allow = sc?.events;
    const pool = EVENTS.filter(e => {
      if (allow && !allow.includes(e.id)) return false;
      if (e.once && this.seenEvents.has(e.id)) return false;
      if (e.cond && !e.cond(this)) return false;
      return true;
    });
    if (!pool.length) return;
    // 前两回合不出事件；之后约四成概率，每 5 回合保底一次。
    // 连锁事件（priority>0）一旦条件成立便优先且不掷点，免得前后相因的剧情断线。
    if (this.turn < (sc?.eventMinTurn ?? 3)) return;
    const top = Math.max(0, ...pool.map(e => e.priority || 0));
    if (!top && this.turn % 5 !== 0 && this.nextRandom() > (sc?.eventChance ?? 0.42)) return;
    const bag = top ? pool.filter(e => (e.priority || 0) === top) : pool;
    const ev = this.pick(bag);
    this.seenEvents.add(ev.id);
    this.pendingEvent = ev;
    this.say(`【${ev.tag}】${ev.title}`, 'event');
    this.emit('event', ev);
  }

  resolveEvent(index) {
    const ev = this.pendingEvent;
    if (!ev) return;
    const opt = ev.options[index];
    if (!opt) return;
    opt.apply(this);
    // 选项留下的朝局后果：后续事件由此判断是否接续（秦桧归 → 和议 → 风波亭）
    if (opt.flag) this.flags.add(opt.flag);
    this.say(`　↳ ${opt.label}：${opt.desc}`, 'info');
    this.pendingEvent = null;
    this.clampAll();
    this.checkEnd();
    this.changed();
  }

  checkEnd() {
    const sc = this.scenario;
    if (sc) {
      const R = scenarioResult(this, sc);
      // 剧本在「回合上限 +1」结算，战报仍记在第 N 回合，不虚增一回合
      if (R) return this.finish(R.kind, R.title, R.text, Math.min(this.turn, this.maxTurns));
      return null;
    }
    const kf = this.cities.kaifeng.owner === 'song';
    const yj = this.cities.yanjing.owner === 'song';
    const rest = this.jinCities.length;
    if (rest === 0) return this.finish('win', '海内一统', '金人尽逐，诸州皆树宋帜。此局，赢得干净利落。');
    if (kf && yj && rest <= VICTORY_JIN_LIMIT) return this.finish('win', '燕云归籍，中兴有成', '东京旧都已复，燕京旗下，中原残敌亦次第廓清。自靖康以来，版籍重归一体。官家没有南下，也没有回头。');
    if (kf && yj && !this._twoCapitalsNoted) {
      this._twoCapitalsNoted = true;
      this.say(`两京虽复，金人尚据 ${rest} 州。须扫清中原残敌，方可言中兴。`, 'event');
    }
    if (this.cities.linan.owner === 'jin' || this.cities.jiankang.owner === 'jin') return this.finish('lose', '江左失守', '行在陷落，朝廷再无立足之地。南渡之局，终究没能翻过来。');
    if (this.popularity <= 0) return this.finish('lose', '民心尽失', '赋重役繁，民不聊生。未待金人渡江，江南已自生乱。');
    if (this.famine >= 3) return this.finish('lose', '仓廪告罄', '连岁乏粮，诸军自溃。北伐之师，未出淮上而先散。');
    if (this.turn > this.maxTurns) return this.finish('lose', '偏安江左', '岁月蹉跎，北伐之议终成空谈。史官落笔，仍是一段南渡旧事。');
    return null;
  }

  finish(kind, title, text, atTurn = this.turn) {
    if (this.over) return;
    this.over = { kind, title, text, turn: atTurn };
    this.say(`【结局】${title}——${text}`, kind === 'win' ? 'good' : 'bad');
    this.emit('end', this.over);
  }

  changed() {
    this.clampAll();
    // 克复两京当即刻定鼎，无须再等「结束回合」
    if (!this.over && !this.pendingEvent) this.checkEnd();
    this.emit('change', this);
  }
}

/**
 * 攻守系数的唯一真源：battle() 判定、战前预估、托管 AI 三处共用。
 * 任一侧的加成改动只在这里发生，避免「AI 算得比玩家准」的隐性不公。
 */
export function battleParams(state, from, to, side, send) {
  const atkParts = [];
  const songAtk = side === 'song';
  const songDef = side === 'jin';          // 守方为宋军
  // 治略：军械存量与在任将领阅历合成一个入口，实战／推演／托管天然同源
  const ecoBonus = economyCombatBonus(state);
  // 战法：主帅常效及于全军，分帅驻节本城再添一份本路战法
  const atkA = artStack(state, from.id);
  const defA = artStack(state, to.id);
  const sup = supplyMap(state);
  const cross = riverBetween(from, to);
  const crossF = riverSeasonFactor(state, cross);

  if (songAtk) {
    atkParts.push(['士气', state.morale / 320]);
    if (state.charge) atkParts.push(['御驾亲征', 0.25]);
    atkParts.push(['都督', state.hero?.atk || 0]);
    atkParts.push(['军械', state.gearBonus]);
    if (ecoBonus.atk) atkParts.push(['治略·器械与阅历', ecoBonus.atk]);
    atkParts.push(['朝论', (state.court.zhan - state.court.he) / 500]);
    const route = commanderAt(state, from.id);
    const stationed = route !== null;
    const viceHere = route === 'vice';
    // 主帅常效战法：主帅亲驻本城则加倍；分帅驻节时这份不加倍
    const mainTerrain = atkA.main?.terrain?.[to.terrain] || 0;
    if (mainTerrain) atkParts.push([`${atkA.main.short}·${TERRAIN_LABEL[to.terrain] || '地形'}`, mainTerrain * (!viceHere && stationed ? GEO.stationedMul : 1)]);
    const viceTerrain = atkA.vice?.terrain?.[to.terrain] || 0;
    if (viceTerrain) atkParts.push([`${atkA.vice.short}·分路${TERRAIN_LABEL[to.terrain] || ''}`, viceTerrain * GEO.stationedMul]);
    if (stationed) atkParts.push(['都督驻节', GEO.stationedAtk]);
    if (viceHere) atkParts.push(['分路督军', (state.viceHero?.atk || 0) * GEO.viceAtk]);
    // 涉水：两路舟师取强者减免，济师之利可叠加；冬季黄河冰合，双方皆易渡
    if (cross) {
      const relief = Math.max(atkA.main?.river || 0, atkA.vice?.river || 0);
      atkParts.push([`渡${cross.name}`, GEO.crossAtk * crossF * (1 - relief)]);
      const amphi = (atkA.main?.amphibious || 0) + (atkA.vice?.amphibious || 0);
      if (amphi) atkParts.push([`${atkA.vice?.short || atkA.main?.short || '舟师'}·济师`, amphi * (stationed ? GEO.stationedMul : 1)]);
    }
    // 粮道：孤军难举，连营相援
    const supplyRelief = Math.max(atkA.main?.supply || 0, atkA.vice?.supply || 0);
    if (!sup.linked.has(from.id)) atkParts.push(['孤军无继', GEO.isolatedAtk * (1 - supplyRelief)]);
    const sa = Math.min(GEO.supportMax, sup.support[from.id] || 0) * GEO.supportAtk;
    if (sa) atkParts.push(['连营犄角', sa]);
  } else {
    atkParts.push(['北骑锐气', 0.20]);
    atkParts.push(['金军积怒', 0.18 + 0.035 * state.jinFury + Math.min(0.15, state.turn * 0.006)]);
    if (state.jinMight) atkParts.push(['国势', state.jinMight]);
    if (cross) atkParts.push([`渡${cross.name}`, GEO.crossAtk * crossF]);
    const sa = Math.min(GEO.supportMax, sup.support[from.id] || 0) * GEO.supportAtk;
    if (sa) atkParts.push(['连营犄角', sa]);
  }

  // 短剧本可单独调金军锐气：九回合的守城关不该被长局那套「积怒＋国势」一击压垮
  const atkScale = songAtk ? 1 : (state.scenario?.jinAtkScale ?? 1);
  const atkBonus = Math.max(0.3, 1 + atkParts.reduce((n, p) => n + p[1], 0) * atkScale);
  const wall = (to.capitalOfJin || to.capitalOfSong || to.seat ? 0.18 : 0.08)
    + (to.id === 'kaifeng' || to.id === 'yanjing' ? 0.08 : 0);
  const terrain = TERRAIN_DEFENSE[to.terrain] || 0;
  const defParts = [['城防', wall], [`${TERRAIN_LABEL[to.terrain] || '地形'}守险`, terrain]];
  if (cross) defParts.push([`据${cross.name}`, GEO.crossDef * crossF]);
  const sd = Math.min(GEO.supportMax, sup.support[to.id] || 0) * GEO.supportDef;
  if (sd) defParts.push(['连营援应', sd]);
  if (songDef) {
    if (!sup.linked.has(to.id)) defParts.push(['孤城无援', GEO.isolatedDef]);
    if (state.stationAt(to.id)) defParts.push(['都督坐镇', GEO.stationedDef]);
    if (defA.main?.defend) defParts.push([`${defA.main.short}·守`, defA.main.defend]);
    if (defA.vice?.defend) defParts.push([`${defA.vice.short}·分路守`, defA.vice.defend]);
    if (ecoBonus.defend) defParts.push(['治略·诸臣阅历', ecoBonus.defend]);
  }
  const defBonus = Math.max(0.4, 1 + defParts.reduce((n, p) => n + p[1], 0));

  return {
    send, atkBonus, defBonus, atkParts, defParts,
    cross: cross?.name || null,
    isolated: songAtk ? !sup.linked.has(from.id) : !sup.linked.has(to.id),
    stationed: songAtk ? state.stationAt(from.id) : state.stationAt(to.id),
    atkBase: send * atkBonus,
    defBase: Math.max(1, to.troops * defBonus),
  };
}

/** 攻守各带一次均匀分布抖动，用数值积分求精确胜率；确定性、不掷点 */
export function winChance(atkBase, defBase) {
  const u0 = 0.85, u1 = 1.20, v0 = 0.90, v1 = 1.15, N = 240;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const u = u0 + (i + 0.5) * (u1 - u0) / N;
    sum += clamp((atkBase * u / Math.max(1, defBase) - v0) / (v1 - v0), 0, 1);
  }
  return sum / N;
}

/**
 * 战前推演：把 battle() 的算盘摊开给玩家看。
 * 无论当前是否可行，都会给出胜算与攻守明细；ok/reason 另表此令能否下。
 */
export function previewBattle(s, fromId, toId) {
  const from = s.cities[fromId], to = s.cities[toId];
  if (!from || !to) return { ok: false, reason: '州郡不详' };
  if (from.owner !== 'song') return { ok: false, reason: '非己方州郡' };
  if (!from.links.includes(toId)) return { ok: false, reason: '无官道相通' };

  const send = Math.max(2, Math.floor(from.troops * 0.70));
  const cost = marchCost(s, from, to, send);
  const cross = riverBetween(from, to);
  const sup = supplyMap(s);
  const r = {
    from: fromId, to: toId, send, cost, ok: false, reason: '',
    decreeCost: marchDecree(s, from, to),
    cross: cross?.name || null,
    isolated: !sup.linked.has(fromId),
    support: Math.min(GEO.supportMax, sup.support[fromId] || 0),
    stationed: s.stationAt(fromId),
  };

  if (to.owner === 'song') {
    Object.assign(r, { kind: 'move', gain: Math.floor(send * 0.6) });
  } else {
    const P = battleParams(s, from, to, 'song', send);
    const chance = winChance(P.atkBase, P.defBase);
    const gain = clamp((P.atkBase - P.defBase) / P.atkBase, 0, 1);
    Object.assign(r, {
      kind: 'attack', chance, ratio: P.atkBase / P.defBase,
      atkMin: P.atkBase * 0.85, atkMax: P.atkBase * 1.20,
      defMin: P.defBase * 0.90, defMax: P.defBase * 1.15,
      atkParts: P.atkParts, defParts: P.defParts,
      survivors: clamp(Math.round(send * (0.36 + gain * 0.34)), 2, send),
      loss: send - Math.round(send * 0.28),
      verdict: chance >= 0.80 ? '十拿九稳' : chance >= 0.60 ? '颇有胜算'
        : chance >= 0.40 ? '胜负参半' : chance >= 0.20 ? '凶多吉少' : '几无胜算',
    });
  }

  if (s.over) r.reason = '本局已终';
  else if (s.pendingEvent) r.reason = '请先裁断朝议';
  else if (send < 2 || from.troops <= 2) r.reason = '兵力过寡，不可轻动';
  else if (s.grain < cost) r.reason = `粮秣不足，需 ${cost} 粮`;
  else if (s.decree < r.decreeCost) r.reason = r.decreeCost > 1 ? `渡${r.cross}须 ${r.decreeCost} 道政令，余者不足` : '政令已尽';
  else { r.ok = true; r.reason = '可下此令'; }
  return r;
}
