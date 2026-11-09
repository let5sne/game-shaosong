/**
 * 无头批量模拟：验证托管 AI 在不同难度、随机变局与短剧本下的胜率与节奏。
 *   node scripts/simulate.mjs                     normal 跑 200 局
 *   node scripts/simulate.mjs 300 --difficulty=hard   指定难度
 *   node scripts/simulate.mjs 200 --all          三档各跑 200 局做对比
 *   node scripts/simulate.mjs 200 --scenario=shunchang  只跑某一短剧本
 *   node scripts/simulate.mjs 50 --verbose       打印首局完整战报
 *   npm run balance                            三档 + 两个短剧本各 300 局，附胜率/节奏护栏断言
 *   npm run balance:economy                   开启治略，各 100 局跑独立护栏 + 经营行为断言
 */
import { GameState } from '../src/rules.js';
import { chooseAction, applyAction, chooseEvent, newTurnContext } from '../src/autoplay.js';
import { DIFFICULTIES, SCENARIOS } from '../src/data.js';

const games = Number(process.argv[2]) || 200;
const verbose = process.argv.includes('--verbose');
const all = process.argv.includes('--all');
const check = process.argv.includes('--check');
const diffArg = (process.argv.find(a => a.startsWith('--difficulty=')) || '').split('=')[1];
const scenarioArg = (process.argv.find(a => a.startsWith('--scenario=')) || '').split('=')[1];
const ecoMode = process.argv.includes('--economy');   // 治略（经营养成）独立回归组
const MAX_STEPS_PER_TURN = 14;

