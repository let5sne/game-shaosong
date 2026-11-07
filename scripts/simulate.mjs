/**
 * 无头批量模拟：验证托管 AI 在不同难度与随机变局下的胜率与节奏。
 *   node scripts/simulate.mjs                     normal 跑 200 局
 *   node scripts/simulate.mjs 300 --difficulty=hard   指定难度
 *   node scripts/simulate.mjs 200 --all          三档各跑 200 局做对比
 *   node scripts/simulate.mjs 50 --verbose       打印首局完整战报
 *   npm run balance                            三档各 300 局 + 胜率/节奏护栏断言
 */
import { GameState } from '../src/rules.js';
import { chooseAction, applyAction, chooseEvent, newTurnContext } from '../src/autoplay.js';
import { DIFFICULTIES } from '../src/data.js';

const games = Number(process.argv[2]) || 200;
const verbose = process.argv.includes('--verbose');
const all = process.argv.includes('--all');
const check = process.argv.includes('--check');
const diffArg = (process.argv.find(a => a.startsWith('--difficulty=')) || '').split('=')[1];
const MAX_STEPS_PER_TURN = 14;

function playOne(difficulty, seed) {
  // 固定局号序列：同一批种子每档各跑一遍，回归结果可复现，不受抽样噪声误报影响
  const s = new GameState({ difficulty, seed });
  const captures = [];
  s.on('log', ({ text }) => {
    if (text.includes('★') || text.includes('【结局】')) captures.push(`T${s.turn} ${text}`);
  });
  let steps = 0;
  while (!s.over && s.turn <= s.maxTurns + 2) {
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
    captures,
    logs: s.logs.slice().reverse(),
  };
}

const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '-';

function report(label, results) {
  const wins = results.filter(r => r.kind === 'win');
  const losses = results.filter(r => r.kind !== 'win');
  const byTitle = {};
  for (const r of results) {
    const k = `${r.kind === 'win' ? '胜' : '败'}·${r.title}`;
    byTitle[k] = (byTitle[k] || 0) + 1;
  }
  console.log(`\n═══ ${label} · ${results.length} 局 ═══`);
  console.log(`胜率        ${(wins.length / results.length * 100).toFixed(1)}%  (${wins.length} 胜 / ${losses.length} 负)`);
  console.log(`平均终局回合 ${avg(results.map(r => r.turn))}   平均胜利回合 ${avg(wins.map(r => r.turn))}`);
  console.log(`胜利回合范围 ${wins.length ? Math.min(...wins.map(r => r.turn)) + ' ~ ' + Math.max(...wins.map(r => r.turn)) : '-'}`);
  console.log(`平均每局指令 ${avg(results.map(r => r.steps))} 步`);
  const avgWinTurn = wins.length ? Number(avg(wins.map(r => r.turn))) : 0;
  console.log(`结局分布    `, byTitle);
  return { wins, losses, rate: wins.length / results.length, avgWinTurn };
}

const list = (all || check) ? DIFFICULTIES.map(d => d.id)
  : [diffArg && DIFFICULTIES.some(d => d.id === diffArg) ? diffArg : 'normal'];

let first = null;
const summary = {};
for (const id of list) {
  const label = DIFFICULTIES.find(d => d.id === id).name;
  const results = [];
  for (let i = 0; i < games; i++) results.push(playOne(id, i + 1));
  const r = report(label, results);
  summary[id] = r;
  if (!first) first = { label, ...r };
}

if (first) {
  const sample = first.wins[0];
  if (verbose && sample) {
    console.log(`\n───── 首局胜利战报（${first.label} · 第 ${sample.turn} 回合，${sample.song} 州 / 金 ${sample.jin} 州）─────`);
    sample.logs.forEach(l => console.log(`[${l.tag}] ${l.text}`));
  } else if (sample) {
    console.log('\n首胜关键节点：');
    sample.captures.forEach(c => console.log('  ' + c));
  }
  if (first.losses.length && verbose) {
    console.log('\n首败关键节点：');
    first.losses[0].captures.slice(-12).forEach(c => console.log('  ' + c));
  }
}

if (check) {
  // 平衡护栏：数值一旦把本色难度打回「必胜速通」或推向「不可赢」，就在这里拦下。
  // 区间留得比目标宽，避免有限样本的抽样波动造成假失败。
  const EXPECT = {
    easy:   { lo: 0.90, hi: 1.00, minTurn: 12 },
    normal: { lo: 0.45, hi: 0.75, minTurn: 18 },
    hard:   { lo: 0.05, hi: 0.45, minTurn: 18 },
  };
  console.log('\n═══ 平衡回归 ───');
  let failed = 0;
  for (const [id, e] of Object.entries(EXPECT)) {
    const r = summary[id];
    const rate = r?.rate ?? 0;
    const turn = r?.avgWinTurn ?? 0;
    const okRate = rate >= e.lo && rate <= e.hi;
    const okTurn = turn >= e.minTurn;
    const name = DIFFICULTIES.find(d => d.id === id).name;
    console.log(`${okRate && okTurn ? '通过' : '未过'}  ${name}  胜率 ${(rate * 100).toFixed(1)}% (期望 ${e.lo * 100}~${e.hi * 100}%)  平均胜局 ${turn} 回合 (≥${e.minTurn})`);
    if (!okRate || !okTurn) failed++;
  }
  if (failed) {
    console.error(`平衡回归未通过：${failed} 档越界`);
    process.exitCode = 1;
  } else {
    console.log('平衡回归通过');
  }
}
