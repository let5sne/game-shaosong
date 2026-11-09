/**
 * 《持械入宋 · 清河烽火》静态数据
 * 改编自茶根儿小说《持械入宋》设定（现代五人小队携械穿越北宋末年），
 * 地名、朝代名词为历史公有素材，人物形象与文案、事件、数值均为本游戏原创，
 * 非官方衍生作品；正式对外发布须先取得原著改编授权。
 * 引擎与长局结构承自《绍宋 · 建炎北伐》分支基线。
 *
 * 坐标约定：x 向东，z 向南（three.js 世界坐标 XZ 平面）
 */

export const CITY_DEFS = [
  // ── 金国控制 ──────────────────────────────────────────────
  { id: 'yanjing',  name: '燕京',   x:  24, z: -40, owner: 'jin', troops: 10, yieldGrain: 6, terrain: 'mountain', links: ['zhending', 'daming'] },
  { id: 'zhending', name: '真定',   x:   9, z: -31, owner: 'jin', troops:  7, yieldGrain: 5, terrain: 'plain',    links: ['taiyuan', 'daming', 'yanjing'] },
  { id: 'taiyuan',  name: '太原',   x: -13, z: -30, owner: 'jin', troops:  6, yieldGrain: 4, terrain: 'mountain', links: ['zhending', 'luoyang'] },
  { id: 'daming',   name: '大名府', x:  12, z: -21, owner: 'jin', troops:  8, yieldGrain: 7, terrain: 'plain',    links: ['yanjing', 'zhending', 'kaifeng', 'jinan'] },
  { id: 'jinan',    name: '济南',   x:  30, z: -20, owner: 'jin', troops:  5, yieldGrain: 5, terrain: 'plain',    links: ['daming', 'xuzhou'] },
  { id: 'kaifeng',  name: '东京开封', x: 0, z: -12, owner: 'jin', troops: 12, yieldGrain: 9, terrain: 'plain', links: ['daming', 'luoyang', 'yingtian', 'xuzhou', 'caizhou'], capitalOfJin: true },
  { id: 'luoyang',  name: '洛阳',   x: -20, z: -13, owner: 'jin', troops:  6, yieldGrain: 5, terrain: 'mountain', links: ['taiyuan', 'kaifeng', 'changan', 'dengzhou'] },
  { id: 'yingtian', name: '应天府', x:  10, z:  -4, owner: 'jin', troops:  6, yieldGrain: 6, terrain: 'plain',    links: ['kaifeng', 'xuzhou', 'caizhou'] },
  { id: 'xuzhou',   name: '徐州',   x:  19, z:  -1, owner: 'jin', troops:  7, yieldGrain: 6, terrain: 'plain',    links: ['jinan', 'kaifeng', 'yingtian', 'haizhou', 'chuzhou'] },
  { id: 'caizhou',  name: '蔡州',   x:   1, z:   1, owner: 'jin', troops:  5, yieldGrain: 5, terrain: 'plain',    links: ['kaifeng', 'yingtian', 'dengzhou', 'shouchun'] },
  { id: 'dengzhou', name: '邓州',   x: -19, z:  -1, owner: 'jin', troops:  4, yieldGrain: 4, terrain: 'mountain', links: ['luoyang', 'caizhou', 'xiangyang'] },
  { id: 'haizhou',  name: '海州',   x:  31, z:   5, owner: 'jin', troops:  3, yieldGrain: 4, terrain: 'coast',    links: ['xuzhou', 'chuzhou'] },

  // ── 宋国控制 ──────────────────────────────────────────────
  { id: 'changan',  name: '长安',   x: -37, z: -16, owner: 'song', troops: 5, yieldGrain: 5, terrain: 'mountain', links: ['luoyang'] },
  { id: 'xiangyang',name: '襄阳',   x: -17, z:   6, owner: 'song', troops: 6, yieldGrain: 6, terrain: 'river',    links: ['dengzhou', 'ezhou', 'shouchun'] },
  { id: 'shouchun', name: '寿春',   x:   3, z:   8, owner: 'song', troops: 5, yieldGrain: 7, terrain: 'river',    links: ['caizhou', 'xiangyang', 'luzhou', 'chuzhou'] },
  { id: 'chuzhou',  name: '楚州',   x:  21, z:  10, owner: 'song', troops: 5, yieldGrain: 5, terrain: 'river',    links: ['xuzhou', 'haizhou', 'shouchun', 'yangzhou'] },
  { id: 'luzhou',   name: '庐州',   x:   9, z:  16, owner: 'song', troops: 4, yieldGrain: 6, terrain: 'plain',    links: ['shouchun', 'jiankang', 'ezhou'] },
  { id: 'yangzhou', name: '扬州',   x:  19, z:  17, owner: 'song', troops: 5, yieldGrain: 7, terrain: 'river',    links: ['chuzhou', 'zhenjiang', 'jiankang'] },
  { id: 'ezhou',    name: '鄂州',   x: -11, z:  21, owner: 'song', troops: 5, yieldGrain: 6, terrain: 'river',    links: ['xiangyang', 'luzhou', 'jiankang'] },
  { id: 'jiankang', name: '建康',   x:  13, z:  23, owner: 'song', troops: 7, yieldGrain: 8, terrain: 'river',    links: ['luzhou', 'yangzhou', 'ezhou', 'zhenjiang', 'linan'], capitalOfSong: true },
  { id: 'zhenjiang',name: '镇江',   x:  24, z:  22, owner: 'song', troops: 4, yieldGrain: 5, terrain: 'river',    links: ['yangzhou', 'jiankang', 'pingjiang'] },
  { id: 'pingjiang',name: '平江',   x:  31, z:  27, owner: 'song', troops: 4, yieldGrain: 7, terrain: 'coast',    links: ['zhenjiang', 'linan', 'mingzhou'] },
  { id: 'linan',    name: '临安',   x:  22, z:  32, owner: 'song', troops: 8, yieldGrain: 9, terrain: 'coast',    links: ['jiankang', 'pingjiang', 'mingzhou'], seat: true },
  { id: 'mingzhou', name: '明州',   x:  34, z:  34, owner: 'song', troops: 3, yieldGrain: 4, terrain: 'coast',    links: ['pingjiang', 'linan'] },
];

