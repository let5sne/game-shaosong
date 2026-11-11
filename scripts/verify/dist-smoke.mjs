/**
 * 构建产物静态体检：零依赖、无需浏览器，CI 与本地都能跑。
 *
 * 用法：npm run build && npm run verify:dist
 *
 * 只检查「发布出去的 dist/ 是否完整、能否挂在子路径、体积是否超预算」，
 * 不替代 scripts/verify/browser-smoke.mjs 的 WebGL 实机验证。
 * 刻意不写任何主机地址、部署路径或凭据，public 仓库可安全入库。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const size = p => statSync(join(DIST, p)).size;
const read = p => readFileSync(join(DIST, p), 'utf8');

const htmlPath = join(DIST, 'index.html');
check(existsSync(htmlPath), 'dist/index.html 存在');
if (!existsSync(htmlPath)) { console.error('\n请先执行 npm run build'); process.exit(1); }
const html = read('index.html');

// 1. 所有 HTML 静态引用都是相对路径且文件真实存在（base:'./' 的子路径部署契约）
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !u.startsWith('data:') && !u.startsWith('http'));
check(refs.length >= 3, 'HTML 至少引用 JS/CSS/字体', `${refs.length} 项`);
for (const ref of refs) {
  const clean = ref.replace(/^\.\//, '').split(/[?#]/)[0];
  check(existsSync(join(DIST, clean)), `引用存在：${ref}`);
}
check(!/(?:src|href)="\/(?!\/)/.test(html), '无绝对路径引用', '子路径部署必须全部 ./');

// 2. 运行时资源清单（由 world.js / models.js / style.css 的 new URL 与 @font-face 决定）
const RUNTIME = [
  'models/units.glb', 'models/trees.glb', 'models/capitals.glb',
  'textures/paper.png', 'textures/city-surface.png',
  'textures/terrain-detail.png', 'textures/terrain-normal.png',
  'fonts/shaosong-serif-400.woff2', 'fonts/shaosong-serif-700.woff2',
  'fonts/OFL.txt',
];
for (const p of RUNTIME) check(existsSync(join(DIST, p)) && size(p) > 0, `运行时资源：${p}`);
check(!existsSync(join(DIST, 'fonts/subset-manifest.json')),
  '构建期清单未随站点发布', 'subset-manifest.json 应只留在 scripts/');

// 3. 字体加载预算：只预载 400，700 交给 font-display:swap
const preloads = [...html.matchAll(/<link rel="preload" href="([^"]*\.woff2)"/g)].map(m => m[1]);
check(preloads.length === 1 && preloads[0].includes('400'), '只预载 400 字重', preloads.join(', '));

// 4. chunk 体积预算（KB；three 是第三方固有体积，超过 600 要显式复核）
const assets = readdirSync(join(DIST, 'assets'));
const chunk = prefix => assets.find(f => f.startsWith(prefix) && f.endsWith('.js'));
const BUDGET = [
  ['index', chunk('index-'), 200], ['world', chunk('world-'), 100],
  ['three', chunk('three-'), 600], ['css', assets.find(f => f.endsWith('.css')), 80],
];
for (const [name, file, kb] of BUDGET) {
  const p = `assets/${file}`;
  check(!!file && existsSync(join(DIST, p)) && size(p) <= kb * 1024,
    `体积预算 ${name} ≤ ${kb} KB`, file ? `${(size(p) / 1024).toFixed(1)} KB` : '文件缺失');
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 构建产物体检通过'} · ${RUNTIME.length} 个运行时资源 · ${assets.length} 个打包产物`);
process.exit(failures ? 1 : 0);
