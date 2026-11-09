"""《绍宋》地表树木 —— 在 Blender 内通过 MCP 执行。

替换 world.js 里 pineGeometry()/broadGeometry() 的光滑圆锥与二十面体球。
目标不是照片级 PBR（贴到宣纸沙盘上反而降质），而是让远景林线的轮廓破碎、
近景能看见枝干与层叠冠团，同时维持可实例化的低多边形预算：

  PineA   塔形云杉：6 层锯齿枝盘 + 外伸针梢 + 渐细弯曲主干
  PineB   横展虬松：裸干较高，3 层偏冠团块由斜枝挑出（宋画松意）
  BroadA  伞冠阔叶：三分叉主干托 6 团不规则叶冠
  BroadB  高卵阔叶：窄冠、纵向叠团，与 BroadA 拉开林相差异

约定：
  * 坐标与 three.js 一致（X 左右 / Y 上 / Z 前），export_yup=False。
  * 底部锚在 y=0，总高 1.9~2.2，与原程序化树同尺度，实例化参数无需改动。
  * 顶点色是 sRGB hex → linear 的彩色值（不是灰度明暗），逐面按朝上程度
    调亮，运行时 vertexColors=true + instanceColor 灰度乘子，与城池资产同管线。
  * 每个面独立顶点，便于 flatShading；不用透明贴图，避免排序与 overdraw。

产物：
  assets/shaosong-trees.blend   可编辑源文件
  public/models/trees.glb        PineA / PineB / BroadA / BroadB
"""
import bpy
import math
import os
import random
from mathutils import Vector

ROOT = 'E:/code/game-shaosong'
BLEND = ROOT + '/assets/shaosong-trees.blend'
GLB = ROOT + '/public/models/trees.glb'
for d in (ROOT + '/assets', ROOT + '/public/models'):
    os.makedirs(d, exist_ok=True)


def s2l(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(h, k=1.0):
    return tuple(s2l((h >> s) & 255) * k for s in (16, 8, 0))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, k):
    return tuple(min(1.0, v * k) for v in c)


# 沿用 models.js 里植被的低饱和墨绿／苍青色系，只拉开层次，不引入鲜亮塑料绿
C = {
    'bark': rgb(0x6b543c), 'barkDk': rgb(0x4b3d2c), 'barkLt': rgb(0x8a7050),
    'needleDk': rgb(0x3a5540), 'needle': rgb(0x4d6b4c), 'needleLt': rgb(0x73936a),
    'leafDk': rgb(0x4f7047), 'leaf': rgb(0x6e9460), 'leafLt': rgb(0x8aae76),
    'leafWarm': rgb(0x87975a),
}


class Builder:
    """每个面独立顶点：flatShading 与逐面着色都成立，重跑结果逐字节可复现。"""

    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def tri(self, p0, p1, p2, color):
        b = len(self.v)
        self.v.extend((tuple(p0), tuple(p1), tuple(p2)))
        self.c.extend((color,) * 3)
        self.f.append((b, b + 1, b + 2))

    def quad(self, p0, p1, p2, p3, color):
        b = len(self.v)
        self.v.extend((tuple(p0), tuple(p1), tuple(p2), tuple(p3)))
        self.c.extend((color,) * 4)
        self.f.append((b, b + 1, b + 2, b + 3))


def face_color(p0, p1, p2, dark, light, rnd, bias=0.0):
    """按面法线的朝上程度给冠面上光，再叠一点确定性抖动，避免整树一块死色。"""
    n = (Vector(p1) - Vector(p0)).cross(Vector(p2) - Vector(p0))
    if n.length < 1e-9:
        t = 0.5
    else:
        t = n.normalized().y * 0.55 + 0.48
    t = max(0.0, min(1.0, t + bias + (rnd.random() - 0.5) * 0.20))
    return mix(dark, light, t)


