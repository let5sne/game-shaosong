"""《绍宋》宣纸地表贴图 —— 在 Blender 内通过 MCP 执行。

周期正弦叠加生成 512×512 可平铺纸纤维 + 淡墨田垄，
用纯 Python 写 PNG（避开 Blender 色彩空间转换造成的亮度偏移）。
基调接近纯白，作为 land 材质的 map 只添细节、不改整体清透观感。

产物：public/textures/paper.png
"""
import bpy
import os
import zlib
import struct
import numpy as np

ROOT = 'E:/code/game-shaosong'
OUT = ROOT + '/public/textures/paper.png'
os.makedirs(os.path.dirname(OUT), exist_ok=True)

N = 512
y, x = np.mgrid[0:N, 0:N].astype(np.float32)
u, v = 2 * np.pi * x / N, 2 * np.pi * y / N

# 周期函数叠加 → 天然可平铺，无接缝
fiber = (np.sin(u * 23 + np.sin(v * 7) * 1.3) * 0.5
         + np.sin(v * 31 + np.sin(u * 5) * 1.1) * 0.5
         + np.sin(u * 7 + v * 9) * 0.4
         + np.sin(u * 53) * np.sin(v * 47) * 0.3
         + np.sin(u * 3 - v * 2) * 0.35)

# 纸浆厚薄不匀的低频斑驳
mottle = (np.sin(u * 2 + v * 1.7) * 0.5
          + np.sin(u * 3.7 - v * 2.3) * 0.3
          + np.sin(u * 1.3 + v * 4.1) * 0.2)

# 淡墨田垄：多频扰动 + 低频掩码，让斜线断续，不生成瓦楞般的规则条纹
warp = np.sin(u * 3 + v * 2) * 0.9 + np.sin(u * 7 - v * 5) * 0.5
ridge_wave = np.sin(u * 14 + v * 3 + warp)
mask = np.clip(np.sin(u * 2 + v * 3) + np.sin(u * 5 - v * 4) * 0.6 + 0.25, 0.0, 1.0)
ridge = np.clip((ridge_wave - 0.90) / 0.10, 0.0, 1.0) * mask * 0.6

# 稀疏墨点（周期化：用整数频率的正弦掩码代替随机块）
speck = np.maximum(0.0, np.sin(u * 41 + np.sin(v * 17)) * np.sin(v * 37 + np.sin(u * 11)) - 0.86) / 0.14

base = 0.986 + fiber * 0.016 + mottle * 0.014 - ridge * 0.045 - speck * 0.016
base = np.clip(base, 0.86, 1.0)
rgb = np.empty((N, N, 3), dtype=np.uint8)
rgb[..., 0] = np.round(base * 255).astype(np.uint8)
rgb[..., 1] = np.round(base * 254).astype(np.uint8)
rgb[..., 2] = np.round(base * 250).astype(np.uint8)


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

# 复位建模时为看图临时挪动的对象，让 .blend 与已导出的 GLB 保持一致
for o in bpy.data.objects:
    if o.name in ('Rider', 'Siege'):
        o.location = (0.0, 0.0, 0.0)
bpy.ops.wm.save_as_mainfile(filepath=ROOT + '/assets/shaosong-units.blend')

# 顺手校验四个边缘是否连续（可平铺）
edge = (float(np.abs(rgb[0].astype(int) - rgb[-1].astype(int)).mean()),
        float(np.abs(rgb[:, 0].astype(int) - rgb[:, -1].astype(int)).mean()))

result = {
    'path': OUT,
    'bytes': size,
    'resolution': [N, N],
    'mean': round(float(base.mean()), 4),
    'min': round(float(base.min()), 4),
    'edge_diff': [round(v, 3) for v in edge],
}
