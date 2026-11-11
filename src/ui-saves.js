/**
 * 存档三卷面板：把 save.js 的槽位摘要拼成 HTML。
 * 只读传入的摘要与两个开关，不读 localStorage、不碰局面，故可单测。
 */
import { DIFFICULTIES, SCENARIOS } from './data.js';
import { esc } from './ui-format.js';

export function savesHtml({ act, inGame, slots }) {
  const dateOf = at => at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return `
      <div class="saves-card">
        <div class="card-eyebrow">御 前 条 陈</div>
        <h2>存 档 · 三 卷</h2>
        <p class="set-lead">逐令自动写入<b>当前卷</b>（第 ${act} 卷）；终局自清。亦可手动另存一卷留档，或载入旧卷再图进取。</p>
        <div class="saves-list">
          ${slots.map(sl => {
            if (sl.empty) return `<div class="save-slot empty">
              <div class="ss-head"><b>第 ${sl.slot} 卷</b><span>空卷</span></div>
              <div class="ss-btns">${inGame ? `<button class="btn-ghost" data-act="save-write" data-slot="${sl.slot}">存此卷</button>` : '<em>尚无存档</em>'}</div>
            </div>`;
            const label = sl.broken ? '卷宗漫漶 · 已损'
              : sl.over ? '终局'
              : sl.scenarioId ? (SCENARIOS.find(x => x.id === sl.scenarioId)?.name || '短剧本')
              : (DIFFICULTIES.find(d => d.id === sl.difficulty)?.name || '建炎北伐');
            return `<div class="save-slot ${sl.slot === act ? 'active' : ''}">
              <div class="ss-head"><b>第 ${sl.slot} 卷${sl.slot === act ? ' · 当前' : ''}</b><time>${esc(dateOf(sl.at))}</time></div>
              <div class="ss-info"><b>${esc(label)}</b><span>${sl.broken || sl.over ? '此卷不可载入' : `第 ${sl.turn} 回合 · 宋 ${sl.songN}／${sl.totalN} 州 · 局号 #${sl.seed ?? ''}`}</span></div>
              <div class="ss-btns">
                ${!sl.broken && !sl.over ? `<button class="btn-ghost" data-act="save-load" data-slot="${sl.slot}">载入</button>` : ''}
                ${inGame ? `<button class="btn-ghost" data-act="save-write" data-slot="${sl.slot}">存此卷</button>` : ''}
                <button class="btn-ghost danger" data-act="save-del" data-slot="${sl.slot}">删</button>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="set-foot-btns"><button class="btn-primary" data-act="close-saves">关闭</button></div>
      </div>`;
}
