"""《绍宋》城池 PBR 套件 —— 在 Blender 内执行：
    blender -b --factory-startup -P scripts/blender/build_city_pbr.py

沿用 city-surface.png 的图集分带（上半瓦作 / 下半夯土，中间 8% 隔离带），
但这次烘三张贴图而不是一张灰度遮罩：

  city-albedo.png  sRGB   近白彩色：瓦垄逐垄冷暖差异 + 夯土层理色斑（仍由顶点色定基调）
  city-orm.png    线性   R=AO(1.0)  G=Roughness  B=Metalness(0)
  city-normal.png 线性   瓦垄与夯土层理的法线

为什么 albedo 保持近白：城池的基调色来自顶点色（青灰瓦 0x6b7772 / 夯土 0xc4b393），
彩色 albedo 只负责「同一片瓦里每垄的冷暖与深浅差」，否则会与顶点色二次相乘、把城染脏。
"""
import os
import struct
import zlib

import bpy  # noqa: F401
import numpy as np

ROOT = 'E:/code/game-shaosong'
OUT = ROOT + '/public/textures'
os.makedirs(OUT, exist_ok=True)

N = 512
SEED = 20261112


def vnoise(px, py, seed):
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


def band_roof():
    """筒瓦：沿 x 的垄 + 沿 y 的瓦当横缝。返回 (高度 0..1, 垄相位 -1..1)。"""
    pitch = 32.0
    warp = np.sin(2 * np.pi * np.arange(N) / 173.0) * 0.8 + np.sin(2 * np.pi * np.arange(N) / 71.0) * 0.4
    x = np.arange(N)[None, :] + warp[:, None]
    wave = np.cos(2 * np.pi * x / pitch)
    trough = np.clip(-wave, 0.0, 1.0) ** 1.5
    ridge = np.clip(wave, 0.0, 1.0) ** 2.0
    y = np.arange(N)[:, None]
    course = np.clip((np.sin(2 * np.pi * y / 48.0) - 0.90) / 0.10, 0.0, 1.0)
    h = 0.55 + ridge * 0.35 - trough * 0.45 - course * (0.10 + trough * 0.25)
    return np.clip(h, 0.0, 1.0), wave


def band_wall():
    """夯土：层理 + 逐层错半砖的竖缝。"""
    y = np.arange(N)[:, None]
    lam = 0.5 + 0.5 * np.cos(2 * np.pi * y / 26.0)
    layer = lam ** 1.5
    shift = (np.floor(y / 26.0).astype(np.float32) % 2.0) * 36.0
    x = np.arange(N)[None, :]
    joint = np.clip((np.cos(2 * np.pi * (x + shift) / 72.0) - 0.95) / 0.05, 0.0, 1.0)
    h = 0.62 + layer * 0.22 - joint * (1.0 - layer) * 0.30
    return np.clip(h, 0.0, 1.0)


roof_h, roof_wave = band_roof()
wall_h = band_wall()

# 图集布局：上半瓦作、下半夯土、中间 8% 隔离带（与 build_tiles.py 一致）
roof_px = slice(0, int(0.46 * N))
wall_px = slice(int(0.54 * N), N)
gap_px = slice(int(0.46 * N), int(0.54 * N))

H = np.ones((N, N), dtype=np.float32)
H[roof_px] = roof_h[:int(0.46 * N)]
H[wall_px] = wall_h[int(0.54 * N):]

# ── albedo：近白 + 逐垄冷暖 + 夯土色斑 ──────────────────────────
mottle = vnoise(8, 8, SEED + 1) - 0.5
fine = vnoise(48, 48, SEED + 2) - 0.5
tile_tint = vnoise(16, 4, SEED + 3) - 0.5        # 沿 x 的逐垄冷暖

