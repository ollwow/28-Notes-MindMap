// license.js —— 28-Notes 许可证验证模块（纯函数，不依赖 obsidian / DOM）
//
// 设计要点（2026-09-02 定，机制现状与改动守则见 激活机制报告.md）：
//   1. 非对称验签：这里只放公钥，用户拿到全部代码也造不出有效激活码（对称密钥方案做不到这点）
//   2. 每次启动重验，不缓存「已激活」布尔值 → 手改 data.json 无效，状态永远由「码本身是否有效」决定
//   3. 每个码内嵌 lid（唯一许可证号）→ 以后上线服务器可直接按 lid 回溯激活次数，历史码无需换发
//   4. 不做代码混淆：非对称方案下客户端没有秘密可藏，混淆只增加维护成本
//
// 运行环境：main.js 用「fs 读源码 + new Function」装载（Obsidian require 不认相对路径）；
//           test.mjs 可直接 require（Node 22 有全局 crypto.subtle）。
'use strict';

// ===== 常量 =====

// 产品标识：别的产品的激活码在本插件无效（payload 里也有一份，两边都对上才算通过）
const LICENSE_PRODUCT_ID = '28-notes';

// 码格式版本：以后升级 payload 结构时靠它分流，老码继续按老规则验
const LICENSE_FORMAT_VERSION = 1;

// 展示用前缀（给用户看的形态：28N-XXXXXX-XXXXXX-…）；归一化时会先剥掉
const LICENSE_CODE_PREFIX = '28N';

// 激活回执前缀（用户可把回执发给作者，用于多设备/换设备时的设备计数）
const LICENSE_RECEIPT_PREFIX = '28R';

// 免费试用天数（首次安装自动开始，无需激活码）
const TRIAL_DAYS = 14;

// 签名算法：ECDSA P-256 + SHA-256。选它而不是 RSA 是因为签名只有 64 字节（base64url 86 字符），
// RSA-2048 要 344 字符，整个激活码会长到 540+ 字符，微信发码/用户复制都难受。
// 两者安全性对本地验证场景都够用。
const LICENSE_ALG = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };

// 公钥（SPKI DER 的 base64）。只能验签、不能签发，公开无害。
// ⚠️ 私钥在作者本机 ~/.28notes-license/private.pem，绝不能进仓库 / 进发布包。
// ⚠️ 轮换密钥对 = 废掉所有已发出的码（用户手里的码全部失效），只在极端情况做；
//    日常处理滥用请用下面的 REVOKED_LICENSE_IDS 按 lid 拉黑。
const LICENSE_PUBLIC_KEY_B64 =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEH2mJCwXuY6CxEBgLgsQpV/slEWOZuETNQuqrDT/bUbfRAqHu2mXerWNNiQ2ry+uSmnRG1INgPIDED710vhca4w==';

// 吊销名单（按 lid）。发现某个码被公开传播/退款/滥用 → 把它的 lid 加进来 → 发新版本 →
// 该码在用户更新插件后失效。注意：依赖用户更新才生效，这是本地方案的固有上限。
// 单个码拉黑优先用这里，不要动密钥对（动密钥会误伤所有付费用户）。
const REVOKED_LICENSE_IDS = [
  // 例：'K7F3QM2X', // 2026-09-02 作废（原因：退款/滥用）
];

// ===== 付费功能门控表 =====
//
// 全插件的免费/付费边界只在这一张表登记：
//   locked: true → 未激活时拦该功能（试用期内放行；拦法 = 按钮悬浮变 ticket + 点击进激活弹窗）
//   freeCap: N   → 免费用户最多用 N 个/次（可选，不配 = 不限量；locked 为 false 时才有意义）
//   name         → 给用户看的功能名（Pro 详情页 / 设置页展示用）
//
// ⚠️ 实际拦截不在此读表：
//   - iframe 内按钮统一走 applyProGate（实时读 state.isPro，随 init/licenseUpdate 下发），见 mindmap-app.js
//   - host 侧右下角折叠数字用 licenseState.active 拦截，见 main.js mkFoldStatusBtn
// 本表 = 付费边界登记处 + Pro 详情页文案来源。要加/减 Pro 功能：先想清楚是否真要锁，
// 改这张表，再去对应按钮接 applyProGate。
const PRO_LOCKS = {
  basicEdit:       { locked: false, name: '基础编辑（增删节点、撤销重做、下钻）' },
  pathLink:        { locked: false, name: '路径链接（上一/下一/保存默认路径）' },
  nowNode:         { locked: true,  name: 'Now 节点（侧边/节点菜单的 Now 按钮）' },
  minorHide:       { locked: true,  name: 'Minor（隐藏完成）按钮' },
  fold:            { locked: true,  name: '折叠层级（左侧折叠按钮 + 右下角高级折叠数字）' },
  saveShortcut:    { locked: true,  name: '保存为捷径（右键菜单）' },
  history:         { locked: false, name: '历史记录与版本快照', note: '存储成本型功能，是常见的 Pro 卖点' },
  premiumThemes:   { locked: false, name: '进阶主题（飞书蓝线/粉线/Obsidian/MindNode）', note: '基础灰线主题保持免费' },
  noteStyle:       { locked: false, name: '备注区颜色与字号自定义', note: '设置页已接好接入点，改 true 即上锁' },
  aiPath:          { locked: true,  name: '复制 AI 定位路径', note: '把当前节点/路径作为上下文发给 AI' },
};

