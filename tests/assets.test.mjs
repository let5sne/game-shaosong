/** Blender 产出的 GLB、自写极简解析器、城池表面图集的回归测试（纯 Node，无 DOM）。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { readUnitsGlb, buildCityLibrary, CITY_ATLAS_BANDS, TREE_MESHES, applyVerticalAO } from '../src/models.js';

const file = readFileSync(new URL('../public/models/units.glb', import.meta.url));
const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);

test('units.glb 解析出骑兵与投石机两套完整几何', () => {
  const geos = readUnitsGlb(buf);
  assert.deepEqual(Object.keys(geos).sort(), ['Rider', 'Siege']);
  for (const [name, geo] of Object.entries(geos)) {
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    const nrm = geo.getAttribute('normal');
    assert.ok(pos.count > 100, `${name} 应有足够顶点`);
    assert.equal(col.itemSize, 3, `${name} 顶点色应归一为 RGB 浮点`);
    assert.equal(col.count, pos.count);
    assert.equal(nrm.count, pos.count);
    assert.ok(geo.index?.count > 0, `${name} 应有索引`);
    let maxIdx = 0;
    for (let i = 0; i < geo.index.count; i++) maxIdx = Math.max(maxIdx, geo.index.getX(i));
    assert.ok(maxIdx < pos.count, `${name} 索引不得越界`);
    geo.computeBoundingBox();
    assert.ok(geo.boundingBox.max.y > 1, `${name} 应以 Y 为高度`);
    assert.ok(Math.abs(geo.boundingBox.min.y) < 0.02, `${name} 应落在地面上`);
  }
});

test('GLB 顶点色是 0..1 的灰度明暗，保留甲胄层次', () => {
  const { Rider, Siege } = readUnitsGlb(buf);
  for (const geo of [Rider, Siege]) {
    const c = geo.getAttribute('color');
    let min = 1, max = 0;
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i), g = c.getY(i), b = c.getZ(i);
      assert.ok(Math.abs(r - g) < 1e-5 && Math.abs(g - b) < 1e-5, '三个通道应一致');
      assert.ok(r >= 0 && r <= 1, '顶点色应在 0..1');
      min = Math.min(min, r); max = Math.max(max, r);
    }
    assert.ok(max - min > 0.3, '明暗层次不应被压平');
  }
});

// ── 高清树木：四套可实例化网格 ──
const treesFile = readFileSync(new URL('../public/models/trees.glb', import.meta.url));
const treesBuf = treesFile.buffer.slice(treesFile.byteOffset, treesFile.byteOffset + treesFile.byteLength);

test('trees.glb 解析出与森林批次一一对应的四套树', () => {
  const geos = readUnitsGlb(treesBuf);
  assert.deepEqual(Object.keys(geos).sort(), Object.values(TREE_MESHES).sort());
  assert.deepEqual(TREE_MESHES, { pine: 'PineA', pineB: 'PineB', broad: 'BroadA', broadB: 'BroadB' });
  let totalTris = 0;
  for (const [name, geo] of Object.entries(geos)) {
    const pos = geo.getAttribute('position'), col = geo.getAttribute('color');
    assert.ok(geo.index?.count > 0, `${name} 应有索引`);
    assert.equal(col.itemSize, 3, `${name} 顶点色应为 RGB`);
    assert.equal(col.count, pos.count);
    assert.equal(geo.getAttribute('normal').count, pos.count);
    const tris = geo.index.count / 3;
    assert.ok(tris >= 100 && tris <= 400, `${name} 单树三角形预算 100..400，实际 ${tris}`);
    totalTris += tris;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    assert.ok(bb.min.y >= -0.05 && bb.min.y <= 0.02, `${name} 底部须锚在 y=0，实际 ${bb.min.y}`);
    assert.ok(bb.max.y > 1.9 && bb.max.y < 2.4, `${name} 高度须与原程序化树同尺度，实际 ${bb.max.y}`);
    assert.ok(Math.max(Math.abs(bb.min.x), bb.max.x, Math.abs(bb.min.z), bb.max.z) < 1.2,
      `${name} 冠幅不应挤占邻树与城池空地`);
  }
  assert.ok(totalTris > 600 && totalTris < 1000, `四套树总预算，实际 ${totalTris}`);
});

test('树顶点色为低饱和绿色系，且逐面有明暗层次', () => {
  const geos = readUnitsGlb(treesBuf);
  for (const [name, geo] of Object.entries(geos)) {
    const c = geo.getAttribute('color');
    let r = 0, g = 0, b = 0, lo = 1, hi = 0;
    for (let i = 0; i < c.count; i++) {
      const cr = c.getX(i), cg = c.getY(i), cb = c.getZ(i);
      assert.ok(cr >= 0 && cr <= 1 && cg >= 0 && cg <= 1 && cb >= 0 && cb <= 1,
        `${name} 顶点色越界`);
      r += cr; g += cg; b += cb;
      lo = Math.min(lo, cr); hi = Math.max(hi, cr);
    }
    const n = c.count;
    assert.ok(g / n > r / n + 0.02 && g / n > b / n + 0.02, `${name} 应以绿色为主`);
    assert.ok(hi - lo > 0.08, `${name} 冠面明暗不应压平`);
  }
});

test('损坏或非 GLB 输入明确报错，便于上层静默回退', () => {
  assert.throws(() => readUnitsGlb(new ArrayBuffer(16)), /不是 GLB 文件/);
  assert.throws(() => readUnitsGlb(new TextEncoder().encode('not a glb').buffer), /不是 GLB 文件/);
});

// ── 两京主角级增饰 ──
const capitalsFile = readFileSync(new URL('../public/models/capitals.glb', import.meta.url));
const capitalsBuf = capitalsFile.buffer.slice(capitalsFile.byteOffset, capitalsFile.byteOffset + capitalsFile.byteLength);

test('capitals.glb 解析出两京，坐标锚在 tier 2 城楼而非原点', () => {
  const geos = readUnitsGlb(capitalsBuf);
  assert.deepEqual(Object.keys(geos).sort(), ['Kaifeng', 'Yanjing']);
  const city = buildCityLibrary(false)[2].solid;
  city.computeBoundingBox();
  for (const [name, geo] of Object.entries(geos)) {
    const pos = geo.getAttribute('position');
    assert.ok(geo.index.count / 3 > 2000, `${name} 应是主角级细节网格`);
    assert.equal(geo.getAttribute('color').itemSize, 3);
    assert.ok(geo.boundingBox.min.y > 2.7 && geo.boundingBox.min.y < 3.1,
      `${name} 应全部贴合下檐屋面（lowerY≈2.88），不能有落地或穿透柱廊的构件`);
    // 举折屋面/宝顶应与程序化城楼同高，明显低于城楼说明曲面参数抄错了
    assert.ok(geo.boundingBox.max.y > 5.4 && geo.boundingBox.max.y < city.boundingBox.max.y + 0.3,
      `${name} 高度 ${geo.boundingBox.max.y.toFixed(2)} 应与城楼 ${city.boundingBox.max.y.toFixed(2)} 对齐`);
    assert.ok(geo.boundingBox.max.x < city.boundingBox.max.x, `${name} 横向不应越出城池占地`);
    assert.ok(geo.boundingBox.max.z < 2.7 && geo.boundingBox.min.z > -2.7,
      `${name} 不应在城台外添加悬空构件`);
    assert.ok(pos.count > 0);
  }
});

test('两京顶点色为彩色且配色分流：开封暖瓦、燕京冷瓦', () => {
  const geos = readUnitsGlb(capitalsBuf);
  const mean = {};
  let coloured = 0;
  for (const [name, geo] of Object.entries(geos)) {
    const c = geo.getAttribute('color');
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < c.count; i++) {
      const cr = c.getX(i), cg = c.getY(i), cb = c.getZ(i);
      r += cr; g += cg; b += cb;
      if (Math.abs(cr - cg) > 0.01 || Math.abs(cg - cb) > 0.01) coloured++;
      assert.ok(cr >= 0 && cr <= 1.01, '顶点色应在 0..1');
    }
    mean[name] = { r: r / c.count, g: g / c.count, b: b / c.count };
  }
  assert.ok(coloured > 1000, '主体应是彩色顶点色，不是灰度明暗');
  assert.ok(mean.Kaifeng.r > mean.Kaifeng.b, '开封琉璃瓦应偏暖');
  assert.ok(mean.Yanjing.r < mean.Kaifeng.r, '燕京青灰瓦应比开封更冷／更暗');
});

// ── 城池表面图集：分带 UV 必须可逆，且与 Blender 产出的 PNG 对齐 ──

function bytesOf(attr) {
  return Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength);
}

test('未贴图时几何与贴图版逐字节一致，只有 uv 不同', () => {
  const plain = buildCityLibrary(false);
  const atlas = buildCityLibrary(true);
  assert.equal(plain.length, 3);
  for (let t = 0; t < 3; t++) {
    for (const key of ['position', 'normal', 'color']) {
      assert.equal(Buffer.compare(bytesOf(plain[t].solid.getAttribute(key)),
        bytesOf(atlas[t].solid.getAttribute(key))), 0, `tier${t} 的 ${key} 不应变化`);
    }
    assert.equal(Buffer.compare(bytesOf(plain[t].solid.index),
      bytesOf(atlas[t].solid.index)), 0, `tier${t} 三角形顺序不应变化`);
    assert.equal(plain[t].solid.getAttribute('uv').count,
      atlas[t].solid.getAttribute('uv').count);
    assert.notEqual(Buffer.compare(bytesOf(plain[t].solid.getAttribute('uv')),
      bytesOf(atlas[t].solid.getAttribute('uv'))), 0, 'uv 应确实被重映射');
  }
});

test('图集版 UV 只落在瓦作／夯土两带，隔离带内无顶点', () => {
  const [roof0, roof1] = CITY_ATLAS_BANDS.roof;
  const [wall0, wall1] = CITY_ATLAS_BANDS.wall;
  const lib = buildCityLibrary(true);
  for (let t = 0; t < 3; t++) {
    const uv = lib[t].solid.getAttribute('uv');
    let roof = 0, wall = 0;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      assert.ok(u >= -1e-6 && u <= 2 + 1e-6, `tier${t} u 越界: ${u}`);
      const isRoof = v >= roof0 - 1e-6 && v <= roof1 + 1e-6;
      const isWall = v >= wall0 - 1e-6 && v <= wall1 + 1e-6;
      assert.ok(isRoof || isWall, `tier${t} 顶点 ${i} 的 v=${v} 落入隔离带`);
      if (isRoof) roof++; else wall++;
    }
    assert.ok(roof > 100, `tier${t} 应有屋顶顶点，实际 ${roof}`);
    assert.ok(wall > 100, `tier${t} 应有墙面顶点，实际 ${wall}`);
  }
});

test('质感层给全部城池部件补竖向 AO，且 faction 也纳入图集分带', () => {
  const plain = buildCityLibrary(true, false);
  const shaded = buildCityLibrary(true, true);
  const [w0, w1] = CITY_ATLAS_BANDS.wall;
  for (let t = 0; t < 3; t++) {
    for (const part of ['solid', 'faction']) {
      for (const key of ['position', 'normal', 'uv']) {
        assert.equal(Buffer.compare(bytesOf(plain[t][part].getAttribute(key)),
          bytesOf(shaded[t][part].getAttribute(key))), 0, `tier${t}.${part} 的 ${key} 不应变化`);
      }
      assert.equal(Buffer.compare(bytesOf(plain[t][part].index),
        bytesOf(shaded[t][part].index)), 0, `tier${t}.${part} 三角形顺序不应变化`);
      assert.notEqual(Buffer.compare(bytesOf(plain[t][part].getAttribute('color')),
        bytesOf(shaded[t][part].getAttribute('color'))), 0, `tier${t}.${part} 顶点色应有明暗重分配`);
    }
    const uv = shaded[t].faction.getAttribute('uv');
    assert.ok(uv.count > 100, `tier${t} faction 应有足够顶点`);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      assert.ok(u >= -1e-6 && u <= 1 + 1e-6, `faction u 越界 ${u}`);
      assert.ok(v >= w0 - 1e-6 && v <= w1 + 1e-6, `faction v=${v} 应落在夯土带`);
    }
  }
  // 单独调用时可重复、有界
  const g = shaded[0].solid;
  const c = g.getAttribute('color');
  applyVerticalAO(g, 6, 0);
  assert.ok([...c.array].every(v => Number.isFinite(v) && v >= 0), 'AO 不应产生非法顶点色');
});

test('city-surface.png 的分带与 CITY_ATLAS_BANDS 对齐，隔离带纯白', () => {
  const png = readFileSync(new URL('../public/textures/city-surface.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  let off = 8, w = 0, h = 0;
  const chunks = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const tag = png.toString('ascii', off + 4, off + 8);
    if (tag === 'IHDR') { w = png.readUInt32BE(off + 8); h = png.readUInt32BE(off + 12); }
    if (tag === 'IDAT') chunks.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  assert.equal(w, 512); assert.equal(h, 512);
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = 1 + w * 3;                 // 本脚本写出的 PNG 每行 filter=0
  const bandMean = (y0, y1) => {
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      assert.equal(raw[y * stride], 0, '应是无滤波行');
      for (let x = 0; x < w; x++) { sum += raw[y * stride + 1 + x * 3]; n++; }
    }
    return sum / n / 255;
  };
  // flipY：v=1 对应 PNG 首行，故屋顶带在图上侧、夯土带在下侧
  assert.ok(bandMean(0, 230) < 0.995, '上半应是瓦作纹理，不是纯白');
  assert.ok(bandMean(282, 512) < 0.995, '下半应是夯土纹理，不是纯白');
  assert.ok(bandMean(240, 272) > 0.999, '中间隔离带应纯白');
  assert.deepEqual(CITY_ATLAS_BANDS.roof, [0.54, 0.96]);
  assert.deepEqual(CITY_ATLAS_BANDS.wall, [0.04, 0.46]);
});