alb = np.ones((N, N, 3), dtype=np.float32)
# 瓦作：垄顶略亮、槽底略暗；逐垄加一点冷暖（有的偏青、有的偏赭）
roof_lum = 0.965 + (roof_wave * 0.5) * 0.035 - np.clip(-roof_wave, 0, 1) * 0.06
alb[roof_px, :, 0] = roof_lum[:int(0.46 * N)] * (1 + tile_tint[:int(0.46 * N)] * 0.045)
alb[roof_px, :, 1] = roof_lum[:int(0.46 * N)] * (1 + tile_tint[:int(0.46 * N)] * 0.012)
alb[roof_px, :, 2] = roof_lum[:int(0.46 * N)] * (1 - tile_tint[:int(0.46 * N)] * 0.040)
# 夯土：层理明暗 + 低频色斑（土黄/灰白带一点冷暖）
wall_lum = 0.945 + (wall_h[int(0.54 * N):] - 0.62) * 0.10 + mottle[int(0.54 * N):] * 0.05 + fine[int(0.54 * N):] * 0.02
alb[wall_px, :, 0] = wall_lum * (1 + mottle[int(0.54 * N):] * 0.030)
alb[wall_px, :, 1] = wall_lum * (1 + mottle[int(0.54 * N):] * 0.008)
alb[wall_px, :, 2] = wall_lum * (1 - mottle[int(0.54 * N):] * 0.045)
# 隔离带保持纯白，避免 mipmap 串色
alb[gap_px] = 1.0
alb = np.clip(alb, 0.0, 1.0)

# ── ORM：R=AO(1.0)  G=Roughness  B=Metalness ─────────────────
orm = np.ones((N, N, 3), dtype=np.float32)
# 瓦：槽底更粗糙（积尘），垄顶略光滑（釉面）
rough_roof = 0.62 + np.clip(-roof_wave[:int(0.46 * N)], 0, 1) * 0.22 + fine[:int(0.46 * N)] * 0.05
orm[roof_px, :, 1] = rough_roof
orm[roof_px, :, 2] = 0.0
# 夯土：整体粗糙，层理缝里更粗糙
rough_wall = 0.86 + (1.0 - wall_h[int(0.54 * N):]) * 0.10 + fine[int(0.54 * N):] * 0.04
orm[wall_px, :, 1] = rough_wall
orm[wall_px, :, 2] = 0.0
orm[gap_px] = (1.0, 0.9, 0.0)
orm[..., 0] = 1.0
orm = np.clip(orm, 0.0, 1.0)

# ── normal：由同一高度场差分 ─────────────────────────────────
strength = 6.0
dx = (np.roll(H, -1, axis=1) - np.roll(H, 1, axis=1)) * strength * N / 512.0
dy = (np.roll(H, -1, axis=0) - np.roll(H, 1, axis=0)) * strength * N / 512.0
nz = np.ones_like(dx)
inv = 1.0 / np.sqrt(dx * dx + dy * dy + nz * nz)
nrm = np.empty((N, N, 3), dtype=np.uint8)
nrm[..., 0] = np.round((-dx * inv * 0.5 + 0.5) * 255).astype(np.uint8)
nrm[..., 1] = np.round((-dy * inv * 0.5 + 0.5) * 255).astype(np.uint8)
nrm[..., 2] = np.round((nz * inv * 0.5 + 0.5) * 255).astype(np.uint8)


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


p1 = f'{OUT}/city-albedo.png'
p2 = f'{OUT}/city-orm.png'
p3 = f'{OUT}/city-normal.png'
b1 = write_png(p1, np.round(alb * 255).astype(np.uint8))
b2 = write_png(p2, np.round(orm * 255).astype(np.uint8))
b3 = write_png(p3, nrm)

result = {
    'albedo': p1, 'albedo_bytes': b1,
    'orm': p2, 'orm_bytes': b2,
    'normal': p3, 'normal_bytes': b3,
    'albedo_mean': [round(float(alb[..., k].mean()), 3) for k in range(3)],
    'albedo_std': [round(float(alb[..., k].std()), 3) for k in range(3)],
    'rough_roof': round(float(orm[roof_px, :, 1].mean()), 3),
    'rough_wall': round(float(orm[wall_px, :, 1].mean()), 3),
    'normal_B_mean': round(float(nrm[..., 2].mean()), 1),
    'bands': {'roof_v': [0.54, 0.96], 'wall_v': [0.04, 0.46]},
}
print('CITY_PBR ' + repr(result))