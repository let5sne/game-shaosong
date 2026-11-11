/**
 * 统一配置层：把散落在 URL 参数与 localStorage 里的开关收拢到一张声明表。
 * 纯数据、无 DOM 依赖，可在 Node 中单测；渲染／UI 层只消费 derive() 的结果。
 *
 * 优先级：URL 显式参数 > 已保存偏好 > 出厂默认。
 * 「链接指定」的项会被如实标注来源，避免用户改了设置却被 URL 悄悄覆盖。
 * 历史 URL 参数全部保留语义（?tex=1 双开、?ctex=1 只开城池、?units=0 …），
 * 设置面板写回时会自动补上显式相反的开关，使链接仍可分享复现。
 */
import { DIFFICULTIES, SCENARIOS, findScenario } from './data.js';

// 分支版独立命名空间：与《绍宋》本尊同源同端口部署时，存档与偏好互不踩踏
export const STORE_KEY = 'chixie.settings';
/** 设置面板重载后自动续档的一次性标记（sessionStorage，不跨会话） */
export const RESUME_KEY = 'chixie.resume';
export const LEGACY_KEYS = {
  difficulty: 'chixie.difficulty',
  scenario: 'chixie.scenario',
  mute: 'chixie.muted',
};
export const EFFECT_LABEL = { live: '即时', reload: '重载', next: '下局' };
export const SOURCE_LABEL = { url: '链接指定', saved: '已保存', default: '默认' };

const yes = v => v === true || v === '1' || v === 1;
const pick = (v, list) => list.includes(v) ? v : undefined;
const DIFF_IDS = DIFFICULTIES.map(d => d.id);

/** ?tex / ?ctex 是一对历史遗留的联动开关，单独解码会丢语义 */
function texDecode(which) {
  return p => {
    const hasTex = p.has('tex'), hasCtex = p.has('ctex');
    const texOn = hasTex && p.get('tex') === '1';
    const ctexOn = hasCtex && p.get('ctex') === '1';
    if (which === 'ground') {
      if (hasTex) return texOn;
      if (hasCtex) return false;      // ?ctex=1 只开城池
      return undefined;
    }
    if (hasCtex) return ctexOn;
    if (hasTex) return texOn;        // ?tex=1 地表 + 城池
    return undefined;
  };
}

/** 两项一起编码：另一个开关必须显式写 0，否则历史 ?tex=1 会把它隐含打开 */
function texEncode(_self, values) {
  const ground = !!values.ground, city = !!values.city;
  return {
    tex: ground ? '1' : (city ? '0' : null),
    ctex: city ? '1' : (ground ? '0' : null),
  };
}

const legacy = {
  mute: { read: raw => (raw === null ? undefined : yes(raw)), write: v => (v ? '1' : '0') },
  difficulty: { read: raw => pick(raw, DIFF_IDS), write: v => v },
};

/**
 * 配置项 schema。encode(values) 返回 { urlKey: string|null }，null 表示从链接中删除。
 * effect: live=立刻生效 / reload=须重建舆图 / next=下一局生效。
 */
