/**
 * butler 上传封装：把 output/register-html5.zip 推到 itch.io 的指定 channel。
 *
 * 用法：npm run itch:package && npm run itch:publish
 *   --dry-run 只打印将要执行的命令，不调用 butler。
 *
 * 环境变量：
 *   BUTLER_API_KEY  必填，账号级 API key；只经环境变量传给子进程，绝不打印
 *   ITCH_TARGET     必填，形如 user/game（项目页 URL 的两段）
 *   ITCH_CHANNEL    选填，默认 html5
 *   ITCH_VERSION    选填，传给 --userversion；留空则由 butler 自增
 *   BUTLER_PATH     选填，butler 可执行文件路径，默认从 PATH 找
 *
 * 默认推 dist/ 目录而不是 zip：butler 对目录做增量更新，推压缩包会让每次
 * 改动都重传整包。output/register-html5.zip 是可复核快照，也供网页端手动上传。
 * 需要改推别的源时用 ITCH_SOURCE 指定。
 *
 * itch.io 的 REST API 只能查询，创建项目页、改元数据与上传构建都不在 API 内。
 * 本脚本是唯一写动作；首次推送后仍须在网页端把 channel 标记为浏览器可玩。
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SOURCE = process.env.ITCH_SOURCE || 'dist';
const DRY = process.argv.includes('--dry-run');
const key = process.env.BUTLER_API_KEY || '';
const target = process.env.ITCH_TARGET || '';
const channel = process.env.ITCH_CHANNEL || 'html5';
const version = process.env.ITCH_VERSION || '';
const cmd = process.env.BUTLER_PATH || 'butler';
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

check(existsSync(SOURCE), '上传源存在', `${SOURCE} · 先执行 npm run build`);
check(!statSync(SOURCE).isDirectory() || existsSync(join(SOURCE, 'index.html')),
  '上传源根目录含 index.html', SOURCE);
check(!!key, 'BUTLER_API_KEY 已提供', '从账号设置页生成，勿写入仓库');
check(/^[^/\s:]+[/][^/\s:]+$/.test(target), 'ITCH_TARGET 形如 user/game', target || '未设置');
check(/^[\w.-]+$/.test(channel), 'ITCH_CHANNEL 合法', channel);
if (failures) {
  console.log('\n提示：API key 请在 itch.io 账号设置页生成，确认来源可用于上传；');
  console.log('项目页须先在网页端创建，butler 不会代为创建。');
  process.exit(1);
}

const args = ['push', SOURCE, `${target}:${channel}`];
if (version) args.push('--userversion', version);
console.log(`将执行：${cmd} ${args.join(' ')}（凭据经环境变量传入，不打印）`);
if (DRY) {
  console.log('--dry-run：未调用 butler');
  process.exit(0);
}

if (!DRY && cmd === 'butler') {
  const probe = spawnSync(cmd, ['-V'], { stdio: 'ignore' });
  if (probe.error) {
    console.error('未找到 butler：请安装后加入 PATH，或用 BUTLER_PATH 指定路径');
    process.exit(1);
  }
}

const r = spawnSync(cmd, args, {
  stdio: 'inherit',
  env: { ...process.env, BUTLER_API_KEY: key },
});
if (r.error) {
  console.error(String(r.error.message || r.error));
  process.exit(1);
}
if (r.status !== 0) {
  console.error(`butler 退出码 ${r.status}`);
  process.exit(r.status ?? 1);
}
console.log('\n上传完成。仍需在网页端完成：Kind 设为 HTML、把该 channel 标记为浏览器可玩、设置可见性。');
