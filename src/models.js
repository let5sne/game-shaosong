/**
 * 《绍宋 · 建炎北伐》程序化建模
 *
 * 全部几何离线生成后按材质合并为整块，24 座城池共享 3 套规格的几何，
 * 每城仅 2 个静态 draw call（石木瓦作 + 阵营色作）。
 * 屋顶采用参数化「举折 + 角翘」曲面，模拟中式庑殿／歇山顶。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SONG_COLOR = 0xb5483a;
export const JIN_COLOR = 0x3d4b60;
export const SONG_LIGHT = 0xd8735c;
export const JIN_LIGHT = 0x6c7f9b;
export const PAPER = 0xece3cd;

const C = {
  stone: 0xd8cbaa,      // 台基、门框
  stoneDk: 0xb8a986,    // 台基线脚
  wall: 0xc4b393,       // 夯土城墙
  wallDk: 0xa99877,     // 墙身分缝
  wood: 0x9c3b2e,       // 朱红柱枋
  woodDk: 0x6f2c23,
  roof: 0x6b7772,       // 青灰筒瓦
  roofAlt: 0x9b8454,    // 都城琉璃瓦
  trim: 0xc9a763,       // 脊饰、门钉
  dark: 0x39352c,       // 门洞、格窗
  lattice: 0xe0d3b2,    // 格扇纸窗
  pole: 0x6a533a,
};

// ── 几何工具：所有部件统一带 position / normal / uv / color ──
function paint(g, hex) {
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function box(w, h, d, x, y, z, hex, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);          // 先在局部定位，再整体绕城心旋转
  if (ry) g.rotateY(ry);
  return paint(g, hex);
}
function cyl(rt, rb, h, x, y, z, hex, seg = 6) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return paint(g, hex);
}
function cone(r, h, x, y, z, hex, seg = 6) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(x, y, z);
  return paint(g, hex);
}
/** 四条细边构成的朱栏，避免整面红色把城台盖成「红地台」 */
function frame(w, d, t, y, hex, dest) {
  dest.push(box(w, 0.05, t, 0, y, d / 2, hex));
  dest.push(box(w, 0.05, t, 0, y, -d / 2, hex));
  dest.push(box(t, 0.05, d, w / 2, y, 0, hex));
  dest.push(box(t, 0.05, d, -w / 2, y, 0, hex));
}
/**
 * 城池表面图集（public/textures/city-surface.png）的 UV 分带。
 * PNG 上半是筒瓦瓦垄、下半是夯土砖缝，中间 8% 为纯白隔离带，
 * 防止远处 mipmap 采样把两带混成一片灰。three 的 flipY 使 v=1 对应 PNG 首行。
 */
export const CITY_ATLAS_BANDS = Object.freeze({
  roof: [0.54, 0.96],
  wall: [0.04, 0.46],
});

/**
 * 把单个部件的 UV 压进图集某一带。
 * u 只做整数倍放大、不取 fract：UV 保持连续，交给 wrapS=Repeat 平铺，mipmap 导数不会在接缝处炸开。
 * 只有 ?tex=1 / ?ctex=1 时才调用；默认不贴图时几何与原先逐字节一致。
 */
function atlasUv(g, band, repeatU = 1) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  const [v0, v1] = CITY_ATLAS_BANDS[band];
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * repeatU, v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * 廉价竖向环境光遮蔽：按局部高度与法线朝向给顶点色乘一个渐变，
 * 让台基、柱脚、檐底比屋面／脊饰沉一些。只改 color，不碰 position / normal /
 * uv / index，故 withAtlas 与否仍可逐字节比对。
 * 均值刻意留在 1.0 附近（以 up=0.5 为轴上下对称），整体亮度不变，只重新分配明暗；
 * 朝下的面（檐底、台基）额外压暗，体积感主要来自这一项。
 */
function verticalAOFactor(y, ny, refHeight, strength) {
  const up = Math.max(0, Math.min(1, y / (refHeight * 0.85)));
  const down = Math.max(0, -ny);
  return Math.max(0.78, 1 + strength * (0.12 * (up - 0.5) - 0.18 * down));
}

/** 整组几何共用的归一化基准；不传则单块几何自身归一化。 */
export function meanVerticalAO(geos, refHeight = 6, strength = 1) {
  let sum = 0, n = 0;
  for (const g of geos) {
    const p = g.attributes.position, nn = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      sum += verticalAOFactor(p.getY(i), nn ? nn.getY(i) : 0, refHeight, strength);
      n++;
    }
  }
  return n ? sum / n : 1;
}