// 功能当前是否可用（isPro = 已激活或仍在试用期）。
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

// 免费用户已用 count 次后，再用一次是否还放行
function underFreeCap(featureId, count, isPro) {
  return isPro === true || count < freeCapOf(featureId);
}

// ===== 工具：base64url / 字节 =====

// base64url 编码（浏览器/Node 通用，不依赖 Buffer）
function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// base64url 解码（宽松：同时接受标准 base64 的 +/ 与填充 =，用户从不同地方粘贴的形态都能吃下）
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
// ⚠️ 两个坑：
//  1. 不能统一大小写！base64 大小写敏感（十六进制形态的码能转大写，我们这种不能）。
//  2. 只能删空白，不能删横线！base64url 字符集里本来就含 '-' 和 '_'（替代标准 base64 的 + /），
//     所以分组展示必须用【空格】而不是横线——用横线的话归一化时连码本身的字符一起删了，
//     签名会从 64 字节变成 62 字节，永远验不过（2026-09-02 实踩）。
// 做法：去所有空白 → 剥 28N 前缀（含后面的分隔符）→ 剩下的原样保留。
function normalizeLicenseCode(raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, '');
  const upper = s.toUpperCase();
  if (upper.startsWith(LICENSE_CODE_PREFIX + '-')) return s.slice(LICENSE_CODE_PREFIX.length + 1);
  if (upper.startsWith(LICENSE_CODE_PREFIX)) return s.slice(LICENSE_CODE_PREFIX.length);
  return s;
}

// ===== 验签（核心）=====
//
// 返回 { valid, reason, payload }
// reason 是给 i18n 用的键后缀：license.err.<reason>
// opts: { now?: Date, extraRevoked?: string[], publicKey?: string }
//   ├ now / extraRevoked：测试用（模拟过期、模拟拉黑）
//   └ publicKey：仅测试用——注入临时密钥对的公钥，这样自动化测试不需要真私钥
//     就能跑完整流程（真私钥绝不能进仓库，测试里也不能出现真激活码，否则发布包=白嫖）
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

  // 1) 吊销名单优先于验签：被拉黑的码无论签名多正确都不放行
  //    （先解析 payload 拿 lid；解析失败就等下面验签那步一并报错）
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

  // 3) 产品对得上（防止别的产品/测试码混进来）。p 是紧凑字段名，product 是早期长名，两个都认。
  if ((payload.p || payload.product) !== LICENSE_PRODUCT_ID) return { valid: false, reason: 'product' };

  // 4) 有效期（买断制签很远的时间；订阅制签真实到期日，同一套逻辑）
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

// 到期时间解析：支持 Unix 秒（紧凑格式，当前签发脚本用这个）和 ISO 字符串（可读，调试时方便手搓）
function parseExpiry(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw * 1000; // 秒 → 毫秒
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw) * 1000;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

// ===== 设备标识 =====
//
// 安装级 UUID：同一台机器同一个 vault 稳定，换 vault / 重装系统会变（这是特性不是 bug）。
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

// 激活回执：28R-<lid>-<设备摘要8位>
// 同一台设备 + 同一个码 → 回执恒定（不含时间），你收到多个回执按「设备摘要」去重就能数出设备数。
// 它不含任何秘密，作用只是让你在不联网的情况下人工核对「这个码用了几台机器」。
async function buildReceipt(lid, deviceId) {
  const devHash = (await digestHex(String(lid) + '|' + String(deviceId))).slice(0, 8);
  return LICENSE_RECEIPT_PREFIX + '-' + String(lid || 'UNKNOWN') + '-' + devHash.toUpperCase();
}

// ===== 14 天免费试用（2026-09-02）=====
//
// 试用是「营销钩子」，不是「保险柜」：本地记录的起始时间理论上可被改系统时间/删 data.json 绕过。
// 这里做一道「防时钟回拨」——记录一个单调递增的 lastSeenAt（每次启动取 max(now, 上次值)），
// 用户把时间往回拨，剩余试用天数也不会变多（用 lastSeenAt 兜底当前时间）。
// 回拨绕过试用只影响单个用户多试几天，不产生付费破解，属可接受范围；付费安全靠签名机制保证。
//
// 返回 { status, remainingMs, totalMs }
//   status: 'none'（没开始）| 'active'（试用中）| 'expired'（已结束）
// days：可选，覆盖默认 TRIAL_DAYS（调试用；正式版固定 14）
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

// ===== 激活尝试限流（防爆破 / 防手滑狂点）=====
//
// 内存态（重启 Obsidian 重新计数）。签名本身不可爆破，这个限流只为体验：
// 失败太多次就锁一会儿，别让用户对着报错狂点。
function makeAttemptLimiter(opts) {
  const o = opts || {};
  const maxAttempts = o.maxAttempts || 5;
  const lockMs = o.lockMs || 15 * 60 * 1000;
  const windowMs = o.windowMs || 30 * 60 * 1000;
  let failures = []; // 失败时间戳

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