export const SETTING_GROUPS = [
  {
    id: 'visual', title: '观感与资产',
    note: '默认保留清透的宣纸底色、高清树木与材质质感；地貌档、大气透视、寨内近观、宣纸增强、贴图与开场页电影感均为可选项，互不干扰。',
    items: [
      {
        id: 'terrain', label: '地貌精度', type: 'select', default: 'paper', effect: 'reload',
        desc: '高清档加密到 240×208，叠加山脊与侵蚀沟壑、岩体、远山层与地表皴纹／法线；宣纸保留淡彩，写实接近参考图的草甸与裸岩。原味为 120×104 逐面平涂，低配档自动回落。',
        options: [
          { v: 'classic', label: '原味' },
          { v: 'paper', label: '高清·宣纸' },
          { v: 'real', label: '高清·写实' },
        ],
        decode: p => pick(p.get('terrain'), ['classic', 'paper', 'real']),
        // 出厂默认是 paper，链接里省略；选原味或写实才需要显式写，便于分享复现
        encode: v => ({ terrain: v === 'paper' ? null : v }),
      },
      {
        id: 'trees', label: '高清树木', type: 'toggle', default: true, effect: 'reload',
        desc: 'Blender 四套枝干与层叠冠替换圆锥松、球形阔叶；低配档自动沿用程序化树，关掉可回到原版林相。',
        decode: p => (p.has('trees') ? p.get('trees') !== '0' : undefined),
        encode: v => ({ trees: v ? null : '0' }),
      },
      {
        id: 'mat', label: '材质质感', type: 'toggle', default: true, effect: 'reload',
        desc: '地质的草甸／灌丛／岩脊分区与沉积层理、沟壑顶点遮蔽，物件按高度重分配明暗，城池与树木补极淡落地软影。不描边、不压暗底色；低配与原味地貌自动回落。',
        decode: p => (p.has('mat') ? p.get('mat') !== '0' : undefined),
        encode: v => ({ mat: v ? null : '0' }),
      },
      {
        id: 'ink', label: '宣纸增强', type: 'toggle', default: false, effect: 'live',
        desc: '墨晕、描边、纸纹与色调曲线。实机 A/B 后默认关闭，保留清透观感。',
        decode: p => (p.has('ink') ? p.get('ink') === '1' : undefined),
        encode: v => ({ ink: v ? '1' : null }),
      },
      {
        id: 'atmos', label: '大气透视 · 暮色', type: 'toggle', default: false, effect: 'reload',
        desc: '顶点色渐变天穹替代单色背景，太阳方向添一层极淡辉光；暖主光配冷色天光，把坡面分出迎光与背光。不改 shader、不启全屏后处理，仅增 1~2 个 draw call。低角度仰视最为明显，建议与「宣纸增强」二选一；默认关闭以保留清透观感。',
        decode: p => (p.has('atmos') ? p.get('atmos') === '1' : undefined),
        encode: v => ({ atmos: v ? '1' : null }),
      },
      {
        id: 'vista', label: '寨内近观 · 浅水', type: 'toggle', default: false, effect: 'reload',
        desc: '清河关首镜压到寨墙近旁，河面与水陆交界按水深铺出浅沙→浅青→深青的渐变与一道碎浪线，近景再补草花碎石与浮叶。所有增量只在拉近时进入渲染队列，全景机位逐字不变。与「大气透视」的暮色雾感方向相反，建议二选一；默认关闭以保留清透宣纸观感。',
        decode: p => (p.has('vista') ? p.get('vista') === '1' : undefined),
        encode: v => ({ vista: v ? '1' : null }),
      },
      {
        id: 'grade', label: '开场页电影感', type: 'toggle', default: true, effect: 'live',
        desc: '只在择关页生效的宽银幕黑边、四角暗角、宣纸颗粒与卷轴展开／进场合卷；进场后整层撤除，对局画面一点不改。低配与系统「减弱动效」自动跳过运镜。',
        decode: p => (p.has('grade') ? p.get('grade') !== '0' : undefined),
        encode: v => ({ grade: v ? null : '0' }),
      },
      {
        id: 'ground', label: '宣纸地表纸纹', type: 'toggle', default: false, effect: 'reload',
        desc: 'Blender 烘的 512² 可平铺纸浆斑驳，贴在地形上。',
        decode: texDecode('ground'), encode: texEncode,
      },
      {
        id: 'city', label: '城池瓦作／夯土', type: 'toggle', default: false, effect: 'reload',
        desc: '最明显的物体表面细节：图集分带贴出屋顶筒瓦瓦垄、墙面夯土层理，主体与阵营部件全覆盖。极淡的乘性灰度，不会压暗城池。',
        decode: texDecode('city'), encode: texEncode,
      },
      {
        id: 'units', label: '军阵与攻城器具', type: 'toggle', default: true, effect: 'reload',
        desc: 'Blender 低模骑兵替换行军圆锥，重兵之城布置投石机。',
        decode: p => (p.has('units') ? p.get('units') !== '0' : undefined),
        encode: v => ({ units: v ? null : '0' }),
      },
      {
        id: 'capitals', label: '两京主角级增饰', type: 'toggle', default: true, effect: 'reload',
        desc: '开封金黄琉璃、燕京青灰瓦的几何瓦垄与檐口剪边。',
        decode: p => (p.has('capitals') ? p.get('capitals') !== '0' : undefined),
        encode: v => ({ capitals: v ? null : '0' }),
      },
    ],
  },
  {
    id: 'perf', title: '性能与动效',
    note: '低配档降 DPR、关阴影并减植被；软件渲染时像素填充比三角形更吃紧。',
    items: [
      {
        id: 'quality', label: '性能档', type: 'select', default: 'auto', effect: 'reload',
        desc: '自动档按核心数、内存、屏宽与 DPR 判定；手动档可锁定高／低。',
        options: [{ v: 'auto', label: '自动' }, { v: 'high', label: '高' }, { v: 'low', label: '低' }],
        decode: p => pick(p.get('quality'), ['auto', 'high', 'low']),
        encode: v => ({ quality: v === 'auto' ? null : v }),
      },
      {
        id: 'motion', label: '波光与旗面动效', type: 'select', default: 'auto', effect: 'reload',
        desc: '自动档跟随系统「减弱动效」；关闭后海面、旗帜与飞鸟静止。',
        options: [{ v: 'auto', label: '跟随系统' }, { v: 'on', label: '开' }, { v: 'off', label: '关' }],
        decode: p => ({ '0': 'off', '1': 'on', 'auto': 'auto' })[p.get('motion')],
        encode: v => ({ motion: v === 'off' ? '0' : v === 'on' ? '1' : null }),
      },
    ],
  },
  {
    id: 'game', title: '开局与偏好',
    note: '战局、难度与局号决定新局的起点；进行中的局面由存档接续，不受影响。',
    items: [
      {
        id: 'scenario', label: '战局', type: 'select', default: 'campaign', effect: 'next',
        // 战局是「链接级开局指令」，不是本机偏好：开场页的择关记忆键
        // shaosong.scenario 只用于便捷预选，若当成 saved 配置读入，
        // 打开裸链接 ?seed=... 也会被悄悄塞进剧本关（历史实机回归会抓到）。
        // 面板／开场页选择后由 syncUrl 写入 ?scenario=，链接自身就是持久化。
        urlOnly: true,
        desc: '北伐长局或短剧本（清河／顺昌／郾城，固定开局）；链接参数可直接起该关。',
        options: [{ v: 'campaign', label: '北伐长局' }, ...SCENARIOS.map(s => ({ v: s.id, label: s.name }))],
        decode: p => (p.has('scenario') ? (findScenario(p.get('scenario'))?.id ?? 'campaign') : undefined),
        encode: v => ({ scenario: v === 'campaign' ? null : v }),
      },
      {
        id: 'difficulty', label: '国势', type: 'select', default: 'normal', effect: 'next',
        desc: '宽和／本色／艰险，改金军兵势、仓廪、回合上限与开局变局。',
        options: DIFFICULTIES.map(d => ({ v: d.id, label: d.name })),
        storageKey: LEGACY_KEYS.difficulty, legacy: legacy.difficulty,
        decode: p => pick(p.get('difficulty'), DIFF_IDS),
        encode: v => ({ difficulty: v === 'normal' ? null : v }),
      },
      {
        id: 'seed', label: '固定局号', type: 'text', default: '', effect: 'next',
        desc: '留空则每局随机；填正整数可重演同一份变局、战斗与战报。',
        placeholder: '如 123456', pattern: /[^0-9]/g, maxLength: 10,
        decode: p => (p.has('seed') ? p.get('seed') ?? '' : undefined),
        encode: v => ({ seed: v ? String(v) : null }),
      },
      {
        id: 'auto', label: '打开即托管推演', type: 'toggle', default: false, effect: 'reload',
        desc: '载入后由 AI 代为临朝，适合挂机看整局推演与复现。',
        decode: p => (p.has('auto') ? p.get('auto') !== '0' : undefined),
        encode: v => ({ auto: v ? '1' : null }),
      },
      {
        id: 'mute', label: '静音', type: 'toggle', default: false, effect: 'live',
        desc: '关闭全部轻音效；顶栏 ♪ 按钮与此项双向同步。',
        storageKey: LEGACY_KEYS.mute, legacy: legacy.mute,
        decode: p => (p.has('mute') ? p.get('mute') === '1' : undefined),
        encode: v => ({ mute: v ? '1' : null }),
      },
      {
        id: 'economy', label: '治略 · 经营养成', type: 'toggle', default: false, effect: 'live',
        desc: '模拟经营＋RPG 扩展：州郡可营建屯田／仓廪／军器作坊／市舶（各 3 级），八员将领可差遣历练、升级解锁专属战法。营建与差遣都占政令，与北伐争同一份资源。默认关闭以守住固定局号的胜率基线；即时开关，关闭只冻结、不丢进度。',
        decode: p => (p.has('economy') ? p.get('economy') === '1' : undefined),
        encode: v => ({ economy: v ? '1' : null }),
      },
    ],
  },
];

