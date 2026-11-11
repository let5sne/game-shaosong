/**
 * 最小实机 smoke：无头 Chrome + Node 22 内置 WebSocket 直连 CDP，零新增依赖。
 *
 * 用法：npm run build && npm run verify:browser [url] [--render=demand] [--mobile]
 *   默认自动拉起 vite preview（127.0.0.1:4173）；传 URL 则验证该地址、不启本地服务。
 *   CHROME_PATH 可覆盖浏览器路径；找不到 Chrome 或 Node < 22 时打印 SKIP 并以 0 退出，
 *   便于在没有浏览器的 runner 上安全跳过，不制造假红灯。
 *
 * 覆盖：DOM 就绪 / 三维挂载 / WebGL / glError / 打包 chunk / GLB 与贴图 / 控制台错误。
 *   --mobile 额外覆盖窄屏路径：390×844@3x + 触摸模拟、autoQuality 自动降档、760px 布局生效、无横向溢出。
 * 不含像素 A/B、draw call 断言与任何部署地址；那部分仍留在本机私有脚本里。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// --render=demand 用来回归省电模式（只在状态变化时出帧）仍能正常挂载与出图。
// 无头环境的 hardwareConcurrency / deviceMemory 常把 autoQuality 判成 low，
// 而 low 档按设计会跳过 trees.glb 与高清地表贴图。桌面用例默认锁 high 才能覆盖完整资产链路。
const FLAGS = process.argv.slice(2).filter(a => a.startsWith('--'));
const ARG = process.argv.slice(2).find(a => !a.startsWith('--'));
const EXTERNAL_URL = ARG || null;
const MOBILE = FLAGS.includes('--mobile');       // 窄屏：验证自动降档与抽屉布局
const DEMAND = FLAGS.includes('--render=demand'); // 省电渲染
// 移动用例刻意**不锁** quality：main.js 的 autoQuality 会因窄屏判 low，
// 这条用例要验的正是「窄屏 → 自动降档 → 简化资产」这条真实路径，锁 high 就绕过了它。
const BASE = 'http://127.0.0.1:4173/?seed=123456';
const URL = EXTERNAL_URL || `${BASE}${MOBILE ? '' : '&quality=high'}${DEMAND ? '&render=demand' : ''}`;
const PORT = 9224;
const CDP = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const skip = why => { console.log(`SKIP  ${why}`); process.exit(0); };

if (typeof WebSocket === 'undefined') skip('需要 Node 22+ 的内置 WebSocket');

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

class Session {
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
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error('timeout: ' + method));
      }, 20000);
      this.waiting.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  errors() {
    return this.events.filter(e =>
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') ||
      (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'));
  }
  badResponses() {
    return this.events.filter(e => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
      .map(e => `${e.params.response.status} ${e.params.response.url}`);
  }
  failedRequests() {
    return this.events.filter(e => e.method === 'Network.loadingFailed' && !e.params.canceled)
      .map(e => e.params.errorText);
  }
  requests() {
    // 用 CDP 请求事件而不是 performance resource timing：GLB 与贴图是
    // 三维挂载后才陆续发起的，resource timing 会漏掉尚在进行的请求。
    return this.events.filter(e => e.method === 'Network.requestWillBeSent')
      .map(e => e.params.request.url);
  }
}

async function evaluate(s, expression) {
  const r = await s.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
  return r.result.value;
}
async function waitFor(s, expr, timeout = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evaluate(s, `!!(${expr})`)) return true; } catch {}
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
let profile = '';
function cleanup() {
  for (const c of children) { try { c.kill(); } catch {} }
  if (profile) { try { rmSync(profile, { recursive: true, force: true }); } catch {} }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

let s;
try {
  if (!EXTERNAL_URL) {
    children.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'],
      { stdio: 'ignore' }));
    if (!await httpReady('http://127.0.0.1:4173/')) throw new Error('vite preview 未就绪');
  }
  if (!await httpReady(URL)) throw new Error(`目标不可达：${URL}`);

  profile = mkdtempSync(join(tmpdir(), 'shaosong-smoke-'));
  children.push(spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-gpu-sandbox',
    '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: 'ignore' }));
  if (!await httpReady(`${CDP}/json/version`)) throw new Error('CDP 未就绪');

  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('没有可用的 page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  s = new Session(ws);
  await Promise.all(['Runtime.enable', 'Log.enable', 'Network.enable', 'Page.enable'].map(m => s.send(m)));
  // 设备模拟必须在导航之前设置，否则首帧的媒体查询与 autoQuality 用的是桌面视口。
  if (MOBILE) {
    await s.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    });
    await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await s.send('Page.navigate', { url: URL });

  check(await waitFor(s, 'document.readyState === "complete"'), 'DOM ready');
  check(await waitFor(s, 'window.__shaosong && window.__shaosong.world'), '三维舆图异步 chunk 挂载');

  // 按「生效档位」定期望：low 档会跳过树木 GLB 与高清贴图，不能一刀切。
  const probe = await evaluate(s, `(() => {
    const gl = window.__shaosong?.world?.renderer?.getContext?.();
    return {
      webgl: !!gl,
      glError: gl ? gl.getError() : -1,
      drawCalls: window.__shaosong?.world?.renderer?.info?.render?.calls ?? 0,
      quality: window.__shaosong?.world?.quality ?? 'high',
      renderMode: window.__shaosong?.renderMode ?? 'always',
      perfMode: window.__shaosong?.world?.perf?.mode ?? 'always',
    };
  })()`);
  const wantMode = URL.includes('render=demand') ? 'demand' : 'always';
  check(probe.renderMode === wantMode && probe.perfMode === wantMode,
    `渲染模式 = ${wantMode}`, `${probe.renderMode} / ${probe.perfMode}`);
  const low = probe.quality === 'low';
  const wantGlb = low ? 2 : 3, wantPng = low ? 0 : 1;
  // GLB 与地表贴图在三维挂载之后才陆续 fetch，等齐再判定。
  const ready = () => {
    const seen = s.requests();
    return seen.filter(u => /\.glb($|\?)/.test(u)).length >= wantGlb
      && seen.filter(u => /\.png($|\?)/.test(u)).length >= wantPng;
  };
  const deadline = Date.now() + 15000;
  while (!ready() && Date.now() < deadline) await sleep(250);
  const seen = s.requests();
  const count = re => seen.filter(u => re.test(u)).length;
  check(probe.webgl, 'WebGL 上下文');
  check(probe.glError === 0, 'glError = 0', String(probe.glError));
  check(probe.drawCalls > 0, '场景已出帧', `${probe.drawCalls} draw calls`);
  check(count(/three-.*\.js/) > 0 && count(/world-.*\.js/) > 0, 'three / world 两个 chunk 已加载');
  check(count(/\.glb($|\?)/) >= wantGlb, `${probe.quality} 档 GLB ≥ ${wantGlb}`, String(count(/\.glb($|\?)/)));
  check(count(/\.png($|\?)/) >= wantPng, `${probe.quality} 档贴图 ≥ ${wantPng}`, String(count(/\.png($|\?)/)));
  check(count(/shaosong-serif-400\.woff2/) > 0, '400 字重已加载');

  // 窄屏专项：媒体查询、自动降档、顶栏紧凑布局、无横向溢出、触摸可用。
  if (MOBILE) {
    // 开场页用 #ui.intro-active .hud{display:none} 整层收起 HUD，此时顶栏 rect 恒为 0，
    // 量不到 760px 下的紧凑布局。临时摘掉该 class 量一次真实渲染高度再还原，
    // 既不改变被测状态，也不削弱断言（HUD 真被隐藏时仍会量到 0）。
    const m = await evaluate(s, `(() => {
      const bar = document.querySelector('.topbar');
      const ui = document.getElementById('ui');
      const intro = !!(ui && ui.classList.contains('intro-active'));
      if (intro) ui.classList.remove('intro-active');
      const h = bar ? bar.getBoundingClientRect().height : -1;
      if (intro) ui.classList.add('intro-active');
      return {
        narrow: matchMedia('(max-width: 760px)').matches,
        quality: window.__shaosong?.quality ?? '?',
        topbarH: h,
        intro,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        touch: 'ontouchstart' in window,
      };
    })()`);
    check(m.narrow, '窄屏媒体查询命中 760px');
    check(m.quality === 'low', '窄屏自动降档为 low', String(m.quality));
    check(m.topbarH > 0 && m.topbarH <= 60, '窄屏顶栏紧凑生效',
      `${m.topbarH.toFixed(1)}px${m.intro ? '（开场页临时露出 HUD 后测得）' : ''}`);
    check(m.overflow <= 1, '无横向溢出', `${m.overflow}px`);
    check(m.touch, '触摸模拟已启用');
  }

  const errs = s.errors();
  check(errs.length === 0, '控制台零错误', errs.slice(0, 3).map(e => e.method).join(', '));
  check(s.badResponses().length === 0, '无 4xx/5xx', s.badResponses().slice(0, 3).join(' | '));
  check(s.failedRequests().length === 0, '无失败请求', s.failedRequests().slice(0, 3).join(' | '));
} catch (err) {
  check(false, '实机验证执行', String(err.message || err));
} finally {
  try { s?.ws?.close?.(); } catch {}
  cleanup();
}

console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 实机 smoke 通过'} · ${URL}`);
process.exit(failures ? 1 : 0);