/** 河流：控制点 [x, z]，宽度，名称 */
export const RIVERS = [
  {
    id: 'huanghe', name: '黄河', color: 0xb98c4a, width: 1.5,
    points: [[-48,-20],[-36,-18],[-27,-16],[-19,-15],[-8,-14],[1,-12],[7,-9],[13,-5],[19,-1],[24,4],[31,8],[40,10],[48,11]],
  },
  {
    id: 'huaihe', name: '淮河', color: 0x5c93a8, width: 1.0,
    points: [[-48,6],[-36,7],[-24,8],[-12,8],[-2,8],[5,8],[13,9],[21,10],[29,10],[38,11],[48,12]],
  },
  {
    id: 'changjiang', name: '长江', color: 0x4d86a6, width: 1.8,
    points: [[-48,19],[-36,20],[-25,19],[-16,20],[-7,21],[3,22],[12,23],[20,22],[27,21],[35,22],[42,23],[48,23]],
  },
  {
    id: 'qiantang', name: '钱塘', color: 0x5c93a8, width: 0.7,
    points: [[-48,31],[-30,31],[-8,31],[8,31],[19,32],[28,32],[38,33],[48,33]],
  },
];

/**
 * 渡口官道：两州之间的通路需涉水者。key 为两城 id 排序后以 | 相连。
 * 之所以用显式边表而非几何求交：河流在此是斜向且黄河夺淮，纯几何会
 * 把「楚州→徐州」同时判成渡淮又渡黄，反而失了史地本意。
 */
export const CROSSINGS = {
  'chuzhou|xuzhou': 'huaihe',
  'chuzhou|haizhou': 'huaihe',
  'caizhou|shouchun': 'huaihe',
  'shouchun|xiangyang': 'huaihe',
  'dengzhou|xiangyang': 'huaihe',
  'kaifeng|xuzhou': 'huanghe',
  'caizhou|kaifeng': 'huanghe',
  'kaifeng|yingtian': 'huanghe',
  'luoyang|taiyuan': 'huanghe',
  'changan|luoyang': 'huanghe',
  'jiankang|yangzhou': 'changjiang',
  'jiankang|luzhou': 'changjiang',
  'jiankang|zhenjiang': 'changjiang',
  'ezhou|jiankang': 'changjiang',
  'ezhou|xiangyang': 'changjiang',
  'yangzhou|zhenjiang': 'changjiang',
  'mingzhou|pingjiang': 'qiantang',
};

/** 返回两城之间所渡之河（数据对象），无则 null；与方向无关 */
export function riverBetween(a, b) {
  if (!a || !b) return null;
  const key = [a.id, b.id].sort().join('|');
  const id = CROSSINGS[key];
  return id ? (RIVERS.find(r => r.id === id) || null) : null;
}

/**
 * 名将 / 朝臣：任命一人为都督，提供全局攻势并牵动朝局。
 * art 是「战法」——只在相应地形、渡河、守城、补给等具体情境下生效，
 * 故八人不再只是攻势数字高低：平原用岳飞、水网用韩世忠、山险用吴玠。
 *   terrain  按「目标城地形」给攻势加成
 *   river    减免渡河惩罚的比例（0~1）
 *   defend   全军守势加成
 *   cap      兵额加成   supply 孤军惩罚减免   income 粮赋加成
 */
