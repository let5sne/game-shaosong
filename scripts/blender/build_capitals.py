"""《绍宋》两京主角级增饰 —— 在 Blender 内通过 MCP 执行。

思路：不重做城池、不替换基座。严格照抄 models.js 中 roofGeo() 的
「举折 t^1.45 + 角翘 (1-t)^2.6」曲面公式，在现有重檐屋面上外扩叠一层
几何筒瓦垄、檐口剪边与瓦当，再于上檐正脊中央加宝顶。
不补斗栱、不加城外仪仗：程序化城楼柱顶与下檐之间只有 0.04 空隙，
任何檐下构件都会穿透屋面；城外物件则会在沙盘上显得悬空。
两京差异由瓦色（金黄琉璃／青灰）与瓦垄密度（16／12 条）体现。
因此与程序化城池精确贴合、不穿模，24 城合批与名牌／圆环语义完全不动。

坐标：与 three 一致（X 左右 / Y 上 / Z 前），export_yup=False。
顶点色：sRGB hex → linear 后写入（three 的 ColorManagement 同样处理 hex），
运行时材质 vertexColors=true、color=白，直接与现有城池配色对齐。

产物：
  assets/shaosong-capitals.blend   可编辑源文件
  public/models/capitals.glb       Kaifeng（东京开封）+ Yanjing（燕京）
"""
import bpy
import math
import os

ROOT = 'E:/code/game-shaosong'
BLEND = ROOT + '/assets/shaosong-capitals.blend'
GLB = ROOT + '/public/models/capitals.glb'
os.makedirs(ROOT + '/assets', exist_ok=True)
os.makedirs(ROOT + '/public/models', exist_ok=True)