export function applyVerticalAO(g, refHeight = 6, strength = 1, meanF = null) {
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
  if (!c) return g;
  const fs = new Float32Array(c.count);
  let sum = 0;
  for (let i = 0; i < c.count; i++) {
    fs[i] = verticalAOFactor(p.getY(i), n ? n.getY(i) : 0, refHeight, strength);
    sum += fs[i];
  }
  const norm = meanF ?? (sum > 0 ? sum / c.count : 1);
  for (let i = 0; i < c.count; i++) {
    const f = fs[i] / norm;
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  c.needsUpdate = true;
  return g;
}

function merge(list) {
  // 多面体是 non-indexed，其余是 indexed；统一补顺序索引，避免合并失败
  list.forEach(g => {
    if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  });
  const g = mergeGeometries(list, false);
  list.forEach(x => x.dispose());
  if (!g) throw new Error('几何合并失败：属性不一致');
  return g;
}

/**
 * 中式屋顶：沿矩形檐口向屋脊放样。
 * - y = h * t^1.45  → 举折，脊陡檐缓
 * - 四角按 (1-t)^2.6 抬升并外挑 → 起翘飞檐
 * - 顶点色按周长交替 → 筒瓦垄
 */
function roofGeo(w, d, h, ox, oy, oz, hex, opts = {}) {
  const N = opts.quality || 10;           // 每边分段
  const L = opts.levels || 8;             // 坡面层数
  const P = N * 4;                        // 每环点数
  const over = opts.overhang ?? 0.26;
  const upturn = opts.upturn ?? 0.30;
  const ridgeW = opts.ridgeW ?? w * 0.34;
  const thick = opts.thick ?? 0.11;
  const rings = L + 1;                    // 环 0 = 檐板下沿，环 1..L = 坡面 t:0→1
  const pos = [], uv = [], col = [], idx = [];
  const base = new THREE.Color(hex);

  function pt(t, s) {
    const seg = Math.floor(s / N), f = (s % N) / N;
    let u, v;
    if (seg === 0) { u = -1 + 2 * f; v = -1; }
    else if (seg === 1) { u = 1; v = -1 + 2 * f; }
    else if (seg === 2) { u = 1 - 2 * f; v = 1; }
    else { u = -1; v = 1 - 2 * f; }
    const ease = Math.pow(t, 0.92);
    const hw = THREE.MathUtils.lerp(w / 2 + over, ridgeW / 2, ease);
    const hd = THREE.MathUtils.lerp(d / 2 + over, 0.055, ease);
    const cw = Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4);
    const corner = Math.max(0, Math.min(1, cw - 1));
    const flare = 1 + 0.11 * corner * Math.pow(1 - t, 2);
    const x = u * hw * flare;
    const z = v * hd * flare;
    const y = h * Math.pow(t, 1.45) + upturn * corner * Math.pow(Math.max(0, 1 - t), 2.6);
    return [x, y, z, s, t, corner];
  }

  for (let r = 0; r < rings; r++) {
    const bottom = r === 0;
    const t = r <= 1 ? 0 : (r - 1) / (L - 1);
    for (let s = 0; s < P; s++) {
      const [x, y, z, , , corner] = pt(t, s);
      pos.push(x + ox, y + oy - (bottom ? thick : 0), z + oz);
      uv.push(s / P, t);
      const ridge = Math.floor(s / 2) % 2 ? 1 : 0;
      // 角部沿坡向汇聚的亮线，读作垂脊
      const k = 0.90 + 0.11 * ridge + 0.12 * t + 0.20 * corner * (1 - t * 0.6) - (bottom ? 0.20 : 0);
      col.push(base.r * k, base.g * k, base.b * k);
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < P; s++) {
      const s2 = (s + 1) % P;
      const a0 = r * P + s, a1 = r * P + s2;
      const b0 = (r + 1) * P + s, b1 = (r + 1) * P + s2;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 攒尖小顶（角楼、营帐顶） */
function spireRoof(size, h, x, y, z, hex) {
  return roofGeo(size, size, h, x, y, z, hex, {
    quality: 6, levels: 5, overhang: size * 0.16,
    upturn: size * 0.14, ridgeW: size * 0.12, thick: 0.06,
  });
}

/** 正脊 + 两端鸱吻 */
function ridgeParts(w, x, y, z, hex, list, roofSet = null) {
  const start = list.length;
  const bright = new THREE.Color(hex).multiplyScalar(1.32);
  list.push(box(w + 0.20, 0.18, 0.22, x, y + 0.07, z, bright));
  for (const s of [-1, 1]) {
    const g = new THREE.ConeGeometry(0.14, 0.34, 4);
    g.rotateZ(-s * 0.38);
    g.translate(x + s * (w / 2 + 0.06), y + 0.28, z);
    list.push(paint(g, C.trim));
  }
  if (roofSet) for (let i = start; i < list.length; i++) roofSet.add(list[i]);
}

// ── 城池规格 ────────────────────────────────────────────────
const TIERS = [
  { half: 1.42, wallH: 0.86, towerH: 0.95, double: false, roofHex: C.roof, turrets: true },
  { half: 1.70, wallH: 1.00, towerH: 1.10, double: false, roofHex: C.roof, turrets: true },
  { half: 2.02, wallH: 1.16, towerH: 1.24, double: true, roofHex: C.roofAlt, turrets: true },
];

export function cityTier(def) {
  if (def.capitalOfJin || def.capitalOfSong || def.seat || def.id === 'kaifeng' || def.id === 'jiankang') return 2;
  if (def.yieldGrain >= 7 || def.troops >= 7) return 1;
  return 0;
}

/**
 * 生成一套城池几何。
 * 返回 { solid, faction, flagPos:[x,y,z], pole:[x,y,z], height, half }
 * solid 使用白色材质 + 顶点色；faction 使用阵营材质 + 白色顶点色。
 */
export function buildCityGeometry(tierIdx, withAtlas = false, withAO = false) {
  const T = TIERS[tierIdx];
  const A = [], F = [];
  // 屋顶／屋脊部件单独标记（不另开数组），保证合并顺序与未贴图版本完全相同
  const roofParts = new Set();
  const addRoof = g => { A.push(g); roofParts.add(g); return g; };
  const half = T.half;
  const wallH = T.wallH;
  const baseTop = 0.42;                       // 台基顶
  const wallTop = baseTop + wallH;
  const gateW = 0.86, gateH = Math.min(0.66, wallH * 0.72);

  // ① 须弥座台基：两层收分 + 腰线
  A.push(box(half * 2.62, 0.26, half * 2.62, 0, 0.13, 0, C.stoneDk));
  A.push(box(half * 2.40, 0.16, half * 2.40, 0, 0.34, 0, C.stone));
  A.push(box(half * 2.46, 0.045, half * 2.46, 0, 0.265, 0, C.stoneDk));
  frame(half * 2.44, half * 2.44, 0.13, 0.415, 0xffffff, F);

  // ② 四面城墙（正面留券门）
  const tw = 0.26;
  for (let k = 0; k < 4; k++) {
    const ry = k * Math.PI / 2;
    // 局部坐标构造后整体绕城心旋转到对应边（k=0 为正面 +Z，留券门）
    const mk = (w, h, d, lx, ly, lz, hex, dest = A) => {
      dest.push(box(w, h, d, lx, ly, lz, hex, ry));
    };
    if (k === 0) {
      const side = (half * 2 - gateW) / 2;
      mk(side, wallH, tw, -(gateW + side) / 2, baseTop + wallH / 2, 0, C.wall);
      mk(side, wallH, tw, (gateW + side) / 2, baseTop + wallH / 2, 0, C.wall);
      mk(gateW, wallH - gateH, tw, 0, baseTop + gateH + (wallH - gateH) / 2, 0, C.wall);
      // 门框、门楣、朱红门扇（阵营色）
      mk(0.10, gateH, tw + 0.10, -gateW / 2, baseTop + gateH / 2, 0, C.stone);
      mk(0.10, gateH, tw + 0.10, gateW / 2, baseTop + gateH / 2, 0, C.stone);
      mk(gateW + 0.22, 0.10, tw + 0.12, 0, baseTop + gateH, 0, C.stoneDk);
      mk(gateW - 0.10, gateH - 0.10, 0.07, 0, baseTop + gateH / 2, 0.02, 0xffffff, F);
      for (let r = 0; r < 3; r++) for (let q = -1; q <= 1; q += 2) {
        mk(0.035, 0.035, 0.02, q * 0.13, baseTop + 0.18 + r * 0.15, 0.065, C.trim);
      }
      // 门前踏道
      for (let i = 0; i < 3; i++) mk(gateW * 0.8 + i * 0.10, 0.05, 0.13, 0, 0.09 + i * 0.05, half + 0.17 + i * 0.07, C.stoneDk);
    } else {
      mk(half * 2, wallH, tw, 0, baseTop + wallH / 2, 0, C.wall);
    }
    // 墙身分缝（竖向壁柱）
    for (const u of [-half * 0.55, half * 0.55]) mk(0.06, wallH * 0.9, tw + 0.05, u, baseTop + wallH / 2, 0, C.wallDk);
    // 女墙压顶（阵营色）
    mk(half * 2 + 0.12, 0.055, tw + 0.09, 0, wallTop + 0.03, 0, 0xffffff, F);
    // 垛口
    const cnt = Math.round(half * 5);
    for (let i = 0; i <= cnt; i++) {
      const u = -half + (half * 2 * i) / cnt;
      if (k === 0 && Math.abs(u) < gateW / 2 + 0.1) continue;
      mk(half * 2 / cnt * 0.52, 0.20, tw + 0.02, u, wallTop + 0.16, 0, C.stone);
    }
    // 马面（正面留门，不设敌台）
    if (k !== 0) mk(half * 0.34, wallH * 1.05, 0.34, 0, baseTop + wallH / 2, half + 0.16, C.wallDk);
  }

  // ③ 四角角楼
  if (T.turrets) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (half - 0.12), z = sz * (half - 0.12);
      A.push(box(0.52, 0.34, 0.52, x, wallTop + 0.17, z, C.stone));
      A.push(box(0.38, 0.30, 0.38, x, wallTop + 0.49, z, C.lattice));
      for (const dx of [-0.16, 0.16]) A.push(box(0.045, 0.30, 0.045, x + dx, wallTop + 0.49, z + 0.19, C.wood));
      addRoof(spireRoof(0.76, 0.55, x, wallTop + 0.64, z, T.roofHex));
      A.push(cone(0.05, 0.16, x, wallTop + 1.24, z, C.trim, 4));
    }
  }

  // ④ 中央城楼：城台 → 柱廊 → 重檐屋顶
  const tw2 = half * 1.02;
  const deckY = wallTop + 0.02;
  A.push(box(tw2 * 2, 0.20, tw2 * 2, 0, deckY - 0.10, 0, C.stoneDk));
  frame(tw2 * 2 + 0.06, tw2 * 2 + 0.06, 0.14, deckY + 0.02, 0xffffff, F);

  const colH = T.towerH;
  const colX = tw2 * 0.70, colZ = tw2 * 0.70;
  // 柱廊 + 格扇 + 额枋
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    A.push(cyl(0.075, 0.085, colH, sx * colX, deckY + colH / 2, sz * colZ, C.wood, 8));
    A.push(cyl(0.105, 0.105, 0.06, sx * colX, deckY + 0.03, sz * colZ, C.stoneDk, 8));
  }
  A.push(box(colX * 2 + 0.24, 0.10, 0.12, 0, deckY + colH - 0.02, colZ, C.woodDk));
  A.push(box(colX * 2 + 0.24, 0.10, 0.12, 0, deckY + colH - 0.02, -colZ, C.woodDk));
  A.push(box(0.12, 0.10, colZ * 2 + 0.24, colX, deckY + colH - 0.02, 0, C.woodDk));
  A.push(box(0.12, 0.10, colZ * 2 + 0.24, -colX, deckY + colH - 0.02, 0, C.woodDk));
  // 格扇：纸窗 + 木格
  A.push(box(colX * 1.9, colH * 0.82, 0.06, 0, deckY + colH * 0.45, colZ - 0.04, C.lattice));
  A.push(box(colX * 1.9, colH * 0.82, 0.06, 0, deckY + colH * 0.45, -colZ + 0.04, C.lattice));
  for (let i = -2; i <= 2; i++) {
    A.push(box(0.035, colH * 0.82, 0.08, i * colX * 0.38, deckY + colH * 0.45, colZ, C.woodDk));
    A.push(box(0.035, colH * 0.82, 0.08, i * colX * 0.38, deckY + colH * 0.45, -colZ, C.woodDk));
  }
  A.push(box(colX * 2 + 0.20, 0.07, colZ * 2 + 0.20, 0, deckY + colH + 0.02, 0, C.woodDk));
  // 栏板（阵营色）
  F.push(box(colX * 2 + 0.30, 0.16, 0.06, 0, deckY + 0.12, colZ + 0.16, 0xffffff));

  const lowerY = deckY + colH + 0.04;
  let roofTop;
  if (T.double) {
    // 重檐：下檐 → 平坐 → 上层小楼 → 上檐
    const lw = tw2 * 1.52;
    addRoof(roofGeo(lw, lw, 0.80, 0, lowerY, 0, T.roofHex, { upturn: 0.30, overhang: 0.20 }));
    ridgeParts(lw * 0.34, 0, lowerY + 0.80, 0, T.roofHex, A, roofParts);
    const upY = lowerY + 0.88;
    A.push(box(tw2 * 1.25, 0.14, tw2 * 1.25, 0, upY, 0, C.stoneDk));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      A.push(cyl(0.055, 0.06, 0.52, sx * tw2 * 0.46, upY + 0.30, sz * tw2 * 0.46, C.wood, 6));
    }
    A.push(box(tw2 * 1.05, 0.46, tw2 * 1.05, 0, upY + 0.30, 0, C.lattice));
    const uw = tw2 * 1.16;
    addRoof(roofGeo(uw, uw, 0.95, 0, upY + 0.56, 0, T.roofHex, { upturn: 0.34, overhang: 0.18 }));
    ridgeParts(uw * 0.34, 0, upY + 1.51, 0, T.roofHex, A, roofParts);
    roofTop = 2.39;
  } else {
    const rw = tw2 * 1.58;
    addRoof(roofGeo(rw, rw, 1.15, 0, lowerY, 0, T.roofHex, { upturn: 0.32, overhang: 0.20 }));
    ridgeParts(rw * 0.34, 0, lowerY + 1.15, 0, T.roofHex, A, roofParts);
    roofTop = 1.15;
  }

  // ⑤ 城内民居：几处小青瓦屋，避免城中空旷
  const house = (hx, hz, s) => {
    A.push(box(0.52 * s, 0.34 * s, 0.44 * s, hx, wallTop + 0.17 * s, hz, C.stone));
    addRoof(spireRoof(0.70 * s, 0.38 * s, hx, wallTop + 0.34 * s, hz, C.roof));
  };
  house(-half * 0.58, -half * 0.58, 0.85);
  house(half * 0.58, -half * 0.58, 0.75);
  if (tierIdx > 0) house(-half * 0.60, half * 0.52, 0.70);

  // ⑥ 旗杆、枪尖、缨穗（旗面独立动态）
  const px = half * 0.92, pz = half * 0.92;
  const poleBase = wallTop - 0.10;
  const poleTop = lowerY + roofTop + 0.72;
  A.push(cyl(0.045, 0.065, poleTop - poleBase, px, (poleBase + poleTop) / 2, pz, C.pole, 8));
  A.push(cone(0.085, 0.30, px, poleTop + 0.15, pz, C.trim, 6));
  A.push(cone(0.09, 0.20, px, poleTop - 0.06, pz, 0x9c3b2e, 6));

  // 仅在启用城池贴图时重映射 UV：墙／台基／木构压进夯土带，屋顶／屋脊压进瓦作带
  //（屋顶沿周长铺 2 圈瓦垄）；阵营部件（门扇、压顶、栏板）压进夯土带，
  // 让 24 城的所有部件共享同一份表面细节。未启用时不动任何顶点数据。
  if (withAtlas) {
    for (const g of A) {
      const roof = roofParts.has(g);
      atlasUv(g, roof ? 'roof' : 'wall', roof ? 2 : 1);
    }
    for (const g of F) atlasUv(g, 'wall', 1);
  }
  // 质感层：只重分配顶点色明暗，不改几何结构，故两种 UV 版本仍可逐字节比对
  if (withAO) {
    // 整城共用一个归一化基准：若每个小 box 各自归一化，单块内部高度差太小，
    // AO 会被抹平成 1，屋檐／台基／柱脚的层次就出不来。
    const parts = [...A, ...F];
    const meanF = meanVerticalAO(parts, poleTop, 1);
    for (const g of parts) applyVerticalAO(g, poleTop, 1, meanF);
  }

  return {
    solid: merge(A),
    faction: merge(F),
    flagPos: [px + 0.78, poleTop - 0.62, pz],
    pole: [px, poleTop, pz],
    height: poleTop,
    half,
  };
}

