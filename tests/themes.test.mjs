import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITY_DEFS, SCENARIOS, findScenario } from '../src/data.js';
import { SCENE_IDS, SCENE_THEMES, DEFAULT_CAMERA_POSE, sceneTheme } from '../src/themes.js';

const CITY_IDS = new Set(CITY_DEFS.map(c => c.id));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('主题 id 与战局一一对应：长局 + 三个短剧本', () => {
  assert.deepEqual([...SCENE_IDS], ['campaign', ...SCENARIOS.map(s => s.id)]);
  assert.equal(Object.keys(SCENE_THEMES).length, SCENE_IDS.length);
  for (const id of SCENE_IDS) assert.equal(SCENE_THEMES[id].id, id);
});

test('themes.js 是纯展示数据：不 import three / rules，也不含随机数', () => {
  const src = readFileSync(new URL('../src/themes.js', import.meta.url), 'utf8');
  assert.ok(!/from\s+['"]three/.test(src), '不应依赖 three');
  assert.ok(!/from\s+['"][^'"]*rules\.js/.test(src), '不应依赖规则层');
  assert.ok(!/Math\.random/.test(src), '主题必须确定，不能随机');
});

test('每个主题的文案与机位字段齐备', () => {
  for (const id of SCENE_IDS) {
    const t = SCENE_THEMES[id];
    for (const k of ['name', 'tag', 'era', 'season', 'accent', 'poem', 'brief']) {
      assert.ok(typeof t[k] === 'string' && t[k].length > 0, `${id}.${k} 缺失`);
    }
    assert.ok(/^#[0-9a-f]{6}$/i.test(t.accent), `${id}.accent 非法`);
    assert.ok(Array.isArray(t.marks), `${id}.marks 缺失`);
    assert.equal(t.pose.position.length, 3);
    assert.equal(t.pose.target.length, 3);
  }
});

test('长局不加任何光色：默认开场页仍是清透宣纸', () => {
  assert.equal(SCENE_THEMES.campaign.light, null);
  assert.strictEqual(SCENE_THEMES.campaign.pose, DEFAULT_CAMERA_POSE);
  assert.deepEqual(SCENE_THEMES.campaign.marks, []);
});

test('机位落在 OrbitControls 的距离／俯仰／视场范围内', () => {
  for (const id of SCENE_IDS) {
    const { position, target, fov } = SCENE_THEMES[id].pose;
    const d = dist(position, target);
    assert.ok(d >= 34 && d <= 185, `${id} 距离 ${d.toFixed(1)} 越界`);
    const polar = Math.acos((position[1] - target[1]) / d);
    assert.ok(polar >= 0.18 && polar <= 1.36, `${id} 俯仰 ${polar.toFixed(3)} 越界`);
    assert.ok(fov >= 30 && fov <= 60, `${id} fov ${fov} 越界`);
  }
});

test('朱批焦点都是真实城池，且短剧本与 SCENARIOS.marks 完全一致', () => {
  for (const id of SCENE_IDS) {
    for (const c of SCENE_THEMES[id].marks) {
      assert.ok(CITY_IDS.has(c), `${id} 引用了不存在的城池 ${c}`);
    }
    const sc = findScenario(id);
    if (sc) assert.deepEqual([...SCENE_THEMES[id].marks], sc.marks, `${id} 焦点与剧本不符`);
  }
});

test('季节光色在安全区间：不把画面压黑，也不过曝', () => {
  for (const id of SCENE_IDS) {
    const L = SCENE_THEMES[id].light;
    if (!L) continue;
    for (const hex of [L.sky, L.sunColor, ...(L.hemi || [])]) {
      assert.ok(Number.isInteger(hex) && hex >= 0 && hex <= 0xffffff, `${id} 颜色非法`);
    }
    assert.ok(L.fogScale >= 0.7 && L.fogScale <= 1.1, `${id}.fogScale 越界`);
    assert.ok(L.sunMul >= 0.7 && L.sunMul <= 1.3, `${id}.sunMul 越界`);
    assert.ok(L.exposure >= 1.1 && L.exposure <= 1.45, `${id}.exposure 越界`);
    if (L.sunPos) assert.equal(L.sunPos.length, 3);
  }
});

test('未知 id 一律回长局，链接参数不能造出未登记主题', () => {
  assert.equal(sceneTheme('nope').id, 'campaign');
  assert.equal(sceneTheme(undefined).id, 'campaign');
  assert.equal(sceneTheme(null).id, 'campaign');
  assert.equal(sceneTheme('shunchang').id, 'shunchang');
});
