import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_DEFS, RIVERS, riverBetween } from './data.js';
import { supplyMap } from './rules.js';
import {
  SONG_COLOR, JIN_COLOR, SONG_LIGHT, JIN_LIGHT, PAPER,
  cityTier, buildCityLibrary, makeFlagTexture, makeWaterTexture,
  makeLabelTexture, drawLabel, makeFlagMaterial,
  pineGeometry, broadGeometry, rockGeometry, tentGeometry, mountainClusterGeometry, boulderGeometry, fieldGeometry,
  loadUnitLibrary, loadCapitalLibrary, loadTreeLibrary, TREE_MESHES, applyVerticalAO,
} from './models.js';
import { HOME_POSE } from './themes.js';
import { createInkPass, makeContactInk, makeInkTexture } from './ink.js';

const W = 116, D = 100, CX = -2, CZ = -3;
const WATER_Y = 0.42;
const SEG_X = 120, SEG_Z = 104;
const FLAG_W = 1.56, FLAG_H = 0.98;
// 两京主角级增饰：GLB 网格名 → 城池 id。对应胜利目标「收复开封与燕京」，
// 两者都是 tier 2 重檐规格，故可共用同一套举折曲面参数。
const CAPITAL_MESHES = { Kaifeng: 'kaifeng', Yanjing: 'yanjing' };
const TENT_SLOTS = 6;

// ── 程序化噪声 ──────────────────────────────────────────────
function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}
function fbm(x, z) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { v += noise(x * f, z * f) * amp; amp *= 0.5; f *= 2.1; }
  return v;
}
function ramp(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function mix(a, b, t) { return a + (b - a) * t; }

// 河流采样点（供河谷下切、植被避让）
const RIVER_SAMPLES = RIVERS.map(r => {
  const curve = new THREE.CatmullRomCurve3(r.points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const pts = curve.getPoints(90);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return { def: r, curve, pts, minX, maxX, minZ, maxZ };
});

export function riverProximity(x, z) {
  let best = 10.24;                       // 3.2²，超出即无需精确值
  for (const r of RIVER_SAMPLES) {
    if (x < r.minX - 3.2 || x > r.maxX + 3.2 || z < r.minZ - 3.2 || z > r.maxZ + 3.2) continue;
    for (let i = 0; i < r.pts.length; i += 2) {
      const p = r.pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}
function cityDistance(x, z) {
  let best = Infinity;
  for (const c of CITY_DEFS) {
    const dx = c.x - x, dz = c.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
const CITY_CHECK_R2 = 5.2 * 5.2;
function westRamp(x) { return ramp(8, 42, -x) * 4.4; }
function northRamp(z) { return ramp(16, 46, -z) * 2.6; }

function baseHeightAt(x, z) {
  const n = (fbm(x * 0.042 + 12, z * 0.042 + 7) - 0.5) * 3.4;
  const coast = ramp(33, 46, x) * -6.2;
  let h = 1.05 + n + westRamp(x) + northRamp(z) + coast;
  const rd = riverProximity(x, z);
  if (rd < 3.2) h = mix(WATER_Y - 0.12, h, ramp(1.1, 3.2, rd));
  for (const c of CITY_DEFS) {
    const dx = x - c.x, dz = z - c.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < CITY_CHECK_R2) {
      const flat = 1.35 + (c.terrain === 'mountain' ? 0.5 : 0);
      h = mix(flat, h, ramp(2.6, 5.2, Math.sqrt(d2)));
    }
  }
  if (x > 40) h = Math.min(h, WATER_Y - 1.6 - ramp(40, 52, x) * 2);
  return h;
}

/**
 * 场景当前绑定的地貌档。createWorld 在生成任何几何之前调用 setTerrainStyle()，
 * 之后所有贴地物件（圆环、河带、官道、墨晕、植被、营帐、行军轨迹）通过本函数
 * 取高度，天然共用同一份起伏，不需要逐处传参。
 */
let ACTIVE_FIELD = null;
export function setTerrainStyle(style) {
  ACTIVE_FIELD = makeHeightField(style);
  return ACTIVE_FIELD ? style : 'classic';
}
export function heightAt(x, z) {
  const base = baseHeightAt(x, z);
  return ACTIVE_FIELD ? ACTIVE_FIELD(x, z, base) : base;
}

// ── 地形分层着色：雪线／山岩／草甸／农田／河滩，含等高线与田垄 ──
const _c = new THREE.Color();
const _tmp = new THREE.Color();
const LAYERS = [
  { h: -2.0, c: 0xb7b697 },
  { h: 0.25, c: 0xc9c09a },
  { h: 0.75, c: 0xb3b183 },
  { h: 1.55, c: 0x9eac79 },
  { h: 2.60, c: 0x8c9c6d },
  { h: 3.80, c: 0x8e9074 },
  { h: 5.40, c: 0x9b9585 },
  { h: 8.00, c: 0xaaa597 },
];
function terrainColor(h, x, z, slope, jitter) {
  let i = 0;
  while (i < LAYERS.length - 2 && h > LAYERS[i + 1].h) i++;
  const a = LAYERS[i], b = LAYERS[i + 1];
  const t = ramp(a.h, b.h, h);
  _c.setHex(a.c).lerp(_tmp.setHex(b.c), t);
  // 陡坡露岩
  const rocky = 1 - ramp(0.80, 0.97, slope);
  if (rocky > 0) _c.lerp(_tmp.setHex(0x9a9079), rocky * 0.62);
  // 南北气候
  if (z < -20) _c.lerp(_tmp.setHex(0xa8a487), ramp(-20, -45, z) * 0.22);
  if (z > 12) _c.lerp(_tmp.setHex(0x7f9e78), ramp(12, 34, z) * 0.20);
  // 江南田垄格纹
  if (h > 0.7 && h < 2.1 && slope > 0.93) {
    const gx = Math.floor((x + 200) / 3.1), gz = Math.floor((z + 200) / 3.1);
    if ((gx + gz) % 2 === 0) _c.lerp(_tmp.setHex(0xb9b183), 0.10);
  }
  // 古地图等高线
  const f = (h / 0.92) % 1;
  if (f < 0.055 || f > 0.945) _c.multiplyScalar(0.945);
  _c.offsetHSL(0, 0, (jitter - 0.5) * 0.065);
  return _c;
}

// ── 高清地貌 ────────────────────────────────────────────────
/**
 * 三档地貌：classic 是原味宣纸沙盘（120×104、逐面平涂）；
 * paper / real 共用加密网格与「山脊 + 侵蚀沟壑」高度场，只差配色与细节强度。
 * 高度场是纯函数，可在 Node 中单测；createWorld 绑定档位后，
 * 所有贴地物件通过 heightAt() 自动共用同一份起伏，不需要逐处传参。
 */
export const TERRAIN_STYLES = Object.freeze(['classic', 'paper', 'real']);
export const HD_SEG_X = 240, HD_SEG_Z = 208;

/**
 * 在既有高度场上叠加域扭曲脊线与沟壑。
 * 城台内 3.0、河道 2.2、东侧海域一律不叠加；3.0→7.0 与 2.2→3.2 之间平滑过渡，
 * 故城池、津渡、官道的落点与原版逐点一致，玩法几何零回归。
 */
export function makeHeightField(style = 'classic') {
  if (style !== 'paper' && style !== 'real') return null;
  const gain = style === 'real' ? 6.2 : 4.8;
  // 第三参可传入已算好的 base（heightAt 内部走这条路，避免重复计算）；
  // 省略时自行求值，便于 Node 单测独立调用。
  return (x, z, base = baseHeightAt(x, z)) => {
    const cd = cityDistance(x, z);
    if (cd < 3.0) return base;
    const rd = riverProximity(x, z);
    // riverProximity() 的返回值截断在 3.2（只算河道缓冲区），缓冲上限必须 ≤3.2，
    // 否则 ramp 永远达不到 1，整张图的起伏会被静默压平。
    if (rd < 2.2) return base;
    const mask = ramp(3.2, 7.0, cd) * ramp(2.2, 3.2, rd) * (1 - ramp(36, 46, x));
    if (mask < 0.002) return base;
    // 域扭曲：让脊线自然弯折，避免规则正弦波
    const wx = x + (fbm(x * 0.019 + 51, z * 0.019 + 19) - 0.47) * 11;
    const wz = z + (fbm(x * 0.019 + 77, z * 0.019 + 43) - 0.47) * 11;
    // 多尺度脊线：1-|2n-1| 取平方使脊顶锐、谷底宽
    let ridge = 0, amp = 1, f = 0.082, norm = 0;
    for (let i = 0; i < 5; i++) {
      const n = fbm(wx * f + 3.1, wz * f + 8.7);
      const r = 1 - Math.abs(n * 2.13 - 1);
      ridge += r * r * amp;
      norm += amp; amp *= 0.52; f *= 1.9;   // 提高基频、收窄倍频：更多山头且最高频仍在网格可分辨范围
    }
    ridge /= norm;
    // 侵蚀沟壑：沿扭曲坐标的窄暗纹，削出水蚀山谷
    // 沟壑频率必须低于网格采样率（0.48/格），否则窄峰被欠采样成随机尖刺
    const gully = Math.abs(Math.sin(wx * 0.38 + wz * 0.13 + fbm(wx * 0.08, wz * 0.08) * 3.0)) ** 14 * 0.65;
    // 山地权重：低地也有缓丘，高海拔与北部才是山；水面/滩涂完全不参与
    const mountain = (0.50 + 0.50 * ramp(0.8, 4.8, base))
      * (0.72 + 0.28 * ramp(-8, -46, z)) * ramp(0.30, 1.05, base);
    return base + ((ridge - 0.32) * gain - gully) * mountain * mask;
  };
}

// 各档分层色带。paper 沿用低饱和淡彩；real 取参考图的黄绿草甸／灰白裸岩／土黄路径。
const HD_LAYERS = {
  paper: [
    { h: -2.0, c: 0xb8b79b }, { h: 0.30, c: 0xcec7a6 }, { h: 0.95, c: 0xbdbb92 },
    { h: 1.90, c: 0xa6b185 }, { h: 3.10, c: 0x8fa075 }, { h: 4.70, c: 0x93977c },
    { h: 6.60, c: 0xa29c8c }, { h: 9.80, c: 0xb8b2a5 },
  ],
  real: [
    { h: -2.0, c: 0x9aa586 }, { h: 0.30, c: 0xbcb077 }, { h: 0.95, c: 0xa9af5e },
    { h: 1.90, c: 0x93a44e }, { h: 3.10, c: 0x758d46 }, { h: 4.70, c: 0x8a8f5c },
    { h: 6.60, c: 0xaba794 }, { h: 9.80, c: 0xcdc9b6 },
  ],
};
const HD_ROCK = { paper: 0x9c9480, real: 0xc2c0b1 };
const HD_SHADE = { paper: 0x6f7a63, real: 0x536b3c };
// 质感层的地表分区配色：低饱和，只做色相分离，不靠加深造层次
const HD_BIOME = {
  paper: { scrub: 0x6d8a63, scree: 0xc9c4ae, meadow: 0xa7b979 },
  real: { scrub: 0x4f7135, scree: 0xdedbc8, meadow: 0xa3b055 },
};

/**
 * 地形顶点环境光遮蔽：在已生成的高度网格上取 8 方向 × 2 半径的邻域高差，
 * 凹槽／坡脚被周围高地围住则记为正遮蔽，再 3×3 平滑抹掉单格尖刺。
 * 只复用网格 y 数组，不重算 heightAt（否则 5 万顶点 × 16 次 fbm 会拖慢挂载）。
 * 返回 0..1 的 Float32Array，与顶点一一对应；可在 Node 中脱离 WebGL 单测。
 */
export function computeTerrainAO(positions, segX, segZ) {
  const stride = segX + 1;
  const n = positions.count;
  const H = (ix, iz) => positions.getY(
    Math.max(0, Math.min(segZ, iz)) * stride + Math.max(0, Math.min(segX, ix)),
  );
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const raw = new Float32Array(n);
  for (let iz = 0; iz <= segZ; iz++) {
    for (let ix = 0; ix <= segX; ix++) {
      const i = iz * stride + ix, h = positions.getY(i);
      let occ = 0, wsum = 0;
      for (const [dx, dz] of dirs) {
        for (const [r, w] of [[2, 1], [5, 0.62]]) {
          const rise = (H(ix + dx * r, iz + dz * r) - h) / (r * 0.5);
          occ += Math.max(0, Math.min(1, rise)) * w;
          wsum += w;
        }
      }
      raw[i] = occ / wsum;
    }
  }
  const out = new Float32Array(n);
  for (let iz = 0; iz <= segZ; iz++) {
    for (let ix = 0; ix <= segX; ix++) {
      let s = 0, c = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          s += raw[Math.max(0, Math.min(segZ, iz + dz)) * stride
            + Math.max(0, Math.min(segX, ix + dx))];
          c++;
        }
      }
      out[iz * stride + ix] = s / c;
    }
  }
  return out;
}

/**
 * 高清档逐顶点着色：平滑分层 + 坡向明暗 + 陡坡露岩 + 多尺度斑驳。
 * 传 material=true 时再叠加「材质质感」层（地表分区、岩层理、顶点 AO）；
 * 传 false 时与旧版逐点一致，?mat=0 才会真正回到原来的观感。
 */
export function terrainColorHD(h, x, z, nx, ny, nz, style,
  { material = false, ao = 0, aoMean = 0 } = {}) {
  const L = HD_LAYERS[style];
  let i = 0;
  while (i < L.length - 2 && h > L[i + 1].h) i++;
  const t = ramp(L[i].h, L[i + 1].h, h);
  _c.setHex(L[i].c).lerp(_tmp.setHex(L[i + 1].c), t);
  // 只在真正的陡壁露岩：阈值放宽会把整片草甸染成米黄，写实档会退化成沙丘
  const rocky = 1 - ramp(0.55, 0.86, Math.abs(ny));
  if (rocky > 0) _c.lerp(_tmp.setHex(HD_ROCK[style]), rocky * (style === 'real' ? 0.62 : 0.45));
  // 背光坡压暗（太阳在 -x/+z 方向），让沟壑自己显形
  const back = Math.max(0, -(nx * -0.62 + nz * 0.78));
  _c.lerp(_tmp.setHex(HD_SHADE[style]), back * (style === 'real' ? 0.34 : 0.18));
  // 皴法：迎光坡（向阳）偏暖、背光坡偏冷。只转色相与微量饱和、不动明度，
  // 故整幅平均明度逐点不变，宣纸底色不脏（与 AO 同纪律）。
  // 暖 = 减色相（橄榄绿 → 橙），冷 = 加色相（→ 青绿）。
  // 冷侧系数远大于暖侧：既有背光压暗（lerp 到 HD_SHADE）本身已把背坡拉暖约 10°，
  // 冷偏移必须先抵消它，才读得出「阴坡泛青」。
  const front = Math.max(0, nx * -0.62 + nz * 0.78);
  const warm = style === 'real' ? 0.020 : 0.016;
  const cool = style === 'real' ? 0.112 : 0.105;
  _c.offsetHSL(back * cool - front * warm, front * 0.026, 0);
  // 谷底湿润深绿，只作用在低海拔缓坡
  if (h < 3.0 && Math.abs(ny) > 0.86) {
    _c.lerp(_tmp.setHex(HD_SHADE[style]), ramp(3.0, 0.7, h) * (style === 'real' ? 0.16 : 0.08));
  }
  const grain = fbm(x * 0.52 + 31, z * 0.52 + 17) * 0.10
    + fbm(x * 2.3 + 71, z * 2.3 + 53) * 0.07;
  _c.offsetHSL(0, 0, grain - 0.082);
  if (material) {
    const slope = 1 - Math.abs(ny);
    const B = HD_BIOME[style];
    // 灌丛斑块：中低海拔缓坡上的成团深绿，边界略硬才有「地被」而非渐变的面团感
    const patch = fbm(x * 0.115 + 13, z * 0.115 + 29);
    const scrub = ramp(0.43, 0.56, patch) * ramp(0.24, 0.05, slope) * (1 - ramp(3.4, 6.2, h));
    _c.lerp(_tmp.setHex(B.scrub), scrub * (style === 'real' ? 0.68 : 0.52));
    // 低地草甸：河谷平原偏柔绿
    const meadow = ramp(2.8, 0.9, h) * ramp(0.30, 0.04, slope);
    _c.lerp(_tmp.setHex(B.meadow), meadow * 0.28);
    // 高脊碎岩：上部陡坡偏亮灰白，拉开与草甸的明度
    const scree = ramp(5.0, 8.4, h) * ramp(0.18, 0.60, slope);
    _c.lerp(_tmp.setHex(B.scree), scree * 0.48);
    // 岩层理：沿等高线的横向色带（受噪声扭曲），陡壁读成沉积岩而非沙丘
    if (rocky > 0.10) {
      const warp = fbm(x * 0.21 + 5, z * 0.21 + 9) * 2.4;
      const strata = (0.5 + 0.5 * Math.sin(h * 7.2 + warp)) ** 3;
      _c.multiplyScalar(1 - strata * (rocky - 0.10) * (style === 'real' ? 0.38 : 0.30));
    }
    // 背光坡再压一层，让沟壑侧壁与迎光面分开（只动局部，不动全局曝光）
    _c.multiplyScalar(1 - back * 0.15);
    // 顶点 AO 是零均值的：相对全图均值，凹处压暗、凸处提亮，
    // 因此只增强局部对比，不会把整幅画面拖暗。
    _c.multiplyScalar(Math.max(0.80, Math.min(1.12, 1 + 0.40 * (aoMean - ao))));
  }
  return _c;
}

// ── 贴地圆环 ────────────────────────────────────────────────
function groundRingAbs(cx, cz, inner, outer, color, opacity, segments = 64) {
  const geo = new THREE.RingGeometry(inner, outer, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(cx + pos.getX(i), cz + pos.getZ(i)) + 0.12);
  pos.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  }));
  mesh.position.set(cx, 0, cz);
  mesh.renderOrder = 4;
  return mesh;
}

