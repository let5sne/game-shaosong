/**
 * 关中台地（纯渲染）回归：只压平长安周边起伏，河谷与其他 23 州不漂移。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_DEFS } from '../src/data.js';
import {
  setTerrainStyle, heightAt, rawHeightAt, changanPlateauWeight, CHANGAN_PLATEAU,
  terrainColorHD,
} from '../src/world.js';

const P = CHANGAN_PLATEAU;

function ring(r0, r1) {
  const pts = [];
  for (let d = r0; d <= r1; d += 0.9) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      pts.push([P.x + Math.cos(a) * d, P.z + Math.sin(a) * d]);
    }
  }
  return pts;
}
function meanColor(pts, H) {
  const sum = [0, 0, 0];
  for (const [x, z] of pts) {
    const c = terrainColorHD(H(x, z), x, z, 0.1, 0.98, -0.05, 'real', { material: true });
    sum[0] += c.r; sum[1] += c.g; sum[2] += c.b;
  }
  return sum.map(v => v / pts.length);
}
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('压平权重：外圈恒 0、城内为正、全域有界', () => {
  assert.equal(changanPlateauWeight(P.x + 30, P.z), 0);
  assert.equal(changanPlateauWeight(P.x, P.z + 18), 0);
  assert.ok(changanPlateauWeight(P.x, P.z) > 0.3);
  for (let x = P.x - 20; x <= P.x + 20; x += 1) {
    for (let z = P.z - 20; z <= P.z + 20; z += 1) {
      const w = changanPlateauWeight(x, z);
      assert.ok(Number.isFinite(w) && w >= 0 && w <= P.strength, `权重越界 @${x},${z}`);
    }
  }
});

test('三档地貌下长安 9 单位内高差都压到 4.2 以下（原为 7.18）', () => {
  for (const style of ['classic', 'paper', 'real']) {
    setTerrainStyle(style);
    let min = Infinity, max = -Infinity, n = 0;
    for (let x = P.x - 9; x <= P.x + 9; x += 0.5) {
      for (let z = P.z - 9; z <= P.z + 9; z += 0.5) {
        if (Math.hypot(x - P.x, z - P.z) > 9) continue;
        const h = heightAt(x, z);
        assert.ok(Number.isFinite(h), `非有限高度 @${x},${z}`);
        min = Math.min(min, h); max = Math.max(max, h); n++;
      }
    }
    assert.ok(n > 900);
    assert.ok(max - min < 4.2, `${style} 台地仍太陡 ${(max - min).toFixed(2)}`);
    assert.ok(min < 0.6, `${style} 河谷下切应保留，实际最低 ${min.toFixed(2)}`);
  }
  setTerrainStyle('classic');
});

test('rawHeightAt：台地外逐点等于 heightAt，台地内保留原始起伏', () => {
  setTerrainStyle('real');
  for (const [x, z] of ring(P.outer + 2, P.outer + 6)) {
    assert.equal(rawHeightAt(x, z), heightAt(x, z), `台地外不应被改动 @${x},${z}`);
  }
  const sd = (a) => {
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };
  const pts = ring(0, 9);
  const raw = pts.map(([x, z]) => rawHeightAt(x, z));
  const flat = pts.map(([x, z]) => heightAt(x, z));
  assert.ok(sd(flat) < sd(raw) * 0.5, `压平应显著收窄高度分布 ${sd(flat)} vs ${sd(raw)}`);
  setTerrainStyle('classic');
});

test('台地配色按原始海拔：与台地外一圈的色距显著缩小（消除绿圆斑）', () => {
  setTerrainStyle('real');
  // 压平后整片高度落进 HD_LAYERS.real 的 1.90~3.10 亮绿带，与外圈山色断层；
  // 改用原始海拔后地质分区连续，色距应降到原来的一半左右。
  const outside = meanColor(ring(P.outer + 1, P.outer + 7), rawHeightAt);
  const inside = ring(0, 9);
  const dFlat = dist(meanColor(inside, heightAt), outside);
  const dRaw = dist(meanColor(inside, rawHeightAt), outside);
  assert.ok(dFlat > 0.12, `压平版理应出现明显色斑，实际 ${dFlat.toFixed(4)}`);
  assert.ok(dRaw < dFlat * 0.65,
    `按原始海拔着色应显著缩小圆斑色差 ${dRaw.toFixed(4)} vs ${dFlat.toFixed(4)}`);
  setTerrainStyle('classic');
});

test('其他 23 州城心不受台地影响（半径远小于城间距）', () => {
  setTerrainStyle('classic');
  for (const c of CITY_DEFS) {
    if (c.id === 'changan') continue;
    assert.equal(changanPlateauWeight(c.x, c.z), 0, `${c.id} 被误压平`);
  }
});
