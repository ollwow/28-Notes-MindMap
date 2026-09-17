// shared.js —— 纯函数（宿主 main.js require；测试 test.mjs 也 require；不依赖 obsidian/DOM）
// v2 格式（2026-08-29 定）：文件识别 = frontmatter `28notes: mindmap|mmlink`，不再靠文件名后缀
'use strict';

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// 简单 YAML 解析：只认顶行 `key: value`（我们的 frontmatter 只有平铺字段，不搞嵌套）
function parseFmAttrs(fmBody) {
  const attrs = {};
  String(fmBody || '').split('\n').forEach(line => {
    const m = line.match(/^([^\s:#][^:]*):\s*(.*)$/);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    attrs[m[1].trim()] = v;
  });
  return attrs;
}

// 拆 frontmatter → { fm（含 --- 行原文，无则 ''）, body, attrs }
function splitFrontmatter(text) {
  const t = String(text || '');
  const m = t.match(FM_RE);
  if (!m) return { fm: '', body: t, attrs: {} };
  return { fm: m[0], body: t.slice(m[0].length), attrs: parseFmAttrs(m[1]) };
}

// 文件类型识别：'mindmap' | 'mmlink' | null
function kindOfAttrs(attrs) {
  const v = attrs && attrs['28notes'];
  return v === 'mindmap' ? 'mindmap' : v === 'mmlink' ? 'mmlink' : null;
}
function kindOfText(text) {
  return kindOfAttrs(splitFrontmatter(text).attrs);
}

// 新建思维导图模板（ai 字段 = 给 AI 的软提醒，读者只有 AI，插件不读；路径必须完整相对路径）
// 2026-09-02 AI 指令区重构：入口统一指向 AI/index.md（指令清单+规则），格式契约挪到 AI/spec.md
const SPEC_PATH = '28Notes-Files/AI/spec.md';
const AI_INDEX_PATH = '28Notes-Files/AI/index.md';
const MINDMAP_FM = '---\n28notes: mindmap\nai: 改本文件前先读 ' + AI_INDEX_PATH + '，严格按其指引操作，否则文件打开可能会出现严重乱码\n---\n';
const MINDMAP_TEMPLATE = MINDMAP_FM + '- 未命名\n';

// 捷径文件内容（target = vault 相对路径；node = 节点 persistId，不是文字路径——同名节点靠文字定位会串）
function buildMmlinkText(target, node) {
  return '---\n28notes: mmlink\ntarget: ' + target + '\nnode: ' + (node || '') + '\n---\n';
}

// 附件文件名净化（v2 §3.6）：空格→下划线；Obsidian 链接禁字符 # | ^ : %% [[ ]] → 下划线
function sanitizeAttachmentName(name) {
  return String(name || 'file')
    .replace(/\s+/g, '_')
    .replace(/#|\||\^|:|%%|\[\[|\]\]/g, '_');
}
// 保留原名 + 追加随机串（4 位），防同名覆盖
function uniqueAttachmentName(name) {
  const clean = sanitizeAttachmentName(name);
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  return stem + '-' + Math.random().toString(36).slice(2, 6) + ext;
}

// ===== 附件清理（2026-09-16「清理未使用的图片」）=====
// 附件目录（相对 vault 根）：插件唯一的二进制写入点（savePastedImage），清理只针对它
const ATTACH_DIR = '28Notes-Files/images';

// 生成一个附件名在正文里所有可能的形态（用于 includes 匹配）：
// 引用写法十几种（wiki 嵌入 / markdown 链接 / 快照 json / 裸文件名），枚举语法必然漏——
// 反过来做：只认「文件名字符串在文本里出现过一次」就算被引用。保守方向 = 宁可多保留。
// 变体覆盖：原名 / URL 解码（%20→空格）/ 编码（空格→%20）/ 路径剥除 / 大小写（比对统一转小写，macFS 不分大小写）
function attachmentLookupVariants(name) {
  const clean = String(name || '').trim();
  if (!clean) return [];
  const base = clean.slice(clean.lastIndexOf('/') + 1); // 引用可能带路径前缀，取文件名
  const out = new Set();
  const push = (v) => { if (v) out.add(String(v).toLowerCase()); };
  push(base);
  try { push(decodeURIComponent(base)); } catch (_) {}
  push(encodeURI(base));
  push(base.replace(/%20/g, ' '));
  push(base.replace(/ /g, '%20'));
  return Array.from(out);
}

// 孤儿判定（纯函数，可单测）：候选附件名逐个去全库文本（已合并为单串）里找，
// 任何形态出现过 = 被引用保留；所有形态都没出现 = 真孤儿。
// 硬性要求：宁可漏删一千，不可误删一张——匹配一律往「多保留」方向偏。
function findOrphanAttachmentNames(candidates, bigText) {
  const big = ('\n' + String(bigText || '') + '\n').toLowerCase(); // 全文转小写：与变体的小写比对口径一致（macFS 不分大小写）
  const orphans = [];
  (candidates || []).forEach((name) => {
    const variants = attachmentLookupVariants(name);
    const used = variants.some((v) => big.indexOf(v) !== -1);
    if (!used) orphans.push(name);
  });
  return orphans;
}

module.exports = {
  splitFrontmatter, parseFmAttrs, kindOfAttrs, kindOfText,
  SPEC_PATH, MINDMAP_FM, MINDMAP_TEMPLATE,
  buildMmlinkText, sanitizeAttachmentName, uniqueAttachmentName,
  ATTACH_DIR, attachmentLookupVariants, findOrphanAttachmentNames,
};