/** 3 套规格共享几何；两个增强开关默认 false，保证 ?mat=0 时逐字节零回归 */
export function buildCityLibrary(withAtlas = false, withAO = false) {
  return [0, 1, 2].map(i => buildCityGeometry(i, withAtlas, withAO));
}

// ── 贴图 ────────────────────────────────────────────────────
function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 牙边军旗：布纹、金线、大字、三角牙边 */
export function makeFlagTexture(song) {
  const cv = canvas(384, 240);
  const ctx = cv.getContext('2d');
  const base = song ? '#a8392f' : '#2f3d51';
  const gold = song ? '#e8c98a' : '#c2c4ae';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 384, 240);
  // 布纹
  for (let y = 0; y < 240; y += 4) {
    ctx.fillStyle = `rgba(255,255,255,${0.012 + (y % 8 === 0 ? 0.018 : 0)})`;
    ctx.fillRect(0, y, 384, 1);
  }
  const grad = ctx.createLinearGradient(0, 0, 384, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.22)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 384, 240);
  // 双金线内框
  ctx.strokeStyle = gold; ctx.lineWidth = 5;
  ctx.strokeRect(16, 16, 352, 208);
  ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, 332, 188);
  ctx.globalAlpha = 1;
  // 大字
  ctx.fillStyle = song ? '#f7e9c8' : '#e9e6d4';
  ctx.font = 'bold 132px "Songti SC","STSong","SimSun",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(song ? '宋' : '金', 176, 118);
  ctx.font = '30px "Songti SC","STSong","SimSun",serif';
  ctx.fillStyle = gold;
  ctx.fillText(song ? '建炎' : '天会', 300, 118);
  // 右侧牙边（三角缺口）
  ctx.globalCompositeOperation = 'destination-out';
  for (let y = 10; y < 240; y += 30) {
    ctx.beginPath();
    ctx.moveTo(384, y); ctx.lineTo(366, y + 15); ctx.lineTo(384, y + 30);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 流动水纹：透明底 + 浅色波纹线，UV 偏移做流动 */
export function makeWaterTexture() {
  const cv = canvas(256, 256);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 22; i++) {
    const y = i * 12 + (i % 3) * 3;
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 8) {
      const yy = y + Math.sin(x * 0.045 + i * 1.7) * 3.2;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.10 + (i % 4) * 0.045})`;
    ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.1;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 州郡名牌：宣纸底、朱丝栏、阵营印 */
export function makeLabelTexture() {
  const cv = canvas(768, 240);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { cv, tex };
}
export function drawLabel(cv, city, selected) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const song = city.owner === 'song';
  const accent = song ? '#b5483a' : '#3d4b60';
  // 纸纹
  ctx.fillStyle = selected ? 'rgba(255,251,238,0.985)' : 'rgba(250,245,231,0.95)';
  roundRect(ctx, 10, 12, W - 20, H - 24, 18); ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = selected ? 11 : 6;
  roundRect(ctx, 10, 12, W - 20, H - 24, 18); ctx.stroke();
  ctx.fillStyle = accent;
  roundRect(ctx, 10, 12, 22, H - 24, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(120,105,80,0.30)'; ctx.lineWidth = 1.5;
  roundRect(ctx, 28, 28, W - 56, H - 56, 10); ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'start';
  ctx.fillStyle = '#2c2a24';
  ctx.font = 'bold 100px "Songti SC","STSong","SimSun",serif';
  ctx.fillText(city.name, 54, 92, 560);
  ctx.font = '52px "Songti SC","STSong","SimSun",serif';
  ctx.fillStyle = '#6a6355';
  ctx.fillText(`${song ? '宋' : '金'} · ${city.troops} 营`, 58, 180);
  ctx.fillStyle = accent;
  roundRect(ctx, 646, 148, 86, 70, 10); ctx.fill();
  ctx.fillStyle = '#faf4e4';
  ctx.font = 'bold 50px "Songti SC","STSong","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText(song ? '宋' : '金', 689, 185);
  ctx.textAlign = 'start';
}

/** 旗面材质：GPU 顶点波动，24 面旗共享同一份时间 uniform */
export function makeFlagMaterial(tex, uTime, width) {
  const m = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.DoubleSide, transparent: true,
    depthWrite: false, alphaTest: 0.02,
  });
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float fk = clamp((transformed.x + ${(width / 2).toFixed(3)}) / ${width.toFixed(3)}, 0.0, 1.0);
        transformed.z += sin(fk * 8.0 - uTime * 3.0 + transformed.y * 2.2) * 0.24 * pow(fk, 1.4);
        transformed.y += cos(fk * 5.5 - uTime * 2.4) * 0.05 * fk;
      `);
  };
  m.customProgramCacheKey = () => 'shaosong-flag-wave';
  return m;
}

