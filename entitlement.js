// entitlement.js —— 授权验证模块
// 纯函数：不依赖 obsidian / DOM / 文件系统，可由单测直接 require。
// 改动守则见项目文档（不随包发布）。
'use strict';

// ===== 常量 =====

const LICENSE_PRODUCT_ID = '28-notes';
const LICENSE_FORMAT_VERSION = 1;
const LICENSE_CODE_PREFIX = '28N';
const LICENSE_RECEIPT_PREFIX = '28R';
const TRIAL_DAYS = 14;
const LICENSE_ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };

// 公钥（SPKI DER 的 base64）：只能验签、不能签发，公开无风险。
const LICENSE_PUBLIC_KEY_B64 =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEH2mJCwXuY6CxEBgLgsQpV/slEWOZuETNQuqrDT/bUbfRAqHu2mXerWNNiQ2ry+uSmnRG1INgPIDED710vhca4w==';

// 名单里的码一律不通过（随版本发布生效；单个码的问题用这里处理，不要动密钥对）
const REVOKED_LICENSE_IDS = [
];

// ===== 功能登记表 =====
//
// locked: true → 未授权时拦截该功能（试用期内放行）
// freeCap: N   → 免费可用 N 次（不配 = 不限量）
// name         → 给用户看的功能名（详情页 / 设置页展示）
//
// 拦截动作不读本表：iframe 侧走 applyProGate（实时读 state.isPro），
// host 侧读 licenseState.active。本表 = 登记处 + 展示文案来源。
const PRO_LOCKS = {
  basicEdit:       { locked: false, name: '基础编辑（增删节点、撤销重做、下钻）' },
  pathLink:        { locked: false, name: '路径链接（上一/下一/保存默认路径）' },
  nowNode:         { locked: true,  name: 'Now 节点（侧边/节点菜单的 Now 按钮）' },
  minorHide:       { locked: true,  name: 'Minor（隐藏完成）按钮' },
  fold:            { locked: true,  name: '折叠层级（左侧折叠按钮 + 右下角高级折叠数字）' },
  saveShortcut:    { locked: true,  name: '保存为捷径（右键菜单）' },
  history:         { locked: false, name: '历史记录与版本快照' },
  premiumThemes:   { locked: false, name: '进阶主题（飞书蓝线/粉线/Obsidian/MindNode）' },
  noteStyle:       { locked: false, name: '备注区颜色与字号自定义' },
  aiPath:          { locked: true,  name: '复制 AI 定位路径' },
};

// 功能当前是否可用（isPro = 已授权或仍在试用期）。
// 表里没登记 / 没上锁的一律放行：宁可漏放，也不误伤用户现有功能。
function canUseFeature(featureId, isPro) {
  const rule = PRO_LOCKS[featureId];
  if (!rule || rule.locked !== true) return true;
  return isPro === true;
}

// 某功能的免费额度（没登记 / 没配额度 = 不限量）
function freeCapOf(featureId) {
  const rule = PRO_LOCKS[featureId];
  if (!rule || !Number.isFinite(rule.freeCap)) return Infinity;
  return rule.freeCap;
}

// 已用 count 次后，再用一次是否还放行
function underFreeCap(featureId, count, isPro) {
  return isPro === true || count < freeCapOf(featureId);
}

