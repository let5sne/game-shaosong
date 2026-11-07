import './style.css';
import { GameState } from './rules.js';
import { createWorld } from './world.js';
import { createUI } from './ui.js';

const sceneEl = document.getElementById('scene');
const uiEl = document.getElementById('ui');

const state = new GameState();
const ui = createUI(uiEl, state);

// 调试／自动化入口：可在控制台查看局面或启动托管推演
window.__shaosong = { state, ui, world: null };

// ?auto=1 打开即进入托管推演。同步启动，免得首帧 WebGL 初始化把状态条压后好几秒
if (new URLSearchParams(location.search).has('auto')) {
  ui.startAuto();
}

try {
  const world = createWorld(sceneEl, state, {
    onPick: id => ui.handlePick(id),
  });
  window.__shaosong.world = world;
  ui.attachWorld(world);
} catch (err) {
  console.error(err);
  sceneEl.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;font:16px serif;color:#6b2d24;background:#ece3cd;text-align:center;line-height:2">
    三维舆图未能展开<br><small>请在支持 WebGL 的浏览器中打开，或检查显卡加速是否开启。</small></div>`;
}
