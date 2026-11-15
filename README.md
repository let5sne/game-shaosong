# 版籍 · 行台北伐

> **The Register · A Paper Campaign** — 原创架空回合制战略游戏

一个用 three.js 做的、打开浏览器就能玩的单页 3D 回合制战略游戏。舆图上铺开 24 座州郡、4 条河与 17 处津渡，每回合只有数道「政令」可用：整军、筹粮、拜将、督军、进军、和议。用兵先算粮，粮道一断孤军便受困；廷骑秋冬南牧，春夏才是北进的窗口。

目标是在三年期限内收复旧都开封与燕京，并把北廷压到 3 州以内，使版籍重归一体。

运行时只依赖 `three` 一个包。规则层是不碰 DOM 的纯函数，因此同一局可以完全脱离浏览器、在 Node 里从头跑到尾。

玩家是朝议推举、任期三年的**监国执政**：政令须经朝议用印，粮道须连成一线通向行在，主战与主和争的是同一叠用印。故事、人物、事件链与每条机制的故事动机见 [STORY.md](./STORY.md)（叙事文案唯一真源）。

## 在线体验

无需本地安装，直接打开 **https://let5sne.github.io/game-shaosong/** 即可试玩。

站点由 `.github/workflows/deploy.yml` 自动发布：每次推送 `main` 都会执行 `npm ci` → 单元测试 → 代码检查 → 英文覆盖率门禁 → 数值平衡护栏 → `npm run build` → 构建产物体检 → 无头 Chrome 实机 smoke（常规／省电／窄屏／英文四种），全部通过后把 `dist/` 部署到 GitHub Pages，并在 Actions 中留一份可下载的构建包 `register-dist`；也可在 Actions 页手动触发。构建使用相对路径 `base: './'`，因此站点挂在仓库子路径下也能正常加载模型与字体。

## 运行

需要 Node.js 22+（`.nvmrc` 为准）；`verify:browser` 的 CDP 客户端用内置 WebSocket，低于 22 会自行 SKIP。浏览器侧无版本要求，任意支持 WebGL 的现代浏览器即可。

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 产出 dist/（相对路径 base，可部署到子目录）
npm run preview    # 预览构建产物
```

打开终端给出的地址，在开场页择定战局即可入局。

## 玩法

- **长局「北伐长局」**：回合上限随国势而变 —— 宽期息民 38 / 承平本色 30 / 限期复籍 26。主帅战法全军常效，分帅只节制驻节本城；州郡须连成粮道通向行在，否则岁赋、兵额、士气俱损。
- **短剧本**：`寿春婴城`（守 9 回合）、`蔡州破阵`（攻 12 回合），固定开局与特定目标，复用同一套规则与舆图。
- **治略（可选）**：屯田、仓廪、军器作坊、市舶四类设施与将领养成、差遣，和进军争同一道政令。默认关闭，`?economy=1` 即时开启。

操作：拖拽旋转、滚轮缩放、右键平移、点选州郡；`空格` 结束回合、`H` 看玩法、`R` 复位视角、`A` 开关托管、`Z` 悔棋、`S` 设置。局面逐令自动存档，顶栏「册」可管理三卷存档。

## URL 参数

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `scenario` | `campaign` / `shunchang` / `yancheng` | `campaign` |
| `difficulty` | `easy` / `normal` / `hard` | `normal` |
| `seed` | 固定局号，可复现整局战报 | 随机 |
| `lang` | `zh` / `en` 界面语言 | `zh` |
| `auto` | `1` 打开即托管推演 | 关 |
| `economy` | `1` 开启治略经营养成 | 关 |
| `terrain` | `classic` / `paper` / `real` 地貌精度 | `paper` |
| `quality` | `auto` / `high` / `low` 性能档 | `auto` |
| `ink` | `1` 宣纸增强（墨晕后处理） | 关 |
| `ground` / `city` | `1` 地表纸纹 / 城池瓦作贴图 | 关 |
| `units` / `capitals` / `trees` / `mat` | `0` 可逐项关闭对应资产层 | 开 |
| `motion` / `mute` / `grade` | 动效 / 静音 / 开场页电影感 | `auto` / 关 / 开 |
| `render=demand` | 省电渲染：只在状态／相机／特效变化时出帧（实验性调试参数） | 连续渲染 |

完整清单见 `src/settings.js`（唯一配置真源，18 项）。优先级 **URL > 浏览器本地存储 > 默认值**；设置面板的改动会同步写回地址栏，链接可直接分享复现。`render` 是唯一的例外：它是给真机功耗对比用的调试开关，不是用户偏好，因此不进配置表、不出现在设置面板、也不落盘；`encodeSearch()` 会保留无关参数，改设置不会把这个参数冲掉。运行时也可在控制台用 `world.perf.setMode('demand')` 切换，用 `world.perf.stats()` 看帧时与 draw call。


## 界面语言与英文化

`?lang=en` 打开英文版；设置面板「界面语言」切换后重载页面。中文是默认值，`encodeSearch()` 不会把 `lang=zh` 写进分享链接，因此旧链接、存档与固定局号的行为逐字不变。

英文化采用**渲染边界覆盖层**，不是把中文从源码里抽走：

- `data.js` / `rules.js` / `settings.js` 仍以中文为唯一真源；它们同时是存档内容、单测断言与平衡护栏的依据，抽出会扰动可复现基线。
- `src/i18n.js` 的 `tx()` 只在 DOM 写入点（`ui.js` 的 innerHTML / textContent、`main.js`、贴图文字 `models.js`）翻译；`src/locales/en.js` 是英文覆盖表，优先级为 `EN_STRINGS` 整句精译 → `EN_TEMPLATES` 含变量整句精译（键中 `#` 是数字／人名／城名等插值位，编译成整段正则，取到的值先翻译再按 `{0}` `{1}` 填回）→ `EN_PHRASES` 长词优先兜底。带缩进空白的 HTML 文本段会先去掉首尾空白查表、再嵌回原空白，保证静态审计与实机命中同一份键。
- 语言不进规则层、不进随机源、不写存档；`rules.js` / `save.js` 不 import i18n。中文模式下 `tx()` 逐字原样返回，关闭态与改造前完全一致。
- `index.html` 的 OG/Twitter 卡固定英文供海外抓取；文档标题与 `<html lang>` 由 `main.js` 按语言切换，印章改用中英通用的字母 R。

