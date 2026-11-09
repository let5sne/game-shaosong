/**
 * 跨平台宋体子集：产物完整性、许可合规、关键用字覆盖与 CSS 接入。
 * 字体由 scripts/subset-font.py 生成，本测试不依赖 fontTools，直接读清单与文件头。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FONT_DIR = 'public/fonts/';
const manifest = JSON.parse(readFileSync(FONT_DIR + 'subset-manifest.json', 'utf8'));
const css = readFileSync('src/style.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('清单声明两个权重、许可与来源', () => {
  assert.equal(manifest.family, 'Shaosong Serif');
  assert.match(manifest.source, /Noto Serif SC/);
  assert.match(manifest.source, /SIL Open Font License/);
  assert.equal(manifest.license, 'OFL.txt');
  assert.deepEqual(manifest.fonts.map(f => f.weight), [400, 700]);
  assert.ok(manifest.requestedChars > 1000 && manifest.cjkChars > 1000);
});

test('两份 woff2 与清单的字节数、摘要逐项一致，且体积远小于源字库', () => {
  let total = 0;
  for (const f of manifest.fonts) {
    const buf = readFileSync(FONT_DIR + f.file);
    assert.equal(buf.toString('ascii', 0, 4), 'wOF2', `${f.file} 必须是 woff2`);
    assert.equal(statSync(FONT_DIR + f.file).size, f.bytes);
    assert.equal(buf.length, f.bytes);
    assert.equal(createHash('sha256').update(buf).digest('hex'), f.sha256);
    assert.ok(f.bytes < 400_000, `${f.file} 子集过大：${f.bytes}`);
    assert.ok(f.sourceBytes > 10_000_000, '源字库应为完整字库');
    assert.equal(f.codepoints, manifest.codepoints.length);
    total += f.bytes;
  }
  assert.ok(total < 600_000, `两个字重合计 ${total} B，超出首屏预算`);
});

test('OFL 许可随字体附带，含版权声明与 1.1 正文', () => {
  const ofl = readFileSync(FONT_DIR + 'OFL.txt', 'utf8');
  assert.match(ofl, /Copyright 2012 Google Inc/);
  assert.match(ofl, /SIL OPEN FONT LICENSE\s+Version 1\.1/i);
  assert.match(ofl, /PERMISSION & CONDITIONS/);
  assert.match(ofl, /redistribute/i);
});

test('项目关键用字确实烘进了 cmap（不会逐字回退成混排）', () => {
  const cps = new Set(manifest.codepoints);
  const words = [
    '紹宋建炎北伐',          // 标题（繁体「紹」）
    '开封燕京顺昌郾城',      // 两京与两个短剧本
    '春夏秋冬',              // 季节主题
    '政令筹粮拜将督军进军和议', // 六种命令
    '州郡津渡金人宋军粮秣',   // 常见战报词
    '进位临朝提兵赴战舆图朱批', // 开场页
    '，。·：；（）「」％＋－', // 中文标点
  ].join('');
  const missing = [...new Set([...words])].filter(c => !cps.has(c.codePointAt(0)));
  assert.deepEqual(missing, [], `子集缺字：${missing.join('')}`);
});

test('CSS 双权重 @font-face、字体栈首位与系统回退', () => {
  assert.equal((css.match(/@font-face/g) || []).length, 2);
  for (const f of manifest.fonts) {
    assert.ok(css.includes(`url('/fonts/${f.file}') format('woff2')`), `未引用 ${f.file}`);
    assert.ok(css.includes(`font-weight: ${f.weight};`));
    assert.ok(css.includes('font-display: swap'));
  }
  assert.match(css, /--serif:\s*"Shaosong Serif",\s*"Songti SC"/);
  assert.match(css, /"SimSun", serif;/);   // 子集未收录字仍能逐字符回退
});

test('index.html 预载两份字体，避免首屏字形跳变', () => {
  for (const f of manifest.fonts) {
    assert.ok(html.includes(`href="/fonts/${f.file}"`), `未预载 ${f.file}`);
    assert.match(html, /as="font" type="font\/woff2" crossorigin/);
  }
});
