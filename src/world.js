import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CITY_DEFS, RIVERS } from './data.js';

const SONG_COLOR = 0xb5483a;
const JIN_COLOR = 0x3d4b60;
const SONG_LIGHT = 0xd8735c;
const JIN_LIGHT = 0x6c7f9b;
const PAPER = 0xece3cd;

const W = 116, D = 100, CX = -2, CZ = -3;
const WATER_Y = 0.42;
const SEG_X = 116, SEG_Z = 100;

// ── 程序化噪声 ──────────────────────────────────────────────
function hash(x, z) {
  let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
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

// 河流采样点（供河谷下切计算）
const RIVER_SAMPLES = RIVERS.map(r => {
  const pts = r.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts);
  return { def: r, curve, pts: curve.getPoints(90) };
});

function riverProximity(x, z) {
  let best = 999;
  for (const r of RIVER_SAMPLES) {
    for (let i = 0; i < r.pts.length; i += 2) {
      const p = r.pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

export function heightAt(x, z) {
  const base = 1.05;
  const n = (fbm(x * 0.042 + 12, z * 0.042 + 7) - 0.5) * 3.4;
  const coast = ramp(33, 46, x) * -6.2;      // 东沿海下沉
  let h = base + n + westRamp(x) + northRamp(z) + coast;

  // 河谷下切
  const rd = riverProximity(x, z);
  if (rd < 3.2) h = THREE.MathUtils.lerp(WATER_Y - 0.12, h, ramp(1.1, 3.2, rd));

  // 城址压平
  for (const c of CITY_DEFS) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < 5.2) {
      const flat = 1.35 + (c.terrain === 'mountain' ? 0.5 : 0);
      h = THREE.MathUtils.lerp(flat, h, ramp(2.6, 5.2, d));
    }
  }
  // 海面以下保持低平
  if (x > 40) h = Math.min(h, WATER_Y - 1.6 - ramp(40, 52, x) * 2);
  return h;
}
// 两个反向渐变单独包一层，避免 ramp 参数方向写错
function westRamp(x) { return ramp(8, 42, -x) * 4.4; }
function northRamp(z) { return ramp(16, 46, -z) * 2.6; }

function terrainColor(h, x, z, jitter) {
  const c = new THREE.Color();
  if (h < WATER_Y - 0.15) c.setHex(0xa8a988);
  else if (h < WATER_Y + 0.35) c.setHex(0xb9b58c);
  else if (h < 1.9) c.setHex(0x9bab7c);
  else if (h < 2.8) c.setHex(0x8d9b70);
  else if (h < 4.2) c.setHex(0x93906f);
  else c.setHex(0x9d9685);
  // 北方偏冷、江南偏润
  if (z < -20) c.lerp(new THREE.Color(0x9a9b84), 0.22);
  if (z > 15) c.lerp(new THREE.Color(0x7f9e7a), 0.18);
  c.offsetHSL(0, 0, (jitter - 0.5) * 0.075);
  return c;
}

// ── 贴地圆环（顶点高度沿地形起伏） ────────────────────────
function groundRingAbs(cx, cz, inner, outer, color, opacity, segments = 56) {
  const geo = new THREE.RingGeometry(inner, outer, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(cx + pos.getX(i), cz + pos.getZ(i)) + 0.10);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  }));
  mesh.position.set(cx, 0, cz);
  mesh.renderOrder = 3;
  return mesh;
}