function playOne(difficulty, seed, scenarioId = null) {
  // 固定局号序列：同一批种子每档各跑一遍，回归结果可复现，不受抽样噪声误报影响
  const s = new GameState({ difficulty, seed, economy: ecoMode, ...(scenarioId ? { scenario: scenarioId } : {}) });
  const captures = [];
  const tally = { built: 0, dispatched: 0, levelUps: 0 };
  s.on('log', ({ text }) => {
    if (text.includes('★') || text.includes('【结局】')) captures.push(`T${s.turn} ${text}`);
    if (text.includes('【营建】')) tally.built++;
    if (text.includes('【差遣】')) tally.dispatched++;
    if (text.includes('【进阶】')) tally.levelUps++;
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
    ...tally,
    arms: s.economy?.arms ?? 0,
    builtCities: Object.keys(s.economy?.buildings || {}).length,
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
  if (ecoMode) {
    console.log(`经营统计    营建 ${avg(results.map(r => r.built))} 次/局 · 差遣 ${avg(results.map(r => r.dispatched))} 次/局 · 进阶 ${avg(results.map(r => r.levelUps))} 次/局 · 终局军械 ${avg(results.map(r => r.arms))}`);
  }
  return {
    wins, losses, rate: wins.length / results.length, avgWinTurn,
    builds: results.reduce((n, r) => n + r.built, 0),
    dispatches: results.reduce((n, r) => n + r.dispatched, 0),
    levelUps: results.reduce((n, r) => n + r.levelUps, 0),
    avgArms: Number(avg(results.map(r => r.arms))) || 0,
    builtCities: results.reduce((n, r) => n + r.builtCities, 0),
  };
}

const chosenScenario = SCENARIOS.find(s => s.id === scenarioArg) || null;
const diffList = chosenScenario ? []
  : (all || check) ? DIFFICULTIES.map(d => d.id)
    : [diffArg && DIFFICULTIES.some(d => d.id === diffArg) ? diffArg : 'normal'];
const scenarioList = chosenScenario ? [chosenScenario] : (check ? SCENARIOS : []);

const summary = {};
let first = null;
for (const id of diffList) {
  const label = DIFFICULTIES.find(d => d.id === id).name;
  const results = [];
  for (let i = 0; i < games; i++) results.push(playOne(id, i + 1));
  const r = report(label, results);
  summary[id] = r;
  if (!first) first = { label, ...r };
}
for (const sc of scenarioList) {
  const results = [];
  for (let i = 0; i < games; i++) results.push(playOne(sc.difficulty, i + 1, sc.id));
  const r = report(`${sc.name} · 短剧本`, results);
  summary[sc.id] = r;
  if (!first) first = { label: sc.name, ...r };
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
  // 短剧本另设区间：守关可以宽松，攻关须有真实败率，且都不许一回合速通。
  // 区间留得比目标宽，避免有限样本的抽样波动造成假失败。
  // 治略是 opt-in 的变强向玩法，政令分给营建、将领积功后胜率自然高于原版，不用原版基线卡它；
  // 100 局实测 99.0 / 89.0 / 46.0，这里在实测上下各留约 0.15 余量锁住手感，防的是「改崩」而非「改成另一档难度」。
  // 短剧本托管不种田，数值应与原版一致，故仍沿用原区间。
  const EXPECT = ecoMode ? {
    easy:   { lo: 0.85, hi: 1.00, minTurn: 12 },
    normal: { lo: 0.70, hi: 0.98, minTurn: 16 },
    hard:   { lo: 0.28, hi: 0.68, minTurn: 16 },
  } : {
    easy:   { lo: 0.90, hi: 1.00, minTurn: 12 },
    normal: { lo: 0.45, hi: 0.75, minTurn: 18 },
    hard:   { lo: 0.05, hi: 0.45, minTurn: 18 },
  };
  const SCENARIO_EXPECT = {
    shunchang: { lo: 0.55, hi: 0.95, minTurn: 4 },
    yancheng:  { lo: 0.30, hi: 0.75, minTurn: 5 },
  };
  console.log(ecoMode ? '\n═══ 治略模式回归 ───' : '\n═══ 平衡回归 ───');
  let failed = 0;
  for (const [id, e] of Object.entries(EXPECT)) {
    const r = summary[id];
    if (!r) continue;
    const rate = r.rate, turn = r.avgWinTurn;
    const okRate = rate >= e.lo && rate <= e.hi;
    const okTurn = turn >= e.minTurn;
    const name = DIFFICULTIES.find(d => d.id === id).name;
    console.log(`${okRate && okTurn ? '通过' : '未过'}  ${name}  胜率 ${(rate * 100).toFixed(1)}% (期望 ${(e.lo * 100).toFixed(0)}~${(e.hi * 100).toFixed(0)}%)  平均胜局 ${turn} 回合 (≥${e.minTurn})`);
    if (!okRate || !okTurn) failed++;
  }
  for (const sc of SCENARIOS) {
    const e = SCENARIO_EXPECT[sc.id], r = summary[sc.id];
    if (!e || !r) continue;
    const okRate = r.rate >= e.lo && r.rate <= e.hi;
    const okTurn = r.avgWinTurn >= e.minTurn && r.avgWinTurn <= sc.maxTurns;
    console.log(`${okRate && okTurn ? '通过' : '未过'}  ${sc.name}  胜率 ${(r.rate * 100).toFixed(1)}% (期望 ${(e.lo * 100).toFixed(0)}~${(e.hi * 100).toFixed(0)}%)  平均胜局 ${r.avgWinTurn} 回合 (${e.minTurn}~${sc.maxTurns})`);
    if (!okRate || !okTurn) failed++;
  }
  // 经营行为断言：胜率只能证明「能赢」，还要证明这条玩法链路真的通了——
  // 托管会营建／差遣、将领确实进阶、作坊确实产军械，否则很可能是开关或政令接线断了却仍靠原版打法赢。
  // 短剧本反过来：托管不该把仅有的几道政令拿去种田，但实战阅历仍应照常累积。
  if (ecoMode) {
    console.log('\n─── 治略行为断言 ───');
    const behavior = (label, r, longGame) => {
      if (!r) return;
      const checks = longGame ? [
        ['托管已营建', r.builds > 0],
        ['托管已差遣', r.dispatches > 0],
        ['将领有进阶', r.levelUps > 0],
        ['作坊产军械', r.avgArms > 0],
        ['设施落州郡', r.builtCities > 0],
      ] : [
        ['短关不种田', r.builds === 0 && r.dispatches === 0],
        ['实战仍积阅历', r.levelUps > 0],
      ];
      const bad = checks.filter(([, ok]) => !ok).length;
      console.log(`${bad ? '未过' : '通过'}  ${label}  ${checks.map(([n, ok]) => `${n}${ok ? '✓' : '✗'}`).join(' · ')}`);
      failed += bad;
    };
    for (const id of diffList) behavior(DIFFICULTIES.find(d => d.id === id).name, summary[id], true);
    for (const sc of SCENARIOS) behavior(sc.name, summary[sc.id], false);
  }
  if (failed) {
    console.error(`平衡回归未通过：${failed} 项越界`);
    process.exitCode = 1;
  } else {
    console.log('平衡回归通过');
  }
}
