/**
 * 高清地貌回归测试（纯 Node，无 DOM / WebGL）。
 * 重点钉住三件事：玩法几何零回归、高度场数值稳定、Blender 产物契约。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITY_DEFS, RIVERS } from '../src/data.js';
import {
  TERRAIN_STYLES, HD_SEG_X, HD_SEG_Z,
  makeHeightField, setTerrainStyle, heightAt,
  computeTerrainAO, terrainColorHD,
} from '../src/world.js';
import { boulderGeometry, applyVerticalAO } from '../src/models.js';

const classic = (x, z) => {
  setTerrainStyle('classic');
  return heightAt(x, z);
};

function pngInfo(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('ascii', 1, 4), 'PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

const luma = c => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

test('地貌档位与网格常量契约', () => {
  assert.deepEqual([...TERRAIN_STYLES], ['classic', 'paper', 'real']);
  assert.equal(HD_SEG_X, 240);
  assert.equal(HD_SEG_Z, 208);
  assert.equal(makeHeightField('classic'), null);
  assert.equal(makeHeightField('nope'), null);
  assert.equal(setTerrainStyle('nope'), 'classic');
  setTerrainStyle('classic');
});

test('城池、河道、海域的落点逐点不变（玩法几何零回归）', () => {
  const fields = ['paper', 'real'].map(makeHeightField);
  let cityMax = 0, riverMax = 0, seaMax = 0;
  for (const c of CITY_DEFS) {
    const b = classic(c.x, c.z);
    for (const f of fields) cityMax = Math.max(cityMax, Math.abs(f(c.x, c.z, b) - b));
  }
  // 河道控制点位于曲线上，落在 2.2 硬保护半径内，必须逐点严格不变
  for (const r of RIVERS) {
    for (const [x, z] of r.points) {
      const b = classic(x, z);
      for (const f of fields) riverMax = Math.max(riverMax, Math.abs(f(x, z, b) - b));
    }
  }
  // 东侧海域（x>46）完全不叠加
  for (let z = -40; z <= 36; z += 4) {
    for (const x of [46, 50, 54]) {
      const b = classic(x, z);
      for (const f of fields) seaMax = Math.max(seaMax, Math.abs(f(x, z, b) - b));
    }
  }
  assert.equal(cityMax, 0, `城池高度被改动 ${cityMax}`);
  assert.equal(riverMax, 0, `河道高度被改动 ${riverMax}`);
  assert.equal(seaMax, 0, `东侧海域高度被改动 ${seaMax}`);
});

test('高度场确定性、有限、连续，且 real 比 paper 更起伏', () => {
  const fp = makeHeightField('paper'), fr = makeHeightField('real');
  let sumP = 0, sumR = 0, n = 0, maxJump = 0;
  for (let x = -56; x <= 48; x += 2) {
    for (let z = -48; z <= 44; z += 2) {
      const b = classic(x, z);
      const p = fp(x, z, b), r = fr(x, z, b);
      assert.ok(Number.isFinite(p) && Number.isFinite(r), `非有限高度 @${x},${z}`);
      assert.equal(p, fp(x, z, b), '同一点必须可复现');
      sumP += Math.abs(p - b); sumR += Math.abs(r - b); n++;
      maxJump = Math.max(maxJump, Math.abs(fp(x + 0.5, z, classic(x + 0.5, z)) - p));
    }
  }
  assert.ok(sumP / n > 0.25, `paper 起伏过小 ${sumP / n}`);
  assert.ok(sumR > sumP, `real 应比 paper 更起伏 ${sumR / n} vs ${sumP / n}`);
  // 允许陡崖（参考图近景有 70° 岩壁），但不允许断裂式突变：
  // 0.5 单位步长内 >2.5 会让 0.48 网格出现锯齿与贴地物穿模。
  assert.ok(maxJump < 2.5, `相邻采样跳变过大（会穿模）${maxJump}`);
});

test('setTerrainStyle 让 heightAt 分派到当前档，且可重置回原味', () => {
  const x = -30, z = -22;
  setTerrainStyle('classic');
  const base = heightAt(x, z);
  setTerrainStyle('paper');
  const paper = heightAt(x, z);
  setTerrainStyle('real');
  const real = heightAt(x, z);
  setTerrainStyle('classic');
  assert.equal(heightAt(x, z), base);
  assert.ok(paper !== base && real !== base, '高清档应改变山地高度');
  assert.ok(Math.abs(real - base) > Math.abs(paper - base), 'real 幅度更大');
});

test('碎岩几何：240 顶点、带顶点色、两套变体不同', () => {
  const a = boulderGeometry(0), b = boulderGeometry(1);
  for (const g of [a, b]) {
    assert.equal(g.attributes.position.count, 240);
    assert.ok(g.attributes.color, '缺少顶点色');
    assert.ok(g.attributes.normal, '缺少法线');
    assert.ok(g.boundingBox === null || g.boundingBox !== undefined);
    g.computeBoundingBox();
    assert.ok(g.boundingBox.min.y < 0 && g.boundingBox.max.y > 0.5, '岩体应有体积');
  }
  const pa = a.attributes.position, pb = b.attributes.position;
  let diff = 0;
  for (let i = 0; i < pa.count; i++) diff += Math.abs(pa.getX(i) - pb.getX(i));
  assert.ok(diff > 1, '两套变体不应完全相同');
});

test('Blender 地表皴纹与法线图都是 512² PNG', () => {
  const detail = pngInfo('public/textures/terrain-detail.png');
  const normal = pngInfo('public/textures/terrain-normal.png');
  assert.deepEqual([detail.w, detail.h], [512, 512]);
  assert.deepEqual([normal.w, normal.h], [512, 512]);
  assert.ok(detail.bytes > 20000 && normal.bytes > 20000);
});

// ── 材质质感层：顶点 AO 与地质分色（可在 Node 中脱离 WebGL 验证）──

test('computeTerrainAO：凹地被围住记为正遮蔽，平地为零，结果平滑且有界', () => {
  const seg = 10, stride = seg + 1;
  const heights = new Float32Array(stride * stride).fill(2);
  for (let z = 4; z <= 6; z++) for (let x = 4; x <= 6; x++) heights[z * stride + x] = 0;
  const positions = { count: heights.length, getY: i => heights[i] };
  const ao = computeTerrainAO(positions, seg, seg);
  assert.equal(ao.length, heights.length);
  assert.ok(ao.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  assert.ok(ao[5 * stride + 5] > 0.1, `凹地应有遮蔽，实际 ${ao[5 * stride + 5]}`);
  assert.ok(ao[0] < 0.02, `平地边缘不应有遮蔽，实际 ${ao[0]}`);
  // 平滑后由谷底向坡顶递减，不应出现断崖式跳变
  assert.ok(ao[5 * stride + 7] > 0.001 && ao[5 * stride + 7] < ao[5 * stride + 6],
    '谷底到坡顶应有过渡');
  // 确定性
  assert.deepEqual([...ao], [...computeTerrainAO(positions, seg, seg)]);
});

test('terrainColorHD：质感层可关、关掉逐点回到旧配色、AO 只压暗不染色', () => {
  const args = [3.2, -20, -10, 0.22, 0.90, -0.31, 'paper'];
  const plain = terrainColorHD(...args).clone();
  const plainExplicit = terrainColorHD(...args, { material: false }).clone();
  const textured = terrainColorHD(...args, { material: true, ao: 0, aoMean: 0 }).clone();
  const shaded = terrainColorHD(...args, { material: true, ao: 0.6, aoMean: 0.2 }).clone();
  const neutral = terrainColorHD(...args, { material: true, ao: 0.2, aoMean: 0.2 }).clone();
  assert.deepEqual(plain.toArray(), plainExplicit.toArray(), '不传 options 应等价关闭质感层');
  assert.deepEqual(plain.toArray(), terrainColorHD(...args).clone().toArray(), '同参数须可复现');
  assert.notDeepEqual(plain.toArray(), textured.toArray(), '质感层应确实改变地质配色');
  assert.ok(luma(shaded) < luma(textured), 'AO 应压暗沟壑');
  assert.ok(Math.abs(luma(neutral) - luma(textured)) < 1e-6,
    'ao 等于全图均值时不应改变亮度，AO 必须是零均值的');
  // AO 是乘性明度，不应把色相拉偏
  const ratio = shaded.r / textured.r;
  assert.ok(Math.abs(shaded.g / textured.g - ratio) < 1e-6
    && Math.abs(shaded.b / textured.b - ratio) < 1e-6, 'AO 只做亮度乘法');
  assert.ok(ratio > 0.82, '压暗幅度须克制，不能把画面弄脏');
});

test('applyVerticalAO：只改顶点色，重分配明暗而不整体压暗', () => {
  const plain = boulderGeometry(0), shaded = boulderGeometry(0);
  const before = plain.getAttribute('color').array.slice();
  applyVerticalAO(shaded, 1.0, 1);
  const p = plain.attributes, s = shaded.attributes;
  for (const key of ['position', 'normal']) {
    assert.deepEqual([...s[key].array], [...p[key].array], `${key} 不应被改动`);
  }
  if (p.index) assert.deepEqual([...s.index.array], [...p.index.array], '索引不应被改动');
  assert.notDeepEqual([...s.color.array], [...before], '顶点色应被重分配');
  // 逐顶点系数的算术均值应为 1（零均值）；按颜色加权的总和会受底色分布影响，不作数
  let fsum = 0, n = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] > 0.01) { fsum += s.color.array[i] / before[i]; n++; }
  }
  assert.ok(Math.abs(fsum / n - 1) < 1e-4, `逐顶点系数应零均值，实际 ${fsum / n}`);
});
