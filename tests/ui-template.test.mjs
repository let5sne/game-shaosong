/**
 * HUD 模板结构护栏：模板搬到独立模块后，DOM 骨架必须逐字未动。
 * ui.js 的 el 映射、事件委托与实机 smoke 都依赖这些 id 与 data-act。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE, GUIDE_STEPS } from '../src/ui-template.js';
import { MAX_CHARGE, VICE_COST_GOLD, VICTORY_JIN_LIMIT } from '../src/rules.js';

/** ui.js 里 el 映射用到的全部 id；少一个就有面板取不到节点 */
const REQUIRED_IDS = [
  'eraText', 'topStats', 'leftPanel', 'rightPanel', 'logBox', 'modeHint', 'toastWrap',
  'intro', 'eventModal', 'eventBody', 'endModal', 'endBody', 'helpModal', 'muteBtn',
  'settingsModal', 'settingsBody', 'settingsFoot', 'settingsUrl', 'settingsBtn',
  'savesModal', 'savesBody', 'savesBtn', 'alertBar',
  'autoBtn', 'autoHud', 'autoPhase', 'autoRound', 'autoDecision', 'autoBar',
  'autoProgress', 'autoPause', 'autoSpeed', 'autoRestart', 'autoStop',
  'diffRow', 'diffDesc', 'variantNote', 'continueBtn', 'modeRow', 'scenarioRow',
  'scenarioBrief', 'startBtn', 'sceneList', 'sceneDetail', 'undoBtn', 'mobileTabs',
];

/** 模板里静态写死的 data-act；动态面板（设置行、州郡卡等）不在此列 */
const REQUIRED_ACTS = [
  'scene', 'mode', 'difficulty', 'scenario', 'start', 'continue', 'saves',
  'auto-start', 'settings', 'mute', 'reset-cam', 'undo', 'auto', 'help',
  'drawer', 'auto-pause', 'auto-speed', 'auto-restart', 'auto-stop', 'close-help',
];

test('模板已求值：不残留 ${} 占位符', () => {
  assert.ok(!TEMPLATE.includes('${'), '模板字符串应在 import 时就插值完毕');
});

test('模板包含 el 映射所需的全部 id', () => {
  const missing = REQUIRED_IDS.filter(id => !TEMPLATE.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `模板缺少 id: ${missing.join(', ')}`);
});

test('模板包含全部静态 data-act', () => {
  const missing = REQUIRED_ACTS.filter(a => !TEMPLATE.includes(`data-act="${a}"`));
  assert.deepEqual(missing, [], `模板缺少 data-act: ${missing.join(', ')}`);
});

test('模板骨架：开场页、三栏 HUD、四个弹窗与托管条齐备', () => {
  assert.match(TEMPLATE, /<div class="hud">/);
  assert.match(TEMPLATE, /<div class="scrim intro" id="intro">/);
  assert.match(TEMPLATE, /<div class="scrim modal" id="eventModal" hidden>/);
  assert.match(TEMPLATE, /<div class="scrim modal" id="endModal" hidden>/);
  assert.match(TEMPLATE, /<div class="scrim modal settings-scrim" id="settingsModal" hidden>/);
  assert.match(TEMPLATE, /<div class="scrim modal" id="savesModal" hidden>/);
  assert.match(TEMPLATE, /<div class="auto-hud" id="autoHud" hidden>/);
});

test('玩法略要十二章，且三个数值取自规则层而非写死', () => {
  assert.equal((TEMPLATE.match(/<section><h3>/g) || []).length, 12);
  assert.ok(TEMPLATE.includes(`压到 ${VICTORY_JIN_LIMIT} 州以内`), '胜利条件应引用 VICTORY_JIN_LIMIT');
  assert.ok(TEMPLATE.includes(`每局至多 ${MAX_CHARGE} 次`), '亲征次数应引用 MAX_CHARGE');
  assert.ok(TEMPLATE.includes(`耗缗钱 ${VICE_COST_GOLD}`), '分路造价应引用 VICE_COST_GOLD');
});

test('首局引导五步：选择器、抽屉归属、标题与文案齐备', () => {
  assert.equal(GUIDE_STEPS.length, 5);
  assert.equal(new Set(GUIDE_STEPS.map(s => s.title)).size, 5, '五步标题不应重复');
  for (const step of GUIDE_STEPS) {
    assert.match(step.sel, /^[.#]/, `${step.title} 的选择器不合法`);
    assert.ok(['none', 'left', 'right'].includes(step.drawer), `${step.title} 的抽屉归属不合法`);
    assert.ok(step.title.length > 0 && step.text.length > 0, `${step.title} 文案为空`);
  }
});

test('引导聚光除末步外都指向模板里真实存在的节点', () => {
  for (const step of GUIDE_STEPS.filter(s => s.sel.startsWith('#'))) {
    assert.ok(TEMPLATE.includes(`id="${step.sel.slice(1)}"`), `${step.sel} 不在模板中`);
  }
});