// ===== 工具：base64url / 字节 =====

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 宽松解码：标准 base64 的 +/ 与填充 = 也接受（用户从不同地方粘贴的形态都能吃下）
function fromBase64Url(str) {
  const norm = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function digestHex(text) {
  const data = new TextEncoder().encode(String(text));
  const sum = await crypto.subtle.digest('SHA-256', data);
  let hex = '';
  for (const byte of new Uint8Array(sum)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

// ===== 激活码归一化 =====
//
// 只删空白：base64url 字符集自带 '-' 和 '_'，转大写或删横线都会毁码；
// 分组展示必须用空格，不能用横线。剥掉 28N 前缀后原样保留。
function normalizeLicenseCode(raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, '');
  const upper = s.toUpperCase();
  if (upper.startsWith(LICENSE_CODE_PREFIX + '-')) return s.slice(LICENSE_CODE_PREFIX.length + 1);
  if (upper.startsWith(LICENSE_CODE_PREFIX)) return s.slice(LICENSE_CODE_PREFIX.length);
  return s;
}

// ===== 验签（核心）=====
//
// 返回 { valid, reason, payload }；reason 用于 i18n 键 license.err.<reason>。
// opts（仅测试注入用）：{ now?: Date, extraRevoked?: string[], publicKey?: string }
async function verifyLicenseCode(raw, opts) {
  const options = opts || {};
  const revoked = options.extraRevoked ? REVOKED_LICENSE_IDS.concat(options.extraRevoked) : REVOKED_LICENSE_IDS;

  const code = normalizeLicenseCode(raw);
  if (!code) return { valid: false, reason: 'empty' };

  const dot = code.indexOf('.');
  if (dot <= 0 || dot === code.length - 1) return { valid: false, reason: 'format' };

  let payloadBytes;
  let sigBytes;
  try {
    payloadBytes = fromBase64Url(code.slice(0, dot));
    sigBytes = fromBase64Url(code.slice(dot + 1));
  } catch (e) {
    return { valid: false, reason: 'format' };
  }

  // 1) 名单优先于验签：拉黑的码无论签名多正确都不放行
  let payload = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch (e) {
    return { valid: false, reason: 'payload' };
  }
  if (!payload || typeof payload !== 'object') return { valid: false, reason: 'payload' };
  if (payload.lid && revoked.indexOf(payload.lid) >= 0) return { valid: false, reason: 'revoked' };

  // 2) 验签
  let ok = false;
  try {
    const keyBytes = fromBase64Url(options.publicKey || LICENSE_PUBLIC_KEY_B64);
    const publicKey = await crypto.subtle.importKey(
      'spki', keyBytes,
      { name: LICENSE_ALG.name, namedCurve: LICENSE_ALG.namedCurve },
      false, ['verify']
    );
    ok = await crypto.subtle.verify(
      { name: LICENSE_ALG.name, hash: LICENSE_ALG.hash },
      publicKey, sigBytes, payloadBytes
    );
  } catch (e) {
    ok = false;
  }
  if (!ok) return { valid: false, reason: 'signature' };

  // 3) 产品标识必须匹配（p 是紧凑名，product 是早期长名，两个都认）
  if ((payload.p || payload.product) !== LICENSE_PRODUCT_ID) return { valid: false, reason: 'product' };

  // 4) 有效期（exp 为 Unix 秒或 ISO 字符串，不填即不过期）
  const exp = parseExpiry(payload.exp);
  if (exp !== null) {
    const now = options.now ? options.now.getTime() : Date.now();
    if (now > exp) return { valid: false, reason: 'expired' };
  }

  return {
    valid: true,
    payload: payload,
    lid: payload.lid || '',
    maxDevices: payload.md || payload.maxDevices || 3,
    plan: payload.plan || 'pro',
  };
}

function parseExpiry(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw * 1000; // 秒 → 毫秒
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw) * 1000;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

// ===== 设备标识 =====
//
// 读写由调用方注入（main.js 传文件 IO 闭包），本模块保持纯净可测。
function newDeviceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
// read: () => string|null ；write: (id) => void
function getOrCreateDeviceId(read, write) {
  try {
    const existing = read && read();
    if (existing && String(existing).length >= 8) return String(existing);
  } catch (e) { /* 读不到就新建 */ }
  const id = newDeviceId();
  try { if (write) write(id); } catch (e) { /* 写不进去也先用着 */ }
  return id;
}

// 回执：28R-<lid>-<设备摘要8位>。同 lid + 同设备恒定，用于人工核对设备数。
async function buildReceipt(lid, deviceId) {
  const devHash = (await digestHex(String(lid) + '|' + String(deviceId))).slice(0, 8);
  return LICENSE_RECEIPT_PREFIX + '-' + String(lid || 'UNKNOWN') + '-' + devHash.toUpperCase();
}

// ===== 14 天试用 =====
//
// 返回 { status, remainingMs, totalMs }；status: 'none' | 'active' | 'expired'。
// days 可选，覆盖默认天数（调试用）。
// 时钟回拨不影响剩余天数（lastSeenAt 单调递增兜底）。
function trialStatus(now, trialStartedAt, trialLastSeenAt, days) {
  const d = (typeof days === 'number' && Number.isFinite(days) && days > 0) ? days : TRIAL_DAYS;
  const total = d * 86400000;
  if (!trialStartedAt) return { status: 'none', remainingMs: 0, totalMs: total };

  const start = Date.parse(trialStartedAt);
  if (!Number.isFinite(start)) return { status: 'none', remainingMs: 0, totalMs: total };

  const end = start + total;
  const seen = trialLastSeenAt ? Date.parse(trialLastSeenAt) : NaN;
  const lastSeen = Number.isFinite(seen) ? Math.max(start, seen) : start;
  const effectiveNow = Math.max(now.getTime(), lastSeen); // 回拨不倒退
  const remaining = end - effectiveNow;

  if (remaining <= 0) return { status: 'expired', remainingMs: 0, totalMs: total };
  return { status: 'active', remainingMs: remaining, totalMs: total };
}

// ===== 尝试限流（内存态，重启 Obsidian 重新计数）=====
function makeAttemptLimiter(opts) {
  const o = opts || {};
  const maxAttempts = o.maxAttempts || 5;
  const lockMs = o.lockMs || 15 * 60 * 1000;
  const windowMs = o.windowMs || 30 * 60 * 1000;
  let failures = [];

  return {
    // 返回 { allowed, remainingMs }
    check() {
      const now = Date.now();
      failures = failures.filter(t => now - t < windowMs);
      const recent = failures.filter(t => now - t < lockMs);
      if (recent.length >= maxAttempts) {
        const oldest = Math.min.apply(null, recent);
        return { allowed: false, remainingMs: Math.max(0, lockMs - (now - oldest)) };
      }
      return { allowed: true, remainingMs: 0 };
    },
    record(success) {
      if (success) { failures = []; return; }
      failures.push(Date.now());
    },
    reset() { failures = []; },
  };
}

module.exports = {
  // 常量
  LICENSE_PRODUCT_ID, LICENSE_FORMAT_VERSION, LICENSE_CODE_PREFIX, LICENSE_RECEIPT_PREFIX,
  LICENSE_PUBLIC_KEY_B64, REVOKED_LICENSE_IDS, PRO_LOCKS,
  // 门控
  canUseFeature, freeCapOf, underFreeCap,
  // 验证
  normalizeLicenseCode, verifyLicenseCode,
  // 设备与回执
  newDeviceId, getOrCreateDeviceId, buildReceipt,
  // 试用
  trialStatus, TRIAL_DAYS,
  // 限流
  makeAttemptLimiter,
  // 工具
  toBase64Url, fromBase64Url, digestHex,
};
