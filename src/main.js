import './style.css';
import { GameState } from './rules.js';
import { createUI } from './ui.js';

const sceneEl = document.getElementById('scene');
const uiEl = document.getElementById('ui');

const params = new URLSearchParams(location.search);
const seedArg = Number(params.get('seed'));
// ?seed=123456 固定局号：变局、战斗、事件全部由此派生，可重演同一局
const fixedSeed = params.has('seed') && Number.isFinite(seedArg) && seedArg > 0 ? seedArg >>> 0 : null;

// 首屏只依赖 CSS + 规则层 + UI：开场页与状态条先画出来，
// three.js 与整套程序化建模走异步 chunk，不再压在首屏关键路径上。
const state = new GameState(fixedSeed === null ? {} : { seed: fixedSeed });
const ui = createUI(uiEl, state, { seed: fixedSeed });

sceneEl.innerHTML = '<div class="scene-loading">三 维 舆 图 展 开 中 …</div>';

// 性能档：可由 ?quality=low/high 覆盖，否则按核心数、内存、屏幕与 DPR 自动判定。
// 空间 chunk/LOD 仍需真机帧率数据再排期，这里只做「同一套几何的不同密度与开销」。
function chooseQuality() {
  const q = params.get('quality');
  if (q === 'low' || q === 'high') return q;
  const cores = navigator.hardwareConcurrency || 8;   // 未知时按充足估计，不误降档
  const mem = navigator.deviceMemory || 8;
  const narrow = window.matchMedia?.('(max-width: 760px)')?.matches;
  return (cores <= 4 || mem <= 4 || narrow || (window.devicePixelRatio || 1) > 2.5) ? 'low' : 'high';
}
const quality = chooseQuality();
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
// 宣纸增强（墨晕／描边／纸纹／色调）：high 档默认开，low 档默认关以免拖慢软件渲染。
// ?ink=0/1 强制关／开；world.ink.setEnabled() 还能在运行时逐帧切换做 A/B 对比。
const inkArg = params.get('ink');
const ink = inkArg === '0' ? false : inkArg === '1' ? true : quality === 'high';

// 调试／自动化入口：可在控制台查看局面或启动托管推演
window.__shaosong = { state, ui, world: null, fixedSeed, worldReady: null, quality, reducedMotion, ink };

// ?auto=1 打开即进入托管推演，不必等 WebGL 初始化。托管期间的 state 事件
// 在 world 尚未挂载时由可选链安全跳过，attachWorld 会以当前局面重绘一次。
if (params.has('auto')) {
  ui.startAuto();
}

async function mountWorld() {
  try {
    const { createWorld } = await import('./world.js');
    sceneEl.replaceChildren();
    const world = createWorld(sceneEl, state, { onPick: id => ui.handlePick(id), quality, reducedMotion, ink });
    window.__shaosong.world = world;
    ui.attachWorld(world);
    return world;
  } catch (err) {
    console.error(err);
    sceneEl.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;font:16px serif;color:#6b2d24;background:#ece3cd;text-align:center;line-height:2">
      三维舆图未能展开<br><small>请在支持 WebGL 的浏览器中打开，或检查显卡加速是否开启。</small></div>`;
    return null;
  }
}

// 让开场页真正画出一帧，再把重量级的几何生成排到后面
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
window.__shaosong.worldReady = nextPaint().then(mountWorld);