export const SETTING_ITEMS = SETTING_GROUPS.flatMap(g => g.items.map(it => ({ ...it, group: g.id })));
const BY_ID = new Map(SETTING_ITEMS.map(it => [it.id, it]));
export const settingById = id => BY_ID.get(id);
export const knownUrlKeys = [...new Set(SETTING_ITEMS.flatMap(it => Object.keys(it.encode(it.default, sampleValues()) || {})))];

function sampleValues() {
  const v = {};
  for (const it of SETTING_ITEMS) v[it.id] = it.default;
  return v;
}

function safeStore(storage) {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch (_) { return null; }
}
function readMainStore(store) {
  if (!store) return {};
  try { const o = JSON.parse(store.getItem(STORE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; }
  catch (_) { return {}; }
}
function coerce(it, v) {
  if (it.type === 'toggle') return !!v;
  if (it.type === 'select') return it.options.some(o => o.v === v) ? v : it.default;
  if (it.type === 'text') return String(v ?? '').replace(it.pattern || /[^0-9]/g, '').slice(0, it.maxLength || 10);
  return v;
}

/** 读取一份完整配置：values 为生效值，sources 标注每一项来自哪里。 */
export function readSettings(search = '', storage) {
  const p = new URLSearchParams(search);
  const store = safeStore(storage);
  const main = readMainStore(store);
  const values = {}, sources = {};
  for (const it of SETTING_ITEMS) {
    let raw = it.decode(p);
    let src = 'url';
    // urlOnly 项只认链接，不读本机偏好；其余按「链接 > 已保存 > 默认」回落
    if (raw === undefined && !it.urlOnly) {
      raw = it.storageKey
        ? (it.legacy?.read(store?.getItem(it.storageKey) ?? null))
        : main[it.id];
      src = 'saved';
    }
    if (raw === undefined || raw === null) { raw = it.default; src = 'default'; }
    values[it.id] = coerce(it, raw);
    sources[it.id] = src;
  }
  return { values, sources, params: p };
}

/**
 * 活的配置对象：main.js 与 ui.js 共享同一份 values/sources，
 * 设置面板改动后各处（含调试入口）立刻看到最新值。
 * URL 同步由 UI 调 applyUrl 完成，此处只管偏好持久化。
 */
export function createSettings(search = '', storage) {
  const { values, sources } = readSettings(search, storage);
  const store = safeStore(storage);
  return {
    values, sources,
    set(id, value) {
      const it = settingById(id);
      if (!it) return undefined;
      const v = coerce(it, value);
      values[id] = v;
      // urlOnly 项由调用方 syncUrl 写进链接，来源就是「链接指定」
      sources[id] = it.urlOnly ? 'url' : 'saved';
      writeSetting(id, v, store);
      return v;
    },
    reset() {
      resetSettings(store);
      for (const it of SETTING_ITEMS) {
        values[it.id] = it.default;
        sources[it.id] = 'default';
      }
    },
    search(base = '') { return encodeSearch(values, base); },
  };
}

/** 写入单项偏好；legacyKey 项沿用 ui.js 既有的存储键，避免两份真源。 */
export function writeSetting(id, value, storage) {
  const it = settingById(id);
  if (!it || it.urlOnly) return;              // 链接级项不落盘，避免下次裸链接被劫持
  const store = safeStore(storage);
  if (!store) return;
  const v = coerce(it, value);
  try {
    if (it.storageKey) store.setItem(it.storageKey, it.legacy.write(v));
    else {
      const main = readMainStore(store);
      main[id] = v;
      store.setItem(STORE_KEY, JSON.stringify(main));
    }
  } catch (_) { /* 隐私模式：仅本次会话生效 */ }
}

/** 清空全部偏好（含 ui.js 的三个旧键），回到出厂默认。 */
export function resetSettings(storage) {
  const store = safeStore(storage);
  if (!store) return;
  try {
    store.removeItem(STORE_KEY);
    for (const k of Object.values(LEGACY_KEYS)) store.removeItem(k);
  } catch (_) { /* 隐私模式 */ }
}

/** 把当前配置编码进链接，保留无关的查询参数（如未来新增的调试参数）。 */
export function encodeSearch(values, baseSearch = '') {
  const p = new URLSearchParams(baseSearch);
  for (const it of SETTING_ITEMS) {
    // 大多数项只关心自身取值；tex/ctex 是一对联动开关，需要整份 values 才能编码。
    const entries = it.encode(values[it.id], values) || {};
    for (const [k, v] of Object.entries(entries)) {
      if (v === null || v === undefined) p.delete(k);
      else p.set(k, String(v));
    }
  }
  return p.toString();
}
export function applyUrl(values, href) {
  const u = new URL(href);
  u.search = encodeSearch(values, u.search);
  return u.href;
}

/**
 * 派生出 main.js / world.js 真正需要的老字段。
 * env: { systemReducedMotion, autoQuality }
 */
export function derive(values, env = {}) {
  const n = Number(values.seed);
  return {
    quality: values.quality === 'auto' ? (env.autoQuality || 'high') : values.quality,
    reducedMotion: values.motion === 'on' ? false
      : values.motion === 'off' ? true : !!env.systemReducedMotion,
    ink: !!values.ink,
    atmos: !!values.atmos,
    vista: !!values.vista,
    economy: !!values.economy,
    grade: values.grade !== false,
    mat: !!values.mat,
    trees: !!values.trees,
    terrain: ['classic', 'paper', 'real'].includes(values.terrain) ? values.terrain : 'classic',
    tex: !!values.ground,
    ctex: !!values.city,
    units: !!values.units,
    capitals: !!values.capitals,
    seed: values.seed && Number.isFinite(n) && n > 0 ? n >>> 0 : null,
    scenario: values.scenario === 'campaign' ? null : values.scenario,
    auto: !!values.auto,
    muted: !!values.mute,
    difficulty: values.difficulty,
  };
}
