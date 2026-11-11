/** 纯展示计算回归：转义、百分比、条块片段、设置控件与预警派生。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, fmtPct, signed, stat, bar, computeAlerts, settingControl, FX_TITLE,
} from '../src/ui-format.js';
import { SETTING_GROUPS } from '../src/settings.js';

const items = () => SETTING_GROUPS.flatMap(g => g.items);

test('esc 只转义五类 HTML 敏感字符', () => {
  assert.equal(esc('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(esc('临安府 · 建炎三年'), '临安府 · 建炎三年');
  assert.equal(esc(0), '0');
  assert.equal(esc('a & b'), 'a &amp; b', '& 必须先转义，否则二次转义会漏');
});

test('fmtPct：不足 0.5% 写 &lt;1%，其余四舍五入到整百分比', () => {
  assert.equal(fmtPct(0), '&lt;1%');
  assert.equal(fmtPct(0.004), '&lt;1%');
  assert.equal(fmtPct(0.005), '1%');
  assert.equal(fmtPct(0.577), '58%');
  assert.equal(fmtPct(1), '100%');
});

test('signed：正带 +、负带 -，标签同样转义', () => {
  assert.equal(signed(['攻势', 0.25]), '攻势 +25%');
  assert.equal(signed(['粮耗', -0.1]), '粮耗 -10%');
  assert.equal(signed(['<b>', 0.1]), '&lt;b&gt; +10%');
});

test('stat / bar：类名与数值格式逐字固定', () => {
  assert.equal(stat('粮秣', 42, '万石'), '<div class="stat "><span>粮秣</span><b>42</b><small>万石</small></div>');
  assert.equal(stat('民心', 30, '', 'warn'), '<div class="stat warn"><span>民心</span><b>30</b><small></small></div>');
  assert.equal(
    bar('版籍', 50, '#b5483a'),
    '<div class="bar-row"><span>版籍</span><div class="bar"><i style="width:50%;background:#b5483a"></i></div><b>50</b></div>',
  );
});

test('bar 把宽度夹在 0~100，免得负值或超 100 撑破布局', () => {
  assert.match(bar('x', 140, '#000'), /width:100%/);
  assert.match(bar('x', -5, '#000'), /width:0%/);
  assert.match(bar('x', 33.6, '#000'), /<b>34<\/b>/);
});

test('settingControl：开关／分段／文本框三型，契约与配置项对齐', () => {
  const toggle = settingControl({ id: 'ink', label: '宣纸增强', type: 'toggle' }, false);
  assert.match(toggle, /^<button class="set-switch " data-act="set-toggle" data-id="ink" aria-pressed="false"/);

  const seg = settingControl({
    id: 'terrain', label: '地貌精度', type: 'select',
    options: [{ v: 'classic', label: '原味' }, { v: 'paper', label: '宣纸' }],
  }, 'paper');
  assert.match(seg, /class="set-seg-btn active" data-act="set-select" data-id="terrain" data-v="paper"/);
  assert.match(seg, /class="set-seg-btn " data-act="set-select" data-id="terrain" data-v="classic"/);

  const text = settingControl({ id: 'seed', label: '局号', type: 'text', placeholder: '随机' }, '123456');
  assert.match(text, /data-set-text="seed" value="123456"/);
  assert.match(text, /placeholder="随机"/);
});

test('settingControl 与真实配置表兼容：每个已登记项都能渲染', () => {
  for (const it of items()) {
    const html = settingControl(it, it.default);
    assert.ok(html.length > 0, `${it.id} 渲染为空`);
    assert.ok(!html.includes('undefined'), `${it.id} 渲染出 undefined`);
  }
});

test('FX_TITLE 覆盖所有 effect 取值', () => {
  assert.deepEqual(FX_TITLE, { live: '改动立即生效', reload: '须重载舆图后生效', next: '下一局生效' });
  for (const it of items()) assert.ok(FX_TITLE[it.effect], `${it.id} 的 effect=${it.effect} 没有标题`);
});

/** 造一份最小局面：supplyMap 只要求 cities／turn，临安为行在。 */
const mkState = (over = {}) => {
  const cities = {
    linan: { id: 'linan', name: '临安', owner: 'song', seat: true, links: ['jiankang'] },
    jiankang: { id: 'jiankang', name: '建康', owner: 'song', links: ['linan'] },
  };
  return {
    turn: 3, maxTurns: 30, grain: 90, gold: 50, popularity: 62, morale: 58,
    cities, songCities: Object.values(cities), over: null, ...over,
  };
};

