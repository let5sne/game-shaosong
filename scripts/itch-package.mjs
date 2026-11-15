/**
 * itch.io HTML5 打包：dist/ → output/register-html5.zip
 *
 * 用法：npm run build && npm run itch:package
 *
 * 零依赖，用 Node 内置写一个 store 模式 ZIP；时间戳固定为 1980-01-01，
 * 条目按名字排序，因此同一份 dist 每次生成的 zip 字节完全相同。
 * itch 要求 index.html 位于 zip 根目录，故直接把 dist 内容作为根，不加外层目录。
 *
 * 校验：引用相对路径、无本机绝对路径、关键资源齐全、zip 回读条目一致。
 * 刻意不写任何账号名、凭据或部署地址，public 仓库可安全入库。
 */
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const OUT_DIR = 'output';
const OUT_FILE = join(OUT_DIR, 'register-html5.zip');
const HOST_ABS = [/\/Users\//, /[A-Za-z]:[\\/]code[\\/]/, /[A-Za-z]:\\Users\\/];
const TEXT_EXT = /\.(html|js|css|json|txt|svg|md)$/i;
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('请先执行 npm run build（dist/index.html 不存在）');
  process.exit(1);
}

// ── 递归收集条目，路径一律用 / 作为 zip 内分隔符 ──────────────
function collect(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else out.push({ name: relative(DIST, full).split(sep).join('/'), full });
  }
  return out;
}
const files = collect(DIST).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

check(files.some(f => f.name === 'index.html'), 'index.html 位于包根');
check(!files.some(f => f.name.startsWith('/') || f.name.includes('..')), '包内路径均为相对路径');
check(!files.some(f => f.name.startsWith('dist/')), '无多余外层目录');

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !u.startsWith('data:') && !u.startsWith('http'));
check(refs.length >= 3 && refs.every(r => !r.startsWith('/')),
  'HTML 静态引用均为相对路径', `${refs.length} 项`);
for (const r of refs) {
  const clean = r.replace(/^\.\//, '').split(/[?#]/)[0];
  check(existsSync(join(DIST, clean)), `引用存在：${r}`);
}

// 本机绝对路径一旦随包发布，等于把开发机目录结构公开；og:image 的
// https 绝对地址是社交抓取所需，属刻意保留，不计入此项。
const textFiles = files.filter(f => TEXT_EXT.test(f.name));
const absHits = [];
for (const f of textFiles) {
  const s = readFileSync(f.full, 'utf8');
  if (HOST_ABS.some(re => re.test(s))) absHits.push(f.name);
}
check(absHits.length === 0, '包内无本机绝对路径', absHits.join(', '));

const REQUIRED = [
  'privacy.html', 'og-image.png',
  'fonts/register-serif-400.woff2', 'fonts/register-serif-700.woff2', 'fonts/OFL.txt',
  'models/units.glb', 'models/trees.glb', 'models/capitals.glb',
];
for (const p of REQUIRED) check(files.some(f => f.name === p), `资源齐全：${p}`);

// itch HTML5 的硬性限制：超出会在 CDN 上被拒；相对路径由上面的引用校验守住，
// 因为 itch 从子目录提供文件，以 / 开头的路径会失效。
const total = files.reduce((n, f) => n + statSync(f.full).size, 0);
check(files.length <= 1000, '文件数 ≤ 1000', `${files.length} 项`);
check(total <= 500 * 1024 * 1024, '解压后体积 ≤ 500 MB', `${(total / 1024 / 1024).toFixed(2)} MiB`);
check(!files.some(f => statSync(f.full).size > 200 * 1024 * 1024), '单文件 ≤ 200 MB');
check(!files.some(f => f.name.length > 240), '路径长度 ≤ 240 字符');

// ── 最小 ZIP 编码器（store，不压缩；butler 会自行重压缩） ──────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);   // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    lh.writeUInt16LE(0, 8);    // store
    lh.writeUInt16LE(0, 10);   // 固定时间
    lh.writeUInt16LE(0x0021, 12); // 1980-01-01
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x0021, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

/** 回读中央目录，自证包内条目与源文件一一对应。 */
function zipNames(buf) {
  let pos = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { pos = i; break; }
  }
  if (pos < 0) throw new Error('未找到 ZIP 结束记录');
  const count = buf.readUInt16LE(pos + 10);
  let p = buf.readUInt32LE(pos + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('中央目录签名异常');
    const len = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    names.push(buf.subarray(p + 46, p + 46 + len).toString('utf8'));
    p += 46 + len + extra + comment;
  }
  return names;
}

const entries = files.map(f => ({ name: f.name, data: readFileSync(f.full) }));
const zip = buildZip(entries);
const names = zipNames(zip);
check(names.length === files.length, 'ZIP 条目数一致', `${names.length} 项`);
check(names.includes('index.html'), 'ZIP 根含 index.html');
check(names.every((n, i) => n === files[i].name), 'ZIP 条目与源文件逐项对应');
check(names.every(n => !n.startsWith('/')), 'ZIP 内无绝对路径条目');

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, zip);
const sha = createHash('sha256').update(zip).digest('hex');
console.log(`\n${OUT_FILE} · ${files.length} 项 · ${(zip.length / 1024 / 1024).toFixed(2)} MiB · sha256 ${sha}`);
console.log('info  og:image 仍指向 Pages 绝对地址，itch 上不影响运行；改域名时需同步 index.html');
console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ HTML5 打包完成'}`);
process.exit(failures ? 1 : 0);
