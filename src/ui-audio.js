/**
 * 轻音效与静音位：模块级静音状态只在这里读写。
 * 单独成文件，是因为 sfx 被界面各处调用，而静音来源（URL 偏好／本机存储）与界面结构无关。
 */

export const MUTE_KEY = 'shaosong.muted';
function readMute() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
}
export function writeMute(v) {
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (_) { /* 隐私模式 */ }
}
let audioCtx = null;
let muted = readMute();

export function isMuted() { return muted; }
export function setMuted(v) { muted = !!v; }
export function sfx(kind) {
  if (muted) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const tone = (freq, dur, type, vol, delay = 0) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, now + delay);
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(vol, now + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + delay); o.stop(now + delay + dur + 0.02);
    };
    if (kind === 'click') tone(196, 0.09, 'triangle', 0.055);
    if (kind === 'hover') tone(698, 0.045, 'sine', 0.016);
    // 择关：一声轻磬；进场：由低到高的三声，配合卷轴合拢
    if (kind === 'scene') { tone(294, 0.17, 'triangle', 0.038); tone(440, 0.24, 'sine', 0.026, 0.06); }
    if (kind === 'enter') {
      [147, 220, 294].forEach((f, i) => tone(f, 0.52 + i * 0.08, i === 1 ? 'triangle' : 'sine', 0.045 - i * 0.007, i * 0.085));
    }
    if (kind === 'war') { tone(88, 0.30, 'sawtooth', 0.07); tone(132, 0.22, 'triangle', 0.04, 0.04); }
    if (kind === 'event') { tone(523, 0.55, 'sine', 0.05); tone(784, 0.65, 'sine', 0.035, 0.10); }
    if (kind === 'win') { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.7, 'sine', 0.05, i * 0.14)); }
    if (kind === 'lose') { tone(196, 0.8, 'sine', 0.05); tone(146, 1.0, 'sine', 0.04, 0.18); }
  } catch (_) { /* 浏览器禁用音频时静默 */ }
}
