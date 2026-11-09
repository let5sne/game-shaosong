#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 Noto Serif SC（SIL OFL 1.1）按本项目的实际用字子集化成 woff2。

为什么要自己切：项目原先靠系统字体栈 "Songti SC / STSong / SimSun" 兜底，
Windows、macOS、Linux 拿到的宋体字形、字重与度量都不同，开场页的大字标题
在跨平台上会明显跑版。打包一份只含本作用字的中文字体即可统一观感，
又不必把 14 MB 的完整字库塞给浏览器。

用法：
    python scripts/subset-font.py                 # 用 .workbuddy/tmp/fontsrc 里的源 TTF
    python scripts/subset-font.py --fetch        # 源 TTF 不存在时从 Google Fonts 下载

源字体（Google Fonts CSS2 给出的静态 TTF，v36）：
    400 https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7SCqyWv.ttf
    700 https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7RlrCWv.ttf

产物：public/fonts/shaosong-serif-{400,700}.woff2、subset-manifest.json
许可：public/fonts/OFL.txt（OFL 要求随字体附带版权声明与许可副本）
未收录的字符由 CSS 字体栈逐字符回退到系统宋体，不会出现豆腐块。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / '.workbuddy' / 'tmp' / 'fontsrc'
OUT_DIR = ROOT / 'public' / 'fonts'
# 只扫会真正显示在界面上的源码；测试与脚本里的中文不该把字库撑大。
SCAN_GLOBS = ['src/*.js', 'src/*.css', 'index.html']

SOURCES = {
    400: 'https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7SCqyWv.ttf',
    700: 'https://fonts.gstatic.com/s/notoserifsc/v36/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7RlrCWv.ttf',
}

# 数字、单位、标点与界面符号：即使当前文案没用到也一并收进子集，
# 免得日后加一句「第 3 回合 · 粮 +12%」就出现字形混排。
EXTRA = (
    ''.join(chr(c) for c in range(0x20, 0x7F))
    + '　、。〈〉《》「」『』【】（）！？；：，·—…“”‘’％＋－×÷±°'
    + '◇◆○●◎△▲▽▼★☆↔←→↑↓↶↻▶⌖⚙✓✕✖⟡✓』'
    + '零一二三四五六七八九十百千万亿第回合年月日'
    + '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'
    + 'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ'
)


def collect_chars() -> set[str]:
    chars: set[str] = set(EXTRA)
    for pattern in SCAN_GLOBS:
        for path in sorted(ROOT.glob(pattern)):
            text = path.read_text(encoding='utf-8', errors='ignore')
            # 收全部非 ASCII；ASCII 已由 EXTRA 覆盖
            chars.update(ch for ch in text if ord(ch) > 0x7F)
    # CSS 里由 content 生成的装饰字符、正则与转义残留不必保留，
    # 但控制字符绝不能进字体（subset 会报错）。
    return {ch for ch in chars if ord(ch) >= 0x20 and not (0xD800 <= ord(ch) <= 0xDFFF)}


def fetch(weight: int) -> Path:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    path = SRC_DIR / f'noto-serif-sc-{weight}.ttf'
    if path.exists() and path.stat().st_size > 1_000_000:
        return path
    print(f'downloading Noto Serif SC {weight} …', file=sys.stderr)
    with urllib.request.urlopen(SOURCES[weight], timeout=120) as r:
        path.write_bytes(r.read())
    return path


def subset_one(weight: int, text: str, fetch_missing: bool) -> dict:
    from fontTools import subset
    from fontTools.ttLib import TTFont

    src = SRC_DIR / f'noto-serif-sc-{weight}.ttf'
    if not src.exists() and fetch_missing:
        src = fetch(weight)
    if not src.exists():
        raise SystemExit(f'缺少源字体 {src}，请加 --fetch 或手动下载（见文件头注释）')

    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.glyph_names = False
    opts.notdef_outline = True
    opts.recommended_glyphs = True
    opts.name_IDs = ['*']          # OFL 要求保留版权与许可声明
    opts.name_legacy = True
    opts.drop_tables += ['BASE', 'vhea', 'vmtx', 'STAT', 'gasp']
    opts.layout_features = ['*']

    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(font)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f'shaosong-serif-{weight}.woff2'
    subset.save_font(font, out, opts)

    # 统计真正落进字体的字符，供 Node 侧单测与后续文案核对
    baked = TTFont(out)
    cmap = baked['cmap'].getBestCmap()
    return {
        'weight': weight,
        'file': out.name,
        'bytes': out.stat().st_size,
        'sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
        'sourceBytes': src.stat().st_size,
        'sourceSha256': hashlib.sha256(src.read_bytes()).hexdigest(),
        'glyphs': baked['maxp'].numGlyphs,
        'codepoints': len(cmap),
        '_cmap': sorted(cmap),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true', help='源 TTF 缺失时自动下载')
    args = ap.parse_args()

    chars = collect_chars()
    text = ''.join(sorted(chars))
    cjk = [ch for ch in chars if '一' <= ch <= '鿿']
    print(f'项目用字 {len(chars)} 个（其中汉字 {len(cjk)} 个）')

    results = [subset_one(w, text, args.fetch) for w in (400, 700)]
    baked_cps = results[0].pop('_cmap')
    for r in results[1:]:
        assert r.pop('_cmap') == baked_cps, '两个字重的字符集不一致'
    manifest = {
        'family': 'Shaosong Serif',
        'source': 'Noto Serif SC (Google Fonts, SIL Open Font License 1.1)',
        'license': 'OFL.txt',
        'scanned': SCAN_GLOBS,
        'requestedChars': len(chars),
        'cjkChars': len(cjk),
        # 真正烘进字体的码点，供 Node 侧零依赖单测核对关键字形
        'codepoints': baked_cps,
        'fonts': results,
    }
    (OUT_DIR / 'subset-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for r in results:
        print(f"  {r['file']}: {r['bytes']:,} B, {r['glyphs']} glyphs, "
              f"{r['codepoints']} codepoints")
    print(f"  合计 {sum(r['bytes'] for r in results):,} B（源字体 "
          f"{sum(r['sourceBytes'] for r in results):,} B）")


if __name__ == '__main__':
    main()
