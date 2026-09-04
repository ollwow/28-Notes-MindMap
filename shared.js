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

module.exports = {
  splitFrontmatter, parseFmAttrs, kindOfAttrs, kindOfText,
  SPEC_PATH, MINDMAP_FM, MINDMAP_TEMPLATE,
  buildMmlinkText, sanitizeAttachmentName, uniqueAttachmentName,
};