export const HEROES = [
  {
    id: 'yuefei', name: '岳飞', title: '统制', faction: '主战', martial: 9, politics: 4,
    desc: '治军严整，所部不扰民。背嵬步阵最利于平原决战。', atk: 0.28, morale: 8, zhanDelta: 8,
    art: { short: '步阵', name: '背嵬步阵', desc: '平原攻势 +20%，守势 +4%', terrain: { plain: 0.20, river: 0.06 }, defend: 0.04 },
  },
  {
    id: 'hanshizhong', name: '韩世忠', title: '节度使', faction: '主战', martial: 8, politics: 5,
    desc: '久历行阵，善守淮上。舟师渡水，几无阻滞。', atk: 0.20, morale: 6, zhanDelta: 6,
    art: { short: '水师', name: '淮上水师', desc: '渡河之阻减免 85%，舟师济师 +10%，守势 +10%', terrain: { river: 0.28, coast: 0.12 }, river: 0.85, amphibious: 0.10, defend: 0.10 },
  },
  {
    id: 'liqi', name: '刘锜', title: '都统制', faction: '武将', martial: 8, politics: 3,
    desc: '顺昌城下曾挫金人锐气，善以少击众、婴城固守。', atk: 0.22, morale: 5, zhanDelta: 4,
    art: { short: '城守', name: '顺昌城守', desc: '全军守势 +20%，利于据城挫敌', terrain: { plain: 0.06, river: 0.08 }, defend: 0.20 },
  },
  {
    id: 'wujie', name: '吴玠', title: '经略使', faction: '武将', martial: 7, politics: 5,
    desc: '关陕柱石，据险固守；孤军悬于敌后亦能自持。', atk: 0.16, morale: 6, zhanDelta: 3,
    art: { short: '据险', name: '关陕据险', desc: '山险攻势 +30%，孤军之弊减免 65%，守势 +10%', terrain: { mountain: 0.30 }, defend: 0.10, supply: 0.65 },
  },
  {
    id: 'zhangjun', name: '张俊', title: '节度使', faction: '武将', martial: 6, politics: 7,
    desc: '兵多而骄，用之可壮声势，然耗费粮饷。', atk: 0.12, morale: 2, zhanDelta: 2, upkeep: 3,
    art: { short: '众兵', name: '行营众兵', desc: '各城兵额 +25%，平原小有增益', terrain: { plain: 0.08 }, cap: 0.25 },
  },
  {
    id: 'ligang', name: '李纲', title: '宰相', faction: '主战', martial: 3, politics: 9,
    desc: '主战最力，理政有条，可使朝论归一。', atk: 0.08, morale: 4, zhanDelta: 12, decree: 1,
    art: { short: '庙算', name: '庙堂定算', desc: '守势 +6%，粮赋 +6%，另加一道政令', defend: 0.06, income: 0.06 },
  },
  {
    id: 'zhaoding', name: '赵鼎', title: '参政', faction: '士林', martial: 3, politics: 8,
    desc: '持重老成，能稳民心、丰漕运。粮道虽远亦不匮。', atk: 0.05, morale: 3, zhanDelta: 3, grainBonus: 6,
    art: { short: '漕运', name: '漕运足食', desc: '粮赋 +14%，孤城不受粮道之困', supply: 1.0, income: 0.14 },
  },
  {
    id: 'qinhui', name: '秦桧', title: '学士', faction: '主和', martial: 1, politics: 9,
    desc: '自北南归，力主和议。用之可缓兵，然主战之气必挫。', atk: -0.10, morale: -6, zhanDelta: -18, heDelta: 18, goldBonus: 8,
    art: { short: '和议', name: '南自南、北自北', desc: '军备废弛，全军守势 -5%', defend: -0.05 },
  },

  // ── 械客 · 现代五人小队（squad: true，只在「清河烽火」剧本登场）──────────
  // 改编自小说《持械入宋》：现代火器碾压全无平衡可言，故「械」的强度被
  // 拆进地形战法与事件卡，真正的约束是弹药、人手与乡野立足——克制地强。
  {
    id: 'linzhao', name: '林昭', title: '队长', faction: '械客', martial: 8, politics: 5, squad: true,
    desc: '京片子，冷静果决。现代班组战术的定盘星：先算后动，令行禁止。',
    atk: 0.22, morale: 8, zhanDelta: 6,
    art: { short: '班组', name: '现代班组战术', desc: '山险攻势 +16%、平原攻势 +12%，守势 +4%', terrain: { mountain: 0.16, plain: 0.12 }, defend: 0.04 },
  },
  {
    id: 'xiechangfeng', name: '谢长风', title: '狙击手', faction: '械客', martial: 9, politics: 3, squad: true,
    desc: '沉默寡言，一枪定军心。千米之外，取敌酋首级如探囊。',
    atk: 0.24, morale: 4, zhanDelta: 4,
    art: { short: '冷枪', name: '千米冷枪', desc: '山险攻势 +14%、平原攻势 +10%，守势 +2%', terrain: { mountain: 0.14, plain: 0.10 }, defend: 0.02 },
  },
  {
    id: 'mazhenbang', name: '马振邦', title: '军械师', faction: '械客', martial: 7, politics: 6, squad: true,
    desc: '一口东北大碴子味，战力拉满。复刻底火与火药，营中军械不竭。',
    atk: 0.12, morale: 3, zhanDelta: 3,
    art: { short: '造械', name: '野战军械', desc: '各城兵额 +20%，粮赋 +4%', cap: 0.20, income: 0.04 },
  },
  {
    id: 'wanghaochuan', name: '王浩川', title: '通信兵', faction: '械客', martial: 5, politics: 6, squad: true,
    desc: '广东仔，情报组网，眼观六路。电台所及，孤军亦有耳目。',
    atk: 0.10, morale: 4, zhanDelta: 4,
    art: { short: '组网', name: '电台组网', desc: '孤军之弊减免 60%，守势 +6%', supply: 0.60, defend: 0.06 },
  },
  {
    id: 'chensu', name: '陈素', title: '医官', faction: '械客', martial: 4, politics: 7, squad: true,
    desc: '湘妹子，妙手回春。战地玫瑰，伤兵归队、军心自稳。',
    atk: 0.08, morale: 8, zhanDelta: 2,
    art: { short: '救护', name: '战地救护', desc: '全军守势 +12%', defend: 0.12 },
  },
];

/** 拜将情境指引：只作提示，不参与任何数值判定 */
export const HERO_USE = {
  yuefei: '平原决战 · 主帅首选',
  hanshizhong: '渡淮济师 · 免舟楫政令',
  liqi: '婴城固守 · 分路当选',
  wujie: '山险孤军 · 关陕自持',
  zhangjun: '兵额常满 · 广募新军',
  ligang: '主和渐盛 · 分路补半道政令',
  zhaoding: '粮秣吃紧 · 分路补漕粮',
  qinhui: '主和路线 · 军备废弛',
  linzhao: '械客统领 · 山险平原皆宜',
  xiechangfeng: '攻坚拔锐 · 斩将夺旗',
  mazhenbang: '兵额吃紧 · 广募乡勇',
  wanghaochuan: '孤军深入 · 通联自持',
  chensu: '守势吃紧 · 伤兵归列',
};

