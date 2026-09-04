// main.js —— 28Notes MindMap（Obsidian 版）宿主
// 职责（对应 VSCode 版 extension.js 的角色）：
//   1. TextFileView + monkey-patch setViewState：点开 frontmatter 带 28notes 的 md → 零闪烁进导图视图
//   2. iframe 承载前端（mindmap-app.js/css，与 VSCode webview 同源）：隔离 DOM/CSS，多视图互不干扰
//   3. 实现前端消息协议（update/imgUri/pasteImg/snapshot/openFile/openNote/捷径……）
//   4. v2 格式：frontmatter 识别、捷径 frontmatter（target/node）、附件集中 28Notes-Files/、rename 同步
// 保存策略：每次改动实时写盘（与 VSCode 版一致）；同文件多视图写入时互推 sync 防回环
'use strict';

const { Plugin, PluginSettingTab, Setting, MarkdownRenderer, TextFileView, WorkspaceLeaf, TFile, TFolder, Notice, setIcon, moment, Modal } = require('obsidian');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto'); // isAuthorMachine 真验证用（2026-09-04）

// 作者本机检测（2026-09-04 升级为真验证）：从 private.pem 导出公钥，与 license.js 内嵌公钥
// 逐字节比对，一致才算作者本机。用于「调试栏」只在作者本机显示。
// ⚠️ 旧版只 existsSync 文件：随便建个空文件 ~/.28notes-license/private.pem 就能解锁
//    调试栏 → 下拉选「试用剩 14 天」= 全功能永久免费（2026-09-04 安全审查发现后门，已堵上）。
//    真验证下：空文件/垃圾内容抛异常、假私钥导出公钥对不上，一律出局。
function isAuthorMachine() {
  try {
    if (!license || !license.LICENSE_PUBLIC_KEY_B64) return false; // 许可证模块没装上 → 按普通用户（安全兜底）
    const pem = fs.readFileSync(path.join(os.homedir(), '.28notes-license', 'private.pem'), 'utf8');
    const derived = crypto.createPublicKey(pem).export({ format: 'der', type: 'spki' }).toString('base64');
    return derived === license.LICENSE_PUBLIC_KEY_B64;
  } catch (e) { return false; }
}

// 读作者本机的调试激活码（~/.28notes-license/debug-license-code.txt）。
// ⚠️ 安全设计（2026-09-04）：测试码**绝不能写死在 main.js**——发布包里谁都能翻到，
//    那就等于白送一个有效激活码。改成只在作者机器上才存在的文件：发布包里没有码，
//    普通用户机器上既没 private.pem（isAuthorMachine=false）也没这个文件 → 读不到 → 零泄露。
//    读不到返回 ''，调用方按「无法激活」处理。
function readDebugLicenseCode() {
  try {
    if (!isAuthorMachine()) return '';
    const p = path.join(os.homedir(), '.28notes-license', 'debug-license-code.txt');
    const s = fs.readFileSync(p, 'utf8').replace(/\s+/g, '').trim(); // 去空白（与 normalizeLicenseCode 同处理）
    return s || '';
  } catch (e) { return ''; }
}

// 调试用：把「本机授权状态」强制设成某个形态（2026-09-04，仅作者本机 + 调试开关打开时可见）
// - fromFile:true → 选「已激活」时用 readDebugLicenseCode() 从本机文件拿测试码走真实激活流程。
//   码不在本表、更不在发布包（见上方 readDebugLicenseCode 的 ⚠️）。
// - remainingMs < 0 → 强制「未激活（试用已结束）」；否则 = 想让试用期剩下的时长。
// 说明：早期版本调试改的是「试用总天数」，本表改的是「现在还剩多久」——
// 后者才是调试真正需要的（要测到期表现，不用真等 14 天）。
const DEBUG_LICENSE_STATES = {
  'license': { label: '已激活（读取本机测试码）',  fromFile: true },
  'expired': { label: '未激活（试用已结束）',        remainingMs: -1 },
  '2min':    { label: '试用期，剩余 2 分钟',        remainingMs: 2 * 60 * 1000 },
  '1hour':   { label: '试用期，剩余 1 小时',        remainingMs: 60 * 60 * 1000 },
  '1day':    { label: '试用期，剩余 1 天',          remainingMs: 24 * 60 * 60 * 1000 },
  '14day':   { label: '试用期，剩余 14 天（新用户默认）', remainingMs: 14 * 24 * 60 * 60 * 1000 },
};

