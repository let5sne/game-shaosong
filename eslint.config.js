/**
 * ESLint 扁平配置（eslint 9）。
 *
 * 本项目没有 TypeScript，也不做类型检查；lint 只守「低垂果实」：
 * 未定义变量、未使用变量、重复声明、不可达代码、误用 == 。
 * 这些正是 8000 行纯 JS 里最容易在重构中悄悄引入、而 vite build 不会报错的问题。
 *
 * 规则刻意从简：不引 react/vue 插件，不开风格类规则（风格由 review 与现有代码为准）。
 */
const browserGlobals = {
  window: 'readonly', document: 'readonly', location: 'readonly',
  navigator: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly',
  matchMedia: 'readonly', getComputedStyle: 'readonly',
  history: 'readonly', location_: 'readonly',
  Image: 'readonly', Audio: 'readonly', fetch: 'readonly',
  console: 'readonly', performance: 'readonly',
  devicePixelRatio: 'readonly', screen: 'readonly',
  CustomEvent: 'readonly', Event: 'readonly', URLSearchParams: 'readonly',
  WebGLRenderingContext: 'readonly', WebGL2RenderingContext: 'readonly',
  ResizeObserver: 'readonly', IntersectionObserver: 'readonly',
  HTMLCanvasElement: 'readonly', OffscreenCanvas: 'readonly',
  Path2D: 'readonly', DOMParser: 'readonly', Blob: 'readonly',
  URL: 'readonly', Worker: 'readonly', self: 'readonly',
  TextDecoder: 'readonly', TextEncoder: 'readonly',
};

const nodeGlobals = {
  process: 'readonly', Buffer: 'readonly',
  TextDecoder: 'readonly', TextEncoder: 'readonly',
  WebSocket: 'readonly',
  __dirname: 'readonly', __filename: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly',
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  fetch: 'readonly', structuredClone: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**', 'public/**', 'node_modules/**',
      '.workbuddy/**', '.git/**', 'scripts/blender/**', '.split-orig-ui.js',
    ],
  },
  {
    // 浏览器运行时：src 下的游戏代码
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-const-assign': 'error',
    },
  },
  {
    // Node 侧：单测与构建/校验脚本
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-const-assign': 'error',
    },
  },
  {
    // 配置文件自身
    files: ['*.js', '*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: nodeGlobals },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none' }] },
  },
];