// ── 地表植被 / 营帐几何 ────────────────────────────────────
export function pineGeometry(variant = 0) {
  const a = [];
  const k = variant ? 1.10 : 1;      // 变体更高瘦，另加一层偏冠
  const s = variant ? 0.90 : 1;
  a.push(cyl(0.07, 0.10, 0.72 * k, 0, 0.36 * k, 0, 0x6b543c, 5));
  a.push(cone(0.48 * s, 0.78 * k, 0, 0.92 * k, 0, 0x4d6b4c, 6));
  a.push(cone(0.37 * s, 0.68 * k, 0, 1.34 * k, 0, 0x5c7d56, 6));
  a.push(cone(0.25 * s, 0.55 * k, 0, 1.72 * k, 0, 0x6d9060, 6));
  if (variant) a.push(cone(0.16, 0.36, 0.13, 1.98 * k, 0.07, 0x7fa06e, 5));
  return merge(a);
}
export function broadGeometry(variant = 0) {
  const a = [];
  a.push(cyl(0.075, 0.11, 0.78, 0, 0.39, 0, 0x6b543c, 5));
  const g = new THREE.IcosahedronGeometry(variant ? 0.55 : 0.62, 0);
  g.scale(1, variant ? 0.95 : 0.82, 1);
  g.translate(0, variant ? 1.28 : 1.18, 0);
  a.push(paint(g, 0x6e9460));
  const g2 = new THREE.IcosahedronGeometry(variant ? 0.50 : 0.42, 0);
  g2.translate(variant ? -0.32 : 0.34, variant ? 1.02 : 0.92, variant ? 0.18 : 0.14);
  a.push(paint(g2, 0x7fa46c));
  if (variant) {
    const g3 = new THREE.IcosahedronGeometry(0.34, 0);
    g3.translate(0.28, 1.46, -0.10);
    a.push(paint(g3, 0x8aae76));
  }
  return merge(a);
}
export function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(0.52, 0);
  g.scale(1, 0.62, 0.86);
  g.translate(0, 0.24, 0);
  return paint(g, 0x9b9787);
}
/**
 * 高清地貌档的碎岩体：二十面体细分后按顶点位置做确定性扰动，
 * 保留低多边形棱面，但轮廓不再是规则球/十二面体。两套变体由 variant 区分。
 * 顶点色只写灰白明暗（朝上更亮、侧面更暗），整体色由 instanceColor 乘上去。
 */
