/**
 * 长安台地田垄（纯渲染补景）回归：
 * 点位必须贴地、避水、避开坊格/渭水/桥与城体，且三档地貌都不悬空。
 * 同时钉住「② 保持现状」：田垄是常驻层，不参与近景 LOD 收敛。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_DEFS } from '../src/data.js';
import {
  CHANGAN_FIELDS, CHANGAN_PLATEAU as P,
  setTerrainStyle, heightAt, riverDistance,
} from '../src/world.js';
import { nearFactor, detailFactor } from '../src/lod.js';

const ch = CITY_DEFS.find(c => c.id === 'changan');
const WEI = [[-48, -9], [-43, -10], [-39, -11.4], [-34, -10.8], [-29, -9.4], [-24, -8.6]];
const weiDist = (x, z) => Math.min(...WEI.map(([wx, wz]) => Math.hypot(x - wx, z - wz)));
const corners = (x, z, scale) => {
  const hx = 0.55 * scale, hz = 0.38 * scale;
  return [
    heightAt(x - hx, z - hz), heightAt(x + hx, z - hz),
    heightAt(x - hx, z + hz), heightAt(x + hx, z + hz),
  ];
};

test('田垄点位契约：frozen、相对坐标、尺度有界、全在台地内', () => {
  assert.ok(Object.isFrozen(CHANGAN_FIELDS));
  assert.equal(CHANGAN_FIELDS.length, 8);
  assert.equal(P.x, ch.x);
  assert.equal(P.z, ch.z);
  for (const [dx, dz, scale] of CHANGAN_FIELDS) {
    assert.equal(CHANGAN_FIELDS[0].length, 3);
    assert.ok(scale >= 1.4 && scale <= 2.2, `尺度越界 ${scale}`);
    const d = Math.hypot(dx, dz);
    assert.ok(d >= 6 && d < P.outer, `不在台地有效范围 d=${d}`);
    // 坊格残垣矩形 ch.x±9 / ch.z+1..+11，留 1 单位余量
    assert.ok(!(dx > -10 && dx < 10 && dz > 0 && dz < 13), `压到坊格线刻 @${dx},${dz}`);
  }
});

test('每块田都避水、避渭水与桥、不压官道与城体', () => {
  for (const [dx, dz] of CHANGAN_FIELDS) {
    const x = P.x + dx, z = P.z + dz;
    assert.ok(riverDistance(x, z) >= 3.0, `泡进黄河 @${x},${z}`);
    assert.ok(weiDist(x, z) >= 2.6, `压到渭水 @${x},${z}`);
    const nearest = CITY_DEFS.reduce((m, c) => Math.min(m, Math.hypot(c.x - x, c.z - z)), Infinity);
    assert.ok(nearest >= 6, `压到城体/木栅 @${x},${z}`);
  }
});

test('三档地貌下每块四角高差 < 0.68（不悬空、不切进陡坡）', () => {
  for (const style of ['classic', 'paper', 'real']) {
    setTerrainStyle(style);
    for (const [dx, dz, scale] of CHANGAN_FIELDS) {
      const x = P.x + dx, z = P.z + dz;
      const cs = corners(x, z, scale);
      const relief = Math.max(...cs) - Math.min(...cs);
      assert.ok(cs[0] > 0.55, `${style} 田块落进水面 @${x},${z}`);
      assert.ok(relief < 0.68, `${style} 田块悬空/切坡 @${x},${z} relief=${relief.toFixed(2)}`);
    }
  }
  setTerrainStyle('classic');
});

test('② 保持现状：默认全景与长局都是远景，收敛只在拉近时发生', () => {
  assert.equal(nearFactor(62.3), 0, '清河关默认机位不应被卷进近景');
  assert.equal(nearFactor(130), 0, '长局默认机位不应被卷进近景');
  assert.equal(detailFactor(62.3), 0, '默认全景不应多渲近景增量层');
  assert.equal(nearFactor(34), 1);
  assert.ok(nearFactor(48) > 0 && nearFactor(48) < 1);
});
