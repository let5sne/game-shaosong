/**
 * HUD 模板与静态文案：整份界面骨架、玩法略要、首局引导步骤。
 * 这里只有字符串，不碰 DOM 与状态——改文案不会牵动事件绑定与渲染时序。
 */
import { DIFFICULTIES, SCENARIOS } from './data.js';
import { SCENE_IDS, SCENE_THEMES } from './themes.js';
import { MAX_CHARGE, VICE_COST_GOLD, VICTORY_JIN_LIMIT } from './rules.js';

/** 战局卡片：纯展示，选中态由 renderIntro / applySceneTheme 同步。 */
const SCENE_CARDS = SCENE_IDS.map((id, i) => {
  const t = SCENE_THEMES[id];
  return `<button class="scene-card ${i === 0 ? 'active' : ''}" data-act="scene" data-id="${id}" style="--scene-accent:${t.accent}">
    <span class="scene-season">${t.season}</span>
    <span class="scene-name"><b>${t.name}</b><em>${t.tag}</em></span>
    <span class="scene-era">${t.era}</span>
  </button>`;
}).join('');

export const TEMPLATE = `
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

/** 首局分步引导的五段文案；聚光落在哪一栏由 ui.js 依窄屏与否决定 */
export const GUIDE_STEPS = [
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