export function boulderGeometry(variant = 0) {
  const src = new THREE.IcosahedronGeometry(1, 1);
  const g = src.index ? src.toNonIndexed() : src;
  if (g !== src) src.dispose();
  const p = g.attributes.position;
  const seed = variant * 17.31;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 7.3 + seed) * Math.cos(z * 6.1 - seed) * Math.sin(y * 5.7 + seed * 0.7);
    const chip = Math.sin(x * 13.7 + z * 11.3 + seed) * Math.cos(y * 12.1 - seed);
    const r = 1 + n * 0.34 + chip * 0.13 + Math.sin(y * 3.1 + seed) * 0.13;
    // 柔和削底：岩体坐在坡面上，但不留「切开的宝石」那种硬平面
    const yy = y * r * 0.94;
    p.setXYZ(i, x * r * 1.12,
      (yy < -0.30 ? -0.30 + (yy + 0.30) * 0.25 : yy) + 0.06,
      z * r * 0.90);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  const arr = new Float32Array(p.count * 3);
  const top = new THREE.Color(0xf0f2ec), side = new THREE.Color(0x868b83), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const up = Math.max(0, Math.min(1, nr.getY(i) * 0.85 + 0.15));
    c.copy(side).lerp(top, up * up);
    const fleck = 0.94 + Math.abs(Math.sin(p.getX(i) * 9.1 + p.getZ(i) * 6.7 + seed)) * 0.09;
    arr[i * 3] = c.r * fleck; arr[i * 3 + 1] = c.g * fleck; arr[i * 3 + 2] = c.b * fleck;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function tentGeometry() {
  const a = [];
  a.push(cyl(0.40, 0.43, 0.10, 0, 0.05, 0, 0xffffff, 6));
  a.push(cone(0.42, 0.62, 0, 0.41, 0, 0xffffff, 6));
  a.push(cone(0.07, 0.22, 0, 0.80, 0, 0xc9a763, 4));
  return merge(a);
}

