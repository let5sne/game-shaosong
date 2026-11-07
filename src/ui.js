import { HEROES, TERRAIN_LABEL, MAX_TURNS } from './data.js';
import {
  chooseAction, applyAction, chooseEvent, newTurnContext, phaseOf,
} from './autoplay.js';

const TEMPLATE = `
<div class="hud">
  <header class="topbar">
    <div class="brand">
      <div class="seal">紹<br>宋</div>
      <div class="brand-txt"><h1>紹宋</h1><span>建炎北伐 · 三维舆图</span></div>
    </div>
    <div class="era" id="eraText"></div>
    <div class="stats" id="topStats"></div>
    <div class="top-tools">
      <button class="tool" data-act="help" title="玩法说明">？</button>
      <button class="tool" data-act="mute" id="muteBtn" title="音效开关">♪</button>
      <button class="tool" data-act="reset-cam" title="复位视角">⌖</button>
      <button class="tool" data-act="auto" id="autoBtn" title="托管推演 · 自动北伐（A）">▶</button>
      <button class="tool" data-act="restart" title="重开一局">↻</button>
    </div>
  </header>

  <aside class="panel panel-left" id="leftPanel"></aside>
  <aside class="panel panel-right" id="rightPanel"></aside>

  <section class="logbox" id="logBox"></section>

  <div class="legend">
    <span><i class="dot song"></i>宋 · 行在版籍</span>
    <span><i class="dot jin"></i>金 · 伪据州郡</span>
    <span class="legend-tip">拖拽旋转 · 滚轮缩放 · 点选州郡</span>
  </div>

  <div class="mode-hint" id="modeHint" hidden></div>
  <div class="toast-wrap" id="toastWrap"></div>

  <div class="auto-hud" id="autoHud" hidden>
    <div class="auto-line">
      <span class="auto-badge">托管推演</span>
      <span class="auto-phase" id="autoPhase">固淮北</span>
      <span class="auto-round" id="autoRound"></span>
    </div>
    <div class="auto-decision" id="autoDecision">整军待发……</div>
    <div class="auto-foot">
      <div class="auto-bar"><i id="autoBar"></i></div>
      <span class="auto-progress" id="autoProgress"></span>
      <button data-act="auto-pause" id="autoPause">暂停</button>
      <button data-act="auto-speed" id="autoSpeed">×3</button>
      <button data-act="auto-restart" id="autoRestart" hidden>再推一局</button>
      <button data-act="auto-stop" id="autoStop">停止</button>
    </div>
  </div>
</div>

<div class="scrim intro" id="intro">
  <div class="intro-inner">
    <div class="intro-deco">◇ 靖 康 之 后 · 建 炎 北 伐 ◇</div>
    <div class="intro-title">紹<span>宋</span></div>
    <div class="intro-sub">江左一隅，北望中原</div>
    <p class="intro-desc">行在初定，诸军未集，朝堂上主战主和各执一词。<br>你是南渡的官家：整军、筹粮、平朝议、复旧都——<br>在金人再度南下之前，把版籍一寸一寸收回来。</p>
    <div class="intro-points">
      <div><b>三维舆图</b><span>州郡、江河、山险尽在掌中</span></div>
      <div><b>回合军政</b><span>每回合数道政令，用兵先算粮</span></div>
      <div><b>朝局人心</b><span>主战主和消长，牵动国运</span></div>
    </div>
    <div class="intro-actions">
      <button class="btn-primary big" data-act="start">进位临朝 <em>→</em></button>
      <button class="btn-ghost" data-act="auto-start">⟡ 托管推演 · 自动北伐直至胜利</button>
    </div>
    <div class="intro-foot">灵感取自《绍宋》架空历史设定 · 文案与数值为原创 · 非官方作品</div>
  </div>
</div>

<div class="scrim modal" id="eventModal" hidden><div id="eventBody"></div></div>
<div class="scrim modal" id="endModal" hidden><div id="endBody"></div></div>
<div class="scrim modal" id="helpModal" hidden>
  <div class="help-card">
    <div class="card-eyebrow">御前条陈</div>
    <h2>玩法略要</h2>
    <div class="help-grid">
      <section><h3>一、大局</h3><p>靖康之后，宋据江左，金占中原。你每回合有若干<b>政令</b>，用于整军、筹粮、进军、拜将等。点「结束回合」后，度支结算、金军行动、随机事件依次发生。</p></section>
      <section><h3>二、用兵</h3><p>先点选一座己方州郡，再按「进军」，然后点选<b>相邻</b>州郡（地图上有官道相连）。攻金城即攻城战，攻己城为移防。每城每回合只可整军一次，且受<b>兵额</b>所限；克城后损兵甚重，须就地休整。胜负由兵力、士气、地形、都督与御驾亲征共同决定。</p></section>
      <section><h3>三、朝局</h3><p>主战威望高则政令多、军心盛；主和过盛则北伐之议渐寝。任命都督会明显改变朝局。民心决定粮赋，士气决定攻势，粮尽则军自溃。</p></section>
      <section><h3>四、胜败</h3><p><b>胜</b>：收复东京开封与燕京（或尽逐金人）。<b>败</b>：临安／建康失守、民心归零、连岁乏粮，或 ${MAX_TURNS} 回合内未竟全功。</p></section>
      <section><h3>五、操作</h3><p>拖拽旋转舆图、滚轮缩放、右键平移、点选州郡。<kbd>空格</kbd>结束回合，<kbd>Esc</kbd>取消进军，<kbd>H</kbd>打开本页，<kbd>R</kbd>复位视角，<kbd>A</kbd>开关托管推演。</p></section>
      <section><h3>六、节律</h3><p>金骑只在<b>秋、冬</b>南牧，春夏淮上暂宁，正是整军北伐的窗口。先取徐州、蔡州等外围，再图开封；「御驾亲征」叠加都督加成可破坚城。久不北伐则主和日盛——偏安拖不出中兴。</p></section>
      <section><h3>七、托管推演</h3><p>开场页按「托管推演」，或局中按顶栏 <b>▶</b>／<kbd>A</kbd>，便由 AI 代为临朝，逐回合决策，直至克复两京。托管守<b>三段战略</b>：固淮北 → 复旧都 → 取燕云；每回合至多两度进军、两处整军。可暂停、切换 ×1／×3／×8 倍速、随时停止接手。若一局失利会自动重整山河再北伐。</p></section>
      <section><h3>八、推演公允</h3><p>托管与官家用的是<b>同一套规则、同一份粮账、同一个随机数</b>，没有隐藏兵力或暗改判定；它只是把攻守之势算得更准、更不肯冒险。托管中的战报、事件裁断与三维行军，与你亲手所下之令并无二致。</p></section>
    </div>
    <button class="btn-primary" data-act="close-help">领旨</button>
  </div>
</div>
`;

