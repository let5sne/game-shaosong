/**
 * 开场页「场景地图选择」的展示主题。
 *
 * 纯展示数据：不参与 rules.js 的任何判定，不写回 GameState，也不进存档。
 * 一个 theme = 一组可选的光色预设 + 一个镜头机位 + 一组朱批目标城 + 一段题词。
 * world.applyTheme() 先快照当前场景光色，clearTheme() 精确还原，因此
 * classic / paper / real 三档地貌与 high / low 性能档都能安全叠加、随时退出。
 *
 * light 缺省字段表示「沿用当前档默认值」。campaign 的 light 恒为 null：
 * 长局开场页保持用户偏好的清透宣纸底色，一点不加料；季节光色只属于短剧本。
 */
export const SCENE_IDS = Object.freeze(['campaign', 'qinghe', 'shunchang', 'yancheng']);

/** 机位与 terrain 无关；数值均落在 OrbitControls 的 minDistance=34 / maxDistance=185 内。 */
export const DEFAULT_CAMERA_POSE = Object.freeze({
  position: [6, 84, 96], target: [0, 0, -3], fov: 46,
});

export const SCENE_THEMES = Object.freeze({
  campaign: {
    id: 'campaign', name: '北伐长局', tag: '全图 · 三档国势',
    era: '建炎 · 春', season: '春', accent: '#b9924c',
    poem: '江左一隅，北望中原',
    brief: '行在初定，诸军未集。整军、筹粮、平朝议，在金人再度南下之前，把版籍一寸一寸收回来。',
    pose: DEFAULT_CAMERA_POSE,
    marks: [],
    light: null,
  },
  qinghe: {
    id: 'qinghe', name: '清河烽火', tag: '守 · 九回合',
    era: '北宋末年 · 秋', season: '秋', accent: '#8a6d3b',
    poem: '携械坠世，婴寨自守',
    brief: '现代五人小队全员携械，坠入烽烟四起的西北边地。守住清河边寨九轮；若有余力反手破寨，便是大捷。',
    // 西北角镜头：清河（长安）与蕃寨（洛阳）同框
    pose: Object.freeze({ position: [-2, 44, 22], target: [-28, 0, -15], fov: 44 }),
    marks: Object.freeze(['changan', 'luoyang']),
    // 秦陇秋深：风沙微黄、天光干暖，衬出边地烽燧的苍莽
    light: Object.freeze({
      sky: 0xe6dbc6, fogScale: 1.02,
      sunColor: 0xffd8a8, sunMul: 1.06, sunPos: [-48, 40, 30],
      hemi: [0xf2e7cd, 0x6f604a], ambientMul: 0.96,
      exposure: 1.28,
    }),
  },
  shunchang: {
    id: 'shunchang', name: '顺昌婴城', tag: '守 · 九回合',
    era: '绍兴十年 · 夏', season: '夏', accent: '#5f8a72',
    poem: '凿舟沉之，示无去意',
    brief: '金人毁盟南下，刘锜以八字军赴东京留守，行至顺昌而敌骑已薄城下。婴城拒骑，撑过九轮猛攻。',
    pose: Object.freeze({ position: [18, 46, 48], target: [8, 0, 6], fov: 42 }),
    marks: Object.freeze(['shouchun', 'chuzhou', 'haizhou']),
    // 淮上盛夏：天光偏冷青、湿雾收近、日头稍柔，衬出「孤城拒骑」的闷压感
    light: Object.freeze({
      sky: 0xdfe7dc, fogScale: 0.86,
      sunColor: 0xf1f5dc, sunMul: 0.88,
      hemi: [0xe9f0e2, 0x596b52], ambientMul: 1.04,
      exposure: 1.24,
    }),
  },
  yancheng: {
    id: 'yancheng', name: '郾城破阵', tag: '攻 · 十二回合',
    era: '绍兴十年 · 秋', season: '秋', accent: '#b8663c',
    poem: '背嵬步阵，直抵朱仙',
    brief: '岳家军进至郾城一带，金人以铁浮图、拐子马合围。平地无险可依，唯硬撼之，十二回合内断开封东南两翼。',
    pose: Object.freeze({ position: [26, 52, 42], target: [10, 0, 0], fov: 44 }),
    marks: Object.freeze(['caizhou', 'yingtian', 'xuzhou', 'shouchun']),
    // 中原秋日：低角度暖阳拉长坡影、天色转赭，与宣纸底形成季节反差
    light: Object.freeze({
      sky: 0xeadfc4, fogScale: 0.94,
      sunColor: 0xffd6a0, sunMul: 1.08, sunPos: [-64, 44, 38],
      hemi: [0xfff0d6, 0x7a6a4a], ambientMul: 0.94,
      exposure: 1.30,
    }),
  },
});

/** 未知 id 一律回长局，避免链接参数注入把开场页带到不存在的主题。 */
export function sceneTheme(id) {
  return SCENE_THEMES[id] || SCENE_THEMES.campaign;
}