// ⚠️ Obsidian 的插件 require 不认相对路径（require('./shared.js') 会 Cannot find module → 加载失败，2026-08-29 实踩）
// 解法：fs 读 shared.js 源码 + new Function 装载（shared.js 仍是单源，test.mjs 直接 require 它不受影响）
let shared = null;
let license = null; // license.js 许可证验证模块（loadLicense 装载；2026-09-02 新增付费激活机制）
let i18n = null; // i18n.js 文案中心（loadI18n 装载；onload 里 setLang）
let T = (...args) => i18n.T(...args); // 文案取值（onload 装载后可用；iframe 由注入的 i18n.js 提供同名 T）
let modStr = (s) => i18n.modStr(s); // 快捷键键名按平台：{Mod}/{Alt} → Mac(Cmd/Option) / Win-Linux(Ctrl/Alt)
function loadShared(absDir) {
  const code = fs.readFileSync(path.join(absDir, 'shared.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}
function loadI18n(absDir) {
  const code = fs.readFileSync(path.join(absDir, 'i18n.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}
function loadLicense(absDir) {
  const code = fs.readFileSync(path.join(absDir, 'license.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const VIEW_TYPE = '28notes-mindmap';
const ATTACH_ROOT = '28Notes-Files';
const IMG_DIR = ATTACH_ROOT + '/images';
const HISTORY_ROOT = ATTACH_ROOT + '/history';

// 左侧 Ribbon / 文件树徽章共用的插件图标 SVG（Frame.svg 内联，2026-08-30 定）。徽章选「图标」模式时
// 通过 encodeURIComponent 装进 url("data:image/svg+xml;…") 作 background-image / content。色用 currentColor。
const RIBBON_ICON_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_2018_5)"><path d="M22.5927 12.0147C22.5927 14.7781 20.3465 17.0243 17.5822 17.0243C16.9523 17.0243 16.3492 16.9076 15.7959 16.6896C16.3153 16.4964 16.7913 16.215 17.2092 15.8661C17.3318 15.8789 17.4563 15.885 17.5822 15.885C19.7207 15.885 21.4534 14.1523 21.4534 12.0147C21.4534 9.87707 19.7207 8.14348 17.5822 8.14348C17.457 8.14348 17.3332 8.14943 17.2114 8.16221C16.793 7.81182 16.3162 7.52923 15.7959 7.33536C16.3492 7.11699 16.9523 7 17.5822 7C20.3465 7 22.5927 9.25128 22.5927 12.0147Z" fill="currentColor"/><path d="M14.0096 17.0243C16.773 17.0243 19.0192 14.7781 19.0192 12.0147C19.0192 9.25128 16.773 7 14.0096 7C11.2462 7 9 9.25128 9 12.0147C9 14.7781 11.2462 17.0243 14.0096 17.0243ZM14.0096 15.885C11.872 15.885 10.1393 14.1523 10.1393 12.0147C10.1393 9.87707 11.872 8.14348 14.0096 8.14348C16.1472 8.14348 17.8808 9.87707 17.8808 12.0147C17.8808 14.1523 16.1472 15.885 14.0096 15.885Z" fill="currentColor"/></g><path d="M2 11.35C1.64101 11.35 1.35 11.641 1.35 12C1.35 12.359 1.64101 12.65 2 12.65L2 12L2 11.35ZM2 12L2 12.65L10 12.65L10 12L10 11.35L2 11.35L2 12Z" fill="currentColor"/></svg>';
const RIBBON_ICON_DATA_URL = 'url("data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(RIBBON_ICON_SVG) + '")';

function log(...args) { console.log('[Shin MindMap]', ...args); }

// ===== 前端资源（插件目录内文件，一次性读入内存；改文件后重载插件生效）=====
function readPluginText(pluginDir, rel) {
  try { return fs.readFileSync(path.join(pluginDir, rel), 'utf8'); }
  catch (e) { log('读取插件资源失败: ' + rel + ' — ' + e); return ''; }
}

// ===== iframe 页面骨架（与 VSCode 版 getHtml 的 body 一致；CSS 内联，脚本由宿主在 load 后注入）=====
function buildFrameHtml(cssText, lang) {
  return `<!DOCTYPE html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${cssText}
</style>
</head>
<body>
<div id="error-box" class="hidden"></div>
<div id="warn-box" class="hidden"></div>
<div id="view-map"><div id="crumb" class="hidden"></div><div id="canvas"><div id="tree"></div></div></div>
<button id="pro-cta" class="tb pro-cta hidden" type="button">${T('pro.ctaBtn')}</button>
<div id="left-toolbar">
  <button class="tb hidden" id="btn-refresh" title="${T('frame.refresh')}"></button>
  <div class="dp-wrap" id="now-locate-wrap">
    <button class="tb" id="btn-locate" data-icon-key="locate"></button>
    <div id="now-menu"></div>
  </div>
  <button class="tb" id="btn-drill" data-icon-key="log-in"></button>
  <div class="dp-wrap" id="now-wrap">
    <button class="tb" id="btn-now-side" title="${T('frame.nowSide')}"></button>
  </div>
  <button class="tb" id="btn-hide-done" data-icon-key="hide"></button>
  <button class="tb" id="btn-fold" data-icon-key="chevrons-down-up"></button>
  <div class="dp-wrap" id="more-wrap">
    <button class="tb" id="btn-more" data-icon-key="more"></button>
    <div id="more-menu">
  <button class="mm" data-act="add-child" disabled data-icon="arrow-right-from-line" data-label="${T('mm.addChild')}" data-shortcut="Tab"></button>
  <button class="mm" data-act="add-sibling" disabled data-icon="arrow-left-to-line" data-label="${T('mm.addSibling')}" data-shortcut="Enter"></button>
  <button class="mm" data-act="delete" disabled data-icon="trash-2" data-label="${T('mm.delete')}" data-shortcut="Delete"></button>
  <button class="mm" data-act="undo" data-icon="corner-up-left" data-label="${T('mm.undo')}" data-shortcut="${modStr('Cmd+Z')}"></button>
  <button class="mm" data-act="redo" data-icon="corner-up-right" data-label="${T('mm.redo')}" data-shortcut="${modStr('Cmd+Shift+Z')}"></button>
  <div class="mm-sep"></div>
  <div class="mm-link-wrap" id="mm-link-wrap">
    <button class="mm" data-act="default-path" data-icon="slash" data-label="${T('mm.pathLink')}"></button>
    <div id="default-path-menu" class="dp-menu">
      <button class="dp-item" id="mi-path-back"><span class="dp-ic" data-ic="undo"></span><span>${T('mm.pathBack')}</span></button>
      <button class="dp-item" id="mi-path-fwd"><span class="dp-ic" data-ic="redo"></span><span>${T('mm.pathFwd')}</span></button>
      <button class="dp-item" id="mi-path-default"><span class="dp-ic" data-ic="slash"></span><span>${T('mm.pathDefault')}</span></button>
      <button class="dp-item" id="mi-path-save"><span class="dp-ic" data-ic="save"></span><span>${T('mm.pathSave')}</span></button>
    </div>
  </div>
  <div class="mm-sep mm-hidden"></div>
  <button class="mm mm-hidden" data-act="toggle-debug" data-icon="bug" data-label="${T('mm.debug')}"></button>
  <div class="mm-sep"></div>
  <button class="mm" data-act="history" data-icon="history" data-label="${T('mm.history')}"></button>
  <button class="mm" data-act="save-snapshot" data-icon="save" data-label="${T('mm.saveVersion')}"></button>
  <div class="mm-sep"></div>
  <button class="mm" data-act="settings" data-icon="settings" data-label="${T('mm.settings')}"></button>
  <button class="mm" data-act="about" data-icon="bilibili-line" data-label="${T('mm.about')}"></button>
    </div>
  </div>
</div>
<div id="history-view" class="hidden">
  <div id="history-side">
    <div id="history-side-head">
      <div id="history-toolbar">
        <div class="hb-row">
          <button class="hb" data-act="exit" data-icon="log-in" data-label="${T('hist.exit')}"></button>
          <button class="hb" data-act="diff" data-icon="eye" data-label="${T('hist.diff')}"></button>
        </div>
        <div class="hb-row">
          <button class="hb" data-act="restore" data-icon="refresh-cw" data-label="${T('hist.restore')}"></button>
          <button class="hb" data-act="copy" data-icon="bookmark" data-label="${T('hist.copy')}"></button>
        </div>
      </div>
    </div>
    <div id="history-timeline"></div>
  </div>
</div>
<div id="view-md" class="hidden"><textarea id="md-editor" spellcheck="false" placeholder="${T('frame.mdPlaceholder')}"></textarea></div>
</body>
</html>`;
}

// ===== 思维导图视图（TextFileView 三件套之一；mindmap 与 mmlink 捷径共用本类）=====
class MindMapView extends TextFileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.kind = 'mindmap';      // 'mindmap' | 'mmlink'
    this.rawText = '';          // 本文件原文（getViewData 必须原样返回；捷径视图 = 捷径文件原文）
    this.fm = '';               // 本文件 frontmatter（mindmap 视图）
    this.bodyText = '';         // 数据正文（导图大纲部分，不含 frontmatter）
    this.lastWritten = '';      // 数据文件最后成功落盘内容（外部变更判定基线）
    this.targetFile = null;     // 数据文件 TFile（mindmap = this.file；mmlink = target 指向的文件）
    this.fileId = '';           // 数据文件的稳定 ID（frontmatter 28notes-id；历史快照/defaultPid 按它——内容的历史属于数据文件）
    this.viewId = '';           // 视图身份 ID（捷径视图 = 壳文件自己的 ID，不同捷径不共用；普通导图 = fileId）
    this.targetFm = '';         // 数据文件 frontmatter（mmlink 视图用）
    this.bookmarkNode = '';     // 捷径 node 字段（persistId）
    this.missing = false;       // 捷径目标缺失：禁止写入（防静默创建文件）
    this.drillPidOnce = '';     // 一次性下钻目标（openNote 带 #pid / 捷径首开）
    this.iframeReady = false;
    this.needInit = false;      // 数据就绪但 iframe 未 ready（或反之）→ 就绪后补 init
    this.recentWrites = [];     // 最近几次自己落盘的内容（防重入判定用，见 wasOwnWrite）
  }

  // ⚠️ 防重入加强版（2026-08-29 二踩，「打字后 Tab 新建不进编辑」的根因）：
  // 打字后 Tab = 两次几乎同时的写盘（保存标题 + 新建节点）。框架/ modify 监听读盘时可能读到
  // 中间态（第一次写入的内容），只跟最新写入比会误判为外部变更 → sendInit 重建树 → 杀掉新节点的选中与编辑。
  // 所以记录最近几次自己的写入，命中任何一个都算「自己写的」。
  noteWrite(full) {
    this.recentWrites.push(full);
    if (this.recentWrites.length > 5) this.recentWrites.shift();
  }
  wasOwnWrite(text) {
    return text === this.lastWritten || this.recentWrites.indexOf(text) >= 0;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file ? this.file.basename : T('common.mindmap'); }
  canAcceptExtension(ext) { return ext === 'md'; } // 让 Obsidian 复用已有标签页（单例复用）

  // getViewData 必须返回「本文件」原文——TextFileView 靠它写回。
  // 捷径视图返回捷径文件原文（不是下钻目标的内容！否则捷径会被目标内容覆盖作废）
  getViewData() { return this.rawText; }
  clear() {}

  async onOpen() {
    this.buildIframe();
  }

  async onClose() {
    // 2026-09-01 修「切到普通页面再回丢位置」：视图整体销毁（切普通 md/关标签）不走 rebind，
    // rebindIfNeeded 的 flush 覆盖不到这条路 → 销毁前同步落盘视图状态（__MM_FLUSH__ 是同步直调，
    // setView 消息在 iframe 销毁前已达宿主进程内存）。
    if (this.iframe && this.iframe.contentWindow && this.iframe.contentWindow.__MM_FLUSH__) {
      try { this.iframe.contentWindow.__MM_FLUSH__(); log('onClose flush: key=' + this.viewKey()); } catch (e) { log('onClose flush 失败: ' + e); }
    }
    // flush 发的 setView 消息已同步写入待落盘数据 → 立即落盘（不等 800ms 节流，防关窗/退出撞掉最后一次）
    if (this.fileId) this.plugin.flushViewPersistNow();
    if (this._initCoalesce) { clearTimeout(this._initCoalesce); this._initCoalesce = null; } // 视图已销毁，未发的合并 init 作废
    this.plugin.unregisterPanel(this);
    this.iframeReady = false;
  }

  async onLoadFile(file) {
    this.kind = this.plugin.detectKindSync(file.path) || 'mindmap';
    // ⚠️ 必须调 super：TextFileView 靠它读文件并回调 setViewData。
    // 2026-08-29 实踩：漏了 super → setViewData 从不执行 → targetFile 恒 null → 编辑全部静默不落盘、捷径 targetFile.parent 报 null
    await super.onLoadFile(file);
  }

  // Obsidian 读文件后回调（首次加载 + 框架因文件变动/标签切换的重载）
  setViewData(data, clear) {
    // ⚠️ 防重入（2026-08-29 实踩，Tab 新建不进编辑/空白节点不能双击的根因）：
    // 我们自己 writeData 落盘后，TextFileView 框架会因 modify 再回调本方法。
    // 是自己写的（含连续写盘的中间态）就直接忽略——否则 sendInit 会重建整棵树，杀掉编辑会话。
    if (!clear && this.iframeReady && this.wasOwnWrite(data)) return;
    this.rawText = data;
    if (this.kind === 'mmlink') { this.loadBookmark(data); return; }
    const parts = shared.splitFrontmatter(data);
    this.fm = parts.fm;
    this.bodyText = parts.body;
    this.lastWritten = data;
    this.targetFile = this.file;
    this.rebindIfNeeded();
    this.plugin.registerPanel(this);
    this.sendInitWhenReady();
  }

  // ⚠️ 视图复用防护（2026-08-29 实踩，捷径页视图串到源页的根因）：
  // canAcceptExtension('md') 让 Obsidian 用同一个视图对象打开不同的 md 文件；
  // iframe 不重建的话，上一个文件的前端状态（如下钻位置）会泄漏到下一个文件。
  // 绑定的数据文件（或类型）变了 → 重建 iframe，两个文件各自独立视图。
  rebindIfNeeded() {
    const key = this.kind + '|' + this.dataPath();
    if (this.boundKey && this.boundKey !== key) {
      // 2026-09-01 修「源思维导图切走再回位置丢失」：rebuild 销毁旧 iframe 前，同步让旧 iframe 把当前 view
      // 立即落盘（防 schedulePersist 150ms 去抖未执行就随 iframe 销毁丢失）。persistNow 发的 setView 消息已在途，
      // 即使紧接 buildIframe 销毁 iframe，main.js 仍会收到并存。
      if (this.iframe && this.iframe.contentWindow && this.iframe.contentWindow.__MM_FLUSH__) {
        try { this.iframe.contentWindow.__MM_FLUSH__(); log('rebind flush: oldKey=' + this.boundKey + ' newKey=' + key); } catch (e) { log('flush view 失败: ' + e); }
      } else log('rebind: __MM_FLUSH__ 未就绪（oldKey=' + this.boundKey + ' newKey=' + key + '）');
      this.buildIframe();
    }
    this.boundKey = key;
  }

  // ---- 捷径（mmlink）：数据在 target 文件里，本视图直接编辑目标导图 ----
  async loadBookmark(data) {
    const { attrs } = shared.splitFrontmatter(data);
    const target = attrs.target || '';
    // pid 清洗（2026-08-31 实踩）：手建捷径的 node 值可能混入不可见字符（零宽空格 U+200B 等，trim 清不掉），
    // 导致 findByPersistId 永远匹配不上 → 每次打开弹「已重定位」+ 自愈误删好链接。只留字母数字（persistId 本就 = p+base36）。
    this.bookmarkNode = String(attrs.node || '').replace(/[^A-Za-z0-9]/g, '');
    if (!target) {
      this.missing = true;
      new Notice(T('notice.bookmarkInvalid') + (this.file ? this.file.path : ''));
      return;
    }
    const tf = this.app.vault.getAbstractFileByPath(target);
    if (!(tf instanceof TFile)) {
      this.missing = true;
      new Notice(T('notice.bookmarkMissing') + target);
      return;
    }
    this.missing = false;
    this.targetFile = tf;
    try {
      const text = await this.app.vault.read(tf);
      const parts = shared.splitFrontmatter(text);
      this.targetFm = parts.fm;
      this.bodyText = parts.body;
      this.lastWritten = text;
      this.rebindIfNeeded();
      this.plugin.registerPanel(this);
      this.sendInitWhenReady();
    } catch (e) {
      this.missing = true;
      new Notice(T('notice.bookmarkReadFail') + target);
      log('捷径目标读取失败: ' + e);
    }
  }

  dataPath() { return this.targetFile ? this.targetFile.path : (this.file ? this.file.path : ''); }
  // 视图状态钥匙：视图身份 ID（2026-09-04：捷径 = 壳文件自己的 ID，不同捷径不共用、同捷径跨会话记忆；
  // 普通导图 = 数据文件 ID）。ID 未就绪时回退 path（仅极早 flush 等场景）。
  viewKey() { return (this.kind === 'mmlink' ? this.viewId : this.fileId) || (this.file ? this.file.path : ''); }

  buildIframe() {
    const container = this.contentEl;
    container.empty();
    if (this.iframe) { this.iframe.remove(); this.iframe = null; }
    this.iframeReady = false;
    const iframe = document.createElement('iframe');
    iframe.className = 'shin-mindmap-frame';
    iframe.srcdoc = buildFrameHtml(this.plugin.cssText, this.plugin.lang());
    iframe.addEventListener('load', () => {
      try {
        const w = iframe.contentWindow;
        w.__MM_HOST__ = { postMessage: (msg) => { this.onAppMessage(msg); } };
        w.__MM_LANG__ = this.plugin.lang(); // i18n.js 顶层读它定初始语言
        if (this.plugin.nowIconSvg) w.__NOW_ICONS__ = { sideOn: this.plugin.nowIconSvg };
        // 在 iframe 全局作用域执行内置前端代码（间接 eval = 全局作用域，var/function 升为 iframe 全局）。
        // 不用动态创建 script 元素注入——Obsidian 社区审核把动态 script 注入判为 Error。
        const wEval = w.eval;
        wEval(this.plugin.i18nText + '\n;\n' + this.plugin.appJsText); // 文案中心先于前端装载（T 全局）
      } catch (e) { log('iframe 注入失败: ' + (e && e.stack ? e.stack : e)); }
    });
    container.appendChild(iframe);
    this.iframe = iframe;
  }

  post(msg) {
    try { if (this.iframe && this.iframe.contentWindow) this.iframe.contentWindow.postMessage(msg, '*'); } catch (_) {}
  }

  sendInitWhenReady() {
    if (this.iframeReady) this.sendInit();
    else this.needInit = true;
  }

  sendInit() {
    this.needInit = false;
    // 2026-09-01 修「开屏闪/停顿一下 + 双重 init」：同一次打开里 ready 抢跑与数据就绪会各触发一次
    // sendInit，先到的那次 targetFile/bookmarkNode 还没就位（日志里的「未命名」半态 init），前端整树
    // 渲染两遍 = 闪一下。50ms 合并：窗口内只发最后一次（后到的数据更全）。
    if (this._initCoalesce) clearTimeout(this._initCoalesce);
    this._initCoalesce = setTimeout(() => {
      this._initCoalesce = null;
      // 2026-09-04：sendInitNow 前先定文件 ID（含冲突检测），确保任何存储读写发生在 ID 定型之后
      Promise.resolve().then(() => this.sendInitNow()).catch(e => log('sendInit 失败: ' + e));
    }, 50);
  }

  async sendInitNow() {
    // ---- 文件 ID 定型（2026-09-04）：
    //   fileId = 数据文件 ID → 历史快照/defaultPid 按它（内容的历史属于数据文件，捷径里的编辑写回目标文件）；
    //   viewId = 视图身份 ID → 视图位置/开关按它。捷径视图 = 壳文件自己的 ID（不同捷径互不共用，
    //   同一捷径的下钻/缩放跨会话记忆）；普通导图 viewId === fileId。
    // 必须先于一切存储读写。
    if (this.targetFile) {
      const res = await this.plugin.ensureFileId(this.targetFile);
      this.fileId = res.id;
      if (res.wrote) {
        // 懒注入改了 frontmatter → 同步本地基线，防 modify 回调误判「外部变更」刷掉初始化
        try {
          const t = await this.app.vault.read(this.targetFile);
          this.noteWrite(t);
          const parts = shared.splitFrontmatter(t);
          if (this.kind !== 'mmlink') { this.fm = parts.fm; this.rawText = t; } else { this.targetFm = parts.fm; }
          this.bodyText = parts.body;
          this.lastWritten = t;
        } catch (_) {}
      }
    }
    if (this.kind === 'mmlink' && this.file) {
      // 捷径壳文件也注入自己的 ID（2026-09-04 定：不同捷径页面不能共用视图状态）
      const r2 = await this.plugin.ensureFileId(this.file);
      this.viewId = r2.id;
      if (r2.wrote) {
        // 壳的 frontmatter 变了 → rawText（getViewData 写回基线）必须同步
        try { const t = await this.app.vault.read(this.file); this.noteWrite(t); this.rawText = t; this.lastWritten = t; } catch (_) {}
      }
    } else this.viewId = this.fileId;
    // 视图体验（views/开关）跟 viewId 走；文件级（defaultPid）跟 fileId 走
    const perFileView = this.plugin.perFile(this.viewId);
    const perFileData = this.plugin.perFile(this.fileId);
    // drillPid 只消费一次；捷径视图消费后回退 bookmarkNode（重渲染/切回仍停在捷径节点）
    const drill = this.drillPidOnce || (this.kind === 'mmlink' ? this.bookmarkNode : '');
    this.drillPidOnce = '';
    // 视图记忆两级：内存（同会话，最新）→ 落盘 views（重启/换设备后恢复，2026-09-04 治「重启丢位置」）
    const savedView = this.plugin.sessionViews.get(this.viewKey())
      || (perFileView.views && perFileView.views[''])
      || null;
    this.post({
      type: 'init',
      text: this.bodyText,
      filename: this.targetFile ? this.targetFile.basename : T('common.untitled'),
      // 完整绝对路径（2026-09-01 新增「复制 AI 定位路径」用）：基座 = vault adapter basePath + 文件 vault 相对 path
      filePath: (this.targetFile ? ((this.app.vault.adapter && this.app.vault.adapter.basePath ? this.app.vault.adapter.basePath + '/' : '') + this.targetFile.path) : ''),
      drillPid: drill,
      isLink: this.kind === 'mmlink',
      defaultPid: this.kind === 'mmlink' ? this.bookmarkNode : (perFileData.defaultPid || ''),
      hideDone: !!(savedView ? savedView.hideDone : perFileView.hideDone),
      showNow: !!(savedView ? savedView.showNow : perFileView.showNow),
      theme: (this.plugin.settings && this.plugin.settings.theme) || 'default', // 主题随 init 下发（2026-08-31）
      hideHint: !!(this.plugin.settings && this.plugin.settings.hideHint), // 空图新手提示是否隐藏随 init 下发（2026-09-01）
      isPro: !!(this.plugin.licenseState && this.plugin.licenseState.active), // 是否 Pro：随 init 下发，前端据此做付费功能拦截（2026-09-04）
      licenseSource: (this.plugin.licenseState && this.plugin.licenseState.source) || 'none', // license 来源：'license'=已购买；'trial'/'none'=未购买，用于右上角"激活 Pro"提示按钮显隐
      viewKey: this.viewKey(), // 下发本视图存储 key，前端 persist 时原样带回（防视图对象复用 this.file 变化时存错 key，2026-09-01 修捷径/源图串状态）
      view: savedView,
    });
    // 2026-09-01 诊断「切回丢位置」（静默版）：未命中记忆才打——memKeys 为空 = 保存侧从没写进来；
    // 有别的 key = key 不匹配。命中不打，避免逐次开屏噪音。
    if (!savedView) log('sendInit 无记忆: key=' + this.viewKey() + ' memKeys=' + Array.from(this.plugin.sessionViews.keys()).join(' | '));
  }

  // 外部变更（别的软件/同步改盘）：重载数据并刷新视图
  async externalReload(file) {
    if (this.missing) return;
    if (this.dataPath() !== file.path) return;
    try {
      const text = await this.app.vault.read(file);
      if (this.wasOwnWrite(text)) return; // 自己写的（含连续写盘的中间态），跳过
      log('检测到外部变更，刷新视图: ' + file.path);
      const parts = shared.splitFrontmatter(text);
      if (this.kind !== 'mmlink') { this.fm = parts.fm; this.rawText = text; }
      else this.targetFm = parts.fm;
      this.bodyText = parts.body;
      this.lastWritten = text;
      this.sendInit();
    } catch (e) { log('外部变更新读取失败: ' + e); }
  }

  // 实时写盘（自动保存）+ 同步同一数据文件的其它视图
  async writeData(bodyText) {
    if (this.missing) { log('目标缺失视图，拒绝写入（防静默创建文件）'); return; }
    const target = this.targetFile;
    if (!target) { log('写盘被跳过：targetFile 为 null（视图未绑定文件，疑似 onLoadFile 未走 super）'); new Notice(T('notice.writeFailNoFile')); return; }
    const full = (this.kind === 'mmlink' ? this.targetFm : this.fm) + bodyText;
    this.bodyText = bodyText;
    this.lastWritten = full; // 先更新基线再落盘：modify 事件回来时不误判外部变更
    this.noteWrite(full);    // 连续写盘的中间态也要认（防重入，见 wasOwnWrite）
    if (this.kind !== 'mmlink') this.rawText = full;
    try {
      await this.app.vault.modify(target, full);
    } catch (e) {
      log('写盘失败（保留内存新内容，下次 update 重试）: ' + e);
      new Notice(T('notice.writeFail') + target.path);
      return;
    }
    this.plugin.syncPanels(this.dataPath(), bodyText, full, this);
  }

  // ---- 前端消息处理（协议与 VSCode 版一致）----
  onAppMessage(msg) {
    const plugin = this.plugin;
    switch (msg.type) {
      case 'ready':
        this.iframeReady = true;
        if (this.needInit || this.bodyText) this.sendInit();
        else this.sendInit(); // 空文件也 init（显示空树）
        break;
      case 'update':
        if (this.kind !== 'mmlink' && msg.text === this.bodyText) return;
        this.writeData(msg.text);
        break;
      case 'refreshData': { // 顶部刷新：重读文件 + 重建 iframe（等价重新加载视图）
        const target = this.targetFile;
        if (target) {
          this.app.vault.read(target).then(t => {
            if (t !== this.lastWritten) {
              const parts = shared.splitFrontmatter(t);
              if (this.kind !== 'mmlink') { this.fm = parts.fm; this.rawText = t; } else this.targetFm = parts.fm;
              this.bodyText = parts.body;
              this.lastWritten = t;
            }
            this.buildIframe();
          }).catch(e => log('顶部刷新失败: ' + e));
        }
        break;
      }
      case 'log': log('[视图]', msg.text); break;
      case 'setView':
        // 视图状态双写：内存（即时，同会话恢复）+ 落盘（节流，重启恢复，2026-09-04）
        // 按 viewId 存：捷径 = 壳文件 ID（不同捷径不共用），普通导图 = 数据文件 ID
        if (msg.value && typeof msg.value === 'object') {
          const k = msg.viewKey || this.viewKey();
          const merged = Object.assign({}, plugin.sessionViews.get(k), msg.value); // 合并写入，避免覆盖同视图已记的 showNow/hideDone 等过滤状态
          plugin.sessionViews.set(k, merged);
          plugin.recordViewPersist(this.viewId, merged);
        }
        break;
      case 'setHideDone': {
        const k = this.viewKey();
        const merged = Object.assign({}, plugin.sessionViews.get(k), { hideDone: !!msg.value });
        plugin.sessionViews.set(k, merged);
        plugin.recordViewPersist(this.viewId, merged); // 落盘：重启后开关也恢复（2026-09-04）
        break;
      }
      case 'setShowNow': {
        const k = this.viewKey();
        const merged = Object.assign({}, plugin.sessionViews.get(k), { showNow: !!msg.value });
        plugin.sessionViews.set(k, merged);
        plugin.recordViewPersist(this.viewId, merged);
        break;
      }
      case 'saveAsCurrent': this.saveAsCurrent(msg.pid || '', msg.deadPid || ''); break;
      case 'reloadBookmark': this.reloadBookmarkData(); break; // 捷径首开竞态重试：延时重读目标文件再发 init（2026-08-31）
      case 'imgUri': this.resolveResource(msg); break;
      case 'pasteImg': this.savePastedImage(msg); break;
      case 'copyNode': case 'copyImage': case 'copyLink':
        navigator.clipboard.writeText(msg.text || '').catch(e => new Notice(T('notice.copyFail') + e));
        break;
      case 'openPro': // 付费功能被点击时前端发来的消息：弹出 Pro 详情 Modal（2026-09-02）
        this.plugin.openProFeaturesModal();
        break;
      case 'ensureAiLocate': // 首次复制 AI 定位路径时懒注入 ai:/aiLocate: 进 frontmatter（2026-09-01 方案 B）
        // 每文件仅写一次：已存在则跳过（幂等）；放 frontmatter 而非正文顶部，因为正文会按树重生成、独立注释会被丢。
        // 兼容性问题：未知 YAML key 由 Obsidian 原样保留，以后往 ai:/aiLocate: 里加内容不破坏解析，也不会被插件改稿冲掉。
        // 2026-09-01 修 Bug：捷径（mmlink）视图下 this.file=捷径文件、this.targetFile=源文件，注入必须写 this.targetFile（源页面），
        // 否则 aiLocate 会被写进捷径壳文件而非真正的数据源。普通导图 this.targetFile===this.file，无影响。
        if (this.targetFile) {
          this.app.fileManager.processFrontMatter(this.targetFile, (fm) => {
            if (fm.aiLocate === undefined) {
              fm.aiLocate = '定位节点：在文件中搜索 id:<节点ID>（节点 ID 形如 <!--id:xxx-->，写在标题行行尾，不是 Obsidian 的 ^块锚点，不要拼到文件路径后面打开）。';
            }
            if (fm.ai === undefined) {
              fm.ai = '编辑约定：本文件是 28 Notes 思维导图（markdown 大纲）。节点内容按大纲增删改，保持行尾 <!--id:xxx--> 不动；只调缩进层级，不改写标题文本；新增节点会自动分配 ID。';
            }
          });
        }
        break;
      case 'openFile': plugin.openFilePath(msg.path, this); break;
      case 'openNote': plugin.openNote(msg.note, msg.pid, this); break;
      case 'openUrl': try { if (msg.url) window.open(msg.url); } catch (e) { new Notice(T('notice.openUrlFail') + e); } break;
      case 'openSettings': // 更多菜单「设置与 bug 提报」→ 打开本插件设置页（2026-09-01）
        try {
          const id = this.plugin.manifest.id;
          log('[视图] 打开设置页请求 id=' + id); // 诊断：确认消息到达
          if (this.app.setting.openTabById) {
            this.app.setting.openTabById(id);
            log('[视图] openTabById 已调用'); // 若此日志有但设置没开 → tab id 不匹配静默失败 → 降级兜底
          }
          // 降级兜底：openTabById 后延时确认设置面板已打开；没有打开或 API 不存在 → open() + 直接点左侧 tab
          setTimeout(() => {
            try {
              const st = this.app.setting;
              if (st && st.isOpen) return;
              st.open();
              const t = st.tabContainer && st.tabContainer.querySelector('[data-tab-id="' + id + '"]');
              if (t) { t.click(); log('[视图] 降级已点击设置 tab'); }
              else log('[视图] 降级未找到设置 tab（id=' + id + '）');
            } catch (e2) { log('[视图] 降级打开设置失败: ' + e2); }
          }, 120);
        } catch (e) { new Notice(T('notice.openSettingsFail') + e); } break;
      case 'getFiles': // [[ 自动补全：回送 vault 全部 md 文件（前端缓存 10 秒后重取）
        this.post({ type: 'files', files: this.app.vault.getMarkdownFiles().map(f => ({ name: f.basename, path: f.path })) });
        break;
      case 'foldBarState': // 前端层级条状态：存到视图；仅当前活跃导图视图才渲染到原生状态栏
        this.foldBarState = msg;
        if (plugin.app.workspace.getActiveViewOfType(MindMapView) === this) plugin.renderFoldStatusBar(msg, this);
        break;
      case 'createShortcut': this.createBookmark(msg); break;
      case 'saveSnapshot': plugin.saveSnapshot(this.fileId, msg.text, msg.name || '').then(ts => { if (ts) this.post({ type: 'snapshotSaved', timestamp: ts }); }); break;
      case 'listSnapshots': plugin.listSnapshots(this.fileId).then(snaps => this.post({ type: 'snapshotsListed', snapshots: snaps })); break;
      case 'loadSnapshot': plugin.loadSnapshot(this.fileId, msg.timestamp).then(text => this.post({ type: 'snapshotLoaded', timestamp: msg.timestamp, text })); break;
      case 'restoreSnapshot': this.restoreSnapshot(msg.text); break;
      case 'createCopyFromSnapshot': plugin.createCopyFromSnapshot(this.targetFile, msg.text).then(p => { if (p) this.post({ type: 'snapshotCopyCreated', path: p }); }); break;
    }
  }

  dataName() { return this.targetFile ? this.targetFile.name : 'untitled.md'; } // 仅展示用（文件名）；存储一律用 fileId

  // 捷径首开竞态重试（2026-08-31）：新建捷径 = 前端生成 persistId 异步落盘目标文件 + 宿主立即建捷径跳转打开，
  // 首次读到旧内容 → 前端判定失效前先走这里：延时等落盘窗口过去，重读目标文件再发 init。
  async reloadBookmarkData() {
    const tf = this.targetFile;
    if (!tf) return;
    await new Promise(r => setTimeout(r, 500));
    try {
      const text = await this.app.vault.read(tf);
      const parts = shared.splitFrontmatter(text);
      this.bodyText = parts.body; this.lastWritten = text;
      this.sendInit();
    } catch (e) { log('捷径重试重读失败: ' + e); }
  }

  // 「更新为当前路径」：普通导图 → 默认路径存插件数据；捷径 → 更新捷径文件 node 字段
  async saveAsCurrent(pid, deadPid) {
    if (this.kind === 'mmlink') {
      try {
        // 竞态保护（2026-08-31 实踩，「新建捷径→点开必弹已重定位」的根因）：
        // 新建捷径 = 前端刚给节点生成 persistId 并异步落盘目标文件，紧接着宿主建捷径并自动跳转打开——
        // 打开时读到目标文件旧内容（新 pid 还没写进去）→ 误判失效 → 自愈把 node 删掉。
        // 自愈前用 deadPid 去目标文件原文二次确认：能匹配到 `id:xxx` → 节点其实在，取消自愈、重读并刷新视图。
        if (!pid && deadPid) {
          try {
            const text = await this.app.vault.read(this.targetFile);
            if (text.indexOf('id:' + deadPid) !== -1) {
              log('捷径目标节点实际存在（' + deadPid + '，落盘竞态误判），取消自愈，刷新视图');
              const parts = shared.splitFrontmatter(text);
              this.bodyText = parts.body; this.lastWritten = text;
              this.sendInit();
              return;
            }
          } catch (e) { log('自愈二次确认失败: ' + e); }
        }
        pid = String(pid || '').replace(/[^A-Za-z0-9]/g, ''); // 写入前同样清洗（与 loadBookmark 对称，防脏字符进 frontmatter）
        // pid 为空 = 自愈场景（原节点已删/更名失效）：清除 node 字段，下次打开停在主节点、不再误报
        await this.app.fileManager.processFrontMatter(this.file, fm => { if (pid) fm.node = pid; else delete fm.node; });
        this.bookmarkNode = pid || '';
        // 自愈场景必须同步清会话记忆（sessionViews）里残留的死 pid：不清的话下次打开
        // init 仍按保存视图的 currentRootPid 下钻 → 死 pid 找不到 → 又弹"已重定位"，每次打开都弹（2026-08-31 修）
        const sv = this.plugin.sessionViews.get(this.viewKey());
        if (sv && sv.currentRootPid) sv.currentRootPid = '';
        this.rawText = await this.app.vault.read(this.file); // getViewData 基线同步
        log('捷径已更新指向 pid=' + (pid || '(主节点)'));
      } catch (e) { log('更新捷径失败: ' + e); new Notice(T('notice.updateBookmarkFail') + e); }
    } else {
      if (!pid) return;
      this.plugin.setPerFile(this.fileId, { defaultPid: pid }); // key = fileId（2026-09-04：改名/移动不再需要换 key）
      log('默认路径已保存 pid=' + pid);
    }
  }

  // 「保存为捷径」：在数据文件同目录创建 <节点标题>.md（frontmatter 28notes: mmlink），点它即下钻到该节点
  // 流程（VSCode 同款）：app.js 已先 emitUpdate 把 persistId 落盘（消息顺序保证 update 先于本条处理）
  async createBookmark(msg) {
    try {
      if (!this.targetFile) { new Notice(T('notice.createBookmarkFail')); log('createBookmark 时 targetFile 为 null'); return; }
      const dir = this.plugin.parentDirOf(this.targetFile);
      // 用户可命名（弹框输入）；空 = 默认节点名（2026-08-29 定）
      const base = shared.sanitizeAttachmentName(msg.name || msg.title || T('common.node')).slice(0, 40) || T('common.node');
      let name = base + '.md';
      let i = 1;
      while (this.app.vault.getAbstractFileByPath(dir ? dir + '/' + name : name)) {
        name = base + ' ' + i + '.md'; i++; // 重名自动加序号
      }
      const filePath = dir ? dir + '/' + name : name;
      const bm = await this.app.vault.create(filePath, shared.buildMmlinkText(this.dataPath(), msg.pid || ''));
      log('已创建捷径: ' + filePath);
      // 保存后自动跳到捷径文档（新标签页，2026-08-29 定）；新文件 metadataCache 未就绪会路由失败 → 轮询（缓存滞后）
      const deadline = Date.now() + 1000;
      while (Date.now() < deadline && !this.plugin.detectKindSync(bm.path)) {
        await new Promise(r => setTimeout(r, 80));
      }
      await this.app.workspace.getLeaf('tab').openFile(bm);
    } catch (e) { new Notice(T('notice.createBookmarkFail2') + e); }
  }

  // 图片/音视频资源解析：按文件名在 vault 内找（wikilink 语义，不看路径）→ 可访问地址
  resolveResource(msg) {
    try {
      const name = msg.path || '';
      let tf = this.app.metadataCache.getFirstLinkpathDest(name, this.dataPath());
      if (!tf) tf = this.app.vault.getFiles().find(f => f.name === name);
      const uri = tf ? this.app.vault.getResourcePath(tf) : null;
      this.post({ type: 'imgUriRes', id: msg.id, uri });
    } catch (e) { this.post({ type: 'imgUriRes', id: msg.id, uri: null }); }
  }

  // 粘贴的图片：写到 28Notes-Files/images/（集中存放，wikilink 引用），回传文件名
  async savePastedImage(msg) {
    try {
      const m = String(msg.dataUrl || '').match(/^data:(image\/\w+);base64,(.+)$/);
      if (!m) { this.post({ type: 'pasteImgRes', filename: null, nodeId: msg.nodeId }); return; }
      const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' })[m[1]] || '.png';
      const name = shared.uniqueAttachmentName('img-' + new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 14) + ext);
      await this.ensureFolder(IMG_DIR);
      const buf = Buffer.from(m[2], 'base64');
      await this.app.vault.createBinary(IMG_DIR + '/' + name, buf);
      log('图片已写入: ' + IMG_DIR + '/' + name);
      this.post({ type: 'pasteImgRes', filename: name, nodeId: msg.nodeId });
    } catch (e) {
      log('写图片失败: ' + e);
      this.post({ type: 'pasteImgRes', filename: null, nodeId: msg.nodeId });
    }
  }

  async ensureFolder(p) {
    if (!this.app.vault.getAbstractFileByPath(p)) {
      try { await this.app.vault.createFolder(p); } catch (_) {}
    }
  }

  // 还原历史版本：先存「还原前」快照，再覆盖数据文件，并同步其它视图
  async restoreSnapshot(text) {
    const plugin = this.plugin;
    try {
      if (this.lastWritten) {
        const parts = shared.splitFrontmatter(this.lastWritten);
        await plugin.saveSnapshot(this.fileId, parts.body, T('snap.beforeRestore') + new Date().toLocaleString(this.lang() === 'en' ? 'en-US' : 'zh-CN', { hour12: false }));
      }
      const target = this.targetFile;
      const full = (this.kind === 'mmlink' ? this.targetFm : this.fm) + text;
      this.bodyText = text;
      this.lastWritten = full;
      this.noteWrite(full);
      if (this.kind !== 'mmlink') this.rawText = full;
      await this.app.vault.modify(target, full);
      plugin.syncPanels(this.dataPath(), text, full, this);
      this.post({ type: 'snapshotRestored', text });
      log('已还原历史版本: ' + target.path);
    } catch (e) { log('还原历史版本失败: ' + e); new Notice(T('notice.restoreFail') + e); }
  }
}

// ===== 插件主体 =====
class ShinMindMapPlugin extends Plugin {
  async onload() {
    this.pluginDir = this.manifest.dir;
    const base = this.app.vault.adapter.basePath || '';
    const absDir = base ? path.join(base, this.pluginDir) : this.pluginDir;
    shared = loadShared(absDir); // 必须先于一切 shared 使用（registerView 的回调是惰性的，但 detectKindSync 在 patch 后即用）
    i18n = loadI18n(absDir); // 文案中心（i18n.js）
    i18n.setLang(this.lang());
    this.i18nText = readPluginText(absDir, 'i18n.js');
    this.appJsText = readPluginText(absDir, 'mindmap-app.js');
    this.cssText = readPluginText(absDir, 'mindmap-app.css');
    this.nowIconSvg = readPluginText(absDir, 'icons/now/side-on.svg').trim();

    // 临时视图状态（缩放/平移/滚动/下钻路径）按视图 key 存进程内存（Obsidian 退出清空 → 重开回默认）
    this.sessionViews = new Map();
    // 面板登记表（同文件多视图同步用）：dataPath → Set<MindMapView>
    this.panels = new Map();
    // 用户主动选择「以 Markdown 打开」的文件集合：豁免强制切回导图（session 级）
    this.allowedText = new Set();
    // openNote 带 #pid：下次该文件进导图视图时消费一次
    this.pendingDrill = new Map();
    // 按文件持久化（defaultPid/hideDone/showNow/views）—— key = 文件 ID（2026-09-04，旧版按 path，见 migrateToId）
    const data = await this.loadData();
    this.savedPerFile = (data && data.perFile) || {};
    // 文件 ID 注册表（id → 原主路径）：冲突检测判「谁是原件」用；以及迁移/GC 标记
    this.idRegistry = (data && data.idRegistry) || {};
    this.migratedIdDone = !!(data && data.migratedIdDone);
    this.lastGcAt = (data && data.lastGcAt) || 0;
    // 设置面板持久化（备注内容/颜色/字号、翻译开关占位）
    this.settings = Object.assign(
      { language: 'auto', noteText: '', noteColor: '#888888', noteSize: 13, noteLineHeight: 1.5, translateEnabled: false, hideHint: false, theme: 'feishuGray', debugMode: false }, // debugMode：调试栏开关（仅作者本机可见该栏）
      (data && data.settings) || {}
    );
    // 许可证段（2026-09-02）：嵌套对象要单独兜底，Object.assign 是浅拷贝
    this.settings.license = Object.assign(
      { key: '', lid: '', plan: '', maxDevices: 3, activatedAt: '', deviceId: '', receipt: '', activationLog: [], trialStartedAt: '', trialLastSeenAt: '', trialDays: 14 },
      this.settings.license || {}
    );
    // 许可证：装载模块 → 取本机设备 ID → 验已存的码（每次启动重验，不信任缓存的「已激活」）
    // ⚠️ 整段兜底：许可证功能绝不能拖垮插件本体（license.js 缺失/损坏时按未激活继续，功能照常用）
    this.licenseState = { active: false, reason: '' };
    try {
      license = loadLicense(absDir);
      this.attemptLimiter = license.makeAttemptLimiter(); // 激活失败限流（内存态，重启重算）
      this.deviceId = await this.ensureDeviceId();
      await this.refreshLicenseState();
    } catch (e) {
      log('许可证模块加载失败，按未激活继续（不影响其它功能）: ' + e);
      license = null;
    }

    this.registerView(VIEW_TYPE, (leaf) => new MindMapView(leaf, this));
    this.patchSetViewState();

    // 折叠层级条搬进 Obsidian 官方状态栏（2026-08-30 v2）：原生状态栏而非 iframe 悬浮条，
    // 与原生视觉统一。前端算层级 post foldBarState → 宿主渲染按钮；点击 post foldBarRun 回前端执行。
    this.foldStatusBar = this.addStatusBarItem();
    this.foldStatusBar.classList.add('shin-foldbar');
    this.foldStatusBar.style.display = 'none';
    this.foldStatusBar.addEventListener('click', () => {
      const pop = this.foldStatusBar.querySelector('.shin-foldbar-pop');
      if (pop) pop.classList.remove('open'); // 点条内非按钮处也收弹层
    });
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshFoldStatusBar()));

    // 左侧 Ribbon 小按钮（2026-08-30 定）：点击新建思维导图；图标用用户的 Frame.svg 内联
    // addRibbonIcon 第一参数要 IconName（内置 lucide 名），传 SVG 字符串不认 → 传占位图标后替换 innerHTML
    this.ribbonBtn = this.addRibbonIcon('square', T('cmd.newMap'), () => this.createNewMindmap());
    const ribbonBtn = this.ribbonBtn;
    if (ribbonBtn) {
      ribbonBtn.classList.add('shin-ribbon-action'); // 2026-08-30：给 ribbon 按钮打标，styles.css 才能精确控制大小，不被 Obsidian 默认 padding 撑大
      ribbonBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_2018_5)"><path d="M22.5927 12.0147C22.5927 14.7781 20.3465 17.0243 17.5822 17.0243C16.9523 17.0243 16.3492 16.9076 15.7959 16.6896C16.3153 16.4964 16.7913 16.215 17.2092 15.8661C17.3318 15.8789 17.4563 15.885 17.5822 15.885C19.7207 15.885 21.4534 14.1523 21.4534 12.0147C21.4534 9.87707 19.7207 8.14348 17.5822 8.14348C17.457 8.14348 17.3332 8.14943 17.2114 8.16221C16.793 7.81182 16.3162 7.52923 15.7959 7.33536C16.3492 7.11699 16.9523 7 17.5822 7C20.3465 7 22.5927 9.25128 22.5927 12.0147Z" fill="currentColor"/><path d="M14.0096 17.0243C16.773 17.0243 19.0192 14.7781 19.0192 12.0147C19.0192 9.25128 16.773 7 14.0096 7C11.2462 7 9 9.25128 9 12.0147C9 14.7781 11.2462 17.0243 14.0096 17.0243ZM14.0096 15.885C11.872 15.885 10.1393 14.1523 10.1393 12.0147C10.1393 9.87707 11.872 8.14348 14.0096 8.14348C16.1472 8.14348 17.8808 9.87707 17.8808 12.0147C17.8808 14.1523 16.1472 15.885 14.0096 15.885Z" fill="currentColor"/></g><path d="M2 11.35C1.64101 11.35 1.35 11.641 1.35 12C1.35 12.359 1.64101 12.65 2 12.65L2 12L2 11.35ZM2 12L2 12.65L10 12.65L10 12L10 11.35L2 11.35L2 12Z" fill="currentColor"/></svg>';
    }

    // 外部变更兜底（Obsidian 同步/别的软件改盘）：磁盘 ≠ lastWritten 才刷新
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (!(file instanceof TFile)) return;
      const set = this.panels.get(file.path);
      if (set) for (const v of [...set]) v.externalReload(file);
    }));

    // rename 同步（Obsidian 只自动更新正文 [[链接]]，frontmatter 自定义字段要自己跟）：
    // ① 捷径 target 指向旧路径 → 更新；② 历史目录随文件改名迁移；③ panels 表换 key
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { this.onFileRenamed(file, oldPath); }));

    // 文件列表捷径徽章（2026-08-29 定）：28notes: mmlink 的文件在文件列表右侧显示「捷径」小字，
    // 与被指向的原文件区分（仿原生 .nav-file-tag 扩展名徽章）。做法：扫 frontmatter → 动态注入 CSS
    // （data-path 属性选择器 + ::after），不 patch 文件管理器内部，Obsidian 升级稳。
    // 整段防御：徽章属纯美化，失败不拖垮插件加载
    try {
      this.badgeStyle = document.createElement('style');
      this.badgeStyle.id = 'shin-mindmap-bookmark-badges';
      document.head.appendChild(this.badgeStyle);
      let badgeTimer = null;
      const scheduleBadges = () => {
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(() => { try { this.updateBookmarkBadges(); } catch (e) { log('捷径徽章更新失败: ' + e); } }, 300);
      };
      this.registerEvent(this.app.metadataCache.on('resolved', scheduleBadges)); // 开屏索引完成
      this.registerEvent(this.app.metadataCache.on('changed', scheduleBadges));  // 单文件 frontmatter 变化
      this.registerEvent(this.app.vault.on('rename', scheduleBadges));
      this.registerEvent(this.app.vault.on('delete', scheduleBadges));
      this.updateBookmarkBadges();
    } catch (e) { log('捷径徽章初始化失败（不影响其它功能）: ' + e); }

    // 命令：新建思维导图
    this.addCommand({
      id: 'new-mindmap',
      name: T('cmd.newMap'),
      hotkeys: [{ modifiers: ['Mod', 'Alt'], key: '2' }], // 默认快捷键：Option+Cmd+2（Windows/Linux 为 Alt+Ctrl+2）
      callback: () => this.createNewMindmap(),
    });
    // 命令：当前文件以 Markdown 打开（豁免强制切回，session 级）
    this.addCommand({
      id: 'open-as-markdown',
      name: T('cmd.openAsMarkdown'),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (f && f.extension === 'md' && this.detectKindSync(f.path)) {
          if (!checking) {
            this.allowedText.add(f.path);
            this.app.workspace.getLeaf(false).setViewState({ type: 'markdown', state: { file: f.path } });
          }
          return true;
        }
        return false;
      },
    });
    // 命令：以思维导图打开（「以 Markdown 打开」的回头路：解除豁免 + 切回导图视图，2026-08-29）
    this.addCommand({
      id: 'open-as-mindmap',
      name: T('cmd.openAsMindmap'),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (f && f.extension === 'md' && this.detectKindSync(f.path)) {
          if (!checking) {
            this.allowedText.delete(f.path);
            this.app.workspace.getLeaf(false).setViewState({ type: VIEW_TYPE, state: { file: f.path } });
          }
          return true;
        }
        return false;
      },
    });
    // 文件右键菜单：①任何右键位置都加「新建思维导图（28 Notes）」（Excalidraw 同款：setSection action-primary 进"新建"主区）
  this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      // 复制 AI 定位路径（28Notes）：节点右键同款功能搬到文件列表。任何 .md 文件都出现；始终复制「路径」（无节点 ID），
      // 选中节点版（复制「路径+节点 ID」）实测在文件列表场景取不到选中态，已记未解决 Bug，待有空再修（2026-09-02）。
      if (file instanceof TFile && file.extension === 'md') {
        menu.addItem(item => item
          .setTitle(T('menu.copyAiLocate'))
          .setIcon('crosshair')
          .onClick(() => {
            const base = (this.app.vault.adapter && this.app.vault.adapter.basePath) ? this.app.vault.adapter.basePath + '/' : '';
            // 解析「真正的思维导图数据文件」：优先用已打开的该文件视图（捷径视图 v.targetFile 已是源，不依赖 metadataCache），
            // 否则回退 resolveDataFile（普通自身；捷径取 target 源）。无论普通还是捷径，复制的都是数据文件绝对路径（无节点 ID）。
            let dataFile = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
              const v = leaf.view;
              if (v instanceof MindMapView && v.file && v.file.path === file.path) {
                dataFile = v.targetFile || v.file;
              }
            });
            if (!dataFile) dataFile = this.resolveDataFile(file);
            const abs = base + dataFile.path;
            const text = '【待编辑文档路径：' + abs + '】';
            navigator.clipboard.writeText(text).catch(e => new Notice(T('notice.copyFail') + e));
            // 懒注入 frontmatter：写源文件（捷径下必须写 targetFile 而非壳，与节点右键 ensureAiLocate 同源，幂等）
            this.app.fileManager.processFrontMatter(dataFile, (fm) => {
              if (fm.aiLocate === undefined) {
                fm.aiLocate = '定位节点：在文件中搜索 id:<节点ID>（节点 ID 形如 <!--id:xxx-->，写在标题行行尾，不是 Obsidian 的 ^块锚点，不要拼到文件路径后面打开）。';
              }
              if (fm.ai === undefined) {
                fm.ai = '编辑约定：本文件是 28 Notes 思维导图（markdown 大纲）。节点内容按大纲增删改，保持行尾 <!--id:xxx--> 不动；只调缩进层级，不改写标题文本；新增节点会自动分配 ID。';
              }
            });
            new Notice(T('toast.aiLocateCopied'));
          }));
      }
      menu.addItem(item => item
        .setSection('action-primary') // 关键：进 Obsidian「新建笔记/新建文件夹…」同列主操作区（2026-09-01 抄 Excalidraw）
        .setTitle(T('menu.newMindmap'))
        .setIcon('file-plus')
        .onClick(() => {
          // 目标目录：右键文件夹 → 该文件夹；右键文件 → 其父目录；空白（null）→ 默认 active 父目录
          let dir = '';
          if (file instanceof TFolder) dir = file.path;
          else if (file instanceof TFile) dir = file.parent ? file.parent.path : '';
          this.createNewMindmap(dir);
        }));
      // 28notes 文件：按当前豁免状态给「以 Markdown 打开」/「以思维导图打开」
      if (!(file instanceof TFile) || file.extension !== 'md' || !this.detectKindSync(file.path)) return;
      if (this.allowedText.has(file.path)) {
        menu.addItem(item => item
          .setTitle(T('cmd.openAsMindmap'))
          .setIcon('git-fork')
          .onClick(() => {
            this.allowedText.delete(file.path);
            this.app.workspace.getLeaf(false).setViewState({ type: VIEW_TYPE, state: { file: file.path } });
          }));
      } else {
        menu.addItem(item => item
          .setTitle(T('cmd.openAsMarkdown'))
          .setIcon('document')
          .onClick(() => {
            this.allowedText.add(file.path);
            this.app.workspace.getLeaf(false).setViewState({ type: 'markdown', state: { file: file.path } });
          }));
      }
    }));

    // 设置面板（2026-08-30 定）：Obsidian 设置 → 第三方插件最下方「28 Notes」分项
    this.settingTab = new ShinNotesSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.applyBadgeText(); // 徽章文案按当前语言写入
    this.setupTabIcons(); // 标签页图标（2026-08-31）
    // 旧数据迁移（perFile/历史目录钥匙 → 文件 ID）+ 垃圾回收：后台跑，不阻塞启动（2026-09-04）
    this.migrateToId();
    log('插件加载完成');
  }

  // 标签页图标（2026-08-31 定，Excalidraw 同思路）：思维导图/捷径视图 tab 前显示对应图标。
  // 不是"额外加一个图标"，而是**替换 Obsidian 原生图标**（.workspace-tab-header-inner-icon 那个槽）——
  // 原生图标由 Obsidian 按 view type/扩展名渲染，覆写其内容即可，不会出现"文件图标 + 自己的图标"叠加。
  // 三路事件兜底：开新 tab、切标签、拖拽重排 tab（Obsidian 重绘会还原原生图标，兜底重新替换）。
  setupTabIcons() {
    const apply = () => {
      try {
        this.app.workspace.iterateAllLeaves(leaf => {
          const h = leaf.tabHeaderEl; if (!h) return;
          const isMM = leaf.view instanceof MindMapView;
          // 非我们的视图：清除可能残留的 class（Obsidian 复用 tab header DOM 节点，
          // 从思维导图切到画板等视图时 class 不消失 → 别人的图标被我们的样式放大；2026-09-01 实踩）
          h.querySelectorAll('.workspace-tab-header-inner-icon').forEach(slot => {
            slot.classList.remove('shin-tab-icon', 'shin-tab-icon-bookmark', 'shin-tab-icon-mindmap');
            if (slot.dataset.shinTab) { slot.removeAttribute('data-shin-tab'); slot.innerHTML = ''; } // 内容被我们覆盖过的：清空，交还给 Obsidian 重绘
          });
          if (!isMM) return;
          // 优先替换原生图标槽；结构变化时兜底替换任意 svg（排除我们已注入的）
          let slot = h.querySelector('.workspace-tab-header-inner-icon');
          if (!slot) slot = h.querySelector(':scope > .workspace-tab-header-inner > svg, :scope > svg');
          if (!slot) return;
          const isLink = leaf.view.kind === 'mmlink';
          slot.classList.add('shin-tab-icon');
          slot.classList.toggle('shin-tab-icon-bookmark', isLink);
          slot.classList.toggle('shin-tab-icon-mindmap', !isLink);
          slot.dataset.shinTab = '1';
          // ⚠️ 无条件替换 innerHTML（2026-09-01 修）：此前思维导图分支加了 `!includes('<svg')` 防重复判断，
          // 但原生图标槽里本来就有 Obsidian 渲染的默认 lucide svg → 永远跳过替换 → 思维导图 tab 一直显示默认文档图标。
          // 捷径是文本 '↗' 不走该判断所以正常。直接每次幂等重设即可（Obsidian 重绘还原原生后，事件兜底再替换）。
          // SVG 自带 width/height 属性会压过 CSS？不会——CSS 类选择器优先于 presentation attribute，但去掉更保险，
          // 大小完全交给 CSS 旋钮 --shin-tab-icon-mindmap-size 控制（2026-09-01）。
          slot.innerHTML = isLink ? '↗' : RIBBON_ICON_SVG.replace(/ width="24" height="24"/, '');
        });
      } catch (e) { log('标签页图标设置失败: ' + e); }
    };
    this.registerEvent(this.app.workspace.on('active-leaf-change', apply));
    this.registerEvent(this.app.workspace.on('layout-change', apply));
    this.app.workspace.onLayoutReady(() => apply());
  }

  onunload() {
    // patch 的还原由 this.register 自动处理（patchSetViewState 里注册）
    // 捷径徽章 <style> 要手动摘（document.head 不归 Obsidian 管）
    try { if (this.badgeStyle) this.badgeStyle.remove(); } catch (_) {}
    // 退出前把待落盘的视图状态写掉（onClose 已各自 flush，这里是双保险）
    this.flushViewPersistNow();
  }

  // ---- 折叠层级条（Obsidian 官方状态栏版，2026-08-30 v2）----
  // 前端 post foldBarState → 存到视图实例；仅活跃导图视图渲染到原生状态栏；点击 post foldBarRun 回前端执行
  // hover 高亮：onmouseenter → foldBarHover(lvl) 让前端高亮对应层；onmouseleave → foldBarHoverEnd 清掉
  refreshFoldStatusBar() {
    const v = this.app.workspace.getActiveViewOfType(MindMapView);
    if (v && v.foldBarState) this.renderFoldStatusBar(v.foldBarState, v);
    else if (this.foldStatusBar) this.foldStatusBar.style.display = 'none';
    // 激活即让前端重发最新状态（2026-08-31 修「数字有几率不出现」）：此前只重放存储值，而前端在不活跃期
    // 发来的新状态只存不渲——存储的可能还是空文件期的 hidden，标签页切回来永远显示旧状态，直到视图重建才自愈。
    if (v) v.post({ type: 'requestFoldBar' });
  }
  mkFoldStatusBtn(it, view) {
    const b = document.createElement('span');
    b.className = 'shin-foldbar-btn';
    b.textContent = it.label;
    b.title = it.title;
    b.onclick = (e) => {
      e.stopPropagation();
      // Pro 卡点（2026-09-04）：体验期结束未激活 → 点击进激活弹窗（右下角高级折叠数字按钮视觉不变，仅拦截点击）
      if (!(this.licenseState && this.licenseState.active)) { this.openProFeaturesModal(); return; }
      view.post({ type: 'foldBarRun', lvl: it.lvl });
    };
    // hover 高亮：与原 hover 子菜单同源（前端 highlightLevel / highlightSelLevel）
    b.onmouseenter = () => view.post({ type: 'foldBarHover', lvl: it.lvl });
    b.onmouseleave = () => view.post({ type: 'foldBarHoverEnd' });
    return b;
  }
  renderFoldStatusBar(state, view) {
    const el = this.foldStatusBar;
    if (!el) return;
    if (!state || state.hidden) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '';
    // 数字上限 4（2026-08-30 定：到 5 之后折叠到「更多」；原 CAP=5 改 4）
    const CAP = 4;
    const levels = state.levels || [];
    const primary = levels.slice(0, CAP);
    const rest = levels.slice(CAP);
    primary.forEach(it => el.appendChild(this.mkFoldStatusBtn(it, view)));
    if (rest.length) {
      const wrap = document.createElement('span');
      wrap.className = 'shin-foldbar-more-wrap';
      const more = document.createElement('span');
      more.className = 'shin-foldbar-btn shin-foldbar-more';
      more.textContent = '+';
      more.title = T('fold.moreLevels');
      more.onclick = (e) => { e.stopPropagation(); if (!(this.licenseState && this.licenseState.active)) this.openProFeaturesModal(); }; // Pro 卡点（2026-09-04）：未激活 → 点击进激活弹窗
      const pop = document.createElement('div');
      pop.className = 'shin-foldbar-pop';
      // 数字倒序（2026-08-30 定）：6 在最下靠近 +，更大的往上，鼠标不用跑到顶再往下扫
      rest.slice().reverse().forEach(it => pop.appendChild(this.mkFoldStatusBtn(it, view)));
      // 更多弹层改悬停（2026-08-30 定，原先 click 切太突兀），hide timer=350ms 兜底防 6px gap 断链
      let mt = null;
      const showPop = () => { clearTimeout(mt); pop.classList.add('open'); };
      const hidePop = () => { mt = setTimeout(() => pop.classList.remove('open'), 350); };
      more.onmouseenter = showPop;
      more.onmouseleave = hidePop;
      pop.onmouseenter = () => clearTimeout(mt);
      pop.onmouseleave = hidePop;
      wrap.appendChild(more);
      wrap.appendChild(pop);
      el.appendChild(wrap);
    }
  }

  // ---- 文件列表捷径徽章：28notes: mmlink 的文件右侧显示「捷径」小字（2026-08-29）----
  // ⚠️ ::after 必须逐个拼到每条选择器后面（sel.join(',')+'::after' 只会给最后一条挂伪元素，
  //    其余选择器会把 content/color/pointer-events 直接作用在文件条目上 → 文件变灰且不可点击，23:39 实踩）
  updateBookmarkBadges() {
    if (!this.badgeStyle) return;
    const escCss = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const selMmlink = [], selMindmap = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f) && this.app.metadataCache.getFileCache(f).frontmatter;
      if (fm && fm['28notes'] === 'mmlink') selMmlink.push('.nav-file-title[data-path="' + escCss(f.path) + '"]');
      else if (fm && fm['28notes'] === 'mindmap') selMindmap.push('.nav-file-title[data-path="' + escCss(f.path) + '"]');
    }
        selMmlink.push('.nav-file-title[data-path$=".mmlink"]');
    // 徽章对齐机制照抄 Obsidian 原生 .nav-file-tag：margin-inline-start:auto（原生就靠它贴右）——
    // 新建文件时行内结构不同，旧的 margin-left:4px 会让徽章紧跟文件名（2026-08-31 实踩），auto margin 两种状态下都稳定贴右。
    // 其余视觉参数全部走 --shin-file-badge-* 旋钮（默认值在 styles.css :root = 旧版样子；注释里附原生 CANVAS 同款值可随时切换）。
    // 「图标 vs 文本」只作用于思维导图（28 Notes）徽章（2026-08-31 定）；捷径（↗）永远文本 ↗ 且中英文均 ↗，不随徽章样式设置变。
    const useIcon = (this.settings && this.settings.badgeStyle) === 'icon';
    // 文本模式：colorVar 按徽章类型取不同旋钮（mindmap 用 --shin-mindmap-badge-color = 图标同款深色；捷径沿用 --shin-file-badge-color）
    // opacity 常态走 --shin-file-badge-opacity，hover 走 --shin-file-badge-opacity-hover（2026-08-31 定，与图标模式同款透明度手感）
    const badgeTextCss = (textVar, fallback, colorVar, opacityVar) =>
      '{content: var(' + textVar + ', "' + fallback + '");'
      + 'color: var(' + (colorVar || '--shin-file-badge-color') + ', var(--text-faint));'
      + 'font-size: var(--shin-file-badge-size, var(--font-ui-smaller));'
      + 'font-weight: var(--shin-file-badge-weight, 600);'
      + '-webkit-text-stroke: var(--shin-file-badge-stroke, 0px) currentColor; /* 字体字重到头后的继续加粗手段（2026-08-31 字重要更粗） */'
      + 'letter-spacing: var(--shin-file-badge-spacing, normal);'
      + 'text-transform: var(--shin-file-badge-transform, none);'
      + 'background-color: var(--shin-file-badge-background, transparent);'
      + 'line-height: var(--line-height-normal);'
      + 'padding: 0 var(--size-4-1);margin-inline-start: auto;align-self: center;'
      + 'flex-shrink: 0;pointer-events: none;opacity: var(' + (opacityVar || '--shin-file-badge-opacity') + ', 1);}';
    // 文本模式悬停：变色 + 透明度（图标模式是纯透明度；文本两个都调，2026-08-31 定）
    const hoverCss = '{color: var(--shin-file-badge-color-hover, var(--text-muted)); opacity: var(--shin-file-badge-opacity-hover, 0.6);}';
    // 图标模式：content 用 data:URL（fallback 含内联 SVG，styles.css 没设 var 时也能直显）。
    // 旋钮：--shin-badge-icon-size（大小）/ --shin-badge-icon-opacity（透明度）/
    //       --shin-badge-icon-offset-x / -offset-y（位置微调，默认 0px；偏上就 -y 值调大些）
    const badgeIconCss =
      '{content: var(--shin-badge-icon-url, ' + RIBBON_ICON_DATA_URL + ');'
      + 'width: var(--shin-badge-icon-size, 14px);height: var(--shin-badge-icon-size, 14px);'
      + 'font-size: 0; /* 占位，防止 content: url 之外的文本污染 */'
      + 'color: var(--shin-file-badge-color, var(--text-faint));'
      + 'background-color: var(--shin-file-badge-background, transparent);'
      + 'margin-inline-start: auto;align-self: center;flex-shrink: 0;pointer-events: none;'
      + 'transform: translate(var(--shin-badge-icon-offset-x, 0px), var(--shin-badge-icon-offset-y, 0px));'
      + 'opacity: var(--shin-badge-icon-opacity, 1);}';
    // 捷径（mmlink）徽章：永远文本 ↗（2026-08-31 定：不走图标样式；中英文均 ↗，不含 Shortcut 字样）
    const mmlinkRule = selMmlink.map(s => s + '::after').join(',\n')
      + badgeTextCss('--shin-bookmark-badge-text', T('badge.bookmark'), '--shin-file-badge-color', '--shin-bookmark-badge-opacity')
      + '\n' + selMmlink.map(s => s + ':hover::after').join(',\n') + hoverCss;
    // 思维导图（mindmap）徽章：按设置切文本 / 图标
    // 图标模式 hover = 透明度变化（SVG 是独立图片，currentColor 不生效，改色无效；用 opacity 旋钮做悬停反馈）
    const mindmapRule = selMindmap.map(s => s + '::after').join(',\n')
      + (useIcon ? badgeIconCss : badgeTextCss('--shin-mindmap-badge-text', T('badge.mindmap'), '--shin-mindmap-badge-color', '--shin-file-badge-opacity'))
      + (useIcon
        ? ('\n' + selMindmap.map(s => s + ':hover::after').join(',\n') + '{opacity: var(--shin-badge-icon-opacity-hover, 0.6);}')
        : ('\n' + selMindmap.map(s => s + ':hover::after').join(',\n') + hoverCss));
    this.badgeStyle.textContent = mmlinkRule + '\n' + mindmapRule;
  }

  // ---- TextFileView 三件套之三：monkey-patch setViewState（零闪烁路由）----
  // Obsidian 打开任何 .md 都调 leaf.setViewState({type:'markdown', state:{file}})；
  // patch 在原方法执行前把 28notes 文件的 type 改成导图视图 → MarkdownView 从未被创建 → 零闪烁。
  // 改 type 后必须调原方法（文件树高亮、历史记录等副作用靠它）；反向兜底：导图 type + 非 28notes 文件 → 重定向回 markdown。
  patchSetViewState() {
    const plugin = this;
    const orig = WorkspaceLeaf.prototype.setViewState;
    WorkspaceLeaf.prototype.setViewState = function (viewState, ...rest) {
      try {
        const filePath = viewState && viewState.state && viewState.state.file;
        if (filePath && typeof viewState.type === 'string') {
          if (viewState.type === 'markdown' && !plugin.allowedText.has(filePath)) {
            const kind = plugin.detectKindSync(filePath);
            if (kind) viewState = Object.assign({}, viewState, { type: VIEW_TYPE });
          } else if (viewState.type === VIEW_TYPE) {
            const kind = plugin.detectKindSync(filePath);
            if (!kind) viewState = Object.assign({}, viewState, { type: 'markdown' });
          }
        }
      } catch (e) { log('setViewState patch 异常: ' + e); }
      return orig.call(this, viewState, ...rest);
    };
    this.register(() => { WorkspaceLeaf.prototype.setViewState = orig; });
  }

  // 同步识别（不破坏零闪烁）：abstractFile + metadataCache 都是同步缓存
  detectKindSync(filePath) {
    const af = this.app.vault.getAbstractFileByPath(filePath);
    if (!(af instanceof TFile)) return null;
    const fc = this.app.metadataCache.getFileCache(af);
    return shared.kindOfAttrs((fc && fc.frontmatter) || {});
  }

  // 解析到「真正的思维导图数据文件」（2026-09-02）：普通导图 = 自身；捷径（mmlink）= frontmatter.target 指向的源文件。
  // 供文件列表「复制 AI 定位路径」复用节点右键的源解析：无论右键壳还是源，复制的都是源路径、节点判定也基于源。
  resolveDataFile(file) {
    if (this.detectKindSync(file.path) === 'mmlink') {
      const fc = this.app.metadataCache.getFileCache(file);
      const target = (fc && fc.frontmatter && fc.frontmatter.target) || '';
      if (target) {
        const t = this.app.vault.getAbstractFileByPath(target);
        if (t instanceof TFile) return t;
      }
    }
    return file;
  }

  // ---- 面板登记 / 同步 ----
  // vault 根目录的 parent.path 是 '/'，拼路径会出 '//xxx.md' → 查重失效、create 撞名报错（2026-08-29 实踩）
  parentDirOf(tfile) {
    const p = tfile && tfile.parent ? tfile.parent.path : '';
    return (!p || p === '/') ? '' : p;
  }

  registerPanel(view) {
    const key = view.dataPath();
    if (!key) return;
    if (!this.panels.has(key)) this.panels.set(key, new Set());
    this.panels.get(key).add(view);
    // openNote 带 pid：视图就绪后消费一次性下钻
    const pd = this.pendingDrill.get(key);
    if (pd) { view.drillPidOnce = pd; this.pendingDrill.delete(key); }
  }
  unregisterPanel(view) {
    for (const [k, set] of this.panels) {
      if (set.delete(view) && !set.size) this.panels.delete(k);
    }
  }
  // 同一数据文件的其它视图：只刷新显示、不写回（防回环）
  syncPanels(dataPath, bodyText, fullText, except) {
    const set = this.panels.get(dataPath);
    if (!set) return;
    for (const v of set) {
      if (v === except) continue;
      v.bodyText = bodyText;
      v.lastWritten = fullText;
      if (v.kind !== 'mmlink') v.rawText = fullText;
      v.post({ type: 'sync', text: bodyText });
    }
  }

  // ---- 按文件持久化（defaultPid/hideDone/showNow/views；对齐 VSCode 的 workspaceState）----
  // 2026-09-04：key 从文件完整路径换成文件 ID（frontmatter 28notes-id）——路径会被「删除后新建同名」重用，ID 不会；
  // 改名/移动文件时 key 不变，rename 钩子不再需要换 key。views 子对象：''=直接打开、'#link'=捷径打开，各存一份视图位置。
  perFile(fileId) { return this.savedPerFile[fileId] || {}; }
  setPerFile(fileId, patch) {
    if (!fileId) return;
    this.savedPerFile[fileId] = Object.assign({}, this.savedPerFile[fileId], patch);
    this.saveData(this.persistPayload()).catch(() => {});
  }

  // ---- data.json 统一出口（2026-09-04）：所有落盘走这里，避免字段散落漏写 ----
  persistPayload() {
    return {
      perFile: this.savedPerFile,
      settings: this.settings,
      idRegistry: this.idRegistry || {},
      migratedIdDone: !!this.migratedIdDone,
      lastGcAt: this.lastGcAt || 0,
    };
  }

  // ---- 文件 ID（2026-09-04）：一切按文件存的状态的唯一钥匙 ----
  // 生成：fm- 前缀 + 10 位去易混字符随机串。ID 一经分配永不重用（随机碰撞概率可忽略），
  // 「删除后新建同名文件」拿到的是新 ID → 结构性免疫历史串扰。
  newFileId() {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 10; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return 'fm-' + s;
  }
  // 扫全 vault 的 28notes-id → { id: [paths] }（metadataCache 读，几千文件毫秒级；每次打开视图调一次）
  scanIdMap() {
    const map = {};
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fc = this.app.metadataCache.getFileCache(f);
      const id = fc && fc.frontmatter && fc.frontmatter['28notes-id'];
      if (typeof id === 'string' && id) { (map[id] = map[id] || []).push(f.path); }
    }
    return map;
  }
  // 读/懒注入文件的 28notes-id + 冲突检测。返回 { id, wrote }（wrote = 本次写了 frontmatter）。
  // 冲突场景 = 复制文件/同步冲突副本带着原 ID（frontmatter 随文件复制）：
  //   判原主优先用注册表（idRegistry 记的路径还活着 → 它是原主），注册表缺失/过期比 ctime 兜底；
  //   副本换新号、存储原地不动全归原件（副本刚出生本无存储，无「分家」问题）。
  //   判错的最坏后果是「家产给错人」（副本继承历史/原件从零），是单向错位不是共享污染，可手动纠正。
  async ensureFileId(file) {
    if (!(file instanceof TFile)) return { id: '', wrote: false };
    const fc = this.app.metadataCache.getFileCache(file);
    let id = fc && fc.frontmatter && fc.frontmatter['28notes-id'];
    if (typeof id !== 'string' || !id) {
      // 缓存没读到不等于文件没有：新文件/刚改完 frontmatter 时 metadataCache 可能滞后，
      // 直接读原文确认，防误判后覆盖掉已有的 ID
      try {
        const parts = shared.splitFrontmatter(await this.app.vault.read(file));
        if (parts.attrs && typeof parts.attrs['28notes-id'] === 'string' && parts.attrs['28notes-id']) {
          id = parts.attrs['28notes-id'];
        }
      } catch (_) {}
    }
    if (typeof id !== 'string' || !id) {
      // 无 ID（新文件/存量老文件）：生成唯一新号并懒注入
      const used = new Set(Object.keys(this.scanIdMap()));
      do { id = this.newFileId(); } while (used.has(id));
      await this.app.fileManager.processFrontMatter(file, fm => { fm['28notes-id'] = id; });
      this.idRegistry[id] = file.path;
      this.saveData(this.persistPayload()).catch(() => {});
      log('文件 ID 已注入: ' + file.path + ' → ' + id);
      return { id, wrote: true };
    }
    // 已有 ID：查重
    const holders = (this.scanIdMap()[id] || []).filter(p => p !== file.path);
    if (!holders.length) {
      if (this.idRegistry[id] !== file.path) { this.idRegistry[id] = file.path; this.saveData(this.persistPayload()).catch(() => {}); }
      return { id, wrote: false };
    }
    // 同 ID 有别人 → 判原主
    const regPath = this.idRegistry[id];
    const regAlive = regPath && regPath !== file.path && holders.indexOf(regPath) >= 0 &&
      (this.app.vault.getAbstractFileByPath(regPath) instanceof TFile);
    let iAmOwner;
    if (regAlive) iAmOwner = false;                    // 注册的原主还活着且不是我 → 我是副本
    else if (regPath === file.path) iAmOwner = true;   // 注册的就是我 → 原主
    else {
      // 注册表缺失/过期 → ctime 兜底：存活持有者中「最早出生」的才是原件。
      // （干跑发现：注册路径已死时若不比存活者 ctime，两个存活副本会各自认领 → 持续共享 ID = 串）
      const regFile = regPath ? this.app.vault.getAbstractFileByPath(regPath) : null;
      if (regFile instanceof TFile) {
        iAmOwner = file.stat.ctime <= regFile.stat.ctime;
      } else {
        iAmOwner = true;
        for (const p of holders) {
          const hf = this.app.vault.getAbstractFileByPath(p);
          if (hf instanceof TFile && hf.stat.ctime < file.stat.ctime) { iAmOwner = false; break; }
        }
      }
      if (iAmOwner) this.idRegistry[id] = file.path;
    }
    if (iAmOwner) { this.saveData(this.persistPayload()).catch(() => {}); return { id, wrote: false }; }
    // 我是副本 → 换新号（原 ID 留给原件，存储不动）
    const used = new Set(Object.keys(this.scanIdMap()));
    let nid; do { nid = this.newFileId(); } while (used.has(nid));
    await this.app.fileManager.processFrontMatter(file, fm => { fm['28notes-id'] = nid; });
    this.idRegistry[nid] = file.path;
    this.saveData(this.persistPayload()).catch(() => {});
    log('检测到 ID 冲突（复制/同步副本），已换新号: ' + file.path + ' ' + id + ' → ' + nid);
    return { id: nid, wrote: true };
  }

  // ---- 视图状态落盘（2026-09-04）：内存 Map 双写进 perFile[viewId].views，节流 800ms ----
  // viewId：捷径 = 壳文件自己的 ID（不同捷径不共用，2026-09-04 定）；普通导图 = 数据文件 ID。
  // 治三件事：重启丢位置（旧版只存内存）、切走丢最后一截（销毁 flush 后立即落盘）、改名丢 key（ID 不变）。
  recordViewPersist(viewId, value) {
    if (!viewId) return;
    const rec = Object.assign({}, this.savedPerFile[viewId]);
    rec.views = Object.assign({}, rec.views);
    rec.views[''] = value;
    this.savedPerFile[viewId] = rec;
    if (!this._vpTimer) {
      this._vpTimer = setTimeout(() => { this._vpTimer = null; this.saveData(this.persistPayload()).catch(() => {}); }, 800);
    }
  }
  flushViewPersistNow() {
    if (this._vpTimer) { clearTimeout(this._vpTimer); this._vpTimer = null; }
    return this.saveData(this.persistPayload()).catch(() => {});
  }

  // 设置面板持久化（备注内容/颜色/字号、翻译开关占位）
  // ---- 主题（2026-08-31）：目前只有连线颜色差异。设置页切换 → applyThemeAll 推送到所有打开的视图即时生效 ----
  applyThemeAll() {
    const t = (this.settings && this.settings.theme) || 'default';
    try { this.panels.forEach(set => set.forEach(v => v.post({ type: 'setTheme', value: t }))); } catch (e) { log('主题推送失败: ' + e); }
  }
  // ---- 文件树徽章样式切换（2026-08-31）：文本/图标 即时重渲 ----
  applyBadgeStyle() {
    try { this.updateBookmarkBadges(); } catch (e) { log('徽章样式切换失败: ' + e); }
  }
  // ---- 空图新手提示隐藏切换（2026-09-01）：推送到所有打开的视图即时生效 ----
  applyHideHintAll() {
    const h = !!(this.settings && this.settings.hideHint);
    try { this.panels.forEach(set => set.forEach(v => v.post({ type: 'setHideHint', value: h }))); } catch (e) { log('提示隐藏推送失败: ' + e); }
  }
  // ---- 付费状态（2026-09-04）：licenseState 变化（onload 算好 / 激活 / 反激活 / 设置页刷新）推送到所有打开的视图，
  // 让 iframe 的 state.isPro 即时更新，避免「首次打开试用期被误锁」「激活后编辑器要 force reload 才生效」两处同一根因的 Bug ----
  pushLicenseState() {
    const isPro = !!(this.licenseState && this.licenseState.active);
    const licenseSource = (this.licenseState && this.licenseState.source) || 'none'; // 'license'=已购买 → iframe 右上角"激活 Pro"提示按钮隐藏
    try { this.panels.forEach(set => set.forEach(v => v.post({ type: 'licenseUpdate', isPro, licenseSource }))); } catch (e) { log('付费状态推送失败: ' + e); }
  }

  saveSettings() {
    return this.saveData(this.persistPayload());
  }

  // ---- 旧数据迁移（2026-09-04，一次性、幂等）：钥匙 path/文件名 → 文件 ID ----
  // ① perFile[path] → perFile[fileId]（文件已删的记录直接丢弃——本来就找不到主人）
  // ② history/<文件名>/ → history/<fileId>/（basename 唯一匹配现存文件才迁；孤儿/歧义挪进 .trash 保留，不删）
  async migrateToId() {
    if (this.migratedIdDone) { this.gcHistorySoon(); return; }
    try {
      // ① perFile
      for (const p of Object.keys(this.savedPerFile)) {
        if (p.indexOf('fm-') === 0) continue; // 已是新 key（幂等保护）
        const rec = this.savedPerFile[p];
        delete this.savedPerFile[p];
        const f = this.app.vault.getAbstractFileByPath(p);
        if (!(f instanceof TFile)) continue;
        const { id } = await this.ensureFileId(f);
        if (id && !this.savedPerFile[id]) this.savedPerFile[id] = rec;
      }
      // ② 历史目录
      let folders = [];
      try { folders = (await this.app.vault.adapter.list(HISTORY_ROOT)).folders; } catch (_) {}
      const mdFiles = this.app.vault.getMarkdownFiles();
      for (const dir of folders) {
        const dirName = dir.split('/').pop();
        if (dirName.indexOf('fm-') === 0) continue; // 已是 ID 目录（幂等保护）
        const matches = mdFiles.filter(f => f.name === dirName); // 目录名 = <文件名.md>
        let done = false;
        if (matches.length === 1) {
          const { id } = await this.ensureFileId(matches[0]);
          if (id) {
            try { await this.app.vault.adapter.rename(dir, HISTORY_ROOT + '/' + id); done = true; }
            catch (e) { log('迁移历史目录失败: ' + dirName + ' — ' + e); done = true; // 改名失败也不再重试，防反复
            }
          }
        }
        if (!done) {
          // 孤儿（文件已删）/ 歧义（多文件同名）：挪进 Obsidian 的 .trash 保留，可手动找回
          try {
            const trashDir = '.trash/28notes-孤儿历史-' + new Date().toISOString().slice(0, 10);
            if (!this.app.vault.getAbstractFileByPath(trashDir)) await this.app.vault.createFolder(trashDir).catch(() => {});
            await this.app.vault.adapter.rename(dir, trashDir + '/' + dirName);
            log('孤儿历史目录已挪入 .trash: ' + dirName);
          } catch (e) { log('孤儿历史挪移失败: ' + dirName + ' — ' + e); }
        }
      }
      this.migratedIdDone = true;
      await this.saveData(this.persistPayload()).catch(() => {});
      log('文件 ID 迁移完成');
    } catch (e) { log('ID 迁移失败（下次启动重试）: ' + e); }
    this.gcHistorySoon();
  }

  // ---- 历史目录垃圾回收（低频：距上次 >24h）：目录不属任何现存文件的 ID → 挪 .trash ----
  // 与迁移共用「挪 .trash 不硬删」策略：删错可找回；正确性不依赖 GC（只是清理空间）。
  gcHistorySoon() {
    if (this._gcTimer) return;
    this._gcTimer = setTimeout(() => { this._gcTimer = null; this.gcHistory().catch(() => {}); }, 5000);
  }
  async gcHistory() {
    const now = Date.now();
    if (this.lastGcAt && now - this.lastGcAt < 86400000) return;
    let folders = [];
    try { folders = (await this.app.vault.adapter.list(HISTORY_ROOT)).folders; } catch (_) { return; }
    const ids = new Set(Object.keys(this.scanIdMap()));
    let moved = 0;
    for (const dir of folders) {
      const name = dir.split('/').pop();
      if (ids.has(name)) continue;
      try {
        const trashDir = '.trash/28notes-孤儿历史-' + new Date(now).toISOString().slice(0, 10);
        if (!this.app.vault.getAbstractFileByPath(trashDir)) await this.app.vault.createFolder(trashDir).catch(() => {});
        await this.app.vault.adapter.rename(dir, trashDir + '/' + name);
        moved++;
      } catch (e) { log('GC 挪移失败: ' + name + ' — ' + e); }
    }
    if (moved) log('历史垃圾回收：挪走 ' + moved + ' 个无主目录（.trash 内可恢复）');
    this.lastGcAt = now;
    await this.saveData(this.persistPayload()).catch(() => {});
  }

  // ===== 许可证（2026-09-02 付费激活机制）=====
  // 机制现状与改动守则见 激活机制报告.md；验证逻辑本身在 license.js（纯函数，可被 test.mjs 直接测）

  // 本机设备 ID（2026-09-04 改为设备指纹）：由「平台 + CPU 型号 + 内存总量」现场派生哈希，
  // 不落地任何文件。粒度 = 真实电脑（同一台电脑多个 vault 共享同一 ID；vault 被云同步到
  // 别的电脑不跟随），替代旧版「vault 配置文件里的随机 UUID」（同电脑多 vault 重复占额度、
  // vault 同步到多电脑又合并成一台，两头都是歪的）。
  // 组成刻意不含主机名/系统版本：改电脑名、系统升级、重装系统（不换硬件）指纹都不变；
  // 只有换电脑 / 换 CPU / 改内存才变 —— 那本来就该算另一台。
  // ⚠️ 它只用于激活回执对账（设备数无技术强制），指纹变化不影响激活状态（激活只看码的签名）；
  //    真变了只是设置页回执变样，用户把新回执发给作者即可。
  async ensureDeviceId() {
    try {
      const cpu = (os.cpus() || [])[0];
      const raw = [os.platform(), cpu ? String(cpu.model) : 'unknown-cpu', String(os.totalmem())].join('|');
      return 'dev-' + (await license.digestHex(raw)).slice(0, 16);
    } catch (e) {
      // 指纹派生失败（极端情况）：退回 settings 里已存的 ID，没有再随机一个——功能绝不受影响
      log('设备指纹派生失败，退回存储值: ' + e);
      const existing = this.settings.license && this.settings.license.deviceId;
      if (existing && String(existing).length >= 8) return String(existing);
      return license.newDeviceId();
    }
  }

  // 重新验证激活状态（每次启动都跑）：
  //   ① 有真码 → 验签，通过则「已激活」（真码优先，与试用无关）
  //   ② 无码 / 码无效 → 14 天试用判定（首次自动开始试用；过期则未激活）
  // 状态永远由「码本身是否有效 / 试用是否到期」决定，手改 data.json 字段没用。
  async refreshLicenseState() {
    const lic = this.settings.license || {};
    const now = new Date();

    // ① 有码 → 验签
    if (license && lic.key) {
      const r = await license.verifyLicenseCode(lic.key);
      if (r.valid) {
        this.licenseState = { active: true, source: 'license', reason: '', lid: r.lid, plan: r.plan, maxDevices: r.maxDevices };
        // 换码 / 换设备 → 补留痕（activationLog 只追加不覆盖，作为日后对账的本机证据）
        if (lic.lid !== r.lid || lic.deviceId !== this.deviceId) {
          lic.lid = r.lid;
          lic.plan = r.plan;
          lic.maxDevices = r.maxDevices;
          lic.deviceId = this.deviceId;
          lic.activatedAt = now.toISOString();
          lic.receipt = await license.buildReceipt(r.lid, this.deviceId);
          lic.activationLog = (Array.isArray(lic.activationLog) ? lic.activationLog : [])
            .concat([{ lid: r.lid, deviceId: this.deviceId, at: lic.activatedAt }]);
          await this.saveSettings();
        }
        this.pushLicenseState();
        return this.licenseState;
      }
      // 码无效 → 落②试用判定（用户可能输错码但还在试用期）
    }

    // ② 试用判定（license 模块装载成功才走；模块缺失按未激活兜底）
    if (license) {
      if (!lic.trialStartedAt) {
        // 首次：自动开始 14 天试用
        lic.trialStartedAt = now.toISOString();
        lic.trialLastSeenAt = now.toISOString();
        await this.saveSettings();
      }
      const trialDays = (typeof lic.trialDays === 'number' && lic.trialDays > 0) ? lic.trialDays : license.TRIAL_DAYS;
      const ts = license.trialStatus(now, lic.trialStartedAt, lic.trialLastSeenAt, trialDays);
      // 防时钟回拨：lastSeenAt 单调递增（只在时间真正前进时更新）
      const seen = lic.trialLastSeenAt ? Date.parse(lic.trialLastSeenAt) : NaN;
      if (!Number.isFinite(seen) || now.getTime() > seen) {
        lic.trialLastSeenAt = now.toISOString();
        await this.saveSettings();
      }
      if (ts.status === 'active') {
        this.licenseState = { active: true, source: 'trial', reason: '', trialRemainingMs: ts.remainingMs };
        this.pushLicenseState();
        return this.licenseState;
      }
      this.licenseState = { active: false, source: 'trial', reason: 'trialExpired', trialRemainingMs: 0 };
      this.pushLicenseState();
      return this.licenseState;
    }

    this.licenseState = { active: false, source: 'none', reason: '' };
    this.pushLicenseState();
    return this.licenseState;
  }

  // 调试用：把本机授权状态强制设成某个形态（2026-09-04，仅作者本机 + 调试开关打开时可用）
  // 原理：试用期总时长固定 14 天（trialDays），所以「想剩多久」可以反推起点：
  //     剩余 = trialStartedAt + 14天 − now   ⇒   trialStartedAt = now + 目标剩余 − 14天
  // 选「未激活」则把起点推到 15 天前 → 剩余为负 → trialStatus 判定 expired。
  // ⚠️ 必须同时重置 trialLastSeenAt：防时钟回拨逻辑取 effectiveNow = max(now, lastSeen)，
  //    留着旧的 lastSeen 会把它当"更早的时间"参与取最大值，让剩余时间算歪、调试值不准。
  async applyDebugLicenseState(key) {
    const opt = DEBUG_LICENSE_STATES[key];
    if (!opt) return;
    if (!this.settings.license) this.settings.license = {};
    const lic = this.settings.license;

    // 「已激活」：从作者本机文件读测试码，走真实激活流程（码不在代码/发布包里，见 readDebugLicenseCode ⚠️）
    if (opt.fromFile) {
      const code = readDebugLicenseCode();
      if (!code) {
        new Notice('未找到调试激活码文件：~/.28notes-license/debug-license-code.txt（仅作者本机存在）');
        return;
      }
      const r = await this.activateLicense(code);
      if (r.ok) return;
      const msg = T('license.err.' + (r.reason || 'unknown'));
      new Notice(msg && msg !== ('license.err.' + r.reason) ? msg : T('license.err.unknown'));
      return;
    }

    // 试用 / 未激活：先清掉可能残留的激活码——refreshLicenseState 是先验码，若 settings.license.key
    // 还是刚才那个有效测试码，会直接进「已激活」分支，下面设的 trialStartedAt 根本走不到。
    // （activationLog 保留，与 deactivateLicense 一致：换码/重装历史是对账证据）
    if (lic.key) {
      lic.key = ''; lic.lid = ''; lic.plan = ''; lic.maxDevices = 3; lic.activatedAt = ''; lic.receipt = '';
    }
    const totalMs = 14 * 86400000;
    if (opt.remainingMs < 0) {
      lic.trialStartedAt = new Date(Date.now() - 15 * 86400000).toISOString(); // 15 天前开始 → 14 天试用早已结束
    } else {
      lic.trialDays = 14; // 总时长固定不动，只挪起点
      lic.trialStartedAt = new Date(Date.now() + opt.remainingMs - totalMs).toISOString();
    }
    lic.trialLastSeenAt = lic.trialStartedAt;
    await this.saveSettings();
    await this.refreshLicenseState(); // 内部 pushLicenseState 广播 → 已打开的导图即时跟变，不用重载
  }

  // 调试下拉该选中哪一项：按当前真实状态反推最接近的选项（避免每次开设置页都跳回默认值）
  currentDebugStateKey() {
    const st = this.licenseState || {};
    if (st.source === 'license' && st.active) return 'license'; // 已激活（调试用测试码也是这个态）
    if (st.source === 'trial' && !st.active) return 'expired';
    if (st.source === 'trial' && st.active) {
      const ms = st.trialRemainingMs || 0;
      if (ms <= 5 * 60 * 1000) return '2min';
      if (ms <= 2 * 60 * 60 * 1000) return '1hour';
      if (ms <= 2 * 24 * 60 * 60 * 1000) return '1day';
      return '14day';
    }
    return '14day';
  }

  // 激活（设置页调用）。返回 { ok, reason, remainingMs }，reason 是 i18n 键后缀。
  async activateLicense(rawCode) {
    if (!license) return { ok: false, reason: 'unknown' }; // 模块没装载成功：宁可报失败，也不静默放行
    const guard = this.attemptLimiter.check();
    if (!guard.allowed) return { ok: false, reason: 'locked', remainingMs: guard.remainingMs };

    const r = await license.verifyLicenseCode(rawCode);
    this.attemptLimiter.record(r.valid);
    if (!r.valid) return { ok: false, reason: r.reason };

    const lic = this.settings.license;
    lic.key = license.normalizeLicenseCode(rawCode); // 存归一化后的形态（去分组空格）
    lic.lid = r.lid;
    lic.plan = r.plan;
    lic.maxDevices = r.maxDevices;
    lic.deviceId = this.deviceId;
    lic.activatedAt = new Date().toISOString();
    lic.receipt = await license.buildReceipt(r.lid, this.deviceId);
    lic.activationLog = (Array.isArray(lic.activationLog) ? lic.activationLog : [])
      .concat([{ lid: r.lid, deviceId: this.deviceId, at: lic.activatedAt }]);
    await this.saveSettings();
    await this.refreshLicenseState();
    log('许可证激活成功 lid=' + r.lid);
    return { ok: true, lid: r.lid };
  }

  // 解除激活（换设备前建议先在这里解除，或直接在微信联系作者处理）
  async deactivateLicense() {
    this.settings.license = { key: '', lid: '', plan: '', maxDevices: 3, activatedAt: '', deviceId: '', receipt: '', activationLog: (this.settings.license && this.settings.license.activationLog) || [] };
    // activationLog 保留：换码/重装的历史是日后对账的证据，不随解除激活清空
    await this.saveSettings();
    await this.refreshLicenseState();
  }

  // 功能门控入口：未接入点前一律放行（PRO_LOCKS 表在 license.js，locked 改 true 即上锁）
  // 许可证不可用时一律放行：付费机制出问题也不能挡住用户用插件
  canUseFeature(featureId) {
    if (!license) return true;
    return license.canUseFeature(featureId, !!(this.licenseState && this.licenseState.active));
  }

  // 打开 Pro 功能详情弹窗（被设置页入口 / 前端金色按钮触发）
  openProFeaturesModal() {
    new ProFeaturesModal(this.app, this).open();
  }

  // 读取插件 assets/ 下的图片，返回 base64 data URI（供两页弹窗内嵌）
  loadAssetDataUri(name) {
    try {
      const base = this.app.vault.adapter.basePath || '';
      const dir = base ? path.join(base, this.manifest.dir) : this.manifest.dir;
      const file = path.join(dir, 'assets', name);
      const base64 = fs.readFileSync(file).toString('base64');
      return 'data:image/png;base64,' + base64;
    } catch (e) {
      console.error('[28 Notes] 读取资源失败', name, e);
      return '';
    }
  }

  // ---- 界面语言（2026-08-30）----
  // 解析：设置 auto = 跟随 Obsidian 客户端语言（moment.locale()，zh 开头=中文，其它=英文）；否则用设置值
  lang() {
    const pref = (this.settings && this.settings.language) || 'auto'; // onload 早期 settings 未载入也能安全回退 auto
    if (pref === 'zh' || pref === 'en') return pref;
    try { return /^zh/i.test(String(moment.locale())) ? 'zh' : 'en'; } catch (_) { return 'zh'; }
  }
  // 切语言即时生效：重建所有导图 iframe（骨架 HTML + 前端文案随之刷新）+ 刷新文件列表徽章 + 重渲染设置页
  // 文件列表徽章文案按语言写入 CSS 变量（行内样式优先级高于 styles.css 的 :root，i18n 才是唯一来源）
  applyBadgeText() {
    try {
      const r = document.documentElement;
      r.style.setProperty('--shin-bookmark-badge-text', JSON.stringify(T('badge.bookmark')));
      r.style.setProperty('--shin-mindmap-badge-text', JSON.stringify(T('badge.mindmap')));
    } catch (_) {}
  }

  applyLanguage() {
    if (!i18n) return;
    i18n.setLang(this.lang());
    // ①命令面板里的命令名：Obsidian 命令名在 addCommand 时定，切语言后直接改注册表对象上的 name（按 id，不动用户自定义快捷键）
    try {
      const cmds = this.app.commands && this.app.commands.commands;
      if (cmds) {
        const map = { 'new-mindmap': T('cmd.newMap'), 'open-as-markdown': T('cmd.openAsMarkdown'), 'open-as-mindmap': T('cmd.openAsMindmap') };
        for (const id of Object.keys(map)) {
          const c = cmds[this.manifest.id + ':' + id];
          if (c) { c.name = map[id]; c.title = map[id]; }
        }
      }
    } catch (e) { log('命令名刷新失败: ' + e); }
    // ②左侧 Ribbon 按钮提示：改 aria-label/title（无需重载插件）
    try {
      if (this.ribbonBtn) { this.ribbonBtn.setAttribute('aria-label', T('cmd.newMap')); this.ribbonBtn.setAttribute('title', T('cmd.newMap')); }
    } catch (_) {}
    for (const set of this.panels.values()) for (const v of [...set]) { try { v.buildIframe(); } catch (_) {} }
    this.applyBadgeText();
    try { this.updateBookmarkBadges(); } catch (_) {}
    if (this.settingTab) { try { this.settingTab.display(); } catch (_) {} }
  }

  // ---- rename 同步 ----
  async onFileRenamed(file, oldPath) {
    if (!(file instanceof TFile)) return;
    // ① 捷径 target 更新（捷径是 frontmatter 字段，Obsidian 的自动更新内部链接不管）
    if (file.extension === 'md') {
      const candidates = this.app.vault.getMarkdownFiles().filter(f => {
        const fm = this.app.metadataCache.getFileCache(f);
        const attrs = (fm && fm.frontmatter) || {};
        return attrs['28notes'] === 'mmlink' && attrs.target === oldPath;
      });
      for (const bm of candidates) {
        try {
          await this.app.fileManager.processFrontMatter(bm, fm => { fm.target = file.path; });
          log('捷径 target 已同步: ' + bm.path + ' → ' + file.path);
        } catch (e) { log('捷径 target 同步失败: ' + bm.path + ' — ' + e); }
      }
      // ② 历史目录 & ③ perFile：2026-09-04 起两者钥匙都是文件 ID（frontmatter 28notes-id），
      //    改名/移动时 ID 不变 → 无需任何迁移（旧版按文件名/路径换 key 的逻辑删除）。
      // ④ panels 表换 key
      if (this.panels.has(oldPath)) {
        this.panels.set(file.path, this.panels.get(oldPath));
        this.panels.delete(oldPath);
      }
    }
  }

  // ---- 新建思维导图（重名自动加序号：未命名思维导图 1 / 2 …）----
  // 接受可选目标目录（默认按 active 文件父目录；右键文件面板空白/文件夹时由 file-menu 传入，2026-09-01）
  async createNewMindmap(dir) {
    try {
      if (!dir) {
        const active = this.app.workspace.getActiveFile();
        dir = active ? this.parentDirOf(active) : '';
      }
      let name = T('newMap.name') + '.md';
      let i = 1;
      while (this.app.vault.getAbstractFileByPath(dir ? dir + '/' + name : name)) {
        name = T('newMap.name') + ' ' + i + '.md'; i++;
      }
      const p = dir ? dir + '/' + name : name;
      const f = await this.app.vault.create(p, shared.MINDMAP_TEMPLATE);
      // 新建文件后 metadataCache 可能还没索引到 frontmatter（缓存滞后）→ 轮询等缓存（最多 1 秒）再打开
      const deadline = Date.now() + 1000;
      while (Date.now() < deadline && !this.detectKindSync(f.path)) {
        await new Promise(r => setTimeout(r, 80));
      }
      await this.app.workspace.getLeaf(false).openFile(f);
    } catch (e) { new Notice(T('notice.newMapFail') + e); }
  }

  // ---- 打开文件 / 笔记 ----
  async openFilePath(p, fromView) {
    try {
      if (!p) return;
      // vault 内绝对路径 → 转相对走 Obsidian 打开（28notes 文件自动路由导图视图）
      const base = this.app.vault.adapter.basePath || '';
      if (base && (p === base || p.startsWith(base + '/'))) {
        const rel = p.slice(base.length + 1);
        const tf = this.app.vault.getAbstractFileByPath(rel);
        if (tf instanceof TFile) { await this.app.workspace.getLeaf(false).openFile(tf); return; }
      } else {
        // 相对路径（按数据文件目录解析）
        const af = this.app.vault.getAbstractFileByPath(p);
        if (af instanceof TFile) { await this.app.workspace.getLeaf(false).openFile(af); return; }
      }
      // vault 外：存在性检查后打开访达并选中文件（2026-08-30 定：不直接打开，在访达里定位）
      if (fs.existsSync(p)) {
        // macOS: open -R 在访达里定位；其它系统兜底用系统默认应用打开
        if (process.platform === 'darwin') {
          const { exec } = require('child_process');
          exec('open -R "' + p.replace(/"/g, '\\"') + '"', (e) => { if (e) this.app.openWithDefaultApp(p); });
        } else { this.app.openWithDefaultApp(p); }
        return;
      }
      new Notice(T('notice.fileMissing') + p);
    } catch (e) { new Notice(T('notice.openFileFail') + e); }
  }

  async openNote(note, pid, fromView) {
    try {
      const source = fromView ? fromView.dataPath() : '';
      const dest = this.app.metadataCache.getFirstLinkpathDest(note, source);
      if (!dest) { new Notice(T('notice.noteMissing') + note); return; }
      if (pid) this.pendingDrill.set(dest.path, pid);
      await this.app.workspace.getLeaf(false).openFile(dest);
    } catch (e) { new Notice(T('notice.openNoteFail') + e); }
  }

  // ---- 历史快照（28Notes-Files/history/<fileId>/snap-<ts>.json）----
  // 2026-09-04：钥匙从「文件名」换成「文件 ID」（frontmatter 28notes-id）。
  // 文件名/完整路径都可被「删除后新建同名文件」重用 → 历史被新文件继承（实踩：未命名思维导图 1）。
  // ID 随机生成不可重用，结构性免疫串扰；文件改名/移动时 ID 不变，无需迁移目录。
  historyDir(fileId) { return HISTORY_ROOT + '/' + fileId; }
  async listSnapshots(fileId) {
    if (!fileId) return [];
    const dir = this.historyDir(fileId);
    const snaps = [];
    try {
      const listing = await this.app.vault.adapter.list(dir);
      for (const fp of listing.files) {
        if (!fp.endsWith('.json')) continue;
        try {
          const meta = JSON.parse(await this.app.vault.adapter.read(fp));
          if (meta && typeof meta.timestamp === 'number' && typeof meta.text === 'string') {
            snaps.push({ timestamp: meta.timestamp, name: meta.name || '' }); // 列表只带元数据，全文按需 loadSnapshot
          }
        } catch (_) {}
      }
    } catch (_) {}
    snaps.sort((a, b) => b.timestamp - a.timestamp);
    return snaps;
  }
  async saveSnapshot(fileId, text, name) {
    if (!fileId) { log('保存快照失败：fileId 未就绪'); return 0; }
    const dir = this.historyDir(fileId);
    try { if (!this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir).catch(() => {}); } catch (_) {}
    const timestamp = Date.now();
    const payload = JSON.stringify({ timestamp, name: name || '', text });
    try {
      await this.app.vault.adapter.write(dir + '/snap-' + timestamp + '.json', payload);
      log('历史快照已保存: snap-' + timestamp + (name ? ' (' + name + ')' : ''));
      this.pruneSnapshots(fileId); // 后台清理，不阻塞
      return timestamp;
    } catch (e) { log('保存历史快照失败: ' + e); return 0; }
  }
  // 快照分层清理（VSCode 同规）：手动命名永不清理；自动：最近 50 份全留；
  // 更早按时间稀疏化——30 天内每天 1 份、30~90 天每 3 天 1 份、90 天以上每周 1 份（每桶留最新）
  async pruneSnapshots(fileId) {
    try {
      const snaps = await this.listSnapshots(fileId);
      if (!snaps.length) return;
      const now = Date.now();
      const DAY = 86400000;
      const del = [];
      let autoSeen = 0;
      const buckets = new Set();
      for (const s of snaps) {
        if (s.name) continue;
        autoSeen++;
        if (autoSeen <= 50) continue;
        const age = now - s.timestamp;
        const width = age <= 30 * DAY ? DAY : (age <= 90 * DAY ? 3 * DAY : 7 * DAY);
        const bucket = Math.floor(age / width);
        if (buckets.has(bucket)) del.push(s); else buckets.add(bucket);
      }
      for (const s of del) {
        try { await this.app.vault.adapter.remove(this.historyDir(fileId) + '/snap-' + s.timestamp + '.json'); } catch (_) {}
      }
      if (del.length) log('快照清理：删除过期自动快照 ' + del.length + ' 份');
    } catch (e) { log('快照清理失败: ' + e); }
  }
  async loadSnapshot(fileId, timestamp) {
    if (!fileId) return '';
    try {
      const meta = JSON.parse(await this.app.vault.adapter.read(this.historyDir(fileId) + '/snap-' + timestamp + '.json'));
      return meta && typeof meta.text === 'string' ? meta.text : '';
    } catch (e) { log('读取历史快照失败: ' + e); return ''; }
  }
  async createCopyFromSnapshot(targetFile, text) {
    if (!targetFile) return '';
    const dir = this.parentDirOf(targetFile);
    const base = targetFile.basename;
    let copyName = base + T('copy.suffix') + '.md';
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(dir ? dir + '/' + copyName : copyName)) {
      copyName = base + T('copy.suffix') + ' ' + i + '.md'; i++;
    }
    try {
      const copyPath = dir ? dir + '/' + copyName : copyName;
      await this.app.vault.create(copyPath, shared.MINDMAP_FM + text);
      log('已创建副本: ' + copyName);
      return copyPath;
    } catch (e) { log('创建副本失败: ' + e); new Notice(T('notice.copyFailSnap') + e); return ''; }
  }
}