# 正二十面体：20 面足够做一团叶簇，比球更「有笔触」
_T = (1 + math.sqrt(5)) / 2
ICO_V = [(-1, _T, 0), (1, _T, 0), (-1, -_T, 0), (1, -_T, 0),
         (0, -1, _T), (0, 1, _T), (0, -1, -_T), (0, 1, -_T),
         (_T, 0, -1), (_T, 0, 1), (-_T, 0, -1), (-_T, 0, 1)]
ICO_F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
         (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
         (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]


def tube(b, p0, p1, r0, r1, seg, dark, light, rnd, cap=True):
    """任意方向的圆台；上下半径可不同，用于主干、分叉枝与挑出的松枝。"""
    a, c = Vector(p0), Vector(p1)
    d = (c - a).normalized()
    ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    u = d.cross(ref).normalized()
    v = d.cross(u).normalized()
    def ring(center, radius):
        return [center + (u * math.cos(2 * math.pi * i / seg)
                         + v * math.sin(2 * math.pi * i / seg)) * radius
                for i in range(seg)]
    lo, hi = ring(a, r0), ring(c, r1)
    for i in range(seg):
        j = (i + 1) % seg
        col = face_color(lo[i], lo[j], hi[j], dark, light, rnd, bias=-0.10)
        b.quad(lo[i], lo[j], hi[j], hi[i], col)
    if cap:                                   # 顶盖，避免俯视看到空心
        for i in range(seg):
            j = (i + 1) % seg
            b.tri(hi[i], hi[j], c, shade(light, 0.85))


def blob(b, center, radii, dark, light, rnd, wobble=0.22, bias=0.0):
    """不规则叶团：二十面体顶点按固定随机扰动，逐面朝上着色。"""
    pts = []
    for vx, vy, vz in ICO_V:
        n = Vector((vx, vy, vz)).normalized()
        k = 1 - wobble / 2 + rnd.random() * wobble
        pts.append(Vector((n.x * radii[0] * k, n.y * radii[1] * k, n.z * radii[2] * k)))
    o = Vector(center)
    for f in ICO_F:
        p = [o + pts[i] for i in f]
        b.tri(p[0], p[1], p[2], face_color(p[0], p[1], p[2], dark, light, rnd, bias))


def skirt(b, y, r, rise, seg, dark, light, rnd, phase, sprigs=0):
    """一圈锯齿针叶枝盘：内圈收在枝轴上、外圈下垂，边缘半径逐段随机。"""
    outer, inner = [], []
    for i in range(seg):
        ang = 2 * math.pi * i / seg + phase
        rr = r * (0.76 + rnd.random() * 0.34)
        oy = y - (0.04 + rnd.random() * 0.12)
        outer.append(Vector((math.cos(ang) * rr, oy, math.sin(ang) * rr)))
        inner.append(Vector((math.cos(ang) * r * 0.20, y + rise,
                             math.sin(ang) * r * 0.20)))
    for i in range(seg):
        j = (i + 1) % seg
        col = face_color(outer[i], inner[j], outer[j], dark, light, rnd, bias=0.12)
        b.tri(outer[i], inner[j], outer[j], col)
        b.tri(outer[i], inner[i], inner[j], shade(col, 0.82))
        # 每层外缘再挂一道深色檐口：俯视时形成明暗带，枝盘才不会糊成一整只圆锥
        drop = Vector((0, 0.055, 0))
        fringe = mix(dark, C['needleDk'], 0.30)
        b.quad(outer[i], outer[j], outer[j] - drop, outer[i] - drop, fringe)
        # 每隔几段挑出一根针梢，把圆形轮廓打断成毛边
        if sprigs and i % sprigs == 0:
            tang = Vector((-math.sin(2 * math.pi * i / seg + phase), 0,
                           math.cos(2 * math.pi * i / seg + phase)))
            tip = outer[i] + Vector((outer[i].x, 0, outer[i].z)).normalized() * 0.16 \
                  + Vector((0, -0.05, 0))
            w = tang * 0.045
            b.tri(outer[i] - w, tip, outer[i] + w, mix(dark, light, 0.65))


def branch_to(b, start, end, r0, dark, light, rnd, seg=5):
    tube(b, start, end, r0, r0 * 0.45, seg, dark, light, rnd, cap=False)


# ── PineA：塔形云杉，6 层枝盘自下而上收窄 ─────────────────────
def build_pine_a():
    rnd = random.Random(1101)
    b = Builder()
    # 主干略带弯曲，4 段渐细
    knots = [(0, 0, 0), (0.02, 0.55, 0.01), (-0.02, 1.15, 0.03),
             (0.03, 1.64, 0.00), (0.01, 1.94, -0.02)]
    for i in range(len(knots) - 1):
        # 顶段不加封盖：否则棕色木芯会从最上层枝盘里探出一根枯尖
        tube(b, knots[i], knots[i + 1], 0.095 - i * 0.017, 0.095 - (i + 1) * 0.017,
             7, C['barkDk'], C['barkLt'], rnd, cap=False)
    for i in range(6):
        y = 0.34 + i * 0.285
        r = 0.70 * (1 - i / 7.2) ** 0.82 + 0.055
        t = i / 5
        dark = mix(C['needleDk'], C['needle'], t * 0.40)
        light = mix(C['needle'], C['needleLt'], 0.12 + t * 0.42)
        skirt(b, y, r, 0.25 - t * 0.05, 10, dark, light, rnd,
              phase=rnd.random() * 0.6, sprigs=2)
    # 顶芽：四棱小尖盖住主干末端，避免木质芯从冠顶探出（单三角片侧看会消失）
    apex = (0.01, 2.22, -0.02)
    ring = [(0.13 * math.cos(2 * math.pi * i / 4), 1.92,
             0.13 * math.sin(2 * math.pi * i / 4)) for i in range(4)]
    for i in range(4):
        b.tri(ring[i], ring[(i + 1) % 4], apex,
              mix(C['needle'], C['needleLt'], 0.55 + i * 0.08))
    return b


# ── PineB：横展虬松，裸干高、团块偏冠 ─────────────────────────
def build_pine_b():
    rnd = random.Random(2202)
    b = Builder()
    knots = [(0, 0, 0), (0.10, 0.52, 0.02), (0.20, 1.02, -0.04),
             (0.27, 1.52, -0.02), (0.24, 1.92, 0.03)]
    for i in range(len(knots) - 1):
        tube(b, knots[i], knots[i + 1], 0.105 - i * 0.016, 0.105 - (i + 1) * 0.016,
             7, C['barkDk'], C['barkLt'], rnd, cap=False)
    for layer, (y, spread, count) in enumerate([(1.12, 0.74, 3), (1.48, 0.62, 3), (1.80, 0.44, 2)]):
        for k in range(count):
            ang = 2 * math.pi * k / count + layer * 0.85 + rnd.random() * 0.35
            rr = spread * (0.78 + rnd.random() * 0.35)
            cy = y + (rnd.random() - 0.5) * 0.14
            cx, cz = math.cos(ang) * rr, math.sin(ang) * rr
            center = (0.24 + cx, cy, cz)
            branch_to(b, (0.22, y - 0.24, 0), center, 0.035,
                      C['barkDk'], C['bark'], rnd)
            blob(b, center, (0.30 + rnd.random() * 0.08, 0.17, 0.28 + rnd.random() * 0.08),
                 C['needleDk'], mix(C['needle'], C['needleLt'], 0.55), rnd, wobble=0.32, bias=0.0)
    blob(b, (0.24, 2.00, 0.02), (0.22, 0.20, 0.21),
         C['needle'], C['needleLt'], rnd, wobble=0.30)
    return b


# ── BroadA：伞冠阔叶 ──────────────────────────────────────────
def build_broad_a():
    rnd = random.Random(3303)
    b = Builder()
    tube(b, (0, 0, 0), (0.04, 0.96, 0.02), 0.105, 0.068, 7,
         C['barkDk'], C['barkLt'], rnd, cap=False)
    tips = [(-0.38, 1.33, 0.16), (0.40, 1.27, -0.18), (0.05, 1.42, 0.38)]
    for t in tips:
        branch_to(b, (0.03, 0.82, 0.01), t, 0.055, C['barkDk'], C['bark'], rnd)
    crowns = [(-0.46, 1.52, 0.18, 0.40), (0.48, 1.48, -0.20, 0.42),
              (0.04, 1.60, 0.44, 0.38), (-0.16, 1.72, -0.34, 0.36),
              (0.24, 1.78, 0.10, 0.38), (-0.02, 1.92, 0.02, 0.32)]
    for x, y, z, r in crowns:
        blob(b, (x, y, z), (r, r * 0.72, r * 0.92),
             C['leafDk'], C['leafLt'], rnd, wobble=0.30, bias=0.0)
    return b


# ── BroadB：高卵冠阔叶，秋意微暖但不过饱和 ─────────────────────
def build_broad_b():
    rnd = random.Random(4404)
    b = Builder()
    tube(b, (0, 0, 0), (-0.03, 1.12, 0.02), 0.095, 0.055, 7,
         C['barkDk'], C['barkLt'], rnd, cap=False)
    for t in [(-0.20, 1.38, 0.10), (0.22, 1.46, -0.12)]:
        branch_to(b, (-0.02, 0.98, 0.01), t, 0.045, C['barkDk'], C['bark'], rnd)
    crowns = [(-0.24, 1.34, 0.08, 0.34), (0.26, 1.46, -0.12, 0.33),
              (-0.12, 1.68, 0.14, 0.32), (0.14, 1.84, -0.08, 0.29),
              (0.00, 2.00, 0.02, 0.24)]
    for i, (x, y, z, r) in enumerate(crowns):
        blob(b, (x, y, z), (r, r * 1.02, r * 0.88),
             C['leafDk'], mix(C['leafLt'], C['leafWarm'], 0.35 + i * 0.06),
             rnd, wobble=0.28, bias=0.0)
    return b


BUILDERS = {
    'PineA': build_pine_a(), 'PineB': build_pine_b(),
    'BroadA': build_broad_a(), 'BroadB': build_broad_b(),
}


def purge_tree_datablocks():
    """重跑时清掉同名对象与孤儿 mesh，避免 glTF 里出现 PineA.001 之类的名字。"""
    prefixes = ('PineA', 'PineB', 'BroadA', 'BroadB')
    for o in list(bpy.data.objects):
        if o.name.startswith(prefixes):
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.name.startswith(prefixes) and m.users == 0:
            bpy.data.meshes.remove(m)


# 本次 .blend 只保留树木：清掉场景里其它资产对象，但不删它们的 datablock
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
purge_tree_datablocks()


def make_object(name, builder):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(builder.v, [], builder.f)
    mesh.update()
    attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for i, col in enumerate(builder.c):
        attr.data[i].color = (col[0], col[1], col[2], 1.0)
    mesh.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


objs = [make_object(name, bld) for name, bld in BUILDERS.items()]
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]

props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
kwargs = {
    'filepath': GLB, 'export_format': 'GLB', 'use_selection': True,
    'export_yup': False, 'export_apply': True,
    'export_animations': False, 'export_cameras': False, 'export_lights': False,
    'export_tangents': False, 'export_colors': True, 'export_normals': True,
}
kwargs = {k: v for k, v in kwargs.items() if k in props}
bpy.ops.export_scene.gltf(**kwargs)

result = {
    'blend': BLEND, 'glb': GLB,
    'glb_bytes': os.path.getsize(GLB) if os.path.exists(GLB) else 0,
    'export_kwargs': sorted(kwargs.keys()),
    'meshes': {
        name: {'verts': len(bld.v), 'faces': len(bld.f),
               'tris': sum(len(f) - 2 for f in bld.f)}
        for name, bld in BUILDERS.items()
    },
}
