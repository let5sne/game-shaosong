"""《绍宋》城池表面图集 —— 在 Blender 内通过 MCP 执行。

一张 512² 灰度图集，上下两带分别给屋顶与墙面使用：
  PNG 上半 (y < 0.46N)  → 筒瓦瓦垄 + 瓦当横缝   → three 中 v ∈ [0.54, 0.96]
  PNG 下半 (y > 0.54N)  → 夯土层理 + 错缝砖线   → three 中 v ∈ [0.04, 0.46]
  中间 8% 纯白隔离带，防止 mipmap 采样串带。

three 的 Texture.flipY 默认为 true，故 v=1 对应 PNG 首行。
所有灰度落在 0.93~1.0，作为 map 只乘出细节、不压暗既有顶点色。

产物：public/textures/city-surface.png
脚本纯 Python + numpy 写 PNG，避开 Blender 色彩空间转换造成的亮度偏移。
"""
import os
import zlib
import struct
import numpy as np

ROOT = 'E:/code/game-shaosong'
OUT = ROOT + '/public/textures/city-surface.png'
os.makedirs(os.path.dirname(OUT), exist_ok=True)

N = 512
y, x = np.mgrid[0:N, 0:N].astype(np.float32)
u, v = 2 * np.pi * x / N, 2 * np.pi * y / N

# 两带共用的极淡纸纤维，避免大面积纯平
fiber = (np.sin(u * 23 + np.sin(v * 7) * 1.3) * 0.5
         + np.sin(v * 31 + np.sin(u * 5) * 1.1) * 0.5
         + np.sin(u * 7 + v * 9) * 0.4) * 0.006

# ── 瓦作：沿 x 的筒瓦/板瓦交替，沿 y 的瓦当横缝 ──
pitch = 32.0                                   # 每 32px 一垄，512 内共 16 垄
# 沿 y 的轻微相位扰动，避免瓦垄像机械刻度；只依赖 y，x=0/512 仍相差整数周期，可平铺
warp = np.sin(2 * np.pi * y / 173.0) * 0.8 + np.sin(2 * np.pi * y / 71.0) * 0.4
wave = np.cos(2 * np.pi * (x + warp) / pitch)
trough = np.clip(-wave, 0.0, 1.0) ** 1.5      # 板瓦凹槽：宽而柔的暗带
ridge = np.clip(wave, 0.0, 1.0) ** 2.0        # 筒瓦隆起
# 瓦当横缝：连续横线极淡，只在凹槽内加深，避免织成网格布
course = np.clip((np.sin(2 * np.pi * y / 48.0) - 0.90) / 0.10, 0.0, 1.0)
roof = (0.998 + fiber + ridge * 0.002
        - trough * 0.15
        - course * (0.010 + trough * 0.060))

# ── 夯土／砖作：水平层理 + 逐层错半砖的竖缝 ──
# 夯土：层理是宽渐变（夯筑层的明暗），不是细线，避免织成网格布
lam = 0.5 + 0.5 * np.cos(2 * np.pi * y / 26.0)
layer = lam ** 1.5
brick_shift = (np.floor(y / 26.0).astype(np.float32) % 2.0) * 36.0
joint = np.clip((np.cos(2 * np.pi * (x + brick_shift) / 72.0) - 0.95) / 0.05, 0.0, 1.0)
# 竖缝被层线打断，读作砌筑而非网格
wall = (0.998 + fiber
        - layer * 0.10
        - joint * (1.0 - layer) * 0.055)

# ── 按 v 分带（flipY 后 v=1 → PNG 首行）──
band = np.where(y < 0.46 * N, roof, np.where(y > 0.54 * N, wall, 1.0))
band = np.clip(band, 0.76, 1.0)

rgb = np.empty((N, N, 3), dtype=np.uint8)
val = np.round(band * 255).astype(np.uint8)
rgb[..., 0] = val
rgb[..., 1] = np.round(band * 254).astype(np.uint8)
rgb[..., 2] = np.round(band * 250).astype(np.uint8)


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


size = write_png(OUT, rgb)

roof_band = band[:int(0.46 * N)]
wall_band = band[int(0.54 * N):]
gap = band[int(0.46 * N):int(0.54 * N)]

result = {
    'path': OUT,
    'bytes': size,
    'resolution': [N, N],
    'bands': {
        'roof': [0.54, 0.96],
        'wall': [0.04, 0.46],
        'gap_px': int(0.08 * N),
    },
    'roof_mean': round(float(roof_band.mean()), 4),
    'roof_min': round(float(roof_band.min()), 4),
    'wall_mean': round(float(wall_band.mean()), 4),
    'wall_min': round(float(wall_band.min()), 4),
    'gap_mean': round(float(gap.mean()), 4),
}
