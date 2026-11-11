import { HEROES, HERO_USE, TERRAIN_LABEL, DIFFICULTIES, SCENARIOS, riverBetween } from './data.js';
import { SCENE_IDS, SCENE_THEMES, sceneTheme } from './themes.js';
import {
  previewBattle, supplyMap, troopCap, MAX_CHARGE, VICTORY_JIN_LIMIT, VICE_COST_GOLD,
  scenarioGoalText,
} from './rules.js';
import {
  readSave, writeSave, clearSave, restore, serialize,
  activeSlot, setActiveSlot, bestSlot, slotSummaries,
} from './save.js';
import {
  BUILDINGS, DISPATCH_TASKS, buildingLevels, buildCost, heroProgress,
  MAX_BUILDING_LEVEL, DISPATCH_PER_TURN, TRAIN_ARMS_COST, ARMS_CAP,
} from './economy.js';
import {
  chooseAction, applyAction, chooseEvent, newTurnContext, phaseOf,
} from './autoplay.js';
import {
  SETTING_GROUPS, EFFECT_LABEL, SOURCE_LABEL, settingById,
  applyUrl, createSettings, RESUME_KEY,
} from './settings.js';

/** 战局卡片：纯展示，选中态由 renderIntro / applySceneTheme 同步。 */
const SCENE_CARDS = SCENE_IDS.map((id, i) => {
  const t = SCENE_THEMES[id];
  return `<button class="scene-card ${i === 0 ? 'active' : ''}" data-act="scene" data-id="${id}" style="--scene-accent:${t.accent}">
    <span class="scene-season">${t.season}</span>
    <span class="scene-name"><b>${t.name}</b><em>${t.tag}</em></span>
    <span class="scene-era">${t.era}</span>
  </button>`;
}).join('');

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
      <button class="tool" data-act="undo" id="undoBtn" title="悔棋 · 撤回上一令（Z / Ctrl+Z）" disabled>↶</button>
      <button class="tool" data-act="saves" id="savesBtn" title="存档 · 三卷可续">册</button>
      <button class="tool" data-act="help" title="玩法说明">？</button>
      <button class="tool" data-act="settings" id="settingsBtn" title="设置 · 统一配置（S）">⚙</button>
      <button class="tool" data-act="mute" id="muteBtn" title="音效开关">♪</button>
      <button class="tool" data-act="reset-cam" title="复位视角">⌖</button>
      <button class="tool" data-act="auto" id="autoBtn" title="托管推演 · 自动北伐（A）">▶</button>
      <button class="tool" data-act="restart" title="重开一局">↻</button>
    </div>
  </header>

  <div class="alert-bar" id="alertBar" hidden></div>

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

  <div class="mobile-tabs" id="mobileTabs">
    <button data-act="drawer" data-id="none" class="active">舆图</button>
    <button data-act="drawer" data-id="left">大计 · 朝局</button>
    <button data-act="drawer" data-id="right">州郡 · 军政</button>
  </div>

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
  <!-- 只在开场页存在的电影感层：宽银幕黑边、暗角、纸纹与一道扫光。
       随 #intro.hidden 一同消失，进场后对局画面逐像素回到原样。 -->
  <div class="intro-grade" aria-hidden="true"><i class="grade-sheen"></i></div>
  <!-- 卷轴：world 挂载完成后才由 .roll-ready 触发展开，正好接住首帧舆图 -->
  <div class="intro-roll" aria-hidden="true"><i class="roll-l"></i><i class="roll-r"></i><b class="roll-seam"></b></div>
  <div class="intro-inner">
    <div class="intro-left">
      <div class="intro-deco">◇ 靖 康 之 后 · 建 炎 北 伐 ◇</div>
      <div class="intro-title">紹<span>宋</span></div>
      <div class="intro-sub">江左一隅，北望中原</div>
      <p class="intro-desc">行在初定，诸军未集，朝堂上主战主和各执一词。<br>你是南渡的官家：整军、筹粮、平朝议、复旧都——<br>在金人再度南下之前，把版籍一寸一寸收回来。</p>
      <div class="intro-points">
        <div><b>三维舆图</b><span>州郡、江河、山险尽在掌中</span></div>
        <div><b>回合军政</b><span>每回合数道政令，用兵先算粮</span></div>
        <div><b>朝局人心</b><span>主战主和消长，牵动国运</span></div>
      </div>
      <div class="intro-setup">
        <div class="setup-label">择 定 战 局</div>
        <div class="scene-list" id="sceneList">${SCENE_CARDS}</div>
        <div class="mode-row" id="modeRow">
          <button class="mode-btn active" data-act="mode" data-id="campaign"><b>北伐长局</b><em>全图 · 三档国势</em></button>
          <button class="mode-btn" data-act="mode" data-id="scenario"><b>短剧本</b><em>郾城／顺昌 · 固定开局</em></button>
        </div>
        <div class="diff-row" id="diffRow">
          ${DIFFICULTIES.map(d => `<button class="diff-btn ${d.id === 'normal' ? 'active' : ''}" data-act="difficulty" data-id="${d.id}"><b>${d.name}</b><span>${d.tag}</span></button>`).join('')}
        </div>
        <div class="scenario-row" id="scenarioRow" hidden>
          ${SCENARIOS.map((sc, i) => `<button class="scenario-btn ${i === 0 ? 'active' : ''}" data-act="scenario" data-id="${sc.id}"><b>${sc.name}</b><span>${sc.tag}</span></button>`).join('')}
        </div>
        <div class="scenario-brief" id="scenarioBrief" hidden></div>
        <div class="diff-desc" id="diffDesc"></div>
        <div class="variant-note" id="variantNote"></div>
      </div>
    </div>

    <div class="intro-center" aria-hidden="true">
      <div class="intro-map-hint"><span>舆 图</span><i></i><span>择关即移镜</span></div>
    </div>

    <div class="intro-right">
      <div class="scene-detail" id="sceneDetail"></div>
      <div class="intro-actions">
        <button class="btn-primary big" data-act="start" id="startBtn">进位临朝 <em>→</em></button>
        <button class="btn-ghost" data-act="continue" id="continueBtn" hidden>续上一局</button>
        <button class="intro-settings-link" data-act="saves">册 存档 · 三卷可续</button>
        <button class="btn-ghost" data-act="auto-start">⟡ 托管推演 · 自动临朝直至胜负</button>
        <button class="intro-settings-link" data-act="settings">⚙ 舆图与开局设置</button>
      </div>
      <div class="intro-foot">灵感取自《绍宋》架空历史设定 · 文案与数值为原创 · 非官方作品</div>
    </div>
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
      <section><h3>二、用兵与推演</h3><p>先点选一座己方州郡，再按「进军」，右栏即列出<b>进兵推演</b>：每个相邻州郡的胜算、攻守势区间、克城后存兵、政令与粮耗，以及士气／战法／渡河／补给／地形的逐项拆解，点一行便可下令；州郡索引的城名后也标了胜算。攻金城即攻城战，攻己城为移防。每城每回合只可整军一次，且受<b>兵额</b>所限；克城后损兵甚重，须就地休整。临阵双方各有浮动，胜算并非必胜之数。</p></section>
      <section><h3>三、朝局</h3><p>主战威望高则政令多、军心盛；主和过盛则北伐之议渐寝。任命都督会明显改变朝局。民心决定粮赋，士气决定攻势，粮尽则军自溃。<b>朝议前后相因</b>：秦桧留置阙下，方有和议之诏；和议既定，又及岳侯兵柄。某些选项会留下长久后果，并随存档保留，不同裁断将走向不同的朝局。</p></section>
      <section><h3>四、胜败</h3><p><b>胜</b>：收复东京开封与燕京，并把金人所据州郡压到 ${VICTORY_JIN_LIMIT} 州以内（或尽逐金人）；只取两京而中原残敌尚众，不算中兴。<b>败</b>：临安／建康失守、民心归零、连岁乏粮，或于回合上限内未竟全功。开场页可择<b>三档国势</b>：宽和、本色、艰险，分别改金军兵势、仓廪、回合上限与开局变局；每局另有两条随机变局，局号注于战报与「北伐大计」。</p></section>
      <section><h3>五、操作</h3><p>拖拽旋转舆图、滚轮缩放、右键平移、点选州郡。<kbd>空格</kbd>结束回合，<kbd>Esc</kbd>取消进军，<kbd>H</kbd>打开本页，<kbd>R</kbd>复位视角，<kbd>A</kbd>开关托管推演，<kbd>Z</kbd>／<kbd>Ctrl+Z</kbd>（或顶栏 <b>↶</b>）<b>悔棋</b>撤回上一令，可连退至多 20 步；托管推演中不可悔。窄屏下三栏改作<b>底部抽屉</b>，点底栏「大计／州郡／舆图」切换。音效开关会被记住。局面<b>逐令自动存档</b>，刷新或关机后自开场页「续上一局」接续；终局清档。顶栏 <b>册</b> 可开<b>存档三卷</b>：另存一卷留档、载入旧卷再图进取，当前卷逐令自记。以 <b>?seed=123456</b> 打开可固定局号，重演同一份变局与战报。<kbd>S</kbd> 或顶栏 <b>⚙</b> 打开<b>设置</b>：观感、性能、开局偏好与局号在此统一择定，改动即存于本机并同步到地址栏，链接可直接分享复现；「即时」项立刻生效，「重载」项按「应用并重载」重建舆图并自动续回原局面，「下局」项在开新局时生效。<b>设置 → 地貌精度</b>可选「原味／高清·宣纸（默认）／高清·写实」：高清档加密地形网格、叠山脊沟壑、陡坡巨岩、远山天际线与皴纹法线，低配档自动回落原味以免拖慢软件渲染。三维舆图按设备自动择<b>性能档</b>（DPR 上限、阴影、植被密度），可在设置中手动锁定高／低；系统开启「减弱动效」时波光与旗面静止。</p></section>
      <section><h3>六、节律</h3><p>金骑只在<b>秋、冬</b>南牧，春夏淮上暂宁，正是整军北伐的窗口。<b>冬季黄河冰合</b>，涉水之阻与据河之利俱减，金骑踏冰可南，须早为之备。先取徐州、蔡州等外围，再图开封；「御驾亲征」叠加都督加成可破坚城，然须两道政令、每局至多 ${MAX_CHARGE} 次，且黄旗一动，金人益知我主力所在。久不北伐则主和日盛——偏安拖不出中兴。</p></section>
      <section><h3>七、托管推演</h3><p>开场页按「托管推演」，或局中按顶栏 <b>▶</b>／<kbd>A</kbd>，便由 AI 代为临朝，逐回合决策，直至克复两京。托管守<b>三段战略</b>：固淮北 → 复旧都 → 取燕云；每回合至多两度进军、两处整军。可暂停、切换 ×1／×3／×8 倍速、随时停止接手。若一局失利会自动重整山河再北伐。</p></section>
      <section><h3>八、推演公允</h3><p>托管与官家用的是<b>同一套规则、同一份粮账、同一个随机数</b>，没有隐藏兵力或暗改判定；它只是把攻守之势算得更准、更不肯冒险。托管中的战报、事件裁断与三维行军，与你亲手所下之令并无二致。</p></section>
      <section><h3>九、山河与粮道</h3><p>黄河、淮河、长江、钱塘各有<b>津渡</b>。凡涉水进军，攻势受挫、守方据河得利，且须多下<b>一道政令</b>并添舟楫粮耗；<b>水师</b>都督或御驾亲征可免那道政令。州郡须由己方城池连成一线通向行在，方为<b>粮道通</b>；否则即为孤城——岁赋折半、兵额减半、士气渐堕、久戍逃亡，出兵与守备俱受损。相邻己城越多，<b>连营犄角</b>越厚。开局长安便孤悬敌后，唯有打通洛阳、邓州一线方能接上粮道。<b>粮道越远，转运越贵</b>：自深入中原的州郡出兵，每营耗粮随距行在的跳数递增，故北伐愈深，愈须先积谷、再进兵。</p></section>
      <section><h3>十、战法与分路督军</h3><p>八位都督各有<b>战法</b>：岳飞步阵利于平原，韩世忠水师济河，吴玠据险擅长山险且能持孤军，刘锜婴城固守，张俊广兵额，李纲、赵鼎理政足食，秦桧则军备废弛。故渡淮之时宜任水师，转入中原平原则改任步阵。择一己方州郡下「<b>督军</b>」令，都督持节驻此：自本城出兵战法加倍，本城守备益固；换将或该城失守，驻节即废。<b>两路分镇</b>：拜主帅后可于左栏切到「拜分路」，再择一将（耗缗钱 ${VICE_COST_GOLD}）别当一面——分帅战法只及驻节本城，全局粮赋、兵额与朝政仍归主帅，且每回合另耗 2 粮、主和 +2；一州不置二节，亦可「罢」其幕府。守势吃紧时以刘锜、吴玠分镇，孤城未通粮道则以赵鼎，皆有其时。</p></section>
      <section><h3>十一、短剧本</h3><p>开场页可切到「<b>短剧本</b>」：<b>顺昌婴城</b>以寿春当顺昌，九回合内守住寿春、楚州，能袭取海州便提前大捷；<b>郾城破阵</b>以蔡州当前锋大营，十二回合内克复应天府与徐州，且大营与淮南后路皆不可失。两关皆为<b>固定开局</b>（不抽随机变局、主帅与驻节既定），金人每回合叩边、锐气另作校定，朝议也只用本关的几张事件；局号仍决定战斗与事件的掷点，故可复现整关。舆图上的<b>朱批圈</b>标出必守与必取之州，左栏军令卡逐项记进度。必守之州中途易主不必绝望，抢在回合上限前夺回即可；到时限仍在敌手，或军令未竟而时限已到，便算败。</p></section>
      <section><h3>十二、治略（可选扩展）</h3><p>于<b>设置 → 开局与偏好 → 治略 · 经营养成</b>开启（或加 <b>?economy=1</b>），即刻生效，无需重开。默认关闭，以守住固定局号的胜率基线；关掉只冻结、不丢进度。<b>营建</b>：在己方州郡卡中置屯田（岁赋）、仓廪（减戍耗、备荒）、军器作坊（产军械）、市舶（进缗钱），各可升三级，越升越贵，每级一道政令——种田与北伐争的是同一份资源；城池一旦易主，历年设施尽付兵燹。<b>差遣与历练</b>：八员皆可派赴州郡督屯、巡边、督造，每员每回合一次、全朝至多两遣；差遣、实战与驻节都积阅历，Lv3／Lv5 各悟一条专属战法，但<b>只在拜为主帅或分帅时生效</b>，故「先培养谁、再拜谁」本身是一层取舍。军械存量既加攻势（封顶 +12%），整军时也可耗 6 副多募一营、省粮 3。所有加成仍经<b>同一套攻守系数</b>计入战前推演与托管，不作暗改。</p></section>
    </div>
    <button class="btn-primary" data-act="close-help">领旨</button>
  </div>
