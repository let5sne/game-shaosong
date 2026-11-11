# 绍宋 · 建炎北伐

一个用 three.js 做的、打开浏览器就能玩的单页 3D 回合制战略游戏。舆图上铺开 24 座州郡、4 条河与 17 处津渡，每回合只有数道「政令」可用：整军、筹粮、拜将、督军、进军、和议。用兵先算粮，粮道一断孤军便受困；金骑秋冬南牧，春夏才是北进的窗口。

目标是在回合上限内收复开封与燕京，并把金人压到 3 州以内。

运行时只依赖 `three` 一个包。规则层是不碰 DOM 的纯函数，因此同一局可以完全脱离浏览器、在 Node 里从头跑到尾。

## 在线体验

无需本地安装，直接打开 **https://let5sne.github.io/game-shaosong/** 即可试玩。

站点由 `.github/workflows/deploy.yml` 自动发布：每次推送 `main` 都会执行 `npm ci` → 单元测试 → 数值平衡护栏 → `npm run build` → 构建产物体检 → 无头 Chrome 实机 smoke，全部通过后把 `dist/` 部署到 GitHub Pages，并在 Actions 中留一份可下载的构建包 `shaosong-dist`；也可在 Actions 页手动触发。构建使用相对路径 `base: './'`，因此站点挂在仓库子路径下也能正常加载模型与字体。

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

- **长局「建炎北伐」**：回合上限随国势而变 —— 偏安可守 38 / 建炎北伐 30 / 直捣黄龙 26。主帅战法全军常效，分帅只节制驻节本城；州郡须连成粮道通向行在，否则岁赋、兵额、士气俱损。
- **短剧本**：`顺昌婴城`（守 9 回合）、`郾城破阵`（攻 12 回合），固定开局与特定目标，复用同一套规则与舆图。
- **治略（可选）**：屯田、仓廪、军器作坊、市舶四类设施与将领养成、差遣，和进军争同一道政令。默认关闭，`?economy=1` 即时开启。

操作：拖拽旋转、滚轮缩放、右键平移、点选州郡；`空格` 结束回合、`H` 看玩法、`R` 复位视角、`A` 开关托管、`Z` 悔棋、`S` 设置。局面逐令自动存档，顶栏「册」可管理三卷存档。

## URL 参数

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `scenario` | `campaign` / `shunchang` / `yancheng` | `campaign` |
| `difficulty` | `easy` / `normal` / `hard` | `normal` |
| `seed` | 固定局号，可复现整局战报 | 随机 |
| `auto` | `1` 打开即托管推演 | 关 |
| `economy` | `1` 开启治略经营养成 | 关 |
| `terrain` | `classic` / `paper` / `real` 地貌精度 | `paper` |
| `quality` | `auto` / `high` / `low` 性能档 | `auto` |
| `ink` | `1` 宣纸增强（墨晕后处理） | 关 |
| `ground` / `city` | `1` 地表纸纹 / 城池瓦作贴图 | 关 |
| `units` / `capitals` / `trees` / `mat` | `0` 可逐项关闭对应资产层 | 开 |
| `motion` / `mute` / `grade` | 动效 / 静音 / 开场页电影感 | `auto` / 关 / 开 |
| `render=demand` | 省电渲染：只在状态／相机／特效变化时出帧（实验性调试参数） | 连续渲染 |

