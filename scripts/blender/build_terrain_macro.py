"""《绍宋》地表「宏尺度」质感贴图 —— 在 Blender 内执行：
    blender -b --factory-startup -P scripts/blender/build_terrain_macro.py

与 build_terrain.py 的分工：
  build_terrain.py      旧版细节层（正弦叠加，std≈7.5）—— 实测在默认机位贡献仅 0.15%，已被本脚本取代
  build_terrain_macro.py 宏尺度层：能量集中在 4~32 周/贴图，平均幅度约 3 倍

为什么是「宏尺度」：1600×900 默认机位下，26×22 平铺意味着一张 512² 贴图只占约 38px，
等于 13 倍缩小，高频被 mipmap 平均掉（实测：同样幅度，高频版 meanAbs 0.28、低频版 1.56）。
所以质感必须做在 4~32 周这一段，而不是靠加高频颗粒。

为什么是「单侧压暗」：乘性遮罩不能大于 1，所以纹理只能把底色压暗。
本脚本按 mean=0.885 / std=0.09 烘，再由 world.js 用 material.color = 1/mean 把整幅平均明度补回，
等价于「零均值重分配」——局部有起伏，整体不压暗。

产物：public/textures/terrain-detail.png、public/textures/terrain-normal.png
"""
import os
import struct
import zlib

import bpy  # noqa: F401  # 仅为在 Blender 内执行，保持与既有资产管线一致
import numpy as np

ROOT = 'E:/code/game-shaosong'
OUT = ROOT + '/public/textures'
os.makedirs(OUT, exist_ok=True)

N = 512
TARGET_MEAN = 0.885      # 单侧压暗后的均值；world.js 用 1/MEAN 补回
TARGET_STD = 0.085       # 现有 7.5/255≈0.029 的约 3 倍
NORMAL_STRENGTH = 18.0   # 现有 9.0；实测旧法线平均倾角仅 9.6°，效果太弱
SEED = 20261111
ABS_STD = 0.6            # |N(0,1)| 的标准差，用于把 |h| 精确缩放到 TARGET_STD


def vnoise(px, py, seed):
    """周期值噪声：px×py 随机格 + smoothstep 插值，首尾自动连续（可平铺）。"""
    g = np.random.default_rng(seed).random((py, px)).astype(np.float32)
    xs = np.arange(N, dtype=np.float32) * px / N
    ys = np.arange(N, dtype=np.float32) * py / N
    x0 = np.floor(xs).astype(np.int32)
    y0 = np.floor(ys).astype(np.int32)
    fx, fy = xs - x0, ys - y0
    ux = (fx * fx * (3 - 2 * fx))[None, :]
    uy = (fy * fy * (3 - 2 * fy))[:, None]
    x1, y1 = (x0 + 1) % px, (y0 + 1) % py
    x0, y0 = x0 % px, y0 % py
    g00, g10 = g[np.ix_(y0, x0)], g[np.ix_(y0, x1)]
    g01, g11 = g[np.ix_(y1, x0)], g[np.ix_(y1, x1)]
    a = g00 * (1 - ux) + g10 * ux
    b = g01 * (1 - ux) + g11 * ux
    return a * (1 - uy) + b * uy


def bands():
    """4/8/16/32 四个倍频带 + 脊状 + 横向层理；全部落在 4~32 周/贴图这一段。"""
    c = {}
    for p, w in ((4, 1.00), (8, 0.80), (16, 0.60), (32, 0.45), (48, 0.30)):
        c[p] = vnoise(p, p, SEED + p)
    c['ridge'] = (1.0 - np.abs(2.0 * vnoise(12, 12, SEED + 40) - 1.0)) ** 2.0
    # 横向层理：x 4 周、y 32 周 → 拉长的条带，避免像云团
    strata = np.clip((vnoise(4, 32, SEED + 80) - 0.50) / 0.24, 0.0, 1.0)
    c['strata'] = strata * np.clip(0.45 + (vnoise(4, 4, SEED + 81) - 0.5) * 1.2, 0.0, 1.0)
    return c


def build_height(c):
    h = (1.00 * (c[4] - 0.5)
         + 0.85 * (c[8] - 0.5)
         + 0.62 * (c[16] - 0.5)
         + 0.38 * (c[32] - 0.5)
         + 0.30 * (c['ridge'] - c['ridge'].mean())
         + 0.18 * (c['strata'] - c['strata'].mean()))
    h -= h.mean()
    return h / max(h.std(), 1e-6)


def normal_from(height, strength):
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nz = np.ones_like(dx)
    inv = 1.0 / np.sqrt(dx * dx + dy * dy + nz * nz)
    nrm = np.empty((N, N, 3), dtype=np.uint8)
    nrm[..., 0] = np.round((-dx * inv * 0.5 + 0.5) * 255).astype(np.uint8)
    nrm[..., 1] = np.round((-dy * inv * 0.5 + 0.5) * 255).astype(np.uint8)
    nrm[..., 2] = np.round((nz * inv * 0.5 + 0.5) * 255).astype(np.uint8)
    return nrm


def write_png(path, arr):
    h, w, _ = arr.shape
    raw = b''.join(b'\x00' + arr[row].tobytes() for row in range(h))

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    blob = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(blob)
    return len(blob)


def spectrum(base):
    g = base - base.mean()
    F = np.abs(np.fft.rfft2(g)) ** 2
    h, w = F.shape
    r = np.sqrt(np.arange(h)[:, None] ** 2 + np.arange(w)[None, :] ** 2)
    tot = max(F.sum(), 1e-9)
    return [round(float(F[r < 16].sum() / tot * 100), 1),
            round(float(F[(r >= 16) & (r < 64)].sum() / tot * 100), 1),
            round(float(F[r >= 64].sum() / tot * 100), 1)]


c = bands()
h = build_height(c)
# 单侧压暗：v = 1 - |g|，尾部落在 [0.45, 1] 内，不产生死黑
base = 1.0 - np.abs(h) * (TARGET_STD / ABS_STD)
base = np.clip(base, 0.45, 1.0)
base = TARGET_MEAN + (base - base.mean())      # 精确对齐目标均值，不改变起伏量

val = np.round(base * 255).astype(np.uint8)
rgb = np.repeat(val[..., None], 3, axis=2)
nrm = normal_from(h, NORMAL_STRENGTH)

p1, p2 = f'{OUT}/terrain-detail.png', f'{OUT}/terrain-normal.png'
b1, b2 = write_png(p1, rgb), write_png(p2, nrm)

gx = float(np.abs(np.diff(val.astype(float), axis=1)).mean())
gy = float(np.abs(np.diff(val.astype(float), axis=0)).mean())

result = {
    'detail': p1, 'detail_bytes': b1, 'normal': p2, 'normal_bytes': b2,
    'mean_255': round(float(val.mean()), 2),
    'std_255': round(float(val.std()), 2),
    'min': int(val.min()), 'max': int(val.max()),
    'edge_px': [round(gx, 2), round(gy, 2)],
    'spectrum_low_mid_high_pct': spectrum(base),
    'normal_mean_rgb': [round(float(nrm[..., k].mean()), 1) for k in range(3)],
    'normal_B_mean': round(float(nrm[..., 2].mean()), 1),
    'tile_edge_diff': [round(float(np.abs(val[0].astype(int) - val[-1].astype(int)).mean()), 2),
                       round(float(np.abs(val[:, 0].astype(int) - val[:, -1].astype(int)).mean()), 2)],
    'compensation': round(1.0 / (TARGET_MEAN), 4),
}

print('TERRAIN_MACRO ' + repr(result))