// ── 轻音效 ──────────────────────────────────────────────────
let audioCtx = null;
let muted = false;
function sfx(kind) {
  if (muted) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const tone = (freq, dur, type, vol, delay = 0) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, now + delay);
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(vol, now + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + delay); o.stop(now + delay + dur + 0.02);
    };
    if (kind === 'click') tone(196, 0.09, 'triangle', 0.055);
    if (kind === 'war') { tone(88, 0.30, 'sawtooth', 0.07); tone(132, 0.22, 'triangle', 0.04, 0.04); }
    if (kind === 'event') { tone(523, 0.55, 'sine', 0.05); tone(784, 0.65, 'sine', 0.035, 0.10); }
    if (kind === 'win') { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.7, 'sine', 0.05, i * 0.14)); }
    if (kind === 'lose') { tone(196, 0.8, 'sine', 0.05); tone(146, 1.0, 'sine', 0.04, 0.18); }
  } catch (_) { /* 浏览器禁用音频时静默 */ }
}

const $ = (root, sel) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

export function createUI(root, state) {
  root.innerHTML = TEMPLATE;
  const el = {
    era: $(root, '#eraText'), stats: $(root, '#topStats'),
    left: $(root, '#leftPanel'), right: $(root, '#rightPanel'),
    log: $(root, '#logBox'), hint: $(root, '#modeHint'),
    toastWrap: $(root, '#toastWrap'), intro: $(root, '#intro'),
    eventModal: $(root, '#eventModal'), eventBody: $(root, '#eventBody'),
    endModal: $(root, '#endModal'), endBody: $(root, '#endBody'),
    helpModal: $(root, '#helpModal'), muteBtn: $(root, '#muteBtn'),
    autoBtn: $(root, '#autoBtn'), autoHud: $(root, '#autoHud'),
    autoPhase: $(root, '#autoPhase'), autoRound: $(root, '#autoRound'),
    autoDecision: $(root, '#autoDecision'), autoBar: $(root, '#autoBar'),
    autoProgress: $(root, '#autoProgress'), autoPause: $(root, '#autoPause'),
    autoSpeed: $(root, '#autoSpeed'), autoRestart: $(root, '#autoRestart'),
    autoStop: $(root, '#autoStop'),
  };

  let world = null;
  let selected = null;
  let marchFrom = null;
  let logCollapsed = false;

  // 托管推演状态
  const auto = {
    running: false, paused: false, speed: 3, game: 1,
    actions: 0, stepsInTurn: 0, ctx: null, decision: '', token: 0,
  };
  const MAX_AUTO_GAMES = 8;
  const SPEEDS = [1, 3, 8];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function attachWorld(w) { world = w; render(); }

  function toast(msg, type = 'info') {
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.innerHTML = msg;
    el.toastWrap.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 350); }, 2300);
  }

  // ── 渲染 ──────────────────────────────────────────────────
  function stat(label, value, unit, cls = '') {
    return `<div class="stat ${cls}"><span>${label}</span><b>${value}</b><small>${unit || ''}</small></div>`;
  }
  function bar(label, v, color) {
    return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i></div><b>${Math.round(v)}</b></div>`;
  }

  function render() {
    const s = state;
    el.era.innerHTML = `<span class="era-main">${esc(s.yearName)}</span><span class="era-sub">第 ${s.turn} / ${MAX_TURNS} 回合</span>`;
    el.stats.innerHTML =
      stat('粮秣', s.grain, '万石', s.grain < 40 ? 'warn' : '') +
      stat('缗钱', s.gold, '万贯') +
      stat('民心', s.popularity, '', s.popularity < 35 ? 'warn' : '') +
      stat('士气', s.morale, '', s.morale < 40 ? 'warn' : '') +
      `<div class="stat decree"><span>政令</span><b>${s.decree}</b><small>道</small></div>`;

    const songN = s.songCities.length, jinN = s.jinCities.length;
    const obj = s.objective;
    const hero = s.hero;
    el.left.innerHTML = `
      <section class="card objective">
        <div class="card-eyebrow">北伐大计</div>
        <h2>${esc(obj.text)}</h2>
        <div class="goal-row">
          <div class="goal ${obj.kaifeng ? 'done' : ''}"><i>${obj.kaifeng ? '✓' : '○'}</i>东京开封</div>
          <div class="goal ${obj.yanjing ? 'done' : ''}"><i>${obj.yanjing ? '✓' : '○'}</i>燕京</div>
        </div>
        ${bar('版籍', songN / (songN + jinN) * 100, '#b5483a')}
        <div class="mini-row"><span>宋 ${songN} 州 · ${s.totalTroops} 营</span><span>金 ${jinN} 州 · ${s.jinTroops} 营</span></div>
      </section>

      <section class="card court">
        <div class="card-eyebrow">朝局 · 主战与主和</div>
        ${bar('主战', s.court.zhan, '#b5483a')}
        ${bar('主和', s.court.he, '#3d4b60')}
        <p class="card-note">朝论所向，决于政令多寡与军心。主和过盛，北伐之议将寝。</p>
        ${s.truce ? `<div class="flag-note">和议未废 · 尚余 ${s.truce} 回合</div>` : ''}
        ${s.charge ? `<div class="flag-note hot">御驾亲征 · 本回合攻势 +25%</div>` : ''}
      </section>

      <section class="card heroes">
        <div class="card-eyebrow">都督诸军事</div>
        <div class="hero-current">${hero ? `<b>${hero.name}</b><span>${hero.title} · 攻势 ${hero.atk >= 0 ? '+' : ''}${Math.round(hero.atk * 100)}%</span>` : '<b>阙员</b><span>未拜都督，诸军不相统属</span>'}</div>
        <div class="hero-list">
          ${HEROES.map(h => `
            <button class="hero-item ${s.heroId === h.id ? 'active' : ''}" data-act="hero" data-id="${h.id}" title="${esc(h.desc)}">
              <span class="hero-name">${h.name}</span>
              <span class="hero-tag ${h.faction === '主和' ? 'he' : h.faction === '主战' ? 'zhan' : ''}">${h.faction}</span>
              <span class="hero-meta">统 ${h.martial}</span>
            </button>`).join('')}
        </div>
        <p class="card-note">任命耗政令 1 道，并牵动朝局。</p>
      </section>
    `;

    const c = selected ? s.cities[selected] : null;
    const can = {
      zhengjun: c && c.owner === 'song' && s.decree >= 1 && s.grain >= 18 && s.gold >= 12
        && c.lastTrainTurn !== s.turn && c.troops < Math.max(12, Math.round(c.yieldGrain * 2.8)),
      march: c && c.owner === 'song' && s.decree >= 1 && s.grain >= 12,
      chouliang: s.decree >= 1,
      anfu: s.decree >= 1 && s.grain >= 15,
      qinzheng: s.decree >= 1 && !s.charge,
      heyi: s.decree >= 1 && s.gold >= 55,
    };
    const btn = (cmd, label, desc, ok) => `<button class="cmd ${ok ? '' : 'off'}" data-act="cmd" data-cmd="${cmd}" ${ok ? '' : 'disabled'}><b>${label}</b><span>${desc}</span></button>`;

    el.right.innerHTML = `
      <section class="card city-card">
        <div class="card-eyebrow">州郡舆情</div>
        ${c ? `
          <div class="city-head"><h2>${esc(c.name)}</h2><span class="owner ${c.owner}">${c.owner === 'song' ? '宋' : '金'}</span></div>
          <div class="city-tags"><span>${TERRAIN_LABEL[c.terrain]}</span><span>守险 +${Math.round(({ plain: 0, mountain: 0.35, river: 0.2, coast: 0.1 }[c.terrain]) * 100)}%</span><span>兵额 ${Math.max(12, Math.round(c.yieldGrain * 2.8))}</span>${c.seat ? '<span class="gold">行在</span>' : ''}${c.capitalOfJin ? '<span class="gold">旧都</span>' : ''}</div>
          <div class="city-stats">
            <div><span>驻军</span><b>${c.troops} 营</b></div>
            <div><span>岁赋</span><b>${c.yieldGrain} 粮</b></div>
          </div>
          <div class="link-label">官道所通</div>
          <div class="link-list">${c.links.map(id => {
            const n = s.cities[id];
            return `<button class="link-chip ${n.owner}" data-act="pick" data-id="${id}">${esc(n.name)} <i>${n.troops}</i></button>`;
          }).join('')}</div>
        ` : `
          <div class="empty-city">
            <div class="empty-seal">舆</div>
            <p>点选舆图上的州郡，<br>或自下方城池索引择一。</p>
          </div>
          <div class="link-list">${['linan', 'jiankang', 'chuzhou', 'shouchun', 'kaifeng', 'yanjing'].map(id =>
            `<button class="link-chip ${s.cities[id].owner}" data-act="pick" data-id="${id}">${esc(s.cities[id].name)}</button>`).join('')}</div>
        `}
        <div class="jump-row">
          <span>州郡索引</span>
          <select id="cityJump" aria-label="州郡索引">
            <option value="">择州郡…</option>
            <optgroup label="宋 · 行在版籍">${s.songCities.map(c2 => `<option value="${c2.id}">${esc(c2.name)} · ${c2.troops} 营</option>`).join('')}</optgroup>
            <optgroup label="金 · 伪据州郡">${s.jinCities.map(c2 => `<option value="${c2.id}">${esc(c2.name)} · ${c2.troops} 营</option>`).join('')}</optgroup>
          </select>
        </div>
      </section>

      <section class="card commands">
        <div class="card-eyebrow">军政指令 <span class="decree-pip">余 ${s.decree} 道</span></div>
        <div class="cmd-grid">
          ${btn('zhengjun', '整军', '18 粮 · 12 钱 · +3 营', can.zhengjun)}
          ${btn('march', '进军', c && c.owner === 'song' ? '点选相邻州郡' : '先择己方州郡', can.march)}
          ${btn('chouliang', '筹粮', '+40 粮 · 民心 -4', can.chouliang)}
          ${btn('anfu', '安抚', '15 粮 · 民心 +9', can.anfu)}
          ${btn('qinzheng', '御驾亲征', '本回合攻势 +25%', can.qinzheng)}
          ${btn('heyi', '遣使和议', '55 钱 · 缓兵两回合', can.heyi)}
        </div>
      </section>

      <button class="end-turn" data-act="end-turn"><span>结束回合</span><em>空格 →</em></button>
    `;

    el.log.classList.toggle('collapsed', logCollapsed);
    el.log.innerHTML = `
      <div class="log-head"><span>起居注 · 军报</span><i data-act="toggle-log" title="展开／收起">${logCollapsed ? '展开 ▴' : `收起 ▾ · ${s.logs.length} 条`}</i></div>
      <div class="log-list">${s.logs.slice(0, 40).map(l => `
        <div class="log-item ${l.type}"><span class="log-turn">${esc(l.tag.split(' · ')[0])}</span><p>${esc(l.text)}</p></div>`).join('')}
      </div>`;

    if (marchFrom) {
      el.hint.hidden = false;
      el.hint.innerHTML = `<span class="pulse"></span>进军：自 <b>${esc(s.cities[marchFrom].name)}</b> 点选相邻州郡（金色光环）<button data-act="cancel-march">取消 · Esc</button>`;
    } else {
      el.hint.hidden = true;
      el.hint.innerHTML = '';
    }

    world?.setSelection(selected, marchFrom ? s.cities[marchFrom].links : []);
    world?.update(s);
    updateAutoHud();
  }

  // ── 托管推演 ──────────────────────────────────────────────
  function updateAutoHud() {
    if (!el.autoHud) return;
    const total = Object.keys(state.cities).length;
    el.autoPhase.textContent = phaseOf(state);
    el.autoRound.textContent = `第 ${auto.game} 局 · ${state.yearName} · 第 ${state.turn}/${MAX_TURNS} 回合`;
    el.autoDecision.textContent = auto.decision || '整军待发……';
    el.autoBar.style.width = `${Math.round(state.songCities.length / total * 100)}%`;
    el.autoProgress.textContent = `版籍 ${state.songCities.length}/${total} · 已下 ${auto.actions} 令`;
    el.autoHud.classList.toggle('paused', auto.paused);
    const done = !auto.running && !!state.over;
    el.autoPause.hidden = done;
    el.autoSpeed.hidden = done;
    el.autoRestart.hidden = !(state.over?.kind === 'win');
    el.autoStop.textContent = done ? '收起' : '停止';
  }

  function setAutoDecision(text) {
    auto.decision = text;
    el.autoDecision.textContent = text;
  }

  async function autoDelay(token, factor = 1) {
    let elapsed = 0;
    const want = (400 * factor) / auto.speed;
    while (elapsed < want && auto.running && auto.token === token) {
      await sleep(40);
      if (!auto.paused) elapsed += 40;
    }
  }

  async function autoLoop() {
    const token = auto.token;
    const alive = () => auto.running && auto.token === token;
    while (alive()) {
      // 结局：胜则收兵，败则重整山河再北伐，直到克复两京
      if (state.over) {
        if (state.over.kind === 'win') {
          setAutoDecision(`✔ ${state.over.title} · 第 ${auto.game} 局 / 第 ${state.over.turn} 回合，共下 ${auto.actions} 道政令`);
          updateAutoHud();
          stopAuto(true);
          return;
        }
        if (auto.game >= MAX_AUTO_GAMES) {
          setAutoDecision(`已推演 ${MAX_AUTO_GAMES} 局仍未竟全功，请官家亲自临朝。`);
          updateAutoHud();
          stopAuto(true);
          return;
        }
        setAutoDecision(`此局「${state.over.title}」，重整山河，再举北伐……`);
        updateAutoHud();
        await autoDelay(token, 3);
        if (!alive()) return;
        auto.game++;
        restart(true);
        auto.ctx = null;
        auto.stepsInTurn = 0;
        continue;
      }

      // 事件由托管裁断，不弹窗打断推演
      if (state.pendingEvent) {
        const ev = state.pendingEvent;
        const i = chooseEvent(state);
        setAutoDecision(`裁断「${ev.title}」→ ${ev.options[i].label}`);
        updateAutoHud();
        await autoDelay(token, 0.8);
        if (!alive()) return;
        el.eventModal.hidden = true;
        state.resolveEvent(i);
        continue;
      }

      if (!auto.ctx || auto.ctx.turn !== state.turn) auto.ctx = newTurnContext(state);
      const a = auto.stepsInTurn < 14 ? chooseAction(state, auto.ctx) : null;

      if (a && state.decree > 0) {
        setAutoDecision(a.desc);
        updateAutoHud();
        await autoDelay(token, 1);
        if (!alive()) return;
        const ok = applyAction(state, a, auto.ctx);
        auto.actions++;
        auto.stepsInTurn++;
        if (ok && a.type === 'jinjun' && a.attack) world?.focusCity(a.to);
        if (!ok) { state.endTurn(); auto.ctx = null; auto.stepsInTurn = 0; }
        continue;
      }

      setAutoDecision('政令已尽 · 结束回合，候度支与边报');
      updateAutoHud();
      await autoDelay(token, 1.2);
      if (!alive()) return;
      state.endTurn();
      auto.ctx = null;
      auto.stepsInTurn = 0;
    }
  }

  function startAuto() {
    if (auto.running) return;
    el.intro.hidden = true;
    el.intro.classList.add('gone');
    el.helpModal.hidden = true;
    if (state.over) restart(true);
    auto.running = true;
    auto.paused = false;
    auto.speed = 3;
    auto.game = 1;
    auto.actions = 0;
    auto.stepsInTurn = 0;
    auto.ctx = null;
    auto.decision = '临朝受命，首拜都督诸军事……';
    auto.token++;
    el.autoHud.hidden = false;
    el.autoHud.classList.remove('paused');
    el.autoBtn.textContent = '■';
    el.autoBtn.classList.add('on');
    el.autoPause.textContent = '暂停';
    el.autoSpeed.textContent = `×${auto.speed}`;
    marchFrom = null;
    updateAutoHud();
    sfx('event');
    toast('托管推演开始 · 固淮北 → 复旧都 → 取燕云，直至克复两京。');
    autoLoop();
  }

  function stopAuto(keepHud = false) {
    auto.running = false;
    auto.paused = false;
    auto.token++;
    el.autoBtn.textContent = '▶';
    el.autoBtn.classList.remove('on');
    el.autoPause.textContent = '暂停';
    el.autoHud.classList.remove('paused');
    if (!keepHud) el.autoHud.hidden = true;
    updateAutoHud();
    render();
  }

  function toggleAuto() {
    if (auto.running) { stopAuto(); toast('托管已停止，官家可亲自临朝。'); }
    else startAuto();
  }

  // ── 交互 ──────────────────────────────────────────────────
  function selectCity(id, focus = false) {
    selected = id;
    if (focus) world?.focusCity(id);
    render();
  }

  function handlePick(id) {
    if (auto.running) return;   // 托管期间舆图只读，避免与推演争令
    if (state.over || state.pendingEvent || el.intro.hidden === false) return;
    if (marchFrom) {
      const from = state.cities[marchFrom];
      if (id === marchFrom) { cancelMarch(); return; }
      if (from.links.includes(id)) {
        const target = id;
        marchFrom = null;
        sfx('war');
        state.jinjun(from.id, target);
        selectCity(target, true);
        return;
      }
      toast('两州无官道相通，不能进军。', 'bad');
      marchFrom = null;
    }
    selectCity(id);
    sfx('click');
  }

  function cancelMarch() {
    marchFrom = null;
    render();
  }

  function runCmd(cmd) {
    if (auto.running || state.over || state.pendingEvent) return;
    const before = state.logs[0];
    let ok = false;
    switch (cmd) {
      case 'zhengjun': ok = !!selected && state.zhengjun(selected); break;
      case 'chouliang': ok = state.chouliang(); break;
      case 'anfu': ok = state.anfu(); break;
      case 'qinzheng': ok = state.qinzheng(); break;
      case 'heyi': ok = state.heyi(); break;
      case 'march':
        if (!selected || state.cities[selected].owner !== 'song') { toast('先点选一座己方州郡。', 'bad'); break; }
        if (state.decree < 1) { toast('政令已尽。', 'bad'); break; }
        marchFrom = selected;
        toast('请点选相邻州郡，金环者为可达。');
        sfx('click');
        render();
        return;
    }
    if (ok) { sfx('click'); render(); }
    else {
      const last = state.logs[0];
      toast(last && last !== before ? esc(last.text) : '此事暂不可行，或政令、粮饷不足。', 'bad');
      render();
    }
  }

  root.addEventListener('change', e => {
    if (auto.running || e.target.id !== 'cityJump' || !e.target.value) return;
    const id = e.target.value;
    handlePick(id);
    world?.focusCity(id);
  });

  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    // 托管控制始终可用
    if (act === 'auto' || act === 'auto-start') { toggleAuto(); return; }
    if (act === 'auto-pause') {
      auto.paused = !auto.paused;
      el.autoPause.textContent = auto.paused ? '继续' : '暂停';
      el.autoHud.classList.toggle('paused', auto.paused);
      sfx('click');
      return;
    }
    if (act === 'auto-speed') {
      auto.speed = SPEEDS[(SPEEDS.indexOf(auto.speed) + 1) % SPEEDS.length];
      el.autoSpeed.textContent = `×${auto.speed}`;
      sfx('click');
      return;
    }
    if (act === 'auto-stop') { stopAuto(); toast('托管已停止，官家可亲自临朝。'); sfx('click'); return; }
    if (act === 'auto-restart') { stopAuto(); startAuto(); return; }

    const passive = ['help', 'close-help', 'mute', 'reset-cam', 'toggle-log'];
    if (auto.running && !passive.includes(act)) { toast('托管推演中，请先停止托管。'); return; }

    if (act === 'start') {
      el.intro.hidden = true;
      el.intro.classList.add('gone');
      sfx('event');
      state.changed();
      return;
    }
    if (act === 'toggle-log') { logCollapsed = !logCollapsed; render(); sfx('click'); return; }
    if (act === 'help') { el.helpModal.hidden = false; sfx('click'); return; }
    if (act === 'close-help') { el.helpModal.hidden = true; sfx('click'); return; }
    if (act === 'mute') {
      muted = !muted;
      el.muteBtn.textContent = muted ? '♪̸' : '♪';
      el.muteBtn.classList.toggle('off', muted);
      return;
    }
    if (act === 'reset-cam') { world?.resetCamera(); sfx('click'); return; }
    if (act === 'restart' || act === 'restart-game') {
      if (act === 'restart' && !state.over && state.turn > 1 && !window.confirm('重开一局？当前进度将不复保留。')) return;
      restart();
      return;
    }
    if (act === 'cancel-march') { cancelMarch(); return; }
    if (act === 'pick') { handlePick(btn.dataset.id); world?.focusCity(btn.dataset.id); return; }
    if (act === 'hero') {
      if (state.heroId === btn.dataset.id) { toast('已总戎事。'); return; }
      state.renming(btn.dataset.id);
      sfx('event');
      return;
    }
    if (act === 'cmd') { runCmd(btn.dataset.cmd); return; }
    if (act === 'end-turn') {
      if (state.over || state.pendingEvent) return;
      marchFrom = null;
      sfx('click');
      state.endTurn();
      render();
      return;
    }
    if (act === 'event-opt') {
      const i = Number(btn.dataset.i);
      el.eventModal.hidden = true;
      state.resolveEvent(i);
      sfx('click');
      return;
    }
  });

  function restart(quiet = false) {
    state.reset();
    selected = null;
    marchFrom = null;
    el.endModal.hidden = true;
    el.eventModal.hidden = true;
    el.helpModal.hidden = true;
    world?.resetCamera();
    render();
    if (!quiet) {
      auto.game = 1;
      auto.actions = 0;
      auto.stepsInTurn = 0;
      auto.ctx = null;
      auto.decision = '';
      el.autoHud.hidden = true;
      toast('新局已开，愿官家此回直取旧都。');
    }
  }

  window.addEventListener('keydown', e => {
    if (e.target.matches?.('input, textarea, select')) return;
    if (e.key === 'Escape') {
      if (!el.helpModal.hidden) { el.helpModal.hidden = true; return; }
      if (marchFrom) { cancelMarch(); return; }
    }
    if (e.key === 'a' || e.key === 'A') { toggleAuto(); return; }
    if (!el.helpModal.hidden || !el.eventModal.hidden || !el.endModal.hidden || !el.intro.hidden) return;
    if (e.code === 'Space') { e.preventDefault(); if (!state.over && !state.pendingEvent && !auto.running) { marchFrom = null; state.endTurn(); render(); } }
    if (e.key === 'h' || e.key === 'H') el.helpModal.hidden = false;
    if (e.key === 'r' || e.key === 'R') world?.resetCamera();
  });

  // ── 弹窗 ──────────────────────────────────────────────────
  function showEvent(ev) {
    if (auto.running) return;   // 托管期间由推演循环裁断，不弹窗打断
    sfx('event');
    el.eventBody.innerHTML = `
      <div class="event-card">
        <div class="event-top"><span class="event-tag">${esc(ev.tag)}</span><span class="event-era">${esc(state.yearName)} · 第 ${state.turn} 回合</span></div>
        <h2>${esc(ev.title)}</h2>
        <div class="event-rule"></div>
        <p class="event-text">${esc(ev.text)}</p>
        <div class="event-label">请官家裁断</div>
        <div class="event-options">
          ${ev.options.map((o, i) => `
            <button class="event-opt" data-act="event-opt" data-i="${i}">
              <b>${esc(o.label)}</b><span>${esc(o.desc)}</span><i>${'壹贰叁肆'.slice(i, i + 1) || i + 1}</i>
            </button>`).join('')}
        </div>
      </div>`;
    el.eventModal.hidden = false;
  }

  function showEnd(over) {
    // 托管败局只在状态条里一笔带过并自动重开；胜局照常大告天下
    if (auto.running && over.kind !== 'win') return;
    sfx(over.kind === 'win' ? 'win' : 'lose');
    const songN = state.songCities.length;
    el.endBody.innerHTML = `
      <div class="end-card ${over.kind}">
        <div class="end-seal">${over.kind === 'win' ? '中<br>兴' : '南<br>渡'}</div>
        <div class="eyebrow">${over.kind === 'win' ? '大 功 告 成' : '大 势 已 去'}</div>
        <h2>${esc(over.title)}</h2>
        <p>${esc(over.text)}</p>
        <div class="end-stats">
          <div><span>历时</span><b>${over.turn} 回合</b></div>
          <div><span>版籍</span><b>${songN} 州</b></div>
          <div><span>兵力</span><b>${state.totalTroops} 营</b></div>
          <div><span>民心</span><b>${state.popularity}</b></div>
        </div>
        <button class="btn-primary big" data-act="restart-game">再开一局 <em>→</em></button>
      </div>`;
    el.endModal.hidden = false;
    marchFrom = null;
    render();
  }

  state.on('change', render);
  state.on('event', showEvent);
  state.on('end', showEnd);
  state.on('march', payload => world?.march(payload));

  render();
  return {
    attachWorld, render, handlePick, toast, sfx,
    startAuto, stopAuto, toggleAuto,
    get autoRunning() { return auto.running; },
  };
}