完整清单见 `src/settings.js`（唯一配置真源，17 项）。优先级 **URL > 浏览器本地存储 > 默认值**；设置面板的改动会同步写回地址栏，链接可直接分享复现。`render` 是唯一的例外：它是给真机功耗对比用的调试开关，不是用户偏好，因此不进配置表、不出现在设置面板、也不落盘；`encodeSearch()` 会保留无关参数，改设置不会把这个参数冲掉。运行时也可在控制台用 `world.perf.setMode('demand')` 切换，用 `world.perf.stats()` 看帧时与 draw call。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `src/data.js` | 州郡、河流、将领、事件、剧本等静态数据 |
| `src/rules.js` | 纯规则：结算、攻守、胜负判定（无 DOM） |
| `src/autoplay.js` | 托管推演 |
| `src/save.js` | 存档与多槽管理 |
| `src/settings.js` | 唯一配置真源：URL / 存储参数集中一张表 |
| `src/ui.js` | DOM 界面 |
| `src/world.js` | three.js 三维舆图（异步挂载） |
| `src/models.js` | 程序化几何与 GLB 解析 |
| `src/themes.js` | 展示主题与机位 |
| `src/ink.js` | 可选的水墨后处理 |
| `src/economy.js` | 治略玩法（纯数据与纯函数） |
| `scripts/verify/` | 构建产物体检与无头浏览器实机 smoke（可入库、无凭据） |
| `eslint.config.js` | ESLint 扁平配置：只守未定义／未使用／重复声明／不可达 |

两条约定值得留意：攻守系数只有一个出口 `battleParams()`，实战／推演／托管共用；所有掷点走 `GameState.rngState`（mulberry32），故 `?seed=123456` 可复现整局，批量模拟可逐局比对。

改动边界与提案判据见 [AGENTS.md](./AGENTS.md)。

## 验证

```bash
npm test                  # node:test 单元测试
npm run lint              # ESLint：未定义/未使用变量、重复声明、不可达代码
npm run balance           # 300 局 × 三档难度 + 两剧本，数值护栏回归
npm run balance:economy   # 治略模式的独立护栏
npm run build             # 构建
npm run verify:dist       # 产物完整性、子路径相对路径、运行时资源与体积预算
npm run verify:browser    # 无头 Chrome + CDP 实机 smoke（需 Node 22+ 与本机 Chrome）
npm run verify:browser -- --render=demand   # 同上，回归省电渲染模式
npm run verify:browser:mobile              # 同上，390×844@3x 窄屏：自动降档与抽屉布局
```

`vite.config.js` 把 `chunkSizeWarningLimit` 设为 600 KB：three 核心约 530 KB 是第三方固有体积，已单独成块并异步加载，不压首屏关键路径。`verify:dist` 会按 index ≤ 200 KB / world ≤ 100 KB / three ≤ 600 KB / css ≤ 80 KB 的预算逐项复核，超预算直接失败。上述检查已全部接入 CI（`.github/workflows/deploy.yml`）；本机若没有 Chrome，`verify:browser` 会打印 `SKIP` 并以 0 退出，不制造假红灯。

## 资产

`public/models/` 与 `public/textures/` 的 GLB、贴图由 `scripts/blender/build_*.py` 生成（Blender 5.2 LTS）；字体子集由 `scripts/subset-font.py` 切分，构建期清单落在 `scripts/subset-manifest.json`（运行时不读，不随站点发布）。首屏只预载正文用的 400 字重，700 字重交给 `font-display: swap` 按需加载。运行时不引入 `GLTFLoader`，改用 `readUnitsGlb()` 自解析 GLB 以避免体积膨胀。城池、树木、旗帜、耕地等用 `InstancedMesh` 合批压低 draw call。

## 分支

| 分支 | 内容 |
| --- | --- |
| `main` | 默认分支：《绍宋》题材的长局、两关短剧本与治略等引擎工作 |
| `chixie` | 《持械入宋 · 清河烽火》改编实验：五人组、清河关剧本、局内文案改写、近观机位与浅水等观感选项 |

## 声明

本作品为个人技术练习，题材与人物取材于相关历史小说，**未取得原作 IP 授权**，仅供学习交流，请勿用于商业用途。`chixie` 分支是另一部小说的改编实验，授权状态同样未定；线上 Pages 目前只部署 `main` 分支。

**仓库已设为 public，但未附 LICENSE**：按默认著作权规则，公开可见不等于授权使用，复制、修改与再发布仍需事先取得许可；上文「学习交流」只是用途说明，不是授权条款。若希望他人合法复用代码，需另行补一份明确的 LICENSE。字体子集遵循 `public/fonts/OFL.txt`（SIL OFL 1.1），`three` 与 `vite` 遵循各自许可证。