/** 远山：一簇低多边形山峰，用 InstancedMesh 沿边界摆放，由雾融进纸面 */
export function mountainClusterGeometry(seed = 1) {
  const a = [];
  for (let i = 0; i < 7; i++) {
    const r1 = hash2(i, seed), r2 = hash2(i, seed + 31);
    const h = 3.6 + r1 * 4.6;
    const r = 3.4 + r2 * 3.6;
    const g = new THREE.CylinderGeometry(r * 0.28, r, h, 5, 1);
    g.rotateY(r1 * 3.1);
    g.scale(1, 1, 0.78);
    g.translate((i / 6 - 0.5) * 24, h / 2, (r2 - 0.5) * 6);
    const shade = 0.90 + hash2(i, seed + 9) * 0.16;
    a.push(paint(g, new THREE.Color(0xb2bba8).multiplyScalar(shade)));
  }
  return merge(a);
}
function hash2(a, b) { const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return n - Math.floor(n); }

// ── Blender 离线资产 ──────────────────────────────────────────
/**
 * 极简 glTF 2.0 GLB 读取：只处理本项目 Blender 导出的静态网格。
 * 支持 POSITION / NORMAL / COLOR_0 / 索引；贴图、动画、蒙皮、稀疏访问器不支持。
 * 两个静态网格不值得引入整个 GLTFLoader（会把 three 主包撑大 85 KB）。
 */
