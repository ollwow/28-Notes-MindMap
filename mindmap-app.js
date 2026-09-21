// MM MindMap —— 导图界面（垂直树布局 + 交互 + 视图切换 + 格式校验）
// 布局为简单垂直树（从上往下）。美化留待后续统一调整。

// ===== 错误捕获层（调试用）=====
// Obsidian 移植：本脚本运行在视图 iframe 内，宿主（main.js）在注入本脚本前挂 window.__MM_HOST__。
// 前端 → 宿主消息协议与 VSCode 版一致（postMessage({type,...})），宿主直接函数调用处理；
// 宿主 → 前端走 iframe contentWindow.postMessage（下方 window message 监听不变）。
const vscodeApi = (typeof window !== 'undefined' && window.__MM_HOST__) || { postMessage() {} };
function wlog(t) { try { vscodeApi.postMessage({ type: 'log', text: String(t) }); } catch (_) {} }
//（原 --img-missing-text 已于 2026-09-17 移除：缺失占位改用 <img> 的 alt 文本 —— 伪元素在替换元素上不渲染）
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
  el.style.background = isWarn ? 'var(--toast-warn-bg)' : 'var(--toast-info-bg)';
  el.style.color = isWarn ? 'var(--toast-warn-text)' : 'var(--toast-info-text)';
  el.style.border = isWarn ? '1px solid var(--toast-warn-line)' : '1px solid var(--toast-info-line)';
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
const state = { tree: null, selectedId: null, dragId: null, dragIds: null, view: 'map', currentRootId: null, currentRootPid: '', defaultPid: '', currentFilename: '', warnings: [], selectedImg: null, multiSelected: new Set(), marquee: false, isLink: false, bookmarkHealed: false, bookmarkRetried: false, editingNoteId: null, hideDone: false, hideHint: false, editingTitleId: null, editingTitleEl: null, editingEl: null, dragPreview: null, dragRows: null,
  // 路径历史栈（上一/下一路径）：存 pid 序列，空串=根
  pathHistory: [], pathHistoryIndex: -1, suppressHistory: false,
  // 刚新建的节点 id 集合：仅这些节点在「清空回车 / ESC」时取消（删节点），已有节点清空只回退、绝不误删
  justCreated: new Set(),
  // 历史记录页（2026-08-27）
  historyMode: false,
  historyText: '',           // 当前正在查看的快照原始文本
  historyTree: null,         // 解析后的快照树
  historyCurrentTs: 0,       // 当前查看的快照时间戳（0 = 不在只读态）
  historyName: '',           // 当前查看的快照名字（画布自己的（用户给这一版起的名字），还原时随消息带给宿主当标签用）
  historyNote: '',           // 横幅下方的常驻提示（「与当前完全相同 / 只差主节点…」；空 = 不显示。2026-09-14 由 toast 改常驻）
  historyDiffIds: new Set(), // 与当前文档有差异的节点 id
  nowLocateIndex: 0,         // 当前定位的 Now 序号（定位按钮循环/悬浮菜单用；正常模式必初始化，否则 locateCenter 取模得 NaN 报错，2026-08-27 修）
  liveTree: null,           // 进入历史页前的真实文档树（差异比对基线 + 关闭时还原），历史页期间 state.tree 指向快照树
  morePanel: null,          // 左下「更多」菜单的条目显隐（设置页「更多面板简化」；顺序固定，随 init / setMorePanel 下发，2026-09-18）
  canvasHotkeys: null,      // 画布键位表 { match: 归一化串→动作, disp: 动作→显示串 }（唯一真相源 = 原生快捷键页，随 init / setCanvasHotkeys 下发，2026-09-18）
  // （待办按钮的角色互换标志 state.todoBtnSwapped 已随「Done 槽」一起删除：2026-09-21 起只剩一个待办按钮）
  // 画布背景色（2026-09-20，设置页「界面样式」左边的调色板小窗）：每档各存一个，空 = 不覆盖、用 CSS 里的主题默认。
  // 明暗档（跟随 / 强制浅 / 强制深）在宿主侧算完，前端只收「这回该深还是浅」的结论（msg.dark）。
  canvasBgLight: '',
  canvasBgDark: ''
};

// 拖拽预测：找落点（重构为「结构化空间分区」，替代原先的欧氏最近 + 手写 if/else）
//   核心思路：垂直树里「深度 = 列（从左往右加深）」、同列节点按 Y 排成连续区间 → 任何坐标都恰好对应一个 (列, 行)。
// 拖拽落点预测（2026-08-27 第三版：重做判定层 —— 从「离谁近」改成「命中一个盒就是谁的落点」）：
//   【目标选择】卡片上精确命中优先；空白区「X 过滤 + Y 最近」：
//   先剔除两类卡片——①横向离光标太远（修 2026-08-28 纯 Y 带在稀疏/密集混合区跳到远处同高卡片的问题：
//   光标在左边，目标却锁到右边同 Y 的无关卡片上）②被拖节点自身/其子树（修拖到自家附近
//   「哪里都没有预测到」：预选过滤后会落到最近的有效目标，而不是判 invalid 什么都不显示）；
//   再在候选内取中心 Y 最近者。X 只作过滤、不参与排序——拖到 2 右侧时 2 仍在候选内且 Y 最近，
//   不会退回「X 选列、越过深层卡片左缘就跳 1.4」的老坑（2026-08-25 踩坑定案依旧成立）。
//   【判定层：兄弟是默认、子节点是特例】
//   ① 卡片上 → 内 Y 三段 before/after/over（保留）
//   ② 空白区以目标中心算偏差：纵向偏出卡片半高（=落在卡片间缝隙）→ 一律兄弟 before/after
//      ——缝隙拖拽不再误判成子节点（旧版「右缘以右全算 over」是预测不准的主根因）
//   ③ 纵向同高且向右 → 右缘外 max(被拖卡宽, 目标卡宽)×旋钮(--drop-child-range) 之内才算子节点，
//      之外 = 兄弟（判据：横向伸出量 < max(被拖卡宽, 目标卡宽) 且纵向不超过半个卡高才算吸附；被拖节点尺寸参与判定）
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
      let position = frac < 0.3 ? 'before' : frac > 0.7 ? 'after' : 'over';
      // 换挡余量（2026-09-20，旋钮 --drop-sticky）：同一个目标上，要越过判定线再多一点才换挡。
      // 没有它，光标在 30%/70% 线附近抖一抖，落点就在 before/over/after 之间反复横跳，
      // 而预测线的起点按语义在「目标卡」与「它的父卡」之间切换 → 线一闪往上、一闪往下。
      const prev = (state._lastDrop && state._lastDrop.targetId === it.id) ? state._lastDrop.position : null;
      const m = cfgNum('--drop-sticky', 0.08);
      if (prev && prev !== position) {
        if (prev === 'before' && frac < 0.3 + m) position = 'before';
        else if (prev === 'after' && frac > 0.7 - m) position = 'after';
        else if (prev === 'over' && frac >= 0.3 - m && frac <= 0.7 + m) position = 'over';
      }
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

  // 目标是当前根 → 只能变子节点（根没有兄弟，不存在 before/after 这两种落点）
  if (band.id === currentRoot().id) return { targetId: band.id, position: 'over', rect: band };

  // 被拖卡片宽度参与判定（取被拖与目标两者较宽的那个——拖着大树往大空白处放，更容易吸附成子节点）
  const dragW = state.dragW || 0; // 拖拽开始一次性快照（buildDragRects），避免每次拖拽移动都读布局
  const dx = clientX - band.cx;
  const dy = clientY - band.cy;

  // ③ 纵向偏出卡片半高（落在卡片间缝隙）→ 一律兄弟插入
  if (Math.abs(dy) > band.h / 2) return { targetId: band.id, position: dy < 0 ? 'before' : 'after', rect: band };

  // ④ 纵向同高：向右在吸附范围内 → 子节点；范围外（含左侧走廊）→ 兄弟
  //    同款换挡余量：上一刻已经是「变子节点」→ 吸附范围放宽 15% 才肯离开（见上面 --drop-sticky 注释）
  const prevB = (state._lastDrop && state._lastDrop.targetId === band.id) ? state._lastDrop.position : null;
  const childRange = cfgNum('--drop-child-range', 1) * (prevB === 'over' ? 1.15 : 1);
  if (dx > 0 && dx <= band.w / 2 + Math.max(dragW, band.w) * childRange) {
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
// 落点列 x（树内坐标）：预测线**终点**的下限 —— 变子=末子左缘 / 无子=父右缘+--gap-x；兄弟插入=目标卡左缘。
// 单独抽成函数（2026-09-20）：落位动画的起点必须与预测线终点**同源**，否则卡片从松手处起步、
// 线却画在落点列上，两者错开一截，看着就是「线从别处闪过去」。
function dropColumnLocalX(dp, tr, s) {
  if (!dp || !dp.targetId) return null;
  const srcId = dp.position === 'over' ? dp.targetId : parentId(dp.targetId);
  const srcRow = srcId && document.querySelector('.node-row[data-id="' + srcId + '"]');
  const srcCard = srcRow && srcRow.querySelector(':scope > .card');
  if (!srcCard) return null;
  const cr = srcCard.getBoundingClientRect();
  if (cr.width < 1 || cr.height < 1) return null;
  if (dp.position === 'over') {
    const kidCards = srcRow.querySelectorAll(':scope > .children > .node-row > .card');
    return kidCards.length ? (kidCards[kidCards.length - 1].getBoundingClientRect().left - tr.left) / s
                           : (cr.right - tr.left) / s + cfgNum('--gap-x', 80); // 无可见子：第一个子挂 --gap-x 处
  }
  const tRow = document.querySelector('.node-row[data-id="' + dp.targetId + '"]');
  const tCard = tRow && tRow.querySelector(':scope > .card');
  if (!tCard) return null;
  const kr = tCard.getBoundingClientRect();
  if (kr.width < 1 || kr.height < 1) return null;
  return (kr.left - tr.left) / s;
}
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
  const colX = dropColumnLocalX(dp, tr, s);
  if (colX == null) { dragSvg.innerHTML = ''; return; }
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
  'command': '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  'slash': '<path d="M2 22 22 2"/>',
  'text-quote': '<path d="M17 5H3"/><path d="M21 12H8"/><path d="M21 19H8"/><path d="M3 12v7"/>',
  'home': '<path d="M21 19v-6.733a4 4 0 0 0-1.245-2.9L13.378 3.31a2 2 0 0 0-2.755 0L4.245 9.367A4 4 0 0 0 3 12.267V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2"/>',
  'square-mouse-pointer': '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/>',
  'squircle-dashed': '<path d="M13.77 3.043a34 34 0 0 0-3.54 0"/><path d="M13.771 20.956a33 33 0 0 1-3.541.001"/><path d="M20.18 17.74c-.51 1.15-1.29 1.93-2.439 2.44"/><path d="M20.18 6.259c-.51-1.148-1.291-1.929-2.44-2.438"/><path d="M20.957 10.23a33 33 0 0 1 0 3.54"/><path d="M3.043 10.23a34 34 0 0 0 .001 3.541"/><path d="M6.26 20.179c-1.15-.508-1.93-1.29-2.44-2.438"/><path d="M6.26 3.82c-1.149.51-1.931 1.291-2.44 2.44"/>',
  'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  // 左下过滤按钮（隐藏 Minor / 已完成待办）三态：eye（无/未隐藏）与 eye-off（已隐藏）—— 2026-09-21 用户定
  'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'bold': '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  'circle': '<circle cx="12" cy="12" r="10"/>',
  'circle-dot': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  // 复制 AI 定位路径（2026-09-01）：lucide astroid 图标，呼应「AI 星体 / 定位节点」语义
  'astroid': '<path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203" />', // 复制 AI 定位路径图标（2026-09-01 改自 lucide astroid，呼应「AI 星体/定位」语义）
  'trash-2': '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  // 右键菜单「基础操作」四项（2026-09-21 加，均为 lucide 描边式）
  'clipboard': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
  'clipboard-paste': '<path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M9 14h10"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'arrow-right-from-line': '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m11 8 4 4-4 4"/>',
  'arrow-left-to-line': '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m11 8-4 4 4 4"/>',
  'file-pen': '<path d="M11.5 22H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l5 5v6.5"/><path d="M18 22l4-4"/><path d="m15 19 2 2"/><path d="M14 22h-3.5a2 2 0 0 1 0-4H14"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'refresh-ccw-dot': '<path d="M21 12a9 9 0 0 0-9-9a9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5m-5 4a9 9 0 0 0 9 9a9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/><circle cx="12" cy="12" r="1"/>',
  'bug': '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 20v-9m2-4a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4zm.12-3.12L16 2"/><path d="M21 21a4 4 0 0 0-3.81-4M21 5a4 4 0 0 1-3.55 3.97M22 13h-4M3 21a4 4 0 0 1 3.81-4M3 5a4 4 0 0 0 3.55 3.97M6 13H2M8 2l1.88 1.88M9 7.13V6a3 3 0 1 1 6 0v1.13"/></g>',
  'text-initial': '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5h6m-6 7h6M3 19h18M3 12l3.553-7.724a.5.5 0 0 1 .894 0L11 12m-7.08-2h6.16"/>',
  'log-in': '<path d="m10 17l5-5l-5-5m5 5H3m12-9h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
  // 历史横幅「创建副本」（2026-09-14 定）：lucide bookmark —— 沿用原来面板那个按钮的图标
  'bookmark': '<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>',
  'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  // 保存为捷径（2026-09-01 定）：lucide split
  'split': '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'chevrons-down-up': '<path d="m7 20l5-5l5 5M7 4l5 5l5-5"/>',
  'move-down': '<path d="M8 18L12 22L16 18"/><path d="M12 2V22"/>',
  'chevrons-down': '<path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/>',
  'asterisk': '<path d="M12 6v12"/><path d="M17.196 9 6.804 15"/><path d="m6.804 9 10.392 6"/>',
  // Minor 图标（2026-09-20 用户定稿：arrow-down；底部按钮与卡片默认图标都用它）
  //   （实验期其它候选已删：arrow-down-to-dot / triangle-down / package-2 / cuboid / chevron-down / chevrons-down 仍留作通用图标）
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  'line-dot-right-horizontal': '<path d="M 3 12 L 15 12"/><circle cx="18" cy="12" r="3"/>',
  // 「隐藏 Minor / Done」按钮的两个形状（2026-09-20 第三轮：用户定「用回改版前那套」）
  //   squircle-dashed     = 虚线圆角方框（显示态；视图里既无 Minor 也无 Done 时置灰，有则正常色）—— 定义在下面
  //   squircle-dashed-off = 同一图形 + 一条斜杠（已筛选态，主题色由 .active-hide 提供）
  // 斜杠描了一条「挖空边」（halo）：压在虚线框上时能断开下面的线。边色跟画布底色（--bg），
  // 于是深色主题、用户自定义底色都自动正确；要单独调就设 --hide-ico-halo。
  'squircle-dashed-off': '<path d="M13.77 3.043a34 34 0 0 0-3.54 0"/><path d="M13.771 20.956a33 33 0 0 1-3.541.001"/><path d="M20.18 17.74c-.51 1.15-1.29 1.93-2.439 2.44"/><path d="M20.18 6.259c-.51-1.148-1.291-1.929-2.44-2.438"/><path d="M20.957 10.23a33 33 0 0 1 0 3.54"/><path d="M3.043 10.23a34 34 0 0 0 .001 3.541"/><path d="M6.26 20.179c-1.15-.508-1.93-1.29-2.44-2.438"/><path d="M6.26 3.82c-1.149.51-1.931 1.291-2.44 2.44"/><path d="M21 21L3 3" stroke="var(--hide-ico-halo, var(--bg, #fff))" stroke-width="3.7"/><path d="M21 21L3 3" stroke="currentColor" stroke-width="2.125"/>',
  // 历史记录（2026-08-27）：时钟回绕，表示"回到过去某个版本"
  'history': '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  // （2026-09-17 删：iconify mingcute:bilibili-line —— 原来「了解插件」菜单项用的图标；
  //   该项已改成「使用指南」并用 lucide sprout，这个图标没人引用了。）
  // 设置（2026-09-01）：齿轮，lucide「settings」——「设置与 bug 提报」菜单图标
  'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>  <circle cx="12" cy="12" r="3"/>',
  // 滑杆齿轮（lucide「settings-2」，2026-09-18）：「自定义子面板」菜单项 —— 与上面那个整颗齿轮区分开
  'settings-2': '<path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  // 底部「加入微信群」临时 CTA 图标（lucide message-circle）
  'message-circle': '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  // 侧边 Ribbon「新建思维导图」按钮图标（2026-09-17 统一：与宿主 RIBBON_ICON_SVG 同源，节点链接复用此图标）。
  // 直接三 path 平铺（currentColor 跟主题）；clipPath 是 24×24 满幅 no-op，已去。
  'frame': '<path fill="currentColor" d="M13.3188 17.2902C10.5293 17.2902 8.26735 15.0216 8.26735 12.2387C8.26735 9.44915 10.5293 7.18719 13.3188 7.18719C14.0047 7.18719 14.6641 7.32568 15.2643 7.57627C15.8446 7.32568 16.4909 7.18719 17.1701 7.18719C19.953 7.18719 22.215 9.44915 22.215 12.2387C22.215 15.0216 19.953 17.2902 17.1701 17.2902C16.4909 17.2902 15.8446 17.1517 15.2643 16.9011C14.6641 17.1517 14.0047 17.2902 13.3188 17.2902ZM18.3703 12.2387C18.3703 13.6301 17.8032 14.8897 16.8931 15.7998C16.9855 15.813 17.0712 15.813 17.1701 15.813C19.1419 15.813 20.7444 14.2105 20.7444 12.2387C20.7444 10.2603 19.1419 8.66439 17.1701 8.66439C17.0778 8.66439 16.9855 8.66439 16.8931 8.67098C17.8032 9.58763 18.3703 10.8472 18.3703 12.2387ZM13.3188 15.813C15.2906 15.813 16.8931 14.2105 16.8931 12.2387C16.8931 10.2603 15.2906 8.66439 13.3188 8.66439C11.3405 8.66439 9.74455 10.2603 9.74455 12.2387C9.74455 14.2105 11.3405 15.813 13.3188 15.813Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M2.00391 12.4L6.00388 12.4151"/><path fill="currentColor" d="M4 11.4076C3.44772 11.4076 3 11.8553 3 12.4076C3 12.9599 3.44772 13.4076 4 13.4076V12.4076V11.4076ZM8 13.4076H9V11.4076H8V12.4076V13.4076ZM4 12.4076V13.4076H8V12.4076V11.4076H4V12.4076Z"/>',
  // 链接前缀图标（2026-08-30）：按 lucide 规范，均为描边式（默认 fill:none），无需写进 ICON_SET
  //   globe=网页链接 | folder-closed=外部文件链接 | brackets=Obsidian 双链 [[ ]] | file-input=双链备选（未启用）
  //   frame=侧边 Ribbon「新建思维导图」按钮图标（Frame.svg 内联）；2026-08-30 定：节点链接复用此图标，见 ICON_SET 标 fill
  'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  // 「格式」按钮的图标（lucide type）：字形本身会随加粗/红/黄变（见 .nm-fmt-* 那几条 CSS）
  'type': '<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  // 「使用指南」菜单项图标（lucide sprout，2026-09-17 由 B 站图标改过来）
  'sprout': '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>',
  'file': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
  'folder-closed': '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/>',
  'file-input': '<path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  // lucide:brackets（2026-08-30 定：Obsidian 双链 [[ ]] 图标，替换原 file-input）
  'brackets': '<path d="M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3"/><path d="M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3"/>',
  // 节点底部「更多」菜单图标（2026-09-17 加，均为 lucide 描边式）：
  //   image=添加图片 | play=添加视频 | audio-lines=添加音频 | folders=添加仓库内附件
  'image': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'square-play': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/>',
  'audio-lines': '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
  'file-plus-corner': '<path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M14 19h6"/><path d="M17 16v6"/>',
  'square-arrow-right-enter': '<path d="m10 16 4-4-4-4"/><path d="M3 12h11"/><path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/>',
};
// 非默认(24x24 描边)图标的渲染参数：vb=viewBox，fill=true 表示填充式（iconify fluent/codicon/mdi/reicon 多为填充）
const ICON_SET = {
  'bug': { vb: '0 0 24 24', fill: false },
  'text-initial': { vb: '0 0 24 24', fill: false },
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
// 使用指南：与设置页「使用教程」同一个飞书文档（2026-09-17 把它从"了解 28 Notes（B 站）"改成使用指南）
const GUIDE_URL = 'https://leafmethod.feishu.cn/wiki/P8OKwquTSiqBknkuXZsc31cxnxc?from=from_copylink';
// ===== Pro 功能拦截（2026-09-04）：体验期结束后，指定按钮悬浮变「待激活」按钮，点击进激活弹窗 =====
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
// 右上角「激活创新 Pro 版」提示按钮（2026-09-04）：只在「未授权」时显示。
// ⚠️ 判据是 state.licenseSource（有没有授权），不是 state.isPro（功能能不能用）：
//    试用期内 isPro=true（功能全开）但 licenseSource='trial'，按钮仍要显示 —— 它是提示，不是功能锁。
//    已激活 licenseSource='license' → 隐藏。绑定点击：post openPro 让宿主弹激活引导。
function updateProCta() {
  const wrap = document.getElementById('pro-cta-wrap');
  const hint = document.getElementById('pro-cta-hint');
  if (!wrap) return;
  // 已授权 → 整个组合（按钮 + 提示行）隐藏
  wrap.classList.toggle('hidden', state.licenseSource === 'license');
  // 提示行：仅「试用」状态显示；已授权 / 异常(none) 均不显示
  if (hint) {
    if (state.licenseSource === 'trial') {
      if (state.trialRemainingMs > 0) {
        const days = Math.max(1, Math.ceil(state.trialRemainingMs / 86400000));
        hint.textContent = T('pro.ctaHintTrial', days); // 「试用期还剩 N 天」
      } else {
        hint.textContent = T('pro.ctaHintExpired'); // 「试用期已结束」
      }
      hint.classList.remove('hidden');
    } else {
      hint.textContent = '';
      hint.classList.add('hidden');
    }
  }
  const el = document.getElementById('pro-cta');
  if (el && !el._proCtaBound) {
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
// Minor 节点前缀图标（2026-08-26）：名称由 CSS 旋钮 --minor-ico 决定（定义在 app.css 顶部调参区）；
// 2026-09-20 用户从候选里定下 arrow-down，写了 ICONS 里没有的名字则回退 move-down。
// 节点级图标 > CSS 旋钮 --minor-ico > 出厂兜底。
// 节点级图标存行尾注释（`minor:<图标名>`，如 `minor:arrow-down`；老写法 `minor:1` = 用旋钮那个）。
// 2026-09-20 图标候选实验收尾：底部只留一个按钮（arrow-down）、**不再产出**图标名；
// 但读取 / 写回照旧支持任意 ICONS 里存在的图标名 —— 存量文件里选过图标的节点能原样读回、原样写回，
// 否则一读一写就被归一成 minor:1，破坏「往返逐字节不变」这条硬规矩。
function minorIconName(node) {
  const own = node && node.minorIco;
  if (own && ICONS[own]) return own;
  const v = (getComputedStyle(document.documentElement).getPropertyValue('--minor-ico') || '').trim();
  return (v && ICONS[v]) ? v : 'move-down';
}
// 解行尾注释里的 minor 值 → { on, ico }：
//   `minor:1` / `minor:true` = 是 Minor，但图标用 CSS 旋钮 --minor-ico（老写法，也是默认）
//   `minor:<图标名>`         = 是 Minor，且这个节点专用那个图标
//   缺失 / `0` / `false`      = 不是 Minor
function minorFieldOf(meta) {
  const mv = String((meta && meta.minor) || '');
  if (!mv || mv === '0' || mv === 'false') return { on: false, ico: '' };
  return { on: true, ico: (mv !== '1' && mv !== 'true' && ICONS[mv]) ? mv : '' };
}
// 待办前缀图标（2026-09-20）：圆角方框 + 对勾，两条 path **分别着色** ——
//   方框跟 currentColor（继承节点字色）、对勾跟 --todo-check（默认淡灰 = 还没勾上）。
// 图形本身只有这一个，三种状态全靠这两条描边色表达：
//   Todo = 方框正常色 + 对勾淡灰（未完成） / Done = 方框与对勾都是主题色（已完成）
// 普通节点卡片上不显示它（只有工具条按钮上有这一档灰色）。
// 待办图标（2026-09-20）：圆角方框 + （可选）对勾。两条 path **分别着色** ——
//   方框跟 currentColor（继承节点字色 / 按钮色）、对勾跟 --todo-check。
// withCheck=false → 只画空框（卡片上的「待办」态就是这样：更简洁，勾只留给已完成）。
// 三处用法：
//   卡片前缀图标 = renderTodoIcon(12, nodeTodoDone(node))   待办=空框 / 已完成=框+勾
//   工具条按钮   = renderTodoIcon(18[, !!cmd])              三档都带勾（靠颜色区分：见 CSS）
//   ⚠️ 第三参 mergedRatio（把进度扇形画进图标）已删：2026-09-21 第七轮进度改成独立的百分比文字，不再合一。
function renderTodoIcon(size, withCheck) {
  const s = size || 12;
  // 合并进度（mergedRatio 非 null）：框内画扇形代替对勾 —— 母节点自己是待办时，进度环与 Todo 图标合二为一
  //（用户定：此时用 Todo 按钮那个微椭圆、不用圆；0 完成 = 空框，也不画勾）
  // （原来的 mergedRatio 分支 —— 把扇形进度画进图标里 —— 已随「进度改独立百分比」删除：2026-09-21 第七轮）
  const body = (withCheck === false ? '' :
      '<path class="td-check" d="M16 9L10.5 14.5L8 12"'
      + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
  return '<svg viewBox="0 0 24 24" fill="none" width="' + s + '" height="' + s + '">'
    + '<path class="td-box" d="M12 3C19.2 3 21 4.8 21 12C21 19.2 19.2 21 12 21C4.8 21 3 19.2 3 12C3 4.8 4.8 3 12 3Z"'
    + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + body
    + '</svg>';
}
// 设置待办状态（'' 普通 / 'todo' 待办 / 'done' 已完成）——**唯一写入口**：
// 卡片小图标、底部工具条按钮、两条快捷键命令，三个入口都走它（状态逻辑只有一份）。
function setTodoOfNode(node, next) {
  if (!node || state.historyMode) return;
  if ((node.todo || '') === next) return;
  pushUndo();
  node.todo = next;
  emitUpdate();     // 写回文件（serialize 时按状态拼 `[ ] ` / `[x] ` 前缀）
  renderWithMotion();
}
// 卡片上那个待办小图标被点击 → todo ↔ done 来回
// （2026-09-20 用户定：**取消**「⌘+点击清回普通」那套，没必要 —— 要变普通走工具条按钮）
function cycleTodoOfNode(node) {
  if (!node || state.historyMode) return;
  setTodoOfNode(node, nodeTodoDone(node) ? 'todo' : 'done');
}
// 待办状态机（**唯一定义处**）：两条通道，四个入口共用（底部按钮裸点击 / ⌥+点击、⌘L、⌥⌘L）。
//   'toggle'（裸点击 · ⌘L）  ：'' → todo；todo / done → ''（普通 ↔ 待办，纯开关）
//   'alt'   （⌥+点击 · ⌥⌘L）：done → ''；'' / todo → done（非完成 → 完成；已完成 → 回普通）
// 用户 2026-09-20 定：⌥ 这条是"设完成/取消完成"，所以已完成时再按 = 回普通，而不是停在完成。
// 已删掉的（别再想着加回来）：卡片图标的修饰键分支、第二条命令的重合语义。
function nextTodoState(cur, mode) {
  cur = cur || '';
  if (mode === 'alt') return cur === 'done' ? '' : 'done';
  return cur === '' ? 'todo' : '';
}
// 卡片待办图标的 HTML（title 属性 = 黑框提示语；点击切状态的事件由 attachTodoIco 绑）
// 2026-09-21 第七轮：**不再与进度合一** —— 进度改成独立的一小块百分比文字（用户定：进度% / 待办 / Now / Minor 四个都显示）。
function todoIcoHtml(node) {
  const done = nodeTodoDone(node);
  return '<span class="todo-ico' + (done ? ' td-on' : '') + '" contenteditable="false" title="'
    + (done ? T('tip.todoIconDone') : T('tip.todoIconTodo')) + '">' + renderTodoIcon(12, done) + '</span>';
}
// 给标题里那个待办图标挂点击（标题 DOM 每次重建后都要调一次：buildCard / 空标题 / 编辑收尾还原，共三处）
function attachTodoIco(titleEl, node) {
  if (!titleEl) return;
  const el = titleEl.querySelector('.todo-ico');
  if (!el) return;
  el.onclick = e => { e.stopPropagation(); cycleTodoOfNode(node); }; // 别冒泡到卡片（否则会顺带触发选中/进编辑）
}
// ===== 母节点「进度百分比」（2026-09-21 第七轮用户定稿，取代原来的圆圈进度环）=====
// 出现：子待办数 >= TODO_PCT_MIN（用户原话「子节点如果待办节点 ≥ 2」）。
// 显示：**灰色略小字**的百分比（如 40%），可点；CSS 旋钮管大小/颜色/左右/上下位置（见 app.css 的 --todo-pct-*）。
// 计数口径（用户逐条定，两条规则写在下面各自的位置上）：分子 = 已完成数、分母 = 总数，都是一个「展开着的子待办」集合。
const TODO_PCT_MIN = 2;   // 显示门槛（2 个也算）
// 收集参与计数的子待办：**展开着的**（fold 分支整个不进 —— 折叠节点自身看得见仍算，2026-09-20 用户定）。
// 规则①（2026-09-21 第七轮）：待办子节点**自己同时是 Minor** → 不参与计数（分子分母都不进）。
//   注意只排除该节点本身，它的子树照旧往下找（Minor 是"这一项次要"，不等于整支作废）。
// 规则③（2026-09-21 用户定，本轮加）：**已完成的待办子节点，它的子树整个不参与计数** ——
//   往下的递归在 done 处**封口**（不下探）：母节点都完成了，它下面那些"算完成还是算没完成"已经没有意义
//   （用户原话："它的母节点自然完成了，子节点不管完成没完成，其实概念上都是已完成"）。
//   实报例子：根 → [x] 某节点 → 它下面 3 个未完成待办。旧口径：分母 8、分子 5 → 63%；
//   新口径：那 3 个不进集合 → 分母 5、分子 5 → 100%（用户要的就是这个）。
function collectOpenChildTodos(node) {
  const out = [];
  (function w(n) {
    (n.children || []).forEach(c => {
      const isTodo = c.todo === 'todo' || c.todo === 'done';
      if (isTodo && !nodeIsMinor(c)) out.push(c);
      if (isTodo && c.todo === 'done') return; // 规则③：已完成 → 子树封口，不再下探
      if (!c.fold) w(c);
    });
  })(node);
  return out;
}
// 点击「进度百分比」时用的集合（2026-09-21 用户定，**与统计用的那个刻意分开**）：
// 与 collectOpenChildTodos 的差别**只有一条：不封口** ——
//   **已完成**的中间节点，它下面的待办也要一起变（规则③ 只是**统计**口径，不该拦点击）。
//   起因（用户实报）："点击百分 0，只有子节点完成，它子节点下面的那些待办没完成" ——
//   他的树里有一个已完成子节点，按统计口径不下探，于是点击也跳过了它下面那些；但"全部完成"就该全都要完成。
// ⚠️ **折叠分支照样不动**（用户 2026-09-21 明确确认："折叠之后我点这个百分百就不影响它，计算和点击都不影响"）；
// ⚠️ Minor 待办照样不动（与规则① 一致）。**别把这两个集合合并**：一个是"看得见多少"，一个是"要动多少"。
function collectTodoTargets(node) {
  const out = [];
  (function w(n) {
    (n.children || []).forEach(c => {
      if ((c.todo === 'todo' || c.todo === 'done') && !nodeIsMinor(c)) out.push(c);
      if (!c.fold) w(c); // 折叠分支不下探（与统计集合同款：折叠里的**既不算、也不动**）
    });
  })(node);
  return out;
}
function childTodoStats(node) {
  const kids = collectOpenChildTodos(node);
  // 规则②（2026-09-21 第七轮）：**母节点自己被标为完成**（todo === 'done'）→ 它的所有待办子节点
  //   不管有没有标完成，一律**算已完成**（所以进度直接 100%）。卡片上这些子节点本来就被打删除线（连坐）。
  const motherDone = !!(node && node.todo === 'done');
  // 规则④（2026-09-21 用户定，本轮加）：**母节点自己也是待办节点（todo / done）时，它自己也算一项** ——
  //   计入分母（完成则计入分子）。理由：母节点完成时规则② 让子节点全算完成 → 进度恒 100%，
  //   而它自己又不在计数里 → 点 100% 想把大家拉回 0% 时"动不了"（用户实报的死循环）。
  //   把它算进来之后：母节点 done 时分子分母各 +1，点一下能把母节点自己也切回未完成 → 真能回到 0%。
  const motherTodo = !!(node && (node.todo === 'todo' || node.todo === 'done'));
  const total = kids.length + (motherTodo ? 1 : 0);
  const done = (motherDone ? kids.length : kids.filter(c => c.todo === 'done').length) + (motherDone ? 1 : 0);
  return { total, done };
}
// 百分比（四舍五入取整）—— 显示、提示语、点击语义三处共用这一个数
function childTodoPct(node) {
  const st = childTodoStats(node);
  return st.total ? Math.round((st.done / st.total) * 100) : 0;
}
// 直接子节点里「参与计数」的待办个数（规则①同样生效：自己也是 Minor 的不算）
function directTodoCount(node) {
  return (node.children || []).filter(c => (c.todo === 'todo' || c.todo === 'done') && !nodeIsMinor(c)).length;
}
// 百分比要不要出现（2026-09-21 用户定：**只看直接子节点**）——
// 为什么：原来按"整棵展开子树"判，孙代凑够 2 个待办就会让祖先一路显示百分比，直传到最根那个节点上，很难看。
//   出现判据 = 直接子节点；**百分比数值仍按原来的口径算**（展开着的子代 + 母节点自己，见 childTodoStats）。
// ⚠️ 母节点自己**不占名额**（用户 2026-09-21 明确纠正："母节点自己不参与这个小计算"）——
//   所以这两个口径**有意不同**：**显示看子待办数，算数时母节点才计入**。别为了"一致"又去加那个 +1。
function todoPctShown(node) {
  return directTodoCount(node) >= TODO_PCT_MIN;
}
// 百分比 HTML：灰字 + 黑框提示（走应用自己的 [data-tip] 黑框，不是浏览器原生 title）。
// 提示语按「点击之后会变成什么」说（用户定）：**未满 100% → 全部完成（含 0%）**；100% → 全部未完成。
function todoPctHtml(node) {
  const pct = childTodoPct(node);
  const tip = pct < 100 ? T('tip.todoPctDone') : T('tip.todoPctUndone'); // 100% = 回到全未完成的出口
  return '<span class="todo-pct" contenteditable="false" data-tip="' + tip + '" data-side="top">' + pct + '%</span>';
}
// 挂点击（标题 DOM 重建后都要重绑：buildCard / 编辑收尾还原，两处 —— 与 attachTodoIco 同款时机）
function attachTodoPct(titleEl, node) {
  if (!titleEl) return;
  const el = titleEl.querySelector('.todo-pct');
  if (!el) return;
  el.onclick = e => { e.stopPropagation(); clickChildTodos(node); }; // 别冒泡到卡片（否则会顺带进编辑）
}
// 百分比被点击（2026-09-21 用户定）：动的是**参与计数的那些**（= 展开着的、自己不是 Minor 的子待办）
//   ＋ **母节点自己（若它本身也是待办节点）**：
//   进度 < 100%（**含 0%**）→ 全部设为完成（0% 点了就直接变 100% —— 用户 2026-09-21 明确纠正：
//     "0% 点了不就是变成百分百吗"，所以 0% **照样可点**，与"有进度时"完全同款）
//   ⚠️ 母节点自己必须一起切（规则④）：它是 done 时进度恒 100%，不切它就会"点了没反应"（用户实报）。
//   进度 = 100% → 全部设为未完成（"回到全未完成"的出口；不补的话做完就再也回不去）
function clickChildTodos(node) {
  if (!node || state.historyMode) return;
  const kids = collectTodoTargets(node); // 点击目标集合：**不封口**（已完成中间节点下面也补齐），但折叠分支与 Minor 都不动
  const motherTodo = !!(node.todo === 'todo' || node.todo === 'done'); // 母节点自己也是待办 → 一起切
  if (!kids.length && !motherTodo) return;
  const pct = childTodoPct(node);
  const target = (pct < 100) ? 'done' : 'todo'; // <100 → 全部完成；100% → 全部回未完成（出口）
  pushUndo();
  kids.forEach(c => { c.todo = target; });
  if (motherTodo) node.todo = target; // 规则④：母节点自己也是待办 → 跟着一起（否则 100% 点不回去）
  emitUpdate(); renderWithMotion();
}
// 卡片标题里的「前缀图标」元素（Minor / Now / 待办 / 进度百分比）—— 三件事都要认它：
// 进编辑时保留不删、双击坐标→光标的映射要跳过它们、取编辑区纯文字时要排除它们。
// 抽成一个判断：以后再加新前缀图标，只改这里（原来四处各写一份，容易漏一处）。
function isPrefixIcoEl(el) {
  return !!(el && el.classList && (el.classList.contains('minor-ico')
    || el.classList.contains('now-ico') || el.classList.contains('todo-ico')
    || el.classList.contains('todo-pct'))); // 进度百分比也是常驻图标：双击进编辑不消失（2026-09-20 定，2026-09-21 换成百分比）
}
// 把一批节点按**给定顺序**放到 el 最前面（前缀图标专用）。2026-09-21 抽出来：
// 原来三处各写一遍 `arr.forEach(x => el.insertBefore(x, el.firstChild))` —— 那是「每次插到最前」，
// **正序插会把顺序整个翻过来**（实踩：双击进编辑后退出来，Todo 图标跑到 Minor 后面）。
// 以后凡是要把多个元素按序前置，一律走这里。
function prependInOrder(el, nodes) {
  for (let i = nodes.length - 1; i >= 0; i--) el.insertBefore(nodes[i], el.firstChild);
}
// 图标定案（2026-08-22 逐项确定；2026-08-25 改：locate=circle-dot、save(更新为当前路径)=replace；
//   2026-09-20 改：hide 用回「虚线圆角方框」那套 = squircle-dashed / squircle-dashed-off）
//   undo=corner-up-left、redo=corner-up-right、locate=circle-dot、save=refresh-cw
//   hide=squircle-dashed/off（状态由 setHideDone 决定，已筛选态主题色 .active-hide）、slash=slash、more=more-horizontal
//   （note/done 两键无人使用，2026-08-27 体检删）
const ICON_FIXED = { undo: 'corner-up-left', redo: 'corner-up-right', locate: 'circle-dot', save: 'refresh-cw', slash: 'slash', hide: 'squircle-dashed', more: 'more-horizontal' };

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
// ============ 待办（2026-09-20）============
// 唯一语法 = **Markdown 原生 checkbox**，本项目不为它新增任何标记：
//   - [ ] 买牛奶   → 待办 todo
//   - [x] 买牛奶   → 已完成 done
// 好处：Obsidian 原生搜索 / Tasks 插件 / Dataview 都直接认，AI 也天生看得懂。
// 前缀只活在源文件里：内存中 node.todo 记状态、title 存**不含前缀**的纯文字，
// 读进来剥掉、写回去按状态拼上 —— 于是复制 / 搜索 / 差异对比都按纯标题走，只有写盘那一刻拼前缀。
// 兼容用户手打的写法（中英方括号 / 括号内多空格 / 括号后无空格）：[] / [] / [ ] / [ ] / 【】 / 【 】 / 【 】
// 一律归一成 `[ ] ` 或 `[x] `；括号里只允许空白或 x/X —— `[abc]` 这种正常文字不会被误判成待办。
// ⚠️ 空白一律写 [^\S\r\n]（= 任何 Unicode 空白，**含全角空格 U+3000**），不要写 [ \t]：
//   中文输入法敲出来的空格常常是全角，[ \t] 认不出 —— 2026-09-20 用户第二轮回报疑似就是这种。
const TODO_PREFIX_RE = /^[^\S\r\n]*[\[【][^\S\r\n]*([xX])?[^\S\r\n]*[\]】][^\S\r\n]*/;
// 待办识别诊断日志（2026-09-20 排查用，已按用户要求撤掉）：再有类似回报时，
// 临时在 flushProxy（隐藏输入代理）与 startEdit 的 onFinish 里各打一行日志
// （原文 JSON + 命中与否 + 前几个字符码），看命中结果即可定位是哪种空白/括号没被认。
// 剥待办前缀 —— 读文件与编辑提交**共用这一份**（2026-09-20 修「手打变体有时不识别」）：
//   ① 允许前缀**前面有空格**（早期规格就带一个前导空格，用户照那个敲）；
//   ② 括号内、括号后的空格都不限个数；③ 中英方括号都认。
//   命中 → { todo: 'todo'|'done', text: 去掉前缀后的纯文字 }；没命中 → { todo: '', text: 原样 }。
// ⚠️ 正则里的前导 [ \t]* 是这次修 bug 的关键：原来 ^[\[【] 要求方括号顶格，用户敲「 [ ] x」匹配不上，
//   那次回车就被当成「纯文字改动」原样存进 title（文件里成了 `-  [ ] x`），
//   要等重新读文件（切源文件再切回）才被认出来 —— 正是用户报的「切换后才识别」。
function splitTodoPrefix(raw) {
  const s = String(raw == null ? '' : raw);
  const m = s.match(TODO_PREFIX_RE);
  if (!m) return { todo: '', text: s };
  return { todo: m[1] ? 'done' : 'todo', text: s.slice(m[0].length) };
}
function nodeTodoDone(n) { return !!n && n.todo === 'done'; } // 已完成待办（渲染 / 筛选 / 复制跳过都要问它）
function nodeTodoAny(n) { return !!n && (n.todo === 'todo' || n.todo === 'done'); }
function todoPrefixOf(state) { return state === 'done' ? '[x] ' : '[ ] '; } // 写盘统一格式（可读性最好，也最通用）

function parse(text) {
  const root = { id: 'root', title: '未命名', note: '', images: [], embeds: [], link: '', fold: false, persistId: '', color: '', todo: '', rawLines: [], children: [] };
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
    if (/^(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))$/.test(s.trim())) return null; // 整行链接 = 附件
    if (/^\*\*(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))\*\*$/.test(s.trim())) return null; // 加粗整行链接
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
        const { text: t0, meta } = splitComment(rootLi[1]);
        const td = splitTodoPrefix(t0); // 待办前缀剥掉（与子节点、编辑提交共用同一份实现）
        const t = td.text;
        if (t) root.title = t;
        root.todo = td.todo;
        const _mf = minorFieldOf(meta); // minor 值 → { on, ico }（2026-09-20：minor 值可以是图标名）
        // 根节点也读行尾注释（2026-08-21 修：之前根节点不读 fold，折叠状态刷新后丢失）
        root.fold = meta.fold === '1' || meta.fold === 'true';
        root.persistId = meta.id || '';
        root.color = meta.color || '';
        root.minor = _mf.on; root.minorIco = _mf.ico; // v2：根也读 minor 注释（2026-08-29）；2026-09-20 起还可带图标名
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
      // 待办前缀先剥（2026-09-20）：必须在加粗/链接识别**之前** —— 否则 `- [ ] **x**` 会因以 `[` 开头而认不出加粗
      const td = splitTodoPrefix(t0);
      const todo = td.todo;
      let t = td.text, bold = false;
      const bM = t.match(/^\*\*(.+)\*\*$/);
      if (bM) { bold = true; t = bM[1]; }
      // 整行链接 = 链接节点：v2 支持 wikilink [[...]] 与标准 Markdown 链接 [显示名](url/file:///path) 两种
      const linkM = t.match(/^(\[\[(.+)\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))$/);
      const mf = minorFieldOf(meta); // minor 值 → { on, ico }（2026-09-20：minor 值可以带图标名）
      const node = {
        id: genId(),
        title: linkM ? '' : t,
        note: '', images: [], embeds: [],
        link: linkM ? t : '',
        bold: bold,
        minor: mf.on, minorIco: mf.ico, // v2：Minor 走行尾注释（2026-08-29）；2026-09-20 起值可带图标名
        fold: meta.fold === '1' || meta.fold === 'true',
        persistId: meta.id || '',
        color: meta.color || '',
        now: meta.now === '1' || meta.now === 'true', // Now 节点（2026-08-27）
        todo: todo, // 待办状态：'' 普通 / 'todo' 待办 / 'done' 已完成（2026-09-20；走 Markdown 原生 checkbox 前缀，不进注释）
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
      const subLinkM = t.match(/^(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))$/);
      const subLinkBold = t.match(/^\*\*(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))\*\*$/);
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
  if (/^(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))$/.test(t)) return true;          // 整行链接 = 附件链接
  if (/^\*\*(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))\*\*$/.test(t)) return true;  // 加粗包裹的整行链接
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
  // 待办前缀（2026-09-20）：写在加粗**外面**（`- [ ] **x**`，这才是标准写法），且只在首行
  if (node.todo === 'todo' || node.todo === 'done') head = todoPrefixOf(node.todo) + head;
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
    // 隐藏 Minor/Done 下复制：这些子节点不进剪贴板（2026-09-20 起 Done 待办也跳过，与 Minor 一致）
    if (skipDone && (nodeIsMinor(c) || nodeTodoDone(c))) return;
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
  // Minor 次要（v2：2026-08-29 起走注释，不再 _x_ 包裹）；
  // 2026-09-20 起值可带图标名（`minor:triangle-down`），不带名写回老写法 `minor:1`（= 用 CSS 旋钮那个图标）
  if (node.minor) parts.push('minor:' + (node.minorIco && ICONS[node.minorIco] ? node.minorIco : '1')); // Minor 次要；节点级图标名照原样写回（保护存量文件往返不变，2026-09-20）
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
function goTo(id, opts = {}) {
  // 2026-08-30：主动跳转（下钻/返回默认路径/路径历史）后，作废「定位子菜单 hover 预览」的回退位置。
  // 否则：hover 过定位子菜单项 → 移开 → 350ms 延迟里点节点下钻 → 回退动画在下钻之后才补上，画面被拉回原位 = 漂移。
  locateSavedScroll = null;
  // keep 模式（2026-09-15 定稿）：跳转后保持画面状态——内容换、镜头不动。锚点节点 = 跳转后
  // 要「原地站住」的那个节点，渲染前先记它卡片的屏幕位置（视口比例）+ 当前缩放：
  //  · 'root'（面包屑 / 返回默认路径）：锚点 = 当前主节点，跳转后新根摆回它的位置；
  //  · 'target'（下钻）：锚点 = 被点的那股节点——下钻后它成为新根，摆回它下钻前的位置。
  let kept = null;
  if (opts.keep) {
    let anchorEl = null;
    if (opts.keep === 'target') {
      let r = findNode(state.tree, id);
      if (!r) r = findNodeByPersistId(state.tree, id);
      const anchorId = r && r.node ? r.node.id : id;
      anchorEl = document.querySelector('.node-row[data-id="' + anchorId + '"] .card');
    } else {
      const oldRoot = currentRoot();
      anchorEl = oldRoot && document.querySelector('.node-row[data-id="' + oldRoot.id + '"] .card');
    }
    if (anchorEl) {
      const vr = viewMap.getBoundingClientRect();
      const r2 = anchorEl.getBoundingClientRect();
      kept = { x: (r2.left + r2.width / 2 - vr.left) / vr.width, y: (r2.top + r2.height / 2 - vr.top) / vr.height, zoom: zoom };
    }
  }
  if (!id || id === state.tree.id) { state.currentRootId = null; state.currentRootPid = ''; }
  else {
    // id 可能是 node id，也可能是 persistId（returnToDefault / 路径历史栈存的是 pid，重 parse 后内存 id 会变）
    let r = findNode(state.tree, id);
    if (!r) r = findNodeByPersistId(state.tree, id);
    // 下钻即发 ID（2026-09-15）：路径历史/默认路径都按 persistId 认节点，无 ID 节点只能记空串、
    // 上一/下一路径会退化成「回主节点」。下钻时顺手分配（与「更新为当前路径」同一套做法），
    // 保证历史对任何节点都可精确还原。
    if (r && r.node && !r.node.persistId) {
      r.node.persistId = genPersistId();
      pushUndo();
      emitUpdate();
    }
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
  // 下钻/返回后主节点（新根）放到 --locate-selected-x（定位选中节点 X，用户自定义的关注位）：
  // goTo 会清 selectedId → 走 locateCenter 的无选中分支会把根放 --locate-first-x（默认 0.25），
  // 主节点偏左（2026-09-13 反馈）。这里显式按「主节点 = 当前关注」定位。
  const rootCard = document.querySelector('.node-row[data-id="' + currentRoot().id + '"] .card');
  if (opts.keep && kept && rootCard) {
    // keep 模式落位：新根摆回旧根刚才的屏幕位置（kept = 视口比例），缩放不变；直接落位不做动画——
    // 根没动、只有内容换，再动画反而会滑。screen = zoom*(world+pan) → pan = 屏幕点/zoom - world。
    zoom = kept.zoom;
    const vr = viewMap.getBoundingClientRect();
    const c = worldCenter(rootCard);
    panX = kept.x * vr.width / zoom - c.x;
    panY = kept.y * vr.height / zoom - c.y;
    applyTreeTransform(); drawEdges();
  } else if (rootCard) placeCardAtViewport(rootCard, cfgNum('--locate-selected-x', 0.5));
  else locateCenter(); // 极端兜底：根卡片不在（空树/时序）→ 走通用智能定位
  persistNow();
}
// 沙盒化（2026-09-14 用户定）：历史界面里可以下钻/返回。它改动的 currentRootId / 路径栈 / 视口
// 全部由 sandboxRestore 在退出时整组还原，且持久化已被 persistNow 挡住 —— 带不出沙盒。
// 下钻（2026-09-15 定稿）：被点的那股节点 = 锚点，下钻后原地站住（缩放不变），不再跳到关注位。
function drillInto(id) { goTo(id, { keep: 'target' }); }
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
    a.onclick = () => goTo(n.id, { keep: 'root' }); // 面包屑跳转保持画面状态（锚点=旧主节点，2026-09-15）
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
// 撤销/重做专用：parse 会把整棵树的 id 全部重生成，而位移过渡是靠 id 去匹配「上一帧它在哪」的 →
// 不贴回旧 id，全体卡片都算「新出现的」（门闩①），撤销只能硬跳。顺带：选中、当前根、Now 快照也都是
// 按 id 记的，id 一变它们跟着失效（撤销后选中丢失、视图跳回主节点都源自这里）。
// 匹配规则（同一父内）：①内容完全相同优先（撤销一次删除时，恢复出来的节点在旧树里没有 → 拿新 id →
// 正合门闩①「新卡片不做飞入」）；②剩下的按同索引顺序兜底对齐，避免大面积失配。
function contentKeyOf(n) {
  return (n.title || '') + '\u0001' + (n.note || '') + '\u0001' + (n.link || '') + '\u0001' + ((n.images && n.images.length) || 0);
}
function adoptIdsFrom(oldNode, newNode) {
  if (!oldNode || !newNode) return;
  const olds = oldNode.children || [], news = newNode.children || [];
  const pool = new Map(); // 内容 key → 旧子节点队列（同内容的兄弟可能有多个，按顺序消耗）
  olds.forEach(o => { const k = contentKeyOf(o); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(o); });
  const paired = new Array(news.length).fill(null);
  news.forEach((nn, i) => { const q = pool.get(contentKeyOf(nn)); if (q && q.length) paired[i] = q.shift(); });
  const restQ = olds.filter(o => paired.indexOf(o) < 0);
  let ri = 0;
  news.forEach((nn, i) => { if (!paired[i] && ri < restQ.length) paired[i] = restQ[ri++]; });
  news.forEach((nn, i) => {
    const o = paired[i];
    if (!o) return; // 旧树里没有对应者 → 保留 parse 新给的 id（= 新卡片，不飞入）
    nn.id = o.id;
    if (o.persistId) nn.persistId = o.persistId;
    adoptIdsFrom(o, nn);
  });
}
function applyText(t) {
  const prevTree = state.tree; // 撤销前那棵树：用来把 id 贴回新解析出来的树（见 adoptIdsFrom）
  const res = parse(t);
  state.tree = res.root;
  adoptIdsFrom(prevTree, state.tree); // 必须在 reconcileSelection 之前：选中/当前根依赖 id 稳定
  state.warnings = res.warnings;
  if (state.tree.title === '未命名' && state.currentFilename) state.tree.title = state.currentFilename;
  reconcileSelection();
  if (state.showNow) nowVisibleSnapshot = computeNowVisible(currentRoot()); // 重解析后快照按新树重算（2026-08-28；有了 adoptIdsFrom，多数 id 已沿用旧值）
  // 2026-09-20：撤销/重做也是整棵树的结构变化（撤销一次删除 = 节点回来）→ 走位移过渡，别再硬跳。
  // 锚定当前根（主节点/下钻节点）：它定住，只有变化的那一片在动。
  keepView(currentRoot());
  renderWithMotion(); updateToolbar(); updateUndoRedo(); updateDefaultPathBtn();
  emitUpdate();
}
function doUndo() { if (state.historyMode) return; if (!undoStack.length) return; redoStack.push(snapshot()); applyText(undoStack.pop()); }
function doRedo() { if (state.historyMode) return; if (!redoStack.length) return; undoStack.push(snapshot()); applyText(redoStack.pop()); }

// ============ 结构变化的位移过渡（实验性 2026-09-20，可整段回撤）============
// 做法（通用思路，代码自写）：布局前后各量一次卡片位置，先按差值把卡片平移回旧位置（视觉上
// "没动"），再放开让它滑到新位置。卡片和连线走的是**同一个 rAF、同一个进度**：两者严格同帧，
// 不会出现「节点在动、线已经在新位置」的错位，也不会「卡片先跑、线慢半拍」。
// 过渡期间不读任何矩形：位置由「终点 + 位移×(1−进度)」算出（见 paintMotionEdges）。
//
// 三条硬门闩 —— 缺任何一条都会重现上次那个「打开界面闪一下」：
//   ① 只给「上一次渲染就已经存在」的卡片做位移。新出现的节点没有旧位置，直接出现在最终位置，
//      绝不从别处飞入：开屏/切页那一下的满屏元素乱飞，就是新节点被当成位移来做导致的。
//   ② 揭幕前（viewMap 还是 opacity:0）与 booted 之前一律不做。
//   ③ 卡片过多、或这个文件重画本来就贵（edgesHeavy）时不做：过渡期间要逐帧更新连线
//      （读矩形那部分已省掉，剩下的重活是「重画一次要几十毫秒」这类文件，见 MOTION_MAX_CARDS）。
//
// 位移量按「屏幕位移」算，不是纯树内位移（2026-09-20 修：卡片飘走的根因）。
// 树内坐标 = (屏幕 − treeEl 矩形) ÷ zoom，它会把 pan 的变化自动抵消掉；而锚定补偿
// （applyPendingKeepView）恰恰是通过改 pan 把锚点钉在原屏幕位置。两者叠起来的后果：
//   锚点最终位置是对的（钉住了），但动画**起点**被 pan 那一下整体带偏 —— 整屏先瞬移一段、
//   再滑回来，就是「一展开画面不知道飘到哪里去了」，母节点自己也会先跳一下再滑回。
// 所以在树内位移里减掉本次 render 的 pan 变化：锚点的位移正好被减成 0（全程不动），
// 其余卡片则各自从「它在屏幕上的老位置」滑到新位置 —— 视觉上就是原地让位，没有瞬移。
const MOTION_MS = 300;                             // 过渡时长（ms）
const MOTION_EASE = 'cubic-bezier(.2,.75,.35,1)';  // 缓动：快出慢收（卡片已改由我们逐帧写 transform，
                                                   // 这条留作对照；实际插值走下面 JS 版的同一条曲线）
const MOTION_EASE_P = [0.2, 0.75, 0.35, 1];        // ↑ 同一条 cubic-bezier 的四个控制参数
const MOTION_VP_PAD = 160;                         // 视野外扩（px）：位移常有几百像素，贴边的卡片稍后要滑进来
const MOTION_MAX_CARDS = 1200;                     // 卡片数上限：超过就不做（大文件保护）
                                                   // 2026-09-20：只对「看得见的」卡片做（卡片或它的连线
                                                   // 碰到视野，见 motionVisibleIds），屏幕外的不读不画。
const MOTION_ON = true;                            // 出厂默认：置 false 即全静默（回撤不必改别处）
                                                   // 运行期真正起作用的是下面这个 —— 由设置页「高级 → 动效」下发
let motionEnabled = MOTION_ON;                     // 动效开关（2026-09-20）：setMotion / init 可改，关掉后一律瞬移
const MOTION_AUTO_PAUSE = true;                    // 掉帧自保：连续两帧超时就放弃这次动画、直接落地
const MOTION_DROP_MS = 34;                         // 单帧超过这么久算掉帧（≈ 掉到 30fps 以下）
                                                   // 录屏/低电/U 大图时会掉帧：与其播成幻灯片，不如不播
const MOTION_IMG_WAIT_MS = 1200;                   // 图片撑开过渡的快照保鲜期：图晚到超过这么久就别播了
                                                   // （期间用户可能已经折叠/平移/拖拽，快照早过期 → 硬播会整屏乱飞）
let motionArmed = false;   // 本次 render 要不要做过渡：由 renderWithMotion() 置位
let motionPrev = null;     // render 前量到的旧位置（树内坐标）
let motionFrame = 0;       // 过渡期间的逐帧重画
let motionPrevPan = null;  // 量旧位置时同帧记下的 pan：末尾算位移要扣掉它（见上）
// 下面三个是「过渡期间不读矩形画线」的家当，声明提前到这里：render 可能在文件后段的初始化流程里
// 就被调用，放在后头会撞 let 的暂时性死区（2026-09-20）。
let motionEdgeList = null;  // 终点（= 布局真实位置）的边表，drawEdges 的返回值
let motionOff = null;       // Map<id, {dx,dy}>：参与过渡的卡片「起点 − 终点」位移
let edgePathEls = [];       // 连线 path 元素池：按条复用，不再每帧整块重建 SVG
// 落位动画的起点（2026-09-20 用户定）：拖拽松手那一刻，被拖节点在屏幕上的位置（= 跟手悬浮卡的位置）。
// 用它当这次位移的「旧位置」，卡片就从鼠标松手处滑到最终位置 —— 与松手前那根预测线接得上：
// 线的一端跟着卡片从预测线的终点走到真实连线，整个过程连续。
// 不用它（即沿用节点原来的老位置）→ 卡片从老位置一路飞过来，看着像「从原处闪一下」，很突兀。
let pendingDropStart = null; // { ids:[...], x, y }：松手处的屏幕左上角，render 末尾消费一次即清
function armDropStart(clientX, clientY) {
  const ids = state.dragIds;
  if (!ids || !ids.length) { pendingDropStart = null; return; }
  const np = dragNodeXY(clientX, clientY);        // 节点左中心（与预测线端点同源）
  const h = state.dragGhostH || 0;                // 卡片屏幕高（含 zoom，dragstart 时量好）
  // x 同样被「落点列」钉住（与预测线终点用同一个 dropColumnLocalX）：
  // 少了这层同源，卡片从松手处起步、线却画在落点列上，两者错开一截 → 看着像「线从别处闪过去」。
  const tr = treeEl.getBoundingClientRect();
  const s = zoom || 1;
  let lx = (np.x - tr.left) / s;
  const colX = dropColumnLocalX(state.dragPreview, tr, s);
  if (colX != null) lx = Math.max(lx, colX);
  pendingDropStart = { ids: ids.slice(), x: tr.left + lx * s, y: np.y - h / 2 };
}
function renderWithMotion() {
  if (!motionEnabled) { render(); return; }
  motionArmed = true;
  try { render(); } finally { motionArmed = false; }
}
function motionAllowed() {
  if (!motionEnabled || !motionArmed) return false;   // 动效开关（设置页「高级 → 动效」）+ 本次 render 是否要走过渡
  if (!booted) return false;                        // 开屏（init 还原视图之前）：不做
                                                   // 历史沙盒（historyMode）2026-09-20 放开：它与编辑页共用同一套
                                                   // render，差异只是末尾多贴一层差异高亮；且历史页展开得少、
                                                   // 又有「卡片太多 / 重画太贵」的兜底，没必要单独排除。
  if (viewHiddenForEdges()) return false;           // 揭幕前：不做
  if (edgesHeavy) return false;                     // 这文件重画本来就贵 → 不添乱
  return treeEl.querySelectorAll('.node-row').length <= MOTION_MAX_CARDS;
}
// 缓动的 JS 版（2026-09-20）：卡片不再交给 CSS transition，而是和连线在同一个 rAF 里按同一个
// 进度插值 —— 两条曲线必须是同一条，否则「卡片走 A 曲线、线按 B 曲线追」，两端还是会错开。
function motionEase(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const p = MOTION_EASE_P;
  const bx = (u) => { const v = 1 - u; return 3 * v * v * u * p[0] + 3 * v * u * u * p[2] + u * u * u; };
  const by = (u) => { const v = 1 - u; return 3 * v * v * u * p[1] + 3 * v * u * u * p[3] + u * u * u; };
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 18; i++) { u = (lo + hi) / 2; if (bx(u) < t) lo = u; else hi = u; } // 二分解 x(u)=t
  return by(u);
}
// 哪些卡片要参与过渡（2026-09-20 用户指出「屏幕外的做了也看不见」这条只对一半）：
// 卡片自己在屏幕外、但它连到屏幕内节点的**那条贝塞尔曲线是看得见的** —— 屏内那端在动、屏外这端
// 不动，曲线就被拉扯/闪断（正是用户看到的"线一闪而过"）。所以判据是：
//   卡片矩形（外扩 MOTION_VP_PAD）碰到视野  **或**  它任一条连线的包围盒碰到视野 → 参与。
// 连线包围盒取两端点张成的矩形（贝塞尔不会跑出这个框，保守但足够）。
function rectHitsView(r, pad) {
  return r.right > -pad && r.left < window.innerWidth + pad && r.bottom > -pad && r.top < window.innerHeight + pad;
}
function motionVisibleIds() {
  const hit = new Set();
  const box = new Map(); // id → 卡片屏幕矩形（先量一遍，后面算连线包围盒要用）
  treeEl.querySelectorAll('.node-row[data-id]').forEach((row) => {
    const card = row.querySelector(':scope > .card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const id = row.getAttribute('data-id');
    box.set(id, r);
    if (rectHitsView(r, MOTION_VP_PAD)) hit.add(id); // 卡片自己看得见
  });
  treeEl.querySelectorAll('.node-row[data-id]').forEach((row) => {
    const pid = row.getAttribute('data-id');
    const pr = box.get(pid);
    const kids = row.querySelector(':scope > .children');
    if (!pr || !kids) return;
    kids.querySelectorAll(':scope > .node-row > .card').forEach((kc) => {
      const kRow = kc.parentElement;
      const kr = box.get(kRow.getAttribute('data-id'));
      if (!kr) return;
      const l = Math.min(pr.right, kr.left), rr = Math.max(pr.right, kr.left);
      const t = Math.min(pr.top, kr.bottom), b = Math.max(pr.bottom, kr.top);
      if (rr > -MOTION_VP_PAD && l < window.innerWidth + MOTION_VP_PAD
        && b > -MOTION_VP_PAD && t < window.innerHeight + MOTION_VP_PAD) {
        hit.add(pid); hit.add(kRow.getAttribute('data-id')); // 连线看得见 → 两端都要跟着动
      }
    });
  });
  return hit;
}
// force=true：跳过 motionAllowed（图片撑开这条路径不在 render 里，没有 motionArmed，门闩自己判，见 imageMotionAllowed）
function captureCardPlaces(force) {
  if (!force && !motionAllowed()) { motionPrevPan = null; return null; }
  const tr = treeEl.getBoundingClientRect();
  const s = zoom || 1;
  const m = new Map();
  const vis = motionVisibleIds(); // 卡片或它的连线看得见 → 才量（屏幕外的做了也看不见）
  treeEl.querySelectorAll('.node-row[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');
    if (!vis.has(id)) return;
    const card = row.querySelector(':scope > .card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    m.set(id, { x: (r.left - tr.left) / s, y: (r.top - tr.top) / s });
  });
  motionPrevPan = { x: panX, y: panY }; // 同帧 pan 快照：末尾减掉它 → 位移还原成屏幕位移
  return m;
}
// 被拖节点下面「画面上真的在」的那些后代（2026-09-20）：
// 折叠的分支不渲染、没有位置可插值 → 不算；多选时另一个被拖根也不重复登记（它跟同一段刚性平移）。
// 返回 Map<后代 id, 所属拖拽根 id>；一个后代都没有就返回 null。
function dropKinOf(ids) {
  if (!state.tree || !ids || !ids.length) return null;
  const kin = new Map();
  for (const rootId of ids) {
    const r = findNode(state.tree, rootId);
    if (!r) continue;
    (function walk(n) {
      for (const c of (n.children || [])) {
        if (c.fold) continue;                 // 折叠：整条分支不在画面上
        if (ids.indexOf(c.id) >= 0) continue; // 另一个被拖根：它自己已按同一段平移走
        if (kin.has(c.id)) continue;
        kin.set(c.id, rootId);
        walk(c);
      }
    })(r.node);
  }
  return kin.size ? kin : null;
}
// 同一件事的 DOM 版兜底（2026-09-20 用户实测：换行很多的高卡片、以及折叠后被拖的母节点，
// 仍会「从老位置闪过去」= 它没被算进整块，于是走了自己的常规位移）。
// 「画面上谁在被拖根下面」DOM 才是真相（折叠的分支根本不在 DOM 里，天然被排除）；
// 数据树的 walk 会因为过滤快照/外部刷新等与画面不完全一致而漏掉个别节点 → 两者取并集。
function dropKinInDom(ids) {
  const kin = new Map();
  for (const rootId of ids) {
    const row = treeEl.querySelector('.node-row[data-id="' + rootId + '"]');
    if (!row) continue;
    row.querySelectorAll('.node-row[data-id]').forEach((sub) => {
      const id = sub.getAttribute('data-id');
      if (ids.indexOf(id) >= 0) return; // 另一个被拖根：它自己已按同一段平移走
      if (!kin.has(id)) kin.set(id, rootId);
    });
  }
  return kin.size ? kin : null;
}
function playCardMove(prev) {
  if (!prev || !prev.size) return false;
  const tr = treeEl.getBoundingClientRect();
  const s = zoom || 1;
  // 本次 render 里 pan 被改了多少（锚定补偿）：从树内位移里扣掉，位移才等于屏幕位移
  const dpx = motionPrevPan ? (panX - motionPrevPan.x) : 0;
  const dpy = motionPrevPan ? (panY - motionPrevPan.y) : 0;
  // ① 先量新位置：每张卡的「常规位移」= 老位置 → 新位置（屏幕差 ÷ zoom）
  const base = new Map();
  const vis = motionVisibleIds(); // 同 captureCardPlaces：卡片或它的连线看得见才做
  treeEl.querySelectorAll('.node-row[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');
    const was = prev.get(id);
    if (!was) return; // 新出现的节点：没有旧位置 → 不做位移（门闩①）
    if (!vis.has(id)) return;
    const card = row.querySelector(':scope > .card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    base.set(id, { card, dx: was.x - (r.left - tr.left) / s - dpx, dy: was.y - (r.top - tr.top) / s - dpy });
  });
  if (!base.size) return false;
  // ② 拖拽落位：被拖节点从「松手处」起步，它下面没折叠的子树按同一段平移整块跟着走。
  //    只修被拖节点自己是不够的 —— 子节点各自从老位置飞到新位置，看着就是「线一闪而过」。
  const ds = pendingDropStart;
  let kin = null, dropDX = null, dropDY = null;
  if (ds && ds.ids.length) {
    // 参照卡片直接查 DOM，不走 base（2026-09-20）：base 只收「看得见」的卡片，万一被拖根落位后
    // 被新父那边的兄弟挤到视野边缘，base 里就没有它 → 整块退化成各自从老位置飞 = 「闪过去」。
    const row0 = treeEl.querySelector('.node-row[data-id="' + ds.ids[0] + '"]');
    const card0 = row0 && row0.querySelector(':scope > .card');
    if (card0) {
      const r0 = card0.getBoundingClientRect();
      // 整块统一用这一个位移（把 ids[0] 送到松手处）：被拖节点 + 它下面没折叠的子树**同一段平移**。
      // 2026-09-20 再修：早先是「各自常规位移 + 同一段补偿」，看着等价，实则不是 —— 层级变了之后卡片
      // 宽高/换行会变，父子各自算出的位移并不相等，动画期间子树就在块内被拉扯变形（第二级以下最明显，
      // 连线的两端各走各的 = 「线一闪而过」）。统一成一个位移才是真刚性：块内相对位置全程不变。
      dropDX = (ds.x - r0.left) / s;
      dropDY = (ds.y - r0.top) / s;
      kin = dropKinOf(ds.ids);
      const kinDom = dropKinInDom(ds.ids);   // 数据树漏掉的（高卡片 / 折叠母节点这类）由 DOM 补上
      if (kinDom) {
        if (!kin) kin = kinDom;
        else for (const [k, v] of kinDom) if (!kin.has(k)) kin.set(k, v);
      }
    }
  }
  // ③ 起步：先按终点画一次线（此刻卡片还没位移，量到/画出的就是终点），记住这张终点的边表；
  //    再把参与过渡的卡片按位移量放到起点。**都在同一个同步任务里，浏览器不会画出中间态**。
  const moved = [];
  for (const [id, b] of base) {
    const isKin = dropDX !== null && (ds.ids.indexOf(id) >= 0 || (kin && kin.has(id)));
    const dx = isKin ? dropDX : b.dx;
    const dy = isKin ? dropDY : b.dy;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue; // 没挪位的别动
    moved.push({ id: id, card: b.card, dx: dx, dy: dy });
  }
  if (!moved.length) return false;
  motionOff = new Map();
  for (const it of moved) motionOff.set(it.id, it);
  motionEdgeList = drawEdges(); // 终点边表（path 元素也按它建好）→ 之后逐帧只改受影响的那些 d
  for (const it of moved) it.card.style.transform = 'translate(' + it.dx + 'px,' + it.dy + 'px)';
  paintMotionEdges(0);          // 起点这一帧就画上：线落在起点（= 预测线终点），不是「卡片已到起点、线还在终点」
  // ④ 逐帧推进：卡片与线共用同一个进度 → 严格同帧（原来卡片走 CSS 过渡、线靠 rAF 追，
  //    两套时钟，主线程一忙线就慢半拍 —— 用户看到的「卡片先跑、线滞后、顿一下」）。
  //    全程不读矩形（位置由终点 + 位移插值算出），过渡期间零强制重排。
  const t0 = performance.now();
  let lastT = t0, slowFrames = 0;
  const finish = () => { motionFrame = 0; clearCardMove(); drawEdges(); }; // 收尾：线也回到精确位置
  const step = () => {
    const now = performance.now();
    // 掉帧自保（2026-09-20）：录屏/大图时每帧预算被压缩，硬撑只会把动画播成幻灯片（比不做更晃眼）。
    // 连续两帧超时就直接落地 —— 宁可这次没动画，也不要闪。
    if (MOTION_AUTO_PAUSE) {
      if (now - lastT > MOTION_DROP_MS) { slowFrames++; if (slowFrames >= 2) { finish(); return; } }
      else slowFrames = 0;
      lastT = now;
    }
    const p = Math.min(1, (now - t0) / MOTION_MS);
    const e = motionEase(p);
    const k = 1 - e;
    for (const it of moved) it.card.style.transform = 'translate(' + (it.dx * k) + 'px,' + (it.dy * k) + 'px)';
    paintMotionEdges(e);
    if (p < 1) motionFrame = requestAnimationFrame(step);
    else finish();
  };
  motionFrame = requestAnimationFrame(step);
  return true; // 播起来了（调用方据此决定还要不要自己重画线）
}
// ── 图片撑开的过渡（2026-09-20）──
// 首次加载的图（尺寸还没记住）到达时会把卡片撑高 → 整片布局跟着动。原来只是 scheduleEdges() 重画连线，
// 卡片位置是浏览器直接重排的 = 硬跳一下。做法与折叠/新建同一套 FLIP：render 末尾先存一份「撑开前」
// 的位置，图到了拿它当起点播一次位移过渡。**只在尺寸没记住时做**（第二张起已有占位，布局根本不变）。
let pendingImgPlaces = null; // render 末尾存下的「图还没撑开」时的卡片位置
let pendingImgT0 = 0;        // 存快照的时刻：超过 MOTION_IMG_WAIT_MS 就不认了（见下）
function imageMotionAllowed() {
  if (!motionEnabled) return false;
  if (!booted || viewHiddenForEdges()) return false; // 开屏 / 画布还看不见：不做
  if (edgesHeavy) return false;                      // 重画本来就贵 → 不添乱
  if (motionFrame) return false;                     // 正在播别的过渡：别叠上去
  return treeEl.querySelectorAll('.node-row').length <= MOTION_MAX_CARDS;
}
function armImageMotion() { // render 末尾：本次渲染里还有「尺寸未记住」的图 → 预存位置
  pendingImgPlaces = null;
  if (!imageMotionAllowed()) return;
  if (!treeEl.querySelector('.card img[data-unsized]')) return; // 全都已撑开 → 图到达时布局不会变
  pendingImgPlaces = captureCardPlaces(true); // 同 render 开头那套量法（含 pan 快照）
  pendingImgT0 = performance.now();
}
function onImageArrived(img) { // 图到达（含失败）：有预存位置就播过渡，否则退回原来的重画连线
  if (img) delete img.dataset.unsized;
  const prev = pendingImgPlaces;
  pendingImgPlaces = null; // 一次 render 只服务第一张到的图：多张同时到时，后面的位置已不是快照里的了
  const fresh = prev && (performance.now() - pendingImgT0) <= MOTION_IMG_WAIT_MS; // 快照还新鲜才播
  if (fresh && prev.size && imageMotionAllowed() && playCardMove(prev)) return; // 播起来了：它内部逐帧画线并收尾
  scheduleEdges(); // 没播（没开动效 / 门闩 / 谁都没挪位）→ 照老路重画连线
}
// 收尾：清掉行内 transform/transition，卡片回到纯布局位置，再对齐一次连线。
// render 开头也会调它：上一段过渡没跑完就来了新 render，必须先落地，否则量到的是动画中间态。
function clearCardMove() {
  if (motionFrame) { cancelAnimationFrame(motionFrame); motionFrame = 0; }
  motionEdgeList = null; motionOff = null; // 边表与位移表只服务这一段过渡，别留到下次
  treeEl.querySelectorAll('.node-row[data-id] > .card').forEach((card) => {
    if (card.style.transform || card.style.transition) { card.style.transform = ''; card.style.transition = ''; }
  });
}
// ============ 渲染（垂直树） ============
function render() {
  // 位移过渡（实验性）：先让上一段没跑完的过渡落地（量到真位置），再量下当前所有卡片的位置。
  // 放在任何改动之前，因为下面第一件事就是 treeEl.innerHTML = ''（整树重建）。
  if (motionFrame) clearCardMove();
  const prevPlaces = captureCardPlaces();
  // 重绘闸门（2026-09-20）：整树重建前，若正有人在编辑就先把编辑收尾保存。
  // 否则编辑框被 innerHTML='' 连字一起销毁、焦点掉回 body → 后续 Enter/Tab 走全局键位、
  // 点空白也不触发 blur（元素已不在文档）→ 打的字全丢、文件里也没有。
  // finish 内部第一行就会撤销登记，故 onFinish 里再调 render 不会递归。
  if (activeEditFinish) {
    const f = activeEditFinish;
    activeEditFinish = null;
    try { f(); } catch (_) { /* 收尾失败也不能挡住重绘 */ }
  }
  refreshImgSizeRef(); // 图片占位尺寸按当前 --img-maxw/maxh 取（旋钮改了缓存自动作废，见 imgSizeCache 注释）
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
  // 重设 transform 保留缩放/平移（render 重建 DOM 后 transform 失效）
  applyTreeTransform();
  // 节点快捷菜单跟随选中状态（渲染后重新定位；无选中时隐藏，单选/多选都显示）
  if (state.selectedId || state.multiSelected.size) showNodeMenu();
  else hideNodeMenu();
  updateNowSideBtn(); // 刷新侧边 Now 按钮的置灰/图标态
  updateFoldBar(); // 2026-08-30：右下角常驻折叠层级条跟随树结构/层级数刷新（折叠操作后层数变化）
  // 历史只读态：render 会重建整棵 DOM，差异标红必须在这里补回来。否则任何一次"只调 render"的
  // 重渲染（折叠条按层折叠、缩放等）都会把红框冲没 —— 原先只有 renderHistoryTree 贴红，漏在这。
  if (state.historyMode) applyHistoryDiffClasses();
  applyPendingKeepView(); // 2026-09-13：keepView 的锚定补偿在 render 末尾同步应用（一次绘制即最终画面）
  playCardMove(prevPlaces); // 位移过渡（实验性）：锚定补偿之后再放动画，两者互不干扰
  pendingDropStart = null; // 落位起点只服务紧跟其后的这一次 render（没做成动画也要清掉，别留到下次）
  armImageMotion(); // 本次渲染里还有没撑开的图 → 预存位置，图到了走一次过渡（见 onImageArrived）
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
  if (t) { state.dragPreview = t; state._lastDrop = { targetId: t.targetId, position: t.position }; } // 记住落点，供换挡余量判据
  else if (state.dragId) { state.dragPreview = { targetId: null, position: 'root' }; }
  applyDragPreview(state.dragPreview);
  updateDragCurve(state.dragPreview, np.x, np.y);
}
treeEl.ondragleave = () => { state.dragPreview = null; clearDragHighlights(); };
treeEl.ondrop = e => {
  e.preventDefault();
  if (state.dragId) {
    const dp = state.dragPreview;
    // 落位动画从「松手处」起步（armDropStart 记屏幕位置，render 末尾的位移过渡拿它当旧位置）
    const go = (tid, before) => { armDropStart(e.clientX, e.clientY); moveNodes(state.dragIds, tid, before); };
    if (dp && dp.position === 'invalid') {
      // 超出截断距离：拖拽无效，不移动（2026-08-22）
    } else if (dp && dp.targetId && dp.targetId !== state.dragId) {
      if (dp.position === 'before') go(dp.targetId, true);
      else if (dp.position === 'after') go(dp.targetId, false);
      else if (dp.position === 'over') go(dp.targetId);
      else go('root');
    } else {
      go('root');
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
    panX -= autoScrollDX / (zoom || 1); // 单坐标系：画布无限无边界，滚屏=改 pan
    panY -= autoScrollDY / (zoom || 1);
    applyTreeTransform();
    drawEdges();
    schedulePersist();
    // 节点拖拽中：画面滚了、光标底下节点变了 → 重新预测落点并高亮（框选时不跑，避免误显插入线）
    if (state.dragId) {
      buildDragRects(); // 画面滚了 → 节点视口坐标变了，刷新缓存再预测
      const np = dragNodeXY(lastDragX, lastDragY); // 与 treeEl.ondragover 同基准：节点左中心
      const t = nearestDropTarget(np.x, np.y);
      state.dragPreview = t || { targetId: null, position: 'root' };
      if (t) state._lastDrop = { targetId: t.targetId, position: t.position };
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
// 深色模式开关（2026-09-18）：在画布根元素挂/摘 .theme-dark —— mindmap-app.css 末尾的深色令牌块据此生效。
// 明暗 × 风格是两条**独立的类轴**（.theme-dark × .nm-theme-*），纯 CSS 组合出全部状态；
// 深色下切主题、主题下切深色，都只是类的增减，不存在「内联被清掉要重放」这类双轨 bug。
// 主题色（2026-09-20）：链接色默认跟随 **Obsidian 的主题色**。画布是 iframe，自己读不到宿主的 CSS 变量，
// 所以宿主把 Obsidian 当前的链接色/强调色读出来随 init / setAccent 推下来（见 main.js obsidianAccentColor）。
// 落点写在内联 `--nm-ob-accent` 上，由 CSS 决定谁引用它（mindmap-app.css 的 --link-color）——
// 这样「链接色 = 主题色」是默认行为，用户仍可用自己的 CSS 片段改 --link-color 覆盖，不必动 JS。
// 空值 = 撤掉内联（不是写空字符串：var() 认了空值就不会走兜底）。
function applyAccent(v) {
  const st = document.documentElement.style;
  const c = String(v == null ? '' : v).trim();
  if (c) st.setProperty('--nm-ob-accent', c);
  else st.removeProperty('--nm-ob-accent');
}
let nmDarkOn = false;
let nmLastTheme = 'default';
function applyDarkMode(on) {
  nmDarkOn = !!on;
  document.documentElement.classList.toggle('theme-dark', nmDarkOn);
  applyCanvasBg(); // 明暗一换，自定义底色也要跟着换成该档的那个（2026-09-20）
}
// 画布背景色（2026-09-20，设置页调色板小窗）：用户在每档下自定义的底色，写成 html 上的内联 --bg。
// 为什么用内联：--bg 是 CSS 令牌，浅色在 :root、深色在 .theme-dark 块里 —— 内联样式优先级最高，
// 一处覆盖两档；空串 = 撤掉内联、回到 CSS 默认（浅 #ffffff / 深 #1c1c1c）。
// 只动 --bg 一个令牌：连线色、卡片底、控件配色等仍由主题 / 深色块决定（用户要的是「画布背景色」这一项）。
function applyCanvasBg() {
  const v = nmDarkOn ? state.canvasBgDark : state.canvasBgLight;
  const st = document.documentElement.style;
  if (v) st.setProperty('--bg', v);
  else st.removeProperty('--bg');
}
// 主题类名（2026-09-18 收编）：applyTheme 从「JS 逐个写内联变量」改为「只切类」，
// 所有颜色值住 mindmap-app.css 的 .nm-theme-* 类（用户改色只去 CSS 一个地方）。
const NM_THEME_CLASSES = ['nm-theme-feishu', 'nm-theme-feishuGray', 'nm-theme-feishuPink'];
function applyTheme(t) {
  nmLastTheme = t;
  const cl = document.documentElement.classList;
  NM_THEME_CLASSES.forEach((c) => cl.remove(c));
  if (t === 'feishu' || t === 'feishuGray' || t === 'feishuPink') cl.add('nm-theme-' + t);
  // 其余值走 CSS :root 默认；深色叠加 = .theme-dark.nm-theme-* 组合选择器（CSS 里），无需任何重放。
}
function edgeD(x1, y1, x2, y2) {
  const dx = Math.max(20, (x2 - x1) / 2);
  return 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2;
}
function paintEdgePaths(list) {
  while (edgePathEls.length > list.length) { const el = edgePathEls.pop(); el.remove(); }
  while (edgePathEls.length < list.length) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    edgesSvg.appendChild(el); edgePathEls.push(el);
  }
  for (let i = 0; i < list.length; i++) edgePathEls[i].setAttribute('d', edgeD(list[i].x1, list[i].y1, list[i].x2, list[i].y2));
}
// 过渡期间按进度 e（0=起点 1=终点）只改受影响的边：两端都不动的边 d 没变，跳过。
function paintMotionEdges(e) {
  const list = motionEdgeList;
  if (!list || !motionOff) return;
  const k = 1 - e;
  for (let i = 0; i < list.length; i++) {
    const ed = list[i];
    const po = motionOff.get(ed.pid), ko = motionOff.get(ed.kid);
    if (!po && !ko) continue;
    const el = edgePathEls[i];
    if (!el) continue;
    const x1 = ed.x1 + (po ? po.dx * k : 0), y1 = ed.y1 + (po ? po.dy * k : 0);
    const x2 = ed.x2 + (ko ? ko.dx * k : 0), y2 = ed.y2 + (ko ? ko.dy * k : 0);
    el.setAttribute('d', edgeD(x1, y1, x2, y2));
  }
}
// 收边：读矩形拼出边表（树内坐标）。过渡之外的一切重画都走这里。
function collectEdges() {
  const tr = treeEl.getBoundingClientRect();
  // edges SVG 是 treeEl 的子元素，会随 scale 一起缩放 → 内部 path 必须用「本地坐标」= 屏幕距离 / zoom，
  // 否则缩放时曲线被二次缩放，导致线和节点错位（2026-08-21 修：刷新后错位、点 ⟳ 消失的根因）
  const s = zoom || 1;
  const list = [];
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
      list.push({
        x1: x1, y1: y1,
        x2: (kr.left - tr.left) / s, y2: (kr.top + kr.height / 2 - tr.top) / s,
        pid: row.getAttribute('data-id'),
        kid: (kc.parentElement && kc.parentElement.getAttribute('data-id')) || ''
      });
    });
  });
  return list;
}
function drawEdges() {
  const edgesT0 = performance.now(); // 实测本次耗时 → 供 scheduleEdges 分流（见 EDGES_HEAVY_MS 注释）
  const list = collectEdges();
  edgesSvg.setAttribute('width', treeEl.scrollWidth || 10);
  edgesSvg.setAttribute('height', treeEl.scrollHeight || 10);
  paintEdgePaths(list);
  edgesHeavy = (performance.now() - edgesT0) > EDGES_HEAVY_MS; // 贵不贵：决定图片到达后同帧跟进还是静默合批
  return list; // 过渡期间拿它当「终点边表」（见 paintMotionEdges）
}
// ── 连线重画调度器（2026-09-13）────────────────────────────────────────────
// 图片/媒体是异步逐个到达的，每个到达都可能改变行高 → 需要重画曲线。若在加载回调里直接整树
// 重画，图片多的文件会退化成「一个资源一次全量重画」：单次要遍历整棵树、读全部卡片矩形、重拼
// 全部 SVG 路径，成百次叠加足以占满主线程——连 layoutSettled 的兜底定时器都会被饿死，表现
// 为「打开大文件卡死十几秒」（实测 225 张图：231 次 × 45ms ≈ 10 秒）。
//
// 老办法「安静 EDGES_QUIET(180ms) 后画一次」压住了这个量，但留了个副作用：等待期里布局已经
// 变了、曲线还是旧的 —— 线与节点错位整整 180ms 再突然归位，就是「展开带图节点时连线抖一下」。
//
// 2026-09-20 改**自适应**：按单次重画的实际耗时分流（耗时由 drawEdges 末尾实测，见 edgesHeavy）。
//   · 轻（≤ EDGES_HEAVY_MS，绝大多数文件）→ rAF 同帧跟进。回调在下一帧**渲染之前**执行，
//     读到的已是图片撑开后的新布局，曲线与节点在同一帧一起呈现 —— 没有错位中间态，也就不抖。
//     合批由 rAF 门闩保证（一帧最多一次），不会退化成「一张图一次」。
//   · 重（> EDGES_HEAVY_MS，超大文件）→ 退回静默合批。这种文件一次重画就要几十毫秒，
//     逐帧跟只会把主线程占满（就是上面那个 10 秒）→ 宁可留一点错位，也不能卡死。
// 揭幕前（viewMap opacity:0）不排：画面不可见时重画只会抢主线程，而抢的正是资源加载本身；
// 揭幕那一刻 startInitCenter 的 ResizeObserver 回调会同步重画一次，不会漏。
const EDGES_HEAVY_MS = 12;  // 单次重画超过这么多毫秒 = 「重画很贵」，退回静默合批
const EDGES_QUIET = 180;    // 静默时长（ms）：异步资源安静这么久才重画一次（仅重画很贵时启用）
const EDGES_MAX_WAIT = 700; // 保底上限（ms）：资源持续到达时也按这个节奏跟进（同上）
let edgesHeavy = false;     // 本次重画贵不贵：drawEdges 末尾实测写入
function viewHiddenForEdges() { return viewMap.style.opacity === '0'; }
let edgesTimer = null, edgesFirstAt = 0;
function scheduleEdges() {
  if (viewHiddenForEdges()) return;
  if (!edgesHeavy) { redrawEdgesNextFrame(true); return; } // 常规：同帧跟进，线与节点一起到位
  const now = performance.now();                       // 重画很贵：退回静默合批，保主线程
  if (edgesTimer == null) edgesFirstAt = now;
  else clearTimeout(edgesTimer);
  const wait = (now - edgesFirstAt >= EDGES_MAX_WAIT) ? 0 : EDGES_QUIET;
  edgesTimer = setTimeout(() => { edgesTimer = null; reanchorAfterReflow(); drawEdges(); }, wait);
}
// 编辑/组字用的重画（2026-09-13）：编辑中卡片一变宽，它自己的子节点整列立刻被布局挤走 → 连线必须
// 跟上；但组字期间不能做同步重活（会打断输入法候选/成对符号配对）→ 合并到下一帧，一帧最多一次。
let edgesFrameId = 0, edgesFrameReanchor = false;
// reanchor=true：异步资源（图片等）撑开布局后调用 —— 重画前先按折叠锚点补一次位（见 reanchorAfterReflow）。
// 其余调用点（编辑/组字时不传）：编辑改的是卡片宽度，不该由折叠锚点牵着画面走。
function redrawEdgesNextFrame(reanchor) {
  if (reanchor) edgesFrameReanchor = true;
  if (edgesFrameId) return;
  edgesFrameId = requestAnimationFrame(() => {
    edgesFrameId = 0;
    const doReanchor = edgesFrameReanchor; edgesFrameReanchor = false;
    if (doReanchor) reanchorAfterReflow(); // 补位与重画同帧：不出现「节点先动、线慢半拍」
    drawEdges();
  });
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
function buildRow(node, depth, doneChain, tdChain) {
  doneChain = doneChain || false;
  // 自身完成 = Minor，或**已完成的待办**（2026-09-20）：Done 待办跟 Minor 同等待遇 ——
  // 同样置灰 + 灰虚线框、同样被「隐藏 Minor/Done」收走、同样在复制子树时跳过。
  // 与 Minor 的区别是外观上多一条删除线（.node-row.td-done）。
  const selfDone = nodeIsMinor(node) || nodeTodoDone(node);
  const done = doneChain || selfDone;
  // 删除线**跟着子树传**（2026-09-20 用户定：母节点标了 Done，它下面所有子节点也要加删除线）。
  // ⚠️ 和 done 链一样是"连坐"的 —— 所以两个链都要往下传，别只传 done。
  const td = tdChain || nodeTodoDone(node);
  // 隐藏已完成：渲染前直接跳过 done 节点（含其整棵子树）——数据层过滤，曲线/画布都看不到它们
  // （2026-08-21 定：先过滤再渲染，避免 CSS display:none 导致贝塞尔线坐标异常伸到左边无穷远；根节点即使 done 也保留，防画面全空）
  if (state.hideDone && done && depth > 0) return null;
  // 只显示 Now：不在可见集（且非根）→ 剔除渲染（同 hideDone 机制：先过滤再渲染，避免 display:none 让贝塞尔线坐标异常；根恒保留）
  // 2026-08-28：刚新建的节点豁免筛选（只看 Now 下回车新建同级不应被瞬间隐藏——需求：按下那一刻筛选，后续自由写新东西）
  if (nowVisibleSet && depth > 0 && !nowVisibleSet.has(node.id) && !state.justCreated.has(node.id)) return null;
  const row = document.createElement('div');
  // row-lv0/row-lv1/row-lv2：行层级类，CSS 按层区分间距（2026-08-21 定：lv1 兄弟 12px，更深 2px）
  const isMulti = state.multiSelected.has(node.id) && state.selectedId !== node.id;
  row.className = 'node-row row-lv' + Math.min(depth, 2) + (isSelected(node.id) ? ' selected' : '') + (isMulti ? ' multi-selected' : '') + (done ? ' done' : '') + (td ? ' td-done' : '') + (node.bold ? ' bold' : ''); // 2026-08-30：补 bold 类（原只挂到链接节点，普通节点漏了→加粗不显示）；2026-09-20：补 td-done（已完成待办 → 删除线，且连坐子树）
  row.dataset.id = node.id;
  row.dataset.depth = depth;

  row.appendChild(buildCard(node, depth, done));

  if (node.children.length && !node.fold) {
    const kids = document.createElement('div');
    kids.className = 'children';
    node.children.forEach(c => { const sub = buildRow(c, depth + 1, done, td); if (sub) kids.appendChild(sub); });
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
    // 空标题节点的前缀图标：按**与 cardTitleInner 相同的顺序**（进度% → 待办 → Now → Minor）收集，
    // 收集完再交给 prependInOrder 一次放好（**别在这里一个个 insertBefore(firstChild)** ——
    // 那是"每次插到最前"，正序插会把顺序整个翻过来，2026-09-21 实踩：编辑后 Todo 跑到最后）。
    const nodes = [];
    if (!node.title && todoPctShown(node)) {
      const wrap = document.createElement('span');
      wrap.contentEditable = 'false';
      wrap.innerHTML = todoPctHtml(node);
      if (wrap.firstChild) nodes.push(wrap.firstChild);
    }
    if (!node.title && nodeTodoAny(node)) {
      const ico = document.createElement('span');
      ico.className = 'todo-ico' + (nodeTodoDone(node) ? ' td-on' : '');
      ico.contentEditable = 'false';
      ico.innerHTML = renderTodoIcon(12, nodeTodoDone(node));
      ico.title = nodeTodoDone(node) ? T('tip.todoIconDone') : T('tip.todoIconTodo');
      nodes.push(ico);
    }
    if (!node.title && selfNow) {
      const ico = document.createElement('span');
      ico.className = 'now-ico'; ico.contentEditable = 'false';
      ico.innerHTML = renderNowPrefix(); ico.title = T('tip.nowIcon');
      nodes.push(ico);
    }
    if (!node.title && selfDone) {
      const ico = document.createElement('span');
      ico.className = 'minor-ico'; ico.contentEditable = 'false';
      ico.innerHTML = renderIcon(minorIconName(node), 12); ico.title = T('tip.minorIcon');
      nodes.push(ico);
    }
    prependInOrder(titleEl, nodes);
  }

  if (node.title != null) { // 2026-08-28：空字符串也渲染 title（空白节点双击进编辑需要 .title 元素存在；原 if(node.title) 空串 falsy 跳过）
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = cardTitleInner(node); // 标题里内嵌的 [[标题|ID]] 渲染成链接（含自身 Minor 置灰小箭头）
    prependIcoIntoTitle(title); // 空标题节点的前缀图标塞进 title 元素内，避免卡片 column 布局拆成两排
    attachTodoIco(title, node); // 待办小图标可点击（每次重建标题 DOM 都要重绑，2026-09-20）
    attachTodoPct(title, node); // 进度百分比可点击（每次重建标题 DOM 都要重绑，2026-09-20 起就是这条规矩）
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
      // 折叠：历史态与编辑态走【同一条】路（2026-09-14 修 —— 原来给历史态单开一个早返回分支、漏了 keepView，
      // 表现为"点了折叠按钮，原来点的那张卡跑掉/画面不定住"）。历史态唯一该少的就是「写回」：
      // 不 pushUndo（撤销栈不该被沙盒污染）、不 emitUpdate（守卫本来也拦着）。
      if (!state.historyMode) pushUndo();
      node.fold = !node.fold;
      keepView(node); // 锚定本次点的这张卡：折叠会改布局把它顶走，记下坐标由 render 末尾补偿
      if (state.historyMode) { renderHistoryTree(false, true); return; } // 历史态折叠同样走过渡（2026-09-20 放开）
      emitUpdate();
      renderWithMotion(); // 折叠/展开让周围节点平滑让位（关掉动效：设置页「高级 → 动效」）
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
  // 排序（2026-09-19 用户定）：**标题语法提升图在前，手动粘贴的附件图在后**
  const inlineImgs = nmExtractInlineImages(node.title || '').images;
  const allNodeImgs = inlineImgs.concat(node.images || []);
  if (allNodeImgs.length) {
    const imgs = document.createElement('div');
    imgs.className = 'imgs';
    allNodeImgs.forEach(p => {
      const img = document.createElement('img');
      img.className = 'img';
      img.dataset.path = p;
      img.alt = '';
      // 2026-09-17：悬停提示里带上文件名 —— 图缺失时用户能知道缺的是哪张（原来只写「双击放大」）
      img.title = p + '\n' + T('tip.image');
      // 返回 false = 没记住过尺寸 → 这张图到达时会把卡片撑高、整片布局跟着动 → 打标记，
      // render 末尾据此预存一份「撑开前」的位置，图到了就走一次位移过渡（见 armImageMotion）。
      if (!applyImgSizeHint(img, p)) img.dataset.unsized = '1';
      reqImg(p, img);
      // 图片异步加载完 → 树 reflow → 节点坐标变，重画曲线防错位（2026-08-25 修：覆盖打开/切页后图片晚于 render 到达的情况）
      img.onload = () => { img.classList.remove('img-missing'); delete img.dataset.missing; img.alt = ''; rememberImgSize(img, p); onImageArrived(img); };
      img.onerror = () => { dropImgSizeHint(img, p); markImgMissing(img, p); onImageArrived(img); };
      img.onclick = e => {
        e.stopPropagation();
        selectNode(node.id);
        document.querySelectorAll('.card .img').forEach(im => im.classList.remove('selected'));
        img.classList.add('selected');
        state.selectedImg = { nodeId: node.id, path: p }; // 选中图片：Cmd+C/X 复制/剪切图片
      };
      // 双击：正常图 → 大图预览；缺失图 → 弹说明框（写明缺的是哪张 + 可点「重新查找」）
      img.ondblclick = e => {
        e.stopPropagation();
        if (isImgMissing(img)) { showMissingImgInfo(p); return; }
        openImagePreview(p);
      };
      img.oncontextmenu = e => { e.stopPropagation(); e.preventDefault(); if (!state.historyMode) buildCtxMenu(e.clientX, e.clientY, node, 'image', p); }; // 历史态：连原生图片菜单也不弹
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
          else { // 无法识别的链接文本：原样展示，不静默丢弃（用户可见自己写的内容自行修正）
            const span = document.createElement('span');
            span.className = 'link link-raw';
            span.textContent = node.link;
            span.title = T('tip.editLinkSuffix');
            span.onclick = e => { e.stopPropagation(); startEditLink(node, span); };
            span.ondblclick = e => { e.stopPropagation(); startEditLink(node, span); };
            card.appendChild(span);
          }
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
      media.onload = () => scheduleEdges();
      media.onloadedmetadata = () => scheduleEdges();
      media.onerror = () => { media.classList.add('img-missing'); scheduleEdges(); };
      if (isAudio) {
        // 音频：整个元素就是原生控制条，点它收不到点击（被控件吞掉）→ 点选中那套对它无效，
        // 只能在外面包一层、右上角挂一个真按钮来删。（2026-09-17 定：只有音频这样）
        const wrap = document.createElement('div');
        wrap.className = 'embed-item';
        wrap.dataset.path = p;
        wrap.appendChild(media);
        const del = document.createElement('button');
        del.className = 'embed-del';
        del.title = T('ctx.deleteImage');
        del.innerHTML = renderIcon('trash-2', 14);
        del.onclick = e => {
          e.stopPropagation(); e.preventDefault();
          if (state.historyMode) return;
          state.selectedImg = { nodeId: node.id, path: p };
          removeSelectedImage(false);
        };
        wrap.appendChild(del);
        box.appendChild(wrap);
      } else {
        // 视频：与图片完全同款 —— 点一下选中（粉框）+ Delete / Cmd+X 删除
        //（视频有大片「画面」不属于控件，点得中，所以这套对它有效）
        media.onclick = e => {
          e.stopPropagation();
          selectNode(node.id);
          document.querySelectorAll('.card .embed-media').forEach(m => m.classList.remove('selected'));
          media.classList.add('selected');
          state.selectedImg = { nodeId: node.id, path: p };
        };
        media.oncontextmenu = e => { e.stopPropagation(); e.preventDefault(); if (!state.historyMode) buildCtxMenu(e.clientX, e.clientY, node, 'image', p); };
        box.appendChild(media);
      }
    });
    card.appendChild(box);
  }

  card.ondragstart = e => {
    state.dragId = node.id;
    state._lastDrop = null; // 新一次拖拽：换挡余量的「上一刻落点」从头算
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
        armDropStart(e.clientX, e.clientY); // 同上：落位动画从松手处起步
        if (t.position === 'before') moveNodes(state.dragIds, t.targetId, true);
        else if (t.position === 'after') moveNodes(state.dragIds, t.targetId, false);
        else moveNodes(state.dragIds, t.targetId);
      } else {
        armDropStart(e.clientX, e.clientY);
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
// 平移入口（2026-09-01）：用户输入滚动（触控板双指/滚轮/空格拖动）全部走 transform，
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
    currentRootPid: state.currentRootPid || ''
  };
}
// 离散事件（下钻/折叠/居中/重置/切调试）立即写，不吃去抖定时器（否则最后一个离散操作会被吃掉）
function persistNow() {
  if (!booted) return;
  if (state.historyMode) return; // 沙盒：历史界面里的一切视图变更都不落盘、不进宿主内存（退出由 sandboxRestore 整组还原）
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
    if (!booted || state.historyMode) return; // 沙盒里同样不落盘（与 persistNow 一致）
    vscode.postMessage({ type: 'setView', viewKey: key, value: view });
  }, 150);
}
// 等布局真正稳定再定位：图片 decode + 字体就绪 + 双 rAF。
// 否则异步加载让树 reflow → 定位算在旧尺寸上 → 画面偏移。
function layoutSettled(cb) {
  // 2026-09-17 修「只要有一张图缺失，每次打开就慢两三秒」：
  // 缺失图（宿主回 null 后我们只标 .img-missing、**从不设 src**）永远不会触发 load/error，
  // 留在 pending 里 → 计数永远不归零 → 每次都等满兜底时间。这里把已判定缺失的图排除在外。
  // （正常图仍照等：渲染时 src 还没到，等宿主回执 + 图片解码。）
  const imgs = Array.prototype.slice.call(document.querySelectorAll('#tree img'))
    .filter(im => !im.classList.contains('img-missing'));
  let pending = imgs.length + 1; // +1 等字体 ready
  let settled = false;
  const fire = () => { if (settled) return; settled = true; requestAnimationFrame(() => requestAnimationFrame(cb)); };
  const onOne = () => { if (--pending <= 0) fire(); };
  imgs.forEach(im => { im.addEventListener('load', onOne, { once: true }); im.addEventListener('error', onOne, { once: true }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onOne);
  else onOne(); // 无 fonts API（老环境）：直接当作字体就绪
  setTimeout(fire, 2000); // 兜底：坏图/字体 API 卡住也不阻塞还原
  // 注：刻意**不缩短**这个兜底 —— 正常路径靠 load/error 收口，缺失图现在也会主动补一次 error
  // （见 imgUriRes 处理），所以「有图缺失」不再拖满兜底；缩短反而可能让开屏定位在图片还没加载完
  // 时就结算，把定位算歪。
}
// 整树居中（兜底定位：无卡片可定位时用）。单坐标系下画布无限，居中 = 解 pan 使树中心落在视口中心：
// screen = zoom*(world+pan) → pan = viewport/(2*zoom) - treeSize/2
function centerView() {
  panX = viewMap.clientWidth / (2 * (zoom || 1)) - treeEl.offsetWidth / 2;
  panY = viewMap.clientHeight / (2 * (zoom || 1)) - treeEl.offsetHeight / 2;
  applyTreeTransform();
}
// 开屏观察期（2026-09-13 简化）：单坐标系下图片/字体晚到的 reflow 不会移动相机（无 flex 居中、无滚动裁剪），
// 观察期只剩一件事——reflow 后重画曲线；onSettled 在首帧回调触发揭幕（viewMap 从 opacity:0 恢复）。
let initCenterObs = null;
function startInitCenter(onSettled) {
  if (initCenterObs) initCenterObs.disconnect();
  let settled = false;
  const done = () => { if (settled) return; settled = true; try { if (onSettled) onSettled(); } catch (e) {} };
  initCenterObs = new ResizeObserver(() => { drawEdges(); done(); });
  initCenterObs.observe(treeEl); // observe 即触发首帧回调 → drawEdges + 揭幕
  setTimeout(() => { if (initCenterObs) { initCenterObs.disconnect(); initCenterObs = null; } done(); }, 3000);
}
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
// 「画布中央」定位基准（2026-09-16 设置项「更多 → 画布中央」，下拉二选一）：
//  · canvas 画布中央（默认）= 落点读 app.css :root 的 --center-canvas-x/y；
//  · visual 视觉中央         = 落点读 app.css :root 的 --center-visual-x/y。
// 两档的落点都在 app.css :root 里、挨着放，各自可自由调（互不影响）；选中哪档就把该档 x/y 覆写进下面三个变量。
// 好处：所有定位入口（定位按钮 / 下钻·返回 / 重置 / 开屏归位 / 定位子菜单预览）都只读这三个变量 → 改一处即全局生效，无需逐个改代码。
function applyCenterMode(mode) {
  const m = (mode === 'visual') ? 'visual' : 'canvas';
  const r = document.documentElement;
  const x = cfgNum('--center-' + m + '-x', 0.4);
  const y = cfgNum('--center-' + m + '-y', 0.4);
  r.style.setProperty('--locate-selected-x', String(x));
  r.style.setProperty('--locate-first-x', String(x));
  r.style.setProperty('--locate-y', String(y));
}
// 智能定位（定位按钮 / 下钻·返回后自动调用）：
// - 选中节点或编辑中 → 该节点居中（水平=--locate-selected-x）
// - 未选中 → 第一层级=最前面那个节点=当前根（currentRoot）居中（水平=--locate-first-x）
// 垂直位置统一=--locate-y；是否重置缩放=--locate-reset-zoom（2026-09-13 单坐标系后 --locate-reset-pan 废弃）
// 旋钮集中在 app.css :root 的「定位调参」区，改完重载插件生效
// 定位共用：算出目标 pan/zoom → animateScrollTo 从当前值按缓动曲线插值过去（rAF 循环）。
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
function animateScrollTo(targetPanX, targetPanY, targetZoom, onDone) {
  if (scrollAnimRAF) cancelAnimationFrame(scrollAnimRAF);
  if (scrollAnimFallback) { clearTimeout(scrollAnimFallback); scrollAnimFallback = null; }
  // 开关关闭 = 瞬间到位：不走 rAF 缓动，直接落位（2026-08-30 定，见 locateSmoothOn 注释）
  if (!locateSmoothOn) {
    panX = targetPanX; panY = targetPanY; zoom = targetZoom;
    applyTreeTransform(); drawEdges();
    if (onDone) onDone();
    return;
  }
  const dur = cfgNum('--locate-anim-dur', 350);
  const x1 = cfgNum('--locate-anim-x1', 0.42);
  const y1 = cfgNum('--locate-anim-y1', 0);
  const x2 = cfgNum('--locate-anim-x2', 0.58);
  const y2 = cfgNum('--locate-anim-y2', 1);
  const z0 = zoom, pX0 = panX, pY0 = panY;
  const t0 = performance.now();
  // 兜底：切标签页/窗口失焦时浏览器会暂停 rAF → 动画卡住不完成；dur+200ms 后强制收尾（2026-08-30 报"曲线消失"）
  scrollAnimFallback = setTimeout(() => {
    if (scrollAnimRAF === null) return;
    scrollAnimRAF = null; scrollAnimFallback = null;
    panX = targetPanX; panY = targetPanY; zoom = targetZoom;
    applyTreeTransform(); drawEdges();
    if (onDone) onDone();
  }, dur + 200);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = easeCubicBezier(t, x1, y1, x2, y2);
    zoom = z0 + (targetZoom - z0) * e;
    panX = pX0 + (targetPanX - pX0) * e;
    panY = pY0 + (targetPanY - pY0) * e;
    applyTreeTransform();
    drawEdges();
    if (t < 1) scrollAnimRAF = requestAnimationFrame(step);
    else { scrollAnimRAF = null; if (scrollAnimFallback) { clearTimeout(scrollAnimFallback); scrollAnimFallback = null; } if (onDone) onDone(); }
  };
  scrollAnimRAF = requestAnimationFrame(step);
}
// 停掉正在跑的视口位移动画（归位 / 定位用）。两处调用，原因都是"别让它继续改 pan/zoom 把用户的位置带跑"：
//  · 换历史快照时：不停 → 首次归位的动画会继续滑到目标位置，用户想"保持视角"就失效；
//  · 退出历史界面时：不停 → 动画会在退出后继续写 pan/zoom，把刚还原好的编辑态视角又带偏。
// 停 = 停在当前插值位置（动画每帧都在更新 zoom/panX/panY，就是用户此刻看到的位置）。
// 这里不主动 applyTreeTransform：紧跟着的 render() / sandboxRestore() 会用当前值落位。
function stopViewAnim() {
  if (scrollAnimRAF) { cancelAnimationFrame(scrollAnimRAF); scrollAnimRAF = null; }
  if (scrollAnimFallback) { clearTimeout(scrollAnimFallback); scrollAnimFallback = null; }
}
// 卡片中心的世界坐标（#tree 内布局坐标，不含 pan/zoom）：offset 链累加，不读屏幕矩形 → 与当前相机无关、无时序问题
function worldCenter(el) {
  let x = 0, y = 0, n = el;
  while (n && n !== treeEl) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}
// 把卡片中心放到视口 (xRatio, --locate-y) 处：解 pan = 目标屏幕点/zoom - 世界坐标（screen = zoom*(world+pan)）
function placeCardAtViewport(el, xRatio, onDone) {
  const z2 = cfgBool('--locate-reset-zoom', true) ? 1 : zoom;
  const vr = viewMap.getBoundingClientRect();
  const c = worldCenter(el);
  animateScrollTo(vr.width * xRatio / z2 - c.x, vr.height * cfgNum('--locate-y', 0.5) / z2 - c.y, z2, onDone);
}
function locateCenter() { // 定位按钮（2026-09-18 用户定改写）：**编辑中/已选中 → 该节点定位自定义位；未选中 → 主节点定位同一位**（替代原「选中节点定位」「主节点定位」两条命令；zoom 回 100% 是 placeCardAtViewport 的默认行为，旋钮 --locate-reset-zoom）
  // 原「没选中 → 循环定位 Now」不再走这里（定位子菜单里的 Now 列表定位 locateToItem 不受影响）
  const selX = cfgNum('--locate-selected-x', 0.5);
  const activeId = state.selectedId || state.editingTitleId || state.editingNoteId || null;
  const el = activeId && document.querySelector('.node-row[data-id="' + activeId + '"] .card');
  if (el) { placeCardAtViewport(el, selX); return; }
  const root = currentRoot();
  const rootEl = root && document.querySelector('.node-row[data-id="' + root.id + '"] .card');
  if (rootEl) { placeCardAtViewport(rootEl, selX); return; }
  centerView(); drawEdges(); // 兜底：当前根无卡片 → 整画布居中
}
function resetView() {
  render();
  locateCenter(); // 2026-09-13 改同步：rAF 版会先画一帧「新树 + 旧位置」再开始居中 → 大树上一眼看到跳变；locateCenter 只读几何 + 写 pan/scroll，同步安全
  persistNow();
}
// 设当前为默认路径：把当前界面（下钻根节点）存为默认路径（持久化，跨重启）。
// 在主节点（未下钻）时 = 默认是主节点 → 发空 pid，宿主清掉文件头 node 字段
//（「没写 = 主节点」是规则本身，不给主节点生成/重复记录编号，2026-09-15 定稿）
function saveAsCurrent() {
  const root = currentRoot();
  if (!root) return;
  const atTreeRoot = root === state.tree;
  let pid = root.persistId;
  if (!atTreeRoot && !pid) {
    pid = genPersistId();
    root.persistId = pid;
    pushUndo();
    emitUpdate();
  }
  state.defaultPid = atTreeRoot ? '' : pid; // 立即更新：按钮变置灰（已是默认）
  updateDefaultPathBtn();
  vscode.postMessage({ type: 'saveAsCurrent', pid: atTreeRoot ? '' : pid });
}
// 返回默认路径：下钻回保存的默认节点（空 pid 即回根）；keep = 跳转后保持画面状态（2026-09-15）
function returnToDefault() {
  goTo(state.defaultPid || null, { keep: 'root' });
}
// ===== 路径历史栈（上一/下一路径）=====
// history 存 pid 序列（空串=根）；goTo 每次路径真正变化时调 recordPathHistory
// 路径历史上限（2026-09-15）：总条数封顶，超出挤最早（等效「回退+前进合计最多 40 步」）。内存态，关页面即清零。
const PATH_HISTORY_MAX = 40;
function recordPathHistory() {
  if (state.suppressHistory) return; // back/forward 自身移动时不重复记
  const cur = (state.currentRootPid || '').trim();
  const last = state.pathHistory[state.pathHistoryIndex];
  if (last === cur) return; // 没变化（如 goTo 同一节点）不记
  // 截断：从当前位置之后的「重做分支」全部丢弃（标准 undo/redo 语义）
  state.pathHistory = state.pathHistory.slice(0, state.pathHistoryIndex + 1);
  state.pathHistory.push(cur);
  state.pathHistoryIndex = state.pathHistory.length - 1;
  if (state.pathHistory.length > PATH_HISTORY_MAX) {
    const drop = state.pathHistory.length - PATH_HISTORY_MAX;
    state.pathHistory = state.pathHistory.slice(drop);
    state.pathHistoryIndex -= drop; // 挤掉头部后指针同步左移，保持指向「当前路径」
  }
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
// 画面锚定（2026-08-26 位置刷新优化；2026-09-13 改同步应用）：
// 用于「锚点上方/周围布局会变」的批量操作（层级条选中折叠、隐藏完成开关、Now 开关、节点菜单动作）——
// 单点折叠按钮不需要它：折叠只增删该卡下方的子树，卡片自身位置不变。
// 用法约束：keepView(node) 之后同一任务里必须紧跟 render()——锚定量在 render 末尾同步消费。
// 曾用 rAF 延后应用：浏览器会先把新布局画出来（卡片挪位、线还是旧的、pan 未补），
// 下一帧才补位置 + 重画 → 大树上一眼看到「内容先动、线慢半拍」的跳变；折叠大批量子节点时尤其明显。
// 改为 render 末尾同步应用后，从点击到上屏只有一次绘制，就是最终画面。
let pendingKeepView = null; // { pts:[{id,x,y}] }：keepView 记、render() 末尾 applyPendingKeepView 消费（首个仍存活的锚点生效）
// ── 锚定续命（2026-09-20）──────────────────────────────────────────────────
// 锚定补偿只在 render 末尾做一次，而图片是**异步**到达的：折叠展开时图还没加载，布局先按无图
// 算、锚点补好了；图一到达，卡片被撑高、整棵树重新排布，母节点被顶走 —— 补偿却早做完了，
// 于是画面上就看到「第一次展开带图节点，母节点往下移一点点」。之后再折叠展开就不移：图已进
// 缓存（且尺寸已被 imgSizeCache 记住、渲染时就按它占位），布局一次到位。
// 所以：锚定之后的一小段时间内，异步资源引起的重排也要按同一个锚点补一次位。
let lastKeepAnchor = null;     // { id, x, y, panX, panY, zoom, expire }：applyPendingKeepView 记
const KEEP_ANCHOR_MS = 2500;   // 锚定后多久内仍接受「图片撑开」补位（超时不再管，避免长期劫持画面）
const KEEP_ANCHOR_EPS = 0.5;   // 偏移不到半像素不补（亚像素抖动不值得动画面）
function reanchorAfterReflow() {
  const k = lastKeepAnchor;
  if (!k) return;
  // 位移过渡进行中：绝不改 pan —— pan 一动整屏跟着平移，动画中途画面会硬生生跳一下（2026-09-20）。
  // 锚点续命有 2.5s 窗口，动画结束后资源再到达时照样补得上。
  if (motionFrame) return;
  if (performance.now() > k.expire) { lastKeepAnchor = null; return; } // 超时：交还控制权
  // 视图期间被别处动过（用户平移/缩放、定位按钮、还原历史视图…）→ 作废，绝不抢用户的位置
  if (Math.abs(panX - k.panX) > 0.01 || Math.abs(panY - k.panY) > 0.01 || Math.abs(zoom - k.zoom) > 0.001) { lastKeepAnchor = null; return; }
  const a = rectCenter(k.id);
  if (!a) { lastKeepAnchor = null; return; } // 卡片没了（折叠回去/被删）
  const dx = k.x - a.x, dy = k.y - a.y;
  if (Math.abs(dx) < KEEP_ANCHOR_EPS && Math.abs(dy) < KEEP_ANCHOR_EPS) return; // 没被顶走
  panX += dx / zoom; panY += dy / zoom; applyTreeTransform();
  k.panX = panX; k.panY = panY; // 快照跟进：后面几张图陆续到达时还能接着补
  schedulePersist(); // 位置变了记一下（去抖，图片陆续到达不会连发）
}
// excludeIds（2026-09-20）：这些节点这次会被搬走（拖拽的整棵子树 / 落点目标），不能当替代锚点——
// 钉一个正在被搬走的东西，画面就跟着它一起跑。
function keepView(node, excludeIds) {
  const id = node && node.id;
  if (!id) return;
  const b = rectCenter(id);
  if (!b) return;
  // 锚点候选：第一个在 render 之后仍然存在者生效（过滤类操作会把锚点自己滤掉 → 补偿整段失效）。
  // 主锚点在视野外时补一个「视野内的替代」：钉一个看不见的东西 = 补偿量照算、画面照样跳，
  // 而用户眼里没有任何东西被"定住"（隐藏次要 / 只看当前关注这类按钮常踩到）。
  const pts = [{ id: id, x: b.x, y: b.y }];
  if (!inViewportRect(b)) {
    const alt = bestVisibleAnchorId(id, excludeIds);
    const ab = alt && rectCenter(alt);
    if (ab) pts.unshift({ id: alt, x: ab.x, y: ab.y }); // 视野内的排前面（各自带着自己量到的旧坐标）
  }
  pendingKeepView = { pts: pts }; // 记下 render 前的锚点坐标
}
// 视野内的备用锚点：选中节点优先（用户正在看它），否则取离视口中心最近的那张卡。
function bestVisibleAnchorId(excludeId, excludeIds) {
  const banned = (id) => id === excludeId || (excludeIds && excludeIds.has(id));
  if (state.selectedId && !banned(state.selectedId)) {
    const sb = rectCenter(state.selectedId);
    if (sb && inViewportRect(sb)) return state.selectedId;
  }
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  let best = null, bd = Infinity;
  treeEl.querySelectorAll('.node-row[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');
    if (!id || banned(id)) return;
    const c = row.querySelector(':scope > .card');
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const mx = r.left + r.width / 2, my = r.top + r.height / 2;
    if (!inViewportRect({ x: mx, y: my })) return;
    const d = Math.abs(mx - cx) + Math.abs(my - cy);
    if (d < bd) { bd = d; best = id; }
  });
  return best;
}
function inViewportRect(b) {
  const m = 8; // 贴边不算"看得见"（半张卡露在边上，钉它同样没意义）
  return b.x > m && b.x < (window.innerWidth - m) && b.y > m && b.y < (window.innerHeight - m);
}
function applyPendingKeepView() {
  if (!pendingKeepView) return;
  const p = pendingKeepView; pendingKeepView = null;
  // 2026-09-01 修「切走再回 pan 被清零、永远回自定义中央」的规矩沿用：
  // init 期间的视图位置由 init 自己的还原/定位分支全权负责，锚定补偿只服务正常使用期（booted 门闩）。
  if (!booted) return;
  let use = null, a = null;
  for (const pt of p.pts) { const r = rectCenter(pt.id); if (r) { use = pt; a = r; break; } } // 第一个还活着的锚点
  if (!use) return; // 全被过滤掉 → 不补偿（补偿一个不存在的东西只会把画面带偏）
  { panX += (use.x - a.x) / zoom; panY += (use.y - a.y) / zoom; applyTreeTransform(); } // 屏幕差÷zoom（2026-08-22：与编辑锚定同修，zoom≠1 时不过量）
  drawEdges(); // 补偿平移后立即重画曲线，防止「节点头和线错位」（2026-08-21 修）
  persistNow(); // 折叠导致视图平移后记住（离散事件，立即写）
  // 记下这次锚定，供「图片异步撑开布局后」再钉一次（见 reanchorAfterReflow）：
  // 折叠的子节点若带图，render 时图还没到、布局按无图算，锚点虽已补到位；图到达后卡片被撑高、
  // 整棵树重新排布 → 母节点被顶走（用户看到「展开带图节点时母节点往下移一点点」）。
  // 存的是补偿**之后**的 pan/zoom 快照：后续若被别处改动（用户平移/缩放/定位），锚点即作废。
  if (a) lastKeepAnchor = { id: use.id, x: use.x, y: use.y, panX: panX, panY: panY, zoom: zoom, expire: performance.now() + KEEP_ANCHOR_MS };
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
  // 2026-09-17：浮层内的滚动不归画布管 —— 滚轮监听挂在 document 上，浮层里的 wheel 一样会冒到这儿，
  // 于是「在 [[ 候选框里滚列表」变成「整个画布平移」，列表自己反而滚不动。候选框/右键菜单/更多面板/弹窗一律放行。
  if (e.target && e.target.closest && e.target.closest('#link-suggest, .ctx-menu, #node-more-menu, #node-menu, .wb-mask')) return;
  if (!(e.ctrlKey || e.metaKey)) {
    // 2026-09-01 根治斜向滚动顿挫：触控板双指 / 滚轮 = 手动 transform 平移。
    // 原生 scroll 斜向双轴滚动在主线程逐帧重绘大画布 → 先上再左的顿挫感；transform 平移走 GPU 合成器丝滑。
    e.preventDefault();
    panBy(e.deltaX, e.deltaY);
    return;
  }
  e.preventDefault();
  const delta = -e.deltaY * 0.008; // 缩放灵敏度：0.008（原 0.004 偏慢，翻倍）
  const next = Math.max(0.5, Math.min(3, zoom * (1 + delta)));
  if (next === zoom) return;
  // 以「指针位置」为中心缩放（2026-08-31 定）：
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
  schedulePersist(); // 缩放后记住视图（平移各入口各自 schedulePersist/persistNow）
}, { passive: false });

// ===== 空格 + 鼠标拖拽平移画布（2026-08-31；行业共识，对齐 Figma/飞书）=====
// 按住空格 → 光标变抓手（#view-map.space-pan）；左键拖动 = 平移（改 panX/panY，与触控板双指滚动
// 同一通道，滚动手感一致、位置还原走现有 scroll 持久化）。空格的按下挂全局 keydown 的「空格预览」分支
// （选中图片时仍是预览、不动画布）；松开/失焦在此统一复位。
let spacePanHeld = false, spacePanning = false;
function endSpacePan() {
  spacePanHeld = false; spacePanning = false;
  viewMap.classList.remove('space-pan'); viewMap.classList.remove('space-panning');
}
document.addEventListener('keyup', (e) => { if (e.key === ' ') endSpacePan(); });
window.addEventListener('blur', endSpacePan);
// 修饰键状态上报给宿主（2026-09-13 修 Bug）：右下状态栏的折叠数字靠 Cmd / Cmd+Option 区分三种操作，
// 宿主侧虽然能从点击/悬停事件读到修饰键，但「鼠标停在按钮上、焦点还在画布 iframe 里按 Cmd」这一下
// 宿主收不到键盘事件 → 置灰不刷新。这里把 iframe 内的按键状态同步过去（点/悬停事件本身仍是最准来源）。
// 只在状态真变化时发（普通打字不打扰）。
let lastFoldMod = { cmd: false, alt: false };
['keydown', 'keyup'].forEach(ev => document.addEventListener(ev, (e) => {
  const cmd = !!e.metaKey, alt = !!e.altKey;
  if (cmd === lastFoldMod.cmd && alt === lastFoldMod.alt) return;
  lastFoldMod = { cmd, alt };
  vscode.postMessage({ type: 'foldMod', cmd, alt });
}));
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
  // 2026-09-17：附件（图片/视频）的粉框也在这里统一擦掉。
  // 它由 state.selectedImg 记着；以前只清 state 不擦 DOM，就留下「看着还选中、按 Delete 却没反应」的假选中。
  // 重新加框由各自的 click 处理器在 selectNode 之后补（顺序上安全，不会被这里误擦）。
  document.querySelectorAll('.card .img.selected, .card .embed-media.selected').forEach(el => el.classList.remove('selected'));
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
  state.selectedImg = null; // 2026-09-17：换选中节点 = 附件选中一并失效（粉框由 refreshSelectionClasses 擦）

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
    //（附件粉框的清理已收进 refreshSelectionClasses，2026-09-17：原先两处各管一半 → 出「假选中」）
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
    if (state.editingEl) state.editingEl.blur(); // 编辑框真有焦点 → blur 即触发 finish 保存
    // 兜底（2026-09-20）：编辑框若已被重绘抽走（焦点不在它身上），blur 不会触发 finish →
    // 这里按登记的收尾函数强制收一次，否则「点空白退出编辑」看着生效、内容却没落盘。
    if (activeEditFinish) { try { activeEditFinish(); } catch (_) {} }
    state.editingEl = null;
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
    if (!boxShown && (dx > 5 || dy > 5)) { boxShown = true; box.style.display = 'block'; }
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
  // 沙盒（2026-09-14 用户定）：历史界面里把「更多」按钮整个藏掉 —— 一次砍掉新增/删除/剪切/粘贴/
  // 撤销重做/保存版本/设置/提报 bug 这一整批"会改内容"的入口，比逐条加守卫省事也更不容易漏。
  const mw = document.getElementById('more-wrap');
  if (mw) mw.classList.toggle('hidden', !!state.historyMode);
  updateHistoryBanner(); // 顶部历史横幅跟随只读态显隐（进/出历史都要在这里刷）
  updateFoldBar(); // 2026-08-30：右下角常驻折叠层级条跟随选中态刷新（22 处选中变化都会走这里）
  // （左下角「进入该节点（下钻）」按钮 2026-09-21 已删 → 这里那段刷新逻辑一并删掉；
  //   下钻入口现在只剩右键「进入当前节点」与 ⌘= 命令，updateToolbar 不再管它）
  // 过滤按钮（隐藏 Minor / 已完成待办）三态刷新 —— 2026-09-21 用户定，见 refreshHideBtn 的注
  refreshHideBtn();
  const menu = document.getElementById('more-menu');
  if (!menu) return;
  // 注：add-child / add-sibling / delete 三个按钮已挪到「添加 → 添加其他内容」（2026-09-17 用户定），
  // 这里不再有需要按选中状态启停的项目（撤销/重做由自己的逻辑管）。
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
//   onFinish()  收尾：读编辑框文本、写数据、emitUpdate/render（单坐标系下无需任何位置补偿）
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
  // 与 startEdit 同款两件事：保留前缀图标（minor/now）；整行格式拆属性显示纯文字。
  // 单坐标系（2026-09-13）：文本替换改卡片宽度只推内容、不动相机——旧版的树宽补偿
  //（panX += Δ/2）在新坐标系下反而每敲一个字母就平移整棵树 = 组字期画面抖的根源，已删。
  const icos = Array.prototype.filter.call(el.children,
    ch => isPrefixIcoEl(ch));
  const fmt = splitLineFormat(node.title);
  el.textContent = v || (fmt ? fmt.inner : (node.title || ''));
  prependInOrder(el, icos); // ⚠️ 必须走这个（倒序插）—— 正序 insertBefore(firstChild) 会把图标顺序整个翻过来
  // 重画判据是「卡片宽度」而不是「树总宽」（2026-09-13 修）：卡片变宽会把它自己的子节点整列挤走，
  // 而树总宽未必跟着变（该卡不在最宽的那条链上）→ 原来那种写法会漏掉重画，表现为「字在动、线不动」。
  redrawEdgesNextFrame();
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
  // 待办前缀也在这里收掉（2026-09-20）：代理输入是**一条独立于 startEdit 的写盘路径** ——
  // 不处理的话，这次写进文件的就是带前缀的字面文字，要等重读文件（切源文件再切回）才被认成待办 ——
  // 正是用户报的「敲完没反应、切换后才识别」。凡是直接写 node.title 的路径都必须过 splitTodoPrefix。
  const td = splitTodoPrefix(v);
  pushUndo();
  r.node.title = td.text;
  if (td.todo) r.node.todo = td.todo;
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
// 活跃编辑会话的收尾函数（2026-09-20 建）：render() 会 treeEl.innerHTML='' 整树重建，
// 若此刻正在编辑，编辑框连同里面的字一起被销毁、焦点掉回 body —— 之后按 Enter/Tab 走全局键位、
// 点空白也不再触发 blur（编辑框已不在文档里），表现为「打的字全丢了、文件里也没有」。
// 这里把 finish 暴露出来，让重绘前能先把编辑收尾保存（等于有人在打字时把纸抽走前先誊一遍）。
var activeEditFinish = null; // 用 var（不是 let）：render() 定义在它上方，挂脚本早期调用 render 也不踩 TDZ
function editSession(el, opts) {
  const card = el.closest('.card');
  // 编辑态禁用卡片拖拽：否则编辑框内拖选文字会触发 HTML5 dragstart，拖拽启动会清除文本选区（2026-08-22 修"松手选区变光标"）
  if (card) card.draggable = false;
  // 登记活跃编辑会话：点画布空白时据此主动结束编辑（2026-08-24 修：之前只认 editingTitleEl，备注/链接编辑点空白不刷新）
  state.editingEl = el;
  // 单坐标系（2026-09-13）：编辑引起的卡片/树尺寸变化不再产生任何相机位移（无 flex 居中可推），
  // 编辑期间只需实时重画曲线 + 贴边时把卡片拉回视口，无需任何布局冻结/宽度补偿。
  let composing = false;       // IME 组字中（2026-08-26 修：组字期间冻结祖先 transform/滚动补偿，否则会打断中文引号等成对符号的配对）
  let pendingFlush = false;
  let composeRaf = 0;          // 组字中的「补画连线」帧合并（2026-09-13）
  const sug = opts.suggest ? createLinkSuggest(el) : null; // [[ 文件建议（标题/链接编辑开，备注不开）
  const flushInput = () => {
    drawEdges(); // 曲线实时跟上
    if (card) ensureCardVisible(card); // 超出视口右边缘 → 画布往左移跟随光标（贴边才有；画布中央不触发、纹丝不动）
    if (opts.onInput) opts.onInput();
  };
  // 组字中的补画（2026-09-13 修）：组字期间标题已在变宽 → 子节点整列被挤走，而这里原本整块跳过，
  // 表现为「字在动、线留在原地，选字（compositionend）后才跳一下」。只补画连线，不做视口跟随
  //（改滚动会打断输入法候选框 → 中文标点配对/吞键的老 bug），其余动作仍等 compositionend 统一补。
  const composeRedrawEdges = () => {
    if (composeRaf) return;
    composeRaf = requestAnimationFrame(() => { composeRaf = 0; if (composing) drawEdges(); });
  };
  const onInput = () => {
    if (composing) { pendingFlush = true; composeRedrawEdges(); return; } // 组字中：连线实时跟上，其余动作等 compositionend 补
    if (sug) sug.update(); // [[ 建议跟随光标（触发/过滤/关闭）
    // 走 rAF 合并：同步强制 layout 会打断 IME 配对（引号 ""→""、微信输入法吞 】）
    requestAnimationFrame(flushInput);
  };
  el.addEventListener('input', onInput);
  // IME 组字开始/结束：组字期间冻结 transform/滚动，结束后再补一次
  const onCompStart = () => { composing = true; };
  const onCompEnd = () => {
    composing = false;
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
    // 整段 = 图片语法 → 转**图片附件**（与选中态粘贴同款，2026-09-19 用户定），不进标题文字
    const tt = text.trim();
    const mWikiImg = tt.match(/^!\[\[([^\]]+)\]\]$/);
    const mMdImg = !mWikiImg && tt.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    if (mWikiImg || mMdImg) { addImageToNode(mWikiImg ? mWikiImg[1].trim() : mMdImg[1]); return; }
    const ins = (opts.newline === false)
      ? text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/^\t+/, '')).join(' ').trim()
      : text.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/^\t+/, '')).join('\n');
    if (ins) insertEditTextNode(el, ins);
  };
  el.addEventListener('paste', onPaste);
  let done = false;
  const finish = () => {
    if (done) return; done = true; // keydown 确认后 blur 会再触发一次，防重入
    if (activeEditFinish === finish) activeEditFinish = null; // 会话已收尾：撤销重绘闸门登记
    if (sug) sug.close(); // 收起 [[ 建议菜单
    activeSuggest = null;
    el.contentEditable = 'false';
    state.editingEl = null; // 清活跃会话登记（2026-08-24）
    if (composeRaf) { cancelAnimationFrame(composeRaf); composeRaf = 0; } // 组字中退出编辑：撤销待执行的补画（2026-09-13）
    el.removeEventListener('input', onInput);
    el.removeEventListener('compositionstart', onCompStart);
    el.removeEventListener('compositionend', onCompEnd);
    el.removeEventListener('paste', onPaste);
    el.onkeydown = null; el.onblur = null;
    if (card) card.draggable = true; // 恢复卡片拖拽
    // 焦点移出编辑框：让 Cmd+Z 立即走全局撤销（2026-08-22 修：焦点残留导致快捷键被编辑框拦截）
    try { if (document.activeElement) document.activeElement.blur(); } catch (_) {}
    opts.onFinish();
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
  activeEditFinish = finish; // 登记：重绘前据此先收尾保存（见 activeEditFinish 注释）
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
          if (anc.nodeType === 1 && isPrefixIcoEl(anc)) { inPrefixIco = true; break; }
          anc = anc.parentNode;
        }
        if (inPrefixIco) {
          let idx = 0;
          for (let i = 0; i < el.childNodes.length; i++) {
            const ch = el.childNodes[i];
            if (ch.nodeType === 3 || !isPrefixIcoEl(ch)) { idx = i; break; }
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
  } else if (opts.caretStart) {
    r.selectNodeContents(el); r.collapse(true); sel.addRange(r); // 光标放最前：「从头开始编辑」命令（2026-09-18）
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
// 把卡片拉回视口：右缘超出 → 画布往左移；左缘超出 → 往右移（屏幕差 ÷ zoom 转世界单位）
function ensureCardVisible(card) {
  const cr = card.getBoundingClientRect();
  const vr = viewMap.getBoundingClientRect();
  // 右缘落点边距（旋钮，2026-09-18 用户定）：卡片超出右缘被拉回来时，停在离右缘多远处。
  // 之前写死 16px = 新建子节点总是落在贴着右缘的位置；调大（如 120）→ 落点往左收、不那么靠边。
  const insetR = cfgNum('--nm-edge-inset-x', 16);
  let dx = 0;
  if (cr.right > vr.right - insetR) dx = cr.right - vr.right + insetR;
  else if (cr.left < vr.left + 16) dx = -(vr.left + 16 - cr.left);
  if (dx) { panX -= dx / (zoom || 1); applyTreeTransform(); drawEdges(); }
}
// 新建节点落点防遮挡（2026-09-18 用户定）：新建/编辑的卡与底部固定工具条（#node-menu，fixed bottom:32px）
// 重叠时，**只做垂直**平移，把卡片中心挪到自定义 Y（--locate-y）—— 左右不动（用户明确不要横向位移）。
// 复用出画拉回同款坐标换算（屏幕差 ÷ zoom）。
function ensureNewCardAboveToolbar(id) {
  const card = document.querySelector('.node-row[data-id="' + id + '"] .card');
  const menu = document.getElementById('node-menu');
  if (!card || !menu || menu.classList.contains('hidden')) return;
  const cr = card.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  if (cr.bottom <= mr.top) return; // 没被工具条盖住 → 不动
  const vr = viewMap.getBoundingClientRect();
  // 目标 Y 是**独立旋钮** --nm-newchild-y（默认 0.6）：不与定位的 --locate-y 共用（用户定），
  // 想调去 mindmap-app.css「定位调参区」改这一个值即可。
  const targetY = vr.height * cfgNum('--nm-newchild-y', 0.6);
  const dy = (cr.top + cr.height / 2) - targetY;         // 卡片中心比目标位低多少
  if (dy > 0) {
    panY -= dy / (zoom || 1); // 内容上移（同 ensureCardVisible 的换算：屏幕差 ÷ zoom）
    applyTreeTransform(); drawEdges(); persistNow();
  }
}
function startEdit(node, titleEl, pos, cursorEnd, caretStart) {
  if (state.historyMode) return; // 历史页只读：禁止进入编辑
  disarmProxy(); // 进真编辑态，proxy 让位（titleEl 抢焦）
  // 不隐藏 nodeMenu：2026-08-21 定「编辑时本质上也是选中，下面 toast 也要在」
  // 编辑框 100% 纯文字：整行格式（**/~~）→ 拆成属性 + CSS 效果类显示；非整行 → 字面（符号可见）。零转换。
  state.editingTitleId = node.id; // 编辑态标记：加粗按钮判断用（不依赖焦点，点按钮时焦点已转移）
  state.editingTitleEl = titleEl;
  titleEditStartTs = Date.now(); // 记录进编辑时刻，供 dblclick 判断是否"双击前已在编辑"（2026-08-25 修：避免刚进编辑的同一双击被误判为"编辑时双击=全选"）
  const fmt = splitLineFormat(node.title);
  titleEl.classList.remove('editing-bold', 'editing-strike');
  // 保留前缀图标（minor-ico / now-ico / todo-ico）：编辑中图标不消失、标题起点不左移，
  // 双击坐标→光标的映射才准（对齐备注竖条的丝滑体验，2026-08-27 定）。
  // 机制：先抓图标 DOM 引用（textContent 赋值清空后引用仍有效），设完纯文字再插回最前。
  // 待办状态因此天然不会丢：编辑框里只有纯文字，"全选覆盖"只换文字，图标（=状态）还在（2026-09-20）。
  const prefixIcos = Array.prototype.filter.call(titleEl.children,
    ch => isPrefixIcoEl(ch));
  if (fmt) {
    titleEl.textContent = fmt.inner;
    if (fmt.bold) titleEl.classList.add('editing-bold');
    if (fmt.strike) titleEl.classList.add('editing-strike');
  } else {
    titleEl.textContent = node.title;
  }
  prependInOrder(titleEl, prefixIcos); // ⚠️ 同上：编辑态插回前缀图标必须倒序，否则顺序被翻（Todo 会跑到最后）
  // 单坐标系（2026-09-13）：进编辑的文本替换（**/~~ 转纯文字）只改卡片宽度、不动相机，
  // 旧的树宽补偿（panX += Δ/2）在新坐标系下本身就是位移源，已删；只需重画连线跟上。
  redrawEdgesNextFrame(); // 文本替换改的是「卡片宽度」，树总宽未必变 → 无条件跟上（2026-09-13 修）
  // 记录进入编辑时的纯文字（保留首尾空格，不 trim）——用户没改就不保存（防误清空丢字）
  // 2026-08-26 改：取消"清空/纯空格=取消新建"，改为允许空/空格节点保留；故对比与保存都用未 trim 的原始文本
  // 2026-08-30 换行：改用 editableText（\n 原样保留，多行标题编辑后原样对比）
  const originalRaw = editableText(titleEl);
  editSession(titleEl, {
    pos,
    cursorEnd,
    caretStart, // 「从头开始编辑」命令（2026-09-18）：光标放最前；丢了这行光标会落成全选（实踩）
    suggest: true, // 标题敲 [[ 弹文件建议（2026-08-29）
    keys: {
      // 2026-08-21 定：Shift+Enter = 保存并直接进备注编辑；Tab = 直接创建子节点进编辑
      // 2026-08-30：Cmd+Enter 改为编辑框内换行（editSession 统一处理；原「保存并切 Minor」挪全局 Cmd+M）
      shiftEnter: () => editNoteOfSelected(),
      // addChild 只认 state.selectedId，而编辑态下可能压根没选中任何节点（新建导图开屏直接进主节点
      // 编辑就是这种：selectedId 还是 null）→ 那时 Tab 静默 return，表现为「按了没反应」。
      // 故兜底：没选中就以正在编辑的节点为准（正在编辑哪个，就给哪个建子节点）。
      tab: () => { if (!state.selectedId) state.selectedId = node.id; addChild(); },
      escape: () => {
        if (state.justCreated.has(node.id)) { cancelNewNode(node.id); return; } // 刚新建的节点：ESC = 取消（删除，保留）
        titleEl.textContent = originalRaw; // 已有节点：还原原文（不保存）。布局冻结中，还原改宽度零位移
      }
    },
    onFinish: () => {
      state.editingTitleId = null; state.editingTitleEl = null; // 清编辑态标记（2026-08-22）
      if (!findNode(state.tree, node.id)) return; // 节点已在 ESC 取消流程中被删除 → 直接收尾，勿重复处理
      // 2026-08-30 换行：editableText 保 \n；首尾空行收掉（中间空行保留 = 段落间距，落盘走空续行）
      let currentRaw = editableText(titleEl).replace(/^\n+|\n+$/g, ''); // 不 trim：保留首尾空格（如纯空格标题）
      // 待办前缀（2026-09-20）：进编辑时前缀由图标替下、框里只有纯文字，用户想设状态就在文字前面手打一对括号 ——
      //   [] / [ ] / 【】 / 【 】 都认（跟读文件用的是同一套归一化），回车后收进 todo 状态、那对括号从文字里消失。
      //   比较用的 originalRaw 是「进编辑那一刻的纯文字」，所以「只打了一对方括号、文字没动」也照样算改动（状态变了）。
      let todoState = node.todo || '';
      const td = splitTodoPrefix(currentRaw); // 与读文件共用一份：前导空格 / 中英括号 / 括号内外多空格，全认
      if (td.todo) { currentRaw = td.text; todoState = td.todo; }
      if (currentRaw === originalRaw && todoState === (node.todo || '')) {
        // 没改（含直接回车确认"新节点"）→ 保持节点，回退到渲染态；不再视为刚新建
        state.justCreated.delete(node.id);
        titleEl.classList.remove('editing-bold', 'editing-strike');
        titleEl.innerHTML = cardTitleInner(node); // 2026-08-26 修：还原时一并带回 Minor 置灰小箭头（之前用 renderInline 会丢图标）
        attachTodoIco(titleEl, node); // innerHTML 刚重建过 → 待办图标的点击事件要重绑（2026-09-20）
        attachTodoPct(titleEl, node); // 进度百分比同上（漏绑的话点它会冒泡进编辑 —— 第四轮修的正是这个）
        drawEdges(); // 宽度变化 → 曲线跟上（单坐标系下相机不动，无需位置补偿）
        return; // 不 emitUpdate / render
      }
      // 2026-09-17：整行就是一个嵌入（![[名]] 或 ![](路径)）→ 不留在标题里，转成节点附件。
      // 场景：双击节点手敲/粘贴 ![[xxx.png]] 再回车——以前这串会变成"! + 双链"文字、显示不出图。
      // 只认「整行就是这一个嵌入」；混了别的文字的标题一律不动（不替用户猜意图）。
      const trimRaw = currentRaw.trim();
      const embWiki = trimRaw.match(/^!\[\[([^\]]+)\]\]$/);
      const embMd = embWiki ? null : trimRaw.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
      const embName = ((embWiki ? embWiki[1] : (embMd ? embMd[1] : '')) || '').trim();
      if (embName && findNode(state.tree, node.id)) {
        pushUndo();
        if (isMediaFile(embName)) (node.embeds = node.embeds || []).push(embName);
        else (node.images = node.images || []).push(embName);
        node.title = '';
        node.todo = todoState; // 手打的待办前缀照样生效（前缀已从文字里剥掉，2026-09-20）
        state.justCreated.delete(node.id); // 已挂上附件 → 不再是"刚新建的空节点"，别被回退删掉
        titleEl.classList.remove('editing-bold', 'editing-strike');
        emitUpdate();
        render();
        return;
      }
      // 用户改了：整行格式套回 Markdown 语法；字面模式原样保存（保留首尾空格，不 trim）
      // 2026-08-28：删空文字（currentRaw 空）→ finalTitle=''，不包格式符号，避免残留 __ / **** 让空节点渲染异常
      const finalTitle = currentRaw ? (fmt ? joinLineFormat(currentRaw, fmt) : currentRaw) : '';
      if (finalTitle !== node.title || todoState !== (node.todo || '')) pushUndo();
      node.title = finalTitle;
      node.todo = todoState; // 待办状态（2026-09-20）：手打括号设的，或原样带过来的
      state.justCreated.delete(node.id); // 已正式命名 → 不再是"刚新建"，后续清空只回退不删
      titleEl.classList.remove('editing-bold', 'editing-strike');
      emitUpdate(); // 写回文件
      render();
    }
  });
}
function startEditNote(node, noteEl, pos) {
  // 不再 hideNodeMenu：写备注也是选中态，下方菜单保留（2026-08-22 与标题编辑统一）
  disarmProxy(); // 进真编辑态，proxy 让位
  noteEl.textContent = node.note || '';
  redrawEdgesNextFrame(); // 进编辑的文本替换改的是「卡片宽度」→ 曲线跟上（2026-09-13 修）
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
      // addChild 只认 state.selectedId，而编辑态下可能压根没选中任何节点（新建导图开屏直接进主节点
      // 编辑就是这种：selectedId 还是 null）→ 那时 Tab 静默 return，表现为「按了没反应」。
      // 故兜底：没选中就以正在编辑的节点为准（正在编辑哪个，就给哪个建子节点）。
      tab: () => { if (!state.selectedId) state.selectedId = node.id; addChild(); },
      escape: () => { noteEl.textContent = node.note || ''; }
    },
    onFinish: () => {
      // 2026-08-30 换行：editableText 保 \n（多行备注落盘 = 多个 `> ` 行）；trim 收首尾空白（含首尾空行）
      const nn = editableText(noteEl).trim();
      if (nn !== node.note) { pushUndo(); node.note = nn; emitUpdate(); }
      if (state.editingNoteId === node.id) state.editingNoteId = null; // 编辑结束：空备注行随后消失（2026-08-21 定）
      render(); // 无论改没改都 render：清掉「编辑中的空备注行」
    }
  });
}
function startEditLink(node, linkEl) {
  // 编辑期间屏蔽跳转 / 再触发编辑，避免点进文字定位光标时误触发打开（2026-08-26）
  linkEl.onclick = e => e.stopPropagation();
  linkEl.ondblclick = e => e.stopPropagation();
  disarmProxy(); // 进真编辑态，proxy 让位
  // 2026-09-14：双击编辑展开完整链接字符串（[显示名](url) / [[...]]），用户自行改显示名与地址；
  // 旧逻辑只填裸地址会丢失显示名，编辑后显示名被压成域名
  const shown = node.link;
  linkEl.textContent = shown;
  redrawEdgesNextFrame(); // 进编辑的文本替换改的是「卡片宽度」→ 曲线跟上（2026-09-13 修）
  const reset = () => { linkEl.textContent = shown; };
  editSession(linkEl, {
    suggest: true, // 链接编辑敲 [[ 弹文件建议（2026-08-29）
    newline: false, // 链接是单行语义：Cmd+Enter 被吞（不换行）、粘贴换行转空格（2026-08-30）
    keys: {
      escape: reset // 2026-08-24 修：Esc=放弃，恢复显示
    },
    onFinish: () => {
      const raw = editableText(linkEl).replace(/\n+/g, ' ').trim(); // 换行兜底转空格（2026-08-30）
      let nv = node.link;
      if (/^\[\[.+\]\]$/.test(raw) || /^\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\)$/.test(raw)) {
        nv = raw; // 用户写了完整链接语法（wikilink 或标准 Markdown 链接）→ 原样存
      } else if (raw) {
        // 裸内容：文件路径 → [文件名](file:///…)；URL → [根域名](url)；其余（语法不完整）→ 原样存，不替用户修正
        const fp = detectFilePath(raw);
        const du = fp ? null : detectUrl(raw);
        if (fp) nv = '[' + (fp.split(/[\\/]/).pop() || fp) + '](file://' + fp + ')';
        else if (du) { const u = /^www\./i.test(du) ? 'https://' + du : du; nv = '[' + urlRootDisplay(u) + '](' + u + ')'; }
        else nv = raw; // 语法不完整/无法识别：原样存，不强行转双链（用户自行检查修正）
      }
      if (nv !== node.link) pushUndo();
      node.link = nv;
      emitUpdate(); render();
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
  // 排列固定（2026-09-21 用户定）：格式 / 备注 / 待办 / Now / Minor ｜ ＋
  // 待办只剩一个按钮（Done 那档并回它自己的 ⌘+点击）；分隔线把「节点级操作」和「＋添加」隔开。
  const items = [
    // 2026-09-17：原来「加粗 / 红 / 黄」三个独立按钮**正式合并**成一个「格式」按钮（悬浮出横排三项）
    // 有子菜单 → **不挂提示**（提示会跟横排子菜单叠住）；说明放在子菜单各项上
    { act: 'style',  icon: 'type' },
    { act: 'note', icon: 'text-quote', tip: T('nm.note') + nmKeySuffix('editNote') },
    // 待办（2026-09-21 第五轮定稿）：一个按钮两种用法 —— 裸点击 = 普通↔待办；
    // ⌘+点击 = 普通节点快速设为完成（待办/完成节点则与裸点击一样）。图标/提示/配色都在 renderTodoBtn 里刷
    { act: 'todo', icon: 'todo' },
    { act: 'now', icon: 'now', tip: T('nm.now') + nmKeySuffix('now') },
    // Minor（2026-09-20 用户定稿：图标 arrow-down；act 从 done 改回 minor 腾名字）
    { act: 'minor', icon: 'arrow-down', tip: T('nm.minor') + nmKeySuffix('minor') },
    { sep: true }, // 分隔线（2026-09-21 用户定）
    // 2026-09-17：图标由三点改 plus，语义变成"新增东西"；刻意**不挂提示**（会跟子菜单叠住）
    { act: 'more', icon: 'plus' },
  ];
  items.forEach(it => {
    if (it.sep) { const s = document.createElement('div'); s.className = 'nm-sep'; nodeMenu.appendChild(s); return; }
    const b = document.createElement('button');
    if (it.color) b.classList.add('color-' + it.color);
    b.dataset.act = it.act;
    if (it.tip) b.dataset.tip = it.tip; // 没有 tip 的按钮（如「添加」）不挂提示框
    b.dataset.side = 'top'; // 底部 nodeMenu 按钮 → tooltip 向上浮动（用户 2026-08-21）
    // 悬浮到这排**任意**按钮上 → 先把两个悬浮面板都收掉：
    // 否则（例如从格式面板移到「备注」）面板还开着、按钮自己的黑色提示框又冒出来，两者叠在一起（用户 2026-09-17）。
    // ⚠️ 注册顺序必须在下面那两个"悬浮即开面板"**之前**，否则会把自己刚开的那个又关掉。
    b.addEventListener('mouseenter', () => { hideStyleMenu(); hideMoreMenu(); hideMoreSub(); });
    // Now / 待办按钮用自定义图标（随选中节点状态换色），不走 ICONS 字典
    b.innerHTML = it.act === 'now' ? renderNowIcon('bottom')
      : it.act === 'todo' ? renderTodoIcon(18) : renderIcon(it.icon, 18);
    b.onclick = e => {
      e.stopPropagation();
      // 「添加」/「样式」：点一下也开面板（悬浮已能开，这里是键盘/触屏兜底），不执行节点级动作
      if (it.act === 'more') { showMoreMenu(b); return; }
      if (it.act === 'style') { showStyleMenu(b); return; }
      nodeMenuAction(it.act, e); // 传事件：待办按钮要区分「裸点击 / ⌘+点击」（2026-09-20）
    };
    // 「添加」/「样式」：悬浮即弹面板；留 220ms 宽容期，鼠标从按钮移到面板的间隙不会掉
    if (it.act === 'more') {
      b.addEventListener('mouseenter', () => showMoreMenu(b));
      b.addEventListener('mouseleave', scheduleHideMore);
    }
    if (it.act === 'style') {
      b.addEventListener('mouseenter', () => showStyleMenu(b));
      b.addEventListener('mouseleave', scheduleHideStyle);
    }
    // 样式按钮：编辑态下 mousedown 阻止焦点离开编辑框（否则点按钮 = blur = 编辑结束 + 选区丢失）（2026-08-22）
    if (it.act === 'style') {
      b.addEventListener('mousedown', e => { if (isEditingTitle()) e.preventDefault(); });
    }
    nodeMenu.appendChild(b);
    // Pro 拦截：Now / Minor 按钮（2026-09-04）；待办按钮**刻意不锁**（用户定：测试功能谁都能用）
    if (it.act === 'now' || it.act === 'minor') applyProGate(b);
  });
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
  // ⚠️ 一律按 data-act 取按钮，**不要按下标**（2026-09-17 改）：
  // 用户会继续调整这排按钮的顺序（已把「添加」挪到中间），按下标会在每次挪位置时静默错位。
  const btnOf = act => Array.prototype.find.call(btns, b => b.dataset.act === act);
  // 多选：隐藏备注按钮（不支持给多个节点写同一备注）；其余按钮（格式/添加/Minor）保留
  const bNoteBtn = btnOf('note');
  if (bNoteBtn) bNoteBtn.style.display = multi ? 'none' : '';
  // 「添加」按钮：面板里一条可点的都没有（全关了 / 只剩分隔线）→ 入口整个藏起来（2026-09-18）
  syncAddEntryBtn();
  // on 状态反映：仅单选有意义（多选各节点状态不一，按钮保持中性）
  if (!multi) {
    const r = findNode(state.tree, state.selectedId);
    if (r) {
      const isBold = nodeIsBold(r.node);
      const isDone = nodeIsMinor(r.node);
      const isNow = nodeIsNow(r.node);
      const color = r.node.color || '';
      const bStyle = btnOf('style');
      const bNote = btnOf('note'), bNow = btnOf('now'); // 待办两槽位在下面单独取（角色渲染）
      // 「格式」按钮合并了 加粗/红/黄 → 用**图标自身**表达状态（加粗=画粗、红/黄=换色，可叠加）。
      // 刻意不用 .on（那条会把图标刷成主题色，与"标红/标黄"的表达冲突）。
      if (bStyle) {
        bStyle.classList.remove('on');
        bStyle.classList.toggle('nm-fmt-bold', isBold);
        bStyle.classList.toggle('nm-fmt-red', color === 'red');
        bStyle.classList.toggle('nm-fmt-yellow', color === 'yellow');
      }
      if (bNote) bNote.classList.toggle('on', !!r.node.note);       // note：有备注时变蓝
      if (bNow) { bNow.classList.toggle('on', isNow);               // now：已标记 Now 变蓝
        bNow.innerHTML = renderNowIcon(isNow ? 'bottomOn' : 'bottom'); }
      // Minor 按钮：标了 Minor 时亮（主题色，走通用 .on）
      const bMinor = btnOf('minor');
      if (bMinor) bMinor.classList.toggle('on', isDone);
      // 待办按钮（2026-09-21 第五轮定稿）：一个按钮两种形态 —— ⌘ 按住时图标换成带勾的那一版（给预测）
      renderTodoBtn(btnOf('todo'), nmCmdHeld, r.node);
    }
  } else {
    for (const b of btns) if (b.dataset.act !== 'note') b.classList.remove('on');
    // 多选：各节点格式不一 → 格式按钮回到中性（清掉图标上的 加粗/红/黄 状态）
    const bStyleMulti = btnOf('style');
    if (bStyleMulti) bStyleMulti.classList.remove('nm-fmt-bold', 'nm-fmt-red', 'nm-fmt-yellow');
    // 待办按钮同理回中性（多选各节点状态不一；提示照常 —— 功能就是对每个节点生效）
    renderTodoBtn(btnOf('todo'), nmCmdHeld, null);
  }
}
// ⌘ 是否按住（2026-09-21）：待办按钮按住 ⌘ 要换形态（空框 → 框+勾），松开还原。
// 只靠 keyup/keyup 会漏两种：① 按住 ⌘ 切到别的应用，回来时收不到 keyup；② 窗口失焦。→ 加 blur 复位兜底。
let nmCmdHeld = false;
function setCmdHeld(held) {
  if (held === nmCmdHeld) return;
  nmCmdHeld = held;
  if (nodeMenu && !nodeMenu.classList.contains('hidden')) showNodeMenu(); // 工具条正显示才需要重刷
}
window.addEventListener('keydown', (e) => { if (e.key === 'Meta' || e.key === 'Control') setCmdHeld(true); });
window.addEventListener('keyup', (e) => { if (e.key === 'Meta' || e.key === 'Control') setCmdHeld(false); });
window.addEventListener('blur', () => setCmdHeld(false));
// 底部待办按钮按「节点状态 × ⌘ 是否按住」渲染（2026-09-21 第五轮定稿）：
//   普通节点：空框（基础色）／⌘ 按住 = 框 + 勾，都基础色（预测：按住点下去会变成已完成）
//   待办节点：空框（主题色）／⌘ 按住 = 框主题色 + 勾基础色（用户给的 Frame (1) 那一版）
//   完成节点：空框（主题色）／⌘ 按住 = 框 + 勾都主题色
// node 传 null = 中性态（多选）：基础色空框，提示照常
function renderTodoBtn(b, cmd, node) {
  if (!b) return;
  const td = (node && node.todo) || '';
  const k = nmKeySuffix('todo', '{Mod} + L');
  b.classList.toggle('td-plain', td === '' && !cmd);
  b.classList.toggle('td-plain-cmd', td === '' && !!cmd);
  b.classList.toggle('td-todo', td === 'todo' && !cmd);
  b.classList.toggle('td-todo-cmd', td === 'todo' && !!cmd);
  b.classList.toggle('td-done', td === 'done' && !cmd);
  b.classList.toggle('td-done-cmd', td === 'done' && !!cmd);
  b.innerHTML = renderTodoIcon(18, !!cmd); // 空框 / 框+勾 由 ⌘ 是否按住决定
  b.dataset.tip = td === '' ? T('nm.todoPlainTip', k) : T('nm.todoOffTip', k);
}
function hideNodeMenu() {
  if (nodeMenu) nodeMenu.classList.add('hidden');
  // 底部工具条一藏，挂在它上面的悬浮面板也要跟着收（否则会孤零零留在屏幕上）
  hideMoreMenu(); hideMoreSub(); hideStyleMenu();
}
// 「添加」按钮显隐：面板里没有任何可点的条目时不显示（设置页全关时的兜底，2026-09-18）
// 抽成函数是因为三个地方要调：工具条显示时、面板配置下发时、初始配置下发时。
function syncAddEntryBtn() {
  const btns = nodeMenu ? nodeMenu.children : null;
  if (!btns) return;
  for (const b of btns) if (b.dataset.act === 'more') b.style.display = nmAddHasRows() ? '' : 'none';
}

// ============ 底部菜单最右「添加」按钮：悬浮弹出的添加类入口（2026-09-17）============
// id 用 node-more-menu，不与左侧工具栏那个 #more-menu（撤销/路径导航）重名。
// 2026-09-17 二次改版（用户）：按钮由「更多」(三点) 改叫「添加」(plus)；
// 一级菜单收成 4 项 + 一个「添加其他内容」二级入口，顶上再加节点级操作（加子节点/加同级/删除）。
// 2026-09-21 定稿：面板内容**固定**（顺序写死在 NM_ADD_ORDER），设置页那条「添加面板简化」已删；
// 顶上不再有节点级操作、也没有二级入口 —— 删除节点走右键 / 快捷键，AI 编辑与自定义入口撤掉。
let moreMenu = null;
let moreHideTimer = 0;
let moreSubMenu = null;
let moreSubHideTimer = 0;
// 鼠标离开按钮/面板后**延时多少毫秒**才收起：留一个宽容期，鼠标从按钮移到面板、
// 或从一级移到二级时穿过间隙不会中途关掉（2026-09-17 用户反馈"移到二级就整个关了" → 220 → 320）
const NM_HIDE_MS = 320;
// 二级面板纵向对齐（2026-09-18）：true = 面板**底边**与一级面板底边齐平（二级比一级高时会整体上提，
// 避免最后几行压到 Obsidian 底部的状态条上）；false = 老行为，与鼠标所在那一行的顶边对齐。
const NM_SUB_BOTTOM_ALIGN = true;
// 悬浮面板定位：默认在锚点**正上方居中**（底部工具条贴屏底，往上弹才不出屏）；上方放不下才翻到下方。
function placePanelNear(panel, anchor, gap) {
  const g = gap || 8;
  const ar = anchor.getBoundingClientRect();
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  let left = ar.left + ar.width / 2 - pw / 2;
  if (left < 8) left = 8;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - pw);
  let top = ar.top - ph - g;
  if (top < 8) top = ar.bottom + g;
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}
// ===== 「＋添加」面板条目（2026-09-21 用户定稿：顺序**固定**，不再由设置页排序/显隐）=====
// ⚠️ 2026-09-21 二次定稿（用户）：**右侧那列快捷键小字整列去掉** —— 加了键位以后面板又长又花（用户原话「好长好丑」）。
// 所以 NM_ADD_META 里不再有 kbd 字段，nmAddRowEl 也不再渲染 .kbd。i18n 的 more.kbd* 键先留着（不引用），
// 以后若想恢复，加回字段 + 渲染那一行即可。**别再往这一列加任何右侧说明。**
const NM_ADD_META = {
  image:       { icon: 'image',                 label: () => T('more.addImage'),       tip: () => T('more.addImageTip') },
  video:       { icon: 'square-play',           label: () => T('more.addVideo'),       tip: () => T('more.addVideoTip') },
  audio:       { icon: 'audio-lines',           label: () => T('more.addAudio'),       tip: () => T('more.addAudioTip') },
  url:         { icon: 'globe',                 label: () => T('more.addUrlLink'),     tip: () => T('more.addUrlLinkTip') },
  vault:       { icon: 'file-plus-corner',      label: () => T('more.addVaultAttach'), tip: () => T('more.addVaultAttachTip') },
  file:        { icon: 'folder-closed',         label: () => T('more.addFileLink'),    tip: () => T('more.addFileLinkTip') },
  wiki:        { icon: 'brackets',              label: () => T('more.addWiki'),        tip: () => T('more.addWikiTip') },
  node:        { icon: 'frame',                 label: () => T('more.addNodeLink'),    tip: () => T('more.addNodeLinkTip') },
  addChild:    { icon: 'arrow-right-from-line', label: () => T('more.addChild'),       tip: () => T('more.addChildTip') },
  addSibling:  { icon: 'arrow-left-to-line',    label: () => T('more.addSibling'),     tip: () => T('more.addSiblingTip') },
};
// 固定顺序（2026-09-21 用户亲自排定）：图片 / 视频 / 音频 / 网页链接 ｜ 附件 / 本地文件链接 ｜ 双链 / 关联节点 ｜ 子节点 / 同级节点。
// 已删四项：删除节点、添加其他内容（二级入口）、AI 编辑、自定义该面板（前两项改走右键/快捷键页，AI 编辑与自定义入口撤掉）。
const NM_ADD_ORDER = ['image', 'video', 'audio', 'url', 'sep1',
  'vault', 'file', 'sep2',
  'wiki', 'node', 'sep3',
  'addChild', 'addSibling'];
// 前端兜底顺序：宿主没下发时按这套渲染，与 main.js 的 ADD_PANEL_DEFAULT_ORDER 保持一致
// （2026-09-20 起含底部一级按钮 btn* 与主操作分隔线 sep0 —— sep0 之前的是底部工具条按钮）
// （前端兜底顺序常量已随「添加面板简化」设置机制一起删除：2026-09-21 起顺序写死在 NM_ADD_ORDER）
// 分隔线 token 判定与"清理"（2026-09-18 用户定）：
//   ① 两根分隔线挨在一起 → 只画一条（重复没意义）；
//   ② 分隔线落在整段菜单的首行 / 末行 → 不画（上下没东西可隔）。
// 一级、二级各清理各的，两段的头尾互不影响。
function nmIsSep(tk) { return tk === 'sep1' || tk === 'sep2' || tk === 'sep3' || tk === 'sep4'; }
function nmCleanRows(rows) {
  const out = [];
  rows.forEach(tk => {
    if (nmIsSep(tk) && (out.length === 0 || nmIsSep(out[out.length - 1]))) return; // 首行 / 与前一根相邻 → 跳过
    out.push(tk);
  });
  while (out.length && nmIsSep(out[out.length - 1])) out.pop(); // 末行 → 去掉。
  return out;
}
// 面板内容（2026-09-21 用户定稿）：顺序固定 = NM_ADD_ORDER，不再有二级入口，也不再有用户显隐。
// 仍返回 level1/level2/hasFunc/subUsable 四字段：下游（渲染 / 按钮显隐）不用跟着改。
function nmAddSplit() {
  const rows = nmCleanRows(NM_ADD_ORDER.filter(tk => NM_ADD_META[tk] || nmIsSep(tk)));
  return { level1: rows, level2: [], hasFunc: rows.some(tk => !nmIsSep(tk)), subUsable: false };
}
// 「添加」按钮要不要出现在节点底部工具条上：面板里一个可点的都没有 → 入口整个隐藏（2026-09-18 用户定）
function nmAddHasRows() { return nmAddSplit().hasFunc; }
// 造一个面板行：分隔线 → .mm-sep（复用左下「更多」那套样式）；其余 → 按钮
function nmAddRowEl(tk) {
  if (nmIsSep(tk)) { const s = document.createElement('div'); s.className = 'mm-sep'; return s; }
  const meta = NM_ADD_META[tk];
  if (!meta) return null;
  const b = document.createElement('button');
  b.className = 'mm';
  b.dataset.act = tk;
  const tip = meta.tip ? meta.tip() : '';
  if (tip) b.dataset.tip = tip;  // 悬浮时的黑色小字提示（沿用现有 tooltip 机制）
  b.dataset.side = 'left';       // 提示弹到**左侧**：弹上方会盖住上面那几行（用户 2026-09-17）
  // 行 = 图标 + 文字（2026-09-21 二次定稿：右侧那列快捷键小字整列去掉，见 NM_ADD_META 的注）
  b.innerHTML = renderIcon(meta.icon, 16) + '<span class="mm-label">' + escapeHtml(meta.label()) + '</span>';
  // 编辑态下 mousedown 不让按钮夺焦：否则点面板 = 编辑框立即失焦 = 编辑结束（照加粗按钮同款处理）
  b.addEventListener('mousedown', e => { if (state.editingEl) e.preventDefault(); });
  if (meta.sub) {
    // 二级入口：悬浮即展开右侧面板；点击也展开一次（触屏 / 键盘兜底）
    b.addEventListener('mouseenter', () => showMoreSub(b));
    b.addEventListener('mouseleave', scheduleHideSub);
    b.onclick = e => { e.stopPropagation(); showMoreSub(b); };
  } else {
    b.onclick = e => { e.stopPropagation(); hideMoreMenu(); hideMoreSub(); moreMenuAction(tk); };
  }
  return b;
}
function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }
// 面板重建闸门：只在「配置变了」或「首次打开」时重建，避免鼠标在面板里移动时反复重建 →
// 行被替换会触发 mouseleave，二级面板会被误关（用户 2026-09-17 踩过同类坑）
let moreMenuBuilt = false, moreSubBuilt = false;
function invalidateAddMenus() { moreMenuBuilt = false; moreSubBuilt = false; }
// 一级面板：条目与分隔线**刻意复用** #more-menu（左下工具栏那个「更多」）的 .mm / .mm-sep ——
// 两个子菜单长得一样，不做第二套设计（用户 2026-09-17：统一感）。
function ensureMoreMenu() {
  if (moreMenu) return moreMenu;
  moreMenu = document.createElement('div');
  moreMenu.id = 'node-more-menu';
  moreMenu.className = 'node-more-menu hidden';
  // 鼠标移到面板上就别关（从按钮移到面板有间隙），离开才延时关
  moreMenu.addEventListener('mouseenter', () => clearTimeout(moreHideTimer));
  moreMenu.addEventListener('mouseleave', scheduleHideMore);
  document.body.appendChild(moreMenu);
  return moreMenu;
}
function renderMoreMenu() {
  const m = ensureMoreMenu();
  clearEl(m);
  nmAddSplit().level1.forEach(tk => { const el = nmAddRowEl(tk); if (el) m.appendChild(el); });
  moreMenuBuilt = true;
  return m;
}
// 二级面板的容器（内容每次由 renderMoreSub 按配置填）
function ensureMoreSub() {
  if (moreSubMenu) return moreSubMenu;
  moreSubMenu = document.createElement('div');
  moreSubMenu.id = 'node-more-sub';
  moreSubMenu.className = 'node-more-menu node-more-sub hidden';
  moreSubMenu.addEventListener('mouseenter', () => { clearTimeout(moreSubHideTimer); clearTimeout(moreHideTimer); }); // 走到二级上 → 一级也别关（原来的 bug：只清了二级自己的计时器，一级照样到点把两个都收掉）
  moreSubMenu.addEventListener('mouseleave', scheduleHideSub);
  document.body.appendChild(moreSubMenu);
  return moreSubMenu;
}
// 二级面板：「添加其他内容」（2026-09-17 建；2026-09-18 改由设置在「添加面板简化」页里的顺序驱动）。
// 内容 = 当前排在二级入口下面的那些条目（含分隔线）。
function renderMoreSub() {
  const s = ensureMoreSub();
  clearEl(s);
  nmAddSplit().level2.forEach(tk => { const el = nmAddRowEl(tk); if (el) s.appendChild(el); });
  moreSubBuilt = true;
  return s;
}
function showMoreSub(row) {
  if (state.historyMode) return;
  clearTimeout(moreSubHideTimer); clearTimeout(moreHideTimer); // 二级展开期间一级别关
  const s = moreSubBuilt ? ensureMoreSub() : renderMoreSub();
  s.classList.remove('hidden');
  const rr = row.getBoundingClientRect();
  const sw = s.offsetWidth, sh = s.offsetHeight;
  let left = rr.right - 8;                                    // 贴一级面板右侧（左边叠 8px 做"过桥"，斜着划过去也不会掉）
  if (left + sw > window.innerWidth - 8) left = Math.max(8, rr.left - sw + 8); // 右边放不下 → 翻到左侧
  // 纵向：默认「与鼠标所在行顶边对齐」；NM_SUB_BOTTOM_ALIGN 打开时改成「与一级面板底边对齐」
  // （二级比一级高 → 整体上提，底边不再探到状态条下面；2026-09-18 用户反馈被状态条遮住）
  let top = rr.top;
  if (NM_SUB_BOTTOM_ALIGN && moreMenu && !moreMenu.classList.contains('hidden')) {
    top = moreMenu.getBoundingClientRect().bottom - sh;
  }
  // 越界兜底：窗口特别矮时优先保证整块面板留在视口内
  const maxTop = window.innerHeight - 8 - sh;
  if (top > maxTop) top = maxTop;
  if (top < 8) top = 8;
  s.style.left = left + 'px';
  s.style.top = top + 'px';
}
function scheduleHideSub() { clearTimeout(moreSubHideTimer); moreSubHideTimer = setTimeout(hideMoreSub, NM_HIDE_MS); }
function hideMoreSub() { if (moreSubMenu) moreSubMenu.classList.add('hidden'); }
function showMoreMenu(anchor) {
  if (state.historyMode) { hideMoreMenu(); return; } // 历史页只读
  clearTimeout(moreHideTimer);
  hideStyleMenu(); // 两个面板不同时开
  const m = moreMenuBuilt ? ensureMoreMenu() : renderMoreMenu(); // 首次打开 / 配置改过 → 重建
  m.classList.remove('hidden');
  placePanelNear(m, anchor, 8);
}
function scheduleHideMore() { clearTimeout(moreHideTimer); moreHideTimer = setTimeout(() => { hideMoreMenu(); hideMoreSub(); }, NM_HIDE_MS); }
function hideMoreMenu() { if (moreMenu) moreMenu.classList.add('hidden'); }

// ============ 底部「格式」按钮：悬浮弹出的 加粗 / 红 / 黄（2026-09-17）============
// 由试做转正（用户 2026-09-17 定稿）：原来那三个独立按钮已彻底删除，不再是"隐藏保留"。
// 按钮图标用 lucide type、**图标本身**反映状态（加粗=画粗、红/黄=换色）；点完面板不关，移出才收。
let styleMenu = null;
let styleHideTimer = 0;
function ensureStyleMenu() {
  if (styleMenu) return styleMenu;
  styleMenu = document.createElement('div');
  styleMenu.id = 'node-style-menu';
  styleMenu.className = 'node-more-menu node-style-menu hidden';
  const items = [
    // 横排只放图标（B / 红圈 / 黄圈），文字说明交给悬浮提示（用户 2026-09-17）
    { act: 'bold',   icon: 'bold',   tip: T('nm.bold') + nmKeySuffix('bold') },
    { act: 'red',    icon: 'circle', tip: T('nm.red') + nmKeySuffix('red'),    color: 'red' },
    { act: 'yellow', icon: 'circle', tip: T('nm.yellow') + nmKeySuffix('yellow'), color: 'yellow' },
  ];
  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'mm';
    b.dataset.act = it.act;
    if (it.color) b.classList.add('color-' + it.color);
    if (it.tip) b.dataset.tip = it.tip;
    b.dataset.side = 'top'; // 横排只有一行，提示弹上方；不要用 left（会盖住左边那格按钮）
    b.innerHTML = renderIcon(it.icon, 18);
    b.addEventListener('mousedown', e => { if (state.editingEl) e.preventDefault(); });
    b.onclick = e => {
      e.stopPropagation();
      // ⚠️ 点击后**不关面板**（用户 2026-09-17：想连着点、看加粗之类生效后的效果）
      // → 面板一直留着，直到鼠标移出面板（mouseleave）才收。
      // 加粗：编辑标题时给选中文字插 **（不退出编辑、不 render）——与原来那个加粗按钮完全同款
      if (it.act === 'bold' && isEditingTitle()) { wrapSelectionInEdit('**'); syncStyleMenuState(); return; }
      nodeMenuAction(it.act);
      syncStyleMenuState(); // 动作生效后刷新横排的点亮状态（哪个当前生效）
    };
    styleMenu.appendChild(b);
  });
  styleMenu.addEventListener('mouseenter', () => clearTimeout(styleHideTimer));
  styleMenu.addEventListener('mouseleave', scheduleHideStyle);
  document.body.appendChild(styleMenu);
  return styleMenu;
}
// 刷新横排的点亮状态：当前节点已开启的那一项点亮（横排没文字，只能靠点亮表达"现在生效的是哪个"）
// 打开面板时调一次；每次点击生效后再调一次（因为面板点击后不关，状态会变）。
function syncStyleMenuState() {
  if (!styleMenu) return;
  const r = state.selectedId ? findNode(state.tree, state.selectedId) : null;
  const col = r ? (r.node.color || '') : '';
  const kids = styleMenu.children;
  const itemOf = act => Array.prototype.find.call(kids, b => b.dataset.act === act);
  const bBold = itemOf('bold'), bRed = itemOf('red'), bYellow = itemOf('yellow');
  if (bBold) bBold.classList.toggle('on', !!(r && nodeIsBold(r.node)));
  if (bRed) bRed.classList.toggle('on', col === 'red');
  if (bYellow) bYellow.classList.toggle('on', col === 'yellow');
}
function showStyleMenu(anchor) {
  if (state.historyMode) return;
  clearTimeout(styleHideTimer);
  hideMoreMenu(); hideMoreSub(); // 两个面板不同时开
  const m = ensureStyleMenu();
  m.classList.remove('hidden');
  syncStyleMenuState();
  placePanelNear(m, anchor, 8);
}
function scheduleHideStyle() { clearTimeout(styleHideTimer); styleHideTimer = setTimeout(hideStyleMenu, NM_HIDE_MS); }
function hideStyleMenu() { if (styleMenu) styleMenu.classList.add('hidden'); }
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
function nodeMenuAction(act, ev) { // ev：待办按钮的点击事件（要区分「裸点击 / ⌥+点击」，2026-09-20）
  // 多选：作用于 multiSelected 全部节点；单选：作用于 selectedId
  const ids = state.multiSelected.size > 0 ? [...state.multiSelected] : (state.selectedId ? [state.selectedId] : []);
  if (!ids.length) return;
  const targets = ids.map(id => { const r = findNode(state.tree, id); return r ? r.node : null; }).filter(Boolean);
  if (!targets.length) return;
  // 备注：仅单选有意义（多选已隐藏按钮，且不支持多节点写同一备注）
  if (act === 'note') { editNoteOfSelected(); return; }
  // 待办按钮（2026-09-21 第五轮定稿）：**必须排在下面那句 pushUndo() 之前** ——
  // 这里自己管撤销（状态一个都没变就不记），否则会往撤销栈里塞一条空记录。
  //   裸点击 = 普通 ↔ 待办（待办 / 已完成 → 普通）
  //   ⌘+点击 = 目标全是普通节点时「快速设为完成」；否则与裸点击一致（→ 普通）
  if (act === 'todo') {
    const cmd = !!(ev && (ev.metaKey || ev.ctrlKey));
    // 多选（2026-09-21 用户定）：**统一口径** —— 把整个选中集推到同一个状态，不是"每个节点各转各的"。
    //   （原来逐节点 toggle：普通→待办、待办→普通、完成→普通，混选时看着像"两个节点换了位置/属性被转来转去"）
    //   裸点击 = 全都已经是待办 → 全部变普通；否则（含普通/完成混着）→ 全部变待办
    //   ⌘+点击 = 全都已经是完成 → 全部变普通；否则 → 全部变完成
    if (targets.length > 1) {
      const target = cmd
        ? (targets.every(n => n.todo === 'done') ? '' : 'done')
        : (targets.every(n => n.todo === 'todo') ? '' : 'todo');
      if (targets.every(n => (n.todo || '') === target)) return; // 一个都没变 → 不记撤销
      pushUndo();
      targets.forEach(n => { n.todo = target; });
      emitUpdate(); renderWithMotion(); showNodeMenu();
      return;
    }
    // 单选：沿用老语义（普通→待办 / 待办→普通 / 完成→普通；⌘ 在普通节点上 = 直接设完成）
    const node0 = targets[0];
    const mode = (cmd && (node0.todo || '') === '') ? 'alt' : 'toggle';
    const next = nextTodoState(node0.todo, mode);
    if (next === (node0.todo || '')) return;
    pushUndo();
    node0.todo = next;
    emitUpdate(); renderWithMotion(); showNodeMenu(); // 工具栏是独立 DOM，要单独刷按钮状态
    return;
  }
  pushUndo();
  if (act === 'bold' || act === 'minor') {
    // 当所有目标都已处于该状态时整体取消，否则整体施加（多选各节点状态不一也统一处理）
    // v2（2026-08-29）：bold/minor 都是节点级字段（** 包裹 / minor:1 注释）；
    // 标题里的 _x_（斜体）与 ~~x~~（真删除线）是真实格式，不再是 Minor 标记、不动
    // （2026-09-20：Minor 按钮 act 从 'done' 改回 'minor' —— 腾出 'done' 给「完成 Done」待办按钮）
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
    if (act === 'minor' && targets.length === 1 && state.hideDone && nodeIsMinor(targets[0])) {
      _anchorId = findViewAnchorBeside(targets[0].id);
    }
    if (_anchorId) keepView({ id: _anchorId });
    emitUpdate(); render(); showNodeMenu();
    // 隐藏 Minor：仅单选提示（多选标记多个，toast 只说一个会误导）；节点消失给可撤销提示（2026-08-24 P1）
    if (act === 'minor' && targets.length === 1 && state.hideDone && nodeIsMinor(targets[0])) {
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
function toggleDoneOfSelected() { nodeMenuAction('minor'); } // Minor 开关（2026-09-20：act 从 'done' 改回 'minor'）
function toggleNowOfSelected() { nodeMenuAction('now'); }
// 待办命令的公共实现（2026-09-20 第三轮定稿，两条命令共用这一个入口）：
//   ⌘L  「（不）设为待办节点」= mode 'toggle'：普通 ↔ 待办 开关（与底部按钮裸点击完全同款）
//   ⌥⌘L「（不）设为完成节点」= mode 'alt'   ：非完成 → 完成、已完成 → 回普通（与底部按钮 ⌥+点击 同款）
function todoCycleOfSelected(mode) {
  if (state.historyMode) return;
  const ids = state.multiSelected.size > 0 ? [...state.multiSelected] : (state.selectedId ? [state.selectedId] : []);
  const targets = ids.map(id => { const r = findNode(state.tree, id); return r ? r.node : null; }).filter(Boolean);
  if (!targets.length) return;
  if (targets.every(n => nextTodoState(n.todo, mode) === (n.todo || ''))) return; // 没变化不记撤销
  pushUndo();
  targets.forEach(n => { n.todo = nextTodoState(n.todo, mode); });
  emitUpdate(); renderWithMotion(); showNodeMenu(); // 工具栏是独立 DOM，要单独刷按钮状态
}

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
  // 锚定（2026-09-20 用户定：拖拽后「主节点不动，只有拖拽附近动」）：
  // ① 锚点一律首选主节点 —— 之前钉的是「拖到的那个目标」，而目标自己也会被插入挤动，
  //    补偿量跟着它走 → 整屏被拖一大段，就是「一拖拽整个画面都动来动去」。
  // ② 主节点不在视野里时，替代锚点必须排除「这次会被搬走的」：被拖的整棵子树与落点目标都会被动画搬走，
  //    钉它们 = 画面被拖着跑（选中节点常常就是被拖节点自己，最容易踩到）。
  const movingIds = new Set();
  for (const id of valid) {
    movingIds.add(id);
    const rr = findNode(state.tree, id);
    if (rr) (function walk(n) { for (const c of (n.children || [])) { movingIds.add(c.id); walk(c); } })(rr.node);
  }
  if (targetId && targetId !== 'root') movingIds.add(targetId);
  keepView(currentRoot(), movingIds);
  emitUpdate(); renderWithMotion(); // 实验性：拖拽落位后节点滑到新位置（而不是瞬间跳过去）
}
// 新建节点统一工厂（2026-08-27 体检精简：之前同一字面量复制 6 处，加字段容易漏拷——now 字段就是前车之鉴）
function makeNode(title, link) {
  const n = { id: genId(), title: title || '', note: '', images: [], embeds: [], link: link || '', fold: false, persistId: '', todo: '', children: [] };
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
  if (r.node.todo) newNode.todo = 'todo'; // 母节点是待办（含已完成）→ 新子节点默认也是待办（2026-09-20 用户定）
  r.node.children.push(newNode);
  r.node.fold = false;
  if (state.showNow && nodeIsNow(r.node)) newNode.fold = true; // 只显示当前关注视图下：Now 的新子节点默认折叠，与既有 Now 子节点一致（2026-08-27 修）
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  keepView(r.node); // 锚定（2026-09-20 补）：钉住被加子的那个节点 —— 新卡在它旁边长出来，它自己不许跑
  emitUpdate(); renderWithMotion(); // 实验性：新建节点后周围卡片平滑让位（新卡本身不做飞入，避免开屏闪）
  startEditById(newNode.id);
  // 落点防遮挡（2026-09-18）：新卡被底部工具条盖住 → 只做垂直上提（rAF 等一帧布局落定再量）
  requestAnimationFrame(() => ensureNewCardAboveToolbar(newNode.id));
}
function addSibling() {
  if (state.historyMode) return; // 历史页只读
  if (!state.selectedId || state.selectedId === currentRoot().id) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  const newNode = makeNode(T('common.newNode'));
  if (r.node.todo) newNode.todo = 'todo'; // 选中的是待办（含已完成）→ 新同级默认也是待办（2026-09-20 用户定）
  r.parent.children.splice(r.index + 1, 0, newNode);
  if (state.showNow && nodeIsNow(r.parent.node)) newNode.fold = true; // 同上：Now 的新同级子节点默认折叠
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  keepView(r.parent); // 锚定（2026-09-20 补）：钉住这一层的容器（同级插入会让它重新居中）
  emitUpdate(); renderWithMotion(); // 实验性：新建节点后周围卡片平滑让位（新卡本身不做飞入，避免开屏闪）
  startEditById(newNode.id);
  // 落点防遮挡（2026-09-18）：新卡被底部工具条盖住 → 只做垂直上提（rAF 等一帧布局落定再量）
  requestAnimationFrame(() => ensureNewCardAboveToolbar(newNode.id));
}
// ⬆️：在选中节点上方新建同级节点（计划依赖排序用）
function addSiblingAbove() {
  if (!state.selectedId || state.selectedId === currentRoot().id) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  const newNode = makeNode(T('common.newNode'));
  if (r.node.todo) newNode.todo = 'todo'; // 选中的是待办（含已完成）→ 新同级默认也是待办（2026-09-20 用户定）
  r.parent.children.splice(r.index, 0, newNode);
  if (state.showNow && nodeIsNow(r.parent.node)) newNode.fold = true; // 同上：Now 的新同级子节点默认折叠
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  keepView(r.parent); // 锚定（2026-09-20 补）：钉住这一层的容器（同级插入会让它重新居中）
  emitUpdate(); renderWithMotion(); // 实验性：新建节点后周围卡片平滑让位（新卡本身不做飞入，避免开屏闪）
  startEditById(newNode.id);
  // 落点防遮挡（2026-09-18）：新卡被底部工具条盖住 → 只做垂直上提（rAF 等一帧布局落定再量）
  requestAnimationFrame(() => ensureNewCardAboveToolbar(newNode.id));
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
  keepView(pr.parent); // 锚定（2026-09-20 补）：钉住这一层的容器（同级插入会让它重新居中）
  emitUpdate(); renderWithMotion(); // 实验性：新建节点后周围卡片平滑让位（新卡本身不做飞入，避免开屏闪）
  startEditById(newNode.id);
  // 落点防遮挡（2026-09-18）：新卡被底部工具条盖住 → 只做垂直上提（rAF 等一帧布局落定再量）
  requestAnimationFrame(() => ensureNewCardAboveToolbar(newNode.id));
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
  // 2026-09-15：口径与 computeNowVisible 对齐——被 Minor 链埋掉的 Now 不算（root 存在性防御同源）。
  const root = currentRoot();
  if (state.showNow && root && collectUsableNows(root).length === 0) setShowNow(false);
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
    keepView(items[0].parent); // 锚定母节点：删除后画面随它补，避免大块内容消失后视野里什么都不剩（2026-09-13 反馈）
    removeNodesDeepFirst(items);
    state.multiSelected.clear();
    state.selectedId = null;
    // 2026-09-20：多选删除也是整棵树的结构变化 → 走位移过渡，周围卡片平滑收拢（不动效时 renderWithMotion 直接退回 render）
    emitUpdate(); renderWithMotion(); updateToolbar(); updateDefaultPathBtn();
    autoExitShowNowWhenEmpty(); // 删到无 Now → 自动退出 showNow，避免画面塌缩成只剩 root
    if (hiddenMinor > 0) toastBelow(T('toast.hiddenAlsoDeleted', hiddenMinor), { label: T('common.undo'), fn: () => doUndo() });
    return;
  }
  if (!state.selectedId || state.selectedId === currentRoot().id) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r || !r.parent) return;
  const hiddenMinor = (state.hideDone && r.node) ? countMinorDescendants(r.node) : 0;
  pushUndo();
  keepView(r.parent); // 锚定母节点：删除后画面随它补，避免大块内容消失后视野里什么都不剩（2026-09-13 反馈）
  r.parent.children.splice(r.index, 1);
  state.selectedId = null;
  emitUpdate(); renderWithMotion(); updateToolbar(); updateDefaultPathBtn(); // 同上：删完周围卡片平滑收拢
  autoExitShowNowWhenEmpty(); // 删到无 Now → 自动退出 showNow，避免画面塌缩成只剩 root
  if (hiddenMinor > 0) toastBelow(T('toast.hiddenAlsoDeleted', hiddenMinor), { label: T('common.undo'), fn: () => doUndo() });
}
// 取消刚新建的节点：仅作用于 justCreated 标记的节点（误触回车/方向键新建后，ESC 或清空回车取消）
// 删除后锚定母节点（与 deleteNode 一致，2026-09-13）
function cancelNewNode(id) {
  const r = findNode(state.tree, id);
  if (!r || !r.parent) return false; // 根节点不可删
  pushUndo();
  keepView(r.parent); // 与删除同款：锚定母节点（2026-09-13）
  r.parent.children.splice(r.index, 1);
  state.justCreated.delete(id);
  if (state.selectedId === id) state.selectedId = null;
  emitUpdate(); render(); updateToolbar(); updateDefaultPathBtn();
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
  const norm = path.replace(/[\\/]+$/, ''); // 剥末尾斜杠（文件夹路径末尾有 /）
  const name = norm.split(/[\\/]/).pop() || norm; // 取末级文件名/目录名（文件夹只留目录名）
  const newNode = makeNode('', '[' + name + '](file://' + path + ')'); // url 保留原末尾斜杠（文件夹 URL 需要）
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

// ============ 「更多」菜单共用的写入通道（2026-09-17 加）============
// 弹窗会把焦点抢走、结束编辑会话 → 弹窗前先把「在编辑哪个框、光标在第几个字」记下来，
// 确认后重开编辑会话、把光标放回原处再插字（用户要的「光标在哪就插哪」）。
let editInsertTarget = null; // { nodeId, where:'title'|'note', offset }
function captureEditTarget() {
  editInsertTarget = null;
  const el = state.editingEl;
  if (!el || el.contentEditable !== 'true') return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  try { pre.setEnd(r.startContainer, r.startOffset); } catch (_) { return; }
  editInsertTarget = {
    nodeId: state.selectedId,
    where: state.editingNoteId === state.selectedId ? 'note' : 'title',
    offset: pre.toString().length,
  };
}
// 把光标放到 el 内第 offset 个字符处（越界 → 末尾）
function setCaretAtOffset(el, offset) {
  const sel = window.getSelection();
  const r = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let acc = 0, hit = null, off = 0, n;
  while ((n = walker.nextNode())) {
    const len = n.textContent.length;
    if (acc + len >= offset) { hit = n; off = offset - acc; break; }
    acc += len;
  }
  if (hit) r.setStart(hit, Math.max(0, Math.min(off, hit.textContent.length)));
  else { r.selectNodeContents(el); r.collapse(false); }
  r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
}
// 在当前编辑框的光标处插文字（标题 / 备注 / 链接编辑都走 editSession 登记的 state.editingEl）。
// 插完派发 input：让 [[ 文件建议、曲线重画、内容落盘照常感知（与手工敲字同一条路）。
// ⚠️ 光标必须落在「文本节点」内：建议器的 update() 要求 startContainer 是文本节点（且 collapsed），
// 落在元素上（setStartAfter）会被直接判为不匹配 → 建议框不弹。2026-09-17 实修。
function insertTextAtCursor(text) {
  const el = state.editingEl;
  if (!el || el.contentEditable !== 'true') return false;
  el.focus();
  const sel = window.getSelection();
  let range = null;
  if (sel && sel.rangeCount > 0) {
    const r0 = sel.getRangeAt(0);
    if (el.contains(r0.startContainer)) range = r0;
  }
  if (!range) { // 光标不在编辑框内（点按钮夺焦）→ 落到末尾，不吞字
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  range.deleteContents(); // 有选区时先替掉选区（与加粗按钮一致的直觉）
  const tn = document.createTextNode(text);
  range.insertNode(tn);
  const after = document.createRange();
  after.setStart(tn, tn.textContent.length); after.collapse(true); // 落在文本节点内（见上方注释）
  if (sel) { sel.removeAllRanges(); sel.addRange(after); }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
// 写入一段链接文字：编辑态（或弹窗前记下了编辑位置）→ 插到光标处；仅选中态 → 追加到备注（已有备注则空一行）
function insertLinkText(text) {
  if (!text) return;
  const t = editInsertTarget; editInsertTarget = null;
  if (t) { insertAtCapturedTarget(t, text); return; }
  if (state.editingEl && state.editingEl.contentEditable === 'true') { insertTextAtCursor(text); return; }
  if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  pushUndo();
  const cur = (r.node.note || '').trim();
  r.node.note = cur ? cur + '\n\n' + text : text;
  emitUpdate(); render();
}
// 重开编辑会话并把文字插到弹窗前记下的位置（offset 越界则落到末尾）
function insertAtCapturedTarget(t, text) {
  const r = findNode(state.tree, t.nodeId);
  if (!r) { insertLinkText(text); return; }
  if (t.where === 'note') { if (!r.node.note) r.node.note = ''; state.editingNoteId = t.nodeId; emitUpdate(); render(); }
  const row = document.querySelector('.node-row[data-id="' + t.nodeId + '"]');
  const el = row && row.querySelector(t.where === 'note' ? ':scope > .card .note > div' : ':scope > .card .title');
  if (!el) { insertLinkText(text); return; }
  if (t.where === 'note') startEditNote(r.node, el); else startEdit(r.node, el, null, true);
  setTimeout(() => {
    if (state.editingEl === el) setCaretAtOffset(el, t.offset);
    insertTextAtCursor(text);
  }, 0);
}

// ============ 「更多」菜单：从电脑选图片 / 视频 / 音频（2026-09-17）============
// 这里只负责「发请求」：真正的弹框、读文件、复制进 vault 全在宿主做。
// 原因：iframe 里的 <input type=file> 拿到的 File 在 Obsidian 的 Electron 里取不到真实磁盘路径
//（新版 Electron 已移除 File.path，webUtils 在 iframe 里也不可靠）→ 视频/音频根本读不出来，
// 所以把「选文件」整个挪到宿主侧（宿主有 Node：macOS 走 osascript choose file 拿真实路径）。
function pickMedia(kind) {
  if (state.historyMode) return;
  if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
  vscode.postMessage({ type: 'pickFiles', kind: kind, nodeId: state.selectedId });
}
// 导入完成：按扩展名分流（与解析器 isMediaFile 同源）→ 图片进 images、音视频进 embeds
function addMediaNames(names, nodeId) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return;
  const r = findNode(state.tree, nodeId || state.selectedId);
  if (!r) return;
  pushUndo();
  list.forEach(n => { if (isMediaFile(n)) r.node.embeds.push(n); else r.node.images.push(n); });
  emitUpdate(); render();
}

// ============ 「更多」菜单动作（2026-09-17）============
function moreMenuAction(act) {
  if (state.historyMode) return;
  // 要弹窗的入口：先记住当前编辑位置（弹窗会抢焦点 → 编辑会话结束 → 事后才知道该插哪）
  if (act === 'file' || act === 'node' || act === 'url') captureEditTarget();
  // 图片/视频/音频：弹系统选择器（在宿主侧做，见 pickFiles）
  if (act === 'image' || act === 'video' || act === 'audio') { pickMedia(act); return; }
  if (act === 'vault') { addVaultAttachment(); return; }
  if (act === 'file') { addFileLink(); return; }
  if (act === 'wiki') { addWikiLink(); return; }
  if (act === 'node') { addNodeLink(); return; }
  if (act === 'url') { addUrlLink(); return; }
  // 「AI 编辑」（2026-09-18）：右键「复制 AI 定位」的可视化形态 —— 拼好文本发宿主弹窗（弹窗里复制并关闭）
  if (act === 'aiEdit') {
    const hit = state.selectedId ? findNode(state.tree, state.selectedId) : null;
    const node = hit && hit.node;
    if (!node) { toast(T('toast.pasteImg'), true); return; }
    if (!node.persistId) { node.persistId = genPersistId(); pushUndo(); emitUpdate(); } // 懒分配持久 ID（与右键同源）
    const p = state.filePath || (state.currentFilename || T('common.untitled'));
    const text = T('aiLocate.node', p, node.persistId); // 同一份 i18n 文案（跟着界面语言走），与右键复制同源
    vscodeApi.postMessage({ type: 'openAiEdit', text });
    return;
  }
  // 节点级操作（与左下「更多」里那三项同一个函数，行为完全一致）
  if (act === 'addChild') { addChild(); return; }
  if (act === 'addSibling') { addSibling(); return; }
  if (act === 'delNode') { deleteNode(); return; }
}
// 允许挂到节点上的附件扩展名（与「更多」菜单的选择白名单一致，2026-09-17）
// 其它格式（.psd / .zip / .pdf / .docx…）一律不收 —— 挂上去也渲染不出来，只会变成「缺失」
const ATTACH_OK_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|svg|mp4|mov|webm|mkv|avi|mp3|m4a|wav|aac|flac|ogg)$/i;
// 添加仓库内附件：引用库里已有的图片/视频（只写 ![[名字]]，不复制文件）
function addVaultAttachment() {
  if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
  showPromptH(T('more.addVaultAttach'), T('more.addVaultAttachHint'), 'xxx.png', v => {
    const name = (v || '').trim();
    if (!name) return;
    if (!ATTACH_OK_RE.test(name)) { toast(T('more.pickBadType'), true); return; } // 只让支持的格式进来
    addMediaNames([name], state.selectedId);
  });
}
// 添加本地文件链接：拼成 [显示名](file://绝对路径)；位置交给 insertLinkText 分情况处理
function addFileLink() {
  showPromptH(T('more.addFileLink'), T('more.addFileLinkHint'), T('more.addFileLinkPh'), v => {
    const p = (v || '').trim();
    if (!p) return;
    const disp = p.split(/[\\/]/).pop() || p;
    insertLinkText('[' + disp + '](' + 'file://' + p + ')');
  });
}
// 添加双链：非编辑态 → 先进标题编辑、光标到末尾再敲 [[ 触发文件建议；已在编辑态 → 光标处直接插 [[
function addWikiLink() {
  if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
  if (state.editingEl && state.editingEl.contentEditable === 'true') { insertTextAtCursor('[['); return; }
  const r = findNode(state.tree, state.selectedId);
  const el = document.querySelector('.node-row[data-id="' + state.selectedId + '"] .title');
  if (!r || !el) return;
  startEdit(r.node, el, null, true); // cursorEnd=true → 光标放末尾
  setTimeout(() => insertTextAtCursor('[['), 0); // 等编辑会话建好再插，才会触发建议弹窗
}
// 关联其它节点：粘贴别的思维导图里复制来的 [[文件名#节点ID]]
function addNodeLink() {
  showPromptH(T('more.addNodeLink'), T('more.addNodeLinkHint'), T('more.addNodeLinkPh'), v => {
    const t = (v || '').trim();
    if (!t) return;
    insertLinkText(t);
  });
}
// 添加网页链接：两字段（显示文字 + 地址）→ [显示名](url)；显示文字留空则用域名兜底
function addUrlLink() {
  // 弹窗里的说明用 more.addUrlLinkHint（与条目悬浮提示 more.addUrlLinkTip 分开两个键，可各自单独改；用户 2026-09-17）
  showPrompt2(T('more.addUrlLink'), T('more.addUrlLinkHint'), T('more.urlText'), T('more.urlAddr'), (text, url) => {
    const u = (url || '').trim();
    if (!u) return;
    const norm = /^www\./i.test(u) ? 'https://' + u : u;
    const disp = (text || '').trim() || urlRootDisplay(norm);
    insertLinkText('[' + disp + '](' + norm + ')');
  });
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
  // 2026-09-20：粘贴进来的新卡片本身不做飞入（门闩①：没有旧位置可插值，做了会闪），
  // 但周围被挤开的卡片走位移过渡 → 视觉上是「原地让出空位」，而不是整屏硬跳。
  keepView(r.node); // 锚定挂靠的母节点：钉住它，新增内容从它下方长出来
  emitUpdate(); renderWithMotion();
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
  r.node.embeds = (r.node.embeds || []).filter(p => p !== path); // 2026-09-17：视频/音频也走同一条删除路径
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
    keepView(items[0].parent); // 与删除同款：锚定母节点（2026-09-13）
    removeNodesDeepFirst(items); // 按树深度从深到浅删，避免相互影响（与 deleteNode 多选共用）
    state.multiSelected.clear();
    state.selectedId = null;
    emitUpdate(); renderWithMotion(); updateToolbar(); updateDefaultPathBtn(); // 剪切 = 复制 + 删除：与删除同款收拢动画
    return;
  }
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r || !r.parent) return;
  if (r.node.id === currentRoot().id) return; // 根不能剪切
  vscode.postMessage({ type: 'copyNode', text: serialize(r.node, 0, true).trim() });
  pushUndo();
  keepView(r.parent); // 与删除同款：锚定母节点（2026-09-13）
  r.parent.children.splice(r.index, 1);
  state.selectedId = null;
  emitUpdate(); renderWithMotion(); updateToolbar(); updateDefaultPathBtn(); // 剪切 = 复制 + 删除：与删除同款收拢动画
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
  keepView(r.node); // 同上：锚定挂靠的母节点（粘贴整棵子树同样适用）
  emitUpdate(); renderWithMotion();
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
    minorIco: n.minorIco || '', // 节点级 Minor 图标名（2026-09-20 实验），漏拷会丢图标选择
    now: !!n.now, // 2026-08-27 修：漏拷 now 会丢 Now 标记
    todo: n.todo || '', // 待办状态（2026-09-20）：漏拷会丢待办/已完成标记
    rawLines: (n.rawLines || []).slice(),
    children: (n.children || []).map(cloneNode)
  };
  if (nowVisibleSnapshot) nowVisibleSnapshot.add(c.id); // 同 makeNode：粘贴的子树整体注册进快照（2026-08-28）
  return c;
}

// ============ 右键菜单（节点 → 复制/剪切/复制链接；图片 → 复制图片） ============
let ctxMenu = null;
function hideCtx() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } hideCtxSub(); } // 主菜单收掉时二级一起收
// 右键行（2026-09-21 加 kbd = 右侧快捷键提示，形态与左下「更多」菜单里的 .kbd 一致）
function ctxItem(label, fn, icon, tip, kbd) {
  const it = document.createElement('div');
  it.className = 'ctx-item';
  if (icon) {
    const ic = document.createElement('span');
    ic.className = 'ctx-ic';
    ic.innerHTML = renderIcon(icon, 16);
    it.appendChild(ic);
  }
  const lb = document.createElement('span');
  lb.className = 'ctx-label';
  lb.textContent = label;
  it.appendChild(lb);
  if (kbd) {
    const k = document.createElement('span');
    k.className = 'kbd';
    k.textContent = kbd;
    it.appendChild(k);
  }
  // 悬浮小黑框说明（2026-09-01）：复用 [data-tip] 机制，仅在传入 tip 时显示
  if (tip) { it.setAttribute('data-tip', tip); it.setAttribute('data-side', 'right'); }
  // 2026-09-21 用户实报：鼠标从「基础操作」滑到下面**带黑字提示**的行时，那个黑框会和仍开着的二级面板叠在一起。
  // 修法与底部工具条那排按钮同款（那边是 mouseenter 里 hideStyleMenu/hideMoreMenu）：**碰到任何非二级面板内的行，
  // 立刻把二级收掉**（不等 200ms 延时 —— 延时是给「父项 → 面板」那条缝留的，这里是要立刻消失）。
  it.addEventListener('mouseenter', () => { if (ctxSub && !ctxSub.contains(it)) hideCtxSub(); });
  it.onclick = () => { fn(); hideCtx(); };
  return it;
}
function ctxSep() { const s = document.createElement('div'); s.className = 'ctx-sep'; return s; }
// 二级菜单（2026-09-21：「基础操作」那一项悬浮展开右侧面板）
// 观感与左下「更多」菜单的二级一致：父项右侧挂一个小箭头，悬浮即展开；面板贴着父项放（右边优先，放不下翻左边）
let ctxSub = null;
function hideCtxSub() { clearTimeout(ctxSubTimer); if (ctxSub) { ctxSub.remove(); ctxSub = null; } }
// 延时收起（2026-09-21 用户实报「鼠标移走二级面板不消失」后补）：
//   父项 → 二级面板之间隔着 2px 的缝，鼠标穿过去时父项先 mouseleave、面板的 mouseenter 还没到；
//   不留宽容期就会一闪一合。所以 leave 只是**排一个定时器**，真正进入另一方时把它清掉。
//   经验值：跟左下「更多」菜单的二级同一个手感（那个是 320ms，这里表单薄，用 200ms 更跟手）。
const CTX_HIDE_MS = 200;
let ctxSubTimer = 0;
function scheduleHideCtxSub() { clearTimeout(ctxSubTimer); ctxSubTimer = setTimeout(hideCtxSub, CTX_HIDE_MS); }
function cancelHideCtxSub() { clearTimeout(ctxSubTimer); }
function showCtxSub(anchor, items) {
  cancelHideCtxSub();
  hideCtxSub();
  ctxSub = document.createElement('div');
  ctxSub.className = 'ctx-menu ctx-submenu';
  items.forEach(s => ctxSub.appendChild(ctxItem(s.label, s.fn, s.icon, s.tip || '', s.kbd || '')));
  ctxSub.addEventListener('mouseenter', cancelHideCtxSub); // 鼠标进面板 → 别收
  ctxSub.addEventListener('mouseleave', scheduleHideCtxSub); // 移走 → 排一次收起
  document.body.appendChild(ctxSub);
  const ar = anchor.getBoundingClientRect();
  let left = ar.right + 2;
  if (left + ctxSub.offsetWidth > window.innerWidth - 6) left = Math.max(6, ar.left - ctxSub.offsetWidth - 2);
  let top = ar.top - 4;
  if (top + ctxSub.offsetHeight > window.innerHeight - 6) top = Math.max(6, window.innerHeight - 6 - ctxSub.offsetHeight);
  ctxSub.style.left = left + 'px';
  ctxSub.style.top = top + 'px';
}
// 二级菜单父项：右侧小箭头（与「＋添加」面板里二级入口同一个 chevron-right）
function ctxSubItem(label, items, icon) {
  const it = document.createElement('div');
  it.className = 'ctx-item ctx-has-sub';
  if (icon) {
    const ic = document.createElement('span');
    ic.className = 'ctx-ic';
    ic.innerHTML = renderIcon(icon, 16);
    it.appendChild(ic);
  }
  const lb = document.createElement('span');
  lb.className = 'ctx-label';
  lb.textContent = label;
  it.appendChild(lb);
  const ar = document.createElement('span');
  ar.className = 'kbd';
  ar.innerHTML = renderIcon('chevron-right', 14);
  it.appendChild(ar);
  it.addEventListener('mouseenter', () => { cancelHideCtxSub(); showCtxSub(it, items); });
  it.addEventListener('mouseleave', scheduleHideCtxSub); // 移开父项 → 排一次收起（进二级面板会取消它）
  it.onclick = (e) => { e.stopPropagation(); showCtxSub(it, items); }; // 点击也能展开（触屏兜底）
  return it;
}
// 从剪贴板读文本粘贴（2026-09-21：右键「粘贴」用 —— 浏览器不允许脚本伪造 paste 事件，只能直接读剪贴板）
function pasteFromClipboard() {
  if (state.historyMode) return;
  if (!(navigator.clipboard && navigator.clipboard.readText)) { toast(T('ctx.pasteUseKey')); return; }
  navigator.clipboard.readText().then((t) => {
    if (!t || !applyPastedText(t)) toast(T('toast.pasteFirst'));
  }).catch(() => toast(T('ctx.pasteUseKey')));
}
// 右键菜单与命令**共用**的三个操作（2026-09-21：注册成命令后，菜单与快捷键走同一份实现，别各写一遍）
//   copyNodeLinkOf = 复制节点链接；copyAILocateOf = 复制 AI 定位路径；bookmarkOf = 保存为捷径
// persistId 懒分配：这三个操作都要靠节点 ID 定位，没有就先分配并写回文件（pushUndo 可撤销）
function ensurePersistId(node) {
  if (!node.persistId) { node.persistId = genPersistId(); pushUndo(); emitUpdate(); }
}
function copyNodeLinkOf(node) {
  // 复制链接 v2 跨文档定案（2026-08-29）：[[源文件名#pid]]——Obsidian 原生 wikilink 按名字不按路径，
  // 文件移动/改名自动跟随（不是硬链接）；粘贴回本文件时「文件名==当前文件」自动识别为同文件跳转（resolveNodeLink）
  ensurePersistId(node);
  vscode.postMessage({ type: 'copyLink', text: '[[' + (state.currentFilename || T('common.untitled')) + '#' + node.persistId + ']]' });
}
function copyAILocateOf(node) {
  // 文案 = i18n 的 'aiLocate.node'（跟着界面语言走）；同时懒注入 ai:/aiLocate: 进文件 frontmatter
  ensurePersistId(node);
  const p = state.filePath || (state.currentFilename || T('common.untitled'));
  vscode.postMessage({ type: 'copyLink', text: T('aiLocate.node', p, node.persistId) });
  vscode.postMessage({ type: 'ensureAiLocate' });
  toast(T('toast.aiLocateCopied'));
}
function bookmarkOf(node) {
  // 保存为捷径：在数据文件同目录创建 <名字>.md（frontmatter 28notes: mmlink），点它即打开本文件并下钻到该节点
  ensurePersistId(node);
  showPrompt(T('ctx.bookmark'), T('ctx.bookmarkHint'), (val) => {
    vscode.postMessage({ type: 'createShortcut', pid: node.persistId, title: node.title || T('common.node'), name: (val || '').trim() });
  });
}
function buildCtxMenu(x, y, node, mode, imgPath) {
  if (state.historyMode) return; // 历史界面只读：右键菜单整体屏蔽（节点/图片菜单都从这里走，收口一处）
  hideCtx();
  hideCtxSub();
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  if (mode === 'image') {
    // 附件（图片 / 视频 / 音频）右键（2026-09-21 用户定）：只有剪切 / 复制 / 删除
    ctxMenu.appendChild(ctxItem(T('ctx.cut'), () => cutSelectedNode(), 'scissors', '', nmKeySuffix('cut', '{Mod} + X')));
    ctxMenu.appendChild(ctxItem(T('ctx.copy'), () => copySelectedNode(), 'copy', '', nmKeySuffix('copy', '{Mod} + C')));
    ctxMenu.appendChild(ctxItem(T('ctx.deleteImage'), () => {
      // 右键不会触发 click → 先把 selectedImg 指到这张再走统一删除逻辑（2026-09-17）
      state.selectedImg = { nodeId: node.id, path: imgPath };
      removeSelectedImage(false);
    }, 'trash-2'));
  } else {
    // 一级菜单**不挂快捷键备注**（2026-09-21 用户定）：一级里四五行、每行右侧都吊一串键位，面板会拉得又长又花；
    // 键位只在**二级菜单**里显示（剪切/复制/粘贴/删除那四项），那里才是「手上有键盘时才用的操作」。
    // 一级**保留黑色小字提示**（data-tip，2026-09-21 用户定：进入当前节点 / 保存为捷径 也要有，文案先预埋）——
    // 提示与键位是两回事：提示在悬浮黑框里，键位在行右侧。
    // 进入当前节点（下钻，非当前根节点；2026-08-24 P1：末尾节点也允许进入——之前要 children.length，叶子点不了）
    if (node.id !== currentRoot().id) {
      // 键位段（{0}）走 nmKeySuffix：它自己带平台括号（zh 全角 / en 半角），**没绑键时整体消失** ——
    // 所以文案里别写死「（）」，否则解绑后会留一対空括号。
    ctxMenu.appendChild(ctxItem(T('ctx.drill'), () => drillInto(node.id), 'log-in', T('ctx.drillTip', nmKeySuffix('drill', '{Mod} + ='))));
      ctxMenu.appendChild(ctxSep());
    }
    // 基础操作（2026-09-21 用户定）：剪切 / 复制 / 粘贴 / 删除收进二级菜单，父项右侧挂箭头
    ctxMenu.appendChild(ctxSubItem(T('ctx.basicOps'), [
      { label: T('ctx.cut'), fn: () => cutSelectedNode(), icon: 'scissors', kbd: nmKeyPlain('cut', '{Mod} + X') },
      { label: T('ctx.copy'), fn: () => copySelectedNode(), icon: 'copy', kbd: nmKeyPlain('copy', '{Mod} + C') },
      { label: T('ctx.paste'), fn: () => pasteFromClipboard(), icon: 'clipboard-paste', kbd: nmKeyPlain('paste', '{Mod} + V') },
      { label: T('ctx.delete'), fn: () => deleteNode(), icon: 'trash-2', kbd: nmKeyPlain('delete', 'Delete') },
    ], 'clipboard'));
    ctxMenu.appendChild(ctxSep());
    ctxMenu.appendChild(ctxItem(T('ctx.copyLink'), () => copyNodeLinkOf(node), 'link', T('ctx.copyLinkTip', nmKeySuffix('copyNodeLink', '{Mod} + {Alt} + C'))));
    const aiLocateItem = ctxItem(T('ctx.copyAILocate'), () => copyAILocateOf(node), 'astroid', T('ctx.copyAILocateTip', nmKeySuffix('copyAILocate', '{Mod} + {Alt} + A')));
    applyProGate(aiLocateItem); // 统一 Pro 拦截（2026-09-04）：未激活 → 悬浮变 ticket + 点击进激活弹窗
    ctxMenu.appendChild(aiLocateItem);
    const bookmarkItem = ctxItem(T('ctx.bookmark'), () => bookmarkOf(node), 'split', T('ctx.bookmarkTip', nmKeySuffix('saveShortcut', '{Mod} + /')));
    applyProGate(bookmarkItem); // 保存为捷径：未激活同样走 Pro 拦截（2026-09-04）
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
// 2026-09-17：点「卡片以外」的任何地方 → 附件（图片/视频）的选中作废、粉框消失。
// 为什么不放在画布空白那条监听里：那条要求 e.target 精确等于 viewMap/treeEl，
// 点到别的子元素（连线层等）就不执行 → 粉框残留（用户反复报的「点空白框不消失」）。
// 挂全局兜底，只认「在不在卡片里」，不依赖点到了哪个具体元素。
// 点卡片内部时不处理：交给图片/视频自己的 click handler（它在 selectNode 之后重新加框，顺序安全）。
document.addEventListener('click', e => {
  if (!state.selectedImg) return;
  const t = e.target;
  if (t && t.closest && t.closest('.card')) return;
  state.selectedImg = null;
  document.querySelectorAll('.card .img.selected, .card .embed-media.selected').forEach(el => el.classList.remove('selected'));
});
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
  // 2026-09-17 改：原来只取第一张（items 里 break + 兜底 files[0]）→ 桌面多选 3 张只有 1 张进来。
  // 现在收集全部：有真实磁盘路径的一批交给宿主用 fs 复制（大图、多张都不卡），没有的退化成 dataUrl（老路，图片够用）。
  const imgFiles = [];
  for (const it of cd.items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) imgFiles.push(f); }
  }
  if (!imgFiles.length && cd.files && cd.files.length) {
    for (const f of cd.files) { if (f.type && f.type.startsWith('image/')) imgFiles.push(f); }
  }
  if (imgFiles.length) {
    e.preventDefault();
    if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
    const nodeId = state.selectedId; // 粘贴这一刻就钉住目标节点（存盘有来回，期间改选中也不挂错地方）
    wlog('检测到图片粘贴：' + imgFiles.length + ' 个');
    const withPath = imgFiles.filter(f => f.path);
    const noPath = imgFiles.filter(f => !f.path);
    if (withPath.length) vscode.postMessage({ type: 'importMedia', paths: withPath.map(f => f.path), nodeId });
    noPath.forEach(imgFile => {
      const reader = new FileReader();
      reader.onload = () => {
        wlog('图片读取完成，dataUrl 长度=' + String(reader.result).length);
        vscode.postMessage({ type: 'pasteImg', dataUrl: String(reader.result), nodeId });
      };
      reader.onerror = () => wlog('图片读取失败: ' + reader.error);
      reader.readAsDataURL(imgFile);
    });
    return;
  }
// 文本：非编辑态 → 列表行整段作为节点粘贴；否则查图片文本 / [[链接]]（编辑态交给原生）
// 2026-09-21：抽成 applyPastedText —— 右键菜单的「粘贴」也要走同一份逻辑（浏览器不允许脚本伪造 paste 事件）
if (editing) return;
if (applyPastedText(cd.getData('text') || '')) e.preventDefault();
});

// 粘贴一段文本（paste 事件 / 右键「粘贴」共用）：按内容猜意图 —— 大纲 > 图片 > 文件 > 链接 > 双链 > 纯文字
// 返回 true = 认领了这次粘贴（调用方据此决定要不要 preventDefault）
function applyPastedText(text) {
  const nonEmpty = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (nonEmpty.length && /^[-*+]\s/.test(nonEmpty[0])) { addNodeFromText(text); return true; } // 大纲整段
  const wikiImgM = text.match(/^!\[\[([^\]]+)\]\]$/); // 图片文本 v2 ![[名]]（兼容 v1 ![](路径)）
  if (wikiImgM) { addImageToNode(wikiImgM[1].trim()); return true; }
  const imgM = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (imgM) { addImageToNode(imgM[1]); return true; }
  const filePath = detectFilePath(text); // 裸路径或 [[file://...]] → 指向该文件的子节点
  if (filePath) { addFileLinkChild(filePath); return true; }
  const url = detectUrl(text); // http/https/ftp/mailto/www（含 [名](url)）→ 链接子节点
  if (url) { addUrlLinkChild(url); return true; }
  if (/\[\[[^\]]+\]\]/.test(text)) { addLinkChild(text.match(/\[\[[^\]]+\]\]/)[0]); return true; } // 双链
  if (nonEmpty.length) { addTextNodes(text); return true; } // 纯文字 → 按行拆成新子节点
  return false;
}

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
// —— 画布键位表（2026-09-18）：唯一真相源 = Obsidian 原生快捷键页（.obsidian/hotkeys.json）——
// 宿主读官方注册表后随 init / setCanvasHotkeys 推来；本文件**不再写死命令类键位**
// （加粗/标红/标黄/Now/Minor/撤销/重做 已迁移；导航/编辑类键 Tab/Enter/方向/Cmd+C/E/P 等暂未迁移，二期）。
// 用户在原生页改键后：重新聚焦画布 → focus 时拉一次新表（无官方改键事件，用拉取代替）→ 触发与提示同时跟新。
function nmEventKey(e) { // 事件键名：优先物理键位 e.code。⚠️ macOS 按住 Option 时 e.key 会变成特殊字符
  const c = String(e.code || ''); //（Option+B = ∆、Option+2 = ™），用 e.key 永远匹配不上带 Alt 的绑定（实踩）。
  if (c.indexOf('Key') === 0) return c.slice(3).toLowerCase(); // KeyB → b
  if (c.indexOf('Digit') === 0) return c.slice(5);             // Digit2 → 2
  return e.key ? String(e.key).toLowerCase() : '';             // 其余（Enter/Tab/方向…）退回 key
}
function nmEventHotkey(e) { // 键盘事件 → 归一化串（与宿主 normHotkey 同一套规则：mod/alt/shift + 小写键名）
  const parts = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const k = nmEventKey(e);
  if (k) parts.push(k);
  return parts.join('+');
}
function nmMatchCanvasHotkey(e) { // 键盘事件 → 动作名（没命中 = null）
  const n = nmEventHotkey(e);
  return (n && state.canvasHotkeys && state.canvasHotkeys.match && state.canvasHotkeys.match[n]) || null;
}
// 这个键要不要转发给宿主（2026-09-20 修「点过画布之后 Obsidian 快捷键全废」）：
// 画布是 iframe，焦点一进画布，宿主的全局快捷键就**收不到按键**了 —— 它们只听主文档的 keydown，
// 而 iframe 是独立文档，按键不会冒上去。表现就是：开图那一刻（焦点还在外面）快捷键能用，
// 点一个节点、或点空白取消选中（焦点进了画布）之后，「切换源文件 / 导图」、官方「打开设置」、
// 「上一个 / 下一个标签页」、其它插件的命令键 —— 全部失灵。
// 所以画布**自己没消费**的组合键一律转出去，由宿主按它自己的键位表执行（见 main.js runHostHotkey）。
// 只转带 mod / alt 的组合：裸键（方向 / Enter / Tab / 空格 / Delete…）是画布自己的语义，
// 转出去只会误触（比如 Enter 在画布里是「新建同级」，宿主那边可能绑了完全不相干的命令）。
function nmHostForwardable(e) {
  if (!(e.metaKey || e.ctrlKey || e.altKey)) return false; // 裸键 = 画布语义，不转
  const k = nmEventKey(e);
  if (!k) return false; // 只有修饰键没有键名（单纯按住 Cmd）也不转
  // Mod+V 不转：粘贴在画布里走的是原生 paste 事件（焦点在 iframe 里它照样到，不经过 keydown），
  // 转出去反而可能被宿主的「粘贴」命令拿去粘到别的编辑器里，画布里却什么都没发生。
  if (k === 'v' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) return false;
  return true;
}
function nmKeySuffix(act, fallback) { // 提示里的键位段：'（⌘B）'（zh）/ ' (⌘B)'（en）—— 一对括号包住，随改键实时变（2026-09-18 用户定格式）
  const d = nmKeyText(act, fallback);
  if (!d) return '';
  const en = (typeof getLang === 'function') && getLang() === 'en';
  return en ? ' (' + d + ')' : '（' + d + '）';
}
// 不带括号的键位串：右键菜单右侧那一列小字用（2026-09-21 用户定：菜单里不要括号，直接 ⌘C）。
// 注意：**保留它和 nmKeySuffix 共用一份取值逻辑**（都走 nmKeyText），别各写一遍 —— 改键实时变这条不能只生效一半。
function nmKeyPlain(act, fallback) { return nmKeyText(act, fallback); }
function nmKeyText(act, fallback) {
  // 该动作没绑键 → 空串（提示里就不显示键位）；给了 fallback（未注册但画布内写死的键，如剪切/复制）→ 用它兜底
  return (state.canvasHotkeys && state.canvasHotkeys.disp && state.canvasHotkeys.disp[act]) || (fallback ? modStr(fallback) : '');
}
function runCanvasAction(id) { // 画布动作统一入口：键盘（键位表）/ 宿主命令（canvasAction）/ 菜单按钮 三入口共用
  switch (id) {
    case 'bold': nodeMenuAction('bold'); break;
    case 'red': nodeMenuAction('red'); break;
    case 'yellow': nodeMenuAction('yellow'); break;
    case 'now': toggleNowOfSelected(); break;
    case 'minor': toggleDoneOfSelected(); break;
    // 待办命令（2026-09-20 二次定稿）：只剩 ⌘L 一条，语义 = 纯开关（与底部按钮同款）
    // 待办两条命令（2026-09-20 第三轮定稿）：⌘L 普通↔待办开关；⌥⌘L 非完成→完成、已完成→回普通
    case 'todo': todoCycleOfSelected('toggle'); break;
    case 'todoDone': todoCycleOfSelected('alt'); break;
    case 'editNote': editNoteOfSelected(); break;
    case 'showNow': { const b = document.getElementById('btn-now-side'); if (b && !b.disabled) setShowNow(!state.showNow); break; }
    case 'hideMinor': { const b = document.getElementById('btn-hide-done'); if (b && !b.disabled && !b.classList.contains('disabled')) setHideDone(!state.hideDone); break; }
    case 'drill': if (state.selectedId) drillInto(state.selectedId); break;
// 三条「右键菜单同款」命令（2026-09-21）：选中节点 → 复制节点链接 / 复制 AI 定位路径；视图整体 → 保存为捷径
case 'copyNodeLink': { const r = state.selectedId ? findNode(state.tree, state.selectedId) : null; if (r) copyNodeLinkOf(r.node); break; }
case 'copyAILocate': { const r = state.selectedId ? findNode(state.tree, state.selectedId) : null; if (r) copyAILocateOf(r.node); break; }
case 'saveShortcut': { const rt = currentRoot(); if (rt) bookmarkOf(rt); break; }
    case 'locate': { const bl = document.getElementById('btn-locate'); if (bl) bl.click(); break; }
    // 选中导航的四个 case 已删（2026-09-19 用户定：动作回到 keydown 里写死调用，不进注册表、不进键位表；
    // 函数仍保留在下面「方向键导航」小节，要复活就从这里和注册表的 CANVAS_ACTIONS 各加回一行）
    // 原方向键占用的新建动作：放出来给用户自己绑（默认不绑）
    case 'addSiblingAbove': addSiblingAbove(); break;
    case 'addParentSibling': addParentSibling(); break;
    // 编辑 / 居中（2026-09-18 用户定，均不设默认键）
    case 'editStart': canvasEditSelected(false); break;
    case 'editEnd': canvasEditSelected(true); break;
    case 'centerNode': canvasCenterSelected(); break;
    case 'centerRoot': canvasCenterRoot(); break;
  }
}
// —— 方向键导航（2026-09-18 用户定；2026-09-19 起**只由 keydown 写死调用**，不注册成命令）——
// —— 同层级跨树导航（2026-09-18 二次定）——
// ↑↓ 规则升级：本级同级用完 → **跳到下一棵子树的同一层级**（第几层就跳第几层，不回到第一层）；
// ↑ 反向同理。实现 = 按 DFS 先序（视觉自上而下）收集「同一深度」的全部节点，在名单里前后挪 ——
// 同级天然相邻，跨树是名单的自然延续；某棵子树没有这一层就跳过它（best effort）。
function canvasNodeDepth(id) {
  let r = findNode(state.tree, id), n = 0;
  while (r && r.parent) { n++; r = findNode(state.tree, r.parent.id); }
  return n;
}
function canvasSameDepthIds(depth) {
  const out = [];
  (function walk(n, d) {
    if (d === depth) out.push(n.id);
    (n.children || []).forEach((c) => walk(c, d + 1));
  })(state.tree, 0);
  return out;
}
function canvasSelectParent() { // ← 选母节点
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (r && r.parent) selectNode(r.parent.id);
}
function canvasSelectChild() { // → 选第一个子节点（连按 = 一直往深处钻，没有子节点就停）
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (r && r.node.children && r.node.children.length) selectNode(r.node.children[0].id);
}
function canvasSelectNextSibling() { // ↓ 同层级的下一个：同级用完 → 下一棵子树的同一层级；整层到底 → 不动
  if (!state.selectedId) return;
  const list = canvasSameDepthIds(canvasNodeDepth(state.selectedId));
  const at = list.indexOf(state.selectedId);
  if (at >= 0 && at < list.length - 1) selectNode(list[at + 1]);
}
function canvasSelectPrevNode() { // ↑ 同层级的上一个：同级用完 → 上一棵子树的同一层级；整层到顶 → 不动
  if (!state.selectedId) return;
  const list = canvasSameDepthIds(canvasNodeDepth(state.selectedId));
  const at = list.indexOf(state.selectedId);
  if (at > 0) selectNode(list[at - 1]);
}
// —— 居中（2026-09-18 用户定：**一律复用既有的定位系统**，别自造第二套）——
// 落点 = app.css :root「定位调参」区的 --locate-* 旋钮（用户早就调好的自定义居中）：
//   选中/编辑中 → --locate-selected-x + --locate-y；主节点 → --locate-first-x + --locate-y。
// 首版在这里自造了 NM_CENTER_X/Y，用户指出重复造轮子 → 删掉，全部走 locateCenter / placeCardAtViewport。
function canvasCenterSelected() { // **只认选中/编辑中的节点**（2026-09-18 用户定：没选中 → 不动；定位主节点是另一条命令的事，别兜底）
  const activeId = state.selectedId || state.editingTitleId || state.editingNoteId || null;
  if (!activeId) return;
  const el = document.querySelector('.node-row[data-id="' + activeId + '"] .card');
  if (el) placeCardAtViewport(el, cfgNum('--locate-selected-x', 0.5));
}
function canvasCenterRoot() { // 主节点（整张导图的根）回**同一个自定义居中位**（2026-09-18 用户定：与选中节点同一个 --locate-selected-x + --locate-y，不用 --locate-first-x）
  const el = state.tree && document.querySelector('.node-row[data-id="' + state.tree.id + '"] .card');
  if (el) placeCardAtViewport(el, cfgNum('--locate-selected-x', 0.5));
}
// —— 编辑类命令（2026-09-18 用户定：从头 / 从末尾进入编辑，光标落在对应端；不设默认键）——
function canvasEditSelected(atEnd) {
  if (state.historyMode) return;
  const id = state.selectedId;
  if (!id) return;
  const r = findNode(state.tree, id);
  if (!r) return;
  // 已经在编辑这个节点：只挪光标，不重启会话（重启会丢未保存的内容）
  if (state.editingTitleId === id && state.editingTitleEl) {
    const sel = window.getSelection();
    const rg = document.createRange(); rg.selectNodeContents(state.editingTitleEl); rg.collapse(!atEnd);
    sel.removeAllRanges(); sel.addRange(rg);
    return;
  }
  const row = document.querySelector('.node-row[data-id="' + id + '"]');
  const titleEl = row && row.querySelector('.title');
  if (titleEl) startEdit(r.node, titleEl, null, atEnd, !atEnd); // 从头 = caretStart
}
// 编辑态仍然放行的画布动作（2026-09-18）：都是"不碰文字"的操作 —— 从头/从末尾（只挪光标）。
// 居中两条命令已下架（用户定：定位按钮承担），不再放行。
const NM_EDIT_MODE_ACTIONS = ['editStart', 'editEnd'];
// 键位表更新后，把**已建好**的提示 DOM 重写一遍（这些按钮只在装载时建一次，data-tip 冻结在那一刻 —— 实踩：
// 改键后提示不变）。底部工具条 Now/Minor + 「格式」子菜单三项；[data-act=done] 对应 Minor 动作。
function refreshCanvasHotkeyTips() {
  [
    ['bold', T('nm.bold'), 'bold'],
    ['red', T('nm.red'), 'red'],
    ['yellow', T('nm.yellow'), 'yellow'],
    ['now', T('nm.now'), 'now'],
    ['done', T('nm.minor'), 'minor'],
    ['note', T('nm.note'), 'editNote'],
  ].forEach(([selAct, base, hAct]) => {
    document.querySelectorAll('[data-act="' + selAct + '"][data-tip]').forEach((el) => {
      el.setAttribute('data-tip', base + nmKeySuffix(hAct));
    });
  });
}
document.addEventListener('keydown', (e) => {
  const t = e.target;
  // 图片预览开着 → 方向键只管翻图（▼ 必须放在最前面：选中图片后焦点在 armed proxy 的隐藏 input 上，
  // 下面 INPUT 分支会把方向键吞掉；预览是模态层，这时也不该再走选中态 / 打字态的逻辑）。2026-09-19 修老 bug。
  if (isPreviewOpen() && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    if (e.key === 'ArrowLeft') stepPreviewImage(-1);
    else if (e.key === 'ArrowRight') stepPreviewImage(1);
    return;
  }
  // 历史只读：Esc = 退出（回编辑）；其余编辑类快捷键全部吞掉（不改动当前文档）
  if (state.historyMode) {
    // state.tree 此时就是快照树；只放行复制等只读键。
    // ⚠️ 别把这里"简化"成只在写回文件处拦：撤销栈一样会被污染，退出后 Cmd+Z 会把快照内容写进当前文档（见操作手册 §5）。
    if (e.key === 'Escape') { e.preventDefault(); exitHistorySnapshot(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelectedNode(); return; } // 复制节点到剪贴板（允许）
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation(); // 其余编辑键（Delete/Backspace/Tab/方向/Cmd+B/I/H/K 等）一律拦截
    return;
  }
  // 保险（2026-09-20）：还有活跃编辑会话、但按键目标不是编辑框（编辑框被重绘抽走 / 焦点压根没进编辑框）
  // → 本次按键前先把它收尾保存。否则 Enter/Tab 会走画布全局键位（新建节点），而编辑内容永远落不了盘。
  // 正常编辑时 activeElement 就是编辑框，这里不触发；只有焦点真不在编辑框上才兜底。
  if (activeEditFinish && state.editingEl && document.activeElement !== state.editingEl) {
    try { activeEditFinish(); } catch (_) {}
  }
  // 编辑态：只接管 Cmd+B（选区加粗，插 ** 不退出编辑）；其余让位浏览器原生（如 Cmd+Z 撤销文字）（2026-08-22 加）
  if (t && t.contentEditable === 'true') {
    if (menuEditOn) {
      // 子菜单条目编辑中（2026-09-11）：普通键就地消费（条目编辑框自理）；
      // Cmd/Ctrl 组合键落到下方画布快捷键（Cmd+M/N/B… 作用于选中节点 —— 鼠标被菜单占用时的操作手段）
      if (!(e.metaKey || e.ctrlKey)) return;
    } else {
      const hk = nmMatchCanvasHotkey(e);
      if (hk === 'bold') { e.preventDefault(); wrapSelectionInEdit('**'); } // 编辑态：加粗键 = 选区插 **（键位跟表走，2026-09-18）
      else if (hk && NM_EDIT_MODE_ACTIONS.indexOf(hk) >= 0) { e.preventDefault(); runCanvasAction(hk); } // 居中 / 从头从末尾：编辑态放行（2026-09-18 用户定）
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
  const hkAct = nmMatchCanvasHotkey(e); // 键位表命中的动作（迁移过的动作走它；未迁移的写死键在后面分支）
  const hkHost = (!hkAct && state.canvasHotkeys && state.canvasHotkeys.host && state.canvasHotkeys.host[nmEventHotkey(e)]) || null; // 宿主命令的键（如切换源文件/导图视图）
  if (hkAct) { e.preventDefault(); runCanvasAction(hkAct); return; } // 用户在原生页绑的键**永远最先派发**（改键 = 他的意思；写死键只做没绑时的兜底，2026-09-18 实踩：派发太靠后被写死分支截胡 → 命令"没反应"）
  if (hkHost) { e.preventDefault(); vscode.postMessage({ type: 'execCommand', id: hkHost }); return; } // 宿主命令的桥（如「切换源文件 / 导图视图」）
  // ↓ 以下全是**写死键兜底**（未注册成命令、不给自定义的动作）：用户绑定的键已在上面拦截
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); copySelectedNode(); } // 复制节点：写死键（未迁移，Mod+C 与系统复制撞车不给默认）
  else if ((e.metaKey || e.ctrlKey) && e.key === 'x') { e.preventDefault(); cutSelectedNode(); } // 剪切节点：写死键（未迁移）
  // ⌘E（下钻）/ ⌘P（定位循环）的写死键已删（2026-09-18 用户定：这两个命令已注册进官方快捷键页，
  // 写死内容不再保留 —— 要键位去官方页绑一次）。⌘Z/⌘C/⌘X、Tab/Enter 等未注册，写死保留。
  else if (e.key === 'Tab') { e.preventDefault(); addChild(); }
  else if (e.key === 'Enter') { e.preventDefault(); addSibling(); }
  // 方向键 = 选中导航（2026-09-19 用户定：**回到画布内写死**）。原因：注册成命令后它成了全局快捷键，
  // 源文件视图里按方向键会被截走（实踩：光标动不了）→ 写死在这里，键出不了 iframe，也不再进键位表。
  // 顺序在用户绑的键之后：谁给别的表态动作绑了裸方向键，仍以用户为准。
  else if (e.key === 'ArrowUp') { e.preventDefault(); canvasSelectPrevNode(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); canvasSelectNextSibling(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); canvasSelectParent(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); canvasSelectChild(); }
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
  // 兜底：画布不认识的组合键 → 转发给宿主（见 nmHostForwardable）。放在整条链的最后：
  // 只有**前面所有分支都没消费**才轮到它（用户绑的画布键 > 宿主命令桥 > 写死键 > 这里）。
  else if (nmHostForwardable(e)) {
    e.preventDefault();
    vscode.postMessage({ type: 'hostHotkey', key: String(e.key || ''), code: String(e.code || ''), mod: !!(e.metaKey || e.ctrlKey), alt: !!e.altKey, shift: !!e.shiftKey });
  }
});

// ============ 与扩展通信 ============
function emitUpdate() {
  if (state.historyMode) return; // 历史页只读：任何写回当前文档的操作都被禁止
  // 本地内容已变更并要写盘 → 编辑期间被暂存的外部数据（pendingIncoming，见 applyIncoming）必定是**旧**的，
  // 再应用它会把用户刚改的内容整棵冲回去（2026-09-20 实踩：新建导图开屏进编辑，宿主随后补发的第二次 init
  // 被暂存，用户按 Tab 保存后才 flush → 主节点当场退回旧标题「Mind Map 10」）。这里直接作废。
  if (pendingIncoming) pendingIncoming = null;
  const text = serialize(state.tree);
  vscode.postMessage({ type: 'update', text: text });
  autoSnapshot(false, text); // 复用刚算好的文本（别重复序列化整棵树）
}
// 自动快照（2026-08-27）：内容真变了才存，且 AUTO_SNAP_INTERVAL 内最多一次，避免快照爆炸。
// 手动命名存档（manualSaveSnapshot）也走这里并标记，保证"手动存完不会立刻又自动存一份相同内容"。
// 2026-09-14 两处调整：①时间窗判断提到序列化之前——窗口内直接返回，不再白算一遍整棵树；
// ②文本可由 emitUpdate 传入复用。注意 AUTOSNAP 只管"存几个版本"，文件本身每次编辑都已写盘。
const AUTO_SNAP_INTERVAL = 20 * 1000; // ← 版本颗粒度旋钮：20 秒（原 2 分钟）；改小 = 版本更密、占盘更多
let lastAutoSnap = 0;
let lastAutoSnapText = ''; // 上次落盘快照的文本，用于"内容没变就不存"
function autoSnapshot(force, preText) {
  if (state.historyMode) return; // 历史页只读：不自动存快照（避免存下"快照的快照"）
  const now = Date.now();
  if (!force && now - lastAutoSnap < AUTO_SNAP_INTERVAL) return; // 时间窗内 → 不存（最便宜的检查放前面）
  const text = typeof preText === 'string' ? preText : serialize(state.tree);
  if (!force && text === lastAutoSnapText) return; // 内容没变 → 不存
  lastAutoSnap = now;
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
  if (state.editingEl && state.tree) {
    pendingIncoming = { text, opts }; return;
  }
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
    // mode：'view' = 画面按层折叠（左键）｜'min' = ①外部能折尽折 + 选中折到第 N 层（右键①/Cmd）｜'keep' = ②外部不变 + 选中折到第 N 层（右键②/Cmd+Option）
    const table = foldBarRuns[msg.lvl];
    const fn = table && table[msg.mode || 'view'];
    if (fn) fn();
    return;
  }
  if (msg.type === 'requestFoldBar') { // 宿主激活本视图时请求重发最新状态（修「折叠数字有几率不出现」，2026-08-31）
    updateFoldBar();
    return;
  }
  if (msg.type === 'setTheme') { // 设置页切换主题 → 宿主推送到所有打开的视图（即时生效，2026-08-31）
    applyTheme(msg.value); // 类驱动后，深色叠加自动由 .theme-dark × .nm-theme-* 组合表达，无需重放
    return;
  }
  if (msg.type === 'setCenterMode') { // 设置页切换「画布中央」档 → 宿主推送到所有打开的视图（2026-09-16）
    applyCenterMode(msg.value);
    // 切档后立刻按新落点重新定位一次：让用户马上看到位置变化（否则画面不动，会误以为"没生效"）
    try { if (state.tree) locateCenter(); } catch (e) {}
    return;
  }
  if (msg.type === 'setHideHint') { // 设置页切换「隐藏新增页面提示」→ 即时生效（2026-09-01）
    state.hideHint = !!msg.value;
    render();
    return;
  }
  // （setAddPanel 消息已随「添加面板简化」设置机制一起删除：2026-09-21 起面板顺序固定，不再有可下发配置）
  if (msg.type === 'setMorePanel') { // 设置页改「更多面板简化」→ 左下菜单即时收掉 / 放回条目（2026-09-18）
    state.morePanel = (msg.value && typeof msg.value === 'object') ? msg.value : null;
    updateMoreMenu();
    return;
  }
  if (msg.type === 'setMotion') { // 设置页「高级 → 动效」（2026-09-20）：正开着的画布立刻生效
    motionEnabled = !!msg.value;
    if (!motionEnabled && motionFrame) { clearCardMove(); drawEdges(); } // 关的那一刻正在播 → 立刻落地
    return;
  }
  if (msg.type === 'setDark') { // 宿主推来的明暗变化（用户切 Obsidian 深浅色 → 画布实时跟随，2026-09-18）
    applyDarkMode(!!msg.value);
    return;
  }
  if (msg.type === 'setCanvasTheme') { // 设置页「调色板」小窗改完（2026-09-20）：明暗档 + 每档画布底色，推来即生效
    state.canvasBgLight = String(msg.bgLight || '');
    state.canvasBgDark = String(msg.bgDark || '');
    applyDarkMode(!!msg.dark); // 内部会重贴该档底色（applyCanvasBg）
    return;
  }
  if (msg.type === 'setAccent') { // 宿主推来的 Obsidian 主题色（2026-09-20）：链接色跟着它走
    applyAccent(msg.value);
    return;
  }
  if (msg.type === 'setCanvasHotkeys') { // 宿主推来的画布键位表（用户在原生快捷键页改了键 → 触发与提示都跟新表走）
    state.canvasHotkeys = (msg.value && typeof msg.value === 'object') ? msg.value : { match: {}, disp: {} };
    refreshCanvasHotkeyTips(); // 已建好的按钮提示重写（styleMenu / 底部工具条只在装载时建一次，会冻结旧键位）
    updateMoreMenu(); // 撤销 / 重做那两行的快捷键小字当场刷新
    return;
  }
  if (msg.type === 'getSelectedPid') { // 「查看源文件」第一步（2026-09-19）：宿主要「选中节点（没有 → 当前视图根）」的持久 ID
    const hit = state.selectedId ? findNode(state.tree, state.selectedId) : null;
    const node = (hit && hit.node) || currentRoot();
    if (node) {
      if (!node.persistId) { node.persistId = genPersistId(); pushUndo(); } // 懒分配（与右键复制 AI 定位同源）
      emitUpdate(); // 无条件发一次：有 ID 也走写盘队列 → 宿主 await 队列后再切，保证 markdown 里搜得到
    }
    vscodeApi.postMessage({ type: 'selectedPid', pid: node ? (node.persistId || '') : '' });
    return;
  }
  if (msg.type === 'canvasAction') { // 宿主命令（命令面板 / 原生快捷键在画布外触发）→ 画布内同一份实现
    runCanvasAction(msg.action);
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
    // 状态栏按钮 hover：高亮范围由前端按当前选中状态决定（未选中 = 画面绝对层；选中 = 选中节点内相对层），
    //   与修饰键无关（2026-09-13：选中后「不按修饰键」与「按 Cmd」做的都是选中子树内的相对层折叠）
    const fn = foldBarHovers[msg.lvl];
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
  // 导入的媒体已存盘（「更多」菜单选文件 / 多选粘贴）：按扩展名分流进 images / embeds（2026-09-17）
  if (msg.type === 'importMediaRes') {
    const names = msg.names || [];
    if (names.length) addMediaNames(names, msg.nodeId);
    else if (!msg.cancelled) toast(T('more.pickFail'), true); // 用户主动取消选择 → 不报错
    return;
  }
  if (msg.type === 'imgUriRes') {
    // 资源可访问地址返回：填到对应元素上（img/video/audio 通用），并缓存
    document.querySelectorAll('[data-req="' + msg.id + '"]').forEach(im => {
      if (msg.uri) {
        im.src = msg.uri; imgUriCache[im.dataset.path] = msg.uri;
        im.classList.remove('img-missing'); delete im.dataset.missing; im.alt = ''; // 恢复成正常图
      } else if (im.tagName === 'IMG') {
        markImgMissing(im, im.dataset.path); // 图片 → 显示可见的「缺失」占位（音视频保持原样式）
        // 2026-09-17：主动补一次 error —— 缺失图不会设 src，因此永远不会自己触发 load/error，
        // 而开屏的 layoutSettled 正在等「每张图都有结论」。不补这一下就必等满兜底时间（开屏慢两三秒的根因）。
        try { im.dispatchEvent(new Event('error')); } catch (_) {}
      } else {
        im.classList.add('img-missing');
      }
    });
    return;
  }
  if (msg.type === 'licenseUpdate') {
    state.isPro = !!msg.isPro; // 授权状态实时更新（host 的 licenseState 变化后推送；hover/click 实时读它，锁立刻跟变）
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
    applyTreeTransform();
    const saved = (msg.view && typeof msg.view === 'object') ? msg.view : null;
    // 2026-09-13 单坐标系：旧存档带 scrollLeft/Top（滚动+平移双坐标，无法换算）→ 视为无记忆，
    // 按全新打开定位一次；pid/调试开关照旧读（与坐标系无关）。新存档只有 zoom/panX/panY，直接还原。
    const hasSavedView = !!(saved && typeof saved.zoom === 'number' && typeof saved.scrollLeft !== 'number');
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
    // 过滤开关先于建树写入状态：树只建一遍就带上过滤（2026-09-13）
    // 原顺序是建完树后再各设置一次 → 等于同一棵树白建两遍，大文件每遍代价可观
    if (typeof msg.hideDone === 'boolean') setHideDone(msg.hideDone, false, true);
    if (typeof msg.showNow === 'boolean' && !msg.showNow) setShowNow(false, false, true);
    applyIncoming(msg.text, { filename: msg.filename || '', filePath: msg.filePath || '', drillPid: drillPid, isLink: !!msg.isLink, defaultPid: msg.defaultPid || '' }); // filePath：init 必须透传，否则 state.filePath 空 → 复制 AI 定位路径只剩文件名（2026-09-01 修）
    applyTheme(msg.theme || 'default'); // 主题随 init 下发（2026-08-31）
    // 画布底色两档随 init 下发（2026-09-20）：必须先写进 state，再 applyDarkMode —— 它内部会按当前档贴底色。
    // msg.dark 已是「宿主算好的结论」（跟随档 = Obsidian 明暗；强制档 = 用户选的那档），前端不重复判断。
    if (msg.canvasBg && typeof msg.canvasBg === 'object') {
      state.canvasBgLight = String(msg.canvasBg.light || '');
      state.canvasBgDark = String(msg.canvasBg.dark || '');
    }
    applyDarkMode(!!msg.dark); // 深色模式随 init 下发（2026-09-18 跟随 Obsidian；2026-09-20 起可在设置页小窗里强制浅/深）
    applyAccent(msg.accent); // Obsidian 主题色随 init 下发（2026-09-20）：链接色默认跟着它，读不到就留空走 CSS 兜底
    applyCenterMode(msg.centerMode || 'canvas'); // 画布中央档随 init 下发（2026-09-16）
    state.hideHint = !!msg.hideHint; // 空图新手提示是否隐藏随 init 下发（2026-09-01）
    if (typeof msg.motion === 'boolean') motionEnabled = msg.motion; // 动效开关随 init 下发（设置页「高级 → 动效」，2026-09-20）
    state.morePanel = (msg.morePanel && typeof msg.morePanel === 'object') ? msg.morePanel : null; // 左下「更多」菜单的条目显隐随 init 下发（2026-09-18）
    state.canvasHotkeys = (msg.canvasHotkeys && typeof msg.canvasHotkeys === 'object') ? msg.canvasHotkeys : { match: {}, disp: {} }; // 画布键位表随 init 下发（2026-09-18）
    refreshCanvasHotkeyTips(); // 底部工具条按钮在装载期就建好了（那时键位表还没到）→ 提示补上键位段
    updateMoreMenu(); // 名单随 init 到 → 当场按它收 / 放（2026-09-18）
    invalidateAddMenus(); // 面板内容跟着新配置走，下次悬浮重建
    state.isLink = !!msg.isLink;
    state.isPro = !!msg.isPro; // 是否 Pro（2026-09-04：= licenseState.active，功能权限；试用期内也为 true → 功能不锁）
    state.licenseSource = msg.licenseSource || 'none'; // 'license'=已授权；'trial'/'none'=未授权 → 右上角"激活 Pro"提示按钮显示条件
    state.trialRemainingMs = (typeof msg.trialRemainingMs === 'number' && msg.trialRemainingMs > 0) ? msg.trialRemainingMs : 0; // 试用剩余毫秒：算「还剩 N 天」提示行
    updateProCta();
    state.defaultPid = normPid(msg.defaultPid); // 保存的默认路径 pid（.mmlink=文件内 mmlinkPid / 普通思维导图笔记=workspaceState）
    // 「隐藏完成」与「只看 Now」的关闭态已在上方建树前预置（persist=false 不回写，避免 init 时
    // 和扩展互相 ping-pong）；这里只剩「只看 Now」开启态——它需要建树后算可见快照（2026-09-13）
    if (typeof msg.showNow === 'boolean' && msg.showNow) setShowNow(true, false);
    // 开屏兜底：恢复成「开」但文档根本无 Now 节点 → 自动退出，避免画面塌缩成只剩 root
    // （与删除触同源；autoExit 用 persist=true 会顺手清掉 workspaceState 里坏掉的 showNow:true）
    autoExitShowNowWhenEmpty(); updateNowSideBtn();
    // 恢复 / 默认 视图：单坐标系下 render 前直接还原即可（无滚动范围依赖，不会被 clamp）
    if (hasSavedView) {
      zoom = saved.zoom; panX = saved.panX || 0; panY = saved.panY || 0;
      applyTreeTransform();
    }
    // 等布局（图片/字体异步加载）真正稳定再定位/揭幕，否则 reflow 让定位结果漂移
    // 2026-08-30 揭幕：render 前 opacity:0，等"首帧布局稳定"再显示（见 startInitCenter 的 onSettled）
    // 新建导图开屏进主节点编辑（宿主只在新建那一次下发 editRoot 凭证）：
    // ①必须等揭幕（opacity 恢复）之后再进——揭幕前 viewMap 还是 opacity:0，此时程序化聚焦/设选区不可靠；
    // ②先把系统焦点拉进本 iframe：只调 el.focus() 是在 iframe 文档内设 activeElement，
    //   系统键盘焦点若还留在 Obsidian 主界面，用户敲的字根本进不到编辑框（表现为「内容没存、文件里也没有」）。
    let rootEditPending = !!msg.editRoot;
    const enterRootEdit = () => {
      const rt = currentRoot();
      if (!(rt && rt.id && state.view === 'map' && !state.historyMode)) return;
      // 同时置为选中态（不只是编辑态）：编辑中按 Tab 建子节点走 addChild，它只认 selectedId；
      // 光进编辑不选中，Tab 会静默 return，看着就是「按了没反应」。
      state.selectedId = rt.id;
      try { window.focus(); } catch (_) {} // 系统焦点拉进 iframe（上面②）
      render(); updateToolbar();
      startEditById(rt.id); // 不带落点参数 → startEdit 走默认「全选」，敲第一个字即顶掉「未命名」
    };
    const reveal = () => {
      viewMap.style.opacity = '';
      if (rootEditPending) { rootEditPending = false; enterRootEdit(); }
    };
    layoutSettled(() => {
      try {
        if (hasSavedView) {
          drawEdges(); // 位置已还原，布局稳定后只需重画曲线
        } else {
          // 2026-08-29：开屏智能定位（定位按钮同款），不再整画布居中（大树会飘走）；
          // 带下钻（捷径/默认路径）时 goTo 已定位过一次，这里同款定位幂等不冲突
          locateCenter();
        }
        startInitCenter(reveal);
        seedPathHistory(state.currentRootPid); // 路径历史栈起点
        updateDefaultPathBtn();
        updateUndoRedo();
        booted = true; // 还原完成，之后用户操作才写回
        reportHistState(); // 画布就绪：主动上报一次「我在编辑态」，把面板的 currentTs 清掉（见 reportHistState 注释）
        // 注：新建导图的「开屏进主节点编辑」不在这里做——它挂在 reveal（揭幕）之后，见上方 enterRootEdit
      } catch (e) {
        rootEditPending = false; // 还原已出错：此时定位/焦点都不可靠，不再进编辑（画面揭幕照旧）
        reveal(); // 出错也必须显示，绝不 opacity:0 白屏（位置不准总比白屏好）
        booted = true; // 2026-09-01 修「切走再回永远回中央」：还原抛异常时 booted 若卡死在 false，
        // persistNow/schedulePersist 整个会话静默不写 → 视图状态从不保存 → 下次打开永远走无记忆居中
        reportHistState();
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
    // 自动/手动保存快照成功：静默即可（面板列表的刷新由宿主负责）
    return;
  }
  // ---- 历史只读态（2026-09-14 起由宿主侧 Obsidian 原生「历史记录」面板驱动）----
  // 宿主在面板里点某条 → histEnterSnapshot（连正文一起下发）→ 画布切进只读快照；
  // 面板的按钮态与高亮由画布回报（histState）——画布是"现在在看哪条"的唯一真相源。
  if (msg.type === 'histEnterSnapshot') {
    enterHistorySnapshot(msg.timestamp, msg.text, msg.name);
    return;
  }
  if (msg.type === 'histExit') {
    exitHistorySnapshot();
    return;
  }
  if (msg.type === 'snapshotRestored') {
    // 宿主已写回文件并回带新文本：用 applyIncoming 重建当前文档树（防回环，不写回）
    // ⚠️ 整段包 try/catch + 兜底再退一次（2026-09-19）：这里抛异常的话，画布会**卡在历史只读态**，
    //    用户看到的和"点了没反应"一模一样（而宿主那边其实已经还原成功）—— 收尾再错也必须把只读态放掉。
    try {
      if (msg.text) applyIncoming(msg.text);
      state.liveTree = state.tree; // 还原后「实时文档」即新内容，退出时据此还原而非旧的 liveTree
      // 还原已经把「还原后的内容」存成了一条新快照 → 刷新节流基准，免得下一次编辑立刻又自动存一份一模一样的
      lastAutoSnapText = serialize(state.tree);
      lastAutoSnap = Date.now();
      exitHistorySnapshot();
      toast(T('toast.restored'));
    } catch (e) {
      try { exitHistorySnapshot(); } catch (_) {}
      toast(T('toast.restoreFinishFail'), true);
      wlog('snapshotRestored 收尾异常: ' + (e && e.message ? e.message : e));
    }
    return;
  }
});
// ============ 历史只读快照（2026-08-27 起；2026-09-14 改由宿主原生面板驱动）============
// 机制：
//  - 快照列表与操作（返回/只看差异/还原/创建副本/重命名/删除）都在宿主侧的原生「历史记录」面板里
//    （Obsidian 右侧栏视图，见 main.js 的 HistoryPanelView）；本文件只负责「把某条快照画出来」。
//  - 宿主点某条 → histEnterSnapshot（带正文）→ 这里切进只读快照（state.tree 指向快照树）；
//    面板点「返回编辑」/ 画布按 Esc / 关掉面板 → histExit → 还原实时文档树。
//  - 只读期间不能编辑文字，但可以展开/折叠、复制单个节点。
//  - 「只看差异」：按「位置+标题结构」比对当前文档与该快照，不同的节点标红，相同且非差异祖先的子树折叠压缩。
//  - 差异比对只用位置+标题结构，不用 persistId（绝大多数节点平时无 id，见 commentFor）。

// 节点特征（用于内容比对）：标题 + 链接 + 图片【文件名列表】+ 嵌入 + 备注 + bold/minor/now/color。
// 2026-09-15 补全：原来只比 4 项（标题/链接/图片张数/备注），改颜色、切 Minor/Now、加粗、
// 换一张图（张数没变）这些真实变化全都测不出来。⚠️ fold 绝不能加 —— 折叠是视图状态，
// 历史界面渲染时本来就会重设 fold（applyDiffOnlyFold），加了会把所有节点都标成"有差异"。
function nodeSig(n) {
  return JSON.stringify({
    t: n.title || '',
    l: n.link || '',
    i: (n.images || []).join('|'),   // 比文件名列表：换一张图（张数不变）也算差异
    e: (n.embeds || []).join('|'),
    n: n.note || '',
    b: !!n.bold,
    m: !!n.minor,
    w: !!n.now,
    c: n.color || ''
  });
}
// 计算差异（2026-09-15 重写：层内按标题配对，不再按下标）。返回 Set（历史节点 id）。
//   旧逻辑两树按"第 i 个孩子对第 i 个孩子"比 —— 中间插入/删除一个，后面整排错位、级联误标（"加一行红一片"）。
//   新逻辑每一层【按标题认人】（同名按出现顺序一一配，重排不误报）：
//     配上 + 指纹相同 → 不标，进孩子继续配
//     配上 + 指纹不同 → 只标它自己（改备注/颜色/图片只黄一个，不连坐子树），进孩子继续配
//     历史版配不上的  → 父标黄，**孩子逐层在当前版全局找同名**（挪走的能认回来，不连坐，见 orphanSubtreeIds）
//     当前版多出的    → 不标（历史树上没有可标的地方；节点数差由横幅常驻说明报）
//   ⚠️ 配对键只用【标题】（身份），配对之后才比完整指纹（内容）—— 两把尺子不能混用：
//      按完整指纹配对的话，改一个备注就配不上 → 会被当成"删了旧的"而连坐整棵子树。
//   ⚠️ 不用 persistId（绝大多数节点没有，作者注释也明确不用）。普通节点改名靠"孩子标题序列"
//      二次配对兜底；孩子也变了/被挪走 → 走孤儿逐层全局匹配（orphanSubtreeIds），能认回多少认多少。
//   ⚠️ 单层兄弟超过 DIFF_PAIR_MAX 时退回按下标比；总节点数超过 DIFF_NODES_MAX 时**整个退回**
//      （总量保险丝，2026-09-15 实测 20 万节点+大量改名会到秒级 → 超大文件宁可糙不卡）。
const DIFF_PAIR_MAX = 500;      // 层内精确配对的单层上限
const DIFF_NODES_MAX = 30000;   // 总节点数上限：超过 → 整个退回按下标的老算法
let diffMax = DIFF_PAIR_MAX;    // 本轮实际生效的上限（computeHistoryDiff 每次按总量重设）
let diffUsedCur = null;  // 当前版节点占用表：正常配对 / 二次配对 / 孤儿认领 都会占用，防止一个当前节点被认领两次
let diffCurIndex = null; // 当前版 标题 → 节点数组 的索引（孤儿全局搜索用；每次 computeHistoryDiff 重建）
function computeHistoryDiff() {
  const diff = new Set();
  if (!state.historyTree) return diff;
  const cur = state.liveTree; // 当前文档根（进入历史页时暂存，state.tree 此时已指向快照树）
  const his = state.historyTree; // 快照根
  if (!cur) { markSubtreeIds(his, diff); state.historyDiffIds = diff; return diff; } // 没有基线（异常窗口）→ 全标
  // 建占用表 + 当前版标题索引（孤儿全局搜索用），顺便数总节点数
  diffUsedCur = new Set();
  diffCurIndex = new Map();
  let total = 0;
  (function idx(n) {
    if (!n) return;
    total++;
    const t = n.title || '';
    let a = diffCurIndex.get(t);
    if (!a) { a = []; diffCurIndex.set(t, a); }
    a.push(n);
    (n.children || []).forEach(idx);
  })(cur);
  diffMax = total > DIFF_NODES_MAX ? 0 : DIFF_PAIR_MAX; // 总量保险丝：超大文件整个走按下标的老路径
  diffUsedCur.add(cur.id);
  // 根自身也要比（根的标题/备注等可能变；根只有一对，不存在配对问题）
  if (nodeSig(cur) !== nodeSig(his)) diff.add(his.id);
  walkDiffChildren(cur, his, diff);
  state.historyDiffIds = diff;
  return diff;
}
// 把一棵子树整棵记为差异（仅剩"无基线全标"这一处使用）
function markSubtreeIds(root, diff) {
  (function w(n) { if (!n) return; diff.add(n.id); (n.children || []).forEach(w); })(root);
}
// 「孤儿」子树（2026-09-15 用户提议）：历史父节点配不上（被改名/上下文没了）时，**不再整棵一刀切标黄**——
// 父自己标黄（它在这个上下文确实没了），孩子逐个在当前版【全局】找未占用的同名节点：
//   找到 → 认定"它还活着（被挪走了/挂在别处）"：比指纹（不同才标它自己），并以它为锚继续正常配孩子层；
//   全局都没有 → 标黄它自己，再往下递归搜孩子的孩子（无限层，直到再也找不到为止）。
// 典型场景：把一个子树挪到别的父节点下、再把原父节点改名 —— 孩子们在当前版都还活着，不该全黄。
function orphanSubtreeIds(h, diff) {
  // h 自己也先全局认领一把：它可能整个被挪到当前版的别处了（标题没变）→ 不标，以它为锚继续配孩子
  const self = findFreeCurByName(h.title);
  if (self) {
    diffUsedCur.add(self.id);
    if (nodeSig(self) !== nodeSig(h)) diff.add(h.id); // 挪走了但内容也变了 → 还是标它自己
    walkDiffChildren(self, h, diff);
    return;
  }
  diff.add(h.id); // 全局都没有 → 真没了，标黄
  for (const k of h.children || []) {
    const c = findFreeCurByName(k.title);
    if (!c) { orphanSubtreeIds(k, diff); continue; } // 全局都没有 → 标黄孩子，继续往下搜
    diffUsedCur.add(c.id); // 占用：这个当前节点归这个孤儿了
    if (nodeSig(c) !== nodeSig(k)) diff.add(k.id); // 找到了但内容也变了 → 标黄孩子自己
    walkDiffChildren(c, k, diff); // 以找到的节点为锚，孩子层继续正常配
  }
}
// 在当前版（liveTree）全局找【未占用】的同名节点（走预建索引，均摊 O(1)；已占用的懒清理）
function findFreeCurByName(title) {
  const arr = diffCurIndex && diffCurIndex.get(title);
  if (!arr) return null;
  while (arr.length && diffUsedCur.has(arr[0].id)) arr.shift();
  return arr.length ? arr[0] : null;
}
// 比较两个已配对节点的孩子层。上限读模块级 diffMax（computeHistoryDiff 按总节点数重设：
// 总节点数超 DIFF_NODES_MAX 时为 0 → 所有层都走按下标的老路径，总量保险丝保证永不卡）。
function walkDiffChildren(c, h, diff) {
  const cKids = c.children || [], hKids = h.children || [];
  if (hKids.length > diffMax || cKids.length > diffMax) {
    // 极端大层：退回按下标（老逻辑），保证不卡
    hKids.forEach((hc, i) => {
      const cc = cKids[i];
      if (!cc) { orphanSubtreeIds(hc, diff); return; }
      if (nodeSig(cc) !== nodeSig(hc)) diff.add(hc.id);
      diffUsedCur.add(cc.id);
      walkDiffChildren(cc, hc, diff);
    });
    return;
  }
  const used = new Array(cKids.length).fill(false);
  for (const hKid of hKids) {
    // 第一轮：按标题在当前版这一层找还没被占用的同名节点（同名按出现顺序一一配）
    let cKid = null;
    for (let i = 0; i < cKids.length; i++) {
      if (!used[i] && (cKids[i].title || '') === (hKid.title || '')) { cKid = cKids[i]; used[i] = true; break; }
    }
    // 第二轮（2026-09-15 用户提议）：配不上同名时，在当前层未占用的节点里找【孩子标题序列完全一样】的
    // —— 有就认定"还是它，只是改了名/改了内容"：只标它自己，孩子进正常配对，**不再连坐整棵子树**。
    // 只对【有孩子】的历史节点做：叶子配不上时 markSubtree 本来就只标它自己，无差别；
    // 且空孩子不参与，避免一堆无孩子的节点互相误配。
    if (!cKid && (hKid.children || []).length) {
      const hKidSeq = (hKid.children || []).map(k => k.title || '').join('\u0001');
      for (let i = 0; i < cKids.length; i++) {
        if (used[i]) continue;
        const seq = (cKids[i].children || []).map(k => k.title || '').join('\u0001');
        if (seq === hKidSeq) { cKid = cKids[i]; used[i] = true; diffUsedCur.add(cKid.id); break; }
      }
    }
    if (!cKid) { orphanSubtreeIds(hKid, diff); continue; } // 两轮都配不上 → 孤儿处理：父标黄、孩子逐层全局认领
    if (nodeSig(cKid) !== nodeSig(hKid)) diff.add(hKid.id); // 同一个节点但内容变了 → 只标它自己
    diffUsedCur.add(cKid.id); // 占用：这个当前节点归这个历史节点了（孤儿全局搜索不会再认领它）
    walkDiffChildren(cKid, hKid, diff); // 孩子层继续按标题配
  }
  // 当前版多出的（used=false）→ 不标：历史树上没有这个节点
}

// 历史界面里「只看 Now」+「只看差异」的【合成折叠】（2026-09-14 用户定：两者会抢同一个 fold 标记）
// 顺序固定：① 先按差异折整棵树（applyDiffOnlyFold，由调用方先做）→ ② 再按 Now 开道：
//   · 展开通往 Now 的整条祖先链 —— 跟编辑态点 Now 一样，保证 Now 前面那条路一定看得见；
//   · Now 自身【不硬折】：把 Now 这一整棵子树交给差异规则重折 ——
//     子树里没差异 → 规则②同样会把 Now 折起（= Now 的最小态，跟以前一样）；
//     子树里有差异 → 展开到差异节点为止（就是用户要的"Now 之后按差异来开"）。
// Now 前面的路径上若有差异，标黄由渲染层自动做（applyHistoryDiffClasses），这里不用管。
// ⚠️ 两处都必须调（进/换快照、以及历史界面里点「只看 Now」），否则换快照后 Now 会被差异折叠折进卡里。
// （放在 applyDiffOnlyFold 之前，是为让"合成规则"紧挨差异算法好读；函数声明提升，调用没问题。）
function applyNowThenDiffFold(root) {
  if (!state.showNow || !root) return;
  collectNowNodes(root).forEach(now => {
    const path = pathTo(root, now.id); // 祖先链（含 Now 自身）
    if (path) for (let i = 0; i < path.length - 1; i++) path[i].fold = false; // 只展开祖先，自身交给下面
    applyDiffOnlyFold(now);            // Now 自身 + 子树按差异定（重折，不硬折）
  });
}

// 历史页渲染：复用编辑视图 render()（保留连线/缩放/滚动/卡片样式），不另写一棵树。
// 「只看差异」的折叠（2026-09-14 用户定版）：三条规则、**没有任何例外**。对每个节点 n 从上往下判：
//   ① 这一枝【每一层都是差异】→ 保留两层：n 展开、它的孩子都露出来、孩子各自折起来。
//      作用一：给人"里面还有、可能还会变"的暗示；作用二：大文件里"一整段都变了"不至于把整段全展开、画面爆大。
//   ② n 的孩子里【没有差异了】（或没有孩子）→ **折 n 自己**：画面只剩这一张卡，点开还能看。
//      ⚠️ 折的是"母节点自己"，不是折孩子 —— 折孩子会变成"母节点 + 一堆孩子卡"，那正是用户报的现象（2026-09-14）。
//   ③ 其他（这枝有差异、但没到"每层都变"）→ n 展开，对孩子重复上面三条。
// **没有例外**：根照同一条规则走（孩子没变就折根；整枝都变就留两层）。
// 一处差异都没有时 = 根走第②条被折起来 → 画面只剩主节点一张卡（不是空白：折叠只收孩子，卡片本身始终会渲染）。
function applyDiffOnlyFold(root) {
  (function reset(n) { n.fold = false; (n.children || []).forEach(reset); })(root); // 先一律展开：不看这一版文件里原本的折法
  // 子树统计（一次后序遍历）：total = 子树节点数；d = 其中被标差异的数量
  (function stat(n) {
    let t = 1, d = state.historyDiffIds.has(n.id) ? 1 : 0;
    (n.children || []).forEach(c => { const s = stat(c); t += s.t; d += s.d; });
    n.__diffStat = { t, d };
    return n.__diffStat;
  })(root);
  // 规则①的判定（2026-09-15 放宽，用户实测定）：原来是"子树 100% 每层都是差异"才触发，
  // 太苛刻 —— 实测一份"整份文档都被换成新内容"的旧版本（89% 节点是差异，134 个碰巧配上/认领的
  // 把 100% 破坏了），规则①不触发 → 走③大面积展开 → 画面爆掉。
  // 改为占比阈值：子树差异占比 ≥ 85% 就视为"整枝都变了" → 保留两层。想调松紧改这个值。
  const DENSE_RATIO = 0.85;
  (function walk(n, isRoot) {
    const kids = n.children || [];
    const st = n.__diffStat;
    // ⚠️ 规则①的完整触发条件 = 【n 自己也是差异】+ 子树差异占比 ≥ 阈值 + 【n 不是主节点】。
    // - "n 自己也是差异"是用户原话里本来就有的（"母节点和它的子节点全部变了"——母节点当然也得是变的），
    //   2026-09-15 放宽成占比时被我手滑丢了 → 没变的节点（如第一层）也触发"留两层"、把真正的差异层折进去藏住。
    // - ⚠️ "主节点不触发①"（2026-09-15 用户实踩第四轮）：主节点的密度是【所有分支混在一起】算的——
    //   "新测试"枝 100% 变了把整体密度抬到 88%，于是"基础测试"枝（83 个节点只变 3 个 = 4%，稀疏差异）
    //   也被整个折掉、里面的零星差异（新节点的 Minor 变化）全被藏住。→ 主节点只要有差异就展开（③），
    //   "留两层"从它的下一层开始、每条分支按自己的密度定。主节点只在"下面完全没差异"时走②（= 只显示主节点）。
    if (!isRoot && kids.length && state.historyDiffIds.has(n.id) && st.d / st.t >= DENSE_RATIO) { // ① 整枝几乎都变了 → 留两层（n 展开，孩子露出来但折起来）
      n.fold = false;
      // ⚠️ 2026-09-15 用户实踩：折孩子不能一刀切。孩子分两种：
      //   - 孩子自己也是差异 → 折起来（它就是"露出的下一层折卡"）；
      //   - 孩子自己【没变】、但它的子树里有差异（如"新测试"：自己与当前版同名同内容，下面 100% 变了）
      //     → 绝不能折！折了 = 把整个差异区域藏起来（用户报"新测试后面全部关起来了"）。
      //     → 继续 walk(c)（规则③会展开它，走到差异节点处由那些节点自己的①接手压缩）。
      //   孩子自己没变、子树也没差异 → walk(c) 里规则②自然折掉它。
      kids.forEach(c => { walk(c, false); if (state.historyDiffIds.has(c.id)) c.fold = true; });
      return;
    }
    if (!kids.length || !kids.some(c => c.__diffStat.d > 0)) { // ② 下面没差异了（含叶子）→ 折自己
      n.fold = true;
      return;
    }
    n.fold = false;                   // ③ 下面还有差异 → 展开，继续往下判
    kids.forEach(c => walk(c, false));
  })(root, true);
  (function clean(n) { delete n.__diffStat; (n.children || []).forEach(clean); })(root); // 别把临时统计留在树上
}

// 主节点自己哪儿变了（只给"画面只剩主节点"时那条 toast 用）：逐项比 nodeSig 的那四项
function rootChangedAspects() {
  const h = state.historyTree, c = state.liveTree;
  if (!h || !c) return [];
  const out = [];
  if ((h.title || '') !== (c.title || '')) out.push(T('hist.aspectTitle'));
  if ((h.note || '') !== (c.note || '')) out.push(T('hist.aspectNote'));
  if ((h.link || '') !== (c.link || '')) out.push(T('hist.aspectLink'));
  if ((h.images || []).length !== (c.images || []).length) out.push(T('hist.aspectImage'));
  return out;
}

// 整棵树有多少个节点（不含传入的根自身）。只为"这一版和当前差几个节点"那句 toast 用。
// 不复用 countDescendants：那个会受沙盒里的「隐藏 Minor」影响（用户可能在沙盒里开过），这里要的是真实数量。
function countDescendantsAll(n) {
  let c = 0;
  (n.children || []).forEach(k => { c += 1 + countDescendantsAll(k); });
  return c;
}

// 历史页渲染：复用编辑视图 render()（保留连线/缩放/滚动/卡片样式），不另写一棵树。
// recenter 只在【首次进入历史界面】时传 true —— 把当前主节点摆到「自定义中央位置」，给一个稳定的初始视角。
// 之后换快照 / 折叠触发的重绘一律不传 → 视口原地不动（用户调过的缩放与位置就是"这次进历史的视角"）。
function renderHistoryTree(recenter, withMotion) {
  if (!state.historyTree) return;
  // 历史页模型：state.tree 此时已指向快照树（进入时一次性交换，关闭时还原）。
  // 这里直接 render，不再临时交换——折叠/框选/复制等交互都复用实时视图同一套逻辑。
  state.selectedId = null;               // 历史页无选中高亮
  state.multiSelected = new Set();
  // withMotion：折叠/展开这类交互要平滑让位（2026-09-20 放开历史态动效）；首次进入/切快照仍用普通 render。
  if (withMotion) renderWithMotion(); else render(); // 完全复用：连线、缩放、平移、卡片样式；差异标记由 render 末尾统一补
  // 首次进入归位：定位复用现成机制 placeCardAtViewport + 调参区的 --locate-first-x / --locate-y
  // （就是"把根放在画面这个位置"）。顺带根治"进去一片空白"：不归位时主节点可能正好在屏幕外。
  // ⚠️ 归位内部读 --locate-reset-zoom（默认开）会把 zoom 打回 1 —— 所以只能首次做，否则切快照会清掉用户的缩放。
  // （原 firstDiffNode / centerHistoryOnFirstDiff「居中到第一个差异节点」已按用户意见删除。）
  if (recenter) {
    const root = state.historyTree;
    const el = root && document.querySelector('.node-row[data-id="' + root.id + '"] .card');
    if (el) placeCardAtViewport(el, cfgNum('--locate-first-x', 0.4));
  }
}

// 给差异节点卡片贴 hist-diff 类（render 会重建 DOM，必须在 render 之后贴）。
// 由 render 末尾（历史态时）与 renderHistoryTree 共用 —— 见 render 里的调用说明。
function applyHistoryDiffClasses() {
  if (!state.historyDiffIds.size) return;
  document.querySelectorAll('#tree .card').forEach(c => {
    if (state.historyDiffIds.has(c.dataset.id)) c.classList.add('hist-diff');
  });
}

// ===== 沙盒（2026-09-14 用户定，**最高原则**）=====
// 进历史界面 = 进一个隔离的沙盘：进去时把「白板状态」整组存下来、把显示类开关重置为默认（未按下），
// 你在里面随便下钻 / 折叠 / 开关 / 缩放平移，退出时整组还原 —— **带不出去**。
// 前面的「守卫」和「退出丢弃」都只是实现手段，沙盒才是模型；判断新需求时先问"它在沙盒里的语义是什么"。
//   · 清单见 sandboxSave：**以后新增任何"会被沙盒改动"的状态，必须同时加进这两张清单，否则会漏**
//   · 「不落盘」靠三处挡住：persistNow / schedulePersist 的定时器 / setHideDone·setShowNow 的持久化消息
let sandboxSaved = null;

function sandboxSave() {
  sandboxSaved = {
    hideDone: state.hideDone,                 // 隐藏 Minor
    showNow: state.showNow,                   // 只看当前关注
    nowVisibleSnapshot: nowVisibleSnapshot,
    currentRootId: state.currentRootId,       // 当前停在哪个节点（下钻）
    currentRootPid: state.currentRootPid,
    pathHistory: state.pathHistory.slice(),   // 下钻路径栈（上一/下一）
    pathHistoryIndex: state.pathHistoryIndex,
    nowLocateIndex: state.nowLocateIndex,
    zoom: zoom, panX: panX, panY: panY,       // 视口：沙盒里缩放/平移也带不出去
    // 撤销/重做栈：拆掉「万一漏了守卫 → 快照树被压进撤销栈 → 退出后某次 Cmd+Z 把历史版本写进当前文档」
    // 这条延迟引爆炸弹。⚠️ 存副本而不是"记个深度数字"：栈满 100 时 pushUndo 会 shift()，长度不变而脏条目仍在栈顶。
    undo: undoStack.slice(),
    redo: redoStack.slice(),
  };
}
function sandboxRestore() {
  const s = sandboxSaved;
  sandboxSaved = null;
  if (!s) return;
  state.currentRootId = s.currentRootId;
  state.currentRootPid = s.currentRootPid;
  state.pathHistory = s.pathHistory;
  state.pathHistoryIndex = s.pathHistoryIndex;
  state.nowLocateIndex = s.nowLocateIndex;
  zoom = s.zoom; panX = s.panX; panY = s.panY;
  undoStack.length = 0; for (const x of s.undo) undoStack.push(x);
  redoStack.length = 0; for (const x of s.redo) redoStack.push(x);
  // 两个显示类开关走各自的 setter（persist=false 不落盘 / skipRender=true 不各自重绘）→ 图标与按钮态一并回来
  setHideDone(s.hideDone, false, true);
  setShowNow(s.showNow, false, true);
  applyTreeTransform(); // 视口回原位（与 init 恢复同一套做法）
}

// 进入历史只读态（宿主「历史记录」面板里点了某条快照）：state.tree 一次性指向快照树，退出时还原 liveTree。
// 2026-08-28 修（切快照 → 退出后当前文档被覆盖成某条历史版本）：liveTree 只在「首次进入」暂存一次，
// 换快照绝不动它 —— 否则第二次进入时 state.tree 已是上一条快照树，实时树被覆盖丢失，退出后一次编辑写回
// 就把整个文件写成那条历史版本。判断用 liveTree 是否为空（退出时置回 null），不能用 historyMode
// ——进入时两者都是 true，用它判断会让 liveTree 永不暂存 → 差异基线为 null → 所有节点全标红。
function enterHistorySnapshot(timestamp, text, name) {
  if (!state.tree) return; // 数据还没到位（未就绪窗口）→ 不渲染，别拿空树去 buildRow
  // 是不是【首次进入历史界面】（面板里换快照也会走到这里，那时 liveTree 已在 → 不算首次）。
  // 用途：① 沙盒只在首次存白板 / 装初值；② 只在首次把主节点归位到「自定义中央位置」。
  // ② 的由来（2026-09-14 用户定）：进历史后用户会缩放 / 平移，再点别的历史记录时应当【保持他调好的视角】，
  //   而不是每条都重新归位。原实现无条件归位，而 placeCardAtViewport 在 --locate-reset-zoom 打开时
  //   会把 zoom 打回 1 → 表现就是"切一条，我调的缩放和位置全没了"。
  const firstEnter = !state.liveTree;
  if (firstEnter) {
    // 【只在首次进入时】暂存白板 + 装沙盒初始值。沙盒内换快照会再次进这里，那时不能重来
    //（重来会把"沙盒当前态"当成白板存下去，退出就还原成错的）。
    state.liveTree = state.tree; // 暂存真实文档树（差异基线 + 退出时还原）
    sandboxSave();
    // 沙盒初始 = 一律「未按下」、从根看起（用户 2026-09-14 定）：进来看到的是这一版本来的样子
    state.hideDone = false;
    state.showNow = false;
    nowVisibleSnapshot = null;
    state.currentRootId = null;
    state.currentRootPid = '';
    state.pathHistory = ['']; state.pathHistoryIndex = 0;
    state.nowLocateIndex = 0;
    setHideDone(false, false, true); // 同步按钮图标/提示（不落盘、不各自重绘）
    setShowNow(false, false, true);
  }
  state.historyMode = true;
  state.historyText = text || '';
  state.historyCurrentTs = timestamp || 0;
  state.historyName = name || ''; // 「还原到 · <名字>」用；没名字宿主会退回绝对时间
  const res = parse(state.historyText);
  state.historyTree = res.root;
  state.tree = state.historyTree; // 只读期间 state.tree 即快照树：render/折叠/框选/复制都复用同一套逻辑
  state.selectedId = null;
  state.multiSelected = new Set();
  // 画布可能停在 Markdown 文本视图：快照只在导图画布上渲染，先切回来
  const vm = document.getElementById('view-map');
  const md = document.getElementById('view-md');
  if (vm) vm.classList.remove('hidden');
  if (md) md.classList.add('hidden');
  state.view = 'map';
  computeHistoryDiff();  // 差异基线用 liveTree
  // 进快照 = 自动「只看差异」（2026-09-14 用户定；原来那个按钮已删）：
  //   ① 一律【忽略这一版文件里原本的 fold 标记】—— applyDiffOnlyFold 内部会先全部展开、再按差异重折；
  //   ② 只留差异节点 + 通往它们的路径，整枝没差异的直接折起来。之后用户想怎么折都随他。
  // 改的是这棵【内存里的快照树】（parse 出来的副本），不落盘（emitUpdate 有守卫）、退出即丢 —— 没碰原文件。
  // 放在这里而不是"只在首次进入"：面板里换版本也走这个函数 → 每条版本都独立现算，互不影响。
  applyDiffOnlyFold(state.historyTree);
  // 这一版【一个 Now 节点都没有】→ 退出「只看 Now」。语义同编辑态的兜底 `autoExitShowNowWhenEmpty`
  //（当前视图没有 Now 就退出），换快照这条路径原先漏了它 —— 后果：showNow 还开着，而可见集按新树
  // 算出来只剩主节点 → 渲染时把主节点以外全过滤掉，画面看着就是"全都折起来了 / 后面全不见了"。
  // 用 (persist=false, skipRender=true)：沙盒里不落盘，也不各自重绘（下面 renderHistoryTree 统一渲染）。
  if (state.showNow && collectUsableNows(currentRoot()).length === 0) setShowNow(false, false, true);
  // 开着「只看 Now」时，再套一层合成折叠：Now 前面按 Now 的路展开、Now 之后按差异展开（见函数注释）
  applyNowThenDiffFold(state.historyTree);
  // 「只看 Now」的可见集是「按下那一刻」定格的【旧树节点集合】；换快照后新树的节点不在集里，
  // 会被过滤得只剩主节点、后面全部不见（用户 2026-09-14 报"有概率主节点后面全部不见了"）。
  // 换快照 = 视图基准变化 → 基于新树重算 —— 同 goTo 下钻 / applyText 重解析的既有规矩（那两处同款注释）。
  if (!firstEnter && state.showNow) nowVisibleSnapshot = computeNowVisible(currentRoot());
  if (!firstEnter) {
    // 换快照：① 停掉可能还在跑的首次归位动画，否则它会继续把视口滑到旧目标、把用户的视角带跑；
    // ② **锚定主节点** —— 复用编辑态那套 keepView（记锚点 → render 末尾 applyPendingKeepView 补偿 pan），
    //    主节点就"定"在它刚才在屏幕上的位置，缩放也原样保留（用户 2026-09-14 报：换快照画面会跳走、
    //    放大缩小的关系没记住）。
    //    ⚠️ 这里**不能**改用 placeCardAtViewport（归位）：它内部读 --locate-reset-zoom（默认开）会把
    //    zoom 强制打回 1，等于每次换快照清一次用户的缩放 —— 正是上一版被用户否掉的行为。
    //    ⚠️ 只有"主节点"能这么锚定：parse 出来的根节点 id **恒为 'root'**（见 parse），跨版本稳定，
    //    render 后 rectCenter('root') 才能在新的快照树上找到同一个锚点。下钻状态下 DOM 里没有这一行，
    //    keepView 会自己 return（不锚定），退化为"保持 pan 不变"，不会出错。
    stopViewAnim();
    keepView(state.historyTree);
  }
  // 归位只在【首次进入】做；换快照传 false → 保持用户当前调好的缩放与位置（沙盒会话级视角，见函数开头注释）
  // 换快照时的重绘不重新归位，是因为要"记住"用户的操作：缩放倍数、主节点在画面里的位置、下钻位置、显示开关。
  // 这些都跟着"这一次进历史"整体走，退出时由 sandboxRestore 整组还原。
  renderHistoryTree(firstEnter);
  // 【只在"画面只剩主节点"这一种特殊场景做拉回】（2026-09-18 用户定，此前的无条件居中已撤销——
  //   换快照记住位置/缩放的锚定行为"几乎完美"，绝不能全动）。特殊场景 = 这一版被差异规则折得只剩
  //   主节点（state.historyTree.fold，如版本与最新一致 / 只动了主节点），此时主节点可能已被划到边角外：
  //   完整可见 → 什么都不做；被边缘截断（一半出画）→ 参考折叠逻辑最小平移往画面里收；
  //   完全出画 → 回自定义中央位（--locate-selected-x/--locate-y，缩放不变）。其余场景一律保持锚定。
  if (!firstEnter && state.historyTree && state.historyTree.fold) {
    try { historyRootRecenterIfCollapsed(); } catch (e) { /* 渲染时序异常不阻塞换快照 */ }
  }
  // 画面只剩主节点一张卡时，横幅下方给一行【常驻】说明 —— 原来是 toast，几秒就消失，想仔细看都不行
  // （2026-09-14 用户定：改成常驻灰字，由 updateHistoryBanner 渲染，切快照 / 退出即消失）。
  // 这个状态 = 根被规则②折起来（⇒ 主节点以下一处【节点文字】差异都没有），所以差异只可能在主节点自己身上。
  // ⚠️ 但【不能说"下面完全没变化"】：比对是按「同层位置」比节点文字（标题/链接/图片数/备注），
  //    当前版本"多出来的节点"（尤其挂在某组末尾的）比对不到 —— 所以节点数不同时必须把差数说出来，
  //    否则用户看到徽标 137/138 不一样、提示却说下面没变，会以为程序错了（2026-09-14 用户指出）。
  // ⚠️ 必须在 updateToolbar() **之前**算好（它内部调 updateHistoryBanner 读这个字段），放函数末尾就晚一拍。
  let note = '';
  if (state.historyTree.fold) {
    // 两种"差在哪"各自判断：① 主节点自身有没有变（rootChangedAspects 逐项比 nodeSig 那四项）
    // ② 两版节点总数差（>0 = 最新版比这一版多）。四种组合对应四种说法（文案 2026-09-14 用户定稿）。
    const rootChanged = rootChangedAspects().length > 0;
    const d = countDescendantsAll(state.liveTree) - countDescendantsAll(state.historyTree);
    const cnt = d === 0 ? '' : T(d > 0 ? 'hist.addNodes' : 'hist.removeNodes', Math.abs(d));
    if (!rootChanged && !cnt) note = T('hist.sameAsNow');           // 完全相同
    else if (!rootChanged) note = T('hist.onlyCountDiff', cnt);     // 内容没变，只是节点数不同
    else if (!cnt) note = T('hist.onlyRootDiff');                   // 只差主节点
    else note = T('hist.rootAndCountDiff', cnt);                    // 主节点变了 + 节点数也不同
  }
  state.historyNote = note;
  updateToolbar();
  // 折叠层级条也渲染在宿主状态栏里，而「进历史」是在右侧面板点的 —— 画布收不到 pointerdown，
  // 宿主不会把层级条交还本视图，数字就不出现。复用现成的上报（节流 500ms，宿主收到即重绘）。
  reportCanvasActive();
  reportHistState();
}
// 退出历史只读态：还原真实文档树（宿主面板里点「返回编辑」/ 按 Esc / 关掉面板都走这里）
function exitHistorySnapshot() {
  if (!state.historyMode) return;
  state.historyMode = false;
  state.historyDiffIds = new Set();
  state.historyNote = ''; // 常驻提示跟着退出一起消失（updateToolbar → updateHistoryBanner 会按它隐藏）
  if (state.liveTree) state.tree = state.liveTree; // 还原真实文档树（只读期间 state.tree 指向快照树）
  state.liveTree = null;
  stopViewAnim(); // 先停掉可能还在跑的归位/定位动画，否则它会在退出后继续写 pan/zoom、把刚还原的编辑态视角带偏
  sandboxRestore(); // 沙盒收尾：白板状态整组还原（显示开关 / 下钻位置 / 路径栈 / 视口 / 撤销重做栈）
  render(); // 用回真实 state.tree 刷新编辑视图
  updateToolbar();
  reportHistState();
}
// 把只读态回报给宿主（面板据此刷新高亮与按钮可用性）——画布是「现在在看哪条」的唯一真相源。
// ⚠️ 画布**每次初始化完成（booted）也必须上报一次**（init 分支里调）：宿主面板是全局单例、活得更久，
// 画布重建（切走再切回 / 视图重挂）后若不主动报"我在编辑态"，面板会继续以为"正在看上一条" → 再点
// 同一条时 `if (s.timestamp !== this.currentTs)` 判定"已在这条"、不触发 histEnter → 画布停在文档树
// （展开状态），用户看到的就是"这一版本该只显示主节点，却全部展开了"（2026-09-14 用户报）。
function reportHistState() {
  try {
    vscode.postMessage({
      type: 'histState',
      mode: state.historyMode ? 'snapshot' : 'edit',
      timestamp: state.historyMode ? state.historyCurrentTs : 0,
    });
  } catch (_) {}
}

// 画布顶部历史横幅（2026-09-14 用户定）：进历史只读态时，画布顶上压一整条贯通横条 —— 浅黄底、
// **刻意不跟主题走**（用户要求"要显眼"），一眼就能看出现在看的是历史版本。
// 元素写在宿主骨架里（main.js buildFrameHtml，见 skill 规则 11：静态元素进骨架、前端只切显隐），
// 这里只负责显隐 / 改文字 / 一次性绑事件；由 updateToolbar 统一调用（进、出历史都走那里）。
// 左「返回编辑」，中「历史版本 · <这一版的名字或时间>」，右「将此版本设为最新版本」。
let histBannerBound = false;
function updateHistoryBanner() {
  const el = document.getElementById('hist-banner');
  if (!el) return;
  const on = !!state.historyMode;
  el.classList.toggle('hidden', !on);
  document.body.classList.toggle('hist-on', on); // 面包屑（下钻路径）下移让位，两条不叠（见 mindmap-app.css）
  // 横幅正下方的常驻提示行（「与当前完全相同 / 只差主节点…」）：内容由 enterHistorySnapshot 算好存
  // state.historyNote，这里只管显隐 —— 它跟横幅一体，进、出历史都经 updateToolbar 走到这里刷新。
  // 一枚按钮 · 两种状态（2026-09-14 用户定：不要两枚，改成随状态变字变色的单枚）：
  //   普通态（淡）：固定说明「黄色节点为和最新版本不同的节点」（进历史界面就有）
  //   特殊态（亮，加 .is-strong）：画面只剩主节点时，字换成具体差异说明（如「最新版本和此版本相同」）
  const noteEl = document.getElementById('hist-note');
  if (noteEl) {
    const detail = on ? (state.historyNote || '') : '';
    // 文字包一层 span 才好看成"小按钮"（直接给块级元素加背景会撑满整行）；用 textContent 不拼 HTML。
    let chip = noteEl.querySelector('.hist-note-chip');
    if (!chip) { chip = document.createElement('span'); chip.className = 'hist-note-chip'; noteEl.appendChild(chip); }
    chip.textContent = detail || T('hist.tipText');
    chip.classList.toggle('is-strong', !!detail); // 有具体说明 → 亮一点
    noteEl.classList.toggle('hidden', !on);       // 退出历史界面整枚消失
  }
  if (!histBannerBound) {
    histBannerBound = true; // 横幅不随 render 重建，事件只绑一次，重复绑会叠加
    // 横幅是 #view-map 的子元素，鼠标事件会冒泡到画布那套（框选 / 点空白清选）——拦在自己这一层，
    // 否则点横幅会顺带触发框选或清掉选中。
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => e.stopPropagation());
    // 三个按钮的小图标（沿用原来面板按钮那套：进入 / 书签 / 还原箭头）。只插一次 —— 横幅不随 render 重建。
    const setIc = (id, name) => {
      const b = document.getElementById(id);
      if (!b || b.querySelector('.hb-ic')) return;
      const s = document.createElement('span');
      s.className = 'hb-ic';
      s.innerHTML = renderIcon(name, 14); // 显示尺寸交给 CSS 的 --hb-ic-size 统管
      b.insertBefore(s, b.firstChild);
    };
    setIc('hb-back', 'log-in');       // 返回编辑
    setIc('hb-copy', 'bookmark');     // 创建副本
    setIc('hb-latest', 'refresh-cw'); // 将此版本设为最新版本
    const back = document.getElementById('hb-back');
    if (back) back.onclick = () => exitHistorySnapshot();
    // 「创建副本」= 把这一版另存成一个新文件（不动当前文件），宿主侧 histCreateCopy() 收尾。
    // ⚠️ 两枚按钮把「这一版是谁」整套带上：时间戳 + 名字 + **正文**。「正在看哪一版」只有画布自己知道，
    //    正文更是已经握在手里（state.historyText）—— 宿主照单执行即可，不必回头问历史面板、
    //    也不必再回盘上读快照（快照被自动清理掉、索引失联，都不会再让按钮变成"点了没反应"）。
    //    （2026-09-19 修：原先只报一个消息类型，宿主一路猜，任何一环取不到就静默 return。）
    const copy = document.getElementById('hb-copy');
    if (copy) copy.onclick = () => vscode.postMessage({
      type: 'histCopyRequest',
      timestamp: state.historyCurrentTs, name: state.historyName, text: state.historyText,
    });
    // 「设为最新版本」= 原「还原此版本」：确认弹窗与还原动作都在宿主，复用面板那一套（文案只有一份）
    const latest = document.getElementById('hb-latest');
    if (latest) latest.onclick = () => vscode.postMessage({
      type: 'histRestoreRequest',
      timestamp: state.historyCurrentTs, name: state.historyName, text: state.historyText,
    });
  }
  // 横幅中间 = 说明文字（2026-09-15 用户定：「历史版本」「版本名」都拿掉，全换成下面那枚按钮的文字）：
  //   普通态（淡）= 固定说明 hist.tipText「黄色节点为和最新版本不同的节点」；
  //   特殊态（亮，.is-strong）= 画面只剩主节点时的具体差异说明（四种说法）。
  const note = document.getElementById('hb-note');
  if (note) {
    const detail = on ? (state.historyNote || '') : '';
    note.textContent = detail || T('hist.tipText');
    note.classList.toggle('is-strong', !!detail);
    note.classList.toggle('hidden', !on);
  }
}

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

// 「只看差异」按钮已删除（2026-09-14 用户定）：进历史快照时就自动只看差异，
// 由 enterHistorySnapshot 直接调 applyDiffOnlyFold，不再有开关与消息。

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ webview 内自建浮层（替代 window.prompt/confirm，VSCode webview 禁用原生弹窗） ============
function showPrompt(title, placeholder, onOk, onCancel, initial) {
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
  if (initial) input.value = initial; // 重命名场景：预填原名，便于就地修改
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
// 带说明文字的小弹窗（2026-09-17 加，「更多」菜单里需手填的入口用它）：
// hint = 输入框上方的灰色小字（解释这个入口是什么意思）；fields = 1~2 个输入框的占位提示
function buildPrompt(title, hint, fields, onOk, initials) {
  closePrompt(); // 先清掉可能残留的
  const mask = document.createElement('div');
  mask.className = 'wb-mask';
  mask.id = 'wb-prompt-mask';
  const inputsHtml = fields.map((ph, i) =>
    '<input class="wb-input wb-input-' + i + '" type="text" placeholder="' + escapeHtml(ph || '') + '">').join('');
  mask.innerHTML = '<div class="wb-dialog">'
    + '<div class="wb-dialog-title">' + escapeHtml(title) + '</div>'
    + (hint ? '<div class="wb-dialog-hint">' + escapeHtml(hint) + '</div>' : '')
    + inputsHtml
    + '<div class="wb-dialog-actions">'
    + '<button class="wb-btn wb-btn-cancel">' + T('btn.cancel') + '</button>'
    + '<button class="wb-btn wb-btn-ok">' + T('btn.ok') + '</button>'
    + '</div></div>';
  document.body.appendChild(mask);
  const inputs = fields.map((_, i) => mask.querySelector('.wb-input-' + i));
  (initials || []).forEach((v, i) => { if (v && inputs[i]) inputs[i].value = v; });
  const ok = () => { const vals = inputs.map(inp => inp.value); closePrompt(); if (onOk) onOk(vals); };
  const cancel = () => closePrompt();
  mask.querySelector('.wb-btn-ok').onclick = ok;
  mask.querySelector('.wb-btn-cancel').onclick = cancel;
  mask.onclick = e => { if (e.target === mask) cancel(); };
  inputs.forEach(inp => {
    inp.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); ok(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
  });
  setTimeout(() => inputs[0].focus(), 0);
}
// 单输入框 + 说明（仓库内附件 / 本地文件链接 / 关联节点用）
function showPromptH(title, hint, placeholder, onOk, initial) {
  buildPrompt(title, hint, [placeholder], vals => { if (onOk) onOk(vals[0]); }, [initial]);
}
// 双输入框 + 说明（网页链接用：显示文字 + 地址）
function showPrompt2(title, hint, ph1, ph2, onOk, init1, init2) {
  buildPrompt(title, hint, [ph1, ph2], vals => { if (onOk) onOk(vals[0], vals[1]); }, [init1, init2]);
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

// ── 图片显示尺寸缓存（2026-09-20：折叠/展开带图节点时连线抖动）────────────────
// 卡片里的图是异步加载的：加载完成前 <img> 尺寸为 0，加载后卡片被撑高 → 整棵树 reflow、节点位移。
// 于是「展开一个带图的节点」会出现两段布局：先按无图画一遍连线，图到了再重排一次。
// 记住每张图**实测的显示尺寸**（已被 --img-maxw/maxh 裁剪过的最终值），下次渲染时先按它撑开占位：
// 布局一次到位，图到达时尺寸早已就位 → 不再有二次重排。
// 旋钮 --img-maxw/maxh 一改（ref 不同）整套缓存自动作废，不会套用旧尺寸。
const imgSizeCache = {};
let imgSizeRef = '';
function refreshImgSizeRef() {
  const cs = getComputedStyle(document.documentElement);
  imgSizeRef = (cs.getPropertyValue('--img-maxw') || '').trim() + '|' + (cs.getPropertyValue('--img-maxh') || '').trim();
}
function applyImgSizeHint(img, p) { // 渲染时先占位：记住过尺寸就先按它撑开
  const c = p && imgSizeCache[p];
  if (!c || c.ref !== imgSizeRef) return false; // 没记住过 → 图到达时布局还会变（见 armImageMotion）
  img.style.width = c.w + 'px';
  img.style.height = c.h + 'px';
  return true;
}
function rememberImgSize(img, p) {  // 图真正显示出来后，记下它占多大（下次直接套用）
  if (!p) return;
  const w = img.offsetWidth, h = img.offsetHeight;
  if (w > 0 && h > 0) imgSizeCache[p] = { w: w, h: h, ref: imgSizeRef };
}
function dropImgSizeHint(img, p) {  // 图加载失败：撤掉占位尺寸，交回 CSS 的「缺失图」小方块
  img.style.width = ''; img.style.height = '';
  if (p) delete imgSizeCache[p];
}
// 图片读不到 → 变成「看得见、点得到」的缺失占位（2026-09-17）。
// 为什么用 alt 而不是 CSS ::before：<img> 是替换元素，伪元素不渲染 —— 这正是以前预埋文案
// 一直显示不出来的原因。alt 文本浏览器一定会画出来，尺寸随文字撑开，也就点得到/选得中/删得掉。
function markImgMissing(imgEl, name) {
  imgEl.classList.add('img-missing');
  imgEl.dataset.missing = '1'; // 状态标记（class 只管样式；判定统一走 isImgMissing，防样式类被别处删掉导致状态丢）
  imgEl.alt = T('img.missing');
  imgEl.title = name + '\n' + T('tip.imgMissing');
}
function isImgMissing(imgEl) {
  return !!(imgEl && (imgEl.dataset.missing === '1' || imgEl.classList.contains('img-missing')));
}
// 双击缺失图 → 弹说明框，明确告诉用户「缺的是哪张」（2026-09-17）。
// 刻意只留一个「好的」按钮：真遇到缺图，人的第一反应是关掉继续干活，不会当场去找图。
// 所以说明里直接告诉他「把文件放回库 → 重启 Obsidian 就会恢复」，比塞个「重新查找」按钮实在
// （那个按钮实际没人会用 —— 用户 2026-09-17 定：撤掉重试机制）。
// 为什么不让用户靠悬停看文件名：图片的悬停提示只能走原生 title，而插件统一的黑色小字提示用的是
// [data-tip]::after —— 伪元素在 <img> 这类替换元素上不渲染，挂不上去。
function showMissingImgInfo(relPath) {
  closePrompt(); // 先清掉可能残留的
  const mask = document.createElement('div');
  mask.className = 'wb-mask';
  mask.id = 'wb-prompt-mask';
  mask.innerHTML = '<div class="wb-dialog">'
    + '<div class="wb-dialog-title">' + escapeHtml(T('img.missingTitle')) + '</div>'
    + '<div class="wb-dialog-hint">' + escapeHtml(T('img.missingHint')) + '</div>'
    + '<div class="wb-missing-name">' + escapeHtml(relPath) + '</div>'
    + '<div class="wb-dialog-actions">'
    + '<button class="wb-btn wb-btn-ok">' + T('btn.okay') + '</button>'
    + '</div></div>';
  document.body.appendChild(mask);
  const close = () => { try { mask.remove(); } catch (_) {} };
  mask.querySelector('.wb-btn-ok').onclick = close;
  mask.onclick = e => { if (e.target === mask) close(); };
}
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
// 预览列表 = 该节点**实际渲染出来的**图片（顺序与卡片一致：标题里的语法图在前 + 手动粘贴的附件图在后），去重保序。
// ⚠️ 老 bug（2026-09-19 修）：以前只认 `state.selectedImg.nodeId` → `node.images`，而且是直接把 `findNode()`
//    的返回值当节点本身用 —— 它返回的是 `{ node, parent, index }`，`.images` 恒为 undefined → 列表恒为一张
//    → ‹ › 计数条不出现、`stepPreviewImage` 一进来就被 `length <= 1` 挡回，←→ 自然翻不动。
function nmPreviewImgs(node) {
  if (!node) return [];
  const inline = (nmExtractInlineImages(node.title || '').images) || [];
  const out = [];
  inline.concat(node.images || []).forEach((p) => { if (p && out.indexOf(p) < 0) out.push(p); });
  return out;
}
// 这张图属于哪个节点（优先看选中的那个，找不到再全树找一圈 —— 双击语法图 / selectedImg 还没指过来也认）
function nmFindPreviewOwner(relPath, preferId) {
  if (!relPath || !state.tree) return null;
  if (preferId) {
    const r = findNode(state.tree, preferId);
    if (r && nmPreviewImgs(r.node).indexOf(relPath) >= 0) return r.node;
  }
  let hit = null;
  (function walk(n) {
    if (hit || !n) return;
    if (nmPreviewImgs(n).indexOf(relPath) >= 0) { hit = n; return; }
    (n.children || []).forEach(walk);
  })(state.tree);
  return hit;
}
function openImagePreview(relPath) {
  if (!relPath) return;
  // 多图：取该节点渲染出来的全部图片，定位到当前这张
  let list = [relPath], idx = 0;
  const sel = state.selectedImg;
  const owner = nmFindPreviewOwner(relPath, sel && sel.nodeId);
  if (owner) {
    const imgs = nmPreviewImgs(owner);
    const i = imgs.indexOf(relPath);
    if (i >= 0) { list = imgs; idx = i; }
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
// 文件链接显示名：[显示名] 框即真相源，渲染只认框里原样内容；仅当显示名为空时退回末级名（文件夹取目录名）
function normalizeFileDisplay(display, p) {
  if (!display) return (p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p);
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
// Now 节点是否被 Minor「埋掉」（2026-09-15 用户定稿）：自身或祖先链（不含主节点——主节点恒可见）
// 上有 Minor 标记 → 这个 Now 就不再重要，不参与只看 Now / 定位等一切 Now 相关功能。
// 无条件判定，与「隐藏 Minor」开关无关：标了 Minor 就代表不关注，按标记算，不按当前显隐算。
function nowTaintedByMinor(root, now) {
  const path = pathTo(root, now.id);
  return !!path && path.some((n, i) => i > 0 && nodeIsMinor(n));
}
// 「可用的 Now」= 收集结果剔除被 Minor 埋掉的（只看 Now / 定位 / 置灰判定统一用这个口径）
function collectUsableNows(root) {
  return collectNowNodes(root).filter(n => !nowTaintedByMinor(root, n));
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
    if (nowTaintedByMinor(root, now)) return; // 2026-09-15 修「半截」：被 Minor 埋掉的 Now 无条件不计入（见 nowTaintedByMinor）
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
// 内联图片语法提取（2026-09-19，P1）：标题里混写的 Obsidian 同款图片语法（![[名字]] / ![](路径)）
// → 渲染时**抽出来放到节点图片行**（附件图之后），标题只留文字；存储**原样保留**语法不转换 ——
// 这是内联语法解析层（P1）的第一段，以后双链（P2）/ 块引用嵌入（P3）都走同一条管道加规则即可。
// 规矩（防误伤，"/您" 教训）：只认**闭合完整**的语法；远程 http(s) 图与 ![[笔记]] 嵌入（非媒体文件）P1 不做，原样保留。
function nmExtractInlineImages(text) {
  const images = [];
  const out = String(text || '').replace(/!\[\[([^\[\]]+)\]\]|!\[[^\]]*\]\(([^)]+)\)/g, (m, wiki, md) => {
    const p = (wiki ? wiki : md).trim();
    if (/^https?:/i.test(p)) return m;              // 远程图：P1 不做，原样保留
    // ⚠️ 判"是不是图"用图片扩展名正则，不能用 isMediaFile() —— 它只含音视频、不含 png/jpg（用户实踩：
    //    ![[xx.png]] 被当成笔记嵌入放过 → 标题剩「!」+ 双链）。![[笔记]] 嵌入才是 P3。
    if (wiki && !/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|svg)$/i.test(p)) return m;
    images.push(p);
    return '';                                       // 从标题里抽走 → 图片行渲染
  }).replace(/\s{2,}/g, ' ').trim();                 // 抽走后残留的多空格收紧
  return { text: out, images };
}
function cardTitleInner(node) {
  const selfDone = nodeIsMinor(node);
  const selfNow = nodeIsNow(node);
  // 2026-08-28：图标 span 设 contenteditable="false"，编辑中 Backspace 删完文字不会继续删图标
  // （图标与文字解耦，删最后一个字图标还在；空节点也正常显示图标）
  // 2026-08-31 修（双图标 bug）：空标题节点的前缀图标由 buildRow 的 `if (selfDone && !node.title)` DOM 插入
  // 分支独立渲染（无标题时独占一行），这里再 emit 一次就会叠成两个 → 仅在有标题时才拼前缀图标。
  // 前缀图标顺序（2026-09-21 第七轮用户再确认）：**进度% → 待办/已完成 → Now → Minor**
  // （四个可以同时出现：节点既是待办、又是 Now、又是 Minor，并且子待办 >= 2 时，从左到右就是这么排）
  // 已删：上一轮那个「母节点自己是待办 → 进度画进 Todo 图标」的合并（用户这轮要求四个都显示）
  return (node.title && todoPctShown(node) ? todoPctHtml(node) : '')
    + (nodeTodoAny(node) && node.title ? todoIcoHtml(node) : '')
    + (selfNow && node.title ? '<span class="now-ico" contenteditable="false">' + renderNowPrefix() + '</span>' : '')
    + (selfDone && node.title ? '<span class="minor-ico" contenteditable="false">' + renderIcon(minorIconName(node), 12) + '</span>' : '')
    + renderInline(nmExtractInlineImages(node.title || '').text); // 图片语法已抽到图片行（nmExtractInlineImages），标题只留文字
}
// URL 链接 v2：[显示名](https://…)（标准 Markdown）或裸 https://x / www.x / ftp:// / mailto:；点击浏览器打开
function parseUrlLink(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/^\[([^\]]*)\]\(((?:https?|ftp):\/\/[^)\s]+|mailto:[^)\s]+|www\.[^)\s]+)\)$/);
  if (m) {
    let url = m[2].trim();
    if (/^www\./i.test(url)) url = 'https://' + url; // 裸 www. 补 https，便于浏览器打开
    return { url, display: normalizeUrlDisplay(m[1].trim(), url) };
  }
  if (/^(https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s]+$/i.test(t)) {
    let url = t;
    if (/^www\./i.test(url)) url = 'https://' + url; // 裸 www. 补 https，便于浏览器打开
    return { url, display: urlRootDisplay(url) };
  }
  return null;
}
// URL 显示名：[显示名] 框即真相源，渲染只认框里原样内容；仅当显示名为空时退回根域名
function normalizeUrlDisplay(display, url) {
  if (!display) return urlRootDisplay(url);
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
  // 纯文件链接：**只认 [显示名](file:///…) 这个我们自己的格式**（2026-09-18 用户定）。
  // 不再用 detectFilePath 认裸路径 —— 节点文字里随手写 "/您" 这种以斜杠开头的普通文本，
  // 之前被当成绝对路径渲染成文件链接（误识别）。想要文件链接：选中节点后粘贴路径（我们会转成标准格式），
  // 或在链接节点里写。裸路径文字从此是纯文字。
  const fl = parseFileLink(t);
  if (fl) {
    return '<span class="inline-file" data-path="' + escapeHtml(fl.path) + '">' + linkIco('folder-closed') + escMd(fl.display) + '</span>';
  }
  // 混排兜底：按 [[…]] / [名](链接) / 裸 URL 切分，链接段渲染成可点 span（复用 bindInline），其余文字走 escMd。
  // 不认得的写法（如残缺 [[xx）按纯文字，不吞字；落盘不变——标题仍是原文，只是渲染差异。
  // 裸 URL 字符集排除 CJK/全角区（URL 后紧跟中文不算 URL 的一部分），尾部 ASCII 标点另行剥离
  // 混排切出的链接 token 必须含右括号结尾（parseUrlLink/parseFileLink 都要求 \)$）：
  // 旧正则 URL/file 共用 [^)\s]+ 且不带 \) → token 永远缺右括号 → parse 恒 null → [名](url) 内嵌一直是纯文字（隐藏老 bug）；
  // file 另用 [^)]+（本地路径可含空格，如 "Digital Life"，2026-09-02 实踩：含空格路径内嵌失效）
  const re = /\[\[[^\[\]]+\]\]|\[[^\[\]]*\]\(file:\/\/[^)]+\)|\[[^\[\]]*\]\((?:https?|ftp):\/\/[^)\s]+\)|\[[^\[\]]*\]\(www\.[^)\s]+\)|mailto:[^)\s]+\)|(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g;
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
// （画布里的「调试界面开关」连同顶部刷新按钮已于 2026-09-14 一并删除。
//   注意：设置页里那个 debugMode 是【另一个东西】—— 作者的许可状态调试栏，保留不动。）

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
// 过滤按钮（左下「隐藏 Minor / 已完成待办」）三态刷新 —— 2026-09-21 用户定：
//   ① 界面里**既没有 Minor 也没有已完成待办** → `eye` + **置灰**（没东西可隐藏）
//   ② 有、但没开隐藏 → `eye` + 正常色
//   ③ 已开隐藏 → `eye-off` + **主题色**（`.active-hide`）
// 判据只看 currentRoot() 范围内的**当前视图**（2026-08-30 的教训：用整棵树找会「外面有 Minor 就不置灰，
//   点了却在开关看不见的节点」）。图标名走 ICONS 字典（eye / eye-off）。
// 2026-09-21 用户定：**只算「界面上看得见」的** —— 折叠（fold）进去的分支整个不算（折叠节点自身看得见，仍算）。
//   为什么：以前折起来看不见、眼睛还亮着，点下去界面毫无反应，用户以为按钮坏了。
//   ⚠️ 判据**不看 state.hideDone**（不因为"已经被隐藏了"而自己熄灭）—— 否则隐藏后眼睛置灰，就再也点不回来。
function anyMinorOrDoneInView() {
  let hit = false;
  (function w(n) {
    if (!n || hit) return;
    (n.children || []).forEach(c => {
      if (nodeIsMinor(c) || nodeTodoDone(c)) { hit = true; return; }
      if (!c.fold) w(c); // 折叠起来的分支：里面看不见，不算
    });
  })(currentRoot());
  return hit;
}
function refreshHideBtn() {
  const b = document.getElementById('btn-hide-done');
  if (!b) return; // 启动早期 / 自检沙箱里没有这个按钮
  const has = anyMinorOrDoneInView();
  const on = has && !!state.hideDone; // 没东西可隐藏时不显示"已激活"，只显示置灰的 eye
  b.innerHTML = renderIcon(on ? 'eye-off' : 'eye', 18);
  b.classList.toggle('disabled', !has);   // 置灰：用 .disabled 类、不用 disabled 属性（这样 hover 仍出 tooltip）
  b.classList.toggle('active-hide', on);  // 主题色由 .tb.active-hide 提供
  b.dataset.tip = !has ? T('tb.noMinor')
    : (on ? T('tb.showMinor') : T('tb.hideMinor')) + nmKeySuffix('hideMinor', '{Mod} + {Alt} + M');
}
function setHideDone(on, persist, skipRender) {
  // 沙盒化（2026-09-14 用户定）：历史界面里这个开关【可以点】，但只在本界面生效、不落盘；
  // 退出由 sandboxRestore 整组还原。所以这里不再 return，只在发消息那步挡住持久化。
  state.hideDone = on;
  // 2026-09-15：hideDone 变了 → Minor 链的埋没关系变了 →「只看 Now」可见集必须重算，
  // 否则先开 hideDone 再开 showNow（或反过来切）时快照是旧的，被 Minor 埋掉的 Now 会显示成半截。
  if (state.showNow && state.tree && !skipRender) nowVisibleSnapshot = computeNowVisible(currentRoot());
  const b = document.getElementById('btn-hide-done');
  if (b) {
    b.style.color = ''; // 图标色交给类（.disabled / .active-hide），清掉可能残留的内联色
    refreshHideBtn();   // 图标（eye / eye-off）、置灰、提示语一起刷 —— 单一出口，别在这里各写一遍
  }
  if (persist !== false && !state.historyMode) vscode.postMessage({ type: 'setHideDone', value: !!on }); // 沙盒里不持久化
  if (skipRender) return; // 只写状态与按钮图标，不重建树（init 建树前预置过滤开关用）
  if (!state.tree) return; // 树未初始化（自检脚本 / 启动阶段），只更新图标
  keepView(currentRoot()); // 2026-08-24 修：之前误传 currentRoot().id（字符串），keepView 内 node.id=undefined 静默 return，锚定从未生效
  renderWithMotion(); // 实验性：隐藏/显示 Minor 是整棵树的结构变化，走位移过渡
}
// 只显示「当前关注 Now」节点（2026-08-27 起）：切换 showNow。
// 开：剔除渲染只留 Now+祖先路径+Now 直接子节点（computeNowVisible）；视图锚定主节点不跳转
//   （2026-09-14 起与「隐藏 Minor」一致：keepView(currentRoot())；原为 resetView 定位首 Now 居中，主节点会偏离原位）。
// 关：正常渲染。
// 数据层展开/折叠（用户 2026-08-27 后续定）：仅真实点击开启（persist 默认 true）时改 node.fold——
//   展开藏 Now 的所有祖先（让 Now 露出）+ 折叠 Now 的直接子节点（其后整棵子树收起，类点折叠按钮）；
//   改前 pushUndo 可撤销，emitUpdate 落盘。init 恢复(persist=false)与点关闭时都不碰 node.fold，交回用户手动（"点完按钮后别管，除非再次点击"）。
function setShowNow(on, persist, skipRender) {
  // 沙盒化（2026-09-14 用户定）：历史界面里可以点，只在本界面生效、不落盘；退出由 sandboxRestore 整组还原。
  // 注意它在这里改的是【快照树】的 fold，不会碰到实时文档树；pushUndo 的污染也由沙盒还原清掉。
  // 真实点击开启时，当前视图（currentRoot 范围）一个【可显示的】Now 节点都没有 → 不开、退出，并提示原因
  //（否则可见集只剩当前根、画面塌缩成单节点，用户看到"点了没反应/节点失效"；2026-08-31 语义）。
  // 2026-09-15：口径改为可用 Now（collectUsableNows，剔除被 Minor 埋掉的）——全是这种就等于没有可显示的。
  if (on && persist !== false && state.tree && collectUsableNows(currentRoot()).length === 0) {
    toast(T('toast.showNowEmpty'));
    if (!state.historyMode) vscode.postMessage({ type: 'setShowNow', value: false }); // 回写 perFile，别存一个无效的 true（沙盒里不落盘）
    updateNowSideBtn();
    return;
  }
  state.showNow = on;
  nowVisibleSnapshot = (on && state.tree) ? computeNowVisible(currentRoot()) : null; // 「按下那一刻」定格可见集；关闭即清空（2026-08-28）
  if (persist !== false && !state.historyMode) vscode.postMessage({ type: 'setShowNow', value: !!on }); // 沙盒里不持久化
  // 只写状态与按钮图标，不重建树（init 建树前预置「关闭态」用）；开启态需建树后算可见快照，不走这里
  if (skipRender) { updateNowSideBtn(); return; }
  if (!state.tree) { updateNowSideBtn(); return; } // 树未初始化，只更新图标
  // 数据层：仅真实点击开启时展开/折叠（init 恢复与点关闭不触发）
  if (on && persist !== false) {
    pushUndo();
    const root = currentRoot();
    collectUsableNows(root).forEach(now => { // 2026-09-15：只展开/折可用 Now（被 Minor 埋掉的不参与）
      const path = pathTo(root, now.id); // 祖先链（含自身）
      if (path) for (let i = 0; i < path.length - 1; i++) path[i].fold = false; // 展开所有祖先（自身保留）
      // 历史界面（沙盒）里**不硬折 Now**：Now 自身与它的子树交给差异规则重折
      // （子树没差异 → 规则②照样把 Now 折起 = Now 的最小态；有差异 → 展开到差异节点）。
      // 用户 2026-09-14 定："先按 Now 把要显示的显示出来，Now 之后的子节点再按差异来开"。
      if (state.historyMode) applyDiffOnlyFold(now);
      else {
        // 2026-09-18 用户定：不再一刀切全折（之前 now.fold=true 画面只剩 Now 一行，不友好）。
        // 按 Now 子树规模智能展开：前两层节点总数 < 16 → 展开到第二层级（第三层起折起）；
        // ≥ 16 → 只展开第一层级（第二层起保持折叠）。
        const l1 = now.children || [];
        const l2Count = l1.reduce((n, c) => n + ((c && c.children) ? c.children.length : 0), 0);
        now.fold = false; // 两种情况 Now 自身都展开（没子节点时展开与否视觉相同）
        if (l1.length + l2Count < 16) {
          l1.forEach(c => { if (c) c.fold = false; }); // 第一层展开 → 第二层可见
          l1.forEach(c => { ((c && c.children) || []).forEach(g => { if (g) g.fold = true; }); }); // 第三层起折起
        }
        // ≥16：直接子节点保持原始折叠态（多数为折起 → 只见第一层级）
      }
      // 点 Now 展开后子节点按原状显示（不逐层续折），任意层级都可在 nowVisibleSet 内展开查看/编辑。
    });
    emitUpdate(); // 落盘 fold 变化
  }
  // 2026-09-01 修「切走再回 pan 被清零、永远回自定义中央」的头号根因（历史，勿回退）：
  // 原 `if (on) resetView()` 不看 persist——init 恢复（persist=false）也走 resetView → rAF 里 locateCenter
  // → placeCardAtViewport 强制 pan=0 + scroll=定位规范值，把 init hasSavedView 分支刚恢复的 pan 抹掉；
  // 随后的 scroll 事件 persist 又把被污染的状态写回记忆 → 永远回中央。修：init 恢复只重渲染应用 Now 过滤，
  // 视图位置完全交给 init 的恢复/定位分支（init 期间 applyPendingKeepView 还有 booted 门闩兜底，不补偿）。
  // 2026-09-14 改：真实点击开启也不再定位——原 resetView → locateCenter 把第一个 Now 摆到画面 25%，
  // 主节点会偏离用户原本的中间位置；现与「隐藏 Minor」一致：锚定主节点，画面位置不变。
  if (on) {
    state.nowLocateIndex = 0; // 多 Now 时定位按钮循环的起点（下钻/返回等仍按此定位到 Now）
    if (persist !== false) { keepView(currentRoot()); renderWithMotion(); } // 真实点击开启：锚定主节点，不跳转
    else render(); // init 恢复：只按快照重渲染应用过滤，绝不定位
  }
  else { keepView(currentRoot()); renderWithMotion(); }
}
// 刷新侧边 Now 按钮：无 Now 节点 → 置灰禁用；否则按 showNow 切正常/激活图标（2026-08-27）
// tooltip 统一挂在 #now-wrap 容器上（不挂在按钮本身）：按钮禁用时 opacity:.35 会把挂在它身上的 tooltip
// 一起变淡，且 :disabled 是否触发 :hover 各浏览器不一；挂容器上则始终清晰、且容器必然 :hover。
function updateNowSideBtn() {
  const b = document.getElementById('btn-now-side');
  const wrap = document.getElementById('now-wrap');
  if (!b || !wrap) return;
  // 沙盒（2026-09-14 用户定）：历史界面里这个按钮不再置灰 —— 可以点，只影响本界面，退出整组还原。
  const hasNow = state.tree ? collectUsableNows(currentRoot()).length > 0 : false; // 2026-09-15：口径=可用 Now（被 Minor 埋掉的不算）
  b.disabled = !hasNow;
  b.classList.toggle('now-on', hasNow && state.showNow);
  wrap.dataset.side = 'right'; // 左侧 toolbar 按钮 → tooltip 向右浮动（避开画布；2026-08-27）
  if (!hasNow) {
    b.innerHTML = renderNowIcon('side');        // 置灰后呈灰，提示无可定位的当前关注节点
    wrap.dataset.tip = T('tb.noNow');
  } else {
    const on = state.showNow;
    b.innerHTML = renderNowIcon(on ? 'sideOn' : 'side');
    wrap.dataset.tip = (on ? T('tb.nowShowAll') : T('tb.nowOnly')) + nmKeySuffix('showNow', '{Mod} + {Alt} + N');
  }
}
// 默认路径按钮状态：当前页面路径 vs 保存的默认路径（两态：置灰 / 蓝色点击返回）
// 位置归一（2026-09-15 定稿）：比较前先把「主节点」翻成统一记号——
// 空串（没下钻 / 文件头没写 node）与主节点自身编号（如历史遗留 node: pfzXXX）视为同一位置。
// 消除「同一位置两种写法」导致的按钮误亮（实踩：主节点带 ID 的文件，两按钮在主节点误亮）。
const POS_ROOT = '·root·';
function normPos(pid) {
  pid = String(pid || '').trim().replace(/[^A-Za-z0-9]/g, '');
  if (!pid) return POS_ROOT;
  if (state.tree && pid === state.tree.persistId) return POS_ROOT;
  return pid;
}
// 默认路径是否有效：空串=默认是根（永远有效）；否则树里必须还存在该 persistId 节点
function defaultPathValid() {
  const d = (state.defaultPid || '').trim();
  if (!d) return true;
  return !!findNodeByPersistId(state.tree, d);
}
function updateDefaultPathBtn() {
  // 2026-09-15 定稿：路径入口只在「更多」菜单（一级按钮已删）。本函数只做两件事：
  // ① 更多按钮图标随状态切换：当前 ≠ 默认且默认有效 → 双点+斜杠（斜杠主题色）；相同/失效 → 原三个点
  // ② 同步菜单项置灰（updatePathMenuBtns）
  const valid = defaultPathValid();
  const cur = normPos(state.currentRootPid);
  const def = normPos(state.defaultPid);
  const same = cur === def;
  const bMore = document.getElementById('btn-more');
  if (bMore) bMore.innerHTML = (valid && !same) ? MORE_PATH_HINT_SVG : renderIcon(ICON_FIXED.more, 18);
  updatePathMenuBtns();
}
// 路径 4 项（「更多」菜单平铺）置灰：上一/下一按历史栈位置，返回默认/设默认按归一位置比较（2026-09-15 定稿）
function updatePathMenuBtns() {
  const back = document.querySelector('#more-menu .mm[data-act="path-back"]');
  const fwd = document.querySelector('#more-menu .mm[data-act="path-fwd"]');
  const def = document.querySelector('#more-menu .mm[data-act="path-default"]');
  const save = document.querySelector('#more-menu .mm[data-act="path-save"]');
  if (back) back.disabled = state.pathHistoryIndex <= 0;
  if (fwd) fwd.disabled = state.pathHistoryIndex >= state.pathHistory.length - 1;
  // 当前/默认位置都走 normPos 归一（主节点统一记号），规则只有一条：相同 → 灰，不同 → 亮
  const cur = normPos(state.currentRootPid);
  const dflt = normPos(state.defaultPid);
  const same = cur === dflt;
  const valid = defaultPathValid();
  if (def) def.disabled = !valid || same;
  if (save) save.disabled = same && valid;
}
// 更多按钮提示图标（2026-09-15 实验）：两个圆点 + 一条斜杠。**仅在当前位置 ≠ 默认路径时显示**
//（相同则保持原三个点，见 updateDefaultPathBtn 的切换）；斜杠 style 直接吃 var(--accent) 主题色。
const MORE_PATH_HINT_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" class="icon">' +
  '<path d="M19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11C18.4477 11 18 11.4477 18 12C18 12.5523 18.4477 13 19 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M5 13C5.55228 13 6 12.5523 6 12C6 11.4477 5.55228 11 5 11C4.44772 11 4 11.4477 4 12C4 12.5523 4.44772 13 5 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M14.3386 6.00005L9.98501 17.9509" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--accent)"/>' +
  '</svg>';
// 初始化左侧一级菜单按钮图标 + tooltip（undo/redo 已移入更多菜单，2026-08-25；路径按钮 2026-09-15 定稿：删除，入口只在「更多」菜单）
['locate', 'hide', 'more'].forEach(k => {
  const id = k === 'hide' ? 'btn-hide-done' : 'btn-' + k;
  const b = document.getElementById(id);
  if (!b) return;
  b.innerHTML = k === 'more' ? MORE_PATH_HINT_SVG : renderIcon(ICON_FIXED[k], 18);
  const tipMap = {
    undo: T('tb.undo'),
    redo: T('tb.redo'),
    locate: T('tb.locate') + nmKeySuffix('locate', '{Mod} + P'),
    hide: T('tb.minorToggle') + nmKeySuffix('hideMinor'),
    more: T('common.more'),
  };
  b.dataset.tip = tipMap[k];
  b.dataset.side = 'right'; // 左侧 toolbar 按钮 → tooltip 向右浮动（避开画布）
});
// ===== 折叠体系（2026-09-13 定案 v2：数字按「有没有选中」分派两种作用）=====
// 数字（Obsidian 状态栏）的作用分两种：
//   未选中 → 「画面按层折叠到第 N 层」（view）
//   选中   → 「选中节点折到第 N 层、外部不变」（keep）= 默认左键；按住 Cmd 换成「外部能折尽折 + 选中节点折到第 N 层」（min）
// 三条通道的等价入口：
//   view = 未选中时的左键
//   keep = 选中时的左键 / Cmd + Option + 左键 / 右键第一项
//   min  = 选中时的 Cmd + 左键 / 右键第二项
// 全部单层语义——只置节点自己的 fold，绝不动后代 fold（展开后内部折叠状态保持原样）。
// 2026-09-13 用户定：删除「同一数字再点 = 撤回」快照机制（fold 改动已进撤销栈，回退用 Cmd+Z）。
// 定位：画面折叠（含无选中）用 resetView() 居中当前根；选中节点类折叠用 keepView(选中节点) 保持屏幕位置。
let foldBarRuns = {};   // lvl -> { view, min, keep }：三种执行（宿主回 foldBarRun 时按 mode 取用）
let foldBarHovers = {}; // lvl -> 悬停高亮函数（宿主回 foldBarHover 时按 lvl 取用；高亮范围前端按当前选中状态决定）

// 折叠目标：当前选中的节点（多选优先，按选中顺序；单选取 selectedId）。返回节点数组。
function foldTargetNodes() {
  const ids = state.multiSelected.size ? [...state.multiSelected] : (state.selectedId ? [state.selectedId] : []);
  return ids.map(id => findNode(state.tree, id)).filter(Boolean).map(r => r.node);
}
// 折叠目标在当前根子树内的路径数组（不在 currentRoot 子树内的节点跳过，无法参与相对层级折叠）。
function foldTargetPaths() {
  const root = currentRoot();
  if (!root) return [];
  return foldTargetNodes().map(n => pathTo(root, n.id)).filter(Boolean);
}
// 选中子树的最大用户层数（选中节点自身算第 1 层）= 选中类操作的可用上限；多选取最深的那个。
function foldSelMax(paths) {
  let max = 0;
  paths.forEach(p => {
    let D = 0;
    (function d(n, dp) { if (dp > D) D = dp; (n.children || []).forEach(c => d(c, dp + 1)); })(p[p.length - 1], 0);
    if (D + 1 > max) max = D + 1;
  });
  return max;
}
// 层级条统一入口：mode = 'view'（画面按层）/ 'min'（①外部能折尽折）/ 'keep'（②外部不变）；lvl = 按钮数字
function foldRun(mode, lvl) {
  const paths = foldTargetPaths();
  if (mode !== 'view' && (!paths.length || lvl > foldSelMax(paths))) return; // 选中类操作：无选中/超出选中子树层数 → 不执行（宿主已按 selMax 置灰，这里兜底）
  const isSelMode = mode !== 'view';
  pushUndo();
  foldApply(mode, lvl, paths);
  emitUpdate();
  if (isSelMode) keepView(paths[0][paths[0].length - 1]); // 选中节点保持屏幕原位（2026-08-26 位置刷新优化）
  else {
    // view 模式落位（2026-09-15 重做，用户定）：缩放全程不变，按主节点可见性三分——
    // 完整可见 → 原地站住（锚定补偿后画面不动）；被视口截断 → 最小平移露出全卡；
    // 完全不在画面里 → 标准机位（--locate-first-x / --locate-y，缩放仍不变）。
    keepView(currentRoot()); // 锚点 = 主节点；render 末尾 applyPendingKeepView 把它摆回原屏幕位置
    render(); // render 内会调 updateFoldBar 重发状态
    viewFoldLocate();
    return;
  }
  render(); // render 内会调 updateFoldBar 重发状态
}
// 历史模式专属：快照只剩主节点时，把出画/被截断的主节点收进画面（2026-09-18 用户定）。
// 与 viewFoldLocate 同一套三分判据，但**只**被"快照折得只剩主节点"这个特殊场景调用；
// 缩放全程不变，persistNow 在历史模式是空操作。
function historyRootRecenterIfCollapsed() {
  const root = state.historyTree;
  const el = root && document.querySelector('.node-row[data-id="' + root.id + '"] .card');
  if (!el) return;
  const vr = viewMap.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const fullyIn = r.left >= vr.left && r.right <= vr.right && r.top >= vr.top && r.bottom <= vr.bottom;
  if (fullyIn) return; // 完整可见：什么都不做
  const partial = r.right > vr.left && r.left < vr.right && r.bottom > vr.top && r.top < vr.bottom;
  if (partial) {
    // 一半出画：最小平移往画面里收，留 12px 边距（与折叠逻辑同参）
    let dx = 0, dy = 0;
    if (r.left < vr.left) dx = vr.left + 12 - r.left; else if (r.right > vr.right) dx = vr.right - 12 - r.right;
    if (r.top < vr.top) dy = vr.top + 12 - r.top; else if (r.bottom > vr.bottom) dy = vr.bottom - 12 - r.bottom;
    panX += dx / zoom; panY += dy / zoom;
  } else {
    // 完全出画：回自定义中央位（缩放不变）
    const c = worldCenter(el);
    panX = vr.width * cfgNum('--locate-selected-x', 0.5) / zoom - c.x;
    panY = vr.height * cfgNum('--locate-y', 0.5) / zoom - c.y;
  }
  applyTreeTransform(); drawEdges();
}
// view 折叠落位（2026-09-15）：在 render + 锚定补偿之后调用，按主节点卡片可见性三分处理（缩放全程不变）。
function viewFoldLocate() {  const root = currentRoot();
  const el = root && document.querySelector('.node-row[data-id="' + root.id + '"] .card');
  if (!el) { locateCenter(); return; }
  const vr = viewMap.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const fullyIn = r.left >= vr.left && r.right <= vr.right && r.top >= vr.top && r.bottom <= vr.bottom;
  if (fullyIn) { persistNow(); return; } // 完整可见：原地站住（锚定补偿已把根放回原位），什么都不做
  const partial = r.right > vr.left && r.left < vr.right && r.bottom > vr.top && r.top < vr.bottom;
  if (partial) {
    // 被视口截断：最小平移把整卡挪进画面，留 12px 边距喘口气
    let dx = 0, dy = 0;
    if (r.left < vr.left) dx = vr.left + 12 - r.left; else if (r.right > vr.right) dx = vr.right - 12 - r.right;
    if (r.top < vr.top) dy = vr.top + 12 - r.top; else if (r.bottom > vr.bottom) dy = vr.bottom - 12 - r.bottom;
    panX += dx / zoom; panY += dy / zoom;
  } else {
    // 完全不在画面里：回**自定义中央位**（--locate-selected-x / --locate-y，2026-09-18 用户定：
    // 与定位按钮同一落点；原先用 --locate-first-x，用户描述折叠按钮行为就是"跑到自定义中央"→ 统一）
    const c = worldCenter(el);
    panX = vr.width * cfgNum('--locate-selected-x', 0.5) / zoom - c.x;
    panY = vr.height * cfgNum('--locate-y', 0.5) / zoom - c.y;
  }
  applyTreeTransform(); drawEdges(); persistNow();
}
// 纯折叠动作（不含 pushUndo / 定位 / 渲染）
function foldApply(mode, lvl, paths) {
  if (mode === 'view' || !paths.length) {
    if (lvl === 1) { const r = currentRoot(); if (r && r.children.length) r.fold = true; } // 画面只剩主节点（foldByLevelPure(0) 是空操作，单独处理）
    else foldByLevelPure(lvl - 1);
    return;
  }
  if (mode === 'min') foldOffPathSiblings(paths);                  // ① 外部能折尽折（保留所有选中路径链）
  paths.forEach(p => foldSelSubtreeToLevel(lvl, p[p.length - 1])); // ①/② 选中节点折到第 lvl 层
}
// 下钻按钮（左下「进入该节点」）已删（2026-09-21 用户定）：入口收进右键菜单「进入当前节点」，
// 命令 canvas-drill（默认 ⌘=）照常保留 —— 想用快捷键的自己去绑。
function hasSingleSelection() { return !!state.selectedId && !state.multiSelected.size; }
function clearLevelHighlight() { document.querySelectorAll('.card.hl-level').forEach(c => c.classList.remove('hl-level')); }
function highlightLevel(codeDepth) {
  clearLevelHighlight();
  document.querySelectorAll('.node-row[data-depth="' + codeDepth + '"] > .card').forEach(c => c.classList.add('hl-level'));
}
// Mode B 专用：高亮选中节点子树内相对第 relDepth 层（relDepth=0=选中节点自身，1=它的孩子）
// keep=true 时不清除已有高亮（多选：多个选中节点的高亮要同时在场）
function highlightSelLevel(selNode, relDepth, keep) {
  if (!keep) clearLevelHighlight();
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
// 画面按层折叠（数字左键 / mode='view'）：targetDepth=code depth；d<targetDepth 打开路径，d===targetDepth 只折该层（单层语义，更深层 fold 不动）
function foldByLevelPure(targetDepth) {
  const root = currentRoot();
  root.fold = false; // 2026-09-15 修：view 模式 lvl=1 会把主节点折起（root.fold=true），而本函数从不处理 d=0——
                     // 从「只剩主节点」点 2/3/4/5 时没人把主节点展开 → 画面无反应。任何按层折叠（≥2 层）都蕴含主节点展开。
  const walk = (node, d) => {
    if (d > 0) {
      if (d < targetDepth) node.fold = false;
      else if (d === targetDepth && node.children.length) node.fold = true; // 只折目标层（不深折：更深层保持原状、随父折叠而隐藏，打开后不一层层续折）
    }
    node.children.forEach(c => walk(c, d + 1)); // 遍历所有层，深层 fold 状态不变（不中途 return）
  };
  walk(root, 0);
}
// 外部「能折尽折」（菜单① / Cmd + 左键）：沿所有选中路径——路径链保持展开，链上节点的其它兄弟（有孩子）折起；
// 不下钻选中节点的子树（它自己的层由 foldSelSubtreeToLevel 处理）。多选时多条路径链一起保留。
function foldOffPathSiblings(paths) {
  const pathIds = new Set();
  const selIds = new Set();
  paths.forEach(p => { p.forEach(n => pathIds.add(n.id)); selIds.add(p[p.length - 1].id); });
  const walk = (node, d, parentOnPath) => {
    const onPath = pathIds.has(node.id);
    if (d > 0 && !onPath && parentOnPath && node.children.length) { node.fold = true; return; } // 偏路径兄弟只折本层（不深折，打开后不一层层续折）
    if (onPath && !selIds.has(node.id)) node.children.forEach(c => walk(c, d + 1, onPath));    // 只沿路径往下，且不下钻选中节点
  };
  walk(currentRoot(), 0, true);
  paths.forEach(p => p.forEach(n => { n.fold = false; })); // 路径链整体展开（原本折着的祖先也打开，保证画面真的只剩这几条链）
}
// 选中子树折到第 lvl 层（用户层：1 = 只留选中节点自身，它的孩子收起）
// 单层语义：只置目标层节点的 fold，更深层折叠状态原样不动；目标层是叶子就不写 fold（无孩子可折）。
function foldSelSubtreeToLevel(lvl, selNode) {
  const target = lvl - 1; // 用户层 → code depth（d=0 即选中节点自身 = 用户第 1 层）
  const walk = (node, d) => {
    if (d > target) return;                       // 更深的层不碰，也不用再往下走
    if (d === target) { if (node.children.length) node.fold = true; }
    else node.fold = false;                       // 上层展开，露出目标层
    node.children.forEach(c => walk(c, d + 1));
  };
  walk(selNode, 0);
}
// ===== 右下角常驻折叠层级条（2026-08-30 定）→ 2026-08-30 v2：搬进 Obsidian 官方状态栏 =====
// 不再在 iframe 内画悬浮条（和原生状态栏并排很丑）；前端只算层级状态 postMessage 给宿主，
// 宿主用 addStatusBarItem 渲染进原生状态栏，点击发回前端执行折叠。
// 2026-09-13 定案（v2）：数字的作用看有没有选中 —— 未选中 = 画面按层折叠（view）；选中 = 折选中节点、外部不变（keep），
//   按住 Cmd 则换成「外部能折尽折 + 折选中节点」（min）。右键菜单是这两条的等价入口（宿主侧触发，回 mode 参数）。
function updateFoldBar() {
  // 历史只读态也显示折叠条（2026-09-14 用户定）：折叠是"看清楚"的操作，属沙盒允许的一类。
  // 安全性：foldRun → emitUpdate 被守卫挡住（不写回）；pushUndo 压进栈的脏条目由 sandboxRestore 整体还原；
  // 折的是快照树（state.tree 当时即快照树），退出即丢。原来的「历史态直接 hidden」守卫已删。
  const root = currentRoot();
  if (!root) { vscode.postMessage({ type: 'foldBarState', hidden: true }); return; } // 2026-08-30 防御：树未初始化/解析异常时 root 为 null
  // 数字范围 = 整棵树最深层级（1..treeMax+1）—— 固定不随选中变化；单主节点也显示「1」
  let treeMax = 0;
  (function d(n, dp) { if (!n) return; if (dp > treeMax) treeMax = dp; (n.children || []).forEach(c => d(c, dp + 1)); })(root, 0);
  // 选中类操作的可用上限 selMax（用户层）：选中节点自身算第 1 层，多选取最深的那个；
  // 未选中 = 0 → 数字走「画面按层折叠」（不受限）；选中时数字改折选中节点，超出 selMax 的一律置灰。
  const selPaths = foldTargetPaths();
  const selMax = foldSelMax(selPaths);
  // ---- 组状态发宿主：每个 lvl 带悬浮提示文案 + 三种执行 / 一种 hover；宿主按「选中 + 修饰键」选用 ----
  // 文案（2026-09-13 用户定，宿主 refreshFoldTips 按当前状态选用）：
  //   title     未选中节点        →「折叠到第 X 层级」
  //   titleKeep 选中（不按修饰键）→「选中节点」折叠到第 X 层级（同时外部保持不变）（选中后的默认左键行为）
  //   titleMin  选中 + 按住 Cmd   →「选中节点」折叠到第 X 层级（同时外部折叠到最简）」
  //   置灰按钮显示 state.noMore「暂不可用」（宿主换成该文案）
  const levels = [];
  foldBarRuns = {};
  foldBarHovers = {};
  for (let lvl = 1; lvl <= treeMax + 1; lvl++) {
    levels.push({
      lvl,
      label: String(lvl), // label 恒为数字（用户 2026-09-11：点 1 后不要出现 ↩）
      title: T('fold.level', lvl),
      titleKeep: T('fold.levelKeep', lvl),
      titleMin: T('fold.levelMin', lvl),
      menuKeep: T('fold.menuKeep', lvl), // 右键第一项（= 选中后的默认左键行为）
      menuMin: T('fold.menuMin', lvl),   // 右键第二项（= Cmd 快捷键）
    });
    foldBarRuns[lvl] = {
      view: () => foldRun('view', lvl), // 未选中时的左键：画面按层折叠
      min: () => foldRun('min', lvl),   // ① 外部能折尽折 + 选中节点折到第 lvl 层
      keep: () => foldRun('keep', lvl), // ② 外部不变 + 选中节点折到第 lvl 层（选中后的默认左键）
    };
    // 悬停高亮跟着该数字「实际会做什么」走：未选中 = 画面绝对第 lvl 层；选中 = 选中节点内相对第 lvl 层
    // （2026-09-13：不再按修饰键分叉 —— 选中后「不按修饰键」与「按 Cmd」的高亮范围一致，都是选中子树内的相对层）
    foldBarHovers[lvl] = () => {
      if (!selPaths.length) { highlightLevel(lvl - 1); return; } // 没选中 → 与左键的 view 一致
      selPaths.forEach((p, i) => highlightSelLevel(p[p.length - 1], lvl - 1, i > 0)); // 多选全部一起高亮
    };
  }
  vscode.postMessage({ type: 'foldBarState', levels, hidden: false, selMax, noMore: T('fold.noMore') });
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
    // 2026-09-15：被 Minor 埋掉的 Now 不参与定位（用户定）——其子树内的 Now 也必然被埋，整股跳过
    if (nodeIsNow(n) && nowTaintedByMinor(root, n)) return;
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
let locateSavedScroll = null; // hover 子菜单前的视图位置 {zoom, panX, panY}（移出未点击时还原）
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
    locateSavedScroll = { zoom, panX, panY };
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
  const nows = collectUsableNows(currentRoot()); // 2026-09-15：与定位序列同口径（被 Minor 埋掉的 Now 不参与）
  if (nows.length <= 1) return;
  const ids = new Set(nows.map(n => n.id));
  // 高亮只挂在可用 Now 的图标上（被埋的 Now 即便渲染着也不参与计数，保持与定位序列对齐）
  const icoEls = Array.prototype.slice.call(document.querySelectorAll('.now-ico')).filter(el => {
    const row = el.closest('.node-row');
    return row && ids.has(row.dataset.id);
  });
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
  // 沙盒：历史界面里不许改内容 —— 这条是「定位菜单里二次点击同一条 = 就地改标题」的入口
  //（2026-09-14 用户报的最后一处漏网：定位子菜单能编辑）。给 toast 而不是静默，否则用户以为双击失灵。
  if (state.historyMode) { toast(T('toast.histNoEdit')); return; }
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
      const td = splitTodoPrefix(raw); // 待办前缀同样在这里收掉（2026-09-20）：这条内联编辑也是独立写盘路径
      pushUndo();
      node.title = td.text;
      if (td.todo) node.todo = td.todo;
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
        locateSavedScroll = { zoom, panX, panY };
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
      animateScrollTo(s.panX, s.panY, s.zoom, () => { locateSmoothOn = false; });
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
if (btnNowSide) applyProGate(btnNowSide); // Pro 拦截（2026-09-04）：侧边 Now 按钮
// 初始刷新侧边 Now 按钮态（无 Now→置灰；实际激活态由 init 收到的 msg.showNow 经 setShowNow 应用）
updateNowSideBtn();
// 2026-08-30：无 Minor 时按钮加的是 .disabled 类（不用 disabled 属性，为保留 hover tooltip）→ onclick 必须自己拦
document.getElementById('btn-hide-done').onclick = () => {
  const b = document.getElementById('btn-hide-done');
  if (!b || b.disabled || b.classList.contains('disabled')) return;
  setHideDone(!state.hideDone);
};
applyProGate(document.getElementById('btn-hide-done')); // Pro 拦截（2026-09-04）：Minor（隐藏完成）按钮
updatePathMenuBtns(); // 菜单项初始置灰态（「更多」平铺 4 项，函数内有 if 守卫，无按钮时不报错）
// 更多：纯 hover 浮出（CSS #more-wrap:hover #more-menu），点击不再 toggle（避免 toggleMoreMenu 的 fixed 内联定位覆盖 hover 样式）
document.getElementById('btn-more').onclick = (e) => { e.stopPropagation(); };
// 工具栏 hover 子菜单（more 更多菜单）：JS 控制显隐，mouseleave 延迟 220ms 关闭
// —— 避免纯 CSS :hover 在「按钮 ↔ 菜单」间隙的死区导致鼠标一移出按钮菜单就消失、点不到。
// （2026-09-15 定稿：原 fixed/portal 定位分支与 keepAlive 随路径子菜单移入「更多」平铺而删除）
function bindHoverMenu(wrapId, menuId) {
  const wrap = document.getElementById(wrapId);
  const menu = document.getElementById(menuId);
  if (!wrap || !menu) return;
  let timer = null;
  const show = () => {
    clearTimeout(timer);
    menu._hoverTimer = null;
    menu.classList.add('open');
  };
  const hide = () => {
    timer = setTimeout(() => menu.classList.remove('open'), 220);
  };
  wrap.addEventListener('mouseenter', show);
  wrap.addEventListener('mouseleave', hide);
  menu.addEventListener('mouseenter', show);
  menu.addEventListener('mouseleave', hide);
}
bindHoverMenu('more-wrap', 'more-menu'); // 「更多」菜单：hover 浮出（路径 4 项已平铺进菜单，2026-09-15 定稿）

// ===== 左下「更多」菜单的条目显隐（2026-09-18，设置页「更多面板简化」）=====
// 与 main.js 的 MORE_PANEL_TOKENS / MORE_PANEL_LOCKED 一一对应（那边管设置页、这边管渲染）；
// 顺序还有第三处：宿主 buildFrameHtml 里 #more-menu 的骨架 —— 改顺序要三处一起改。
// 这个菜单**不可拖**（用户定）→ 骨架写死顺序，这里只按 hidden 名单收 / 放。
// 2026-09-21 用户定：删除「将该视图存为捷径 / 快捷键 / 设置与 Bug 提报 / 自定义该面板」四项 ——
// 捷径改走命令 canvas-save-shortcut（⌘/）与右键菜单；另三项入口收进设置页与原生快捷键页。
const NM_MORE_ORDER = ['undo', 'redo', 'sep1',
  'path-back', 'path-fwd', 'path-default', 'path-save', 'sep2',
  'history', 'save-snapshot', 'sep3',
  'join-group', 'guide'];
// 锁定项：必须在菜单里、且关不掉（设置页里那几行是「开 + 置灰」）。脏数据里带着它们也一律纠正回来。
const NM_MORE_LOCKED = ['path-back', 'path-fwd', 'path-default', 'path-save', 'history', 'save-snapshot']; // 「设置与 Bug 提报」2026-09-18 用户定允许关闭
// 可见条目 = 顺序里没被关掉的（锁定项永远保留）→ 再过一遍分隔线清理
// （首行 / 末行 / 与前一根相邻都不画，复用「添加面板」那套 nmCleanRows，规则完全一致）
// 分隔线是**全自动**的（2026-09-18 用户定：设置页里没有它们的开关）→ hidden 里带着 sep 也不算数，
// 画不画只由「上下有没有东西」决定：撤销 / 重做被关掉时，最上面那根自己就消失了。
function nmMoreShown() {
  const raw = (state.morePanel && typeof state.morePanel === 'object') ? state.morePanel : {};
  const hidden = new Set(Array.isArray(raw.hidden) ? raw.hidden : []);
  return nmCleanRows(NM_MORE_ORDER.filter(tk => nmIsSep(tk) || !hidden.has(tk) || NM_MORE_LOCKED.indexOf(tk) >= 0));
}
// 应用到静态骨架：条目挂 .hidden（CSS `#more-menu .mm.hidden` 收掉），分隔线按 data-sep 定位
function updateMoreMenu() {
  const menu = document.getElementById('more-menu');
  if (!menu) return;
  const shown = new Set(nmMoreShown());
  NM_MORE_ORDER.forEach((tk) => {
    const el = nmIsSep(tk)
      ? menu.querySelector('.mm-sep[data-sep="' + tk + '"]')
      : menu.querySelector('.mm[data-act="' + tk + '"]');
    if (el) el.classList.toggle('hidden', !shown.has(tk));
  });
}

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
    if (act === 'undo') doUndo();
    else if (act === 'redo') doRedo();
    // 2026-09-15 临时实验：路径 4 项平铺进「更多」（一级按钮隐藏期间）；正式取舍待用户测试后定
    else if (act === 'path-back') historyBack();
    else if (act === 'path-fwd') historyForward();
    else if (act === 'path-default') returnToDefault();
    else if (act === 'path-save') saveAsCurrent();
    else if (act === 'save-shortcut') { // 「将该视图存为捷径」（2026-09-18）：右键「保存为捷径」的可视化形态 —— 对当前视图的根节点建捷径
      const r = currentRoot();
      if (!r) return;
      if (!r.persistId) { r.persistId = genPersistId(); pushUndo(); emitUpdate(); } // 懒分配（捷径指向的 ID 必须先落盘）
      showPrompt(T('ctx.bookmark'), T('ctx.bookmarkHint'), (val) => {
        vscode.postMessage({ type: 'createShortcut', pid: r.persistId, title: r.title || T('common.node'), name: (val || '').trim() });
      });
    }
    else if (act === 'toggle-view') switchView();
    else if (act === 'history') vscode.postMessage({ type: 'openHistoryPanel' }); // 交给宿主打开原生「历史记录」面板
    else if (act === 'save-snapshot') manualSaveSnapshot();
    else if (act === 'join-group') openUrl(JOIN_GROUP_URL); // 更多菜单「加入 28 Notes 微信群」（2026-09-07）
    else if (act === 'guide') openUrl(GUIDE_URL); // 更多菜单「使用指南」（2026-09-17：原 about=B 站，改为使用指南飞书文档）
    else if (act === 'settings') { vscode.postMessage({ type: 'log', text: '更多菜单→打开设置请求发出' }); vscode.postMessage({ type: 'openSettings' }); } // 更多菜单「设置与 bug 提报」（2026-09-01）
    else if (act === 'hotkeys') { vscode.postMessage({ type: 'openHotkeys' }); } // 更多菜单「快捷键」→ 打开原生快捷键页并预填搜索只看本插件（2026-09-18）
    else if (act === 'custom-panel') { vscode.postMessage({ type: 'openSettings', pagePath: [T('settings.uiSimplify'), T('settings.morePanelSimplify')] }); } // 更多菜单「自定义该面板」→ 设置页「更多面板简化」（与节点侧面板的同名按钮同一套，2026-09-18）
    document.getElementById('more-menu').classList.remove('open');
  };
});
updateMoreMenu(); // 按设置页下发的名单收掉被关的条目（含分隔线清理；2026-09-18）
// 画布重新拿到焦点 → 向宿主要一次最新键位表（用户在原生快捷键页改完键、点回画布 → 立即生效；2026-09-18）
// 官方没有「改键了」事件，用拉取代替：focus / init 两次拉取已覆盖「改完键回画布」的真实路径。
window.addEventListener('focus', () => { try { vscode.postMessage({ type: 'getCanvasHotkeys' }); } catch (e) {} });
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
  pendingDropStart = null; // 没走成落位（ESC 取消 / 无效落点 / 拖出窗口）→ 别把起点留到下一次 render
  cleanupDragGhost(); // 兜底（ESC 取消/拖出窗口等未走 drop 的路径）
  stopAutoScroll();
  clearDragHighlights();
});
wlog('webview 脚本加载完成，发送 ready');
window.__MM_FLUSH__ = persistNow; // 宿主 rebind 重建 iframe 前同步调用，把当前 view 立即落盘（2026-09-01 修源思维导图切走丢位置）

// 画布里一有操作就上报宿主「用户在用我」（2026-09-14 修「点左侧文件面板空白处 → 再点回画布，右下角层级数字不出现」）：
// 画布在 iframe 里，鼠标/键盘事件不冒泡到父文档 → Obsidian 不会把本 leaf 置为 active → 不触发 active-leaf-change，
// 宿主的状态栏就一直停在「切走时隐藏」那一态（切走靠点标签页回来才有事件，数字才回来）。补这条通知让宿主把层级条交还本视图。
// 节流 500ms：宿主收到即重绘，没必要每次点击都发一条。
let lastCanvasActiveReport = 0;
function reportCanvasActive() {
  const now = Date.now();
  if (now - lastCanvasActiveReport < 500) return;
  lastCanvasActiveReport = now;
  vscode.postMessage({ type: 'foldBarFocus' });
}
window.addEventListener('pointerdown', reportCanvasActive, true);
window.addEventListener('keydown', reportCanvasActive, true);

vscode.postMessage({ type: 'ready' });