`npm run i18n:audit` 按真实渲染边界抽出玩家可见的中文文本段（模板插值统一记作 `#`），模拟英文翻译后按残留汉字数给出覆盖率与待补清单（`--json` 输出完整清单）。当前静态覆盖 **100%（1021 段 / 9909 字，残留 0 字）**：门面、设置说明、事件剧情、结局与动态战报均已人工逐句精译，不再依赖词典拼贴；`npm run i18n:audit:strict` 已接入 CI，新增中文文案未同步英文表即构建失败。`npm run verify:browser:en` 另在实机核对文档语言、标题、门面中文残留计数与控制台错误（实测 0 字、0 错误）。静态审计的边界是插值处若传入未被词表覆盖的中文专名，需由实机 smoke 与 `tests/i18n.test.mjs` 中的真实人物数据用例兜底。

隐私与第三方许可说明见 [privacy.html](./public/privacy.html)（中英双语、纯静态、无外部请求）。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `STORY.md` | 原创故事设定、人物、冲突逻辑与改造说明（叙事文案唯一真源） |
| `src/data.js` | 州郡、河流、将领、事件、剧本等静态数据 |
| `src/rules.js` | 纯规则：结算、攻守、胜负判定（无 DOM） |
| `src/autoplay.js` | 托管推演 |
| `src/save.js` | 存档与多槽管理 |
| `src/settings.js` | 唯一配置真源：URL / 存储参数集中一张表 |
| `src/i18n.js` / `src/locales/en.js` | 渲染边界翻译层与英文覆盖表（中文模式零开销） |
| `public/privacy.html` | 中英双语隐私说明与第三方许可清单 |
| `src/ui.js` | DOM 界面与交互（HUD、状态→DOM 唯一出口、托管循环） |
| `src/ui-template.js` | HUD 模板、玩法略要、首局引导文案（纯字符串） |
| `src/ui-format.js` | 纯展示计算：转义、百分比、条块、预警派生（无 DOM） |
| `src/ui-audio.js` | 音效与静音位 |
| `src/ui-saves.js` | 存档三卷面板 |
| `src/world.js` | three.js 三维舆图（异步挂载） |
| `src/models.js` | 程序化几何与 GLB 解析 |
| `src/themes.js` | 展示主题与机位 |
| `src/ink.js` | 可选的水墨后处理 |
| `src/economy.js` | 治略玩法（纯数据与纯函数） |
| `scripts/verify/` | 构建产物体检与无头浏览器实机 smoke（可入库、无凭据） |
| `scripts/i18n-audit.mjs` | 英文覆盖率审计与待补词条清单 |
| `eslint.config.js` | ESLint 扁平配置：只守未定义／未使用／重复声明／不可达 |