/**
 * 植被落地软影：每棵树一个 8 段圆盘，逐顶点取 heightAt 贴合起伏（不是平铺的平面，
 * 否则山坡上的影子会一半埋进土里），全部合并成 1 个 draw call。
 * 共用径向柔边贴图，向背光侧略偏移并被压成椭圆，读作斜射的树影。
 */
function makeGroundShadows(points, texture) {
  const SEG = 8;
  const verts = [], uvs = [], idx = [];
  for (const p of points) {
    const base = verts.length / 3;
    const r = 0.95 * p.scale;
    const cx = p.x + 0.30 * p.scale, cz = p.z - 0.22 * p.scale;
    verts.push(cx, heightAt(cx, cz) + 0.055, cz);
    uvs.push(0.5, 0.5);
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.68;
      verts.push(x, heightAt(x, z) + 0.055, z);
      uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let s = 0; s < SEG; s++) idx.push(base, base + 1 + s, base + 2 + s);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: texture, color: 0x3e3a2c, transparent: true, opacity: 0.26,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  }));
  mesh.renderOrder = 0.6;   // 城池墨晕之后、海面之前
  mesh.frustumCulled = false;
  mesh.name = 'mat.groundShadow';
  return mesh;
}

// ── 带状几何：河流、河岸、官道共用 ─────────────────────────
function ribbonGeometry(points, halfWidth, lift, hex, uvScale = 0, minY = -Infinity, flatAcross = false) {
  const verts = [], cols = [], uvs = [], idx = [];
  const col = new THREE.Color(hex);
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    const centerY = flatAcross ? Math.max(minY, heightAt(p.x, p.z) + lift) : 0;
    for (const s of [1, -1]) {
      const x = p.x + nx * halfWidth * s, z = p.z + nz * halfWidth * s;
      verts.push(x, flatAcross ? centerY : Math.max(minY, heightAt(x, z) + lift), z);
      cols.push(col.r, col.g, col.b);
      uvs.push(s > 0 ? 0 : 1, i * uvScale);
    }
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);   // 绕序保证法线朝上
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(verts.length), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function mergeAll(list) {
  const g = mergeGeometries(list, false);
  list.forEach(x => x.dispose());
  if (!g) throw new Error('带状几何合并失败');
  return g;
}

/**
 * 环形远山带：沿圆周采样 ridged fbm 生成连续峰线，首尾天然闭合，
 * 任意旋转视角都有天际线；顶淡底深模拟大气透视，不受场景雾二次稀释。
 * 半径远大于相机到地形的距离，故不会挡在镜头与沙盘之间。
 */
const HD_RIDGES = {
  paper: [
    { r: 152, h: 33, top: 0xd4cdb6, bot: 0x969d8a, op: 0.62, phase: 1.7 },
    { r: 138, h: 28, top: 0xc9c4aa, bot: 0x848e7a, op: 0.70, phase: 4.3 },
    { r: 124, h: 22, top: 0xbcb79e, bot: 0x737f6d, op: 0.76, phase: 8.1 },
  ],
  real: [
    { r: 152, h: 37, top: 0xbccdd2, bot: 0x7c9aa1, op: 0.66, phase: 1.7 },
    { r: 138, h: 30, top: 0xa9bebe, bot: 0x6d8b89, op: 0.72, phase: 4.3 },
    { r: 124, h: 23, top: 0x97aca2, bot: 0x5c7563, op: 0.78, phase: 8.1 },
  ],
};
function ridgeRing({ r, h, top, bot, op, phase }) {
  const N = 288, verts = [], cols = [], idx = [];
  const ct = new THREE.Color(top), cb = new THREE.Color(bot);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const n1 = fbm(ca * 5.4 + phase + 8, sa * 5.4 + phase + 3);
    const n2 = fbm(ca * 13.7 + phase + 21, sa * 13.7 + phase + 11);
    const ridged = 1 - Math.abs(n1 * 2.1 - 1);
    // 高幂次把脊线压成断续尖峰；谷底落到地平线以下，天空重新露出来，
    // 避免出现「一整圈齐平的灰墙」。
    const spike = ridged ** 2.4 * 0.78 + (1 - Math.abs(n2 * 2 - 1)) ** 5 * 0.30;
    const peak = -5 + h * 1.45 * spike;
    const x = ca * r, z = sa * r * 0.86;
    verts.push(x, -8, z, x, peak, z);
    cols.push(cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: op,
    side: THREE.DoubleSide, depthWrite: false, fog: false,
  }));
}