// ── 中文贴图画布 ────────────────────────────────────────────
function makeCanvas(w, h) {
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
function makeLabelTexture() {
  const cv = makeCanvas(512, 160);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { cv, tex };
}
function drawLabel(cv, city, selected) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const song = city.owner === 'song';
  const accent = song ? '#b5483a' : '#3d4b60';
  ctx.fillStyle = selected ? 'rgba(255,251,238,0.98)' : 'rgba(250,245,231,0.93)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = selected ? 9 : 5;
  roundRect(ctx, 8, 8, 496, 144, 16);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  roundRect(ctx, 8, 8, 17, 144, 7); ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'start';
  ctx.fillStyle = '#2c2a24';
  ctx.font = 'bold 76px "Songti SC","STSong","SimSun",serif';
  ctx.fillText(city.name, 40, 56);
  ctx.font = '44px "Songti SC","STSong","SimSun",serif';
  ctx.fillStyle = '#6a6355';
  ctx.fillText(`${song ? '宋' : '金'} · ${city.troops} 营`, 42, 122);
  // 右下角阵营小印
  ctx.fillStyle = accent;
  roundRect(ctx, 428, 92, 60, 52, 8); ctx.fill();
  ctx.fillStyle = '#faf4e4';
  ctx.font = 'bold 36px "Songti SC","STSong","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText(song ? '宋' : '金', 458, 119);
  ctx.textAlign = 'start';
}
function makeFlagTexture(song) {
  const cv = makeCanvas(160, 104);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = song ? '#a8392f' : '#2f3d51';
  ctx.fillRect(0, 0, 160, 104);
  ctx.strokeStyle = song ? '#e8c98a' : '#b7b7a5';
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 144, 88);
  ctx.fillStyle = song ? '#f5e6c3' : '#e5e0cd';
  ctx.font = 'bold 66px "Songti SC","STSong","SimSun",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(song ? '宋' : '金', 80, 55);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── 主场景 ──────────────────────────────────────────────────
