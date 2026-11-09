import './style.css';
import { GameState } from './rules.js';
import { createUI } from './ui.js';
import { createSettings, derive, RESUME_KEY } from './settings.js';

const sceneEl = document.getElementById('scene');
const uiEl = document.getElementById('ui');

// 所有预览参数、局号、战局与偏好统一由 settings.js 解析：
// URL 显式参数 > 已保存偏好 > 出厂默认，设置面板与链接始终一致。
const settings = createSettings(location.search);
const systemReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

// 自动性能档按核心数、内存、屏幕与 DPR 判定；空间 chunk/LOD 仍需真机帧率数据再排期。
function autoQuality() {
  const cores = navigator.hardwareConcurrency || 8;   // 未知时按充足估计，不误降档
  const mem = navigator.deviceMemory || 8;
  const narrow = window.matchMedia?.('(max-width: 760px)')?.matches;
  return (cores <= 4 || mem <= 4 || narrow || (window.devicePixelRatio || 1) > 2.5) ? 'low' : 'high';
}
const cfg = derive(settings.values, { systemReducedMotion, autoQuality: autoQuality() });
const { quality, reducedMotion, ink, atmos, units, tex, ctex, capitals, trees, terrain, mat, grade, economy } = cfg;
const fixedSeed = cfg.seed;                 // ?seed=123456 固定局号：变局、战斗、事件全由此派生
const initialScenario = cfg.scenario;       // ?scenario=shunchang 预选短剧本

// 首屏只依赖 CSS + 规则层 + UI：开场页与状态条先画出来，
// three.js 与整套程序化建模走异步 chunk，不再压在首屏关键路径上。
const state = new GameState({
  ...(fixedSeed === null ? {} : { seed: fixedSeed }),
  ...(initialScenario ? { scenario: initialScenario } : {}),
  economy,
});
const ui = createUI(uiEl, state, {
  seed: fixedSeed, scenario: initialScenario,
  difficulty: cfg.difficulty, muted: cfg.muted, settings,
  reducedMotion, quality, grade,   // 开场页运镜与低配／减弱动效互斥
});

sceneEl.innerHTML = '<div class="scene-loading">三 维 舆 图 展 开 中 …</div>';

// 调试／自动化入口：可在控制台查看局面、生效配置或启动托管推演
window.__shaosong = {
  state, ui, world: null, fixedSeed, initialScenario, worldReady: null,
  quality, reducedMotion, ink, atmos, units, tex, ctex, capitals, trees, terrain, mat, grade, economy,
  settings, derived: cfg,
};

// 设置面板改动渲染参数后重载：若原本在对局中，自动续回原局面，不把官家踢回开场页。
let resumePending = false;
try {
  resumePending = sessionStorage.getItem(RESUME_KEY) === '1';
  if (resumePending) sessionStorage.removeItem(RESUME_KEY);
} catch (_) { /* 隐私模式 */ }
if (cfg.auto) ui.startAuto();
else if (resumePending) ui.resumeGame();

async function mountWorld() {
  try {
    const { createWorld } = await import('./world.js');
    sceneEl.replaceChildren();
    const world = createWorld(sceneEl, state, { onPick: id => ui.handlePick(id), quality, reducedMotion, ink, atmos, units, tex, ctex, capitals, trees, terrain, mat });
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
