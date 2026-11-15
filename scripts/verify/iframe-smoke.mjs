/**
 * 跨源 iframe 实机 smoke：把 dist 放进与外层不同源的 iframe，验证 itch.io
 * HTML5 容器下最容易出问题的四件事：URL 参数透传、localStorage 存档、
 * history.replaceState 写回、三维舆图挂载与控制台零错误。
 *
 * 用法：npm run build && npm run verify:iframe
 *
 * 零依赖：Node 起两个本地服务（4183 游戏 / 4184 外层），无头 Chrome + CDP。
 * 外层用 127.0.0.1、游戏用 localhost，构成跨源且跨站，贴近 itch 的容器关系。
 * 找不到 Chrome 或 Node < 22 时打印 SKIP 并以 0 退出，不制造假红灯。
 * 刻意不写任何账号名、凭据或线上地址，public 仓库可安全入库。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const GAME_PORT = 4183, HOST_PORT = 4184, CDP_PORT = 9225;
const GAME_BASE = `http://localhost:${GAME_PORT}/`;
const GAME_URL = `${GAME_BASE}?seed=123456&quality=high&lang=en`;
const HOST_URL = `http://127.0.0.1:${HOST_PORT}/outer.html`;
const CDP = `http://127.0.0.1:${CDP_PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const skip = why => { console.log(`SKIP  ${why}`); process.exit(0); };

if (typeof WebSocket === 'undefined') skip('需要 Node 22+ 的内置 WebSocket');
if (!existsSync('dist/index.html')) { console.error('请先执行 npm run build'); process.exit(1); }

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CANDIDATES.find(p => existsSync(p));
if (!CHROME) skip(`未找到 Chrome/Chromium，可设 CHROME_PATH（已试 ${CANDIDATES.length} 个路径）`);

class CDPClient {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.waiting = new Map(); this.events = [];
    ws.addEventListener('message', ({ data }) => {
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (m.id !== undefined && this.waiting.has(m.id)) {
        const { resolve, reject } = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error('timeout: ' + method));
      }, 20000);
      this.waiting.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify(msg));
    });
  }
  errors() {
    return this.events.filter(e =>
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
      (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'));
  }
}

async function evaluate(c, expression, sessionId) {
  const r = await c.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
  return r.result.value;
}
async function waitFor(c, expr, sessionId, timeout = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evaluate(c, `!!(${expr})`, sessionId)) return true; } catch {}
    await sleep(250);
  }
  return false;
}
async function httpReady(url, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if ((await fetch(url)).ok) return true; } catch {}
    await sleep(200);
  }
  return false;
}

const children = [];
let profile = '', host = null;
function cleanup() {
  for (const c of children) { try { c.kill(); } catch {} }
  if (host) { try { host.close(); } catch {} }
  if (profile) { try { rmSync(profile, { recursive: true, force: true }); } catch {} }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

let ws;
try {
  // 游戏：vite preview 绑 0.0.0.0，让 localhost 与 127.0.0.1 都可达
  children.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--host', '0.0.0.0', '--port', String(GAME_PORT)], { stdio: 'ignore' }));
  if (!await httpReady(`http://127.0.0.1:${GAME_PORT}/`)) throw new Error('vite preview 未就绪');

  // 外层：极简页面，只做跨源 iframe 容器，不注入任何脚本
  host = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>
<iframe id="game" title="game" src="${GAME_URL}" style="width:1000px;height:700px;border:0"></iframe>
</body></html>`);
  });
  await new Promise(r => host.listen(HOST_PORT, '127.0.0.1', r));
  if (!await httpReady(HOST_URL)) throw new Error('外层页面未就绪');

  profile = mkdtempSync(join(tmpdir(), 'register-iframe-'));
  children.push(spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-gpu-sandbox',
    '--enable-unsafe-swiftshader', '--site-per-process',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', 'about:blank',
  ], { stdio: 'ignore' }));
  if (!await httpReady(`${CDP}/json/version`)) throw new Error('CDP 未就绪');

  // Target domain 只在 browser 级会话可用：用 browser WebSocket 建页并 attach 子 frame，
  // flatten session 里再开 Runtime / Log，才能收到 iframe 自己的上下文与错误事件。
  const version = await (await fetch(`${CDP}/json/version`)).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const c = new CDPClient(ws);
  await c.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  const { targetId: pageId } = await c.send('Target.createTarget', { url: HOST_URL });
  const { sessionId: pageSession } = await c.send('Target.attachToTarget', { targetId: pageId, flatten: true });
  await Promise.all(['Runtime.enable', 'Log.enable', 'Page.enable'].map(m => c.send(m, {}, pageSession)));

  // 等 iframe target 出现，再单独 attach 到它的 session（跨源页面上下文互相隔离）
  let frame = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const { targetInfos } = await c.send('Target.getTargets');
    frame = targetInfos.find(t => t.type === 'iframe' && t.url.includes('seed=123456'));
    if (frame) break;
    await sleep(250);
  }
  check(!!frame, '跨源 iframe target 已创建', frame?.url || '未找到');
  if (!frame) throw new Error('无法 attach 到游戏 iframe');
  const { sessionId } = await c.send('Target.attachToTarget', { targetId: frame.targetId, flatten: true });
  await Promise.all(['Runtime.enable', 'Log.enable', 'Page.enable'].map(m => c.send(m, {}, sessionId)));

  check(await waitFor(c, 'window.__register && window.__register.world', sessionId),
    'iframe 内三维舆图挂载');

  const p = await evaluate(c, `(() => {
    const out = {
      href: location.href,
      search: location.search,
      origin: location.origin,
      isFrame: window.top !== window,
      lang: document.documentElement.lang,
      title: document.title,
      mounted: !!(window.__register && window.__register.world),
      storage: 'unknown', roundTrip: false, replaceState: false, replaceError: '',
    };
    try {
      const k = 'register.iframe.probe';
      localStorage.setItem(k, 'ok');
      out.storage = 'available';
      out.roundTrip = localStorage.getItem(k) === 'ok';
      localStorage.removeItem(k);
    } catch (e) { out.storage = 'blocked:' + e.name; }
    try {
      const u = new URL(location.href);
      u.searchParams.set('iframe_probe', '1');
      history.replaceState(null, '', u.toString());
      out.replaceState = new URL(location.href).searchParams.get('iframe_probe') === '1';
    } catch (e) { out.replaceError = e.name; }
    return out;
  })()`, sessionId);

  check(p.isFrame, '确实运行在 iframe 内');
  check(p.origin === `http://localhost:${GAME_PORT}`, 'iframe 与外层跨源', p.origin);
  check(p.search.includes('seed=123456') && p.search.includes('lang=en'),
    'URL 参数透传（seed / lang）', p.search);
  check(p.lang === 'en', '英文模式生效', p.lang);
  check(p.title.includes('The Register'), '英文文档标题', p.title);
  check(p.mounted, '游戏已完成初始化');
  check(p.storage === 'available' ? p.roundTrip : true,
    p.storage === 'available' ? 'localStorage 写入与读回一致' : '存储被阻断，降级路径不崩溃',
    p.storage);
  check(p.replaceState, 'history.replaceState 写回可用', p.replaceError || p.search);
  console.log(`info  iframe 内存储状态：${p.storage}；该结论只对当前浏览器策略成立`);
  console.log(`info  分享链接取到的是 iframe 自身地址：${p.href.slice(0, 100)}`);

  const errs = c.errors();
  check(errs.length === 0, '控制台零错误', errs.slice(0, 3).map(e => e.method).join(', '));
} catch (err) {
  check(false, 'iframe 实机验证执行', String(err.message || err));
} finally {
  try { ws?.close?.(); } catch {}
  cleanup();
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 跨源 iframe smoke 通过'} · ${GAME_BASE}`);
process.exit(failures ? 1 : 0);
