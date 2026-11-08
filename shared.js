// shared.js —— 纯函数（宿主 main.js require；测试 test.mjs 也 require；不依赖 obsidian/DOM）
// v2 格式（2026-08-29 定）：文件识别 = frontmatter `28notes: mindmap|mmlink`，不再靠文件名后缀
'use strict';

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// 简单 YAML 解析：只认顶行 `key: value`（我们的 frontmatter 只有平铺字段，不搞嵌套）
function parseFmAttrs(fmBody) {
  const attrs = {};
  // 换行符归一（2026-09-29）：CRLF 文件里每行末尾带 \r，`(.*)$` 会整行失配 → 属性全读不出来
  String(fmBody || '').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
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

// 文件类型识别：'mindmap' | 'mmlink' | 'doclink' | null
function kindOfAttrs(attrs) {
  const v = attrs && attrs['28notes'];
  return v === 'mindmap' ? 'mindmap' : v === 'mmlink' ? 'mmlink' : v === 'doclink' ? 'doclink' : null;
}
function kindOfText(text) {
  return kindOfAttrs(splitFrontmatter(text).attrs);
}

// 新建思维导图模板（ai 字段 = 给 AI 的软提醒，读者只有 AI，插件不读；路径必须完整相对路径）
// 2026-09-02 AI 指令区重构：入口统一指向 AI/index.md（指令清单+规则），格式契约挪到 AI/spec.md
// 2026-09-20：ai 提示**按语言两版**——新建那一刻取一次写进文件，之后切语言不回改存量文件（避免文字变来变去出错）。
//   文案与 i18n 的 fm.ai 保持一致（那边是界面语言表，这边是「纯函数模块」不能依赖 i18n，故各留一份）。
const SPEC_PATH = '28Notes-Files/AI/System Files/spec.md';   // 2026-09-28：AI 契约改成分区结构，格式契约挪进 System Files/
const AI_INDEX_PATH = '28Notes-Files/AI/index.md';
const FM_AI_TEXT = {
  zh: '改本文件前先读 ' + AI_INDEX_PATH + '，严格按其指引操作，否则文件打开可能会出现严重乱码',
  en: 'Before editing this file, read ' + AI_INDEX_PATH + ' and follow it strictly — otherwise the file may show garbled content when opened',
};
// 按语言取 frontmatter（lang 不认识就按中文）
function mindmapFm(lang) {
  const ai = FM_AI_TEXT[lang === 'en' ? 'en' : 'zh'];
  return '---\n28notes: mindmap\nai: ' + ai + '\n---\n';
}
const MINDMAP_FM = mindmapFm('zh'); // 兼容常量：老调用点 / 自检用（中文版）
const MINDMAP_TEMPLATE = MINDMAP_FM + '- 未命名\n';

// 捷径文件内容（target = vault 相对路径；node = 节点 persistId，不是文字路径——同名节点靠文字定位会串）
function buildMmlinkText(target, node) {
  return '---\n28notes: mmlink\ntarget: ' + target + '\nnode: ' + (node || '') + '\n---\n';
}
// 文档捷径文件内容（2026-10-11 用户定）：target 直接指向 docs/ 里的文档文件——
//   打开它 = patchSetViewState 的 doclink 分支把 leaf 直接引到那份文档（type 保持 markdown），
//   一步到位看到文档本身，不经过导图视图、不用再点一次节点。
function buildDoclinkText(target) {
  return '---\n28notes: doclink\ntarget: ' + target + '\n---\n';
}

// 附件文件名净化（v2 §3.6）：空格→下划线；Obsidian 链接禁字符 # | ^ : %% [[ ]] → 下划线
function sanitizeAttachmentName(name) {
  return String(name || 'file')
    .replace(/\s+/g, '_')
    .replace(/#|\||\^|:|%%|\[\[|\]\]/g, '_');
}
// 笔记 / 捷径文件名净化（2026-09-20 定）：与附件名规则唯一的区别是**中间的空格保留**。
// 例：节点「我的 项目 计划」→ 捷径文件「我的 项目 计划.md」，而不是「我的_项目_计划.md」。
// 只去掉首尾空白（那是误敲的），换行 / 制表符不该出现在文件名里 → 折成空格。
// 禁字符（文件系统不允许或 Obsidian 链接语法冲突的）→ 下划线：# | ^ : * ? " < > [ ] / \
// 注意别动 sanitizeAttachmentName：附件名一律空格→下划线是历史行为，改了会让已有引用失配。
function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[\r\n\t]+/g, ' ')        // 换行 / 制表 → 空格
    .replace(/[#|^:*?"<>[\]/\\]+/g, '_') // 禁字符 → 下划线
    .replace(/\s+$|^\s+/g, '')         // 去首尾空白（中间的不动）
    .replace(/\.+$/, '');              // 去末尾的点（部分系统不允许以点结尾）
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

// ===== 删除已放入思维导图数据库的文档时：把导图里的引用替换成纯文字（2026-10-08）=====
// 认的写法：`[[名字]]` / `[[路径/名字]]` / `![[名字]]`（嵌入）/ 带别名的 `[[名字|别名]]` / `[[路径/名字|别名]]`
//   —— wikilink 本来就不带 .md 后缀，所以名字与路径都按**不带后缀**的形式比。
// ⚠️ 正则尾部锚死 `]]`：这样「测试」不会误伤「测试待转入」（那串后面跟的是 `待转入]]`，匹配不上）。
// ⚠️ 只替换**链接那一整段**（含可能的 `!` 前缀与别名），节点其它内容 / 子节点 / 备注一个字不动。
// 放在 shared.js（而不是 main.js）就是为了**能被 test.mjs 直接跑真用例** —— 这是本功能唯一会改用户文件的地方。
function replaceDocLinks(text, base, docPath, placeholder) {
  let out = String(text || '');
  const stems = [String(base || ''), String(docPath || '').replace(/\.md$/i, '')];
  for (const n of stems) {
    if (!n) continue;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('!?\\[\\[' + esc + '(?:\\|[^\\]\\n]*)?\\]\\]', 'g'), placeholder);
  }
  return out;
}

// ===== 删除已放入思维导图数据库的文档时：节点里**只有这一个链接** → 整个节点删掉（2026-10-08 用户定）=====
// 与 replaceDocLinks 的分工：
//   - 节点里除了这个链接还有别的文字 → 那个节点还有意义 → 只把链接换成纯文字占位符；
//   - 节点里**只有这一个链接** → 这个节点存在的唯一理由就是指向那份文档 → 整行删掉。
// 子节点**保留**：被删行下面缩进更深的连续行整体减一级（提升到上一层），内容一个字不丢。
// 同样放 shared.js：这是唯一会改用户文件的地方，必须能被 test.mjs 直接跑真用例。
function docRefLinkEscapes(base, docPath) {
  return [String(base || ''), String(docPath || '').replace(/\.md$/i, '')]
    .filter(Boolean)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}
// 行尾注释里的**节点级标记**（与前端 commentFor() 写的字段一一对应：fold / color / minor / now / ainode）。
// 只要带一个，这个节点就**不是空壳** —— 用户 2026-10-09 明确：节点上有标记（todo / now / 关注 / 改过色…）时
// 不要把它删掉，只把链接换成占位文字。
//   `id:` 不算 —— 它只是身份标记，几乎每个被复制过链接的节点都有，不代表用户在这个节点上放了东西。
const DOC_REF_NODE_FLAGS = ['fold:', 'color:', 'minor:', 'now:', 'ainode:'];
// 这一行是不是「只有一个指向目标文档的链接」的节点行（行首列表标记 + 行尾注释都不算内容）。
function docRefLineOnlyLink(line, base, docPath) {
  const m = String(line || '').match(/^[ \t]*[-*+][ \t]+([\s\S]*)$/);
  if (!m) return false;
  const cm = m[1].match(/\s*<!--([\s\S]*?)-->\s*$/);
  const comment = cm ? cm[1] : '';
  if (DOC_REF_NODE_FLAGS.some((f) => comment.indexOf(f) >= 0)) return false;
  const body = m[1].replace(/\s*<!--[\s\S]*?-->\s*$/, '').trim();
  if (!body) return false;
  return docRefLinkEscapes(base, docPath)
    .some((esc) => new RegExp('^!?\\[\\[' + esc + '(?:\\|[^\\]\\n]*)?\\]\\]$').test(body));
}
// 这个节点行是不是**空壳**：除了那一行链接，自己身上**没有别的任何东西**。
//   「别的东西」= 多行标题的续行（同缩进、非列表标记开头）/ 备注（`> `）/ 图片嵌入 / 不认得的行 / AI 规则块。
//   子节点（更深的列表行）**不算** —— 那种情况照既定设计删掉这行、把子节点提升一级（用户 2026-10-08 定）。
//   ⚠️ 用户 2026-10-09 定：节点有备注 / 标记 / 图片 / AI 标记时**不要**删节点，只把链接换成占位文字。
function docRefNodeIsShell(lines, i, base, docPath) {
  if (!docRefLineOnlyLink(lines[i], base, docPath)) return false;
  const ind = (String(lines[i]).match(/^[ \t]*/) || [''])[0];
  for (let j = i + 1; j < lines.length; j++) {
    const ln = lines[j];
    if (!ln.trim()) continue;                                  // 空行中性，不打断
    const nind = (ln.match(/^[ \t]*/) || [''])[0];
    if (nind.length < ind.length) break;                       // 缩进更浅 → 这个节点结束了
    const isItem = /^[ \t]*[-*+][ \t]/.test(ln);
    if (nind.length === ind.length && isItem) break;           // 同缩进的兄弟节点 → 结束
    if (nind.length > ind.length && isItem) continue;          // 更深的子节点 → 不算"自己的内容"
    return false;                                              // 续行 / 备注 / 图片 / raw / AI 规则 → 不是空壳
  }
  return true;
}
// 这份正文用的是哪种缩进单位：优先 Tab；否则取最短的一段行首空格（导图正文本来就只有一种）。
function detectIndentUnit(text) {
  const s = String(text || '');
  if (/(?:^|\n)\t/.test(s)) return '\t';
  let best = '';
  const re = /(?:^|\n)( +)\S/g;
  let m;
  while ((m = re.exec(s))) { if (!best || m[1].length < best.length) best = m[1]; }
  return best || '\t';
}
// 这一行里有几个指向目标文档的链接（用于「只取消某一处」时定位到第 N 个所在的行）
function docRefCountIn(line, base, docPath) {
  let n = 0;
  for (const esc of docRefLinkEscapes(base, docPath)) {
    const m = String(line || '').match(new RegExp('!?\\[\\[' + esc + '(?:\\|[^\\]\\n]*)?\\]\\]', 'g'));
    if (m) n += m.length;
  }
  return n;
}
// 逐行过一遍：**空壳**节点整行删掉（子节点提升一级），其余的行只把链接替换成占位文字。
// ⚠️ 提升上来的子块**自己可能还是空壳**（`- [[X]]` 套 `- [[X]]`）→ 递归再处理一遍，
//    否则那层链接不会被替换、会留在文件里指着一个已经不存在的文档。
// `only`（2026-10-09 加，可选）：只处理**第 only 个**链接所在的那一行（0 基），其余行原样。
//   用途 = 「取消某一处管理」—— 一处一处地取消，不能一次把这张图里的引用全清掉。
function removeDocRefs(text, base, docPath, placeholder, only) {
  const src = String(text || '');
  const unit = detectIndentUnit(src);
  const lines = src.split('\n');
  let onlyLine = -1;
  if (only != null) {
    let k = 0;
    for (let i = 0; i < lines.length && onlyLine < 0; i++) {
      const c = docRefCountIn(lines[i], base, docPath);
      if (c && k + c > only) onlyLine = i; else k += c;
    }
    if (onlyLine < 0) return src;   // 找不到（内容已经变了）→ 原样返回，别乱改
  }
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (onlyLine >= 0 && i !== onlyLine) { out.push(lines[i]); i++; continue; }   // 只动那一行
    if (!docRefNodeIsShell(lines, i, base, docPath)) {
      out.push(replaceDocLinks(lines[i], base, docPath, placeholder));
      i++;
      continue;
    }
    // 空壳节点：这一行丢掉，把它的子树（更深的行）整体提升一级，再重新处理这段提升后的内容
    const ind = (lines[i].match(/^[ \t]*/) || [''])[0];
    let j = i + 1;
    const kids = [];
    while (j < lines.length) {
      const nx = lines[j];
      if (!nx.trim()) { kids.push(nx); j++; continue; }               // 空行原样留着
      const nind = (nx.match(/^[ \t]*/) || [''])[0];
      if (nind.length <= ind.length || !nind.startsWith(ind)) break;  // 不再是它的子节点 → 子树结束
      kids.push(nx.startsWith(unit) ? nx.slice(unit.length) : nx.replace(/^[ \t]+/, ''));
      j++;
    }
    if (kids.length) {
      const sub = removeDocRefs(kids.join('\n'), base, docPath, placeholder);
      if (sub) for (const s of sub.split('\n')) out.push(s);   // sub 为空 = 子块整个也没了 → 一行都别吐
    }
    i = j;
  }
  return out.join('\n');
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

// Obsidian 嵌入尺寸后缀：![[img.png|700]] / ![[img.png|700x300]] —— 尾段是显示尺寸，不是文件名。
// 宿主解析资源（main.js resolveResource）先剥它再找文件；前端 mindmap-app.js 的 nmEmbedSize 是
// 同一件事的另一份实现（前后端语言不通各写一份），改一处记得改两处。
function splitEmbedSize(p) {
  const s = String(p == null ? '' : p);
  const bar = s.lastIndexOf('|');
  if (bar < 0) return { name: s, w: 0, h: 0 };
  const m = s.slice(bar + 1).trim().match(/^(\d+)(?:x(\d+))?$/i);
  if (!m) return { name: s, w: 0, h: 0 };
  return { name: s.slice(0, bar).trim(), w: parseInt(m[1], 10) || 0, h: parseInt(m[2], 10) || 0 };
}

module.exports = {
  splitFrontmatter, parseFmAttrs, kindOfAttrs, kindOfText, splitEmbedSize,
  SPEC_PATH, MINDMAP_FM, MINDMAP_TEMPLATE, mindmapFm,
  buildMmlinkText, buildDoclinkText, sanitizeAttachmentName, sanitizeFileName, uniqueAttachmentName,
  replaceDocLinks, removeDocRefs, docRefLineOnlyLink, docRefNodeIsShell, DOC_REF_NODE_FLAGS,
  ATTACH_DIR, attachmentLookupVariants, findOrphanAttachmentNames,
};