export function readUnitsGlb(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('不是 GLB 文件');
  let off = 12, json = null, bin = null;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, start, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buf, start, len);
    off = start + len;
  }
  if (!json || !bin) throw new Error('GLB 缺少 JSON 或 BIN chunk');

  const COMP = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const WIDTH = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
  const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function accessor(i) {
    const a = json.accessors[i];
    const Arr = COMP[a.componentType];
    if (!Arr) throw new Error(`不支持的 componentType ${a.componentType}`);
    const n = NUM[a.type];
    const view = json.bufferViews[a.bufferView];
    const stride = view.byteStride || n * WIDTH[a.componentType];
    const base = (view.byteOffset || 0) + (a.byteOffset || 0);
    const count = a.count;
    if (stride === n * WIDTH[a.componentType]) {
      return new Arr(bin.buffer, bin.byteOffset + base, count * n);
    }
    const out = new Arr(count * n);          // 交错存储：逐元素展开
    for (let k = 0; k < count; k++) {
      out.set(new Arr(bin.buffer, bin.byteOffset + base + k * stride, n), k * n);
    }
    return out;
  }

  const out = {};
  for (const mesh of json.meshes) {
    const p = mesh.primitives[0];
    if (p.mode !== undefined && p.mode !== 4) throw new Error('仅支持三角形网格');
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(accessor(p.attributes.POSITION), 3));
    if (p.attributes.NORMAL !== undefined) {
      geo.setAttribute('normal', new THREE.BufferAttribute(accessor(p.attributes.NORMAL), 3));
    }
    if (p.attributes.COLOR_0 !== undefined) {
      const a = json.accessors[p.attributes.COLOR_0];
      const src = accessor(p.attributes.COLOR_0);
      const n = NUM[a.type];
      const norm = a.normalized ? 1 / (2 ** (8 * WIDTH[a.componentType]) - 1) : 1;
      const rgb = new Float32Array(a.count * 3);
      for (let k = 0; k < a.count; k++) {
        rgb[k * 3] = src[k * n] * norm;
        rgb[k * 3 + 1] = src[k * n + 1] * norm;
        rgb[k * 3 + 2] = src[k * n + 2] * norm;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    }
    if (p.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(accessor(p.indices), 1));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.computeBoundingBox();
    out[mesh.name] = geo;
  }
  return out;
}

