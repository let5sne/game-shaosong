import {
  CITY_DEFS, HEROES, EVENTS, TERRAIN_DEFENSE, TERRAIN_LABEL, DIFFICULTIES,
  riverBetween,
} from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

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
};

/**
 * 粮道：自行在（临安）与旧都（建康）起算，只经己方州郡连通。
 * 不通者为孤城；support 记录每城相邻的同阵营州郡数（犄角连营）。
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
  const queue = ids.filter(id => cities[id].owner === 'song' && (cities[id].seat || cities[id].capitalOfSong));
  queue.forEach(id => linked.add(id));
  while (queue.length) {
    const id = queue.shift();
    for (const l of cities[id].links) {
      if (linked.has(l) || !cities[l] || cities[l].owner !== 'song') continue;
      linked.add(l);
      queue.push(l);
    }
  }
  const isolated = ids.filter(id => cities[id].owner === 'song' && !linked.has(id));
  state._supply = { linked, isolated, support };
  state._supplyKey = key;
  return state._supply;
}

/** 城池兵额：受岁赋、都督战法与粮道共同约束 */
export function troopCap(state, c) {
  const base = Math.max(12, Math.round(c.yieldGrain * 2.8));
  const withArt = Math.round(base * (1 + (state.heroArt?.cap || 0)));
  const isolated = c.owner === 'song' && !supplyMap(state).linked.has(c.id)
    && !(state.heroArt?.supply);
  return isolated ? Math.max(8, Math.round(withArt * 0.6)) : withArt;
}

/** 行军粮耗：常规 1.6／营，涉水另需舟楫。三处调用同一公式，避免账目分叉 */
export function marchCost(state, from, to, send) {
  const cross = riverBetween(from, to);
  return Math.round(send * (1.6 + (cross ? GEO.crossGrain : 0)));
}

/**
 * 渡河须另下「调舟楫、备津渡」一道政令；水师都督自备舟师，
 * 或官家亲征时御营统筹，皆可免。这让「拜谁为帅」与「何时渡淮」互相牵动。
 */
export function marchDecree(state, from, to) {
  if (!riverBetween(from, to)) return 1;
  return (state.heroArt?.river || 0) >= 0.5 || state.charge ? 1 : 2;
}

/** 冬季黄河冰合，涉水之阻与据河之利俱减；其余季节如常 */
function riverSeasonFactor(state, river) {
  const winter = (state.turn - 1) % 4 === 3;
  return winter && river?.id === 'huanghe' ? 0.4 : 1;
}