// ── 大气透视（?atmos=1）────────────────────────────────────
// 天穹是一颗跟随相机的内表面球：顶点色只存「相对底色」的线性乘子，
// material.color 从 scene.background 同步，因此开场页主题改天色时穹顶跟着变，
// clearTheme 逐值还原的契约也不受影响。用顶点色而非渐变 shader，
// 是为了不写 onBeforeCompile —— 那是 ink.js 已经踩过的 program 翻倍坑。
// 关键：可见天空通常只占仰角 0~25°（h=sinθ ≤ 0.42），所以梯度要压在这段里，
// 不能一路铺到天顶；且以「抽蓝」而非「压暗」为主，整幅平均明度才不会被拖下去。
const SKY_GRADIENT = {
  paper: [
    [-1.00, [0.96, 0.92, 0.80]],
    [ 0.00, [1.06, 1.03, 0.96]],   // 地平线：最亮最淡，远山由此融进天色
    [ 0.18, [1.06, 1.02, 0.86]],
    [ 0.38, [1.05, 0.99, 0.70]],
    [ 0.70, [1.02, 0.93, 0.56]],
    [ 1.00, [0.98, 0.87, 0.46]],   // 天顶赭黄
  ],
  real: [
    [-1.00, [0.94, 0.90, 0.78]],
    [ 0.00, [1.07, 1.03, 0.94]],
    [ 0.18, [1.06, 1.00, 0.82]],
    [ 0.38, [1.04, 0.96, 0.64]],
    [ 0.70, [1.00, 0.88, 0.48]],
    [ 1.00, [0.94, 0.80, 0.38]],
  ],
};
function makeSkyDome(style) {
  const R = 300;
  const g = new THREE.SphereGeometry(R, 32, 20);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const stops = SKY_GRADIENT[style] || SKY_GRADIENT.paper;
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(-1, Math.min(1, pos.getY(i) / R));
    let k = 0;
    while (k < stops.length - 2 && h > stops[k + 1][0]) k++;
    const [h0, c0] = stops[k], [h1, c1] = stops[k + 1];
    const t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
    colors[i * 3] = c0[0] + (c1[0] - c0[0]) * t;
    colors[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * t;
    colors[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false,
    depthWrite: false, toneMapped: false,
  }));
  mesh.name = 'atmos.skyDome';
  mesh.renderOrder = -1000;      // 先铺天色、不写深度，其余物件照常覆盖
  mesh.frustumCulled = false;    // 恒跟随相机，必在视锥内
  return mesh;
}
function makeSunGlow() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // 峰值压低、能量摊到更宽的外圈：加法混合一旦中心冲到 1.0 就会变成
  // 一枚硬白圆片，参考图要的是弥散的暮霭光晕而不是太阳圆盘。
  g.addColorStop(0.00, 'rgba(255,240,210,0.42)');
  g.addColorStop(0.10, 'rgba(255,228,180,0.30)');
  g.addColorStop(0.36, 'rgba(255,210,152,0.12)');
  g.addColorStop(0.72, 'rgba(255,198,132,0.03)');
  g.addColorStop(1.00, 'rgba(255,192,124,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  // depthTest 保留：天空像素深度为 1 故能通过，被地形挡住的部分自然剔除。
  // 加法混合在 ACES 下极易过曝，这里 toneMapped:false + 低 opacity 双保险。
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, fog: false, toneMapped: false,
    opacity: 0.48,
  }));
  sp.name = 'atmos.sunGlow';
  sp.scale.set(190, 190, 1);
  sp.renderOrder = -500;
  return sp;
}