/** 事件卡：cond 决定可否出现，once 表示全局仅一次 */
export const EVENTS = [
  {
    id: 'mingdao', once: true, title: '明道宫问对', tag: '朝论',
    text: '行在新置讲筵，一介布衣直问官家：「陛下是要做南渡之主，还是要做中兴之君？」满殿寂然，侍臣皆屏息。',
    options: [
      { label: '「朕要北伐」', desc: '主战威望 +12，士气 +6，主和 +4', apply: s => { s.court.zhan += 12; s.court.he += 4; s.morale += 6; } },
      { label: '「先安生民」', desc: '民心 +8，粮秣 +20，主战 -3', apply: s => { s.popularity += 8; s.grain += 20; s.court.zhan -= 3; } },
    ],
  },
  {
    id: 'kuibing', title: '溃兵入淮', tag: '军务',
    text: '自江北退下来的散卒数千，衣甲不全，聚于淮上，扰民亦可用命。枢密院请旨如何处置。',
    options: [
      { label: '尽数收编', desc: '兵力 +5（分摊前线），民心 -3，粮秣 -10', apply: s => { s.reinforceFront(5); s.popularity -= 3; s.grain -= 10; } },
      { label: '给粮遣散', desc: '民心 +6，粮秣 -12', apply: s => { s.popularity += 6; s.grain -= 12; } },
    ],
  },
  {
    id: 'junxie', title: '御营司请造军械', tag: '军务',
    text: '军器监呈上新样神臂弓与铁札甲图样，工料不菲。若成，北伐之师可少死许多人。',
    options: [
      { label: '拨钱督造', desc: '缗钱 -30，士气 +10，都督攻势 +6%（本局）', apply: s => { s.gold -= 30; s.morale += 10; s.gearBonus += 0.06; } },
      { label: '从缓', desc: '缗钱 +10，士气 -3', apply: s => { s.gold += 10; s.morale -= 3; } },
    ],
  },
  {
    id: 'ersheng', once: true, title: '二圣音信', tag: '朝论',
    text: '北地传来消息，言二圣尚在。殿上顿时分作两议：一请遣使迎请，一谓不可因此自缚手脚。',
    options: [
      { label: '遣使北上', desc: '民心 +10，主和 +10，缗钱 -20', apply: s => { s.popularity += 10; s.court.he += 10; s.gold -= 20; } },
      { label: '只论恢复', desc: '主战 +10，民心 -5，士气 +6', apply: s => { s.court.zhan += 10; s.popularity -= 5; s.morale += 6; } },
    ],
  },
  {
    id: 'qinhui_gui', once: true, title: '秦桧自北归', tag: '朝论',
    text: '有旧臣自金营南归，自称杀监者夺舟而来，力陈「南自南、北自北」之议。朝议汹汹。',
    cond: s => s.turn >= 3,
    options: [
      { label: '召对，留置阙下', desc: '主和 +14，缗钱 +25，民心 -4；金人闻有和议，暂缓南下 1 回合；秦桧自此得预朝议', apply: s => { s.court.he += 14; s.gold += 25; s.popularity -= 4; s.truce = 1; }, flag: 'qinhui_at_court' },
      { label: '「朕不问和议」', desc: '主战 +10，士气 +4，主和 -8', apply: s => { s.court.zhan += 10; s.morale += 4; s.court.he -= 8; } },
    ],
  },
  {
    id: 'heyi_zhao', once: true, priority: 2, title: '和议之诏', tag: '朝论',
    cond: s => s.flags.has('qinhui_at_court') && s.turn >= 6,
    text: '秦桧既留阙下，屡以「南自南、北自北」进言。中书舍人夜草诏书，只待御笔：「诸军各守本界，毋得擅启兵端。」殿外将佐闻之，甲声寂然。',
    options: [
      { label: '御笔允和', desc: '金人暂缓南下 1 回合，民心 +6；主和 +12、主战 -10、士气 -4', apply: s => { s.truce = 1; s.court.he += 12; s.court.zhan -= 10; s.popularity += 6; s.morale -= 4; }, flag: 'heyi_signed' },
      { label: '留中不发', desc: '主战 +8、士气 +4、主和 -6；金人知我无意和议，积怒 +1', apply: s => { s.court.zhan += 8; s.morale += 4; s.court.he -= 6; s.jinFury += 1; } },
    ],
  },
  {
    id: 'fengboting', once: true, priority: 3, title: '风波亭', tag: '朝论',
    cond: s => s.flags.has('heyi_signed') && s.turn >= 8
      && (s.heroId === 'yuefei' || s.viceHeroId === 'yuefei'),
    text: '和议既定，主和者进言：「岳家军不受节度，恐为后患。」一日三诏，召岳侯赴行在。临安父老聚于街口，无人敢言。',
    options: [
      {
        label: '收其兵柄', desc: '岳飞去位（主帅或分路），主和 +10、主战 -12、士气 -12、民心 -5',
        apply: s => {
          if (s.heroId === 'yuefei') { s.heroId = null; s.heroCity = null; }
          else { s.viceHeroId = null; s.viceHeroCity = null; }
          s.court.he += 10; s.court.zhan -= 12; s.morale -= 12; s.popularity -= 5;
        },
        flag: 'yuefei_dismissed',
      },
      { label: '力保岳侯', desc: '主战 +10、士气 +8、民心 -3；金人积怒 +1', apply: s => { s.court.zhan += 10; s.morale += 8; s.popularity -= 3; s.jinFury += 1; } },
    ],
  },
  {
    id: 'caoyun', title: '漕船抵岸', tag: '民生',
    text: '江南漕米循运河抵建康，押纲官奏称今年风调，然沿路多被军府截留。',
    options: [
      { label: '一律归仓', desc: '粮秣 +35，民心 +3', apply: s => { s.grain += 35; s.popularity += 3; } },
      { label: '先济前军', desc: '前线兵力 +4，粮秣 +10', apply: s => { s.reinforceFront(4); s.grain += 10; } },
    ],
  },
  {
    id: 'hanhuang', title: '旱蝗并作', tag: '天时',
    text: '淮南诸州飞蝗蔽日，秋赋十去其三。有司请下罪己诏，并开常平仓。',
    options: [
      { label: '开仓赈济', desc: '粮秣 -30，民心 +12，士气 +2', apply: s => { s.grain -= 30; s.popularity += 12; s.morale += 2; } },
      { label: '加征军粮', desc: '粮秣 +25，民心 -12', apply: s => { s.grain += 25; s.popularity -= 12; } },
    ],
  },
  {
    id: 'jinshi', title: '金国遣使', tag: '邦交',
    text: '金使持国书至，愿「划淮为界」，索岁币甚巨，言辞倨傲。殿上诸将按刀而立。',
    cond: s => s.turn >= 4,
    options: [
      { label: '却使不许', desc: '主战 +8，士气 +6，金军来年攻势 +1', apply: s => { s.court.zhan += 8; s.morale += 6; s.jinFury += 1; } },
      { label: '虚与委蛇', desc: '缗钱 -25，得一回合喘息，主战 -8', apply: s => { s.gold -= 25; s.truce = 1; s.court.zhan -= 8; s.court.he += 5; } },
    ],
  },
  {
    id: 'qingzhan', title: '诸将请战', tag: '军务',
    text: '诸军统制联名上书，言粮足马肥，请克日渡淮。枢密院却以「诸将不相统属」为忧。',
    cond: s => s.grain >= 95,
    options: [
      { label: '许之，御驾亲征', desc: '本回合政令 +1，士气 +12，民心 +4', apply: s => { s.decree += 1; s.morale += 12; s.popularity += 4; s.charge = 1; } },
      { label: '令各持重', desc: '粮秣 +15，士气 -5，主战 -4', apply: s => { s.grain += 15; s.morale -= 5; s.court.zhan -= 4; } },
    ],
  },
  {
    id: 'yancheng', once: true, title: '郾城捷报', tag: '战报',
    cond: s => s.cities.kaifeng.owner === 'song' || s.cities.yingtian.owner === 'song',
    text: '前锋以背嵬军破金人拐子马于平原，甲骑尽覆。军中传言：「撼山易，撼岳家军难。」',
    options: [
      { label: '乘势进兵', desc: '全线兵力 +4，士气 +14，主战 +8', apply: s => { s.reinforceFront(4); s.morale += 14; s.court.zhan += 8; } },
      { label: '勒兵观变', desc: '粮秣 +20，民心 +5', apply: s => { s.grain += 20; s.popularity += 5; } },
    ],
  },
  {
    id: 'huaixi', title: '淮西军变', tag: '军务',
    cond: s => s.grain < 95 || s.morale < 58,
    text: '有军头因欠饷鼓众，夜焚营寨，携部曲北去。若处置失当，淮上防线恐生裂隙。',
    options: [
      { label: '发帑抚军', desc: '缗钱 -25，粮秣 -15，士气 +8', apply: s => { s.gold -= 25; s.grain -= 15; s.morale += 8; } },
      { label: '按军法从事', desc: '士气 -6，民心 -4，前线兵力 +2', apply: s => { s.morale -= 6; s.popularity -= 4; s.reinforceFront(2); } },
    ],
  },
  {
    id: 'minxian', title: '父老献粮', tag: '民生',
    text: '浙西父老结社输粟千石，只求官家一纸「不忘中原」之诏。',
    options: [
      { label: '亲书北伐之诏', desc: '民心 +9，主战 +6，粮秣 +25', apply: s => { s.popularity += 9; s.court.zhan += 6; s.grain += 25; } },
      { label: '厚赐而遣', desc: '民心 +4，缗钱 -10，粮秣 +25', apply: s => { s.popularity += 4; s.gold -= 10; s.grain += 25; } },
    ],
  },
  {
    id: 'guanshan', once: true, title: '关陕请援', tag: '边务',
    cond: s => s.cities.changan.owner === 'song',
    text: '长安孤悬敌后，吴玠遣使间道而来，只求粮械，不求增兵：「有粮，险可自守。」',
    options: [
      { label: '间道输粮', desc: '粮秣 -25，长安兵力 +5，士气 +5', apply: s => { s.grain -= 25; s.cities.changan.troops += 5; s.morale += 5; } },
      { label: '令其自保', desc: '粮秣 +8，民心 -3', apply: s => { s.grain += 8; s.popularity -= 3; } },
    ],
  },
  {
    id: 'haishang', title: '海上互市', tag: '邦交',
    text: '明州市舶司奏：番商云集，若许以官牒通商，岁入可补军需之半。',
    options: [
      { label: '设务通商', desc: '缗钱 +45，主和 +3', apply: s => { s.gold += 45; s.court.he += 3; } },
      { label: '严禁通番', desc: '民心 +5，主战 +3，缗钱 +8', apply: s => { s.popularity += 5; s.court.zhan += 3; s.gold += 8; } },
    ],
  },
  {
    id: 'zhongxing', once: true, title: '中兴之议', tag: '朝论',
    cond: s => s.cities.kaifeng.owner === 'song',
    text: '旧都已复，礼部请上尊号、修封禅。官家却想着燕云尚未归版籍。',
    options: [
      { label: '「先复燕云」', desc: '主战 +14，士气 +15，民心 +5', apply: s => { s.court.zhan += 14; s.morale += 15; s.popularity += 5; } },
      { label: '「与民休息」', desc: '民心 +12，粮秣 +40，主战 -10', apply: s => { s.popularity += 12; s.grain += 40; s.court.zhan -= 10; } },
    ],
  },

  // ── 短剧本专属事件：cond 锁死局号类型，长局不会串入 ──────────
  {
    id: 'shunchang_zaozhou', once: true, priority: 1, title: '凿沉归舟', tag: '顺昌',
    cond: s => s.scenarioId === 'shunchang' && s.cities.shouchun.owner === 'song',
    text: '诸将见金骑蔽野，请携家口登舟南还。刘锜命人尽凿其舟，积薪于门下：「脱有不测，即焚吾家，毋辱敌手。」城中始知无退路。',
    options: [
      { label: '凿舟示死', desc: '士气 +12，寿春 +3 营，民心 -2', apply: s => { s.morale += 12; s.cities.shouchun.troops += 3; s.popularity -= 2; } },
      { label: '留舟以备退路', desc: '民心 +4，粮秣 +12，士气 -6', apply: s => { s.popularity += 4; s.grain += 12; s.morale -= 6; } },
    ],
  },
  {
    id: 'shunchang_yezhuo', title: '夜斫金营', tag: '顺昌',
    cond: s => s.scenarioId === 'shunchang' && s.turn >= 3 && s.cities.shouchun.owner === 'song',
    text: '暑月暴雨，金营疲甚。帐下请选锐卒五百，衔枚夜出，以雷霆不及掩耳之势扰其营垒。',
    options: [
      { label: '选锐夜出', desc: '士气 +8，蔡州／徐州金兵各 -2 营，粮秣 -12', apply: s => {
        s.morale += 8; s.grain -= 12;
        for (const id of ['caizhou', 'xuzhou']) {
          const c = s.cities[id];
          if (c.owner === 'jin') c.troops = Math.max(1, c.troops - 2);
        }
      } },
      { label: '婴城不出', desc: '寿春 +2 营，粮秣 +8', apply: s => { s.cities.shouchun.troops += 2; s.grain += 8; } },
    ],
  },
  {
    id: 'yancheng_guazima', once: true, priority: 1, title: '拐子马合围', tag: '郾城',
    cond: s => s.scenarioId === 'yancheng' && s.cities.caizhou.owner === 'song',
    text: '金人以铁浮图居中、拐子马两翼包抄，平地无险可依。诸军皆言当退，岳侯独持步阵不动：「试看背嵬军破之。」',
    options: [
      { label: '背嵬步阵迎击', desc: '前线兵力 +3，士气 +12，主战 +6，粮秣 -10', apply: s => { s.reinforceFront(3); s.morale += 12; s.court.zhan += 6; s.grain -= 10; } },
      { label: '敛兵入城', desc: '粮秣 +22，士气 -4，主战 -6', apply: s => { s.grain += 22; s.morale -= 4; s.court.zhan -= 6; } },
    ],
  },

  // ── 「清河烽火」剧本专属事件：五人组各展所长，cond 锁死局号 ──────────
  {
    id: 'qinghe_luojia', once: true, priority: 1, title: '坠落清河', tag: '清河',
    cond: s => s.scenarioId === 'qinghe' && s.turn >= 2 && s.cities.changan.owner === 'song',
    text: '时空隧道一闭，五人携械坠于西北清河地界。乡民围观不敢近，蕃骑斥候已闻风窥伺。林昭收枪入匣：「先立足，再图远。」',
    options: [
      { label: '亮械立威', desc: '清河 +2 营，士气 +6，民心 -2（乡人畏惧）', apply: s => { s.cities.changan.troops += 2; s.morale += 6; s.popularity -= 2; } },
      { label: '藏械示好', desc: '民心 +6，粮秣 +10（村民输粟）', apply: s => { s.popularity += 6; s.grain += 10; } },
    ],
  },
  {
    id: 'qinghe_yaobu', title: '夜袭蕃寨', tag: '清河',
    cond: s => s.scenarioId === 'qinghe' && s.turn >= 3 && s.cities.luoyang.owner === 'jin' && s.cities.changan.owner === 'song',
    text: '谢长风伏于岭上三日，标定了蕃寨头目的帐子。诸人请战：与其坐待叩边，不如趁夜拔了这颗钉子。',
    options: [
      { label: '选锐夜出', desc: '士气 +6，洛阳蕃兵 -2 营，粮秣 -10', apply: s => {
        s.morale += 6; s.grain -= 10;
        if (s.cities.luoyang.owner === 'jin') s.cities.luoyang.troops = Math.max(1, s.cities.luoyang.troops - 2);
      } },
      { label: '坚壁清野', desc: '清河 +2 营，粮秣 +8', apply: s => { s.cities.changan.troops += 2; s.grain += 8; } },
    ],
  },
  {
    id: 'qinghe_fuke', once: true, title: '复刻底火', tag: '清河',
    cond: s => s.scenarioId === 'qinghe' && s.turn >= 3 && s.cities.changan.owner === 'song',
    text: '马振邦拆开一枚缴获的枪弹，眯眼比对底火：「照这个复刻，咱的枪就不再是烧火棍。就是要钱，要料。」',
    options: [
      { label: '拨钱赶制', desc: '缗钱 -25，本局攻势 +8%（械利）', apply: s => { s.gold -= 25; s.gearBonus += 0.08; } },
      { label: '原料抵充', desc: '缗钱 -8，民心 +3（以商队土产换料）', apply: s => { s.gold -= 8; s.popularity += 3; } },
    ],
  },
  {
    id: 'qinghe_zuwang', once: true, priority: 2, title: '电台组网', tag: '清河',
    cond: s => s.scenarioId === 'qinghe' && s.turn >= 4 && s.cities.changan.owner === 'song',
    text: '王浩川在岭脊架起短波天线，把方圆百里的烽燧、乡勇、斥候串成一张「网」：「阿妈话斋，信息就系命。」',
    options: [
      { label: '全时通联', desc: '本回合政令 +1，民心 +2（诸寨听调）', apply: s => { s.decree += 1; s.popularity += 2; } },
      { label: '静默守听', desc: '清河 +2 营（预警从容，乡勇入列）', apply: s => { s.cities.changan.troops += 2; } },
    ],
  },
  {
    id: 'qinghe_jiuzhi', title: '战地玫瑰', tag: '清河',
    cond: s => s.scenarioId === 'qinghe' && s.turn >= 3 && s.cities.changan.owner === 'song',
    text: '寨中伤兵哀号。陈素挽袖上前，止血、清创、缝合，手法让郎中们看直了眼：「还有哪位要排队？」',
    options: [
      { label: '随军救护', desc: '士气 +8，粮秣 -8', apply: s => { s.morale += 8; s.grain -= 8; } },
      { label: '巡诊乡里', desc: '民心 +6，粮秣 -6', apply: s => { s.popularity += 6; s.grain -= 6; } },
    ],
  },
  {
    id: 'qinghe_danyao', once: true, priority: 1, title: '弹药告急', tag: '清河',
    cond: s => s.scenarioId === 'qinghe' && s.turn >= 5 && s.gearBonus > 0 && s.cities.changan.owner === 'song',
    text: '马振邦清点弹药箱，眉头拧成疙瘩：「底火见底了。省着打，还是拿这一箱梭哈一把？」',
    options: [
      { label: '匀弹支用', desc: '本局攻势 -4%，粮秣 +12（省下辎重）', apply: s => { s.gearBonus = Math.max(0, s.gearBonus - 0.04); s.grain += 12; } },
      { label: '集中弹药打硬仗', desc: '士气 +6，民心 -3（征发民夫转运）', apply: s => { s.morale += 6; s.popularity -= 3; } },
    ],
  },
];