/** 可复现的开局随机数：同一个局号必得同一份变局 */
function makeRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
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

  reset(opts = {}) {
    const id = opts.difficulty ?? this.difficulty ?? 'normal';
    const D = DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
    this.difficulty = D.id;
    this.maxTurns = D.maxTurns;
    this.jinMight = D.jinMight;
    this.seed = Number.isFinite(opts.seed) ? opts.seed : (Math.floor(Math.random() * 900000) + 100000);
    this.random = opts.random !== false;

    this.cities = {};
    CITY_DEFS.forEach(d => {
      this.cities[d.id] = { ...d, links: [...d.links], troops0: d.troops, owner: d.owner, lastTrainTurn: 0 };
    });
    // 补全双向邻接
    Object.values(this.cities).forEach(c => {
      c.links.forEach(id2 => {
        const other = this.cities[id2];
        if (other && !other.links.includes(c.id)) other.links.push(c.id);
      });
    });
    // 难度先落到金军兵额上，之后变局再叠一层
    if (D.jinTroops) this.jinCities.forEach(c => { c.troops = Math.max(2, c.troops + D.jinTroops); });

    this.turn = 1;
    this.grain = D.grain;
    this.gold = D.gold;
    this.popularity = 62;
    this.morale = 58;
    this.court = { zhan: clamp(58 + D.zhanDelta, 0, 100), he: clamp(42 - D.zhanDelta, 0, 100) };
    this.heroId = null;
    this.heroCity = null;      // 都督驻节州郡
    this.heroTurn = 0;         // 上次拜将所在回合，供「阶段转折换将」节流
    this.gearBonus = 0;
    this.jinFury = D.jinFury;
    this._supplyKey = null;
    this._supply = null;
    this.charge = 0;
    this.truce = 0;
    this.famine = 0;
    this.seenEvents = new Set();
    this.lastCaptureTurn = 0;
    this.pendingEvent = null;
    this.logs = [];
    this.over = null;
    this.decree = 5 + D.decreeBonus;
    this.lastBattle = null;
    this.variant = { seed: this.seed, notes: [] };
    if (this.random) this.variant.notes = rollVariant(this, makeRng(this.seed), D.luck);

    this.say('建炎之末，行在草创。官家立于江左，北望中原。', 'event');
    const extra = this.variant.notes.length ? `｜${this.variant.notes.join('，')}` : '';
    this.say(`【开局】${D.name} · 局号 #${this.seed}${extra}`, 'event');
    this.say('目标：收复东京开封与燕京，重振版籍。', 'info');
  }

  // ── 查询 ──────────────────────────────────────────────────
  get diffDef() { return DIFFICULTIES.find(d => d.id === this.difficulty) || DIFFICULTIES[1]; }
  get hero() { return HEROES.find(h => h.id === this.heroId) || null; }
  get heroArt() { return this.hero?.art || null; }
  /** 兵额：城池岁赋为基，都督「众兵」可增，孤城粮道不通则减半 */
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
    const kf = this.cities.kaifeng.owner === 'song';
    const yj = this.cities.yanjing.owner === 'song';
    return { kaifeng: kf, yanjing: yj, text: kf ? (yj ? '燕云已归' : '旧都已复 · 进取燕京') : '收复东京开封' };
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
    let d = 4 + Math.round((this.court.zhan - this.court.he) / 40);
    if (this.popularity >= 75) d += 1;
    if (this.popularity <= 30) d -= 1;
    if (hero?.decree) d += hero.decree;
    if (this.court.he >= 80) d -= 1;
    d += this.diffDef.decreeBonus || 0;
    return clamp(d, 3, 8);
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
    const add = Math.min(3 + (this.morale >= 70 ? 1 : 0), cap - c.troops);
    this.grain -= 18; this.gold -= 12;
    c.troops += add; this.morale += 3;
    c.lastTrainTurn = this.turn;
    const iso = !supplyMap(this).linked.has(c.id);
    this.say(`【整军】${c.name}募练新军，兵力 +${add}，现 ${c.troops}／${cap} 营。${iso ? '（粮道未通，兵额减半）' : ''}`, 'good');
    this.changed(); return true;
  }

  chouliang() {
    if (!this._spend()) return false;
    const gain = 38 + (this.hero?.grainBonus || 0) + Math.round(this.popularity / 12);
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

  renming(heroId) {
    const h = HEROES.find(x => x.id === heroId);
    if (!h) return false;
    if (this.heroId === heroId) { this.say(`${h.name}已总戎事。`, 'info'); return false; }
    if (!this._spend()) return false;
    this.heroId = heroId;
    this.heroCity = null;   // 更易主帅，旧日驻节自然作废
    this.heroTurn = this.turn;
    this.court.zhan = clamp(this.court.zhan + (h.zhanDelta || 0), 0, 100);
    this.court.he = clamp(this.court.he + (h.heDelta || 0), 0, 100);
    this.morale = clamp(this.morale + (h.morale || 0) * 0.5, 0, 100);
    this.say(`【拜将】以${h.name}为都督诸军事，领「${h.art?.name || '诸军'}」。朝野议论纷然：${h.desc}`, 'event');
    this.changed(); return true;
  }

  /** 督军驻节：把都督派到某座己方州郡，本城出兵与守备俱得厚益 */
  dujun(cityId) {
    const c = this.cities[cityId];
    const h = this.hero;
    if (!h) { this.say('未拜都督，无从驻节。', 'bad'); return false; }
    if (!c || c.owner !== 'song') { this.say('须择己方州郡驻节。', 'bad'); return false; }
    if (this.heroCity === cityId) { this.say(`${h.name}已驻节${c.name}。`, 'info'); return false; }
    if (!this._spend()) return false;
    this.heroCity = cityId;
    this.morale += 2;
    this.say(`【督军】${h.name}持节驻${c.name}，领「${h.art?.name || '诸军'}」：自此出兵战法加倍，本城守备益固。`, 'event');
    this.changed(); return true;
  }

  qinzheng() {
    if (!this._spend()) return false;
    this.charge = 1; this.morale += 10; this.popularity += 3; this.court.zhan += 4;
    this.say('【御驾亲征】官家出驻建康，黄旗渡江。本回合诸军攻势 +25%，士气大振。', 'event');
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
    const atk = send * rand(0.85, 1.20) * P.atkBonus;
    const def = to.troops * rand(0.90, 1.15) * P.defBonus;
    const win = atk > def;

    let detail = '';
    if (win) {
      const survivors = clamp(Math.round(send * (0.36 + clamp((atk - def) / atk, 0, 1) * 0.34)), 2, send);
      to.owner = side;
      to.troops = survivors;
      detail = `克${to.name}，存 ${survivors} 营，须再整军。`;
      if (side === 'jin' && this.heroCity === to.id) {
        this.heroCity = null;
        this.say(`【督军】${to.name}陷落，都督退守，驻节之命遂废。`, 'bad');
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
    this.lastBattle = { from: from.id, to: to.id, side, win, atk, def };
    return { win, atk, def };
  }

  // ── 回合推进 ──────────────────────────────────────────────
  endTurn() {
    if (this.over || this.pendingEvent) return;
    this.say(`── ${this.yearName} · 第 ${this.turn} 回合终 ──`, 'divider');

    // 驻节城若已易主，都督还朝
    if (this.heroCity && this.cities[this.heroCity]?.owner !== 'song') {
      this.say(`【督军】${this.cities[this.heroCity].name}已非我有，都督还朝，驻节之命遂废。`, 'bad');
      this.heroCity = null;
    }

    // 财政 / 粮秣：孤城岁赋折半，「漕运」可免此弊
    const sup = supplyMap(this);
    const art = this.heroArt;
    const relieved = !!art?.supply;
    const yieldSum = this.songCities.reduce(
      (n, c) => n + c.yieldGrain * (sup.linked.has(c.id) || relieved ? 1 : 0.4), 0,
    );
    const income = Math.round(yieldSum * (0.55 + this.popularity / 190) * (1 + (art?.income || 0)));
    const upkeep = Math.round(this.totalTroops * 0.32) + (this.hero?.upkeep || 0);
    const net = income - upkeep;
    this.grain += net;
    this.gold += Math.round(this.songCities.length * 1.6) + (this.hero?.goldBonus || 0);
    this.say(`【度支】岁入 ${income}，军耗 ${upkeep}，仓廪净 ${net >= 0 ? '+' : ''}${net}；府库进钱。${sup.isolated.length ? `（孤城 ${sup.isolated.length} 处，粮道未通）` : ''}`, net >= 0 ? 'info' : 'bad');
    if (this.grain <= 0) { this.famine++; this.morale -= 8; this.popularity -= 5; this.say('军中乏食，已有逃亡。', 'bad'); }
    else this.famine = 0;

    // 自然征募 / 士气回复
    this.songCities.forEach(c => { if (this.grain > 30 && c.troops < c.troops0 + 4 && Math.random() < 0.45) c.troops += 1; });
    this.morale = clamp(this.morale + 2, 0, 100);

    // 粮道不通：士气渐堕，久戍逃亡；打通间道方可解
    if (sup.isolated.length) {
      this.morale -= 1;
      const bleed = !relieved && this.turn % 3 === 0;
      if (bleed) sup.isolated.forEach(id => {
        const c = this.cities[id];
        if (c.troops > 2) c.troops -= 1;
      });
      this.say(`【粮道】${sup.isolated.map(id => this.cities[id].name).join('、')}孤悬，不通行在：士气 -1${bleed ? '，久戍有逃亡' : ''}。`, 'bad');
    }

    // 金军行动：前线每回合都在集结，久拖必有大举南下
    const frontier = this.jinCities.filter(c => c.links.some(id => this.cities[id].owner === 'song'));
    // 兵源有额，前线金军不会无限膨胀
    frontier.filter(c => c.troops < 12).forEach(c => { c.troops += 1; });
    // 金人秋高马肥方南牧：春、夏两季休兵，正是官家北伐的窗口
    const season = (this.turn - 1) % 4;
    if (this.truce > 0) {
      this.truce--;
      this.say('【和议】金人按兵不动，边境暂宁。', 'info');
    } else if (season < 2) {
      this.say('【边报】春夏天暖，金骑北还，淮上暂宁——此正用兵之时。', 'good');
    } else {
      this.jinAI();
    }
    if (this.turn % 2 === 0 && frontier.length) {
      const c = pick(frontier);
      if (c.troops < 14) c.troops += 2 + this.jinFury;
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
        const score = c.troops - t.troops * 0.6 + (t.seat ? 6 : 0) + (t.capitalOfSong ? 3 : 0) + rand(0, 4);
        if (c.troops >= 5) candidates.push({ c, t, score });
      });
    });
    candidates.sort((a, b) => b.score - a.score);
    let attacks = Math.min(1 + (this.turn >= 20 ? 1 : 0) + (this.jinFury >= 4 ? 1 : 0), 2);
    let done = 0;
    const used = new Set();
    for (const { c, t } of candidates) {
      if (attacks <= 0) break;
      if (used.has(c.id) || c.owner !== 'jin' || t.owner !== 'song' || c.troops < 5) continue;
      const send = Math.max(3, Math.floor(c.troops * 0.70));
      // 明显寡不敌众时才继续蓄势；否则主动叩边，以消耗战磨薄江防
      if (send < t.troops * 0.55) continue;
      used.add(c.id);
      c.troops -= send;
      const res = this.battle(c, t, send, 'jin');
      this.emit('march', { from: c.id, to: t.id, owner: 'jin', result: res.win ? 'win' : 'lose' });
      attacks--; done++;
    }
    if (!done) this.say('【谍报】金军于北岸集结，尚未举兵。', 'info');
  }

  maybeEvent() {
    const pool = EVENTS.filter(e => {
      if (e.once && this.seenEvents.has(e.id)) return false;
      if (e.cond && !e.cond(this)) return false;
      return true;
    });
    if (!pool.length) return;
    // 前两回合不出事件，之后约四成概率；每 5 回合保底一次
    if (this.turn < 3) return;
    if (this.turn % 5 !== 0 && Math.random() > 0.42) return;
    const ev = pick(pool);
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
    this.say(`　↳ ${opt.label}：${opt.desc}`, 'info');
    this.pendingEvent = null;
    this.clampAll();
    this.checkEnd();
    this.changed();
  }

  checkEnd() {
    const kf = this.cities.kaifeng.owner === 'song';
    const yj = this.cities.yanjing.owner === 'song';
    if (kf && yj) return this.finish('win', '燕云归籍，中兴有成', '东京旧都已复，燕京旗下。自靖康以来，中原版籍重归一体。官家没有南下，也没有回头。');
    if (this.jinCities.length === 0) return this.finish('win', '海内一统', '金人尽逐，诸州皆树宋帜。此局，赢得干净利落。');
    if (this.cities.linan.owner === 'jin' || this.cities.jiankang.owner === 'jin') return this.finish('lose', '江左失守', '行在陷落，朝廷再无立足之地。南渡之局，终究没能翻过来。');
    if (this.popularity <= 0) return this.finish('lose', '民心尽失', '赋重役繁，民不聊生。未待金人渡江，江南已自生乱。');
    if (this.famine >= 3) return this.finish('lose', '仓廪告罄', '连岁乏粮，诸军自溃。北伐之师，未出淮上而先散。');
    if (this.turn > this.maxTurns) return this.finish('lose', '偏安江左', '岁月蹉跎，北伐之议终成空谈。史官落笔，仍是一段南渡旧事。');
    return null;
  }

  finish(kind, title, text) {
    if (this.over) return;
    this.over = { kind, title, text, turn: this.turn };
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
  const art = state.heroArt;
  const sup = supplyMap(state);
  const cross = riverBetween(from, to);
  const crossF = riverSeasonFactor(state, cross);

  if (songAtk) {
    atkParts.push(['士气', state.morale / 320]);
    if (state.charge) atkParts.push(['御驾亲征', 0.25]);
    atkParts.push(['都督', state.hero?.atk || 0]);
    atkParts.push(['军械', state.gearBonus]);
    atkParts.push(['朝论', (state.court.zhan - state.court.he) / 500]);
    // 战法：按目标地形而变；都督驻节本城则加成加倍
    const stationed = state.heroCity === from.id;
    const tAtk = art?.terrain?.[to.terrain] || 0;
    if (tAtk) atkParts.push([`${art.short}·${TERRAIN_LABEL[to.terrain] || '地形'}`, tAtk * (stationed ? GEO.stationedMul : 1)]);
    if (stationed) atkParts.push(['都督驻节', GEO.stationedAtk]);
    // 涉水：水师可减免、且以舟师掩护济河；冬季黄河冰合，双方皆易渡
    if (cross) {
      atkParts.push([`渡${cross.name}`, GEO.crossAtk * crossF * (1 - (art?.river || 0))]);
      if (art?.amphibious) atkParts.push([`${art.short}·济师`, art.amphibious * (stationed ? GEO.stationedMul : 1)]);
    }
    // 粮道：孤军难举，连营相援
    if (!sup.linked.has(from.id)) atkParts.push(['孤军无继', GEO.isolatedAtk * (1 - (art?.supply || 0))]);
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

  const atkBonus = Math.max(0.3, 1 + atkParts.reduce((n, p) => n + p[1], 0));
  const wall = (to.capitalOfJin || to.capitalOfSong || to.seat ? 0.18 : 0.08)
    + (to.id === 'kaifeng' || to.id === 'yanjing' ? 0.08 : 0);
  const terrain = TERRAIN_DEFENSE[to.terrain] || 0;
  const defParts = [['城防', wall], [`${TERRAIN_LABEL[to.terrain] || '地形'}守险`, terrain]];
  if (cross) defParts.push([`据${cross.name}`, GEO.crossDef * crossF]);
  const sd = Math.min(GEO.supportMax, sup.support[to.id] || 0) * GEO.supportDef;
  if (sd) defParts.push(['连营援应', sd]);
  if (songDef) {
    if (!sup.linked.has(to.id)) defParts.push(['孤城无援', GEO.isolatedDef]);
    if (state.heroCity === to.id) defParts.push(['都督坐镇', GEO.stationedDef]);
    if (art?.defend) defParts.push([`${art.short}·守`, art.defend]);
  }
  const defBonus = Math.max(0.4, 1 + defParts.reduce((n, p) => n + p[1], 0));

  return {
    send, atkBonus, defBonus, atkParts, defParts,
    cross: cross?.name || null,
    isolated: songAtk ? !sup.linked.has(from.id) : !sup.linked.has(to.id),
    stationed: songAtk ? state.heroCity === from.id : state.heroCity === to.id,
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
    stationed: s.heroCity === fromId,
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