// ---- 设置面板（DeepSeek Harness 风格）：Obsidian 设置 → 第三方插件最下方「28 Notes」分项 ----
class ShinNotesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  section(containerEl, title) {
    return containerEl.createEl('h3', {
      text: title,
      cls: 'shin-settings-section',
      attr: { style: 'margin: 1em 0 0.5em; font-size: 1.05em; font-weight: 600;' }
    });
  }

  renderMarkdown(el, markdown) {
    el.empty();
    MarkdownRenderer.render(this.app, markdown, el, '', this);
  }

  markdownSetting(containerEl, name, markdown, controlBuilder) {
    const st = new Setting(containerEl).setName(name).setDesc('');
    this.renderMarkdown(st.descEl, markdown);
    if (controlBuilder) controlBuilder(st);
    return st;
  }

  // ---- 调试栏（2026-09-04）：仅作者本机显示，且永远在设置页最顶部 ----
  // 判据复用 isAuthorMachine()（~/.28notes-license/private.pem 只在作者机器上有）。
  // 开关「关」时只渲染这一个开关，页面其余部分与普通用户所见完全一致（不残留调试项）。
  renderDebugSection(containerEl) {
    if (!isAuthorMachine()) return; // 普通用户机器上没有私钥 → 整栏不存在，连开关都看不到
    this.section(containerEl, T('debug.heading'));
    const s = this.plugin.settings;
    new Setting(containerEl)
      .setName(T('debug.toggleName'))
      .setDesc(T('debug.toggleDesc'))
      .addToggle(t => t
        .setValue(!!s.debugMode)
        .onChange(async (v) => {
          s.debugMode = v;
          await this.plugin.saveSettings();
          this.display(); // 开关会增减下面的调试项，整页重绘最简单可靠
        }));
    if (!s.debugMode) return; // 关 → 到此为止，下面不渲染任何调试项
    new Setting(containerEl)
      .setName(T('debug.stateName'))
      .setDesc(T('debug.stateDesc'))
      .addDropdown(d => {
        Object.keys(DEBUG_LICENSE_STATES).forEach(k => d.addOption(k, DEBUG_LICENSE_STATES[k].label));
        d.setValue(this.plugin.currentDebugStateKey()); // 按当前真实状态回显，不每次跳回默认
        d.onChange(async (k) => {
          await this.plugin.applyDebugLicenseState(k);
          this.display();
        });
      });
  }

  // ---- 许可证区块（2026-09-02）----
  // 已激活：显示许可证号/设备上限/激活时间 + 可复制的激活回执 + 解除激活
  // 未激活：输入框 + 激活按钮 + 购买引导（微信）
  renderLicenseSection(containerEl) {
    const lic = this.plugin.settings.license || {};
    const state = this.plugin.licenseState || { active: false, source: 'none' };

    // ① 已激活：一行搞定 —— 标题 + 许可证信息备注 + 右侧「解除绑定」
    if (state.source === 'license' && state.active) {
      const st = new Setting(containerEl).setName(T('license.activeTitle')).setDesc('');
      this.renderMarkdown(st.descEl, T('license.activeDescMd', lic.lid || '-', lic.maxDevices || 3, (lic.activatedAt || '').slice(0, 10)));
      st.addButton(b => b
        .setButtonText(T('license.unbindBtn'))
        .onClick(async () => {
          await this.plugin.deactivateLicense();
          new Notice(T('license.okDeactivated'));
          this.display();
        }));
      return;
    }

    // ② 未激活（试用中 / 试用已结束 / 模块异常）：同样一行，右侧两个按钮 —— 如何激活 ↗ / 激活
    const trialActive = state.source === 'trial' && state.active;
    const days = trialActive ? Math.max(1, Math.ceil((state.trialRemainingMs || 0) / 86400000)) : 0;
    const st = new Setting(containerEl).setName(T('license.ctaTitle')).setDesc('');
    this.renderMarkdown(st.descEl, trialActive ? T('license.ctaDescTrialMd', days) : T('license.ctaDescExpiredMd'));
    // 「如何激活 ↗」：设置页里直接弹付费教程弹窗（编辑器里点 Pro 按钮才是弹 Pro 介绍弹窗，两处入口不同）
    st.addButton(b => b
      .setButtonText(T('license.howToActivateBtn'))
      .onClick(() => { new PaymentModal(this.app, this.plugin).open(); }));
    // 「激活」：在下方展开激活码输入框（常驻一个输入框太挤，且多数时候只是先看看）
    st.addButton(b => b
      .setButtonText(T('license.activateBtn'))
      .setCta()
      .onClick(() => this.toggleActivateBox(st.settingEl)));
  }

  // 「激活」按钮配套的输入框：点开展开、再点收起（2026-09-04）
  // ⚠️ 用 afterEl.after(wrap) 插在这一行正下方 —— 若直接 append 到 containerEl 会落到设置页最末尾
  // （跑到「界面」栏目底下去了），位置就错了。
  toggleActivateBox(afterEl) {
    if (this._activateBox) { this._activateBox.remove(); this._activateBox = null; return; }
    const wrap = document.createElement('div');
    wrap.className = 'shin-activate-box';
    wrap.style.cssText = 'margin: 6px 0 20px;';
    afterEl.after(wrap);
    let input = '';
    new Setting(wrap)
      .addText(t => t
        .setPlaceholder(T('license.inputPh'))
        .onChange(v => { input = v; }))
      .addButton(b => b
        .setButtonText(T('license.activateBtn'))
        .setCta()
        .onClick(async () => {
          const r = await this.plugin.activateLicense(input);
          if (r.ok) {
            new Notice(T('license.okActivated'));
            this.display();
            return;
          }
          if (r.reason === 'locked') {
            new Notice(T('license.err.lockedFmt', Math.max(1, Math.ceil((r.remainingMs || 0) / 60000))));
            return;
          }
          const msg = T('license.err.' + (r.reason || 'unknown'));
          new Notice(msg && msg !== ('license.err.' + r.reason) ? msg : T('license.err.unknown'));
        }));
    this._activateBox = wrap;
    try { const el = wrap.querySelector('input'); if (el) el.focus(); } catch (e) { /* 聚焦失败不影响使用 */ }
  }

  // （旧的「试用天数调试控件」renderTrialDaysDebug 已删除：它改的是「试用总天数」，
  //   而调试栏改的是「现在还剩多久」，后者才是调试真正需要的；留两套会在关闭调试后残留调试项。）

  loadQrDataUri() {
    try {
      const base = this.app.vault.adapter.basePath || '';
      const dir = base ? path.join(base, this.plugin.manifest.dir) : this.plugin.manifest.dir;
      const file = path.join(dir, 'assets', 'qrcode.png');
      const base64 = fs.readFileSync(file).toString('base64');
      return 'data:image/png;base64,' + base64;
    } catch (e) {
      console.error('[28 Notes] 读取赞助二维码失败', e);
      return '';
    }
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('shin-settings'); // 打标：styles.css 靠它把控件（按钮/下拉）与说明文字上下居中
    const s = this.plugin.settings;

    // ① 调试（仅作者本机；关掉开关后整页与普通用户所见完全一致）
    this.renderDebugSection(containerEl);

    // ② 许可证（2026-09-04 顺序调整：许可证整块在前、界面整块在后，不再交叉）
    // 激活/解除后调用 this.display() 整页重绘，状态永远从 plugin.licenseState 现取（不缓存）
    containerEl.createEl('h2', { text: T('license.heading') });
    this.renderLicenseSection(containerEl);

    // ③ 界面
    containerEl.createEl('h2', { text: T('settings.uiHeading') });

    // 界面语言
    new Setting(containerEl)
      .setName(T('settings.language'))
      .setDesc(T('settings.languageDesc'))
      .addDropdown(d => d
        .addOption('auto', T('settings.langAuto'))
        .addOption('zh', T('settings.langZh'))
        .addOption('en', 'English')
        .setValue(s.language || 'auto')
        .onChange(async (v) => {
          s.language = v;
          await this.plugin.saveSettings();
          this.plugin.applyLanguage(); // 切语言即时生效
        }));

    // 主题（2026-08-31）：默认/飞书（蓝线）/飞书（灰线版）可选；Obsidian、MindNode 适配中置灰
    this.markdownSetting(
      containerEl,
      T('settings.theme'),
      T('settings.themeDescMd'),
      (st) => {
        st.addDropdown(d => {
          // 2026-09-01 删「默认」选项——只剩三个飞书版；首次进入默认 feishuGray（settings 默认值兜底）
          // 老用户 settings.theme='default' → setValue 显示 feishuGray（行为不变：默认=灰线）
          d.addOption('feishu', T('settings.themeFeishu'))
            .addOption('feishuGray', T('settings.themeFeishuGray'))
            .addOption('feishuPink', T('settings.themeFeishuPink'))
            .addOption('obsidian', T('settings.themeObsidian'))
            .addOption('mindnode', T('settings.themeMindNode'))
            .setValue(s.theme === 'default' ? 'feishuGray' : (s.theme || 'feishuGray'));
          // 「适配中」两项置灰不可选（原生 option disabled；按 value 找，防增删选项后错位）
          try {
            Array.from(d.selectEl.options).forEach(o => { if (o.value === 'obsidian' || o.value === 'mindnode') o.disabled = true; });
          } catch (e) { log('主题选项置灰失败: ' + e); }
          d.onChange(async (v) => {
            s.theme = v;
            await this.plugin.saveSettings();
            this.plugin.applyThemeAll(); // 已打开的视图即时换线色，无需重载
          });
        });
      });

    // 徽章样式（2026-08-31）：文本 / 图标。切换即时重渲徽章 CSS
    this.markdownSetting(
      containerEl,
      T('settings.badgeStyle'),
      T('settings.badgeStyleDesc'),
      (st) => {
        st.addDropdown(d => d
          .addOption('text', T('settings.badgeStyleText'))
          .addOption('icon', T('settings.badgeStyleIcon'))
          .setValue(s.badgeStyle || 'text')
          .onChange(async (v) => {
            s.badgeStyle = v;
            await this.plugin.saveSettings();
            this.plugin.applyBadgeStyle();
          }));
      });

    // 界面简化（2026-09-01）：隐藏新增页面提示（空图新手提示）。切换即时推送所有视图
    this.markdownSetting(
      containerEl,
      T('settings.hideHint'),
      T('settings.hideHintDesc'),
      (st) => {
        st.addDropdown(d => d
          .addOption('show', T('settings.hintShow'))
          .addOption('hide', T('settings.hintHide'))
          .setValue(s.hideHint ? 'hide' : 'show')
          .onChange(async (v) => {
            s.hideHint = (v === 'hide');
            await this.plugin.saveSettings();
            this.plugin.applyHideHintAll();
          }));
      });

    // ---- 尾注 ----
    this.section(containerEl, T('settings.footnote'));

    // 使用技巧（2026-09-01 移到尾注下第一位）
    this.markdownSetting(
      containerEl,
      T('settings.tips'),
      T('settings.tipsMd')
    );
    // 使用教程（2026-09-01 移到尾注下第二位）
    this.markdownSetting(
      containerEl,
      T('settings.tutorial'),
      T('settings.tutorialMd'),
      (st) => st.addButton(b => b
        .setButtonText(T('settings.tutorialBtn'))
        .onClick(() => window.open('https://space.bilibili.com/481595180', '_blank')) // 与设计说明按钮同链接（链接不变，2026-09-01 定）
      ));

    // 赞助开发者（2026-09-01 移到第三位，按钮展开/折叠二维码）
    const qrSrc = this.loadQrDataUri();
    const qrWrap = containerEl.createEl('div');
    qrWrap.style.display = 'none';
    qrWrap.style.margin = '8px 0 16px';
    qrWrap.style.textAlign = 'left';
    if (qrSrc) {
      qrWrap.createEl('img', {
        attr: { src: qrSrc, style: 'max-width: 260px; border-radius: 8px; display: block;' }
      });
    } else {
      qrWrap.createEl('div', { text: T('settings.qrMissing') });
    }

    const sponsorSt = this.markdownSetting(
      containerEl,
      T('settings.sponsor'),
      T('settings.sponsorMd'),
      (st) => st.addButton(b => b
        .setButtonText(T('settings.sponsorBtn'))
        .onClick(() => {
          qrWrap.style.display = qrWrap.style.display === 'none' ? 'block' : 'none';
        }))
    );
    sponsorSt.settingEl.after(qrWrap);

    // Bug 与功能建议（2026-09-01 移到第四位）
    this.markdownSetting(
      containerEl,
      T('settings.bug'),
      T('settings.bugMd'),
      (st) => st.addButton(b => b
        .setButtonText('GitHub ↗')
        .onClick(() => {
          const url = ''; // 待填：GitHub Issue 提交地址
          if (url) window.open(url, '_blank');
          else new Notice(T('notice.githubUnset'));
        }))
    );

    // 帮助区（2026-09-01 旧位置：保留兼容，不再展示；新位置已在尾注下）
  }
}