export function createWorld(container, state, { onPick }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.Fog(PAPER, 105, 235);

  const camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 600);
  camera.position.set(6, 84, 96);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -3);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 42;
  controls.maxDistance = 185;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = 1.36;
  controls.maxAzimuthAngle = Infinity;
  controls.screenSpacePanning = false;
  controls.update();

  // 光
  scene.add(new THREE.HemisphereLight(0xfff5dd, 0x6e725f, 1.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.05);
  sun.position.set(-42, 88, 48);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -78; sun.shadow.camera.right = 78;
  sun.shadow.camera.top = 78; sun.shadow.camera.bottom = -78;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  // ── 地形 ──
  let geo = new THREE.PlaneGeometry(W, D, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  geo.translate(CX, 0, CZ);
  const gp = geo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
  gp.needsUpdate = true;
  geo.computeVertexNormals();
  const ng = geo.toNonIndexed();
  const np = ng.attributes.position;
  const colors = new Float32Array(np.count * 3);
  for (let f = 0; f < np.count; f += 3) {
    const h = (np.getY(f) + np.getY(f + 1) + np.getY(f + 2)) / 3;
    const x = (np.getX(f) + np.getX(f + 1) + np.getX(f + 2)) / 3;
    const z = (np.getZ(f) + np.getZ(f + 1) + np.getZ(f + 2)) / 3;
    const col = terrainColor(h, x, z, hash(f * 0.37, f * 0.11));
    for (let k = 0; k < 3; k++) { colors[(f + k) * 3] = col.r; colors[(f + k) * 3 + 1] = col.g; colors[(f + k) * 3 + 2] = col.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ng.computeVertexNormals();
  const land = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1, metalness: 0,
  }));
  land.receiveShadow = true;
  scene.add(land);

  // 水面（海）
  const seaGeo = new THREE.PlaneGeometry(W, D, 1, 1);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(CX, WATER_Y, CZ);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({
    color: 0x89aeb6, transparent: true, opacity: 0.80, roughness: 0.32, metalness: 0.12,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  sea.renderOrder = 1;
  scene.add(sea);

  // ── 河流 ──
  for (const r of RIVER_SAMPLES) {
    const pts = r.curve.getPoints(180);
    const verts = [], uvs = [], idx = [];
    const half = r.def.width;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next.x - prev.x, dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const y = Math.max(WATER_Y + 0.02, heightAt(p.x, p.z) + 0.045);
      verts.push(p.x + nx * half, y, p.z + nz * half);
      verts.push(p.x - nx * half, y, p.z - nz * half);
      uvs.push(0, i / 10, 1, i / 10);
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: r.def.color, transparent: true, opacity: 0.9, roughness: 0.25, metalness: 0.08,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    m.renderOrder = 2;
    scene.add(m);
  }

  // ── 官道（邻接连线） ──
  const drawn = new Set();
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
      const p = curve.getPoints(26).map(v => new THREE.Vector3(v.x, heightAt(v.x, v.z) + 0.16, v.z));
      const lg = new THREE.BufferGeometry().setFromPoints(p);
      scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
        color: 0x6b6149, transparent: true, opacity: 0.38, depthWrite: false,
      })));
    }
  }

  // ── 城池 ──
  const flagTex = { song: makeFlagTexture(true), jin: makeFlagTexture(false) };
  const cityViews = {};
  const hitMeshes = [];
  const cityRoot = new THREE.Group();
  scene.add(cityRoot);

  const matStone = new THREE.MeshStandardMaterial({ color: 0xd9cdb0, roughness: 0.95 });
  const matWall = new THREE.MeshStandardMaterial({ color: 0xbfb195, roughness: 1 });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x5c5245, roughness: 0.9 });
  const matPole = new THREE.MeshStandardMaterial({ color: 0x6b5a42, roughness: 1 });

  for (const def of CITY_DEFS) {
    const c = state.cities[def.id];
    const g = new THREE.Group();
    g.position.set(c.x, heightAt(c.x, c.z), c.z);

    const baseMat = new THREE.MeshStandardMaterial({ color: c.owner === 'song' ? SONG_COLOR : JIN_COLOR, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.45, 0.42, 6), baseMat);
    base.position.y = 0.21; base.castShadow = true; base.receiveShadow = true;
    g.add(base);

    // 城墙四段
    for (let k = 0; k < 4; k++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.62, 0.3), matWall);
      w.position.y = 0.72;
      w.rotation.y = k * Math.PI / 2;
      w.position.x = Math.sin(k * Math.PI / 2) * 1.35;
      w.position.z = Math.cos(k * Math.PI / 2) * 1.35;
      w.castShadow = true;
      g.add(w);
    }
    // 城楼
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 1.15), matStone);
    tower.position.y = 0.92; tower.castShadow = true;
    g.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.68, 4), matRoof);
    roof.position.y = 1.68; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);

    // 旗杆 + 旗
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 2.8, 6), matPole);
    pole.position.set(1.0, 1.65, 0.75);
    g.add(pole);
    const flagMat = new THREE.MeshBasicMaterial({ map: flagTex[c.owner], side: THREE.DoubleSide, transparent: true });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.75), flagMat);
    flag.position.set(1.58, 2.55, 0.75);
    g.add(flag);

    // 兵力柱
    const troopMat = new THREE.MeshStandardMaterial({ color: c.owner === 'song' ? SONG_LIGHT : JIN_LIGHT, roughness: 0.7 });
    const troopBar = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 1, 6), troopMat);
    troopBar.position.set(-1.5, 0.5, -1.2);
    g.add(troopBar);

    // 中文标签
    const { cv, tex } = makeLabelTexture();
    drawLabel(cv, c, false);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    label.scale.set(10.4, 3.25, 1);
    label.position.set(0, 6.5, 0);
    label.renderOrder = 20;
    g.add(label);

    // 势力圈
    const influence = groundRingAbs(c.x, c.z, 3.05, 3.30, c.owner === 'song' ? SONG_COLOR : JIN_COLOR, c.owner === 'song' ? 0.30 : 0.46);
    scene.add(influence);

    // 选中环
    const selRing = groundRingAbs(c.x, c.z, 3.7, 4.35, 0xe0b154, 0.0);
    scene.add(selRing);
    // 可达环
    const reachRing = groundRingAbs(c.x, c.z, 2.6, 3.0, 0xf0d08a, 0.0);
    scene.add(reachRing);

    // 拾取体
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(3.0, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.y = 1.6;
    hit.userData.cityId = c.id;
    g.add(hit);
    hitMeshes.push(hit);

    cityRoot.add(g);
    cityViews[c.id] = { group: g, base, baseMat, flag, flagMat, troopBar, troopMat, label, cv, tex, influence, selRing, reachRing, def };
  }

  // ── 特效容器 ──
  const fx = [];
  const marches = [];
  const shockGeo = new THREE.RingGeometry(0.8, 1.0, 40);
  shockGeo.rotateX(-Math.PI / 2);

  function shock(cityId, color) {
    const c = state.cities[cityId];
    const m = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    }));
    m.position.set(c.x, heightAt(c.x, c.z) + 0.28, c.z);
    m.renderOrder = 8;
    scene.add(m);
    fx.push({ mesh: m, t: 0, life: 0.85 });
  }

  function march({ from, to, owner, result }) {
    const a = state.cities[from], b = state.cities[to];
    const p0 = new THREE.Vector3(a.x, heightAt(a.x, a.z) + 2.2, a.z);
    const p2 = new THREE.Vector3(b.x, heightAt(b.x, b.z) + 2.2, b.z);
    const mid = p0.clone().add(p2).multiplyScalar(0.5);
    mid.y += 7;
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const color = owner === 'song' ? SONG_COLOR : JIN_COLOR;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 5), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.65),
      new THREE.MeshBasicMaterial({ map: flagTex[owner], side: THREE.DoubleSide }));
    fl.position.set(-0.3, 0.9, 0);
    g.add(fl);
    g.position.copy(p0);
    scene.add(g);
    marches.push({ g, curve, t: 0, dur: 0.95, to, result, owner });
  }

  // ── 交互 ──
  const raycaster = new THREE.Raycaster();
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
    for (const id in cityViews) {
      const v = cityViews[id];
      const c = s.cities[id];
      const song = c.owner === 'song';
      v.baseMat.color.setHex(song ? SONG_COLOR : JIN_COLOR);
      v.flagMat.map = flagTex[song ? 'song' : 'jin'];
      v.flagMat.needsUpdate = true;
      v.troopMat.color.setHex(song ? SONG_LIGHT : JIN_LIGHT);
      v.troopBar.scale.y = Math.max(0.5, Math.min(6.5, c.troops * 0.30));
      v.troopBar.position.y = v.troopBar.scale.y * 0.5;
      v.influence.material.color.setHex(song ? SONG_COLOR : JIN_COLOR);
      v.influence.material.opacity = song ? 0.30 : 0.46;
      drawLabel(v.cv, c, id === selectedId);
      v.tex.needsUpdate = true;
      const sel = id === selectedId;
      v.selRing.material.opacity = sel ? 0.95 : 0;
      const rr = reachable.includes(id);
      v.reachRing.material.opacity = rr ? 0.8 : 0;
    }
  }

  function setSelection(id, targets = []) {
    selectedId = id;
    reachable = targets;
    update(state);
  }

  // 相机缓动
  let camTween = null;
  function focusCity(id) {
    const c = state.cities[id];
    if (!c) return;
    // 只做有限度的柔性平移，且相机与目标同步移动，避免视角倾斜、把舆图推出画面
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
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    controls.update();

    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt * 1.8);
      const k = 1 - Math.pow(1 - camTween.t, 3);
      controls.target.lerpVectors(camTween.from, camTween.to, k);
      if (camTween.camFrom) camera.position.lerpVectors(camTween.camFrom, camTween.camTo, k);
      if (camTween.t >= 1) camTween = null;
    }

    // 旗帜轻摆、选中环脉动
    for (const id in cityViews) {
      const v = cityViews[id];
      v.flag.rotation.y = Math.sin(elapsed * 2.1 + v.def.x * 0.3) * 0.22;
      v.flag.position.x = 1.58 + Math.sin(elapsed * 2.1 + v.def.x * 0.3) * 0.05;
      if (v.selRing.material.opacity > 0) v.selRing.material.opacity = 0.65 + Math.sin(elapsed * 4) * 0.3;
      if (v.reachRing.material.opacity > 0) v.reachRing.material.opacity = 0.55 + Math.sin(elapsed * 3.2) * 0.3;
      v.label.material.opacity = 1;
    }

    for (let i = marches.length - 1; i >= 0; i--) {
      const a = marches[i];
      a.t += dt / a.dur;
      const k = Math.min(1, a.t);
      a.g.position.copy(a.curve.getPoint(k));
      const ahead = a.curve.getPoint(Math.min(1, k + 0.02));
      a.g.lookAt(ahead);
      a.g.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35);
      if (k >= 1) {
        shock(a.to, a.result === 'win' ? 0xd9a441 : 0x8a8375);
        scene.remove(a.g);
        marches.splice(i, 1);
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      f.mesh.scale.setScalar(1 + k * 7);
      f.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); fx.splice(i, 1); }
    }

    renderer.render(scene, camera);
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
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  update(state);

  return { update, setSelection, focusCity, resetCamera, march, shock, resize, camera, controls };
}
