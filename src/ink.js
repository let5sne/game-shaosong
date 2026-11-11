// ── 宣纸舆图 · 运行时渲染增强 ────────────────────────────────
// 零外部资产、可逆、可逐帧开关（world.ink.setEnabled）。
// 两层：
//   1) makeContactInk —— 贴合地形的「墨晕」接触阴影，24 城合并成 1 个 draw call；
//   2) createInkPass —— 一次全屏后处理，做水墨描边、纸纹、暗角与色调曲线。
//
// 色彩管线要点（three r180）：渲染进 WebGLRenderTarget 时，WebGLPrograms 会把
// toneMapping 设为 NoToneMapping、outputColorSpace 设为 LinearSRGB，因此 RT 里是
// linear HDR；全屏 quad 渲到屏幕时 three 才会注入 toneMapping()。故此处复用注入的
// toneMapping()（默认 Khronos PBR Neutral）+ sRGB 编码，保证 ?ink=0/1 两版亮度一致。

import * as THREE from 'three';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const QUAD_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  uniform vec2 uResolution;
  uniform float uPaper;
  uniform float uEdge;
  uniform float uTone;
  uniform float uVignette;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  vec3 toSRGB(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92,
      1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
      step(vec3(0.0031308), c));
  }
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 displayColor(vec3 linearColor) {
    #ifdef TONE_MAPPING
      return toSRGB(toneMapping(linearColor));
    #else
      return toSRGB(clamp(linearColor, 0.0, 1.0));
    #endif
  }

  void main() {
    // 邻域亮度差在 linear 域求，避免把 ACES 算五遍
    vec3 base = texture2D(tDiffuse, vUv).rgb;
    vec2 t = uTexel * 1.35;
    float g =
        abs(luma(base) - luma(texture2D(tDiffuse, vUv + vec2( t.x, 0.0)).rgb))
      + abs(luma(base) - luma(texture2D(tDiffuse, vUv + vec2(-t.x, 0.0)).rgb))
      + abs(luma(base) - luma(texture2D(tDiffuse, vUv + vec2(0.0,  t.y)).rgb))
      + abs(luma(base) - luma(texture2D(tDiffuse, vUv + vec2(0.0, -t.y)).rgb));
    // 阈值取高一些：只勾城池／水岸／名牌等强边界，别把整片树林和等高线全描一遍
    float edge = smoothstep(0.10, 0.32, g) * uEdge;

    vec3 c = displayColor(base);
    // 墨线：压暗而非纯黑，保留底色，像笔锋在纸上洇开
    c = mix(c, c * vec3(0.58, 0.55, 0.50), edge * 0.40);

    // 宣纸纤维：细颗粒 + 横向纤维 + 极稀疏墨点
    vec2 px = vUv * uResolution;
    float fiber = vnoise(px * 0.55) * 0.62
                + vnoise(vec2(px.x * 0.11, px.y * 2.10)) * 0.38;
    c *= 1.0 + (fiber - 0.5) * 0.052 * uPaper;
    c -= step(0.9975, hash21(floor(px * 0.5))) * 0.025 * uPaper;

    // 暗角：把视线收拢到舆图中央，幅度克制，避免整幅发灰
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.28 * uVignette;

    // 色调曲线：轻微 S 形对比 + 亮部暖纸、暗部冷墨
    vec3 s = clamp(c, 0.0, 1.0);
    s = s * s * (3.0 - 2.0 * s);
    c = mix(c, s, 0.22 * uTone);
    c += vec3(0.010, 0.004, -0.008) * (luma(c) - 0.5) * 0.35 * uTone;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

/** 径向柔边贴图：接触墨晕与植被落地软影共用，运行时生成、零外部资产。 */
export function makeInkTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.66)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.20)');
  g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 贴合地形的接触墨晕：每城一个同心圆盘，顶点高度取自 heightAt，
 * 全部合并进一份 BufferGeometry，24 城只占 1 个 draw call。
 */
export function makeContactInk(cities, heightAt, { radius = () => 3.6, color = 0x3a3226, opacity = 0.32 } = {}) {
  const SEG = 16, RINGS = 4;
  const verts = [], uvs = [], idx = [];
  for (const c of cities) {
    const r = radius(c);
    const base = verts.length / 3;
    for (let ring = 0; ring <= RINGS; ring++) {
      const t = ring / RINGS;
      for (let s = 0; s <= SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const x = c.x + Math.cos(a) * r * t;
        const z = c.z + Math.sin(a) * r * t;
        verts.push(x, heightAt(x, z) + 0.06, z);
        uvs.push(0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5);
      }
    }
    for (let ring = 0; ring < RINGS; ring++) {
      for (let s = 0; s < SEG; s++) {
        const a = base + ring * (SEG + 1) + s;
        const b = a + 1, d = a + SEG + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const tex = makeInkTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity,
    depthWrite: false, side: THREE.DoubleSide,
    // three 对 transparent+DoubleSide 默认分背面／正面两遍绘制，贴地圆盘只需一遍：
    // 否则 24 城墨晕会白占 2 个 draw call、翻倍三角形。
    forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0.5;   // 先于海面（1）绘制，让水盖住伸到河滩的墨晕
  mesh.frustumCulled = false;
  mesh.name = 'ink.contact';
  return mesh;
}

/**
 * 单次全屏后处理。enabled=false 时完全旁路，等价于原来的 renderer.render。
 * 关掉 info.autoReset 并每帧手动 reset，使 renderer.info 统计的是整帧（场景 + quad）。
 */
export function createInkPass(renderer, { enabled = true } = {}) {
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    samples: 4,               // RT 渲染不继承 renderer 的 antialias，靠 MSAA 保持边缘干净
  });
  rt.texture.name = 'ink.scene';

  const uniforms = {
    tDiffuse: { value: rt.texture },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPaper: { value: 1 },
    uEdge: { value: 1 },
    uTone: { value: 1 },
    uVignette: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG,
    depthTest: false, depthWrite: false, toneMapped: true,
  });
  material.name = 'ink.quad';
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeo, material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.Camera();

  renderer.info.autoReset = false;
  const size = new THREE.Vector2();
  let w = 0, h = 0, active = !!enabled;

  function sync() {
    renderer.getDrawingBufferSize(size);
    if (size.x === w && size.y === h) return;
    w = Math.max(1, size.x); h = Math.max(1, size.y);
    rt.setSize(w, h);
    uniforms.uTexel.value.set(1 / w, 1 / h);
    uniforms.uResolution.value.set(w, h);
  }

  return {
    get enabled() { return active; },
    setEnabled(on) { active = !!on; },
    setStrength({ paper, edge, tone, vignette } = {}) {
      if (paper !== undefined) uniforms.uPaper.value = paper;
      if (edge !== undefined) uniforms.uEdge.value = edge;
      if (tone !== undefined) uniforms.uTone.value = tone;
      if (vignette !== undefined) uniforms.uVignette.value = vignette;
    },
    info() {
      return { size: [w, h], samples: rt.samples,
        strength: { paper: uniforms.uPaper.value, edge: uniforms.uEdge.value,
          tone: uniforms.uTone.value, vignette: uniforms.uVignette.value } };
    },
    render(scene, camera) {
      renderer.info.reset();
      if (!active) { renderer.render(scene, camera); return; }
      sync();
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    },
    dispose() {
      rt.dispose(); quadGeo.dispose(); material.dispose();
    },
  };
}
