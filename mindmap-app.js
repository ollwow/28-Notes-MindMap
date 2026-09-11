// MM MindMap —— 导图界面（垂直树布局 + 交互 + 视图切换 + 格式校验）
// 布局为简单垂直树（从上往下）。美化留待后续统一调整。

// ===== 错误捕获层（调试用）=====
// Obsidian 移植：本脚本运行在视图 iframe 内，宿主（main.js）在注入本脚本前挂 window.__MM_HOST__。
// 前端 → 宿主消息协议与 VSCode 版一致（postMessage({type,...})），宿主直接函数调用处理；
// 宿主 → 前端走 iframe contentWindow.postMessage（下方 window message 监听不变）。
const vscodeApi = (typeof window !== 'undefined' && window.__MM_HOST__) || { postMessage() {} };
function wlog(t) { try { vscodeApi.postMessage({ type: 'log', text: String(t) }); } catch (_) {} }
try { document.documentElement.style.setProperty('--img-missing-text', "'" + T('img.missing') + "'"); } catch (_) {} // 图片缺失占位文案（CSS content 随语言切换）
function showError(msg) {
  const box = document.getElementById('error-box');
  if (box) { box.textContent = '⚠ ' + msg; box.className = ''; }
  wlog('ERROR: ' + msg);
}
// 界面可见提示条（webview 的 alert 可能被环境吞掉，一律用这个）
let toastTimer = null;
// toast：msg 文字；isWarn 警告色；action={label, fn} 可选的撤销按钮（2026-08-24 P1 加）
function toast(msg, isWarn, action) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999;padding:8px 16px;border-radius:6px;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:70%;display:flex;align-items:center;gap:10px;';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  const txt = document.createElement('span');
  txt.textContent = (isWarn ? '⚠ ' : '') + msg;
  el.appendChild(txt);
  if (action && action.label) {
    const btn = document.createElement('a');
    btn.textContent = action.label;
    btn.style.cssText = 'cursor:pointer;text-decoration:underline;font-weight:600;white-space:nowrap;';
    btn.onclick = () => { el.style.display = 'none'; clearTimeout(toastTimer); try { action.fn(); } catch (_) {} };
    el.appendChild(btn);
  }
  el.style.background = isWarn ? '#fff3cd' : '#e8f4ff';
  el.style.color = isWarn ? '#7a5b00' : '#1a4f8b';
  el.style.border = isWarn ? '1px solid #f0d48a' : '1px solid #b8d8f5';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3200);
  el.style.display = 'flex';
}
let toastBelowTimer = null;
// 底部白色 toast（位于选中节点菜单上方，样式与黑色 node-menu 一致但为白色）：用于可撤销提示
function toastBelow(msg, action) {
  let el = document.getElementById('toast-below');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-below';
    el.className = 'toast-below';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  const txt = document.createElement('span');
  txt.className = 'toast-below-msg';
  txt.textContent = msg;
  el.appendChild(txt);
  if (action && action.label) {
    const btn = document.createElement('a');
    btn.className = 'toast-below-action';
    btn.textContent = action.label;
    btn.onclick = () => { el.classList.remove('show'); clearTimeout(toastBelowTimer); try { action.fn(); } catch (_) {} };
    el.appendChild(btn);
  }
  clearTimeout(toastBelowTimer);
  toastBelowTimer = setTimeout(() => { el.classList.remove('show'); }, 4000);
  el.classList.add('show');
}
window.addEventListener('error', e => showError(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno));
window.addEventListener('unhandledrejection', e => showError('Promise 未捕获: ' + (e.reason && e.reason.message || e.reason)));
const vscode = vscodeApi;

const treeEl = document.getElementById('tree');
const canvasEl = document.getElementById('canvas');
// 贝塞尔连线层（2026-08-21 定：替换竖线+横线，接近飞书视觉）
const edgesSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
edgesSvg.id = 'edges';
edgesSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
// 拖拽预测曲线层（2026-08-28，飞书式）：与 edgesSvg 同级，只画「未来父 → 光标」一条贝塞尔
const dragSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
dragSvg.id = 'drag-edge';
dragSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
// 拖拽预测曲线层（2026-08-22 飞书式实时预测）：从 dragId 节点画一条红色虚线贝塞尔到预测落点
const viewMap = document.getElementById('view-map');
const viewMd = document.getElementById('view-md');
const mdEditor = document.getElementById('md-editor');
const state = { tree: null, selectedId: null, dragId: null, dragIds: null, view: 'map', currentRootId: null, currentRootPid: '', defaultPid: '', currentFilename: '', warnings: [], selectedImg: null, multiSelected: new Set(), marquee: false, isLink: false, bookmarkHealed: false, bookmarkRetried: false, editingNoteId: null, hideDone: false, hideHint: false, editingTitleId: null, editingTitleEl: null, editingEl: null, dragPreview: null, dragRows: null, userTouchedView: false,
  // 路径历史栈（上一/下一路径）：存 pid 序列，空串=根
  pathHistory: [], pathHistoryIndex: -1, suppressHistory: false,
  // 刚新建的节点 id 集合：仅这些节点在「清空回车 / ESC」时取消（删节点），已有节点清空只回退、绝不误删
  justCreated: new Set(),
  // 历史记录页（2026-08-27）
  historyMode: false,
  historyText: '',           // 当前正在查看的快照原始文本
  historyTree: null,         // 解析后的快照树
  historyList: [],           // 快照列表（timestamp, name）
  historyCurrentTs: 0,       // 当前查看的快照时间戳
  historyDiffIds: new Set(), // 与当前文档有差异的节点 id
  nowLocateIndex: 0,         // 当前定位的 Now 序号（定位按钮循环/悬浮菜单用；正常模式必初始化，否则 locateCenter 取模得 NaN 报错，2026-08-27 修）
  historyShowDiffOnly: false, // 是否只看差异
  liveTree: null            // 进入历史页前的真实文档树（差异比对基线 + 关闭时还原），历史页期间 state.tree 指向快照树
};

// 拖拽预测：找落点（重构为「结构化空间分区」，替代原先的欧氏最近 + 手写 if/else）
//   核心思路：垂直树里「深度 = 列（从左往右加深）」、同列节点按 Y 排成连续区间 → 任何坐标都恰好对应一个 (列, 行)。
// 拖拽落点预测（2026-08-27 第三版：参考 my-mind 重做判定层，github.com/ondras/my-mind src/mouse.ts computeDragState）：
//   【目标选择】卡片上精确命中优先；空白区「X 过滤 + Y 最近」：
//   先剔除两类卡片——①横向离光标太远（修 2026-08-28 纯 Y 带在稀疏/密集混合区跳到远处同高卡片的问题：
//   光标在左边，目标却锁到右边同 Y 的无关卡片上）②被拖节点自身/其子树（修拖到自家附近
//   「哪里都没有预测到」：预选过滤后会落到最近的有效目标，而不是判 invalid 什么都不显示）；
//   再在候选内取中心 Y 最近者。X 只作过滤、不参与排序——拖到 2 右侧时 2 仍在候选内且 Y 最近，
//   不会退回「X 选列、越过深层卡片左缘就跳 1.4」的老坑（2026-08-25 踩坑定案依旧成立）。
//   【判定层换成 my-mind 思路】兄弟是默认、子节点是特例：
//   ① 卡片上 → 内 Y 三段 before/after/over（保留）
//   ② 空白区以目标中心算偏差：纵向偏出卡片半高（=落在卡片间缝隙）→ 一律兄弟 before/after
//      ——缝隙拖拽不再误判成子节点（旧版「右缘以右全算 over」是预测不准的主根因）
//   ③ 纵向同高且向右 → 右缘外 max(被拖卡宽, 目标卡宽)×旋钮(--drop-child-range) 之内才算子节点，
//      之外 = 兄弟（my-mind：|dx|<max(w)、|dy|<max(h) 才 append，远离一律 sibling；被拖节点尺寸参与判定）
//   ④ 废掉 MAX_CHILD_DX=1000 距离截断：远离一切 = 最近节点的兄弟，不再判 invalid 取消拖拽
//      （无效只剩拖进自身/其子树，由 isInvalidDropTarget 判定）
// 拖拽热路径优化（2026-09-01）：dragstart 一次性快照所有节点视口矩形到 state.dragRects，
// 拖动期间 nearestDropTarget 只读缓存、不再每次对全部节点 getBoundingClientRect（O(N) 强制重排 = 大文件拖拽卡顿根因）。
// 自动滚动使视口坐标变化时由 tickAutoScroll 调 buildDragRects 重算。
function buildDragRects() {
  const rows = state.dragRows || document.querySelectorAll('#tree .node-row');
  const items = [];
  for (const row of rows) {
    const card = row.querySelector(':scope > .card');
    if (!card) continue;
    const r = card.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue; // 折叠/隐藏行跳过
    items.push({ id: row.dataset.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, w: r.width, h: r.height });
  }
  state.dragRects = items;
  if (state.dragIds && state.dragIds.length) {
    const dc = document.querySelector('.node-row[data-id="' + state.dragIds[0] + '"] > .card');
    state.dragW = dc ? dc.getBoundingClientRect().width : 0;
  } else state.dragW = 0;
}
function nearestDropTarget(clientX, clientY) {
  if (!state.dragRects) buildDragRects(); // 兜底（dragstart 已建）
  const items = state.dragRects;
  if (!items || !items.length) return null;

  // ① 卡片上：精确命中优先（含整张卡片矩形，不只是中段）
  for (const it of items) {
    if (clientX >= it.left && clientX <= it.right && clientY >= it.top && clientY <= it.bottom) {
      const frac = (clientY - it.top) / it.h;
      const position = frac < 0.3 ? 'before' : frac > 0.7 ? 'after' : 'over';
      if (isInvalidDropTarget(it.id)) return { targetId: null, position: 'invalid' };
      return { targetId: it.id, position, rect: it };
    }
  }

  // ② 空白区：X 过滤 + Y 最近（X 只剔除横向太远的卡片，不参与排序；reach 随卡片宽度，旋钮 --drop-x-reach）
  const xGap = it => clientX < it.left ? it.left - clientX : (clientX > it.right ? clientX - it.right : 0);
  const xReach = it => Math.max(it.w, 120) * cfgNum('--drop-x-reach', 1.5);
  let cands = items.filter(it => !isInvalidDropTarget(it.id) && xGap(it) <= xReach(it));
  if (!cands.length) cands = items.filter(it => !isInvalidDropTarget(it.id)); // 横向全都太远 → 退回全集合，由判定层给「最近节点的兄弟」
  if (!cands.length) return { targetId: null, position: 'invalid' }; // 只剩自身/子树可拖
  let band = cands[0];
  for (const it of cands) { if (Math.abs(clientY - it.cy) < Math.abs(clientY - band.cy)) band = it; }

  // 目标是当前根 → 只能变子节点（根没有兄弟，my-mind 同款：target.isRoot → append）
  if (band.id === currentRoot().id) return { targetId: band.id, position: 'over', rect: band };

  // 被拖卡片宽度参与判定（my-mind：w 取被拖与目标的 max——拖着大树到大空白更容易吸附成子节点）
  const dragW = state.dragW || 0; // 拖拽开始一次性快照（buildDragRects），避免每次拖拽移动都读布局
  const dx = clientX - band.cx;
  const dy = clientY - band.cy;

  // ③ 纵向偏出卡片半高（落在卡片间缝隙）→ 一律兄弟插入
  if (Math.abs(dy) > band.h / 2) return { targetId: band.id, position: dy < 0 ? 'before' : 'after', rect: band };

  // ④ 纵向同高：向右在吸附范围内 → 子节点；范围外（含左侧走廊）→ 兄弟
  if (dx > 0 && dx <= band.w / 2 + Math.max(dragW, band.w) * cfgNum('--drop-child-range', 1)) {
    return { targetId: band.id, position: 'over', rect: band };
  }
  return { targetId: band.id, position: dy < 0 ? 'before' : 'after', rect: band };
}
// 无效落点：目标在被拖节点自身/集合内/其子树里（父节点不能拖到子节点区域）→ 不显示任何预测 UI（2026-08-22 定）
function isInvalidDropTarget(targetId) {
  if (!state.dragIds || !targetId) return false;
  if (state.dragIds.includes(targetId)) return true;
  for (const id of state.dragIds) {
    if (isDescendant(state.tree, id, targetId)) return true;
  }
  return false;
}
// 拖拽预测高亮（2026-08-22，空隙预测不用曲线，用节点高亮显示）：
//   over    → 目标节点本身亮（变子节点）
//   before  → 目标节点上面亮 + 它的上一个兄弟下面亮（= 插在两者中间）；没有上一个兄弟就只亮自己
//   after   → 目标节点下面亮 + 它的下一个兄弟上面亮；没有下一个兄弟就只亮自己
function clearDragHighlights() {
  document.querySelectorAll('#tree .card.drag-over, #tree .card.drag-before, #tree .card.drag-after')
    .forEach(c => c.classList.remove('drag-over', 'drag-before', 'drag-after'));
  dragSvg.innerHTML = ''; // 预测曲线随高亮一起清（所有清理点都走这里）
}
// 拖拽中的「节点左中心」= 光标 − 抓点偏移（dragstart 时记）。预测落点与预测线统一用它驱动，不用光标（2026-08-28 定）。
function dragNodeXY(clientX, clientY) {
  return { x: clientX - (state.dragGrabDX || 0), y: clientY - (state.dragGrabDY || 0) };
}
// 跟手悬浮卡定位（2026-08-28）：容器 fixed，锚 = 节点左中心（光标−抓点偏移），与预测线端点同源永不漂。
// top 再减半个卡高：容器左上角 = 缩放后卡片左上角（dragGhostH = dragstart 时卡片屏幕高，已含 zoom）。
function moveDragGhost(clientX, clientY) {
  if (!state.dragGhostEl) return;
  state.dragGhostEl.style.left = (clientX - (state.dragGrabDX || 0)) + 'px';
  state.dragGhostEl.style.top = (clientY - (state.dragGrabDY || 0) - (state.dragGhostH || 0) / 2) + 'px';
}
document.addEventListener('dragover', e => { if (state.dragGhostEl) moveDragGhost(e.clientX, e.clientY); }); // 全程跟手（画布外也跟）
// 悬浮卡清理：drop 和 dragend 都要调——drop 里 moveNodes→render 会把源卡从 DOM 摘掉，
// dragend 挂在源卡上不再冒泡到 document，只靠 dragend 清理会留残影（2026-08-28 实测）
function cleanupDragGhost() {
  if (state.dragGhostEl) { state.dragGhostEl.remove(); state.dragGhostEl = null; }
  if (state.dragGhostBlank) { state.dragGhostBlank.remove(); state.dragGhostBlank = null; }
}
// 拖拽预测曲线（2026-08-28，飞书思维笔记式）：从「未来的父」卡片右缘画一条贝塞尔到「被拖节点的左中心」。
// over=连目标卡片；before/after=连目标的父（与父节点 drag-over 高亮语义一致：排序=成为它父节点的子节点）。
// 终点 = 节点左中心（随拖拽移动）+ x 卡「落点列」下限：
//   落点列 = 松手后卡片所在的那一列（兄弟插入=目标卡片左缘；变子=末子左缘 / 无子=父右缘+--gap-x）。
//   节点在列右（空白区常态）→ 线完全跟随节点；节点进树内（列左）→ 钉在列上，不横穿真实节点/连线。
//   节点悬在目标附近时左中心≈落点列 → 贝塞尔弯曲与真实连线同几何（dx=(x2-x1)/2≈gap-x/2），不会"弯得比正常慢"。
// 坐标与 drawEdges 同规则：dragSvg 随 treeEl 缩放，path 用本地坐标 = 屏幕距离 / zoom。
function updateDragCurve(dp, nodeX, nodeY) {
  if (!dp || !dp.targetId || dp.position === 'invalid' || dp.position === 'root') { dragSvg.innerHTML = ''; return; }
  const srcId = dp.position === 'over' ? dp.targetId : parentId(dp.targetId);
  const srcRow = srcId && document.querySelector('.node-row[data-id="' + srcId + '"]');
  const srcCard = srcRow && srcRow.querySelector(':scope > .card');
  if (!srcCard) { dragSvg.innerHTML = ''; return; }
  const cr = srcCard.getBoundingClientRect();
  if (cr.width < 1 || cr.height < 1) { dragSvg.innerHTML = ''; return; }
  const tr = treeEl.getBoundingClientRect();
  const s = zoom || 1;
  const x1 = (cr.right - tr.left) / s, y1 = (cr.top + cr.height / 2 - tr.top) / s;
  // 落点列 x（终点 x 的下限）：变子=末子左缘 / 无子=父右缘+--gap-x；兄弟插入=目标卡片左缘
  let colX;
  if (dp.position === 'over') {
    const kidCards = srcRow.querySelectorAll(':scope > .children > .node-row > .card');
    colX = kidCards.length ? (kidCards[kidCards.length - 1].getBoundingClientRect().left - tr.left) / s
                           : x1 + cfgNum('--gap-x', 80); // 无可见子：第一个子挂 --gap-x 处
  } else {
    const tRow = document.querySelector('.node-row[data-id="' + dp.targetId + '"]');
    const tCard = tRow && tRow.querySelector(':scope > .card');
    if (!tCard) { dragSvg.innerHTML = ''; return; }
    const kr = tCard.getBoundingClientRect();
    if (kr.width < 1 || kr.height < 1) { dragSvg.innerHTML = ''; return; }
    colX = (kr.left - tr.left) / s;
  }
  const x2 = Math.max((nodeX - tr.left) / s, colX);
  const y2 = (nodeY - tr.top) / s;
  const dx = Math.max(20, (x2 - x1) / 2);
  dragSvg.setAttribute('width', treeEl.scrollWidth || 10);
  dragSvg.setAttribute('height', treeEl.scrollHeight || 10);
  dragSvg.innerHTML = '<path d="M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '"/>';
}
// 给指定 id 的卡片加高亮类（折叠未渲染则跳过）
function setOnCard(id, cls) {
  if (!id) return;
  const row = document.querySelector('.node-row[data-id="' + id + '"]');
  if (row) { const c = row.querySelector(':scope > .card'); if (c) c.classList.add(cls); }
}
function applyDragPreview(dp) {
  clearDragHighlights();
  if (!dp || !dp.targetId || dp.targetId === state.dragId) return;
  if (dp.position === 'over') { setOnCard(dp.targetId, 'drag-over'); return; }
  if (dp.position === 'before') {
    setOnCard(dp.targetId, 'drag-before');
    setOnCard(siblingId(dp.targetId, -1), 'drag-after');
    // 父节点也亮：排序 = 插到它前面，同时你将成为它父节点的子节点（2026-08-22 定，两状态一起显示）
    setOnCard(parentId(dp.targetId), 'drag-over');
    return;
  }
  if (dp.position === 'after') {
    setOnCard(dp.targetId, 'drag-after');
    setOnCard(siblingId(dp.targetId, 1), 'drag-before');
    setOnCard(parentId(dp.targetId), 'drag-over');
  }
}
// 找 id 的父节点 id（数据层）
function parentId(id) {
  const p = findParentNode(state.tree, id);
  return p ? p.id : null;
}
// 找 id 在树里的上一个(-1)/下一个(+1)兄弟（数据层查找，折叠未渲染的兄弟自然跳过）
function siblingId(id, dir) {
  const p = findParentNode(state.tree, id);
  if (!p || !p.children) return null;
  const i = p.children.findIndex(c => c.id === id);
  if (i < 0) return null;
  const s = p.children[i + dir];
  return s ? s.id : null;
}
function findParentNode(root, id) {
  if (!root) return null;
  for (const c of (root.children || [])) {
    if (c.id === id) return root;
    const r = findParentNode(c, id);
    if (r) return r;
  }
  return null;
}
// 画一条红色虚线贝塞尔（飞书风格）：从 dragId 节点到预测落点
// ===== Lucide 图标库（SVG path 集合；本项目所有 UI 图标统一来源 lucide.dev，2026-08-21 定） =====
const ICONS = {
  'corner-up-right': '<path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  'corner-up-left': '<path d="m20 20v-7a4 4 0 0 0-4-4H4"/><path d="M9 14 4 9l5-5"/>',
  'save': '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  'slash': '<path d="M2 22 22 2"/>',
  'text-quote': '<path d="M17 5H3"/><path d="M21 12H8"/><path d="M21 19H8"/><path d="M3 12v7"/>',
  'home': '<path d="M21 19v-6.733a4 4 0 0 0-1.245-2.9L13.378 3.31a2 2 0 0 0-2.755 0L4.245 9.367A4 4 0 0 0 3 12.267V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2"/>',
  'square-mouse-pointer': '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/>',
  'squircle-dashed': '<path d="M13.77 3.043a34 34 0 0 0-3.54 0"/><path d="M13.771 20.956a33 33 0 0 1-3.541.001"/><path d="M20.18 17.74c-.51 1.15-1.29 1.93-2.439 2.44"/><path d="M20.18 6.259c-.51-1.148-1.291-1.929-2.44-2.438"/><path d="M20.957 10.23a33 33 0 0 1 0 3.54"/><path d="M3.043 10.23a34 34 0 0 0 .001 3.541"/><path d="M6.26 20.179c-1.15-.508-1.93-1.29-2.44-2.438"/><path d="M6.26 3.82c-1.149.51-1.931 1.291-2.44 2.44"/>',
  'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'bold': '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  'circle': '<circle cx="12" cy="12" r="10"/>',
  'circle-dot': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  // 复制 AI 定位路径（2026-09-01）：lucide astroid 图标，呼应「AI 星体 / 定位节点」语义
  'astroid': '<path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203" />', // 复制 AI 定位路径图标（2026-09-01 改自 lucide astroid，呼应「AI 星体/定位」语义）
  'trash-2': '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'arrow-right-from-line': '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m11 8 4 4-4 4"/>',
  'arrow-left-to-line': '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m11 8-4 4 4 4"/>',
  'file-pen': '<path d="M11.5 22H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l5 5v6.5"/><path d="M18 22l4-4"/><path d="m15 19 2 2"/><path d="M14 22h-3.5a2 2 0 0 1 0-4H14"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'refresh-ccw-dot': '<path d="M21 12a9 9 0 0 0-9-9a9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5m-5 4a9 9 0 0 0 9 9a9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/><circle cx="12" cy="12" r="1"/>',
  'bug': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 20v-9m2-4a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4zm.12-3.12L16 2"/><path d="M21 21a4 4 0 0 0-3.81-4M21 5a4 4 0 0 1-3.55 3.97M22 13h-4M3 21a4 4 0 0 1 3.81-4M3 5a4 4 0 0 0 3.55 3.97M6 13H2M8 2l1.88 1.88M9 7.13V6a3 3 0 1 1 6 0v1.13"/></g>',
  'text-initial': '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5h6m-6 7h6M3 19h18M3 12l3.553-7.724a.5.5 0 0 1 .894 0L11 12m-7.08-2h6.16"/>',
  'log-in': '<path d="m10 17l5-5l-5-5m5 5H3m12-9h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  // 保存为捷径（2026-09-01 定）：lucide split
  'split': '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'chevrons-down-up': '<path d="m7 20l5-5l5 5M7 4l5 5l5-5"/>',
  'move-down': '<path d="M8 18L12 22L16 18"/><path d="M12 2V22"/>',
  'chevrons-down': '<path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/>',
  'asterisk': '<path d="M12 6v12"/><path d="M17.196 9 6.804 15"/><path d="m6.804 9 10.392 6"/>',
  'line-dot-right-horizontal': '<path d="M 3 12 L 15 12"/><circle cx="18" cy="12" r="3"/>',
  // 自定义图标（2026-08-26 内联）
  //   frame-eye-open   = Frame-1（睁眼弧线·无斜杠）→ Minor 显示态（正常色）
  //   frame-eye-closed = Frame（睁眼弧线 + 斜杠 M22 22L2 2）→ Minor 隐藏态（蓝色 .active-hide）
  //   frame-broken     = Frame-2（斜杠 + 角部 X）→ 默认路径失效态
  'frame-eye-open': '<path d="M13.77 3.043C12.5908 2.98153 11.4092 2.98153 10.23 3.043"/><path d="M13.771 20.956C12.5915 21.0197 11.4095 21.02 10.23 20.957"/><path d="M20.18 17.74C19.67 18.89 18.89 19.67 17.741 20.18"/><path d="M20.18 6.259C19.67 5.111 18.889 4.33 17.74 3.821"/><path d="M20.957 10.23C21.0203 11.4091 21.0203 12.5908 20.957 13.77"/><path d="M3.043 10.23C2.98183 11.4095 2.98216 12.5915 3.044 13.771"/><path d="M6.26 20.179C5.11 19.671 4.33 18.889 3.82 17.741"/><path d="M6.26 3.82C5.111 4.33 4.33 5.111 3.82 6.26"/>',
  'frame-eye-closed': '<path d="M13.77 3.04301C12.5908 2.98153 11.4092 2.98153 10.23 3.04301"/><path d="M13.771 20.956C12.5915 21.0197 11.4095 21.02 10.23 20.957"/><path d="M19 19C18.49 20.15 18.89 19.67 17.741 20.18"/><path d="M20.18 6.259C19.67 5.111 18.889 4.33 17.74 3.821"/><path d="M20.957 10.23C21.0203 11.4091 21.0203 12.5908 20.957 13.77"/><path d="M3.043 10.23C2.98183 11.4095 2.98216 12.5915 3.044 13.771"/><path d="M6.26 20.179C5.11 19.671 4.33 18.889 3.82 17.741"/><path d="M5 5C3.851 5.51 4.33 5.111 3.82 6.26"/><path d="M22 22L2 2"/>',
  'frame-broken': '<path d="M22 2L2 22"/><path d="M21.5 16.5L16.5 21.5"/><path d="M16.5 16.5L21.5 21.5"/>',
  // 历史记录（2026-08-27）：时钟回绕，表示"回到过去某个版本"
  'history': '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  // iconify mingcute:bilibili-line（2026-08-30：「了解插件」菜单图标）
  'bilibili-line': '<path fill="currentColor" d="M7.832 3.445a1 1 0 0 0-1.664 1.11L7 4zm10 1.11a1 1 0 0 0-1.664-1.11L17 4zM10 12a1 1 0 1 0-2 0zm-2 2a1 1 0 1 0 2 0zm8-2a1 1 0 1 0-2 0zm-2 2a1 1 0 1 0 2 0zM6 7v1h12V6H6zm15 3h-1v7h2v-7zm-3 10v-1H6v2h12zM3 17h1v-7H2v7zM7 4l-.832.555l2 3L9 7l.832-.555l-2-3zm10 0l-.832-.555l-2 3L15 7l.832.555l2-3zm-8 8H8v2h2v-2zm6 0h-1v2h2v-2zm-9 8v-1a2 2 0 0 1-2-2H2a4 4 0 0 0 4 4zm15-3h-1a2 2 0 0 1-2 2v2a4 4 0 0 0 4-4zM18 7v1a2 2 0 0 1 2 2h2a4 4 0 0 0-4-4zM6 7V6a4 4 0 0 0-4 4h2a2 2 0 0 1 2-2z"/>',
  // 设置（2026-09-01）：齿轮，lucide「settings」——「设置与 bug 提报」菜单图标
  'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  // 底部「加入微信群」临时 CTA 图标（lucide message-circle）
  'message-circle': '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  // 侧边 Ribbon「新建思维导图」按钮图标（Frame.svg 内联）；2026-08-30 定：节点链接复用此图标。
  // 原 SVG 外层包了 <g clip-path="url(#clip0_2018_5)">，但该 clipPath 在 iframe 内未定义会导致环不可见，此处去掉包裹、保留三路径。
  'frame': '<path fill="currentColor" d="M22.5927 12.0147C22.5927 14.7781 20.3465 17.0243 17.5822 17.0243C16.9523 17.0243 16.3492 16.9076 15.7959 16.6896C16.3153 16.4964 16.7913 16.215 17.2092 15.8661C17.3318 15.8789 17.4563 15.885 17.5822 15.885C19.7207 15.885 21.4534 14.1523 21.4534 12.0147C21.4534 9.87707 19.7207 8.14348 17.5822 8.14348C17.457 8.14348 17.3332 8.14943 17.2114 8.16221C16.793 7.81182 16.3162 7.52923 15.7959 7.33536C16.3492 7.11699 16.9523 7 17.5822 7C20.3465 7 22.5927 9.25128 22.5927 12.0147Z"/><path fill="currentColor" d="M14.0096 17.0243C16.773 17.0243 19.0192 14.7781 19.0192 12.0147C19.0192 9.25128 16.773 7 14.0096 7C11.2462 7 9 9.25128 9 12.0147C9 14.7781 11.2462 17.0243 14.0096 17.0243ZM14.0096 15.885C11.872 15.885 10.1393 14.1523 10.1393 12.0147C10.1393 9.87707 11.872 8.14348 14.0096 8.14348C16.1472 8.14348 17.8808 9.87707 17.8808 12.0147C17.8808 14.1523 16.1472 15.885 14.0096 15.885Z"/><path fill="currentColor" d="M2 11.35C1.64101 11.35 1.35 11.641 1.35 12C1.35 12.359 1.64101 12.65 2 12.65L2 12L2 11.35ZM2 12L2 12.65L10 12.65L10 12L10 11.35L2 11.35L2 12Z"/>',
  // 链接前缀图标（2026-08-30）：按 lucide 规范，均为描边式（默认 fill:none），无需写进 ICON_SET
  //   globe=网页链接 | folder-closed=外部文件链接 | brackets=Obsidian 双链 [[ ]] | file-input=双链备选（未启用）
  //   frame=侧边 Ribbon「新建思维导图」按钮图标（Frame.svg 内联）；2026-08-30 定：节点链接复用此图标，见 ICON_SET 标 fill
  'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'file': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
  'folder-closed': '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/>',
  'file-input': '<path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  // lucide:brackets（2026-08-30 定：Obsidian 双链 [[ ]] 图标，替换原 file-input）
  'brackets': '<path d="M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3"/><path d="M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3"/>',
  'square-arrow-right-enter': '<path d="m10 16 4-4-4-4"/><path d="M3 12h11"/><path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/>',
};
// 非默认(24x24 描边)图标的渲染参数：vb=viewBox，fill=true 表示填充式（iconify fluent/codicon/mdi/reicon 多为填充）
const ICON_SET = {
  'bug': { vb: '0 0 24 24', fill: false },
  'text-initial': { vb: '0 0 24 24', fill: false },
  'bilibili-line': { vb: '0 0 24 24', fill: true },
  'frame': { vb: '0 0 24 24', fill: true }, // 侧边 Ribbon 按钮图标（Frame.svg 内联，节点链接复用）
};
function renderIcon(name, size = 18) {
  const d = ICONS[name];
  if (!d) return '';
  const o = ICON_SET[name] || { vb: '0 0 24 24', fill: false };
  const fill = o.fill ? 'currentColor' : 'none';
  const stroke = o.fill ? 'none' : 'currentColor';
  return '<svg viewBox="' + o.vb + '" width="' + size + '" height="' + size + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">' + d + '</svg>';
}
// 更多菜单「加入 28 Notes 微信群」跳转地址（2026-09-07）
const JOIN_GROUP_URL = 'https://leafmethod.feishu.cn/wiki/J1sAwHu36inRtMkiLnOcN9LonNe?from=from_copylink';
// ===== Pro 功能卡点（2026-09-04）：体验期结束后，指定按钮悬浮变「待激活」按钮，点击进激活弹窗 =====
// 按钮本身完全不变；仅当未激活（state.isPro=false，等价于试用已结束未激活）时：
//   - 鼠标悬浮 → 仅图标换成 ticket 并染成 #F09343 橙（不动按钮背景，离屏还原；图标容器：工具栏按钮=自身，右键菜单项=.ctx-ic 只换图标不丢文字）
//   - 点击 → 拦截原功能，post openPro 让宿主弹激活引导
// 已激活 / 试用中：state.isPro=true → 完全不拦截（handler 实时读 state.isPro，激活态变化即时生效，无需重绑）
const TICKET_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>';
function applyProGate(el) {
  if (!el || el._proGateAttached) return;
  el._proGateAttached = true;
  el.classList.add('28-pro-gated');
  // 图标容器：工具栏 .tb 按钮自身 innerHTML 就是图标；右键菜单项图标在 .ctx-ic 子节点（只换它、保留文字标签）
  const iconHolder = el.classList.contains('ctx-item') ? (el.querySelector('.ctx-ic') || el) : el;
  // 注意：原始图标「每次悬浮时才记录」，不要挂在 attach 时记——部分按钮图标是延后渲染的
  // （如侧边 Now 按钮由 updateNowSideBtn() 在 applyProGate 之后才写入 innerHTML，attach 时记到的是空串，
  // 导致鼠标移开还原成空白）。每次 hover 记录当前真实图标，移开原样还原，最稳。
  let origIconHTML = null, origIconColor = '';
  el.addEventListener('mouseenter', () => {
    if (state.isPro) return;                  // 已激活/试用中：不变
    origIconHTML = iconHolder.innerHTML;       // 记录当前真实图标（此时图标早已渲染好）
    origIconColor = iconHolder.style.color || '';
    iconHolder.innerHTML = TICKET_SVG;         // 换成 ticket 图标
    iconHolder.style.color = '#F09343';        // 仅图标染橙（svg stroke=currentColor），不动按钮背景
  });
  el.addEventListener('mouseleave', () => {
    // 无条件还原：状态可能在 hover 期间被 licenseUpdate 改变（如正中激活），不能因 isPro 变化跳过还原，否则按钮卡在 ticket
    if (origIconHTML != null) iconHolder.innerHTML = origIconHTML;
    iconHolder.style.color = origIconColor;
    origIconHTML = null;
  });
  // 点击拦截：包装 onclick（2026-09-04 修「双触发」bug）。
  // ⚠️ 旧实现用 addEventListener 捕获 + stopPropagation，但 stopPropagation 只阻止事件传到【其它节点】，
  //    拦不住同一元素上已注册的监听器/onclick——而多数按钮的 onclick 赋值先于本函数注册，
  //    锁态点击 = 原功能照跑 + Pro 弹窗也弹（实测「莫名多出激活弹窗」的根因）。
  //    改为包装 onclick：与本函数和 onclick 赋值的先后顺序无关（调用须在 onclick 赋值之后，见各调用点）。
  //    锁态 → 完全替代原点击（只发 openPro）；已激活/试用中 → 透传原 onclick。
  const prevClick = el.onclick;
  el.onclick = function (e) {
    if (!state.isPro) { e.preventDefault(); e.stopPropagation(); vscode.postMessage({ type: 'openPro' }); return; }
    if (prevClick) prevClick.call(this, e);
  };
}
// 右上角「激活创新 Pro 版」提示按钮（2026-09-04）：只在「未购买」时显示。
// ⚠️ 判据是 state.licenseSource（有没有买），不是 state.isPro（功能能不能用）：
//    试用期内 isPro=true（功能全开）但 licenseSource='trial'（没买），按钮仍要显示 —— 它是营销提示，不是功能锁。
//    已激活 licenseSource='license' → 隐藏。绑定点击：post openPro 让宿主弹激活引导。
function updateProCta() {
  const el = document.getElementById('pro-cta');
  if (!el) return;
  el.classList.toggle('hidden', state.licenseSource === 'license');
  if (!el._proCtaBound) {
    el._proCtaBound = true;
    el.addEventListener('click', () => { vscode.postMessage({ type: 'openPro' }); });
  }
}
// 链接前缀图标包裹：返回 <span class="link-ico[ node-ico]">SVG</span>，供 mkLink / renderInline 复用（2026-08-30）
// node-ico 仅节点链接(frame)带，用于独立调大小/粗细（见 mindmap-app.css 的 --node-ico-* 变量）
function linkIco(name, size = 13) {
  const cls = 'link-ico' + (name === 'frame' ? ' node-ico' : '');
  return '<span class="' + cls + '">' + renderIcon(name, size) + '</span>';
}
// Minor 节点前缀图标（2026-08-26）：名称由 CSS 旋钮 --minor-ico 决定（定义在 app.css 顶部调参区），
// 可选：move-down（默认）| chevrons-down | asterisk | squircle-dashed；写了 ICONS 里没有的名字则回退 move-down。
function minorIconName() {
  const v = (getComputedStyle(document.documentElement).getPropertyValue('--minor-ico') || '').trim();
  return (v && ICONS[v]) ? v : 'move-down';
}
// 图标定案（2026-08-22 逐项确定；2026-08-25 改：locate=circle-dot、save(更新为当前路径)=replace；2026-08-26 改：hide 用自定义 frame-eye-open/closed）
//   undo=corner-up-left、redo=corner-up-right、locate=circle-dot、save=refresh-cw
//   hide=frame-eye-open/closed（状态由 setHideDone 决定，关闭态蓝色 .active-hide）、slash=slash/frame-broken（失效时 frame-broken）、more=more-horizontal
//   （note/done 两键无人使用，2026-08-27 体检删）
const ICON_FIXED = { undo: 'corner-up-left', redo: 'corner-up-right', locate: 'circle-dot', save: 'refresh-cw', slash: 'slash', hide: 'frame-eye-open', more: 'more-horizontal' };

// ============ Now 图标（2026-08-27；来源 ~/Desktop/22 Work - AI｜ VSCode MindMap 插件视觉/，已内联、不依赖文件）============
// 图标形：圆（目标节点）+ 竖线（stem）+ 四角火花（仅侧边按钮有）。四态：
//   side    = 侧边按钮·正常态：主圆+竖线=当前色(currentColor)，火花=当前色（黑底浅色主题下即深色），内联
//   sideOn  = 侧边按钮·只显示「当前关注 Now」激活态：文件驱动（webview/icons/now/side-on.svg，18×18，#9359FF 主 + #8B8B8B 火花）；svg 读不到时回退内联同款
//   bottom  = 底部节点菜单按钮·正常态：圆+竖线=白（黑底菜单上可见）
//   bottomOn= 底部节点菜单按钮·已标记当前关注 Now：圆+竖线=#8B5CF6（紫）
// 底部用「圆+竖线」（无火花，对齐底部按钮（用白色）.svg）；侧边用「圆+竖线+火花」（对齐侧边按钮 svg）
function renderNowIcon(variant) {
  // 激活态 sideOn 走文件驱动：读 extension.js 注入的 window.__NOW_ICONS__.sideOn（= webview/icons/now/side-on.svg，18×18，#9359FF 主 + #8B8B8B 火花）。
  // 改该 svg 后重载插件即生效。正常态 side 仍内联（currentColor，与侧边按钮｜正常状态.svg 一致）。
  if (window.__NOW_ICONS__ && variant === 'sideOn' && window.__NOW_ICONS__.sideOn) return window.__NOW_ICONS__.sideOn;
  const C = 'M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z';
  const L = 'M12 21L12 12';
  const sp = ['M3 3V5', 'M4 4H2', 'M19 16V20', 'M21 18H17'];
  const spark = (stroke) => sp.map(p => '<path d="' + p + '" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>').join('');
  if (variant === 'sideOn') {
    const main = 'stroke="#9359FF"', grey = 'stroke="#8B8B8B"'; // 2026-08-27：主紫 #9359FF + 深灰火花 #8B8B8B
    return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18">'
      + '<path d="' + C + '" ' + main + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="' + L + '" ' + main + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + spark(grey) + '</svg>';
  }
  const stroke = variant === 'bottom' ? '#fff' : variant === 'bottomOn' ? '#8B5CF6' : 'currentColor';
  const circle = '<path d="' + C + '" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  const line = '<path d="' + L + '" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  // 侧边按钮带火花，底部按钮不带（对齐各自 svg 源）；火花用 currentColor（正常态=黑，与侧边按钮｜正常状态.svg 一致）
  const extra = (variant === 'side') ? spark('currentColor') : '';
  return '<svg viewBox="0 0 24 24" fill="none" width="18" height="18">' + circle + line + extra + '</svg>';
}
// 卡片内 Now 前缀小图标：与底部按钮同款「圆+茎」标记；颜色/尺寸/描边由 CSS（.now-ico / 顶部旋钮）控制，
// 故 path 用 currentColor、不写死 stroke-width（这样 .now-unlocated 能把它染淡蓝、--now-ico-* 能调尺寸粗细），2026-08-27 改
function renderNowPrefix() {
  const C = 'M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z';
  const L = 'M12 21L12 12';
  return '<svg viewBox="0 0 24 24" fill="none">'
    + '<path d="' + C + '" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="' + L + '" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

// ============ ID 生成 ============
// id：内存临时 ID（渲染/拖拽用，不写文件）
// persistId：持久 ID（只有被复制链接的节点才有，写进文件 `<!--id:xxx-->`，解决重名跳转）
function genId() { return 'n' + Math.random().toString(36).slice(2, 10); } // 8 位随机，避免 4 位碰撞导致目标节点错乱（2026-08-21 修）
function genPersistId() { return 'p' + Math.random().toString(36).slice(2, 8); }

// ============ 解析：MD 大纲 → 树（严格模式，唯一标准格式） ============
// 唯一标准格式（2026-08-20 定案，不再兼容其他写法）：
//   - 第一行 = 中心主题（根）：`- 示例`（0 缩进，不用 # 标题）
//   - 子节点：Tab 缩进，一个 Tab = 一级
//   - 附属信息（节点下一行）：`> 备注` / `![](图片)` / `[[双链]]`
//   - 其他任何写法（空格缩进、# 标题、普通文字等）→ 不渲染 + 黄色警告条，但原样保留在文件里（不丢数据）
function parse(text) {
  const root = { id: 'root', title: '未命名', note: '', images: [], embeds: [], link: '', fold: false, persistId: '', color: '', rawLines: [], children: [] };
  const stack = [{ indent: 0, node: root }];
  let lastNode = null;
  let rootSeen = false;
  const warnings = [];
  const lines = text.split('\n');
  // 节点内换行（2026-08-30）：节点文字可多行，落盘就是 Markdown 大纲的天然写法，无特殊标记——
  //   标题续行 = 节点行后「不带 `- ` 的纯文字行」（同缩进；Markdown 惰性续行，前导 Tab 不作数）；
  //   备注续行 = 连续多个 `> ` 行；夹在续行之间的空行 = 文字内空行（段落间距）。
  //   lastAttach 记上一个有效行的类型，决定纯文字续行归标题还是备注（刚写完备注时续行归备注）。
  let lastAttach = null;
  const contKind = (line) => { // 这行是否当前节点的文字续行 → 'title' | 'note' | null
    const s = String(line).replace(/^[\t ]+/, ''); // 前导 Tab/空格都是缩进（Obsidian 源码模式续行常带空格缩进），不算内容
    if (!s.trim()) return null;
    if (/^[-*+]\s/.test(s)) return null;                 // 列表项 = 子节点
    if (s.startsWith('>')) return lastAttach === 'note' ? 'note' : null; // 备注行：仅接在备注行后算续行
    if (s.startsWith('!')) return null;                 // 图片/嵌入
    if (/^(\[\[.*\]\]|\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\))$/.test(s.trim())) return null; // 整行链接 = 附件
    if (/^\*\*(\[\[.*\]\]|\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\))\*\*$/.test(s.trim())) return null; // 加粗整行链接
    return lastAttach === 'note' ? 'note' : 'title';    // 纯文字：备注后归备注，其余归标题
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (!raw.trim()) {
      // 空行：后面紧跟的还是文字续行 → 空行属于节点文字（段落空行）；否则只是格式分隔，照旧跳过
      if (rootSeen && lastNode && (lastAttach === 'title' || lastAttach === 'note')) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && contKind(lines[j])) {
          if (lastAttach === 'note') lastNode.note += '\n';
          else lastNode.title += '\n';
        }
      }
      continue;
    }
    // 转义续行（2026-09-03）：行首 `\` = 上一节点标题的一部分（serialize 给「会被误读的续行」加的转义，见 needsTitleEsc）。
    // 剥一个 `\`，其余原样拼进标题，并标为标题续行——不列表项判断、不进备注/图片分支，
    // 这样节点文字里写 `- 项目`、`+ 小节`、`> 引用`、`![[图片]]`、整行链接都留在同一个节点里。
    const escLine = (rootSeen && lastNode) ? raw.match(/^[\t ]*\\([\s\S]*)$/) : null;
    if (escLine) {
      lastNode.title = (lastNode.title || '') + '\n' + escLine[1];
      lastAttach = 'title';
      continue;
    }
    // 第一行：必须是中心主题（0 缩进的列表项）
    if (!rootSeen) {
      const rootLi = raw.match(/^[-*+]\s+(.*)$/);
      if (rootLi) {
        const { text: t, meta } = splitComment(rootLi[1]);
        if (t) root.title = t;
        // 根节点也读行尾注释（2026-08-21 修：之前根节点不读 fold，折叠状态刷新后丢失）
        root.fold = meta.fold === '1' || meta.fold === 'true';
        root.persistId = meta.id || '';
        root.color = meta.color || '';
        root.minor = meta.minor === '1' || meta.minor === 'true'; // v2：根也读 minor 注释（2026-08-29）
        root.now = meta.now === '1' || meta.now === 'true'; // Now 节点（2026-08-27）
        rootSeen = true;
        lastNode = root; // 根节点也能接收自己的备注/图片/链接（粘贴复制的子树时第一行是临时根）
        lastAttach = 'title';
        continue;
      }
      warnings.push(T('warn.root', lineNo));
      root.rawLines.push(raw);
      continue;
    }
    // 列表项：必须 Tab 缩进（一个 Tab = 一级）
    const tabLi = raw.match(/^(\t+)[-*+]\s+(.*)$/);
    if (tabLi) {
      const indent = tabLi[1].length;
      const { text: t0, meta } = splitComment(tabLi[2]);
      // v2 格式（2026-08-29）：加粗 = 标题行内 **x**（标准 Markdown 语义）；Minor = 行尾注释 minor:1（不再用 _x_）；
      // ~~x~~ 保留给真正的删除线（字面保留在标题里，渲染成删除线）
      let t = t0, bold = false;
      const bM = t.match(/^\*\*(.+)\*\*$/);
      if (bM) { bold = true; t = bM[1]; }
      // 整行链接 = 链接节点：v2 支持 wikilink [[...]] 与标准 Markdown 链接 [显示名](url/file:///path) 两种
      const linkM = t.match(/^(\[\[(.+)\]\]|\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\))$/);
      const node = {
        id: genId(),
        title: linkM ? '' : t,
        note: '', images: [], embeds: [],
        link: linkM ? t : '',
        bold: bold,
        minor: meta.minor === '1' || meta.minor === 'true', // v2：Minor 走行尾注释（2026-08-29）
        fold: meta.fold === '1' || meta.fold === 'true',
        persistId: meta.id || '',
        color: meta.color || '',
        now: meta.now === '1' || meta.now === 'true', // Now 节点（2026-08-27）
        rawLines: [],
        children: []
      };
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      stack[stack.length - 1].node.children.push(node);
      stack.push({ indent, node });
      lastNode = node;
      lastAttach = 'title';
      continue;
    }
    // 0 缩进的后续列表项（错）
    if (/^[-*+]\s+/.test(raw)) {
      warnings.push(T('warn.tabIndent', lineNo));
      lastNode.rawLines.push(raw);
      continue;
    }
    // 空格缩进的列表项（错）
    if (/^ +[-*+]\s+/.test(raw)) {
      warnings.push(T('warn.spaceIndent', lineNo));
      lastNode.rawLines.push(raw);
      continue;
    }
    // 附属信息行（归属上一个节点）
    const t = raw.trim();
    if (lastNode) {
      if (t.startsWith('>')) {
        // 多行备注（2026-08-30 换行）：连续 `> ` 行逐行拼接；`>` 单独一行 = 备注内空行。
        // 后来的第二个 `> ` 块也不覆盖（旧逻辑会静默丢前一段备注）
        const nt = t.replace(/^>\s?/, '');
        lastNode.note = lastNode.note ? lastNode.note + '\n' + nt : nt;
        lastAttach = 'note';
        continue;
      }
      // v2 附件（2026-08-29）：![[文件名]] wikilink（集中放 28Notes-Files/，按扩展名分图片/音视频嵌入）；
      // 兼容读 v1 的 ![](路径)（序列化时统一写回 ![[文件名]]）
      const embM = t.match(/^!\[\[([^\]]+)\]\]$/);
      if (embM) {
        if (isMediaFile(embM[1])) lastNode.embeds.push(embM[1].trim());
        else lastNode.images.push(embM[1].trim());
        lastAttach = 'attach';
        continue;
      }
      if (/^!\[.*\]\(.*\)$/.test(t)) {
        const m = t.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
        lastNode.images.push(m ? m[1] : t);
        lastAttach = 'attach';
        continue;
      }
      // 子行链接：v2 wikilink [[...]] 或标准 Markdown 链接 [显示名](目标)；支持 ** 加粗包裹；Minor 走行尾注释不在此剥
      const subLinkM = t.match(/^(\[\[.*\]\]|\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\))$/);
      const subLinkBold = t.match(/^\*\*(\[\[.*\]\]|\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\))\*\*$/);
      if (subLinkM || subLinkBold) {
        lastNode.link = (subLinkM ? subLinkM[1] : subLinkBold[1]);
        if (subLinkBold) lastNode.bold = true;
        lastAttach = 'attach';
        continue;
      }
      // 纯文字续行（2026-08-30 换行）：不带 `- ` 的普通文字行 = 上一节点文字的下一行（备注行后则续备注）
      const contKindOfRaw = contKind(raw);
      if (contKindOfRaw) {
        const cont = raw.replace(/^[\t ]+/, '');
        if (contKindOfRaw === 'note') lastNode.note = (lastNode.note || '') + '\n' + cont;
        else lastNode.title = (lastNode.title || '') + '\n' + cont;
        lastAttach = contKindOfRaw;
        continue;
      }
    }
    // 不认得的行：挂到前一个节点上，写回时原样输出——警告归警告，绝不静默丢数据
    lastNode.rawLines.push(raw);
    warnings.push(T('warn.unrecognized', lineNo, t.slice(0, 24)));
  }
  // 校验：断链 + 重复 persistId（2026-08-24 P1 报错机制扩充，走现有黄条）
  validateTree(root, warnings);
  return { root, warnings };
}

// 数据校验：断链（[[#ID]] 的 ID 在本文件找不到）+ 重复 persistId（复制节点没清 ID 会冲突）
// v2（2026-08-29）：本文件节点链接 = [[#pid]]；[[笔记名#pid]] / [[笔记名]] 指向别的文件，不做本文件校验
function validateTree(root, warnings) {
  const pidSeen = {};
  const walk = (n) => {
    if (n.persistId) {
      if (pidSeen[n.persistId]) warnings.push(T('warn.dupId', n.persistId));
      else pidSeen[n.persistId] = true;
    }
    if (n.link) {
      const nl = resolveNodeLink(n.link);
      if (nl && nl.kind === 'same' && !findByPersistId(root, nl.pid)) {
        warnings.push(T('warn.deadLink', n.link));
      }
    }
    (n.children || []).forEach(walk);
  };
  walk(root);
}

function splitComment(body) {
  const m = body.match(/<!--\s*(.*?)\s*-->\s*$/);
  if (!m) return { text: body.trim(), meta: {} };
  const text = body.slice(0, m.index).trim();
  const meta = {};
  m[1].split(';').forEach(seg => {
    const i = seg.indexOf(':');
    if (i > 0) meta[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  });
  return { text, meta };
}

// 多行标题的续行是否「会被误读」（2026-09-03 修「一个节点裂成多个」）：
//   续行行首 `- `/`* `/`+ ` → 被当成子节点；`>` → 备注；`!` → 图片/嵌入；整行链接 → 附件链接；
//   `\` 自身是转义符，也要转义自己（否则用户写的 `\- x` 认回来会变成 `- x`）。
// 这类续行落盘时行首补一个 `\`（标准 Markdown 转义写法），parse 剥掉一个 `\` 认回文字——
// 于是节点多行文字里可以写任何内容（项目符号、`>` 引用、`![[图片]]`、整行链接），不再被拆成多个节点。
function needsTitleEsc(line) {
  // 判断一律用「去掉前导空白后」的文本（和 parse 的 contKind 一致）：从别处复制来的缩进列表（`   + x`）
  // 前导是空格不是 Tab，插件同样认不得，也会被甩进「不认得的行」弹警告条，所以一并转义。
  const t = String(line).trim();
  if (!t) return false;                                                                              // 空行不用转义
  if (/^[-*+]\s/.test(t)) return true;                                                               // 列表符号（会被当成子节点）
  if (/^[>!\\]/.test(t)) return true;                                                                // 备注 / 图片嵌入 / 转义符本身
  if (/^(\[\[.*\]\]|\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\))$/.test(t)) return true;          // 整行链接 = 附件链接
  if (/^\*\*(\[\[.*\]\]|\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\))\*\*$/.test(t)) return true;  // 加粗包裹的整行链接
  return false;
}
// ============ 序列化（输出：第一行根 + Tab 缩进子节点） ============
// 单一分支：缩进 = 层级数（根 depth 0 = 0 个 Tab），所有层级都输出备注/图片/嵌入/链接
// v2（2026-08-29）：Minor 走行尾注释 minor:1（不再 _x_ 包裹）；图片/音视频 = ![[文件名]] wikilink
// noId=true：复制节点用（去掉 `<!--id:xxx-->` 避免副本冲突，折叠 fold 保留，链接引用保留）
// skipDone=true：跳过 Minor 子节点（隐藏 Minor 下框选复制用，2026-08-25：只复制未隐藏部分）
function serialize(node, depth, noId, skipDone) {
  depth = depth || 0;
  const pad = '\t'.repeat(depth);      // 根（depth 0）无缩进，子节点 1 个 Tab/级
  let head = (node.link && !node.title) ? node.link : node.title;
  if (node.bold) head = '**' + head + '**';         // 加粗：标题行内标记（标准 Markdown 语义）
  // 多行标题（2026-08-30 换行）：首行带 `- ` 与行尾注释，后续行 = 同缩进纯文字续行（不带 `- `，解析器原样认回）；空续行 = 文字内空行
  const headLines = String(head == null ? '' : head).split('\n');
  const out = [pad + '- ' + headLines[0] + commentFor(node, noId)];
  for (let li = 1; li < headLines.length; li++) out.push(pad + (needsTitleEsc(headLines[li]) ? '\\' : '') + headLines[li]);
  const sub = pad + '\t';
  if (node.note) node.note.split('\n').forEach(l => out.push(sub + (l ? '> ' + l : '>'))); // 多行备注：一行一个 `> `，空行写 `>`
  (node.images || []).forEach(p => out.push(sub + (isWikilinkName(p) ? '![[' + p + ']]' : '![](' + p + ')')));
  (node.embeds || []).forEach(p => out.push(sub + '![[' + p + ']]'));
  if (node.link && node.title) out.push(sub + node.link); // 标题+链接节点：加粗体现在标题上，链接行不再重复包裹（与 parse 归一）
  (node.rawLines || []).forEach(l => out.push(l)); // 不认得的行原样写回（保留不丢，位置跟着所属节点走）
  node.children.forEach(c => {
    if (skipDone && nodeIsMinor(c)) return; // 隐藏 Minor 下复制：Minor 子节点不进剪贴板
    out.push(serialize(c, depth + 1, noId, skipDone));
  });
  return out.join('\n') + (depth === 0 ? '\n' : ''); // 最外层补结尾换行（写文件用）
}
// 图片引用是否已是 wikilink 文件名（无路径分隔符 = 集中存放的文件名；带路径的是 v1 兼容读入的相对路径，原样写回）
function isWikilinkName(p) { return p && !/[\\/]/.test(p) && !/^(https?:)?\/\//.test(p); }
// 文本视图 = 文件真实内容（含根行，无 # 标题）
function serializeFull(tree) {
  return serialize(tree).trim() + '\n';
}
function commentFor(node, noId) {
  // 行尾注释：只有被复制链接的节点才有 id；折叠的节点有 fold；改色的节点有 color；Minor/Now 也是节点状态。平时文件干净。
  const parts = [];
  if (!noId && node.persistId) parts.push('id:' + node.persistId);
  if (node.fold) parts.push('fold:1');
  if (node.color) parts.push('color:' + node.color);
  if (node.minor) parts.push('minor:1'); // Minor 次要（v2：2026-08-29 起走注释，不再 _x_ 包裹）
  if (node.now) parts.push('now:1'); // Now 节点（2026-08-27）
  return parts.length ? ' <!--' + parts.join('; ') + '-->' : '';
}

// ============ 查找辅助 ============
function findNode(root, id) {
  if (root.id === id) return { node: root, parent: null, index: -1 };
  function walk(n, parent) {
    for (let i = 0; i < n.children.length; i++) {
      if (n.children[i].id === id) return { node: n.children[i], parent: n, index: i };
      const r = walk(n.children[i], n);
      if (r) return r;
    }
    return null;
  }
  return walk(root, null);
}
// 按 persistId 查找节点（returnToDefault / 路径历史栈存的是 pid，而 findNode 只认 node id）
function findNodeByPersistId(root, pid) {
  if (!pid) return null;
  function walk(n) {
    if (n.persistId === pid) return { node: n, parent: null, index: -1 };
    for (const c of n.children || []) {
      const r = walk(c);
      if (r) return r;
    }
    return null;
  }
  return walk(root);
}
function isDescendant(root, ancestorId, id) {
  const r = findNode(root, ancestorId);
  if (!r) return false;
  function inSubtree(n) { return n.id === id ? true : n.children.some(inSubtree); }
  return inSubtree(r.node) && id !== ancestorId;
}
// 子孙节点计数（折叠徽章数字）。开启「隐藏完成」时，done 节点（含其整棵子树）不计入（2026-08-21 定）
function countDescendants(node, ancestorDone) {
  if (state.hideDone && ancestorDone) return 0;
  let n = 0;
  for (const c of node.children || []) {
    const selfDone = nodeIsMinor(c); // 2026-08-27 修：统一走 nodeIsMinor（链接节点的 minor 字段标题为空，正则判断会漏）
    const done = ancestorDone || selfDone;
    if (state.hideDone && done) continue;
    n += 1 + countDescendants(c, done);
  }
  return n;
}
function currentRoot() {
  if (state.currentRootId) {
    const r = findNode(state.tree, state.currentRootId);
    if (r) return r.node;
  }
  return state.tree;
}

// ============ 下钻：进入节点当主节点 + 面包屑 ============
function findPath(root, targetId, trail) {
  trail = trail || [];
  trail.push(root);
  if (root.id === targetId) return trail;
  if (root.children) {
    for (const c of root.children) {
      const p = findPath(c, targetId, trail.slice());
      if (p) return p;
    }
  }
  return null;
}
function goTo(id) {
  // 2026-08-30：主动跳转（下钻/返回默认路径/路径历史）后，作废「定位子菜单 hover 预览」的回退位置。
  // 否则：hover 过定位子菜单项 → 移开 → 350ms 延迟里点节点下钻 → 回退动画在下钻之后才补上，画面被拉回原位 = 漂移。
  locateSavedScroll = null;
  if (!id || id === state.tree.id) { state.currentRootId = null; state.currentRootPid = ''; }
  else {
    // id 可能是 node id，也可能是 persistId（returnToDefault / 路径历史栈存的是 pid，重 parse 后内存 id 会变）
    let r = findNode(state.tree, id);
    if (!r) r = findNodeByPersistId(state.tree, id);
    state.currentRootId = r ? r.node.id : id;
    state.currentRootPid = (r && r.node && r.node.persistId) || '';
  }
  state.selectedId = null;
  if (state.showNow) nowVisibleSnapshot = computeNowVisible(currentRoot()); // 下钻/返回 = 视图基准变化 → 重算快照（否则下钻进非 Now 节点画面塌缩；2026-08-28）
  render(); updateToolbar(); updateUndoRedo(); updateDefaultPathBtn();
  recordPathHistory(); // 路径真正变化后记录进历史栈
  // 下钻/返回后内容变了，视口可能停在旧内容的空白处（看起来"没有东西"）
  // → 自动智能定位（进入当前节点/返回默认路径后自动居中，不再飘走；重置缩放/平移按 --locate-* 旋钮）
  // 2026-08-30：改同步执行。原来放 requestAnimationFrame 里 → render 后先显示旧视口位置、
  // 下一帧才跳到定位后的位置 = 用户看到的"下钻后画面跳一下"（与开屏那个 bug 同源）。
  // 同步执行：渲染与定位在同一帧完成，视觉上无中间态。render() 后 DOM 已更新，同步读布局是准确的。
  locateCenter(); persistNow();
}
function drillInto(id) { goTo(id); }
function renderCrumb() {
  const crumb = document.getElementById('crumb');
  const rootId = state.currentRootId || state.tree.id;
  const path = findPath(state.tree, rootId);
  crumb.innerHTML = '';
  if (!path || path.length <= 1) { crumb.classList.add('hidden'); return; }
  path.forEach((n, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '>';
      crumb.appendChild(sep);
    }
    const a = document.createElement('a');
    a.textContent = n.title;
    a.onclick = () => goTo(n.id);
    crumb.appendChild(a);
  });
  crumb.classList.remove('hidden');
}

// ============ 撤销 / 重做（快照栈：每步操作前存旧文本，Ctrl+Z 取回重渲染） ============
const undoStack = [];
const redoStack = [];
function snapshot() { return serialize(state.tree); }
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedo(); // 压栈后立即刷新撤销按钮（2026-08-22 修：之前 pushUndo 后不刷新，按钮一直置灰直到别的操作触发）
}
// ===== emitUpdate / init 等：每次更新后刷新工具栏状态 =====
// 撤销/重做置灰由 updateUndoRedo() 维护；默认路径按钮状态由 updateDefaultPathBtn() 维护
// parse 会重生成所有内存 id → 重 parse 后选中/下钻状态必须重新校验，失效即清
// （2026-08-24 修：撤销/多面板 sync 后旧 id 残留，按 Tab 时 findNode 返回 null → addChild 崩溃；Cmd+C/Delete 静默无效）
function reconcileSelection() {
  if (state.selectedId && !findNode(state.tree, state.selectedId)) state.selectedId = null;
  if (state.multiSelected.size) {
    [...state.multiSelected].forEach(id => { if (!findNode(state.tree, id)) state.multiSelected.delete(id); });
  }
  if (state.currentRootId && !findNode(state.tree, state.currentRootId)) state.currentRootId = null;
}
function applyText(t) {
  const res = parse(t);
  state.tree = res.root;
  state.warnings = res.warnings;
  if (state.tree.title === '未命名' && state.currentFilename) state.tree.title = state.currentFilename;
  reconcileSelection();
  if (state.showNow) nowVisibleSnapshot = computeNowVisible(currentRoot()); // undo/redo/外部刷新重解析后内存 id 全部重生成 → 快照按新树重算（2026-08-28）
  render(); updateToolbar(); updateUndoRedo(); updateDefaultPathBtn();
  emitUpdate();
}
function doUndo() { if (!undoStack.length) return; redoStack.push(snapshot()); applyText(undoStack.pop()); }
function doRedo() { if (!redoStack.length) return; undoStack.push(snapshot()); applyText(redoStack.pop()); }

// ============ 渲染（垂直树） ============
function render() {
  treeEl.innerHTML = '';
  treeEl.appendChild(edgesSvg); // 连线层先放，卡片后放 → 卡片盖在曲线上
  treeEl.appendChild(dragSvg);  // 拖拽预测曲线层：同样在卡片底下
  const root = currentRoot();
  // 「只显示 Now」：计算可见集（Now+祖先路径+Now 直接子节点），buildRow 里剔除无关节点（类比 hideDone）
  nowVisibleSet = (state.showNow && root) ? (nowVisibleSnapshot || computeNowVisible(root)) : null; // 有快照用快照（按下那一刻定格），无快照兜底现算（init 时序等）
  // 第一行 = 当前主节点本身（顶层是中心主题，下钻后是进入的节点），其子节点在它下面展开
  const rootRow = buildRow(root, 0);
  if (rootRow) treeEl.appendChild(rootRow);
  // 空图使用提示（2026-09-01 定）：根视图 + 树无任何子节点 + 非历史页 + 设置未隐藏时，在主节点卡片正下方显示三行操作提示；
  // 相对卡片绝对定位 → 拖动/缩放画布时自动跟随；用户建立第一个子节点后 children 非空 → 不再渲染（天然消失）。
  // 设置页「隐藏新增页面提示」= hideHint → 直接不渲染。
  if (rootRow && !state.currentRootId && root.children.length === 0 && !state.historyMode && !state.hideHint) {
    const hint = document.createElement('div');
    hint.className = 'start-hint';
    hint.textContent = T('hint.line1') + '\n' + T('hint.line2') + '\n' + T('hint.line3');
    const card = rootRow.querySelector('.card');
    if (card) card.appendChild(hint);
  }
  renderWarnings();
  renderCrumb();
  // 重设 transform 保留缩放/平移（render 重建 DOM 后 transform 失效）+ 画布尺寸跟随内容
  applyTreeTransform();
  updateCanvas();
  // 节点快捷菜单跟随选中状态（渲染后重新定位；无选中时隐藏，单选/多选都显示）
  if (state.selectedId || state.multiSelected.size) showNodeMenu();
  else hideNodeMenu();
  updateNowSideBtn(); // 刷新侧边 Now 按钮的置灰/图标态
  updateFoldBar(); // 2026-08-30：右下角常驻折叠层级条跟随树结构/层级数刷新（折叠操作后层数变化）
  requestAnimationFrame(drawEdges);
}
// 画布空隙的拖拽预测/落点：handler 全部读 state 实时值，绑一次即可，不随 render 重绑（2026-08-24 从 render 里移出）
// 拖拽热路径 rAF 合并（2026-09-01）：dragover 高频触发，把「预测+高亮+预测线」收进一个 rAF，
// 每帧最多算一次，事件扎堆也不重复做；配合 buildDragRects 缓存矩形彻底消除大文件拖拽卡顿。
treeEl.ondragover = e => {
  e.preventDefault();
  state._dragCX = e.clientX; state._dragCY = e.clientY;
  if (!state._dragRAF) state._dragRAF = requestAnimationFrame(runDragFrame);
};
function runDragFrame() {
  state._dragRAF = null;
  const np = dragNodeXY(state._dragCX, state._dragCY);
  const t = nearestDropTarget(np.x, np.y);
  if (t) { state.dragPreview = t; } else if (state.dragId) { state.dragPreview = { targetId: null, position: 'root' }; }
  applyDragPreview(state.dragPreview);
  updateDragCurve(state.dragPreview, np.x, np.y);
}
treeEl.ondragleave = () => { state.dragPreview = null; clearDragHighlights(); };
treeEl.ondrop = e => {
  e.preventDefault();
  if (state.dragId) {
    const dp = state.dragPreview;
    if (dp && dp.position === 'invalid') {
      // 超出截断距离：拖拽无效，不移动（2026-08-22）
    } else if (dp && dp.targetId && dp.targetId !== state.dragId) {
      if (dp.position === 'before') moveNodes(state.dragIds, dp.targetId, true);
      else if (dp.position === 'after') moveNodes(state.dragIds, dp.targetId, false);
      else if (dp.position === 'over') moveNodes(state.dragIds, dp.targetId);
      else moveNodes(state.dragIds, 'root');
    } else {
      moveNodes(state.dragIds, 'root');
    }
  }
  state.dragId = null;
  state.dragIds = null;
  state.dragRows = null;
  state.dragRects = null; state.dragW = 0; // 清拖拽矩形缓存
  if (state._dragRAF) { cancelAnimationFrame(state._dragRAF); state._dragRAF = null; }
  state.dragPreview = null;
  state.dragGrabDX = 0; state.dragGrabDY = 0;
  cleanupDragGhost(); // drop 里也清：render 摘掉源卡后 dragend 不冒泡到 document（残影根因）
  stopAutoScroll();
  clearDragHighlights();
};
// 拖拽到视图边缘时自动滚动（光标停在边缘即可把画布滚到看不见的节点，便于拖过去；2026-08-26 需求）
const EDGE = 60;              // 距边多少像素进入触发区
// 2026-08-30 定：自动滚动速度可调（CSS 变量 --auto-scroll-speed，默认 8，原 24 太快）
function autoScrollMax() { return cfgNum('--auto-scroll-speed', 6); }
let autoScrollRAF = null;
let autoScrollDX = 0, autoScrollDY = 0;
let lastDragX = 0, lastDragY = 0;
let marqueeRect = null; // 框选矩形（屏幕坐标），自动滚动时复用做节点命中
function stopAutoScroll() {
  if (autoScrollRAF) { cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
  autoScrollDX = 0; autoScrollDY = 0;
}
function tickAutoScroll() {
  if (!autoScrollRAF) return;
  if (autoScrollDX || autoScrollDY) {
    const bt = viewMap.scrollTop, bl = viewMap.scrollLeft;
    viewMap.scrollBy(autoScrollDX, autoScrollDY);
    if (viewMap.scrollTop === bt && viewMap.scrollLeft === bl) { stopAutoScroll(); return; } // 到边界即停
    // 节点拖拽中：画面滚了、光标底下节点变了 → 重新预测落点并高亮（框选时不跑，避免误显插入线）
    if (state.dragId) {
      buildDragRects(); // 画面滚了 → 节点视口坐标变了，刷新缓存再预测
      const np = dragNodeXY(lastDragX, lastDragY); // 与 treeEl.ondragover 同基准：节点左中心
      const t = nearestDropTarget(np.x, np.y);
      state.dragPreview = t || { targetId: null, position: 'root' };
      applyDragPreview(state.dragPreview);
      updateDragCurve(state.dragPreview, np.x, np.y);
    }
    // 框选拖拽中：画面滚了，重新用当前框选矩形命中节点（框固定屏幕、节点滚进框内 → 实时选中）
    else if (state.marquee && marqueeRect) applyMarqueeSelection(marqueeRect);
  }
  autoScrollRAF = requestAnimationFrame(tickAutoScroll);
}
function autoScrollOnDrag(e) {
  lastDragX = e.clientX; lastDragY = e.clientY;
  const r = viewMap.getBoundingClientRect();
  const top = e.clientY - r.top, bottom = r.bottom - e.clientY;
  const left = e.clientX - r.left, right = r.right - e.clientX;
  let dx = 0, dy = 0;
  const max = autoScrollMax();
  if (top < EDGE) dy = -Math.round((1 - top / EDGE) * max);
  else if (bottom < EDGE) dy = Math.round((1 - bottom / EDGE) * max);
  if (left < EDGE) dx = -Math.round((1 - left / EDGE) * max);
  else if (right < EDGE) dx = Math.round((1 - right / EDGE) * max);
  autoScrollDX = dx; autoScrollDY = dy;
  if (dx || dy) { e.preventDefault(); if (!autoScrollRAF) autoScrollRAF = requestAnimationFrame(tickAutoScroll); }
  else stopAutoScroll();
}
viewMap.addEventListener('dragover', autoScrollOnDrag);
// ===== 贝塞尔连线（父卡片右缘 → 子卡片左缘，S 形曲线） =====
// 主题（2026-08-31 起累计）：
//   默认 = 顶部 :root 旋钮原值（蓝色基调）
//   飞书蓝线 = --edge 切到 --edge-feishu
//   飞书灰线版 = 不切 --edge（保持 --edge 默认灰 #c5cdd9）
//   飞书粉线版（2026-09-01）= 连线+主节点背景+选中/hover/定位按钮等蓝色系全部覆盖为粉色调，对应 --*-pink 旋钮
function applyTheme(t) {
  const r = document.documentElement;
  // 先清掉所有主题相关 inline 变量（避免切主题时残留上一主题）
  ['--edge','--accent','--sel','--root-bg','--sel-root','--sel-lv1','--sel-ln','--hover-border','--hover-border-root',
   '--drag-edge','--drag-edge-alpha','--l1-bg','--fold-border','--fold-color',
   '--sib-predict','--sib-predict-ln','--sib-predict-root']
    .forEach(k => r.style.removeProperty(k));
  if (t === 'feishu') {
    r.style.setProperty('--edge', 'var(--edge-feishu)');
    r.style.setProperty('--drag-edge-alpha', 'var(--drag-edge-alpha-feishu)'); // 蓝线版预测线透明度（设置页可调，独立持久化）
  }
  else if (t === 'feishuGray') {
    r.style.setProperty('--drag-edge-alpha', 'var(--drag-edge-alpha-feishuGray)'); // 灰线版预测线透明度（设置页可调，独立持久化）
  }
  else if (t === 'feishuPink') {
    r.style.setProperty('--edge', 'var(--edge-pink)');
    r.style.setProperty('--root-bg', 'var(--root-bg-pink)');
    r.style.setProperty('--accent', 'var(--accent-pink)');
    r.style.setProperty('--sel', 'var(--sel-pink)');
    r.style.setProperty('--sel-root', 'var(--sel-root-pink)');
    r.style.setProperty('--sel-lv1', 'var(--sel-lv1-pink)');
    r.style.setProperty('--sel-ln', 'var(--sel-ln-pink)');
    r.style.setProperty('--hover-border', 'var(--hover-border-pink)');
    r.style.setProperty('--hover-border-root', 'var(--hover-border-root-pink)');
    // 拖拽/折叠相关（2026-09-01 补：之前漏了，粉色主题下仍显示蓝色）
    r.style.setProperty('--drag-edge', 'var(--drag-edge-pink)');
    r.style.setProperty('--drag-edge-alpha', 'var(--drag-edge-alpha-feishuPink)'); // 粉线版预测线更淡
    r.style.setProperty('--l1-bg', 'var(--l1-bg-pink)');       // 预测父节点底
    r.style.setProperty('--fold-border', 'var(--fold-border-pink)'); // 折叠钮边框
    r.style.setProperty('--fold-color', 'var(--fold-color-pink)');   // 折叠图标/数字色
    // 同级预测节点边框（2026-09-01）：复用粉线版选中边框色（分根/一级/普通）
    r.style.setProperty('--sib-predict', 'var(--sib-predict-pink)');
    r.style.setProperty('--sib-predict-ln', 'var(--sib-predict-ln-pink)');
    r.style.setProperty('--sib-predict-root', 'var(--sib-predict-root-pink)');
  }
  // 其余值走 CSS 顶部 :root 默认；切回默认主题时所有 inline 已清，回归默认。
}
function drawEdges() {
  const tr = treeEl.getBoundingClientRect();
  // edges SVG 是 treeEl 的子元素，会随 scale 一起缩放 → 内部 path 必须用「本地坐标」= 屏幕距离 / zoom，
  // 否则缩放时曲线被二次缩放，导致线和节点错位（2026-08-21 修：刷新后错位、点 ⟳ 消失的根因）
  const s = zoom || 1;
  const paths = [];
  treeEl.querySelectorAll('.node-row').forEach(row => {
    const card = row.querySelector(':scope > .card');
    const kids = row.querySelector(':scope > .children');
    if (!card || !kids) return;
    const cr = card.getBoundingClientRect();
    // 防御：宽/高为 0 的不可见卡片不画线（防止坐标异常把曲线甩到画面外）
    if (cr.width < 1 || cr.height < 1) return;
    const x1 = (cr.right - tr.left) / s, y1 = (cr.top + cr.height / 2 - tr.top) / s;
    kids.querySelectorAll(':scope > .node-row > .card').forEach(kc => {
      const kr = kc.getBoundingClientRect();
      if (kr.width < 1 || kr.height < 1) return;
      const x2 = (kr.left - tr.left) / s, y2 = (kr.top + kr.height / 2 - tr.top) / s;
      const dx = Math.max(20, (x2 - x1) / 2);
      paths.push('M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2);
    });
  });
  edgesSvg.setAttribute('width', treeEl.scrollWidth || 10);
  edgesSvg.setAttribute('height', treeEl.scrollHeight || 10);
  edgesSvg.innerHTML = paths.length ? '<path d="' + paths.join(' ') + '"/>' : '';
}
// 是否选中（单选或多选）
function isSelected(id) {
  return state.selectedId === id || state.multiSelected.has(id);
}
// 「只显示 Now」下的可见节点集（render 时按 state.showNow 计算；null 表示不过滤）
let nowVisibleSet = null;
// 「只看 Now」快照（2026-08-28）：侧边按钮「按下那一刻」定格的可见集，之后 render 不再重算——
// 按下后新建/粘贴/拖入的节点不因筛选被隐藏（「按下那一刻筛选，后续自由写新东西」）。
// 重算时机 = 视图基准变化：按钮开/关（setShowNow）、下钻/返回（goTo）、undo/redo/外部刷新（applyText）；
// 取消 Now 标记也重算（保留 2026-08-27 定的「取消即隐藏」行为）；新建内容经 makeNode/cloneNode/moveNodes 注册进快照。
let nowVisibleSnapshot = null;
function buildRow(node, depth, doneChain) {
  doneChain = doneChain || false;
  // 自身标题被 _/_ 包裹 = 完成；链接节点用节点级 minor 字段；祖先完成则整棵子树置灰（不加删除线）
  const selfDone = nodeIsMinor(node);
  const done = doneChain || selfDone;
  // 隐藏已完成：渲染前直接跳过 done 节点（含其整棵子树）——数据层过滤，曲线/画布都看不到它们
  // （2026-08-21 定：先过滤再渲染，避免 CSS display:none 导致贝塞尔线坐标异常伸到左边无穷远；根节点即使 done 也保留，防画面全空）
  if (state.hideDone && done && depth > 0) return null;
  // 只显示 Now：不在可见集（且非根）→ 剔除渲染（同 hideDone 机制：先过滤再渲染，避免 display:none 让贝塞尔线坐标异常；根恒保留）
  // 2026-08-28：刚新建的节点豁免筛选（只看 Now 下回车新建同级不应被瞬间隐藏——需求：按下那一刻筛选，后续自由写新东西）
  if (nowVisibleSet && depth > 0 && !nowVisibleSet.has(node.id) && !state.justCreated.has(node.id)) return null;
  const row = document.createElement('div');
  // row-lv0/row-lv1/row-lv2：行层级类，CSS 按层区分间距（2026-08-21 定：lv1 兄弟 12px，更深 2px）
  const isMulti = state.multiSelected.has(node.id) && state.selectedId !== node.id;
  row.className = 'node-row row-lv' + Math.min(depth, 2) + (isSelected(node.id) ? ' selected' : '') + (isMulti ? ' multi-selected' : '') + (done ? ' done' : '') + (node.bold ? ' bold' : ''); // 2026-08-30：补 bold 类（原只挂到链接节点，普通节点漏了→加粗不显示）
  row.dataset.id = node.id;
  row.dataset.depth = depth;

  row.appendChild(buildCard(node, depth, done));

  if (node.children.length && !node.fold) {
    const kids = document.createElement('div');
    kids.className = 'children';
    node.children.forEach(c => { const sub = buildRow(c, depth + 1, done); if (sub) kids.appendChild(sub); });
    row.appendChild(kids);
  }
  return row;
}
function buildCard(node, depth, done) {
  const card = document.createElement('div');
  // 层级类（视觉：根 lv0 蓝底 / 一级 lv1 浅蓝底 / 普通 ln 无背景）+ 颜色 + 完成置灰
  card.className = 'card ' + (depth === 0 ? 'lv0 is-root' : depth === 1 ? 'lv1' : 'ln')
    + (node.color ? ' color-' + node.color : '')
    + (nodeIsNow(node) ? ' now' : '')
    + (done ? ' done' : '');
  card.draggable = true;
  card.dataset.id = node.id;

  const selfDone = nodeIsMinor(node);
  const selfNow = nodeIsNow(node);
  // 「无标题节点的前缀图标」不再单独 DOM 插入（之前会让卡片 column 布局把图标和空标题块分成两排，
  // 编辑时空标题节点视觉裂成"图标一行 + 文字一行"；2026-08-31 修）。改为：塞到 title 元素里
  // 跟非空标题共用一条渲染链路，编辑/未编辑态自然同列。cardTitleInner 仅在 `node.title` 存在时
  // emit 前缀图标，所以这里空标题要自己塞一遍。
  function prependIcoIntoTitle(titleEl) {
    if (!node.title && selfDone) {
      const ico = document.createElement('span');
      ico.className = 'minor-ico'; ico.contentEditable = 'false';
      ico.innerHTML = renderIcon(minorIconName(), 12); ico.title = T('tip.minorIcon');
      titleEl.insertBefore(ico, titleEl.firstChild);
    }
    if (!node.title && selfNow) {
      const ico = document.createElement('span');
      ico.className = 'now-ico'; ico.contentEditable = 'false';
      ico.innerHTML = renderNowPrefix(); ico.title = T('tip.nowIcon');
      titleEl.insertBefore(ico, titleEl.firstChild);
    }
  }

  if (node.title != null) { // 2026-08-28：空字符串也渲染 title（空白节点双击进编辑需要 .title 元素存在；原 if(node.title) 空串 falsy 跳过）
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = cardTitleInner(node); // 标题里内嵌的 [[标题|ID]] 渲染成链接（含自身 Minor 置灰小箭头）
    prependIcoIntoTitle(title); // 空标题节点的前缀图标塞进 title 元素内，避免卡片 column 布局拆成两排
    bindInline(title);
    title.ondblclick = e => {
      e.stopPropagation();
      // 2026-08-25 改：取消"未选中双击全选"。双击 = 进编辑、光标插点击处（回到 08-21 原行为）。
      // "编辑时双击全选"只在该双击发生前就已在编辑（由单击进编辑、停留后再双击）才触发；
      // 否则双击会先经 card.onclick 进编辑，dblclick 紧接着到 → 若不过滤会把刚进编辑的也全选。
      if (state.editingTitleId === node.id && Date.now() - titleEditStartTs > 250) { selectAllInEdit(title); return; }
      // 其余情况（未编辑，或刚由本次双击经 card.onclick 进的编辑）：光标已在点击处，不做全选、也不重入 startEdit
    };
    // 三击 = 全选（2026-08-25 改）：浏览器事件顺序 click,click,dblclick,click —— 前两次双击已进编辑并把光标插点击处，
    // 第三次 click 命中三击 → selectAll（无论编辑与否都全选；未编辑时三击会先进编辑再全选）。计数挂在元素自身，避免跨节点误判。
    title.onclick = e => {
      const now = Date.now();
      if (now - (title._lastClk || 0) < 400) title._clicks = (title._clicks || 0) + 1; else title._clicks = 1;
      title._lastClk = now;
      if (title._clicks === 3) {
        title._clicks = 0;
        if (state.editingTitleId === node.id) { e.preventDefault(); e.stopPropagation(); selectAllInEdit(title); }
      }
    };
    card.appendChild(title);
  }

  if (node.children.length) {
    const folded = node.fold;
    const foldTag = document.createElement('div');
    foldTag.className = 'fold-tag' + (folded ? ' always' : '');
    const arrow = document.createElement('span');
    arrow.className = 'fold-arrow';
    arrow.textContent = folded ? '' : '‹';
    foldTag.appendChild(arrow);
    if (folded) {
      const badge = document.createElement('span');
      badge.className = 'fold-badge';
      badge.textContent = countDescendants(node);
      foldTag.appendChild(badge);
    }
    foldTag.title = folded ? T('tip.unfold') : T('tip.fold');
    foldTag.onclick = e => {
      e.stopPropagation();
      if (state.historyMode) { node.fold = !node.fold; renderHistoryTree(); return; } // 历史页只读：只翻快照视图（保持当前平移，不跳回实时导图）
      pushUndo(); node.fold = !node.fold; keepView(node); emitUpdate(); render();
    };
    card.appendChild(foldTag);
  }

  // 备注行：有内容就显示；正在编辑空备注时也显示（机制：一进编辑文本层面就有这一行，编辑完没文字自动消失）
  if (node.note || state.editingNoteId === node.id) {
    const n = document.createElement('div');
    n.className = 'note';
    // 文字区必须是 .note 的子 div（匹配 CSS .card .note > div；竖线是 ::before）。
    // 之前内容直接放容器 → 编辑时把整行（含竖线）变成编辑框 → 光标与竖线重叠（2026-08-22 修）
    const text = document.createElement('div');
    text.innerHTML = renderInline(node.note); // 备注里内嵌的 [[标题|ID]] 渲染成链接
    bindInline(text);
    n.appendChild(text);
    n.title = T('tip.editNote');
    n.ondblclick = e => { e.stopPropagation(); startEditNote(node, text, { x: e.clientX, y: e.clientY }); };
    card.appendChild(n);
  }
  // 图片（可多张，缩略图异步加载；单击选中、双击放大、右键复制）——独占一行，文字在上
  if ((node.images || []).length) {
    const imgs = document.createElement('div');
    imgs.className = 'imgs';
    node.images.forEach(p => {
      const img = document.createElement('img');
      img.className = 'img';
      img.dataset.path = p;
      img.alt = '';
      img.title = T('tip.image');
      reqImg(p, img);
      // 图片异步加载完 → 树 reflow → 节点坐标变，重画曲线防错位（2026-08-25 修：覆盖打开/切页后图片晚于 render 到达的情况）
      img.onload = () => requestAnimationFrame(drawEdges);
      img.onerror = () => requestAnimationFrame(drawEdges);
      img.onclick = e => {
        e.stopPropagation();
        selectNode(node.id);
        document.querySelectorAll('.card .img').forEach(im => im.classList.remove('selected'));
        img.classList.add('selected');
        state.selectedImg = { nodeId: node.id, path: p }; // 选中图片：Cmd+C/X 复制/剪切图片
      };
      img.ondblclick = e => { e.stopPropagation(); openImagePreview(p); };
      img.oncontextmenu = e => { e.stopPropagation(); buildCtxMenu(e.clientX, e.clientY, node, 'image', p); };
      imgs.appendChild(img);
    });
    card.appendChild(imgs);
  }
  // 链接（v2 五类）：本文件节点 [[#pid]] / 跨文件节点 [[笔记名#pid]] / 笔记 [[笔记名]] / 网页 [名](url) / 本地文件 [名](file:///…)
  if (node.link) {
    const cls = (!node.title ? ' link-main' : '') + (node.bold ? ' bold' : '') + (node.minor ? ' minor' : '');
    const mkLink = (extraCls, text, tip, onOpen, iconName) => {
      const a = document.createElement('span');
      a.className = 'link' + (extraCls ? ' ' + extraCls : '') + cls;
      if (iconName) {
        const ico = document.createElement('span');
        ico.className = 'link-ico' + (iconName === 'frame' ? ' node-ico' : '');
        ico.innerHTML = renderIcon(iconName, 13);
        a.appendChild(ico);
      }
      a.appendChild(document.createTextNode(text));
      a.title = tip + T('tip.editLinkSuffix');
      a.onclick = e => { e.stopPropagation(); onOpen(); };
      a.ondblclick = e => { e.stopPropagation(); startEditLink(node, a); };
      card.appendChild(a);
    };
    const nl = resolveNodeLink(node.link);
    if (nl && nl.kind === 'same') {
      // 同文件节点链接（[[#pid]] 或 [[当前文件名#pid]]）：显示跟随目标当前标题
      const target = findByPersistId(state.tree, nl.pid);
      mkLink('', (target && target.title) || nl.pid, T('tip.jump'), () => jumpByPid(nl.pid), 'frame');
    } else {
      const wk = nl && nl.kind === 'cross' ? { note: nl.note, pid: nl.pid } : parseWikiLink(node.link);
      if (wk) {
        // 跨文件节点链接（[[笔记名#pid]]，2026-09-03 定）：也是节点链接 → 节点框图标，文字用链接里现成的笔记名
        //（文件改名 Obsidian 自动更新链接文字，无需查目标文件）；不带 #pid 的才是双链 → 方括号图标
        mkLink('link-wiki', wk.note, T('tip.openNote', wk.note) + (wk.pid ? T('tip.locateNode', wk.pid) : ''), () => openNote(node.link), wk.pid ? 'frame' : 'brackets');
      } else {
        const fl = parseFileLink(node.link);
        if (fl) {
          mkLink('link-file', fl.display, T('tip.openFile', fl.path), () => openFilePath(fl.path), 'folder-closed');
        } else {
          const ul = parseUrlLink(node.link);
          if (ul) mkLink('link-url', ul.display, T('tip.openUrl', ul.url), () => openUrl(ul.url), 'globe');
        }
      }
    }
  }
  // 音视频嵌入（v2：![[文件名]] 附属行，就地播放器；源文件在 vault 内按文件名找）
  if ((node.embeds || []).length) {
    const box = document.createElement('div');
    box.className = 'embeds';
    node.embeds.forEach(p => {
      const isAudio = /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(p);
      const media = document.createElement(isAudio ? 'audio' : 'video');
      media.className = 'embed-media';
      media.controls = true;
      media.preload = 'metadata';
      media.dataset.path = p;
      media.title = p;
      reqImg(p, media); // 复用宿主资源解析（按文件名 → vault 可访问地址）
      media.onload = () => requestAnimationFrame(drawEdges);
      media.onloadedmetadata = () => requestAnimationFrame(drawEdges);
      media.onerror = () => { media.classList.add('img-missing'); requestAnimationFrame(drawEdges); };
      box.appendChild(media);
    });
    card.appendChild(box);
  }

  card.ondragstart = e => {
    state.dragId = node.id;
    // 抓点偏移（光标 → 被拖卡片左中心）：后续预测/预测线都以「节点左中心」驱动，不用光标（2026-08-28 定：
    // 拖拽时用户心里移动的是节点本身；抓点在卡片哪都行，节点左中心才是真实位置；多选拖的也是具体这一张卡）
    const cr = card.getBoundingClientRect();
    state.dragGrabDX = e.clientX - cr.left;
    state.dragGrabDY = e.clientY - (cr.top + cr.height / 2);
    // 拖拽期间缓存行列表（DOM 不变），dragover 高频触发不用每次全量 querySelectorAll（2026-08-24 性能）
    state.dragRows = document.querySelectorAll('#tree .node-row');
    // 多选拖拽：拖的节点在多选里 → 移动整组（顶层过滤，子节点跟着走）；否则单个（2026-08-22 定：本质=整块剪切粘贴）
    state.dragIds = state.multiSelected.has(node.id)
      ? [...state.multiSelected].filter(id => !hasAncestorSelected(id))
      : [node.id];
    buildDragRects(); // 拖拽开始一次性快照所有节点矩形（热路径优化，2026-09-01）
    // 自绘跟手悬浮卡（2026-08-28 定，弃 setDragImage 方案——引擎截图/锚点行为不可控）：
    // 原生截图用 1×1 透明图压掉；悬浮卡 = 干净克隆卡片（去掉折叠按钮/光环），fixed 容器 dragover 跟手移动，
    // 位置按「节点左中心」锚定（与预测线端点同源），按画布 zoom 缩放，视觉与画布卡片一致。
    const ghostBlank = document.createElement('div');
    ghostBlank.style.cssText = 'position:absolute; left:-9999px; top:-9999px; width:1px; height:1px;';
    document.body.appendChild(ghostBlank);
    e.dataTransfer.setDragImage(ghostBlank, 0, 0);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed; left:0; top:0; z-index:9999; pointer-events:none;';
    const z = zoom || 1;
    const scaler = document.createElement('div'); // 缩放层：整体按画布 zoom 缩放（叠层卡一起缩）
    scaler.style.cssText = 'position:relative; transform-origin: top left;'
      + (Math.abs(z - 1) > 0.01 ? ' transform: scale(' + z + ');' : '');
    const gc = card.cloneNode(true);
    gc.querySelectorAll('.fold-tag').forEach(el => el.remove()); // 折叠按钮不进悬浮卡（残影根因）
    gc.classList.remove('now-current'); // Now 定位光环不要
    gc.style.position = 'relative'; gc.style.zIndex = '1'; // 压在叠层卡上面
    // 单节点：外框=选中样式（「就像选中的样子」）。选中色选择器挂在 .node-row.selected > .card 上，
    // 把克隆包进一个 selected 行壳里，各层级/Minor 的选中色自动对应，不用手抄色值。
    const rowWrap = document.createElement('div');
    rowWrap.className = 'node-row selected';
    rowWrap.appendChild(gc);
    scaler.appendChild(rowWrap);
    if (state.dragIds.length > 1) {
      // 多选：底部叠一张带外框的空卡，右下偏移 6px（营造拖动多个的视觉）；外框=该层级选中色（也要蓝色框）
      const deck = document.createElement('div');
      const selVar = (gc.classList.contains('lv0') || gc.classList.contains('is-root')) ? '--sel-root'
        : gc.classList.contains('lv1') ? '--sel-lv1' : '--sel-ln';
      deck.style.cssText = 'position:absolute; left:6px; top:6px; width:100%; height:100%;'
        + 'box-sizing:border-box; background:#fff; border:1.5px solid var(' + selVar + ');'
        + 'border-radius: var(--card-radius, 8px); z-index:0;';
      scaler.appendChild(deck);
    }
    wrap.appendChild(scaler);
    document.body.appendChild(wrap);
    state.dragGhostEl = wrap;         // dragend 统一清理
    state.dragGhostBlank = ghostBlank;
    state.dragGhostH = cr.height;     // 卡片屏幕高（含 zoom）：定位用 top = 节点左中心 y − 高/2
    moveDragGhost(e.clientX, e.clientY); // 初始位置
    e.stopPropagation();
  };
  // 拖拽预测统一交给 treeEl.ondragover（nearestDropTarget 已覆盖"卡片上 / 右侧空白 / 兄弟间隙"三种情形，
  // 并复用 applyDragPreview 做高亮）。这里只保证拖到卡片上时 drop 不被默认行为吞掉，不再单独算落点。
  card.ondragover = e => { e.preventDefault(); };
  card.ondragleave = () => {};
  card.ondrop = e => {
    e.preventDefault();
    card.classList.remove('drag-over', 'drag-before', 'drag-after');
    if (state.dragId && state.dragId !== node.id) {
      // 用最近一次统一预测的结果（treeEl.ondragover 在卡片上也会冒泡触发，已写入 state.dragPreview）
      const np = dragNodeXY(e.clientX, e.clientY);
      const t = state.dragPreview || nearestDropTarget(np.x, np.y);
      if (t && t.position === 'invalid') {
        // 无效落点：不移动（父节点不能拖到自身/子树）
      } else if (t && t.targetId && t.targetId !== state.dragId) {
        if (t.position === 'before') moveNodes(state.dragIds, t.targetId, true);
        else if (t.position === 'after') moveNodes(state.dragIds, t.targetId, false);
        else moveNodes(state.dragIds, t.targetId);
      } else {
        moveNodes(state.dragIds, 'root');
      }
    }
    state.dragId = null; state.dragIds = null; state.dragRows = null; state.dragRects = null; state.dragW = 0; state.dragPreview = null;
    if (state._dragRAF) { cancelAnimationFrame(state._dragRAF); state._dragRAF = null; }
    state.dragGrabDX = 0; state.dragGrabDY = 0;
    cleanupDragGhost(); // 同 treeEl.ondrop：drop 路径也要清悬浮卡
    clearDragHighlights();
    e.stopPropagation();
  };
  card.onclick = e => {
    state.selectedImg = null;
    // 框选拖拽结束会附带一个 click：若落在卡片上会触发 selectNode 清空刚框选的多选（viewMap 的 click 已有 marquee 守卫，卡片这里补上；2026-08-26 修：框选后复制/删除失效的根因）
    if (state.marquee) return;
    // 编辑框内（标题/备注正在编辑）的点击 = 拖选文字等操作：不重复进入编辑。
    // 否则拖选松手触发 click → 这里再调 startEdit → 清掉刚拖出来的选区（2026-08-22 修"拖选松手选区丢失"）
    if (document.activeElement && document.activeElement.contentEditable === 'true') return;
    // 备注/图片/链接/折叠钮：交给各自的事件（双击备注编辑等），卡片不拦截，否则双击备注会被「再点=编辑标题」抢先（2026-08-21 修）
    if (e.target.closest('.img, .link, .fold-tag')) return;
    if (e.target.closest('.note')) { selectNode(node.id); return; } // 单击备注 = 选中节点（不进入标题编辑）
    // 多选：Cmd=加选/减选，Shift=区间选（macOS 习惯，2026-08-26）；都不进入标题编辑
    if (e.metaKey || e.shiftKey) {
      e.preventDefault();
      if (e.metaKey) toggleMultiSelect(node.id);
      else selectRange(node.id);
      return;
    }
    if (state.selectedId === node.id) {
      // 已选中：再次点击进入编辑（光标插到点击位置；纯链接节点编辑链接）
      if (!node.link || node.title) {
        const titleEl = card.querySelector('.title');
        if (titleEl) startEdit(node, titleEl, { x: e.clientX, y: e.clientY });
      } else {
        const linkEl = card.querySelector('.link');
        if (linkEl) startEditLink(node, linkEl);
      }
    } else {
      selectNode(node.id);
    }
  };
  // 双击卡片进编辑（2026-08-28）：空白节点 title 高度 0，双击 title 击不中 → 在 card 上绑 dblclick 兜底
  // （title.ondblclick 已 stopPropagation 不会重复触发）
  card.ondblclick = e => {
    if (state.editingEl) return;
    if (e.target.closest('.img, .link, .fold-tag')) return;
    if (e.target.closest('.note')) return;
    const titleEl = card.querySelector('.title');
    if (titleEl) startEdit(node, titleEl);
  };
  return card;
}

// ============ 格式警告显示 ============
function renderWarnings() {
  const box = document.getElementById('warn-box');
  if (!state.warnings || !state.warnings.length) { box.classList.add('hidden'); box.textContent = ''; return; }
  box.textContent = T('warn.boxPrefix') + state.warnings.join('；');
  box.classList.remove('hidden');
}

// ============ 画布变换（缩放 + 平移，类飞书式） ============
let zoom = 1, panX = 0, panY = 0;
let imgZoom = 1; // 图片预览自身的缩放（触控板捏合，独立于思维导图背景 zoom）
function applyTreeTransform() { treeEl.style.transform = 'scale(' + zoom + ') translate(' + panX + 'px,' + panY + 'px)'; }
// 平移入口（2026-09-01，仿 vue3-mindmap d3.zoom）：用户输入滚动（触控板双指/滚轮/空格拖动）全部走 transform，
// 不走原生 scroll——斜向双轴原生滚动在主线程重绘大画布会顿挫；transform 平移由 GPU 合成器渲染丝滑。
// dx/dy 是屏幕像素，转内容坐标除以 zoom（与缩放/拖拽锚定同规则）。
function panBy(dx, dy) {
  panX -= dx / (zoom || 1);
  panY -= dy / (zoom || 1);
  applyTreeTransform();
  drawEdges();
  schedulePersist();
}
// 记住临时状态（2026-08-25 v3）：状态存在「扩展宿主进程的内存 Map」里（由扩展按文档 URI 存），
// 不再用 webview 自带的 getState——VSCode 切标签页会销毁重建 webview，getState 跟着清空 → 之前两版都失效。
// 扩展进程内存 = VSCode 退出才清空 → 满足「重开回默认」；切页/重载 webview 重建都还在 → 满足「切回来还原」。
// 镜像 hideDone 的做法：每次视图/路径变动就 postMessage 给扩展写穿（write-through），切回来时扩展回送最新值。
let booted = false; // 还原期间门闩：关闭时不写，避免「程序滚动」被当成用户操作把还原值覆盖掉
let savedViewKey = ''; // 本视图的存储 key（main.js sendInit 下发 viewKey）；persist 时原样带回，防视图对象复用 this.file 变化时存错 key（2026-09-01 修捷径/源图串状态）
function readView() {
  return {
    zoom: zoom, panX: panX, panY: panY,
    scrollLeft: viewMap.scrollLeft, scrollTop: viewMap.scrollTop,
    currentRootPid: state.currentRootPid || '',
    debugMode: !!debugMode
  };
}
// 离散事件（下钻/折叠/居中/重置/切调试）立即写，不吃去抖定时器（否则最后一个离散操作会被吃掉）
function persistNow() {
  if (!booted) return;
  vscode.postMessage({ type: 'setView', viewKey: savedViewKey, value: readView() });
}
// 连续事件（滚动/缩放拖拽）去抖：比之前 300ms 更跟手，且和 persistNow 分两套定时器，互不吃掉对方
let _persistTimer = null;
function schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  // 2026-09-01 修捷径串状态（共用 iframe）：立即捕获 key + view 快照，
  // 防 B init 改 savedViewKey + reset 模块级 view 后，A 的延迟定时器存错 key + 错 view。
  const key = savedViewKey;
  const view = readView();
  _persistTimer = setTimeout(() => {
    if (!booted) return;
    vscode.postMessage({ type: 'setView', viewKey: key, value: view });
  }, 150);
}
// 等布局真正稳定再定滚动位置：图片 decode + 字体就绪 + 双 rAF。
// 否则异步加载让树 reflow → 还原的 scroll 算在旧尺寸上 → 画面偏移（之前「默认有时偏中心」的根因之一）。
function layoutSettled(cb) {
  const imgs = Array.prototype.slice.call(document.querySelectorAll('#tree img'));
  // 2026-09-01 修「开屏/切回画面漂到空白、思维导图在右下角」：web 字体异步加载，即使无图片也必须等 fonts.ready
  // 再 fire——否则字体 reflow 在 fire 后发生，hasSavedView 分支的 updateCanvas 算字体前旧尺寸（偏小）→
  // canvas 范围不够 → scroll=saved 被 clamp 到 0 → 视口显示 canvas 左上空白、树跑到右下角
  // （PAN_MARGIN=2000 让 canvas 比 viewport 大，scroll 0 = 看左上余量，树在 canvas 中部=视口右下）。
  let pending = imgs.length + 1; // +1 等字体 ready
  let settled = false;
  const fire = () => { if (settled) return; settled = true; requestAnimationFrame(() => requestAnimationFrame(cb)); };
  const onOne = () => { if (--pending <= 0) fire(); };
  imgs.forEach(im => { im.addEventListener('load', onOne, { once: true }); im.addEventListener('error', onOne, { once: true }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onOne);
  else onOne(); // 无 fonts API（老环境）：直接当作字体就绪
  setTimeout(fire, 2000); // 兜底：坏图/字体 API 卡住也不阻塞还原
}
// 通用画布方案（2026-08-21 反馈"视图不对称/截断"后重做）：
// 树永远放在画布正中心（flex 居中），四周留对称余量 PAN_MARGIN；视图 = 滚到画布中心。
// 内容比视口大时由滚动条访问（不截断、不挤压），拖动平移在对称空间里自由移动。
const PAN_MARGIN = 2000;
function updateCanvas() {
  const w = (treeEl.offsetWidth || viewMap.clientWidth) + PAN_MARGIN * 2;
  const h = (treeEl.offsetHeight || viewMap.clientHeight) + PAN_MARGIN * 2;
  canvasEl.style.minWidth = w + 'px';
  canvasEl.style.minHeight = h + 'px';
}
function centerView() {
  updateCanvas();
  viewMap.scrollLeft = Math.max(0, (canvasEl.offsetWidth - viewMap.clientWidth) / 2);
  viewMap.scrollTop = Math.max(0, (canvasEl.offsetHeight - viewMap.clientHeight) / 2);
}
// 打开错位修复（2026-08-24）：大画布的图片异步加载 → init 时 centerView 算的位置随后失效。
// 用 ResizeObserver 监听 treeEl 尺寸，用户没碰过视图时持续重新居中；首次交互或 3 秒后停（避免和编辑锚定打架）。
let initCenterObs = null;
// onSettled（2026-08-30）：首次「布局已稳定并定位完」的回调，用于开屏揭幕（viewMap 从 opacity:0 恢复）。
// 必须与 ResizeObserver 首帧挂钩——之前在 layoutSettled 回调里同步揭幕，而 ResizeObserver 是异步的，
// 导致显示时位置还是旧的（画布左上角/右下角），下一帧才跳到定位后的位置 = 用户看到的"从别处飞过来"。
function startInitCenter(keepView, onSettled) {
  if (initCenterObs) initCenterObs.disconnect();
  let settled = false;
  const done = () => { if (settled) return; settled = true; try { if (onSettled) onSettled(); } catch (e) {} };
  if (keepView) {
    // 已恢复上次位置：图片/字体异步加载让树 reflow → 只重画曲线，绝不自动居中（否则覆盖用户位置）
    initCenterObs = new ResizeObserver(() => { updateCanvas(); applyTreeTransform(); drawEdges(); done(); });
    initCenterObs.observe(treeEl);
    setTimeout(() => { if (initCenterObs) { initCenterObs.disconnect(); initCenterObs = null; } done(); }, 3000);
    return;
  }
  state.userTouchedView = false;
  let positioned = false;
  initCenterObs = new ResizeObserver(() => {
    if (state.userTouchedView) { done(); return; }
    // 2026-08-30：只在首次回调真正定位。之后图片/字体加载引起的 reflow 只重画曲线、绝不重新定位。
    // 之前每次 reflow 都 locateCenter（3 秒窗口内），导致：①揭幕后画面还在被反复微调 = 开屏漂移；
    // ②开屏后 3 秒内下钻，treeEl 尺寸一变又被拉去定位 = 下钻漂移。定位一次就够，位置以首次为准。
    if (!positioned) {
      positioned = true;
      // 2026-08-29 定：开屏智能定位（=定位按钮效果，当前根/Now 节点放到 --locate-* 旋钮位置），
      // 不再用整画布居中——大树画布一居中当前根就跑屏幕外，"打开后不知道飘哪去了"的根因
      locateCenter();
    }
    // 重定位同时必须重画曲线：图片/字体异步加载让树 reflow → 节点本地坐标变了，
    // 但曲线是 render 时画的一次，旧坐标会脱离节点（2026-08-25 修：之前只 centerView 不重画，
    // 导致打开/切页后曲线错位，点"定位到中心"重渲染才恢复）
    drawEdges();
    done();
  });
  initCenterObs.observe(treeEl);
  setTimeout(() => { if (initCenterObs) { initCenterObs.disconnect(); initCenterObs = null; } done(); }, 3000);
}
// 用户主动动了视图（滚动/缩放/拖拽/按键）→ 不再自动重居中，尊重用户位置
function markUserTouched() { state.userTouchedView = true; }
// 读 CSS 调参区数值（app.css :root 的 --locate-* 等，改完重载插件生效）
function cfgNum(name, def) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
}
function cfgBool(name, def) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v === '') return def;
  return v === '1' || v === 'true';
}
// 智能定位（定位按钮 / 下钻·返回后自动调用）：
// - 选中节点或编辑中 → 该节点居中（水平=--locate-selected-x）
// - 未选中 → 第一层级=最前面那个节点=当前根（currentRoot）居中（水平=--locate-first-x）
// 垂直位置统一=--locate-y；是否重置缩放/平移=--locate-reset-zoom / --locate-reset-pan
// 旋钮集中在 app.css :root 的「定位调参」区，改完重载插件生效
// 定位共用（2026-08-27 体检精简；2026-08-30 加缓动）：
// 算出目标 scroll → animateScrollTo 从当前值按缓动曲线插值过去（rAF 循环）。
// 缓动曲线用三次贝塞尔近似（视频软件那种"先缓后快再缓"=easeInOut），控制点走 CSS 变量可调。
let scrollAnimRAF = null;
let scrollAnimFallback = null; // 缓动兜底定时器句柄：每次 animateScrollTo 先清旧定时器，避免叠加导致 onDone 晚/重复触发
// 2026-08-30 定：缓动平移动画的**总开关**。只有鼠标停在「定位」按钮或其子菜单上时才为 true。
// 其余一切场景（开屏定位、下钻/返回、切「只显示当前关注」、折叠等）一律瞬间到位——
// 加这个缓动之前就是瞬间切换（"闪一下就换成新的"），改成平滑后位移过程被放大，视觉上显得画面在平移/跳。
let locateSmoothOn = false;
function easeCubicBezier(t, x1, y1, x2, y2) {
  // 三次贝塞尔曲线 y(t)：给定控制点 (x1,y1)(x2,y2)，求 y（进度）对应 t（时间）
  // 先二分找 x=1 的 t（标准 ease），但这里简化：直接用 t 当参数算 y（够用，控制点可调）
  const mt = 1 - t;
  const y = 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
  return y;
}
function animateScrollTo(targetLeft, targetTop, targetZoom, targetPanX, targetPanY, onDone) {
  if (scrollAnimRAF) cancelAnimationFrame(scrollAnimRAF);
  if (scrollAnimFallback) { clearTimeout(scrollAnimFallback); scrollAnimFallback = null; }
  // 开关关闭 = 瞬间到位：不走 rAF 缓动，直接落位（2026-08-30 定，见 locateSmoothOn 注释）
  if (!locateSmoothOn) {
    viewMap.scrollLeft = targetLeft; viewMap.scrollTop = targetTop;
    zoom = targetZoom; panX = targetPanX; panY = targetPanY;
    applyTreeTransform(); drawEdges();
    if (onDone) onDone();
    return;
  }
  const dur = cfgNum('--locate-anim-dur', 350);
  const x1 = cfgNum('--locate-anim-x1', 0.42);
  const y1 = cfgNum('--locate-anim-y1', 0);
  const x2 = cfgNum('--locate-anim-x2', 0.58);
  const y2 = cfgNum('--locate-anim-y2', 1);
  const sL0 = viewMap.scrollLeft, sT0 = viewMap.scrollTop;
  const z0 = zoom, pX0 = panX, pY0 = panY;
  const t0 = performance.now();
  // 兜底：切标签页/窗口失焦时浏览器会暂停 rAF → 动画卡住不完成；dur+200ms 后强制收尾（2026-08-30 报"曲线消失"）
  scrollAnimFallback = setTimeout(() => {
    if (scrollAnimRAF === null) return;
    scrollAnimRAF = null; scrollAnimFallback = null;
    viewMap.scrollLeft = targetLeft; viewMap.scrollTop = targetTop;
    zoom = targetZoom; panX = targetPanX; panY = targetPanY;
    applyTreeTransform(); drawEdges();
    if (onDone) onDone();
  }, dur + 200);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = easeCubicBezier(t, x1, y1, x2, y2);
    viewMap.scrollLeft = sL0 + (targetLeft - sL0) * e;
    viewMap.scrollTop = sT0 + (targetTop - sT0) * e;
    if (targetZoom !== z0 || targetPanX !== pX0 || targetPanY !== pY0) {
      zoom = z0 + (targetZoom - z0) * e;
      panX = pX0 + (targetPanX - pX0) * e;
      panY = pY0 + (targetPanY - pY0) * e;
      applyTreeTransform();
    }
    drawEdges();
    if (t < 1) scrollAnimRAF = requestAnimationFrame(step);
    else { scrollAnimRAF = null; if (scrollAnimFallback) { clearTimeout(scrollAnimFallback); scrollAnimFallback = null; } if (onDone) onDone(); }
  };
  scrollAnimRAF = requestAnimationFrame(step);
}
function placeCardAtViewport(el, xRatio, onDone) {
  const startZoom = zoom, startPanX = panX, startPanY = panY;
  if (cfgBool('--locate-reset-zoom', true)) zoom = 1;
  if (cfgBool('--locate-reset-pan', true)) { panX = 0; panY = 0; }
  applyTreeTransform();
  const z = zoom || 1;
  const yRatio = cfgNum('--locate-y', 0.5);
  const sL0 = viewMap.scrollLeft, sT0 = viewMap.scrollTop;
  viewMap.scrollLeft = 0; viewMap.scrollTop = 0; // 从 0 算起，避免叠加漂移
  const vr = viewMap.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const tx = vr.left + vr.width * xRatio, ty = vr.top + vr.height * yRatio;
  const targetLeft = (cx - tx) / z;
  const targetTop = (cy - ty) / z;
  // 还原起点 scroll/zoom/pan，交给 animateScrollTo 缓动过去
  viewMap.scrollLeft = sL0; viewMap.scrollTop = sT0;
  zoom = startZoom; panX = startPanX; panY = startPanY;
  applyTreeTransform();
  animateScrollTo(targetLeft, targetTop, cfgBool('--locate-reset-zoom', true) ? 1 : startZoom,
    cfgBool('--locate-reset-pan', true) ? 0 : startPanX, cfgBool('--locate-reset-pan', true) ? 0 : startPanY, onDone);
}
function locateCenter(forceIdx) {
  const selX = cfgNum('--locate-selected-x', 0.5);
  const firstX = cfgNum('--locate-first-x', 0.25);
  const activeId = state.selectedId || state.editingTitleId || state.editingNoteId || null;
  if (activeId) {
    const el = document.querySelector('.node-row[data-id="' + activeId + '"] .card');
    if (el) { placeCardAtViewport(el, selX); return; }
  }
  // 未选中：有 Now 节点 → 按 nowLocateIndex 定位（单 Now 直接定位；多个由定位按钮/悬浮菜单循环切换）
  const nows = collectNowNodes(currentRoot());
  if (nows.length) {
    const idx = (forceIdx != null)
      ? (((forceIdx % nows.length) + nows.length) % nows.length)
      : (((state.nowLocateIndex || 0) % nows.length) + nows.length) % nows.length; // ||0 兜底：未初始化时取模得 NaN
    if (forceIdx == null) state.nowLocateIndex = idx; // 仅自动定位（无 forceIdx）时回写计数；点击循环走 forceIdx，不改计数器
    const el = document.querySelector('.node-row[data-id="' + nows[idx].id + '"] .card');
    if (el) { placeCardAtViewport(el, firstX); if (forceIdx == null) updateNowMenuBold(); return; }
  }
  // 未选中且无 Now：第一层级 = 最前面那个节点 = 当前根（currentRoot）居中
  const root = currentRoot();
  const el = root && document.querySelector('.node-row[data-id="' + root.id + '"] .card');
  if (el) { placeCardAtViewport(el, firstX); return; }
  centerView(); drawEdges(); // 兜底：当前根无卡片 → 整画布居中
}
function resetView() {
  render();
  requestAnimationFrame(() => { locateCenter(); persistNow(); });
}
// 更新为当前路径：把当前界面（下钻根节点）存为默认路径（持久化，跨重启）
function saveAsCurrent() {
  const root = currentRoot();
  if (!root) return;
  let pid = root.persistId;
  if (!pid) {
    pid = genPersistId();
    root.persistId = pid;
    pushUndo();
    emitUpdate();
  }
  state.defaultPid = pid;        // 立即更新：按钮变置灰（已是默认）
  updateDefaultPathBtn();
  vscode.postMessage({ type: 'saveAsCurrent', pid });
}
// 返回默认路径：下钻回保存的默认节点（空 pid 即回根）
function returnToDefault() {
  goTo(state.defaultPid || null);
}
// ===== 路径历史栈（上一/下一路径）=====
// history 存 pid 序列（空串=根）；goTo 每次路径真正变化时调 recordPathHistory
function recordPathHistory() {
  if (state.suppressHistory) return; // back/forward 自身移动时不重复记
  const cur = (state.currentRootPid || '').trim();
  const last = state.pathHistory[state.pathHistoryIndex];
  if (last === cur) return; // 没变化（如 goTo 同一节点）不记
  // 截断：从当前位置之后的「重做分支」全部丢弃（标准 undo/redo 语义）
  state.pathHistory = state.pathHistory.slice(0, state.pathHistoryIndex + 1);
  state.pathHistory.push(cur);
  state.pathHistoryIndex = state.pathHistory.length - 1;
  updatePathMenuBtns();
}
// 初始化（首次打开）时把当前路径作为历史起点 seed 一次
function seedPathHistory(pid) {
  state.pathHistory = [(pid || '').trim()];
  state.pathHistoryIndex = 0;
  updatePathMenuBtns();
}
function historyBack() {
  if (state.pathHistoryIndex <= 0) return;
  state.pathHistoryIndex--;
  const pid = state.pathHistory[state.pathHistoryIndex];
  state.suppressHistory = true;
  goTo(pid || null);
  state.suppressHistory = false;
  updatePathMenuBtns();
}
function historyForward() {
  if (state.pathHistoryIndex >= state.pathHistory.length - 1) return;
  state.pathHistoryIndex++;
  const pid = state.pathHistory[state.pathHistoryIndex];
  state.suppressHistory = true;
  goTo(pid || null);
  state.suppressHistory = false;
  updatePathMenuBtns();
}
// 折叠后保持节点屏幕位置（防画面漂移；2026-08-21 定）
function keepView(node) {
  const b = rectCenter(node.id);
  if (!b) return;
  requestAnimationFrame(() => {
    // 2026-09-01 修「切走再回 pan 被清零、永远回自定义中央」真凶：
    // init 里 setHideDone/setShowNow 必调 keepView——b 在 pan=0（init 重置后）时捕获，
    // rAF 触发时 init 已把 pan 还原成用户值 → 补偿量 (b-a) 恰好抵消还原 → pan 归 0；
    // rAF 若晚于 scroll 还原，补偿量还会混入 scroll（实踩日志 pan=scroll 同款怪值）。
    // init 期间的视图位置由 init 自己的还原/定位分支全权负责，锚定补偿只服务正常使用期。
    if (!booted) return;
    const a = rectCenter(node.id);
    if (a) { panX += (b.x - a.x) / zoom; panY += (b.y - a.y) / zoom; applyTreeTransform(); } // 屏幕差÷zoom（2026-08-22：与编辑锚定同修，zoom≠1 时不过量）
    drawEdges(); // 补偿平移后立即重画曲线，防止「节点头和线错位」（2026-08-21 修）
    persistNow(); // 折叠导致视图平移后记住（离散事件，立即写）
  });
}
function rectCenter(id) {
  const el = document.querySelector('.node-row[data-id="' + id + '"] .card');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
// 隐藏/删除某节点后画面会跳：找一个操作后仍存在的邻居行当锚点，render 后用 keepView 把画面拉回原位。
// 优先取该节点「正下方最近的一行」（隐藏后内容会上移，钉住它即可抵消）；没有则取「正上方最近的一行」。
function findViewAnchorBeside(hiddenId) {
  const hiddenRow = document.querySelector('.node-row[data-id="' + hiddenId + '"]');
  if (!hiddenRow) return null;
  const ht = hiddenRow.getBoundingClientRect().top;
  let below = null, belowTop = Infinity, above = null, aboveTop = -Infinity;
  document.querySelectorAll('.node-row').forEach(r => {
    if (r === hiddenRow) return;
    const t = r.getBoundingClientRect().top;
    if (t > ht + 1) { if (t < belowTop) { belowTop = t; below = r; } }
    else if (t < ht - 1) { if (t > aboveTop) { aboveTop = t; above = r; } }
  });
  const pick = below || above;
  return pick ? pick.getAttribute('data-id') : null;
}

// （原 findNearestCard 缩放锚点辅助已于 2026-08-31 移除：缩放改为指针中心，见 wheel 监听处）
document.addEventListener('wheel', (e) => {
  markUserTouched(); // 任何滚轮（缩放/触控板滚动）= 用户接管视图，停止打开时的自动重居中（2026-08-24）
  // 图片预览打开时，触控板捏合（ctrlKey）缩放图片本身，而不是后面的思维导图背景（2026-08-26 需求）
  const pv = document.getElementById('img-preview');
  if (pv && !pv.classList.contains('hidden')) {
    if (!(e.ctrlKey || e.metaKey)) return; // 非捏合（普通双指滚动）不动图片
    e.preventDefault();
    const img = pv.querySelector('.img-preview-img');
    if (img) {
      imgZoom = Math.max(0.2, Math.min(8, imgZoom * (1 + (-e.deltaY) * 0.01)));
      applyImgZoom();
    }
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) {
    // 2026-09-01 根治斜向滚动顿挫：触控板双指 / 滚轮 = 手动 transform 平移（仿 vue3-mindmap 的 d3.zoom）。
    // 原生 scroll 斜向双轴滚动在主线程逐帧重绘大画布 → 先上再左的顿挫感；transform 平移走 GPU 合成器丝滑。
    e.preventDefault();
    panBy(e.deltaX, e.deltaY);
    return;
  }
  e.preventDefault();
  const delta = -e.deltaY * 0.008; // 缩放灵敏度：0.008（原 0.004 偏慢，翻倍）
  const next = Math.max(0.5, Math.min(3, zoom * (1 + delta)));
  if (next === zoom) return;
  // 以「指针位置」为中心缩放（2026-08-31 定，对齐 vue3-mindmap 的 d3.zoom 手感）：
  // 指针下的内容在缩放前后保持在指针下，捏合不再飘。
  // ⚠️ 坐标基准：getBoundingClientRect() 返回的是已带变换的盒子（left = 布局原点 + zoom*panX），
  // 直接代入公式会把 zoom*pan 混进去、每步累积一次偏差（实踩：先左飘再右飘、越缩越偏）。
  // 必须先换算回「未变换布局原点」下的指针坐标 A = (clientX - rect.left) + zoom*panX，再套
  // pan2 = A/newZoom - A/oldZoom + pan1（screen = zoom*(world + pan)，变换中 A 不变解出 pan2）。
  const tr = treeEl.getBoundingClientRect();
  const ax = (e.clientX - tr.left) + zoom * panX;
  const ay = (e.clientY - tr.top) + zoom * panY;
  panX = ax / next - ax / zoom + panX;
  panY = ay / next - ay / zoom + panY;
  zoom = next;
  applyTreeTransform();
  drawEdges(); // zoom 变了，曲线内部坐标要按新 zoom 重算，否则线和节点错位
  schedulePersist(); // 缩放后记住视图（平移/滚动走 viewMap 的 scroll 事件）
}, { passive: false });
// 滚动（触控板双指 / 滚动条 / 任何改 scrollLeft·Top 的操作）= 视图变动 → 记住
viewMap.addEventListener('scroll', schedulePersist, { passive: true });

// ===== 空格 + 鼠标拖拽平移画布（2026-08-31；行业共识，对齐 Figma/飞书）=====
// 按住空格 → 光标变抓手（#view-map.space-pan）；左键拖动 = 平移（改 scrollLeft/Top，与触控板双指滚动
// 同一通道，滚动手感一致、位置还原走现有 scroll 持久化）。空格的按下挂全局 keydown 的「空格预览」分支
// （选中图片时仍是预览、不动画布）；松开/失焦在此统一复位。
let spacePanHeld = false, spacePanning = false;
function endSpacePan() {
  spacePanHeld = false; spacePanning = false;
  viewMap.classList.remove('space-pan'); viewMap.classList.remove('space-panning');
}
document.addEventListener('keyup', (e) => { if (e.key === ' ') endSpacePan(); });
window.addEventListener('blur', endSpacePan);
// capture 阶段拦在框选（viewMap mousedown）之前：空格按住时拖拽只平移，不框选、不选中节点
document.addEventListener('mousedown', (e) => {
  if (!spacePanHeld || e.button !== 0) return;
  if (!viewMap.contains(e.target)) return;
  if (state.editingEl) return; // 编辑中让位（理论上编辑时空格已被上面的守卫拦下，双保险）
  e.preventDefault(); e.stopPropagation();
  spacePanning = true;
  viewMap.classList.add('space-panning');
  // 2026-09-01：平移统一走 transform（panX/panY），与触控板/滚轮同一通道（斜向丝滑）；
  // 拖动期间只改 pan + 应用 transform（不重建连线 SVG），松手才 drawEdges + 持久化，避免高频卡顿
  const sx = e.clientX, sy = e.clientY, pX0 = panX, pY0 = panY;
  const move = (ev) => {
    panX = pX0 + (ev.clientX - sx) / (zoom || 1);
    panY = pY0 + (ev.clientY - sy) / (zoom || 1);
    applyTreeTransform();
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    spacePanning = false;
    viewMap.classList.remove('space-panning');
    drawEdges();
    schedulePersist();
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}, true);

// ============ 交互 ============
// 全树先序遍历，返回 id 顺序（用于 Shift 区间选：取两节点在文档顺序中的区间）
function preorderIds(node, out) {
  out = out || [];
  if (!node) return out;
  out.push(node.id);
  (node.children || []).forEach(c => preorderIds(c, out));
  return out;
}
// 仅刷新现有 DOM 的选中类（不整树重渲染）。多选统一用 .selected 外框（2026-08-28 定：
// 原先锚点强高亮、其余 multi-selected 淡蓝环 → 框选后双层外框，去掉淡蓝环，全部走 .selected）
function refreshSelectionClasses() {
  document.querySelectorAll('.node-row').forEach(r => {
    const id = r.dataset.id;
    r.classList.toggle('selected', isSelected(id));
    r.classList.toggle('multi-selected', state.multiSelected.has(id) && state.selectedId !== id); // 类仅作逻辑标记，无视觉
  });
}
// Cmd+点击：把节点加入/移出多选集合（macOS 习惯）；首次加选时把当前单选节点也并入
function toggleMultiSelect(id) {
  disarmProxy(); // 多选不适用 armed
  if (state.multiSelected.size === 0 && state.selectedId && state.selectedId !== id) {
    state.multiSelected.add(state.selectedId);
  }
  if (state.multiSelected.has(id)) {
    state.multiSelected.delete(id);
    if (state.multiSelected.size === 0) state.selectedId = null; // 减到空 → 取消选中
  } else {
    state.multiSelected.add(id);
    state.selectedId = id; // 锚点 = 刚加入的节点（供后续 Shift 区间以它为起点）
  }
  updateToolbar();
  refreshSelectionClasses();
  showNodeMenu();
}
// Shift+点击：以当前锚点（selectedId）到被点节点，取先序区间全选（同分支=两节点及间隔；跨分支/跨根=从上到下整段）
function selectRange(id) {
  disarmProxy(); // 区间多选不适用 armed
  const anchorId = state.selectedId;
  if (!anchorId || anchorId === id || !findNode(state.tree, anchorId) || !findNode(state.tree, id)) {
    selectNode(id); return;
  }
  const order = preorderIds(state.tree);
  const ai = order.indexOf(anchorId), bi = order.indexOf(id);
  if (ai < 0 || bi < 0) { selectNode(id); return; }
  let lo = ai, hi = bi; if (lo > hi) { const t = lo; lo = hi; hi = t; }
  state.multiSelected.clear();
  for (let i = lo; i <= hi; i++) state.multiSelected.add(order[i]);
  state.selectedId = id;
  updateToolbar();
  refreshSelectionClasses();
  showNodeMenu();
}
function selectNode(id) {
  state.multiSelected.clear(); // 单选优先，清多选
  state.selectedId = id;
  updateToolbar();
  refreshSelectionClasses();
  showNodeMenu();
  armProxy(id); // 2026-08-28：选中即 armed，焦点切隐藏 input → 敲键直接替换节点标题（快速编辑替换）
}
// 点击画布空白 → 取消选中（框选刚结束时忽略本次 click，防止清掉多选）
viewMap.addEventListener('click', (e) => {
    if (e.target === viewMap || e.target === treeEl) {
    if (state.marquee) return;
    state.selectedId = null;
    state.selectedImg = null;
    state.multiSelected.clear();
    hideNodeMenu();
    updateToolbar();
    refreshSelectionClasses(); // 2026-08-28 修：原只移除 .selected，multi-selected 类残留 → 淡蓝外框不消失
    disarmProxy(); // 2026-08-28：取消选中即解除 armed
  }
});

// 框选命中：屏幕坐标矩形 r 与每个 .card 求交，命中即高亮（.selected）；move 与自动滚动时复用
function applyMarqueeSelection(r) {
  document.querySelectorAll('.card').forEach(card => {
    const rc = card.getBoundingClientRect();
    const hit = !(rc.right < r.left || rc.left > r.right || rc.bottom < r.top || rc.top > r.bottom);
    const row = card.closest('.node-row');
    if (row) row.classList.toggle('selected', hit);
  });
}
// ============ 框选 / 画布平移（空白处拖动：默认平移画布，Cmd/Ctrl+拖动=框选） ============
// 2026-08-21 定（飞书式）：左键拖空白 = 框选；移动画布 = 触控板双指滑动 / 滚轮（view-map 滚动）
viewMap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  // 编辑态点画布空白（不在节点/菜单上）：主动结束编辑 = 等价回车退出，立即保存+渲染（2026-08-22）
  // 原来靠编辑框失焦（blur）被动触发，某些情况下不及时 → 出现"点了空白没渲染，点别处才变"
  // 2026-08-24 修：之前只认 editingTitleEl，备注/链接编辑点空白会落到下面 preventDefault，blur 不触发 → 备注条不消失。改成认通用 editingEl
  if (state.editingEl && state.editingEl.contentEditable === 'true'
      && !e.target.closest('.card') && !e.target.closest('#node-menu') && !e.target.closest('#more-menu')) {
    // 2026-08-25 二修：编辑态点空白 = 保存 + 取消选择（之前保存后仍选中，要再点一次才取消）
    // 上次只清 selectedId + blur：假设 finish→onFinish 会 render 按 null 渲染，但标题编辑「没改/删空」分支不 render，
    // DOM 的选中高亮和 nodeMenu 会残留；且 click 兜底只在 target 是 viewMap/treeEl 时生效，点在连线 SVG 等子元素上会漏。
    // 所以 blur（同步触发 finish 保存）后这里兜底清掉全部选中表现，不依赖 render / click。
    state.selectedId = null;
    state.multiSelected.clear();
    state.editingEl.blur();
    hideNodeMenu();
    updateToolbar();
    refreshSelectionClasses(); // 2026-08-28：同样统一清两类，防 multi-selected 残留
    disarmProxy();
    return;
  }
  if (e.target.closest('.card')) return; // 卡片上：交给拖拽/点击
  e.preventDefault();
  // 2026-08-28 修（新开页面框选后 Delete/Cmd+C/V 全失效）：preventDefault 连 mousedown 的默认聚焦
  // 一起吞掉 → webview 一直拿不到焦点，键盘事件进不来（拖拽是鼠标事件所以正常；点一次节点后
  // 焦点进来才恢复）。这里主动把焦点拉进 webview（body 需 tabindex 才能稳定聚焦）。
  document.body.tabIndex = -1; document.body.focus();
  const startX = e.clientX, startY = e.clientY;
  state.marquee = true;
  // ---- 框选（左键拖空直接框选；<5px 视为点击空白 = 取消选中） ----
  let boxShown = false;
  let box = document.getElementById('marquee');
  if (!box) { box = document.createElement('div'); box.id = 'marquee'; document.body.appendChild(box); }
  box.style.display = 'none';
  const move = ev => {
    const dx = Math.abs(ev.clientX - startX), dy = Math.abs(ev.clientY - startY);
    if (!boxShown && (dx > 5 || dy > 5)) { boxShown = true; box.style.display = 'block'; markUserTouched(); } // 真正开始拖了 = 用户接管视图（2026-08-24）
    if (!boxShown) return;
    const x = Math.min(startX, ev.clientX), y = Math.min(startY, ev.clientY);
    const r1 = {
      left: x, top: y,
      right: Math.max(startX, ev.clientX), bottom: Math.max(startY, ev.clientY)
    };
    box.style.left = x + 'px'; box.style.top = y + 'px';
    box.style.width = r1.right - x + 'px';
    box.style.height = r1.bottom - y + 'px';
    // 实时选中：框一碰到节点，立刻高亮（2026-08-21 定：框选时能看清选了哪些）
    applyMarqueeSelection(r1);
    marqueeRect = r1;
    // 框选拖到视图边缘 → 自动滚动（复用节点拖拽的 autoScrollOnDrag；2026-08-26）
    autoScrollOnDrag(ev);
  };
  // 在 webview 外松鼠标时 mouseup 不触发 → 旧 move 闭包会永久挂在 document 上（2026-08-24 修：blur 兜底移除）
  const removeListeners = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    window.removeEventListener('blur', cancel);
  };
  const cancel = () => { removeListeners(); box.style.display = 'none'; state.marquee = false; marqueeRect = null; stopAutoScroll(); };
  const up = ev => {
    removeListeners();
    box.style.display = 'none';
    marqueeRect = null; stopAutoScroll();
    window.getSelection().removeAllRanges();
    disarmProxy(); // 2026-08-28：框选是多选操作，armed 不适用（框中单节点也视为多选集合）
    if (Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) {
      state.marquee = false;
      state.selectedId = null; state.selectedImg = null; state.multiSelected.clear();
      hideNodeMenu(); updateToolbar();
      refreshSelectionClasses(); // 2026-08-28：统一清两类，防 multi-selected 残留
      disarmProxy();
      return;
    }
    const r1 = {
      left: Math.min(startX, ev.clientX), top: Math.min(startY, ev.clientY),
      right: Math.max(startX, ev.clientX), bottom: Math.max(startY, ev.clientY)
    };
    // 以 drag 阶段已实时高亮的 .selected 行定最终多选（与用户所见一致，不依赖 mouseup 时矩形重算，
    // 避免首开布局未完全稳定时矩形判定漏选；2026-08-26 报首开框选删不掉）
    document.querySelectorAll('.node-row.selected').forEach(r => {
      if (r.dataset.id) state.multiSelected.add(r.dataset.id);
    });
    if (state.multiSelected.size) state.selectedId = null; // 多选优先
    render(); updateToolbar();
    // 保持 marquee=true 300ms：忽略紧随 mouseup 的 click，防止它把刚框选的多选清掉
    // （2026-08-24 修：之前先立即置 false 再 setTimeout 置 false，保护形同虚设）
    setTimeout(() => { state.marquee = false; }, 300);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  window.addEventListener('blur', cancel);
});
function updateToolbar() {
  updateDefaultPathBtn();
  updateFoldBar(); // 2026-08-30：右下角常驻折叠层级条跟随选中态刷新（22 处选中变化都会走这里）
  const hasSel = hasSingleSelection();
  // 「进入该节点」按钮：未选中禁用（2026-08-30 定；左折叠按钮已删 2026-09-11，功能在层级条「1」）
  if (btnDrill) {
    btnDrill.classList.toggle('disabled', !hasSel);
    btnDrill.dataset.tip = hasSel ? T('tb.drill') : T('tb.drillDefault'); // 未选中用专用文案（tb.drillDefault，2026-08-30 定稿）
  }
  // Minor（隐藏完成）按钮：树里没有任何 Minor 节点 → 置灰（用 .disabled 类非 disabled 属性，hover 仍可出 tooltip）
  // 2026-08-30 定：无 Minor 时 tooltip 改「当前没有 Minor 节点」
  // 2026-08-30 修：原来从 state.tree（整棵树）找 → 下钻进某节点后，外面有 Minor 就算有 → 按钮不置灰，
  // 点了却在开关「当前视图里看不见的」外部 Minor 节点。与 Now 按钮一致：只看 currentRoot() 范围内。
  let anyMinor = false;
  (function w(n) { if (!n || anyMinor) return; if (nodeIsMinor(n)) { anyMinor = true; return; } (n.children || []).forEach(w); })(currentRoot());
  const hd = document.getElementById('btn-hide-done');
  if (hd) {
    hd.classList.toggle('disabled', !anyMinor);
    if (!anyMinor) hd.dataset.tip = T('tb.noMinor');
    else if (state.hideDone) hd.dataset.tip = T('tb.showMinor');
    else hd.dataset.tip = T('tb.hideMinor');
  }
  const has = !!state.selectedId && state.selectedId !== currentRoot().id;
  const canDelete = has || state.multiSelected.size > 0; // 多选（框选后 selectedId 为 null）也要能删（2026-08-26 修：原只在单选时启用删除按钮，导致框选后点删除没反应）
  const menu = document.getElementById('more-menu');
  if (!menu) return;
  const set = (act, dis) => { const b = menu.querySelector('[data-act="' + act + '"]'); if (b) b.disabled = dis; };
  set('add-child', !state.selectedId);
  set('add-sibling', !has);
  set('delete', !canDelete);
}

// ===== 所见即所得编辑（2026-08-21 定）：编辑的是「渲染后的样子」而不是 Markdown 字符 =====
// 编辑框 100% 纯文字：整行格式（**/~~）→ splitLineFormat 拆成属性 + CSS 效果类；非整行 → 字面（符号可见）。零转换。
// 链接（[[...]]）保持字面（它有专门编辑入口）。
// （2026-08-24：mdToHtmlForEdit/htmlToMd 已彻底删除——HTML 转换层是"空节点/丢标记"一串 bug 的温床，机制改造后已无调用）

// 整行格式拆分（2026-08-22 机制改造）：标题若被 **/~~ 整行包裹，拆成"格式属性"，编辑框只放纯文字。
// 例：**测试** → {bold, inner:'测试'}；~~测试~~ → {strike, inner:'测试'}；_测试_ → {italic, inner:'测试'}（2026-08-25 Minor 改斜体）；~~**测试**~~ → {bold+strike, inner:'测试'}
// 非整行（如 **今天**要完成 / 多段星号）→ 返回 null → 走"字面模式"（编辑框直接显示 Markdown 符号，原样保存）
function splitLineFormat(title) {
  let t = title || '', bold = false, strike = false, italic = false, changed = true;
  while (changed) {
    changed = false;
    const mb = t.match(/^\*\*([^*]+)\*\*$/);
    if (mb) { bold = true; t = mb[1]; changed = true; continue; }
    const ms = t.match(/^~~([^~]+)~~$/);
    if (ms) { strike = true; t = ms[1]; changed = true; continue; }
    const mi = t.match(/^_([^_]+)_$/);
    if (mi) { italic = true; t = mi[1]; changed = true; } // 2026-08-25 Minor
  }
  return (bold || strike || italic) ? { bold, strike, italic, inner: t } : null;
}
// 编辑结束：把纯文字按原格式套回 Markdown 语法（与 splitLineFormat 互逆；顺序 italic 内、strike 外、bold 外）
function joinLineFormat(text, fmt) {
  let t = text;
  if (fmt.italic) t = '_' + t + '_'; // 2026-08-25 Minor 用斜体
  if (fmt.strike) t = '~~' + t + '~~';
  if (fmt.bold) t = '**' + t + '**';
  return t;
}

// ===== 通用编辑会话（2026-08-24 抽取）：标题/备注/链接编辑共用一套机制 =====
// 之前三个 startEdit* 各自抄了一遍：禁卡片拖拽 / 左缘锚定 / finish 清理 / 键位分发——
// 同一类 bug（拖选清选区、回车抖动、左缘锚定）要在三处各修一遍。现在共用机制集中在这里，三个入口只剩各自的数据读写。
// opts: {
//   pos        光标插到点击位置（单击已进入的节点再点）；不给则默认全选
//   cursorEnd  光标放末尾（备注：接着旧文字写）
//   onInput    每次输入的额外处理（如备注的空内容光标修复）
//   newline    false = 该编辑框不支持换行（链接编辑用：Cmd+Enter 被吞、粘贴的换行转空格）。默认支持
//   keys       { shiftEnter, tab, escape } 各键确认后的额外动作（finish 已先执行）
//   onFinish(prevW)  收尾：读编辑框文本、写数据、emitUpdate/render；prevW = 编辑期间最后的树宽，render 后按增量补偿
// }
// 2026-08-28：webkit contenteditable 对中文标点走 composition 上屏，输入法自身的智能配对
// 不触发（备忘录走 NSTextView 文本系统才配对）→ 双击引号变 ""（全左）、微信输入法预测的 】不上屏。
// 这里自己补：composition 上屏「开括号」后插一个对应「右括号」、光标移到中间，模拟智能配对。
// 飞书/Notion 等富文本编辑器在 contenteditable 里也都是这么自实现的。
const PAIR_OPEN = { '“':'”', '‘':'’', '「':'」', '『':'』', '（':'）', '【':'】', '《':'》', '〈':'〉' };
function tryAutoPair(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !el.contains(range.startContainer)) return; // 有选区 / 光标不在本编辑框 → 不配对
  const node = range.startContainer;
  if (node.nodeType !== 3) return; // 光标不在文本节点（如表单控件边界）→ 不处理
  const off = range.startOffset;
  const ch = node.nodeValue[off - 1];
  const close = PAIR_OPEN[ch];
  if (!close) return; // 前一个字符不是开括号
  if (node.nodeValue[off] === close) return; // 后面已是右括号（输入法或上次已配对）→ 不重复
  // 插入右括号到光标处，光标移到右括号前（开括号和右括号中间）
  const tn = document.createTextNode(close);
  range.insertNode(tn);
  range.setStartBefore(tn);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
// ===== 节点内换行（2026-08-30 定：Enter = 确认，Cmd/Ctrl+Enter = 换行）=====
// 编辑框是 contenteditable：换行 = 插入「\n 文本节点」，渲染靠 CSS white-space: pre-line（.title / .note > div）。
// 不用 <br>/<div> —— 文本节点天然带 \n，DOM 与数据一一对应、零转换层（同「整行格式属性化」思路，避开 HTML 转换层老 bug 温床）。
// webkit 边界：光标在内容末尾插 \n 时，末尾 \n 渲染不出空行、光标也停不住 → 补一个「哨兵 <br>」兜底（读取时忽略，不进数据）。
function insertEditTextNode(el, str) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return;
  if (!range.collapsed) range.deleteContents();
  const tn = document.createTextNode(str);
  range.insertNode(tn);
  // 末尾哨兵：内容以换行结尾且后面没有实质内容 → 补 <br> 让最后的空行渲染出来、光标停得住。
  // 哨兵不复用：如果 el 末尾已经有 <br>（前一次 Cmd+Enter 的哨兵/Chrome 空占位）就跳过，
  // 否则连续 Cmd+Enter 会堆 2、3 个 br → 编辑时多出空行、保存后消失的不一致 bug（2026-08-30 修）
  let n = tn.nextSibling, trailing = true;
  while (n) { const v = n.nodeType === 3 ? n.nodeValue : (n.textContent || ''); if (v && v.trim()) { trailing = false; break; } n = n.nextSibling; }
  if (trailing && /\n\s*$/.test(str)) {
    const last = el.lastChild;
    if (!last || last.nodeName !== 'BR') el.appendChild(document.createElement('br'));
  }
  const after = document.createRange();
  after.setStartAfter(tn);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);
  el.dispatchEvent(new Event('input', { bubbles: true })); // 走编辑会话 onInput（drawEdges / 视口跟随 / [[ 建议刷新）
}
// 读取编辑框纯文字（2026-08-30 换行）：文本节点原样（\n 保留）、<br> 忽略（哨兵/空占位不进数据）、
// contenteditable=false 子树跳过（minor/now 前缀图标不进数据）。替代旧的 textContent + replace(/\n/g,'')
function editableText(el) {
  let out = '';
  (function walk(node) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const c = node.childNodes[i];
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeName === 'BR') { /* 哨兵/占位 <br> 不算内容 */ }
      else if (c.nodeType === 1 && c.getAttribute && c.getAttribute('contenteditable') === 'false') { /* 前缀图标等装饰 */ }
      else walk(c);
    }
  })(el);
  return out;
}
// ===== 快速编辑替换：隐藏 input 代理（2026-08-28 重做）=====
// 选中节点 → 焦点切到隐藏 <input>（不碰 titleEl、不破坏拖拽）→ IME 在 input 里组字 →
// compositionend/直接 input → 替换节点标题 + 进真编辑态（光标末尾，可继续追加）。
// 比 8-25「选即预聚焦 contentEditable」方案干净：input 是原生表单控件，IME 关联同步，
// 首字母能进 composition（contentEditable 有延迟导致首字母直接上屏 → w什么 bug）。
let typeProxy = null;
let proxyComposing = false;
let armedId = null;      // 当前 armed 的节点 id（armed 时 proxy 持焦点，敲键替换该节点标题）
function ensureTypeProxy() {
  if (typeProxy) return;
  typeProxy = document.createElement('input');
  typeProxy.id = 'type-proxy';
  typeProxy.type = 'text';
  typeProxy.setAttribute('aria-hidden', 'true');
  typeProxy.autocomplete = 'off';
  typeProxy.spellcheck = false;
  // 2026-08-28：proxy 放在 armed 节点卡片下方（fixed 定位视口坐标，armProxy 时设 left/top）→
  // IME 候选框基于 input 屏幕位置弹出，跟在卡片下方，不再飘到屏幕顶部（原 -9999px 方案）
  typeProxy.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;';
  document.body.appendChild(typeProxy);
  typeProxy.addEventListener('compositionstart', () => { proxyComposing = true; mirrorProxyToTitle(); });
  typeProxy.addEventListener('compositionend', () => { proxyComposing = false; flushProxy(); });
  // 2026-08-30 组字实时镜像：拼音组字中把 proxy.value 实时显示到节点标题（所见即所得），
  // 不用等选词/回车才见字；直接输入（英文/数字）维持原有立即 flush 进真编辑
  typeProxy.addEventListener('input', () => { if (proxyComposing) { mirrorProxyToTitle(); return; } flushProxy(); });
}
// 选中节点即 armed：焦点切到 proxy（IME 关联 proxy），armedId 记目标节点
function armProxy(id) {
  ensureTypeProxy();
  if (state.multiSelected.size || state.editingEl || state.historyMode) { disarmProxy(); return; }
  if (armedId === id) { if (document.activeElement !== typeProxy) typeProxy.focus(); return; }
  armedId = id;
  typeProxy.value = '';
  // 2026-08-28：把 proxy 定位到 armed 节点卡片下方 → IME 候选框跟卡片下方，不再飘顶部
  const cardEl = document.querySelector('.node-row[data-id="' + id + '"] .card');
  if (cardEl) {
    const r = cardEl.getBoundingClientRect();
    typeProxy.style.left = r.left + 'px';
    typeProxy.style.top = (r.bottom + 4) + 'px';
  }
  typeProxy.focus();
}
function disarmProxy() {
  if (armedId) armedId = null;
  if (typeProxy && document.activeElement === typeProxy) { try { typeProxy.blur(); } catch (_) {} }
}
// 组字实时镜像（2026-08-30 定）：armed 时拼音组字中，把 proxy.value 实时写进节点标题——
// 选中即打字"所见即所得"，不用等 compositionend（选词/回车）才见字。
// 机制约束：组字必须发生在持焦点的 input 里（proxy 存在的根因，contenteditable 组字有首字母 bug），
// 所以组字期间标题没有真光标（可见的是实时文字），选词落定后 flushProxy 进真编辑态、光标在末尾。
// IME 取消（组字中 Esc）→ input 事件带回空值 → 镜像还原原标题，数据层从没动过（纯视觉预览，无 undo 记录）。
function mirrorProxyToTitle() {
  if (!armedId) return;
  const r = findNode(state.tree, armedId);
  const el = r && document.querySelector('.node-row[data-id="' + armedId + '"] .title');
  if (!el || !r.node) return;
  const node = r.node;
  const v = typeProxy.value;
  // 与 startEdit 同款三件事：保留前缀图标（minor/now）；整行格式拆属性显示纯文字；树宽变化同步补偿 flex 推移
  const icos = Array.prototype.filter.call(el.children,
    ch => ch.classList && (ch.classList.contains('minor-ico') || ch.classList.contains('now-ico')));
  const fmt = splitLineFormat(node.title);
  const w0 = treeEl.offsetWidth;
  el.textContent = v || (fmt ? fmt.inner : (node.title || ''));
  icos.forEach(ic => el.insertBefore(ic, el.firstChild));
  const w1 = treeEl.offsetWidth;
  if (w1 !== w0) { panX += (w1 - w0) / 2; applyTreeTransform(); drawEdges(); }
  // proxy 跟着卡片挪（树宽变化 flex 会推卡片），IME 候选框不脱节
  const cardEl = el.closest ? el.closest('.card') : null;
  if (cardEl) {
    const rc = cardEl.getBoundingClientRect();
    typeProxy.style.left = rc.left + 'px';
    typeProxy.style.top = (rc.bottom + 4) + 'px';
  }
}
// proxy 收到完整输入（compositionend 或直接 input）→ 替换节点标题 + 进真编辑态（光标末尾）
function flushProxy() {
  if (!armedId) return;
  const v = typeProxy.value;
  if (!v) return;
  typeProxy.value = '';
  const id = armedId; armedId = null;
  try { typeProxy.blur(); } catch (_) {}
  const r = findNode(state.tree, id);
  if (!r) { render(); return; }
  pushUndo();
  r.node.title = v;
  state.justCreated.delete(id);
  emitUpdate();
  render();
  const el = document.querySelector('.node-row[data-id="' + id + '"] .title');
  if (el) startEdit(r.node, el, null, true); // cursorEnd=true：进编辑态光标放末尾，用户可继续追加
}
// ===== [[ 文件自动补全（2026-08-29，Obsidian 式）=====
// 编辑标题/链接时敲 [[ 触发：弹 vault md 文件建议，↑↓ 选择、Enter/Tab 确认、Esc 只关菜单（再 Esc 才放弃编辑）。
// 文件清单走宿主 getFiles 消息（前端缓存 10 秒）；备注编辑不开（备注里 [[ ]] 不可点，免误导）。
let wikiFileCache = { ts: 0, files: [] }; // 宿主回送的 md 文件表 [{name: basename, path}]
let activeSuggest = null;                 // 当前编辑会话的建议器实例（files 消息回来时找它刷新）
function filterWikiFiles(files, query) {  // 纯函数（test.mjs 可测）：按名字/路径包含过滤，最多 20 条
  const q = String(query || '').trim().toLowerCase();
  return (files || []).filter(f => {
    const n = String(f.name || '').toLowerCase(), p = String(f.path || '').toLowerCase();
    return !q || n.includes(q) || p.includes(q);
  }).slice(0, 20);
}
// 触发判定（纯函数，test.mjs 可测）：光标前文字处于 [[ 或中文 【【 触发态 → 返回待过滤 query（可为空串），否则 null。
// query 不含 ] 】 [ 【 # |（# 子路径、| 别名、括号字符出现即停建议）；两种括号都占 2 个字符位，替换逻辑通用
function matchWikiTrigger(before) {
  const m = String(before).match(/(?:\[\[|【【)([^\[\]【】#|]*)$/);
  return m ? m[1] : null;
}
function createLinkSuggest(el) {
  let box = null, items = [], idx = 0, ctx = null; // ctx = {node:光标所在文本节点, offset, query, left, top}
  const api = {
    close,
    key,
    apply,
    update,
    refresh: () => { if (ctx && wikiFileCache.files.length) show(); }, // 宿主 files 消息到货后重渲染
  };
  activeSuggest = api;
  function close() { if (box) { box.remove(); box = null; } items = []; idx = 0; }
  function show() {
    const matches = filterWikiFiles(wikiFileCache.files, ctx.query);
    if (!matches.length) { close(); return; }
    items = matches; idx = 0;
    if (!box) {
      box = document.createElement('div');
      box.id = 'link-suggest';
      document.body.appendChild(box);
      // 点条目 = 选中；mousedown + preventDefault 防编辑框失焦（失焦 = 编辑结束）
      box.addEventListener('mousedown', e => {
        const it = e.target && e.target.closest ? e.target.closest('.ls-item') : null;
        if (it) { e.preventDefault(); e.stopPropagation(); idx = parseInt(it.dataset.idx, 10) || 0; api.apply(); }
      });
    }
    // 重名文件附路径区分（Obsidian 同款）
    const seen = new Set(), dup = new Set();
    wikiFileCache.files.forEach(f => { if (seen.has(f.name)) dup.add(f.name); seen.add(f.name); });
    box.innerHTML = items.map((f, i) =>
      '<div class="ls-item' + (i === idx ? ' on' : '') + '" data-idx="' + i + '">' +
      '<span class="ls-name">' + escapeHtml(f.name) + '</span>' +
      (dup.has(f.name) ? '<span class="ls-path">' + escapeHtml(f.path) + '</span>' : '') +
      '</div>').join('');
    // 定位：光标右下，clamp 到视口内（iframe 内坐标即视口坐标）
    const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    box.style.left = Math.max(4, Math.min(ctx.left, vw - 260)) + 'px';
    box.style.top = Math.max(4, Math.min(ctx.top, vh - 200)) + 'px';
  }
  function update() {
    const sel = window.getSelection();
    if (!sel.rangeCount) { close(); return; }
    const r = sel.getRangeAt(0);
    const tn = r.startContainer;
    if (!tn || tn.nodeType !== 3 || !el.contains(tn) || !r.collapsed) { close(); return; }
    const before = tn.textContent.slice(0, r.startOffset);
    const q = matchWikiTrigger(before);
    if (q === null) { close(); return; }
    const rect = r.getBoundingClientRect();
    ctx = { node: tn, offset: r.startOffset, query: q, left: rect.left, top: rect.bottom + 4 };
    if (wikiFileCache.files.length && Date.now() - wikiFileCache.ts < 10000) show();
    else vscode.postMessage({ type: 'getFiles' }); // 清单到货 → 宿主回 files → activeSuggest.refresh()
  }
  function apply() {
    const it = items[idx];
    if (!it || !ctx || !ctx.node) { close(); return; }
    const tn = ctx.node;
    const start = Math.max(0, ctx.offset - ctx.query.length - 2); // 连 "[[query" / "【【query" 一起替换（两种括号都占 2 字符）
    let end = ctx.offset;
    // 中文输入法打 【 会被 tryAutoPair 自动补 】（或用户手打了 ]]）→ 替换时把紧随的闭括号一并吃掉，避免残留 "】"
    const afterTxt = String(tn.textContent || '').slice(ctx.offset);
    if (afterTxt.startsWith('】')) end += 1;
    else if (afterTxt.startsWith(']]')) end += 2;
    const ins = '[[' + it.name + ']]';
    try {
      const r = document.createRange();
      r.setStart(tn, start); r.setEnd(tn, end);
      r.deleteContents();
      r.insertNode(document.createTextNode(ins));
      const after = document.createRange();
      after.setStart(tn, start + ins.length); after.collapse(true); // 光标停在 ]] 后，可继续打字
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(after);
    } catch (_) { close(); return; }
    close();
    el.dispatchEvent(new Event('input', { bubbles: true })); // 走正常 flushInput（树宽记账 + 视口跟随）
  }
  function key(e) {
    if (!box) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      const els = box.querySelectorAll('.ls-item');
      for (let i = 0; i < els.length; i++) els[i].classList.toggle('on', i === idx);
      return true;
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); apply(); return true; } // 带修饰键的不算确认（如 Cmd+Enter = 换行，2026-08-30）
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return true; } // 只关菜单，编辑不结束
    return false;
  }
  return api;
}
function editSession(el, opts) {
  const card = el.closest('.card');
  // 编辑态禁用卡片拖拽：否则编辑框内拖选文字会触发 HTML5 dragstart，拖拽启动会清除文本选区（2026-08-22 修"松手选区变光标"）
  if (card) card.draggable = false;
  // 登记活跃编辑会话：点画布空白时据此主动结束编辑（2026-08-24 修：之前只认 editingTitleEl，备注/链接编辑点空白不刷新）
  state.editingEl = el;
  markUserTouched(); // 用户开始编辑 = 接管视图，停止打开时的自动重居中（防编辑中树宽变化触发 re-center 把视图拽走，2026-08-24）
  // 锚定（2026-08-24 重做）：用「树宽增量」补偿 flex 居中带来的漂移，不再用屏幕左缘。
  //   原因：屏幕左缘锚定会把用户的手动滚动也"纠正"回去 → "拖回中间，一写又跑到边边"。
  //   机制：#canvas 是 flex 居中，树宽变 Δ → 树被往左推 Δ/2（layout 空间）→ panX 补 +Δ/2 即可抵消，
  //         和 viewMap 滚动完全解耦（滚动不改树宽，不触发补偿；用户想滚哪滚哪）。
  //   注：transform 是 scale(zoom) translate(panX)，panX 是 layout 单位，所以这里不除 zoom。
  let prevW = treeEl.offsetWidth;
  let composing = false;       // IME 组字中（2026-08-26 修：组字期间冻结祖先 transform/滚动补偿，否则会打断中文引号等成对符号的配对）
  let pendingFlush = false;
  const sug = opts.suggest ? createLinkSuggest(el) : null; // [[ 文件建议（标题/链接编辑开，备注不开）
  freezeTreeLayout(); // 2026-08-28 三修：钉住树布局，编辑中宽高变化零位移（见函数头注释）
  const flushInput = () => {
    prevW = treeEl.offsetWidth; // 只记账（供 onFinish 的 anchorByWidth 做 render 前基准）；布局已冻结，宽度变化不产生位移，无需补偿
    drawEdges(); // 曲线实时跟上
    if (card) ensureCardVisible(card); // 超出视口右边缘 → 画布往左滚跟随光标（贴边才有；画布中央不触发、纹丝不动）
    if (opts.onInput) opts.onInput();
  };
  const onInput = () => {
    if (composing) { pendingFlush = true; return; } // 组字中：跳过，compositionend 后统一补
    if (sug) sug.update(); // [[ 建议跟随光标（触发/过滤/关闭）
    // 2026-08-28：freeze 布局后树宽变化零位移，flushInput 不再补偿（只 drawEdges+ensureCardVisible），
    // 故走 rAF 不会抖动；同步反而会强制 layout 打断 IME 配对（引号 ""→""、微信输入法吞 】）。
    requestAnimationFrame(flushInput);
  };
  el.addEventListener('input', onInput);
  // IME 组字开始/结束：组字期间冻结 transform/滚动，结束后再补一次
  const onCompStart = () => { composing = true; };
  const onCompEnd = () => {
    composing = false;
    // 2026-08-28：走 rAF（freeze 布局后位移已零，rAF 不抖；同步强制 layout 会对 IME 有干扰，无必要）。
    if (pendingFlush) { pendingFlush = false; requestAnimationFrame(flushInput); }
    tryAutoPair(el); // composition 上屏中文标点后自己补配对（见 tryAutoPair 注释）
    if (sug) sug.update(); // 组字上屏（可能带出 [[）后补一次建议检测
  };
  el.addEventListener('compositionstart', onCompStart);
  el.addEventListener('compositionend', onCompEnd);
  // 粘贴纯文本（2026-08-30 换行）：多行文本按原样进编辑框（\n = 节点内换行，所见即所得），
  // 每行去掉前导 Tab（防止粘贴大纲把 Tab 带进标题）；链接编辑框（newline:false）换行转空格。
  // 无纯文本（如纯图片）不拦 → 冒泡到全局 paste 流程走图片粘贴。
  const onPaste = (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const text = cd.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    e.stopPropagation();
    const ins = (opts.newline === false)
      ? text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/^\t+/, '')).join(' ').trim()
      : text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/^\t+/, '')).join('\n');
    if (ins) insertEditTextNode(el, ins);
  };
  el.addEventListener('paste', onPaste);
  let done = false;
  const finish = () => {
    if (done) return; done = true; // keydown 确认后 blur 会再触发一次，防重入
    if (sug) sug.close(); // 收起 [[ 建议菜单
    activeSuggest = null;
    el.contentEditable = 'false';
    state.editingEl = null; // 清活跃会话登记（2026-08-24）
    el.removeEventListener('input', onInput);
    el.removeEventListener('compositionstart', onCompStart);
    el.removeEventListener('compositionend', onCompEnd);
    el.removeEventListener('paste', onPaste);
    el.onkeydown = null; el.onblur = null;
    if (card) card.draggable = true; // 恢复卡片拖拽
    const anchorBefore = unfreezeTreeLayout(card || el); // 2026-08-28：恢复 flex 居中 + 取锚点冻结时视觉位置，交给 onFinish 的 render 后对齐
    // 焦点移出编辑框：让 Cmd+Z 立即走全局撤销（2026-08-22 修：焦点残留导致快捷键被编辑框拦截）
    try { if (document.activeElement) document.activeElement.blur(); } catch (_) {}
    opts.onFinish(prevW, anchorBefore); // 传当前树宽，onFinish 在 render 后按增量补偿
    flushPendingIncoming(); // 编辑结束：应用编辑期间被延迟的 sync/外部变更（2026-08-27 B9）
    // 2026-08-28 快速编辑替换：编辑结束后若仍选中该节点，重新 armed（用户可继续敲键替换）
    if (state.selectedId && !state.multiSelected.size && !state.editingEl && !state.historyMode) armProxy(state.selectedId);
  };
  el.onkeydown = e => {
    // 输入法组合态（拼音打字中）的按键全还给输入法——回车=上屏、Esc=取消输入，不是确认/放弃编辑
    // （2026-08-24 修：之前拼音打字按回车，输入法把分词原始字母 "xin'jie'dian" 塞进编辑框）
    if (e.isComposing) return;
    // 建议菜单开着：↑↓/Enter/Tab/Esc 先归菜单（Esc 只关菜单不结束编辑，第二次 Esc 才放弃编辑）
    if (sug && sug.key(e)) return;
    // stopPropagation：防止确认后同一按键继续冒泡到全局触发「Enter=新建」或「Tab=新建」（一次回车 = 确认+新建的 bug 根因）
    const keys = opts.keys || {};
    // Cmd/Ctrl+Enter = 编辑框内换行（2026-08-30 定：Enter 仍确认；原编辑态 Cmd+Enter「保存并切 Minor」已挪全局 Cmd+M）。
    // Shift+Enter 不算换行：仍是「保存并进备注编辑」（2026-08-21 定）。
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (opts.newline !== false) insertEditTextNode(el, '\n');
      return;
    }
    if (e.shiftKey && e.key === 'Enter' && keys.shiftEnter) { e.preventDefault(); e.stopPropagation(); finish(); keys.shiftEnter(); return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(); return; }
    if (e.key === 'Tab' && keys.tab) { e.preventDefault(); e.stopPropagation(); finish(); keys.tab(); return; }
    if (e.key === 'Escape') { e.stopPropagation(); if (keys.escape) keys.escape(); finish(); }
  };
  el.onblur = finish;
  el.contentEditable = 'true';
  el.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  const r = document.createRange();
  if (opts.pos) {
    // 光标插到点击位置（不默认全选，2026-08-21 定）
    let placed = false;
    try {
      const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(opts.pos.x, opts.pos.y) : null;
      if (range && el.contains(range.startContainer)) {
        // 2026-08-27：点在前缀图标（minor/now ico）上时 caretRangeFromPoint 会落进图标 SVG 里 →
        // 光标挪到图标后第一个文字位（编辑态图标保留后新出现的场景）
        let anc = range.startContainer, inPrefixIco = false;
        while (anc && anc !== el) {
          if (anc.nodeType === 1 && (anc.classList.contains('minor-ico') || anc.classList.contains('now-ico'))) { inPrefixIco = true; break; }
          anc = anc.parentNode;
        }
        if (inPrefixIco) {
          let idx = 0;
          for (let i = 0; i < el.childNodes.length; i++) {
            const ch = el.childNodes[i];
            if (ch.nodeType === 3 || !(ch.classList && (ch.classList.contains('minor-ico') || ch.classList.contains('now-ico')))) { idx = i; break; }
          }
          r.setStart(el, idx); r.collapse(true); sel.addRange(r);
        } else {
          // 右缘兜底：点在文字右边的空白时，caretRangeFromPoint 常返回开头位置 → 检测到就强制插到末尾
          // （2026-08-24 修：点输入框最右边时光标跑到最左，按意图插到最后）
          const full = document.createRange(); full.selectNodeContents(el);
          const fr = full.getBoundingClientRect();
          if (fr.width > 0 && opts.pos.x > fr.right) {
            r.selectNodeContents(el); r.collapse(false); sel.addRange(r);
          } else {
            sel.addRange(range);
          }
        }
        placed = true;
      }
    } catch (_) { /* 定位失败则光标放末尾 */ }
    if (!placed) { r.selectNodeContents(el); r.collapse(false); sel.addRange(r); }
  } else if (opts.cursorEnd) {
    r.selectNodeContents(el); r.collapse(false); sel.addRange(r); // 光标放末尾：接着旧文字写（2026-08-22 修"光标跳位置"）
  } else {
    r.selectNodeContents(el); sel.addRange(r); // 默认全选（方便整体替换）
  }
}
// 进编辑时刻（2026-08-25）：dblclick 据此判断"双击前是否已在编辑"，避免刚进编辑的同一双击被误判为"编辑时双击=全选"
let titleEditStartTs = 0;
// 编辑态内全选编辑框内容（2026-08-25：编辑态双击 = 全选；不重入 editSession 避免监听器叠加）
function selectAllInEdit(el) {
  const s = window.getSelection();
  s.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(el);
  s.addRange(r);
}
// render 重建 DOM 后按「树宽增量」补偿 flex 居中漂移 + 把编辑节点拉回视口（2026-08-24 重做，原 anchorNodeLeft 改名）
// prevW = render 前的树宽；render 后树宽变了 Δ → panX 补 Δ/2 抵消 flex 推移；再 ensureCardVisible 拉回视口
// anchorBefore（编辑结束路径传）：render 前锚点卡片的视觉位置；render 后按「卡片视觉位置不变」一次 panX/panY 对齐
// （÷zoom，同步）—— 涵盖冻结→居中 + render 宽度/相对位置变化全部位移，比 flex 补偿准（修回车后画布往右移）
function anchorByWidth(prevW, id, anchorBefore) {
  if (anchorBefore && id) {
    const el = document.querySelector('.node-row[data-id="' + id + '"] .card');
    if (el) {
      const a = el.getBoundingClientRect();
      const dx = anchorBefore.left - a.left, dy = anchorBefore.top - a.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { panX += dx / zoom; panY += dy / zoom; applyTreeTransform(); }
    }
    drawEdges();
    if (el) ensureCardVisible(el);
    return;
  }
  const w = treeEl.offsetWidth;
  if (w !== prevW) { panX += (w - prevW) / 2; applyTreeTransform(); }
  drawEdges();
  if (id) { const el = document.querySelector('.node-row[data-id="' + id + '"] .card'); if (el) ensureCardVisible(el); }
}
// ===== 编辑期间钉住树布局（2026-08-28 三修，方案重做）=====
// 动态补偿方案（输入后测树宽、panX 补 Δ/2）已弃用——实测仍抖：
// 画布是 flex 居中，树宽一变浏览器排版必然先推移、再补偿总有缝隙。
// 根治：进编辑时把树钉在当前 layout 位置（canvas 改 flex-start + treeEl margin=当前 offset），
// 编辑中树宽/树高随便变都不产生任何布局位移 → 零补偿零抖动；出编辑恢复 flex 居中，
// 用「锚点元素视觉位置不变」一次 panX 对齐（全程同步，无中间帧）。
function freezeTreeLayout() {
  if (canvasEl.style.justifyContent === 'flex-start') return; // 已冻结
  treeEl.style.marginLeft = treeEl.offsetLeft + 'px';
  treeEl.style.marginTop = treeEl.offsetTop + 'px';
  canvasEl.style.justifyContent = 'flex-start';
  canvasEl.style.alignItems = 'flex-start';
}
function unfreezeTreeLayout(anchorEl) {
  if (canvasEl.style.justifyContent !== 'flex-start') return null; // 未冻结
  const b = anchorEl ? anchorEl.getBoundingClientRect() : null; // 锚点在冻结状态下的视觉位置
  canvasEl.style.justifyContent = '';
  canvasEl.style.alignItems = '';
  treeEl.style.marginLeft = '';
  treeEl.style.marginTop = '';
  // 不在此处对齐：紧接着 onFinish 的 render/innerHTML 会让编辑卡片「相对 treeEl 的位置」也变
  // （格式符号转效果、图标出现/消失等），flex 居中补不到这一层 → 回车后画布「往右移一下」且时有时无。
  // 返回锚点位置，交给 anchorByWidth 在 render 之后一次对齐到位。
  return b;
}
// 把卡片拉回视口：右缘超出 → 往右滚；左缘超出 → 往左滚（屏幕坐标，viewMap 是滚动容器未变形）
function ensureCardVisible(card) {
  const cr = card.getBoundingClientRect();
  const vr = viewMap.getBoundingClientRect();
  if (cr.right > vr.right - 16) viewMap.scrollLeft += (cr.right - vr.right + 16);
  else if (cr.left < vr.left + 16) viewMap.scrollLeft -= (vr.left + 16 - cr.left);
}
function startEdit(node, titleEl, pos, cursorEnd) {
  if (state.historyMode) return; // 历史页只读：禁止进入编辑
  disarmProxy(); // 进真编辑态，proxy 让位（titleEl 抢焦）
  // 不隐藏 nodeMenu：2026-08-21 定「编辑时本质上也是选中，下面 toast 也要在」
  // 编辑框 100% 纯文字：整行格式（**/~~）→ 拆成属性 + CSS 效果类显示；非整行 → 字面（符号可见）。零转换。
  state.editingTitleId = node.id; // 编辑态标记：加粗按钮判断用（不依赖焦点，点按钮时焦点已转移）
  state.editingTitleEl = titleEl;
  titleEditStartTs = Date.now(); // 记录进编辑时刻，供 dblclick 判断是否"双击前已在编辑"（2026-08-25 修：避免刚进编辑的同一双击被误判为"编辑时双击=全选"）
  const fmt = splitLineFormat(node.title);
  titleEl.classList.remove('editing-bold', 'editing-strike');
  const preEditW = treeEl.offsetWidth; // 2026-08-28 修（进编辑瞬间画布挪动）：文本替换（**/~~ 符号转纯文字）可能改树宽，先抓宽，替换后立刻补偿
  // 保留前缀图标（minor-ico / now-ico）：编辑中图标不消失、标题起点不左移，
  // 双击坐标→光标的映射才准（对齐备注竖条的丝滑体验，2026-08-27 定）。
  // 机制：先抓图标 DOM 引用（textContent 赋值清空后引用仍有效），设完纯文字再插回最前。
  const prefixIcos = Array.prototype.filter.call(titleEl.children,
    ch => ch.classList.contains('minor-ico') || ch.classList.contains('now-ico'));
  if (fmt) {
    titleEl.textContent = fmt.inner;
    if (fmt.bold) titleEl.classList.add('editing-bold');
    if (fmt.strike) titleEl.classList.add('editing-strike');
  } else {
    titleEl.textContent = node.title;
  }
  prefixIcos.forEach(ico => titleEl.insertBefore(ico, titleEl.firstChild));
  // 2026-08-28 三修：进编辑的文本替换（**/~~ 转纯文字）改树宽 → flex 居中推移 δ/2。
  // 此处仍处于冻结之前（editSession 里才 freeze）→ 需同步补偿锚定；冻结后（输入中）就零位移了。
  {
    const wNow = treeEl.offsetWidth;
    if (wNow !== preEditW) { panX += (wNow - preEditW) / 2; applyTreeTransform(); drawEdges(); }
  }
  // 记录进入编辑时的纯文字（保留首尾空格，不 trim）——用户没改就不保存（防误清空丢字）
  // 2026-08-26 改：取消"清空/纯空格=取消新建"，改为允许空/空格节点保留；故对比与保存都用未 trim 的原始文本
  // 2026-08-30 换行：改用 editableText（\n 原样保留，多行标题编辑后原样对比）
  const originalRaw = editableText(titleEl);
  editSession(titleEl, {
    pos,
    cursorEnd,
    suggest: true, // 标题敲 [[ 弹文件建议（2026-08-29）
    keys: {
      // 2026-08-21 定：Shift+Enter = 保存并直接进备注编辑；Tab = 直接创建子节点进编辑
      // 2026-08-30：Cmd+Enter 改为编辑框内换行（editSession 统一处理；原「保存并切 Minor」挪全局 Cmd+M）
      shiftEnter: () => editNoteOfSelected(),
      tab: () => addChild(),
      escape: () => {
        if (state.justCreated.has(node.id)) { cancelNewNode(node.id); return; } // 刚新建的节点：ESC = 取消（删除，保留）
        titleEl.textContent = originalRaw; // 已有节点：还原原文（不保存）。布局冻结中，还原改宽度零位移
      }
    },
    onFinish: (prevW, anchorBefore) => {
      state.editingTitleId = null; state.editingTitleEl = null; // 清编辑态标记（2026-08-22）
      if (!findNode(state.tree, node.id)) return; // 节点已在 ESC 取消流程中被删除 → 直接收尾，勿重复处理
      // 2026-08-30 换行：editableText 保 \n；首尾空行收掉（中间空行保留 = 段落间距，落盘走空续行）
      const currentRaw = editableText(titleEl).replace(/^\n+|\n+$/g, ''); // 不 trim：保留首尾空格（如纯空格标题）
      if (currentRaw === originalRaw) {
        // 没改（含直接回车确认"新节点"）→ 保持节点，回退到渲染态；不再视为刚新建
        state.justCreated.delete(node.id);
        titleEl.classList.remove('editing-bold', 'editing-strike');
        // 编辑态→渲染态宽度可能变（符号转效果）→ 按树宽增量补偿 flex 漂移（2026-08-24）
        const pw = treeEl.offsetWidth;
        titleEl.innerHTML = cardTitleInner(node); // 2026-08-26 修：还原时一并带回 Minor 置灰小箭头（之前用 renderInline 会丢图标）
        anchorByWidth(pw, node.id, anchorBefore); // 2026-08-28：用锚点对齐，覆盖 innerHTML 后卡片相对 treeEl 位置变化
        return; // 不 emitUpdate / render
      }
      // 用户改了：整行格式套回 Markdown 语法；字面模式原样保存（保留首尾空格，不 trim）
      // 2026-08-28：删空文字（currentRaw 空）→ finalTitle=''，不包格式符号，避免残留 __ / **** 让空节点渲染异常
      const finalTitle = currentRaw ? (fmt ? joinLineFormat(currentRaw, fmt) : currentRaw) : '';
      if (finalTitle !== node.title) pushUndo();
      node.title = finalTitle;
      state.justCreated.delete(node.id); // 已正式命名 → 不再是"刚新建"，后续清空只回退不删
      titleEl.classList.remove('editing-bold', 'editing-strike');
      emitUpdate(); // 写回文件
      render();
      anchorByWidth(prevW, node.id, anchorBefore); // 2026-08-28：用锚点对齐，覆盖 render 后卡片相对 treeEl 位置变化
    }
  });
}
function startEditNote(node, noteEl, pos) {
  // 不再 hideNodeMenu：写备注也是选中态，下方菜单保留（2026-08-22 与标题编辑统一）
  disarmProxy(); // 进真编辑态，proxy 让位
  const w0 = treeEl.offsetWidth; // 2026-08-28：文本替换发生在 freeze 之前（editSession 里才冻结）→ 改树宽会 flex 推移，同步补偿
  noteEl.textContent = node.note || '';
  const w1 = treeEl.offsetWidth;
  if (w1 !== w0) { panX += (w1 - w0) / 2; applyTreeTransform(); drawEdges(); }
  editSession(noteEl, {
    pos, // 双击进编辑：光标插到双击的鼠标位置（2026-08-27 定，修"光标总跑到最后"）
    cursorEnd: !pos, // 键盘入口（Cmd+Enter 等）无坐标 → 光标放末尾接着旧文字写
    suggest: true, // 备注敲 [[ 也弹文件建议（2026-08-29 定；备注里 [[ ]] 是纯文字，但方便先写后搬）
    onInput: () => {
      // 修「删除到空光标卡中间」：Chrome 空 contenteditable 会留隐藏占位（<br>），删完字后光标退不回去。
      // 内容一为空就彻底清空并把光标放回开头（灰竖条右边）（2026-08-21 定）
      if (!(noteEl.textContent || '').trim()) {
        noteEl.innerHTML = '';
        const s = window.getSelection();
        const rr = document.createRange();
        rr.setStart(noteEl, 0); rr.collapse(true);
        s.removeAllRanges(); s.addRange(rr);
      }
    },
    keys: {
      // 2026-08-21 定：备注编辑态与节点编辑态一致——Enter=保存并选中，Tab=直接创建子节点进编辑
      // 2026-08-30：Cmd+Enter 改为备注内换行（editSession 统一处理；原「保存并切 Minor」挪全局 Cmd+M）
      shiftEnter: () => {}, // Shift+Enter = 仅保存（finish 已执行）
      tab: () => addChild(),
      escape: () => { noteEl.textContent = node.note || ''; }
    },
    onFinish: (prevW, anchorBefore) => {
      // 2026-08-30 换行：editableText 保 \n（多行备注落盘 = 多个 `> ` 行）；trim 收首尾空白（含首尾空行）
      const nn = editableText(noteEl).trim();
      if (nn !== node.note) { pushUndo(); node.note = nn; emitUpdate(); }
      if (state.editingNoteId === node.id) state.editingNoteId = null; // 编辑结束：空备注行随后消失（2026-08-21 定）
      render(); // 无论改没改都 render：清掉「编辑中的空备注行」
      anchorByWidth(prevW, node.id, anchorBefore); // 2026-08-28：用锚点对齐，覆盖 render 后卡片相对 treeEl 位置变化
    }
  });
}
function startEditLink(node, linkEl) {
  // 编辑期间屏蔽跳转 / 再触发编辑，避免点进文字定位光标时误触发打开（2026-08-26）
  linkEl.onclick = e => e.stopPropagation();
  linkEl.ondblclick = e => e.stopPropagation();
  disarmProxy(); // 进真编辑态，proxy 让位
  const fl = parseFileLink(node.link);
  const ul = parseUrlLink(node.link);
  // 文件/URL 链接编辑时显示裸内容（不带 [[ ]]），更直观；节点链接显示 [[标题|ID]] 原文
  const shown = fl ? fl.path : (ul ? ul.url : node.link);
  const w0 = treeEl.offsetWidth; // 2026-08-28：文本替换发生在 freeze 之前 → 改树宽会 flex 推移，同步补偿（与 startEdit 同款）
  linkEl.textContent = shown;
  const w1 = treeEl.offsetWidth;
  if (w1 !== w0) { panX += (w1 - w0) / 2; applyTreeTransform(); drawEdges(); }
  const reset = () => { linkEl.textContent = shown; };
  editSession(linkEl, {
    suggest: true, // 链接编辑敲 [[ 弹文件建议（2026-08-29）
    newline: false, // 链接是单行语义：Cmd+Enter 被吞（不换行）、粘贴换行转空格（2026-08-30）
    keys: {
      escape: reset // 2026-08-24 修：Esc=放弃，恢复显示
    },
    onFinish: (prevW, anchorBefore) => {
      const raw = editableText(linkEl).replace(/\n+/g, ' ').trim(); // 换行兜底转空格（2026-08-30）
      let nv = node.link;
      if (/^\[\[.+\]\]$/.test(raw) || /^\[[^\]]*\]\((?:https?|ftp|mailto|file):[^)]+\)$/.test(raw)) {
        nv = raw; // 用户写了完整链接语法（wikilink 或标准 Markdown 链接）→ 原样存
      } else if (raw) {
        // 裸内容：文件路径 → [文件名](file:///…)；URL → [根域名](url)；其余 → 当 wikilink [[…]]
        const fp = detectFilePath(raw);
        const du = fp ? null : detectUrl(raw);
        if (fp) nv = '[' + (fp.split(/[\\/]/).pop() || fp) + '](file://' + fp + ')';
        else if (du) { const u = /^www\./i.test(du) ? 'https://' + du : du; nv = '[' + urlRootDisplay(u) + '](' + u + ')'; }
        else nv = '[[' + raw.replace(/^\[\[|\]\]$/g, '') + ']]';
      }
      if (nv !== node.link) pushUndo();
      node.link = nv;
      emitUpdate(); render();
      anchorByWidth(prevW, node.id, anchorBefore); // 2026-08-28：补锚点对齐（链接编辑结束原本没补偿，也有「移」bug）
    }
  });
}
function startEditById(id) {
  setTimeout(() => {
    const el = document.querySelector('.node-row[data-id="' + id + '"] .title');
    const r = findNode(state.tree, id);
    if (el && r) startEdit(r.node, el);
  }, 0);
}
function editNoteOfSelected() {
  if (state.historyMode) return; // 历史页只读：禁止编辑备注
  // 用局部变量锁定目标 id，避免流程中途 selectedId 变化导致备注写到别的节点（2026-08-21 修）
  const id = state.selectedId;
  if (!id) return;
  const r = findNode(state.tree, id);
  if (!r) return;
  const node = r.node;
  // 机制（2026-08-21 定）：一进编辑，文本层面就有备注这一行（即使内容为空也渲染行，光标稳定在竖条右边）；
  // 编辑完没文字 → 空备注行自动消失（finish 清 editingNoteId 后 render 不再渲染）
  if (!node.note) node.note = '';
  state.editingNoteId = id;
  emitUpdate(); render();
  const row = document.querySelector('.node-row[data-id="' + id + '"]');
  const noteEl = row && row.querySelector(':scope > .card .note > div'); // 编辑文字区（子 div），不是整行容器（2026-08-22 修）
  if (noteEl) startEditNote(node, noteEl);
}

// ===== 节点工具栏（飞书式黑底椭圆，选中节点时浮动显示；2026-08-21 定）=====
let nodeMenu = null;
function ensureNodeMenu() {
  if (nodeMenu) return nodeMenu;
  nodeMenu = document.createElement('div');
  nodeMenu.id = 'node-menu';
  nodeMenu.className = 'node-menu hidden';
  const items = [
    { act: 'bold', icon: 'bold', tip: T('nm.bold') },
    { act: 'red', icon: 'circle', tip: T('nm.red'), color: 'red' },
    { act: 'yellow', icon: 'circle', tip: T('nm.yellow'), color: 'yellow' },
    { act: 'note', icon: 'text-quote', tip: T('nm.note') },
    { act: 'now', icon: 'now', tip: T('nm.now') },
    { act: 'done', icon: 'squircle-dashed', tip: T('nm.minor') },
  ];
  items.forEach(it => {
    const b = document.createElement('button');
    if (it.color) b.classList.add('color-' + it.color);
    b.dataset.act = it.act;
    b.dataset.tip = it.tip;
    b.dataset.side = 'top'; // 底部 nodeMenu 按钮 → tooltip 向上浮动（用户 2026-08-21）
    // Now 按钮用自定义图标（白/蓝随选中节点状态），不走 ICONS 字典
    b.innerHTML = it.act === 'now' ? renderNowIcon('bottom') : renderIcon(it.icon, 18);
    b.onclick = e => {
      e.stopPropagation();
      // 编辑态点加粗 = 给选中文字插 **（不退出编辑、不 render）；其余按钮仍走节点级（2026-08-22）
      if (it.act === 'bold' && isEditingTitle()) { wrapSelectionInEdit('**'); return; }
      nodeMenuAction(it.act);
    };
    // 加粗按钮：编辑态下 mousedown 阻止焦点离开编辑框（否则点按钮 = blur = 编辑结束 + 选区丢失，加粗会落到整个节点）（2026-08-22）
    if (it.act === 'bold') {
      b.addEventListener('mousedown', e => { if (isEditingTitle()) e.preventDefault(); });
    }
    nodeMenu.appendChild(b);
    if (it.act === 'now' || it.act === 'done') applyProGate(b); // Pro 卡点：Now / Minor 按钮（2026-09-04）
  });
  // 注：nodeMenu 不再放"更多"按钮——左侧 toolbar 的 btn-more 已是三个点入口（2026-08-21 删）
  document.body.appendChild(nodeMenu);
  return nodeMenu;
}
function showNodeMenu() {
  if (state.historyMode) { hideNodeMenu(); return; } // 历史页只读：不显示节点编辑菜单
  const m = ensureNodeMenu();
  const multi = state.multiSelected.size > 0;
  if (!state.selectedId && !multi) { m.classList.add('hidden'); return; } // 没有任何选中 → 隐藏
  m.classList.remove('hidden');
  const btns = m.children;
  // 多选：隐藏备注按钮（不支持给多个节点写同一备注）；其余按钮（加粗/颜色/Minor）保留
  if (btns[3]) btns[3].style.display = multi ? 'none' : '';
  // on 状态反映：仅单选有意义（多选各节点状态不一，按钮保持中性）
  if (!multi) {
    const r = findNode(state.tree, state.selectedId);
    if (r) {
      const isBold = nodeIsBold(r.node);
      const isDone = nodeIsMinor(r.node);
      const isNow = nodeIsNow(r.node);
      const color = r.node.color || '';
      if (btns[0]) btns[0].classList.toggle('on', isBold);              // bold
      if (btns[1]) btns[1].classList.toggle('on', color === 'red');      // red
      if (btns[2]) btns[2].classList.toggle('on', color === 'yellow');   // yellow
      if (btns[3]) btns[3].classList.toggle('on', !!r.node.note);        // note：有备注时变蓝
      if (btns[4]) { btns[4].classList.toggle('on', isNow);              // now：已标记 Now 变蓝
        btns[4].innerHTML = renderNowIcon(isNow ? 'bottomOn' : 'bottom'); }
      if (btns[5]) btns[5].classList.toggle('on', isDone);               // done
    }
  } else {
    for (const b of btns) if (b.dataset.act !== 'note') b.classList.remove('on');
  }
}
function hideNodeMenu() { if (nodeMenu) nodeMenu.classList.add('hidden'); }
// 是否正在编辑标题：用状态标记（不用 document.activeElement——点加粗按钮那一刻焦点已跳到按钮上，会误判）
function isEditingTitle() {
  return !!state.editingTitleId;
}
// 编辑态选区加粗：给选中文字前后插 **，不退出编辑、不改 node.title（保存时统一生效）（2026-08-22）
// 加粗按钮只做一件事：给"当前选中范围"前后加 **（无选区 = 整个编辑框内容全部加粗）
function wrapSelectionInEdit(mark) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const el = state.editingTitleEl;
  if (!el || el.contentEditable !== 'true') return false;
  let range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return false;
  let text = range.toString();
  if (!text) {
    // 无选区（光标闪）→ 作用于整个编辑框内容（用户 2026-08-22：加粗按钮只做"选中范围前后加 **"）
    sel.removeAllRanges(); const rr = document.createRange(); rr.selectNodeContents(el); sel.addRange(rr);
    range = sel.getRangeAt(0); text = range.toString();
  }
  range.deleteContents();
  const tn = document.createTextNode(mark + text + mark);
  range.insertNode(tn);
  const r2 = document.createRange();
  r2.setStartAfter(tn); r2.collapse(true);
  sel.removeAllRanges(); sel.addRange(r2);
  return true;
}
function nodeMenuAction(act) {
  // 多选：作用于 multiSelected 全部节点；单选：作用于 selectedId
  const ids = state.multiSelected.size > 0 ? [...state.multiSelected] : (state.selectedId ? [state.selectedId] : []);
  if (!ids.length) return;
  const targets = ids.map(id => { const r = findNode(state.tree, id); return r ? r.node : null; }).filter(Boolean);
  if (!targets.length) return;
  // 备注：仅单选有意义（多选已隐藏按钮，且不支持多节点写同一备注）
  if (act === 'note') { editNoteOfSelected(); return; }
  pushUndo();
  if (act === 'bold' || act === 'done') {
    // 当所有目标都已处于该状态时整体取消，否则整体施加（多选各节点状态不一也统一处理）
    // v2（2026-08-29）：bold/minor 都是节点级字段（** 包裹 / minor:1 注释）；
    // 标题里的 _x_（斜体）与 ~~x~~（真删除线）是真实格式，不再是 Minor 标记、不动
    const isOn = n => act === 'bold' ? nodeIsBold(n) : nodeIsMinor(n);
    const allOn = targets.every(isOn);
    targets.forEach(n => {
      if (act === 'bold') {
        n.bold = allOn ? false : true;
        if (n.title) n.title = n.title.replace(/^\*\*(.+)\*\*$/, '$1'); // 防标题残留 ** 与字段双写
      } else {
        n.minor = allOn ? false : true;
      }
    });
    // 隐藏 Minor：选中节点变 Minor 且在隐藏模式下会被移除 → 画面会跳；
    // 先找一个存活邻居当锚点钉住，render 后把画面拉回原位（2026-08-26 位置刷新优化）
    let _anchorId = null;
    if (act === 'done' && targets.length === 1 && state.hideDone && nodeIsMinor(targets[0])) {
      _anchorId = findViewAnchorBeside(targets[0].id);
    }
    if (_anchorId) keepView({ id: _anchorId });
    emitUpdate(); render(); showNodeMenu();
    // 隐藏 Minor：仅单选提示（多选标记多个，toast 只说一个会误导）；节点消失给可撤销提示（2026-08-24 P1）
    if (act === 'done' && targets.length === 1 && state.hideDone && nodeIsMinor(targets[0])) {
      toastBelow(T('toast.hiddenMinor'), { label: T('common.undo'), fn: () => doUndo() });
    }
  } else if (act === 'red' || act === 'yellow') {
    const allOn = targets.every(n => (n.color || '') === act);
    targets.forEach(n => { n.color = allOn ? '' : act; });
    emitUpdate(); render(); showNodeMenu();
  } else if (act === 'now') {
    // Now 标记：选中节点 now 取反（多选各节点状态不一也统一处理）；纯节点级字段，落盘 <!--now:1-->
    const allOn = targets.every(n => nodeIsNow(n));
    targets.forEach(n => { n.now = allOn ? false : true; });
    if (state.showNow && allOn && nowVisibleSnapshot) nowVisibleSnapshot = computeNowVisible(currentRoot()); // 只看 Now 下取消 Now 标记：按当下重算快照 → 节点照旧瞬间隐藏（保留 2026-08-27 定的行为）
    emitUpdate(); render(); showNodeMenu();
    updateNowSideBtn(); // 标记后可能影响侧边按钮的置灰/图标态
    // 「只显示当前关注 Now」视图下：把某个 Now 取消 → 该节点从画面消失，给可撤销提示（类比隐藏次要 Minor；pushUndo 已在函数开头压栈，撤销可还原）
    if (state.showNow && targets.length === 1 && allOn) {
      toastBelow(T('toast.hiddenNow'), { label: T('common.undo'), fn: () => doUndo() });
    }
  }
}
function toggleDoneOfSelected() { nodeMenuAction('done'); }
function toggleNowOfSelected() { nodeMenuAction('now'); }

// 移动节点（拖拽，2026-08-22 重构：多选拖拽用 moveNodes 批量；单节点 = ids 长度 1 的特例）
// 本质=剪切+粘贴：先全部从原位置移除（保持顺序），再全部插入目标（保持顺序），只 pushUndo/emitUpdate/render 一次
function moveNodes(ids, targetId, before) {
  if (state.historyMode) return; // 历史页只读
  if (!ids || !ids.length) return;
  const valid = ids.filter(id => {
    if (id === targetId) return false;
    if (targetId !== 'root' && isDescendant(state.tree, id, targetId)) return false; // 目标在自己子树里 → 无效
    return true;
  });
  if (!valid.length) return;
  pushUndo();
  const moved = [];
  for (const id of valid) {
    const r = findNode(state.tree, id);
    if (!r || !r.parent) continue;
    moved.push(r.parent.children.splice(r.index, 1)[0]);
  }
  if (!moved.length) return;
  if (nowVisibleSnapshot) moved.forEach(function reg(x) { nowVisibleSnapshot.add(x.id); (x.children || []).forEach(reg); }); // 拖入的节点及子树注册进快照：拖进来就该看见（2026-08-28）
  if (targetId === 'root') {
    currentRoot().children.push(...moved);
  } else {
    const tgt = findNode(state.tree, targetId);
    if (!tgt || !tgt.parent) return;
    if (before === undefined) {
      tgt.node.children.push(...moved); // over：变成子节点
      // 不自动展开：拖到折叠节点时保持折叠（2026-08-24）；想看展开自己点折叠钮
    } else {
      const idx = tgt.parent.children.indexOf(tgt.node);
      if (before) tgt.parent.children.splice(idx, 0, ...moved);
      else tgt.parent.children.splice(idx + 1, 0, ...moved);
    }
  }
  emitUpdate(); render();
}
// 新建节点统一工厂（2026-08-27 体检精简：之前同一字面量复制 6 处，加字段容易漏拷——now 字段就是前车之鉴）
function makeNode(title, link) {
  const n = { id: genId(), title: title || '', note: '', images: [], embeds: [], link: link || '', fold: false, persistId: '', children: [] };
  if (nowVisibleSnapshot) nowVisibleSnapshot.add(n.id); // 只看 Now 快照模式下：新建节点注册进快照 → 保持可见（2026-08-28「按下后自由」）
  return n;
}
function addChild() {
  if (state.historyMode) return; // 历史页只读
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  const newNode = makeNode(T('common.newNode'));
  r.node.children.push(newNode);
  r.node.fold = false;
  if (state.showNow && nodeIsNow(r.node)) newNode.fold = true; // 只显示当前关注视图下：Now 的新子节点默认折叠，与既有 Now 子节点一致（2026-08-27 修）
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  emitUpdate(); render();
  startEditById(newNode.id);
}
function addSibling() {
  if (state.historyMode) return; // 历史页只读
  if (!state.selectedId || state.selectedId === currentRoot().id) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  const newNode = makeNode(T('common.newNode'));
  r.parent.children.splice(r.index + 1, 0, newNode);
  if (state.showNow && nodeIsNow(r.parent.node)) newNode.fold = true; // 同上：Now 的新同级子节点默认折叠
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  emitUpdate(); render();
  startEditById(newNode.id);
}
// ⬆️：在选中节点上方新建同级节点（计划依赖排序用）
function addSiblingAbove() {
  if (!state.selectedId || state.selectedId === currentRoot().id) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  const newNode = makeNode(T('common.newNode'));
  r.parent.children.splice(r.index, 0, newNode);
  if (state.showNow && nodeIsNow(r.parent.node)) newNode.fold = true; // 同上：Now 的新同级子节点默认折叠
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  emitUpdate(); render();
  startEditById(newNode.id);
}
// ←：在选中节点父节点的下方、与父节点同级新建节点（上探一层加兄弟）；父已是根则无更高层可加
function addParentSibling() {
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r || !r.parent) return;
  if (r.parent.id === currentRoot().id) return;
  const pr = findNode(state.tree, r.parent.id);
  pushUndo();
  const newNode = makeNode(T('common.newNode'));
  pr.parent.children.splice(pr.index + 1, 0, newNode);
  if (state.showNow && nodeIsNow(pr.parent.node)) newNode.fold = true; // 同上：Now 的新同级子节点默认折叠
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  emitUpdate(); render();
  startEditById(newNode.id);
}
// 选中集中某节点的祖先是否也在选中集（多选复制/删除时只取顶层节点，避免父子树重复）
function hasAncestorSelected(id) {
  let p = findNode(state.tree, id);
  p = p && p.parent;
  while (p) {
    if (state.multiSelected.has(p.id)) return true;
    p = findNode(state.tree, p.id);
    p = p && p.parent;
  }
  return false;
}
// 统计子树内（不含自身）Minor（done）节点数——隐藏 Minor 删除提醒用（2026-08-26）
function countMinorDescendants(node) {
  let n = 0;
  const isMinor = c => nodeIsMinor(c);
  (node.children || []).forEach(c => {
    if (isMinor(c)) n++;
    n += countMinorDescendants(c);
  });
  return n;
}
// 只显示当前关注视图下，若删到没有 Now 节点，自动退出 showNow：
// 否则画面会塌缩成只剩 root（看着像全删了），且此时按钮已置灰、用户无法手动恢复（2026-08-27 修）
function autoExitShowNowWhenEmpty() {
  // 「只看 Now」基于当前视图：当前视图（currentRoot 范围）没有 Now 节点 → 自动退出，画面恢复正常显示。
  // 【2026-08-31 反修】此前误改成查全树（state.tree）→ 下钻到无 now 标记的普通节点时该退不退，
  // showNow 持续开着但可见集又只按当前根算 → 塌缩/过滤失效一系列连锁问题。语义：当前视图没有就退出。
  if (state.showNow && collectNowNodes(currentRoot()).length === 0) setShowNow(false);
}
// 操作期间保持视图不动（2026-08-27 体检精简：deleteNode×2/cancelNewNode 三处同一套手写逻辑收口）：
// 记下滚动/平移 → fn 内 render → 还原，防 flex 重新居中把画面拽走；markUserTouched 阻止打开期自动重居中覆盖。
function preserveView(fn) {
  const sx = viewMap.scrollLeft, sy = viewMap.scrollTop, px = panX, py = panY;
  markUserTouched();
  fn();
  viewMap.scrollLeft = sx; viewMap.scrollTop = sy; panX = px; panY = py; applyTreeTransform();
}
// 多选删除/剪切共用：按树深度从深到浅逐个 splice（防 index 错乱）
function removeNodesDeepFirst(items) {
  items.sort((a, b) => depthOf(state.tree, b.node.id) - depthOf(state.tree, a.node.id));
  items.forEach(r => {
    const cur = findNode(state.tree, r.node.id);
    if (cur && cur.parent) cur.parent.children.splice(cur.index, 1);
  });
}
function deleteNode() {
  if (state.historyMode) return; // 历史页只读
  if (state.multiSelected.size > 0) {
    // 多选删除：只删顶层节点（祖先也在选中集的跳过，删父会连带子树）；按深度从深到浅删避免 index 错乱
    const items = [];
    state.multiSelected.forEach(id => {
      const r = findNode(state.tree, id);
      if (r && r.parent && r.node.id !== currentRoot().id && !hasAncestorSelected(id)) items.push(r);
    });
    if (!items.length) return; // 2026-08-24 修：无可删对象时不 pushUndo（之前空按 Delete 也压快照，污染撤销栈）
    let hiddenMinor = 0;
    if (state.hideDone) items.forEach(r => { hiddenMinor += countMinorDescendants(r.node); });
    pushUndo();
    preserveView(() => {
      removeNodesDeepFirst(items);
      state.multiSelected.clear();
      state.selectedId = null;
      emitUpdate(); render(); updateToolbar(); updateDefaultPathBtn();
    });
    autoExitShowNowWhenEmpty(); // 删到无 Now → 自动退出 showNow，避免画面塌缩成只剩 root
    if (hiddenMinor > 0) toastBelow(T('toast.hiddenAlsoDeleted', hiddenMinor), { label: T('common.undo'), fn: () => doUndo() });
    return;
  }
  if (!state.selectedId || state.selectedId === currentRoot().id) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r || !r.parent) return;
  const hiddenMinor = (state.hideDone && r.node) ? countMinorDescendants(r.node) : 0;
  pushUndo();
  preserveView(() => {
    r.parent.children.splice(r.index, 1);
    state.selectedId = null;
    emitUpdate(); render(); updateToolbar(); updateDefaultPathBtn();
  });
  autoExitShowNowWhenEmpty(); // 删到无 Now → 自动退出 showNow，避免画面塌缩成只剩 root
  if (hiddenMinor > 0) toastBelow(T('toast.hiddenAlsoDeleted', hiddenMinor), { label: T('common.undo'), fn: () => doUndo() });
}
// 取消刚新建的节点：仅作用于 justCreated 标记的节点（误触回车/方向键新建后，ESC 或清空回车取消）
// 删除后保持视图不动（与 Request 5 删除一致，2026-08-26）
function cancelNewNode(id) {
  const r = findNode(state.tree, id);
  if (!r || !r.parent) return false; // 根节点不可删
  pushUndo();
  preserveView(() => {
    r.parent.children.splice(r.index, 1);
    state.justCreated.delete(id);
    if (state.selectedId === id) state.selectedId = null;
    emitUpdate(); render(); updateToolbar(); updateDefaultPathBtn();
  });
  return true;
}
// （addRootBranch 已删：more-menu 里没有 add-root 按钮，死代码，2026-08-27 体检清理）

// 粘贴 [[链接]] → 在选中节点下新建一个「指向该节点的子节点」（链接原文保留，含 |id）
function addLinkChild(rawLink) {
  const m = rawLink.match(/\[\[(.+?)\]\]/);
  const target = m ? m[1].trim() : rawLink.trim();
  if (!target) return;
  if (!state.selectedId) { toast(T('toast.pasteLink'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  const newNode = makeNode('', '[[' + target + ']]');
  r.node.children.push(newNode);
  r.node.fold = false;
  state.selectedId = newNode.id;
  emitUpdate(); render(); updateToolbar();
}
// 粘贴文件路径 → 在选中节点下新建一个「指向该文件的子节点」（v2：[显示名](file:///绝对路径)，显示文件名）
function addFileLinkChild(path) {
  if (!path) return;
  if (!state.selectedId) { toast(T('toast.pasteFileLink'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  const name = path.split(/[\\/]/).pop() || path;
  const newNode = makeNode('', '[' + name + '](file://' + path + ')');
  r.node.children.push(newNode);
  r.node.fold = false;
  state.selectedId = newNode.id;
  emitUpdate(); render(); updateToolbar();
}
// 粘贴 URL → 在选中节点下新建一个「网页链接子节点」（v2：[根域名](url)，2026-08-29）
function addUrlLinkChild(url) {
  if (!url) return;
  if (!state.selectedId) { toast(T('toast.pasteLink'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  let u = url;
  if (/^www\./i.test(u)) u = 'https://' + u;
  pushUndo();
  const newNode = makeNode('', '[' + urlRootDisplay(u) + '](' + u + ')');
  r.node.children.push(newNode);
  r.node.fold = false;
  state.selectedId = newNode.id;
  emitUpdate(); render(); updateToolbar();
}

// 粘贴图片文本 `![](路径)` → 加到选中节点（可多张）
function addImageToNode(relPath) {
  if (!relPath) return;
  if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  r.node.images.push(relPath);
  emitUpdate(); render();
}

// 粘贴纯文本 → 按行拆成多个新子节点（外部复制的普通文字）
function addTextNodes(text) {
  if (!state.selectedId) { toast(T('toast.pasteFirst'), true); return; }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  lines.forEach(ln => {
    r.node.children.push(makeNode(ln.slice(0, 200)));
  });
  r.node.fold = false;
  state.selectedId = r.node.children[r.node.children.length - 1].id;
  emitUpdate(); render();
}

// 复制/剪切选中内容（Cmd+C / Cmd+X）——纯文本操作：
//   选中图片 → 复制/剪切 `![](路径)`；多选 → 复制所有选中节点（并列）；单选 → 复制整棵子树（去掉 ID、保留折叠）
function copySelectedNode() {
  if (state.selectedImg) {
    vscode.postMessage({ type: 'copyImage', text: '![[' + state.selectedImg.path + ']]' });
    return;
  }
  if (state.multiSelected.size > 0) {
    // 多选复制：只复制「顶层节点」（祖先也在选中集的跳过——父的子树已完整包含它，不重复）
    // 例：框选主节点+它的2个子节点 → 只复制主节点（含全部子节点）；框选父节点+父的同级 → 两个都复制（2026-08-21 定）
    // 2026-08-25：隐藏完成下框选复制，只复制未隐藏部分（done 子节点不进剪贴板）
    const parts = [];
    state.multiSelected.forEach(id => {
      if (hasAncestorSelected(id)) return;
      const r = findNode(state.tree, id);
      if (r) parts.push(serialize(r.node, 0, true, state.hideDone).trim());
    });
    if (parts.length) { vscode.postMessage({ type: 'copyNode', text: parts.join('\n') }); return; }
  }
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  vscode.postMessage({ type: 'copyNode', text: serialize(r.node, 0, true).trim() });
}
// 从选中节点移除选中的图片（Delete / Cmd+X 共用；copy=true 时先复制图片引用）。2026-08-31 抽出：
// 此前 Delete 分支直接 deleteNode() → 选中图片按删除会把整个节点删掉（硬性 bug）
function removeSelectedImage(copy) {
  const { nodeId, path } = state.selectedImg;
  const r = findNode(state.tree, nodeId);
  if (!r) { state.selectedImg = null; return; }
  if (copy) vscode.postMessage({ type: 'copyImage', text: '![[' + path + ']]' });
  pushUndo();
  r.node.images = (r.node.images || []).filter(p => p !== path);
  state.selectedImg = null;
  emitUpdate(); render();
}
function cutSelectedNode() {
  if (state.historyMode) return; // 历史页只读：禁止剪切
  if (state.selectedImg) {
    removeSelectedImage(true); // 剪切图片：复制 + 从节点移除该图
    return;
  }
  if (state.multiSelected.size > 0) {
    // 剪切多选：复制顶层节点（祖先在选中集的跳过），然后删除（同样只删顶层，按深度反序）
    const parts = [];
    const items = [];
    state.multiSelected.forEach(id => {
      if (hasAncestorSelected(id)) return;
      const r = findNode(state.tree, id);
      if (r && r.parent) items.push(r);
    });
    if (!items.length) return;
    items.forEach(r => parts.push(serialize(r.node, 0, true).trim()));
    vscode.postMessage({ type: 'copyNode', text: parts.join('\n') });
    pushUndo();
    removeNodesDeepFirst(items); // 按树深度从深到浅删，避免相互影响（与 deleteNode 多选共用）
    state.multiSelected.clear();
    state.selectedId = null;
    emitUpdate(); render(); updateToolbar(); updateDefaultPathBtn();
    return;
  }
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r || !r.parent) return;
  if (r.node.id === currentRoot().id) return; // 根不能剪切
  vscode.postMessage({ type: 'copyNode', text: serialize(r.node, 0, true).trim() });
  pushUndo();
  r.parent.children.splice(r.index, 1);
  state.selectedId = null;
  emitUpdate(); render(); updateToolbar(); updateDefaultPathBtn();
}
function depthOf(root, id) {
  let d = 0;
  function walk(n, dep) {
    if (n.id === id) { d = dep; return true; }
    for (const c of n.children || []) { if (walk(c, dep + 1)) return true; }
    return false;
  }
  walk(root, 0);
  return d;
}

// 按「0 缩进的列表行」切块：多选复制/多段大纲粘贴时拆成多个顶层节点
function splitTopLevel(text) {
  const lines = text.split('\n');
  const blocks = [];
  let cur = [];
  for (const ln of lines) {
    if (/^[-*+]\s/.test(ln) && cur.length) { blocks.push(cur.join('\n')); cur = []; }
    cur.push(ln);
  }
  if (cur.length) blocks.push(cur.join('\n'));
  return blocks.filter(b => b.trim());
}

// 粘贴节点文本（复制节点得到的整棵子树）→ 挂到选中节点下（文本操作：parse → 深拷贝 → serialize 重算缩进）
function addNodeFromText(text) {
  if (!text || !text.trim()) return;
  if (!state.selectedId) { toast(T('toast.pasteFirst'), true); return; }
  const blocks = splitTopLevel(text);
  if (!blocks.length) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  if (!r) return;
  let last = null;
  blocks.forEach(block => {
    const res = parse(block);
    const sub = res.root;
    const hasContent = sub.title || sub.note || (sub.images && sub.images.length) || sub.link || (sub.children && sub.children.length);
    if (!hasContent) return;
    const clone = cloneNode(sub); // 深拷贝：刷新 id、清空 persistId（副本独立，将来被复制链接再分配）
    r.node.children.push(clone);
    last = clone;
  });
  if (!last) return;
  r.node.fold = false;
  state.selectedId = last.id;
  emitUpdate(); render();
}
function cloneNode(n) {
  const c = {
    id: genId(),
    title: n.title || '',
    note: n.note || '',
    images: (n.images || []).slice(),
    embeds: (n.embeds || []).slice(), // v2：音视频嵌入（2026-08-29）
    link: n.link || '',
    fold: !!n.fold,
    persistId: '',
    color: n.color || '', // 2026-08-24 修：之前漏拷 color，复制/粘贴节点丢颜色标记
    bold: !!n.bold,   // v2：bold 是节点级字段，漏拷会丢加粗（2026-08-29）
    minor: !!n.minor, // v2：minor 是节点级字段（注释 minor:1），漏拷会丢 Minor（2026-08-29）
    now: !!n.now, // 2026-08-27 修：漏拷 now 会丢 Now 标记
    rawLines: (n.rawLines || []).slice(),
    children: (n.children || []).map(cloneNode)
  };
  if (nowVisibleSnapshot) nowVisibleSnapshot.add(c.id); // 同 makeNode：粘贴的子树整体注册进快照（2026-08-28）
  return c;
}

// ============ 右键菜单（节点 → 复制/剪切/复制链接；图片 → 复制图片） ============
let ctxMenu = null;
function hideCtx() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
function ctxItem(label, fn, icon, tip) {
  const it = document.createElement('div');
  it.className = 'ctx-item';
  if (icon) {
    const ic = document.createElement('span');
    ic.className = 'ctx-ic';
    ic.innerHTML = renderIcon(icon, 16);
    it.appendChild(ic);
  }
  const lb = document.createElement('span');
  lb.textContent = label;
  it.appendChild(lb);
  // 悬浮小黑框说明（2026-09-01）：复用 [data-tip] 机制，仅在传入 tip 时显示
  if (tip) { it.setAttribute('data-tip', tip); it.setAttribute('data-side', 'right'); }
  it.onclick = () => { fn(); hideCtx(); };
  return it;
}
function buildCtxMenu(x, y, node, mode, imgPath) {
  hideCtx();
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  if (mode === 'image') {
    ctxMenu.appendChild(ctxItem(T('ctx.copyImage'), () => {
      vscode.postMessage({ type: 'copyImage', text: '![[' + imgPath + ']]' });
    }));
  } else {
    // 进入当前节点（下钻，非当前根节点；2026-08-24 P1：末尾节点也允许进入——之前要 children.length，叶子点不了）
    if (node.id !== currentRoot().id) {
      ctxMenu.appendChild(ctxItem(T('ctx.drill'), () => drillInto(node.id), 'log-in'));
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      ctxMenu.appendChild(sep);
    }
    ctxMenu.appendChild(ctxItem(T('ctx.copyLink'), () => {
      // 复制链接 v2 跨文档定案（2026-08-29）：[[源文件名#pid]]——Obsidian 原生 wikilink 按名字不按路径，
      // 文件移动/改名自动跟随（不是硬链接）；粘贴回本文件时「文件名==当前文件」自动识别为同文件跳转（resolveNodeLink）
      if (!node.persistId) {
        node.persistId = genPersistId();
        pushUndo();
        emitUpdate(); // 把 ID 写回文件
      }
      vscode.postMessage({ type: 'copyLink', text: '[[' + (state.currentFilename || T('common.untitled')) + '#' + node.persistId + ']]' });
    }, 'link', T('ctx.copyLinkTip')));
    // 复制 AI 定位路径（2026-09-01）：把「文件完整绝对路径 + 节点 persistId」复制给 AI Agent，
    // 让 Agent 直接打开文件并搜索 id:<pid>（节点 ID 写在标题行尾 <!--id:xxx-->）定位到该节点。
    // 文本单行 + 【】外框（AI 按「1. 打开待编辑文档，路径：」「2. 节点 ID：」两步标签解析，空格/换行不影响识别）；
    // 同时懒注入 ai:/aiLocate: 进文件 frontmatter（每文件仅一次，见 main.js ensureAiLocate）。
    // Pro 卡点（2026-09-04）：未激活 → 悬浮仅图标变 ticket + 橙色、点击进激活弹窗（统一 applyProGate，不再用金色高亮）；isPro 来自 init 消息（试用中=true→不锁，试用结束未激活=false→锁）
    const aiLocateItem = ctxItem(T('ctx.copyAILocate'), () => {
      if (!node.persistId) {
        node.persistId = genPersistId();
        pushUndo();
        emitUpdate();
      }
      const p = state.filePath || (state.currentFilename || T('common.untitled'));
      const text = '【1. 打开待编辑文档，路径：' + p + '；2. 打开文档后，根据文档顶部的 frontmatter 提示和下文的节点 ID 定位到要编辑的节点，节点 ID 为：' + node.persistId + '】';
      vscode.postMessage({ type: 'copyLink', text });
      vscode.postMessage({ type: 'ensureAiLocate' });
      toast(T('toast.aiLocateCopied'));
    }, 'astroid', T('ctx.copyAILocateTip'));
    applyProGate(aiLocateItem); // 统一 Pro 卡点（2026-09-04）：未激活 → 悬浮变 ticket + 点击进激活弹窗
    ctxMenu.appendChild(aiLocateItem);
    const bookmarkItem = ctxItem(T('ctx.bookmark'), () => {
      // 保存为捷径：在数据文件同目录创建 <名字>.md（frontmatter 28notes: mmlink），点它即打开本文件并下钻到该节点
      if (!node.persistId) {
        node.persistId = genPersistId();
        pushUndo();
        emitUpdate(); // 分配持久 ID 写进文件（捷径指向的 ID 必须先落盘）
      }
      // 弹命名小框（2026-08-29 定）：浅字「不写默认为节点名」；宿主建捷径后自动跳到捷径文档
      showPrompt(T('ctx.bookmark'), T('ctx.bookmarkHint'), (val) => {
        vscode.postMessage({ type: 'createShortcut', pid: node.persistId, title: node.title || T('common.node'), name: (val || '').trim() });
      });
    }, 'split');
    applyProGate(bookmarkItem); // 保存为捷径：未激活同样走 Pro 卡点（2026-09-04）
    ctxMenu.appendChild(bookmarkItem);
    // 编辑链接：仅文件/URL 链接（[[file://...]] / [[https://...]]）显示；节点链接 [[标题|ID]] 指向本图节点、由节点系统管理，不在此编辑
    if (parseFileLink(node.link) || parseUrlLink(node.link)) {
      ctxMenu.appendChild(ctxItem(T('ctx.editLink'), () => {
        const row = document.querySelector('.node-row[data-id="' + node.id + '"]');
        const linkEl = row && row.querySelector(':scope > .card .link');
        startEditLink(node, linkEl || document.createElement('span'));
      }, 'file-pen'));
    }
  }
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  document.body.appendChild(ctxMenu);
}
document.addEventListener('contextmenu', e => {
  const card = e.target.closest ? e.target.closest('.card') : null;
  if (!card) { hideCtx(); return; }
  e.preventDefault();
  const r = findNode(state.tree, card.dataset.id);
  if (r) buildCtxMenu(e.clientX, e.clientY, r.node);
});
document.addEventListener('click', hideCtx);
document.addEventListener('scroll', hideCtx, true);

// ============ 粘贴：图片 → 存成文件挂到选中节点；[[链接]] → 新建指向子节点 ============
document.addEventListener('paste', e => {
  if (state.historyMode) return; // 历史页只读：禁止粘贴（粘贴会改结构，只在主视图允许）
  const cd = e.clipboardData;
  if (!cd) { wlog('paste: 没有 clipboardData'); return; }
  wlog('paste 触发：items=' + cd.items.length + ' 选中=' + (state.selectedId || '无'));
  const t = e.target;
  // 2026-08-28：typeProxy（快速编辑替换的隐藏 input）不算编辑态——armed 时 Cmd+V 应走节点粘贴，
  // 不能被「INPUT → editing=true → return」拦掉；且 preventDefault 阻止文本塞进隐藏 proxy 触发 flushProxy 替换标题
  const isProxy = t === typeProxy;
  if (isProxy) e.preventDefault();
  const editing = !isProxy && t && (t.contentEditable === 'true' || t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
  // 图片（复制/截图后直接粘贴）：优先从 items 找，兜底用 files
  let imgFile = null;
  for (const it of cd.items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) { imgFile = it.getAsFile(); break; }
  }
  if (!imgFile && cd.files && cd.files.length && cd.files[0].type.startsWith('image/')) imgFile = cd.files[0];
  if (imgFile) {
    e.preventDefault();
    if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
    const nodeId = state.selectedId; // 粘贴这一刻就钉住目标节点（存盘有来回，期间改选中也不挂错地方）
    wlog('检测到图片粘贴：' + imgFile.type + ' 大小=' + imgFile.size);
    const reader = new FileReader();
    reader.onload = () => {
      wlog('图片读取完成，dataUrl 长度=' + String(reader.result).length);
      vscode.postMessage({ type: 'pasteImg', dataUrl: String(reader.result), nodeId });
    };
    reader.onerror = () => wlog('图片读取失败: ' + reader.error);
    reader.readAsDataURL(imgFile);
    return;
  }
  // 文本：非编辑态 → 列表行整段作为节点粘贴；否则查图片文本 / [[链接]]（编辑态交给原生）
  if (editing) return;
  const text = cd.getData('text') || '';
  const nonEmpty = text.split('\n').map(l => l.trim()).filter(Boolean);
  const firstIsList = nonEmpty.length > 0 && /^[-*+]\s/.test(nonEmpty[0]);
  if (firstIsList) {
    e.preventDefault();
    addNodeFromText(text);
    return;
  }
  // 图片文本：v2 `![[文件名]]`（兼容 v1 `![](路径)`）→ 加到选中节点
  const wikiImgM = text.match(/^!\[\[([^\]]+)\]\]$/);
  if (wikiImgM) {
    e.preventDefault();
    addImageToNode(wikiImgM[1].trim());
    return;
  }
  const imgM = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (imgM) {
    e.preventDefault();
    addImageToNode(imgM[1]);
    return;
  }
  // 文件路径（裸路径或 [[file://...]]）→ 新建指向该文件的子节点（类似粘贴节点链接）
  const filePath = detectFilePath(text);
  if (filePath) {
    e.preventDefault();
    addFileLinkChild(filePath);
    return;
  }
  // 普通链接（http/https/ftp/mailto/www，含 [名](url) 与旧的 [[url]] 包裹）→ 新建链接子节点（点击浏览器打开）
  const url = detectUrl(text);
  if (url) {
    e.preventDefault();
    addUrlLinkChild(url);
    return;
  }
  if (/\[\[[^\]]+\]\]/.test(text)) {
    e.preventDefault();
    addLinkChild(text.match(/\[\[[^\]]+\]\]/)[0]);
    return;
  }
  // 纯文本（外部复制的普通文字）→ 按行拆成新子节点
  if (nonEmpty.length) {
    e.preventDefault();
    addTextNodes(text);
  }
});

// ============ 视图切换 ============
// 2026-08-30 定：视图切换入口全部去掉（顶部按钮删、更多菜单按钮删）→ 要文本视图就在文件上右键「以 Markdown 打开」
// switchView 函数本体保留（iframe 内 导图↔文本编辑框 的完整逻辑），但当前无 UI 入口
function switchView() {
  if (state.view === 'map') {
    // 内容没变就不重新赋值：保留 textarea 的原生撤销栈（之前每次切换清空导致不能撤销）
    const content = serializeFull(state.tree);
    if (mdEditor.value !== content) mdEditor.value = content;
    viewMap.classList.add('hidden');
    viewMd.classList.remove('hidden');
    state.view = 'md';
    mdEditor.focus();
  } else {
    // 文本视图里的直接改动也进撤销栈（2026-08-24 修：之前绕过 undo，Cmd+Z 撤不掉且会跳过这次改动）
    if (mdEditor.value !== serializeFull(state.tree)) pushUndo();
    const res = parse(mdEditor.value);
    state.tree = res.root;
    state.warnings = res.warnings;
    if (state.tree.title === '未命名' && state.currentFilename) state.tree.title = state.currentFilename;
    state.selectedId = null; state.currentRootId = null; state.currentRootPid = '';
    viewMd.classList.add('hidden');
    viewMap.classList.remove('hidden');
    state.view = 'map';
    render(); updateToolbar();
    emitUpdate();
  }
}

// ============ 快捷键 ============
// 画布快捷键（2026-08-30 重映射）：定位 Cmd+P（重复按循环）/ Now Cmd+N / Minor Cmd+M / 隐藏Minor Option+Cmd+M / 只显示Now Option+Cmd+N / 标红 Cmd+R / 标黄 Cmd+Y / 进入当前节点 Cmd+E / 折叠 Cmd+F。均在画布获得焦点时生效（Obsidian 同键位不冲突）。
document.addEventListener('keydown', (e) => {
  const t = e.target;
  // 历史页只读：Esc = 退出历史页；其余编辑类快捷键全部吞掉（不改动当前文档）
  if (state.historyMode) {
    // 历史页只读：state.tree 此时就是快照树；只放行复制等只读键，编辑类键全部吞掉。
    // Enter/空格阻止默认行为，防聚焦的历史按钮被隔空激活（误触退出/还原）。
    if (e.key === 'Escape') { e.preventDefault(); closeHistoryPanel(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelectedNode(); return; } // 复制节点到剪贴板（允许）
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation(); // 其余编辑键（Delete/Backspace/Tab/方向/Cmd+B/I/H/K 等）一律拦截
    return;
  }
  // 编辑态：只接管 Cmd+B（选区加粗，插 ** 不退出编辑）；其余让位浏览器原生（如 Cmd+Z 撤销文字）（2026-08-22 加）
  if (t && t.contentEditable === 'true') {
    if (menuEditOn) {
      // 子菜单条目编辑中（2026-09-11）：普通键就地消费（条目编辑框自理）；
      // Cmd/Ctrl 组合键落到下方画布快捷键（Cmd+M/N/B… 作用于选中节点 —— 鼠标被菜单占用时的操作手段）
      if (!(e.metaKey || e.ctrlKey)) return;
    } else {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); wrapSelectionInEdit('**'); }
      return;
    }
  }
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
    // 2026-08-28 快速编辑替换：armed proxy（隐藏 input 持焦点）时，打字键交给 proxy 走 IME 替换；
    // 功能键（Delete/方向/Enter/Cmd+C 等）disarm 后 fall through 走选中态逻辑。
    if (t === typeProxy && armedId) {
      const k = e.key;
      const isTypeable = k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
      // 2026-08-31 修：空格预览优先于「快速编辑替换」。选中了图片 / 预览已开时，空格必须 fall through
      // 到下方「空格预览」分支；否则 armProxy 把空格当打字的第一个字符吃掉 → 2026-08-26 加的空格预览
      // 在 2026-08-28 armProxy 之后彻底失效（选中图片必经 selectNode → armProxy → typeProxy.focus() 抢焦点）。
      if (k === ' ' && (state.selectedImg || isPreviewOpen())) disarmProxy(); // 空格预览 → fall through
      else if (isTypeable || e.isComposing) return;                           // 打字/组字 → proxy 接收
      else disarmProxy();                                                      // 功能键：解除 armed，走选中态逻辑
      // fall through（不 return）
    } else {
      return;
    }
  }
  if ((e.altKey) && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); const b = document.getElementById('btn-hide-done'); if (b && !b.disabled && !b.classList.contains('disabled')) setHideDone(!state.hideDone); return; } // Option+Cmd+M 隐藏/显示次要 Minor 节点（原 Cmd+H，2026-08-30）
  else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleDoneOfSelected(); return; } // Cmd+M 标记/取消 Minor（原 Cmd+Enter，2026-08-30）
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); nodeMenuAction('bold'); }  // Cmd+B：节点级加粗（2026-08-22 加，之前只有 tooltip 没实现）
  else if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); copySelectedNode(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'x') { e.preventDefault(); cutSelectedNode(); }
  else if (e.shiftKey && e.key === 'Enter') { e.preventDefault(); editNoteOfSelected(); }      // Shift+Enter：新建/编辑备注（2026-08-21 改）
  else if ((e.altKey) && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); const b = document.getElementById('btn-now-side'); if (b && !b.disabled) setShowNow(!state.showNow); return; } // Option+Cmd+N 只显示/显示所有当前关注 Now（2026-08-30）
  else if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); toggleNowOfSelected(); return; } // Cmd+N 标记/取消 Now（原 Cmd+I，2026-08-30）
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); nodeMenuAction('red'); return; }   // Cmd+R 节点标红（2026-08-30）
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); nodeMenuAction('yellow'); return; } // Cmd+Y 节点标黄（2026-08-30）
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); if (state.selectedId) drillInto(state.selectedId); return; } // Cmd+E 进入当前节点（下钻，2026-08-30）
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); const bl = document.getElementById('btn-locate'); if (bl) bl.click(); return; } // Cmd+P 定位循环（原 Cmd+K，2026-08-30）
  else if (e.key === 'Tab') { e.preventDefault(); addChild(); }
  else if (e.key === 'Enter') { e.preventDefault(); addSibling(); }
  else if (e.key === 'ArrowUp') { // ⬆️ 上方新建同级（预览打开时吞掉，避免误触）
    if (isPreviewOpen()) { e.preventDefault(); return; }
    e.preventDefault(); addSiblingAbove();
  }
  else if (e.key === 'ArrowDown') { // ↓ 同回车：下方新建同级（预览打开时吞掉）
    if (isPreviewOpen()) { e.preventDefault(); return; }
    e.preventDefault(); addSibling();
  }
  else if (e.key === 'ArrowLeft') { // ← 预览打开=上一张；否则上探一层加兄弟
    if (isPreviewOpen()) { e.preventDefault(); stepPreviewImage(-1); return; }
    e.preventDefault(); addParentSibling();
  }
  else if (e.key === 'ArrowRight') { // → 预览打开=下一张；否则同 Tab 新建子节点
    if (isPreviewOpen()) { e.preventDefault(); stepPreviewImage(1); return; }
    e.preventDefault(); addChild();
  }
  else if (e.key === 'Escape') { if (isPreviewOpen()) { e.preventDefault(); closeImagePreview(document.getElementById('img-preview')); } } // Esc 关闭预览
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    // 2026-08-31 修：选中了图片时，删除 = 删这张图（与 Cmd+X 剪切图片同逻辑），不该删掉整个节点
    if (state.selectedImg) removeSelectedImage();
    else deleteNode();
  }
  else if (e.key === ' ') { // 空格预览：打开↔关闭切换（对齐 macOS 桌面预览习惯，2026-08-26 改为可再按空格关闭）
    e.preventDefault();
    if (isPreviewOpen()) closeImagePreview(document.getElementById('img-preview'));
    else if (state.selectedImg) openImagePreview(state.selectedImg.path);
    else if (!spacePanHeld) { spacePanHeld = true; viewMap.classList.add('space-pan'); } // 空格按住 = 抓手平移模式（2026-08-31）
  }
  // （原 Cmd+K 定位已重映射为 Cmd+P，见上；本行留空避免重复绑定）
});

// ============ 与扩展通信 ============
function emitUpdate() {
  if (state.historyMode) return; // 历史页只读：任何写回当前文档的操作都被禁止
  vscode.postMessage({ type: 'update', text: serialize(state.tree) });
  autoSnapshot(); // 每次变更后尝试自动快照（内部节流）
}
// 自动快照（2026-08-27）：内容真变了才存，且 2 分钟内最多一次，避免快照爆炸。
// 手动命名存档（manualSaveSnapshot）也走这里并标记，保证"手动存完不会立刻又自动存一份相同内容"。
const AUTO_SNAP_INTERVAL = 2 * 60 * 1000;
let lastAutoSnap = 0;
let lastAutoSnapText = ''; // 上次落盘快照的文本，用于"内容没变就不存"
function autoSnapshot(force) {
  if (state.historyMode) return; // 历史页只读：不自动存快照（避免存下"快照的快照"）
  const text = serialize(state.tree);
  if (!force) {
    if (text === lastAutoSnapText) return;        // 内容没变 → 不存
    const now = Date.now();
    if (now - lastAutoSnap < AUTO_SNAP_INTERVAL) return; // 2 分钟内 → 不存
  }
  lastAutoSnap = Date.now();
  lastAutoSnapText = text;
  vscode.postMessage({ type: 'saveSnapshot', text: text, name: '' }); // 空 name = 自动保存
}
// 收到扩展发来的外部文本（init / 其它面板的 sync）：重建树、只刷新显示，绝不写回（防回环）
// 编辑期间被延迟的外部更新（见 applyIncoming 的 B9 守卫）
let pendingIncoming = null;
function flushPendingIncoming() {
  if (!pendingIncoming) return;
  const p = pendingIncoming; pendingIncoming = null;
  applyIncoming(p.text, p.opts);
}
function applyIncoming(text, opts) {
  // 2026-08-27 体检修（B9）：编辑打字途中收到 sync/init 不立即重建——会把正在输入的编辑框静默销毁。
  // 延迟到编辑结束（editSession finish 里 flushPendingIncoming）再应用。首次加载（tree 为空）不拦。
  if (state.editingEl && state.tree) { pendingIncoming = { text, opts }; return; }
  opts = opts || {};
  const res = parse(text);
  state.tree = res.root;
  state.warnings = res.warnings;
  if (opts.filename !== undefined) state.currentFilename = opts.filename;
  if (opts.filePath !== undefined) state.filePath = opts.filePath; // 完整绝对路径（复制 AI 定位路径用）
  if (state.tree.title === '未命名' && state.currentFilename) state.tree.title = state.currentFilename;
  reconcileSelection(); // 2026-08-24：外部文本重 parse 后旧 id 全部失效，统一校验
  if (opts.drillPid) {
    // 首次打开 mmlink 带下钻 pid：记录 pid + 下钻到目标（pid 先清洗，见 normPid 注释）
    const drill = normPid(opts.drillPid), defPid = normPid(opts.defaultPid);
    state.currentRootPid = drill;
    let target = findByPersistId(state.tree, drill);
    // 捷径：首选下钻位置（陈旧会话记忆）失效时，回退到捷径自身 node（2026-08-31 修：否则陈旧会话 pid 误判"节点已删"反复提示）
    if (!target && opts.isLink && defPid) {
      const bt = findByPersistId(state.tree, defPid);
      if (bt) { target = bt; state.currentRootPid = defPid; }
    }
    if (target && target.id !== state.tree.id) state.currentRootId = target.id;
    else { state.currentRootId = null; state.currentRootPid = ''; } // 节点被删/不存在 → 回主节点；pid 必须清掉，否则死 pid 会被 persistNow 回写进保存视图，下次打开又按它下钻 → 反复误报（2026-08-31 修）
    // mmlink 指向的节点已被删除：提醒用户并（上面已）重定位至主节点（仅捷径场景，普通思维导图笔记默认路径失效不提示）
    if (opts.isLink && !target) {
      // 竞态重试（2026-08-31 根治）：新建捷径时新 pid 异步落盘目标文件、宿主立即建捷径并跳转打开，
      // 首次打开读到旧内容 → 误判失效。先让宿主延时重读一次再发 init；重试后仍找不到才是真失效（提示+自愈）。
      if (!state.bookmarkHealed && !state.bookmarkRetried) {
        state.bookmarkRetried = true;
        vscode.postMessage({ type: 'reloadBookmark' });
      } else {
        toast(T('toast.bookmarkRelocated'), true);
        console.log('[Shin MindMap] 捷径重定位(重试后仍失效): ' + (state.currentFilename || '') + ' drill=' + encodeURIComponent(opts.drillPid || ''));
        // 2026-08-31 定：首次提示后自动把捷径链接更新为「重定位到的主节点」，后续打开不再反复提示。
        // 本会话只修一次，避免重复写盘；下次打开捷径已指向有效节点（主节点），自然不再弹。
        if (!state.bookmarkHealed) {
          state.bookmarkHealed = true;
          // 自愈：把捷径链接重定位到主节点（node 清空），宿主端真正改写捷径文件 frontmatter，
          // 后续打开即指向有效节点，天然不再提示。deadPid 随消息传宿主做二次确认（写盘竞态误判时取消自愈）。
          vscode.postMessage({ type: 'saveAsCurrent', pid: '', deadPid: drill });
        }
      }
    }
  } else if (state.currentRootPid) {
    // 刷新（无 drillPid）：按记住的 pid 还原下钻，防"用着用着跳回全局"（2026-08-24 修，根因是重 parse 后内存 id 变了 currentRootId 失效）
    // 2026-08-31 修（捷径串到别的节点）：多个捷径共享同一目标文件 → 共用 iframe；无 node 的捷径（被自愈/未设置）
    // 语义是回主节点，若此时走「残留 currentRootPid 还原」会沿用上个捷径的下钻位置 → 打开今日计划却显示本周计划。
    if (opts.isLink && !opts.defaultPid) { state.currentRootId = null; state.currentRootPid = ''; }
    else {
      state.currentRootPid = normPid(state.currentRootPid);
      const target = state.currentRootPid ? findByPersistId(state.tree, state.currentRootPid) : null;
      if (target && target.id !== state.tree.id) state.currentRootId = target.id;
      else { state.currentRootId = null; state.currentRootPid = ''; } // pid 没了（节点被删）→ 回根
    }
  }
  if (state.view === 'map') { render(); updateToolbar(); }
  else if (document.activeElement !== mdEditor) mdEditor.value = serializeFull(state.tree); // 文本视图：没在编辑才覆盖
}
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'flushView') { // 宿主 rebind 重建 iframe 前同步调用：把当前 view 立即落盘（防 schedulePersist 去抖未执行就随 iframe 销毁丢失，2026-09-01 修源思维导图切走丢位置）
    persistNow();
    return;
  }
  if (msg.type === 'foldBarRun') {
    const fn = foldBarClicks[msg.lvl];
    if (fn) fn();
    return;
  }
  if (msg.type === 'requestFoldBar') { // 宿主激活本视图时请求重发最新状态（修「折叠数字有几率不出现」，2026-08-31）
    updateFoldBar();
    return;
  }
  if (msg.type === 'setTheme') { // 设置页切换主题 → 宿主推送到所有打开的视图（即时生效，2026-08-31）
    applyTheme(msg.value);
    return;
  }
  if (msg.type === 'setHideHint') { // 设置页切换「隐藏新增页面提示」→ 即时生效（2026-09-01）
    state.hideHint = !!msg.value;
    render();
    return;
  }
  if (msg.type === 'switchView') { // 顶部视图切换按钮点击
    switchView();
    return;
  }
  if (msg.type === 'returnToDefault') { // 顶部路径链接按钮点击 = 返回默认路径（2026-08-30）
    returnToDefault();
    return;
  }
  if (msg.type === 'foldBarHover') {
    // 状态栏按钮 hover：与原 hover 子菜单同源（highlightLevel / highlightSelLevel）
    const fn = foldBarHoverFns[msg.lvl];
    if (fn) fn();
    return;
  }
  if (msg.type === 'foldBarHoverEnd') {
    clearLevelHighlight();
    return;
  }
  if (msg.type === 'files') {
    // [[ 建议用的 vault 文件清单（宿主回送）：更新缓存；编辑中的建议器立即刷新
    wikiFileCache = { ts: Date.now(), files: Array.isArray(msg.files) ? msg.files : [] };
    if (activeSuggest) activeSuggest.refresh();
    return;
  }
  if (msg.type === 'pasteImgRes') {
    // 粘贴的图片已存盘：加到「粘贴时钉住」的节点（不是存完那一刻的选中）
    if (msg.filename) {
      const r = findNode(state.tree, msg.nodeId);
      if (r) {
        pushUndo();
        r.node.images.push(msg.filename);
        emitUpdate(); render();
      } else {
        toast(T('toast.imgSavedNoNode'), true);
      }
    } else {
      toast(T('toast.imgSaveFail'), true);
    }
    return;
  }
  if (msg.type === 'imgUriRes') {
    // 资源可访问地址返回：填到对应元素上（img/video/audio 通用），并缓存
    document.querySelectorAll('[data-req="' + msg.id + '"]').forEach(im => {
      if (msg.uri) { im.src = msg.uri; imgUriCache[im.dataset.path] = msg.uri; }
      else { im.classList.add('img-missing'); }
    });
    return;
  }
  if (msg.type === 'licenseUpdate') {
    state.isPro = !!msg.isPro; // 付费状态实时更新（host 的 licenseState 变化后推送；hover/click 实时读它，锁立刻跟变）
    if (typeof msg.licenseSource === 'string') state.licenseSource = msg.licenseSource;
    updateProCta();
    return;
  }
  if (msg.type === 'init') {
    // 2026-09-01 修捷径串状态（共用 iframe 场景）：切换视图前先落盘当前 view 到当前 savedViewKey，
    // 防 B init 改 savedViewKey + reset 模块级 view 后，A 的 view 丢失或被延迟 persist 存到 B 的 key。
    // 首次 init（booted=false）不存；rebind 重建的新 iframe booted=false 也不存（靠 rebindIfNeeded 的 __MM_FLUSH__）。
    if (booted && savedViewKey) {
      persistNow();
      vscode.postMessage({ type: 'log', text: 'init pre-flush: key=' + savedViewKey });
    }
    // 记住临时状态（2026-08-25 v3）：从扩展回送的 msg.view 取（扩展进程内存 Map，按文档 URI，切页重建不丢）。
    // 不再用 webview 的 getState——切标签页时 webview 被销毁重建，getState 跟着清空，之前两版都因此失效。
    savedViewKey = msg.viewKey || ''; // 锁定本次视图的存储 key（不随视图对象复用 this.file 变化——捷径/源图串状态根因）
    // 2026-09-01 修共用 iframe（捷径同 target）时 A 的 view 残留到 B：立即 reset 模块级 view。
    // hasSavedView=true 会被下方 saved 覆盖；false 走 locateCenter。rebuild 新 iframe 本就是 0，无副作用。
    zoom = 1; panX = 0; panY = 0;
    viewMap.scrollLeft = 0; viewMap.scrollTop = 0;
    applyTreeTransform();
    const saved = (msg.view && typeof msg.view === 'object') ? msg.view : null;
    const hasSavedView = !!(saved && typeof saved.zoom === 'number');
    // 下钻 pid：本次会话有临时态 → 优先还原临时路径；否则（重启/新开）→ 用存储的默认路径（defaultPid），其次快捷方式 drillPid。
    // 之前 bug：drillPid 只取 msg.drillPid（快捷方式消费值），没用 msg.defaultPid → 普通思维导图笔记重启后不回默认路径。
    let drillPid = '';
    if (hasSavedView && saved.currentRootPid) drillPid = saved.currentRootPid;
    else drillPid = msg.drillPid || msg.defaultPid || '';
    vscode.postMessage({ type: 'log', text: 'build 2026-09-01a init: ' + (msg.filename || '') + ' hasView=' + hasSavedView + ' drill=' + (drillPid || '(无)') + ' savedPid=' + ((saved && saved.currentRootPid) || '(无)') + ' node=' + (msg.defaultPid || '(无)') + ' isLink=' + !!msg.isLink }); // 版本标记 + 视图记忆/下钻来源诊断（走宿主 log 通道，iframe 直连 console 在 Obsidian 不显示）
    booted = false; // 还原期间关闭写穿门闩：程序滚动不写回，避免覆盖刚还原的值
    // 2026-08-30 修"开屏先渲染到别处再移回"：render 前隐藏视图，layoutSettled 定好位再显示
    viewMap.style.opacity = '0';
    // 快捷方式打开：init 里带 drillPid → 直接下钻到该节点；渲染后内容自动居中到视口中央
    applyIncoming(msg.text, { filename: msg.filename || '', filePath: msg.filePath || '', drillPid: drillPid, isLink: !!msg.isLink, defaultPid: msg.defaultPid || '' }); // filePath：init 必须透传，否则 state.filePath 空 → 复制 AI 定位路径只剩文件名（2026-09-01 修）
    applyTheme(msg.theme || 'default'); // 主题随 init 下发（2026-08-31）
    state.hideHint = !!msg.hideHint; // 空图新手提示是否隐藏随 init 下发（2026-09-01）
    state.isLink = !!msg.isLink;
    state.isPro = !!msg.isPro; // 是否 Pro（2026-09-04：= licenseState.active，功能权限；试用期内也为 true → 功能不锁）
    state.licenseSource = msg.licenseSource || 'none'; // 'license'=已购买；'trial'/'none'=未购买 → 右上角"激活 Pro"提示按钮显示条件
    updateProCta();
    state.defaultPid = normPid(msg.defaultPid); // 保存的默认路径 pid（.mmlink=文件内 mmlinkPid / 普通思维导图笔记=workspaceState）
    // 隐藏完成状态按文件恢复（2026-08-24 P1）：persist=false 不回写，避免 init 时和扩展互相 ping-pong
    if (typeof msg.hideDone === 'boolean') setHideDone(msg.hideDone, false);
    // 只显示「当前关注 Now」节点：按文件恢复（2026-08-27），persist=false 不回写
    if (typeof msg.showNow === 'boolean') setShowNow(msg.showNow, false);
    // 开屏兜底：恢复成「开」但文档根本无 Now 节点 → 自动退出，避免画面塌缩成只剩 root
    // （与删除触同源；autoExit 用 persist=true 会顺手清掉 workspaceState 里坏掉的 showNow:true）
    autoExitShowNowWhenEmpty(); updateNowSideBtn();
    // 调试开关状态恢复（fab → 调试界面 控制右上角刷新按钮显隐；2026-08-21 定）。debugMode 由扩展经 view 回送。
    debugMode = !!(saved && saved.debugMode);
    const rf0 = document.getElementById('btn-refresh');
    if (rf0) rf0.classList.toggle('hidden', !debugMode);
    // 恢复 / 默认 视图
    if (hasSavedView) {
      // 复用上次：缩放/平移先用 transform 还原，滚动在布局稳定后还原（render 后才算准）
      zoom = saved.zoom; panX = saved.panX; panY = saved.panY;
      applyTreeTransform();
    } else {
      // 默认：重置滚动到画布起点，稍后居中
      viewMap.scrollLeft = 0; viewMap.scrollTop = 0;
    }
    // 等布局（图片/字体异步加载）真正稳定再定滚动位置，否则 reflow 让还原位置漂移（之前「默认有时偏中心」根因之一）
    // 2026-08-30 揭幕：render 前 opacity:0，等"首帧布局稳定并定位完"再显示（见 startInitCenter 的 onSettled）
    const reveal = () => { viewMap.style.opacity = ''; };
    layoutSettled(() => {
      try {
        if (hasSavedView) {
          // 用保存的滚动还原（不自动居中，尊重上次位置）；先 updateCanvas 确保滚动范围正确
          updateCanvas();
          viewMap.scrollLeft = saved.scrollLeft || 0;
          viewMap.scrollTop = saved.scrollTop || 0;
          drawEdges();
        } else {
          // 2026-08-29：开屏智能定位（定位按钮同款），不再整画布居中（大树会飘走）；
          // 带下钻（捷径/默认路径）时 goTo 已定位过一次，这里同款定位幂等不冲突
          // 2026-09-01：先 updateCanvas 确保画布尺寸是字体 ready 后的，否则 locateCenter 算的 scroll 目标被 clamp → 树跑右下角
          updateCanvas();
          locateCenter();
        }
        startInitCenter(hasSavedView, reveal); // 复用则只重画曲线不居中，避免覆盖用户位置
        seedPathHistory(state.currentRootPid); // 路径历史栈起点
        updateDefaultPathBtn();
        updateUndoRedo();
        booted = true; // 还原完成，之后用户操作才写回
      } catch (e) {
        reveal(); // 出错也必须显示，绝不 opacity:0 白屏（位置不准总比白屏好）
        booted = true; // 2026-09-01 修「切走再回永远回中央」：还原抛异常时 booted 若卡死在 false，
        // persistNow/schedulePersist 整个会话静默不写 → 视图状态从不保存 → 下次打开永远走无记忆居中
        try { vscode.postMessage({ type: 'log', text: 'init 还原异常（booted 已兜底置 true）: ' + (e && e.message ? e.message : e) }); } catch (_) {}
        throw e;
      }
    });
    // 2026-09-01 兜底：layoutSettled 的回调因任何原因没跑到 booted=true（异常被吞/环境怪异），
    // 3 秒后强制开门闩——门闩卡死 = 视图状态永不保存 = 每次切回都丢位置，比"过早写"危害大得多
    setTimeout(() => { if (!booted) { booted = true; reveal(); try { vscode.postMessage({ type: 'log', text: 'init 门闩兜底：3 秒未到 booted=true，强制放开' }); } catch (_) {} } }, 3000);
    return;
  }
  if (msg.type === 'sync') {
    // 同一文件的另一个面板改了内容：只刷新显示，不写回（防回环）
    applyIncoming(msg.text);
    return;
  }
  if (msg.type === 'snapshotSaved') {
    // 自动/手动保存快照成功：静默即可
    return;
  }
  if (msg.type === 'snapshotsListed') {
    state.historyList = msg.snapshots || [];
    if (pendingAutoLoadFirst && state.historyList.length) {
      pendingAutoLoadFirst = false;
      vscode.postMessage({ type: 'loadSnapshot', timestamp: state.historyList[0].timestamp }); // 默认进最新一条
    } else {
      pendingAutoLoadFirst = false;
      renderHistoryPanel();
    }
    return;
  }
  if (msg.type === 'snapshotLoaded') {
    // 加载某个快照进入历史页：历史页 = 只读文档（state.tree 直接指向快照树，不再临时交换）
    // 2026-08-28 修（历史页切快照 → 退出后当前文档被覆盖成某条历史版本）：
    // 原来无条件 state.liveTree = state.tree —— 历史页内点另一条快照会再次收到 snapshotLoaded，
    // 此时 state.tree 已是上一条快照树，实时文档树被覆盖丢失；退出历史页时 state.tree = liveTree
    // （=上一条快照树），之后任何一次编辑写回 = 整个文件被覆盖成那条历史版本（autoSnapshot 也会
    // 把错树存进历史列表，时间线上看起来内容乱跳）。
    // liveTree 只在「首次进入历史页」时暂存一次，页内切快照绝不动它。
    // 判断用 liveTree 是否为空（closeHistoryPanel 会置回 null）——不能用 historyMode：
    // openHistoryPanel 在等列表回包前就已把 historyMode 置 true，收到 snapshotLoaded 时
    // 恒为 true，用它判断会导致 liveTree 从未暂存 → 差异基线为 null → 所有节点全标红（2026-08-28 回归，当日修）。
    if (!state.liveTree) state.liveTree = state.tree; // 暂存真实文档树（差异基线 + 关闭时还原）
    state.historyMode = true;
    state.historyText = msg.text || '';
    state.historyCurrentTs = msg.timestamp || 0;
    const res = parse(state.historyText);
    state.historyTree = res.root;
    state.tree = state.historyTree;        // 历史页期间 state.tree 即快照树：render/折叠/框选/复制都复用同一套逻辑
    state.selectedId = null;
    state.multiSelected = new Set();
    computeHistoryDiff();                  // 差异基线用 liveTree
    renderHistoryPanel();
    renderHistoryTree(true); // 进入快照：把第一个差异节点居中，避免画布乱飘
    updateToolbar();
    return;
  }
  if (msg.type === 'snapshotRestored') {
    // 扩展已写回文件并回带新文本：用 applyIncoming 重建当前文档树（防回环，不写回）
    if (msg.text) applyIncoming(msg.text);
    state.liveTree = state.tree; // 还原后「实时文档」即新内容，closeHistoryPanel 据此还原而非旧的 liveTree
    closeHistoryPanel();
    toast(T('toast.restored'));
    return;
  }
  if (msg.type === 'snapshotCopyCreated') {
    toast(T('toast.copyCreated', msg.path ? msg.path.split(/[\\/]/).pop() : ''));
    return;
  }
});
// ============ 历史记录页（2026-08-27） ============
// 机制：
//  - 点击「历史记录」→ 扩展列出 附件/.history/ 下的快照 → 选一条 → 进入只读历史页（飞书式：左侧导图 + 右侧时间线）。
//  - 历史页不能编辑文字，但可以展开/折叠、复制单个节点。
//  - 「只看差异」（红钮）：按「位置+标题结构」比对当前文档与该快照，不同的节点标红，相同且非差异祖先的子树折叠压缩。
//  - 差异比对只用位置+标题结构，不用 persistId（绝大多数节点平时无 id，见 commentFor）。

// 节点特征（用于位置+结构比对）：标题 + 是否为纯链接 + 图片张数 + 备注。
function nodeSig(n) {
  return JSON.stringify({
    t: n.title || '',
    l: n.link || '',
    i: (n.images || []).length,
    n: n.note || ''
  });
}
// 计算差异：前序遍历同时走「当前树」「历史树」同一位置，特征不同 → 该历史节点标红。
// 返回 Set（历史节点 id）。忽略「当前有、历史没有」的情况（2026-08-27 定：只标红历史中与当前不同的）。
function computeHistoryDiff() {
  const diff = new Set();
  if (!state.historyTree) return diff;
  const cur = state.liveTree; // 当前文档根（进入历史页时暂存，state.tree 此时已指向快照树）
  const his = state.historyTree; // 快照根
  function walk(c, h) {
    if (!h) return; // 历史无此位置 → 不标红（属于"当前有、历史没有"，忽略）
    const same = c && nodeSig(c) === nodeSig(h);
    if (!same) diff.add(h.id); // 此位置特征不同（或当前无）→ 历史该节点标红
    // 往下比较：以历史树结构为准展开（保证历史中存在的节点都能被比对/标红）
    const cKids = (c && c.children) || [];
    h.children.forEach((hc, i) => walk(cKids[i], hc));
  }
  walk(cur, his);
  state.historyDiffIds = diff;
  return diff;
}

// 历史页渲染：复用编辑视图 render()（保留连线/缩放/滚动/卡片样式），不另写一棵树。
// 做法：临时把 state.tree 换成快照树 → render() → 恢复。差异标红 / 只看差异折叠都作用在快照树上。
// 「只看差异」：画面只留下差异节点（红卡片）本身，差异节点下「没有差异的子分支」也收起，
// 差异节点之间的祖先路径保持展开以连接它们。每次调用前先全展开，避免上次残留折叠影响。
function applyDiffOnlyFold(root) {
  (function reset(n) { n.fold = false; (n.children || []).forEach(reset); })(root);
  function hasDiff(n) {
    if (state.historyDiffIds.has(n.id)) return true;
    return (n.children || []).some(hasDiff);
  }
  (function walk(n) {
    if (!n.children || !n.children.length) return;
    const selfDiff = state.historyDiffIds.has(n.id);
    const subtreeHasDiff = selfDiff || n.children.some(hasDiff);
    if (!subtreeHasDiff) { n.fold = true; return; } // 整棵子树无差异 → 折叠（连自身都不显眼）
    // 子树有差异：本节点展开；无差异的子分支折叠，有差异的子分支继续递归
    n.children.forEach(c => { if (!hasDiff(c)) c.fold = true; else walk(c); });
  })(root);
  if (root.fold) root.fold = false; // 兜底：若全树无差异被整体折叠，至少展开根避免空白
}

// 历史页：取「第一个差异节点」（前序遍历第一个命中 historyDiffIds 的节点），用于进入快照时居中，避免画布乱飘
function firstDiffNode() {
  if (!state.historyTree || !state.historyDiffIds.size) return null;
  let found = null;
  (function walk(n) {
    if (found || !n) return;
    if (state.historyDiffIds.has(n.id)) { found = n; return; }
    (n.children || []).forEach(walk);
  })(state.historyTree);
  return found;
}
// 历史页：把第一个差异节点放到视口左侧 1/4、垂直居中（复用定位调参 --locate-*），解决「切快照画布不知道渲染到哪」
function centerHistoryOnFirstDiff() {
  const node = firstDiffNode();
  if (!node) return; // 无差异则不强制居中
  const el = document.querySelector('.node-row[data-id="' + node.id + '"] .card');
  if (!el) return;
  placeCardAtViewport(el, cfgNum('--locate-first-x', 0.25));
}
function renderHistoryTree(centerFirstDiff) {
  if (!state.historyTree) return;
  // 历史页模型：state.tree 此时已指向快照树（进入时一次性交换，关闭时还原）。
  // 这里直接 render，不再临时交换——折叠/框选/复制等交互都复用实时视图同一套逻辑。
  state.selectedId = null;               // 历史页无选中高亮
  state.multiSelected = new Set();
  render();                              // 完全复用：连线、缩放、平移、卡片样式
  // 差异标红：给差异节点卡片加 hist-diff 类（render 重建了 DOM，标红在 render 后做）
  if (state.historyDiffIds.size) {
    document.querySelectorAll('#tree .card').forEach(c => {
      if (state.historyDiffIds.has(c.dataset.id)) c.classList.add('hist-diff');
    });
  }
  if (centerFirstDiff) centerHistoryOnFirstDiff(); // 进入/切换快照时把第一个差异节点居中，避免画布乱飘
}

// 历史页时间线日期/时间格式化（2026-08-27 优化）：
// - 时间只显示「时:分」，不显示秒
// - 日期：3 分钟内→刚刚；当天→今天；昨天→昨天；今年内→M 月 D 日；往年→YYYY 年 M 月 D 日
function fmtHistoryDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const pad = n => (n < 10 ? '0' + n : '' + n);
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const sameYear = d.getFullYear() === now.getFullYear();
  // 2026-08-28：「刚刚」也带上具体时间——顶部几条密集自动快照若只显示「刚刚」无从核对先后，
  // 排序按 timestamp 降序，画面看着像乱了其实没乱。
  if (now.getTime() - ts < 3 * 60 * 1000) return T('hist.justNow', d.getHours() + ':' + pad(d.getMinutes()));
  let datePart;
  if (dayDiff === 0) datePart = T('hist.today');
  else if (dayDiff === 1) datePart = T('hist.yesterday');
  else if (sameYear) datePart = T('hist.dateMD', d.getMonth() + 1, d.getDate());
  else datePart = T('hist.dateYMD', d.getFullYear(), d.getMonth() + 1, d.getDate());
  return datePart + ' ' + d.getHours() + ':' + pad(d.getMinutes());
}

function renderHistoryPanel() {
  const view = document.getElementById('history-view');
  if (!view) return;
  const tl = document.getElementById('history-timeline');
  tl.innerHTML = '';
  if (!state.historyList.length) {
    tl.innerHTML = '<div style="padding:24px 12px;color:var(--muted,#8e959f);font-size:12px;line-height:1.6">' + T('hist.empty') + '</div>';
  }
  // 时间线：最新的在最上
  state.historyList.forEach(s => {
    const item = document.createElement('div');
    item.className = 'hist-item' + (s.timestamp === state.historyCurrentTs ? ' active' : '');
    item.dataset.ts = s.timestamp;
    const tag = s.name ? escapeHtml(s.name) : T('hist.auto');
    item.innerHTML = '<div class="hist-dot"></div><div class="hist-meta"><span class="hist-line">'
      + fmtHistoryDate(s.timestamp) + '：' + tag + '</span></div>';
    item.onclick = () => {
      if (s.timestamp === state.historyCurrentTs) return;
      vscode.postMessage({ type: 'loadSnapshot', timestamp: s.timestamp });
    };
    tl.appendChild(item);
  });
  // 工具栏 diff 钮状态
  const diffBtn = view.querySelector('.hb[data-act="diff"]');
  if (diffBtn) diffBtn.classList.toggle('on', state.historyShowDiffOnly);
  // 视图切换：历史页复用 #view-map（原地渲染快照），只显示右侧栏 #history-view；不隐藏 #view-map
  view.classList.remove('hidden');
  const vm = document.getElementById('view-map');
  if (vm) vm.classList.remove('hidden');
  const md = document.getElementById('view-md');
  if (md) md.classList.add('hidden');
  // 历史页只读：进入/刷新历史页时把焦点从工具栏按钮上移开，避免 Enter/空格隔空激活（配合 keydown 全键 preventDefault 双保险）
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('hb')) document.activeElement.blur();
}

function closeHistoryPanel() {
  state.historyMode = false;
  state.historyShowDiffOnly = false;
  state.historyDiffIds = new Set();
  if (state.liveTree) state.tree = state.liveTree; // 还原真实文档树（历史页期间 state.tree 指向快照树）
  state.liveTree = null;
  const view = document.getElementById('history-view');
  if (view) view.classList.add('hidden');
  const map = document.getElementById('view-map');
  if (map) map.classList.remove('hidden');
  render(); // 用回真实 state.tree 刷新编辑视图
  updateToolbar();
}

// 进入历史页：先拉快照列表；若已有历史树则直接渲染，否则等 listSnapshots 回包
function openHistoryPanel() {
  state.historyMode = true;
  vscode.postMessage({ type: 'listSnapshots' });
  // 列表回包会触发 snapshotsListed → 自动 load 第一条（若还没选）
  pendingAutoLoadFirst = true;
}
let pendingAutoLoadFirst = false;

// 手动命名保存快照（webview 内自建输入框，不用 window.prompt——VSCode webview 禁用原生 prompt）
function manualSaveSnapshot() {
  if (state.historyMode) { toast(T('toast.histReadonly')); return; }
  showPrompt(T('hist.promptTitle'), T('hist.promptHint'), val => {
    const text = serialize(state.tree);
    lastAutoSnapText = text; // 更新节流基准，避免随后自动存重复一份相同内容
    lastAutoSnap = Date.now();
    vscode.postMessage({ type: 'saveSnapshot', text: text, name: (val || '').trim() });
    toast(T('toast.versionSaved'));
  });
}

// 切换「只看差异」：折叠压缩只在切换这一刻应用一次，之后用户可自由折叠/展开（不再每帧重折）
function toggleHistoryDiff() {
  if (!state.historyTree) { state.historyShowDiffOnly = false; renderHistoryPanel(); return; } // 2026-08-28 加守卫：快照未加载完（列表空/回包慢）时点了会空指针崩溃
  state.historyShowDiffOnly = !state.historyShowDiffOnly;
  renderHistoryPanel();
  if (state.historyShowDiffOnly) {
    applyDiffOnlyFold(state.historyTree); // 全展开 + 仅留差异路径折叠压缩（一次性）
    renderHistoryTree(true);              // 聚焦第一个差异节点
  } else {
    // 退出只看差异：把快照树全部展开，恢复完整结构；保持当前视图不居中
    (function reset(n) { n.fold = false; (n.children || []).forEach(reset); })(state.historyTree);
    renderHistoryTree(false);
  }
}

// 历史页工具栏按钮（绑定一次）
(function initHistoryToolbar() {
  const view = document.getElementById('history-view');
  if (!view) return;
  view.querySelectorAll('.hb').forEach(btn => {
    const icon = btn.dataset.icon;
    const label = btn.dataset.label || '';
    btn.innerHTML = renderIcon(icon, 16) + '<span class="hb-label">' + label + '</span>';
    btn.onclick = e => {
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'exit') closeHistoryPanel();
      else if (act === 'restore') {
        showConfirm(T('hist.confirmRestore'), () => {
          vscode.postMessage({ type: 'restoreSnapshot', text: state.historyText });
        });
      } else if (act === 'copy') {
        vscode.postMessage({ type: 'createCopyFromSnapshot', text: state.historyText });
      } else if (act === 'diff') {
        toggleHistoryDiff();
      }
    };
  });
})();

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ webview 内自建浮层（替代 window.prompt/confirm，VSCode webview 禁用原生弹窗） ============
function showPrompt(title, placeholder, onOk, onCancel) {
  closePrompt(); // 先清掉可能残留的
  const mask = document.createElement('div');
  mask.className = 'wb-mask';
  mask.id = 'wb-prompt-mask';
  mask.innerHTML = '<div class="wb-dialog">'
    + '<div class="wb-dialog-title">' + escapeHtml(title) + '</div>'
    + '<input class="wb-input" type="text" placeholder="' + escapeHtml(placeholder || '') + '">'
    + '<div class="wb-dialog-actions">'
    + '<button class="wb-btn wb-btn-cancel">' + T('btn.cancel') + '</button>'
    + '<button class="wb-btn wb-btn-ok">' + T('btn.ok') + '</button>'
    + '</div></div>';
  document.body.appendChild(mask);
  const input = mask.querySelector('.wb-input');
  const ok = () => { const v = input.value; closePrompt(); if (onOk) onOk(v); };
  const cancel = () => { closePrompt(); if (onCancel) onCancel(); };
  mask.querySelector('.wb-btn-ok').onclick = ok;
  mask.querySelector('.wb-btn-cancel').onclick = cancel;
  mask.onclick = e => { if (e.target === mask) cancel(); };
  input.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); ok(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };
  setTimeout(() => input.focus(), 0);
}
function showConfirm(title, onOk) {
  closePrompt();
  const mask = document.createElement('div');
  mask.className = 'wb-mask';
  mask.id = 'wb-prompt-mask';
  mask.innerHTML = '<div class="wb-dialog">'
    + '<div class="wb-dialog-title">' + escapeHtml(title) + '</div>'
    + '<div class="wb-dialog-actions">'
    + '<button class="wb-btn wb-btn-cancel">' + T('btn.cancel') + '</button>'
    + '<button class="wb-btn wb-btn-ok wb-btn-danger">' + T('btn.ok') + '</button>'
    + '</div></div>';
  document.body.appendChild(mask);
  const ok = () => { closePrompt(); if (onOk) onOk(); };
  const cancel = () => closePrompt();
  mask.querySelector('.wb-btn-ok').onclick = ok;
  mask.querySelector('.wb-btn-cancel').onclick = cancel;
  mask.onclick = e => { if (e.target === mask) cancel(); };
  mask.onkeydown = e => { if (e.key === 'Escape') cancel(); };
}
function closePrompt() {
  const m = document.getElementById('wb-prompt-mask');
  if (m) m.remove();
}

// 记住临时状态（2026-08-25 v3）：不再依赖 visibilitychange/beforeunload 存状态——VSCode 切标签页时 webview 只是 hidden，
// 这些事件普遍不触发；现在改为「变化即写穿到扩展内存 Map」，无需切走那一刻兜底。

// ============ 图片 URI 异步加载（webview 不能直接读本地文件，问扩展要可访问地址） ============
const imgUriCache = {};
let imgReqId = 0;
function reqImg(relPath, imgEl) {
  if (!relPath) return;
  if (imgUriCache[relPath]) { imgEl.src = imgUriCache[relPath]; return; }
  imgEl.dataset.req = 'img' + (++imgReqId);
  vscode.postMessage({ type: 'imgUri', path: relPath, id: imgEl.dataset.req });
}

// 双击图片 → 大图预览（overlay，点背景或 × 关闭）
let imgPreviewList = []; // 当前预览节点的全部图片路径（多图可翻页）
let imgPreviewIdx = 0;   // 当前显示的图片下标
function isPreviewOpen() {
  const pv = document.getElementById('img-preview');
  return !!(pv && !pv.classList.contains('hidden'));
}
function applyImgZoom() {
  const pv = document.getElementById('img-preview');
  if (!pv) return;
  const img = pv.querySelector('.img-preview-img');
  if (img) img.style.transform = 'scale(' + imgZoom + ')';
}
function closeImagePreview(overlay) {
  overlay.classList.add('hidden');
  imgZoom = 1; imgPreviewList = []; imgPreviewIdx = 0;
}
// 多图翻页：dir = -1 上一张 / +1 下一张（环形循环）
function stepPreviewImage(dir) {
  if (imgPreviewList.length <= 1) return;
  imgPreviewIdx = (imgPreviewIdx + dir + imgPreviewList.length) % imgPreviewList.length;
  const relPath = imgPreviewList[imgPreviewIdx];
  const pv = document.getElementById('img-preview');
  if (!pv) return;
  const big = pv.querySelector('.img-preview-img');
  if (big) { big.src = ''; reqImg(relPath, big); }
  imgZoom = 1; applyImgZoom();
  updatePreviewNav(pv);
}
// 多图时显示 上一张/下一张 按钮 + 计数（单图隐藏）
function updatePreviewNav(pv) {
  const multi = imgPreviewList.length > 1;
  let nav = pv.querySelector('.img-preview-nav');
  if (!multi) { if (nav) nav.remove(); return; }
  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'img-preview-nav';
    nav.innerHTML = '<span class="img-preview-prev" title="' + T('img.prev') + '">‹</span><span class="img-preview-count"></span><span class="img-preview-next" title="' + T('img.next') + '">›</span>';
    pv.querySelector('.img-preview-box').appendChild(nav);
    nav.querySelector('.img-preview-prev').onclick = e => { e.stopPropagation(); stepPreviewImage(-1); };
    nav.querySelector('.img-preview-next').onclick = e => { e.stopPropagation(); stepPreviewImage(1); };
  }
  nav.querySelector('.img-preview-count').textContent = (imgPreviewIdx + 1) + ' / ' + imgPreviewList.length;
}
function openImagePreview(relPath) {
  if (!relPath) return;
  // 多图：从选中节点（或 relPath 所在节点）取图片列表，定位到当前这张
  let list = [relPath], idx = 0;
  const sel = state.selectedImg;
  if (sel && sel.nodeId) {
    const node = findNode(state.tree, sel.nodeId);
    if (node && node.images && node.images.length) {
      const i = node.images.indexOf(relPath);
      if (i >= 0) { list = node.images.slice(); idx = i; }
    }
  }
  imgPreviewList = list; imgPreviewIdx = idx;
  let overlay = document.getElementById('img-preview');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'img-preview';
    overlay.className = 'img-preview hidden';
    overlay.innerHTML = '<div class="img-preview-box"><span class="img-preview-close">×</span></div>';
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.classList.contains('img-preview-close')) closeImagePreview(overlay);
    });
    document.body.appendChild(overlay);
  }
  const box = overlay.querySelector('.img-preview-box');
  let big = box.querySelector('.img-preview-img');
  if (!big) {
    big = document.createElement('img'); big.className = 'img-preview-img';
    // 左键/右键点击图片 → 上一张/下一张（仅多图预览时生效；背景左键仍用于关闭）
    big.addEventListener('mousedown', e => {
      if (!isPreviewOpen() || imgPreviewList.length <= 1) return;
      if (e.button === 0) { e.preventDefault(); stepPreviewImage(-1); } // 左键：上一张
    });
    big.addEventListener('contextmenu', e => {
      if (!isPreviewOpen() || imgPreviewList.length <= 1) return;
      e.preventDefault(); stepPreviewImage(1); // 右键：下一张
    });
    box.appendChild(big);
  }
  big.src = '';
  reqImg(relPath, big); // 复用缓存 + 消息往返（big 在 DOM 里会被 imgUriRes 填 src）
  imgZoom = 1; applyImgZoom();
  updatePreviewNav(overlay);
  overlay.classList.remove('hidden');
}

// ============ 双链（v2，2026-08-29 定）============
// 按"指向什么"显式分类，不靠猜：
//   本文件节点       [[#p1nb22]]           → 点击跳转（下钻）
//   别的文件的节点   [[笔记名#p1nb22]]     → 打开该笔记并下钻到节点
//   别的笔记/导图    [[笔记名]]            → 打开该笔记（Obsidian 原生 wikilink，改名自动跟随）
//   外部网页         [显示名](https://x)   → 浏览器打开（也认裸 https://x）
//   本地文件         [显示名](file:///…)   → 系统默认应用打开
//   音视频嵌入       ![[会议录音.mp4]]     → 就地播放器（附属行，不算链接）
// 按 persistId 查找节点（returnToDefault / 路径历史栈存的是 pid，而 findNode 只认 node id）
// normPid：pid 清洗（2026-08-31 实踩）——捷径 frontmatter / 会话记忆里的 pid 可能带不可见字符（零宽空格等），
// 严格相等永远失配 → 误报「节点已删」。persistId 本就只含字母数字（p+base36），一律清洗后比对。
function normPid(s) { return String(s || '').replace(/[^A-Za-z0-9]/g, ''); }
function findByPersistId(root, pid) {
  if (root.persistId === pid) return root;
  for (const c of root.children || []) { const r = findByPersistId(c, pid); if (r) return r; }
  return null;
}
// 本文件节点链接 [[#pid]]：只认这种；显示文字跟随目标节点当前标题（parseLink 保持原签名：{title, pid}，title 恒空）
function parseLink(raw) {
  const m = String(raw || '').match(/^\[\[#([^\]]+)\]\]$/);
  return { title: '', pid: m ? m[1].trim() : '' };
}
// 节点链接统一解析（2026-08-29 跨文档定案）：
//   [[#pid]]            → { kind:'same', pid }（省略文件名 = 同文件）
//   [[当前文件名#pid]]  → { kind:'same', pid }（复制链接带出的源文件名 == 当前文件 = 同文件跳转，体验同 [[#pid]]）
//   [[别的文件名#pid]]  → { kind:'cross', note, pid }（跨文件：打开该笔记并下钻；按名字不按路径，改名 Obsidian 自动更新）
function resolveNodeLink(raw) {
  const t = String(raw || '');
  let m = t.match(/^\[\[#([^\]]+)\]\]$/);
  if (m) return { kind: 'same', pid: m[1].trim() };
  m = t.match(/^\[\[([^\]#]+)#([^\]]+)\]\]$/);
  if (!m) return null;
  const note = m[1].trim(), pid = m[2].trim();
  const cur = state.currentFilename || '';
  if (note === cur || note === cur + '.md') return { kind: 'same', pid };
  return { kind: 'cross', note, pid };
}
// wikilink [[笔记名]] / [[笔记名#pid]]（不含 [[#pid]] 本文件形）→ { note, pid }；不匹配返回 null
function parseWikiLink(raw) {
  const t = String(raw || '');
  if (/^\[\[#/.test(t)) return null; // 本文件节点链接，归 parseLink
  const m = t.match(/^\[\[([^\]#]+)(?:#([^\]]+))?\]\]$/);
  if (!m) return null;
  return { note: m[1].trim(), pid: (m[2] || '').trim() };
}
// 按 ID 跳转（名字可能改，ID 不变就能跳）
function jumpByPid(pid) {
  if (!pid) return;
  const target = findByPersistId(state.tree, pid);
  if (!target) { toast(T('toast.jumpFail'), true); return; }
  goTo(target.id); // 下钻到目标节点，它成为当前主节点
}
// 打开 wikilink 指向的笔记（可带 #pid 下钻）：交给宿主按 Obsidian 链接解析找文件
function openNote(raw) {
  const w = parseWikiLink(raw);
  if (!w) return;
  vscode.postMessage({ type: 'openNote', note: w.note, pid: w.pid });
}
// 文件链接 v2：[显示名](file:///绝对路径)（点击经宿主打开文件）
function parseFileLink(raw) {
  const m = String(raw || '').match(/^\[([^\]]*)\]\(file:\/\/([^)]+)\)$/);
  if (!m) return null;
  let p = m[2].trim();
  if (p.startsWith('localhost/')) p = p.slice('localhost/'.length); // file://localhost/ 等同本地
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); // file:///C:/x → C:/x（Windows 盘符前的多余斜杠）
  if (!p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p)) return null; // 相对路径 → 不是文件链接
  const display = normalizeFileDisplay(m[1].trim(), p);
  return { path: p, display };
}
// 文件链接显示名归一化：空或像路径时只留文件名，保留用户自定义中文名
function normalizeFileDisplay(display, p) {
  if (!display) return p.split(/[\\/]/).pop() || p;
  if (display === p) return p.split(/[\\/]/).pop() || p;
  if (/^(\/|[A-Za-z]:[\\/])/.test(display)) return p.split(/[\\/]/).pop() || p;
  return display;
}
// 经宿主打开文件链接指向的本地文件（宿主决定用导图视图还是系统默认应用）
function openFilePath(p) {
  if (!p) return;
  vscode.postMessage({ type: 'openFile', path: p });
}
// 节点加粗/Minor 判断（v2，2026-08-29）：bold/minor 都是节点级字段，落盘分别为 ** 包裹 / minor:1 注释；
// 标题里的 ~~x~~ 是真正的删除线、_x_ 是斜体，都不是 Minor 标记
function nodeIsBold(n) { return n.bold === true || /^\*\*.*\*\*$/.test(n.title || ''); }
function nodeIsMinor(n) { return !!n && n.minor === true; }
function nodeIsNow(n) { return !!n && n.now === true; } // Now 节点（节点级 now 字段，落盘 <!--now:1-->）；防御式：节点可能为空（稀疏删除/解析异常残留的 undefined）
// 音视频文件（嵌入播放器；与图片区分）——v2 附件按扩展名分流（2026-08-29）
const MEDIA_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'];
function isMediaFile(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return !!m && MEDIA_EXTS.indexOf(m[1]) >= 0;
}
// 收集树中所有 Now 节点（先序，文档顺序）——定位/过滤/置灰判定都用它
function collectNowNodes(root) {
  const out = [];
  (function w(n) {
    if (!n) return; // 跳过稀疏删除/解析异常残留的 undefined/空节点（否则 n.children / n.now 抛错）
    if (nodeIsNow(n)) out.push(n);
    (n.children || []).forEach(w);
  })(root);
  return out;
}
// 计算「只显示 Now」下的可见节点集：Now 节点 + 其祖先链（从主节点导过来的必要路径）+ Now 节点的直接子节点
// （类比 hideDone 的剔除渲染：返回 Set，buildRow 里不在集内且 depth>0 的节点直接 return null）
function computeNowVisible(root) {
  const set = new Set();
  if (!root) return set;
  set.add(root.id); // 主节点恒可见（防画面全空，同 hideDone 保根）
  // 「只看 Now」只作用于当前视图（currentRoot 范围内）：有 Now 标记的提取出来（Now+祖先链+子树），
  // 没有 Now 标记的隐藏。当前视图一个 Now 都没有 → 由 autoExitShowNowWhenEmpty / setShowNow 入口兜底退出。
  // 【2026-08-31 反修】此前加过「下钻态子树整体可见」豁免 → 下钻到无 now 标记的普通节点 + showNow 时过滤完全失效
  //（点了「只看 Now」画面毫无变化）。按语义：不看子树整体，只看当前视图里有没有 Now 节点。
  collectNowNodes(root).forEach(now => {
    set.add(now.id);
    const path = pathTo(root, now.id); // 祖先链（含 now 自身），保住从主节点到 Now 的路径
    if (path) path.forEach(n => set.add(n.id));
    // Now 的子树（含所有层级的子孙）恒进可见集：setShowNow 不再强制折叠 Now 子树（子孙保持原始折叠态），
    // 故进入"只看 Now"后点 Now 展开能在任意层级展开查看/编辑子节点。
    // 【修复 2026-08-31】旧逻辑 `if (!now.fold)` 门槛：快照在子树折叠之前定格，当 Now 已折叠时（二次点按 /
    // 重载恢复 showNow，fold 已落盘）其子树不进可见集 → 点 Now 展开失效（偶发 bug）。现无条件纳入整棵子树，
    // 折叠仅控制视觉收起（buildRow 的 !node.fold 不挂子孙），不影响本集成员，故展开必可见。
    (function walk(children) {
      (children || []).forEach(c => {
        if (!c) return; // 跳过解析/删除异常残留的空节点，避免 c.id 抛错
        set.add(c.id);
        walk(c.children);
      });
    })(now.children);
  });
  return set;
}
// 标题内容（含自身 Minor 的置灰小箭头 / 自身 Now 的蓝色小圆点）；buildCard 与编辑退出还原共用，避免图标在编辑后丢失（2026-08-26）
function cardTitleInner(node) {
  const selfDone = nodeIsMinor(node);
  const selfNow = nodeIsNow(node);
  // 2026-08-28：图标 span 设 contenteditable="false"，编辑中 Backspace 删完文字不会继续删图标
  // （图标与文字解耦，删最后一个字图标还在；空节点也正常显示图标）
  // 2026-08-31 修（双图标 bug）：空标题节点的前缀图标由 buildRow 的 `if (selfDone && !node.title)` DOM 插入
  // 分支独立渲染（无标题时独占一行），这里再 emit 一次就会叠成两个 → 仅在有标题时才拼前缀图标。
  return (selfDone && node.title ? '<span class="minor-ico" contenteditable="false">' + renderIcon(minorIconName(), 12) + '</span>' : '')
    + (selfNow && node.title ? '<span class="now-ico" contenteditable="false">' + renderNowPrefix() + '</span>' : '')
    + renderInline(node.title || '');
}
// URL 链接 v2：[显示名](https://…)（标准 Markdown）或裸 https://x / www.x / ftp:// / mailto:；点击浏览器打开
function parseUrlLink(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/^\[([^\]]*)\]\(((?:https?|ftp):\/\/[^)\s]+|mailto:[^)\s]+)\)$/);
  if (m) {
    const url = m[2].trim();
    return { url, display: normalizeUrlDisplay(m[1].trim(), url) };
  }
  if (/^(https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s]+$/i.test(t)) {
    let url = t;
    if (/^www\./i.test(url)) url = 'https://' + url; // 裸 www. 补 https，便于浏览器打开
    return { url, display: urlRootDisplay(url) };
  }
  return null;
}
// URL 显示名归一化：空或像 URL 时只显示根域名（并剥 www.），保留用户自定义中文名
function normalizeUrlDisplay(display, url) {
  if (!display) return urlRootDisplay(url);
  const urlNoProto = url.replace(/^(https?:\/\/|ftp:\/\/|mailto:)/i, '');
  if (display === url || display === urlNoProto) return urlRootDisplay(url);
  if (/^(https?:\/\/|ftp:\/\/|mailto:|www\.)/i.test(display)) return urlRootDisplay(url);
  return display;
}
function urlRootDisplay(url) {
  if (/^mailto:/i.test(url)) return url.slice('mailto:'.length); // mailto 直接显示地址
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, '') || u.hostname || url;
  } catch (_) { return url; } // 普通链接只显示根域名
}
// 识别剪贴板文本是否为一个普通链接（http/https/ftp/mailto/www），返回原始链接或 null
// v2：支持 [显示名](url)、裸链接，兼容旧的 [[url]] 包裹
function detectUrl(text) {
  let t = String(text || '').trim();
  if (!t || t.includes('\n')) return null; // 多行 → 不是单个链接
  const md = t.match(/^\[[^\]]*\]\(((?:https?|ftp):\/\/[^)\s]+|mailto:[^)\s]+)\)$/);
  if (md) return md[1].trim();
  const wrap = t.match(/^\[\[(.*)\]\]$/);
  if (wrap) t = wrap[1].trim(); // 去掉 [[ ]]
  return /^(https?:\/\/|ftp:\/\/|mailto:|www\.)/i.test(t) ? t : null;
}
// 经宿主在默认浏览器打开 URL 链接
function openUrl(url) {
  if (!url) return;
  vscode.postMessage({ type: 'openUrl', url });
}
// 识别剪贴板文本是否为一个文件路径（绝对路径 / file:// URL / [显示名](file:///…)），返回规范化绝对路径或 null
// v2：支持 [显示名](file:///Users/x)、裸路径 /Users/x、file:///Users/x，兼容旧的 [[file:///…]] 包裹
function detectFilePath(text) {
  let t = String(text || '').trim();
  if (!t || t.includes('\n')) return null; // 多行 → 不是单个文件路径
  const md = t.match(/^\[[^\]]*\]\((file:\/\/[^)]+)\)$/);
  if (md) t = md[1].trim();
  else { const wrap = t.match(/^\[\[(.*)\]\]$/); if (wrap) t = wrap[1].trim(); }
  let p = t.replace(/^file:\/\//, ''); // 去 scheme
  if (p.startsWith('localhost/')) p = p.slice('localhost/'.length);
  const isAbs = p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('~/');
  return isAbs ? p : null;
}
// 转义后解析 Markdown：**加粗** → <strong>；~~删除线~~ → 真删除线（v2：Minor 不再占用删除线语义）；
// _斜体_ → <em>（v2：_x_ 是标准斜体，不是 Minor 标记）
function escMd(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del class="md-del">$1</del>')
    .replace(/^_([^_]+)_$/gm, '<em>$1</em>');
}
// 节点内链接渲染（2026-08-29 混排放开）：
//   整行纯链接 → 链接节点语义（同以前）；文字里嵌链接 → 行内切分渲染成可点 span，其余文字照常。
//   纯 [[#pid]] → 跳本图；纯 [[笔记名]]/[[笔记名#pid]] → 打开笔记；纯 [名](url)/裸 URL → 浏览器；纯 [名](file:///…)/裸绝对路径 → 打开文件。
function renderInline(text) {
  if (!text) return '';
  const t = text.trim();
  // 纯节点链接 [[#pid]] / [[当前文件名#pid]]（同文件，跳本图）；[[别的文件名#pid]] 走下面 wikilink 分支
  const nl = resolveNodeLink(t);
  if (nl && nl.kind === 'same') {
    const target = findByPersistId(state.tree, nl.pid);
    const shown = target && target.title ? target.title : nl.pid;
    return '<span class="inline-link" data-pid="' + escapeHtml(nl.pid) + '">' + linkIco('frame') + escMd(shown) + '</span>';
  }
  // 纯 wikilink：[[笔记名#pid]] = 跨文件节点链接 → 节点框图标 + 笔记名（2026-09-03 定，与链接节点渲染统一）；
  // [[笔记名]] = 双链 → 方括号图标 + 笔记名
  let wikiM = t.match(/^\[\[([^\]#]+)#[^\]]+\]\]$/);
  if (wikiM) {
    return '<span class="inline-wiki" data-raw="' + escapeHtml(t) + '">' + linkIco('frame') + escMd(wikiM[1].trim()) + '</span>';
  }
  wikiM = t.match(/^\[\[([^\]#]+)\]\]$/);
  if (wikiM) {
    return '<span class="inline-wiki" data-raw="' + escapeHtml(t) + '">' + linkIco('brackets') + escMd(wikiM[1].trim()) + '</span>';
  }
  // 纯 URL（[显示名](url) 或裸链接）
  const ul = parseUrlLink(t);
  if (ul) {
    return '<span class="inline-url" data-url="' + escapeHtml(ul.url) + '">' + linkIco('globe') + escMd(ul.display) + '</span>';
  }
  // 纯文件链接（[显示名](file:///…) 或裸绝对路径）
  const fl = parseFileLink(t);
  const fp = fl ? fl.path : detectFilePath(t);
  if (fp) {
    const disp = fl ? fl.display : (fp.split(/[\\/]/).pop() || fp);
    return '<span class="inline-file" data-path="' + escapeHtml(fp) + '">' + linkIco('folder-closed') + escMd(disp) + '</span>';
  }
  // 混排兜底：按 [[…]] / [名](链接) / 裸 URL 切分，链接段渲染成可点 span（复用 bindInline），其余文字走 escMd。
  // 不认得的写法（如残缺 [[xx）按纯文字，不吞字；落盘不变——标题仍是原文，只是渲染差异。
  // 裸 URL 字符集排除 CJK/全角区（URL 后紧跟中文不算 URL 的一部分），尾部 ASCII 标点另行剥离
  // 混排切出的链接 token 必须含右括号结尾（parseUrlLink/parseFileLink 都要求 \)$）：
  // 旧正则 URL/file 共用 [^)\s]+ 且不带 \) → token 永远缺右括号 → parse 恒 null → [名](url) 内嵌一直是纯文字（隐藏老 bug）；
  // file 另用 [^)]+（本地路径可含空格，如 "Digital Life"，2026-09-02 实踩：含空格路径内嵌失效）
  const re = /\[\[[^\[\]]+\]\]|\[[^\[\]]*\]\(file:\/\/[^)]+\)|\[[^\[\]]*\]\((?:https?|ftp):\/\/[^)\s]+\)|mailto:[^)\s]+\)|(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g;
  let last = 0, m, html = '';
  while ((m = re.exec(text)) !== null) {
    html += escMd(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('[[')) {
      const nl2 = resolveNodeLink(tok);
      if (nl2 && nl2.kind === 'same') {
        const target = findByPersistId(state.tree, nl2.pid);
        const shown = target && target.title ? target.title : nl2.pid;
        html += '<span class="inline-link" data-pid="' + escapeHtml(nl2.pid) + '">' + linkIco('frame') + escMd(shown) + '</span>';
      } else {
        const w = parseWikiLink(tok);
        // 带 #pid = 跨文件节点链接 → 节点框图标；不带 = 双链 → 方括号图标（2026-09-03 与链接节点渲染统一）
        if (w) html += '<span class="inline-wiki" data-raw="' + escapeHtml(tok) + '">' + linkIco(w.pid ? 'frame' : 'brackets') + escMd(w.note) + '</span>';
        else html += escMd(tok);
      }
    } else if (tok.startsWith('[')) {
      const u2 = parseUrlLink(tok);
      if (u2) {
        html += '<span class="inline-url" data-url="' + escapeHtml(u2.url) + '">' + linkIco('globe') + escMd(u2.display) + '</span>';
      } else {
        const fl2 = parseFileLink(tok);
        if (fl2) html += '<span class="inline-file" data-path="' + escapeHtml(fl2.path) + '">' + linkIco('folder-closed') + escMd(fl2.display) + '</span>';
        else html += escMd(tok);
      }
    } else {
      // 裸 URL：句尾标点（，。）还给别人，别吸进链接里；显示名归一到根域名
      let url = tok, tail = '';
      const tm = url.match(/[。，、；：！？）》】…,,.;:!?)]+$/);
      if (tm && url.length > tm[0].length) { tail = tm[0]; url = url.slice(0, -tail.length); }
      let norm = url;
      if (/^www\./i.test(norm)) norm = 'https://' + norm;
      html += '<span class="inline-url" data-url="' + escapeHtml(norm) + '">' + linkIco('globe') + escMd(urlRootDisplay(norm)) + '</span>' + escMd(tail);
    }
    last = m.index + tok.length;
  }
  html += escMd(text.slice(last));
  return html;
}
function bindInline(container) {
  container.querySelectorAll('.inline-link').forEach(s => {
    s.onclick = e => { e.stopPropagation(); jumpByPid(s.dataset.pid); };
  });
  container.querySelectorAll('.inline-wiki').forEach(s => {
    s.onclick = e => { e.stopPropagation(); openNote(s.dataset.raw); };
  });
  container.querySelectorAll('.inline-url').forEach(s => {
    s.onclick = e => { e.stopPropagation(); openUrl(s.dataset.url); };
  });
  container.querySelectorAll('.inline-file').forEach(s => {
    s.onclick = e => { e.stopPropagation(); openFilePath(s.dataset.path); };
  });
}

// ============ 浮动操作面板 ============
// 调试界面开关：fab → 调试界面 控制左工具栏刷新按钮显隐（2026-08-25：刷新钮从右上角移到左工具栏）
let debugMode = false;
function setDebugMode(on) {
  debugMode = on;
  const rf = document.getElementById('btn-refresh');
  if (rf) rf.classList.toggle('hidden', !on);
  persistNow(); // 经 setView 写穿到扩展内存 Map（替代 getState，切页重建不丢）
}

// ============ 左侧工具栏 + 三个点菜单（飞书风重做，2026-08-21） ============
// 撤销/重做置灰（按钮已移入更多菜单，2026-08-25）
function updateUndoRedo() {
  const u = document.querySelector('#more-menu [data-act="undo"]');
  const r = document.querySelector('#more-menu [data-act="redo"]');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}
// 隐藏完成（Minor）按钮图标：原方案 eye/eye-off（状态切图标）
// persist=true 时同步给扩展存 workspaceState（按文件记，下次打开保持）；init 恢复时传 false 不回写（2026-08-24 P1）
function setHideDone(on, persist) {
  state.hideDone = on;
  const b = document.getElementById('btn-hide-done');
  if (b) {
    b.innerHTML = renderIcon(on ? 'frame-eye-closed' : 'frame-eye-open', 18); // 2026-08-26：用户自定义图标（Frame / Frame-1），关闭态蓝色由 .active-hide 提供
    b.style.color = '';
    b.classList.toggle('active-hide', on);
    b.dataset.tip = on ? T('tb.showMinor') : T('tb.hideMinor');
  }
  if (persist !== false) vscode.postMessage({ type: 'setHideDone', value: !!on });
  if (!state.tree) return; // 树未初始化（自检脚本 / 启动阶段），只更新图标
  keepView(currentRoot()); // 2026-08-24 修：之前误传 currentRoot().id（字符串），keepView 内 node.id=undefined 静默 return，锚定从未生效
  render();
}
// 只显示「当前关注 Now」节点（2026-08-27 起）：切换 showNow。
// 开：剔除渲染只留 Now+祖先路径+Now 直接子节点（computeNowVisible）+ 定位首 Now 居中。
// 关：正常渲染。
// 数据层展开/折叠（用户 2026-08-27 后续定）：仅真实点击开启（persist 默认 true）时改 node.fold——
//   展开藏 Now 的所有祖先（让 Now 露出）+ 折叠 Now 的直接子节点（其后整棵子树收起，类点折叠按钮）；
//   改前 pushUndo 可撤销，emitUpdate 落盘。init 恢复(persist=false)与点关闭时都不碰 node.fold，交回用户手动（"点完按钮后别管，除非再次点击"）。
function setShowNow(on, persist) {
  if (state.historyMode) return; // 历史页只读：禁止切换"只看当前关注"（会持久化偏好 + 改折叠 + resetView，泄露到实时视图导致塌缩）
  // 真实点击开启时，当前视图（currentRoot 范围）一个 Now 节点都没有 → 不开、退出，并提示原因
  //（否则可见集只剩当前根、画面塌缩成单节点，用户看到"点了没反应/节点失效"；2026-08-31 语义）
  if (on && persist !== false && state.tree && collectNowNodes(currentRoot()).length === 0) {
    toast(T('toast.showNowEmpty'));
    vscode.postMessage({ type: 'setShowNow', value: false }); // 回写 perFile，别存一个无效的 true
    updateNowSideBtn();
    return;
  }
  state.showNow = on;
  nowVisibleSnapshot = (on && state.tree) ? computeNowVisible(currentRoot()) : null; // 「按下那一刻」定格可见集；关闭即清空（2026-08-28）
  if (persist !== false) vscode.postMessage({ type: 'setShowNow', value: !!on });
  if (!state.tree) { updateNowSideBtn(); return; } // 树未初始化，只更新图标
  // 数据层：仅真实点击开启时展开/折叠（init 恢复与点关闭不触发）
  if (on && persist !== false) {
    pushUndo();
    const root = currentRoot();
    collectNowNodes(root).forEach(now => {
      const path = pathTo(root, now.id); // 祖先链（含自身）
      if (path) for (let i = 0; i < path.length - 1; i++) path[i].fold = false; // 展开所有祖先（自身保留）
      now.fold = true; // 进入「只看当前关注」：仅折 Now 自身（最小态，画面只剩 Now 一行），子孙保持原始折叠态；
      // 点 Now 展开后子节点按原状显示（不逐层续折），任意层级都可在 nowVisibleSet 内展开查看/编辑。
    });
    emitUpdate(); // 落盘 fold 变化
  }
  // 2026-09-01 修「切走再回 pan 被清零、永远回自定义中央」的头号根因：
  // 原 `if (on) resetView()` 不看 persist——init 恢复（persist=false）也走 resetView → rAF 里 locateCenter
  // → placeCardAtViewport 强制 pan=0 + scroll=定位规范值，把 init hasSavedView 分支刚恢复的 pan 抹掉；
  // 随后的 scroll 事件 persist 又把被污染的状态写回记忆 → 永远回中央。修：init 恢复只重渲染应用 Now 过滤，
  // 视图位置完全交给 init 的恢复/定位分支；只有真实点击开启才定位到第一个 Now 节点。
  if (on) {
    state.nowLocateIndex = 0;
    if (persist !== false) resetView(); // 真实点击开启：定位到第一个 Now 节点为画面自定义中间
    else render(); // init 恢复：只按快照重渲染应用过滤，绝不定位
  }
  else { keepView(currentRoot()); render(); }
}
// 刷新侧边 Now 按钮：无 Now 节点 → 置灰禁用；否则按 showNow 切正常/激活图标（2026-08-27）
// tooltip 统一挂在 #now-wrap 容器上（不挂在按钮本身）：按钮禁用时 opacity:.35 会把挂在它身上的 tooltip
// 一起变淡，且 :disabled 是否触发 :hover 各浏览器不一；挂容器上则始终清晰、且容器必然 :hover。
function updateNowSideBtn() {
  const b = document.getElementById('btn-now-side');
  const wrap = document.getElementById('now-wrap');
  if (!b || !wrap) return;
  if (state.historyMode) {
    // 历史页只读：禁用"只看当前关注"（与编辑类操作一致），避免切换偏好泄露到实时视图
    b.disabled = true;
    b.innerHTML = renderNowIcon('side');
    wrap.dataset.side = 'right';
    wrap.dataset.tip = T('tb.nowReadonly');
    return;
  }
  const hasNow = state.tree ? collectNowNodes(currentRoot()).length > 0 : false;
  b.disabled = !hasNow;
  b.classList.toggle('now-on', hasNow && state.showNow);
  wrap.dataset.side = 'right'; // 左侧 toolbar 按钮 → tooltip 向右浮动（避开画布；2026-08-27）
  if (!hasNow) {
    b.innerHTML = renderNowIcon('side');        // 置灰后呈灰，提示无可定位的当前关注节点
    wrap.dataset.tip = T('tb.noNow');
  } else {
    const on = state.showNow;
    b.innerHTML = renderNowIcon(on ? 'sideOn' : 'side');
    wrap.dataset.tip = on ? T('tb.nowShowAll') : T('tb.nowOnly');
  }
}
// 默认路径按钮状态：当前页面路径 vs 保存的默认路径（两态：置灰 / 蓝色点击返回）
// 默认路径是否有效：空串=默认是根（永远有效）；否则树里必须还存在该 persistId 节点
function defaultPathValid() {
  const d = (state.defaultPid || '').trim();
  if (!d) return true;
  return !!findNodeByPersistId(state.tree, d);
}
function updateDefaultPathBtn() {
  // 2026-08-28：路径按钮移到更多菜单（data-act="default-path"，名「链接」）。子菜单 4 项已删，仅保留返回默认路径入口
  const b = document.querySelector('#more-menu .mm[data-act="default-path"]');
  if (!b) return;
  const valid = defaultPathValid();
  const cur = (currentRoot() ? (currentRoot().persistId || '') : '').trim();
  const def = (state.defaultPid || '').trim();
  const same = cur === def;
  if (!valid) { b.disabled = true; b.title = T('tb.pathInvalid'); }
  else if (same) { b.disabled = true; b.title = T('tb.pathIsDefault'); }
  else { b.disabled = false; b.title = T('tb.pathBack'); }
  updatePathMenuBtns();
}
// 子菜单 4 项的置灰：上一/下一按历史栈位置，返回默认/更新当前按「是否已是默认 / 默认是否有效」（2026-08-28 恢复）
function updatePathMenuBtns() {
  const back = document.getElementById('mi-path-back');
  const fwd = document.getElementById('mi-path-fwd');
  const def = document.getElementById('mi-path-default');
  const save = document.getElementById('mi-path-save');
  if (back) back.disabled = state.pathHistoryIndex <= 0;
  if (fwd) fwd.disabled = state.pathHistoryIndex >= state.pathHistory.length - 1;
  const cur = (currentRoot() ? (currentRoot().persistId || '') : '').trim();
  const dflt = (state.defaultPid || '').trim();
  const same = cur === dflt;
  const valid = defaultPathValid();
  if (def) def.disabled = !valid || same;
  if (save) save.disabled = same && valid;
}
// 初始化左侧一级菜单按钮图标 + tooltip（undo/redo 已移入更多菜单，2026-08-25；slash 路径按钮 2026-08-28 也移入更多菜单）
['locate', 'hide', 'more'].forEach(k => {
  const id = k === 'hide' ? 'btn-hide-done' : 'btn-' + k;
  const b = document.getElementById(id);
  if (!b) return;
  b.innerHTML = renderIcon(ICON_FIXED[k], 18);
  const tipMap = {
    undo: T('tb.undo'),
    redo: T('tb.redo'),
    locate: T('tb.locate'),
    slash: T('tb.defaultPath'),
    hide: T('tb.minorToggle'),
    more: T('common.more'),
  };
  b.dataset.tip = tipMap[k];
  b.dataset.side = 'right'; // 左侧 toolbar 按钮 → tooltip 向右浮动（避开画布）
});
// ===== 折叠体系（2026-09-01 定案：左右两入口，旧 hover 子菜单已删）=====
// 「折叠 ⇄ 撤回」快照机制（原左下角折叠按钮的逻辑，2026-09-11 起扩展到层级条**所有**数字按钮）：
//   同一层级按钮再点一次 = 撤回（恢复快照）；换一个层级 = 重新折叠（记新快照）；无限循环。
//   全部单层语义——只把节点自己的 fold 置 true，绝不动后代 fold（展开后内部折叠状态保持原样）。
// 选中节点时的折叠用 keepView(selNode) 保持选中节点屏幕位置不动（2026-08-26 位置刷新优化）；
// 仅无选中的按层折叠仍 resetView() 居中当前根。
let foldSnapActive = false, foldSnapMap = null, foldSnapLvl = null;
// 层级条统一入口：lvl = 按钮数字（用于区分"同层再点=撤回"）；apply = 该按钮的纯折叠动作（不含 pushUndo/渲染）
function foldRunWithUndo(lvl, apply, keepSel) {
  const sel = hasSingleSelection() ? findNode(state.tree, state.selectedId) : null;
  if (foldSnapActive && foldSnapMap && foldSnapLvl === lvl) {
    // 同层再点 = 撤回：恢复快照（完全回到这次折叠前的状态）
    pushUndo();
    restoreFoldSnapshot(foldSnapMap);
    foldSnapActive = false; foldSnapMap = null; foldSnapLvl = null;
    emitUpdate();
    if (keepSel && sel) keepView(sel.node); else resetView();
    render();
    return;
  }
  // 换层（或首次）= 折叠：记录全树 fold 快照后执行，之后可随时同层撤回
  pushUndo();
  foldSnapMap = captureFoldSnapshot();
  apply();
  foldSnapActive = true; foldSnapLvl = lvl;
  emitUpdate();
  if (keepSel && sel) keepView(sel.node); else resetView();
  render();
}
// 「进入该节点」按钮（2026-08-30 定）：= 右键「进入当前节点」drillInto，需选中节点才可用
const btnDrill = document.getElementById('btn-drill');
if (btnDrill) {
  btnDrill.innerHTML = renderIcon('log-in', 18);
  btnDrill.dataset.side = 'right';
  btnDrill.dataset.tip = T('tb.drillDefault');
  btnDrill.onclick = (e) => { e.stopPropagation(); if (hasSingleSelection()) drillInto(state.selectedId); };
}
function hasSingleSelection() { return !!state.selectedId && !state.multiSelected.size; }
function clearLevelHighlight() { document.querySelectorAll('.card.hl-level').forEach(c => c.classList.remove('hl-level')); }
function highlightLevel(codeDepth) {
  clearLevelHighlight();
  document.querySelectorAll('.node-row[data-depth="' + codeDepth + '"] > .card').forEach(c => c.classList.add('hl-level'));
}
// Mode B 专用：高亮选中节点子树内相对第 relDepth 层（relDepth=1=选中的孩子）
function highlightSelLevel(selNode, relDepth) {
  clearLevelHighlight();
  const collect = [];
  const walk = (node, d) => {
    if (d === relDepth) collect.push(node);
    if (d < relDepth) node.children.forEach(c => walk(c, d + 1));
  };
  walk(selNode, 0);
  collect.forEach(n => { const row = document.querySelector('.node-row[data-id="' + n.id + '"]'); if (row) row.querySelector(':scope > .card').classList.add('hl-level'); });
}
// 在 currentRoot 子树里找 target 的路径（返回节点数组 root..target；找不到返回 null）
function pathTo(root, target) {
  const path = [];
  function rec(node) {
    path.push(node);
    if (node.id === target) return true;
    for (const c of node.children) if (rec(c)) return true;
    path.pop();
    return false;
  }
  return rec(root) ? path : null;
}
// 按层折叠（Mode A，无选中）：targetDepth=code depth；d<targetDepth 打开路径，d===targetDepth 只折该层（单层语义，更深层 fold 不动）
function foldByLevel(targetDepth) {
  pushUndo();
  foldByLevelPure(targetDepth);
  emitUpdate();
  resetView();
}
// 纯折叠动作（不含 pushUndo/渲染）—— 供层级条的「折叠⇄撤回」快照机制调用（foldRunWithUndo）
function foldByLevelPure(targetDepth) {
  const root = currentRoot();
  const walk = (node, d) => {
    if (d > 0) {
      if (d < targetDepth) node.fold = false;
      else if (d === targetDepth && node.children.length) node.fold = true; // 只折目标层（不深折：更深层保持原状、随父折叠而隐藏，打开后不一层层续折）
    }
    node.children.forEach(c => walk(c, d + 1)); // 遍历所有层，深层 fold 状态不变（不中途 return）
  };
  walk(root, 0);
}
// 折偏路径兄弟侧枝（选中节点场景共用）：off-path 兄弟整棵深折（渐进式，2026-08-30），不碰选中节点本身及其子树
function foldOffPathSiblings(path) {
  const root = currentRoot();
  const pathIds = new Set(path.map(n => n.id));
  const selNode = path[path.length - 1];
  const walk = (node, d, parentOnPath) => {
    const onPath = pathIds.has(node.id);
    if (d > 0 && !onPath && parentOnPath && node.children.length) { node.fold = true; return; } // 偏路径兄弟只折本层（还原原"原来那个逻辑"：不深折，打开后不一层层续折）
    if (node.id !== selNode.id && onPath) node.children.forEach(c => walk(c, d + 1, onPath)); // 只沿路径往下
  };
  walk(root, 0, true);
}
// Mode B·点数字 N（相对选中节点）：其它无关极简 + 选中子树按相对层折叠（单层语义，深层 fold 不动）
function foldSelByLevel(N) {
  const path = pathTo(currentRoot(), state.selectedId);
  if (!path) { foldByLevel(1); return; }
  pushUndo();
  foldSelByLevelPure(N, path);
  emitUpdate();
  keepView(path[path.length - 1]); // 按层级折叠选中子树：选中节点保持原位，不跳中心（2026-08-26 位置刷新优化）
  render();
}
// 纯折叠动作（不含 pushUndo/渲染）—— 供层级条的「折叠⇄撤回」快照机制调用（foldRunWithUndo）
function foldSelByLevelPure(N, path) {
  const selNode = path[path.length - 1];
  foldOffPathSiblings(path);                                  // ① 其它无关极简（off-path 兄弟整棵深折）
  selNode.fold = false;                                        // 选中节点打开（让相对层可见）
  const walkSel = (node, d) => {                              // ② 选中子树只折目标层（不深折，还原"原来那个逻辑"）
    if (d > 0) {
      if (d < N) node.fold = false;
      else if (d === N && node.children.length) node.fold = true; // 只折相对第 N 层，更深层保持原状
    }
    node.children.forEach(c => walkSel(c, d + 1));
  };
  walkSel(selNode, 0);
}
// ===== 左下角折叠按钮的「折叠 ⇄ 撤回」辅助（2026-09-01 定案）=====
// 记录当前根子树全部节点的 fold 状态（快照）；撤回时原样恢复。
function captureFoldSnapshot() {
  const map = new Map();
  (function walk(n) { if (!n) return; map.set(n.id, !!n.fold); (n.children || []).forEach(walk); })(currentRoot());
  return map;
}
function restoreFoldSnapshot(map) {
  (function walk(n) { if (!n) return; if (map.has(n.id)) n.fold = map.get(n.id); (n.children || []).forEach(walk); })(currentRoot());
}
// 最小折叠：除「当前根 → 选中节点」路径链外全部收起；选中节点自身收起（只剩路径链 + 它自己）。
// 2026-09-01 修「逐级折叠」bug：全部单层语义——每个节点只置自己的 fold，绝不动后代 fold。
//   旧版旁支和选中节点都调 foldDeep 把全部后代 fold=true（历史遗留的渐进式深折没删干净，
//   只在其它入口改了单层），展开时每层都是折的 = 逐级折叠；现在展开后里面折叠状态保持原样。
// 注意：只改 fold 状态，不碰其它状态；撤回由快照完成。
function foldMinimalKeepPath(path) {
  const pathIds = new Set(path.map(n => n.id));
  const selNode = path[path.length - 1];
  const descend = (node) => {
    if (node === selNode) return; // 选中节点自身已 fold，其子树折叠态保持原样，不再下钻（否则会把直接子层误折→展开变逐级）
    (node.children || []).forEach(c => {
      if (pathIds.has(c.id)) { c.fold = false; descend(c); } // 路径链保持展开
      else c.fold = true;                                    // 旁支只折自身（内部折叠状态保持原样）
    });
  };
  descend(currentRoot());
  selNode.fold = true; // 选中节点只折自身：展开后子层还是原来的折叠状态
}
// ===== 右下角常驻折叠层级条（2026-08-30 定）→ 2026-08-30 v2：搬进 Obsidian 官方状态栏 =====
// 不再在 iframe 内画悬浮条（和原生状态栏并排很丑）；前端只算层级状态 postMessage 给宿主，
// 宿主用 addStatusBarItem 渲染进原生状态栏，点击发回前端执行折叠。
// 2026-09-01 定案：左右两入口方案定死，旧 hover 子菜单（buildFoldMenu/bindFoldHover/fold-menu）已删除。
let foldBarClicks = {};   // lvl -> () => 折叠执行（host 回 foldBarRun 时按 lvl 取用）
let foldBarHoverFns = {};  // lvl -> () => hover 高亮（host 回 foldBarHover 时按 lvl 取用）
function updateFoldBar() {
  if (state.historyMode) { vscode.postMessage({ type: 'foldBarState', hidden: true }); return; }
  // ---- 层级参数（Mode A/B 分支）----
  // 2026-09-11 用户定：两个模式都从 1 开始、上限按整棵树最深层级（展示 1-5+，不随选中子树缩小）；
  //   未选中点 1 = 折叠到只剩主节点（foldByLevelPure(0)）；选中点 1 = 只剩选中路径（foldMinimalKeepPath）；
  //   label 恒为数字（不再交替 ↩，再点一次即撤销）；hasSel 随状态发宿主做未选中降透明度。
  let startLvl, maxLvl, clickFn, hoverFn, titleFn;
  const selPath = hasSingleSelection() ? pathTo(currentRoot(), state.selectedId) : null;
  // 整棵树最深 code depth（两个模式的上限都用它）
  let treeMax = 0;
  (function d(n, dp) { if (!n) return; if (dp > treeMax) treeMax = dp; (n.children || []).forEach(c => d(c, dp + 1)); })(currentRoot(), 0);
  if (selPath) {
    const selNode = selPath[selPath.length - 1];
    // Mode B（选中态）：所有数字都是「折叠 ⇄ 撤回」循环（同层再点 = 撤回，换层 = 重新折叠）。
    //   1 = 只剩选中路径（原左下按钮功能）；2.. = 选中子树按相对层折叠。
    //   上限 = 选中子树的层数（D+1）—— 2026-09-11 用户澄清：数字数量随选中变化，
    //   选中浅节点（如倒数第二个）只显示 1-2，不显示用不到的后面数字。
    //   文案统一「从此节点起，折叠到第 X 层级」（1 与其它一致，不提示撤回——用户自己点会发现）
    let D = 0;
    (function d(n, dp) { if (dp > D) D = dp; n.children.forEach(c => d(c, dp + 1)); })(selNode, 0);
    startLvl = 1; maxLvl = D + 1;
    clickFn = (lvl) => foldRunWithUndo(lvl, () => {
      if (lvl === 1) foldMinimalKeepPath(selPath);
      else foldSelByLevelPure(lvl - 1, selPath);
    }, true);
    hoverFn = (lvl) => lvl === 1 ? highlightSelLevel(selNode, 0) : highlightSelLevel(selNode, lvl - 1);
    titleFn = (lvl) => T('fold.selBelow', lvl);
  } else {
    const root = currentRoot();
    if (!root) { vscode.postMessage({ type: 'foldBarState', hidden: true }); return; } // 2026-08-30 防御：树未初始化/解析异常时 root 为 null
    // Mode A（未选中）：所有数字同为「折叠 ⇄ 撤回」循环；1 = 折叠到只剩主节点
    //   （2026-09-11 修：原走 foldByLevelPure(0) 是空操作——其 walk 里 if(d>0) 把根排除，
    //     主节点 fold 从未被置 → 第一层还在；改为直接给主节点自身置 fold）
    //   2026-09-11 用户澄清：**单主节点也要显示「1」**（数几层出几个数字，不再隐藏）
    startLvl = 1; maxLvl = treeMax + 1;
    clickFn = (lvl) => foldRunWithUndo(lvl, () => {
      if (lvl === 1) {
        const root = currentRoot();
        if (root && root.children.length) root.fold = true; // 主节点自身收起 = 画面只剩主节点（快照可撤回）
      } else {
        foldByLevelPure(lvl - 1);
      }
    }, false);
    hoverFn = (lvl) => highlightLevel(lvl - 1);
    titleFn = (lvl) => T('fold.level', lvl);
  }
  // ---- 组状态发宿主：每个 lvl 带 label/title，宿主按 lvl 回 foldBarRun 时前端按 lvl 取执行函数 ----
  const levels = [];
  foldBarClicks = {};
  foldBarHoverFns = {};
  for (let lvl = startLvl; lvl <= maxLvl; lvl++) {
    levels.push({ lvl, label: String(lvl), title: titleFn(lvl) }); // label 恒为数字（用户 2026-09-11：点 1 后不要出现 ↩，再点即撤销）
    foldBarClicks[lvl] = () => clickFn(lvl);
    foldBarHoverFns[lvl] = () => hoverFn(lvl);
  }
  vscode.postMessage({ type: 'foldBarState', levels, hidden: false, hasSel: !!selPath });
}

// ===== 定位按钮（2026-08-28 重做）：主节点 + Now1/2/… + 选中节点 的按钮序列，循环定位 =====
// 子按钮序列：主节点（一直在）、Now1 Now2 …（有当前关注才在，几个几个）、选中节点（选中才在）
// 点主按钮 = 序列往后循环一位；点子按钮 = 直接跳。起点：选中节点项（有选中时）否则主节点项。
let locateIdx = null; // 当前定位项在序列中的 index；null=未开始（下次点主按钮从起点起）
function buildLocateItems() {
  const items = [];
  const root = currentRoot();
  if (!root) return items;
  const selId = state.selectedId;
  // 2026-09-11 用户定：**多级子菜单 + 平级规则** —— 主节点和所有 Now 节点是**平级**的；
  //   只有当某 Now 的**最近感兴趣祖先也是 Now**（Now 套 Now）、或选中节点挂在某 Now 之下时才嵌一级；
  //   最近感兴趣祖先是主节点（或没有）→ 与主节点同级。循环顺序 = 先序 DFS：
  //   主节点 → 与它平级的各分支 → 进入某 Now 的子 Now → … → 回出来到下一分支。
  //   depth 供渲染切层（飞出面板按 depth 挂载，见 buildNowMenu）。
  const typeOf = (n) => {
    if (n.id === root.id) return nodeIsNow(n) ? 'now' : 'root';
    if (nodeIsNow(n)) return 'now';
    if (n.id === selId) return 'selected';
    return null;
  };
  let nowIdx = 0; // Now 序号：locateToItem 靠它点亮当前 Now（丢了会全部变淡紫，2026-09-11 实踩）
  (function walk(n, ancDepth, ancIsNow) {
    const type = typeOf(n);
    if (!type) { (n.children || []).forEach(c => walk(c, ancDepth, ancIsNow)); return; } // 非感兴趣节点：穿过并继承层深
    const depth = n.id === root.id ? 0 : (ancIsNow ? ancDepth + 1 : 0);
    const item = { type, id: n.id, node: n, depth, label: plainTitle(n.title), note: n.note || '' };
    if (type === 'now') item.idx = nowIdx++;
    items.push(item);
    (n.children || []).forEach(c => walk(c, depth, type === 'now'));
  })(root, 0, false);
  return items;
}
// 菜单里显示的节点名 = 纯文本（剥掉 ** 加粗 / ~~ 删除线 符号；格式本身是渲染层效果）
function plainTitle(t) {
  return String(t || '').replace(/\*\*/g, '').replace(/~~/g, '').trim();
}
function locateToItem(item, keepDim, autoBrightMs) {
  if (!item) return;
  if (!activateLocate(item)) return; // 无对应节点（超框）→ 不固化
  locateHoverFixed = true;
  locateFirstClickDone = true;        // 任意确认点击都标记为「已确认」，后续主按钮点击即推进
  locateConfirmedItemId = item.id;    // 记录已确认节点（移出时滚回，避免被后续 hover 预览带偏）
  if (item.type === 'now') { state.nowLocateIndex = item.idx; applyNowLocateAt(item.idx); }
  // 三种收尾（2026-08-30 定）：
  // - 子菜单项点击 / 主按钮首次确认（autoBrightMs 缺省、keepDim=false）：点完立即全亮。
  // - 主按钮推进（autoBrightMs>0）：暗态 1 秒后自动全亮（心理暗示已选中），但仍固化位置（移出不回滚）。
  // - keepDim=true 且无 autoBrightMs（旧逻辑备用）：保持暗态直到鼠标移出才恢复。
  if (locateAutoBrightTimer) { clearTimeout(locateAutoBrightTimer); locateAutoBrightTimer = null; }
  if (autoBrightMs && autoBrightMs > 0) {
    const ms = autoBrightMs;
    locateAutoBrightTimer = setTimeout(() => {
      locateAutoBrightTimer = null;
      clearLocatePredict(); clearNowLocate();
    }, ms);
  } else if (!keepDim) {
    clearLocatePredict(); clearNowLocate();
  }
}
// ===== 定位态（hover 预览 / click 固化 共通）=====
// 两者本质共通：进入「某节点亮 + 其他全暗 + 滚到中央」定位态。
// 区别仅在于 click 会置 locateHoverFixed=true（固化，移出才恢复），hover 不会。
// 阶段1：hover 主按钮 → 子菜单弹出，当前状态对应项加粗，画布不动
// 阶段2：hover 子菜单项 → 该节点到画面中央 + 其它全暗；点击 = 固化；移出 = 未点击则回原位
let locateSavedScroll = null; // hover 子菜单前的滚动位置（移出未点击时还原）
let locateHoverFixed = false;  // 本次 hover 是否已点击固化（true=不移回）
let locateFirstClickDone = false;  // 本次 hover 会话是否已发生过「确认点击」（区分主按钮首次点击）
let locateConfirmedItemId = null;  // 已确认节点 id（鼠标移出时滚回此节点，避免被后续 hover 预览带偏）
let locateAutoBrightTimer = null;  // 主按钮推进后「暗态 1 秒自动全亮」定时器句柄（2026-08-30）
// 仅滚动定位到 item（展开路径 + 居中），不加暗化类；供「确认后鼠标移出滚回」复用
function scrollToItem(item, onDone) {
  if (!item) return false;
  const path = pathTo(currentRoot(), item.id);
  if (path) {
    let changed = false;
    path.forEach(n => { if (n.fold) { n.fold = false; changed = true; } });
    if (changed) { emitUpdate(); render(); }
  }
  const el = document.querySelector('.node-row[data-id="' + item.id + '"] .card');
  if (!el) return false; // 节点超框（无 el）→ 无法定位
  const x = item.type === 'selected' ? cfgNum('--locate-selected-x', 0.5) : cfgNum('--locate-first-x', 0.25);
  placeCardAtViewport(el, x, onDone);
  return true;
}
// 进入定位态：滚动到 item + 高亮 item 节点(locate-predict) + 其它全暗(body.locate-hovering)
// hover 预览与 click 固化共用同一函数（2026-08-30 定：合并简化）
function activateLocate(item) {
  if (!scrollToItem(item)) return false;
  const el = document.querySelector('.node-row[data-id="' + item.id + '"] .card');
  document.querySelectorAll('.card.locate-predict').forEach(c => c.classList.remove('locate-predict'));
  if (el) el.classList.add('locate-predict');
  document.body.classList.add('locate-hovering');
  return true;
}
// hover 子菜单项：预览到中央 + 全暗其它（复用 activateLocate；点击固化后仍可 hover 预览，不做守卫拦截）
function highlightLocateItem(item) {
  if (locateSavedScroll === null) {
    locateSavedScroll = { left: viewMap.scrollLeft, top: viewMap.scrollTop, zoom, panX, panY };
  }
  activateLocate(item);
}
function clearLocatePredict() {
  document.body.classList.remove('locate-hovering');
  document.querySelectorAll('.card.locate-predict, .card.locate-dim').forEach(c => {
    c.classList.remove('locate-predict'); c.classList.remove('locate-dim');
  });
  // 注：不再在此清空 locateSavedScroll / locateHoverFixed。
  // 「回原位的平滑还原」由 hide() 触发；「会话重置（置空 saved/fixed/idx）」统一放到 hide 的 350ms 定时收尾里做，
  // 以免 hover 在子菜单各项间切换时，clearLocatePredict 把「原位置」覆盖成上一项的预览位，导致回滚回错地方。
}

// 定位态高亮（多 Now 时）：给当前定位(idx)的 Now 卡加 now-current、其余加 now-unlocated（document 顺序 = 先序 = collectNowNodes 顺序）
function applyNowLocateAt(idx) {
  const nows = collectNowNodes(currentRoot());
  if (nows.length <= 1) return;
  const icoEls = document.querySelectorAll('.now-ico');
  if (icoEls.length !== nows.length) return; // 渲染集与数据不一致（如开了只显示 Now）→ 不处理，避免错位
  viewMap.classList.add('now-locate-active');
  icoEls.forEach((el, i) => {
    const card = el.closest('.card');
    if (!card) return;
    card.classList.toggle('now-current', i === idx);
    card.classList.toggle('now-unlocated', i !== idx);
  });
}
function applyNowLocate() { applyNowLocateAt(state.nowLocateIndex); }
function clearNowLocate() {
  viewMap.classList.remove('now-locate-active');
  document.querySelectorAll('.card.now-current, .card.now-unlocated').forEach(c => {
    c.classList.remove('now-current'); c.classList.remove('now-unlocated');
  });
}
// 定位按钮悬浮菜单：2026-08-30 Opt1 改为始终弹（哪怕只有主节点），体验统一
// 2026-09-11 用户定：子菜单「三段式自适应对齐」——
//   ① 内容矮：与工具栏「顶对齐」（top:0，原位不动）；
//   ② 内容高到快触屏底：上提，**底边贴工具栏底**（不是按钮格的底！）；
//   ③ 头部提到上限（视口 30% 处）就停，剩下的内容菜单内滚动。
//   注意：#now-menu 挂在 #now-locate-wrap（定位按钮那一小格）里，bottom:0 只能贴到
//   按钮格底 —— 要贴工具栏底得用负 bottom 补齐两者的高差（纯 CSS 算不了，JS 量）。
function alignNowMenu() {
  const m = document.getElementById('now-menu');
  const tb = document.getElementById('left-toolbar');
  const wrap = document.getElementById('now-locate-wrap');
  if (!m || !tb || !wrap) return;
  const vh = window.innerHeight || 800;
  const tbR = tb.getBoundingClientRect();
  const wrapR = wrap.getBoundingClientRect();
  const availBelow = vh - tbR.top - 24;          // 与工具栏顶对齐时，屏幕下方还剩多少（留 24px 边距）
  if (m.scrollHeight <= availBelow) {                                  // ① 短：顶对齐（原位）
    m.style.top = '0'; m.style.bottom = 'auto'; m.style.maxHeight = '';
  } else {                                                             // ②③ 长：底贴工具栏底，头部封顶后滚动
    m.style.top = 'auto';
    m.style.bottom = (-Math.round(tbR.bottom - wrapR.bottom)) + 'px';  // 负 bottom：把底边从按钮格拉到工具栏底
    m.style.maxHeight = Math.max(240, Math.floor(tbR.bottom - Math.max(120, vh * 0.30))) + 'px'; // 头最高到视口 30% 处
  }
}
// 子菜单条目「二次点击进入编辑」（2026-09-11 用户定，融合画布逻辑）：
//   悬浮 = 画布预览漂移；点 1 = 定位 + **选中**（画布选中边框 / 底部工具条 / 快捷键全生效）；
//   再点同一条 = 光标进入**条目内**编辑（原始 Markdown，所见即所存）。
//   提交走与画布编辑同一条数据通路：node.title → pushUndo → emitUpdate（写回源文件）→ render（画布同源更新）。
//   Cmd/Ctrl 组合键放行给画布快捷键（鼠标被菜单占用时靠 Cmd+M 等操作）；普通键就地消费不干扰画布。
let mmEditId = null; // 「已点过一次」的条目 id；再点同一条 = 进入编辑，点别的条 = 重新计数
// 编辑期间锁菜单（2026-09-11 用户：删字后菜单缩小、鼠标被动"离开"→ 菜单闪没）：
// menuEditOn 时 hide() 直接不执行（不收菜单、不回滚画布）；编辑结束（回车/失焦）时
// 若鼠标确实已在菜单外，再补执行收起。
let menuEditOn = false;
let menuEditPendingHide = false;
let requestMenuHide = null; // 由 bindNowLocateHover 注入（hide 在 IIFE 内部）
// 2026-09-11 用户定：子菜单条目编辑期间 = 「操作只在子菜单里，画布完全让位」——
//   编辑像正常文本框（全选/拖选/复制粘贴/删字都原生可用），保存后才同步到画布；
//   Cmd/Ctrl 快捷键照常作用于选中节点（鼠标被菜单占用时的操作手段）。
function startMenuEdit(b, item) {
  const node = item.node;
  const t = b.querySelector('.now-num-title');
  if (!node || !t) return;
  disarmProxy(); // selectNode 会 arm proxy（敲键=替换标题），条目内编辑期间必须让位
  const originalRaw = node.title;
  t.textContent = originalRaw;
  t.contentEditable = 'true';
  t.classList.add('menu-editing');
  menuEditOn = true;
  t.focus();
  try { // 光标移到末尾
    const sel = window.getSelection(), range = document.createRange();
    range.selectNodeContents(t); range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);
  } catch (e) {}
  const finish = (save) => {
    menuEditOn = false;
    t.removeEventListener('keydown', onKey);
    t.removeEventListener('blur', onBlur);
    t.removeEventListener('mousedown', stopEv);
    t.contentEditable = 'false';
    t.classList.remove('menu-editing');
    try { t.blur(); } catch (e) {}
    try { b.focus(); } catch (e) {} // 焦点留在子菜单（条目按钮上）：后续按键走菜单的键盘隔离，不再掉回画布（2026-09-11 用户）
    const raw = save ? t.innerText.replace(/^\n+|\n+$/g, '') : originalRaw; // 首尾空行收掉（与画布同规则）
    if (save && raw !== originalRaw) {
      pushUndo();
      node.title = raw;
      emitUpdate(); // 写回源文件
      render();     // 画布重渲染（同源数据，对应节点自动更新）
      item.label = plainTitle(node.title);
      item.note = node.note || '';
      }
    t.innerHTML = renderInline(node.title || ''); // 回渲染态（同源富文本）
    if (menuEditPendingHide) { menuEditPendingHide = false; if (requestMenuHide) requestMenuHide(); } // 编辑期间鼠标已离开 → 提交后补收菜单
  };
  const onBlur = () => finish(true); // 点击空白 / 收菜单 = 提交（与画布编辑一致）
  const stopEv = (e) => e.stopPropagation(); // 编辑中鼠标事件不出菜单（防画布侧任何响应干扰拖选/光标）
  function onKey(ev) {
    if (ev.isComposing || ev.keyCode === 229) return; // 输入法组字中的 Enter 只是选字上屏，不是保存（缺这条会提前提交+焦点掉回画布）
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); finish(true); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); return; }
    if (ev.key === 'Enter' && ev.shiftKey) { // 与画布一致：Shift+Enter = 存标题、转备注编辑
      ev.preventDefault(); ev.stopPropagation(); finish(true); startMenuNoteEdit(b, item); return;
    }
    if (ev.metaKey || ev.ctrlKey) {
      const k = (ev.key || '').toLowerCase();
      // 复制/剪切/粘贴：编辑框里有选区或正在粘贴 → 原生行为（用户要求全选复制粘贴可用），不路由给画布
      if ((k === 'c' || k === 'x') && String(window.getSelection() || '') !== '') { ev.stopPropagation(); return; }
      if (k === 'v') { ev.stopPropagation(); return; }
      return; // 其余 Cmd/Ctrl 组合键（Cmd+M/N/B…）放行冒泡 → 画布快捷键作用于选中节点
    }
    ev.stopPropagation(); // 普通键就地消费，不干扰画布
  }
  t.addEventListener('keydown', onKey);
  t.addEventListener('blur', onBlur);
  t.addEventListener('mousedown', stopEv);
}
// 条目内备注编辑（标题 Shift+Enter 转入，镜像画布）：备注是纯文本，编辑原文、回车/失焦提交
function startMenuNoteEdit(b, item) {
  const node = item.node;
  if (!node) return;
  let nt = b.querySelector('.now-num-note');
  if (!nt) {
    nt = document.createElement('span');
    nt.className = 'now-num-note';
    const body = b.querySelector('.now-num-body');
    if (body) body.appendChild(nt); else return;
  }
  disarmProxy();
  const originalRaw = node.note || '';
  nt.textContent = originalRaw;
  nt.contentEditable = 'true';
  nt.classList.add('menu-editing');
  menuEditOn = true;
  nt.focus();
  try {
    const sel = window.getSelection(), range = document.createRange();
    range.selectNodeContents(nt); range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);
  } catch (e) {}
  const finish = (save) => {
    menuEditOn = false;
    nt.removeEventListener('keydown', onKey);
    nt.removeEventListener('blur', onBlur);
    nt.removeEventListener('mousedown', stopEv);
    nt.contentEditable = 'false';
    nt.classList.remove('menu-editing');
    try { nt.blur(); } catch (e) {}
    try { b.focus(); } catch (e) {} // 焦点留在子菜单（同上）
    const raw = save ? nt.innerText.replace(/^\n+|\n+$/g, '') : originalRaw;
    if (save && raw !== originalRaw) {
      pushUndo();
      node.note = raw;
      emitUpdate(); // 写回源文件
      render();     // 画布同步
      item.note = raw;
    }
    if (node.note) nt.textContent = node.note;
    else nt.remove(); // 没备注了 → 移除占位
    if (menuEditPendingHide) { menuEditPendingHide = false; if (requestMenuHide) requestMenuHide(); } // 同上：提交后补收
  };
  const onBlur = () => finish(true);
  const stopEv = (e) => e.stopPropagation();
  function onKey(ev) {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); finish(true); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); return; }
    if (ev.metaKey || ev.ctrlKey) {
      const k = (ev.key || '').toLowerCase();
      if ((k === 'c' || k === 'x') && String(window.getSelection() || '') !== '') { ev.stopPropagation(); return; }
      if (k === 'v') { ev.stopPropagation(); return; }
      return;
    }
    ev.stopPropagation();
  }
  nt.addEventListener('keydown', onKey);
  nt.addEventListener('blur', onBlur);
  nt.addEventListener('mousedown', stopEv);
}
// 子菜单（主面板 + 飞出子面板）统一事件隔离（2026-09-11 用户定）：鼠标/滚轮/普通按键不出菜单体系，
//   画布零反应；Cmd/Ctrl 组合键放行 → 画布快捷键照常作用于选中节点。
function isolateMenuEvents(el) {
  el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  ['mousedown', 'mouseup', 'dblclick', 'click'].forEach(ev => el.addEventListener(ev, (e) => e.stopPropagation()));
  el.addEventListener('keydown', menuKeyGuard);
}
function menuKeyGuard(e) {
  if (menuEditOn) return; // 条目编辑框自理（Enter/Esc/Shift+Enter 已在框内处理）
  if (e.metaKey || e.ctrlKey) return; // 组合键放行画布快捷键
  e.stopPropagation(); // 普通按键不外传（画布选中态的 Enter=新建、Shift+Enter=画布备注 收不到）
  if (e.shiftKey && e.key === 'Enter') { // Shift+Enter = 在子菜单里编辑当前项备注（不落到画布）
    // 飞出面板不在 #now-menu 内 → 全局查（DOM 顺序 = 构建顺序 = 先序，与 locateIdx 对齐）
    const btns = document.querySelectorAll('#now-menu .now-num');
    const idx = (locateIdx != null && btns[locateIdx]) ? locateIdx : 0;
    const bEl = btns[idx];
    const items = buildLocateItems();
    if (bEl && items[idx] && !bEl.querySelector('.menu-editing')) startMenuNoteEdit(bEl, items[idx]);
  }
  if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); // 焦点在条目按钮上时抑制按钮激活（回车=确认语义）
}
function buildNowMenu() {
  const menu = document.getElementById('now-menu');
  if (!menu) return;
  menu.innerHTML = '';
  mmEditId = null; // 每次重新弹出菜单，二次点击计数重置
  const items = buildLocateItems();
  // 条目悬浮定位延时（2026-09-11 用户：一悬浮就定位太灵敏）—— 停够 --locate-item-delay-ms 才预览，扫过不动
  let hoverTimer = null;
  const hoverDelay = cfgNum('--locate-item-delay-ms', 200); // 旋钮在 :root「视觉调参区」--locate-hover-delay-ms 的下一行
  // 2026-09-11 用户定（回归）：多级 = 同面板缩进树 —— 平级项（主/顶层 Now）并排，
  //   Now 之下的子 Now / 选中节点按 depth 缩进一级（每级 18px），全部展开同时可见。
  items.forEach((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'now-num' + (i === locateIdx ? ' bold' : '') + (item.type === 'now' ? ' is-now' : '');
    // 多级缩进（2026-09-11 用户定）：Now 之下的子 Now / 选中节点缩进一级（每级 18px）；平级项并排
    if (item.depth) b.style.paddingLeft = (8 + item.depth * 18) + 'px';
    // 不设 b.title：系统原生 tooltip 用户不要（2026-09-11）
    // 2026-09-11 用户定：**与画布节点同源渲染** —— 标题直接用 cardTitleInner(node)
    //   （画布节点卡用的就是它：Minor/Now 前缀图标 + renderInline 富文本，加粗/删除线/链接原样呈现）；
    //   备注放标题**下方**（不左右排）；全文不截断、长了折行（与 .card .title 同款 white-space/word-break）；
    //   菜单项宽度与节点卡一致（max-content，上限同 --card-maxw）。
    const ic = document.createElement('span');
    ic.className = 'now-num-ic';
    ic.innerHTML = item.type === 'root' ? renderIcon('home', 15)
      : item.type === 'now' ? renderNowIcon('bottom')   // 底部工具条那款（更简洁、无火花）；白描边由 CSS 改回 currentColor
      : renderIcon('square-mouse-pointer', 15);
    const body = document.createElement('span');
    body.className = 'now-num-body';
    const t = document.createElement('span');
    t.className = 'now-num-title';
    // 同源 = 内容走同一个渲染引擎 renderInline（加粗/删除线/链接原样）；
    // 不用 cardTitleInner —— 它包含节点卡专属的 Minor/Now 前缀图标，
    // 会和子菜单自己的类型图标重复，且离开 .card 尺寸约束会炸成巨图（2026-09-11 实踩）。
    t.innerHTML = item.node ? renderInline(item.node.title || '') : escapeHtml(item.label);
    // 双击标题 = 进入条目内编辑（与二次点击等效；2026-09-11 用户定「双击写」）
    t.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (!b.querySelector('.menu-editing')) startMenuEdit(b, item);
    });
    body.appendChild(t);
    if (item.note) {
      const nt = document.createElement('span');
      nt.className = 'now-num-note';
      nt.textContent = item.note;
      // 双击备注 = 条目内编辑备注（2026-09-11 用户定；不再漏到画布的真节点上）
      nt.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (!b.querySelector('.menu-editing')) startMenuNoteEdit(b, item);
      });
      body.appendChild(nt);
    }
    b.appendChild(ic);
    b.appendChild(body);
    b.onclick = (e) => {
      e.stopPropagation();
      // 编辑中：条目内点击属于文本操作（挪光标/拖选后松开），不当作"再点一次"（否则 selectNode 抢焦点、选区塌掉）
      if (b.querySelector('.menu-editing')) return;
      // 点在备注上：只定位/选中，不累计标题的「二次点击」（备注用双击进编辑，2026-09-11 用户定）
      if (e.target.closest('.now-num-note')) return;
      locateIdx = i;
      locateToItem(item);
      selectNode(item.id); // 与画布一致：定位的同时选中（选中边框 / 底部工具条 / 快捷键全生效）
      updateNowMenuBold();
      // 二次点击同一条 = 进入条目内编辑；点别的条 = 重新计数（2026-09-11 用户定）
      if (mmEditId === item.id) { mmEditId = null; startMenuEdit(b, item); }
      else mmEditId = item.id;
    };
    // 2026-08-30 Bug：hover 只高亮不定位（点击才定位）；高亮超画框的节点无 el → 不动，符合"超了不管"
    // 悬浮延时定位：停够 --locate-item-delay-ms 才预览（0=立刻，旧行为）；移开/重建菜单即取消
    b.addEventListener('mouseenter', () => {
      if (menuEditOn) return; // 编辑中：划过其它条目不触发定位预览（用户在打字，别带着画布乱跑）
      if (!menu.classList.contains('open')) return;
      if (!(hoverDelay > 0)) { highlightLocateItem(item); return; }
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { if (menu.classList.contains('open')) highlightLocateItem(item); }, hoverDelay);
    });
    b.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
    menu.appendChild(b);
  });
}
// 同步悬浮菜单里当前 locateIdx 对应按钮的加粗态
function updateNowMenuBold() {
  const menu = document.getElementById('now-menu');
  if (!menu) return;
  menu.querySelectorAll('.now-num').forEach((b, i) => b.classList.toggle('bold', i === locateIdx));
}
// 悬浮定位按钮：浮出菜单；阶段1=hover主按钮时高亮子菜单当前项（画布正常），阶段2=hover子菜单项时预览到中央+全暗其它
(function bindNowLocateHover() {
  const wrap = document.getElementById('now-locate-wrap');
  const menu = document.getElementById('now-menu');
  const btn = document.getElementById('btn-locate');
  if (!wrap || !menu || !btn) return;
  // 滚轮只滚菜单，不带动后面的画布（2026-09-11 用户）：画布的滚轮平移是 JS 监听，
  // 靠事件冒泡触发 —— overscroll-behavior 拦不住它，必须在这里把 wheel 事件截住不外传。
  // passive:true = 不阻止默认行为（菜单自身的原生滚动照常），只切断冒泡。
  // 菜单与飞出子面板统一隔离（鼠标/滚轮/普通按键不出菜单体系，画布零反应；Cmd/Ctrl 放行）
  isolateMenuEvents(menu);
  let timer = null;     // 收菜单计时（原有）
  let openTimer = null; // 悬停延时开启计时（2026-08-31 加：防扫过误触）
  const cancelPendingOpen = () => { if (openTimer) { clearTimeout(openTimer); openTimer = null; } };
  const show = () => {
    clearTimeout(timer);
    buildNowMenu(); menu.classList.add('open');
    alignNowMenu(); // 三段式自适应对齐（见函数注释）
    // 阶段1：hover 主按钮 → 子菜单弹出并预览定位到"当前状态对应项"（2026-08-30 新需求：主按钮 hover 即定位预测，画布滚过去+其他变暗）
    // 当前状态 = 选中节点（若有）否则主节点；locateIdx 有值用它
    const items = buildLocateItems();
    if (items.length) {
      let predIdx = locateIdx;
      if (predIdx == null) {
        const selId = state.selectedId;
        predIdx = selId ? items.findIndex(it => it.id === selId) : 0;
        if (predIdx < 0) predIdx = 0;
      }
      updateNowMenuBoldAt(predIdx);
      // 主按钮 hover 即进入定位态（预测），画面滚到该节点
      if (locateSavedScroll === null) {
        locateSavedScroll = { left: viewMap.scrollLeft, top: viewMap.scrollTop, zoom, panX, panY };
      }
      activateLocate(items[predIdx]);
    }
  };
  // 缓动平移动画总开关（locateSmoothOn）：
  // - 鼠标停在定位按钮/子菜单上 = 开（mouseenter 处已置 true），hover 预览平滑移动；
  // - 离开时：若本次 hover 没点击固化 → 平滑回滚到「原位置」（回滚期间开，动画结束 onDone 再关）；
  //   若已点击固化 / 无原位置 → 直接关（画面停在当前项，不回滚）。
  const hide = () => {
    if (menuEditOn) { menuEditPendingHide = true; return; } // 编辑中锁菜单：删字导致菜单缩小、鼠标被动离开也不收（提交时再补收）
    cancelPendingOpen(); // 还没弹出就离开 → 取消待弹（画布也不会被带偏）
    if (locateHoverFixed && locateConfirmedItemId) {
      // 已确认：退出时平滑滚回已确认节点（而不是停在上次 hover 预览的位置），到位瞬间关掉平滑 + 全亮
      const item = (buildLocateItems()).find(it => it.id === locateConfirmedItemId);
      locateSmoothOn = true;
      if (item && scrollToItem(item, () => { locateSmoothOn = false; clearLocatePredict(); clearNowLocate(); })) {
        // onDone 已处理：滚回 + 全亮
      } else {
        locateSmoothOn = false; clearLocatePredict(); clearNowLocate();
      }
    } else if (!locateHoverFixed && locateSavedScroll) {
      // 未点击：回原位（进菜单前的位置）；smooth 全程开，动画结束后由 onDone 关掉
      locateSmoothOn = true;
      const s = locateSavedScroll;
      animateScrollTo(s.left, s.top, s.zoom, s.panX, s.panY, () => { locateSmoothOn = false; });
    } else {
      locateSmoothOn = false;
    }
    timer = setTimeout(() => {
      menu.classList.remove('open');
      clearLocatePredict(); clearNowLocate();
      if (locateAutoBrightTimer) { clearTimeout(locateAutoBrightTimer); locateAutoBrightTimer = null; }
      locateIdx = null; state.nowLocateIndex = 0;
      locateSavedScroll = null; locateHoverFixed = false;
      locateFirstClickDone = false; locateConfirmedItemId = null; // 会话重置：下一轮 hover 重新记原位置
    }, 350);
  };
  // 悬停延时开启：鼠标停在按钮上 --locate-hover-delay-ms 毫秒后才真正弹出（2026-08-31 加）
  const scheduleShow = () => {
    cancelPendingOpen();
    const d = cfgNum('--locate-hover-delay-ms', 320); // 旋钮在 mindmap-app.css 顶部「视觉调参区」→「定位按钮」
    if (!(d > 0)) { show(); return; } // 0/负 = 立刻弹（沿用旧行为）
    openTimer = setTimeout(() => { openTimer = null; show(); }, d);
  };
  btn.addEventListener('mouseenter', () => { locateSmoothOn = true; scheduleShow(); });
  // 延时未到就移开按钮（只是扫过）→ 取消待弹：不弹菜单、也不触发定位预览（画布不动）
  btn.addEventListener('mouseleave', () => { if (openTimer) cancelPendingOpen(); });
  wrap.addEventListener('mouseleave', hide);
  menu.addEventListener('mouseenter', () => { locateSmoothOn = true; clearTimeout(timer); menuEditPendingHide = false; });
  menu.addEventListener('mouseleave', hide);
  requestMenuHide = () => hide(); // 供条目编辑结束时补收（编辑中锁菜单，见 hide 守卫）
})();
// 高亮子菜单第 idx 项（加粗），其余不加粗
function updateNowMenuBoldAt(idx) {
  const menu = document.getElementById('now-menu');
  if (!menu) return;
  menu.querySelectorAll('.now-num').forEach((b, i) => b.classList.toggle('bold', i === idx));
}

// 隐藏完成初始激活态（persist=false：加载阶段还没收到 init，不回写避免覆盖已存状态，2026-08-24 P1）
setHideDone(state.hideDone, false);
updateDefaultPathBtn();
updateUndoRedo();

// 定位按钮（2026-08-28 重做）：点主按钮 = 在「主节点/Now1/Now2/…/选中节点」序列里往后循环一位
// 起点：选中节点项（有选中时）否则主节点项；点了子按钮后从该按钮起循环
document.getElementById('btn-locate').onclick = () => {
  const items = buildLocateItems();
  if (!items.length) { resetView(); return; }
  // 起点：选中节点（无论它是 now 项还是 selected 项，按 id 命中）否则主节点（2026-08-30 Opt2/3：从选中 now 开始循环）
  const selId = state.selectedId;
  let startIdx = 0;
  if (selId) { const i = items.findIndex(it => it.id === selId); if (i >= 0) startIdx = i; }
  if (!locateFirstClickDone) {
    // 首次点击：确认当前 hover 预测的位置（不前进），并全亮——修复「第一下像失灵」的体感
    locateFirstClickDone = true;
    let predIdx = locateIdx;
    if (predIdx == null) predIdx = startIdx;
    locateIdx = predIdx;
    locateToItem(items[predIdx], false); // 确认即全亮
  } else {
    // 第二次及以后：在序列里推进一位，沿用旧逻辑（变暗直到鼠标移出）
    if (locateIdx == null) locateIdx = startIdx;
    else     locateIdx = (locateIdx + 1) % items.length;
    locateToItem(items[locateIdx], false, cfgNum('--locate-autobright-ms', 1000)); // 主按钮推进：暗态 N 毫秒后自动全亮，时长见 CSS --locate-autobright-ms
  }
  const menu = document.getElementById('now-menu');
  if (menu && menu.classList.contains('open')) requestAnimationFrame(updateNowMenuBold);
};
// 侧边按钮：切换「只显示当前关注 Now」（无 Now 时 disabled，点不到）
const btnNowSide = document.getElementById('btn-now-side');
if (btnNowSide) btnNowSide.onclick = () => { if (!btnNowSide.disabled) setShowNow(!state.showNow); };
if (btnNowSide) applyProGate(btnNowSide); // Pro 卡点（2026-09-04）：侧边 Now 按钮
// 初始刷新侧边 Now 按钮态（无 Now→置灰；实际激活态由 init 收到的 msg.showNow 经 setShowNow 应用）
updateNowSideBtn();
// 2026-08-30：无 Minor 时按钮加的是 .disabled 类（不用 disabled 属性，为保留 hover tooltip）→ onclick 必须自己拦
document.getElementById('btn-hide-done').onclick = () => {
  const b = document.getElementById('btn-hide-done');
  if (!b || b.disabled || b.classList.contains('disabled')) return;
  setHideDone(!state.hideDone);
};
applyProGate(document.getElementById('btn-hide-done')); // Pro 卡点（2026-09-04）：Minor（隐藏完成）按钮
// 2026-08-30 恢复：更多菜单「路径链接」hover 浮出的子菜单 4 项（HTML 见 main.js #default-path-menu）
// 全部走存在性守卫：元素缺失时静默跳过，绝不 null.onclick 中断初始化（2026-08-30 所有导图打不开的教训）
(function initPathSubmenu() {
  const sub = document.getElementById('default-path-menu');
  if (!sub) return;
  sub.querySelectorAll('.dp-ic').forEach(span => {
    const name = ICON_FIXED[span.dataset.ic];
    if (name) span.innerHTML = renderIcon(name, 16);
  });
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('mi-path-back', historyBack);
  on('mi-path-fwd', historyForward);
  on('mi-path-default', returnToDefault);
  on('mi-path-save', saveAsCurrent);
})();
updatePathMenuBtns(); // 子菜单 4 项初始置灰态（函数内有 if 守卫，无按钮时不报错）
// 更多：纯 hover 浮出（CSS #more-wrap:hover #more-menu），点击不再 toggle（避免 toggleMoreMenu 的 fixed 内联定位覆盖 hover 样式）
document.getElementById('btn-more').onclick = (e) => { e.stopPropagation(); };
// 工具栏 hover 子菜单（slash 路径菜单 / more 更多菜单）：JS 控制显隐，mouseleave 延迟 220ms 关闭
// —— 避免纯 CSS :hover 在「按钮 ↔ 菜单」间隙的死区导致鼠标一移出按钮菜单就消失、点不到
function bindHoverMenu(wrapId, menuId, useFixed, keepAliveSel) {
  const wrap = document.getElementById(wrapId);
  const menu = document.getElementById(menuId);
  if (!wrap || !menu) return;
  let timer = null;
  // 2026-08-28：useFixed=true 时菜单用 position:fixed + 按 wrap 视口坐标定位——逃出父级 overflow
  // 裁剪域（如 more-menu 的 overflow-y:auto 会裁掉内嵌 absolute 子菜单）。菜单向上展开（顶部对齐 wrap 顶部 - menuHeight），
  // 底部对齐 wrap 底部，位置更靠上贴近触发按钮（2026-08-28）
  const show = () => {
    clearTimeout(timer);
    menu._hoverTimer = null;
    // 已打开时直接跳过：避免每次 mouseenter 都重跑「visibility:hidden 量尺寸→恢复」导致菜单瞬间
    // 失焦触发 mouseleave、220ms 后即使鼠标还在上面也关掉（即「hover 子子菜单就消失」的根因）
    if (useFixed && !menu.classList.contains('open')) {
      // 关键：把子菜单挪到 body 顶层（portal），彻底脱离 more-menu 的 overflow/transform 裁剪域。
      // 此前「隐在菜单里 / 非常异常」的根因就是子菜单嵌套在 overflow:auto 容器里被裁，
      // 或 position:fixed 受 transform 祖先影响变成相对祖先定位而乱飞。挪出来后 fixed 恒对视口。
      if (menu.parentElement !== document.body) document.body.appendChild(menu);
      const r = wrap.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.bottom = 'auto'; // 清掉 CSS .dp-menu 残留的 bottom:-1px，避免 top/bottom 同时生效歧义
      menu.style.visibility = 'hidden';
      menu.classList.add('open'); // 先显示以便量取真实尺寸
      const w = menu.offsetWidth, h = menu.offsetHeight;
      let left = r.right; // 默认在「链接」按钮右侧浮出
      if (left + w > window.innerWidth - 8) left = r.left - w; // 右溢出则翻到按钮左侧
      menu.style.left = left + 'px';
      menu.style.top = Math.max(8, r.bottom - h) + 'px'; // 底部对齐按钮底部（更靠上，贴近触发钮）；贴顶兜底
      menu.style.visibility = '';
    }
    menu.classList.add('open');
  };
  const hide = () => {
    // keepAliveSel：若指定的「子子菜单」仍打开，则本菜单保持打开并轮询，直到子菜单关闭再真正收起
    // （否则 hover 子子菜单时本菜单 mouseleave 会把它关掉，整条 hover 链断掉）
    if (keepAliveSel) {
      const alive = document.querySelector(keepAliveSel);
      if (alive && alive.classList.contains('open')) { timer = setTimeout(hide, 160); return; }
    }
    timer = setTimeout(() => menu.classList.remove('open'), 220);
  };
  wrap.addEventListener('mouseenter', show);
  wrap.addEventListener('mouseleave', hide);
  menu.addEventListener('mouseenter', show);
  menu.addEventListener('mouseleave', hide);
}
bindHoverMenu('more-wrap', 'more-menu', false, '#default-path-menu'); // 子子菜单打开时「更多」菜单保持不关
bindHoverMenu('mm-link-wrap', 'default-path-menu', true); // 2026-08-28：fixed 定位逃出 more-menu 裁剪

// 三个点菜单（#more-menu）初始化（图 + 文字 + 快捷键）
(function initMoreMenu() {
  const menu = document.getElementById('more-menu');
  if (!menu) return;
  menu.querySelectorAll('.mm').forEach(btn => {
    const icon = btn.dataset.icon;
    const label = btn.dataset.label || '';
    const kbd = btn.dataset.shortcut || '';
    btn.innerHTML = renderIcon(icon, 16) + '<span class="mm-label">' + label + '</span>' + (kbd ? '<span class="kbd">' + kbd + '</span>' : '');
    btn.dataset.side = 'left'; // 菜单在按钮左侧 → tooltip 向左浮动
  });
})();
document.getElementById('more-menu').querySelectorAll('.mm').forEach(btn => {
  btn.onclick = e => {
    e.stopPropagation();
    const act = btn.dataset.act;
    if (act === 'add-child') addChild();
    else if (act === 'add-sibling') addSibling();
    else if (act === 'delete') deleteNode();
    else if (act === 'undo') doUndo();
    else if (act === 'redo') doRedo();
    else if (act === 'default-path') { if (!btn.disabled) returnToDefault(); }
    else if (act === 'toggle-debug') setDebugMode(!debugMode);
    else if (act === 'toggle-view') switchView();
    else if (act === 'history') openHistoryPanel();
    else if (act === 'save-snapshot') manualSaveSnapshot();
    else if (act === 'join-group') openUrl(JOIN_GROUP_URL); // 更多菜单「加入 28 Notes 微信群」（2026-09-07）
    else if (act === 'about') vscode.postMessage({ type: 'openUrl', url: 'https://space.bilibili.com/481595180' });
    else if (act === 'settings') { vscode.postMessage({ type: 'log', text: '更多菜单→打开设置请求发出' }); vscode.postMessage({ type: 'openSettings' }); } // 更多菜单「设置与 bug 提报」（2026-09-01）
    document.getElementById('more-menu').classList.remove('open');
  };
});
// 点击外部关闭 more-menu（hover 模式：移除 .open）
document.addEventListener('mousedown', (e) => {
  const menu = document.getElementById('more-menu');
  if (!menu.classList.contains('open')) return;
  if (e.target.closest('#more-menu') || e.target.closest('#btn-more') || e.target.closest('.node-menu')) return;
  menu.classList.remove('open');
});
// 拖拽结束兜底：拖到任何地方松开（不一定 drop 到有效区域）都清 dragId/预览（2026-08-22 飞书式预测）
document.addEventListener('dragend', () => {
  state.dragId = null;
  state.dragIds = null;
  state.dragRows = null;
  state.dragRects = null; state.dragW = 0; // 清拖拽矩形缓存
  if (state._dragRAF) { cancelAnimationFrame(state._dragRAF); state._dragRAF = null; }
  state.dragPreview = null;
  state.dragGrabDX = 0; state.dragGrabDY = 0;
  cleanupDragGhost(); // 兜底（ESC 取消/拖出窗口等未走 drop 的路径）
  stopAutoScroll();
  clearDragHighlights();
});
// 左工具栏刷新按钮（调试开关开时显示；图标 lucide:refresh-ccw-dot）
const btnRefresh = document.getElementById('btn-refresh');
if (btnRefresh) {
  btnRefresh.innerHTML = renderIcon('refresh-ccw-dot', 18);
  btnRefresh.onclick = () => vscode.postMessage({ type: 'refreshData' });
}

wlog('webview 脚本加载完成，发送 ready');
window.__MM_FLUSH__ = persistNow; // 宿主 rebind 重建 iframe 前同步调用，把当前 view 立即落盘（2026-09-01 修源思维导图切走丢位置）
vscode.postMessage({ type: 'ready' });
