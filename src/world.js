import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_DEFS, RIVERS, riverBetween } from './data.js';
import { supplyMap } from './rules.js';
import {
  SONG_COLOR, JIN_COLOR, SONG_LIGHT, JIN_LIGHT, PAPER,
  cityTier, buildCityLibrary, makeFlagTexture, makeWaterTexture,
  makeLabelTexture, drawLabel, makeFlagMaterial,
  pineGeometry, broadGeometry, rockGeometry, tentGeometry, mountainClusterGeometry,
} from './models.js';

const W = 116, D = 100, CX = -2, CZ = -3;
const WATER_Y = 0.42;
const SEG_X = 120, SEG_Z = 104;
const FLAG_W = 1.56, FLAG_H = 0.98;
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

function riverProximity(x, z) {
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

export function heightAt(x, z) {
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

// ── 主场景 ──────────────────────────────────────────────────
export function createWorld(container, state, { onPick }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.Fog(PAPER, 118, 255);

  const camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 600);
  camera.position.set(6, 84, 96);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -3);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 34;
  controls.maxDistance = 185;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = 1.36;
  controls.screenSpacePanning = false;
  controls.update();

  // 光：暖阳主光 + 天光 + 冷色补光
  scene.add(new THREE.HemisphereLight(0xfff5dd, 0x6e725f, 1.35));
  scene.add(new THREE.AmbientLight(0xffffff, 0.26));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.25);
  sun.position.set(-42, 88, 48);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -78; sun.shadow.camera.right = 78;
  sun.shadow.camera.top = 78; sun.shadow.camera.bottom = -78;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc6d8e8, 0.52);
  fill.position.set(55, 40, -60);
  scene.add(fill);

  // ── 地形 ──
  const geo = new THREE.PlaneGeometry(W, D, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  geo.translate(CX, 0, CZ);
  const gp = geo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
  gp.needsUpdate = true;
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
  const land = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1, metalness: 0,
  }));
  land.receiveShadow = true;
  scene.add(land);
  geo.dispose();

  // ── 海面 + 流动波光 ──
  const seaGeo = new THREE.PlaneGeometry(W, D, 32, 28);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(CX, WATER_Y, CZ);
  const seaBase = Float32Array.from(seaGeo.attributes.position.array);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({
    color: 0x89aeb6, transparent: true, opacity: 0.82, roughness: 0.30, metalness: 0.10,
    depthWrite: false, side: THREE.DoubleSide,
  }));
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

  // ── 远山 ──
  const mountains = new THREE.InstancedMesh(
    mountainClusterGeometry(7),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, transparent: true, opacity: 0.46, depthWrite: false }),
    12,
  );
  const dummy = new THREE.Object3D();
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

  // ── 植被：松、阔叶、山石，按海拔与气候散布 ──
  const groves = { pine: [], broad: [], rock: [] };
  for (let x = -56; x <= 48; x += 2.05) {
    for (let z = -48; z <= 44; z += 2.05) {
      const px = x + (hash(x, z) - 0.5) * 1.5;
      const pz = z + (hash(z + 7, x) - 0.5) * 1.5;
      const h = heightAt(px, pz);
      if (h < 0.82 || h > 8.2 || px > 39) continue;
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
      const kind = h > 3.4 ? (hash(px + 2, pz + 3) > 0.78 ? 'rock' : 'pine')
        : h > 2.1 ? (hash(px + 2, pz + 3) > 0.42 ? 'pine' : 'broad')
          : (pz < -14 ? 'pine' : 'broad');
      groves[kind].push({ x: px, y, z: pz, scale, rot });
    }
  }
  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const vegDefs = [
    ['pine', pineGeometry()], ['broad', broadGeometry()], ['rock', rockGeometry()],
  ];
  for (const [kind, g] of vegDefs) {
    const list = groves[kind];
    const im = new THREE.InstancedMesh(g, vegMat, Math.max(1, list.length));
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
    im.frustumCulled = false;
    scene.add(im);
  }

  // ── 城池 ──
  const cityLib = buildCityLibrary();
  const flagTex = { song: makeFlagTexture(true), jin: makeFlagTexture(false) };
  const uTime = { value: 0 };
  const flagMats = {
    song: makeFlagMaterial(flagTex.song, uTime, FLAG_W),
    jin: makeFlagMaterial(flagTex.jin, uTime, FLAG_W),
  };
  const flagGeo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 14, 6);
  const matSolid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  const matFaction = {
    song: new THREE.MeshStandardMaterial({ color: SONG_COLOR, vertexColors: true, roughness: 0.82 }),
    jin: new THREE.MeshStandardMaterial({ color: JIN_COLOR, vertexColors: true, roughness: 0.82 }),
  };
  const cityViews = {};
  const hitMeshes = [];
  const cityRoot = new THREE.Group();
  scene.add(cityRoot);

  for (const def of CITY_DEFS) {
    const c = state.cities[def.id];
    const lib = cityLib[cityTier(def)];
    const g = new THREE.Group();
    g.position.set(c.x, heightAt(c.x, c.z), c.z);

    const solid = new THREE.Mesh(lib.solid, matSolid);
    solid.castShadow = true; solid.receiveShadow = true;
    g.add(solid);
    const faction = new THREE.Mesh(lib.faction, matFaction[c.owner]);
    g.add(faction);
    const flag = new THREE.Mesh(flagGeo, flagMats[c.owner]);
    flag.position.set(...lib.flagPos);
    flag.renderOrder = 9;
    g.add(flag);

    // 州郡名牌
    const { cv, tex } = makeLabelTexture();
    drawLabel(cv, c, false);
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
    cityViews[c.id] = { group: g, solid, faction, flag, label, cv, tex, influence, selRing, reachRing, stationRing, isoRing, def, lib };
  }

  // ── 兵力营帐：全局一个 InstancedMesh，按兵力增减 ──
  const tentMesh = new THREE.InstancedMesh(
    tentGeometry(),
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
    // 三骑
    for (let i = -1; i <= 1; i++) {
      const rider = new THREE.Mesh(marchGeo.rider, marchMat[owner]);
      rider.position.set(i * 0.36, -0.28, i === 0 ? 0 : 0.22);
      g.add(rider);
    }
    const pole = new THREE.Mesh(marchGeo.pole, matPole);
    pole.position.set(-0.58, 0.62, 0); g.add(pole);
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
    if (dist > 6 || ev.button !== 0) return;
    const id = hitTest(ev);
    if (id) onPick(id);
  }
  function onMove(ev) {
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
  function update(s) {
    const sup = supplyMap(s);
    for (const id in cityViews) {
      const v = cityViews[id];
      const c = s.cities[id];
      const song = c.owner === 'song';
      const isolated = song && !sup.linked.has(id);
      v.faction.material = matFaction[c.owner];
      v.flag.material = flagMats[c.owner];
      v.influence.material.color.setHex(isolated ? 0x6f5b83 : song ? SONG_COLOR : JIN_COLOR);
      v.influence.material.opacity = isolated ? 0.70 : song ? 0.30 : 0.46;
      drawLabel(v.cv, c, id === selectedId);
      v.tex.needsUpdate = true;
      v.selRing.material.opacity = id === selectedId ? 0.95 : 0;
      v.reachRing.material.opacity = reachable.includes(id) ? 0.8 : 0;
      v.stationRing.material.opacity = s.heroCity === id ? 0.85 : 0;
      v.isoRing.material.opacity = isolated ? 0.82 : 0;

      const shown = Math.max(1, Math.min(TENT_SLOTS, Math.ceil(c.troops / 2.4)));
      for (const slot of tentSlots[id]) {
        dummy.position.set(slot.x, slot.y, slot.z);
        dummy.rotation.set(0, slot.rot, 0);
        dummy.scale.setScalar(slot.idx % TENT_SLOTS < shown ? 0.82 : 0);
        dummy.updateMatrix();
        tentMesh.setMatrixAt(slot.idx, dummy.matrix);
        tentMesh.setColorAt(slot.idx, new THREE.Color(song ? SONG_LIGHT : JIN_LIGHT));
      }
    }
    tentMesh.instanceMatrix.needsUpdate = true;
    if (tentMesh.instanceColor) tentMesh.instanceColor.needsUpdate = true;
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
      t: 0,
    };
  }
  function resetCamera() {
    camTween = null;
    camera.position.set(6, 84, 96);
    controls.target.set(0, 0, -3);
    controls.update();
  }

  // ── 循环 ──
  const clock = new THREE.Clock();
  let elapsed = 0;
  let shadowBaked = false;
  const seaPos = seaGeo.attributes.position;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    uTime.value = elapsed;
    controls.update();

    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt * 1.8);
      const k = 1 - Math.pow(1 - camTween.t, 3);
      controls.target.lerpVectors(camTween.from, camTween.to, k);
      camera.position.lerpVectors(camTween.camFrom, camTween.camTo, k);
      if (camTween.t >= 1) camTween = null;
    }

    // 水面起伏与流动波光
    for (let i = 0; i < seaPos.count; i++) {
      const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
      seaPos.setY(i, WATER_Y + Math.sin(x * 0.24 + elapsed * 0.9) * 0.055 + Math.cos(z * 0.29 + elapsed * 0.7) * 0.045);
    }
    seaPos.needsUpdate = true;
    waterTexSea.offset.y += dt * 0.010;
    waterTexSea.offset.x += dt * 0.004;
    waterTexRiver.offset.y -= dt * 0.30;

    for (const b of birds) {
      const a = elapsed * b.speed + b.phase;
      b.line.position.set(Math.cos(a) * b.radius - 3, b.y + Math.sin(a * 2.3) * 1.4, Math.sin(a) * b.radius * 0.55 - 8);
      b.line.rotation.y = -a + Math.PI / 2;
    }

    for (const id in cityViews) {
      const v = cityViews[id];
      if (v.selRing.material.opacity > 0) v.selRing.material.opacity = 0.65 + Math.sin(elapsed * 4) * 0.3;
      if (v.reachRing.material.opacity > 0) v.reachRing.material.opacity = 0.55 + Math.sin(elapsed * 3.2) * 0.3;
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

    renderer.render(scene, camera);
    // 光源与城池均为静态，阴影贴图烘一次即可，省掉每帧一遍深度渲染
    if (!shadowBaked) { shadowBaked = true; renderer.shadowMap.autoUpdate = false; }
  }
  renderer.setAnimationLoop(tick);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(container);

  update(state);

  return { update, setSelection, focusCity, resetCamera, march, shock, resize, camera, controls, renderer, scene };
}
