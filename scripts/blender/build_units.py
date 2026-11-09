"""《绍宋》三维资产建模 —— 在 Blender 内通过 MCP 执行。

坐标约定：与 three.js 一致（X 左右 / Y 向上 / Z 为前进方向），
故导出 glTF 时设 export_yup=False，顶点原样进入 three 场景。
顶点色只写灰度明暗，运行时由材质乘上宋／金阵营色。

产物：
  assets/shaosong-units.blend   可编辑源文件
  public/models/units.glb       Rider（骑兵）+ Siege（投石机）
"""
import bpy
import math
import os

ROOT = 'E:/code/game-shaosong'
BLEND = ROOT + '/assets/shaosong-units.blend'
GLB = ROOT + '/public/models/units.glb'
for d in (ROOT + '/assets', ROOT + '/public/models', ROOT + '/public/textures'):
    os.makedirs(d, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


class Builder:
    """所有部件独立顶点，便于 flatShading 与逐面明暗。"""

    def __init__(self):
        self.v = []
        self.f = []
        self.c = []

    def box(self, center, size, shade, rx=0.0, ry=0.0):
        x, y, z = center
        sx, sy, sz = (v / 2 for v in size)
        corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                   (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
        pts = []
        for dx, dy, dz in corners:
            px, py, pz = dx * sx, dy * sy, dz * sz
            if rx:
                cs, sn = math.cos(rx), math.sin(rx)
                py, pz = py * cs - pz * sn, py * sn + pz * cs
            if ry:
                cs, sn = math.cos(ry), math.sin(ry)
                px, pz = px * cs + pz * sn, -px * sn + pz * cs
            pts.append((x + px, y + py, z + pz))
        faces = [(4, 5, 6, 7), (1, 0, 3, 2), (5, 1, 2, 6),
                 (0, 4, 7, 3), (3, 7, 6, 2), (0, 1, 5, 4)]
        for f in faces:
            b = len(self.v)
            for i in f:
                self.v.append(pts[i])
                self.c.append(shade)
            self.f.append((b, b + 1, b + 2, b + 3))

    def cone(self, center, r, h, shade, seg=4):
        x, y, z = center
        apex = (x, y + h / 2, z)
        ring = [(x + r * math.cos(2 * math.pi * i / seg), y - h / 2,
                 z + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        for i in range(seg):
            j = (i + 1) % seg
            b = len(self.v)
            self.v.extend([ring[i], apex, ring[j]])
            self.c.extend([shade] * 3)
            self.f.append((b, b + 1, b + 2))


# ── 骑兵：马 + 甲士 + 长枪，朝 +Z ──────────────────────────────
r = Builder()
r.box((0, 0.56, 0.00), (0.40, 0.34, 0.90), 0.80)       # 马身
r.box((0, 0.54, 0.38), (0.42, 0.36, 0.22), 0.85)       # 前胸
r.box((0, 0.75, 0.46), (0.24, 0.40, 0.24), 0.86, rx=-0.48)  # 颈
r.box((0, 0.94, 0.66), (0.22, 0.20, 0.36), 0.92)       # 头
r.box((0, 0.87, 0.85), (0.18, 0.10, 0.10), 0.70)       # 口
for s in (-1, 1):
    r.cone((s * 0.08, 1.10, 0.56), 0.045, 0.16, 0.72)  # 双耳
for sx in (-1, 1):
    for sz in (-1, 1):
        r.box((sx * 0.14, 0.25, sz * 0.30), (0.10, 0.48, 0.12), 0.68)
        r.box((sx * 0.14, 0.045, sz * 0.30 + 0.02), (0.12, 0.09, 0.16), 0.50)
r.box((0, 0.64, -0.52), (0.10, 0.30, 0.16), 0.60, rx=0.42)   # 马尾
r.box((0, 0.76, -0.04), (0.46, 0.10, 0.44), 0.56)            # 鞍
for s in (-1, 1):
    r.box((s * 0.21, 0.68, 0.02), (0.10, 0.30, 0.16), 0.74)  # 骑手腿
r.box((0, 1.03, -0.02), (0.32, 0.42, 0.24), 0.95)            # 甲胄
for s in (-1, 1):
    r.box((s * 0.20, 1.17, -0.02), (0.12, 0.14, 0.26), 1.00)  # 肩甲
    r.box((s * 0.22, 0.97, 0.11), (0.09, 0.30, 0.10), 0.86, rx=-0.30)
r.box((0, 1.35, -0.02), (0.20, 0.22, 0.20), 0.98)            # 首
r.cone((0, 1.51, -0.02), 0.15, 0.20, 0.84)                   # 兜鍪
r.cone((0, 1.66, -0.02), 0.05, 0.18, 0.58)                   # 盔缨
r.box((0.24, 1.06, 0.34), (0.035, 0.035, 1.55), 0.76, rx=-0.30)  # 长枪
r.cone((0.24, 1.30, 1.10), 0.07, 0.20, 0.92)                 # 枪尖

# ── 攻城器具：投石机（军阵按兵力择要布置）──────────────────────
g = Builder()
g.box((0, 0.10, 0.00), (0.94, 0.18, 0.84), 0.66)
for s in (-1, 1):
    g.box((s * 0.34, 0.42, 0.00), (0.10, 0.66, 0.10), 0.78)
    g.box((s * 0.30, 0.42, 0.00), (0.07, 0.42, 0.07), 0.88, rx=0.0)
g.box((0, 0.77, 0.00), (0.80, 0.09, 0.09), 0.60)
g.box((0, 0.88, 0.28), (0.09, 0.09, 1.34), 0.86, rx=0.52)
g.box((0, 0.60, -0.48), (0.30, 0.28, 0.28), 0.52)
g.box((0, 1.24, 0.84), (0.18, 0.10, 0.18), 0.70)
for sx in (-1, 1):
    for sz in (-1, 1):
        g.box((sx * 0.42, 0.12, sz * 0.32), (0.09, 0.24, 0.24), 0.55)


def make_object(name, b):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(b.v, [], b.f)
    mesh.update()
    attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for i, s in enumerate(b.c):
        attr.data[i].color = (s, s, s, 1.0)
    mesh.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


objs = [make_object('Rider', r), make_object('Siege', g)]
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]

props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
kwargs = {
    'filepath': GLB,
    'export_format': 'GLB',
    'use_selection': True,
    'export_yup': False,
    'export_apply': True,
    'export_animations': False,
    'export_cameras': False,
    'export_lights': False,
    'export_tangents': False,
}
optional = {'export_colors': True, 'export_normals': True, 'export_extras': False}
for k, v in optional.items():
    if k in props:
        kwargs[k] = v
kwargs = {k: v for k, v in kwargs.items() if k in props}
bpy.ops.export_scene.gltf(**kwargs)

result = {
    'blend': BLEND,
    'glb': GLB,
    'glb_bytes': os.path.getsize(GLB) if os.path.exists(GLB) else 0,
    'export_kwargs': sorted(kwargs.keys()),
    'color_props': sorted(p for p in props if 'color' in p),
    'rider': {'verts': len(r.v), 'faces': len(r.f), 'tris': sum(len(f) - 2 for f in r.f)},
    'siege': {'verts': len(g.v), 'faces': len(g.f), 'tris': sum(len(f) - 2 for f in g.f)},
}
