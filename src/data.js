/**
 * 《绍宋 · 建炎北伐》静态数据
 * 灵感取自榴弹怕水《绍宋》的架空历史设定，地名与人物为历史公有素材，
 * 文案、事件与数值均为本游戏原创，非官方衍生作品。
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
    name: '黄河', color: 0xb98c4a, width: 1.5,
    points: [[-48,-20],[-36,-18],[-27,-16],[-19,-15],[-8,-14],[1,-12],[7,-9],[13,-5],[19,-1],[24,4],[31,8],[40,10],[48,11]],
  },
  {
    name: '淮河', color: 0x5c93a8, width: 1.0,
    points: [[-48,6],[-36,7],[-24,8],[-12,8],[-2,8],[5,8],[13,9],[21,10],[29,10],[38,11],[48,12]],
  },
  {
    name: '长江', color: 0x4d86a6, width: 1.8,
    points: [[-48,19],[-36,20],[-25,19],[-16,20],[-7,21],[3,22],[12,23],[20,22],[27,21],[35,22],[42,23],[48,23]],
  },
  {
    name: '钱塘', color: 0x5c93a8, width: 0.7,
    points: [[-48,31],[-30,31],[-8,31],[8,31],[19,32],[28,32],[38,33],[48,33]],
  },
];

/** 名将 / 朝臣：任命一人为都督，提供战场加成并牵动朝局 */
export const HEROES = [
  { id: 'yuefei',   name: '岳飞',   title: '统制',   faction: '主战', martial: 9, politics: 4, desc: '治军严整，所部不扰民。拜为都督，全军攻势大振。', atk: 0.28, morale: 8,  zhanDelta: 8 },
  { id: 'hanshizhong', name: '韩世忠', title: '节度使', faction: '主战', martial: 8, politics: 5, desc: '久历行阵，善守淮上。拜为都督，守土与反击俱佳。', atk: 0.20, morale: 6,  zhanDelta: 6 },
  { id: 'liqi',     name: '刘锜',   title: '都统制', faction: '武将', martial: 8, politics: 3, desc: '顺昌城下曾挫金人锐气，善以少击众。', atk: 0.22, morale: 5,  zhanDelta: 4 },
  { id: 'wujie',    name: '吴玠',   title: '经略使', faction: '武将', martial: 7, politics: 5, desc: '关陕柱石，据险固守，可安西陲。', atk: 0.16, morale: 6,  zhanDelta: 3 },
  { id: 'zhangjun', name: '张俊',   title: '节度使', faction: '武将', martial: 6, politics: 7, desc: '兵多而骄，用之可壮声势，然耗费粮饷。', atk: 0.12, morale: 2,  zhanDelta: 2, upkeep: 3 },
  { id: 'ligang',   name: '李纲',   title: '宰相',   faction: '主战', martial: 3, politics: 9, desc: '主战最力，理政有条，可使朝论归一。', atk: 0.08, morale: 4,  zhanDelta: 12, decree: 1 },
  { id: 'zhaoding', name: '赵鼎',   title: '参政',   faction: '士林', martial: 3, politics: 8, desc: '持重老成，能稳民心、丰漕运。', atk: 0.05, morale: 3,  zhanDelta: 3, grainBonus: 6 },
  { id: 'qinhui',   name: '秦桧',   title: '学士',   faction: '主和', martial: 1, politics: 9, desc: '自北南归，力主和议。用之可缓兵，然主战之气必挫。', atk: -0.10, morale: -6, zhanDelta: -18, heDelta: 18, goldBonus: 8 },
];

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
      { label: '召对，留置阙下', desc: '主和 +14，缗钱 +25，民心 -4', apply: s => { s.court.he += 14; s.gold += 25; s.popularity -= 4; } },
      { label: '「朕不问和议」', desc: '主战 +10，士气 +4，主和 -8', apply: s => { s.court.zhan += 10; s.morale += 4; s.court.he -= 8; } },
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
    cond: s => s.grain >= 60,
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
    cond: s => s.grain < 45 || s.morale < 40,
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
];

export const TERRAIN_LABEL = { plain: '平原', mountain: '山险', river: '水网', coast: '滨海' };
export const TERRAIN_DEFENSE = { plain: 0.00, mountain: 0.35, river: 0.20, coast: 0.10 };

export const MAX_TURNS = 32;