export const TERRAIN_LABEL = { plain: '平原', mountain: '山险', river: '水网', coast: '滨海' };
export const TERRAIN_DEFENSE = { plain: 0.00, mountain: 0.35, river: 0.20, coast: 0.10 };

/** 本色回合上限；实际每局以 GameState.maxTurns 为准 */
export const MAX_TURNS = 30;

/** 难度档：normal 与最初的数值完全一致，其余两档在其上做加减 */
export const DIFFICULTIES = [
  {
    id: 'easy', name: '偏安可守', tag: '宽和',
    desc: '金军初势稍弱，仓廪充裕，三十八回合为限。',
    maxTurns: 38, grain: 170, gold: 110, jinTroops: -2, jinFury: 0,
    jinMight: -0.10, zhanDelta: 6, decreeBonus: 1, luck: 'good',
  },
  {
    id: 'normal', name: '建炎北伐', tag: '本色',
    desc: '本色兵力粮账，三十回合为限，攻守最见章法。',
    maxTurns: 30, grain: 140, gold: 90, jinTroops: 0, jinFury: 0,
    jinMight: 0, zhanDelta: 0, decreeBonus: 0, luck: 'mixed',
  },
  {
    id: 'hard', name: '直捣黄龙', tag: '艰险',
    desc: '金人重兵压境、锐气正盛，二十六回合为限。',
    maxTurns: 26, grain: 120, gold: 70, jinTroops: 2, jinFury: 0,
    jinMight: 0.12, zhanDelta: -6, decreeBonus: 1, luck: 'bad',
  },
];

