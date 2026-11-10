/**
 * 近景 LOD 阈值回归（纯 Node）。
 * 核心红线：清河关默认机位与长局默认机位都必须是「完全远景」，
 * 否则全图状态环会被静默淡出，而旧实机断言只查 .visible 抓不到。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEAR_LOD, nearFactor, detailFactor, labelScaleK, ringFadeK, statusVisible,
} from '../src/lod.js';
import { HOME_POSE } from '../src/themes.js';

const dist = pose => Math.hypot(
  pose.position[0] - pose.target[0],
  pose.position[1] - pose.target[1],
  pose.position[2] - pose.target[2],
);

test('阈值契约：贴合 controls.minDistance=34 / maxDistance=185', () => {
  assert.equal(NEAR_LOD.near, 34);
  assert.equal(NEAR_LOD.far, 62);
  assert.equal(NEAR_LOD.detailFar, 48);
  assert.ok(NEAR_LOD.detailFar < NEAR_LOD.far, '细节层必须比状态层更早收起');
});

test('nearFactor / detailFactor 端点与有界性', () => {
  assert.equal(nearFactor(0), 1);
  assert.equal(nearFactor(34), 1);
  assert.equal(nearFactor(62), 0);
  assert.equal(nearFactor(185), 0);
  assert.equal(detailFactor(34), 1);
  assert.equal(detailFactor(48), 0);
  assert.equal(detailFactor(185), 0);
  for (let d = 20; d <= 200; d += 0.5) {
    const nf = nearFactor(d);
    assert.ok(Number.isFinite(nf) && nf >= 0 && nf <= 1, `nf 越界 @${d}`);
  }
});

test('缩放扫描：nearFactor 单调不增，且过渡段严格递减', () => {
  let prev = nearFactor(30), strict = 0;
  for (let d = 30; d <= 185; d += 1) {
    const cur = nearFactor(d);
    assert.ok(cur <= prev + 1e-12, `nf 在 ${d} 处回升`);
    if (cur < prev - 1e-9) strict++;
    prev = cur;
  }
  assert.ok(strict >= 20, `过渡段应有足够梯度，实际 ${strict}`);
});

test('默认机位必须是完全远景（旧阈值 near=62/far=96 曾误判）', () => {
  const qinghe = dist(HOME_POSE.qinghe);
  const campaign = dist(HOME_POSE.default);
  assert.ok(Math.abs(qinghe - 62.3) < 0.2, `清河默认机位距离变了 ${qinghe}`);
  assert.equal(nearFactor(qinghe), 0, '清河默认全景不得进近景');
  assert.equal(detailFactor(qinghe), 0, '清河默认全景不得渲染近景增量层');
  assert.equal(nearFactor(campaign), 0, '长局默认全景不得进近景');
  assert.equal(statusVisible(nearFactor(qinghe), 10), false, '默认全景不得出现朱签');
});

test('主动拉近才进入近景，且环带／名牌逐值还原', () => {
  assert.equal(nearFactor(34), 1);
  assert.equal(detailFactor(34), 1);
  assert.equal(ringFadeK(0), 1);
  assert.equal(ringFadeK(1), NEAR_LOD.ringFade);
  assert.equal(labelScaleK(0), 1);
  assert.equal(labelScaleK(1), NEAR_LOD.labelMin);
  assert.equal(labelScaleK(1, true), 0.66 * NEAR_LOD.labelMin);
  assert.equal(statusVisible(1, 20), true);
  assert.equal(statusVisible(1, 40), false, '远处城的朱签不该挤进画面');
});

test('远景时名牌与环带逐字回到旧值，过渡段无跳变', () => {
  for (let d = 62; d <= 185; d += 7) {
    assert.equal(labelScaleK(nearFactor(d)), 1);
    assert.equal(ringFadeK(nearFactor(d)), 1);
  }
  let last = detailFactor(34);
  for (let d = 34; d <= 48; d += 0.5) {
    const cur = detailFactor(d);
    assert.ok(Math.abs(cur - last) < 0.09, `细节层在 ${d} 处跳变 ${Math.abs(cur - last)}`);
    last = cur;
  }
});
