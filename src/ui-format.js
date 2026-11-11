/**
 * 纯展示计算：转义、胜算百分比、增减条目、条块片段、预警派生、设置控件。
 * 不碰 DOM、不持状态，故可在 Node 里单测（tests/ui-format.test.mjs）。
 */
import { supplyMap } from './rules.js';

export const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// 胜算与增减：不足 0.5% 一律写 &lt;1%，免得 innerHTML 里出现裸 <
export const fmtPct = v => (v < 0.005 ? '&lt;1%' : Math.round(v * 100) + '%');
export const signed = ([label, v]) => `${esc(label)} ${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;

// ── 设置面板的一行控件 ──
export function settingControl(it, value) {
  if (it.type === 'toggle') {
    return `<button class="set-switch ${value ? 'on' : ''}" data-act="set-toggle" data-id="${it.id}" aria-pressed="${!!value}" aria-label="${esc(it.label)}"><i></i></button>`;
  }
  if (it.type === 'select') {
    return `<div class="set-seg">${it.options.map(o =>
      `<button class="set-seg-btn ${o.v === value ? 'active' : ''}" data-act="set-select" data-id="${it.id}" data-v="${esc(o.v)}">${esc(o.label)}</button>`
    ).join('')}</div>`;
  }
  return `<input class="set-input" data-set-text="${it.id}" value="${esc(value)}" placeholder="${esc(it.placeholder || '')}" inputmode="numeric" aria-label="${esc(it.label)}">`;
}

export const FX_TITLE = {
  live: '改动立即生效', reload: '须重载舆图后生效', next: '下一局生效',
};

// ── 语境预警条 ──
// 纯派生状态：随局面重算；红级关乎败亡，琥珀级是节律提醒。
export function computeAlerts(s) {
  if (s.over) return [];
  const out = [];
  if (s.grain < 25) out.push({ level: 'bad', html: `府库将罄 · 粮 ${s.grain} 万石，粮尽则军自溃` });
  else if (s.grain < 40) out.push({ level: 'warn', html: `粮秣见肘 · 余 ${s.grain} 万石` });
  if (s.popularity < 35) out.push({ level: 'bad', html: `民心思变 · 民心 ${s.popularity}` });
  if (s.morale < 40) out.push({ level: 'warn', html: `士气低迷 · ${s.morale}` });
  const sup = supplyMap(s);
  const isolated = s.songCities.filter(c => !sup.linked.has(c.id));
  if (isolated.length) out.push({
    level: 'bad',
    html: `粮道断绝 · ${isolated.slice(0, 3).map(c => c.name).join('、')}${isolated.length > 3 ? '等' : ''}孤悬无援`,
    pick: isolated[0].id,
  });
  if (['春', '夏'].includes(['春', '夏', '秋', '冬'][(s.turn - 1) % 4])) {
    out.push({ level: 'warn', html: '秋防将至 · 金骑秋冬南牧，宜趁春夏整军北进' });
  }
  if (s.maxTurns - s.turn <= 3) out.push({ level: 'bad', html: `时限将至 · 余 ${s.maxTurns - s.turn} 回合` });
  return out.slice(0, 3);
}

// ── 顶栏与条目片段 ──
export function stat(label, value, unit, cls = '') {
  return `<div class="stat ${cls}"><span>${label}</span><b>${value}</b><small>${unit || ''}</small></div>`;
}
export function bar(label, v, color) {
  return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i></div><b>${Math.round(v)}</b></div>`;
}