</div>

<div class="scrim modal settings-scrim" id="settingsModal" hidden>
  <div class="settings-card">
    <div class="card-eyebrow">御 前 条 陈</div>
    <h2>设 置</h2>
    <p class="set-lead">观感、性能与开局偏好在此统一择定。改动即存于本机并同步到地址栏，链接可直接分享复现。</p>
    <div class="set-link-row"><span>当前链接</span><code id="settingsUrl"></code></div>
    <div class="settings-body" id="settingsBody"></div>
    <div class="settings-foot" id="settingsFoot"></div>
  </div>
</div>

<div class="scrim modal" id="savesModal" hidden><div id="savesBody"></div></div>
`;

// ── 轻音效 ──────────────────────────────────────────────────
const MUTE_KEY = 'shaosong.muted';
function readMute() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
}
function writeMute(v) {
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (_) { /* 隐私模式 */ }
}
let audioCtx = null;
let muted = readMute();
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
    if (kind === 'hover') tone(698, 0.045, 'sine', 0.016);
    // 择关：一声轻磬；进场：由低到高的三声，配合卷轴合拢
    if (kind === 'scene') { tone(294, 0.17, 'triangle', 0.038); tone(440, 0.24, 'sine', 0.026, 0.06); }
    if (kind === 'enter') {
      [147, 220, 294].forEach((f, i) => tone(f, 0.52 + i * 0.08, i === 1 ? 'triangle' : 'sine', 0.045 - i * 0.007, i * 0.085));
    }
    if (kind === 'war') { tone(88, 0.30, 'sawtooth', 0.07); tone(132, 0.22, 'triangle', 0.04, 0.04); }
    if (kind === 'event') { tone(523, 0.55, 'sine', 0.05); tone(784, 0.65, 'sine', 0.035, 0.10); }
    if (kind === 'win') { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.7, 'sine', 0.05, i * 0.14)); }
    if (kind === 'lose') { tone(196, 0.8, 'sine', 0.05); tone(146, 1.0, 'sine', 0.04, 0.18); }
  } catch (_) { /* 浏览器禁用音频时静默 */ }
}

const $ = (root, sel) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const DIFF_KEY = 'shaosong.difficulty';
const TIP_KEY = 'shaosong.tipped';
const SCEN_KEY = 'shaosong.scenario';
const readDiff = () => {
  try { const v = localStorage.getItem(DIFF_KEY); return DIFFICULTIES.some(d => d.id === v) ? v : 'normal'; }
  catch (_) { return 'normal'; }
};
const writeDiff = v => { try { localStorage.setItem(DIFF_KEY, v); } catch (_) { /* 隐私模式 */ } };
const readScenario = () => {
  try { const v = localStorage.getItem(SCEN_KEY); return SCENARIOS.some(s => s.id === v) ? v : SCENARIOS[0].id; }
  catch (_) { return SCENARIOS[0].id; }
};
const writeScenario = v => { try { localStorage.setItem(SCEN_KEY, v); } catch (_) { /* 隐私模式 */ } };

export function createUI(root, state, opts = {}) {
  root.innerHTML = TEMPLATE;
  // 开场页现在是半透明舞台：对局 HUD 必须整层收起，否则顶栏／三栏／战报会与舞台叠在一起。
  root.classList.add('intro-active');
  if (opts.grade === false) root.classList.add('no-grade');
  const el = {
    era: $(root, '#eraText'), stats: $(root, '#topStats'),
    left: $(root, '#leftPanel'), right: $(root, '#rightPanel'),
    log: $(root, '#logBox'), hint: $(root, '#modeHint'),
    toastWrap: $(root, '#toastWrap'), intro: $(root, '#intro'),
    eventModal: $(root, '#eventModal'), eventBody: $(root, '#eventBody'),
    endModal: $(root, '#endModal'), endBody: $(root, '#endBody'),
    helpModal: $(root, '#helpModal'), muteBtn: $(root, '#muteBtn'),
    settingsModal: $(root, '#settingsModal'), settingsBody: $(root, '#settingsBody'),
    settingsFoot: $(root, '#settingsFoot'), settingsUrl: $(root, '#settingsUrl'),
    settingsBtn: $(root, '#settingsBtn'),
    savesModal: $(root, '#savesModal'), savesBody: $(root, '#savesBody'),
    savesBtn: $(root, '#savesBtn'), alertBar: $(root, '#alertBar'),
    autoBtn: $(root, '#autoBtn'), autoHud: $(root, '#autoHud'),
    autoPhase: $(root, '#autoPhase'), autoRound: $(root, '#autoRound'),
    autoDecision: $(root, '#autoDecision'), autoBar: $(root, '#autoBar'),
    autoProgress: $(root, '#autoProgress'), autoPause: $(root, '#autoPause'),
    autoSpeed: $(root, '#autoSpeed'), autoRestart: $(root, '#autoRestart'),
    autoStop: $(root, '#autoStop'),
    diffRow: $(root, '#diffRow'), diffDesc: $(root, '#diffDesc'),
    variantNote: $(root, '#variantNote'), continueBtn: $(root, '#continueBtn'),
    modeRow: $(root, '#modeRow'), scenarioRow: $(root, '#scenarioRow'),
    scenarioBrief: $(root, '#scenarioBrief'), startBtn: $(root, '#startBtn'),
    sceneList: $(root, '#sceneList'), sceneDetail: $(root, '#sceneDetail'),
    undoBtn: $(root, '#undoBtn'), mobileTabs: $(root, '#mobileTabs'),
  };

  let world = null;
  let selected = null;
  let marchFrom = null;
  // 与 main.js 共享同一份配置对象；未注入时自行解析，保证单独调用也安全。
  const settings = opts.settings || createSettings(location.search);
  if (opts.muted !== undefined) muted = !!opts.muted;   // sfx 读的是模块级 muted
  const pendingReload = new Set();                      // 已改、但当前画面尚未重建的项
  const narrow = () => window.matchMedia?.('(max-width: 760px)')?.matches ?? false;
  let logCollapsed = narrow();   // 窄屏默认收起战报，把舆图留给手指
  const undoStack = [];         // 玩家之令前的纯数据快照，托管不记
  const UNDO_MAX = 20;
  let chosenDifficulty = opts.difficulty ?? readDiff();
  // ?scenario=<id> 可直接预选短剧本，配合 ?auto=1 即托管推演该关
  let chosenMode = opts.scenario && SCENARIOS.some(x => x.id === opts.scenario) ? 'scenario' : 'campaign';
  let chosenScenario = opts.scenario && SCENARIOS.some(x => x.id === opts.scenario) ? opts.scenario : readScenario();
  let heroRoute = 'main';   // 拜将列表当前选的是「主帅」还是「分路」
  // 治略：差遣面板的选择在多次 render 之间保留；城池留空时跟随当前选中州郡
  let dispatchHeroId = HEROES[0].id;
  let dispatchCityId = null;
  let started = false;
  let saveTimer = null;
  // 指定局号时每一局都重演同一起点，便于复现战报与调试；未指定则每局随机。
  // 设置面板改局号时可直接更新，故用 let 而非 const。
  let fixedSeed = Number.isFinite(opts.seed) ? opts.seed : null;
  const currentScenario = () => SCENARIOS.find(s => s.id === chosenScenario) || SCENARIOS[0];
  const scenarioOpt = () => chosenMode === 'scenario' ? currentScenario().id : null;
  // 显式传 scenario（null 表示回长局），重开时沿用当前战局，不会偷偷跳回全图
  const resetOpts = extra => ({ ...extra, scenario: scenarioOpt(), ...(fixedSeed !== null ? { seed: fixedSeed } : {}) });

  // 托管推演状态
  const auto = {
    running: false, paused: false, speed: 3, game: 1,
    actions: 0, stepsInTurn: 0, ctx: null, decision: '', token: 0,
  };
  const MAX_AUTO_GAMES = 8;
  const SPEEDS = [1, 3, 8];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const fmtPct = v => (v < 0.005 ? '&lt;1%' : Math.round(v * 100) + '%');
  const signed = ([label, v]) => `${esc(label)} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const currentDiff = () => DIFFICULTIES.find(d => d.id === chosenDifficulty) || DIFFICULTIES[1];

  // 开场页运镜与低配／系统减弱动效互斥：这些设备直接落位，不播 1.1s 缓动。
  const skipIntroMotion = !!(opts.reducedMotion || opts.quality === 'low'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  if (skipIntroMotion) root.classList.add('no-intro-motion');
  // 卷轴由 world 挂载完成后展开；万一 WebGL 初始化失败，3 秒兜底也要撤掉，
  // 否则两片宣纸会把 main.js 的错误提示一起盖住。
  const rollFallback = setTimeout(() => el.intro.classList.add('roll-ready'), 3000);
  let lastSceneId = null;
  const activeSceneId = () => scenarioOpt() || 'campaign';

  function renderSceneDetail(t) {
    const sc = SCENARIOS.find(x => x.id === t.id) || null;
    el.sceneDetail.innerHTML = `
      <div class="sd-eyebrow">${esc(t.era)}　·　${t.id === 'campaign' ? '全图战局' : '场景战局'}</div>
      <div class="sd-poem">${esc(t.poem)}</div>
      <p class="sd-brief">${esc(t.brief)}</p>
      <div class="sd-meta">
        <div><b>军令</b><span>${esc(sc ? scenarioGoalText(sc) : '收复开封与燕京，尽逐金人')}</span></div>
        <div><b>舆图</b><span>${t.marks.length ? `${t.marks.length} 处朱批焦点 · 择关即移镜` : '全图二十四州郡'}</span></div>
      </div>
      <div class="sd-hint">点左侧战局卡片，舆图即移到该关山川形势</div>`;
  }

  /**
   * 主题只作用于表现层：applyTheme / setPreviewMarks / flyTo 全是视觉只读调用，
   * 不改 GameState、不动存档，故 ?seed 与 npm run balance 的可复现基线不受影响。
   */
  function applySceneTheme(immediate = false) {
    const t = sceneTheme(activeSceneId());
    root.dataset.scene = t.id;
    el.sceneList.querySelectorAll('.scene-card').forEach(b =>
      b.classList.toggle('active', b.dataset.id === t.id));
    renderSceneDetail(t);
    // world 尚未挂载时只更新 DOM；attachWorld 会以 immediate 补上机位与光色。
    if (!world || started) return;
    const changed = lastSceneId !== t.id;
    lastSceneId = t.id;
    world.applyTheme(t);
    world.setPreviewMarks(t.marks);
    if (changed || immediate) world.flyTo(t.pose, 1.1, immediate || skipIntroMotion);
  }

  /**
   * 进场合卷：一层独立、pointer-events:none 的临时 DOM，与 #intro.hidden 同帧插入。
   * 既有 7 套实机脚本依赖「点击即隐藏开场页、HUD 同帧恢复」，所以转场绝不
   * 延后 hideIntro，也不拦截任何点击；reducedMotion／低配／托管／续档一律跳过。
   */
  function playEnterRoll() {
    if (skipIntroMotion || auto.running || root.classList.contains('no-grade')) return;
    const layer = document.createElement('div');
    layer.className = 'enter-roll';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<i></i><i></i><b></b>';
    root.appendChild(layer);
    const done = () => layer.remove();
    layer.addEventListener('animationend', done, { once: true });
    setTimeout(done, 900);                    // 动画被系统策略吞掉时的兜底
  }

  function hideIntro(withRoll = false) {
    clearTimeout(rollFallback);
    el.intro.hidden = true;
    el.intro.classList.add('gone');
    root.classList.remove('intro-active');   // 与 hidden 同一帧恢复 HUD，实机脚本依赖该时序
    world?.exitPresentation();
    if (withRoll) playEnterRoll();
  }

  function renderIntro() {
    const D = currentDiff();
    const sc = chosenMode === 'scenario' ? currentScenario() : null;
    root.classList.toggle('scenario-mode', !!sc);
    el.modeRow.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.id === chosenMode));
    el.scenarioRow.querySelectorAll('.scenario-btn').forEach(b => b.classList.toggle('active', b.dataset.id === chosenScenario));
    el.diffRow.hidden = !!sc;
    el.scenarioRow.hidden = !sc;
    el.scenarioBrief.hidden = !sc;
    el.startBtn.innerHTML = sc ? '提兵赴战 <em>→</em>' : '进位临朝 <em>→</em>';

    if (sc) {
      el.scenarioBrief.innerHTML =
        `<p>${esc(sc.brief).replace(/\n/g, '<br>')}</p>`
        + `<p class="sc-tactic"><b>用兵</b>　${esc(sc.tactic)}</p>`
        + `<p class="sc-goal"><b>军令</b>　${esc(scenarioGoalText(sc))}</p>`;
      el.diffDesc.textContent = `${sc.era} · ${sc.tag} · 舆图朱批圈标出必守与必取之州`;
      el.variantNote.textContent = '固定开局，不抽随机变局；局号只定掷点，仍可复现整关。';
    } else {
      el.diffRow.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.id === chosenDifficulty));
      el.diffDesc.textContent = D.desc;
      el.variantNote.textContent = `每局另有两条随机变局（${D.luck === 'good' ? '偏吉' : D.luck === 'bad' ? '偏凶' : '吉凶参半'}），局号与变局均载于战报。`;
    }
    // 续局入口指向最近更新的可续档（跨三槽）；真正载入时再把「当前卷」切过去
    const best = bestSlot();
    el.continueBtn.hidden = !best;
    if (best) {
      const info = best.info;
      const label = info.scenarioId
        ? (SCENARIOS.find(x => x.id === info.scenarioId)?.name || '短剧本')
        : (DIFFICULTIES.find(d => d.id === info.difficulty)?.name || '建炎北伐');
      el.continueBtn.textContent = `续上一局 · ${label} 第 ${info.turn} 回合 · #${info.seed || ''}`;
    }
    applySceneTheme();
  }

  // ── 设置面板 ──────────────────────────────────────────────
  // 配置层的单一真源是 settings.values；改动写偏好 + 同步地址栏，
  // 能即时生效的项立刻作用于 world／UI，其余标记「待重载」由用户决定何时重建。
  function syncUrl() {
    try { history.replaceState(null, '', applyUrl(settings.values, location.href)); }
    catch (_) { /* file:// 等环境不支持时仅本机生效 */ }
  }

  function setMuted(v) {
    muted = !!v;
    writeMute(muted);
    el.muteBtn.textContent = muted ? '♪̸' : '♪';
    el.muteBtn.classList.toggle('off', muted);
  }

  function settingControl(it, value) {
    if (it.type === 'toggle') {
      return `<button class="set-switch ${value ? 'on' : ''}" data-act="set-toggle" data-id="${it.id}" aria-pressed="${!!value}" aria-label="${esc(it.label)}"><i></i></button>`;
    }
    if (it.type === 'select') {
      return `<div class="set-seg">${it.options.map(o =>
        `<button class="set-seg-btn ${o.v === value ? 'active' : ''}" data-act="set-select" data-id="${it.id}" data-v="${esc(o.v)}">${esc(o.label)}</button>`
      ).join('')}</div>`;
    }
    return `<input class="set-input" data-set-text="${it.id}" value="${esc(value)}" placeholder="${esc(it.placeholder || '')}" inputmode="numeric" aria-label="${esc(it.label)}">`;
  }

  const FX_TITLE = {
    live: '改动立即生效', reload: '须重载舆图后生效', next: '下一局生效',
  };
  function renderSettings() {
    const s = settings.values;
    const q = new URLSearchParams(location.search).toString();
    el.settingsUrl.textContent = q ? `?${q}` : '（默认 · 无附加参数）';
    el.settingsUrl.title = location.href;
    el.settingsBody.innerHTML = SETTING_GROUPS.map(g => `
      <section class="set-group" data-group="${g.id}">
        <div class="set-group-head"><h3>${esc(g.title)}</h3><p>${esc(g.note)}</p></div>
        ${g.items.map(it => {
          const src = settings.sources[it.id] || 'default';
          const p = pendingReload.has(it.id);
          return `<div class="set-row ${p ? 'pending' : ''}" data-row="${it.id}">
            <div class="set-info"><b>${esc(it.label)}</b><span>${esc(it.desc)}</span></div>
            <div class="set-ctl">${settingControl(it, s[it.id])}</div>
            <div class="set-tags">
              <span class="set-src src-${src}" title="取值来源">${SOURCE_LABEL[src]}</span>
              <span class="set-fx fx-${it.effect}" title="${FX_TITLE[it.effect]}">${EFFECT_LABEL[it.effect]}</span>
              ${p ? '<span class="set-wait">待重载</span>' : ''}
            </div>
          </div>`;
        }).join('')}
      </section>`).join('');

    const n = pendingReload.size;
    el.settingsFoot.innerHTML = `
      <div class="set-foot-status">${n
        ? `已保存 <b>${n}</b> 项须重建舆图的设定，点「应用并重载」即刻生效；对局会自动续回原局面。`
        : '所有改动已生效或已保存；关闭面板后亦可稍后刷新。'}</div>
      <div class="set-foot-btns">
        <button class="btn-ghost" data-act="set-copy">复制链接</button>
        <button class="btn-ghost" data-act="set-reset">恢复默认</button>
        <button class="btn-primary ${n ? '' : 'dim'}" data-act="set-apply" id="setApplyBtn">应用并重载${n ? ` · ${n}` : ''}</button>
        <button class="btn-ghost" data-act="close-settings">关闭</button>
      </div>`;
    el.settingsBtn.classList.toggle('on', n > 0);
  }

  function openSettings() { renderSettings(); el.settingsModal.hidden = false; sfx('click'); }
  function closeSettings() { el.settingsModal.hidden = true; sfx('click'); }

  /** 改一项配置：写偏好 → 同步链接 → 即时生效或标记待重载 → 重绘面板。 */
  function changeSetting(id, raw) {
    const it = settingById(id);
    if (!it) return;
    const v = settings.set(id, raw);
    syncUrl();

    if (id === 'ink') world?.ink.setEnabled(!!v);
    if (id === 'grade') root.classList.toggle('no-grade', !v);
    // 治略是即时开关：state.setEconomy 内部 changed() 会触发 render + 存档，
    // 关掉只冻结生效，设施与阅历留着，复行时续用。
    if (id === 'economy') state.setEconomy(!!v);
    if (id === 'mute') setMuted(v);
    if (id === 'difficulty') { chosenDifficulty = v; writeDiff(v); renderIntro(); }
    if (id === 'scenario') {
      if (v === 'campaign') chosenMode = 'campaign';
      else { chosenMode = 'scenario'; chosenScenario = v; writeScenario(v); }
      renderIntro();
    }
    if (id === 'seed') fixedSeed = v ? (Number(v) >>> 0) || null : null;

    if (it.effect === 'reload') pendingReload.add(id);
    renderSettings();
    sfx('click');
    if (it.effect === 'live') toast(`${it.label}已${v ? '开启' : '关闭'}，即时生效。`);
  }

  function applyReload() {
    if (auto.running) { toast('请先停止托管推演，再重载舆图。'); return; }
    flushSave();
    if (started && !state.over) {
      try { sessionStorage.setItem(RESUME_KEY, '1'); } catch (_) { /* 隐私模式 */ }
    }
    location.reload();
  }
  function resetAllSettings() {
    if (auto.running) { toast('请先停止托管推演，再恢复默认。'); return; }
    settings.reset();
    pendingReload.clear();
    setMuted(false);
    chosenDifficulty = readDiff();
    chosenMode = 'campaign';
    fixedSeed = null;
    syncUrl();
    renderIntro();
    renderSettings();
    applyReload();
  }
  async function copySettingsLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('当前配置链接已复制，可分享复现。');
    } catch (_) {
      // 剪贴板不可用时退化为选中链接文本，用户可自行复制
      const r = document.createRange(); r.selectNodeContents(el.settingsUrl);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      toast('已选中链接，请按 Ctrl+C 复制。');
    }
  }

  /** 从存档回到原局面。开场页「续上一局」与设置重载后的自动续档共用此路径。 */
  function resumeGame() {
    if (!restore(state, readSave())) { clearSave(); renderIntro(); return false; }
    started = true;
    undoStack.length = 0;
    updateUndoTool();
    chosenDifficulty = state.difficulty;
    writeDiff(chosenDifficulty);
    chosenMode = state.scenario ? 'scenario' : 'campaign';
    if (state.scenario) { chosenScenario = state.scenario.id; writeScenario(chosenScenario); }
    selected = null;
    marchFrom = null;
    el.settingsModal.hidden = true;
    el.endModal.hidden = true;
    el.eventModal.hidden = true;
    hideIntro();
    render();
    renderIntro();
    if (state.pendingEvent) showEvent(state.pendingEvent);
    if (state.over) showEnd(state.over);
    toast(`已续 ${state.diffDef.name} · 第 ${state.turn} 回合。`);
    sfx('event');
    persist();
    return true;
  }

  // 自动存档原本忽略 writeSave() 的返回值：隐私模式或配额满时会一直
  // 「逐令自动存档」却什么都没写。失败只提示一次，成功后再允许提示，
  // 免得托管推演每步弹一条。
  let saveWarned = false;
  function writeAutoSave() {
    if (writeSave(state)) { saveWarned = false; return true; }
    if (!saveWarned) {
      saveWarned = true;
      toast('自动存档失败：本机存储不可用或已满，请用顶栏「册」另存或检查浏览器设置。', 'bad');
    }
    return false;
  }
  function persist() {
    if (!started || state.over) { clearSave(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (started && !state.over) writeAutoSave(); }, 120);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    if (started && !state.over) writeAutoSave();
  }

  // ── 悔棋：快照是纯数据，restore 写回同一实例，listeners 与舆图都不必重建 ──
  function updateUndoTool() {
    if (!el.undoBtn) return;
    el.undoBtn.disabled = auto.running || undoStack.length === 0;
    el.undoBtn.title = undoStack.length
      ? `悔棋 · 可退 ${undoStack.length} 步（Z / Ctrl+Z）` : '悔棋 · 尚无指令';
  }
  function commitUndo(snap) {
    if (!snap) return;
    undoStack.push(snap);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    updateUndoTool();
  }
  /** 先取快照却不入栈：给「可能被拒」的指令用，失败时不会白占一次悔棋 */
  function snapUndo() {
    if (auto.running || !started || state.over) return null;
    return serialize(state);
  }
  function pushUndo() { commitUndo(snapUndo()); }
  function undo() {
    if (auto.running) { toast('托管推演中，请先停止托管。'); return; }
    if (!undoStack.length) { toast('已无可悔之令。'); return; }
    const raw = undoStack.pop();
    if (!restore(state, raw)) { toast('悔棋失败，快照不可读。', 'bad'); return; }
    marchFrom = null;
    el.endModal.hidden = true;
    el.eventModal.hidden = true;
    render();
    if (state.pendingEvent) showEvent(state.pendingEvent);
    persist();
    updateUndoTool();
    toast('已撤回上一令。');
    sfx('click');
  }
  function firstTip() {
    try {
      if (localStorage.getItem(TIP_KEY)) return;
      localStorage.setItem(TIP_KEY, '1');
    } catch (_) { return; }
    toast('先点选<b>己方州郡</b>，再按「进军」看胜算推演；<kbd>H</kbd> 看玩法，<kbd>空格</kbd>结束回合，<kbd>↶</kbd> 可悔棋。');
  }

  // ── 首局分步引导 ──────────────────────────────────────────
  // 只在首次开长局新局时走一遍：五步聚光讲「政令 → 大计 → 州郡军令 → 战报 → 结束回合」，
  // 读完或跳过都记入本机偏好，永不复读；短剧本走 firstTip 一句话即可。
  const GUIDE_KEY = 'shaosong.guide';
  const guideDone = () => { try { return !!localStorage.getItem(GUIDE_KEY); } catch (_) { return true; } };
  const GUIDE_STEPS = [
    { sel: '#topStats', drawer: 'none', title: '府库与政令',
      text: '粮秣、缗钱、民心、士气尽在顶栏。最要紧的是<b>政令</b>——每回合数道而已，整军、筹粮、拜将、进军、和议皆耗政令，先把令花在刀刃上。' },
    { sel: '#leftPanel', drawer: 'left', title: '北伐大计与朝局',
      text: '左栏是中兴军令与朝局消长。收复东京开封与燕京、并把金人压出中原，方算中兴；主战盛则政令多、军心壮，主和过盛则北伐之议渐寝。' },
    { sel: '#rightPanel', drawer: 'right', title: '州郡与军政指令',
      text: '先在舆图上<b>点选一座己方州郡</b>，右栏即现粮道、兵额与相邻州郡胜算；整军、进军诸令皆在此下达。用兵先算粮，渡河另有舟楫之费。' },
    { sel: '#logBox', drawer: 'none', title: '起居注 · 军报',
      text: '度支结算、金军动向与朝中变故都记在战报里，随回合滚动。局号与随机变局亦载于此，可据以复盘同一局。' },
    { sel: '.end-turn', drawer: 'right', title: '结束回合',
      text: '政令用尽便按「结束回合」（<kbd>空格</kbd>），度支与金人行动随之而来。<b>↶ 可悔棋</b>至前令，<kbd>H</kbd> 随时翻开玩法略要。愿官家早复旧都。' },
  ];
  let guideLayer = null;
  let guideStep = 0;
  function setDrawerTab(id) {
    root.dataset.drawer = id;
    el.mobileTabs.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.id === id));
  }
  function layoutGuide() {
    if (!guideLayer) return;
    const step = GUIDE_STEPS[guideStep];
    const target = root.querySelector(step.sel);
    const hole = guideLayer.querySelector('.guide-hole');
    const box = guideLayer.querySelector('.guide-box');
    const r = target?.getBoundingClientRect();
    const visible = !!r && r.width > 8 && r.height > 8;
    guideLayer.classList.toggle('no-hole', !visible);
    if (visible) {
      hole.style.left = `${r.left - 6}px`;
      hole.style.top = `${r.top - 6}px`;
      hole.style.width = `${r.width + 12}px`;
      hole.style.height = `${r.height + 12}px`;
      // 说明卡就近落位：目标在下半屏则提到上方，免得压住高亮
      const up = r.top + r.height / 2 > window.innerHeight / 2;
      box.style.top = up ? '' : `${Math.min(r.bottom + 16, window.innerHeight - 220)}px`;
      box.style.bottom = up ? `${Math.max(16, window.innerHeight - r.top + 16)}px` : '';
    } else {
      box.style.top = ''; box.style.bottom = '18%';
    }
  }
  function renderGuideStep() {
    const step = GUIDE_STEPS[guideStep];
    setDrawerTab(narrow() ? step.drawer : root.dataset.drawer);
    if (narrow()) logCollapsed = step.sel === '#logBox' ? false : logCollapsed;
    guideLayer.querySelector('.guide-no').textContent = `${guideStep + 1}／${GUIDE_STEPS.length}`;
    guideLayer.querySelector('.guide-title').textContent = step.title;
    guideLayer.querySelector('.guide-text').innerHTML = step.text;
    guideLayer.querySelector('[data-guide="next"]').innerHTML =
      guideStep === GUIDE_STEPS.length - 1 ? '领旨入局 <em>→</em>' : '下一步 <em>→</em>';
    requestAnimationFrame(() => { layoutGuide(); setTimeout(layoutGuide, 360); });   // 抽屉展开后复算
  }
  function endGuide(finished) {
    if (!guideLayer) return;
    guideLayer.remove();
    guideLayer = null;
    window.removeEventListener('resize', layoutGuide);
    try {
      localStorage.setItem(GUIDE_KEY, '1');
      localStorage.setItem(TIP_KEY, '1');
    } catch (_) { /* 隐私模式 */ }
    if (finished) toast('引导已毕。点选州郡即可理政进军；<kbd>H</kbd> 略要，<kbd>↶</kbd> 悔棋。');
  }
  function startGuide(tries = 0) {
    if (guideDone() || guideLayer) return;
    // 玩家一进场就翻设置／撞上事件时，不要把引导盖在弹窗上：等它关掉再浮现
    const modalOpen = !el.settingsModal.hidden || !el.helpModal.hidden || !el.savesModal.hidden
      || !el.eventModal.hidden || !el.endModal.hidden;
    if (modalOpen) {
      if (tries < 20) setTimeout(() => startGuide(tries + 1), 400);
      return;
    }
    guideLayer = document.createElement('div');
    guideLayer.className = 'guide-scrim';
    guideLayer.setAttribute('role', 'dialog');
    guideLayer.setAttribute('aria-label', '首局引导');
    guideLayer.innerHTML = `
      <div class="guide-hole" aria-hidden="true"></div>
      <div class="guide-box">
        <div class="guide-eyebrow">御 前 指 南 · 第 <i class="guide-no">1／5</i> 步</div>
        <h3 class="guide-title"></h3>
        <p class="guide-text"></p>
        <div class="guide-btns">
          <button class="btn-ghost" data-guide="skip">跳过引导</button>
          <button class="btn-primary" data-guide="next">下一步 <em>→</em></button>
        </div>
      </div>`;
    root.appendChild(guideLayer);
    guideLayer.addEventListener('click', e => {
      const b = e.target.closest('[data-guide]');
      if (!b) return;
      sfx('click');
      if (b.dataset.guide === 'skip') { endGuide(false); return; }
      guideStep++;
      if (guideStep >= GUIDE_STEPS.length) endGuide(true);
      else renderGuideStep();
    });
    window.addEventListener('resize', layoutGuide);
    guideStep = 0;
    renderGuideStep();
  }

  // ── 语境预警条 ────────────────────────────────────────────
  // 纯派生状态，render 时随局面重算；红级关乎败亡，琥珀级是节律提醒。
  function computeAlerts(s) {
    if (s.over) return [];
    const out = [];
    if (s.grain < 25) out.push({ level: 'bad', html: `府库将罄 · 粮 ${s.grain} 万石，粮尽则军自溃` });
    else if (s.grain < 40) out.push({ level: 'warn', html: `粮秣见肘 · 余 ${s.grain} 万石` });
    if (s.popularity < 35) out.push({ level: 'bad', html: `民心思变 · 民心 ${s.popularity}` });
    if (s.morale < 40) out.push({ level: 'warn', html: `士气低迷 · ${s.morale}` });
    const sup = supplyMap(s);
    const isolated = s.songCities.filter(c => !sup.linked.has(c.id));
    if (isolated.length) out.push({
      level: 'bad',
      html: `粮道断绝 · ${isolated.slice(0, 3).map(c => c.name).join('、')}${isolated.length > 3 ? '等' : ''}孤悬无援`,
      pick: isolated[0].id,
    });
    if (['春', '夏'].includes(['春', '夏', '秋', '冬'][(s.turn - 1) % 4])) {
      out.push({ level: 'warn', html: '秋防将至 · 金骑秋冬南牧，宜趁春夏整军北进' });
    }
    if (s.maxTurns - s.turn <= 3) out.push({ level: 'bad', html: `时限将至 · 余 ${s.maxTurns - s.turn} 回合` });
    return out.slice(0, 3);
  }
  function renderAlerts() {
    const on = started && !auto.running && el.intro.hidden && !state.pendingEvent;
    const list = on ? computeAlerts(state) : [];
    el.alertBar.hidden = !list.length;
    el.alertBar.innerHTML = list.map(a => a.pick
      ? `<button class="alert-chip ${a.level}" data-act="alert-pick" data-id="${a.pick}" title="点选该州">${a.html}<i>→</i></button>`
      : `<span class="alert-chip ${a.level}">${a.html}</span>`).join('');
  }

  // ── 存档 · 三卷 ───────────────────────────────────────────
  function renderSaves() {
    const act = activeSlot();
    const inGame = started && !state.over && !auto.running;
    const dateOf = at => at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    el.savesBody.innerHTML = `
      <div class="saves-card">
        <div class="card-eyebrow">御 前 条 陈</div>
        <h2>存 档 · 三 卷</h2>
        <p class="set-lead">逐令自动写入<b>当前卷</b>（第 ${act} 卷）；终局自清。亦可手动另存一卷留档，或载入旧卷再图进取。</p>
        <div class="saves-list">
          ${slotSummaries().map(sl => {
            if (sl.empty) return `<div class="save-slot empty">
              <div class="ss-head"><b>第 ${sl.slot} 卷</b><span>空卷</span></div>
              <div class="ss-btns">${inGame ? `<button class="btn-ghost" data-act="save-write" data-slot="${sl.slot}">存此卷</button>` : '<em>尚无存档</em>'}</div>
            </div>`;
            const label = sl.broken ? '卷宗漫漶 · 已损'
              : sl.over ? '终局'
              : sl.scenarioId ? (SCENARIOS.find(x => x.id === sl.scenarioId)?.name || '短剧本')
              : (DIFFICULTIES.find(d => d.id === sl.difficulty)?.name || '建炎北伐');
            return `<div class="save-slot ${sl.slot === act ? 'active' : ''}">
              <div class="ss-head"><b>第 ${sl.slot} 卷${sl.slot === act ? ' · 当前' : ''}</b><time>${esc(dateOf(sl.at))}</time></div>
              <div class="ss-info"><b>${esc(label)}</b><span>${sl.broken || sl.over ? '此卷不可载入' : `第 ${sl.turn} 回合 · 宋 ${sl.songN}／${sl.totalN} 州 · 局号 #${sl.seed ?? ''}`}</span></div>
              <div class="ss-btns">
                ${!sl.broken && !sl.over ? `<button class="btn-ghost" data-act="save-load" data-slot="${sl.slot}">载入</button>` : ''}
                ${inGame ? `<button class="btn-ghost" data-act="save-write" data-slot="${sl.slot}">存此卷</button>` : ''}
                <button class="btn-ghost danger" data-act="save-del" data-slot="${sl.slot}">删</button>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="set-foot-btns"><button class="btn-primary" data-act="close-saves">关闭</button></div>
      </div>`;
  }
  function openSaves() { renderSaves(); el.savesModal.hidden = false; sfx('click'); }
  function closeSaves() { el.savesModal.hidden = true; sfx('click'); }

  /** 进军模式：把 battle() 的算盘摊成可点选的推演列表 */
  function forecastHtml(s, fromId) {
    const from = s.cities[fromId];
    const send = Math.max(2, Math.floor(from.troops * 0.70));
    const rows = from.links.map(id => {
      const to = s.cities[id];
      const p = previewBattle(s, fromId, id);
      const parts = arr => arr.filter(x => Math.abs(x[1]) > 0.001).map(signed).join(' · ');
      const body = p.kind === 'move'
        ? `<div class="fc-meta">调 ${p.gain} 营实边 · 耗粮 ${p.cost} · 政令 ${p.decreeCost} 道</div>`
        : `<div class="fc-odds"><div class="fc-bar"><i style="width:${Math.round(p.chance * 100)}%;background:${p.chance >= 0.6 ? '#b5483a' : p.chance >= 0.35 ? '#b9924c' : '#3d4b60'}"></i></div><b>${fmtPct(p.chance)}</b><span>${p.verdict}</span></div>
           <div class="fc-meta">攻势 ${p.atkMin.toFixed(0)}~${p.atkMax.toFixed(0)} · 守势 ${p.defMin.toFixed(0)}~${p.defMax.toFixed(0)}</div>
           <div class="fc-meta">克城约存 ${p.survivors} 营 · 不利约折 ${p.loss} 营 · 耗粮 ${p.cost} · 政令 ${p.decreeCost} 道</div>
           <div class="fc-parts">${parts(p.atkParts)}<br>${parts(p.defParts)}</div>`;
      return `<button class="fc-row ${p.ok ? '' : 'disabled'}" data-act="pre-march" data-id="${id}" ${p.ok ? '' : 'disabled'} title="${esc(p.reason)}">
        <div class="fc-head"><b>${esc(to.name)}</b><span class="owner-mini ${to.owner}">${to.owner === 'song' ? '移防' : '攻城'}</span><span class="fc-troops">${to.troops} 营</span>
          ${p.cross ? `<em class="fc-cross">渡${esc(p.cross)}</em>` : ''}${p.isolated ? '<em class="fc-iso">孤军</em>' : ''}${p.stationed ? '<em class="fc-station">督</em>' : ''}</div>
        ${body}</button>`;
    }).join('');
    return `<section class="card forecast">
      <div class="card-eyebrow">进兵推演 <span class="decree-pip">自 ${esc(from.name)} 出 ${send} 营</span></div>
      <div class="fc-list">${rows}</div>
      <p class="card-note">渡河须另备舟楫：多耗一道政令与粮秣，攻势受挫；水师都督或御驾亲征可免政令。孤军无继、连营犄角、都督驻节与战法地形，皆已计入上列胜算。按 <kbd>Esc</kbd> 取消。</p>
    </section>`;
  }

  function attachWorld(w) {
    world = w;
    clearTimeout(rollFallback);
    // 三维舆图是异步 chunk：挂载完成时若仍在开场页，补上主题光色与机位（首屏不播运镜）。
    if (!started) {
      el.intro.classList.add('roll-ready');   // 卷轴展开，正好接住第一帧舆图
      w.setPresentation(true);
      applySceneTheme(true);
    }
    render();
  }

  function toast(msg, type = 'info') {
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.innerHTML = msg;
    el.toastWrap.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 350); }, 2300);
  }

  // ── 治略：只在模式开启时生成 DOM，关闭时左右栏与旧版逐字节一致 ──
  function econRosterHtml(s) {
    const ec = s.economy;
    const dispatchCity = dispatchCityId && s.cities[dispatchCityId]?.owner === 'song'
      ? dispatchCityId
      : (selected && s.cities[selected]?.owner === 'song' ? selected : (s.songCities[0]?.id || null));
    const ok = !!dispatchCity && s.decree >= 1 && !s.over && !s.pendingEvent
      && ec.dispatchTurn < DISPATCH_PER_TURN;
    return `
      <section class="card econ-roster">
        <div class="card-eyebrow">治略 · 诸臣历练 <span class="decree-pip">军械 ${ec.arms}／${ARMS_CAP}</span></div>
        <div class="econ-roster-list">
          ${HEROES.map(h => {
            const pg = heroProgress(ec, h.id);
            const office = h.id === s.heroId ? '主帅' : h.id === s.viceHeroId ? '分路' : '';
            const arts = pg.unlocked.map(m => `${m.name}（${m.desc}）`).join('；');
            return `<div class="econ-hero ${office ? 'office' : ''}" title="${esc(h.desc || '')}${arts ? `｜已悟：${esc(arts)}` : ''}${pg.locked.length ? `｜待悟：${esc(pg.locked.map(m => `Lv${m.at} ${m.name}`).join('、'))}` : ''}">
              <span class="eh-name">${esc(h.name)}</span>
              <span class="eh-lv">Lv${pg.level}</span>
              <span class="eh-bar"><i style="width:${Math.round(pg.ratio * 100)}%"></i></span>
              <span class="eh-exp">${pg.maxed ? '满级' : `${pg.exp}／${pg.next}`}</span>
              ${office ? `<span class="eh-office">${office}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="econ-dispatch">
          <label>差遣<select id="dispatchHero" aria-label="差遣之臣">${HEROES.map(h => `<option value="${h.id}" ${h.id === dispatchHeroId ? 'selected' : ''}>${esc(h.name)} · Lv${heroProgress(ec, h.id).level}</option>`).join('')}</select></label>
          <label>赴<select id="dispatchCity" aria-label="差遣州郡">${s.songCities.map(c2 => `<option value="${c2.id}" ${c2.id === dispatchCity ? 'selected' : ''}>${esc(c2.name)}</option>`).join('')}</select></label>
        </div>
        <div class="econ-task-row">${DISPATCH_TASKS.map(t => `<button class="econ-task" data-act="dispatch" data-id="${t.id}" ${ok ? '' : 'disabled'} title="${esc(t.desc)}">${t.name}</button>`).join('')}</div>
        <p class="card-note">差遣每员每回合一次、全朝至多 ${DISPATCH_PER_TURN} 遣（本回合余 ${Math.max(0, DISPATCH_PER_TURN - ec.dispatchTurn)}）；阅历由差遣、实战与驻节积攒，Lv3／Lv5 各悟一条专属战法，<b>只在拜为主帅或分帅时生效</b>。</p>
      </section>`;
  }

  function econBuildHtml(s, c) {
    if (!c || c.owner !== 'song') return '';
    const levels = buildingLevels(s.economy, c.id);
    return `
      <section class="card econ-build">
        <div class="card-eyebrow">治略 · ${esc(c.name)}营建 <span class="decree-pip">余 ${s.decree} 道</span></div>
        <div class="econ-build-list">
          ${BUILDINGS.map(b => {
            const lv = levels[b.id];
            const cost = buildCost(lv);
            const full = lv >= MAX_BUILDING_LEVEL;
            const ok = !full && !s.over && !s.pendingEvent && s.decree >= cost.decree
              && s.gold >= cost.gold && s.grain >= cost.grain;
            return `<button class="econ-build-row ${full ? 'full' : ''}" data-act="build" data-city="${c.id}" data-b="${b.id}" ${ok ? '' : 'disabled'} title="${esc(b.desc)}">
              <span class="eb-glyph">${b.glyph}</span>
              <span class="eb-main"><b>${esc(b.name)}</b><em>${full ? '已满级' : esc(b.effect(lv))}${lv ? `（现 ${lv} 级）` : ''}</em></span>
              <span class="eb-lv">${'●'.repeat(lv)}${'○'.repeat(MAX_BUILDING_LEVEL - lv)}</span>
              <span class="eb-cost">${full ? '—' : `${cost.gold} 钱 · ${cost.grain} 粮 · 1 令`}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="card-note">营建与进军争同一道政令；城池若陷，历年设施尽付兵燹。军械存量可加攻势（封顶 +12%），整军时亦耗 ${TRAIN_ARMS_COST} 副多募一营、省粮 3。</p>
      </section>`;
  }

  // ── 渲染 ──────────────────────────────────────────────────
  // 左右栏与战报是全量 innerHTML 重绘：焦点、下拉框当前值、滚动位置都会丢。
  // 每次 render 前后各做一次「记下 → 还原」，键盘操作才不会被一次政令打断。
  function captureFocus() {
    const a = document.activeElement;
    const list = el.log.querySelector('.log-list');
    const m = {
      logScroll: list ? list.scrollTop : 0,
      leftScroll: el.left.scrollTop, rightScroll: el.right.scrollTop,
      act: null, id: null, cmd: null, city: null, b: null, elementId: null, selectValue: null,
    };
    if (!a || a === document.body || !root.contains(a)) return m;
    m.act = a.dataset?.act || null;
    m.id = a.dataset?.id || null;
    m.cmd = a.dataset?.cmd || null;
    m.city = a.dataset?.city || null;
    m.b = a.dataset?.b || null;
    m.elementId = a.id || null;
    if (a.tagName === 'SELECT' || a.tagName === 'INPUT') m.selectValue = a.value;
    return m;
  }
  function restoreFocus(m) {
    const list = el.log.querySelector('.log-list');
    if (list) list.scrollTop = m.logScroll;
    el.left.scrollTop = m.leftScroll;
    el.right.scrollTop = m.rightScroll;
    if (!m.act && !m.elementId) return;
    let target = null;
    for (const n of root.querySelectorAll('[data-act], [id]')) {
      if (m.elementId && n.id === m.elementId) { target = n; break; }
      if (!m.act || n.dataset?.act !== m.act) continue;
      if (m.id && n.dataset.id !== m.id) continue;
      if (m.cmd && n.dataset.cmd !== m.cmd) continue;
      if (m.city && n.dataset.city !== m.city) continue;
      if (m.b && n.dataset.b !== m.b) continue;
      target = n; break;
    }
    if (!target || !target.isConnected || target.disabled) return;
    if (m.selectValue !== null && 'value' in target) target.value = m.selectValue;
    // 进场后开场页按钮已隐藏，别把焦点塞给不可见元素
    if (target.getClientRects().length) target.focus({ preventScroll: true });
  }

  function stat(label, value, unit, cls = '') {
    return `<div class="stat ${cls}"><span>${label}</span><b>${value}</b><small>${unit || ''}</small></div>`;
  }
  function bar(label, v, color) {
    return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i></div><b>${Math.round(v)}</b></div>`;
  }

  function render() {
    const focusMemo = captureFocus();
    const s = state;
    const ecoOn = !!(s.economyOn && s.economy);
    el.era.innerHTML = `<span class="era-main">${esc(s.yearName)}</span><span class="era-sub">${s.scenario ? `<i class="era-tag">${esc(s.scenario.name)}</i>` : ''}第 ${s.turn} / ${s.maxTurns} 回合</span>`;
    el.stats.innerHTML =
      stat('粮秣', s.grain, '万石', s.grain < 40 ? 'warn' : '') +
      stat('缗钱', s.gold, '万贯') +
      stat('民心', s.popularity, '', s.popularity < 35 ? 'warn' : '') +
      stat('士气', s.morale, '', s.morale < 40 ? 'warn' : '') +
      (s.economyOn && s.economy ? stat('军械', s.economy.arms, '副', 'econ') : '') +
      `<div class="stat decree"><span>政令</span><b>${s.decree}</b><small>道</small></div>`;

    const songN = s.songCities.length, jinN = s.jinCities.length;
    const obj = s.objective;
    const hero = s.hero;
    el.left.innerHTML = `
      <section class="card objective">
        <div class="card-eyebrow">${s.scenario ? '短剧本 · 军令' : '北伐大计'}</div>
        <h2>${esc(obj.text)}</h2>
        ${obj.items ? `<div class="goal-row scenario">${obj.items.map(g => `
          <div class="goal ${g.done ? 'done' : ''} ${g.optional ? 'optional' : ''}"><i>${g.done ? '✓' : '○'}</i>${esc(g.label)}${g.optional ? '<u>捷</u>' : ''}</div>`).join('')}</div>`
          : `<div class="goal-row">
          <div class="goal ${obj.kaifeng ? 'done' : ''}"><i>${obj.kaifeng ? '✓' : '○'}</i>东京开封</div>
          <div class="goal ${obj.yanjing ? 'done' : ''}"><i>${obj.yanjing ? '✓' : '○'}</i>燕京</div>
        </div>`}
        ${bar('版籍', songN / (songN + jinN) * 100, '#b5483a')}
        <div class="mini-row"><span>宋 ${songN} 州 · ${s.totalTroops} 营</span><span>金 ${jinN} 州 · ${s.jinTroops} 营</span></div>
        <div class="game-note">${s.scenario ? `${esc(s.scenario.era)} · ${esc(s.scenario.tag)} · 固定开局` : esc(s.diffDef.name)} · 局号 #${s.seed}${s.variant?.notes?.length ? '<br>' + esc(s.variant.notes.join('，')) : ''}</div>
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
        <div class="card-eyebrow">都督诸军事 <span class="decree-pip">两路分镇</span></div>
        <div class="hero-current">${hero ? `<b>${hero.name}</b><span>主帅 · ${hero.title} · 攻势 ${hero.atk >= 0 ? '+' : ''}${Math.round(hero.atk * 100)}%</span>` : '<b>阙员</b><span>未拜主帅，诸军不相统属</span>'}</div>
        ${hero?.art ? `<div class="art-line"><b>${esc(hero.art.name)}</b><span>${esc(hero.art.desc)}（全军常效）</span></div>` : ''}
        <div class="station-line ${s.heroCity ? 'on' : ''}">${s.heroCity ? `主帅持节驻 <b>${esc(s.cities[s.heroCity]?.name || '—')}</b> · 本城战法 ×1.6、城守 +12%` : '主帅未驻节 · 战法仅得常效'}</div>
        ${s.viceHero ? `
          <div class="hero-current vice"><b>${s.viceHero.name}</b><span>分路 · ${s.viceHero.title}</span><button class="vice-dismiss" data-act="vice-dismiss" title="罢分路幕府，省下每回合粮耗">罢</button></div>
          <div class="art-line"><b>${esc(s.viceHero.art?.name || '诸军')}</b><span>${esc(s.viceHero.art?.desc || '')}（只及驻节本城）</span></div>
          <div class="station-line ${s.viceHeroCity ? 'on' : ''}">${s.viceHeroCity ? `分帅持节驻 <b>${esc(s.cities[s.viceHeroCity]?.name || '—')}</b> · 本城战法 ×1.6、城守 +12%` : '分帅未驻节 · 须于州郡面板命其持节'}</div>`
          : '<div class="station-line">未置分路 · 拜主帅后可再择一将别镇一路（每回合加耗 2 粮、主和 +2）</div>'}
        <div class="hero-route-row">
          <button data-act="hero-route" data-route="main" class="${heroRoute === 'main' ? 'active' : ''}">拜主帅</button>
          <button data-act="hero-route" data-route="vice" class="${heroRoute === 'vice' ? 'active' : ''}" ${hero ? '' : 'disabled'}>拜分路 · ${VICE_COST_GOLD} 钱</button>
        </div>
        <div class="hero-list">
          ${HEROES.map(h => {
            const active = heroRoute === 'vice' ? s.viceHeroId === h.id : s.heroId === h.id;
            const taken = heroRoute === 'vice' ? s.heroId === h.id : s.viceHeroId === h.id;
            return `
            <button class="hero-item ${active ? 'active' : ''} ${taken ? 'taken' : ''}" data-act="hero" data-id="${h.id}" data-route="${heroRoute}" title="${esc(h.desc)}｜战法：${esc(h.art?.name || '—')} ${esc(h.art?.desc || '')}${taken ? '｜已领另一路' : ''}｜宜：${esc(HERO_USE[h.id] || '')}">
              <span class="hero-name">${h.name}</span>
              <span class="hero-tag ${h.faction === '主和' ? 'he' : h.faction === '主战' ? 'zhan' : ''}">${h.faction}</span>
              <span class="hero-meta">${esc(h.art?.short || '')}${ecoOn ? ` · Lv${heroProgress(s.economy, h.id).level}` : ''}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="card-note">八员各有其时（悬停可看）：平原用步阵、水网用水师、守势吃紧用城守、孤城用据险；粮紧用漕运、政令不足用庙算、兵额常满用众兵——文臣任分路时补半额政令与漕粮。主帅总戎事，战法与朝政及于全军；分帅只节制驻节本城，另置幕府耗缗钱与粮，且诸将分镇、主和渐长。一州不置二节，换将则旧驻节作废。</p>
      </section>
      ${ecoOn ? econRosterHtml(s) : ''}
    `;

    const c = selected ? s.cities[selected] : null;
    const sup = supplyMap(s);
    const cap = c ? troopCap(s, c) : 0;
    const fordOf = id => (c ? riverBetween(c, s.cities[id]) : null);
    const fords = c ? [...new Set(c.links.map(fordOf).filter(Boolean).map(r => r.name))] : [];
    const linked = c ? sup.linked.has(c.id) : false;
    const can = {
      zhengjun: c && c.owner === 'song' && s.decree >= 1 && s.grain >= 18 && s.gold >= 12
        && c.lastTrainTurn !== s.turn && c.troops < cap,
      march: c && c.owner === 'song' && s.decree >= 1 && s.grain >= 12,
      chouliang: s.decree >= 1,
      anfu: s.decree >= 1 && s.grain >= 15,
      qinzheng: s.decree >= 2 && s.canQinzheng,
      heyi: s.decree >= 1 && s.gold >= 55,
    };
    const btn = (cmd, label, desc, ok) => `<button class="cmd ${ok ? '' : 'off'}" data-act="cmd" data-cmd="${cmd}" ${ok ? '' : 'disabled'}><b>${label}</b><span>${desc}</span></button>`;
    const stationBtn = (route, h, atCity, cityId) => {
      const here = atCity === cityId;
      const other = route === 'main' ? s.viceHeroCity : s.heroCity;
      const blocked = other === cityId;
      return `<button class="station-btn ${here ? 'active' : ''} ${route === 'vice' ? 'vice' : ''}"
          data-act="dujun" data-route="${route}" data-id="${cityId}"
          ${here || blocked || s.decree < 1 || s.over ? 'disabled' : ''}>
          ${here ? `✔ ${esc(h.name)}持节驻此` : blocked ? '他路已持节此州' : `命${esc(h.name)}驻节此州`}
          <em>${here ? '已驻节' : blocked ? '一州不置二节' : route === 'vice' ? '分路 · 1 道政令' : '主帅 · 1 道政令'}</em>
        </button>`;
    };

    el.right.innerHTML = `
      <section class="card city-card">
        <div class="card-eyebrow">州郡舆情</div>
        ${c ? `
          <div class="city-head"><h2>${esc(c.name)}</h2><span class="owner ${c.owner}">${c.owner === 'song' ? '宋' : '金'}</span></div>
          <div class="city-tags">
            <span>${TERRAIN_LABEL[c.terrain]}</span>
            <span>守险 +${Math.round(({ plain: 0, mountain: 0.35, river: 0.2, coast: 0.1 }[c.terrain]) * 100)}%</span>
            <span>兵额 ${cap}</span>
            ${c.seat ? '<span class="gold">行在</span>' : ''}${c.capitalOfJin ? '<span class="gold">旧都</span>' : ''}
            ${c.owner === 'song' ? `<span class="supply-tag ${linked ? 'ok' : 'cut'}">${linked ? '粮道通' : '孤城无援'}</span>` : ''}
            ${sup.support[c.id] ? `<span class="supply-tag">连营 ${sup.support[c.id]}</span>` : ''}
            ${fords.length ? `<span class="ford-tag">${esc(fords.join('·'))}津渡</span>` : ''}
          </div>
          <div class="city-stats">
            <div><span>驻军</span><b>${c.troops} 营</b></div>
            <div><span>岁赋</span><b>${c.yieldGrain} 粮</b></div>
            <div><span>粮道</span><b class="txt ${c.owner === 'song' && !linked ? 'warn' : ''}">${c.owner === 'song' ? (linked ? '通行在' : '断绝') : '金据'}</b></div>
            <div><span>连营</span><b class="txt">${sup.support[c.id] || 0} 处</b></div>
          </div>
          ${c.owner === 'song' ? `
            ${s.hero ? stationBtn('main', s.hero, s.heroCity, c.id) : ''}
            ${s.viceHero ? stationBtn('vice', s.viceHero, s.viceHeroCity, c.id) : ''}
          ` : ''}
          <div class="link-label">官道所通 <span class="link-legend">· 蓝字为津渡，金城后标胜算</span></div>
          <div class="link-list">${c.links.map(id => {
            const n = s.cities[id];
            const p = c.owner === 'song' && n.owner === 'jin' ? previewBattle(s, c.id, id) : null;
            const cls = !p ? '' : p.chance >= 0.6 ? 'good' : p.chance >= 0.35 ? 'mid' : 'low';
            const ford = fordOf(id);
            return `<button class="link-chip ${n.owner} ${ford ? 'ford' : ''}" data-act="pick" data-id="${id}" title="${ford ? `渡${esc(ford.name)} · ` : ''}${p ? `胜算 ${fmtPct(p.chance)} · ${p.verdict}` : '官道相通'}">${esc(n.name)} <i>${n.troops}</i>${ford ? '<u>渡</u>' : ''}${p ? `<em class="odds ${cls}">${fmtPct(p.chance)}</em>` : ''}</button>`;
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

      ${ecoOn ? econBuildHtml(s, c) : ''}

      ${marchFrom ? forecastHtml(s, marchFrom) : ''}

      <section class="card commands">
        <div class="card-eyebrow">军政指令 <span class="decree-pip">余 ${s.decree} 道</span></div>
        <div class="cmd-grid">
          ${btn('zhengjun', '整军', '18 粮 · 12 钱 · +3 营', can.zhengjun)}
          ${btn('march', '进军', c && c.owner === 'song' ? '点选相邻州郡' : '先择己方州郡', can.march)}
          ${btn('chouliang', '筹粮', '+40 粮 · 民心 -4', can.chouliang)}
          ${btn('anfu', '安抚', '15 粮 · 民心 +9', can.anfu)}
          ${btn('qinzheng', '御驾亲征', `2 政令 · 攻势 +25% · 余 ${Math.max(0, MAX_CHARGE - (s.chargeUsed || 0))} 次`, can.qinzheng)}
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
      el.hint.innerHTML = `<span class="pulse"></span>进军：自 <b>${esc(s.cities[marchFrom].name)}</b> 点选相邻州郡，或于右栏「进兵推演」择胜算而行<button data-act="cancel-march">取消 · Esc</button>`;
    } else {
      el.hint.hidden = true;
      el.hint.innerHTML = '';
    }

    el.right.classList.toggle('marching', !!marchFrom);
    // setSelection 内部已同步一次舆图状态；勿再调 update，托管时每步都会放大成双倍重绘
    world?.setSelection(selected, marchFrom ? s.cities[marchFrom].links : []);
    renderAlerts();
    updateAutoHud();
    restoreFocus(focusMemo);
  }

  // ── 托管推演 ──────────────────────────────────────────────
  function updateAutoHud() {
    if (!el.autoHud) return;
    const total = Object.keys(state.cities).length;
    el.autoPhase.textContent = phaseOf(state);
    el.autoRound.textContent = `第 ${auto.game} 局 · ${state.yearName} · 第 ${state.turn}/${state.maxTurns} 回合`;
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
    undoStack.length = 0;   // 托管与手动不共用悔棋栈
    updateUndoTool();
    if (!started) {
      started = true;
      state.reset(resetOpts({ difficulty: chosenDifficulty }));
    }
    hideIntro();
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
    persist();
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

  function doMarch(fromId, toId) {
    pushUndo();
    marchFrom = null;
    sfx('war');
    state.jinjun(fromId, toId);
    selectCity(toId, true);
  }

  function handlePick(id) {
    if (auto.running) return;   // 托管期间舆图只读，避免与推演争令
    if (state.over || state.pendingEvent || el.intro.hidden === false) return;
    if (marchFrom) {
      const from = state.cities[marchFrom];
      if (id === marchFrom) { cancelMarch(); return; }
      if (from.links.includes(id)) { doMarch(from.id, id); return; }
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
    if (cmd !== 'march') pushUndo();   // 「进军」只切换推演视图，真正下令在 doMarch
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

  // 战局卡片的轻反馈：只在换卡片时响一声，pointerover 连发不会吵；
  // 高光跟随指针但只用 background-position，不改 transform，文字不会抖。
  let hoveredScene = null;
  el.sceneList.addEventListener('pointerover', e => {
    const card = e.target.closest('.scene-card');
    if (!card || card === hoveredScene) return;
    hoveredScene = card;
    sfx('hover');
  });
  el.sceneList.addEventListener('pointerleave', () => { hoveredScene = null; });
  el.sceneList.addEventListener('focusin', e => {
    const card = e.target.closest('.scene-card');
    if (card && card !== hoveredScene) { hoveredScene = card; sfx('hover'); }
  });
  el.sceneList.addEventListener('pointermove', e => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--scene-px', `${((e.clientX - r.left) / r.width * 100).toFixed(1)}%`);
  });

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

    // 悔棋与窄屏抽屉在托管时仍可查看，但悔棋本身会自行拦下
    if (act === 'undo') { undo(); return; }
    if (act === 'drawer') {
      setDrawerTab(btn.dataset.id);
      sfx('click');
      return;
    }

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

    const passive = ['help', 'close-help', 'mute', 'reset-cam', 'toggle-log',
      'settings', 'close-settings', 'set-toggle', 'set-select', 'set-copy', 'set-reset', 'set-apply',
      'saves', 'close-saves'];
    if (auto.running && !passive.includes(act)) { toast('托管推演中，请先停止托管。'); return; }

    // 预警条点选：跳到出事的州郡
    if (act === 'alert-pick') { handlePick(btn.dataset.id); world?.focusCity(btn.dataset.id); return; }

    // 存档三卷：载入／另存／删
    if (act === 'saves') { openSaves(); return; }
    if (act === 'close-saves') { closeSaves(); return; }
    if (act === 'save-load') {
      const slot = Number(btn.dataset.slot);
      setActiveSlot(slot);
      closeSaves();
      if (!resumeGame()) { toast('此卷已损，不可载入。', 'bad'); renderSaves(); return; }
      toast(`已载入第 ${slot} 卷 · 第 ${state.turn} 回合。`);
      return;
    }
    if (act === 'save-write') {
      const slot = Number(btn.dataset.slot);
      flushSave();                       // 先落当前局，再整卷另存，两不误
      if (writeSave(state, slot)) toast(`已存入第 ${slot} 卷，此后逐令自动写入此卷。`);
      else toast('存档失败：本机存储不可用。', 'bad');
      renderSaves();
      sfx('click');
      return;
    }
    if (act === 'save-del') {
      const slot = Number(btn.dataset.slot);
      clearSave(slot);
      renderSaves();
      toast(`第 ${slot} 卷已删。`);
      sfx('click');
      return;
    }

    // 设置面板：托管期间也可查看，重载类动作由 applyReload 自行拦下
    if (act === 'settings') { openSettings(); return; }
    if (act === 'close-settings') { closeSettings(); return; }
    if (act === 'set-toggle') {
      const id = btn.dataset.id;
      if (settingById(id)) changeSetting(id, !settings.values[id]);
      return;
    }
    if (act === 'set-select') { changeSetting(btn.dataset.id, btn.dataset.v); return; }
    if (act === 'set-apply') { applyReload(); return; }
    if (act === 'set-reset') { resetAllSettings(); return; }
    if (act === 'set-copy') { copySettingsLink(); return; }

    if (act === 'start') {
      started = true;
      state.reset(resetOpts({ difficulty: chosenDifficulty }));
      undoStack.length = 0;
      updateUndoTool();
      hideIntro(true);
      render();
      persist();
      sfx('enter');
      // 首次开长局走分步引导；短剧本有朱批圈与军令卡自带引导，一句话即可。
      // 有进场卷轴时等它合拢（900ms）再浮现，免得两层叠在一起。
      if (chosenMode === 'campaign') {
        if (skipIntroMotion) startGuide();
        else setTimeout(startGuide, 950);
      } else firstTip();
      return;
    }
    if (act === 'continue') {
      const best = bestSlot();
      if (best) setActiveSlot(best.slot);
      if (!resumeGame()) { toast('旧档已损，请另开新局。', 'bad'); return; }
      return;
    }
    // 战局卡片是「mode + scenario」的合一入口：复用同一套配置写入与链接同步，
    // 不另建持久化，故 ?scenario= 与设置面板始终看到同一份选择。
    if (act === 'scene') {
      const id = SCENE_IDS.includes(btn.dataset.id) ? btn.dataset.id : 'campaign';
      if (id === 'campaign') chosenMode = 'campaign';
      else { chosenMode = 'scenario'; chosenScenario = id; writeScenario(id); }
      settings.set('scenario', id);
      syncUrl();
      renderIntro();
      sfx('scene');
      return;
    }
    if (act === 'mode') {
      chosenMode = btn.dataset.id === 'scenario' ? 'scenario' : 'campaign';
      settings.set('scenario', chosenMode === 'scenario' ? chosenScenario : 'campaign');
      syncUrl();
      renderIntro();
      sfx('click');
      return;
    }
    if (act === 'scenario') {
      chosenScenario = btn.dataset.id;
      writeScenario(chosenScenario);
      settings.set('scenario', chosenScenario);
      syncUrl();
      renderIntro();
      sfx('click');
      return;
    }
    if (act === 'difficulty') {
      chosenDifficulty = btn.dataset.id;
      writeDiff(chosenDifficulty);
      settings.set('difficulty', chosenDifficulty);
      syncUrl();
      renderIntro();
      sfx('click');
      return;
    }
    // 治略：营建 / 差遣都是一道政令，走与军政指令相同的悔棋与存档链路
    if (act === 'build' || act === 'dispatch') {
      if (!state.economyOn || state.over || state.pendingEvent) return;
      const heroSel = el.left.querySelector('#dispatchHero');
      const citySel = el.left.querySelector('#dispatchCity');
      if (heroSel) dispatchHeroId = heroSel.value;
      if (citySel) dispatchCityId = citySel.value;
      const before = state.logs[0];
      // 营建／差遣可能因政令、额度、府库不足被拒；只有真正生效的那一令才记入悔棋栈，
      // 否则玩家按一次「悔棋」只是弹出一份没有变化的快照，看起来像按钮失灵。
      const snap = snapUndo();
      const ok = act === 'build'
        ? state.yingjian(btn.dataset.city, btn.dataset.b)
        : state.chaiqian(dispatchHeroId, dispatchCityId, btn.dataset.id);
      if (ok) { commitUndo(snap); sfx('click'); }
      else {
        const last = state.logs[0];
        toast(last && last !== before ? esc(last.text) : '此事暂不可行。', 'bad');
      }
      render();
      return;
    }
    if (act === 'pre-march') {
      if (!marchFrom || state.over || state.pendingEvent) return;
      const id = btn.dataset.id;
      const p = previewBattle(state, marchFrom, id);
      if (!p.ok) { toast(esc(p.reason), 'bad'); return; }
      doMarch(marchFrom, id);
      return;
    }
    if (act === 'toggle-log') { logCollapsed = !logCollapsed; render(); sfx('click'); return; }
    if (act === 'help') { el.helpModal.hidden = false; sfx('click'); return; }
    if (act === 'close-help') { el.helpModal.hidden = true; sfx('click'); return; }
    if (act === 'mute') {
      setMuted(!muted);
      settings.set('mute', muted);
      syncUrl();
      if (!el.settingsModal.hidden) renderSettings();
      return;
    }
    if (act === 'reset-cam') { world?.resetCamera(); sfx('click'); return; }
    if (act === 'restart' || act === 'restart-game') {
      if (act === 'restart' && !state.over && state.turn > 1 && !window.confirm('重开一局？当前进度与存档将由新局取代。')) return;
      restart();
      return;
    }
    if (act === 'cancel-march') { cancelMarch(); return; }
    if (act === 'pick') { handlePick(btn.dataset.id); world?.focusCity(btn.dataset.id); return; }
    if (act === 'hero-route') {
      heroRoute = btn.dataset.route === 'vice' ? 'vice' : 'main';
      render(); sfx('click'); return;
    }
    if (act === 'vice-dismiss') { pushUndo(); state.dismissVice(); sfx('click'); return; }
    if (act === 'hero') {
      const route = btn.dataset.route === 'vice' ? 'vice' : 'main';
      const current = route === 'vice' ? state.viceHeroId : state.heroId;
      if (current === btn.dataset.id) { toast('此公已领这一路。'); return; }
      pushUndo();
      state.renming(btn.dataset.id, route);
      sfx('event');
      return;
    }
    if (act === 'dujun') { pushUndo(); state.dujun(btn.dataset.id, btn.dataset.route); sfx('event'); return; }
    if (act === 'cmd') { runCmd(btn.dataset.cmd); return; }
    if (act === 'end-turn') {
      if (state.over || state.pendingEvent) return;
      pushUndo();
      marchFrom = null;
      sfx('click');
      state.endTurn();
      render();
      return;
    }
    if (act === 'event-opt') {
      const i = Number(btn.dataset.i);
      pushUndo();
      el.eventModal.hidden = true;
      state.resolveEvent(i);
      sfx('click');
      return;
    }
  });

  // 文本型配置（固定局号）在失焦／回车时提交；输入期间不触发键盘快捷键。
  root.addEventListener('change', e => {
    const input = e.target.closest?.('[data-set-text]');
    if (input) changeSetting(input.dataset.setText, input.value);
    if (e.target.id === 'dispatchHero') dispatchHeroId = e.target.value;
    if (e.target.id === 'dispatchCity') dispatchCityId = e.target.value;
  });

  function restart(quiet = false) {
    // 「重开一局」始终重开当前这一关；要换回全图须回开场页切换战局
    if (state.scenario) { chosenMode = 'scenario'; chosenScenario = state.scenario.id; }
    else chosenMode = 'campaign';
    state.reset(resetOpts());
    undoStack.length = 0;
    updateUndoTool();
    chosenDifficulty = state.difficulty;
    writeDiff(chosenDifficulty);
    clearSave();
    persist();
    renderIntro();
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
    // 引导期间屏蔽局内快捷键，只留 Esc 跳过／回车下一步
    if (guideLayer) {
      if (e.key === 'Escape') { endGuide(false); return; }
      if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        guideStep++;
        if (guideStep >= GUIDE_STEPS.length) endGuide(true); else renderGuideStep();
        sfx('click');
      }
      return;
    }
    // 组合键交还浏览器（Ctrl+A 全选、Ctrl+R 刷新等），唯 Ctrl/Cmd+Z 按玩法所述作悔棋。
    // 否则 Ctrl+A 会在用户想全选文字时意外开启托管推演。
    const undoKey = e.key === 'z' || e.key === 'Z';
    const mod = e.ctrlKey || e.metaKey || e.altKey;
    if (mod && !(undoKey && (e.ctrlKey || e.metaKey) && !e.altKey)) return;
    if (undoKey) { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') {
      if (!el.settingsModal.hidden) { closeSettings(); return; }
      if (!el.savesModal.hidden) { closeSaves(); return; }
      if (!el.helpModal.hidden) { el.helpModal.hidden = true; return; }
      if (marchFrom) { cancelMarch(); return; }
    }
    // S 在开场页也能打开设置；事件／结局弹窗期间不让叠层
    if (e.key === 's' || e.key === 'S') {
      if (!el.eventModal.hidden || !el.endModal.hidden) return;
      if (el.settingsModal.hidden) openSettings(); else closeSettings();
      return;
    }
    // 开场页：↑↓ 依次切换战局卡片，走与鼠标点击完全相同的路径（含链接同步）
    if (!el.intro.hidden && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (!el.settingsModal.hidden || !el.helpModal.hidden) return;
      e.preventDefault();
      const cur = SCENE_IDS.indexOf(activeSceneId());
      const next = SCENE_IDS[(cur + (e.key === 'ArrowDown' ? 1 : SCENE_IDS.length - 1)) % SCENE_IDS.length];
      el.sceneList.querySelector(`.scene-card[data-id="${next}"]`)?.click();
      return;
    }
    // 弹窗／开场页期间不响应局内快捷键，A 尤其不能越过开场页直接起托管
    if (!el.settingsModal.hidden || !el.helpModal.hidden || !el.savesModal.hidden || !el.eventModal.hidden || !el.endModal.hidden || !el.intro.hidden) return;
    if (e.key === 'a' || e.key === 'A') { toggleAuto(); return; }
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
        <div class="event-top"><span class="event-tag">${esc(ev.tag)}</span>${ev.priority ? '<span class="event-chain">前后相因</span>' : ''}<span class="event-era">${esc(state.yearName)} · 第 ${state.turn} 回合</span></div>
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
    clearSave();
    renderIntro();
    sfx(over.kind === 'win' ? 'win' : 'lose');
    const songN = state.songCities.length;
    el.endBody.innerHTML = `
      <div class="end-card ${over.kind}">
        <div class="end-seal">${over.kind === 'win' ? '中<br>兴' : '南<br>渡'}</div>
        <div class="eyebrow">${state.scenario ? `${esc(state.scenario.name)} · ` : ''}${over.kind === 'win' ? '大 功 告 成' : '大 势 已 去'}</div>
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

  state.on('change', () => { render(); persist(); });
  state.on('event', showEvent);
  state.on('end', showEnd);
  state.on('march', payload => world?.march(payload));

  root.dataset.drawer = 'none';
  el.muteBtn.textContent = muted ? '♪̸' : '♪';
  el.muteBtn.classList.toggle('off', muted);
  updateUndoTool();
  render();
  renderIntro();
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
  return {
    attachWorld, render, handlePick, toast, sfx, undo, resumeGame,
    startAuto, stopAuto, toggleAuto,
    get autoRunning() { return auto.running; },
  };
}