两条约定值得留意：攻守系数只有一个出口 `battleParams()`，实战／推演／托管共用；所有掷点走 `GameState.rngState`（mulberry32），故 `?seed=123456` 可复现整局，批量模拟可逐局比对。

改动边界与提案判据见 [AGENTS.md](./AGENTS.md)。

## 验证

```bash
npm test                  # node:test 单元测试
npm run lint              # ESLint：未定义/未使用变量、重复声明、不可达代码
npm run i18n:audit       # 英文覆盖率与待补词条清单（--json）
npm run i18n:audit:strict # 英文覆盖率门禁：残留汉字 > 0 即失败（已接入 CI）
npm run balance           # 300 局 × 三档难度 + 两剧本，数值护栏回归
npm run balance:economy   # 治略模式的独立护栏
npm run build             # 构建
npm run verify:dist       # 产物完整性、子路径相对路径、运行时资源与体积预算
npm run verify:browser    # 无头 Chrome + CDP 实机 smoke（需 Node 22+ 与本机 Chrome）
npm run verify:browser -- --render=demand   # 同上，回归省电渲染模式
npm run verify:browser:mobile              # 同上，390×844@3x 窄屏：自动降档与抽屉布局
npm run verify:browser:en                  # 英文版实机 smoke：文档语言、标题、门面与中文残留计数
```

`vite.config.js` 把 `chunkSizeWarningLimit` 设为 600 KB：three 核心约 530 KB 是第三方固有体积，已单独成块并异步加载，不压首屏关键路径；英文覆盖表文本量大且随译文增补，也单独拆成 `locale-en` 块，避免把 index 主包顶过预算。`verify:dist` 会按 index ≤ 200 KB / world ≤ 100 KB / three ≤ 600 KB / locale-en ≤ 60 KB / css ≤ 80 KB 的预算逐项复核，且要求 `locale-en` 必须存在，超预算或拆分失效直接失败。上述检查已全部接入 CI（`.github/workflows/deploy.yml`）；本机若没有 Chrome，`verify:browser` 会打印 `SKIP` 并以 0 退出，不制造假红灯。

## 资产

`public/models/` 与 `public/textures/` 的 GLB、贴图由 `scripts/blender/build_*.py` 生成（Blender 5.3.0）；字体子集由 `scripts/subset-font.py` 切分，构建期清单落在 `scripts/subset-manifest.json`（运行时不读，不随站点发布）。首屏只预载正文用的 400 字重，700 字重交给 `font-display: swap` 按需加载。运行时不引入 `GLTFLoader`，改用 `readUnitsGlb()` 自解析 GLB 以避免体积膨胀。城池、树木、旗帜、耕地等用 `InstancedMesh` 合批压低 draw call。

## 分支

| 分支 | 内容 |
| --- | --- |
| `main` | 默认分支：原创架空设定的长局、两关短剧本与治略等引擎工作 |
| `chixie` | 独立实验分支：近观机位、浅水、场景文案等观感与叙事实验；保持独立，不并入 `main`、不参与 Pages 部署与发行，见「声明」 |

## 声明

本作品为个人技术练习，也是一套**完全原创的架空设定**：故事、人物、年号、战法、事件、文案与数值均为本仓库自有，见 [STORY.md](./STORY.md)。州郡与河流名称取自历史地理公名，仅用作架空舆图上的地名，不构成史实叙述，也不改编自任何在世作品。

本仓库以 **MIT 许可证**开源，见 [LICENSE](./LICENSE)：允许复制、修改与再发布（含商业用途），须保留版权与许可声明。字体子集遵循 `public/fonts/OFL.txt`（SIL OFL 1.1），`three` 与 `vite` 遵循各自许可证。若后续发行策略要求更严格的条款，应另行替换许可证。

零后端、无账号、无埋点：存档仅存于本机浏览器，不上传；详见中英双语的 [privacy.html](./public/privacy.html)。线上 Pages 只部署 `main`；`chixie` 是独立实验分支，不并入 `main`，也不在发行与本次确权范围内。其叙事内容与授权状态由该分支单独处理，不倒灌进 `main`。

项目技术标识已统一为 `register`：包名 `the-register`、字体 `register-serif-*`、构建包 `register-dist`、日志与调试入口均用这一词根。仍保留 `shaosong` 的有三类：仓库名与 Pages 地址（改名会使旧链接失效，须在 GitHub 网页端操作）、`localStorage` 键名（存档兼容契约，改动会让旧存档丢失）、以及隐私页对键名的如实说明。LICENSE 版权人已改为 `The Register authors`。