// ===== Pro 功能详情弹窗（Modal 形式）=====
// = HTML 页面 2 / Frame 303 设计稿：固定窗口 374px + 内部滚动内容（=302 全部）
// = 浮层（钉在窗口、不随滚动）：激活创新 Pro 版按钮 + 白色渐变遮罩(上透明下白) + 灰色提示"鼠标滚动以向下查看" + 关闭按钮
class ProFeaturesModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.containerEl.classList.add('pm-shell');
    contentEl.classList.add('pm');

    // 试用提示文案：按真实授权状态分支（不写死天数，13 是旧写死值已移除）
    const trialText = this.computeTrialLine();

    // —— 可滚动正文（= HTML 页面 2 的 302 内容，严格按设计稿 top 绝对定位）——
    const body = contentEl.createDiv({ cls: 'pm-scroll' });
    body.innerHTML = `
      <div class="pm-inner">
        <img class="pm-logo" data-asset="logo.png" alt="28 Notes" style="top:var(--pm-logo-top,18px);left:var(--pm-logo-left,18px);width:var(--pm-logo-w,110px);display:var(--pm-logo-show,block)">
        <p class="pm-line pm-off" style="top:var(--pm-off-top,0px)">-50%</p>
        <p class="pm-line pm-price" style="top:var(--pm-price-top,108px)">
          <span>早鸟价优惠&nbsp;&nbsp;</span><span class="pm-old">¥76</span><span class="pm-now">&nbsp;&nbsp;¥38</span>
        </p>
        <p class="pm-line pm-trial" style="top:var(--pm-trial-top,138px)">${trialText}</p>
        <div class="pm-line pm-div" style="top:var(--pm-div1-top,201px)"></div>

        <p class="pm-line pm-sec-h" style="top:var(--pm-sec1h-top,240px)">🌱 了解免费版</p>
        <p class="pm-line pm-market" style="top:var(--pm-sec1market-top,282px)">
          市面上思维导图软件<span class="pm-blue">存在的大多数功能，无限制使用</span>。
        </p>
        <p class="pm-line pm-p-dim" style="top:var(--pm-sec1dim-top,317px)">无限量生成思维导图、插入图片、备注、Obsidian 双链、本地文件链接、节点链接等。</p>
        <div class="pm-fig" style="top:var(--pm-sec1fig-top,375px)"><img data-asset="pro-shot-free.png" alt=""></div>

        <p class="pm-line pm-sec-h" style="top:var(--pm-sec2h-top,662px)">🪴 了解创新 Pro 版</p>
        <p class="pm-line pm-market" style="top:var(--pm-sec2market-top,711px)">
          <span class="pm-blue">28 Notes 原创的创新功能</span>，试用期结束后，需激活以使用。
        </p>
        <p class="pm-line pm-p-dim" style="top:var(--pm-sec2dim-top,744px)">Now、Minor、捷径、AI 定位路径、多级折叠等。</p>
        <div class="pm-fig" style="top:var(--pm-sec2fig-top,794px)"><img data-asset="pro-shot-a.png" alt=""></div>

        <p class="pm-line pm-cap" style="top:var(--pm-cap1-top,1033px)">原视图：庞大混乱</p>
        <div class="pm-fig" style="top:var(--pm-sec2bfig-top,1071px)"><img data-asset="pro-shot-b.png" alt=""></div>
        <p class="pm-line pm-cap" style="top:var(--pm-cap2-top,1312px)">使用创新功能 Now 和 Minor 后：瞬间清晰，聚焦重点</p>

        <div class="pm-line pm-div" style="top:var(--pm-div2-top,1364px)"></div>
        <div class="pm-line pm-foot" style="top:var(--pm-foot-top,1385px)">
          <p class="pm-thanks">你的支持可以让我持续开发，做出美好的产品，谢谢你！</p>
          <p class="pm-note">本产品为买断制，激活码永久有效，可激活三台设备。（不包含在线生成式 AI 功能）</p>
        </div>
      </div>
    `;

    // —— 固定浮层（不随滚动）——
    const cta = contentEl.createEl('button', { cls: 'pm-cta', text: '激活创新 Pro 版 🪴' });
    cta.addEventListener('click', () => { new PaymentModal(this.app, this.plugin).open(); });
    contentEl.createDiv({ cls: 'pm-mask' });
    contentEl.createDiv({ cls: 'pm-scrollhint', text: '鼠标滚动以向下查看' });

    this.applyAssets(contentEl);
  }
  // 试用提示文案（仅「试用」状态显示；已付费激活 / 模块异常均无此行）
  //   - 试用中：真实结束日期（now + licenseState.trialRemainingMs，非写死）
  //   - 试用结束：优化后的到期文案
  computeTrialLine() {
    const st = this.plugin.licenseState || {};
    if (st.source !== 'trial') return ''; // 仅试用状态有这行；已付费 / 异常均不显示
    if (st.active && (st.trialRemainingMs || 0) > 0) {
      // 显示「还剩 N 天」而非具体日期（2026-09-04 定：天数更直观）；算法与设置页许可证栏一致（不足 1 天按 1 天算）
      const days = Math.max(1, Math.ceil((st.trialRemainingMs || 0) / 86400000));
      return `你的试用期还剩 ${days} 天。试用结束后，部分创新功能将受限。`;
    }
    return '你的试用期已结束，请激活创新 Pro 版以使用全部功能。';
  }
  applyAssets(root) {
    root.querySelectorAll('img[data-asset]').forEach(img => {
      const uri = this.plugin.loadAssetDataUri(img.dataset.asset);
      if (uri) img.src = uri;
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}

// ===== 支付引导弹窗（Modal 形式）=====
// = HTML 页面 4 / Frame 301 设计稿：固定窗口 374px + 内部滚动内容（=299 全部）
// = 浮层（钉在窗口、不随滚动）：白色渐变遮罩 + 灰色提示"鼠标滚动以向下查看" + 关闭按钮（无激活按钮）
class PaymentModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.containerEl.classList.add('pm-shell');
    contentEl.classList.add('pay');

    // —— 固定浮层（遮罩 + 灰字提示，无激活按钮；关闭用 Obsidian 原生按钮）——
    contentEl.createDiv({ cls: 'pay-mask' });
    contentEl.createDiv({ cls: 'pay-scrollhint', text: '鼠标滚动以向下查看' });

    // —— 可滚动正文（= HTML 页面4/Frame301 的 299 内容，严格按设计稿 top 绝对定位）——
    const body = contentEl.createDiv({ cls: 'pay-scroll' });
    body.innerHTML = `
      <div class="pay-inner">
        <img class="pm-logo" data-asset="logo.png" alt="28 Notes" style="top:var(--pm-logo-top,18px);left:var(--pm-logo-left,18px);width:var(--pm-logo-w,110px);display:var(--pm-logo-show,block)">
        <p class="pay-line pay-num" style="top:var(--pay-num1-top,0px)">❶</p>
        <p class="pay-line pay-h" style="top:var(--pay-h1-top,105px)">微信扫码支付 38 元</p>
        <div class="pay-qrbox" style="top:var(--pay-qr-top,154px)"><img data-asset="pay-qr.png" alt=""></div>

        <p class="pay-line pay-num" style="top:var(--pay-num2-top,404px)">❷</p>
        <p class="pay-line pay-email" style="top:var(--pay-email-top,508px)">
          <span>将付款截图发送至邮箱：</span><span class="pay-email-addr" data-copy="ShinContactEM@Gmail.com">ShinContactEM@Gmail.com</span>
        </p>
        <div class="pay-line pay-steps" style="top:var(--pay-steps-top,562px)">
          <div>1. 截图需包转账单号（样式如下）</div>
          <div>2. 发送后，24h 内左右会收到激活码</div>
        </div>
        <p class="pay-line pay-alt" style="top:var(--pay-alt1-top,606px)">如不便发送邮件，也可添加开发者微信 Hi28Notes 直接激活</p>
        <div class="pay-shot" style="top:var(--pay-shot-top,661px)"><img data-asset="activate-guide.png" alt=""></div>

        <p class="pay-line pay-num" style="top:var(--pay-num3-top,1034px)">❸</p>
        <p class="pay-line pay-h" style="top:var(--pay-h3-top,1140px)">激活</p>
        <p class="pay-line pay-path" style="top:var(--pay-path-top,1174px)">在 Obsidian → 设置 → 第三方插件 → 28 Notes 里激活</p>
        <p class="pay-line pay-alt" style="top:var(--pay-alt3-top,1205px)">如遇激活问题，请发送邮件 / 联系开发者微信：Hi28Notes 解决</p>

        <p class="pay-line pay-thanks" style="top:var(--pay-thanks-top,1243px)">=) 谢谢你的支持！</p>
      </div>
    `;
    body.querySelector('.pay-email-addr').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText('ShinContactEM@Gmail.com'); new Notice('邮箱已复制'); }
      catch (e) { new Notice('复制失败，请手动复制'); }
    });

    this.applyAssets(contentEl);
  }
  applyAssets(root) {
    root.querySelectorAll('img[data-asset]').forEach(img => {
      const uri = this.plugin.loadAssetDataUri(img.dataset.asset);
      if (uri) img.src = uri;
    });
  }
  onClose() {
    this.contentEl.empty();
  }
}

module.exports = ShinMindMapPlugin;