/**
 * 短剧本关：固定开局 + 特定目标 + 事件白名单，复用长局同一套规则、战法与舆图。
 * 以本图州郡约略拟史地（顺昌拟寿春、郾城拟蔡州一带），非精确考据；
 * 「清河烽火」为改编新关：清河边寨拟长安、蕃部大寨拟洛阳，人物与情节原创。
 *
 * 目标只用城池 id 声明，判定与进度一律交给 rules.js 的通用解释器：
 *   hold    必须守住的州郡，任一易主即败
 *   capture 必须克复的州郡，全部归宋即胜
 *   bonus   额外的进取出路，达成可提前大捷／改换结局文案
 *   marks   舆图上加朱批圈的目标城
 * 故存档只需存剧本 id，序列化不含任何函数。
 */
export const SCENARIOS = [
  {
    id: 'qinghe', name: '清河烽火', tag: '守 · 九回合', era: '北宋末年 · 秋',
    brief: '改编自小说《持械入宋》开局：现代五人小队全员携械，坠入烽烟四起的西北边地。本关以「长安」拟清河边寨、东面「洛阳」拟蕃部大寨：不须席卷天下，只要守住清河九轮；若有余力反手破寨，便是大捷。',
    tactic: '现代火器威力无双，然弹药与人手皆有限：整军与移防须算准哪一处先撑不住。蕃骑每回合必来叩边；若余力尚存，可自清河奇袭洛阳，反客为主求一场大捷。',
    difficulty: 'normal', maxTurns: 9,
    grain: 90, gold: 50, popularity: 64, morale: 62,
    court: { zhan: 60, he: 40 },
    heroId: 'linzhao', heroCity: 'changan',
    jinFury: 1, jinMight: 0.05, jinAtkScale: 0.90,
    // 西北边地：只留清河一线接敌，江南诸州照旧作后院，金军东路压力不至牵动本关
    owners: { changan: 'song' },
    troops: {
      changan: 11, luoyang: 18, taiyuan: 14, kaifeng: 18, dengzhou: 8,
      shouchun: 8, chuzhou: 8, xiangyang: 6, luzhou: 6, jiankang: 6,
    },
    jinEveryTurn: true,
    eventChance: 0.55, eventMinTurn: 2,
    events: ['qinghe_luojia', 'qinghe_yaobu', 'qinghe_fuke', 'qinghe_zuwang', 'qinghe_jiuzhi', 'qinghe_danyao', 'kuibing', 'caoyun', 'minxian'],
    hold: ['changan'],
    capture: [],
    bonus: ['luoyang'],
    marks: ['changan', 'luoyang'],
    strategy: { targets: ['luoyang'], guard: ['changan'] },
    winKind: 'hold',
    winTitle: '清河大捷', winText: '反手袭破洛阳大寨，蕃部胆裂、遣使请盟。清河之名，自此传遍秦陇——林昭望着东面残阳：「这天下，咱们还得守下去。」',
    holdTitle: '婴寨不堕', holdText: '九轮叩边，寨栅未倒。清河父老赖以安枕——此局不以拓地论功，以不失桑梓为胜。',
    greatTitle: '夜袭破寨',
    loseHoldTitle: '清河失守', loseHoldText: '寨栅一破，蕃骑长驱而入。清河父老的血不能白流——但这一局，输了。',
    timeoutTitle: '', timeoutText: '',
  },
  {
    id: 'shunchang', name: '顺昌婴城', tag: '守 · 九回合', era: '绍兴十年 · 夏',
    brief: '金人毁盟南下，刘锜以八字军赴东京留守，行至顺昌而敌骑已薄城下。城孤粮少，诸将请退舟南还；刘锜凿舟沉之，示无去意。\n此关以淮南「寿春」当顺昌：不须席卷中原，只要婴城拒骑、挫其锐锋，撑过金人九轮猛攻。',
    tactic: '守寿春、楚州为本；仓廪薄、政令少，整军与移防须算准哪一处先撑不住。若余力尚存，可自楚州渡淮袭海州，反客为主求一场大捷。',
    difficulty: 'normal', maxTurns: 9,
    grain: 85, gold: 45, popularity: 66, morale: 64,
    court: { zhan: 64, he: 36 },
    heroId: 'liqi', heroCity: 'shouchun',
    jinFury: 1, jinMight: 0.06, jinAtkScale: 0.85,
    // 关陕已失，去掉长局的孤城干扰；淮南前线兵少，金军三路重兵压淮
    owners: { changan: 'jin' },
    troops: {
      shouchun: 9, chuzhou: 8, xiangyang: 6, luzhou: 6, yangzhou: 5, jiankang: 6,
      caizhou: 16, xuzhou: 15, haizhou: 13, yingtian: 12, kaifeng: 18, dengzhou: 8, daming: 9,
    },
    jinEveryTurn: true,
    eventChance: 0.55, eventMinTurn: 2,
    events: ['shunchang_zaozhou', 'shunchang_yezhuo', 'kuibing', 'junxie', 'caoyun', 'minxian', 'qingzhan'],
    hold: ['shouchun', 'chuzhou'],
    capture: [],
    bonus: ['haizhou'],
    marks: ['shouchun', 'chuzhou', 'haizhou'],
    strategy: { targets: ['haizhou', 'caizhou'], guard: ['shouchun', 'chuzhou'] },
    winKind: 'hold',
    winTitle: '顺昌大捷', winText: '凿舟示死，夜斫金营，复渡淮袭取海州。金人所谓「铁浮图」，卒不能越淮南一步。',
    holdTitle: '婴城不堕', holdText: '九轮猛攻，城头旗未倒。金骑粮尽引还，淮南诸州赖以全。此局不以拓地论功，以不失去土为胜。',
    greatTitle: '顺昌大捷',
    loseHoldTitle: '淮上溃防', loseHoldText: '寿春、楚州有一处不守，淮河天险遂与金人共之，江左门户洞开。',
    timeoutTitle: '', timeoutText: '',
  },
  {
    id: 'yancheng', name: '郾城破阵', tag: '攻 · 十二回合', era: '绍兴十年 · 秋',
    brief: '岳家军已进至郾城一带，金人以铁浮图、拐子马合围。平地无险可依，唯背嵬步阵硬撼之。\n此关以「蔡州」当郾城前锋大营：十二回合内克复应天府与徐州，截断开封东南两翼；前军大营与淮南后路皆不可失。',
    tactic: '大营在蔡州，出兵不必次次济淮，宜先取应天、再图徐州；开封守军最厚，非所急。金人每回合反扑大营，攻得越深越要留兵守后。',
    difficulty: 'normal', maxTurns: 12,
    grain: 150, gold: 90, popularity: 60, morale: 72,
    court: { zhan: 74, he: 26 },
    heroId: 'yuefei', heroCity: 'caizhou',
    jinFury: 1, jinMight: 0.05, jinAtkScale: 0.85,
    owners: { caizhou: 'song', changan: 'jin' },
    troops: {
      caizhou: 15, shouchun: 9, chuzhou: 9, xiangyang: 7, luzhou: 8, jiankang: 7,
      yingtian: 16, xuzhou: 17, kaifeng: 22, dengzhou: 10, haizhou: 12, luoyang: 9, daming: 10,
    },
    jinEveryTurn: true,
    eventChance: 0.5, eventMinTurn: 2,
    events: ['yancheng_guazima', 'yancheng', 'qingzhan', 'junxie', 'kuibing', 'caoyun', 'huaixi'],
    hold: ['caizhou', 'shouchun'],
    capture: ['yingtian', 'xuzhou'],
    bonus: ['haizhou'],
    marks: ['caizhou', 'yingtian', 'xuzhou', 'shouchun'],
    strategy: { targets: ['yingtian', 'xuzhou', 'haizhou'], guard: ['caizhou', 'shouchun'] },
    winKind: 'capture',
    winTitle: '郾城破阵', winText: '背嵬步阵既摧拐子马，应天、徐州次第归版籍。开封东南两翼已断，朱仙镇在望。',
    holdTitle: '', holdText: '',
    greatTitle: '直抵朱仙镇', greatText: '两翼既克，兼取海州，京东粮道尽入我手。父老牵牛载酒，言金人已议弃东京而北去。',
    loseHoldTitle: '后路断绝', loseHoldText: '前军大营或淮南后路一失，深入之师便成孤军。北伐之锐，不待敌摧而已自折。',
    timeoutTitle: '班师之诏', timeoutText: '十二回合已尽，两翼未下。一日十二金字牌，十年之功，废于一旦。',
  },
];

/** 供存档回查：只认已登记的剧本 id，异常值一律按长局处理 */
export function findScenario(id) {
  return SCENARIOS.find(s => s.id === id) || null;
}