// ── 主场景 ──────────────────────────────────────────────────
export function createWorld(container, state, { onPick, quality = 'high', reducedMotion = false, ink = false, atmos = false, tex = false, ctex = false, units = true, capitals = true, trees = true, terrain = 'classic', mat = true } = {}) {
  // 地貌档必须先绑定再生成任何几何：全场景的贴地落点都由 heightAt() 分派。
  const low = quality === 'low';            // 低配：DPR 封顶、关阴影、植被采样减半
  let terrainStyle = setTerrainStyle(TERRAIN_STYLES.includes(terrain) ? terrain : 'classic');
  // 低配（含软件渲染）自动回落到原味几何：5 万顶点 + 地形自投影对像素填充已经吃紧的设备是负担。
  if (low && terrainStyle !== 'classic') terrainStyle = setTerrainStyle('classic');
  const hd = terrainStyle !== 'classic';
  // 材质质感层：地质分层／顶点 AO／物件竖向 AO／落地软影。低配与原味档一律回落，
  // 保持「?mat=0 逐点回到旧观感」这个 A/B 契约。
  const matOn = !!mat && !low && hd;
  // 低配档沿用程序化圆锥树：精细冠团在纯软件渲染上是白增三角形。
  const useTrees = !!trees && !low;
  // 高清档专属物件的实例计数，供 assets.info() 与实机验证读取
  let rockCount = 0, ridgeCount = 0, groundShadowCount = 0;
  // 地表与城池贴图是两项独立开关；历史 ?tex=1 的「双开」兼容由 settings.js 解码层负责，
  // 因此这里不再用 ctex || tex 互相隐含，设置菜单才能表达「只开地表」。
  const groundTex = !!tex;
  const cityTex = !!ctex;
  const still = !!reducedMotion;            // 系统「减弱动效」：波光、旗面、飞鸟静止
  // 软件渲染的瓶颈是像素填充（半透明层 overdraw），不是三角形；
  // low 档把渲染分辨率压到 0.85，比继续减植被密度更有实际收益。
  const dprCap = low ? 0.85 : 2;
  // 旗面波动与海面起伏共用同一份时间 uniform
  const uTime = { value: 0 };
  const scene = new THREE.Scene();
  // 写实档把纸面底色换成淡青灰，远山才有大气透视；宣纸档保持原米色。
  const SKY = terrainStyle === 'real' ? 0xdfe4dc : PAPER;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, terrainStyle === 'real' ? 105 : 118, terrainStyle === 'real' ? 268 : 255);

  // 局内默认机位按剧本取：清河的战场只在西北一角，首镜便给近景；
  // 读取放在调用时（而非建 world 时），开场页同会话换剧本再进局也能取对。
  const homePose = () => HOME_POSE[state.scenarioId] || HOME_POSE.default;
  const camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 600);
  {
    const h = homePose();
    camera.position.fromArray(h.position);
    camera.fov = h.fov;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 宣纸增强：一次全屏后处理 + 贴地墨晕。?ink=0 可整层旁路，用于 A/B 对比。
  const inkPass = createInkPass(renderer, { enabled: ink });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(homePose().target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 34;
  controls.maxDistance = 185;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = 1.36;
  controls.screenSpacePanning = false;
  controls.update();

  // 光：暖阳主光 + 天光 + 冷色补光。写实档略压环境光、抬高主光增强坡面立体感，
  // 但不可大幅压暗——实机 A/B 时压到 1.05/0.17 让整幅画面暗了 12 个色阶。
  const dramatic = terrainStyle === 'real';
  const atmosOn = !!atmos;
  // 斜射自投影会吃掉约 10 个色阶，补一份天光把阴影填回来：
  // 这是模拟真实天空散射，不是抹掉立体感（局部明暗差仍在）。
  const skyFill = hd ? 0.20 : 0;
  // 大气透视档只重排「颜色」与太阳仰角，不改光强结构：
  // 暖主光 + 冷色天光／补光，阴影区于是带蓝紫，迎光面转赭黄。
  // 关掉时下面每个值逐字回到旧配置，A/B 可逐像素对照。
  // 保留引用：开场页场景主题会临时改天光并精确还原，不能每次重新 new 一个灯
  const hemi = new THREE.HemisphereLight(
    atmosOn ? 0xffe8c4 : 0xfff5dd,
    atmosOn ? 0x707a8c : 0x6e725f,
    (dramatic ? 1.28 : 1.35) + skyFill);
  const ambient = new THREE.AmbientLight(0xffffff, (dramatic ? 0.24 : 0.26) + skyFill * 0.5);
  scene.add(hemi, ambient);
  const sun = new THREE.DirectionalLight(
    atmosOn ? 0xffd8a0 : 0xfff0d0,
    atmosOn ? (dramatic ? 2.38 : 2.18) : (dramatic ? 2.50 : 2.25));
  // 高清档把太阳压低到约 38°：斜射光让山脊自投影拉长，沟壑才有体积。
  // 大气透视档再压到约 20°，长坡影是「暮色」的主要来源；原味档保持 88 高度。
  // 日晕与灯光共用这一方向，辉光不会和影子打架。
  if (atmosOn) sun.position.set(-16, 34, 92);
  else sun.position.set(hd ? -56 : -42, hd ? 62 : 88, hd ? 46 : 48);
  sun.castShadow = !low;
  const shadowSize = low ? 512 : 1536;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -78; sun.shadow.camera.right = 78;
  sun.shadow.camera.top = 78; sun.shadow.camera.bottom = -78;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(
    atmosOn ? 0xbcd2ea : 0xc6d8e8,
    atmosOn ? 0.62 : 0.52);
  fill.position.set(55, 40, -60);
  scene.add(fill);

  // 天穹与日晕：只在 atmos 档建，默认关时场景对象与 draw call 逐项不变。
  // 两者都跟随相机平移（不跟随旋转），地平线因此始终贴着世界 Y=0，
  // 不会出现「天空跟着镜头一起转」的假像。
  let skyDome = null, sunGlow = null;
  const sunDir = new THREE.Vector3();
  const syncSkyTint = () => { if (skyDome) skyDome.material.color.copy(scene.background); };
  if (atmosOn) {
    skyDome = makeSkyDome(terrainStyle === 'real' ? 'real' : 'paper');
    sunGlow = makeSunGlow();
    syncSkyTint();
    scene.add(skyDome, sunGlow);
  }

  // ── 开场页表现层 ──
  // 三项都是「视觉只读」：不改 GameState、不进存档、不参与 supplyMap 等规则计算。
  // presentation 只锁住拾取与 OrbitControls；themeSnapshot 保证 clearTheme 逐值还原，
  // 因此 classic / paper / real 与 high / low 各档都能安全叠加，进场后零残留。
  let presentation = false;
  let previewMarks = null;       // Set<string>：朱批圈的预览态；null 表示交回 state.scenario
  let themeSnapshot = null;      // 首次 applyTheme 时记录场景原始光色
  let themeId = null;
  const baseSunIntensity = sun.intensity;
  const baseAmbientIntensity = ambient.intensity;

  // ── 地形 ──
  // classic：120×104、逐面平涂顶点色 + flatShading（原味，逐字节保持旧行为）。
  // 高清档：240×208、逐顶点着色 + 平滑法线，山脊与沟壑靠几何起伏而非色块表现。
  const geo = new THREE.PlaneGeometry(W, D, hd ? HD_SEG_X : SEG_X, hd ? HD_SEG_Z : SEG_Z);
  geo.rotateX(-Math.PI / 2);
  geo.translate(CX, 0, CZ);
  const gp = geo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
  gp.needsUpdate = true;
  let landGeo;
  if (hd) {
    geo.computeVertexNormals();
    const nr = geo.attributes.normal;
    const aoField = matOn ? computeTerrainAO(gp, HD_SEG_X, HD_SEG_Z) : null;
    let aoMean = 0;
    if (aoField) {
      for (let i = 0; i < aoField.length; i++) aoMean += aoField[i];
      aoMean /= aoField.length;
    }
    const colors = new Float32Array(gp.count * 3);
    let baseSum = 0, matSum = 0;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
      const nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i);
      // 同一点再算一次旧配色，只用来求亮度锚：质感层不许改变整幅地图的平均明度
      if (matOn) {
        const base = terrainColorHD(y, x, z, nx, ny, nz, terrainStyle);
        baseSum += base.r + base.g + base.b;
      }
      const col = terrainColorHD(y, x, z, nx, ny, nz, terrainStyle,
        { material: matOn, ao: aoField ? aoField[i] : 0, aoMean });
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      matSum += col.r + col.g + col.b;
    }
    if (matOn && matSum > 0) {
      const k = baseSum / matSum;
      for (let j = 0; j < colors.length; j++) colors[j] *= k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    landGeo = geo;
  } else {
    const ng = geo.toNonIndexed();
    const np = ng.attributes.position;
    const colors = new Float32Array(np.count * 3);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (let f = 0; f < np.count; f += 3) {
      const h = (np.getY(f) + np.getY(f + 1) + np.getY(f + 2)) / 3;
      const x = (np.getX(f) + np.getX(f + 1) + np.getX(f + 2)) / 3;
      const z = (np.getZ(f) + np.getZ(f + 1) + np.getZ(f + 2)) / 3;
      e1.set(np.getX(f + 1) - np.getX(f), np.getY(f + 1) - np.getY(f), np.getZ(f + 1) - np.getZ(f));
      e2.set(np.getX(f + 2) - np.getX(f), np.getY(f + 2) - np.getY(f), np.getZ(f + 2) - np.getZ(f));
      nrm.crossVectors(e1, e2).normalize();
      const col = terrainColor(h, x, z, Math.abs(nrm.y), hash(f * 0.37, f * 0.11));
      for (let k = 0; k < 3; k++) {
        colors[(f + k) * 3] = col.r; colors[(f + k) * 3 + 1] = col.g; colors[(f + k) * 3 + 2] = col.b;
      }
    }
    ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ng.computeVertexNormals();
    landGeo = ng;
  }
  const land = new THREE.Mesh(landGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: !hd, roughness: 1, metalness: 0,
  }));
  land.receiveShadow = true;
  // 高清档让山脊把影子投到自己身上：参考图的沟壑立体感主要来自这种自投影，
  // 光靠平滑法线和坡向着色只能得到圆滑沙丘。原味档保持关闭，避免改动旧观感。
  land.castShadow = hd;
  scene.add(land);
  if (!hd) geo.dispose();

  // 地表细节：高清档用 Blender 烘的岩纹／草甸皴纹高密度平铺，提供近景颗粒；
  // 原味档用淡宣纸纸纹（可选项）。两者都是乘性灰度遮罩，不做 sRGB 解码。
  if (hd) {
    const detail = new THREE.TextureLoader().load(new URL('textures/terrain-detail.png', document.baseURI).href);
    detail.colorSpace = THREE.NoColorSpace;
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(18, 15);
    detail.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // 同源高度的法线图：只添细密凹凸光影，不改变顶点色，
    // 是「近景有质感而远景不脏」的关键，且不新增 draw call。
    const normal = new THREE.TextureLoader().load(new URL('textures/terrain-normal.png', document.baseURI).href);
    normal.colorSpace = THREE.NoColorSpace;
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.copy(detail.repeat);
    normal.anisotropy = detail.anisotropy;
    land.material.map = detail;
    land.material.normalMap = normal;
    // 质感层把皴纹铺得更密、法线更强：近景能读出岩面颗粒，远景靠 mipmap 自动淡出。
    // 法线只改光照、不改底色，是「有质感但不脏」的关键一笔。
    if (matOn) {
      detail.repeat.set(26, 22);
      normal.repeat.copy(detail.repeat);
      land.material.normalScale.set(0.82, 0.82);
    } else {
      land.material.normalScale.set(0.42, 0.42);
    }
    land.material.needsUpdate = true;
  } else if (groundTex) {
    const paper = new THREE.TextureLoader().load(new URL('textures/paper.png', document.baseURI).href);
    paper.colorSpace = THREE.SRGBColorSpace;
    paper.wrapS = paper.wrapT = THREE.RepeatWrapping;
    paper.repeat.set(3.5, 3);
    paper.anisotropy = 4;
    land.material.map = paper;
    land.material.needsUpdate = true;
  }

  // 接触墨晕：贴合 heightAt 的圆盘，24 城合并为 1 个 draw call，
  // 给城池「压在纸上」的重量感（原有 shadowMap 只有方向性投影）。
  // 与「宣纸增强」解耦：ink 开时用原先较浓的墨晕；质感层只留极淡一层，
  // 默认也有落地感，但不描边、不压暗整幅画面。
  const CONTACT_STRONG = low ? 0.22 : 0.32, CONTACT_SOFT = 0.19;
  const contactInk = makeContactInk(CITY_DEFS, heightAt, {
    radius: def => 3.4 + (cityTier(def) === 2 ? 1.2 : 0),
    opacity: ink ? CONTACT_STRONG : CONTACT_SOFT,
  });
  contactInk.visible = ink || matOn;
  scene.add(contactInk);

  // ── 海面 + 流动波光 ──
  // 起伏放到 vertex shader：原先每帧在 CPU 改 957 个顶点并重传整个 VBO
  const seaGeo = new THREE.PlaneGeometry(W, D, 32, 28);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(CX, WATER_Y, CZ);
  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x89aeb6, transparent: true, opacity: 0.82, roughness: 0.30, metalness: 0.10,
    depthWrite: false, side: THREE.DoubleSide,
  });
  seaMat.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += sin(position.x * 0.24 + uTime * 0.9) * 0.055
          + cos(position.z * 0.29 + uTime * 0.7) * 0.045;
      `);
  };
  seaMat.customProgramCacheKey = () => 'shaosong-sea-wave';
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.renderOrder = 1;
  scene.add(sea);
  const waterTexSea = makeWaterTexture();
  waterTexSea.repeat.set(7, 7);
  const waterTexRiver = makeWaterTexture();
  waterTexRiver.repeat.set(1, 1);
  const shimmerGeo = new THREE.PlaneGeometry(W, D, 1, 1);
  shimmerGeo.rotateX(-Math.PI / 2);
  shimmerGeo.translate(CX, WATER_Y + 0.018, CZ);
  const shimmer = new THREE.Mesh(shimmerGeo, new THREE.MeshBasicMaterial({
    map: waterTexSea, transparent: true, opacity: 0.20, depthWrite: false, side: THREE.DoubleSide,
  }));
  shimmer.renderOrder = 2;
  scene.add(shimmer);

  // ── 河流：湿岸 → 水面 → 流动高光 ──
  const banks = [], surfaces = [], glints = [];
  const riverLinePts = RIVER_SAMPLES.map(r => r.curve.getPoints(180));
  for (let ri = 0; ri < RIVER_SAMPLES.length; ri++) {
    const r = RIVER_SAMPLES[ri], pts = riverLinePts[ri], hw = r.def.width;
    banks.push(ribbonGeometry(pts, hw * 1.62, 0.015, 0xa9a184, 0, WATER_Y - 0.08, true));
    surfaces.push(ribbonGeometry(pts, hw, 0.05, r.def.color, 0, WATER_Y + 0.01, true));
    glints.push(ribbonGeometry(pts, hw * 0.94, 0.075, 0xffffff, 0.16, WATER_Y + 0.03, true));
  }
  const matTape = (hex, opacity) => new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity, roughness: 0.55,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const bankMesh = new THREE.Mesh(mergeAll(banks), matTape(0xffffff, 0.55));
  bankMesh.renderOrder = 2; scene.add(bankMesh);
  const riverMesh = new THREE.Mesh(mergeAll(surfaces), matTape(0xffffff, 0.92));
  riverMesh.renderOrder = 3; scene.add(riverMesh);
  const glintMesh = new THREE.Mesh(mergeAll(glints), new THREE.MeshBasicMaterial({
    map: waterTexRiver, vertexColors: true, transparent: true, opacity: 0.62,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  glintMesh.renderOrder = 4; scene.add(glintMesh);

  // ── 官道：深色路肩 + 浅色路面；津渡另染水色，全部合并为 4 个 mesh ──
  const roadEdge = [], roadBody = [], fordEdge = [], fordBody = [], drawn = new Set();
  for (const c of CITY_DEFS) {
    for (const id of c.links) {
      const key = [c.id, id].sort().join('|');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const t = CITY_DEFS.find(x => x.id === id);
      if (!t) continue;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(c.x, 0, c.z),
        new THREE.Vector3((c.x + t.x) / 2, 0, (c.z + t.z) / 2),
        new THREE.Vector3(t.x, 0, t.z),
      ]);
      const pts = curve.getPoints(28);
      const ford = riverBetween(c, t);
      (ford ? fordEdge : roadEdge).push(ribbonGeometry(pts, ford ? 0.44 : 0.31, 0.10, ford ? 0x2d6183 : 0x877454));
      (ford ? fordBody : roadBody).push(ribbonGeometry(pts, ford ? 0.30 : 0.20, 0.125, ford ? 0x63b6dd : 0xc4ad82));
    }
  }
  const roadMat = (opacity) => new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  });
  const roadEdgeMesh = new THREE.Mesh(mergeAll(roadEdge), roadMat(0.52));
  roadEdgeMesh.renderOrder = 5; scene.add(roadEdgeMesh);
  const roadBodyMesh = new THREE.Mesh(mergeAll(roadBody), roadMat(0.82));
  roadBodyMesh.renderOrder = 6; scene.add(roadBodyMesh);
  const fordEdgeMesh = new THREE.Mesh(mergeAll(fordEdge), roadMat(0.72));
  fordEdgeMesh.renderOrder = 5; scene.add(fordEdgeMesh);
  const fordBodyMesh = new THREE.Mesh(mergeAll(fordBody), roadMat(0.94));
  fordBodyMesh.renderOrder = 6; scene.add(fordBodyMesh);

  const dummy = new THREE.Object3D();

  // ── 耕地：城郊平畴的条播田块 ──
  // 富庶之州田亩更多；只落在城台 5 以外的缓坡上，不压官道、不泡河水，
  // 簇内同向排布（田长边垂直于进城半径），读作「有人烟的田」而非随机贴片。
  // 全图一个 InstancedMesh，+1 draw call。
  {
    const roadSegs = [], seenRoad = new Set();
    for (const c of CITY_DEFS) for (const id of c.links) {
      const key = [c.id, id].sort().join('|');
      if (seenRoad.has(key)) continue;
      seenRoad.add(key);
      const t = CITY_DEFS.find(x => x.id === id);
      if (t) roadSegs.push([c.x, c.z, t.x, t.z]);
    }
    const segDist = (px, pz, [x0, z0, x1, z1]) => {
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
      const t = L2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / L2)) : 0;
      return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
    };
    const beds = [];
    for (const c of CITY_DEFS) {
      const n = c.yieldGrain >= 7 ? 8 : c.yieldGrain >= 5 ? 6 : 4;
      const baseAng = hash(c.x * 1.1, c.z * 0.9) * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const r = 4.9 + hash(c.x + i * 3.7, c.z - i * 2.9) * 2.3;
        const a = baseAng + (hash(c.z + i * 5.1, c.x + i * 1.3) - 0.5) * 1.9;
        const px = c.x + Math.cos(a) * r, pz = c.z + Math.sin(a) * r;
        if (px < -55 || px > 36 || pz < -46 || pz > 42) continue;
        // 河谷平地正是田所在：只避开水线（rd>2.0），官道留半幅余量
        if (cityDistance(px, pz) < 4.4 || riverProximity(px, pz) < 2.0) continue;
        if (roadSegs.some(s => segDist(px, pz, s) < 0.60)) continue;
        const scale = 1.5 + hash(px, pz) * 0.9;
        const hx = 0.55 * scale, hz = 0.38 * scale;
        const corners = [
          heightAt(px - hx, pz - hz), heightAt(px + hx, pz - hz),
          heightAt(px - hx, pz + hz), heightAt(px + hx, pz + hz),
        ];
        if (corners[0] < 0.55 || Math.max(...corners) - Math.min(...corners) > 0.60) continue;
        // 顺坡倾斜：田面跟着地形走，缓坡上读作梯田而不是切进地里的平板
        const slX = (corners[1] + corners[3] - corners[0] - corners[2]) / (4 * hx);
        const slZ = (corners[2] + corners[3] - corners[0] - corners[1]) / (4 * hz);
        beds.push({
          x: px, y: (corners[0] + corners[1] + corners[2] + corners[3]) / 4 + 0.02, z: pz,
          scale, rot: -a - Math.PI / 2, tiltX: -Math.atan(slZ), tiltZ: -Math.atan(slX),
          t: hash(px * 1.3, pz * 0.7),
        });
      }
    }
    // 洛阳盆地手工点位：通用散布的随机角度拾不到的城东平缓地
    //（Node 采样坡度 + 避开蕃帐圈与河道确定；长局同享这份地图装点）
    for (const [px, pz] of [
      [-16.7, -12.1], [-16.3, -12.0], [-16.0, -11.9], [-18.3, -10.1],
      [-19.1, -9.7], [-20.0, -9.6], [-20.0, -9.2], [-20.9, -9.7],
    ]) {
      if (roadSegs.some(s => segDist(px, pz, s) < 0.60)) continue;   // 手工位也须让开官道
      const scale = 1.5 + hash(px, pz) * 0.9;
      const hx = 0.55 * scale, hz = 0.38 * scale;
      const corners = [
        heightAt(px - hx, pz - hz), heightAt(px + hx, pz - hz),
        heightAt(px - hx, pz + hz), heightAt(px + hx, pz + hz),
      ];
      if (Math.max(...corners) - Math.min(...corners) > 0.60) continue;
      const slX = (corners[1] + corners[3] - corners[0] - corners[2]) / (4 * hx);
      const slZ = (corners[2] + corners[3] - corners[0] - corners[1]) / (4 * hz);
      const a = Math.atan2(pz + 13, px + 20);
      beds.push({
        x: px, y: (corners[0] + corners[1] + corners[2] + corners[3]) / 4 + 0.02, z: pz,
        scale, rot: -a - Math.PI / 2, tiltX: -Math.atan(slZ), tiltZ: -Math.atan(slX),
        t: hash(px * 1.3, pz * 0.7),
      });
    }
    const fieldMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const fieldIm = new THREE.InstancedMesh(fieldGeometry(), fieldMat, Math.max(1, beds.length));
    const tStraw = new THREE.Color(0xefe7cf), tGreen = new THREE.Color(0xd7e0b4), tint = new THREE.Color();
    beds.forEach((p, i) => {
      dummy.rotation.order = 'YXZ';                  // 先偏航后俯仰：倾斜沿田块局部轴
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.tiltX, p.rot, p.tiltZ);
      dummy.scale.set(p.scale, 1, p.scale * 0.9 + 0.1);
      dummy.updateMatrix();
      fieldIm.setMatrixAt(i, dummy.matrix);
      fieldIm.setColorAt(i, tint.copy(tStraw).lerp(tGreen, p.t * 0.6));
    });
    dummy.rotation.order = 'XYZ';                    // 共享 dummy 复位，别污染后续散布
    fieldIm.instanceMatrix.needsUpdate = true;
    if (fieldIm.instanceColor) fieldIm.instanceColor.needsUpdate = true;
    fieldIm.count = beds.length;
    fieldIm.frustumCulled = false;
    fieldIm.name = 'farmland';
    fieldIm.receiveShadow = true;
    scene.add(fieldIm);
  }

  // ── 远山 ──
  // classic：12 个低多边形锥柱剪影（原味）。
  // 高清档：3 层环形连续山脊，任意视角都有远近层次与大气透视。
  if (hd) {
    for (const spec of HD_RIDGES[terrainStyle]) {
      scene.add(ridgeRing(spec));
      ridgeCount++;
    }
  } else {
    const mountains = new THREE.InstancedMesh(
      mountainClusterGeometry(7),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, transparent: true, opacity: 0.46, depthWrite: false }),
      12,
    );
    let mi = 0;
    for (let k = 0; k < 7; k++) {
      dummy.position.set(-64 + k * 21, -1.6, -69 - (k % 3) * 4);
      dummy.rotation.y = (k % 2) * 0.24;
      dummy.scale.setScalar(0.72 + (k % 3) * 0.18);
      dummy.updateMatrix(); mountains.setMatrixAt(mi++, dummy.matrix);
    }
    for (let k = 0; k < 5; k++) {
      dummy.position.set(-70 - (k % 3) * 4, -1.6, -46 + k * 23);
      dummy.rotation.y = Math.PI / 2 + (k % 2) * 0.2;
      dummy.scale.setScalar(0.70 + (k % 3) * 0.16);
      dummy.updateMatrix(); mountains.setMatrixAt(mi++, dummy.matrix);
    }
    mountains.instanceMatrix.needsUpdate = true;
    scene.add(mountains);
  }

  // ── 植被：松、阔叶、山石，按海拔与气候散布 ──
  // 先用程序化几何建好整片森林（保证首屏无网络依赖），trees.glb 就绪后逐批换几何。
  let treeGeos = null, treeMat = null;
  const vegMeshes = {};
  const groves = { pine: [], pineB: [], broad: [], broadB: [], rock: [] };
  const vegStep = low ? 3.1 : 2.05;
  for (let x = -56; x <= 48; x += vegStep) {
    for (let z = -48; z <= 44; z += vegStep) {
      const px = x + (hash(x, z) - 0.5) * 1.5;
      const pz = z + (hash(z + 7, x) - 0.5) * 1.5;
      const h = heightAt(px, pz);
      if (h < 0.82 || h > (hd ? 11.5 : 8.2) || px > 39) continue;
      if (cityDistance(px, pz) < 5.4 || riverProximity(px, pz) < 2.5) continue;
      const n = fbm(px * 0.09 + 33, pz * 0.09 + 21);
      const roll = hash(px * 3.1, pz * 2.7);
      let density = 0;
      if (h > 3.3) density = 0.42 + n * 0.34;
      else if (h > 2.0) density = 0.17 + n * 0.26;
      else density = (pz > 8 ? 0.20 : 0.08) + n * 0.18;
      density = Math.min(0.72, density);
      if (roll > density) continue;
      const y = heightAt(px, pz);
      const scale = 0.62 + hash(px + 11, pz - 4) * 0.82;
      const rot = hash(px - 5, pz + 9) * Math.PI * 2;
      const base = h > 3.4 ? (hash(px + 2, pz + 3) > 0.78 ? 'rock' : 'pine')
        : h > 2.1 ? (hash(px + 2, pz + 3) > 0.42 ? 'pine' : 'broad')
          : (pz < -14 ? 'pine' : 'broad');
      // 松／阔各两套形态，实例随机取用；相同形态仍合批为 1 个 draw call
      const kind = base === 'rock' ? 'rock'
        : (hash(px + 17, pz - 13) > 0.55 ? base + 'B' : base);
      groves[kind].push({ x: px, y, z: pz, scale, rot });
    }
  }
  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const vegDefs = [
    ['pine', pineGeometry(0)], ['pineB', pineGeometry(1)],
    ['broad', broadGeometry(0)], ['broadB', broadGeometry(1)],
    ['rock', rockGeometry()],
  ];
  for (const [kind, g] of vegDefs) {
    const list = groves[kind];
    const im = new THREE.InstancedMesh(g, vegMat, Math.max(1, list.length));
    vegMeshes[kind] = im;
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      const shade = 0.80 + hash(p.x * 1.7, p.z * 2.3) * 0.36;
      im.setColorAt(i, new THREE.Color().setRGB(shade, shade * (0.97 + hash(p.z, p.x) * 0.08), shade * 0.94));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.count = list.length;
    // 实例散布于全图，单一包围球恒与视锥相交；须先按空间 chunk 分组才能安全开启剔除
    im.frustumCulled = false;
    scene.add(im);
  }

  // 质感层：给整片森林补一层贴地软影。树本身不投影（shadow pass 里 400k 三角
  // 会吃掉满帧余量），这层 1 draw call 的半透明圆盘是更便宜的落地感来源。
  if (matOn) {
    const shadowPoints = [];
    for (const k of ['pine', 'pineB', 'broad', 'broadB']) shadowPoints.push(...groves[k]);
    groundShadowCount = shadowPoints.length;
    scene.add(makeGroundShadows(shadowPoints, makeInkTexture()));
  }

  /**
   * Blender 树资产就绪后只换 geometry / material，实例矩阵与逐实例明暗全部沿用：
   * 散布位置、密度、合批数与首屏时序都不变，失败时整片森林保持程序化版本。
   * 冠团是薄壳与针梢片，故这批单独用 DoubleSide，山石仍用单面材质。
   */
  function applyTreeLibrary(geos) {
    if (treeGeos) return;
    treeGeos = geos;
    treeMat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide,
    });
    for (const [kind, name] of Object.entries(TREE_MESHES)) {
      const im = vegMeshes[kind], geo = geos[name];
      if (!im || !geo) continue;
      const old = im.geometry;
      im.geometry = geo;
      im.material = treeMat;
      old.dispose();
    }
  }

  // ── 高清档：陡坡碎岩 ──
  // 参考图里近景白色裸岩是最强的尺度参照，程序化高度场本身给不了「硬边」。
  // 只在坡度 >0.30 且远离城池/河道处稀疏散布，两套变体各 1 个 draw call。
  if (hd) {
    const rocks = [[], []];
    for (let x = -54; x <= 44; x += 5.2) {
      for (let z = -46; z <= 42; z += 5.2) {
        const px = x + (hash(x, z) - 0.5) * 3.2;
        const pz = z + (hash(z + 9, x - 3) - 0.5) * 3.2;
        if (px > 38 || cityDistance(px, pz) < 7.2 || riverProximity(px, pz) < 3.0) continue;
        const h = heightAt(px, pz);
        if (h < 1.7 || h > 11.5) continue;
        const d = 1.0;
        const sx = (heightAt(px + d, pz) - heightAt(px - d, pz)) / (2 * d);
        const sz = (heightAt(px, pz + d) - heightAt(px, pz - d)) / (2 * d);
        if (Math.hypot(sx, sz) < 0.45) continue;                 // 只在真正的陡坡
        if (hash(px * 3.7 + 5, pz * 1.9 - 2) > (terrainStyle === 'real' ? 0.18 : 0.13)) continue;
        const variant = hash(px - 7, pz + 11) > 0.5 ? 1 : 0;
        const main = (terrainStyle === 'real' ? 2.6 : 2.1) + hash(px + 13, pz + 4) * 1.8;
        const rot = hash(px - 2, pz + 8) * Math.PI * 2;
        rocks[variant].push({ x: px, y: h, z: pz, scale: main, rot, sink: 0.34 });
        // 半数点位带一块小副岩，形成嶙峋岩簇而非孤立的规则多面体
        if (hash(px + 31, pz - 6) > 0.45) {
          const ox = px + (hash(px + 3, pz + 2) - 0.5) * 3.4;
          const oz = pz + (hash(px - 4, pz + 7) - 0.5) * 3.4;
          rocks[1 - variant].push({
            x: ox, y: heightAt(ox, oz), z: oz,
            scale: main * (0.46 + hash(ox, oz) * 0.24),
            rot: rot + 1.1, sink: 0.40,
          });
        }
      }
    }
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const tint = new THREE.Color(terrainStyle === 'real' ? 0xf2f0e8 : 0xe4dfcc);
    rocks.forEach((list, i) => {
      const im = new THREE.InstancedMesh(boulderGeometry(i), rockMat, Math.max(1, list.length));
      list.forEach((p, j) => {
        dummy.position.set(p.x, p.y - p.scale * p.sink, p.z);   // 半埋进坡面
        dummy.rotation.set(0, p.rot, 0);
        dummy.scale.set(p.scale, p.scale * (0.82 + hash(p.x, p.z) * 0.38), p.scale * 0.90);
        dummy.updateMatrix();
        im.setMatrixAt(j, dummy.matrix);
        im.setColorAt(j, tint);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.count = list.length;
      im.frustumCulled = false;
      scene.add(im);
      rockCount += list.length;
    });
  }

  // ── 城池 ──
  // 开启贴图时几何在生成阶段就把 UV 压进图集两带（屋顶瓦作／墙面夯土），
  // 不新增批次、不写自定义 shader；关闭时几何与旧版逐字节一致。
  const cityLib = buildCityLibrary(cityTex, matOn);
  // 清河关（持械入宋改编）：敌帜作「蕃」、我帜年款作「清河」，名牌金→蕃
  const qh = state.scenarioId === 'qinghe';
  const foeChar = qh ? '蕃' : '金';
  const flagTex = {
    song: makeFlagTexture(true, '宋', qh ? '清河' : '建炎'),
    jin: makeFlagTexture(false, foeChar, qh ? '蕃部' : '天会'),
    // 小队旗：靛青底白「械」字，只挂在队长坐镇之城（清河关专属），与普通宋帜一眼可辨
    squad: qh ? makeFlagTexture(true, '械', '清河小队', { base: '#2e4a68', gold: '#c8d4e4', ink: '#eef2f8' }) : null,
  };
  const flagMats = {
    song: makeFlagMaterial(flagTex.song, uTime, FLAG_W),
    jin: makeFlagMaterial(flagTex.jin, uTime, FLAG_W),
    squad: qh ? makeFlagMaterial(flagTex.squad, uTime, FLAG_W) : null,
  };
  const flagGeo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 14, 6);
  const matSolid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  let atlas = null;
  if (cityTex) {
    // 图集是「乘性灰度遮罩」而非颜色贴图：故意不做 sRGB 解码，
    // 否则 0.98 会被压成约 0.95 linear，整座城无故变暗。
    atlas = new THREE.TextureLoader().load(new URL('textures/city-surface.png', document.baseURI).href);
    atlas.colorSpace = THREE.NoColorSpace;
    atlas.wrapS = THREE.RepeatWrapping;       // 屋顶沿周长铺 2 圈瓦垄
    atlas.wrapT = THREE.ClampToEdgeWrapping;  // 上下带不循环，隔离带防止串色
    atlas.anisotropy = 4;
    matSolid.map = atlas;
    matSolid.needsUpdate = true;              // 加载失败时仍是默认白纹理，等于静默回退
  }
  const cityViews = {};
  const hitMeshes = [];
  const cityRoot = new THREE.Group();
  scene.add(cityRoot);

  // ── 24 城合批：主体与阵营部件各有 3 套规格，按 tier 分 3+3 个实例批次；
  // 旗面几何共享，按阵营分 2 批。原先 72 个独立 mesh 降为 8 个 draw call，
  // 归属变化只改实例颜色／矩阵，不再逐城切换材质对象。
  const tierIds = [[], [], []];
  CITY_DEFS.forEach(def => tierIds[cityTier(def)].push(def.id));
  const solidBatches = tierIds.map((ids, t) => {
    const im = new THREE.InstancedMesh(cityLib[t].solid, matSolid, Math.max(1, ids.length));
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = ids.length;
    scene.add(im);
    return { im, ids };
  });
  const factionMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  // 阵营部件（门扇、女墙压顶、栏板、腰线）与主体共用同一张乘性图集：
  // instanceColor 仍决定阵营色，图集只补夯土层理的明暗。
  if (atlas) { factionMat.map = atlas; factionMat.needsUpdate = true; }
  const factionBatches = tierIds.map((ids, t) => {
    const im = new THREE.InstancedMesh(cityLib[t].faction, factionMat, Math.max(1, ids.length));
    im.frustumCulled = false;
    im.count = ids.length;
    scene.add(im);
    return { im, ids };
  });
  const flagBatches = {
    song: new THREE.InstancedMesh(flagGeo, flagMats.song, CITY_DEFS.length),
    jin: new THREE.InstancedMesh(flagGeo, flagMats.jin, CITY_DEFS.length),
    // 小队旗至多一面（队长坐镇处），清河关才建批次
    squad: qh ? new THREE.InstancedMesh(flagGeo, flagMats.squad, 1) : null,
  };
  for (const k of ['song', 'jin', 'squad']) {
    if (!flagBatches[k]) continue;
    flagBatches[k].renderOrder = 9;
    flagBatches[k].frustumCulled = false;
    flagBatches[k].name = `flag:${k}`;   // 便于实机验证统计（小队旗只在清河关存在）
    scene.add(flagBatches[k]);
  }
  const CITY_COLORS = { song: new THREE.Color(SONG_COLOR), jin: new THREE.Color(JIN_COLOR) };
  const citySlot = {};

  for (const def of CITY_DEFS) {
    const c = state.cities[def.id];
    const tier = cityTier(def);
    const lib = cityLib[tier];
    const x = c.x, y = heightAt(c.x, c.z), z = c.z;
    const g = new THREE.Group();
    g.position.set(x, y, z);

    const slot = tierIds[tier].indexOf(def.id);
    citySlot[def.id] = { x, y, z, flagPos: lib.flagPos };
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    solidBatches[tier].im.setMatrixAt(slot, dummy.matrix);
    factionBatches[tier].im.setMatrixAt(slot, dummy.matrix);
    factionBatches[tier].im.setColorAt(slot, CITY_COLORS[c.owner]);

    // 州郡名牌
    const { cv, tex } = makeLabelTexture();
    drawLabel(cv, c, false, foeChar);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    label.scale.set(8.0, 2.50, 1);
    label.position.set(0, lib.height + 2.35, 0);
    label.renderOrder = 20;
    g.add(label);

    const rIn = lib.half * 1.95 + 0.62;
    const influence = groundRingAbs(c.x, c.z, rIn, rIn + 0.26, c.owner === 'song' ? SONG_COLOR : JIN_COLOR, 0.32);
    scene.add(influence);
    const selRing = groundRingAbs(c.x, c.z, rIn + 0.48, rIn + 1.05, 0xe0b154, 0);
    scene.add(selRing);
    const reachRing = groundRingAbs(c.x, c.z, rIn - 0.48, rIn - 0.18, 0xf0d08a, 0);
    scene.add(reachRing);
    const stationRing = groundRingAbs(c.x, c.z, rIn + 1.22, rIn + 1.58, 0xe8b64b, 0);
    scene.add(stationRing);
    const isoRing = groundRingAbs(c.x, c.z, rIn + 0.14, rIn + 0.56, 0x6f3f74, 0);
    scene.add(isoRing);
    // 短剧本的朱批圈：标出必守与必取之州，长局恒隐
    const goalRing = groundRingAbs(c.x, c.z, rIn + 1.72, rIn + 2.06, 0xb5483a, 0);
    goalRing.name = `goalRing:${c.id}`;   // 便于实机验证统计朱批圈
    scene.add(goalRing);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(lib.half * 1.5 + 0.7, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.y = lib.height * 0.46;
    hit.layers.set(1);                 // 只参与射线拾取，不进入渲染管线
    hit.userData.cityId = c.id;
    g.add(hit);
    hitMeshes.push(hit);

    cityRoot.add(g);
    cityViews[c.id] = { group: g, label, cv, tex, influence, selRing, reachRing, stationRing, isoRing, goalRing, def, lib };
  }
  for (const b of solidBatches) b.im.instanceMatrix.needsUpdate = true;
  for (const b of factionBatches) b.im.instanceMatrix.needsUpdate = true;

  // ── 清河关布景（持械入宋改编）：清河寨环栅望楼 + 蕃部牙帐群 ──
  // 只在清河关生成、各自合批，约 +5 draw call 换两处地标；他关基线分毫不动。
  if (state.scenarioId === 'qinghe') {
    const ringPts = (id, n, r) => {
      const c = state.cities[id], out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.35;
        const px = c.x + Math.cos(a) * r, pz = c.z + Math.sin(a) * r;
        out.push({ x: px, z: pz, y: heightAt(px, pz), rot: a });
      }
      return out;
    };
    // 清河寨：22 根木栅围一圈（东南留寨门正对官道），南北各一座望楼
    const rQ = cityViews.changan.lib.half * 1.95 + 0.62 + 0.95;
    const ringQ = ringPts('changan', 22, rQ).filter(p => !(p.rot > -0.5 && p.rot < 0.5));   // 东面留门迎官道
    const stakeMat = new THREE.MeshStandardMaterial({ color: 0x6b4e30, roughness: 0.95 });
    const stakes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.15, 0.22), stakeMat, ringQ.length);
    stakes.castShadow = true;
    ringQ.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 0.55, p.z);
      dummy.rotation.set((hash(p.x, p.z) - 0.5) * 0.14, p.rot * 0.1, (hash(p.z, p.x) - 0.5) * 0.12);
      dummy.scale.set(1, 0.85 + hash(p.x, p.z) * 0.35, 1);
      dummy.updateMatrix();
      stakes.setMatrixAt(i, dummy.matrix);
    });
    stakes.instanceMatrix.needsUpdate = true;
    stakes.frustumCulled = false;
    stakes.name = 'qinghe-palisade';   // 便于实机验证按名统计
    scene.add(stakes);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x71543a, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x59503f, roughness: 0.95 });
    for (const ang of [Math.PI / 2, Math.PI * 1.5]) {
      const cq = state.cities.changan;
      const tx = cq.x + Math.cos(ang) * rQ, tz = cq.z + Math.sin(ang) * rQ, ty = heightAt(tx, tz);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.8, 0.52), towerMat);
      tower.position.set(tx, ty + 0.9, tz); tower.castShadow = true; tower.frustumCulled = false;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.55, 4), roofMat);
      roof.position.set(tx, ty + 2.05, tz); roof.rotation.y = Math.PI / 4; roof.frustumCulled = false;
      scene.add(tower, roof);
    }
    // 蕃部大寨：8 顶毡帐散落 + 一顶头人大帐，帐篷一律锥形合批
    const rL = cityViews.luoyang.lib.half * 1.95 + 0.62;
    const campMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const tents = new THREE.InstancedMesh(new THREE.ConeGeometry(0.48, 0.85, 6), campMat, 8);
    tents.castShadow = true;
    const felt = new THREE.Color(0xc9baa0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + hash(i, 3) * 1.2;
      const rr = rL + 1.05 + hash(i, 7) * 0.8;
      const cl = state.cities.luoyang;
      const px = cl.x + Math.cos(a) * rr, pz = cl.z + Math.sin(a) * rr;
      dummy.position.set(px, heightAt(px, pz) + 0.42, pz);
      dummy.rotation.set(0, hash(px, pz) * Math.PI, 0);
      dummy.scale.set(1, 0.85 + hash(pz, px) * 0.3, 1);
      dummy.updateMatrix();
      tents.setMatrixAt(i, dummy.matrix);
      tents.setColorAt(i, felt.clone().offsetHSL(0, 0, (hash(i, 11) - 0.5) * 0.14));
    }
    tents.instanceMatrix.needsUpdate = true;
    if (tents.instanceColor) tents.instanceColor.needsUpdate = true;
    tents.frustumCulled = false;
    tents.name = 'qinghe-tents';   // 便于实机验证按名统计
    scene.add(tents);
    const bigTent = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xa8875c, roughness: 0.9 }));
    {
      const cl = state.cities.luoyang;
      const bx = cl.x - rL - 1.45, bz = cl.z + 0.9;
      bigTent.position.set(bx, heightAt(bx, bz) + 0.74, bz);
      bigTent.castShadow = true; bigTent.frustumCulled = false;
      scene.add(bigTent);
    }
  }

  // 阵营变更后刷新批次：faction 用实例色染阵营，旗面用零缩放隐藏非本阵营实例。
  function refreshFaction(s) {
    for (const k of ['song', 'jin']) {
      const im = flagBatches[k];
      let n = 0;
      for (const def of CITY_DEFS) {
        if (s.cities[def.id].owner !== k) continue;
        // 清河关：队长坐镇之城改挂小队旗（从宋帜批次里摘出）
        if (qh && k === 'song' && def.id === s.heroCity) continue;
        const p = citySlot[def.id];
        dummy.position.set(p.x + p.flagPos[0], p.y + p.flagPos[1], p.z + p.flagPos[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        im.setMatrixAt(n++, dummy.matrix);
      }
      im.count = n;                 // 紧凑排列，不再提交零缩放的退化三角形
      im.instanceMatrix.needsUpdate = true;
    }
    // 小队旗跟随坐镇（坐镇令变化时 update() 会重跑本函数）
    if (qh && flagBatches.squad) {
      const im = flagBatches.squad;
      let n = 0;
      if (s.heroCity && s.cities[s.heroCity]?.owner === 'song') {
        const p = citySlot[s.heroCity];
        dummy.position.set(p.x + p.flagPos[0], p.y + p.flagPos[1], p.z + p.flagPos[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        im.setMatrixAt(n++, dummy.matrix);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
    for (const b of factionBatches) {
      b.ids.forEach((id, i) => b.im.setColorAt(i, CITY_COLORS[s.cities[id].owner]));
      if (b.im.instanceColor) b.im.instanceColor.needsUpdate = true;
    }
  }

  // ── 兵力营帐：全局一个 InstancedMesh，按兵力增减 ──
  const TENT_COLOR = { song: new THREE.Color(SONG_LIGHT), jin: new THREE.Color(JIN_LIGHT) };

  // ── Blender 资产：异步载入，未就绪或加载失败时整层静默回退 ──
  let unitGeos = null;
  let siegeMesh = null;
  const capitalMeshes = {};
  // 两京增饰是「贴合既有屋面的增量构件」，不替换基座：挂到该城的 group 上即可，
  // 名牌／圆环／拾取／朱批圈与 24 城合批全部不受影响。
  const capitalMat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide,
  });
  function attachCapitals(geos) {
    for (const [name, id] of Object.entries(CAPITAL_MESHES)) {
      const geo = geos[name], v = cityViews[id];
      if (!geo || !v || capitalMeshes[id]) continue;
      const mesh = new THREE.Mesh(geo, capitalMat);
      mesh.name = `capital:${id}`;
      mesh.castShadow = !low;
      mesh.receiveShadow = true;
      v.group.add(mesh);
      capitalMeshes[id] = mesh;
    }
  }
  const siegeSlots = [];
  const siegeMat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide,
  });
  // GLB 顶点色是灰度明暗，乘上阵营色即得甲胄／木石的层次
  const unitMat = {
    song: new THREE.MeshStandardMaterial({ color: SONG_LIGHT, vertexColors: true, flatShading: true, roughness: 0.88, side: THREE.DoubleSide }),
    jin: new THREE.MeshStandardMaterial({ color: JIN_LIGHT, vertexColors: true, flatShading: true, roughness: 0.88, side: THREE.DoubleSide }),
  };

  function buildSiege() {
    siegeMesh = new THREE.InstancedMesh(unitGeos.Siege, siegeMat, CITY_DEFS.length * 2);
    siegeMesh.castShadow = !low;
    siegeMesh.frustumCulled = false;   // 全图实例共用一个包围球，同营帐
    for (const def of CITY_DEFS) {
      const lib = cityLib[cityTier(def)];
      for (let k = 0; k < 2; k++) {
        const x = def.x + lib.half * 1.95 + 1.2 + k * 1.0;
        const z = def.z - lib.half * 1.15 - 0.5 - k * 0.4;
        siegeSlots.push({ idx: siegeSlots.length, x, y: heightAt(x, z), z, cityId: def.id });
      }
    }
    scene.add(siegeMesh);
  }

  function updateSiege(s) {
    for (const slot of siegeSlots) {
      const c = s.cities[slot.cityId];
      const shown = c.troops >= 8 ? (c.troops >= 11 ? 2 : 1) : 0;
      const on = slot.idx % 2 < shown;
      dummy.position.set(slot.x, slot.y + 0.02, slot.z);
      dummy.rotation.set(0, slot.idx % 2 ? 0.55 : 0, 0);
      dummy.scale.setScalar(on ? 0.82 : 0);
      dummy.updateMatrix();
      siegeMesh.setMatrixAt(slot.idx, dummy.matrix);
      siegeMesh.setColorAt(slot.idx, TENT_COLOR[c.owner === 'song' ? 'song' : 'jin']);
    }
    siegeMesh.instanceMatrix.needsUpdate = true;
    if (siegeMesh.instanceColor) siegeMesh.instanceColor.needsUpdate = true;
  }
  const tentGeo = tentGeometry();
  if (matOn) applyVerticalAO(tentGeo, 0.9, 1);
  const tentMesh = new THREE.InstancedMesh(
    tentGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
    CITY_DEFS.length * TENT_SLOTS,
  );
  const tentSlots = {};
  CITY_DEFS.forEach((def, ci) => {
    const lib = cityLib[cityTier(def)];
    tentSlots[def.id] = [];
    for (let i = 0; i < TENT_SLOTS; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const x = def.x - lib.half * 1.55 - 0.85 - col * 0.78;
      const z = def.z + lib.half * 1.15 + 0.35 + row * 0.86;
      tentSlots[def.id].push({ idx: ci * TENT_SLOTS + i, x, y: heightAt(x, z), z, rot: hash(x, z) * 0.6 });
    }
  });
  // 同上：24 城实例共用一个包围球，待空间分块后再开启视锥剔除
  tentMesh.frustumCulled = false;
  scene.add(tentMesh);

  // ── 飞鸟 ──
  const birds = [];
  const birdGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.62, 0, 0), new THREE.Vector3(0, 0.17, 0), new THREE.Vector3(0.62, 0, 0),
  ]);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Line(birdGeo, new THREE.LineBasicMaterial({ color: 0x5c5446, transparent: true, opacity: 0.55 }));
    l.scale.setScalar(0.9 + i * 0.22);
    scene.add(l);
    birds.push({ line: l, phase: i * 1.7, radius: 26 + i * 6, speed: 0.16 + i * 0.025, y: 15 + i * 2.2 });
  }

  // ── 特效 ──
  const fx = [];
  const marches = [];
  const shockGeo = new THREE.RingGeometry(0.8, 1.0, 40);
  shockGeo.rotateX(-Math.PI / 2);
  const matPole = new THREE.MeshStandardMaterial({ color: 0x6a533a, roughness: 1 });
  // 行军队伍共享几何与材质，避免每次进军泄漏 GPU 资源
  const marchGeo = {
    rider: new THREE.ConeGeometry(0.22, 0.68, 5),
    pole: new THREE.CylinderGeometry(0.035, 0.035, 1.75, 5),
    flag: new THREE.PlaneGeometry(1.08, 0.68),
    dust: new THREE.SphereGeometry(0.6, 7, 5),
  };
  const marchMat = {
    song: new THREE.MeshStandardMaterial({ color: SONG_COLOR, roughness: 0.75 }),
    jin: new THREE.MeshStandardMaterial({ color: JIN_COLOR, roughness: 0.75 }),
  };
  const marchFlagMat = {
    song: new THREE.MeshBasicMaterial({ map: flagTex.song, side: THREE.DoubleSide, transparent: true }),
    jin: new THREE.MeshBasicMaterial({ map: flagTex.jin, side: THREE.DoubleSide, transparent: true }),
  };
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xc9b792, transparent: true, opacity: 0.30, depthWrite: false });

  function shock(cityId, color) {
    const c = state.cities[cityId];
    for (const [delay, sc] of [[0, 1], [0.13, 0.72]]) {
      const m = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      }));
      m.position.set(c.x, heightAt(c.x, c.z) + 0.30, c.z);
      m.scale.setScalar(sc);
      m.renderOrder = 8;
      scene.add(m);
      fx.push({ mesh: m, t: 0, delay, life: 0.85, baseScale: sc });
    }
  }

  function march({ from, to, owner, result }) {
    const a = state.cities[from], b = state.cities[to];
    const p0 = new THREE.Vector3(a.x, heightAt(a.x, a.z) + 2.6, a.z);
    const p2 = new THREE.Vector3(b.x, heightAt(b.x, b.z) + 2.6, b.z);
    const mid = p0.clone().add(p2).multiplyScalar(0.5);
    mid.y += 7.5;
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const g = new THREE.Group();
    // 三骑：优先用 Blender 建模的低模骑兵，资产未就绪时回退到程序化圆锥
    const riderGeo = units && unitGeos?.Rider;
    for (let i = -1; i <= 1; i++) {
      const rider = new THREE.Mesh(riderGeo || marchGeo.rider, riderGeo ? unitMat[owner] : marchMat[owner]);
      if (riderGeo) {
        rider.scale.setScalar(0.55);
        rider.position.set(i * 0.62, -0.55, i === 0 ? 0 : 0.30);
      } else {
        rider.position.set(i * 0.36, -0.28, i === 0 ? 0 : 0.22);
      }
      g.add(rider);
    }
    const pole = new THREE.Mesh(marchGeo.pole, matPole);
    pole.position.set(riderGeo ? -1.02 : -0.58, 0.62, 0); g.add(pole);
    const fl = new THREE.Mesh(marchGeo.flag, marchFlagMat[owner]);
    fl.position.set(0, 1.10, 0); g.add(fl);
    // 尘土
    const dust = new THREE.Mesh(marchGeo.dust, dustMat);
    dust.position.set(-0.75, -0.35, 0); dust.scale.set(1.6, 0.4, 0.8); g.add(dust);
    g.position.copy(p0);
    scene.add(g);
    marches.push({ g, curve, t: 0, dur: 1.05, to, result, owner });
  }

  // ── 交互 ──
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(1);
  const pointer = new THREE.Vector2();
  let down = null;
  let hovered = null;
  function hitTest(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    return hits.length ? hits[0].object.userData.cityId : null;
  }
  function onDown(ev) { down = { x: ev.clientX, y: ev.clientY }; }
  function onUp(ev) {
    if (!down) return;
    const dist = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (presentation || dist > 6 || ev.button !== 0) return;
    const id = hitTest(ev);
    if (id) onPick(id);
  }
  function onMove(ev) {
    if (presentation) return;   // 开场页不因悬停城池而改鼠标指针
    const id = hitTest(ev);
    if (id !== hovered) {
      hovered = id;
      renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    }
  }
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onMove);

  // ── 状态同步 ──
  let selectedId = null;
  let reachable = [];
  // 透明度归零的圆环直接退出渲染队列，省掉每帧上百个空 draw call
  function setRing(ring, opacity) {
    ring.material.opacity = opacity;
    ring.visible = opacity > 0.001;
  }
  function update(s) {
    const sup = supplyMap(s);
    let tentDirty = false;
    for (const id in cityViews) {
      const v = cityViews[id];
      const c = s.cities[id];
      const song = c.owner === 'song';
      const isolated = song && !sup.linked.has(id);
      v.influence.material.color.setHex(isolated ? 0x6f5b83 : song ? SONG_COLOR : JIN_COLOR);
      setRing(v.influence, isolated ? 0.70 : song ? 0.30 : 0.46);
      // 名牌是 768×240 的 canvas 贴图：只在归属／兵力／选中态变化时重绘上传
      const labelKey = `${c.owner}|${c.troops}|${id === selectedId ? 1 : 0}`;
      if (v.labelKey !== labelKey) {
        drawLabel(v.cv, c, id === selectedId, foeChar);
        v.tex.needsUpdate = true;
        v.labelKey = labelKey;
      }
      setRing(v.selRing, id === selectedId ? 0.95 : 0);
      setRing(v.reachRing, reachable.includes(id) ? 0.8 : 0);
      setRing(v.stationRing, s.stationAt(id) ? 0.85 : 0);
      setRing(v.isoRing, isolated ? 0.82 : 0);
      // 预览态由开场页主题接管；退出后交回 state.scenario 的原有朱批圈
      setRing(v.goalRing, previewMarks
        ? (previewMarks.has(id) ? 0.86 : 0)
        : (s.scenario?.marks?.includes(id) ? 0.72 : 0));

      // 营帐实例同理：兵力档位或阵营没变就不重传矩阵与颜色
      const shown = Math.max(1, Math.min(TENT_SLOTS, Math.ceil(c.troops / 2.4)));
      const tentKey = `${shown}|${song ? 1 : 0}`;
      if (v.tentKey !== tentKey) {
        for (const slot of tentSlots[id]) {
          dummy.position.set(slot.x, slot.y, slot.z);
          dummy.rotation.set(0, slot.rot, 0);
          dummy.scale.setScalar(slot.idx % TENT_SLOTS < shown ? 0.82 : 0);
          dummy.updateMatrix();
          tentMesh.setMatrixAt(slot.idx, dummy.matrix);
          tentMesh.setColorAt(slot.idx, TENT_COLOR[song ? 'song' : 'jin']);
        }
        v.tentKey = tentKey;
        tentDirty = true;
      }
    }
    refreshFaction(s);
    if (tentDirty) {
      tentMesh.instanceMatrix.needsUpdate = true;
      if (tentMesh.instanceColor) tentMesh.instanceColor.needsUpdate = true;
    }
    if (siegeMesh) updateSiege(s);
  }
  function setSelection(id, targets = []) {
    selectedId = id;
    reachable = targets;
    update(state);
  }

  // ── 相机缓动 ──
  let camTween = null;
  function focusCity(id) {
    const c = state.cities[id];
    if (!c) return;
    const delta = new THREE.Vector3(c.x, 0, c.z).sub(controls.target);
    delta.y = 0;
    if (delta.length() > 9) delta.setLength(9);
    camTween = {
      from: controls.target.clone(),
      to: controls.target.clone().add(delta),
      camFrom: camera.position.clone(),
      camTo: camera.position.clone().add(delta),
      fovFrom: camera.fov, fovTo: camera.fov,
      t: 0, speed: 1.8,
    };
  }
  /** 开场页场景切换：position / target / fov 三者同时缓动；immediate 用于首屏与减弱动效。 */
  function flyTo(pose, duration = 1.1, immediate = false) {
    if (!pose) return;
    const to = new THREE.Vector3().fromArray(pose.target);
    const camTo = new THREE.Vector3().fromArray(pose.position);
    const fovTo = pose.fov ?? camera.fov;
    if (immediate) {
      camTween = null;
      controls.target.copy(to);
      camera.position.copy(camTo);
      camera.fov = fovTo;
      camera.updateProjectionMatrix();
      controls.update();
      return;
    }
    camTween = {
      from: controls.target.clone(), to,
      camFrom: camera.position.clone(), camTo,
      fovFrom: camera.fov, fovTo,
      t: 0, speed: 1 / Math.max(0.1, duration),
    };
  }
  function resetCamera() {
    camTween = null;
    const h = homePose();
    camera.position.fromArray(h.position);
    controls.target.fromArray(h.target);
    camera.fov = h.fov;
    camera.updateProjectionMatrix();
    controls.update();
  }

  // ── 开场页表现层 API（视觉只读，不触碰 GameState） ──
  function setPresentation(on) {
    presentation = !!on;
    controls.enabled = !presentation;
    // 名牌是固定尺寸 Sprite：近景主题下会放大到互相重叠，开场页统一收小，退出逐字还原。
    const k = presentation ? 0.66 : 1;
    for (const id in cityViews) cityViews[id].label.scale.set(8.0 * k, 2.50 * k, 1);
  }
  /** 朱批圈是项目已有的「必守／必取」语义，用它表达剧本焦点，不改任何阵营旗色。 */
  function setPreviewMarks(ids) {
    previewMarks = ids && ids.length ? new Set(ids) : null;
    for (const id in cityViews) {
      const base = state.scenario?.marks?.includes(id) ? 0.72 : 0;
      setRing(cityViews[id].goalRing, previewMarks
        ? (previewMarks.has(id) ? 0.86 : 0) : base);
    }
  }
  function captureTheme() {
    return {
      bg: scene.background.getHex(), fogColor: scene.fog.color.getHex(),
      fogNear: scene.fog.near, fogFar: scene.fog.far,
      sunColor: sun.color.getHex(), sunIntensity: sun.intensity,
      sunPos: sun.position.toArray(),
      hemiSky: hemi.color.getHex(), hemiGround: hemi.groundColor.getHex(),
      hemiIntensity: hemi.intensity, ambientIntensity: ambient.intensity,
      fillColor: fill.color.getHex(), fillIntensity: fill.intensity,
      exposure: renderer.toneMappingExposure,
    };
  }
  function restoreTheme(s) {
    scene.background.setHex(s.bg);
    scene.fog.color.setHex(s.fogColor);
    scene.fog.near = s.fogNear; scene.fog.far = s.fogFar;
    sun.color.setHex(s.sunColor); sun.intensity = s.sunIntensity;
    sun.position.fromArray(s.sunPos);
    hemi.color.setHex(s.hemiSky); hemi.groundColor.setHex(s.hemiGround);
    hemi.intensity = s.hemiIntensity; ambient.intensity = s.ambientIntensity;
    fill.color.setHex(s.fillColor); fill.intensity = s.fillIntensity;
    renderer.toneMappingExposure = s.exposure;
    syncSkyTint();
  }
  /** 每次先从原始快照还原再叠加，故连续切主题幂等；light 缺省字段沿用当前档默认值。 */
  function applyTheme(theme) {
    if (themeSnapshot) restoreTheme(themeSnapshot);
    else themeSnapshot = captureTheme();
    themeId = theme?.id ?? null;
    const L = theme?.light;
    if (!L) return;
    if (L.sky !== undefined) {
      scene.background.setHex(L.sky);
      scene.fog.color.setHex(L.sky);
    }
    if (L.fogScale !== undefined) {
      scene.fog.near = themeSnapshot.fogNear * L.fogScale;
      scene.fog.far = themeSnapshot.fogFar * L.fogScale;
    }
    if (L.sunColor !== undefined) sun.color.setHex(L.sunColor);
    sun.intensity = baseSunIntensity * (L.sunMul ?? 1);
    if (L.sunPos) sun.position.fromArray(L.sunPos);
    if (L.hemi) { hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); }
    ambient.intensity = baseAmbientIntensity * (L.ambientMul ?? 1);
    if (L.exposure !== undefined) renderer.toneMappingExposure = L.exposure;
    syncSkyTint();
  }
  function clearTheme() {
    if (themeSnapshot) restoreTheme(themeSnapshot);
    themeSnapshot = null;
    themeId = null;
  }
  /** 进场／续档：一次性退出全部预览态，机位硬切回默认，保证既有实机脚本同帧取到同一画面。 */
  function exitPresentation() {
    setPresentation(false);
    setPreviewMarks(null);
    clearTheme();
    resetCamera();
  }

  // ── 循环 ──
  const clock = new THREE.Clock();
  let elapsed = 0;
  let shadowBaked = false;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    // 减弱动效只停装饰动画；相机聚焦、行军与战报特效仍须正常播完
    const animDt = still ? 0 : dt;
    elapsed += animDt;
    uTime.value = elapsed;
    controls.update();
    if (skyDome) {
      skyDome.position.copy(camera.position);
      sunGlow.position.copy(camera.position)
        .addScaledVector(sunDir.copy(sun.position).normalize(), 260);
    }

    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt * camTween.speed);
      const k = 1 - Math.pow(1 - camTween.t, 3);
      controls.target.lerpVectors(camTween.from, camTween.to, k);
      camera.position.lerpVectors(camTween.camFrom, camTween.camTo, k);
      if (camTween.fovTo !== camTween.fovFrom) {
        camera.fov = camTween.fovFrom + (camTween.fovTo - camTween.fovFrom) * k;
        camera.updateProjectionMatrix();
      }
      if (camTween.t >= 1) camTween = null;
    }

    // 海面起伏由 shader 逐帧完成，这里只推进贴图流动
    waterTexSea.offset.y += animDt * 0.010;
    waterTexSea.offset.x += animDt * 0.004;
    waterTexRiver.offset.y -= animDt * 0.30;

    for (const b of birds) {
      const a = elapsed * b.speed + b.phase;
      b.line.position.set(Math.cos(a) * b.radius - 3, b.y + Math.sin(a * 2.3) * 1.4, Math.sin(a) * b.radius * 0.55 - 8);
      b.line.rotation.y = -a + Math.PI / 2;
    }

    for (const id in cityViews) {
      const v = cityViews[id];
      if (v.selRing.material.opacity > 0) v.selRing.material.opacity = 0.65 + Math.sin(elapsed * 4) * 0.3;
      if (v.reachRing.material.opacity > 0) v.reachRing.material.opacity = 0.55 + Math.sin(elapsed * 3.2) * 0.3;
      // 朱批圈缓缓明灭；系统「减弱动效」时 elapsed 不递增，自然静止
      if (v.goalRing.material.opacity > 0) v.goalRing.material.opacity = 0.54 + Math.sin(elapsed * 2.4) * 0.20;
    }

    for (let i = marches.length - 1; i >= 0; i--) {
      const a = marches[i];
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      a.g.position.copy(a.curve.getPoint(k));
      const ahead = a.curve.getPoint(Math.min(1, k + 0.02));
      a.g.lookAt(ahead);
      a.g.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.30);
      if (k >= 1) {
        shock(a.to, a.result === 'win' ? 0xd9a441 : 0x8a8375);
        scene.remove(a.g);
        marches.splice(i, 1);
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = (f.t - f.delay) / f.life;
      if (k < 0) { f.mesh.material.opacity = 0; continue; }
      f.mesh.scale.setScalar(f.baseScale * (1 + k * 7));
      f.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); fx.splice(i, 1); }
    }

    inkPass.render(scene, camera);
    // 光源与城池均为静态，阴影贴图烘一次即可，省掉每帧一遍深度渲染
    if (!shadowBaked) { shadowBaked = true; renderer.shadowMap.autoUpdate = false; }
  }
  renderer.setAnimationLoop(tick);
  // 显卡上下文丢失后停摆，恢复时重开循环并让阴影重烘一帧
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    shadowBaked = false;
    renderer.setAnimationLoop(tick);
  });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(container);

  update(state);

  // Blender 资产异步装载：不阻塞三维挂载；失败时保持纯程序化几何。
  // 行军特效与军阵器具都只在资产就绪后切换，首屏与默认观感不受影响。
  if (units) {
    loadUnitLibrary()
      .then(geos => {
        unitGeos = geos;
        if (geos.Siege) buildSiege();
        update(state);
      })
      .catch(err => console.warn('[shaosong] Blender 资产未载入，沿用程序化几何：', err));
  }
  if (capitals) {
    loadCapitalLibrary()
      .then(geos => attachCapitals(geos))
      .catch(err => console.warn('[shaosong] 两京增饰未载入，沿用程序化城池：', err));
  }
  if (useTrees) {
    loadTreeLibrary()
      .then(geos => applyTreeLibrary(geos))
      .catch(err => console.warn('[shaosong] 高清树木未载入，沿用程序化树：', err));
  }

  // 可在运行时整层开关，便于同一局面／同一相机做 A/B 截图
  const inkCtl = {
    get enabled() { return inkPass.enabled; },
    setEnabled(on) {
      inkPass.setEnabled(on);
      // 质感层的淡落影独立于墨晕开关：关掉宣纸增强不能把默认落影一起带走
      contactInk.visible = !!on || matOn;
      contactInk.material.opacity = on ? CONTACT_STRONG : CONTACT_SOFT;
    },
    setStrength(s) { inkPass.setStrength(s); },
    info() { return { enabled: inkPass.enabled, ...inkPass.info() }; },
    dispose() { inkPass.dispose(); },
  };

  const assetCtl = {
    get loaded() { return !!unitGeos; },
    info() {
      return {
        enabled: units, loaded: !!unitGeos,
        rider: !!unitGeos?.Rider, siege: !!unitGeos?.Siege,
        siegeInstances: siegeMesh ? siegeMesh.count : 0,
        tex, cityTex, cityMap: !!matSolid.map, factionMap: !!factionMat.map,
        mat: matOn, atmos: atmosOn, skyDome: !!skyDome, sunGlow: !!sunGlow,
        contactInk: contactInk.visible, contactOpacity: contactInk.material.opacity,
        groundShadows: groundShadowCount,
        terrain: terrainStyle, hdSegX: hd ? HD_SEG_X : SEG_X, hdSegZ: hd ? HD_SEG_Z : SEG_Z,
        trees: useTrees, treeLoaded: !!treeGeos, treeKinds: Object.keys(treeGeos || {}),
        treeInstances: treeGeos ? Object.keys(TREE_MESHES)
          .reduce((n, k) => n + (vegMeshes[k]?.count ?? 0), 0) : 0,
        landMap: !!land.material.map, rockInstances: rockCount, ridgeBands: ridgeCount,
        capitals, capitalLoaded: Object.keys(capitalMeshes).length,
        capitalIds: Object.keys(capitalMeshes),
        presentation, controlsEnabled: controls.enabled, themeId,
        themeActive: !!themeSnapshot, previewMarks: previewMarks ? [...previewMarks] : null,
        fov: camera.fov, exposure: renderer.toneMappingExposure,
        sky: scene.background.getHex(), fogNear: scene.fog.near, fogFar: scene.fog.far,
        sunIntensity: sun.intensity, sunPos: sun.position.toArray(),
      };
    },
  };

  return {
    update, setSelection, focusCity, resetCamera, march, shock, resize,
    flyTo, applyTheme, clearTheme, setPresentation, setPreviewMarks, exitPresentation,
    camera, controls, renderer, scene, quality, terrain: terrainStyle,
    ink: inkCtl, assets: assetCtl,
  };
}
