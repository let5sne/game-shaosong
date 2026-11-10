/**
 * 近景 LOD 纯函数（无 DOM / three，可在 node:test 直接断言）。
 *
 * 语义（按「相机 → 视点」距离 d，单位与 OrbitControls 一致）：
 *   d <= near        完全近景：环带淡出、名牌收小、朱签接管状态信息
 *   near < d < far   平滑过渡
 *   d >= far         完全远景：opacity / scale / visible 逐字回到旧观感
 *
 * 阈值必须贴合实际缩放范围：controls.minDistance=34、maxDistance=185，
 * 清河关 HOME_POSE 距离 62.3、长局 130。旧值 near=62/far=96 会把清河关
 * 默认全景误判为近景（nf≈0.99），导致全图环带被淡到 0.119。
 */
export const NEAR_LOD = Object.freeze({
  near: 34, far: 62,
  detailNear: 34, detailFar: 48,   // 细节层比状态层更早收起，避免全景多渲 9 个网格
  statusFar: 26,                   // 朱签只对镜头附近的城显现，避免满屏朱红条
  ringFade: 0.14, labelMin: 0.58,
  statusNf: 0.25,
});

export function lodRamp(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function nearFactor(distance) {
  return 1 - lodRamp(NEAR_LOD.near, NEAR_LOD.far, distance);
}
export function detailFactor(distance) {
  return 1 - lodRamp(NEAR_LOD.detailNear, NEAR_LOD.detailFar, distance);
}
export function labelScaleK(nf, presentation = false) {
  return (presentation ? 0.66 : 1) * (1 - (1 - NEAR_LOD.labelMin) * nf);
}
export function ringFadeK(nf) {
  return 1 - (1 - NEAR_LOD.ringFade) * nf;
}
/** 朱签：近景 + 该城离镜头足够近才显示；远景恒隐。 */
export function statusVisible(nf, distanceToCity) {
  return nf > NEAR_LOD.statusNf && distanceToCity < NEAR_LOD.statusFar;
}