# ── 与 models.js 中 C 常量一致的配色 ──
def s2l(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgb(h, k=1.0):
    return tuple(s2l((h >> s) & 255) * k for s in (16, 8, 0))

C = {
    'stone': 0xd8cbaa, 'stoneDk': 0xb8a986, 'wall': 0xc4b393,
    'wood': 0x9c3b2e, 'woodDk': 0x6f2c23,
    'roof': 0x6b7772, 'roofAlt': 0x9b8454,
    'trim': 0xc9a763, 'lattice': 0xe0d3b2,
}

# ── tier 2（两京）城楼的精确参数，逐项对应 buildCityGeometry(2) ──
HALF = 2.02
BASE_TOP, WALL_H = 0.42, 1.16
WALL_TOP = BASE_TOP + WALL_H                 # 1.58
TW2 = HALF * 1.02                           # 2.0604
DECK_Y = WALL_TOP + 0.02                    # 1.60
COL_H, COL_X = 1.24, TW2 * 0.70
LOWER_Y = DECK_Y + COL_H + 0.04             # 2.88
LW = TW2 * 1.52                             # 下檐宽
UP_Y = LOWER_Y + 0.88                       # 3.76
UW = TW2 * 1.16                             # 上檐宽
UP_ROOF_Y = UP_Y + 0.56                     # 4.32


class Builder:
    """每个面独立顶点，便于 flatShading 与逐面顶点色。"""

    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def quad(self, p0, p1, p2, p3, color):
        b = len(self.v)
        self.v.extend((p0, p1, p2, p3))
        self.c.extend((color,) * 4)
        self.f.append((b, b + 1, b + 2, b + 3))

    def tri(self, p0, p1, p2, color):
        b = len(self.v)
        self.v.extend((p0, p1, p2))
        self.c.extend((color,) * 3)
        self.f.append((b, b + 1, b + 2))

    def box(self, center, size, color, ry=0.0):
        x, y, z = center
        sx, sy, sz = (v / 2 for v in size)
        corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                   (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
        pts = []
        for dx, dy, dz in corners:
            px, pz = dx * sx, dz * sz
            if ry:
                cs, sn = math.cos(ry), math.sin(ry)
                px, pz = px * cs + pz * sn, -px * sn + pz * cs
            pts.append((x + px, y + dy * sy, z + pz))
        for f in ((4, 5, 6, 7), (1, 0, 3, 2), (5, 1, 2, 6),
                  (0, 4, 7, 3), (3, 7, 6, 2), (0, 1, 5, 4)):
            q = [pts[i] for i in f]
            self.quad(q[0], q[1], q[2], q[3], color)

    def cone(self, center, r, h, color, seg=4):
        x, y, z = center
        apex = (x, y + h / 2, z)
        ring = [(x + r * math.cos(2 * math.pi * i / seg), y - h / 2,
                 z + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        for i in range(seg):
            self.tri(ring[i], apex, ring[(i + 1) % seg], color)

    def tube(self, points, r, color, seg=5):
        """沿折线生成无端盖细管（筒瓦垄／檐口剪边）。"""
        def norm(a):
            L = math.sqrt(sum(t * t for t in a)) or 1.0
            return tuple(t / L for t in a)
        def cross(a, b):
            return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                    a[0] * b[1] - a[1] * b[0])
        ang = [2 * math.pi * k / seg for k in range(seg)]
        for i in range(len(points) - 1):
            p0, p1 = points[i], points[i + 1]
            t = norm((p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]))
            ref = (0, 1, 0) if abs(t[1]) < 0.9 else (1, 0, 0)
            u = norm(cross(t, ref))
            v = cross(t, u)
            r0 = [tuple(p0[j] + r * (math.cos(a) * u[j] + math.sin(a) * v[j]) for j in range(3)) for a in ang]
            r1 = [tuple(p1[j] + r * (math.cos(a) * u[j] + math.sin(a) * v[j]) for j in range(3)) for a in ang]
            for k in range(seg):
                k2 = (k + 1) % seg
                self.quad(r0[k], r0[k2], r1[k2], r1[k], color)


def roof_point(t, s, w, d, h, over, upturn, ridge_w, oy):
    """照抄 roofGeo() 的 pt()，返回局部坐标（含 oy 基准高度）。"""
    N = 10
    seg = int(s // N)
    f = (s % N) / N
    if seg == 0:
        u, v = -1 + 2 * f, -1
    elif seg == 1:
        u, v = 1, -1 + 2 * f
    elif seg == 2:
        u, v = 1 - 2 * f, 1
    else:
        u, v = -1, 1 - 2 * f
    ease = t ** 0.92
    hw = (w / 2 + over) * (1 - ease) + (ridge_w / 2) * ease
    hd = (d / 2 + over) * (1 - ease) + 0.055 * ease
    cw = abs(u) ** 4 + abs(v) ** 4
    corner = max(0.0, min(1.0, cw - 1))
    flare = 1 + 0.11 * corner * (1 - t) ** 2
    x = u * hw * flare
    z = v * hd * flare
    y = oy + h * t ** 1.45 + upturn * corner * max(0.0, 1 - t) ** 2.6
    return (x, y, z)


def add_roof_detail(b, w, h, oy, over, upturn, tile_hex, ridge_count=14):
    """在既有屋面上叠一层几何筒瓦垄 + 檐口剪边 + 瓦当。"""
    P, ridge_w = 40, w * 0.34
    lift = 0.020                      # 沿 Y 外扩，避免与程序化屋面 z-fighting
    for k in range(ridge_count):
        s = (k + 0.5) * P / ridge_count
        pts = []
        for q in range(7):
            t = 0.06 + 0.88 * q / 6
            x, y, z = roof_point(t, s, w, w, h, over, upturn, ridge_w, oy)
            pts.append((x, y + lift, z))
        # 筒瓦／板瓦交替的明暗，读作一道道瓦垄而非均匀条纹
        shade = 1.06 if k % 2 == 0 else 0.90
        b.tube(pts, 0.026, rgb(tile_hex, shade), seg=5)
        # 檐口瓦当：每垄一个亮头
        x, y, z = pts[0]
        b.box((x, y - 0.005, z), (0.070, 0.055, 0.070), rgb(C['trim'], 0.86))
    # 檐口剪边：沿周长一圈细亮的滴水线
    edge = []
    for j in range(0, P + 1, 2):
        x, y, z = roof_point(0.025, j % P, w, w, h, over, upturn, ridge_w, oy)
        edge.append((x, y + 0.012, z))
    b.tube(edge, 0.018, rgb(C['trim'], 0.80), seg=4)


def add_finial(b, hex_trim):
    """上檐正脊中央宝顶（现有 ridgeParts 只在两端放鸱吻，中央留空）。"""
    y = UP_Y + 1.51 + 0.18
    b.box((0, y, 0), (0.30, 0.09, 0.30), rgb(hex_trim, 0.82))
    b.box((0, y + 0.13, 0), (0.16, 0.18, 0.16), rgb(hex_trim))
    b.cone((0, y + 0.32, 0), 0.11, 0.28, rgb(hex_trim, 1.12), seg=6)


def build_kaifeng():
    """东京开封：金黄琉璃瓦、较密的瓦垄（16 条）与金宝顶。"""
    b = Builder()
    add_roof_detail(b, LW, 0.80, LOWER_Y, 0.20, 0.30, C['roofAlt'], ridge_count=16)
    add_roof_detail(b, UW, 0.95, UP_ROOF_Y, 0.18, 0.34, C['roofAlt'], ridge_count=16)
    add_finial(b, C['trim'])
    return b


def build_yanjing():
    """燕京：青灰瓦、较疏的瓦垄（12 条）与石色宝顶（北方重城防气象）。"""
    b = Builder()
    add_roof_detail(b, LW, 0.80, LOWER_Y, 0.20, 0.30, C['roof'], ridge_count=12)
    add_roof_detail(b, UW, 0.95, UP_ROOF_Y, 0.18, 0.34, C['roof'], ridge_count=12)
    add_finial(b, C['stone'])
    return b


def make_object(name, builder):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
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


def purge_capital_datablocks():
    """重跑脚本时清掉旧对象与孤儿 mesh 数据块。

    Blender 的 datablock 名全局唯一：若只删对象不删同名 mesh，
    下次 bpy.data.meshes.new() 会得到 'Kaifeng.001'，而 glTF 的
    meshes[].name 取自 mesh 数据块名，前端按名取网格就会静默回退。
    """
    prefixes = ('Kaifeng', 'Yanjing')
    for o in list(bpy.data.objects):
        if o.name.startswith(prefixes):
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.name.startswith(prefixes) and m.users == 0:
            bpy.data.meshes.remove(m)


purge_capital_datablocks()
K, Y = build_kaifeng(), build_yanjing()
objs = [make_object('Kaifeng', K), make_object('Yanjing', Y)]
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
    'meshes': {
        'Kaifeng': {'verts': len(K.v), 'faces': len(K.f), 'tris': sum(len(f) - 2 for f in K.f)},
        'Yanjing': {'verts': len(Y.v), 'faces': len(Y.f), 'tris': sum(len(f) - 2 for f in Y.f)},
    },
    'anchors': {'lowerY': LOWER_Y, 'upperRoofY': UP_ROOF_Y, 'wallTop': WALL_TOP},
}
