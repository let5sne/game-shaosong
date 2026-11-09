"""《绍宋》高清地貌细节贴图 —— 在 Blender 内通过 MCP 执行。

周期正弦叠加生成 512×512 **可平铺** 的岩层皴纹 / 草甸短笔触 / 土痕斑驳。
作为 land 材质的 map 高密度平铺（26×22），只提供近景颗粒与坡面质感，
基调接近纯白且不做 sRGB 解码，因此乘上去不会整体压暗地形。

与 build_paper.py 的区别：纸纹要「极淡」，地貌皴纹要「看得见」——
上一轮城池贴图首版因为摆幅太小，实机 meanAbsDiff 只有 0.78/255，
这次直接把明暗摆幅给足，再由 A/B 像素护栏定量校准。

产物：public/textures/terrain-detail.png
"""
import os
import zlib
import struct
import numpy as np

ROOT = 'E:/code/game-shaosong'
OUT = ROOT + '/public/textures/terrain-detail.png'
os.makedirs(os.path.dirname(OUT), exist_ok=True)

N = 512
y, x = np.mgrid[0:N, 0:N].astype(np.float32)
u, v = 2 * np.pi * x / N, 2 * np.pi * y / N

# 高频颗粒：岩面与土粒的细碎明暗，全部整数频率 → 天然无缝
grain = (np.sin(u * 37 + np.sin(v * 11) * 1.2) * 0.34
         + np.sin(v * 43 + np.sin(u * 9) * 1.1) * 0.34
         + np.sin(u * 67 - v * 19) * 0.22
         + np.sin(u * 89 + v * 23) * 0.18)

# 岩层理：近水平单向，被低频域扭曲弯折；不再与裂隙正交，避免织成网格布
warp = np.sin(u * 3 + v * 2) * 0.9 + np.sin(u * 7 - v * 5) * 0.5 + np.sin(u * 13 + v * 11) * 0.2
strata_wave = np.sin(v * 13 + u * 3 + warp * 0.8)
strata_mask = np.clip(np.sin(u * 2 + v * 3) + np.sin(u * 5 - v * 4) * 0.6 + 0.35, 0.0, 1.0)
strata = np.clip((strata_wave - 0.82) / 0.18, 0.0, 1.0) * strata_mask

# 草甸短笔触：两组高频交叉的窄峰，被低频掩码裁成断续丛簇
tuft_a = np.sin(u * 61 + v * 13 + np.sin(v * 7) * 0.8)
tuft_b = np.sin(v * 53 - u * 17 + np.sin(u * 5) * 0.7)
tuft = np.clip((tuft_a * tuft_b - 0.72) / 0.28, 0.0, 1.0)
tuft *= np.clip(np.sin(u * 3 - v * 2) * 0.5 + 0.6, 0.0, 1.0)

# 低频土痕：让同一张贴图在大尺度上也不均匀
soil = (np.sin(u * 2 + v * 1.7) * 0.5
        + np.sin(u * 3.7 - v * 2.3) * 0.3
        + np.sin(u * 1.3 + v * 4.1) * 0.2)

# 与层理同向的稀疏浅裂，只加深局部，不再织成十字网
crack = np.clip((np.sin(v * 7 - u * 2 + warp * 0.5) - 0.975) / 0.025, 0.0, 1.0)

base = (0.988 + grain * 0.048 + soil * 0.026
        - strata * 0.125 - tuft * 0.048 - crack * 0.038)
base = np.clip(base, 0.74, 1.0)

# 中性灰：乘性遮罩不染色，只改明暗
rgb = np.empty((N, N, 3), dtype=np.uint8)
val = np.round(base * 255).astype(np.uint8)
rgb[..., 0] = val
rgb[..., 1] = val
rgb[..., 2] = val

# 同一份高度场烘法线贴图：np.roll 保证周期可平铺。
# 法线只做细密的光影起伏，不改变顶点色，因此不会把宣纸档弄脏。
strength = 9.0
dx = (np.roll(base, -1, axis=1) - np.roll(base, 1, axis=1)) * strength
dy = (np.roll(base, -1, axis=0) - np.roll(base, 1, axis=0)) * strength
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


size = write_png(OUT, rgb)
normal_out = ROOT + '/public/textures/terrain-normal.png'
size_normal = write_png(normal_out, nrm)

# 四边连续性校验：周期函数应使首尾行/列差异极小
edge = (float(np.abs(rgb[0].astype(int) - rgb[-1].astype(int)).mean()),
        float(np.abs(rgb[:, 0].astype(int) - rgb[:, -1].astype(int)).mean()))

result = {
    'path': OUT,
    'normal_path': normal_out,
    'bytes': size,
    'normal_bytes': size_normal,
    'resolution': [N, N],
    'mean': round(float(base.mean()), 4),
    'min': round(float(base.min()), 4),
    'max': round(float(base.max()), 4),
    'normal_center': [int(nrm[N // 2, N // 2, 0]), int(nrm[N // 2, N // 2, 1]), int(nrm[N // 2, N // 2, 2])],
    'edge_diff': [round(v, 3) for v in edge],
}
