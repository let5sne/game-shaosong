"""《绍宋》水面法线 —— 在 Blender 内执行：
    blender -b --factory-startup -P scripts/blender/build_water.py

产物：public/textures/water-normal.png（256²、可平铺、NoColorSpace）

设计：两组尺度叠加 —— 8 周（成组的涌浪）+ 20 周（碎波）+ 48 周（细纹），
x 方向拉伸 1.6 倍让波纹有方向感，避免各向同性的「塑料布」感。
法线由同一高度场 np.roll 差分得到，首尾天然连续。
"""
import os
import struct
import zlib

import bpy  # noqa: F401  # 仅为在 Blender 内执行，保持与既有资产管线一致
import numpy as np

ROOT = 'E:/code/game-shaosong'
OUT = ROOT + '/public/textures'
os.makedirs(OUT, exist_ok=True)

N = 256
SEED = 20261111
STRENGTH = 2.6


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


# x 方向 8 周、y 方向 5 周 → 沿 x 拉长的涌浪；再叠两组更细的碎波
h = (1.00 * (vnoise(8, 5, SEED + 1) - 0.5)
     + 0.55 * (vnoise(20, 13, SEED + 2) - 0.5)
     + 0.28 * (vnoise(48, 32, SEED + 3) - 0.5))
h -= h.mean()
h /= max(h.std(), 1e-6)

dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * STRENGTH
dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * STRENGTH
nz = np.ones_like(dx)
inv = 1.0 / np.sqrt(dx * dx + dy * dy + nz * nz)
nrm = np.empty((N, N, 3), dtype=np.uint8)
nrm[..., 0] = np.round((-dx * inv * 0.5 + 0.5) * 255).astype(np.uint8)
nrm[..., 1] = np.round((-dy * inv * 0.5 + 0.5) * 255).astype(np.uint8)
nrm[..., 2] = np.round((nz * inv * 0.5 + 0.5) * 255).astype(np.uint8)


def write_png(path, arr):
    hh, ww, _ = arr.shape
    raw = b''.join(b'\x00' + arr[row].tobytes() for row in range(hh))

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    blob = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', ww, hh, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(blob)
    return len(blob)


p = f'{OUT}/water-normal.png'
size = write_png(p, nrm)
tilt = np.degrees(np.arccos(np.clip(nrm[..., 2].mean() / 255.0 * 2 - 1, -1, 1)))
result = {
    'path': p, 'bytes': size, 'resolution': [N, N],
    'mean_rgb': [round(float(nrm[..., k].mean()), 1) for k in range(3)],
    'std_rgb': [round(float(nrm[..., k].std()), 1) for k in range(3)],
    'mean_tilt_deg': round(float(tilt), 2),
    'tile_edge_diff': [round(float(np.abs(nrm[0].astype(int) - nrm[-1].astype(int)).mean()), 2),
                       round(float(np.abs(nrm[:, 0].astype(int) - nrm[:, -1].astype(int)).mean()), 2)],
}
print('WATER_NORMAL ' + repr(result))