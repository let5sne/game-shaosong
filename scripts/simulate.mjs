/**
 * 无头批量模拟：验证托管 AI 的胜率与节奏。
 *   node scripts/simulate.mjs                 跑 200 局，输出统计
 *   node scripts/simulate.mjs 50 --verbose   跑 50 局并打印首局胜利的完整战报
 */
import { GameState } from '../src/rules.js';
import { chooseAction, applyAction, chooseEvent, newTurnContext, phaseOf } from '../src/autoplay.js';

const games = Number(process.argv[2]) || 200;
const verbose = process.argv.includes('--verbose');
const MAX_STEPS_PER_TURN = 14;

function playOne() {
  const s = new GameState();
  const captures = [];
  s.on('log', ({ text }) => {
    if (text.includes('★') || text.includes('【结局】')) captures.push(`T${s.turn} ${text}`);
  });
  let steps = 0;
  while (!s.over && s.turn <= 40) {
    if (s.pendingEvent) { s.resolveEvent(chooseEvent(s)); continue; }
    let n = 0;
    const ctx = newTurnContext(s);
    while (!s.over && !s.pendingEvent && s.decree > 0 && n++ < MAX_STEPS_PER_TURN) {
      const a = chooseAction(s, ctx);
      if (!a) break;
      if (!applyAction(s, a, ctx)) break;   // 兜底：万一策略算出不可行的一步
      steps++;
    }
    if (s.over) break;
    if (s.pendingEvent) continue;
    s.endTurn();
  }
  return {
    kind: s.over?.kind || 'timeout',
    title: s.over?.title || '未终局',
    turn: s.turn,
    steps,
    song: s.songCities.length,
    jin: s.jinCities.length,
    kf: s.cities.kaifeng.owner,
    yj: s.cities.yanjing.owner,
    captures,
    logs: s.logs.slice().reverse(),
  };
}

const results = [];
for (let i = 0; i < games; i++) results.push(playOne());
const wins = results.filter(r => r.kind === 'win');
const losses = results.filter(r => r.kind !== 'win');

const byTitle = {};
for (const r of results) byTitle[`${r.kind === 'win' ? '胜' : '败'}·${r.title}`] = (byTitle[`${r.kind === 'win' ? '胜' : '败'}·${r.title}`] || 0) + 1;
const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-';

console.log(`\n═══ 托管推演模拟 ${games} 局 ═══`);
console.log(`胜率        ${(wins.length / games * 100).toFixed(1)}%  (${wins.length} 胜 / ${losses.length} 负)`);
console.log(`平均终局回合 ${avg(results.map(r => r.turn))}   平均胜利回合 ${avg(wins.map(r => r.turn))}`);
console.log(`胜利回合范围 ${wins.length ? Math.min(...wins.map(r => r.turn)) + ' ~ ' + Math.max(...wins.map(r => r.turn)) : '-'}`);
console.log(`平均每局指令 ${avg(results.map(r => r.steps))} 步`);
console.log(`结局分布    `, byTitle);

const sample = wins[0];
if (verbose && sample) {
  console.log(`\n───── 首局胜利战报（第 ${sample.turn} 回合，${sample.song} 州 / 金 ${sample.jin} 州）─────`);
  sample.logs.forEach(l => console.log(`[${l.tag}] ${l.text}`));
} else if (wins.length) {
  console.log('\n首胜关键节点：');
  wins[0].captures.forEach(c => console.log('  ' + c));
}
if (losses.length && verbose) {
  console.log('\n首败关键节点：');
  losses[0].captures.slice(-12).forEach(c => console.log('  ' + c));
}