/** 加载 public/models/units.glb；失败时抛错，由调用方回退到程序化几何。 */
export async function loadUnitLibrary() {
  const url = new URL('models/units.glb', document.baseURI).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`units.glb HTTP ${res.status}`);
  const geos = readUnitsGlb(await res.arrayBuffer());
  if (!geos.Rider && !geos.Siege) throw new Error('GLB 中没有可用网格');
  return geos;
}

/** 加载 public/models/capitals.glb：两京主角级增饰，与上面共用同一个解析器。 */
export async function loadCapitalLibrary() {
  const url = new URL('models/capitals.glb', document.baseURI).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`capitals.glb HTTP ${res.status}`);
  const geos = readUnitsGlb(await res.arrayBuffer());
  if (!geos.Kaifeng || !geos.Yanjing) throw new Error('GLB 缺少两京网格');
  return geos;
}

/** 森林四种实例批次 → trees.glb 中的网格名；rock 批不参与替换。 */
export const TREE_MESHES = Object.freeze({
  pine: 'PineA', pineB: 'PineB', broad: 'BroadA', broadB: 'BroadB',
});

/**
 * 加载 public/models/trees.glb：四套带枝干与层叠冠的可实例化树。
 * 与 units/capitals 共用极简 GLB 解析器，缺任何一个网格都明确报错以便整片森林回退。
 */
export async function loadTreeLibrary() {
  const url = new URL('models/trees.glb', document.baseURI).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`trees.glb HTTP ${res.status}`);
  const geos = readUnitsGlb(await res.arrayBuffer());
  for (const name of Object.values(TREE_MESHES)) {
    if (!geos[name]) throw new Error(`GLB 缺少 ${name} 网格`);
  }
  return geos;
}