test('computeAlerts：局面安泰且无临期，秋防之外不报警', () => {
  const list = computeAlerts(mkState({ turn: 3 }));   // 第 3 回合为秋
  assert.deepEqual(list, []);
});

test('computeAlerts：春夏必报秋防，提醒趁窗口北进', () => {
  const list = computeAlerts(mkState({ turn: 1 }));   // 第 1 回合为春
  assert.equal(list.length, 1);
  assert.equal(list[0].level, 'warn');
  assert.match(list[0].html, /秋防将至/);
});

test('computeAlerts：粮、民心、士气各按阈值分级', () => {
  assert.match(computeAlerts(mkState({ grain: 20 }))[0].html, /粮尽则军自溃/);
  assert.equal(computeAlerts(mkState({ grain: 20 }))[0].level, 'bad');
  assert.match(computeAlerts(mkState({ grain: 30 }))[0].html, /粮秣见肘/);
  assert.equal(computeAlerts(mkState({ grain: 30 }))[0].level, 'warn');
  assert.match(computeAlerts(mkState({ popularity: 30 }))[0].html, /民心思变/);
  assert.match(computeAlerts(mkState({ morale: 30 }))[0].html, /士气低迷/);
});

test('computeAlerts：孤城可点选跳转，三座以内全列且不加「等」', () => {
  const cities = {
    linan: { id: 'linan', name: '临安', owner: 'song', seat: true, links: [] },
    dengzhou: { id: 'dengzhou', name: '邓州', owner: 'song', links: [] },
    xiangyang: { id: 'xiangyang', name: '襄阳', owner: 'song', links: [] },
    ezhou: { id: 'ezhou', name: '鄂州', owner: 'song', links: [] },
  };
  const s = mkState({ cities, songCities: Object.values(cities) });
  const list = computeAlerts(s);
  const cut = list.find(a => a.html.includes('粮道断绝'));
  assert.ok(cut, '应报粮道断绝');
  assert.equal(cut.level, 'bad');
  assert.equal(cut.pick, 'dengzhou', '点选应落在第一座孤城');
  assert.match(cut.html, /邓州/);
  assert.match(cut.html, /襄阳/);
  assert.match(cut.html, /鄂州/);
  assert.ok(!cut.html.includes('等'), '只有三座时不加「等」');
});

test('computeAlerts：孤城超过三座时收「等」', () => {
  const cities = {};
  for (const [id, name] of Object.entries({
    linan: '临安', a: '邓州', b: '襄阳', c: '鄂州', d: '江州',
  })) cities[id] = { id, name, owner: 'song', links: [] };
  cities.linan.seat = true;
  const s = mkState({ cities, songCities: Object.values(cities) });
  const cut = computeAlerts(s).find(a => a.html.includes('粮道断绝'));
  assert.match(cut.html, /等孤悬无援/);
  assert.ok(cut.html.includes('邓州'));
});

test('computeAlerts：时限只剩三回合内报红', () => {
  const list = computeAlerts(mkState({ turn: 28, maxTurns: 30 }));
  const hit = list.find(a => a.html.includes('时限将至'));
  assert.ok(hit);
  assert.equal(hit.level, 'bad');
  assert.match(hit.html, /余 2 回合/);
});

test('computeAlerts：终局不再报警，且最多三条', () => {
  assert.deepEqual(computeAlerts(mkState({ over: { kind: 'win', title: '中兴' } })), []);
  const many = computeAlerts(mkState({ turn: 28, grain: 20, popularity: 30, morale: 30 }));
  assert.equal(many.length, 3);
});

test('computeAlerts：金据州郡不计入孤城（只看己方版籍）', () => {
  const cities = {
    linan: { id: 'linan', name: '临安', owner: 'song', seat: true, links: ['kaifeng'] },
    kaifeng: { id: 'kaifeng', name: '开封', owner: 'jin', links: ['linan'] },
  };
  const s = mkState({ cities, songCities: [cities.linan] });
  assert.ok(!computeAlerts(s).some(a => a.html.includes('粮道断绝')));
});