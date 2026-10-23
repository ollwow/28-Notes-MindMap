// MM MindMap —— 导图界面（垂直树布局 + 交互 + 视图切换 + 格式校验）
// 布局为简单垂直树（从上往下）。美化留待后续统一调整。

// ===== 错误捕获层（调试用）=====
// Obsidian 移植：本脚本运行在视图 iframe 内，宿主（main.js）在注入本脚本前挂 window.__MM_HOST__。
// 前端 → 宿主消息协议与 VSCode 版一致（postMessage({type,...})），宿主直接函数调用处理；
// 宿主 → 前端走 iframe contentWindow.postMessage（下方 window message 监听不变）。
const vscodeApi = (typeof window !== 'undefined' && window.__MM_HOST__) || { postMessage() {} };
function wlog(t) { try { vscodeApi.postMessage({ type: 'log', text: String(t) }); } catch (_) {} }
// 「分屏诊断」专用（2026-10-11 起，排查「左栏弹回去又弹回来」）：走单独的消息类型，
//   让宿主把画布侧这几行也并进**同一条控制台时间轴**（都带 `[分屏诊断]` 前缀，筛一次就能全选粘出来）。
//   ⚠️ 诊断日志**只许打控制台**，不许往 vault / 仓库里写文件（2026-10-12 用户定，规矩在 skill 日常纪律里）。
//   2026-10-18 用户定：总开关 = 设置页调试区的「日志」（宿主随 init / setDebugLog 下发）——
//   关着时画布这边**一行都不发**（不是发了让宿主丢，是压根不发）。
let dbgLogOn = false; // 诊断日志总开关（宿主 settings.debugLog，默认关）
function dbgSplit(t) { if (!dbgLogOn) return; try { vscodeApi.postMessage({ type: 'dbgSplit', text: String(t) }); } catch (_) {} }
//（原 --img-missing-text 已于 2026-09-17 移除：缺失占位改用 <img> 的 alt 文本 —— 伪元素在替换元素上不渲染）
function showError(msg) {
  const box = document.getElementById('error-box');
  if (box) { box.textContent = '⚠ ' + msg; box.className = ''; }
  wlog('ERROR: ' + msg);
}
// 界面可见提示条（webview 的 alert 可能被环境吞掉，一律用这个）
// 🔴 2026-10-01 用户定：**全局只有这一套 toast** —— 底部、白底，与 node-menu 同一套材质。
//   原来还有一套顶部的（#toast，蓝底 / 黄底），那 30 多处提示已全部并入这里；
//   以后新增提示一律只用 toast()，别再建第二个容器、别再写第二套配色。
//   用法：toast(文字, 是否警告, { label, fn }?)
//   · 第二个参数给 true = 警告态：**底仍是白的**，只是前面多个 ⚠、文字换成警告色（这样样式统一、轻重仍分得出来）
//   · 第三个参数 = 可选的撤销按钮（点一下执行 fn 并把提示收掉）
// 提示条停留时长（毫秒，2026-10-01 做成常量好调）：
//   TOAST_MS = 普通提示；TOAST_MS_UNDO = **带撤销按钮**的 —— 后者要留出点按钮的时间，别设太短。
const TOAST_MS = 2600;
const TOAST_MS_UNDO = 4000;
let toastTimer = null;
function toast(msg, isWarn, action, ms) {
  let el = document.getElementById('toast-below');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-below';
    el.className = 'toast-below';
    document.body.appendChild(el);
  }
  el.innerHTML = '';
  const warn = !!isWarn;
  const txt = document.createElement('span');
  txt.className = 'toast-below-msg';
  txt.textContent = (warn ? '⚠ ' : '') + msg;
  el.appendChild(txt);
  if (action && action.label) {
    const btn = document.createElement('a');
    btn.className = 'toast-below-action';
    btn.textContent = action.label;
    btn.onclick = () => {
      el.classList.remove('show');
      clearTimeout(toastTimer);
      try { action.fn(); } catch (_) {}
    };
    el.appendChild(btn);
  }
  el.classList.toggle('warn', warn);
  clearTimeout(toastTimer);
  // ms：调用方指定停留时长（宿主发来的「撤销」提示要 8 秒 —— 比本地两档都长，
  //   因为用户得先读懂"转了哪份文件"再决定要不要点撤销；2026-10-17）
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, ms || ((action && action.label) ? TOAST_MS_UNDO : TOAST_MS));
  el.classList.add('show');
}
// 把「当前选中节点管理的那份文档」报给宿主（2026-10-09）：面板第 4 个分页（管理此文档的思维导图）要用。
//   变化才发（选中在画布里动得很频繁，别每次都发一条消息）。
// 🔴 2026-10-12 扩：除了「选中节点管理的那份文档」，再把**选中节点本身**（id + 标题）一起报上去 ——
//   宿主用它判「转入 → 挂到当前导图的选中节点」能不能用（没选中就弹窗，别硬来）。
//   挂载点没变：refreshSelectionClasses（所有改选中的路都会经过）与 render 末尾各调一次。
let _lastSelDoc = '', _lastSelId = null;
function notifySelDoc() {
  let p = '', id = null, title = '';
  try {
    const r = state.selectedId ? findNode(state.tree, state.selectedId) : null;
    const mg = (r && r.node) ? nmManagedOf(r.node) : null;
    p = mg ? (docLinkPathOf(mg.note) || '') : '';
    if (r && r.node) {
      id = r.node.id;
      // 标题只作**提示文案**用（弹窗/通知里显示"挂到哪个节点下"）→ 压成一行、截断，别把多行/超长标题带过去
      title = String(r.node.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    }
  } catch (_) { p = ''; id = null; title = ''; }
  if (p === _lastSelDoc && id === _lastSelId) return;
  _lastSelDoc = p; _lastSelId = id;
  try { vscode.postMessage({ type: 'selDoc', path: p, selId: id || '', selTitle: title }); } catch (_) {}
}
// 🔴 「被多处管理」的节点被选中 → 底部那条**常驻黄色警告 toast**：**2026-10-09 已整体删除**
//   （用户原话：「我们底部那个 toast 不要了，就现在这个鼠标悬浮这个非常好用，就用这个」）。
//   当初加它的理由（选中就常驻）本身就不成立：用户根本不会去选中那个节点，toast 白放着。
//   现在这条信息由**两处**承载，不再需要 toast：
//     ① 卡片悬浮的**黄底警告小字**（带「（右键管理）」，见 buildCard 里 nmApplyTip 的第 5 个参数）；
//     ② 右键菜单**最前面**那项「管理该文档」（`ctx.manageDoc` → `openDoclibManage`）。
//   ⚠️ 连带删掉的：`toast()` 的 `sticky` 机制（`toastSticky` / `hideStickyToast`）——
//      全项目只有这一处用过 sticky，留着就是死代码。要恢复请看 git 历史（`50a1c27` 及之前）。
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
// AI 输入条（2026-09-28）：声明放这么靠前，是因为 refreshSelectionClasses（选中变化的统一出口）
// 与 showNodeMenu 都要读它，避免 TDZ。
let aiInputBar = null;
let aiInputOn = false;
let aiHintWatcher = null;   // 盯画布行的 class 变化 → 刷新上方提示词（选中路径太多，挂钩子容易漏）
let aiHintRaf = 0;
let aiClosedAt = 0;         // 上次关闭的时间戳：关太久再打开就清空内容
// 关闭后内容保留多久（毫秒）——超过这个时长再打开就清空（2026-09-28 用户定，默认 3 分钟）
const AI_INPUT_KEEP_MS = 3 * 60 * 1000;
const state = { tree: null, selectedId: null, dragId: null, dragIds: null, view: 'map', currentRootId: null, currentRootPid: '', defaultPid: '', currentFilename: '', aiScriptPath: '', warnings: [], selectedImg: null, multiSelected: new Set(), marquee: false, isLink: false, bookmarkHealed: false, bookmarkRetried: false, editingNoteId: null, editingAiRulesId: null, hideDone: false, hideHint: (typeof window !== 'undefined' && window.__MM_HIDE_HINT__ === true), editingTitleId: null, editingTitleEl: null, editingEl: null, dragPreview: null, dragRows: null,
  // 路径历史栈（上一/下一路径）：存 pid 序列，空串=根
  // 上一 / 下一路径能不能走（2026-10-06 起由**宿主**算好下发 —— 历史栈已经跨文件，只有宿主知道全貌）
  navCanBack: false, navCanFwd: false,
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
  morePanel: null,          // 左下「更多」菜单的条目显隐（设置页「按钮简化」；顺序固定，随 init / setMorePanel 下发，2026-09-18）
  aiPlusMenu: false,        // AI 输入条「＋」子菜单开不弹（调试区开关，2026-10-18；默认关 = 点「＋」弹「功能开发中」）
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
// 自动滚动使视口坐标变化时由 tickAutoScroll 按滚动量**算术平移**缓存（2026-10-10，不再每帧全量重读矩形）。
// 配套缓存（dragstart / 这里一次性建好，帧内零 DOM 查询、零矩形重读）：
//   state.dragRectById  —— id → 矩形（预测线 / 落点列 / 主节点右缘都从这里取）
//   state.dragTreeRect  —— treeEl 视口矩形（屏幕 → 本地坐标的换算基准）
//   state.dragVpRect    —— viewMap 视口矩形（自动滚动的边缘判定）
//   state.dragInvalid   —— 无效落点集合（被拖根 + 全体后代），帧内判定 O(1)
//   state.dragCfg       —— 4 个拖拽旋钮（cfgNum 每次调都 getComputedStyle，不能留在帧路径上）
// ⚠️ 例外：自动滚动（贴边滚屏）期间 tickAutoScroll 每帧调本函数全量重测 —— 滚屏后指针
//   虽未动但内容在动，且 pan 可能被别的路径改动，快照平移会脱节（2026-10-10 实报回撤，见该处注释）。
// 拖拽结束一律走 clearDragCaches() 清（drop / dragend 三处）。
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
  state.dragRectById = new Map();
  for (const it of items) state.dragRectById.set(it.id, it);
  state.dragTreeRect = treeEl.getBoundingClientRect(); // 与矩形同帧的换算基准（屏幕距离 / zoom = 本地坐标）
  if (state.dragIds && state.dragIds.length) {
    const dc = state.dragRectById.get(state.dragIds[0]);
    state.dragW = dc ? dc.w : 0;
  } else state.dragW = 0;
}
// 拖拽会话的缓存统一清理（viewMap 的 drop / 卡片的 drop / document 的 dragend 三处都调）
function clearDragCaches() {
  state.dragRects = null; state.dragRectById = null; state.dragTreeRect = null;
  state.dragVpRect = null; state.dragInvalid = null; state.dragRowById = null;
  state.dragCfg = null; state.dragW = 0;
}
// ===== 拖拽诊断（2026-10-18 临时工装，定位「按住 ⌘ 拖 → 松手弹回原位 + 顿 1 秒」）=====
// 🔴 只打控制台（不落盘、不发宿主）：固定前缀 `[拖拽诊断]` + 相对时间轴（+123ms #7）。
//   用户复现后：控制台 Filter 敲「拖拽诊断」→ 全选 → 整段粘回来即可。
//   为什么不用宿主的 log()：画布在 iframe 里，自己 console.log 就落在同一个 DevTools 控制台，
//   少一跳消息、时间轴也更准（宿主那条还要过 postMessage）。
// ⚠️ 定位完要整段删：DBG_DRAG 常量、dbgDrag 函数、所有 dbgDrag(...) 调用（ROADMAP 有记录）。
const DBG_DRAG = true;
let _dbgDragT0 = 0, _dbgDragN = 0, _dbgOverAt = 0, _dbgOverLoggedAt = 0;
function dbgDrag(tag, extra) {
  if (!DBG_DRAG) return;
  try {
    const now = performance.now();
    if (!_dbgDragT0) _dbgDragT0 = now;
    console.log('[拖拽诊断] +' + Math.round(now - _dbgDragT0) + 'ms #' + (++_dbgDragN) + ' ' + tag
      + (extra == null || extra === '' ? '' : ' ' + extra));
  } catch (_) {}
}
// 「添加 → 更多添加项」那个三级面板的开关日志（2026-10-19）：用户实报"第一次能用、后面不行"，
//   这里把 enter/leave/show/hide 全打出来，复现一次就能看出是谁在关它。开关跟拖拽诊断同一个（DBG_DRAG）。
let nmLastPointer = null;
// 上一步的指针位置（2026-10-20）：跟 nmLastPointer 配出"最近这一步往哪边走"，判"是不是正要去二级面板"。
let nmPtrPrev = null;
document.addEventListener('mousemove', (e) => { nmPtrPrev = nmLastPointer; nmLastPointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
function dbgSub(tag, extra) {
  if (!DBG_DRAG) return;
  try { console.log('[三级菜单] ' + tag + (extra == null || extra === '' ? '' : ' ' + extra)); } catch (_) {}
}
// Esc 取消拖拽的标记：drop 被吞时的兜底落位必须能区分「Esc 放弃」和「系统吞了 drop」
let nmDragCanceled = false;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.dragId) { nmDragCanceled = true; dbgDrag('Esc 按下（取消拖拽）'); }
}, true);
function nearestDropTarget(clientX, clientY) {
  if (!state.dragRects) buildDragRects(); // 兜底（dragstart 已建）
  const items = state.dragRects;
  if (!items || !items.length) return null;
  // 旋钮走 dragstart 快照（cfgNum 每次都 getComputedStyle，不能留在每帧 × 每候选的热路径上）
  const dCfg = state.dragCfg || { sticky: cfgNum('--drop-sticky', 0.08), xReach: cfgNum('--drop-x-reach', 0.5), rightSlack: cfgNum('--drop-right-slack', 0), childRange: cfgNum('--drop-child-range', 1) };

  // ① 卡片上：精确命中优先（含整张卡片矩形，不只是中段）
  for (const it of items) {
    if (clientX >= it.left && clientX <= it.right && clientY >= it.top && clientY <= it.bottom) {
      const frac = (clientY - it.top) / it.h;
      let position = frac < 0.3 ? 'before' : frac > 0.7 ? 'after' : 'over';
      // 换挡余量（2026-09-20，旋钮 --drop-sticky）：同一个目标上，要越过判定线再多一点才换挡。
      // 没有它，光标在 30%/70% 线附近抖一抖，落点就在 before/over/after 之间反复横跳，
      // 而预测线的起点按语义在「目标卡」与「它的父卡」之间切换 → 线一闪往上、一闪往下。
      const prev = (state._lastDrop && state._lastDrop.targetId === it.id) ? state._lastDrop.position : null;
      const m = dCfg.sticky;
      if (prev && prev !== position) {
        if (prev === 'before' && frac < 0.3 + m) position = 'before';
        else if (prev === 'after' && frac > 0.7 - m) position = 'after';
        else if (prev === 'over' && frac >= 0.3 - m && frac <= 0.7 + m) position = 'over';
      }
      if (isInvalidDropTarget(it.id)) return { targetId: null, position: 'invalid' };
      return { targetId: it.id, position, rect: it };
    }
  }

  // ② 空白区：**按"被拖节点在不在最右侧"分两套**（2026-10-01 用户定稿）——
  //    在最右侧 → 走"一律当子节点"那套（见下）；
  //    其余情况 → 走**原来那一套**（横向距离筛候选 → 按上下最近选目标 → 两条几何阈值），一字不改。
  //    ⚠️ 为什么其余情况必须回到原来那一套（2026-10-01 用户实报"移到左边时预测不准"）：
  //       "先圈同一行"是按**纵向重叠**圈行的 —— 指针的 y 只要落在远处某张卡的纵向范围内，
  //       那张远处的卡就会赢过手边更近的那张（横向跳台的变体）。原来那套的"横向距离筛"
  //       正好挡掉这种远处同高的卡，所以非最右侧一律保留它。
  const xGap = it => clientX < it.left ? it.left - clientX : (clientX > it.right ? clientX - it.right : 0);
  const xReach = it => Math.max(it.w, 120) * dCfg.xReach; // 横向候选范围（倍数，见 CSS 调参区）
  // —— 最右侧判据（只在空白区判）：被拖节点**左边缘** ≥ 指针所在那一行所有**可见**节点的最右边缘 − 容差。
  //    · 用"可见节点"算：看不见的（出画面 / 折叠 / 被筛选隐藏）不该影响判断 —— 跟肉眼所见一致。
  //    · 判据用**左边缘**（不是右边缘）：宽卡片拖到树中间时不会误触发。
  const vp = state.dragVpRect || viewMap.getBoundingClientRect(); // dragstart 快照（视口矩形拖拽期间不变）
  const inView = it => it.right >= vp.left && it.left <= vp.right && it.bottom >= vp.top && it.top <= vp.bottom;
  // 「整个都出画面了」（与视口毫无重叠）—— 用在下面"目标滚出画面就不显示预测"那条
  const fullyOut = it => it.right < vp.left || it.left > vp.right || it.bottom < vp.top || it.top > vp.bottom;
  const vis = items.filter(it => !isInvalidDropTarget(it.id) && inView(it));
  if (!vis.length) return { targetId: null, position: 'invalid' }; // 只剩自身/子树可拖（或全在画面外）
  // 圈「同一行」：指针纵向落在卡高内 → 这些；都不落 → 取纵向最近的一批（容差 = 卡片半高）
  let row = vis.filter(it => clientY >= it.top && clientY <= it.bottom);
  if (!row.length) {
    let near = vis[0];
    for (const it of vis) if (Math.abs(clientY - it.cy) < Math.abs(clientY - near.cy)) near = it;
    const tol = Math.max(near.h / 2, 12);
    row = vis.filter(it => Math.abs(clientY - it.cy) <= Math.abs(clientY - near.cy) + tol);
  }
  // 🔴 靠左不预测（2026-10-01 用户定）：判据 = **被拖节点左边缘** vs **当前主节点（母节点）卡片的右边缘**。
  //   左边缘 ≥ 母节点右缘 → 照常预测；左于它 → **连预测行为都没有**（线 + 高亮消失、松手不动）。
  //   · 为什么拿"母节点右缘"当界：它是这条竖树"从哪儿开始长出分支"的那条线 —— 拖到它左边，
  //     等于把节点拖回主节点自己那一列甚至更左，那儿本来就没有合法落点（主节点是根、没有兄弟）。
  //   · 为什么用**主节点**而不是"被拖节点自己的母节点"：后者会把"深节点往浅层拖"这种完全正常的操作
  //     一起封掉（深节点的母节点右缘在很右边）—— 判据必须跟被拖节点的深度无关。
  //   · 只判**空白区**：拖到主节点卡片"上"仍然是合法落点（当它的子节点），那条走上面的卡片命中分支。
  const crNode = currentRoot();
  const rr = crNode && state.dragRectById && state.dragRectById.get(crNode.id); // 主节点矩形走快照（dragRects 已过滤宽<1）
  if (rr && clientX < rr.right) return { targetId: null, position: 'invalid' };

  const rowMaxRight = row.reduce((m, it) => Math.max(m, it.right), -Infinity);
  if (clientX >= rowMaxRight - dCfg.rightSlack) {
    // 🔴 最右侧那套（2026-10-01 用户定）：被拖节点左边缘已经越过这一行所有可见节点的右边缘
    //   → 这一放只可能是"当某个节点的子节点"，不再判"同级插入"。
    //   起因（老问题，VSCode 版就报过）：位置判定用的是两条几何阈值 ——
    //     ① 指针上下偏出半个卡片高 → 同级；② 横向离目标中心超过吸附范围 → 同级。
    //   而"往右拖得越远，第 ② 条越容易命中"（dx 随距离增大）→ 越往右越容易被判成同级，
    //   可那儿你几乎只想挂成子节点。
    //   目标怎么选：这一行里取**横向离指针最近**的那个（你拖到最右时，它天然就是最右那个节点）。
    //   ⚠️ 只在"空白区落点"生效；落在卡片上的上/中/下三段完全保留（同一列内的重排靠它）。
    let band = row[0];
    for (const it of row) {
      const g = xGap(it), gp = xGap(band);
      if (g < gp || (g === gp && Math.abs(clientY - it.cy) < Math.abs(clientY - band.cy))) band = it;
    }
    // 目标整个滚出画面 → 不显示预测（2026-10-01 用户定，见下面那条注释；这里同样适用）
    if (fullyOut(band)) return { targetId: null, position: 'invalid' };
    return { targetId: band.id, position: 'over', rect: band };
  }
  // —— 其余情况：原来那一套（横向距离筛 → 按上下最近选目标 → 两条几何阈值）——
  let cands = items.filter(it => !isInvalidDropTarget(it.id) && xGap(it) <= xReach(it));
  if (!cands.length) cands = items.filter(it => !isInvalidDropTarget(it.id)); // 横向全都太远 → 退回全集合，由判定层给「最近节点的兄弟」
  if (!cands.length) return { targetId: null, position: 'invalid' }; // 只剩自身/子树可拖
  let band = cands[0];
  for (const it of cands) { if (Math.abs(clientY - it.cy) < Math.abs(clientY - band.cy)) band = it; }

  // 🔴 目标**整个滚出画面** → 不显示预测（2026-10-01 用户定）：
  //   典型场景 = 拖到右边触发自动滚动，滚着滚着"本来要挂的那个节点"被滚出画面了 ——
  //   这时预测线还画着、却连到一个看不见的节点上，用户根本不知道会挂到哪。
  //   判据用"整个都出画面"（与视口毫无重叠），不是"露一点点"：露一角时用户还看得见，就该照常显示。
  //   position 给 'invalid' → 线和高亮一起消失，且松手不动（drop 分支里 invalid = 不移动）。
  if (fullyOut(band)) return { targetId: null, position: 'invalid' };

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
  const childRange = dCfg.childRange * (prevB === 'over' ? 1.15 : 1);
  if (dx > 0 && dx <= band.w / 2 + Math.max(dragW, band.w) * childRange) {
    return { targetId: band.id, position: 'over', rect: band };
  }
  return { targetId: band.id, position: dy < 0 ? 'before' : 'after', rect: band };
}
// 无效落点：目标在被拖节点自身/集合内/其子树里（父节点不能拖到子节点区域）→ 不显示任何预测 UI（2026-08-22 定）
// 2026-10-10：dragstart 已把「被拖根 + 全体后代」收成 state.dragInvalid（与 .drag-src 标记同一次 walk），
// 帧内查 Set = O(1)；旧走法是「每候选 × 每被拖根」各走一遍 isDescendant 树遍历，大文件下每帧几十毫秒。
function isInvalidDropTarget(targetId) {
  if (!state.dragIds || !targetId) return false;
  if (state.dragInvalid) return state.dragInvalid.has(targetId);
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
// 拖拽源那几张卡的「原地态」标记（.drag-src）摘除（2026-10-01）。
// ⚠️ **不能**塞进 clearDragHighlights()：它每帧都被 applyDragPreview 调一次 → 标记刚挂上就被摘掉，
//    虚线根本来不及出现（实踩：用户报"没变成虚线，什么都没变"）。只在拖拽真正结束时摘：drop / dragend。
function clearDragSrcMark() {
  document.querySelectorAll('#tree .node-row.drag-src').forEach(r => r.classList.remove('drag-src'));
}
// 拖拽中的「节点左中心」= 光标 − 抓点偏移（dragstart 时记）。预测落点与预测线统一用它驱动，不用光标（2026-08-28 定）。
function dragNodeXY(clientX, clientY) {
  return { x: clientX - (state.dragGrabDX || 0), y: clientY - (state.dragGrabDY || 0) };
}
// 跟手悬浮卡定位（2026-08-28）：容器 fixed，锚 = 节点左中心（光标−抓点偏移），与预测线端点同源永不漂。
// top 再减半个卡高：容器左上角 = 缩放后卡片左上角（dragGhostH = dragstart 时卡片屏幕高，已含 zoom）。
// 2026-10-10：left/top 改 transform —— 旧走法每次 dragover 事件都脏一次整树布局，
// 紧接着的矩形读取全部退化成强制重排（拖拽「偶尔卡一下」的主根因）；transform 只走合成器，不碰布局。
function moveDragGhost(clientX, clientY) {
  if (!state.dragGhostEl) return;
  state.dragGhostEl.style.transform = 'translate(' + (clientX - (state.dragGrabDX || 0)) + 'px,'
    + (clientY - (state.dragGrabDY || 0) - (state.dragGhostH || 0) / 2) + 'px)';
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
//   落点列 = 松手后卡片所在的那一列（兄弟插入=目标卡片左缘；变子=末子左缘 / 叶子目标=目标卡右缘）。
//   节点在列右（空白区常态）→ 线完全跟随节点；节点进树内（列左）→ 钉在列上，不横穿真实节点/连线。
//   节点悬在目标附近时左中心≈落点列 → 贝塞尔弯曲与真实连线同几何（dx=(x2-x1)/2≈gap-x/2），不会"弯得比正常慢"。
// 坐标与 drawEdges 同规则：dragSvg 随 treeEl 缩放，path 用本地坐标 = 屏幕距离 / zoom。
// 单独抽成函数（2026-09-20）：落位动画的起点必须与预测线终点**同源**，否则卡片从松手处起步、
// 线却画在落点列上，两者错开一截，看着就是「线从别处闪过去」。
// ⚠️ 2026-10-01 改（用户实报「线尾巴钉住不动」）：**叶子目标不再凭空补一列**。
//   原实现给"没有可见子节点"的目标算出一列 = 目标右缘 + --gap-x(80px)，于是鼠标停在那 80px 区间里
//   左右挪时，线尾一直钉在那一列上不动 —— 观感上也是"卡住"，跟上面那个真 bug 混在一起分不清。
//   现在：叶子目标钉在**目标卡片自己的右缘**（不往外加 80px）→ 鼠标一过卡片右缘线就跟着走；
//   鼠标在卡片里时钉在卡片右缘（本来也不该把线画进卡片内部），不会出现"往回倒着画"。
// 返回 null = 这一档不钉列（线尾完全跟鼠标）；「取不到卡片」也返回 null，由调用方各自的守卫处理。
// 2026-10-10：全部矩形改走 dragstart 快照 state.dragRectById —— 旧走法每次调用最多 3 次全文档
// querySelector + 2 次 getBoundingClientRect，还长在每帧的预测线路径上（拖拽热路径强制重排来源之一）。
// 子节点列表从数据树取（折叠 / 筛选未渲染的子卡不在快照里，天然算「不可见」）。
function dropClampLocalX(dp, tr, s) {
  if (!dp || !dp.targetId) return null;
  const byId = state.dragRectById;
  if (!byId || !tr) return null;
  const srcId = dp.position === 'over' ? dp.targetId : parentId(dp.targetId);
  const cr = srcId && byId.get(srcId);
  if (!cr) return null;
  if (dp.position === 'over') {
    const r = findNode(state.tree, srcId);
    const kids = (r && r.node.children) || [];
    for (let i = kids.length - 1; i >= 0; i--) { // 末个**可见**子卡的左缘（快照里没有 = 未渲染，跳过）
      const kr = byId.get(kids[i].id);
      if (kr) return (kr.left - tr.left) / s;
    }
    return (cr.right - tr.left) / s; // 叶子：钉在目标卡片右缘（原为 + --gap-x，2026-10-01 去掉）
  }
  const kr = byId.get(dp.targetId);
  return kr ? (kr.left - tr.left) / s : null;
}
function updateDragCurve(dp, nodeX, nodeY) {
  if (!dp || !dp.targetId || dp.position === 'invalid' || dp.position === 'root') { dragSvg.innerHTML = ''; return; }
  const srcId = dp.position === 'over' ? dp.targetId : parentId(dp.targetId);
  const cr = srcId && state.dragRectById && state.dragRectById.get(srcId); // 快照取矩形，不查 DOM（2026-10-10）
  const tr = state.dragTreeRect; // 与快照同帧的 treeEl 矩形（buildDragRects / shiftDragRects 维护）
  if (!cr || !tr) { dragSvg.innerHTML = ''; return; }
  const s = zoom || 1;
  const x1 = (cr.right - tr.left) / s, y1 = (cr.top + cr.h / 2 - tr.top) / s;
  // 落点列（= 终点 x 的下限）：null = 这一档不钉列，终点完全跟鼠标（见 dropClampLocalX 注释）
  const colX = dropClampLocalX(dp, tr, s);
  const lx = (nodeX - tr.left) / s;
  const x2 = (colX == null) ? lx : Math.max(lx, colX);
  const y2 = (nodeY - tr.top) / s;
  const dx = Math.max(20, (x2 - x1) / 2);
  dragSvg.setAttribute('width', treeEl.scrollWidth || 10);
  dragSvg.setAttribute('height', treeEl.scrollHeight || 10);
  dragSvg.innerHTML = '<path d="M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2 + '"/>';
}
// 给指定 id 的卡片加高亮类（折叠未渲染则跳过）
// 2026-10-10：优先走 dragstart 建的 id→row 表（document.querySelector 是全文档扫描，
// 预测高亮每帧最多调 3 次 = 每帧 3 次全扫描）；表不存在（非拖拽场景）退回原走法。
function setOnCard(id, cls) {
  if (!id) return;
  const row = (state.dragRowById && state.dragRowById.get(id))
    || document.querySelector('.node-row[data-id="' + id + '"]');
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
// 「大星」那一笔（AI 图标族共用；ai-gen 与 ai-entry 都用它，别抄两遍）
const AI_STAR_BIG = 'M12.6389 21.7717C12.8184 21.6226 12.9401 21.4154 12.983 21.186C13.3278 19.1356 14.3032 17.2437 15.7734 15.7735C17.2436 14.3032 19.1355 13.3279 21.186 12.983C21.4153 12.9402 21.6225 12.8184 21.7716 12.6389C21.9207 12.4594 22.0023 12.2334 22.0023 12C22.0023 11.7667 21.9207 11.5406 21.7716 11.3611C21.6225 11.1816 21.4153 11.0599 21.186 11.017C19.1355 10.6722 17.2436 9.69679 15.7734 8.22657C14.3032 6.75636 13.3278 4.86442 12.983 2.81401C12.9401 2.58462 12.8184 2.37743 12.6389 2.22833C12.4593 2.07924 12.2333 1.99762 12 1.99762C11.7666 1.99762 11.5406 2.07924 11.3611 2.22833C11.1815 2.37743 11.0598 2.58462 11.017 2.81401C10.6721 4.86442 9.69673 6.75636 8.22651 8.22657C6.75629 9.69679 4.86436 10.6722 2.81395 11.017C2.58456 11.0599 2.37737 11.1816 2.22827 11.3611C2.07917 11.5406 1.99756 11.7667 1.99756 12C1.99756 12.2334 2.07917 12.4594 2.22827 12.6389C2.37737 12.8184 2.58456 12.9402 2.81395 12.983C4.86436 13.3279 6.75629 14.3032 8.22651 15.7735C9.69673 17.2437 10.6721 19.1356 11.017 21.186C11.0598 21.4154 11.1815 21.6226 11.3611 21.7717C11.5406 21.9208 11.7666 22.0024 12 22.0024C12.2333 22.0024 12.4593 21.9208 12.6389 21.7717Z';
// 复合图标里那几颗「小星」（遮罩里还要再用一次，见下面各条的注释）
const AI_STAR_MARK = 'M7.38325 17.8616C7.49094 17.7722 7.56396 17.6479 7.58966 17.5103C7.79651 16.2803 8.3816 15.1454 9.26352 14.2635C10.1454 13.3816 11.2803 12.7965 12.5103 12.5897C12.6479 12.564 12.7722 12.4909 12.8616 12.3833C12.951 12.2756 13 12.14 13 12C13 11.86 12.951 11.7244 12.8616 11.6168C12.7722 11.5091 12.6479 11.436 12.5103 11.4103C11.2803 11.2035 10.1454 10.6184 9.26352 9.73648C8.3816 8.85456 7.79651 7.71967 7.58966 6.48972C7.56396 6.35211 7.49094 6.22783 7.38325 6.13839C7.27556 6.04896 7.13999 6 7 6C6.86002 6 6.72444 6.04896 6.61675 6.13839C6.50906 6.22783 6.43604 6.35211 6.41034 6.48972C6.20349 7.71967 5.6184 8.85456 4.73648 9.73648C3.85456 10.6184 2.71967 11.2035 1.48972 11.4103C1.35211 11.436 1.22783 11.5091 1.13839 11.6168C1.04896 11.7244 1 11.86 1 12C1 12.14 1.04896 12.2756 1.13839 12.3833C1.22783 12.4909 1.35211 12.564 1.48972 12.5897C2.71967 12.7965 3.85456 13.3816 4.73648 14.2635C5.6184 15.1454 6.20349 16.2803 6.41034 17.5103C6.43604 17.6479 6.50906 17.7722 6.61675 17.8616C6.72444 17.951 6.86002 18 7 18C7.13999 18 7.27556 17.951 7.38325 17.8616Z';
const AI_STAR_LINK = 'M17.7874 21.8962C17.8682 21.8291 17.923 21.7359 17.9422 21.6327C18.0974 20.7102 18.5362 19.8591 19.1976 19.1976C19.8591 18.5362 20.7102 18.0974 21.6327 17.9422C21.7359 17.923 21.8291 17.8682 21.8962 17.7874C21.9633 17.7067 22 17.605 22 17.5C22 17.395 21.9633 17.2933 21.8962 17.2126C21.8291 17.1318 21.7359 17.077 21.6327 17.0578C20.7102 16.9026 19.8591 16.4638 19.1976 15.8024C18.5362 15.1409 18.0974 14.2898 17.9422 13.3673C17.923 13.2641 17.8682 13.1709 17.7874 13.1038C17.7067 13.0367 17.605 13 17.5 13C17.395 13 17.2933 13.0367 17.2126 13.1038C17.1318 13.1709 17.077 13.2641 17.0578 13.3673C16.9026 14.2898 16.4638 15.1409 15.8024 15.8024C15.1409 16.4638 14.2898 16.9026 13.3673 17.0578C13.2641 17.077 13.1709 17.1318 13.1038 17.2126C13.0367 17.2933 13 17.395 13 17.5C13 17.605 13.0367 17.7067 13.1038 17.7874C13.1709 17.8682 13.2641 17.923 13.3673 17.9422C14.2898 18.0974 15.1409 18.5362 15.8024 19.1976C16.4638 19.8591 16.9026 20.7102 17.0578 21.6327C17.077 21.7359 17.1318 21.8291 17.2126 21.8962C17.2933 21.9633 17.395 22 17.5 22C17.605 22 17.7067 21.9633 17.7874 21.8962Z';
// 「AI 更改规则」候选 B 那颗星（2026-10-06，取自桌面 VI 文件夹的 222.svg）：
//   与 AI_STAR_BIG 同一颗星，但**右下那一段不描边**（原稿就是开口的）—— 缺口正好留给下面三条横线，
//   所以这一版不需要遮罩去抠（ai-rules 那只因为横线压在星上，才要遮罩）。
const AI_STAR_RULES_LINES = 'M11.017 21.186C10.6721 19.1356 9.69673 17.2437 8.22651 15.7735C6.75629 14.3032 4.86436 13.3279 2.81395 12.983C2.58456 12.9402 2.37737 12.8184 2.22827 12.6389C2.07917 12.4594 1.99756 12.2334 1.99756 12C1.99756 11.7667 2.07917 11.5406 2.22827 11.3611C2.37737 11.1816 2.58456 11.0599 2.81395 11.017C4.86436 10.6722 6.75629 9.69679 8.22651 8.22657C9.69673 6.75636 10.6721 4.86442 11.017 2.81401C11.0598 2.58462 11.1815 2.37743 11.3611 2.22833C11.5406 2.07924 11.7666 1.99762 12 1.99762C12.2333 1.99762 12.4593 2.07924 12.6389 2.22833C12.8184 2.37743 12.9401 2.58462 12.983 2.81401C13.3278 4.86442 14.3032 6.75636 15.7734 8.22657C17.2436 9.69679 19.1355 10.6722 21.186 11.017';
const AI_STAR_RULES = 'M19.2555 19.9077C19.3273 19.8481 19.376 19.7653 19.3931 19.6735C19.531 18.8536 19.9211 18.097 20.509 17.509C21.097 16.9211 21.8536 16.531 22.6735 16.3931C22.7653 16.376 22.8481 16.3273 22.9077 16.2555C22.9674 16.1837 23 16.0933 23 16C23 15.9067 22.9674 15.8163 22.9077 15.7445C22.8481 15.6727 22.7653 15.624 22.6735 15.6069C21.8536 15.469 21.097 15.0789 20.509 14.491C19.9211 13.903 19.531 13.1464 19.3931 12.3265C19.376 12.2347 19.3273 12.1519 19.2555 12.0923C19.1837 12.0326 19.0933 12 19 12C18.9067 12 18.8163 12.0326 18.7445 12.0923C18.6727 12.1519 18.624 12.2347 18.6069 12.3265C18.469 13.1464 18.0789 13.903 17.491 14.491C16.903 15.0789 16.1464 15.469 15.3265 15.6069C15.2347 15.624 15.1519 15.6727 15.0923 15.7445C15.0326 15.8163 15 15.9067 15 16C15 16.0933 15.0326 16.1837 15.0923 16.2555C15.1519 16.3273 15.2347 16.376 15.3265 16.3931C16.1464 16.531 16.903 16.9211 17.491 17.509C18.0789 18.097 18.469 18.8536 18.6069 19.6735C18.624 19.7653 18.6727 19.8481 18.7445 19.9077C18.8163 19.9674 18.9067 20 19 20C19.0933 20 19.1837 19.9674 19.2555 19.9077Z';
// 「抠掉」= SVG 遮罩（白底 + 黑色图形 = 挖空）。设计稿里那些白色描边/白色填充只是**抠背景**的做法，
//   不是设计本身 —— 直接照搬会在彩色卡片 / 深色主题上露出白块，所以这里换成遮罩：效果一样、又不引入任何颜色。
//   遮罩里的星用 stroke-width=6（= 设计稿那个白色光晕的粗细），星自己画 2.4 → 中间留出的那圈空隙就是原效果。
const ICONS = {
  // 🔴 2026-10-20：`info` / `gallery-vertical-end` 是**面板那两个分页**用的图标（宿主侧走 setIcon = lucide）。
  //   画布里 `renderIcon` 查的是这张**自绘表**，表里没有就返回空串（"图标不显示、也不报错"）——
  //   跟之前 `renderIcon('more')` 那个坑同源。这里补两条 lucide 原样路径，名字与宿主保持一致。
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'gallery-vertical-end': '<path d="M7 2h10"/><path d="M5 6h14"/><rect width="18" height="12" x="3" y="10" rx="2"/>',
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
  // （「hide-minor」图标已随二级菜单 #fm-minor 一起删除：2026-10-18 —— 展开档的小眼睛用 eye / eye-off）
  'bold': '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
  'circle': '<circle cx="12" cy="12" r="10"/>',
  'circle-dot': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  // 全屏按钮（2026-09-22 用户定，lucide scan）：点击=窗口全屏，Cmd+点击=桌面全屏
  'scan': '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  // 全屏中那颗按钮（2026-09-28 用户定，lucide minimize）：四角朝内 = "点它退出全屏"；
  // 非全屏时仍用上面的 scan（四角朝外）。切换在 applyFsMode 里。
  'minimize': '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  // 复制 AI 定位路径（2026-09-01）：lucide astroid 图标，呼应「AI 星体 / 定位节点」语义
  'astroid': '<path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203" />', // 复制 AI 定位路径图标（2026-09-01 改自 lucide astroid，呼应「AI 星体/定位」语义）；左下 AI 编辑按钮同款（2026-09-27 二轮回退定稿：颜色恒为正常色，不随选中变化）
  // 节点上的 AI 生成标记（2026-10-05 第二版图形，取自 VI 那份精细描边稿）：
  //   ai-gen = 完整闭合的一颗星 —— 纯 AI 生成
  //   ai-mix = 缺一角的星 + 右侧两条竖线 —— AI 打底，混进了人工内容（那两条竖线就是"人工那部分"）
  // ⚠️ 与菜单上那两只（ai-add / ai-minus）**不是同一条 path**：这套描边偏粗（设计稿 2.6），
  //    所以 --ainode-ico-stroke 默认跟着设 2.6，别照菜单图标的粗细去调。
  'ai-gen': '<path d="' + AI_STAR_BIG + '"/>',
  'ai-mix': '<path d="M11.017 21.186C10.6721 19.1356 9.69673 17.2437 8.22651 15.7735C6.75629 14.3032 4.86436 13.3279 2.81395 12.983C2.58456 12.9402 2.37737 12.8184 2.22827 12.6389C2.07917 12.4594 1.99756 12.2334 1.99756 12C1.99756 11.7667 2.07917 11.5406 2.22827 11.3611C2.37737 11.1816 2.58456 11.0599 2.81395 11.017C4.86436 10.6722 6.75629 9.69679 8.22651 8.22657C9.69673 6.75636 10.6721 4.86442 11.017 2.81401C11.0598 2.58462 11.1815 2.37743 11.3611 2.22833C11.5406 2.07924 11.7666 1.99762 12 1.99762C12.2333 1.99762 12.4593 2.07924 12.6389 2.22833C12.8184 2.37743 12.9401 2.58462 12.983 2.81401C13.3278 4.86442 14.3032 6.75636 15.7734 8.22657C17.2436 9.69679 19.1355 10.6722 21.186 11.017"/><path d="M15.3 15.3V20.7"/><path d="M19.3 15.3V20.7"/>',
  // （AI 图标族里给右键那两项用的三只 —— ai-add 星+加号 / ai-minus 星+减号 / ai-locate 星+链环 ——
  //   2026-10-05 随右键那两项整体挪到底部工具条时全删了；新入口用的是上面 ai-entry / ai-mark / ai-link。）
  // ===== 底部工具条「AI」按钮那一组（2026-10-05，设计稿在桌面 VI 文件夹）=====
  //   ai-entry = 大星 + 左上/右下两个小加号  —— 工具条最右那颗「AI」入口按钮
  //   ai-mark  = 开口方框（左边开口）+ 星     —— 「添加 AI 生成标记」（已标记时变主题色）
  //   ai-link  = 两个链环 + 星                —— 「复制 AI 定位路径」
  //   ai-rules = 四条横线（备注那条竖线的横版）+ 星 —— 「添加 AI 更改规则」
  //   「AI 编辑」不另建条目：用的就是 ai-gen 那颗星（同一个图形，靠 CSS 给独立粗细旋钮区分）
  // ⚠️ 设计稿里那几个「白色描边/白色填充」是 Figma 的遮罩与光晕（为在深色底上看得清），
  //    本项目的图标一律 fill:none + stroke:currentColor，所以只取黑色描边那几笔，遮罩用"开口 path"实现。
  'ai-entry': '<path d="' + AI_STAR_BIG + '"/><path d="M4 3V5"/><path d="M5 4H3"/><path d="M20 18V22"/><path d="M22 20H18"/>',
  // ai-mark = 方框（左边两处按设计稿**抠掉**，露出下面那颗星）+ 星
  'ai-mark': '<defs><mask id="nmAiMaskMark" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
    + '<rect x="0" y="0" width="24" height="24" fill="#fff"/>'
    + '<rect x="3.4917" y="14" width="8.43692" height="7" transform="rotate(29.9183 3.4917 14)" fill="#000"/>'
    + '<rect x="1" y="5.30249" width="8" height="7" transform="rotate(-32.5349 1 5.30249)" fill="#000"/>'
    + '<path d="' + AI_STAR_MARK + '" fill="none" stroke="#000" stroke-width="6"/>'
    + '</mask></defs>'
    + '<g mask="url(#nmAiMaskMark)"><path d="M12 3C19.2 3 21 4.8 21 12C21 19.2 19.2 21 12 21C4.8 21 3 19.2 3 12C3 4.8 4.8 3 12 3Z"/></g>'
    + '<path d="' + AI_STAR_MARK + '"/>',
  'ai-link': '<defs><mask id="nmAiMaskLink" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
    + '<rect x="0" y="0" width="24" height="24" fill="#fff"/>'
    + '<path d="' + AI_STAR_LINK + '" fill="none" stroke="#000" stroke-width="6"/>'
    + '</mask></defs>'
    + '<g mask="url(#nmAiMaskLink)">'
    + '<path d="M15.7513 14.6898C16.4231 14.4392 17.0331 14.0471 17.54 13.54L20.54 10.54C21.4508 9.59702 21.9548 8.334 21.9434 7.02302C21.932 5.71204 21.4061 4.45797 20.4791 3.53093C19.5521 2.60389 18.298 2.07805 16.987 2.06666C15.676 2.05526 14.413 2.55924 13.47 3.47003L11.75 5.18003"/>'
    + '<path d="M14.0002 11C13.5707 10.4259 13.0228 9.9508 12.3936 9.60704C11.7645 9.26328 11.0687 9.05886 10.3535 9.00765C9.63841 8.95643 8.92061 9.05961 8.24885 9.3102C7.5771 9.56079 6.96709 9.95291 6.4602 10.46L3.4602 13.46C2.54941 14.403 2.04544 15.666 2.05683 16.977C2.06822 18.288 2.59407 19.542 3.52111 20.4691C4.44815 21.3961 5.70221 21.922 7.01319 21.9334C8.32418 21.9447 9.58719 21.4408 10.5302 20.53L12.2402 18.82"/>'
    + '</g>'
    + '<path d="' + AI_STAR_LINK + '"/>',
  'ai-rules': '<defs><mask id="nmAiMaskRules" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
    + '<rect x="0" y="0" width="24" height="24" fill="#fff"/>'
    + '<path d="' + AI_STAR_RULES + '" fill="none" stroke="#000" stroke-width="6"/>'
    + '</mask></defs>'
    + '<g mask="url(#nmAiMaskRules)"><path d="M17 5H3"/><path d="M21 12H8"/><path d="M21 19H8"/><path d="M3 12V19"/></g>'
    + '<path d="' + AI_STAR_RULES + '"/>',
  // ⚠️ ai-rules 与 ai-rules-lines 是**两只并存的候选**（2026-10-06 用户在做视觉对比）：
  //   ai-rules       = 小星 + 备注框线（四条横 + 一条竖）—— 原方案
  //   ai-rules-lines = 开口大星 + 三条横线（VI 稿 222.svg）—— 候选 B，菜单上现在用这只
  //   定下来之前哪只都别删；删的时候记得连 ICONS 里那条 + AI_STAR_* 常量 + CSS 旋钮一起清。
  'ai-rules-lines': '<path d="' + AI_STAR_RULES_LINES + '"/><path d="M23 14H13"/><path d="M20.6667 17.4H14"/><path d="M21.7778 21H14"/>',
  // 「添加 AI 备注」那颗附属按钮的图标（airemark，2026-10-14）：图形取自桌面 VI 的「添加 AI 备注.svg」，
  //   与上面的 ai-rules **是同一只图形**（备注框线 + 星）—— 设计稿里本就是同一个符号。
  //   另立一条只为名字清楚：ai-rules 那只是「AI 更改规则」的候选并存版（菜单上现在用的是 ai-rules-lines）。
  'ai-remark': '<defs><mask id="nmAiMaskRemark" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">'
    + '<rect x="0" y="0" width="24" height="24" fill="#fff"/>'
    + '<path d="' + AI_STAR_RULES + '" fill="none" stroke="#000" stroke-width="6"/>'
    + '</mask></defs>'
    + '<g mask="url(#nmAiMaskRemark)"><path d="M17 5H3"/><path d="M21 12H8"/><path d="M21 19H8"/><path d="M3 12V19"/></g>'
    + '<path d="' + AI_STAR_RULES + '"/>',
  'trash-2': '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  // 右键菜单「基础操作」四项（2026-09-21 加，均为 lucide 描边式）
  'clipboard': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  // 「复制 = 建副本」（2026-10-18）：copy 加一个加号，跟「拷贝」（进剪贴板）区分开
  'copy-plus': '<line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
  'clipboard-paste': '<path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M9 14h10"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'arrow-right-from-line': '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m11 8 4 4-4 4"/>',
  'arrow-left-to-line': '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m11 8-4 4 4 4"/>',
  'file-pen': '<path d="M11.5 22H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l5 5v6.5"/><path d="M18 22l4-4"/><path d="m15 19 2 2"/><path d="M14 22h-3.5a2 2 0 0 1 0-4H14"/>',
  // lucide **pencil-line**（2026-10-08 用户指定）：文档节点右键「重命名该文档」那一项。
  // 坐标照官方源码抄（jsdelivr 的 lucide-static），别手改 —— 改之前先确认 Obsidian 内置图标库里有没有这个名字。
  'pencil-line': '<path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  // lucide **triangle-alert**（2026-10-09 用户指定）：被多处管理的文档节点用它顶掉文档图标，
  //   颜色由 CSS 染黄（`.node-row.multi-ref .doc-ico`）。坐标照官方源码抄（jsdelivr 的 lucide-static）。
  'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
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
  // 「关闭右侧分屏」（2026-10-11 用户给的设计稿 Group 66.svg，原稿 fill #343434 → 改 currentColor 跟主题/深浅色）
  'close-splits': '<path fill="currentColor" d="M80.762 58.134C79.628 58.134 78.9231 57.2758 78.9231 55.9426L78.9078 35.9594C78.9078 34.6262 79.6127 33.768 80.7467 33.768C81.3597 33.768 81.8501 34.0285 82.509 34.3504L102.201 43.9129C103.504 44.5565 103.917 45.1388 103.917 45.951C103.917 46.7632 103.504 47.3609 102.201 48.0045L82.509 57.5517C81.8654 57.8735 81.375 58.134 80.762 58.134Z"/><path fill="currentColor" d="M45.6778 83.8583C24.0774 83.8583 6.52019 66.3375 6.52019 44.7007C6.52019 23.0638 24.0774 5.54309 45.6778 5.54309C67.3146 5.54309 84.8718 23.0638 84.8718 44.7007C84.8718 66.3375 67.3146 83.8583 45.6778 83.8583ZM35.2236 62.4764C37.4091 62.4764 38.5748 61.6386 40.2868 59.016L45.5321 51.0387H45.8599L50.9231 59.016C52.4894 61.6022 53.7278 62.4764 55.9862 62.4764C58.9731 62.4764 60.9766 60.5458 60.9766 57.7775C60.9766 56.4662 60.5394 55.3005 59.4467 53.9164L52.4529 44.6642L59.4831 35.3393C60.5759 33.9551 61.013 32.7895 61.013 31.5146C61.013 28.7462 59.0096 26.8157 56.0591 26.8157C53.8007 26.8157 52.5258 27.7263 50.9959 30.2761L46.042 38.2533H45.6778L40.4689 30.2761C38.7933 27.6535 37.5913 26.8157 35.3693 26.8157C32.4553 26.8157 30.379 28.7827 30.379 31.551C30.379 32.8623 30.8525 34.028 31.9453 35.4486L38.8298 44.6278L31.7996 53.9892C30.7068 55.3734 30.2697 56.5026 30.2697 57.8139C30.2697 60.5458 32.2731 62.4764 35.2236 62.4764Z"/>',
  // AI 输入条（2026-09-28，lucide）：发送箭头 / 关闭叉
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  // AI 输入条的发送钮（2026-09-28 用户给的自绘图标）：实心圆 + 挖空的上箭头，一体成型。
  // 原图 fill 写死 #0088FF，这里改成 currentColor → 颜色交给 CSS（跟随主题色，粉/灰主题自动变）。
  'send-circle': '<path d="M13.6123 27.2249C11.7389 27.2249 9.97715 26.8683 8.32715 26.155C6.68574 25.4503 5.24199 24.4749 3.9959 23.2288C2.7498 21.9827 1.77012 20.539 1.05684 18.8976C0.352149 17.2476 -0.000195179 15.4858 -0.000195179 13.6124C-0.000195179 11.7304 0.352149 9.96865 1.05684 8.32725C1.77012 6.67725 2.7498 5.2292 3.9959 3.9831C5.24199 2.73701 6.68574 1.76162 8.32715 1.05693C9.97715 0.352245 11.7389 -9.8981e-05 13.6123 -9.8981e-05C15.4943 -9.8981e-05 17.2561 0.352245 18.8975 1.05693C20.5475 1.76162 21.9955 2.73701 23.2416 3.9831C24.4877 5.2292 25.4631 6.67725 26.1678 8.32725C26.8811 9.96865 27.2377 11.7304 27.2377 13.6124C27.2377 15.4858 26.8811 17.2476 26.1678 18.8976C25.4631 20.539 24.4877 21.9827 23.2416 23.2288C21.9955 24.4749 20.5475 25.4503 18.8975 26.155C17.2561 26.8683 15.4943 27.2249 13.6123 27.2249ZM13.6252 6.76748C13.4189 6.76748 13.2127 6.80615 13.0064 6.8835C12.8088 6.96084 12.6111 7.09834 12.4135 7.296L8.05645 11.4726C7.92754 11.6015 7.82441 11.7433 7.74707 11.8979C7.67832 12.044 7.64395 12.2159 7.64395 12.4136C7.64395 12.7917 7.77715 13.1011 8.04356 13.3417C8.31856 13.5737 8.62793 13.6897 8.97168 13.6897C9.36699 13.6897 9.70215 13.5437 9.97715 13.2515L11.5885 11.537L12.2201 10.5702L12.0783 12.5296V18.9362C12.0783 19.3487 12.2287 19.7054 12.5295 20.0062C12.8303 20.2983 13.1955 20.4444 13.6252 20.4444C14.0549 20.4444 14.4158 20.2983 14.708 20.0062C15.0088 19.7054 15.1592 19.3487 15.1592 18.9362V12.5296L15.0303 10.5702L15.6619 11.537L17.2732 13.2515C17.5396 13.5437 17.8748 13.6897 18.2787 13.6897C18.6225 13.6897 18.9275 13.5737 19.1939 13.3417C19.4689 13.1011 19.6064 12.7917 19.6064 12.4136C19.6064 12.2159 19.5678 12.044 19.4904 11.8979C19.4217 11.7433 19.3186 11.6015 19.1811 11.4726L14.8369 7.296C14.6393 7.09834 14.4373 6.96084 14.2311 6.8835C14.0334 6.80615 13.8314 6.76748 13.6252 6.76748Z" fill="currentColor"/>',
  // 「格式」按钮的图标（lucide type）：字形本身会随加粗/红/黄变（见 .nm-fmt-* 那几条 CSS）
  'type': '<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  // 折叠钮里那只**箭头**（2026-10-22）。⚠️ 只有箭头、**不含圆圈** ——
  //   圆由 `.fold-tag` 那个白胶囊的边框自己画（外层结构一律不动）。
  //   换掉原来那个字符 `‹`：字符按行盒居中、字形上下有字体留白，换字体/缩放就会偏一点点
  //   （用户收到"箭头没居中"反馈、自己复现不出来 —— 就是字体差异）；几何图形的居中由 viewBox 保证。
  //   🔴 形状是**瘦长版**（宽 3.6 : 高 8.8），不用 lucide 标准的 chevron-left（4:8 = 45°，看着偏扁）——
  //     折叠钮里那只箭头一直是 `‹` 那种瘦尖的形状，换图标不能把形状也换掉（用户实报"有点变扁了"）。
  //   圆角来自 renderIcon 的 stroke-linecap:round，描边色跟 currentColor（主题色 / minor 灰自动跟随）。
  //   ⚠️ 名字叫 fold-arrow 不叫 chevron-left：它是定制形状，别让别处引用到"标准箭头"时拿到这只瘦的。
  'fold-arrow': '<path d="m13.8 16.4-3.6-4.4 3.6-4.4"/>',
  // （顶部条那对「上一/下一路径」的平箭头图标 2026-10-06 删：标题栏上那两颗是**克隆系统按钮**的，
  //   图标原样沿用系统那对后退/前进箭头，不需要我们自己的图标了。）
  // 「使用指南」菜单项图标（lucide sprout，2026-09-17 由 B 站图标改过来）
  'sprout': '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>',
  // 「思维导图文档库」按钮图标（2026-10-10）：与宿主侧文档库面板那只**同一只**（lucide gallery-vertical-end，
  // = main.js 的 DOCLIB_ICON_SVG；拆成三段 path 交给 renderIcon 走描边渲染，颜色跟 currentColor）。
  'doclib': '<path d="M7 2h10"/><path d="M5 6h14"/><rect width="18" height="12" x="3" y="10" rx="2"/>',
  // 「搜索」菜单项图标（lucide search，2026-10-22）：放大镜
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'file': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
  'folder-closed': '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/>',
  'file-input': '<path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  // lucide:folder-input（2026-10-12）：「转入仓库文件夹」那行的图标 —— 上面那只 file-input 的**文件夹版**
  //   （同款"一条横线 + 右箭头"）。与「转入仓库文档」上下挨着，一眼看出是同一族、一个管文件一个管文件夹。
  'folder-input': '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
  // lucide:brackets（2026-08-30 定：Obsidian 双链 [[ ]] 图标，替换原 file-input）
  'brackets': '<path d="M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3"/><path d="M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3"/>',
  // lucide:file-text（2026-10-08）：「已放入思维导图数据库的文档」节点的图标。与 brackets 分开，一眼看出这个链接指向的是
  //   被收进 28Notes-Files/docs/ 的文档，而不是一张普通笔记。图形 = 上面那只 'file' 加三条正文线。
  'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  // lucide:folder-output（2026-10-08）：「转出到 vault」的菜单图标 —— 文件夹 + 往外的箭头
  'folder-output': '<path d="M2 7.5V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-1.5"/><path d="M2 13h10"/><path d="m5 10-3 3 3 3"/>',
  // lucide:copy（2026-10-08）：文档面板里「复制链接」那颗按钮
  'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  // 节点底部「更多」菜单图标（2026-09-17 加，均为 lucide 描边式）：
  //   image=添加图片 | play=添加视频 | audio-lines=添加音频 | folders=添加仓库内附件
  'image': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'square-play': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/>',
  'audio-lines': '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>',
  'file-plus-corner': '<path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M14 19h6"/><path d="M17 16v6"/>',
  'square-arrow-right-enter': '<path d="m10 16 4-4-4-4"/><path d="M3 12h11"/><path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/>',
  // 🔴 2026-10-10 加：文档节点按**文件类型**换前缀图标（用户定：与右侧文档库面板同一套）。
  //   两只都照抄宿主那边的来源，别自己另画：
  //   · `shin-mindmap` = 插件自己的图标（= 宿主 `MINDMAP_ICON_SVG` / 左侧功能区那颗「新建思维导图」）
  //   · `arrow-up-right` = lucide 官方（= 宿主 `doclibIconOf('mmlink')` 给捷径用的那只）
  'shin-mindmap': '<path fill="currentColor" d="M13.3188 17.2902C10.5293 17.2902 8.26735 15.0216 8.26735 12.2387C8.26735 9.44915 10.5293 7.18719 13.3188 7.18719C14.0047 7.18719 14.6641 7.32568 15.2643 7.57627C15.8446 7.32568 16.4909 7.18719 17.1701 7.18719C19.953 7.18719 22.215 9.44915 22.215 12.2387C22.215 15.0216 19.953 17.2902 17.1701 17.2902C16.4909 17.2902 15.8446 17.1517 15.2643 16.9011C14.6641 17.1517 14.0047 17.2902 13.3188 17.2902ZM18.3703 12.2387C18.3703 13.6301 17.8032 14.8897 16.8931 15.7998C16.9855 15.813 17.0712 15.813 17.1701 15.813C19.1419 15.813 20.7444 14.2105 20.7444 12.2387C20.7444 10.2603 19.1419 8.66439 17.1701 8.66439C17.0778 8.66439 16.9855 8.66439 16.8931 8.67098C17.8032 9.58763 18.3703 10.8472 18.3703 12.2387ZM13.3188 15.813C15.2906 15.813 16.8931 14.2105 16.8931 12.2387C16.8931 10.2603 15.2906 8.66439 13.3188 8.66439C11.3405 8.66439 9.74455 10.2603 9.74455 12.2387C9.74455 14.2105 11.3405 15.813 13.3188 15.813Z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M2.00391 12.4L6.00388 12.4151"/><path fill="currentColor" d="M4 11.4076C3.44772 11.4076 3 11.8553 3 12.4076C3 12.9599 3.44772 13.4076 4 13.4076V12.4076V11.4076ZM8 13.4076H9V11.4076H8V12.4076V13.4076ZM4 12.4076V13.4076H8V12.4076V11.4076H4V12.4076Z"/>',
  'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
};
// 非默认(24x24 描边)图标的渲染参数：vb=viewBox，fill=true 表示填充式（iconify fluent/codicon/mdi/reicon 多为填充）
const ICON_SET = {
  'bug': { vb: '0 0 24 24', fill: false },
  'text-initial': { vb: '0 0 24 24', fill: false },
  'frame': { vb: '0 0 24 24', fill: true }, // 侧边 Ribbon 按钮图标（Frame.svg 内联，节点链接复用）
  'send-circle': { vb: '0 0 28 28', fill: true }, // AI 输入条发送钮：自绘图标是 28×28 的填充式（2026-09-28）
  // 文档节点那只「思维导图」图标（2026-10-10）：自绘的填充式（path 自带 fill/stroke，不受这里影响，
  // 这里标 fill 只是让外层 <svg> 别再加一道描边）
  'shin-mindmap': { vb: '0 0 24 24', fill: true },
  // 「关闭右侧分屏」图标（2026-10-11，用户给的设计稿 Group 66.svg）：圆 + 叉 + 右箭头，
  //   实心填充、原稿 viewBox 是 108×89（不是 lucide 的 24×24）→ 必须在这里单独声明宽高比。
  'close-splits': { vb: '0 0 108 89', fill: true },
};
// 带 <mask> 的图标每渲染一次就换一套唯一 id —— 全局递增计数器（见 renderIcon 里的说明）
let nmIconMaskSeq = 0;
function renderIcon(name, size = 18) {
  const d = ICONS[name];
  if (!d) return '';
  const o = ICON_SET[name] || { vb: '0 0 24 24', fill: false };
  const fill = o.fill ? 'currentColor' : 'none';
  const stroke = o.fill ? 'none' : 'currentColor';
  // ⚠️ 2026-10-08 修（用户实报「右键里那两颗图标跟底部不一样、该抠掉的地方没抠掉」）：
  //   ai-mark / ai-link / ai-rules 这三只带 <mask>，而 mask 的 id 原来**写死**（nmAiMaskMark 等）。
  //   同一个文档里出现第二份时（底部 AI 面板 + 节点右键菜单各一份），`url(#id)` 会解析到**文档里第一个**
  //   同名元素 —— 那个通常在别的容器里、还可能正落在 display:none 的隐藏面板上 → mask 失效，
  //   表现就是"该抠掉的地方没抠掉"。所以每渲染一次就把 id 与 `url(#…)` 引用**一起**换成唯一后缀。
  //   ⚠️ 后缀**一次渲染只算一个**：同一个图标里 `id="…"` 与 `url(#…)` 必须对上 ——
  //      若写成"每匹配一次就 ++"，定义与引用会拿到不同序号（_1 vs _2），遮罩反而彻底失效（2026-10-08 实测抓到）。
  const body = /<mask[\s>]/.test(d)
    ? (() => { const sfx = '_' + (++nmIconMaskSeq); return d.replace(/nmAiMask(\w+)/g, (m0, k) => 'nmAiMask' + k + sfx); })()
    : d;
  return '<svg viewBox="' + o.vb + '" width="' + size + '" height="' + size + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">' + body + '</svg>';
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
// 🔴 动作层的 Pro 门控（2026-10-07 用户问"快捷键能不能绕过" → 能，所以要有这一层）：
//   `applyProGate(el)` 只拦**元素点击**，快捷键 / 命令直接调动作函数、根本不碰那个元素 → 绕过去了。
//   所以受控动作的**函数开头**统一调它：`if (proGuard()) return;`
//   返回 true = 已拦住（并且弹了提示）。
function proGuard() {
  try {
    if (state.isPro) return false;                       // 已激活 / 试用中 → 放行
    toast(T('pro.needActivate'), true);                  // 「此功能激活可用」
    return true;
  } catch (_) { return false; }
}
function applyProGate(el) {
  if (!el || el._proGateAttached) return;
  el._proGateAttached = true;
  el.classList.add('28-pro-gated');
  // 图标容器：工具栏 .tb 按钮自身 innerHTML 就是图标；右键菜单项图标在 .ctx-ic 子节点（只换它、保留文字标签）
  // 图标容器：工具栏 .tb 按钮自身 innerHTML 就是图标；右键菜单项图标在 .ctx-ic 子节点（只换它、保留文字标签）；
  // 二级菜单项 .fm 是「图标 + 文字」，图标在 .fm-ic —— 只换那一格，文字留住（2026-09-27 菜单项加文字后补）
  const iconHolder = el.classList.contains('ctx-item') ? (el.querySelector('.ctx-ic') || el)
    : (el.querySelector('.fm-ic') || el.querySelector('.mm-ic') || el);
  // ⚠️ 2026-10-07 修：AI 二级菜单项（.mm）原来是「svg + .mm-label」两个平级子节点、图标**没有独立容器** →
  //    上面那句 fallback 到 el 本身 → innerHTML 一换就把文字标签也抹了（用户报「字忽然变成空白」）。
  //    配套改动：AI 菜单项渲染时把图标包进 `.mm-ic`（见 ensureAiMenu），这里才认得到它。
  // 注意：原始图标「每次悬浮时才记录」，不要挂在 attach 时记——部分按钮图标是延后渲染的
  // （如「聚焦当前关注」菜单项由 updateNowFilterItem() 在 applyProGate 之后才写入 innerHTML，attach 时记到的是空串，
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
// 「激活 Pro」提示按钮 2026-10-21 搬进 Obsidian 状态栏最右（宿主 updateProStatusBar 管文案/显隐）；
// 画布那颗浮层（#pro-cta / #pro-cta-hint）连同它的显隐、让位逻辑一起删了，这里不再有。
// 链接前缀图标包裹：返回 <span class="link-ico[ node-ico]">SVG</span>，供 renderInline 复用（2026-08-30）
// node-ico 仅节点链接(frame)带，用于独立调大小/粗细（见 mindmap-app.css 的 --node-ico-* 变量）
// doc-ico 仅「已放入思维导图数据库的文档」(file-text)带，同样可单独调（--doc-ico-*，2026-10-08）
function linkIco(name, size = 13) {
  // `.doc-ico` = 文档节点那三只图标（尺寸 / 描边两个旋钮挂在它上面）。2026-10-10 起文档节点
  // 按类型可能显示 file-text / shin-mindmap / arrow-up-right，三只都要吃那两个旋钮。
  const isDocIco = name === 'file-text' || name === 'shin-mindmap' || name === 'arrow-up-right';
  const cls = 'link-ico' + (name === 'frame' ? ' node-ico' : '') + (isDocIco ? ' doc-ico' : '');
  return '<span class="' + cls + '">' + renderIcon(name, size) + '</span>';
}
// Minor 节点前缀图标（2026-08-26）：名称由 CSS 旋钮 --minor-ico 决定（定义在 app.css 顶部调参区）；
// Minor 图标 = 「两条圆头竖线」（2026-09-22 用户在调教器里逐个调完定稿的那组值）。
// 参数含义（都在 24 坐标系里）：w = 线的粗细，gap = 两条线中心距，len = 线长；
//   dx / dy / scale = 位移与缩放（用 transform 做，不动布局）。
// **两处各一套**（用户明确要求分开调）：
//   btn  = 选中节点后那排按钮里的 Minor 按钮（18px）
//   mark = 节点标题前面的小标记（实际渲染尺寸由 CSS 旋钮 --minor-ico-size 控制）
// 要改形状/位置就改这一处常量，不用动渲染代码。
const MINOR_BARS = {
  btn: { w: 2.20, gap: 7.48, len: 16.30, dx: 0, dy: -0.5, scale: 1.10 },
  mark: { w: 2.30, gap: 7.48, len: 18.90, dx: -1, dy: 0, scale: 1.05 },
};
const MINOR_BARS_C = { cx: 12.48, cy: 12.32 }; // 图形中心（沿用原图反算值，保证与用户认可的那版一致）
// 生成双竖线 svg。
// ⚠️ 描边必须写**内联 style**，不能写成 SVG 属性：本文件配的 CSS 里有
//   `.card .minor-ico svg { stroke-width: var(--minor-ico-stroke, 2) }` —— CSS 规则优先于 presentation
//   attribute，写成 stroke-width="2.3" 会被按回旋钮值，节点前那条怎么调都不变粗（2026-09-22 实踩）。
function minorBarsSvg(size, which) {
  const p = MINOR_BARS[which] || MINOR_BARS.mark;
  const y1 = MINOR_BARS_C.cy - p.len / 2, y2 = MINOR_BARS_C.cy + p.len / 2;
  const seg = (x) => '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2
    + '" style="stroke:currentColor;stroke-width:' + p.w + 'px;stroke-linecap:round"/>';
  const tf = (p.dx || p.dy || p.scale !== 1)
    ? ' style="transform:translate(' + p.dx + 'px,' + p.dy + 'px) scale(' + p.scale + ');transform-origin:50% 50%"'
    : '';
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" class="icon"' + tf + '>'
    + seg(MINOR_BARS_C.cx - p.gap / 2) + seg(MINOR_BARS_C.cx + p.gap / 2) + '</svg>';
}
// 2026-09-22 第二轮（用户定）：**取消存量兼容** —— 只要是 Minor 节点，外观一律用出厂图标（现为双竖线），
//   过去写在节点行尾的 `minor:<图标名>`（如 minor:arrow-down）**不再影响显示**。
//   ⚠️ 但那个字段仍**原样留在文件里、原样写回**（serialize 逻辑不动）—— 不主动改写用户文件内容，
//   「往返逐字节不变」是硬规矩；只是渲染时不再看它。
// 出厂图标名来自 CSS 旋钮 --minor-ico（现为 'bars' = 双竖线）；留给将来想整体换图标时用。
function minorIconName() {
  const v = (getComputedStyle(document.documentElement).getPropertyValue('--minor-ico') || '').trim();
  return (v && ICONS[v]) ? v : 'bars';
}
// 节点前缀的 Minor 图标。node 参数保留（调用点照旧传），但**不再读 node.minorIco**（见上面 2026-09-22 第二轮）。
function renderMinorIcon(node, size) {
  const n = minorIconName();
  return n === 'bars' ? minorBarsSvg(size, 'mark') : renderIcon(n, size);
}
// 节点前缀的 AI 生成标记（2026-10-05）：
//   ainode:ai  = ai-gen  完整闭合的一颗星 —— 纯 AI 生成
//   ainode:mix = ai-mix  缺一角的星 + 右侧两条竖线 —— AI 打底，混进了人工内容
// 尺寸与 Now / Minor 前缀一致（12）；颜色一律 currentColor 继承节点字色，**不单设色**（与待办图标同口径）。
function renderAinodeIcon(node, size) {
  const v = ainodeOf(node && node.ainode);
  if (!v) return '';
  return renderIcon(v === 'mix' ? 'ai-mix' : 'ai-gen', size || 12);
}
// （ainodeTip 已于 2026-10-05 删除：AI 图标的悬停提示改成动作向的「清除 AI 标记」——
//   ai / mix 那点差别看图标形状就够了，右键菜单里也另有一句说清。）
function hasAinode(node) { return !!ainodeOf(node && node.ainode); }
// 备注栏左侧的 AI 标记 logo（airemark，2026-10-14）：图形与节点标记**同一套**
//   （ai = 实心星 / mix = 缺角星 + 右侧两条竖线），只是画在备注那一行上。
function renderAiremarkIcon(node, size) {
  const v = airemarkOf(node && node.airemark);
  if (!v) return '';
  return renderIcon(v === 'mix' ? 'ai-mix' : 'ai-gen', size || 14);
}
function hasAiremark(node) { return !!airemarkOf(node && node.airemark); }
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
// **mergedProgress**（2026-09-24 用户定，第九轮 + 同日微调）：母节点自己是待办时，让子节点进度"指挥"边框视觉 ——
//   一层**正常色**底层框（跟其它待办节点一样，继承节点字色）+ 一层**已完成色（灰）**覆盖层（沿边框走 N%）。
//   起点 = **方框顶部（12 点钟）**，顺时针走。走过那段 = **已完成** → 灰；没走那段 = 未完成 → 正常色。
//   0% = 全正常色、100% = 全灰（跟"勾成已完成"那档置灰同色）。
//   点击行为**不变**（仍是 cycleTodoOfNode 切 todo ↔ done）。
// 三处用法：
//   卡片前缀图标 = renderTodoIcon(12, done [, 子进度])   待办=空框 / 已完成=框+勾 / 合并=进度指挥
//   工具条按钮   = renderTodoIcon(18[, !!cmd])           三档都带勾（靠颜色区分：见 CSS）
//   ⚠️ 第三参 mergedRatio（把进度扇形画进图标）已删：2026-09-21 第七轮进度改成独立的百分比文字，不再合一。
function renderTodoIcon(size, withCheck, mergedProgress) {
  const s = size || 12;
  // 圆角方框路径：**起点在 12 点钟（M12 3）** —— 让 stroke-dasharray 从"顶部起顺时针走 N%"，
  //   走过的那段是"已完成"（灰）、没走的那段是"未完成"（正常色）。
  const boxPath = 'M12 3C19.2 3 21 4.8 21 12C21 19.2 19.2 21 12 21C4.8 21 3 19.2 3 12C3 4.8 4.8 3 12 3Z';
  let body;
  if (mergedProgress != null) {
    // 合并模式（仅卡片前缀图标用）：正常色底层 + 已完成色（灰）覆盖层（沿边框从顶部顺时针走 mergedProgress%）
    body = '<path class="td-box-bg" d="' + boxPath + '"'
      + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/>'
      + '<path class="td-box-fill" d="' + boxPath + '"'
      + ' stroke="var(--todo-ico-done-line, var(--minor-text-color, var(--muted)))" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"'
      + ' pathLength="100" stroke-dasharray="' + mergedProgress + ' 100"/>';
  } else {
    body = '<path class="td-box" d="' + boxPath + '"'
      + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    if (withCheck !== false) {
      body += '<path class="td-check" d="M16 9L10.5 14.5L8 12"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    }
  }
  return '<svg viewBox="0 0 24 24" fill="none" width="' + s + '" height="' + s + '">' + body + '</svg>';
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
// 卡片待办图标的 HTML（提示语见下；点击切状态的事件由 attachPrefixIcos 绑）
// 2026-09-21 第七轮：**不再与进度合一** —— 进度改成独立的一小块百分比文字（用户定：进度% / 待办 / Now / Minor 四个都显示）。
// 2026-09-24 第九轮：**合并回来** —— 母节点自己是待办 + **有子待办**（≥ 1）时，让子节点进度指挥边框视觉
//   （正常色底层 + 已完成灰沿边框从顶部起顺时针走）。
//   ⚠️ 两个判定要分清（2026-09-24 同日修 bug 时拆开的）：
//     · **merged（视觉）** = 母是 **todo** + 有子待办 → 画进度边框。
//       母是 done 时不画进度边框，仍走「框+勾 + 置灰」（保留原样式）。
//     · **batch（点击）** = 母是 **todo 或 done** + 有子待办 → 点一下连所有子待办一起切。
//       done 态也必须走这条路 —— 否则「点一下全完成、再点一下想全取消」时，第二次点击会落回
//       cycleTodoOfNode（只切母自己）、子待办纹丝不动，用户看到的就是"再点没反应"（2026-09-24 用户实报）。
//   · 母是 ''（普通）→ 根本不渲染（调用方已判定）。
// 提示语（2026-09-24 用户定；2026-09-27 判据从 merged 放宽到 batch）：
//   **有子待办**（母是 todo 或 done）→ 走应用的 `[data-tip]` **黑框**（用户原话"黑框小提示"），
//     内容 =「子节点完成进度：XX%」；母自己也完成时按规则② 算出来就是 100%（用户要的就是这个）。
//   没有子待办（纯 todo / 纯 done）→ 原生 `title`（与其它图标一致）。
//     ⚠️ 挂黑框时**不设 title**（两个提示会同时冒出来、叠在一起）。
function todoIcoHtml(node) {
  const done = nodeTodoDone(node);
  // 子待办数直接用 collectOpenChildTodos（**不含母节点自己**，与进度口径一致）
  const kidCount = collectOpenChildTodos(node).length;
  const hasKids = kidCount >= 1;
  const merged = !done && node.todo === 'todo' && hasKids;  // 视觉：进度边框（只在 todo 态）
  const batch = (node.todo === 'todo' || done) && hasKids;  // 点击：连子待办一起切（todo / done 都要）
  const cls = 'todo-ico' + (done ? ' td-on' : '') + (merged ? ' td-merged' : '');
  // 进度**只算子节点**（母节点自己不计入分母）：3 个子待办全勾 = 100%
  // ⚠️ 用 batch 而不是 merged 当开关（2026-09-27 用户实报修）：母节点**自己也点完成后**，
  //    merged 变 false（图标要回到"框+勾"，不是进度框），但**提示不该跟着消失** ——
  //    用户要的正是"母也完成了 → 悬浮仍显示 100%"（childTodoPctKidsOnly 的规则②：
  //    母完成 → 子待办一律算完成 → 这时算出来就是 100，与直觉一致）。
  const pct = batch ? childTodoPctKidsOnly(node) : 0;
  // 提示一律走 data-tip（黑色小字浮层）—— 2026-10-05 起四个前缀图标统一，不再用原生 title。
  // 2026-10-06 用户定：尾巴上那句「（按住 ⌘：…）」已撤 —— 图标不挂修饰键，提示就是一句纯动作。
  const tipAttr = batch
    ? 'data-tip="' + T('tip.todoIconProgress', pct) + '" data-side="top"'
    : 'data-tip="' + (done ? T('tip.todoIconDone') : T('tip.todoIconTodo')) + '" data-side="top"';
  return '<span class="' + cls + '" contenteditable="false" '
    + (batch ? 'data-batch="1" ' : '')
    + tipAttr + '>'
    + renderTodoIcon(12, done, merged ? pct : null)
    + '</span>';
}
// ===== 节点前缀图标统一可点（2026-10-05 用户定）=====
// 待办 / Now / Minor / AI 标记四个图标都能点，**一张表 + 一个绑函数** ——
//   以后再加新标记属性，只在这张表里加一行（别再给某个图标单独写一份，用户原话：「不要做复杂化了，最好还是统一这种」）。
// 点一下做什么：
//   · 待办：**两态互切**（待办 ↔ 已完成）；母是待办且**有子待办**时，点一下连整组一起切（合并模式，旧行为）
//   · 其余三个：**取消这个标记**
// ⚠️ 2026-10-06 用户定：**四个图标都不挂修饰键**。原先「⌘/Ctrl + 点击 = 设为非待办节点」那个小操作
//   （连提示里那段括号说明）已整个撤掉 —— 图标就一个行为；要清掉待办属性走底部那颗待办按钮。
//   提示语（悬浮的黑色小字）都写在图标自己的 data-tip 上。
const NM_PREFIX_ICOS = [
  { cls: 'todo-ico',   act: 'todo'   },
  { cls: 'now-ico',    act: 'now'    },
  { cls: 'minor-ico',  act: 'minor'  },
  { cls: 'ainode-ico', act: 'ainode' },
];
// 标题 DOM 每次重建后都要调一次（buildCard / 编辑收尾还原）
function attachPrefixIcos(titleEl, node) {
  if (!titleEl) return;
  NM_PREFIX_ICOS.forEach(def => {
    const el = titleEl.querySelector('.' + def.cls);
    if (!el) return;
    // ⚠️ 用 mousedown 而不是 click（2026-10-07 用户报「编辑态下点不动」）：
    //    编辑态点图标会让标题编辑框失焦 → 编辑收尾 → render() 重建卡片 → 图标元素被换掉，
    //    mouseup 落在新元素上、**click 根本不触发**（click 要求 mousedown/mouseup 同一目标）。
    //    mousedown 立即执行 + preventDefault 保住焦点 —— 与底部那排按钮同款（那边一直这么做）。
    el.onmousedown = e => {
      e.stopPropagation(); // 别冒泡到卡片（否则会顺带触发选中/进编辑）
      e.preventDefault();  // 保住编辑焦点：不让这次点击把编辑会话打断成"失焦收尾"
      // 编辑态里点图标：与快捷键同款 —— 动作做完**回到原来那个地方**（2026-10-07 用户定：
      // 「点图标清状态」和「按快捷键清状态」是同一件事，光标不该被甩到别处）。
      const _editBack = captureEditTarget();
      if (def.act === 'todo') {
        // 待办图标：点一下 = 待办 ↔ 已完成（母是待办且有子待办时连整组一起切）。
        // ⚠️ 2026-10-06 用户定：**撤掉「⌘+点击 = 设为非待办节点」那个小操作**（连提示里那段一起）——
        //   图标就一个行为、不挂修饰键；要清掉待办属性走底部那颗待办按钮。
        if (el.dataset.batch === '1') clickMergedTodoIco(node); else cycleTodoOfNode(node);
        afterMarkClick(node);
      } else {
        clearMarkOfNode(def.act, node);
      }
      if (_editBack) resumeEditTarget(_editBack);
    };
  });
}
// 点完图标后顺手刷一下底部工具条（**只在被点的节点正好是当前选中时** —— 否则会把工具条
//   刷成"另一个节点的状态"，那才是怪事）。工具条是独立 DOM，不跟着 render 走，得单独叫它。
function afterMarkClick(node) {
  if (state.selectedId === node.id || state.multiSelected.has(node.id)) showNodeMenu();
}
// 「取消某个标记」—— 图标点击的公共出口。
// ⚠️ 只作用在**图标所在的那个节点**上：图标长在谁身上就改谁（跟底部那排按钮"作用于整个选中集"是两件事）。
// ⚠️ 刻意**不走 nodeMenuAction** —— 那条会顺手 showNodeMenu()（把底部工具条弹出来），点个图标不该有这个副作用；
//    这里只把该有的副作用抄齐：撤销 / 写盘 / 重绘 / Now 的两处联动。
function clearMarkOfNode(act, node) {
  if (!node || state.historyMode) return;
  if (act === 'ainode') { toggleAinodeOn([node], false); afterMarkClick(node); return; }
  if (act === 'airemark') { toggleAiremarkOn([node], false); afterMarkClick(node); return; } // 备注标记（2026-10-14）：备注栏那颗 logo 点一下走这里
  if (act === 'now') {
    if (!nodeIsNow(node)) return;
    pushUndo();
    node.now = false;
    // 「只看 Now」开着时：按当下重算可见快照（与底部按钮那条一致，节点照旧瞬间隐藏）
    if (state.showNow && nowVisibleSnapshot) nowVisibleSnapshot = computeNowVisible(currentRoot());
    emitUpdate(); renderWithMotion();
    updateNowFilterItem();
    const _nowClosed = checkShowNowAutoClose({ undoable: true });
    if (!_nowClosed && state.showNow) toast(T('toast.hiddenNow'), false, { label: T('common.undo'), fn: () => doUndo() });
    afterMarkClick(node);
    return;
  }
  if (act === 'minor') {
    if (!nodeIsMinor(node)) return;
    pushUndo();
    node.minor = false;
    emitUpdate(); renderWithMotion();
    afterMarkClick(node);
  }
}
// ===== 子待办进度统计（2026-09-24 用户定：**独立的进度条 / 百分比显示整个删掉**，只留 todo-ico 合并模式要用的这些）=====
// 收集参与计数的子待办：**看得见的才算** —— 两个过滤条件：
//   ① **展开着**（fold 分支整个不进 —— 折叠节点自身看得见仍算，2026-09-20 用户定）；
//   ② **没被「隐藏 Minor/Done」收走**（2026-09-24 用户定："如果母节点前面有这个进度的话，
//      我们这个进度应该不计算被隐藏的这些"）—— 判据与 buildRow 的剔除条件同源。
// 2026-09-24 用户改：**Minor 待办也参与计数**（原来排除 Minor，现已取消）。
//   用户原话："子节点如果是 minor 的话，它也参与…它只看展开的这个东西。如果折叠起来我们就不管它了…
//   不管是普通节点还是次要节点什么的，我们不管，我们只看展开的有多少个待办节点。"
//   ⚠️ 「不看 Minor」只针对**参与与否**这件事 —— Minor 节点若**被隐藏**（勾了隐藏 Minor）照样不算（条件②）。
// 规则③（2026-09-21 用户定）：**已完成的待办子节点，它的子树整个不参与计数** ——
//   往下的递归在 done 处**封口**（不下探）：母节点都完成了，它下面那些"算完成还是算没完成"已经没有意义
//   （用户原话："它的母节点自然完成了，子节点不管完成没完成，其实概念上都是已完成"）。
//   实报例子：根 → [x] 某节点 → 它下面 3 个未完成待办。旧口径：分母 8、分子 5 → 63%；
//   新口径：那 3 个不进集合 → 分母 5、分子 5 → 100%（用户要的就是这个）。
function collectOpenChildTodos(node) {
  const out = [];
  (function w(n) {
    (n.children || []).forEach(c => {
      const isTodo = c.todo === 'todo' || c.todo === 'done';
      // 被「隐藏 Minor/Done」收走的 → 它**和它的整棵子树**都不算（buildRow 那边也是整支剔除，别只跳自己）
      if (state.hideDone && (nodeIsMinor(c) || nodeTodoDone(c))) return;
      if (isTodo) out.push(c); // 2026-09-24：Minor 待办也进（不再排除）
      if (isTodo && c.todo === 'done') return; // 规则③：已完成 → 子树封口，不再下探
      if (!c.fold) w(c);
    });
  })(node);
  return out;
}
// **只算子节点**的百分比（2026-09-24 第九轮微调，供 todo-ico 合并模式用）：
// 用户原话："母节点下面有 3 个节点，只有 3 个待办节点，这 3 个待办节点都勾选了，那我这个进度就到百分百"
//   —— 所以母节点自己**不计入分母**（3 个子待办全勾 = 3/3 = 100%，不是 3/4 = 75%）。
// 规则②（2026-09-21 第七轮）：母节点自己被标为完成（done）→ 子待办一律算完成（连坐删除线同款）。
function childTodoPctKidsOnly(node) {
  const kids = collectOpenChildTodos(node);
  if (!kids.length) return 0;
  const motherDone = !!(node && node.todo === 'done'); // 规则②：母完成 → 子待办一律算完成（连坐删除线同款）
  const done = motherDone ? kids.length : kids.filter(c => c.todo === 'done').length;
  return Math.round((done / kids.length) * 100);
}
// 点击合并模式待办框时用的集合（2026-09-24 用户定，**与统计用的那个刻意分开**）：
// 与 collectOpenChildTodos 的差别**只有一条：不封口** ——
//   **已完成**的中间节点，它下面的待办也要一起变（规则③ 只是**统计**口径，不该拦点击）。
//   起因（2026-09-21 用户实报）："点击百分 0，只有子节点完成，它子节点下面的那些待办没完成" ——
//   他的树里有一个已完成子节点，按统计口径不下探，于是点击也跳过了它下面那些；但"全部完成"就该全都要完成。
// 2026-09-24 用户定：**Minor 待办也一起切**（原来排除，现已取消）—— 与统计口径同步。
//   用户原话："如果是 minor 节点，它如果标为未完成的话，它也要参与进来…如果普通节点我们就不管了。"
//   ⚠️ 这里只收**待办节点**（todo/done），Minor **普通**节点（没有 todo 状态）本来就不在集合里，不受影响。
// ⚠️ **折叠分支照样不动**（用户 2026-09-21 明确确认："折叠之后我点这个百分百就不影响它，计算和点击都不影响"）。
//   **别把这两个集合合并**：一个是"看得见多少"（封口），一个是"要动多少"（不封口）。
function collectTodoTargets(node) {
  const out = [];
  (function w(n) {
    (n.children || []).forEach(c => {
      if (c.todo === 'todo' || c.todo === 'done') out.push(c); // Minor 待办也收（2026-09-24 改）
      if (!c.fold) w(c); // 折叠分支不下探（与统计集合同款：折叠里的**既不算、也不动**）
    });
  })(node);
  return out;
}
// 点击**合并模式**下的母节点待办框（2026-09-24 用户定）：
//   母节点自己 + **所有参与计数的子待办**（含已完成节点下面的孙代，见 collectTodoTargets）一起切到同一状态。
//   正向（母 todo → done）：子待办**全部设为已完成** —— 用户原话："点击之后…都也会设为已完成…改为都变成已完成的这个状态"。
//   反向（母 done → todo）：子待办**一起回到未完成** —— 用户 2026-09-24 补的诉求：
//     "我点击母节点，子节点不是全部标为已完成吗？这个时候我如果再点击母节点，那所有子节点应该是全部标为未完成才对。
//      现在是我再点击时候没有反应" —— 根因是母变 done 后不再进合并模式、点击落回 cycleTodoOfNode（只切自己）。
//     修法见 todoIcoHtml 的 data-batch：**只要母是待办（todo 或 done）+ 有子待办，点击就走这条路**。
function clickMergedTodoIco(node) {
  if (!node || state.historyMode) return;
  const target = nodeTodoDone(node) ? 'todo' : 'done'; // 与 cycleTodoOfNode 同一套正向/反向语义
  const kids = collectTodoTargets(node);
  pushUndo();
  node.todo = target;
  kids.forEach(c => { c.todo = target; });
  emitUpdate(); renderWithMotion();
}
// （isPrefixIcoEl 已于 2026-10-05 删除：它当年是为「进编辑时把前缀图标抓出来再插回 / 双击坐标要跳过它们 /
//   取纯文字要排除它们」这三件事服务的。标题重排后图标搬到了编辑区之外（.title 上，正文在 .tt 里），
//   这三件事都不再需要认图标类型 —— 死代码留着一处就多一处要维护。）
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
//   ai=astroid（2026-09-27 加：左下 AI 编辑按钮，与右键「复制 AI 定位路径」同颗小星星；
//     颜色恒为正常色、不随选中变化 —— 2026-09-27 二轮回退定稿，三段式图标方案已弃）
// hide 用 eye（2026-09-29）：装载期先填的就是这个，与 refreshHideBtnSplit 的默认态（没开隐藏 = 睁眼）一致 ——
//   原来填的是 squircle-dashed（两按钮合一之前的旧图标），init 后会被换成 eye/eye-off，
//   于是按钮图标在开屏时整体换个形状（一次可见的跳变）。
const ICON_FIXED = { undo: 'corner-up-left', redo: 'corner-up-right', locate: 'circle-dot', save: 'refresh-cw', slash: 'slash', hide: 'eye', ai: 'astroid', more: 'more-horizontal', full: 'scan', 'join-group': 'message-circle', guide: 'sprout', doclib: 'doclib' };

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

// ===== 节点「AI 更改规则」代码块（2026-10-05）=====
// 落盘格式：备注下面一个围栏代码块，语言名 = AIEditingRules（默认 4 个反引号）：
//   \t> 备注
//   \t````AIEditingRules
//   \t内容（原样，块里写 `- x` / `> x` / `![[x]]` 都不会被当成子节点 / 备注 / 图片）
//   \t````
//   \t- 子节点
// 为什么用代码块而不是又发明一种 Markdown 写法：**可扩展**。以后再加"节点级的特殊内容"，
//   直接换一个代码块名字就行（`AIEditingRules` / 将来的别的），解析器只需认这一种形状。
// ⚠️ 围栏 4 个反引号（不是 3）：规则正文里很可能自带 ``` 代码示例，4 个才不会提前闭合。
const AI_RULES_LANG = 'AIEditingRules';
const AI_RULES_FENCE = 4; // 默认围栏长度（用户定 4；读的时候 3 个以上都认，写回时保持原长度）
// 实际要写的围栏：内容里若出现「整行都是反引号」的行，围栏必须比它长，否则那块会被提前关掉
function aiRulesFenceOf(node) {
  const want = Math.max(3, (node && node.aiRulesFence) || AI_RULES_FENCE);
  let need = 0;
  String((node && node.aiRules) || '').split('\n').forEach(l => {
    const m = l.trim().match(/^`+$/);
    if (m) need = Math.max(need, m[0].length);
  });
  return '`'.repeat(Math.max(want, need + 1));
}
function parse(text) {
  // empty（2026-10-11）= 正文里**没有主节点那一行**（如把主节点整棵剪切走了、或用户手动把正文删空）。
  //   这是结构性判据，不是拿 title 判断 —— 用户完全可能真的把节点起名叫「未命名」，拿文字判会误判。
  const root = { id: 'root', title: '未命名', empty: false, note: '', aiRules: '', aiRulesFence: 0, images: [], embeds: [], fold: false, persistId: '', color: '', todo: '', ainode: '', airemark: '', rawLines: [], rawMeta: [], children: [] };
  const stack = [{ indent: 0, node: root }];
  let lastNode = null;
  let rootSeen = false;
  const warnings = [];
  // 换行符统一归一成 \n（2026-09-29）：Windows 记事本等编辑器出来的是 CRLF，行尾残留的 \r 会让
  // 「列表行」正则失配（`.` 不吃 \r，非多行模式下 `$` 也不落在 \r 之前）→ 整行被当成不认得的行，
  // 节点名退回默认「未命名」。所有进解析的文本（打开文件 / 粘贴 / 拖入 / 文本视图）都在这里统一。
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  // 节点内换行（2026-08-30）：节点文字可多行，落盘就是 Markdown 大纲的天然写法，无特殊标记——
  //   标题续行 = 节点行后「不带 `- ` 的纯文字行」（同缩进；Markdown 惰性续行，前导 Tab 不作数）；
  //   备注续行 = 连续多个 `> ` 行；夹在续行之间的空行 = 文字内空行（段落间距）。
  //   lastAttach 记上一个有效行的类型，决定纯文字续行归标题还是备注（刚写完备注时续行归备注）。
  let lastAttach = null;
  let aiFenceLen = 0; // >0 = 正在 AI 更改规则代码块里（值是开围栏的长度，闭合要 ≥ 它）
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
    // 代码块内（2026-10-05）：块里的行**一律当内容**，先于下面所有识别处理 ——
    //   这正是用代码块的原因：内容里写 `- x` / `> x` / `![[x]]` 都不会被误认成子节点 / 备注 / 图片。
    //   ⚠️ 必须放在「空行」判断**之前**：块里的空行也要原样收进内容（写回时是 `节点缩进 + 空`）。
    if (aiFenceLen) {
      const closeM = raw.match(/^[\t ]*(`{3,})[\t ]*$/);
      if (closeM && closeM[1].length >= aiFenceLen) { aiFenceLen = 0; lastAttach = 'aiRules'; continue; }
      // 剥掉「节点缩进 + 1 Tab」（跟备注行的 sub 同款）；缩进不标准时兜底只剥前导空白
      const sub = '\t'.repeat(((stack[stack.length - 1] || { indent: 0 }).indent) + 1);
      const cl = raw.indexOf(sub) === 0 ? raw.slice(sub.length) : raw.replace(/^[\t ]+/, '');
      lastNode.aiRules = lastNode.aiRules ? lastNode.aiRules + '\n' + cl : cl;
      continue;
    }
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
        root.ainode = ainodeOf(meta.ainode); // AI 生成标记（2026-10-05）：ai / mix，空 = 普通
        root.airemark = airemarkOf(meta.airemark); // 备注的 AI 生成标记（2026-10-14）：只管备注那一块
        root.rawMeta = unknownMetaOf(meta); // 不认识的键原样留着，写回时拼回去（2026-10-14）
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
      // 整行链接的节点（[[...]] / [显示名](url/file:///path)）也**原样留在正文里**：
      //   2026-09-29 起不再抽成独立的 link 字段 —— 链接就是正文那一行的一种形态，
      //   渲染时按 nmPureLinkOf() 判定「整行是不是一个纯链接」决定怎么画。
      const mf = minorFieldOf(meta); // minor 值 → { on, ico }（2026-09-20：minor 值可以带图标名）
      const node = {
        id: genId(),
        title: t,
        note: '', images: [], embeds: [],
        bold: bold,
        aiRules: '', aiRulesFence: 0, // AI 更改规则代码块（2026-10-05）：内容 + 原围栏长度（0 = 没有）
        minor: mf.on, minorIco: mf.ico, // v2：Minor 走行尾注释（2026-08-29）；2026-09-20 起值可带图标名
        fold: meta.fold === '1' || meta.fold === 'true',
        persistId: meta.id || '',
        color: meta.color || '',
        now: meta.now === '1' || meta.now === 'true', // Now 节点（2026-08-27）
        ainode: ainodeOf(meta.ainode), // AI 生成标记（2026-10-05）：ai / mix，空 = 普通；与外部大模型约定，由它在改写时自己写
        airemark: airemarkOf(meta.airemark), // 备注的 AI 生成标记（2026-10-14）：只管备注那一块
        todo: todo, // 待办状态：'' 普通 / 'todo' 待办 / 'done' 已完成（2026-09-20；走 Markdown 原生 checkbox 前缀，不进注释）
        rawLines: [],
        rawMeta: unknownMetaOf(meta), // 不认识的键原样留着，写回时拼回去（2026-10-14）
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
      // AI 更改规则代码块的开头（2026-10-05）：```AIEditingRules（读时 3 个以上都认，写回按记住的长度）。
      //   一个节点只留一个块 —— 重复出现时后面那个覆盖前面（跟备注"后来的块不覆盖"不同，这是刻意的：
      //   规则是"唯一一份指令"，出现两份没有意义）。
      const aiOpenM = t.match(/^(`{3,})\s*AIEditingRules\s*$/);
      if (aiOpenM) {
        lastNode.aiRules = '';
        lastNode.aiRulesFence = aiOpenM[1].length;
        aiFenceLen = aiOpenM[1].length;
        lastAttach = 'aiRules';
        continue;
      }
      // v2 附件（2026-08-29）：![[文件名]] wikilink（集中放 28Notes-Files/，按扩展名分图片/音视频嵌入）；
      // 兼容读 v1 的 ![](路径)（序列化时统一写回 ![[文件名]]）
      const embM = t.match(/^!\[\[([^\]]+)\]\]$/);
      if (embM) {
        // 全名可能带 Obsidian 尺寸后缀（![[img.png|700]]）—— 原样存（保真，写回不丢），判类型用剥掉尺寸的名字
        const embFull = embM[1].trim();
        const embName = nmEmbedSize(embFull).name;
        if (isMediaFile(embName)) lastNode.embeds.push(embFull);
        else lastNode.images.push(embFull);
        lastAttach = 'attach';
        continue;
      }
      if (/^!\[.*\]\(.*\)$/.test(t)) {
        const m = t.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
        lastNode.images.push(m ? m[1] : t);
        lastAttach = 'attach';
        continue;
      }
      // 子行链接：整行就是一个链接（v2 wikilink [[...]] 或标准 Markdown 链接，可 ** 加粗包裹）。
      // 2026-09-29 起**并入正文**（不再有独立 link 字段）—— 旧文件里那种「标题 + 独立链接行」的结构
      // 读进来就是正文的第二行，内容一条不丢；写回时按正文续行输出（行序会归到「正文紧跟着链接」）。
      const subLinkM = t.match(/^(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))$/);
      const subLinkBold = t.match(/^\*\*(\[\[.*\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))\*\*$/);
      if (subLinkM || subLinkBold) {
        lastNode.title = (lastNode.title || '') + '\n' + (subLinkM ? subLinkM[1] : subLinkBold[1]);
        if (subLinkBold) lastNode.bold = true;
        lastAttach = 'title';
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
  root.empty = !rootSeen; // 正文没有主节点行 = 空图（画面走「新建母节点」按钮，见 render 的 emptyMap）
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
    // 本文件节点链接的断链检测（2026-09-29：链接在正文里 —— 逐行看，正文任何一行整行是节点链接都查）
    String(n.title || '').split('\n').forEach((line) => {
      const lk = nmPureLinkOf(line);
      if (!lk) return;
      const nl = resolveNodeLink(lk);
      if (nl && nl.kind === 'same' && !findByPersistId(root, nl.pid)) {
        warnings.push(T('warn.deadLink', lk));
      }
    });
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
// 行尾注释里**这一版认识的**键（2026-10-14）。
//   🔴 加新键时**必须**在这里补一行 —— 漏了的话新键会被当成「不认识的键」原样保留，
//      结果是文件里同一段注释出现两份（新键自己写一份、rawMeta 又拼一份）。
const KNOWN_META_KEYS = { id: 1, fold: 1, color: 1, minor: 1, now: 1, ainode: 1, airemark: 1 };
// 把**这一版不认识的键**挑出来（保持文件里的原始顺序），交给节点存着，写回时原样拼回去。
//   为什么要有它（2026-10-14）：commentFor() 是「按认识的字段重建整条注释」，不认识的一律丢 ——
//   于是旧版本打开新文件、一保存就把新键抹了（跨版本静默丢数据）。
//   存下未知键之后，**同一份代码无论认不认识都能把别人的键原样带过去**，回退版本不再丢数据。
//   ⚠️ 值里的 `;` 会被 splitComment 切开（现有行为，未知键同此），不额外处理。
function unknownMetaOf(meta) {
  const out = [];
  if (meta) Object.keys(meta).forEach(k => { if (!KNOWN_META_KEYS[k]) out.push(k + ':' + meta[k]); });
  return out;
}

// AI 生成标记（ainode，行尾注释）—— 2026-10-05 新增：
//   ainode:ai  = 纯 AI 生成的内容
//   ainode:mix = 含人工内容（AI 改写已有的人工内容，或 AI 生成的内容被人改过）
//   没有这个键 = 普通节点（默认，文件里保持干净）。
// 标记**由外部大模型在改写文件时自己写**（契约写在 AI/System Files/spec.md），插件只负责读出来 + 显示 + 手动切换。
// 值只允许这两种：大小写归一后认，其它脏值一律当"没有标记"——宁可丢一个标记，
// 也别把认不出来的值带进 round-trip（它会让 serialize 写出插件自己也读不懂的东西）。
function ainodeOf(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return (s === 'ai' || s === 'mix') ? s : '';
}
// 编辑过的 AI 节点降为「混合」：ai → mix；本来就是 mix / 普通 → 不变（单向，不回头）
function ainodeAfterEdit(v) { return ainodeOf(v) === 'ai' ? 'mix' : ainodeOf(v); }
// 备注的 AI 生成标记（airemark，行尾注释）—— 2026-10-14 新增：
//   与 ainode **同一套取值**（ai / mix / 空），区别只在「管谁」：
//     ainode   = 这个节点自己的内容（标题 / 备注 / 图片 / 嵌入）
//     airemark = 只管这个节点的**备注**那一块
//   没有这个键 = 备注没被标记。
//   ⚠️ 名字刻意避开 ainote —— 与 ainode 只差一个字母、又同族同位置，外部大模型写文件时极易写串。
function airemarkOf(v) { return ainodeOf(v); }
// 备注被人改过 → 备注标记降为「混合」（与 ainodeAfterEdit 同款单向规则）
function airemarkAfterEdit(v) { return ainodeAfterEdit(v); }

// 多行标题的续行是否「会被误读」（2026-09-03 修「一个节点裂成多个」）：
//   续行行首 `- `/`* `/`+ ` → 被当成子节点；`>` → 备注；`!` → 图片/嵌入；
//   `\` 自身是转义符，也要转义自己（否则用户写的 `\- x` 认回来会变成 `- x`）。
// 这类续行落盘时行首补一个 `\`（标准 Markdown 转义写法），parse 剥掉一个 `\` 认回文字——
// 于是节点多行文字里可以写任何内容（项目符号、`>` 引用、`![[图片]]`），不再被拆成多个节点。
// ⚠️ 整行链接**不再转义**（2026-09-29）：链接并入正文后，parse 见到整行链接也是并进正文，
//   两边口径一致 → 往返稳定，且文件里不会出现 `\[名](url)` 这种带反斜杠的怪样子。
function needsTitleEsc(line) {
  // 判断一律用「去掉前导空白后」的文本（和 parse 的 contKind 一致）：从别处复制来的缩进列表（`   + x`）
  // 前导是空格不是 Tab，插件同样认不得，也会被甩进「不认得的行」弹警告条，所以一并转义。
  const t = String(line).trim();
  if (!t) return false;                                                                              // 空行不用转义
  if (/^[-*+]\s/.test(t)) return true;                                                               // 列表符号（会被当成子节点）
  if (/^[>!\\]/.test(t)) return true;                                                                // 备注 / 图片嵌入 / 转义符本身
  return false;
}
// ============ 序列化（输出：第一行根 + Tab 缩进子节点） ============
// 单一分支：缩进 = 层级数（根 depth 0 = 0 个 Tab），所有层级都输出备注/图片/嵌入/链接
// v2（2026-08-29）：Minor 走行尾注释 minor:1（不再 _x_ 包裹）；图片/音视频 = ![[文件名]] wikilink
// noId=true：复制节点用（去掉 `<!--id:xxx-->` 避免副本冲突，折叠 fold 保留，链接引用保留）
// onlyVisible=true：**复制**节点用（2026-10-07 用户定：所见即所得 —— 画面上被筛选藏起来的节点不进剪贴板）。
//   判据与渲染**同源** = childVisible()（「隐藏 Minor/Done」+「只看 Now」两套筛选都在里面），别在这里另写一套。
//   ⚠️ 写文件 / 快照 / 文本视图一律不传 → 完整输出（数据层必须完整，只有"复制"才按可见裁剪）。
// doneChain：祖先链上是否已完成（与 buildRow 的 doneChain 同义），只在 onlyVisible 时用得到。
// stripMeta（2026-10-19）= 「清除格式拷贝」：行尾那截 `<!--id; fold; color; minor; now; ainode; airemark-->`
//   整个不写。**只去这截 HTML 注释** —— 待办的 `- [ ]` 前缀、`**加粗**`、代码块、备注、缩进层级全都照旧。
function serialize(node, depth, noId, onlyVisible, doneChain, stripMeta) {
  // 空图（正文里没有主节点那一行，2026-10-11）：整棵序列化成**空文本**。
  // 写盘 / 自动快照 / 撤销栈 / 复制这几条路都调这个函数 —— 在这一层拦一次，
  // 好过在每个调用点各判一次（上一版只在 serializeFull 里判，结果写盘走的是这里，
  // 空图被写回一行「- 未命名」，用户实报「删掉之后文件里又自己长出来了」）。
  if (node && node.empty) return '';
  depth = depth || 0;
  const pad = '\t'.repeat(depth);      // 根（depth 0）无缩进，子节点 1 个 Tab/级
  let head = node.title; // 链接就是正文那一行（2026-09-29 起不再有独立的链接字段）
  if (node.bold) head = '**' + head + '**';         // 加粗：标题行内标记（标准 Markdown 语义）
  // 待办前缀（2026-09-20）：写在加粗**外面**（`- [ ] **x**`，这才是标准写法），且只在首行
  if (node.todo === 'todo' || node.todo === 'done') head = todoPrefixOf(node.todo) + head;
  // 多行标题（2026-08-30 换行）：首行带 `- ` 与行尾注释，后续行 = 同缩进纯文字续行（不带 `- `，解析器原样认回）；空续行 = 文字内空行
  const headLines = String(head == null ? '' : head).split('\n');
  const out = [pad + '- ' + headLines[0] + commentFor(node, noId, stripMeta)];
  for (let li = 1; li < headLines.length; li++) out.push(pad + (needsTitleEsc(headLines[li]) ? '\\' : '') + headLines[li]);
  const sub = pad + '\t';
  if (node.note) node.note.split('\n').forEach(l => out.push(sub + (l ? '> ' + l : '>'))); // 多行备注：一行一个 `> `，空行写 `>`
  (node.images || []).forEach(p => out.push(sub + (isWikilinkName(p) ? '![[' + p + ']]' : '![](' + p + ')')));
  (node.embeds || []).forEach(p => out.push(sub + '![[' + p + ']]'));
  (node.rawLines || []).forEach(l => out.push(l)); // 不认得的行原样写回（保留不丢，位置跟着所属节点走）
  // AI 更改规则（2026-10-05）：**排在这个节点所有内容的最下面**（图片 / 嵌入 / 不认得行之后），子节点之前。
  //   为什么放最后（用户 2026-10-05 定）：它管的是**这个节点**的规则 ——「我上面这些内容都遵循它」，
  //   放最下面语义才对得上；顺序 = 标题续行 → 备注 → 图片/嵌入 → 不认得行 → AI 规则 → 子节点。
  if (node.aiRules) {
    const fence = aiRulesFenceOf(node);
    out.push(sub + fence + AI_RULES_LANG);
    node.aiRules.split('\n').forEach(l => out.push(sub + l)); // 内容原样（块里的空行就是空行）
    out.push(sub + fence);
  }
  // 含自己的 done 链（与 buildRow 里的 `done` 同义）：childVisible 要拿它判「父链是不是已完成」
  const doneHere = doneChain || nodeIsMinor(node) || nodeTodoDone(node);
  node.children.forEach(c => {
    // 复制时只带画面上看得见的子节点 —— 判据走 childVisible（与渲染同源，别在这里另写一套）。
    // 2026-08-25 起就是「隐藏下只复制未隐藏部分」，2026-10-07 扩成两套筛选都算（用户定：所见即所得）。
    if (onlyVisible && !childVisible(c, doneHere)) return;
    out.push(serialize(c, depth + 1, noId, onlyVisible, doneHere, stripMeta));
  });
  return out.join('\n') + (depth === 0 ? '\n' : ''); // 最外层补结尾换行（写文件用）
}
// 图片引用是否已是 wikilink 文件名（无路径分隔符 = 集中存放的文件名；带路径的是 v1 兼容读入的相对路径，原样写回）
function isWikilinkName(p) { return p && !/[\\/]/.test(p) && !/^(https?:)?\/\//.test(p); }
// 文本视图 = 文件真实内容（含根行，无 # 标题）
function serializeFull(tree) {
  // 空图（没有主节点）→ 正文写空。别把兜底那个「未命名」写回文件，
  // 否则下次打开又变成一个真主节点，等于空态存不住（2026-10-11）。
  if (tree && tree.empty) return '';
  return serialize(tree).trim() + '\n';
}
function commentFor(node, noId, stripMeta) {
  // 行尾注释：只有被复制链接的节点才有 id；折叠的节点有 fold；改色的节点有 color；Minor/Now 也是节点状态。平时文件干净。
  // stripMeta（清除格式拷贝，2026-10-19）：整截都不写 —— 这是唯一被去掉的东西，其余（待办前缀 / 加粗 /
  //   代码块 / 备注 / 缩进）一个字不动。
  if (stripMeta) return '';
  const parts = [];
  if (!noId && node.persistId) parts.push('id:' + node.persistId);
  if (node.fold) parts.push('fold:1');
  if (node.color) parts.push('color:' + node.color);
  // Minor 次要（v2：2026-08-29 起走注释，不再 _x_ 包裹）；
  // 2026-09-20 起值可带图标名（`minor:triangle-down`），不带名写回老写法 `minor:1`（= 用 CSS 旋钮那个图标）
  if (node.minor) parts.push('minor:' + (node.minorIco && ICONS[node.minorIco] ? node.minorIco : '1')); // Minor 次要；节点级图标名照原样写回（保护存量文件往返不变，2026-09-20）
  if (node.now) parts.push('now:1'); // Now 节点（2026-08-27）
  if (node.ainode) parts.push('ainode:' + node.ainode); // AI 生成标记（2026-10-05）：ai / mix，写在最后
  if (node.airemark) parts.push('airemark:' + node.airemark); // 备注的 AI 生成标记（2026-10-14）：紧接 ainode 之后
  // 不认识的键**原样拼回**（2026-10-14）：旧版本不再把新键抹掉，跨版本回退不丢数据。排在所有已知键之后。
  (node.rawMeta || []).forEach(seg => parts.push(seg));
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
    const selfDone = nodeIsMinor(c) || nodeTodoDone(c); // 2026-09-20 起 Done 待办与 Minor 同待遇（同样被隐藏收走），徽章数字要跟画面一致；2026-08-27 修：统一走 nodeIsMinor（链接节点的 minor 字段标题为空，正则判断会漏）
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
  // 2026-10-06：离开当前这条路径之前，先把它的位置存好。
  // 旧版只在 goTo **末尾** persistNow → 存的是跳转后的新路径，旧路径那份当场被覆盖 —— 这正是「下钻回来会飘」的根因。
  // persistNow 自带 booted / 沙盒门闩，这里不用再判一遍（init 期间的下钻不进表）。
  rememberPathView(state.currentRootPid || '');
  persistNow();
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
  checkShowNowAutoClose({ undoable: false }); // 下钻到无 Now 子树 → 自动关 + toast（无撤销：下钻是主动导航，2026-10-01）
  render(); updateToolbar(); updateUndoRedo(); updateDefaultPathBtn();
  // 下钻/返回后内容变了，视口可能停在旧内容的空白处（看起来"没有东西"）
  // → 自动智能定位（进入当前节点/返回默认路径后自动居中，不再飘走；重置缩放/平移按 --locate-* 旋钮）
  // 2026-08-30：改同步执行。原来放 requestAnimationFrame 里 → render 后先显示旧视口位置、
  // 下一帧才跳到定位后的位置 = 用户看到的"下钻后画面跳一下"（与开屏那个 bug 同源）。
  // 同步执行：渲染与定位在同一帧完成，视觉上无中间态。render() 后 DOM 已更新，同步读布局是准确的。
  // 下钻/返回后主节点（新根）放到中央（--locate-x）：
  // goTo 会清 selectedId → 走 locateCenter 的无选中分支，同样把根放到中央（--locate-x），
  // 主节点偏左（2026-09-13 反馈）。这里显式按「主节点 = 当前关注」定位。
  const rootCard = document.querySelector('.node-row[data-id="' + currentRoot().id + '"] .card');
  // 2026-10-06：这条路径以前来过 → 回到上次离开时的位置（治「下钻一圈回来视图飘」）。
  // 下钻（keep:'target'）刻意不查档：往下的手感是「被点的节点原地站住」，保持 2026-09-15 定稿。
  // 其余四路（面包屑往上 / 左·右路径键 / 返回默认路径 / 双链跳转）一律记忆优先，没记忆才走各自的兜底。
  const pv = (opts.keep === 'target') ? null : pathViewOf(state.currentRootPid);
  if (pv && rootCard) {
    zoom = pv.zoom; panX = pv.panX; panY = pv.panY;
    applyTreeTransform(); drawEdges();
  } else if (opts.keep && kept && rootCard) {
    // keep 模式落位：新根摆回旧根刚才的屏幕位置（kept = 视口比例），缩放不变；直接落位不做动画——
    // 根没动、只有内容换，再动画反而会滑。screen = zoom*(world+pan) → pan = 屏幕点/zoom - world。
    zoom = kept.zoom;
    const vr = viewMap.getBoundingClientRect();
    const c = worldCenter(rootCard);
    panX = kept.x * vr.width / zoom - c.x;
    panY = kept.y * vr.height / zoom - c.y;
    applyTreeTransform(); drawEdges();
  } else if (rootCard) placeCardAtViewport(rootCard, cfgNum('--locate-x', 0.5));
  else locateCenter(); // 极端兜底：根卡片不在（空树/时序）→ 走通用智能定位
  persistNow();
}
// 沙盒化（2026-09-14 用户定）：历史界面里可以下钻/返回。它改动的 currentRootId / 路径栈 / 视口
// 全部由 sandboxRestore 在退出时整组还原，且持久化已被 persistNow 挡住 —— 带不出沙盒。
// 下钻（2026-09-15 定稿）：被点的那股节点 = 锚点，下钻后原地站住（缩放不变），不再跳到关注位。
function drillInto(id) { goTo(id, { keep: 'target' }); }
// 面包屑（2026-10-06 起住在**宿主的系统标题栏**上，画布里不再有 #crumb 这个元素）：
// 这里只把「从根到当前这一层」的层级数据发给宿主，由宿主渲染；宿主点其中一段 → 发 crumbGo 回来 →
// 走原来那个动作（goTo + keep:'root'，锚点 = 旧主节点，2026-09-15 定稿的手感不变）。
// 「从根到当前这一层」的层级数据（宿主标题栏的面包屑 + 搜索页的路径条共用这一份）
function crumbPathItems() {
  if (!state.tree) return [];
  const rootId = state.currentRootId || state.tree.id;
  const path = findPath(state.tree, rootId);
  if (!path || path.length <= 1) return [];
  // id 优先用 persistId（跨 iframe 重建也认得出），没有就退回内存 id —— goTo 两种都吃。
  return path.map(n => ({ pid: (n.persistId || '').trim() || n.id, title: n.title || '' }));
}
// 筛选状态上报（2026-10-21 → 2026-10-22 删除）：原来负责把 hideDone / showNow 同步给右侧搜索面板那两颗图标。
//   面板那两颗已撤（改成结果自己分段），这条消息与调用点一起删掉，别再加回来。
function renderCrumb() {
  vscode.postMessage({ type: 'crumb', items: crumbPathItems() });
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
  return (n.title || '') + '\u0001' + (n.note || '') + '\u0001' + ((n.images && n.images.length) || 0); // 链接在 title 里（2026-09-29 起无独立字段），不必单列
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
  // ⚠️ 空图（empty）不许套用「未命名 → 文件名」的兜底：套了就等于把空图悄悄补出一个主节点，
  //    用户剪切走主节点后打开又冒出来一个，等于没剪（2026-10-11）。
  if (!state.tree.empty && state.tree.title === '未命名' && state.currentFilename) state.tree.title = state.currentFilename;
  reconcileSelection();
  if (state.showNow) nowVisibleSnapshot = computeNowVisible(currentRoot()); // 重解析后快照按新树重算（2026-08-28；有了 adoptIdsFrom，多数 id 已沿用旧值）
  // 2026-09-20：撤销/重做也是整棵树的结构变化（撤销一次删除 = 节点回来）→ 走位移过渡，别再硬跳。
  // 锚定当前根（主节点/下钻节点）：它定住，只有变化的那一片在动。
  keepView(currentRoot());
  renderWithMotion(); updateToolbar(); updateUndoRedo(); updateDefaultPathBtn();
  emitUpdate();
}
function doUndo() {
  if (state.historyMode) return;
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  applyText(undoStack.pop());
  // 撤销后：若「只看 Now」曾被自动关掉、且撤销恢复了可见 Now → 自动开回来（2026-10-01）
  // 只有这一条路会自动开；其他操作（展开折叠 / 取消次要 / 关闭 hideDone / 返回上层）一律不开。
  if (showNowSaved && !state.showNow && state.tree && hasNowInScope(currentRoot())) {
    setShowNow(true, false); // persist=false：不落盘（意图本来就没变过）；会触发 render
  }
}
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
const MOTION_NEW_DX = 30;                          // 新出现的子树「整块」的**兜底**横向位移（px，向左）：
                                                   // 祖先链上找不到母节点（异常 DOM 结构）时才用。
const MOTION_NEW_RATIO = 0.3;                     // 新子树「从母节点方向滑入」走真实距离的**比例**。
                                                   // 0.25 = 起点落在「母节点 → 最终位置」的 **3/4 处**（只走最后那 1/4）。
                                                   // 2026-10-16 用户定：固定 px 在不同场景下轻重不一（卡片大小 / 间距都会变），
                                                   // 改成按比例 —— 近距离场景自动更轻，远处由下面的天花板压住。
                                                   // ⚠️「真实距离」= 母节点**右边缘** → 参照卡左边缘（见 playCardMove 的 origin）。
                                                   // 2026-10-16 用户实测校正：原先取母节点**左**边缘，把母节点自身宽度
                                                   // 也算进了分子 → 宽母节点位移明显偏大（用户看着像「走了一半以上」）。
// 🎚 新出现的卡片**不做缩放**（2026-10-21 用户定，删掉 2026-10-20 那版「起点 0.94 → 1」）：
//   缩放是绕每张卡自己中心做的，同一棵树里每张卡都在单独缩，看着碎；改成整棵树一起缩又要动
//   transform-origin + 连线端点换算（两处都得跟着缩放走），为一个小效果不值得冒回归风险。
//   现在整棵树只有「同一段位移」这一个运动，块内相对位置全程不变。
const MOTION_NEW_MAX_DX = 1080;                      // 上面那条比例算出来太远时的**天花板**（px）。
                                                   // 例：真实距离 800px → 比例算出 200px → 压到 80px。
const MOTION_NEW_MAX_DY = 1600;                      // 🎚 纵向的**双向**天花板（px，2026-10-20 用户定「先按 60 试试」）。
                                                   //   每棵子树按自己相对母节点的垂直位置决定往上还是往下扩散，
                                                   //   树很高时纵向差可能几百 px，不限会从很远处飞过来。
// 新建节点的入场方式（2026-10-18 建，2026-10-21 收窄成一支）：**一次性**，只作用于紧跟其后的这次 render。
//   ''     = 默认：从母节点那一列滑入（**折叠 / 展开走的就是这一套，别动**）
//   'none' = 新建节点：不做入场动画，卡片直接出现在终点（周围卡片照常平滑让位）
// 2026-10-21 用户定：新建**同级**也归到 'none'（与公开版 1.8.4 的观感一致 —— 那版新卡压根不参与位移）。
//   原来的 'down'（从上方落 30px）连同 MOTION_NEW_DY 一起删了，别再加回来。
// 由 add* 系列在 renderWithMotion() 之前设，renderWithMotion() 收尾统一清掉（跳过的分支也清）。
let newCardAnimMode = '';
const MOTION_MAX_CARDS = 1200;                     // 卡片数上限：超过就不做（大文件保护）
                                                   // 2026-09-20：只对「看得见的」卡片做（卡片或它的连线
                                                   // 碰到视野，见 motionVisibleIds），屏幕外的不读不画。
const MOTION_ON = true;                            // 出厂默认：置 false 即全静默（回撤不必改别处）
                                                   // 运行期真正起作用的是下面这个 —— 由设置页「高级 → 动效」下发
let motionEnabled = MOTION_ON;                     // 动效开关（2026-09-20）：setMotion / init 可改，关掉后一律瞬移
let aiFeaturesOn = false;                          // 「AI 功能」总开关（2026-10-08，设置页「高级 → 实验性功能」）：**默认关**，
                                                   //   setAiFeatures / init 可改。关掉后界面上一切 AI 入口都藏：
                                                   //   左下那颗「AI 编辑」按钮 + 底部工具条那颗「AI」按钮及它前面的分隔线。
// 「AI 更改规则」是否**在卡片里显示**（2026-10-06；AI 面板「AI 更改规则」行右边那颗小眼睛，全局生效）：
//   true  = 显示：卡片里正常画出那一块
//   false = 隐藏：**整个不渲染**（像隐藏次要节点那样），不是收成一根小横条
// 默认开。改它的唯一出口 = setAiRulesFull()（那颗小眼睛）；init / 设置页推送走同一条路。
let aiRulesFullOn = true;
// 左下「视图筛选」（2026-10-18 用户定：三档机制拆除，固定「展开」= 两枚一级按钮各管各的）——
//   原来的 filterModeNow / filterMode / filterSplit / filterRclick 与 #filter-menu、#fm-now / #fm-minor
//   整套已删（宿主自 2026-10-07 起就恒发 'split'，另两档早已是死代码）。
// 系统「减少动态效果」偏好（2026-09-23）：macOS 辅助功能 / Windows 显示设置里开了这个的用户，
// 宿主其他动效都关了、就我们这个还在动 → 观感不一致，且这类用户往往正是动效敏感 / 低性能场景。
// 与 settings.motion 是「或」的关系：任一要求关就不做（系统偏好优先于应用内开关，这是 Web 惯例）。
// 运行期跟随系统变化（用户中途去系统设置里改，不用重开画布）。
let prefersReducedMotion = false;
try {
  const mqReduced = matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion = mqReduced.matches;
  mqReduced.addEventListener('change', (e) => {
    prefersReducedMotion = e.matches;
    if (prefersReducedMotion && motionFrame) { clearCardMove(); drawEdges(); } // 切到 reduce 的那一刻正在播 → 立刻落地
  });
} catch (e) { /* matchMedia 不可用时静默：保持 false，不影响主链路 */ }
const MOTION_AUTO_PAUSE = true;                    // 掉帧自保：连续两帧超时就放弃这次动画、直接落地
const MOTION_DROP_MS = 50;                         // 单帧超过这么久算掉帧（≈ 掉到 20fps 以下）
                                                   // 录屏/低电/U 大图时会掉帧：与其播成幻灯片，不如不播
                                                   // 2026-10-10 从 34 放宽到 50：Windows 集显 34ms（≈30fps）太严，
                                                   // 每次都触发直接落地 = 「完全没有动效」的假象（用户实报）
const MOTION_DEBUG = true;                         // 动效诊断：各静默分支各记一条 log（2026-10-10，
                                                   // 「开关开着却没动效」类问题全部静默、不报错不提示，只能靠查）
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
  // x 同样被「落点列」钉住（与预测线终点用同一个 dropClampLocalX）：
  // 少了这层同源，卡片从松手处起步、线却画在落点列上，两者错开一截 → 看着像「线从别处闪过去」。
  const tr = treeEl.getBoundingClientRect();
  const s = zoom || 1;
  let lx = (np.x - tr.left) / s;
  const colX = dropClampLocalX(state.dragPreview, tr, s);
  if (colX != null) lx = Math.max(lx, colX);
  pendingDropStart = { ids: ids.slice(), x: tr.left + lx * s, y: np.y - h / 2 };
}
function renderWithMotion() {
  if (!motionEnabled) { newCardAnimMode = ''; render(); return; } // 关动效：清掉一次性标记，别留给下一次
  motionArmed = true;
  try { render(); } finally { motionArmed = false; newCardAnimMode = ''; }
}
// 动效诊断（2026-10-10）：各静默分支各记一条 log（同一原因去重，变了再记），
// 「开关开着却完全没动效」类问题（2026-09-29 用户实报 Windows）不用靠猜，开控制台就能看到是谁拦的。
let motionLastSkip = '';
function motionSkipLog(why) {
  if (!MOTION_DEBUG || motionLastSkip === why) return;
  motionLastSkip = why;
  wlog('[动效] 跳过：' + why);
}
function motionAllowed() {
  if (!motionEnabled) { motionSkipLog('设置开关关闭'); return false; } // 设置页「高级 → 动效」
  if (prefersReducedMotion) { motionSkipLog('系统「减少动态效果」开启（设置页那个开关此时无效，见设置页说明）'); return false; }
  if (!motionArmed) return false;                   // 本次 render 没挂过渡（纯文字改动等）：正常路径，不记
  if (!booted) return false;                        // 开屏（init 还原视图之前）：不做
                                                   // 历史沙盒（historyMode）2026-09-20 放开：它与编辑页共用同一套
                                                   // render，差异只是末尾多贴一层差异高亮；且历史页展开得少、
                                                   // 又有「卡片太多 / 重画太贵」的兜底，没必要单独排除。
  if (viewHiddenForEdges()) return false;           // 揭幕前：不做（开屏必经，不记）
  if (edgesHeavy) { motionSkipLog('此文件连线重画太贵（edgesHeavy）'); return false; }
  const rows = treeEl.querySelectorAll('.node-row').length;
  if (rows > MOTION_MAX_CARDS) { motionSkipLog('卡片数 ' + rows + ' 超上限 ' + MOTION_MAX_CARDS); return false; }
  return true;
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
  // 🔴 2026-10-16：这里**不再按可见性过滤**（原来只记「卡片或它的连线碰得到视野」的那些，理由是
  //    "屏幕外做了也看不见"）。那条理由对「整段动画都在屏外」的卡片成立，但对**要被挤进视野**的卡片
  //    不成立：它旧位置在屏外 → prev 里没有它 → playCardMove 把它当成「新出现的卡片」→ 按新卡片那套
  //    给它「整块横向滑入」（母节点到子卡距离的 1/4），而它真实的位移是**纵向几百像素**。
  //    用户看到的就是「外面那棵树：母节点（旧位置可见）好好地在动，子节点忽然就到了最终位置」。
  //    日志：一次展开里出现第二组（`nn6kfg×2`）= 那几张被误判的卡片。
  //    性能仍由 MOTION_MAX_CARDS(1200) 那道全局门闩守（超上限整体不做过渡）。
  treeEl.querySelectorAll('.node-row[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');
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
  const newGroups = new Map(); // key（子树顶层节点 id）→ { origin:{x,y}|null, ref:{x,y}|null, members:[{id,card}] }
  treeEl.querySelectorAll('.node-row[data-id]').forEach((row) => {
    const id = row.getAttribute('data-id');
    const was = prev.get(id);
    const card = row.querySelector(':scope > .card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (!was) {
      // 新出现的卡片按「母节点下面**那一层的每个节点**」分组（2026-10-20 用户定，改自 10-16 的「整个母节点一组」）：
      //   每个直接子节点各自一棵树、各一个组 —— 于是展开一个有 3 个子节点的母节点时，三棵树能朝**不同方向**扩散
      //   （上方的从左下往右上、齐平的纯横向、下方的从左上往右下）。
      //   ⚠️ 组内仍然**整块刚性**：第二层、第三层…全部跟随本组第一张卡，不各自朝母节点散
      //      （10-16 那条"别让每张卡都在动"的结论没被推翻，只是分组的粒度从"母节点"细化到"子节点"）。
      //   ⚠️ 位移只来自「母节点自己的当前屏幕位置」，**不读 prev 里新卡片自己的坐标** ——
      //      那才是「开屏 / 换文件满屏乱飞」的来源（门闩① 防的就是它，这条没变）。
      let host = null;
      let up = row.parentElement ? row.parentElement.closest('.node-row') : null;
      while (up && up !== treeEl) {
        if (prev.get(up.getAttribute('data-id'))) { host = up; break; }
        up = up.parentElement ? up.parentElement.closest('.node-row') : null;
      }
      // 从自己往上走、到 host 为止，记下**紧贴 host 的那个节点** = 本组的键（= 它所属的那棵树）
      let topRow = row;
      {
        let p = row.parentElement ? row.parentElement.closest('.node-row') : null;
        while (p && p !== host) { topRow = p; p = p.parentElement ? p.parentElement.closest('.node-row') : null; }
      }
      const key = host ? (topRow === row ? id : topRow.getAttribute('data-id')) : '__none__';
      let g = newGroups.get(key);
      if (!g) {
        const hc = host ? host.querySelector(':scope > .card') : null;
        const hr = hc ? hc.getBoundingClientRect() : null;
        // origin = 母节点**右边缘的中心**（2026-10-20 用户定，简化版）：
        //   横向仍取右边缘（10-16 实测校正过：左边缘会把母节点自身宽度算进分子，位移偏大）；
        //   纵向取垂直中心 —— 用它跟子树中心比，才知道这棵树该往上还是往下扩散。
        g = { origin: hr ? { x: hr.right, y: hr.top + hr.height / 2 } : null, ref: null, members: [] };
        newGroups.set(key, g);
      }
      // 本组「DOM 顺序第一张」当参照（= 这棵树最上面那张卡）：整组的位移都按它算，
      // 于是块内相对位置全程不变（各自算位移的话，换行/宽高一变，块内就会被拉扯变形）。
      // ref 取**左边缘的中心**（2026-10-20 用户定）：横向用它算距离、纵向用它定方向。
      if (!g.ref) g.ref = { x: r.left, y: r.top + r.height / 2 };
      g.members.push({ id: id, card: card });
      return;
    }
    // ⚠️ 这里**不再**按「新位置是否可见」二次过滤（2026-10-16 用户实测修，详见手册 §5）：
    //    prev 里本来就只剩「旧位置看得见」的卡片（captureCardPlaces 已按可见性筛过一遍），
    //    而「旧位置看得见」= 用户正看着它在哪 —— 它滑走的那一段路本来就该被画出来。
    //    原先这里还要「新位置也看得见」，于是「旧位置在视野内、新位置被挤出视野」的那批卡片被整张踢掉
    //    → 没有起点位移 → 浏览器直接把它摆到终点 = 瞬间到位，而其它卡片在滑满 MOTION_MS。
    //    这正是用户报的「展开很大时外面母子不同步」：展开越大被挤出去的越多；
    //    展开小的时候一张都挤不出去 → 那时看着完全同步。
    //    性能仍有两道兜底：captureCardPlaces 的可见性筛选 + motionAllowed 里的 MOTION_MAX_CARDS。
    base.set(id, { card, isNew: false, dx: was.x - (r.left - tr.left) / s - dpx, dy: was.y - (r.top - tr.top) / s - dpy });
  });
  // 逐组把「整块」放进 base：整块从母节点**那个方向**横向滑入，但**幅度限幅**。
  // ⚠️ 只取横向分量（2026-10-16 用户反馈）：拿「母节点位置」当起点会带上纵向分量 —— 母节点垂直居、
  //    而那些子卡从它上方开始排，位移就成了「向左 + 向下」→ 整块起点落在最终位置的**左下方**，
  //    看着是「从左下方斜着展到右边」。树是横向布局，对的感觉是「从母节点那一列平推出来」→ 纵向不动。
  // ⚠️ 再限幅（同一天第二次微调）：起点**不真取到母节点那一列** —— 母节点到子卡常有 150~200px，
  //    每次展开都像「把子树从母节点里拽出来」，幅度太大。收到 MOTION_NEW_MAX_DX 以内 = 轻微滑入。
  for (const g of newGroups.values()) {
    if (!g.ref || !g.members.length) continue;
    // 新建节点的入场方式（2026-10-18 建 / 2026-10-21 收窄成一支）：
    //   'none' = 这次新建的就是它 → 压根不进 base，卡片直接出现在终点（周围卡片照常平滑让位）。
    //   折叠 / 展开走下面默认那一支，没动。
    if (newCardAnimMode === 'none') continue;
    // 横向：母节点**右边缘** → 这棵树第一张卡的**左边缘**，只走最后 1/4，再压天花板
    const fullX = g.origin ? (g.origin.x - g.ref.x) / s : -MOTION_NEW_DX;
    const dx = Math.max(fullX * MOTION_NEW_RATIO, -MOTION_NEW_MAX_DX);
    // 纵向（2026-10-20 用户定，2026-10-21 明确保留）：按这棵树相对母节点**垂直中心**的位置决定扩散方向 ——
    //   树在母节点上方 → 母中心 > 树中心 → fullY > 0 → dy > 0 → 起点偏下 → 向上滑入（从左下往右上）；
    //   树在下方 → fullY < 0 → dy < 0 → 起点偏上 → 向下滑入（从左上往右下）；
    //   齐平 → ≈0 → 纯横向。
    //   两个方向都压 MOTION_NEW_MAX_DY，免得一棵很高的树从几百 px 外飞过来。
    // ⚠️ 这条**推翻了 2026-10-16「只取横向」那条**：那次要的是"整块从母节点那一列平推出来"，
    //    现在用户要的是"每棵树朝自己那一侧扩散"，所以纵向必须留 —— 别照旧注释改回去。
    let dy = 0;
    if (g.origin) {
      const fullY = (g.origin.y - g.ref.y) / s;
      dy = Math.max(-MOTION_NEW_MAX_DY, Math.min(MOTION_NEW_MAX_DY, fullY * MOTION_NEW_RATIO));
    }
    // 2026-10-21 用户定：**整棵树（= 这个组）共用同一个 dx / dy、不做缩放**。
    //   块内每张卡拿到同一个位移 → 整棵树是刚体平移，第二层第三层不会各自动；
    //   也不再有「每张卡各自绕自己中心缩放」那种碎感（那版 2026-10-20 加、10-21 删）。
    // 可见性按**整组**判：只要有一张看得见，整组都参与。逐张筛会把这块刚体撕开 ——
    //   被筛掉的卡直接出现在终点、其余的还在滑，同一棵树里「有的动、有的不动」，比不做还乱。
    let anyVis = false;
    for (const m of g.members) if (vis.has(m.id)) { anyVis = true; break; }
    if (!anyVis) continue; // 整棵都在屏外：做了也看不见（滚动中会进视野的，由 MOTION_VP_PAD 兜住）
    for (const m of g.members) {
      base.set(m.id, { card: m.card, isNew: true, dx: dx, dy: dy });
    }
  }
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
    moved.push({ id: id, card: b.card, dx: dx, dy: dy, isNew: !!b.isNew });
  }
  if (!moved.length) return false;
  motionOff = new Map();
  for (const it of moved) motionOff.set(it.id, it);
  motionEdgeList = drawEdges(); // 终点边表（path 元素也按它建好）→ 之后逐帧只改受影响的那些 d
  for (const it of moved) {
    it.card.style.transform = 'translate(' + it.dx + 'px,' + it.dy + 'px)';
  }
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
      if (now - lastT > MOTION_DROP_MS) {
        slowFrames++;
        if (slowFrames >= 2) { if (MOTION_DEBUG) wlog('[动效] 掉帧自保：连续两帧超 ' + MOTION_DROP_MS + 'ms，直接落地'); finish(); return; }
      }
      else slowFrames = 0;
      lastT = now;
    }
    const p = Math.min(1, (now - t0) / MOTION_MS);
    const e = motionEase(p);
    const k = 1 - e;
    for (const it of moved) {
      // 2026-10-21 用户定：**不做缩放**，整棵树只走位移。每个组内部共用同一个 dx/dy（上面按组写进 base），
      //   所以一棵子树是刚体平移 —— 第二层、第三层不会各自动，也不会出现「每张卡各自缩放」的碎感。
      const tf = 'translate(' + (it.dx * k) + 'px,' + (it.dy * k) + 'px)';
      it.card.style.transform = tf;
      // 2026-10-16 用户定：**新卡片不做淡入**（当天短暂加过「全透明起步 + 渐显」，实测后用户要求去掉）。
    }
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
  if (!motionEnabled || prefersReducedMotion) return false;
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
  // 安全网（2026-10-01 重构）：任何操作走到 render 时，若「只看 Now」开着但视图里已无可见 Now → 静默关掉。
  // 判据用 hasNowInScope（不看折叠）：折叠 / 拖拽不触发；显式 toast 由各 handler 里的 checkShowNowAutoClose 负责。
  if (state.showNow && root && !hasNowInScope(root)) {
    state.showNow = false;
    nowVisibleSnapshot = null;
  }
  // 「只显示 Now」：计算可见集（Now+祖先路径+Now 直接子节点），buildRow 里剔除无关节点（类比 hideDone）
  nowVisibleSet = (state.showNow && root) ? (nowVisibleSnapshot || computeNowVisible(root)) : null; // 有快照用快照（按下那一刻定格），无快照兜底现算（init 时序等）
  // 第一行 = 当前主节点本身（顶层是中心主题，下钻后是进入的节点），其子节点在它下面展开
  // 空图（2026-10-11）：正文里没有主节点那一行 → 一张卡片都不画，只在画面上放一枚
  //   「＋ 新建母节点」按钮；点它建一个空主节点并直接进编辑（打完字就是正常卡片）。
  //   历史只读态、下钻态都不走这条 —— 那两种情况下母节点还在，只是视图换了层。
  const emptyMap = !!(state.tree && state.tree.empty) && !state.currentRootId && !state.historyMode;
  const rootRow = emptyMap ? null : buildRow(root, 0);
  if (rootRow) treeEl.appendChild(rootRow);
  else if (emptyMap) treeEl.appendChild(buildEmptyRootBtn());
  // 空图使用提示（2026-09-01 定）：根视图 + 树无任何子节点 + 非历史页 + 设置未隐藏时，在主节点卡片正下方显示操作提示；
  // 相对卡片绝对定位 → 拖动/缩放画布时自动跟随；用户建立第一个子节点后 children 非空 → 不再渲染（天然消失）。
  // 设置页「隐藏新增页面提示」= hideHint → 直接不渲染。
  // 🔴 2026-10-10 用户定（第二版）：**主节点自己就是文档节点**时（= 转入生成的导图，主节点是一行
  //   `[[28Notes-Files/docs/名字]]`）走**另一套文案**，而且**不受 hideHint 影响、强制显示** ——
  //   这种图"看起来像空图"但不是空图，那句给新建空图用的提示在这里答非所问；而这句"复制粘贴到别处
  //   然后删掉这张图"是这张图**唯一的用法说明**，用户明确要求关不掉。
  const rootIsDocNode = !!nmManagedOf(root);
  const hintOn = rootRow && !state.currentRootId && root.children.length === 0 && !state.historyMode
    && (rootIsDocNode || !state.hideHint);
  if (hintOn) {
    const hint = document.createElement('div');
    hint.className = 'start-hint';
    hint.textContent = rootIsDocNode
      ? T('hint.docLine1') // 2026-10-11：只留这一句（改成「剪切」了），删图那句不再需要
      : T('hint.line1') + '\n' + T('hint.line2') + '\n' + T('hint.line3');
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
  updateNowFilterItem(); // 刷新「聚焦当前关注」菜单项的置灰/图标态
  refreshHideBtn(); // 刷新「隐藏 Minor/Done」按钮三态 —— 标记/取消 Minor、待办完成、撤销等任何走 render 的树变化都要即时反映，不能等下次点画布走 updateToolbar 才刷（2026-09-22 用户报）
  updateFoldBar(); // 2026-08-30：右下角常驻折叠层级条跟随树结构/层级数刷新（折叠操作后层数变化）
  // 历史只读态：render 会重建整棵 DOM，差异标红必须在这里补回来。否则任何一次"只调 render"的
  // 重渲染（折叠条按层折叠、缩放等）都会把红框冲没 —— 原先只有 renderHistoryTree 贴红，漏在这。
  if (state.historyMode) applyHistoryDiffClasses();
  applyPendingKeepView(); // 2026-09-13：keepView 的锚定补偿在 render 末尾同步应用（一次绘制即最终画面）
  playCardMove(prevPlaces); // 位移过渡（实验性）：锚定补偿之后再放动画，两者互不干扰
  pendingDropStart = null; // 落位起点只服务紧跟其后的这一次 render（没做成动画也要清掉，别留到下次）
  armImageMotion(); // 本次渲染里还有没撑开的图 → 预存位置，图到了走一次过渡（见 onImageArrived）
  // 选中相关的"顺带事"也在这儿补一次（2026-10-09）：`refreshSelectionClasses` 已经挂了一份，
  // 但**取消选中**有好几条路只走 render（删节点 / 剪切 / 换图…）不走 refreshSelectionClasses →
  // 只挂那边会漏。两处都调、内部各自去重（`_lastSelDoc`），重复调用很便宜。
  try { notifySelDoc(); } catch (_) {}
  requestAnimationFrame(drawEdges);
}
// 画布空隙的拖拽预测/落点：handler 全部读 state 实时值，绑一次即可，不随 render 重绑（2026-08-24 从 render 里移出）
// 拖拽热路径 rAF 合并（2026-09-01）：dragover 高频触发，把「预测+高亮+预测线」收进一个 rAF，
// 每帧最多算一次，事件扎堆也不重复做；配合 buildDragRects 缓存矩形彻底消除大文件拖拽卡顿。
// 🔴 绑在 **#view-map（画布视口）** 上，不是 #tree（2026-10-01 改，修「拖到最右节点外侧空白时预测线卡住」）：
//   #tree 的盒子是**内容盒**（abspos + 收缩到内容宽，且 padding 左右为 0、只有上下各留 40/120）——
//   指针一旦拖出内容边缘，dragover 就落不到 #tree 上了：预测（高亮 + 曲线）当场停在上一次的状态，
//   看着就是「线卡住」。而**最右边那个节点恰恰是唯一一个必须往内容外侧拖的目标**（要成为它的子节点
//   就得往它右边拖）→ 100% 命中；别的节点都在内容内部，指针不用出界，所以一直正常。
//   #view-map 铺满整个画布视口、是画布的常驻容器 → 挂在它上面，指针在画布任何位置都持续更新。
// ⚠️ 事件数量不变（dragover 本来就从卡片冒泡上来）、rAF 合并照旧 → 没有新增性能开销。
// ⚠️ drop 也一起挂过来：否则会变成「线跟得上、松手却没反应」—— 原来落在内容盒外的那一下根本没人接。
viewMap.addEventListener('dragover', e => {
  e.preventDefault();
  // ⚠️ 外部拖入（文件列表 → 画布）**不走这里**：实测拖拽事件进不了 iframe（见下方 ext* 注释），
  //   那条路由宿主转发坐标进来（extDragAt 消息）。这里只处理画布内部拖节点。
  if (!state.dragId) return;
  // 🔴 拖到一半才按 ⌘/Ctrl（2026-10-19）：macOS 会把它当「建别名」，drop 被系统吞 → 冻 1 秒 + 节点弹回。
  //   拦不住系统，但可以让"松手什么都不做"：声明 none（光标变成禁止符号）+ 标记，drop 里直接跳过动作。
  //   （开头就该按 ⌘ 的情况在 dragstart 已经整段拦掉了，走不到这里。）
  if (e.metaKey || e.ctrlKey) {
    state._metaNoDrop = true;
    try { e.dataTransfer.dropEffect = 'none'; } catch (_) {}
    return;
  }
  state._metaNoDrop = false;
  // 🔴 目标侧声明 dropEffect（2026-10-18 第二次尝试，走的不是上次那条路）：
  //   macOS 上按住 ⌘ 时系统把这次拖拽判成「建别名（link）」，目标不认领这个操作 → 系统**吞掉 drop**：
  //   dragend 照发但要等系统那套「失败拖拽」收尾（≈1s，期间渲染与鼠标一起冻住），
  //   而我们只在 drop 里 moveNodes → 节点原地不动 = 用户看到的「弹回原位 + 顿 1 秒」。
  //   现在的主用姿势改成 **⌥+拖**（macOS 认可的 copy 语义）→ 这里就按 ⌥ 声明 'copy'，
  //   其余情况声明 'move'（dragstart 那边 effectAllowed='all'，两种都在允许集合里）。
  //   ⚠️ 上次试的是 `metaKey ? 'link' : 'move'`（已回退）—— link 那档没成，别再往 link 上靠。
  try { e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'; } catch (_) {}
  // 诊断（2026-10-18 临时）：dragover 高频 → 每 200ms 记一行。判据：⌘ 按下后这里还在不在刷新。
  const _ovNow = performance.now();
  if (_ovNow - _dbgOverLoggedAt > 200) {
    _dbgOverLoggedAt = _ovNow;
    dbgDrag('dragover', 'meta=' + e.metaKey + ' alt=' + e.altKey + ' ctrl=' + e.ctrlKey
      + ' dropEffect=' + (e.dataTransfer ? e.dataTransfer.dropEffect : '?')
      + ' effectAllowed=' + (e.dataTransfer ? e.dataTransfer.effectAllowed : '?')
      + ' preview=' + (state.dragPreview ? ((state.dragPreview.targetId || '-') + ':' + state.dragPreview.position) : 'null'));
  }
  _dbgOverAt = _ovNow;
  // 指针之前被判"在画布外"（宿主发过 nodeDragOut），现在 iframe 里又收到 dragover = 回来了 →
  //   告诉宿主收掉「松手转出」那行（它自己收不到这条事件：拖拽源在 iframe 里）。
  if (extOutStop) {
    extOutStop = false;
    try { vscode.postMessage({ type: 'nodeDragIn' }); } catch (_) {}
  }
  state._dragCX = e.clientX; state._dragCY = e.clientY;
  state._dragAlt = !!e.altKey;   // ⌥ 状态留一份给 dragend 的兜底落位（drop 被系统吞掉时用它判"复制还是移动"）
  if (!state._dragRAF) state._dragRAF = requestAnimationFrame(runDragFrame);
});
function runDragFrame() {
  state._dragRAF = null;
  const np = dragNodeXY(state._dragCX, state._dragCY);
  const t = nearestDropTarget(np.x, np.y);
  if (t) { state.dragPreview = t; state._lastDrop = { targetId: t.targetId, position: t.position }; } // 记住落点，供换挡余量判据
  else if (state.dragId) { state.dragPreview = { targetId: null, position: 'root' }; }
  applyDragPreview(state.dragPreview);
  updateDragCurve(state.dragPreview, np.x, np.y);
}
// ⚠️ 原来挂在 #tree 上的 dragleave（拖出内容盒就清预测）已删（2026-10-01）：它清得太早 —— 指针只要
//    离开内容边缘（哪怕人还在画布里、只是落在右侧空白）就把预测抹掉，正是上面那个 bug 的另一半。
//    收尾交给两个可靠的出口：drop（下面）与 document 的 dragend（拖到哪松开都会触发，见文件末尾）。
viewMap.addEventListener('drop', e => {
  e.preventDefault();
  // 外部拖入松手同样不在这里（宿主转发的 extDropAt 消息负责）；这里只收画布内部节点拖拽。
  if (!state.dragId) return;
  // drop 派发到了 → dragend 里那条「兜底落位」不许再动一次（2026-10-18）
  state._dropDone = true;
  dbgDrag('drop(viewMap)', 'meta=' + e.metaKey + ' dropEffect=' + (e.dataTransfer ? e.dataTransfer.dropEffect : '?')
    + ' preview=' + (state.dragPreview ? ((state.dragPreview.targetId || '-') + ':' + state.dragPreview.position) : 'null'));
  // ⌘/Ctrl 按着松手 = 什么都不做（2026-10-19：这一档系统本来就会吞掉 drop，索性明确不动作；
  //   收尾照旧走下面那串清理，节点留在原处）
  if (state.dragId && !(e.metaKey || e.ctrlKey || state._metaNoDrop)) {
    const dp = state.dragPreview;
    // 落位动画从「松手处」起步（armDropStart 记屏幕位置，render 末尾的位移过渡拿它当旧位置）
    // ⌥ + 松手 = **复制到落点**（2026-10-18 用户定）；不按修饰键 = 照旧移动。
    const altCopy = !!e.altKey;
    const go = (tid, before) => { armDropStart(e.clientX, e.clientY); (altCopy ? copyNodesTo : moveNodes)(state.dragIds, tid, before); };
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
  clearDragCaches(); // 清拖拽矩形 / 集合 / 旋钮全套缓存（2026-10-10 统一出口）
  if (state._dragRAF) { cancelAnimationFrame(state._dragRAF); state._dragRAF = null; }
  state.dragPreview = null;
  state.dragGrabDX = 0; state.dragGrabDY = 0;
  cleanupDragGhost(); // drop 里也清：render 摘掉源卡后 dragend 不冒泡到 document（残影根因）
  clearDragSrcMark(); // 拖拽源卡的「原地虚线」标记（见 clearDragSrcMark 注释）
  stopAutoScroll();
  clearDragHighlights();
});
// ===== 外部拖入：从左侧文件列表把文件拖到节点上 → 转入成这个节点的子文档（2026-10-17 用户定）=====
// 规则（用户原话：「拖到任一节点，上面都会有黑色小字提示【松手转入此节点】；没到任一节点，例如画布空白处，
//   就没有提示，松手文件还在原处」）：
//   · 落点只认**指针压在卡片矩形内**这一种 —— 判据简单到矩形命中，**不复用** nearestDropTarget：
//     那套还带 before/after/root（同级插入、挂到根）三种语义，而"转入"只有"成为它的子节点"一种。
//     拿那套来判，用户拖到卡片上下缘就会看到"同级插入线"却什么也插不进去（自相矛盾）。
//   · 没落点 = 什么都不做：不弹提示、不发消息、文件原地不动（宁可转不转，也不能转错）。
// 🔴 **拖拽事件是宿主转发进来的，不是 iframe 自己收**（2026-10-17 用户机实测）：
//   拖拽事件进不了 iframe —— 画布 iframe 内 dragenter/dragover/drop 一条都收不到（控制台探针验过），
//   全落在宿主窗口的 DIV 上。所以宿主接手（MindMapView.extDragOver / extDrop / extDragEnd），
//   换算成本视口坐标后发三条消息进来：
//     extDragAt {x,y,kind}  指针在画布上的位置（kind 宿主已判好：'file' | 'folder' | 'other'）
//     extDropAt {x,y}       松手了（宿主此刻已把文件对象存好 —— dragend 一过 dragManager 就读不到了）
//     extDragEnd            拖到一半放弃 / 拖出画布 → 收提示
//   · 画布内部拖节点仍走 viewMap 上那一套（靠 state.dragId 区分，两条路不会撞）。
let extDrop = { id: '', kind: null, live: false, alt: false };
// 正在被拖出画布的那个节点（拖到 iframe 外松手 = 转出；2026-10-17）。
//   ⚠️ 不能等 nodeDropOut 到了再读 `state.dragId` —— 宿主那条消息是异步的，dragend 会先把它清掉。
let nodeDragOutId = '';
// 「指针此刻在画布外」（宿主发 nodeDragOut 置 true，画布自己收到 dragover 时清掉并发 nodeDragIn）。
//   拖拽源在 iframe 里时，宿主**收不到**"指针回到 iframe 内"的事件 → 只能由画布自己上报。
let extOutStop = false;
// 宿主任一次 dragover 读到的 ⌥ 状态（比键盘自记可靠）：拖拽中自己记的 keydown 只有
//   "拖之前就按住"才收得到，"拖起来再按"会漏 —— 两者取或，才是稳的（2026-10-17 定，2026-10-18 改只认 ⌥）。
let extOutAlt = false;
// 指针底下的节点 id（没有 = 空白）。矩形表复用拖拽那套缓存：外部拖入没有 dragstart 快照 → 这里现建一次。
function extDropNodeAt(clientX, clientY) {
  if (!state.dragRectById) buildDragRects();
  const items = state.dragRects;
  if (!items || !items.length) return '';
  for (const it of items) {
    if (clientX >= it.left && clientX <= it.right && clientY >= it.top && clientY <= it.bottom) return it.id;
  }
  return '';
}
// 那行小字（黑底 + 白字 + 小三角，与全项目 tooltip 同一套观感）。**单例**，拖拽期间只挪位置不重建。
function extHintEl() {
  let el = document.getElementById('ext-drop-hint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ext-drop-hint';
    el.className = 'ext-drop-hint';
    el.textContent = T('extDrop.dropHere');
    document.body.appendChild(el);
  }
  return el;
}
// 把「落点」标在这张卡上：普通转入 = 强调描边；拖的是**当前这张导图自己** = 红色 + 红字提示
//   （2026-10-17 用户定：拖过去的时候就该看出"不行"，而不是松手后弹窗）。
function markExtCard(id, self) {
  const row = document.querySelector('.node-row[data-id="' + id + '"]');
  const c = row && row.querySelector(':scope > .card');
  if (!c) return;
  c.classList.add('ext-drop-target');
  c.classList.toggle('is-self', !!self);
}
function placeExtHint(id, kind) {
  const it = state.dragRectById && state.dragRectById.get(id);
  const el = extHintEl();
  if (!it) { el.classList.remove('show'); return; }
  const self = (kind === 'self');
  // 三态：自己（红字）/ ⌥ 复制进来（"松手创建文档捷径"）/ 普通转入（"松手转入此节点"，2026-10-19）
  const tag = self ? 'self' : (extDrop.alt ? 'copy' : 'file');
  if (el.dataset.kind !== tag) {
    el.textContent = T(self ? 'extDrop.selfHere' : (extDrop.alt ? 'extDrop.shortcutHere' : 'extDrop.dropHere'));
    el.dataset.kind = tag;
  }
  el.classList.toggle('warn', self);
  el.style.left = Math.round((it.left + it.right) / 2) + 'px';
  el.style.top = Math.round(it.top) + 'px';
  el.classList.add('show');
}
// 拖拽浮标提示（2026-10-19 用户定）：指针在画布上、但**还没压住任何节点**时，跟着鼠标走一行黑字 ——
//   告诉用户"要压到节点上才算数"，以及"现在松手 = 取消"。压住节点后收掉，改由卡片上那条提示接棒
//   （两条同时出现会打架：一条钉在卡片上、一条跟着鼠标）。
// 拖拽浮标提示（2026-10-19 建 / 2026-10-21 改成底部常驻 toast）：指针在画布上、但**还没压住任何节点**时，
//   画布底部居中显示一行黑字 —— 告诉用户"要压到节点上才算数"，以及"现在松手 = 取消"。
//   压住节点后收掉，改由卡片上那条提示接棒（两条同时出现会打架：一条钉在卡片上、一条在底部）。
// ⚠️ 2026-10-21 之前这里是**跟着鼠标**走的（clientX+14 / clientY+16），只要从文件列表拖文件进来，
//   就必然压在 Obsidian 自己的 .drag-ghost 上（它 position:fixed、left/top 由它自己写死成指针 +5/+5，
//   CSS 里没偏移量、改不了）→ 两条黑字叠成一条。改成固定位置后，两边井水不犯河水。
function extTipEl() {
  let el = document.getElementById('ext-drag-tip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ext-drag-tip';
    // 🔴 2026-10-21 用户定：**复用全局唯一的 toast 那一套**（.toast-below / .toast-below-msg / .show）——
    //   位置（底部居中 bottom:92px）、浅蓝底、描边、圆角、投影、字号全部跟着 toast 走。
    //   别在这里另写配色/位置：以后 toast 换设计，这条要自动跟着换。
    el.className = 'toast-below ext-drag-tip';
    const span = document.createElement('span');
    span.className = 'toast-below-msg';
    el.appendChild(span);
    document.body.appendChild(el);
  }
  return el;
}
function placeExtTip() {
  const el = extTipEl();
  const tag = extDrop.alt ? 'copy' : 'file';
  if (el.dataset.kind !== tag) {
    const span = el.querySelector('.toast-below-msg');
    if (span) span.textContent = T(extDrop.alt ? 'extDrop.dragToNodeCopy' : 'extDrop.dragToNode');
    el.dataset.kind = tag;
  }
  el.classList.add('show');
}
function hideExtTip() {
  const el = document.getElementById('ext-drag-tip');
  if (el) el.classList.remove('show');
}
function clearExtDrop() {
  if (extDrop.id) {
    const row = document.querySelector('.node-row[data-id="' + extDrop.id + '"]');
    const c = row && row.querySelector(':scope > .card');
    if (c) c.classList.remove('ext-drop-target', 'is-self');
  }
  extDrop.id = '';
  const el = document.getElementById('ext-drop-hint');
  if (el) { el.classList.remove('show'); el.classList.remove('warn'); }
  hideExtTip();
}
// 整个「外部拖入会话」收尾：松手 / 拖出画布 / 拖拽取消 都走这里（宿主发 extDragEnd）。
function endExtDrag() {
  clearExtDrop();
  extDrop.kind = null; extDrop.live = false; extDrop.alt = false;
  clearDragCaches();   // 外部拖入也会建矩形表（拖拽期间复用）→ 一起清，别留给下一次内部拖拽
}
// 宿主转发：指针在画布上（宿主那边已按 rAF 合并，一帧最多一条）
function extDragOver(clientX, clientY, kind, alt) {
  extDrop.live = true;
  extDrop.alt = !!alt;   // ⌥ 按住 = 复制进来（不搬文件，只建壳 + 挂节点），提示文字跟着换
  // kind 由宿主给：'file' | 'folder' | 'self'（拖的是当前这张导图自己）| 'other'
  if (kind != null) {
    extDrop.kind = (kind === 'file' || kind === 'folder' || kind === 'self') ? kind : 'other';
  }
  if (extDrop.kind === 'other') { clearExtDrop(); return; }   // 拖的不是文件/文件夹 → 全程不提示
  const id = extDropNodeAt(clientX, clientY);
  if (id === extDrop.id) {                                    // 同一张卡 / 都在空白：只更新位置（不闪）
    if (id) placeExtHint(id, extDrop.kind);
    else placeExtTip();                                       // 还没压住节点 → 底部常驻提示
    return;
  }
  clearExtDrop();                                                // 换卡 / 走到空白：提示立刻消失
  if (!id) { placeExtTip(); return; }                           // 空白处：提醒"要压到节点上，松手=取消"
  hideExtTip();                                                  // 压住节点了 → 收掉浮标，改由卡片提示接棒
  extDrop.id = id;
  markExtCard(id, extDrop.kind === 'self');
  placeExtHint(id, extDrop.kind);
  // 贴边自动滚屏：复用内部拖拽那个（它读的是一对屏幕坐标，与来源无关）
  try { autoScrollOnDrag({ clientX: clientX, clientY: clientY, preventDefault: function () {} }); } catch (_) {}
}
// 宿主转发：松手了。落在哪个节点**以这一刻的指针位置为准**（不依赖之前高亮过谁）。
//   alt = ⌥ 按住（复制进来）；普通拖 = 转入（搬走）。
function extDragDropAt(clientX, clientY, alt) {
  const id = extDrop.id || extDropNodeAt(clientX, clientY);
  const kind = extDrop.kind;
  const altCopy = (alt === undefined) ? !!extDrop.alt : !!alt;
  endExtDrag();
  // 'self'（拖的是当前这张导图自己）= 拖拽时已经红字说明了 → 松手什么都不做，也不再弹窗
  if (!id || kind === 'other' || kind === 'self') return;   // 空白处 / 自己 → 什么都不做，文件留在原处
  // 节点标题只给宿主的成功提示用（"已放入「xxx」"）→ 压成一行、截断，别把多行/超长标题带过去
  let title = '';
  try {
    const r = findNode(state.tree, id);
    title = String((r && r.node && r.node.title) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  } catch (_) {}
  try { vscode.postMessage({ type: 'importDropAt', nodeId: id, nodeTitle: title, alt: altCopy }); } catch (_) {}
}
// 拖拽到视图边缘时自动滚动（光标停在边缘即可把画布滚到看不见的节点，便于拖过去；2026-08-26 需求）
const EDGE = 60;              // 距边多少像素进入触发区
// 2026-08-30 定：自动滚动速度可调（CSS 变量 --auto-scroll-speed，默认 8，原 24 太快）
// 拖拽中读 dragstart 快照（cfgNum 每次 getComputedStyle，不能留在每事件的路径上）；框选等非拖拽场景退回现读。
function autoScrollMax() { return (state.dragCfg && state.dragCfg.scrollSpeed) || cfgNum('--auto-scroll-speed', 6); }
let autoScrollRAF = null;
let autoScrollDX = 0, autoScrollDY = 0;
let lastDragX = 0, lastDragY = 0;
let marqueeRect = null; // 框选矩形（屏幕坐标），自动滚动时复用做节点命中
// 框选期间的「重画+重判」回调（2026-09-22）：拖到边缘自动滚动时鼠标是**停住**的、不再触发 mousemove，
// 所以必须由滚动帧来推动 —— 否则框原地不动、内容却滚了很远，看起来就是个固定的长方形（用户实报）。
let marqueeUpdater = null;
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
      // ⚠️ 这里必须是「每帧全量重测」：算术平移缓存（shiftDragRects，2026-10-10 试做）已回撤 ——
      //   它要求「pan 只被本函数改」，而拖拽途中 pan 还可能被触控板双指 / 宿主回推等路径改动，
      //   缓存一旦和真矩形脱节，预测线就按错位坐标乱画（用户实报「自动滚动时线飘得乱七八糟」）。
      //   每帧全量重测会把任何来源的位移自动盖掉，是被验证过的行为；只在贴边滚动时发生，开销可接受。
      buildDragRects(); // 画面滚了 → 节点视口坐标变了，刷新缓存再预测
      const np = dragNodeXY(lastDragX, lastDragY); // 与画布的 dragover 预测同基准：节点左中心
      const t = nearestDropTarget(np.x, np.y);
      state.dragPreview = t || { targetId: null, position: 'root' };
      if (t) state._lastDrop = { targetId: t.targetId, position: t.position };
      applyDragPreview(state.dragPreview);
      updateDragCurve(state.dragPreview, np.x, np.y);
    }
    // 外部拖入（文件列表 → 节点）贴边滚屏时同理：画面动了 → 矩形重测 + 落点重判（2026-10-17）
    else if (extDrop.live) {
      buildDragRects();
      extDragOver(lastDragX, lastDragY);
    }
    // 框选拖拽中：画面滚了 → 让框**继续沿滚动方向变长**并重新命中节点（框固定屏幕、节点滚进框内 → 实时选中）
    else if (state.marquee && marqueeUpdater) marqueeUpdater();
  }
  autoScrollRAF = requestAnimationFrame(tickAutoScroll);
}
function autoScrollOnDrag(e) {
  lastDragX = e.clientX; lastDragY = e.clientY;
  // 指针已被判"在画布外"（宿主发过 nodeDragOut）→ 别再滚：这类事件来自"还没清标记的那一帧"，
  //   或宿主/画布两侧消息的竞态窗口。没有它，偶尔会有一帧把旧速度重新点起来（2026-10-17）。
  if (extOutStop) { stopAutoScroll(); return; }
  const r = state.dragVpRect || viewMap.getBoundingClientRect(); // dragstart 快照：每个 dragover 事件都读矩形 = 每次强制重排（2026-10-10 改缓存）
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
// 全屏档（2026-09-22 用户定）：宿主 toggleFullscreen 下发，init 与 fsMode 消息两处都调这里。
//   'window'  = 窗口全屏：加 body.fs-window（画布侧只留这个标记位，给别的规则用）。
//   'desktop' = 桌面全屏（原生全屏）：系统自己收起红绿灯，同样只留标记位。
//   ''        = 退出全屏：两个类都摘掉。
//   ⚠️ 原来「窗口全屏时给 macOS 红绿灯让位」那条（撑大顶部条内边距）2026-10-06 随顶部条一起作废 ——
//      路径条 / 全屏按钮现在住在系统标题栏上，让位不归画布管了。
let fsModeNow = ''; // 当前全屏档（'window' / 'desktop' / ''）—— 切全屏按钮位置时要拿它重刷图标与提示
// 「全屏专注模式」命令当前生效的快捷键显示串（如「⌘⇧F」）：宿主随 init 下发（2026-10-01）。
// 只用来填按钮提示里的 {fsHk}；**没绑定就是空串 → 提示里连括号一起不显示**（不留一对空括号）。
let fsHotkeyText = '';
// 全屏按钮的悬浮提示 —— **唯一出口**（三处共用：applyFsMode / 右上角那颗的装载期初值 / 切按钮位置重刷）：
//   非全屏 → 「全屏专注模式（⌘⇧F）（按 ⌘ 点击：仅在窗口内全屏）」：点击=桌面全屏，⌘+点击=仅在窗口内全屏
//   全屏中 → 「退出全屏专注模式（Esc）」：窗口档 / 桌面档**同一句**（两档行为一致，点 / ⌘+点击 都是退出）
function fsTip() {
  // `{0}` = 键位段的占位（nmApplyTip 会把它渲染成浅色那一段）。没绑键 → 占位一起抹掉，
  // 不留一对空括号（`fsHotkeyText` 由宿主下发，拿不到时就是空串）。
  if (fsModeNow) return T('tb.fullscreenExit');
  const base = T('tb.fullscreen');
  // ⚠️ 没绑键时必须把 `（{fsHk}）` **整段**删掉（2026-10-21 用户实报：只把 {fsHk} 换成空串，
  //    会留下一对空括号「全屏专注模式 ()」，很难看）。中英文括号都认。
  return fsHotkeyText ? base.replace('{fsHk}', '{0}') : base.replace(/\s*[（(]\{fsHk\}[）)]/, '');
}
function applyFsMode(mode) {
  try {
    fsModeNow = mode || ''; // 记住当前档（Esc 分支 / 路径条让位 / 退出收尾都要用它）
    document.body.classList.toggle('fs-window', mode === 'window');
    document.body.classList.toggle('fs-desktop', mode === 'desktop');
    // 画布里的两颗全屏按钮 2026-10-06 都删了 —— 全屏按钮只剩系统标题栏上那一颗，
    // 它的图标与提示由宿主 refreshHeaderFsIcon() 维护，这里不再刷任何按钮。
  } catch (_) {}
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
  for (let i = 0; i < list.length; i++) {
    const el = edgePathEls[i];
    el.setAttribute('d', edgeD(list[i].x1, list[i].y1, list[i].x2, list[i].y2));
    // 2026-09-24 试验：Minor / 已完成的节点 → 连到它的这条线变灰（CSS .edge-dim，固定灰不跟主题）
    el.classList.toggle('edge-dim', !!list[i].dim);
  }
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
      // 2026-09-24 试验：这条线要不要变灰 —— 看**子节点那一行**带不带 .done 类。
      //   复用渲染时已算好的类（buildRow 里 = doneChain || selfDone，selfDone = Minor 或已完成），
      //   所以"父节点 done 连坐子节点"那档自动跟着灰，与卡片自身的置灰视觉一致。
      const krow = kc.parentElement;
      list.push({
        x1: x1, y1: y1,
        x2: (kr.left - tr.left) / s, y2: (kr.top + kr.height / 2 - tr.top) / s,
        pid: row.getAttribute('data-id'),
        kid: (krow && krow.getAttribute('data-id')) || '',
        dim: !!(krow && krow.classList && krow.classList.contains('done'))
      });
    });
  });
  return list;
}
function drawEdges() {
  const edgesT0 = performance.now(); // 实测本次耗时 → 供 scheduleEdges 分流（见 EDGES_HEAVY_MS 注释）
  // 视图不可见（宿主切到同组别的标签页 → 整叶 display:none，所有卡片矩形读数都是 0）时不重画：
  // collectEdges 的「宽/高 < 1 不画」守卫会把每条边都滤掉 → paintEdgePaths([]) 把全部连线删光，
  // 而切回时又没有别的补画机制 → 表现为「切回导图曲线全消失、鼠标动一下才回来」。
  // 返回 null：paintMotionEdges 对 null 边表本来就跳过，不受影响。
  const vr = treeEl.getBoundingClientRect();
  if (vr.width < 1 && vr.height < 1) return null;
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
// 隐藏 → 恢复可见时补画一次连线（2026-10-10）：宿主切走标签页时整叶 display:none（尺寸 0），
// 隐藏期间 drawEdges 一律早退（见 drawEdges 开头守卫）；ResizeObserver 在 display:none ↔ 显示
// 切换时都会触发，尺寸回到非 0 就补一帧重画 —— 防「隐藏期间布局变了，回来后连线停在旧位置」。
// typeof 守卫：离线自检的沙盒环境没有 ResizeObserver，不能顶层直接 new（initCenterObs 是函数内懒建才没事）。
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(() => {
    if (viewMap.getBoundingClientRect().width < 1) return; // 变隐藏：不画
    redrawEdgesNextFrame();
  }).observe(viewMap);
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
  // multi-ref：这个节点管理的文件**被多处管理**（2026-10-09 用户定）→ 黄虚线框 + 警告图标 + 常驻 toast。
  //   挂在 **row** 上（不是 card 上）—— 与 .done 同一套写法，CSS 才写得出 `.node-row.multi-ref > .card`。
  const multiRef = !!nmMultiRefOf(node);
  row.className = 'node-row row-lv' + Math.min(depth, 2) + (isSelected(node.id) ? ' selected' : '') + (isMulti ? ' multi-selected' : '') + (done ? ' done' : '') + (multiRef ? ' multi-ref' : '') + (td ? ' td-done' : '') + (node.bold ? ' bold' : ''); // 2026-08-30：补 bold 类（原只挂到链接节点，普通节点漏了→加粗不显示）；2026-09-20：补 td-done（已完成待办 → 删除线，且连坐子树）；2026-10-09：补 multi-ref
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
// 子节点 c 在当前筛选（隐藏 Minor/Done、只看 Now）下是否可见 —— 与 buildRow 顶部的剔除条件同源，
// 供折叠按钮存废判据复用（只在 depth ≥ 1 的子节点上用，故不判 depth）。parentDone = 父链累计的 done。
function childVisible(c, parentDone) {
  if (!c) return false;
  const doneC = parentDone || nodeIsMinor(c) || nodeTodoDone(c);
  if (state.hideDone && doneC) return false;
  if (nowVisibleSet && !nowVisibleSet.has(c.id) && !state.justCreated.has(c.id)) return false;
  return true;
}
// ===== 标题 DOM 结构（2026-10-05 重排）=====
//   <div class="title">[前缀图标…]<span class="tt">正文</span></div>
// 为什么要多这一层 `.tt`：图标（待办 / Now / Minor / AI 标记）原来是直接躺在 `.title` 里的
//   contenteditable=false 元素，编辑时它们**属于编辑内容**，于是三件事一起出问题：
//     ① ⌘A 全选删除会把图标一起删掉（状态还在、图标没了）；
//     ② 光标能停在图标前面或两个图标之间（在那儿打字会插到图标前面）；
//     ③ 在文字最前面插换行 → 图标被单独挤到第一行，文字掉到第二行。
// 现在图标留在 `.title`（**编辑区之外**）、正文统一装进 `.tt`，编辑时只有 `.tt` 是 contenteditable ——
//   跟备注一个思路（备注那条灰竖条也是画在可编辑区外面的），但**不用左右分栏**：
//   `.tt` 是 inline，文字照旧内联接在图标后面，换行也从左边正常续，编辑态与非编辑态外观完全一致。
// ⚠️ 凡是往 `.title` 里写正文的地方，一律走 setTitleInner()，别直接 `title.innerHTML = cardTitleInner(...)`
//   —— 那会把 `.tt` 整个冲掉，标题就退回旧结构、三个问题原样回来。
function titleTextEl(titleEl) { return titleEl ? titleEl.querySelector(':scope > .tt') : null; }
function setTitleInner(titleEl, node) {
  titleEl.textContent = ''; // 清旧内容（旧 .tt + 旧图标）
  // 图标在前、正文在后：图标是 .title 的直接子节点（编辑区之外），正文进 .tt
  if (node.title) titleEl.insertAdjacentHTML('beforeend', cardTitleIcos(node));
  const tt = document.createElement('span');
  tt.className = 'tt';
  tt.innerHTML = cardTitleInner(node); // 标题里内嵌的 [[标题|ID]] 渲染成链接
  titleEl.appendChild(tt);
  return tt;
}
function buildCard(node, depth, done) {
  const card = document.createElement('div');
  // 层级类（视觉：根 lv0 蓝底 / 一级 lv1 浅蓝底 / 普通 ln 无背景）+ 颜色 + 完成置灰
  card.className = 'card ' + (depth === 0 ? 'lv0 is-root' : depth === 1 ? 'lv1' : 'ln')
    + (node.color ? ' color-' + node.color : '')
    + (nodeIsNow(node) ? ' now' : '')
    + (nmDocNodeOf(node) ? ' doc-node' : '') // 文档节点（2026-10-08）：蓝色 + 淡蓝底，与普通双链区分
    // has-kids（2026-10-11 用户定）：卡片右侧那块 26px 的 hover 热区（.card::after）本来是给
    //   折叠按钮留的（鼠标挪到按钮上时卡片不许掉 hover）。**没有子节点的卡片上根本没有折叠按钮**，
    //   却照样吃这块热区 → 鼠标停在节点右边一片空白上，节点也进了 hover/待选态（用户实报）。
    //   所以只给有子节点的卡片挂这个类，CSS 那边把 ::after 收到 .card.has-kids 上。
    + ((node.children && node.children.length) ? ' has-kids' : '')
    + (done ? ' done' : '');
  card.draggable = true;
  card.dataset.id = node.id;
  // 整个卡片悬停的黑色小字提示（2026-10-09 用户定）：**只有**"管理着某份文件"的节点才挂 ——
  //   告诉用户点它干嘛、以及 ⌘ 点击的额外效果。挂在卡片上（**不是**标题里那个小图标），悬停节点任意位置都出。
  //   ⚠️ 被多处管理的（「文档警告节点」）换成另一句 + **黄底警告样式**（2026-10-09 用户定）——
  //     那句里带「（右键管理）」，括号那截会自动走 nm-tip-h（浅色）。
  const mgTip = nmManagedOf(node);
  if (mgTip) {
    const multiTip = !!nmMultiRefOf(node);
    nmApplyTip(card, T(multiTip ? 'tip.multiRefDoc' : (mgTip.kind === 'doc' ? 'tip.openDocNode' : 'tip.openFileNode')), '', null, multiTip,
      T(multiTip ? 'tip.multiRefDocH' : (mgTip.kind === 'doc' ? 'tip.openDocNodeH' : 'tip.openFileNodeH')));
  }

  // （selfDone / selfNow 两个局部变量已随图标渲染收敛进 cardTitleIcos 而删除，2026-10-05）
  // 「无标题节点的前缀图标」不再单独 DOM 插入（之前会让卡片 column 布局把图标和空标题块分成两排，
  // 编辑时空标题节点视觉裂成"图标一行 + 文字一行"；2026-08-31 修）。改为：塞到 title 元素里
  // 跟非空标题共用一条渲染链路，编辑/未编辑态自然同列。
  // 图标 HTML 与有标题那条路**共用 cardTitleIcos**（2026-10-05 收敛），这里只负责"放到最前面"。
  function prependIcoIntoTitle(titleEl) {
    if (node.title) return; // 有标题：图标已由 setTitleInner 放好（在 .tt 之前）
    const tmp = document.createElement('div');
    tmp.innerHTML = cardTitleIcos(node);
    // （空标题这条路原先另给 Now / Minor 挂原生 title 提示，2026-10-05 起两个图标都改走 data-tip
    //   且统一在 cardTitleIcos 里写好了 —— 这里不再单独补，两条路的提示语天然一致。）
    // 收集完再交给 prependInOrder 一次放好（**别在这里一个个 insertBefore(firstChild)** ——
    // 那是"每次插到最前"，正序插会把顺序整个翻过来，2026-09-21 实踩：编辑后 Todo 跑到最后）。
    prependInOrder(titleEl, Array.prototype.slice.call(tmp.children));
  }

  if (node.title != null) { // 2026-08-28：空字符串也渲染 title（空白节点双击进编辑需要 .title 元素存在；原 if(node.title) 空串 falsy 跳过）
    const title = document.createElement('div');
    title.className = 'title';
    setTitleInner(title, node); // 正文进 .tt（图标留在 .title 编辑区外，见 setTitleInner 上方注释）
    prependIcoIntoTitle(title); // 空标题节点的前缀图标塞进 title 元素内，避免卡片 column 布局拆成两排
    attachPrefixIcos(title, node); // 四个前缀图标都可点（每次重建标题 DOM 都要重绑，2026-09-20 / 2026-10-05 扩到四个）
    bindInline(title);
    title.ondblclick = e => {
      e.stopPropagation();
      // 2026-08-25 改：取消"未选中双击全选"。双击 = 进编辑、光标插点击处（回到 08-21 原行为）。
      // "编辑时双击全选"只在该双击发生前就已在编辑（由单击进编辑、停留后再双击）才触发；
      // 否则双击会先经 card.onclick 进编辑，dblclick 紧接着到 → 若不过滤会把刚进编辑的也全选。
      if (state.editingTitleId === node.id && Date.now() - titleEditStartTs > 250) { selectAllInEdit(titleTextEl(title) || title); return; }
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
        if (state.editingTitleId === node.id) { e.preventDefault(); e.stopPropagation(); selectAllInEdit(titleTextEl(title) || title); }
      }
    };
    card.appendChild(title);
  }

  // 折叠按钮存废看「筛选后还有没有可见子节点」而非 children.length：隐藏 Minor/Done（或只看 Now）
  // 把子节点全收走后，折叠按钮点了不会有任何画面变化 → 整个不渲染，这张卡当普通叶子（2026-09-22 用户报）
  if (node.children.some(c => childVisible(c, done))) {
    const folded = node.fold;
    const foldTag = document.createElement('div');
    foldTag.className = 'fold-tag' + (folded ? ' always' : '');
    const arrow = document.createElement('span');
    arrow.className = 'fold-arrow';
    // 🔴 2026-10-22：箭头换成**矢量几何**（lucide chevron-left），不再用字符 `‹`。
    //   字符是字体画的：尖角、且按行盒居中（字形上下有字体留白）→ 换字体/缩放会偏一点点，
    //   这正是"有人看着没居中、自己测不出来"的根因。几何箭头圆角 + 居中由 viewBox 保证。
    //   ⚠️ 只换箭头本身 —— 外面的圆圈、白底、边框、悬停变色、折叠后的数字徽章**全部不动**。
    //   🎚 大小走旋钮 `--fold-arrow-size`（默认 14px = 正好填满 17px 的胶囊；想更大就调，别超过 15）。
    if (!folded) arrow.innerHTML = renderIcon('fold-arrow', 14);
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
      if (_imgPrefetchBusy) return; // 上一次「展开前预取」还没回来：忽略这次点击（窗口只有几百毫秒）
      // 折叠：历史态与编辑态走【同一条】路（2026-09-14 修 —— 原来给历史态单开一个早返回分支、漏了 keepView，
      // 表现为"点了折叠按钮，原来点的那张卡跑掉/画面不定住"）。历史态唯一该少的就是「写回」：
      // 不 pushUndo（撤销栈不该被沙盒污染）、不 emitUpdate（守卫本来也拦着）。
      const doToggle = () => {
        // 预取是异步的（最长 IMG_PREFETCH_TIMEOUT_MS）：等待期间树可能被重建过 → 这个 node 已经游离，
        // 再翻它的 fold 只会白重绘一次（还会往撤销栈压一条没意义的记录）。先确认它还在树里。
        if (!findNode(state.tree, node.id)) return;
        if (!state.historyMode) pushUndo();
        node.fold = !node.fold;
        // 折叠会改变画面上看得见什么 → 「聚焦当前关注」项的可用性跟着刷一遍
        // ⚠️ 折叠**不触发**自动关闭 showNow（2026-10-01 用户定：折了只是临时看不见，开关保持原样）
        updateNowFilterItem();
        keepView(node); // 锚定本次点的这张卡：折叠会改布局把它顶走，记下坐标由 render 末尾补偿
        if (state.historyMode) { renderHistoryTree(false, true); return; } // 历史态折叠同样走过渡（2026-09-20 放开）
        emitUpdate();
        renderWithMotion(); // 折叠/展开让周围节点平滑让位（关掉动效：设置页「高级 → 动效」）
      };
      // 🔴 展开前先把这一支里「还没记住尺寸」的图预取一遍（见 IMG_PREFETCH_TIMEOUT_MS 那段说明）：
      //   否则渲染当场没尺寸可占位，图到达会把布局撑开 = 「第一次展开顿一下」。
      //   折叠（收起）不用预取 —— 收起来看不见，没有布局变化。
      //   ⚠️ `node.fold` 此刻还是**旧值**：true = 当前折着 → 这一下正是「展开」→ 要预取（2026-10-16 曾写反）。
      const need = node.fold ? imgPathsNeedSize(node) : [];
      // 展开时还要先把「链接目标标题 + 文档判定」两张表要到手（同图片尺寸预取一个道理）：
      // 否则展开后这两个回包会各触发一次**无过渡的整树重建**，外面卡片当场瞬移
      //（2026-10-16 日志实证：大展开后 1000ms 时采样的 20 张外部卡片元素全被换掉）。
      const go = () => {
        if (!node.fold) { doToggle(); return; }   // 收起：没有新内容要问，不必预取
        _imgPrefetchBusy = true;
        prefetchLinkMeta(() => { _imgPrefetchBusy = false; doToggle(); });
      };
      if (need.length) {
        _imgPrefetchBusy = true;
        prefetchImgSizes(need).then(() => { _imgPrefetchBusy = false; go(); });
        return;
      }
      go();
    };
    card.appendChild(foldTag);
  }

  // 备注行：有内容就显示；正在编辑空备注时也显示（机制：一进编辑文本层面就有这一行，编辑完没文字自动消失）
  if (node.note || state.editingNoteId === node.id) {
    const n = document.createElement('div');
    n.className = 'note';
    // 备注的 AI 生成标记（airemark，2026-10-14）：标记后左侧那条灰竖线拆成两段 ——
    //   上面一颗 AI logo（可点清除）、下面还是原来的灰竖线（::before 用 margin-top 让位，见 CSS）。
    //   logo 绝对定位钉在左上、不进 flex 流，所以 .note > div 那条文字区选择器不受影响。
    if (hasAiremark(node)) {
      n.classList.add('has-airemark');
      // ⚠️ 2026-10-14 用户定：备注**只有一行**时不要侧边灰竖线（只留一颗 logo）——
      //    单行时竖线本来就被 logo 挤得只剩几像素，留着像个多余的小点。
      //    判据 = 备注文字里没有换行符（长文自动折行仍算多行，照旧画竖线）。
      if (String(node.note || '').indexOf('\n') < 0) n.classList.add('note-single');
      const ai = document.createElement('span');
      ai.className = 'airemark-ico';
      ai.setAttribute('contenteditable', 'false');
      ai.title = ''; // 屏蔽 .note 上那条原生 title（"双击编辑备注"），否则会和下面的黑色小字叠着弹
      ai.dataset.tip = T(airemarkOf(node.airemark) === 'mix' ? 'tip.icoClearAiMix' : 'tip.icoClearAi');
      ai.dataset.side = 'top';
      ai.innerHTML = renderAiremarkIcon(node, 14);
      // mousedown（不是 click）+ 编辑态"回到原位"：与标题前缀图标同款（见 attachPrefixIcos）——
      //   正在编辑备注时点它，动作做完回到原来那个编辑位置，光标不被 render 甩掉
      ai.onmousedown = e => {
        e.stopPropagation();
        e.preventDefault();
        const _editBack = captureEditTarget();
        clearMarkOfNode('airemark', node);
        if (_editBack) resumeEditTarget(_editBack);
      };
      n.appendChild(ai);
    }
    // 文字区必须是 .note 的子 div（匹配 CSS .card .note > div；竖线是 ::before）。
    // 之前内容直接放容器 → 编辑时把整行（含竖线）变成编辑框 → 光标与竖线重叠（2026-08-22 修）
    const text = document.createElement('div');
    text.innerHTML = renderInline(node.note); // 备注里内嵌的 [[标题|ID]] 渲染成链接
    bindInline(text);
    n.appendChild(text);
    n.title = T('tip.editNote');
    n.ondblclick = e => {
      e.stopPropagation(); // 别让 card.ondblclick 抢去开标题编辑
      // 已经在编辑这条备注（单击那条路刚进来，双击的 dblclick 紧随其后）→ 直接返回。
      // ⚠️ editSession 没有重入守卫，再调一次 = 开第二个会话（双份监听、activeEditFinish 被覆盖）（2026-10-01）
      if (state.editingEl === text) return;
      startEditNote(node, text, { x: e.clientX, y: e.clientY });
    };
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
      // Obsidian 尺寸后缀（![[img.png|700]]）：用户写死的大小 > 记忆/占位尺寸，最后说了算
      //   （放在 applyImgSizeHint 之后，免得被它按记忆尺寸覆盖）。节点随图变宽自动外扩（文档流布局）。
      //   ⚠️ 必须**就地解除两道上限**，否则写了尺寸也看不出变化（2026-10-21 用户实报"还是默认宽度"）：
      //     ① `.card .img` 的 max-width/max-height（--img-maxw/maxh 是 45/32px 的缩略图尺寸）；
      //     ② `.card` 的 max-width（--card-maxw = 480px）—— 不解除的话图会溢出卡片、节点也不外扩。
      const esz = nmEmbedSize(p);
      if (esz.w || esz.h) {
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        // 卡片上限只在**图片比它宽**时放开，放开也要给个具体值 = 图片宽 + padding（2026-10-21 用户定）。
        //   设 'none' 会让标题文字也不换行、节点一路往后延伸 = 用户说的「忽然变成无限宽」。
        if (imgOverCardMaxw(esz.w)) card.style.maxWidth = cardMaxwForImg(esz.w, card);
        // 宽高都写死时别拉伸/裁切（默认 object-fit: cover 会按框裁掉），完整显示；
        // 只写宽度时高度交回图片自身比例（否则会沿用缩略图缓存里的 32px 占位 → 先压成一条横条）
        if (esz.w && esz.h) img.style.objectFit = 'contain';
        else if (esz.w) {
          // 只写宽度：高度得能占位，否则图加载前高度是 0、到达后再撑开 = 抖一下（2026-10-21 用户实报）。
          //   缓存里若已经记着**同一个宽度**的尺寸（拖拽松手时记的 / 预取按显式尺寸算的），高度直接留下用；
          //   只有缓存宽度对不上（老的缩略图估值）才清空，交回图片自身比例。
          const c = imgSizeCache[p];
          if (!(c && c.w === esz.w && c.h > 0)) img.style.height = '';
        }
        else img.style.width = '';
      }
      if (esz.w) img.style.width = esz.w + 'px';
      if (esz.h) img.style.height = esz.h + 'px';
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
      // 悬停右下角出现拖拽把手：拖动改宽度，松手把宽度写回文件名后缀（![[图|宽]]，2026-10-21 用户定）
      const wrap = document.createElement('span');
      wrap.className = 'img-wrap';
      wrap.appendChild(img);
      const grip = document.createElement('span');
      grip.className = 'img-resize';
      grip.innerHTML = IMG_RESIZE_SVG; // 2026-10-21 换设计稿：折角图标，颜色由 CSS 的 color 决定
      grip.title = T('tip.imgResize');
      bindImgResize(grip, img, p, node);
      wrap.appendChild(grip);
      imgs.appendChild(wrap);
    });
    card.appendChild(imgs);
  }
  // 链接：**没有单独的渲染路**（2026-09-29）—— 链接就是正文里的一段文字，由 cardTitleInner 的
  //   renderInline 统一画（整行是链接、还是混在文字里，一视同仁）。所以这里什么都不做：
  //   位置天然就是正文的位置，也不需要再管"插在备注前还是后"。
  // 音视频嵌入（v2：![[文件名]] 附属行，就地播放器；源文件在 vault 内按文件名找）
  if ((node.embeds || []).length) {
    const box = document.createElement('div');
    box.className = 'embeds';
    node.embeds.forEach(p => {
      // 名字可能带 Obsidian 尺寸后缀（音视频写尺寸罕见，但保真存储不挑）—— 判类型 / 解析用剥后的
      const isAudio = /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(nmEmbedSize(p).name);
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

  // AI 更改规则块（2026-10-05）：备注**下面另一块**（用户定：两块、中间断开，不是塞进备注里）。
  //   形式照备注那套（左竖条 + 灰字），渲染也照备注（renderInline，内嵌链接照常可点）；
  //   但用独立的 .ai-rules 容器 —— 两块各画各的竖条，样式分开调（见 CSS）。
  // 「显示 / 隐藏规则」= **整个不渲染**（2026-10-06 第二版，用户定：跟隐藏次要节点一个道理）。
  //   原来是「收成底部一根小横条 + 选中才展开」，用户否掉了 —— 横条会跟着选中状态冒出来又缩回去，
  //   点别的节点它就弹一下，很怪。现在：关着就当它不存在。
  //   ⚠️ 正在编辑这一块时**一定渲染**（不然一点「AI 更改规则」编辑框就没了），所以判据里带上 editingAiRulesId。
  if (state.editingAiRulesId === node.id || (node.aiRules && aiRulesFullOn)) {
    const ar = document.createElement('div');
    ar.className = 'ai-rules';
    const text = document.createElement('div');
    text.innerHTML = renderInline(node.aiRules);
    bindInline(text);
    ar.appendChild(text);
    ar.title = T('tip.editAiRules');
    ar.ondblclick = e => {
      e.stopPropagation(); // 别让 card.ondblclick 抢去开标题编辑
      if (state.editingEl === text) return; // 已在编辑这一块（单击那条路刚进来）→ 别重入会话
      startEditAiRules(node, text, { x: e.clientX, y: e.clientY });
    };
    card.appendChild(ar);
  }
  card.ondragstart = e => {
    // 🔴 ⌘ / Ctrl + 拖 = **不拖**（2026-10-19 定）：macOS 把 ⌘+拖 判成系统级「建别名（link）」，
    //   drop 会被系统吞掉 → 松手节点弹回原位 + 冻住约 1 秒。网页层改不了系统那套，只能**根本别发起拖拽**。
    //   （有的画布类插件压根不用 HTML5 拖拽，⌘+拖 天然就是框选。）
    //   这里直接 cancel 掉 dragstart → 手势退化成"⌘+点击 = 加选/减选"，与多选那条一致。
    //   ⚠️ 只在 **⌘/Ctrl** 上拦；⌥ 是 macOS 认可的 copy 语义，必须放行（⌥+拖 = 复制）。
    if (e.metaKey || e.ctrlKey || state._noDrag) {
      e.preventDefault();
      state._noDrag = false;
      dbgDrag('dragstart·已拦下（⌘/Ctrl 不拖）', 'meta=' + e.metaKey + ' ctrl=' + e.ctrlKey);
      state.dragId = null;
      state.dragIds = null;
      return;
    }
    state.dragId = node.id;
    state._lastDrop = null; // 新一次拖拽：换挡余量的「上一刻落点」从头算
    // 诊断（2026-10-18 临时工装）+ 兜底落位的两个标记：每次拖拽重新起算
    _dbgDragT0 = 0; _dbgDragN = 0; _dbgOverLoggedAt = 0;
    state._dropDone = false;
    state._metaNoDrop = false;   // 每次拖拽重新起算（拖到一半按 ⌘ 才置 true，见 viewMap 的 dragover）
    state._dragAlt = false;      // 2026-10-19：⌥ 状态也重新起算，别把上一次的拖拽记忆带进来
    nmDragCanceled = false;
    dbgDrag('dragstart', 'meta=' + e.metaKey + ' alt=' + e.altKey + ' ctrl=' + e.ctrlKey + ' shift=' + e.shiftKey + ' id=' + node.id);
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
    // 拖拽会话的整套帧内缓存（2026-10-10）：id→行、id→矩形、视口/树矩形、无效落点集合、旋钮快照。
    // 目标 = 拖拽期间零 getComputedStyle、零全文档扫描、零强制重排。
    state.dragRowById = new Map();
    state.dragRows.forEach(r => state.dragRowById.set(r.dataset.id, r));
    state.dragVpRect = viewMap.getBoundingClientRect();
    state.dragCfg = {
      sticky: cfgNum('--drop-sticky', 0.08),
      xReach: cfgNum('--drop-x-reach', 0.5),
      rightSlack: cfgNum('--drop-right-slack', 0),
      childRange: cfgNum('--drop-child-range', 1),
      scrollSpeed: cfgNum('--auto-scroll-speed', 6),
    };
    buildDragRects(); // 拖拽开始一次性快照所有节点矩形（热路径优化，2026-09-01）
    // 「原地那张卡」的标记（2026-10-01 用户定）：拖拽时画面里有两张同款卡（原地一张 + 鼠标上那张跟手悬浮卡），
    // 容易混。给原地的挂 .drag-src → CSS 把边框改成**虚线**（颜色照旧 = 选中态那圈）。多选拖拽时几张源卡都挂。
    // 摘除统一在 clearDragHighlights()（drop / dragend / dragleave 都走它）。
    // 「被拖根 + 全体后代」集合：既是 .drag-src 标记名单，也是帧内无效落点判定的 O(1) 查询表
    // （state.dragInvalid，2026-10-10；isInvalidDropTarget 不再每候选走 isDescendant 树遍历）。
    const srcIds = new Set(state.dragIds);
    state.dragIds.forEach(id => {
      const r = findNode(state.tree, id);
      if (!r || !r.node) return;
      (function walk(n) { (n.children || []).forEach(c => { srcIds.add(c.id); walk(c); }); })(r.node);
    });
    state.dragInvalid = srcIds;
    // 通知宿主「画布上开始拖节点」（2026-10-17）：拖到 iframe 外松手 = 转出（由宿主判定，见 main.js extDrop）。
    //   vscode.postMessage 是**同步**调用宿主 → 紧接着的 dragover 里宿主就看得到，不存在"晚一步"。
    try { vscode.postMessage({ type: 'nodeDragStart', id: node.id, multi: (state.dragIds || []).length > 1 }); } catch (_) {}
    // 「拖出去转出」记一份节点 id：drop 之后 dragend 会立刻把 state.dragId 清掉，而宿主的 nodeDropOut
    //   是异步消息 —— 到那时再读 state.dragId 已经是空的（多选拖拽不接，所以只记单个）。
    nodeDragOutId = ((state.dragIds || []).length > 1) ? '' : node.id;
    try {
      // **整棵子树一起标**（2026-10-01 用户定）：拖走一个节点 = 它下面整棵都跟着走，
      // 只标源卡那一张的话，看着会像"孩子没跟着走"。后代卡同样给虚线框 + 文字置灰（CSS 见 .drag-src）。
      // ⚠️ 只能在这里逐个挂类：DOM 里的 .node-row 是**平铺**的（缩进靠样式，不是嵌套），
      //    所以 CSS 的后代选择器够不到，必须把后代 id 收出来逐个标。
      // 摘除不用管：clearDragSrcMark 是一次性 querySelectorAll 全摘，后代跟着一起掉。
      // ⚠️ 用**拖拽开始时已缓存**的 state.dragRows（见上面那行），别逐个 document.querySelector：
      //    querySelector 是**全文档扫描**，大子树下就是 N 次全扫描 —— 实测（2026-10-07）1 万节点的子树
      //    要 331ms（拖起来肉眼可见卡一下）；换成"遍历一次缓存列表 + Set 命中"只要 9ms（快 36 倍）。
      (state.dragRows || document.querySelectorAll('#tree .node-row')).forEach(row => {
        if (srcIds.has(row.dataset.id)) row.classList.add('drag-src');
      });
    } catch (_) {}
    // 自绘跟手悬浮卡（2026-08-28 定，弃 setDragImage 方案——引擎截图/锚点行为不可控）：
    // 原生截图用 1×1 透明图压掉；悬浮卡 = 干净克隆卡片（去掉折叠按钮/光环），fixed 容器 dragover 跟手移动，
    // 位置按「节点左中心」锚定（与预测线端点同源），按画布 zoom 缩放，视觉与画布卡片一致。
    const ghostBlank = document.createElement('div');
    ghostBlank.style.cssText = 'position:absolute; left:-9999px; top:-9999px; width:1px; height:1px;';
    document.body.appendChild(ghostBlank);
    e.dataTransfer.setDragImage(ghostBlank, 0, 0);
    // 🔴 显式声明"这次拖拽什么操作都接受"（2026-10-17 用户实报"按住 ⌘ 拖出画布没反应"）：
    //   macOS 上 **⌘ + 拖拽 = 创建别名（link 语义）**；不声明 effectAllowed 时浏览器按默认推断，
    //   一旦 link 不被接受，系统会**把 drop 吞掉**（dragend 照常发）—— 表现就是"松手后提示停一两秒才消失、
    //   什么也没发生"。声明成 all 之后 ⌘ 那次 drop 才派发得到宿主。
    try {
      e.dataTransfer.effectAllowed = 'all';
      // 🔴 **必须塞一份真数据**（2026-10-17 诊断日志的结论）：`types` 为空时，跨 iframe 只剩
      //   `chromium/x-drag-id`，而 `effectAllowed` 到宿主会变成 **'none'** —— 目标不接受任何操作，
      //   系统就**根本不派发 drop**（表现 = 松手后提示停一两秒才消失、什么都没发生）。
      //   放节点标题当 text/plain：内容本身无害，作用只是让这次拖拽成为"携带数据的拖拽"。
      e.dataTransfer.setData('text/plain', String(node.title || ''));
      dbgDrag('dragstart·dataTransfer', 'effectAllowed=' + e.dataTransfer.effectAllowed
        + ' types=' + (e.dataTransfer.types ? Array.prototype.join.call(e.dataTransfer.types, ',') : '?'));
    } catch (_) {}
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed; left:0; top:0; z-index:9999; pointer-events:none; will-change:transform;';
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
  // 拖拽预测统一交给 #view-map 的 dragover（nearestDropTarget 已覆盖"卡片上 / 右侧空白 / 兄弟间隙"三种情形，
  // 并复用 applyDragPreview 做高亮）。这里只保证拖到卡片上时 drop 不被默认行为吞掉，不再单独算落点。
  card.ondragover = e => {
    e.preventDefault();
    // 同 viewMap 的 dragover（2026-10-18）：⌥ 拖到**卡片**上松手也要能落，理由见那一处注释
    try { e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'; } catch (_) {}
  };
  card.ondragleave = () => {};
  card.ondrop = e => {
    e.preventDefault();
    state._dropDone = true;   // drop 派发到了 → dragend 的兜底落位别再动一次
    dbgDrag('drop(card)', 'target=' + node.id + ' preview=' + (state.dragPreview ? ((state.dragPreview.targetId || '-') + ':' + state.dragPreview.position) : 'null'));
    card.classList.remove('drag-over', 'drag-before', 'drag-after');
    if (state.dragId && state.dragId !== node.id) {
      // 用最近一次统一预测的结果（#view-map 的 dragover 在卡片上也会冒泡触发，已写入 state.dragPreview）
      const np = dragNodeXY(e.clientX, e.clientY);
      const t = state.dragPreview || nearestDropTarget(np.x, np.y);
      // ⌥ + 松手 = 复制到落点（2026-10-18 用户定）；不按修饰键 = 照旧移动
      const altCopy = !!e.altKey;
      const mv = (tid, before) => (altCopy ? copyNodesTo : moveNodes)(state.dragIds, tid, before);
      if (t && t.position === 'invalid') {
        // 无效落点：不移动（父节点不能拖到自身/子树）
      } else if (t && t.targetId && t.targetId !== state.dragId) {
        armDropStart(e.clientX, e.clientY); // 同上：落位动画从松手处起步
        if (t.position === 'before') mv(t.targetId, true);
        else if (t.position === 'after') mv(t.targetId, false);
        else mv(t.targetId);
      } else {
        armDropStart(e.clientX, e.clientY);
        mv('root');
      }
    }
    state.dragId = null; state.dragIds = null; state.dragRows = null; clearDragCaches(); state.dragPreview = null;
    if (state._dragRAF) { cancelAnimationFrame(state._dragRAF); state._dragRAF = null; }
    state.dragGrabDX = 0; state.dragGrabDY = 0;
    cleanupDragGhost(); // 同画布的 drop：drop 路径也要清悬浮卡
    clearDragSrcMark();
    clearDragHighlights();
    e.stopPropagation();
  };
  card.onclick = e => {
    // 编辑态点另一个节点那一下：mousedown 已经把"收尾 + 选中"做完了（见 viewMap mousedown），
    // 这一次 click 必须吞掉 —— 否则会被当成"再点一次已选中的节点 = 进编辑"，当场把新节点打开编辑（2026-10-01）
    if (swallowClickAfterEditSwitch) { swallowClickAfterEditSwitch = false; return; }
    state.selectedImg = null;
    // 框选拖拽结束会附带一个 click：若落在卡片上会触发 selectNode 清空刚框选的多选（viewMap 的 click 已有 marquee 守卫，卡片这里补上；2026-08-26 修：框选后复制/删除失效的根因）
    if (state.marquee) return;
    // 编辑框内（标题/备注正在编辑）的点击 = 拖选文字等操作：不重复进入编辑。
    // 否则拖选松手触发 click → 这里再调 startEdit → 清掉刚拖出来的选区（2026-08-22 修"拖选松手选区丢失"）
    if (document.activeElement && document.activeElement.contentEditable === 'true') return;
    // 备注/图片/链接/折叠钮：交给各自的事件（双击备注编辑等），卡片不拦截，否则双击备注会被「再点=编辑标题」抢先（2026-08-21 修）
    if (e.target.closest('.img, .link, .fold-tag')) return;
    // 备注（2026-10-01 用户定）：**单击就能进编辑**，跟正文一致 —— 已选中该节点 → 直接进备注编辑
    // （光标落在点击处，与原来双击那条路同款）；未选中 → 先选中（同正文：第一下选中、第二下进编辑）。
    // 以前只能双击，手感跟正文不一致。⚠️ 别顺手改回"只选中"：正文点一下能编辑、备注不能，用户会当成坏了。
    if (e.target.closest('.note')) {
      const noteEl = e.target.closest('.note');
      const textEl = noteEl.querySelector(':scope > div');
      if (textEl && state.selectedId === node.id) startEditNote(node, textEl, { x: e.clientX, y: e.clientY });
      else selectNode(node.id);
      return;
    }
    // AI 更改规则块（2026-10-05 用户实报补上）：**跟备注一模一样的逻辑** ——
    //   已选中该节点 → 单击直接进这一块的编辑（光标落点击处）；未选中 → 先选中。
    //   漏了这条时的症状：点这一块会先进正文、再点一下才进这里（两下），而备注一下就到。
    if (e.target.closest('.ai-rules')) {
      const arEl = e.target.closest('.ai-rules');
      const textEl = arEl.querySelector(':scope > div');
      if (textEl && state.selectedId === node.id) startEditAiRules(node, textEl, { x: e.clientX, y: e.clientY });
      else selectNode(node.id);
      return;
    }
    // 多选：Mod（Mac=⌘ / Win=Ctrl）=加选/减选，Shift=区间选（2026-08-26）；都不进入标题编辑
    // 🔴 平台归一（2026-10-07）：Windows 上「⌘」是 Ctrl，只读 metaKey（那是 Win 键）会让 Ctrl+点击加选失效。
    // 🔴 ⌥ 也算多选（2026-10-18 用户定）：macOS 把 ⌘ **保留给系统级拖拽**（⌘+拖 = 建别名 link），
    //   按住 ⌘ 拖节点时系统会吞掉 drop → 节点弹回 + 顿 1 秒，这个在网页层改不了。
    //   ⌥+拖 是 macOS 认可的「copy」操作 → drop 正常派发 → 多选后拖动能落位。
    //   所以多选两种按法都收：⌘+点（老习惯）/ ⌥+点（拖拽用这个）。
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
      e.preventDefault();
      // ⌘/Ctrl 起的这个手势**整个不拖**（2026-10-19，理由见 dragstart 那段）：
      //   标记一次，dragstart 认了就不发起拖拽 —— 连"按住 ⌘ 又提前松开"也按不拖处理。
      state._noDrag = !!(e.metaKey || e.ctrlKey);
      dbgDrag('mousedown·多选档', 'meta=' + e.metaKey + ' ctrl=' + e.ctrlKey + ' alt=' + e.altKey + ' shift=' + e.shiftKey + ' id=' + node.id);
      if (e.metaKey || e.ctrlKey || e.altKey) toggleMultiSelect(node.id);
      else selectRange(node.id);
      return;
    }
    if (state.selectedId === node.id) {
      // 已选中：再次点击进入编辑（光标插到点击位置）。
      // 2026-09-29：只有一条编辑路 —— 编辑正文（链接就在正文里，改的就是那一行）。
      // 🔴 2026-10-01 用户定：**按点击的纵向位置决定进哪一块** —— 落在备注那一段 → 进备注；
      //    标题那一排及往上 → 进正文。备注比卡片窄（.note 是 flex-start 的子项，宽度=自身内容），
      //    它右边是卡片留白：以前在备注行的右侧留白点一下会跑到正文去，跟"点哪儿编哪儿"的直觉不符。
      const titleEl = card.querySelector('.title');
      const noteBox = card.querySelector('.note');
      const noteText = noteBox && noteBox.querySelector(':scope > div');
      let hitNote = false;
      if (noteText) {
        const nr = noteBox.getBoundingClientRect();
        hitNote = e.clientY >= nr.top && e.clientY <= nr.bottom;
      }
      if (hitNote) startEditNote(node, noteText, { x: e.clientX, y: e.clientY });
      else if (titleEl) startEdit(node, titleEl, { x: e.clientX, y: e.clientY });
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
let imgPanX = 0, imgPanY = 0; // 放大后的平移量（2026-10-07 用户定：放大后可以拖动查看）
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
// ── 路径位置表（2026-10-06）：每条下钻路径各留一份画面位置 ────────────────────────
// 旧机制「一个视图只有一个格子」：下钻到 B 就把 A 层的位置覆盖掉，返回 A 时无档可查、
// 只能重新定位 → 视图飘。现在按 currentRootPid 分桶（空串 = 主节点那条），A / B 各写各的、互不影响。
// ⚠️ 只存位置三个数：hideDone / showNow 是**视图级**的，永远留在 views['']，绝不跟着路径走。
// ⚠️ 这张表是会话内存的（返回时同步取用，不等宿主往返）；跨重启由宿主按同一套 pid 分桶落盘。
let pathViews = {};
function pathViewKey(pid) { return (pid || '').trim(); }
function rememberPathView(pid) { pathViews[pathViewKey(pid)] = { zoom: zoom, panX: panX, panY: panY }; }
function pathViewOf(pid) {
  const v = pathViews[pathViewKey(pid)];
  if (!v || typeof v.zoom !== 'number') return null;
  return { zoom: v.zoom, panX: v.panX || 0, panY: v.panY || 0 };
}
function readView() {
  const pid = state.currentRootPid || '';
  rememberPathView(pid); // 上报即入表：平移 / 缩放 / 下钻各入口都走这里
  return {
    zoom: zoom, panX: panX, panY: panY,
    currentRootPid: pid,
    // 2026-09-29：筛选态随位置一起上报 —— 每次快照都是完整的，别让「谁后写」决定筛选态还在不在
    hideDone: !!state.hideDone, showNow: !!state.showNow
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
// #tree 自带**不对称**的上下 padding（40px / 120px，见 mindmap-app.css #tree，留给拖拽命中区用）——
// 所以 treeEl.offsetHeight 是"盒高"不是"视觉内容高"，拿盒中心当内容中心会整体偏 (120-40)/2 = 40px
// （2026-10-11 用户实报"开屏取景视觉偏上、量起来像 40%"的真凶）。要视觉居中一律走这里。
function treeContentBox() {
  const cs = getComputedStyle(treeEl);
  const top = parseFloat(cs.paddingTop) || 0, bottom = parseFloat(cs.paddingBottom) || 0;
  return { top: top, h: Math.max(treeEl.offsetHeight - top - bottom, 0) };
}
function centerView() {
  const pad = treeContentBox();
  panX = viewMap.clientWidth / (2 * (zoom || 1)) - treeEl.offsetWidth / 2;   // 左右无 padding，盒宽=内容宽
  panY = viewMap.clientHeight / (2 * (zoom || 1)) - (pad.top + pad.h / 2);  // 内容中心 = pad.top + 内容高一半
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
// 「窗口正中」校正（2026-10-11 用户实报："点定位后视觉上偏下面，要按整个窗口居中"）：
//   画布（iframe）头顶还垫着标签栏 + 路径条（约 60px），"画布的 50%" 天然比"窗口的 50%"低半个头高 ——
//   旧默认 40% 正好把这段补回来（这就是当年定 40% 的原因），全线改 50% 后就露馅了。
//   做法：纵向落点一律按**整个窗口**解读 —— 把「窗口高 × ratio」换算回画布坐标里的比例再参与定位。
//   同源可读 frameElement 拿画布在窗口里的位置；拿不到（非 iframe / 跨域）原样返回。
//   横向不校正：画布左边贴着侧边栏，横向的"窗口中央"会把节点推得离侧边栏太近（用户没提横同理）。
//   全屏时画布 top≈0，换算前后相等 → 无感。
function winAlignY(ratio) {
  try {
    const fe = window.frameElement;
    if (!fe) return ratio;
    const r = fe.getBoundingClientRect();
    const winH = fe.ownerDocument.defaultView.innerHeight;
    if (!winH || r.height <= 0) return ratio;
    return (winH * ratio - r.top) / r.height;
  } catch (_) { return ratio; }
}
// 智能定位（定位按钮 / 下钻·返回后自动调用）：
// - 选中节点或编辑中 → 该节点到中央（水平=--locate-x）
// - 未选中 → 第一层级=最前面那个节点=当前根（currentRoot）到中央（同一个 --locate-x）
// 垂直位置统一=--locate-y（经 winAlignY 按「整个窗口」换算）；是否重置缩放=--locate-reset-zoom
// 旋钮集中在 app.css :root 的「定位调参 · 中央」区，改完重载插件生效
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
  animateScrollTo(vr.width * xRatio / z2 - c.x, vr.height * winAlignY(cfgNum('--locate-y', 0.5)) / z2 - c.y, z2, onDone);
}
// 等画布（iframe 视口）宽度**连续 2 帧不变**后回调（最多等 30 帧兜底）—— 2026-10-11 加。
//   分屏「压窄 / 恢复」后要等布局定稿再动画面：宿主 await openFile / layout-change 的到达时刻
//   都不确定（和磁盘快慢、Obsidian 重排时序有关），固定延时会测到中间态。
function waitViewWidthStable(cb) {
  let frames = 0, lastW = -1, stable = 0;
  const tick = () => {
    frames++;
    const w = viewMap.clientWidth;
    if (w === lastW) stable++; else { stable = 0; lastW = w; }
    if (stable >= 2 || frames >= 30) { cb(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// 相机**一步到位**（不走缓动）：给「点文档节点 → 分屏」用（2026-10-11 用户定）——
//   布局刚变就该在正确位置，而不是"先错着、再滑过去"。
//   stopViewAnim 先掐掉可能在跑的位移动画，否则它会继续写 pan/zoom 把这次落位带跑。
function setScrollInstant(x, y, z) {
  stopViewAnim();
  panX = x; panY = y; zoom = z;
  applyTreeTransform(); drawEdges();
}
// 把卡片中心**只沿 X 轴**放到视口 xRatio 处（Y 轴与缩放一律不动）—— 2026-10-11 加，给「分屏滑节点」用。
//   为什么不走 placeCardAtViewport：那个会连 Y 一起动、还会按 --locate-reset-zoom 重置缩放；
//   分屏场景用户明确要"**只动 X、Y 不动**"（纵向上下文不跳），X 落点也不用「中央」那组坐标，
//   而是**左侧这半屏的正中**（旋钮 --locate-split-x，默认 0.5）。
//   instant=true → 一步到位；wOverride>0 → 直接用宿主给的最终视口宽度（不必等宽度稳定）。
function slideCardToX(el, xRatio, instant, wOverride) {
  const w = (wOverride > 0) ? wOverride : viewMap.getBoundingClientRect().width;
  const c = worldCenter(el);
  const tx = w * xRatio / zoom - c.x;
  if (instant) setScrollInstant(tx, panY, zoom);
  else animateScrollTo(tx, panY, zoom, null);
}
// 点击文档节点、右侧分屏**新建**完成后（宿主回推 docSplitOpened）：
//   把被点的节点摆到左半屏正中。
//   🔴 2026-10-11 用户定：宿主会把**分屏后的视口宽度 wSplit** 一起发来 → **下一帧一步到位**摆好，
//      不再 waitViewWidthStable + 缓动（用户看不到"先错位、再滑回来"）。
//      ⚠️ 落点以**画布自己量到的** `viewMap` 宽度收敛（第一帧先用 wSplit 估、随后几帧校正）：
//        宿主量的是 iframe 外框，画布量的是自己的视口 —— 两把尺子可能差一截，只用宿主的会**偏右**
//        （2026-10-11 用户实报）。宽度还在变的帧就跟着重落，量很小、看不出跳动。
//   找不到节点（被折叠 / 已被删）→ 记一行日志后放弃（不硬滑、不报错）。
function locateAfterDocSplit(nodeId, wSplit) {
  if (!nodeId) return;
  dbgSplit('⑪ 收到落点回推 nodeId=' + nodeId + ' wSplit=' + wSplit);
  // 🔴 2026-10-19 用户定：记两笔 —— ① 打开分屏**之前**画面在哪；② 自动落位**落定之后**画面在哪。
  //   关分屏时：如果画面还停在②（说明用户没动过）→ 精确还原到①（关了就是回去，不受分屏宽度影响）；
  //   用户动过 → 退回老逻辑（按恢复的宽度右移一段）。
  state._splitPanBefore = { x: panX, y: panY, z: zoom };
  state._splitPanAfter = null;
  const findEl = () => document.querySelector('.node-row[data-id="' + nodeId + '"] .card');
  const skip = () => { dbgSplit('⑪ 落点被跳过：找不到节点 ' + nodeId); try { vscode.postMessage({ type: 'log', text: '分屏后定位被跳过：没找到节点 ' + nodeId }); } catch (_) {} };
  const place = (w, instant) => { const el = findEl(); if (!el) return false; slideCardToX(el, cfgNum('--locate-split-x', 0.5), instant, w); return true; };
  if (!(wSplit > 0)) {           // 老宿主 / 结构异常 → 老路：等宽度稳定 + 缓动
    dbgSplit('⑪ 宿主没给宽度 → 退回"等宽度稳定 + 缓动"');
    waitViewWidthStable(() => { if (!place(0, false)) skip(); });
    return;
  }
  let last = -1, n = 0;
  const tick = () => {
    const w = viewMap.getBoundingClientRect().width || 0;
    n++;
    if (n === 1) {               // 第一帧：先按宿主给的宽度落位（它是在宿主那次布局之后量的，比此刻自己量的可靠）
      dbgSplit('⑪ 第1帧落位：用宿主宽 ' + wSplit + '，画布自己量到 ' + Math.round(w));
      if (!place(wSplit, true)) { skip(); return; }
    } else if (w > 0 && Math.abs(w - last) > 0.5) {
      dbgSplit('⑪ 第' + n + '帧宽度还在变 → 跟着重落：' + Math.round(last) + '→' + Math.round(w));
      place(w, true);            // 布局还在落定 → 跟着重落（这一步的位移很小）
    }
    last = w;
    if (n < 8) { try { requestAnimationFrame(tick); } catch (_) {} }
    else {
      dbgSplit('⑪ 落位收工：共 ' + n + ' 帧，末帧宽 ' + Math.round(w));
      // 落定后记第二笔（关分屏时拿它判"用户动没动过"）
      state._splitPanAfter = { x: panX, y: panY, z: zoom };
    }
  };
  // 等一帧再动：让新布局先落定（这一帧里浏览器只会画一次 = 用户看不到中间态）
  try { requestAnimationFrame(tick); } catch (_) { tick(); }
}
// 点「关闭分屏」图标后（宿主回推 docSplitsClosed）：画布恢复全宽 → 把画面**向右平移**，
//   平移量 =（恢复的宽度 − 原画布宽度）× --close-split-slide（默认 0.5 = 让原本居中在左屏的内容，
//   在新全宽里重新居中；1 = 挪"文档区那么宽"一整段；0 = 不移动）**+ extra**。只动 X，Y 与缩放不动。
//   extra（2026-10-11）：关分屏顺带把左侧边栏放回来时，宿主给的补偿量。
//   wFinal（2026-10-11）：宿主算好的**最终**视口宽度（侧边栏也算进去）→ 有它就**立刻开滑**。
//     🔴 为什么要立刻：侧边栏一回来就从左边占掉一截，而锚定让画面在屏幕上不动 →
//        画面在那一瞬其实被挤到侧边栏**底下**了（看不见 = 用户说的"白屏一下"），
//        等锚定收工（≈320ms）再滑回来就是"然后再出现"。立刻开滑 = 画面在侧边栏盖过来之前就离开那块区域。
function slideAfterSplitClose(wBefore, extra, wFinal) {
  dbgSplit('⑫ 收到关分屏回推 wBefore=' + wBefore + ' extra=' + extra + ' wFinal=' + wFinal);
  // 🔴 2026-10-19 用户定，两套小逻辑：
  //   ① 打开分屏后**用户没动过视图**（位置还停在自动落位那一刻）→ **精确还原**到打开前的位置。
  //      这样"点开看一眼再关掉"不会留下偏移。
  //   ② 用户动过（自己平移 / 缩放过）→ 用老逻辑（按恢复出来的宽度右移一段），
  //      因为用户已经建立了"现在这个画面"的认知，硬拉回原位反而更突兀。
  const b0 = state._splitPanBefore, a0 = state._splitPanAfter;
  const untouched = !!(b0 && a0
    && Math.abs(panX - a0.x) < 1.5 && Math.abs(panY - a0.y) < 1.5 && Math.abs(zoom - a0.z) < 0.001);
  if (untouched) {
    dbgSplit('⑫ 用户没动过视图 → 精确还原到打开前的位置');
    animateScrollTo(b0.x, b0.y, b0.z, null);
    state._splitPanBefore = null; state._splitPanAfter = null;
    return;
  }
  state._splitPanBefore = null; state._splitPanAfter = null;
  if (!(wBefore > 0)) { dbgSplit('⑫ 关分屏这一滑跳过：wBefore 无效'); return; }
  const run = () => {
    const w = (wFinal > 0) ? wFinal : viewMap.clientWidth;
    const dx = (w - wBefore) * cfgNum('--close-split-slide', 0.5) + (+extra || 0);
    dbgSplit('⑫ 开滑：用宽 ' + w + '（' + (wFinal > 0 ? '宿主给的最终宽' : '画布自己量的') + '），右移 ' + Math.round(dx) + 'px');
    if (dx > 0.5) animateScrollTo(panX + dx / zoom, panY, zoom, null);
  };
  if (wFinal > 0) run(); else waitViewWidthStable(run);
}
// ═══ 搜索（2026-10-21；2026-10-22 改成四段式）══════════════════════════
// 「这张导图」= **整张图都搜**，再把命中按"用户看不看得见"分四段（用户 2026-10-22 定）：
//   ① visible = 当前视图里看得见（当前视图根之内、没被筛选藏、祖先没折着）
//   ② folded  = 当前视图里、但被某个折着的祖先挡住（点结果会自动展开祖先链）
//   ③ hidden  = 当前视图里、但被「隐藏次要 / 只看 Now」挡掉
//   ④ outside = 当前视图根之外（下钻进去以后，树里其余那些内容；没下钻就空着）
// 四段互斥，按 ③ → ② → ① 的优先级判一条；顺序 = 深度优先（与画布从上到下一致）。
// ⚠️ 口径与 render 完全一致（hideDone 连坐祖先 / showNow 看 nowVisibleSet）——
//   以前是"藏起来就搜不到"，现在改成"搜得到、单独归一段"，所以不再需要影子搜索去数"被藏了几条"。
const SEARCH_MAX_HITS = 500;   // **每段**回给面板的条数上限（面板每段另有 200 的显示上限）
// 备注命中时，取**第一条含关键词的备注行**回给面板（面板那行显示备注，不是标题；2026-10-22 用户定）。
//   needle 已小写；备注是多行的，逐行比，返回原文（只 trim 两头，保留原来的写法）。
function noteLineOf(note, needle) {
  const lines = String(note || '').split('\n');
  for (const ln of lines) if (ln.toLowerCase().indexOf(needle) >= 0) return ln.trim();
  return String(note || '').trim().split('\n')[0] || '';
}
function searchTreeTiers(needle, viewRoot) {
  const tiers = { visible: [], folded: [], hidden: [], outside: [] };
  const counts = { visible: 0, folded: 0, hidden: 0, outside: 0 };
  const root = viewRoot || state.tree;
  if (!root) return { tiers: tiers, counts: counts };
  const nv = state.showNow ? (nowVisibleSnapshot || computeNowVisible(root)) : null;
  (function walk(n, doneChain, foldChain, scope) {
    if (!n) return;
    // scope = 这个节点是不是在"当前视图根"的子树里（根自己算在内）
    const inView = scope || n === root;
    const done = doneChain || nodeIsMinor(n) || nodeTodoDone(n);
    let hidden = false;
    if (inView) {
      if (state.hideDone && done && n !== root) hidden = true;
      if (nv && n !== root && !nv.has(n.id) && !state.justCreated.has(n.id)) hidden = true;
    }
    const title = String(n.title || '');
    const note = String(n.note || '');
    const tHit = title.toLowerCase().indexOf(needle) >= 0;
    const nHit = !tHit && note.toLowerCase().indexOf(needle) >= 0;
    if (tHit || nHit) {
      const key = !inView ? 'outside' : (hidden ? 'hidden' : (foldChain ? 'folded' : 'visible'));
      counts[key]++;
      if (tiers[key].length < SEARCH_MAX_HITS) {
        // 命中备注时把**命中的那一行备注**一起带回去 —— 面板那行要显示备注，不是节点标题（2026-10-22 用户定）
        tiers[key].push({
          id: n.id, pid: n.persistId || '', title: title || '(无标题)', isNote: nHit,
          note: nHit ? noteLineOf(note, needle) : '',
        });
      }
    }
    // 进入子节点时：只要**当前这个节点**是折着的，它的整棵子树就都是"被折叠挡住"
    const nextFold = foldChain || !!n.fold;
    (n.children || []).forEach(c => walk(c, done, nextFold, inView));
  })(state.tree, false, false, false);
  return { tiers: tiers, counts: counts };
}
// root 的子树里有没有 node 这个节点（含 root 自己）
function subtreeHas(root, node) {
  if (!root || !node) return false;
  if (root === node) return true;
  return (root.children || []).some(c => subtreeHas(c, node));
}
// 点搜索结果 → 定位到那个节点（2026-10-21）。
//   在下钻视图之外 → 先退到两边的最近公共祖先那一层；被筛选藏起来 → 自动关筛选；
//   被折叠的祖先挡住 → 全展开（只动内存，不写盘）；
//   然后居中 + 选中 + 闪一下高亮，让用户一眼看到落点。
function locateByPidOrId(pid, id, title) {
  // 跨文件刚打开时，画布可能还没建树 → 等一下再来（直接判"节点不在了"会误报，2026-10-21 用户实报）
  if (!state.tree) {
    let n = 0;
    const retry = () => {
      if (state.tree) { locateByPidOrId(pid, id, title); return; }
      if (++n < 60) setTimeout(retry, 50);     // 最多等 3s
    };
    setTimeout(retry, 60);
    return;
  }
  let target = null;
  let chain = [];
  (function find(n, path) {
    if (!n || target) return;
    const p2 = path.concat([n]);
    if ((pid && n.persistId === pid) || (!pid && id && n.id === id)) { target = n; chain = p2; return; }
    for (const c of (n.children || [])) { find(c, p2); if (target) return; }
  })(state.tree, []);
  // 兜底：多数节点**没有**持久 id（只有被复制链接的才写 `<!--id:-->`），全局搜出来的只有标题 → 按标题找第一个
  if (!target && title) {
    // 两边都按同一套清洗再比（宿主那条是从文件文本里抠出来的，画布这条是解析后的字段，
    //   可能还留着勾选框 / 行尾标记之类的东西）—— 不清洗就会"明明在却说找不到"
    const clean = (x) => String(x || '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\b(?:minor|now|ainode|airemark):[^\s]+/g, '')
      .replace(/^[\s\[\]]*[xX]?\]\s*/, '')
      .replace(/\s+/g, ' ').trim();
    const want = clean(title);
    (function findTitle(n, path) {
      if (!n || target) return;
      const p2 = path.concat([n]);
      if (clean(n.title) === want) { target = n; chain = p2; return; }
      for (const c of (n.children || [])) { findTitle(c, p2); if (target) return; }
    })(state.tree, []);
  }
  if (!target) { toast(T('search.gone'), true); return; }
  let dirty = false;
  // ① 目标在**当前下钻视图之外**（正下钻着别的分支）→ 先退到"同时包住当前视图与目标"的那一层。
  //   🔴 这一步必须在取卡片之前：不在当前视图里的节点压根没渲染进 DOM，直接查卡片会误报
  //   「那个节点已经不在了（可能被删除或改名）」（2026-10-22 用户实报：下钻在 A 分支，
  //   搜到的是 B 分支的节点，点了就弹这句 —— 节点其实好端端在文件里）。
  //   退到两边的**最近公共祖先**：既让目标露出来，又不把用户的下钻位置一把退回全图。
  const curRoot = currentRoot();
  if (curRoot && !subtreeHas(curRoot, target)) {
    let lca = null;                  // 从根到目标的链上，最后一个"包住当前视图根"的节点
    for (const p of chain) {
      if (p === target) break;
      if (subtreeHas(p, curRoot)) lca = p;
    }
    goTo(lca ? (lca.persistId || lca.id) : null, { keep: 'root' });
  }
  // ② 筛选挡住 → 关掉（与文档引用定位同一套判据）
  if (state.hideDone) {
    const doneChain = chain.some(p => p !== target && (nodeIsMinor(p) || nodeTodoDone(p)));
    if (nodeIsMinor(target) || nodeTodoDone(target) || doneChain) { setHideDone(false, true, false); dirty = true; }
  }
  if (state.showNow) {
    const nv = nowVisibleSnapshot || computeNowVisible(currentRoot());
    if (nv && !nv.has(target.id)) { setShowNow(false, true, false); dirty = true; }
  }
  // ③ 祖先链上的折叠全打开（只改内存；fold:1 注释不动 → 下次开图恢复原状）
  for (const p of chain) {
    if (p !== target && p.fold) { p.fold = false; dirty = true; }
  }
  if (dirty) render();
  // ④ 定位 + 高亮
  const el = document.querySelector('.node-row[data-id="' + target.id + '"] .card');
  if (!el) { toast(T('search.gone'), true); return; }
  selectNode(target.id);
  placeCardAtViewport(el, cfgNum('--locate-x', 0.5));
  try {
    document.querySelectorAll('.card.locate-predict').forEach(c => c.classList.remove('locate-predict'));
    el.classList.add('locate-predict');
    setTimeout(() => el.classList.remove('locate-predict'), 1400);
  } catch (_) {}
}

function locateCenter() { // 定位按钮（2026-09-18 用户定改写）：**编辑中/已选中 → 该节点定位到中央；未选中 → 主节点定位到中央**（替代原「选中节点定位」「主节点定位」两条命令；zoom 回 100% 是 placeCardAtViewport 的默认行为，旋钮 --locate-reset-zoom）
  // 原「没选中 → 循环定位 Now」不再走这里（定位子菜单里的 Now 列表定位 locateToItem 不受影响）
  const selX = cfgNum('--locate-x', 0.5);
  const activeId = state.selectedId || state.editingTitleId || state.editingNoteId || state.editingAiRulesId || null;
  const el = activeId && document.querySelector('.node-row[data-id="' + activeId + '"] .card');
  if (el) { placeCardAtViewport(el, selX); return; }
  const root = currentRoot();
  const rootEl = root && document.querySelector('.node-row[data-id="' + root.id + '"] .card');
  if (rootEl) { placeCardAtViewport(rootEl, selX); return; }
  centerView(); drawEdges(); // 兜底：当前根无卡片 → 整画布居中
}
// 「打开导图」的首次取景（2026-10-11 用户定）：按**整张内容**取景，不再按"主节点"对位 ——
//   横向：内容中央对 --locate-x（= 唯一的「中央」，与定位按钮同源；内容越宽、画面越往左推）；
//   左推极限：内容左端（母节点）距视口左缘留 --locate-left-gap（母节点永远可见，到这就停）；
//   纵向：内容垂直中心对 --locate-y（经 winAlignY 按整个窗口换算）。缩放按 --locate-reset-zoom（与其它定位同款）。
//   ⚠️ 只给「打开导图、且没有视角记忆」的开屏取景用（init 里那一处调用）；
//     定位按钮 / 下钻返回 / 定位预览等「指向某节点」的场景**不换**（2026-10-11 用户明确：
//     定位按钮同样到中央——2026-10-11 大统一后两者本就是一个落点）。
//   ⚠️ 「内容」= #tree 整体（与 centerView 同一来源：treeEl 的布局尺寸就是整棵树的尺寸）。
function placeContentAtCenter() {
  const z2 = cfgBool('--locate-reset-zoom', true) ? 1 : zoom;
  const w = treeEl.offsetWidth;
  const pad = treeContentBox();          // 视觉内容高（扣掉 #tree 不对称上下 padding，别拿盒高当内容高）
  const x = cfgNum('--locate-x', 0.5);
  const y = winAlignY(cfgNum('--locate-y', 0.5));
  let px = viewMap.clientWidth * x / z2 - w / 2;
  px = Math.max(px, cfgNum('--locate-left-gap', 48) / z2); // 左推极限：内容左端（母节点）不许比 gap 更贴左缘
  const py = viewMap.clientHeight * y / z2 - (pad.top + pad.h / 2);
  animateScrollTo(px, py, z2, null);
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
// ===== 上一 / 下一路径（2026-10-06 起**跨文件**：历史栈搬到宿主侧）=====
// 画布这边只剩「请求」：点了就告诉宿主，由宿主决定是"同一个文件里跳"（回发 gotoPid）
// 还是"跨文件打开"（宿主自己 openFile + 打开后下钻到那一层）。
// 能不能点（置灰）也由宿主算好下发（navState）—— 历史跨文件之后，只有宿主知道全貌。
// 原来那套只记 pid 的内存栈已删：它按文件重置（每次 init 都 seed），根本跨不了文件。
function historyBack() { vscode.postMessage({ type: 'navBack' }); }
function historyForward() { vscode.postMessage({ type: 'navForward' }); }
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
  // 2026-09-01 修「切走再回 pan 被清零、永远回中央」的规矩沿用：
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
  // 🔴 平台归一（2026-10-07 修「Windows 上 Ctrl+点击没反应」）：Windows 的「⌘」是 **Ctrl**，
  //    只读 metaKey（那是 Win 键）恒为 false → 上报给宿主的 cmd 永远是 false，
  //    宿主侧「mousedown 快照 / click 事件 / 全局状态」三层兜底全部落空。
  const cmd = !!(e.metaKey || e.ctrlKey), alt = !!e.altKey;
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
  if (aiInputOn) updateAiBarHint(); // AI 输入条开着 → 框上方那行提示词跟着选中状态走（2026-09-28）
  // 选中变化 → 把「当前选中节点管理的那份文档」报给宿主（面板第 4 个分页要用，2026-10-09）。变化才发。
  // 挂在这里是因为**所有**改选中的路（点卡片 / 键盘导航 / 定位 / 下钻）最后都会走到这儿。
  try { notifySelDoc(); } catch (_) {}
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
// ⌘A 全选（2026-10-07 用户定）：把**画面上看得见的**节点全部选中（进多选态），便于批量操作
//（典型用法：全选 → 全部设为 Now → 再全选 → 统一取消 Now）。
// 判据与渲染同源（childVisible）：被「隐藏 Minor/Done」/「只看 Now」藏起来的不选；
// 折叠里的节点**要选** —— 折叠是临时收起、不是筛选隐藏（与"复制只带可见"同一口径）。
function visibleNodeIds() {
  const out = [];
  const root = currentRoot();
  if (!root) return out;
  const walk = (n, parentDone) => {
    out.push(n.id);
    const done = parentDone || nodeIsMinor(n) || nodeTodoDone(n);
    (n.children || []).forEach(c => { if (childVisible(c, done)) walk(c, done); });
  };
  walk(root, false);
  return out;
}
function selectAllNodes() {
  const ids = visibleNodeIds();
  if (!ids.length) return;
  disarmProxy(); // 与 selectRange 同款：多选不适用 armed proxy
  state.multiSelected = new Set(ids);
  state.selectedId = ids[0]; // 锚点 = 主节点（与 Shift 区间全选同款：主选中留在先序第一个）
  state.selectedImg = null;  // 换选中 = 附件选中一并失效（同 selectNode）
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
    // 编辑态点另一个节点那一下：收尾重绘后 click 会落到画布容器上，别当成"点空白取消选中"（2026-10-01）
    if (swallowClickAfterEditSwitch) { swallowClickAfterEditSwitch = false; return; }
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
// 框选命中（2026-09-23 用户定：**选中集 = 当前框，框缩了就减**）：
//   每帧按「当下这个框」全量重算 —— 框里的选中、框外的取消。拖多了往回拖时，先前框到的节点必须随手放开
//   （用户实报：往上拖选了一屏，再往下拖想少选一点，旧的却一直亮着）。
//   早前有一版是「扫过即选中、只加不减」，起因是那时起点钉在屏幕上、自动滚动会把已选节点带出框；
//   现在起点贴内容（见下方 paintBox），滚动时框在内容坐标系里只会**单向变长** —— 滚进来的一直在框里，
//   不会自己跑出去。所以按当前框全量重算既跟手、也不会再犯「往下滚上面已选的丢了」。
function applyMarqueeSelection(r) {
  const hits = new Set();
  document.querySelectorAll('#tree .card').forEach(card => {
    const rc = card.getBoundingClientRect();
    if (rc.right < r.left || rc.left > r.right || rc.bottom < r.top || rc.top > r.bottom) return;
    const row = card.closest('.node-row');
    if (row) hits.add(row);
  });
  // 全量重算：框外的当场取消（只 toggle 类，不动 state —— 最终多选在 mouseup 时从 DOM 收）
  document.querySelectorAll('#tree .node-row').forEach(row => row.classList.toggle('selected', hits.has(row)));
}
// ============ 框选 / 画布平移（空白处拖动：默认平移画布，Cmd/Ctrl+拖动=框选） ============
// 2026-08-21 定（飞书式）：左键拖空白 = 框选；移动画布 = 触控板双指滑动 / 滚轮（view-map 滚动）
// 编辑态点"另一个节点"时，紧随其后的那次 click 要吞掉（2026-10-01）：见下面 mousedown 里那段。
//   为什么要吞：收尾保存会 render（整树重建），被点的卡片当场被换掉 —— 那一下 click 可能落到画布容器上
//   （会被当成"点空白取消选中"）或落到重建后的新卡片上（会被当成"再点一次 = 进编辑"），两种都不能要。
let swallowClickAfterEditSwitch = false;
viewMap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  swallowClickAfterEditSwitch = false; // 每次按下先复位（上一轮万一没被消费掉，别留到这一次）
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
    // ⚠️ 这里**故意不 return**（2026-10-01 用户定）：接着往下走 = 同一次按下就开始框选。
    //   以前 return 掉 → 编辑态下想框选必须"先点一下退出编辑、再按一次才开始框"，白多一步。
    //   收尾保存会 render（整树重建），但下面的框选逻辑只吃屏幕坐标、不碰 e.target → 照常成立；
    //   "只是点一下没拖"的情形仍由 mouseup 的 <5px 分支收成"取消选中"，语义没变。
  }
  // 🔴 编辑态按在卡片上 → **一次按下**就把该做的做完（2026-10-01 用户定），两种情形：
  //   A. 同一个节点的**另一块可编辑区**（正文 ↔ 备注）→ 收尾保存 + 直接切过去编辑（光标落点击处）。
  //      以前要两下：第一下只结束当前编辑（收尾会 render，把卡片换掉 → click 落不到新元素上），第二下才进新编辑。
  //   B. **另一个节点**的卡片 → 收尾保存 + 直接选中它（同上，以前也要两下）。
  //   ⚠️ 排除三类：点在自己正在编辑的那块里（拖选文字，别打断）；图片 / 链接 / 折叠钮（各有各的处理）；
  //     卡片上既非标题也非备注的地方（B 里按"另一个节点"处理，A 里不动）。
  if (state.editingEl && state.editingEl.contentEditable === 'true'
      && !state.editingEl.contains(e.target) && !e.target.closest('.img, .link, .fold-tag')) {
    const cardEl = e.target.closest('.card');
    const rowEl = cardEl && cardEl.closest('.node-row');
    const id = rowEl && rowEl.dataset.id;
    if (id) {
      // 「是不是同一个节点」按**正在编辑的元素所在行**判，别用 state.editingNoteId ——
      // 那个字段只有「更多菜单 / 命令」那条入口会赋值（editNoteOfSelected），**双击进备注编辑这条路不赋**
      // → 拿它判会让"编辑备注时点正文"落到"换节点"分支（只选中、不进编辑）= 用户实报的"还是要点两下"
      // （2026-10-01）。按行 id 判跟入口无关，任何入口进来都对。
      // （另：2026-10-01 已让 startEditNote 统一补上 editingNoteId 的赋值/清除，见那里。）
      const editingRowEl = state.editingEl.closest('.node-row');
      const sameNode = !!(editingRowEl && editingRowEl.dataset.id === id);
      const wantNote = !!e.target.closest('.note');
      const wantAiRules = !wantNote && !!e.target.closest('.ai-rules'); // AI 更改规则块（2026-10-05）
      const wantTitle = !wantNote && !wantAiRules && !!e.target.closest('.title');
      // 同一节点上、既不是标题也不是备注/AI规则（卡片留白）→ 不插手：交给浏览器 blur 收尾，跟以前一致
      if (sameNode && !wantNote && !wantAiRules && !wantTitle) return;
      // 先收尾保存当前编辑（会 render → 下面一律按 id 重新取元素）
      try { state.editingEl.blur(); } catch (_) {}                        // 有焦点 → blur 即 finish 保存
      if (activeEditFinish) { try { activeEditFinish(); } catch (_) {} }   // 兜底：焦点不在编辑框时强制收尾
      state.editingEl = null;
      if (sameNode) {
        // A. 切到同一节点的另一块：按 id 重新取（收尾已把旧元素换掉），再进新编辑
        const r = findNode(state.tree, id);
        const freshCard = document.querySelector('.node-row[data-id="' + id + '"] > .card');
        if (r && freshCard) {
          const target = wantNote ? freshCard.querySelector('.note > div')
            : wantAiRules ? freshCard.querySelector('.ai-rules > div')
            : freshCard.querySelector('.title');
          if (target) {
            if (wantNote) startEditNote(r.node, target, { x: e.clientX, y: e.clientY });
            else if (wantAiRules) startEditAiRules(r.node, target, { x: e.clientX, y: e.clientY });
            else startEdit(r.node, target, { x: e.clientX, y: e.clientY });
          }
        }
      } else {
        // B. 换节点（🔴 2026-10-12 用户定：**一次按下同时"选中 + 进编辑"**）：
        //    原来只 selectNode（选中），用户还得再点一下才进编辑 —— 在 A 里打字时看到 B 要改，
        //    就得"选中 B → 再点一下"两步。现在按"点哪儿编哪儿"一次到位：落点 = `.title` / `.note` /
        //    AI 规则块，各自进对应的编辑会话，光标插在点击处（startEdit* 的 pos 参数）；
        //    落在卡片留白（既不是标题也不是备注/AI 规则）→ 也按**正文**处理（用户说的是"点到另一个节点的某个位置"）。
        //    ⚠️ 只在**编辑态**才这么做（这一段整个在前面的 `if (state.editingEl …)` 里）：平时点未选中的
        //      节点仍是老规矩「第一下选中、第二下进编辑」—— 那是 2026-10-01 定的，别顺手改掉。
        //    收尾保存已经在上面做过（blur + activeEditFinish），这里直接按 id 取重建后的新元素。
        selectNode(id); // selectNode 不 render，直接作用在重建后的 DOM 上
        // 🔴 2026-10-19 用户定：点到另一张卡的**留白 / 边缘**（既不是标题、也不是备注 / AI 规则块）
        //   → **只选中，不进编辑**。理由（用户原话）：「有时就是想选中节点」——
        //   全进编辑之后，编辑态下就再没有"纯选中"这条路了。
        if (!wantNote && !wantAiRules && !wantTitle) {
          e.preventDefault();
          swallowClickAfterEditSwitch = true;
          return;
        }
        const r = findNode(state.tree, id);
        const freshCard = document.querySelector('.node-row[data-id="' + id + '"] > .card');
        if (r && freshCard) {
          const target = wantNote ? freshCard.querySelector('.note > div')
            : wantAiRules ? freshCard.querySelector('.ai-rules > div')
            : freshCard.querySelector('.title');
          if (target) {
            if (wantNote) startEditNote(r.node, target, { x: e.clientX, y: e.clientY });
            else if (wantAiRules) startEditAiRules(r.node, target, { x: e.clientX, y: e.clientY });
            else startEdit(r.node, target, { x: e.clientX, y: e.clientY });
          }
        }
      }
      // ⚠️ 必须 preventDefault（2026-10-01 实踩）：mousedown 的**默认动作**（按浏览器规矩改焦点）在事件
      //   处理完之后才执行 —— 那时刚 startEdit/startEditNote 进新编辑、焦点刚落进去，紧接着就被默认动作
      //   挪走（mousedown 的 target 已被重绘换掉 → 浏览器把焦点挪给 body）→ 新会话当场 blur 收尾，
      //   表现就是"点了跟没点一样、还得再点一次"。preventDefault 掉这个默认动作，焦点才留得住。
      //   （编辑态下卡片本来就是 draggable=false，不用担心压掉拖拽起手。）
      e.preventDefault();
      swallowClickAfterEditSwitch = true; // 紧随的那次 click 吞掉（理由见上面声明处）
      return;
    }
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
  // 框选矩形 = 起点 + 终点，**两者的参照系不同**（2026-09-22 用户定，前两版都搞反了）：
  //   终点（活动边）= 鼠标的**屏幕**位置 —— 贴屏幕，鼠标停在哪就在哪，不动就是不动；
  //   起点（固定边）= 点击处，但**贴内容** —— 画面滚了它就跟着内容一起移动
  //                   （往上拖时它会一路跑到屏幕外**下方**，框越拉越长，这才是对的）。
  // 于是「鼠标停住、画面继续滚」时：框的上边仍钉在鼠标处，下边被起点拖着越拉越长。
  //
  // ⚠️ 起点位移必须**从 pan 算**，不能累加 autoScrollDY（2026-09-22 第二版踩的坑）：
  //   滚动实现在 tickAutoScroll 里是 `panY -= autoScrollDY / zoom`，与 autoScrollDY **反号**；
  //   上一版写 `startY + 累加的 autoScrollDY` → 起点跟鼠标同向跑，拖一会儿起点就追上终点、两点合一。
  //   内容点 p 的屏幕位置 = zoom * (pan + p)（见 applyTreeTransform 的 scale 后 translate），
  //   所以同一个内容点的屏幕位移 = Δpan × zoom，直接读 pan 差值即可，符号天然正确。
  let lastX = startX, lastY = startY;
  const panX0 = panX, panY0 = panY; // 按下那一刻的画面原始平移量（起点贴内容的基准）
  const paintBox = () => {
    const dz = zoom || 1;
    const sx = startX + (panX - panX0) * dz; // 起点：内容上那一点随画面平移同步位移
    const sy = startY + (panY - panY0) * dz;
    const r1 = {
      left: Math.min(sx, lastX), top: Math.min(sy, lastY),
      right: Math.max(sx, lastX), bottom: Math.max(sy, lastY),
    };
    box.style.left = r1.left + 'px'; box.style.top = r1.top + 'px';
    box.style.width = (r1.right - r1.left) + 'px';
    box.style.height = (r1.bottom - r1.top) + 'px';
    applyMarqueeSelection(r1); // 实时选中：框一碰到节点立刻高亮（2026-08-21 定：框选时能看清选了哪些）
    marqueeRect = r1;
  };
  // 滚动帧里只需重画：pan 已在 tickAutoScroll 里更新过，paintBox 现读现算，位移自然跟上
  marqueeUpdater = () => { paintBox(); };
  const move = ev => {
    const dx = Math.abs(ev.clientX - startX), dy = Math.abs(ev.clientY - startY);
    if (!boxShown && (dx > 5 || dy > 5)) {
      boxShown = true; box.style.display = 'block';
      // 真开始框选（越过 5px 阈值）才清「上一次」的选中残留；此后本轮选中集 = 当前框（applyMarqueeSelection
      // 每帧全量重算），所以这一清必须放在这里 —— 放在 mousedown 会把「点一下空白=取消选中」的手感改掉。
      state.multiSelected.clear();
      state.selectedId = null;
      refreshSelectionClasses();
    }
    if (!boxShown) return;
    lastX = ev.clientX; lastY = ev.clientY;
    paintBox();
    // 框选拖到视图边缘 → 自动滚动（复用节点拖拽的 autoScrollOnDrag；2026-08-26）
    autoScrollOnDrag(ev);
  };
  // 在 webview 外松鼠标时 mouseup 不触发 → 旧 move 闭包会永久挂在 document 上（2026-08-24 修：blur 兜底移除）
  const removeListeners = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    window.removeEventListener('blur', cancel);
  };
  const cancel = () => { removeListeners(); box.style.display = 'none'; state.marquee = false; marqueeRect = null; marqueeUpdater = null; stopAutoScroll(); };
  const up = ev => {
    removeListeners();
    box.style.display = 'none';
    marqueeRect = null; marqueeUpdater = null; stopAutoScroll();
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
    if (aiInputOn) updateAiBarHint(); // 框选也会改选中 → AI 输入条上方那行提示词跟着刷（2026-09-28 实踩：漏了这条路径）
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
  updateLocateNowBadge(); // 定位按钮右下角的「当前关注」数量角标（2026-10-11 用户定）
  // 沙盒（2026-09-14 用户定）：历史界面里把「更多」按钮整个藏掉 —— 一次砍掉新增/删除/剪切/粘贴/
  // 撤销重做/保存版本/设置/提报 bug 这一整批"会改内容"的入口，比逐条加守卫省事也更不容易漏。
  const mw = document.getElementById('more-wrap');
  if (mw) mw.classList.toggle('hidden', !!state.historyMode);
  updateHistoryBanner(); // 顶部历史横幅跟随只读态显隐（进/出历史都要在这里刷）
  updateFoldBar(); // 2026-08-30：右下角常驻折叠层级条跟随选中态刷新（22 处选中变化都会走这里）
  syncAiRulesEye(); // 2026-10-06：AI 面板那颗小眼睛的**置灰态**跟着「当前画面里有没有 AI 更改规则」走
                    //   （判据 = anyAiRulesInView()，排除折叠分支）。节点增删改规则 / 折叠 / 下钻都会走到这里，
                    //   所以挂这一处就够；⚠️ 别在 selectNode / 点空白那些地方各写一遍（那是 22 处）。
                    //   面板没开时函数自己早退。
  // AI 面板里那几行的状态（节点标记三态 / 备注标记两态 + 没备注置灰）—— 与眼睛同一批变化点，挂这一处就够。
  //   ⚠️ 选中节点那条路不走这里，它在 showNodeMenu 里另叫一次（2026-10-14 用户实报面板不跟着变）。
  syncAiMenuState();
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
  // 写正文一律写进 .tt（正文层）：前缀图标现在在编辑区之外（.title 上），不用再"抓引用→写完插回"；
  // 直接 `el.textContent = …` 会把 .tt 整个冲掉、标题退回旧结构（图标又进编辑区），2026-10-05 重排后必须走这里。
  // 整行格式（**/~~）拆属性显示纯文字这条不变。
  // 单坐标系（2026-09-13）：文本替换改卡片宽度只推内容、不动相机——旧版的树宽补偿
  //（panX += Δ/2）在新坐标系下反而每敲一个字母就平移整棵树 = 组字期画面抖的根源，已删。
  const fmt = splitLineFormat(node.title);
  (titleTextEl(el) || el).textContent = v || (fmt ? fmt.inner : (node.title || ''));
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
// 光标是否已经在可编辑内容的最前面（前面一个字都没有）—— 给「文字前面不插换行」那条判据用
function caretAtContentStart(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const rg = sel.getRangeAt(0);
  if (!rg.collapsed || !el.contains(rg.startContainer)) return false;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  try { pre.setEnd(rg.startContainer, rg.startOffset); } catch (_) { return false; }
  return pre.toString().length === 0;
}
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
    // 整段 = 图片语法 → 转**图片附件**（与选中态粘贴同款，2026-09-19 用户定），不进标题文字；
    //   名字连 Obsidian 尺寸后缀一起存（![[img.png|700]] → 按 700 宽显示，写回不丢后缀）
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
      // 标题（noBreakAtStart）：光标已经在正文最前面时不再插换行 —— 换行会落在正文之前，
      //   前缀图标就被单独留在第一行、文字掉到第二行，看着像"图标和文字分家了"（2026-10-05 用户报）。
      //   首尾空行保存时本来就会被收掉，插了也是白插。备注没有前缀图标，不受这条约束。
      if (opts.newline !== false && !(opts.noBreakAtStart && caretAtContentStart(el))) insertEditTextNode(el, '\n');
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
      // 判「点在不在标题这一块里」要用外层容器（icoHost = .title）：前缀图标现在在编辑区之外，
      // 点在图标上时 caretRangeFromPoint 会落进图标里 —— 那时 el.contains() 为假，但点确实是冲着标题来的，
      // 所以先按外层判命中，再分两种：落在编辑区里 → 用原逻辑；落在图标上 → 光标放到正文开头。
      const host = opts.icoHost || el;
      if (range && host.contains(range.startContainer)) {
        if (!el.contains(range.startContainer)) {
          r.selectNodeContents(el); r.collapse(true); sel.addRange(r);
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
// 重叠时，**只做垂直**平移，把卡片中心挪到中央 Y（--locate-y）—— 左右不动（用户明确不要横向位移）。
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
  // 真正可编辑的是 .tt（正文层），图标在 .title 上、编辑区之外（2026-10-05 重排，见 setTitleInner 上方注释）。
  // 于是「编辑中前缀图标不消失」不再是靠"抓引用再插回"维持的 —— 图标压根不在编辑内容里，
  // ⌘A 全选删除、退格、换行都碰不到它们（旧写法正是靠插回，才会出现"退格后光标跳到结尾"）。
  const tt = titleTextEl(titleEl) || titleEl; // 兜底：万一某处 DOM 还是旧结构（历史快照等），退回老行为
  state.editingTitleId = node.id; // 编辑态标记：加粗按钮判断用（不依赖焦点，点按钮时焦点已转移）
  state.editingTitleEl = tt;
  titleEditStartTs = Date.now(); // 记录进编辑时刻，供 dblclick 判断是否"双击前已在编辑"（2026-08-25 修：避免刚进编辑的同一双击被误判为"编辑时双击=全选"）
  const fmt = splitLineFormat(node.title);
  titleEl.classList.remove('editing-bold', 'editing-strike');
  // 编辑框 100% 纯文字（图标本来就在外面）：整行格式（**/~~）→ 拆成属性 + CSS 效果类显示。
  // ⚠️ 格式类挂 .title（CSS 是 .title.editing-bold / -strike），.tt 继承下来，别改挂 .tt。
  if (fmt) {
    tt.textContent = fmt.inner;
    if (fmt.bold) titleEl.classList.add('editing-bold');
    if (fmt.strike) titleEl.classList.add('editing-strike');
  } else {
    tt.textContent = node.title;
  }
  // 单坐标系（2026-09-13）：进编辑的文本替换（**/~~ 转纯文字）只改卡片宽度、不动相机，
  // 旧的树宽补偿（panX += Δ/2）在新坐标系下本身就是位移源，已删；只需重画连线跟上。
  redrawEdgesNextFrame(); // 文本替换改的是「卡片宽度」，树总宽未必变 → 无条件跟上（2026-09-13 修）
  // 记录进入编辑时的纯文字（保留首尾空格，不 trim）——用户没改就不保存（防误清空丢字）
  // 2026-08-26 改：取消"清空/纯空格=取消新建"，改为允许空/空格节点保留；故对比与保存都用未 trim 的原始文本
  // 2026-08-30 换行：改用 editableText（\n 原样保留，多行标题编辑后原样对比）
  const originalRaw = editableText(tt);
  editSession(tt, {
    pos,
    cursorEnd,
    caretStart, // 「从头开始编辑」命令（2026-09-18）：光标放最前；丢了这行光标会落成全选（实踩）
    suggest: true, // 标题敲 [[ 弹文件建议（2026-08-29）
    icoHost: titleEl, // 「点在不在标题里」按外层容器判：点在前缀图标上时光标落到正文开头（2026-10-05）
    noBreakAtStart: true, // 光标在正文最前面时 ⌘+Enter 不插换行（否则图标被单独留在第一行，2026-10-05）
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
        tt.textContent = originalRaw; // 已有节点：还原原文（不保存）。布局冻结中，还原改宽度零位移
      }
    },
    onFinish: () => {
      state.editingTitleId = null; state.editingTitleEl = null; // 清编辑态标记（2026-08-22）
      if (!findNode(state.tree, node.id)) return; // 节点已在 ESC 取消流程中被删除 → 直接收尾，勿重复处理
      // 2026-08-30 换行：editableText 保 \n；首尾空行收掉（中间空行保留 = 段落间距，落盘走空续行）
      let currentRaw = editableText(tt).replace(/^\n+|\n+$/g, ''); // 不 trim：保留首尾空格（如纯空格标题）
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
        setTitleInner(titleEl, node); // 2026-08-26 修：还原时一并带回 Minor 置灰小箭头（之前用 renderInline 会丢图标）；⚠️ 必须走它，直接 titleEl.innerHTML = 会把 .tt 冲掉（2026-10-05）
        attachPrefixIcos(titleEl, node); // 刚重建过 → 四个前缀图标的点击事件要重绑（2026-09-20 / 2026-10-05）
        bindInline(titleEl); // 同上：正文里的内联链接（[[..]] / URL / 附件）点击事件也要重绑（2026-10-05 补，之前漏了这条 → 编辑一次不改动，那条链接就点不动了）
        // 进度条（2026-09-24 起）改放到 .card 下方、不在 titleEl 里；编辑重设 titleEl.innerHTML 不破坏它，绑过一次就够
        drawEdges(); // 宽度变化 → 曲线跟上（单坐标系下相机不动，无需位置补偿）
        return; // 不 emitUpdate / render
      }
      // 2026-09-17：整行就是一个嵌入（![[名]] 或 ![](路径)）→ 不留在标题里，转成节点附件。
      // 场景：双击节点手敲/粘贴 ![[xxx.png]] 再回车——以前这串会变成"! + 双链"文字、显示不出图。
      // 只认「整行就是这一个嵌入」；混了别的文字的标题一律不动（不替用户猜意图）。
      const trimRaw = currentRaw.trim();
      const embWiki = trimRaw.match(/^!\[\[([^\]]+)\]\]$/);
      const embMd = embWiki ? null : trimRaw.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
      const embFull = ((embWiki ? embWiki[1] : (embMd ? embMd[1] : '')) || '').trim();
      if (embFull && findNode(state.tree, node.id)) {
        pushUndo();
        // 存全名（连 Obsidian 尺寸后缀一起，写回不丢）；判类型用剥掉尺寸的名字
        if (isMediaFile(nmEmbedSize(embFull).name)) (node.embeds = node.embeds || []).push(embFull);
        else (node.images = node.images || []).push(embFull);
        node.title = '';
        node.todo = todoState; // 手打的待办前缀照样生效（前缀已从文字里剥掉，2026-09-20）
        node.ainode = ainodeAfterEdit(node.ainode); // 同上：内容被人动过 → AI 节点降为混合
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
      // AI 节点被人改过 → 降为「混合」（2026-10-05）：内容已含人工成分，不再是纯 AI 生成。
      //   放在这里是刻意的：上面「没改动」那条分支已提前 return，走到这儿的一定是真改了字，
      //   所以「点进去什么都没动就退出来」不会被误标成混合。
      node.ainode = ainodeAfterEdit(node.ainode);
      state.justCreated.delete(node.id); // 已正式命名 → 不再是"刚新建"，后续清空只回退不删
      titleEl.classList.remove('editing-bold', 'editing-strike');
      emitUpdate(); // 写回文件
      render();
    }
  });
}
function startEditNote(node, noteEl, pos) {
  // 不再 hideNodeMenu：写备注也是选中态，下方菜单保留（2026-08-22 与标题编辑统一）
  // 🔴 统一在这里登记「正在编辑备注的节点」（2026-10-01）：原先只有「更多菜单 / 命令」那条入口
  // （editNoteOfSelected）会赋 state.editingNoteId，双击 / 单击进备注这条路不赋 → 那个字段时有时无，
  // 凡是拿它判断的地方都会因入口不同而表现不一致（本轮"编辑备注时点正文"就是被它坑的）。
  // 清除在下面的 onFinish（编辑结束即置 null），两边成对，任何入口进来都一致。
  state.editingNoteId = node.id;
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
      if (nn !== node.note) {
        pushUndo();
        node.note = nn;
        node.ainode = ainodeAfterEdit(node.ainode); // 备注也是节点内容：人写了 → AI 节点降为混合（2026-10-05）
        node.airemark = airemarkAfterEdit(node.airemark); // 备注自己的标记（2026-10-14）：备注被改 → ai 降 mix
        emitUpdate();
      }
      if (state.editingNoteId === node.id) state.editingNoteId = null; // 编辑结束：空备注行随后消失（2026-08-21 定）
      render(); // 无论改没改都 render：清掉「编辑中的空备注行」
    }
  });
}
// ============ 空图：画面中间的「＋ 新建母节点」按钮（2026-10-11）============
// 什么时候出现：正文里没有主节点那一行（state.tree.empty）—— 典型场景 = 把主节点整棵剪切走了，
// 或用户手动把正文删空。这时不画任何卡片，只给一枚按钮；点它建一个空主节点并直接进编辑态。
// ⚠️ 判据是结构（有没有那一行），不是标题文字 —— 用户完全可能真的把节点叫「未命名」。
function buildEmptyRootBtn() {
  const btn = document.createElement('button');
  btn.className = 'empty-root-btn';
  btn.type = 'button';
  const ico = document.createElement('span');
  ico.className = 'empty-root-ico';
  ico.innerHTML = renderIcon('plus', 16);
  const txt = document.createElement('span');
  txt.className = 'empty-root-text';
  txt.textContent = T('emptyRoot.btn');
  btn.appendChild(ico);
  btn.appendChild(txt);
  btn.addEventListener('click', (e) => { e.stopPropagation(); createRootAndEdit(); });
  return btn;
}
// 把整棵树清空（母节点被剪切走之后用）：不是删掉树对象，而是让它回到"还没有主节点"的空态 ——
// 树对象还在，所以定位 / 折叠 / 渲染那些拿 currentRoot() 的地方都不会拿到 null（历史上 buildRow(null) 崩过）。
function resetTreeToEmpty() {
  const t = state.tree;
  if (!t) return;
  t.empty = true;
  t.title = ''; t.note = ''; t.aiRules = ''; t.aiRulesFence = 0;
  t.images = []; t.embeds = []; t.rawLines = []; t.rawMeta = []; t.children = [];
  t.fold = false; t.color = ''; t.todo = ''; t.ainode = ''; t.airemark = ''; t.minor = false; t.now = false;
  t.persistId = ''; // 这个节点已经不在了，别让捷径 / 默认路径再指向它
  state.currentRootId = null; state.currentRootPid = ''; // 回顶层，空态按钮才显示
  state.selectedId = null;
}
// 建主节点 + 直接进编辑（用户点完就能打字，打完就是一张正常卡片）
function createRootAndEdit() {
  if (!state.tree || state.historyMode) return;
  pushUndo();
  state.tree.empty = false;
  // 预置占位文字 + 全选（2026-10-11 用户定）：空标题进编辑时卡片宽度会从"按钮那么窄"
  //  一口气撑开，看着一跳；预置文字后卡片宽度稳定，全选状态下用户直接敲字就替换掉了。
  state.tree.title = T('emptyRoot.placeholder');
  state.selectedId = state.tree.id;
  emitUpdate();
  render();                              // render 之后 DOM 里才有那一行
  startEditById(state.tree.id, true);     // true = 进编辑后全选
}
// 选中元素里的全部文字（进编辑后全选；用户直接敲字就整段替换）
function selectAllNodeText(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  } catch (_) { /* 选中失败不影响编辑本身 */ }
}
function startEditById(id, selectAll) {
  setTimeout(() => {
    const el = document.querySelector('.node-row[data-id="' + id + '"] .title');
    const r = findNode(state.tree, id);
    if (el && r) {
      startEdit(r.node, el);
      if (selectAll) selectAllNodeText(titleTextEl(el) || el); // 放在 startEdit 之后：它内部的收尾逻辑不会再把选区改掉
    }
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
// ===== AI 更改规则块（2026-10-05）=====
// 编辑会话跟 startEditNote 一个模子，只有三处不同：
//   ① 存的是 node.aiRules（落盘 = 备注下面那个 ```AIEditingRules 代码块）；
//   ② 块里是**纯文字**，保存时只收首尾空白，中间一个字符都不加工（内容要原样进文件）；
//   ③ 内容被人动过 → 节点降为「混合」（与备注、标题同一口径）。
function startEditAiRules(node, rulesEl, pos) {
  state.editingAiRulesId = node.id; // 与 editingNoteId 同款：任何入口进来都登记，编辑结束清掉
  disarmProxy(); // 进真编辑态，proxy 让位
  rulesEl.textContent = node.aiRules || '';
  redrawEdgesNextFrame(); // 进编辑的文本替换改的是「卡片宽度」→ 曲线跟上
  editSession(rulesEl, {
    pos,
    cursorEnd: !pos,
    suggest: true, // 规则里也常写 [[节点]]，建议菜单照开（与备注同款）
    onInput: () => {
      // 同备注：内容一为空就彻底清空并把光标放回开头（Chrome 空 contenteditable 会留 <br> 占位，光标退不回去）
      if (!(rulesEl.textContent || '').trim()) {
        rulesEl.innerHTML = '';
        const s = window.getSelection();
        const rr = document.createRange();
        rr.setStart(rulesEl, 0); rr.collapse(true);
        s.removeAllRanges(); s.addRange(rr);
      }
    },
    keys: {
      shiftEnter: () => {}, // Shift+Enter = 仅保存（finish 已执行）
      tab: () => { if (!state.selectedId) state.selectedId = node.id; addChild(); },
      escape: () => { rulesEl.textContent = node.aiRules || ''; }
    },
    onFinish: () => {
      const nr = editableText(rulesEl).trim(); // 只收首尾空白（含首尾空行），中间原样
      if (nr !== (node.aiRules || '')) {
        pushUndo();
        node.aiRules = nr;
        node.aiRulesFence = node.aiRulesFence || AI_RULES_FENCE; // 新建的块用默认围栏（4 个反引号）
        // ⚠️ 2026-10-14 用户定：**改「AI 更改规则」块不降级**（原先这里会降 ainode，本轮去掉）。
        //    规则是"给 AI 的指令"，不是节点内容本身 —— 写一条规则不等于改写内容。
        emitUpdate();
      }
      if (state.editingAiRulesId === node.id) state.editingAiRulesId = null; // 编辑结束：空块随后消失
      render(); // 无论改没改都 render：清掉「编辑中的空块」
    }
  });
}
// 「添加 AI 更改规则」入口（底部 AI 子菜单那一项）：跟「节点备注」那条（editNoteOfSelected）同款 ——
//   先让这一块存在（空内容也渲染出行，光标稳定在竖条右边），进编辑；编辑完没内容 → 块自动消失。
function editAiRulesOfSelected() {
  if (proGuard()) return;   // Pro 门控（2026-10-07）：AI 更改规则
  if (state.historyMode) return;
  const id = state.selectedId;
  if (!id) return;
  const r = findNode(state.tree, id);
  if (!r) return;
  const node = r.node;
  if (!node.aiRules) node.aiRules = '';
  node.aiRulesFence = node.aiRulesFence || AI_RULES_FENCE;
  state.editingAiRulesId = id;
  emitUpdate(); render();
  const row = document.querySelector('.node-row[data-id="' + id + '"]');
  const el = row && row.querySelector(':scope > .card .ai-rules > div');
  if (el) startEditAiRules(node, el);
}

// ===== 节点工具栏（飞书式黑底椭圆，选中节点时浮动显示；2026-08-21 定）=====
let nodeMenu = null;
// ===== AI 输入条（2026-09-28）：点左下「AI 编辑」→ 底部弹出一个输入框，替掉那排节点按钮 =====
// 本轮只做外观与开合（还没接 AI 功能）：蓝框 + 左侧加号 + 右侧发送圆钮 + 框外左侧关闭叉；
// 打字多了往上长（textarea 自适应高度、底部固定）。状态变量声明在文件顶部（见 state 上面）。
function ensureNodeMenu() {
  if (nodeMenu) return nodeMenu;
  nodeMenu = document.createElement('div');
  nodeMenu.id = 'node-menu';
  nodeMenu.className = 'node-menu hidden';
  // 排列固定（2026-09-21 用户定；2026-09-27 去掉「备注」）：格式 / 待办 / Now / Minor / ＋
  // 待办只剩一个按钮（Done 那档并回它自己的 ⌘+点击）；「＋添加」前的分隔线已删（2026-09-27）。
  // 2026-09-27 用户定：「备注」从这里的第二个按钮**挪进「＋添加」面板的最下面**（见 NM_ADD_ORDER 末尾的 note）。
  const items = [
    // 2026-09-17：原来「加粗 / 红 / 黄」三个独立按钮**正式合并**成一个「格式」按钮（悬浮出横排三项）
    // 有子菜单 → **不挂提示**（提示会跟横排子菜单叠住）；说明放在子菜单各项上
    { act: 'style',  icon: 'type' },
    // 待办（2026-09-21 第五轮定稿）：一个按钮两种用法 —— 裸点击 = 普通↔待办；
    // ⌘+点击 = 普通节点快速设为完成（待办/完成节点则与裸点击一样）。图标/提示/配色都在 renderTodoBtn 里刷
    { act: 'todo', icon: 'todo' },
    { act: 'now', icon: 'now', tip: T('nm.now'), tipAct: 'now' },
    // Minor（2026-09-20 用户定稿：图标 arrow-down；act 从 done 改回 minor 腾名字）
    { act: 'minor', icon: 'arrow-down', tip: T('nm.minor'), tipAct: 'minor' },
    // 2026-09-17：图标由三点改 plus，语义变成"新增东西"。
    // 2026-09-28：改成点击弹面板后，悬停不再弹面板 → 提示挂得上了（原来不挂是因为"悬停即弹、会跟面板叠住"）。
    // 面板展开时提示仍会收掉（CSS：body:has(#node-more-menu:not(.hidden)) 那条）。
    { act: 'more', icon: 'plus', tip: T('nm.add') },
    // 2026-10-05 用户定：右边再补一根分隔线 + 一颗「AI」入口按钮（分隔线复用「＋添加」原来那根 .nm-sep）。
    //   「AI」= 悬停弹横排子菜单（跟「格式」那颗一模一样，四项：AI 编辑 / 添加 AI 生成标记 /
    //   复制 AI 定位路径 / 添加 AI 更改规则）；有子菜单 → 不挂自己的提示（会跟子菜单叠住）。
    // 2026-10-08：「AI 功能」总开关关掉时，下面这根分隔线 + 那颗「AI」按钮**一起藏** ——
    //   标记 aiGate，渲染时打成 data-ai，显隐由容器上的 .ai-off 类统一控制（见 applyAiFeaturesVisibility）。
    { sep: true, aiGate: true },
    // 2026-10-05 用户定：这颗也要有黑色小字提示「AI」——它现在是**点击**开合（不再悬停即弹），
    //   所以提示挂得住、不会跟面板叠住（与「＋添加」那颗同一个道理）。
    { act: 'ai', icon: 'ai-entry', tip: T('nm.ai'), aiGate: true },
  ];
  items.forEach(it => {
    if (it.sep) { const s = document.createElement('div'); s.className = 'nm-sep'; if (it.aiGate) s.dataset.ai = '1'; nodeMenu.appendChild(s); return; }
    const b = document.createElement('button');
    if (it.color) b.classList.add('color-' + it.color);
    b.dataset.act = it.act;
    if (it.aiGate) b.dataset.ai = '1'; // 「AI 功能」关掉时靠它一起收
    if (it.tip) nmApplyTip(b, it.tip, it.tipAct); // 「格式」按钮仍不挂（悬停就弹子菜单，提示会叠住）
    b.dataset.side = 'top'; // 底部 nodeMenu 按钮 → tooltip 向上浮动（用户 2026-08-21）
    // 悬浮到这排**任意**按钮上 → 先把两个悬浮面板都收掉：
    // 否则（例如从格式面板移到「备注」）面板还开着、按钮自己的黑色提示框又冒出来，两者叠在一起（用户 2026-09-17）。
    // ⚠️ 注册顺序必须在下面那两个"悬浮即开面板"**之前**，否则会把自己刚开的那个又关掉。
    b.addEventListener('mouseenter', () => { hideStyleMenu(); hideMoreMenu(); hideMoreSub(); hideAiMenu(); });
    // 待办按钮：⌘ 形态只在鼠标悬停它时显示 → 进出它各重刷一次自己（2026-09-22 用户定）
    if (it.act === 'todo') {
      b.addEventListener('mouseenter', () => refreshTodoBtn());
      b.addEventListener('mouseleave', () => refreshTodoBtn());
    }
    // Now / 待办按钮用自定义图标（随选中节点状态换色），不走 ICONS 字典；
    // Minor 按钮 = 两条圆头竖线（2026-09-22 用户定稿，参数在 MINOR_BARS.btn）
    b.innerHTML = it.act === 'now' ? renderNowIcon('bottom')
      : it.act === 'todo' ? renderTodoIcon(18)
      : it.act === 'minor' ? minorBarsSvg(18, 'btn') : renderIcon(it.icon, 18);
    b.onclick = e => {
      e.stopPropagation();
      // 「添加」/「样式」：点一下开面板（键盘/触屏兜底），不执行节点级动作
      if (it.act === 'more') { toggleMoreMenu(b); return; }
      if (it.act === 'style') { showStyleMenu(b); return; }
      if (it.act === 'ai') { toggleAiMenu(b); return; } // 点一下开合（与「＋添加」同款）
      nodeMenuAction(it.act, e); // 传事件：待办按钮要区分「裸点击 / ⌘+点击」（2026-09-20）
    };
    // 「添加」（2026-09-28）：改成点击开合 —— 悬停不再弹面板，点一下开、再点一下收
    // （原先 mouseenter 即开、mouseleave 延时收；鼠标扫过整条工具条时会误弹，故改点击）
    // 「样式」仍是悬浮即弹；留 220ms 宽容期，鼠标从按钮移到面板的间隙不会掉
    if (it.act === 'style') {
      b.addEventListener('mouseenter', () => showStyleMenu(b));
      b.addEventListener('mouseleave', scheduleHideStyle);
    }
    // 样式按钮：编辑态下 mousedown 阻止焦点离开编辑框（否则点按钮 = blur = 编辑结束 + 选区丢失）（2026-08-22）
    if (it.act === 'style' || it.act === 'ai') { // 编辑态别让按钮夺焦（同款处理）
      b.addEventListener('mousedown', e => { if (isEditingTitle()) e.preventDefault(); });
    }
    nodeMenu.appendChild(b);
    // Pro 拦截：Now / Minor 按钮（2026-09-04）；待办按钮**刻意不锁**（用户定：测试功能谁都能用）
    if (it.act === 'now' || it.act === 'minor') applyProGate(b);
  });
  document.body.appendChild(nodeMenu);
  // 建好即按「AI 功能」开关定态（2026-10-08）：关着时那颗「AI」按钮 + 它前面那根分隔线直接不显示
  nodeMenu.classList.toggle('ai-off', !aiFeaturesOn);
  return nodeMenu;
}
function showNodeMenu() {
  if (state.historyMode) { hideNodeMenu(); return; } // 历史页只读：不显示节点编辑菜单
  if (aiInputOn) { hideNodeMenu(); return; } // AI 输入条开着 → 这排按钮让位，两者不叠在一起（2026-09-28）
  // 🔴 2026-10-14 用户实报：**AI 面板开着时切选中节点，面板里的行状态不跟着变** ——
  //   原因 = 选中变化走的是 showNodeMenu（这里），而 syncAiMenuState 原先只挂在 showAiMenu 上。
  //   放在最前面（早退之前也刷）：没选中 / 多选时面板该回中性。面板没开时它自己早退，在这儿叫一声是白拿的。
  syncAiMenuState();
  const m = ensureNodeMenu();
  const multi = state.multiSelected.size > 0;
  if (!state.selectedId && !multi) { m.classList.add('hidden'); return; } // 没有任何选中 → 隐藏
  m.classList.remove('hidden');
  const btns = m.children;
  // ⚠️ 一律按 data-act 取按钮，**不要按下标**（2026-09-17 改）：
  // 用户会继续调整这排按钮的顺序（已把「添加」挪到中间），按下标会在每次挪位置时静默错位。
  const btnOf = act => Array.prototype.find.call(btns, b => b.dataset.act === act);
  // （待办按钮位置的设置项 2026-10-07 已删、固定「底部常驻」→ 底部这颗恒显；右键菜单里那行死分支 2026-10-18 删）
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
  // （右键菜单里那行「待办」的刷新调用已随死分支一起删除：2026-10-18）
}
window.addEventListener('keydown', (e) => { if (e.key === 'Meta' || e.key === 'Control') setCmdHeld(true); });
window.addEventListener('keyup', (e) => { if (e.key === 'Meta' || e.key === 'Control') setCmdHeld(false); });
window.addEventListener('blur', () => setCmdHeld(false));

// ===== 键盘专注淡出（2026-09-27 定；同日二轮改）=====
// 两个触发，时长各自可调：
//   ① 敲键盘 → NM_KEY_FADE_MS 后淡出。**从第一次按键起算，持续敲不重计**
//      （一轮实踩：每个按键都重排计时器 → 打中文/字母时永不淡出，只有回车确认后才淡 —— 与「编辑时聚焦」的初衷相反）。
//   ② 鼠标静置 → NM_IDLE_FADE_MS 后淡出（最后一次鼠标活动起算；不碰键盘干等着也会淡）。
// 任何鼠标活动（移动 / 按下 / 滚轮）→ 立即恢复 + 重排静置计时，并取消键盘计时。
// 淡出只藏左下工具栏与底部节点工具栏，其余浮层不受影响。任一常量设 0 = 关掉那个触发。
// ⚠️ 2026-09-30 用户定：**两个触发都已关掉**（编辑时不藏、静置也不藏）—— "隐藏常驻 UI"改用「全屏专注」那套。
// ⏱ 淡出/淡入动画时长（分开调）在 mindmap-app.css：--nm-fade-out / --nm-fade-in。
// ⚠️ 2026-09-30 用户定：**默认关闭**（编辑时不再把按钮藏起来）—— 机制整套留着，要开把这里改回 1000 即可。
//    "隐藏常驻 UI" 这件事改用「全屏专注」那套（见 mindmap-app.css 的 --fs-dim-*，全屏下半透明、悬停回 100%）。
const NM_KEY_FADE_MS = 0; // 开始敲字后多久其他按钮消失（0 = 关掉这个触发）
// ⚠️ 2026-09-30 用户定：**也默认关闭**（鼠标静置不再藏按钮）—— 机制留着，要开改回 60000 即可。
//    两个触发都关掉后，整套「键盘专注淡出」就是休眠状态（nm-ui-faded 永不挂上），CSS 那段留着不动。
const NM_IDLE_FADE_MS = 0; // 鼠标和键盘不操作后多久其他按钮消失（0 = 关掉这个触发；2026-09-28 曾 10s → 60s）
let nmKeyFadeTimer = null;
let nmIdleFadeTimer = null;
// 鼠标停在这些元素上 → 不淡出（两排按钮 + 它们弹出的悬浮面板；2026-09-27 用户定）
let nmUiHover = false;
const NM_FADE_KEEP_SEL = '#left-toolbar, .node-menu, #ai-input-bar, #node-more-menu, #node-style-menu, #node-ai-menu, #node-more-sub, #more-menu, #now-menu';
function nmUiFadeOut() {
  if (nmUiHover) return; // 鼠标正停在按钮/面板上：保持显示，等鼠标移开（移开会触发 wake 重排计时）
  if (document.body) document.body.classList.add('nm-ui-faded');
}
function nmUiFadeKey() { // 键盘：只在「没在计时 && 还没淡出」时起表 —— 持续敲键盘照样按时淡出
  if (!NM_KEY_FADE_MS || nmKeyFadeTimer) return;
  if (document.body && document.body.classList.contains('nm-ui-faded')) return; // 已淡出：保持，等鼠标
  nmKeyFadeTimer = setTimeout(() => { nmKeyFadeTimer = null; nmUiFadeOut(); }, NM_KEY_FADE_MS);
}
function nmUiFadeWake(e) { // 鼠标：立即恢复 + 重排静置计时；键盘计时一并取消（焦点场景已结束）
  if (e && e.target && e.target.closest) nmUiHover = !!e.target.closest(NM_FADE_KEEP_SEL);
  clearTimeout(nmKeyFadeTimer); nmKeyFadeTimer = null;
  clearTimeout(nmIdleFadeTimer);
  nmIdleFadeTimer = NM_IDLE_FADE_MS ? setTimeout(nmUiFadeOut, NM_IDLE_FADE_MS) : null;
  if (document.body && document.body.classList.contains('nm-ui-faded')) {
    document.body.classList.remove('nm-ui-faded');
  }
}
window.addEventListener('keydown', nmUiFadeKey, true);
window.addEventListener('mousemove', nmUiFadeWake);
window.addEventListener('mousedown', nmUiFadeWake);
window.addEventListener('wheel', nmUiFadeWake, { passive: true });
// 底部待办按钮按「节点状态 × ⌘ 是否按住」渲染（2026-09-21 第五轮定稿）：
//   普通节点：空框（基础色）／⌘ 按住 = 框 + 勾，都基础色（预测：按住点下去会变成已完成）
//   待办节点：空框（主题色）／⌘ 按住 = 框主题色 + 勾基础色（用户给的 Frame (1) 那一版）
//   完成节点：空框（主题色）／⌘ 按住 = 框 + 勾都主题色
// node 传 null = 中性态（多选）：基础色空框，提示照常
// ⚠️ 2026-09-22 用户定：**⌘ 形态只在鼠标悬停在这个按钮上时才显示** —— 以前画布上任何地方按 ⌘ 它就变，
//    容易分神、也会让人误以为「按 ⌘ 就能改状态」（其实还得点这个按钮）。悬停 + ⌘ 才是真实意图。
function renderTodoBtn(b, cmd, node) {
  if (!b) return;
  const td = (node && node.todo) || '';
  let cmdOn = !!cmd;
  if (cmdOn) { try { cmdOn = !!b.matches(':hover'); } catch (_) { cmdOn = false; } }
  b.classList.toggle('td-plain', td === '' && !cmdOn);
  b.classList.toggle('td-plain-cmd', td === '' && cmdOn);
  b.classList.toggle('td-todo', td === 'todo' && !cmdOn);
  b.classList.toggle('td-todo-cmd', td === 'todo' && cmdOn);
  b.classList.toggle('td-done', td === 'done' && !cmdOn);
  b.classList.toggle('td-done-cmd', td === 'done' && cmdOn);
  b.innerHTML = renderTodoIcon(18, cmdOn); // 空框 / 框+勾 由「⌘ 按住 + 鼠标在本按钮上」共同决定
  // 提示走 nmApplyTip（2026-10-06）：文案里的 `{0}` 就是键位段的位置 → 渲染时那一段自动变浅色。
  //   ⚠️ 别再写成 T('nm.todoPlainTip', nmKeySuffix('todo')) —— 那样键位是拼死在正文里的，变不了灰。
  // 2026-10-20：「（按住 ⌘ ：设为已完成）」改为显式后缀段（第 6 参），不再靠括号正则猜。
  nmApplyTip(b, td === '' ? T('nm.todoPlainTip') : T('nm.todoOffTip'), 'todo');
}
// 只重刷待办按钮自己（2026-09-22）：⌘ 形态与鼠标所在位置有关，所以鼠标进出它时要重画一次 ——
// 覆盖「先按住 ⌘ 再移上来」和「先移上来再按 ⌘」两种顺序，两种都立刻出正确形态。
function refreshTodoBtn() {
  if (!nodeMenu || nodeMenu.classList.contains('hidden')) return;
  const b = Array.prototype.find.call(nodeMenu.children, x => x.dataset.act === 'todo');
  if (!b) return;
  const multi = state.multiSelected.size > 0;
  const r = (!multi && state.selectedId) ? findNode(state.tree, state.selectedId) : null;
  renderTodoBtn(b, nmCmdHeld, r ? r.node : null);
}
// （右键菜单里那行「待办」及其渲染器 2026-10-18 整段删除：设置项 2026-10-07 定稿固定「底部常驻」后，
//   那条「待办按钮不在底部才建这行」的判断永远不成立，属死代码。待办只剩底部那一颗。）
function hideNodeMenu() {
  if (nodeMenu) nodeMenu.classList.add('hidden');
  // 底部工具条一藏，挂在它上面的悬浮面板也要跟着收（否则会孤零零留在屏幕上）
  hideMoreMenu(); hideMoreSub(); hideStyleMenu(); hideAiMenu();
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
// 二级（三级菜单那个面板）单独一套：比一级更宽容一点，鼠标斜着划过去也够（2026-10-19）。
const NM_SUB_HIDE_MS = 500;
// 二级面板纵向对齐（2026-09-18）：true = 面板**底边**与一级面板底边齐平（二级比一级高时会整体上提，
// 避免最后几行压到 Obsidian 底部的状态条上）；false = 老行为，与鼠标所在那一行的顶边对齐。
const NM_SUB_BOTTOM_ALIGN = true;
// 🔴 过桥容差（2026-10-20，真浏览器探针定位出来的真因）：
//   从「更多添加项」那行划到二级面板，中间**允许有几 px 空隙** —— 二级的横坐标是「行右边缘 - 8 + --mm-sub-offset-x」，
//   那条旋钮现在是 15px → 实际是 7px 的**缝**。指针穿过这 7px 时既不在行上、也不在面板上：
//   一级面板上那条「鼠标挪到别的行 → 二级**当场**收」把它立刻收掉了，人还没走到二级就没了（用户实报"瞬间消失"）。
//   右键「基础操作」那套不犯这个错，是因为它的主菜单**没有**"当场收"这一条，只有定时器 + 进面板即取消。
//   所以修法不是再去调缝宽，而是**统一认这段路**：指针落在二级矩形外扩这么多 px 之内，
//   一律算「还在去二级的路上」，谁都不许收（一级的当场收、一级收起时的连带收，都要先问它一句）。
const NM_SUB_BRIDGE = 16;
// 指针（**事件自带坐标**，最准）是不是在二级的过桥区里 —— 鼠标事件里一律用这个，别用 mousemove 记的那份（可能慢一拍）
function nmSubNearAt(x, y) {
  try {
    if (!moreSubMenu || moreSubMenu.classList.contains('hidden')) return false;
    const r = moreSubMenu.getBoundingClientRect();
    return x >= r.left - NM_SUB_BRIDGE && x <= r.right + NM_SUB_BRIDGE
        && y >= r.top - NM_SUB_BRIDGE && y <= r.bottom + NM_SUB_BRIDGE;
  } catch (_) { return false; }
}
// 没有事件可问的那些路径（定时器到点、一级收起）→ 用最后一次 mousemove 记下来的指针位置
function nmPointerNearSub() { return nmLastPointer ? nmSubNearAt(nmLastPointer.x, nmLastPointer.y) : false; }
// 最近这一步的**横向**位移：> 0 = 往右走（2026-10-20）
function nmPointerDX() { return (nmPtrPrev && nmLastPointer) ? (nmLastPointer.x - nmPtrPrev.x) : 0; }
// 🔴 指针是不是**正朝二级面板那一侧推进**（2026-10-20，同样是探针逼出来的）：
//   二级是竖着的长条、比一级还高，人从「更多添加项」那行去点它时多半是**斜着往右上划** ——
//   那一路上会压过一级面板上面的其它行，光靠"矩形外扩"救不了（横向差着一百多 px）。
//   所以再看一步"往哪边走"：还在朝二级那一侧推进 = 人是去点它的，谁都不许收；
//   反过来直上直下地挪行（横向几乎不动）→ 不算，照旧当场收（2026-10-18 那条手感要留着）。
function nmHeadingToSub(x, y) {
  if (!moreSubMenu || moreSubMenu.classList.contains('hidden')) return false;
  try {
    const r = moreSubMenu.getBoundingClientRect();
    if (y < r.top - NM_SUB_BRIDGE || y > r.bottom + NM_SUB_BRIDGE) return false; // 纵向压根不在二级那一带
    const dx = nmPointerDX();
    if (Math.abs(dx) < 1) return false;                                          // 几乎没横向动 = 在挪行，不是在去二级
    const mid = (r.left + r.right) / 2;
    return (mid - x) * dx > 0;                                                    // 位移方向与"二级在指针哪一侧"同向
  } catch (_) { return false; }
}
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
  // 导入仓库文档（2026-10-09 用户定）：排在「子文档」**上面**。点了弹窗从 vault 里挑一份**已有**文档，
  //   挑完把它搬进数据区 docs/、挂成选中节点的子节点。图标与「转入思维导图」同一只（语义一致）。
  importDoc:   { icon: 'file-input',            label: () => T('more.importRepoDoc'), tip: () => T('more.importRepoDocTip') },
  // 转入仓库文件夹（2026-10-12 用户定）：**排在「转入仓库文档」下面** —— 两条是同一族（都从 vault 里搬东西进来），
  //   只是这条搬的是**整个文件夹树**。点了弹窗粘**文件夹绝对路径**（Obsidian 没有原生的文件夹选择器）。
  //   ⚠️ 它**不挂到选中节点**（转入文件夹 = 照树建一张**新导图**），所以不需要选中节点。
  importFolder:{ icon: 'folder-input',          label: () => T('more.importRepoFolder'), tip: () => T('more.importRepoFolderTip') },
  // 子文档（2026-10-09 用户定）：排在「关联节点」下面。图标 = 文档节点渲染时那只文档图标。
  //   点了会先在数据区 docs/ 里**新建一份空文档**，再把它挂成选中节点的子节点（并选中 + 摆到中央）。
  childDoc:    { icon: 'file-text',             label: () => T('more.addChildDoc'),    tip: () => T('more.addChildDocTip'), tipAct: 'addChildDoc' },
  addChild:    { icon: 'arrow-right-from-line', label: () => T('more.addChild'),       tip: () => T('more.addChildTip'),    tipAct: 'addChild' },
  addSibling:  { icon: 'arrow-left-to-line',    label: () => T('more.addSibling'),     tip: () => T('more.addSiblingTip'),  tipAct: 'addSibling' },
  // 备注（2026-09-27 用户定）：从节点工具栏的第二个按钮**挪进本面板的最下面**。
  //   2026-10-06 用户定：提示改成「点击后，可添加备注」+ 实时键位段（tipAct 自动接）——
  //   原来是直接把行文字「备注」当提示、后面硬接键位，跟其它行「点击后，可…」的写法不一致。
  note:        { icon: 'text-quote',            label: () => T('nm.note'),             tip: () => T('more.addNoteTip'),     tipAct: 'editNote' },
  // 「更多添加项」（2026-10-12 拆两级）：一级末尾的**二级入口行**。sub: true → 悬浮即展开右侧二级面板
  //   （#node-more-sub，2026-09-17 那套机制原样复用），点击也展开一次（触屏 / 键盘兜底）；
  //   右侧小箭头 = .mm.has-sub::after，上方分隔线 = .mm-sep.mm-more-sep（--mm-more-sep 可整根收掉）。
  //   ⚠️ 这一行**不挂黑色小字提示**：悬浮它就直接出二级面板了，提示纯属多余（还跟面板抢位置）。
  moreAdd:    { icon: 'plus',                  label: () => T('more.moreAdd'), sub: true },
};
// 固定顺序（2026-10-12 用户在调教器「添加菜单」页排定的**拆级**）：
//   moreAdd = 分界行 —— 它上面（含它自己）= 一级菜单，下面 = 「添加更多项」展开后的二级菜单。
//   一级 = 图片 / 网页链接 / 备注 / 子文档 / 添加更多项；
//   二级 = 视频 / 音频 ｜ 子节点 / 同级节点 / 关联节点 ｜ 仓库附件 / 本地文件链接 / 双链 ｜ 转入仓库文档 / 转入仓库文件夹。
const NM_ADD_ORDER = ['image', 'url', 'note', 'childDoc', 'moreAdd',
  'video', 'audio', 'sep1', 'addChild', 'addSibling', 'node', 'sep4',
  'vault', 'file', 'wiki', 'sep3', 'importDoc', 'importFolder'];
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
// 面板内容（2026-10-12 拆两级）：顺序固定 = NM_ADD_ORDER，moreAdd 把它切成一级 / 二级两段
//   （一级末尾 = moreAdd 入口行；点 / 悬停它 → 右侧浮出二级面板）。仍返回 level1/level2/hasFunc/subUsable
//   四字段：下游（渲染 / 按钮显隐）不用跟着改。
// ⚠️ 2026-10-09 用户定：「子文档」= **新建一份文档并放进数据库** —— 与「转入」同一类**导入入口**，
//   所以它跟总开关走：开关关掉时这一行整行不出现（其余各行不受影响）。
// ⚠️ 二级一行都没有（全被门控滤掉）→ moreAdd 入口行也不出现，免得点开一个空面板。
function nmAddSplit() {
  const i = NM_ADD_ORDER.indexOf('moreAdd');
  const usable = NM_ADD_ORDER.filter(tk => tk !== 'moreAdd' && (NM_ADD_META[tk] || nmIsSep(tk)) && nmAddRowUsable(tk));
  const pos = tk => NM_ADD_ORDER.indexOf(tk);
  const l2 = nmCleanRows(i < 0 ? [] : usable.filter(tk => pos(tk) > i));
  const l1 = nmCleanRows(usable.filter(tk => i < 0 || pos(tk) < i));
  if (!l2.length) return { level1: l1, level2: [], hasFunc: l1.some(tk => !nmIsSep(tk)), subUsable: false };
  return { level1: l1.concat('moreAdd'), level2: l2, hasFunc: true, subUsable: true };
}
// 这一行当前能不能出现（跟总开关走的行在这里判；其余一律 true）
// ⚠️ 2026-10-09 用户明确：开关关掉**只**隐藏这三行（子文档 / 转入仓库文档 / 转入仓库文件夹）—— 命令、快捷键、
//   画布节点右键、文档面板一概不隐藏。（2026-10-12 加第三行：转入仓库文件夹也是文档库的入口。）
function nmAddRowUsable(tk) { return (tk !== 'childDoc' && tk !== 'importDoc' && tk !== 'importFolder') || docsLibraryOn; }
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
  // 悬浮的黑色小字提示（键位段由 tipAct 自动接上）：有文案才挂 ——
  // 「更多添加项」那行没有 tip → 不设 data-tip，悬浮不会冒提示（它悬浮直接出二级面板）
  if (meta.tip) nmApplyTip(b, meta.tip(), meta.tipAct);
  b.dataset.side = 'left';       // 提示弹到**左侧**：弹上方会盖住上面那几行（用户 2026-09-17）
  if (meta.sub) b.classList.add('has-sub'); // 二级入口行：右侧挂一个小箭头（.mm.has-sub::after，2026-10-12）
  // 行 = 图标 + 文字（2026-09-21 二次定稿：右侧那列快捷键小字整列去掉，见 NM_ADD_META 的注）
  // 门控三行（子文档 / 转入仓库文档 / 转入仓库文件夹）的图标包一层 .mm-ic —— 照 AI 行（2026-10-07）的做法：
  //   Pro 门控锁定态悬浮时只换这一格、**不把文字标签一起抹掉**
  const gated = (tk === 'childDoc' || tk === 'importDoc' || tk === 'importFolder');
  b.innerHTML = (gated ? '<span class="mm-ic">' + renderIcon(meta.icon, 16) + '</span>' : renderIcon(meta.icon, 16))
    + '<span class="mm-label">' + escapeHtml(meta.label()) + '</span>';
  // 编辑态下 mousedown 不让按钮夺焦：否则点面板 = 编辑框立即失焦 = 编辑结束（照加粗按钮同款处理）
  b.addEventListener('mousedown', e => { if (state.editingEl) e.preventDefault(); });
  if (meta.sub) {
    // 二级入口：悬浮即展开右侧面板；点击也展开一次（触屏 / 键盘兜底）
    // 🔴 2026-10-19 第三版：完全照右键「基础操作」那套接（他要求"直接抄人家的"）——
    //   行 enter → 立刻展开；行 leave → 排一次收起；面板 enter → 取消收起；面板 leave → 排一次收起。
    //   多一行日志（开关 = 设置里的「日志」），下次再出问题能直接从控制台看是谁在关它。
    b.addEventListener('mouseenter', () => { dbgSub('行 enter', tk); showMoreSub(b); });
    b.addEventListener('mouseleave', () => { dbgSub('行 leave', tk); scheduleHideSub(); });
    b.onclick = e => { e.stopPropagation(); showMoreSub(b); };
  } else {
    b.onclick = e => { e.stopPropagation(); hideMoreMenu(); hideMoreSub(); moreMenuAction(tk); };
  }
  if (gated) applyProGate(b); // Pro 拦截（2026-10-11）：子文档 / 转入仓库文档 / 转入仓库文件夹（文档库）
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
  // 鼠标从「添加更多项」挪到一级面板的别的行 → 二级**当场收**（2026-10-18）。
  //   原来只有那一行的 mouseleave → scheduleHideSub（NM_HIDE_MS 宽容期）在兜，往上一挪会看见
  //   二级"迟一下才消失"；那 320ms 只该服务「横着挪进二级面板」，挪去别处不该再等。
  //   用 mouseover（会冒泡）挂在面板上：行与行之间的空隙 / 分隔线也一起算，挪到哪儿都收。
  moreMenu.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.mm.has-sub')) return; // 还停在二级入口那行 → 不收
    // 🔴 2026-10-20：指针正在往二级去的路上 → **不收**。少了这两句，鼠标从那行往右上划的时候
    //   会被当场收掉，人还没走到二级就没了（用户实报"瞬间消失"）。
    //   ① 过桥区：已经贴到二级边上（含那条几 px 的缝）；
    //   ② 还在朝二级那一侧推进：斜着划过一级上面那几行的路上。
    if (nmSubNearAt(e.clientX, e.clientY)) return;
    if (nmHeadingToSub(e.clientX, e.clientY)) return;
    hideMoreSub();
  });
  document.body.appendChild(moreMenu);
  return moreMenu;
}
function renderMoreMenu() {
  const m = ensureMoreMenu();
  clearEl(m);
  nmAddSplit().level1.forEach(tk => {
    // 「添加更多项」上面那根分隔线（2026-10-12）：把它与上面那组隔开；上一行已是分隔线 / 它是首行时不再画。
    //   css 旋钮 --mm-more-sep 设成 none 可整根收掉（试"要不要这根线"用的）。
    if (tk === 'moreAdd' && m.lastElementChild && !m.lastElementChild.classList.contains('mm-sep')) {
      const s = document.createElement('div'); s.className = 'mm-sep mm-more-sep'; m.appendChild(s);
    }
    const el = nmAddRowEl(tk); if (el) m.appendChild(el);
  });
  moreMenuBuilt = true;
  return m;
}
// 二级面板的容器（内容每次由 renderMoreSub 按配置填）
function ensureMoreSub() {
  if (moreSubMenu) return moreSubMenu;
  moreSubMenu = document.createElement('div');
  moreSubMenu.id = 'node-more-sub';
  moreSubMenu.className = 'node-more-menu node-more-sub hidden';
  moreSubMenu.addEventListener('mouseenter', () => { dbgSub('面板 enter', ''); clearTimeout(moreSubHideTimer); clearTimeout(moreHideTimer); moreSubHideTimer = 0; });
  moreSubMenu.addEventListener('mouseleave', () => { dbgSub('面板 leave', ''); scheduleHideSub(); });
  document.body.appendChild(moreSubMenu);
  return moreSubMenu;
}
// 二级面板（2026-10-12 拆两级重新启用；2026-09-17 建、2026-09-21 曾随「添加面板简化」停用）。
// 内容 = 排在 moreAdd 分界行下面的那些条目（含分隔线）。
function renderMoreSub() {
  const s = ensureMoreSub();
  clearEl(s);
  nmAddSplit().level2.forEach(tk => { const el = nmAddRowEl(tk); if (el) s.appendChild(el); });
  moreSubBuilt = true;
  return s;
}
// 二级面板相对一级的额外右移量（2026-10-12）：css 旋钮 --mm-sub-offset-x（默认 0 = 原样贴着）。
//   二级盖住一级时把值调大（如 12px）即可分开；只在「弹右侧」那一档生效，翻到左侧时不受影响。
function nmSubOffsetX() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-sub-offset-x'));
  return isNaN(v) ? 0 : v;
}
function showMoreSub(row) {
  if (state.historyMode) return;
  dbgSub('show', '');
  clearTimeout(moreSubHideTimer); clearTimeout(moreHideTimer); // 二级展开期间一级别关
  const s = moreSubBuilt ? ensureMoreSub() : renderMoreSub();
  s.classList.remove('hidden');
  const rr = row.getBoundingClientRect();
  const sw = s.offsetWidth, sh = s.offsetHeight;
  let left = rr.right - 8 + nmSubOffsetX();                   // 贴一级面板右侧（左边叠 8px 做"过桥"，斜着划过去也不会掉）+ 旋钮右移量
  // ⛔ 那条缝**不许宽过过桥容差**（2026-10-20）：--mm-sub-offset-x 调太大时，行与二级之间的缝会宽到
  //   "指针穿到一半、二级已经被收掉"，那就再也进不去了（二级收掉后不吃指针，mouseenter 永远等不到）。
  //   所以按容差封顶 —— 旋钮想再往右推也推不动，视觉上最多就是"贴着、不重叠"。
  const maxLeft = rr.right + NM_SUB_BRIDGE - 4;
  if (left > maxLeft) left = maxLeft;
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
// 🔴 2026-10-19 第四版（照「定位按钮」那颗的做法：**不看事件顺序，到点看指针在哪**）：
//   行 mouseleave 排一次收起，但**到点那一刻再看一眼指针** —— 只要指针已经压在二级面板上，就不收。
//   这样"行 leave 了、人其实已经在面板上"这条最常见的失败路径就被堵死了；
//   反过来指针真的走了，500ms 后照收，不会粘住。
function scheduleHideSub() {
  clearTimeout(moreSubHideTimer);
  moreSubHideTimer = setTimeout(() => {
    moreSubHideTimer = 0;
    try {
      if (moreSubMenu && !moreSubMenu.classList.contains('hidden') && nmLastPointer) {
        const p = nmLastPointer;
        // 到点看指针：已经压在二级上 / 还在过桥区 / 还在朝二级那一侧推进 → **不收**，再排一轮。
        //   （"再排一轮"是为了慢慢挪的人：走一半还没到，500ms 就到点了，直接收等于把人甩在半路。）
        //   一旦进了二级，它自己的 mouseenter 会把这个_timer清掉；指针走开或停下，下一轮就正常收。
        if (nmSubNearAt(p.x, p.y) || nmHeadingToSub(p.x, p.y)) {
          dbgSub('到点不收（在二级上 / 正在去二级）', '');
          scheduleHideSub();
          return;
        }
      }
    } catch (_) {}
    hideMoreSub();
  }, NM_SUB_HIDE_MS);
}
function hideMoreSub() { dbgSub('hide', ''); clearTimeout(moreSubHideTimer); moreSubHideTimer = 0; if (moreSubMenu) moreSubMenu.classList.add('hidden'); }
function showMoreMenu(anchor) {
  hideCtx(); // 2026-10-08：点工具条按钮时把节点右键菜单收掉 —— 工具条按钮都 stopPropagation，
             //   document 上那条「点别处收菜单」收不到，不主动收就会跟弹出的面板叠在一起
  if (state.historyMode) { hideMoreMenu(); return; } // 历史页只读
  clearTimeout(moreHideTimer);
  hideStyleMenu(); // 两个面板不同时开
  const m = moreMenuBuilt ? ensureMoreMenu() : renderMoreMenu(); // 首次打开 / 配置改过 → 重建
  hideMoreSub();   // 🔴 2026-10-19：打开一级时先收掉二级 —— 二级残留会盖住行，行收不到 mouseenter → "后面就不行了"
  m.classList.remove('hidden');
  placePanelNear(m, anchor, 8);
}
// 🔴 2026-10-19 用户实报「鼠标刚要滑到三级菜单，它就关了」：
//   原来这里 `hideMoreMenu(); hideMoreSub();` 一起收 —— 可三级菜单是**浮在一级外面**的，指针离开一级
//   去够它的那段路上，一级的 mouseleave 就到点了，把二级（也就是三级那个面板）一起收掉。
//   右键「基础操作」那套之所以不犯这个错：它的主菜单**没有** mouseleave 收二级。
//   现在照它来：这里只收一级；二级由它自己的 mouseleave（`scheduleHideSub`）负责。
function scheduleHideMore() { clearTimeout(moreHideTimer); moreHideTimer = setTimeout(() => { hideMoreMenu(); }, NM_HIDE_MS); }
function hideMoreMenu() {
  if (moreMenu) moreMenu.classList.add('hidden');
  // 🔴 2026-10-19：一级收掉时二级不能留着（残留在屏幕上会挡住行）。除非指针正压在二级上 ——
  //   那种情况让它自己的 mouseleave 去收，不然"刚滑过去就被收"。
  // 🔴 2026-10-20：认过桥区（不只是"正压在二级上"）—— 鼠标走得慢时，一级先到点收了、人还在缝里，
  //   旧判据会顺手把二级一起收掉，人再往前走就进不去了。
  if (moreSubMenu && !moreSubMenu.classList.contains('hidden') && !nmPointerNearSub()) hideMoreSub();
}
// 「＋」点击开合（2026-09-28）：面板已开 → 收；没开 → 按按钮位置弹
function toggleMoreMenu(anchor) {
  if (moreMenu && !moreMenu.classList.contains('hidden')) { hideMoreMenu(); hideMoreSub(); return; }
  showMoreMenu(anchor);
}

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
    { act: 'bold',   icon: 'bold',   tip: T('nm.bold'),   tipAct: 'bold' },
    { act: 'red',    icon: 'circle', tip: T('nm.red'),    tipAct: 'red',    color: 'red' },
    { act: 'yellow', icon: 'circle', tip: T('nm.yellow'), tipAct: 'yellow', color: 'yellow' },
  ];
  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'mm';
    b.dataset.act = it.act;
    if (it.color) b.classList.add('color-' + it.color);
    // ⚠️ 一律走 nmApplyTip（2026-10-06 修）：以前这里是 `b.dataset.tip = it.tip` ——
    //   tipAct 被整个丢掉 → 格式子菜单三项的提示**永远没有键位段**（改键也不动）。
    if (it.tip) nmApplyTip(b, it.tip, it.tipAct, null, false, it.tipH || '');
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
  hideCtx(); // 2026-10-08：点工具条按钮时把节点右键菜单收掉 —— 工具条按钮都 stopPropagation，
             //   document 上那条「点别处收菜单」收不到，不主动收就会跟弹出的面板叠在一起
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
// ===== 底部工具条「AI」按钮的下拉面板（2026-10-05 建立；同日改版）=====
// 形态与交互**照抄「＋添加」那颗**（用户 2026-10-05 第二轮定）：
//   · 点一下开合（不再是"鼠标悬停就弹"）—— 再点一下 / 点别处 / 工具条收起来，都会收；
//   · 从上到下 4 行，每行 = 图标 + 文字（跟「添加」面板一个长相，不再是横排只有图标）。
// 面板本体复用 .node-more-menu（材质在文件末尾「浮层外观」的 id 名单里，别漏）。
// 四项（图标见 ICONS 里 ai-* 那一段），分两组、中间一根分隔线（2026-10-07 用户定）：
//   ① 跟 AI 协作 ── AI 编辑        —— 与原来右键那条同一件事（开合底部 AI 输入条）
//                  复制 AI 定位路径 —— copyAILocateAtFocus（含原来那套黑色小字提示）
//   ─────────────── 分隔线（.mm-sep，与「＋添加」面板同一根，不另做设计）
//   ② 给节点加 AI 标记类内容 ── 添加 AI 生成标记 —— toggleAinodeAtFocus：未标记 → 打标；已标记 → 图标变主题色、文案变「清除…」
//                            添加 AI 更改规则 —— editAiRulesOfSelected：节点下方出现一块可编辑区（像备注）
let aiMenu = null;
// ===== AI 四项的**唯一定义**（2026-10-08 用户定）=====
// 底部工具条那颗「AI」按钮弹出的面板，与节点**右键菜单**里那一组，**共用这一份** ——
//   用户原话："本质上是把这几个按钮放在另外一个地方，同时再放一份而已"。
//   所以图标（icon）/ 文案（label·tip）/ 动作 id（act）/ 小眼睛（eye）/ Pro 门控范围全在这里，
//   两处各自按自己的外观渲染（面板 = 竖排 .mm 行，右键 = .ctx-item 行）。
//   ⚠️ 任何一处都**不许另抄一份**（上一轮就是另画了一套图标，用户当场看出"图标都不一样了"）。
//   ⚠️ label / tip 写成函数：i18n 切语言后重新渲染即得新文案（原来直接 T(...) 求值，只算一次）。
// 顺序 + 分隔线（2026-10-07 用户定）：AI 编辑 / 复制 AI 定位路径 ｜ 添加 AI 生成标记 / 添加 AI 更改规则。
const NM_AI_ITEMS = [
  { act: 'aiEdit',   icon: 'ai-gen',   label: () => T('nm.aiEdit'),   tip: () => T('nm.aiEditTip') },
  { act: 'aiLocate', icon: 'ai-link',  label: () => T('nm.aiLocate'), tip: () => T('nm.aiLocateTip'), tipAct: 'copyAILocate' },
  { sep: true },
  // ⚠️ tipAct: 'aiMark' 必须给（2026-10-06 用户实报「⌘⌥A 设了但不显示」）：
  //   有 `canvas-ai-mark` 这条命令，缺了 tipAct 就等于这行的提示永远不带键位段。
  // sub: 'aiRemark' = 这一行左边图标格里再压一颗「添加 AI 备注」按钮（2026-10-14，形态照下面 aiRules 那颗小眼睛）。
  //   两个按钮各管各的：点文字 = 节点标记（整块内容），点图标格 = 备注标记（只管备注那一块）。
  { act: 'aiMark',   icon: 'ai-mark',  label: () => T('nm.aiMark'),   tip: () => T('nm.aiMarkTip'), tipAct: 'aiMark', sub: 'aiRemark' },
  // 图标用候选 B（ai-rules-lines，2026-10-06）；原来那只 ai-rules 留在 ICONS 里做对比，用户定稿后再删一只
  // eye: 'aiRulesEye' = 这一行**左边那个图标格里再压一颗小眼睛**（切「显示 / 隐藏 AI 更改规则」，全局生效）。
  //   🔴 2026-10-07 用户定稿：眼睛**融进行图标** —— 平时露行自己的图标（ai-rules-lines），
  //      鼠标停到本行，图标就地「变成」小眼睛；已隐藏那档眼睛常驻，图标一直让位。
  //      ⚠️ 眼睛仍是独立 <button>、靠 CSS 绝对定位盖在图标上（不是把图标换成眼睛的 SVG）——
  //         <button> 不能嵌 <button>，而「点图标 = 切显隐」「点文字 = 打开规则编辑」是两件事。
  //      ⚠️ 这一处前后试过四种形态，用户 2026-10-07 最终定的是**这一种**：
  //         ① 眼睛在行右边（2026-10-06）→ ② 悬停本行弹一个「显示规则 / 隐藏规则」二级面板（会跟面板叠，否掉）
  //         → ③ 回到① → ④ 融进行图标（本版）。别自作主张再改。
  { act: 'aiRules',  icon: 'ai-rules-lines', label: () => T('nm.aiRules'), tip: () => T('tip.aiRulesHint'), eye: 'aiRulesEye' },
];
// Pro 门控范围（2026-10-07 用户定）：AI 生成标记 / AI 定位路径 / AI 更改规则 三项未激活时锁住；AI 编辑不锁
const NM_AI_GATED = { aiMark: 1, aiLocate: 1, aiRules: 1 };
// 2026-10-08 用户定：这两项在**节点右键菜单里先屏蔽**（原话"不是给我删除，因为我后面说不定还加回来"）——
//   从这个名单里去掉即恢复；底部 AI 面板不受影响（同一份 NM_AI_ITEMS，只是右键这边筛掉）。
// ⚠️ 2026-10-11 用户定：**右键那一组的调用点整体撤了**（AI 只留底部一个入口，理由见 buildCtxMenu 尾部那段）。
//   这个名单与 `ctxAiGroup` 渲染器**都留着**（"说不定还加回来"），只是当前没人调 —— 别当死代码删掉。
const NM_AI_CTX_SKIP = { aiEdit: 1, aiMark: 1 };

function ensureAiMenu() {
  if (aiMenu) return aiMenu;
  aiMenu = document.createElement('div');
  aiMenu.id = 'node-ai-menu';
  aiMenu.className = 'node-more-menu hidden'; // 竖排面板（跟「＋添加」同一个长相）
  // 条目 = NM_AI_ITEMS（**唯一定义**，右键菜单里那组读的也是它）；这里只管把外观渲染成竖排面板行。
  NM_AI_ITEMS.forEach(it => {
    // 分隔线：复用「＋添加」面板那根 .mm-sep（同一套设计，不另做）—— 只加一条线，提示 / 门控 / 事件一概不挂
    if (it.sep) { const s = document.createElement('div'); s.className = 'mm-sep'; aiMenu.appendChild(s); return; }
    const b = document.createElement('button');
    b.className = 'mm';
    b.dataset.act = it.act;
    nmApplyTip(b, it.tip(), it.tipAct);
    b.dataset.side = 'left'; // 面板在屏幕右下 → 提示往左弹（跟「添加」面板同一套）
    // 图标单独包一层 .mm-ic（2026-10-07）：Pro 门控换图标时只换这一格，**不再把文字标签一起抹掉**
    b.innerHTML = '<span class="mm-ic">' + renderIcon(it.icon, 16) + '</span>'
      + '<span class="mm-label">' + escapeHtml(it.label()) + '</span>';
    b.addEventListener('mousedown', e => { if (state.editingEl) e.preventDefault(); }); // 编辑态别夺焦
    b.onclick = e => { e.stopPropagation(); hideAiMenu(); aiMenuAction(it.act); };
    // Pro 门控（2026-10-07 用户定）：AI 生成标记 / AI 定位路径 / AI 更改规则 三项未激活时锁住
    //（AI 编辑不锁 —— 用户圈的就是这三项）
    if (NM_AI_GATED[it.act]) applyProGate(b);
    // 行上的附属按钮（2026-10-14 起两种）：
    //   it.eye = 「AI 更改规则」那颗小眼睛（切显示 / 隐藏，全局生效）
    //   it.sub = 「添加 AI 备注」那颗（切**这个节点**的备注标记）
    // 两者形态完全一样（绝对定位盖在行左侧图标格上、悬浮本行才露）→ 共用 .mm-row + .mm-eye 那套，别另写定位。
    if (!it.eye && !it.sub) { aiMenu.appendChild(b); return; }
    // 带附属按钮的那行：两个按钮**并列**（button 里不能再嵌 button）→ 外面套一层 .mm-row。
    // 🔴 2026-10-07 起附属按钮**不是排在右边**，而是由 CSS 绝对定位**盖在行左侧的图标格上**（融进图标）——
    //    所以 DOM 顺序仍是「行按钮 → 附属按钮」，位置交给 .mm-eye 那几条 CSS，别在这里调。
    const row = document.createElement('div');
    row.className = 'mm-row';
    row.appendChild(b);
    const side = document.createElement('button');
    side.className = 'mm-eye' + (it.sub ? ' mm-eye-remark' : '');
    side.dataset.act = it.eye || it.sub;
    side.dataset.side = 'left';
    // 16px = 与行图标（.mm-ic 里的 16px 图标）同尺寸，换上去才是"图标变成了它"而不是"图标被换了"
    side.innerHTML = renderIcon(it.eye ? 'eye' : 'ai-remark', 16);
    side.addEventListener('mousedown', e => { if (state.editingEl) e.preventDefault(); });
    if (it.sub) {
      // 「添加 AI 备注」（2026-10-14）：点一下 = 给这个节点的备注打标 / 摘标（与「添加 AI 生成标记」同一套落点口径）。
      //   ⚠️ 2026-10-14 用户定：**点完把面板收掉** —— 与上面「添加 AI 生成标记」那条行为一致
      //      （原先照小眼睛做成"不收"，用户实报「点完没关、再点又没反应，很怪」）。
      //   ⚠️ 提示由 syncAiMenuState 按两态刷（未标记 / 已标记）。
      side.onclick = e => { e.stopPropagation(); e.preventDefault(); hideAiMenu(); toggleAiremarkAtFocus(); };
      // Pro 门控：与「添加 AI 生成标记」同一条（2026-10-14 用户定：备注标记也锁）。
      //   ⚠️ 必须在 onclick 赋值**之后**（applyProGate 靠包装 onclick 拦截）
      applyProGate(side);
    } else {
      // ⚠️ 不收面板：就地切换，用户当场看见眼睛图标与卡片一起变
      // ⚠️ 置灰档（画面里没有规则）**点了不响应**（2026-10-06 用户定：置灰就是不可点）。
      //    不用 pointer-events: none 挡 —— 那样连 :hover 都没了、提示弹不出来（CSS 那边有说明）。
      side.onclick = e => {
        e.stopPropagation(); e.preventDefault();
        if (!anyAiRulesInView()) return; // 没东西可隐藏 → 这一下不算
        setAiRulesFull(!aiRulesFullOn, true);
      };
    }
    row.appendChild(side);
    aiMenu.appendChild(row);
  });
  document.body.appendChild(aiMenu);
  return aiMenu;
}
// 「添加 AI 生成标记」那一行：文案分**三态**（用户 2026-10-05 定：沿用原来右键那套，别只做两态）——
//   没标记   → 行文字「添加 AI 生成标记」 + 提示「将此节点标记为 AI 生成」
//   纯 AI    → 行文字「清除 AI 生成标记」 + 提示「此节点已标为「AI 生成」，点击清除标记」
//   混合 mix → 行文字「清除 AI 生成标记」 + 提示「此节点已标为「AI 生成（含人工内容）」，点击清除标记」
//   ⚠️ 行文字只有「添加 / 清除」两态（ai 与 mix 都是清除），**区别在提示语** —— 原来就是这么设计的。
//   标记时同时加 .on：图标 + 文字一起变主题色（用户定：这样一眼看出"现在是标记状态"）。
// 当前「活着」的 AI 行容器：底部 AI 面板 + 节点右键菜单（两处共用 NM_AI_ITEMS，状态也要一起刷）
function aiRowHosts() {
  const out = [];
  if (aiMenu && !aiMenu.classList.contains('hidden')) out.push(aiMenu);
  if (ctxMenu) out.push(ctxMenu);
  return out;
}
function syncAiMenuState() {
  const hosts = aiRowHosts();
  if (!hosts.length) return;
  const r = state.selectedId ? findNode(state.tree, state.selectedId) : null;
  const node = r ? r.node : null;
  const v = ainodeOf(node && node.ainode); // '' / 'ai' / 'mix'
  const on = !!v;
  const tip = v === 'mix' ? T('nm.aiMarkTipMix') : (v === 'ai' ? T('nm.aiMarkTipAi') : T('nm.aiMarkTip'));
  const text = on ? T('nm.aiMarkOn') : T('nm.aiMark');
  hosts.forEach(h => h.querySelectorAll('[data-act="aiMark"]').forEach(btn => {
    btn.classList.toggle('on', on);
    nmApplyTip(btn, tip, 'aiMark'); // 文案自带「正文==space==后缀」；act 顺带重算键位段
    const lb = btn.querySelector('.mm-label') || btn.querySelector('.ctx-label');
    if (lb) lb.textContent = text;
  }));
  // 备注标记那颗附属按钮（2026-10-14）：两态（未标记 / 已标记）—— 已标记时跟行按钮一样变主题色。
  //   图标形状本身分 ai / mix（与备注栏那颗 logo 同源），提示语也分开说清"清掉的是哪一种"。
  //   ⚠️ 2026-10-14 用户定：**这个节点没有备注 → 置灰不可点**（`.na`，与「AI 更改规则」那只小眼睛同一套写法）；
  //      已标记的**不置灰** —— 备注被删掉时还得能把标记摘下来。
  const rv = airemarkOf(node && node.airemark);
  const rOn = !!rv;
  const rNa = !rOn && !hasNoteText(node);
  const rTip = rNa ? T('tip.aiRemarkNa')
    : (!rv ? T('nm.aiRemarkTip') : (rv === 'mix' ? T('nm.aiRemarkTipMix') : T('nm.aiRemarkTipOn')));
  hosts.forEach(h => h.querySelectorAll('[data-act="aiRemark"]').forEach(btn => {
    btn.classList.toggle('on', rOn);
    btn.classList.toggle('na', rNa);
    nmApplyTip(btn, rTip); // 无 act → 不登记、不显键位段（这颗按钮没有对应命令）
  }));
}
// 那颗小眼睛的**三态**（2026-10-06 用户定；判据与左下「视图筛选」那只小眼睛**同一个逻辑**）：
//   ① 画面里**一个带 AI 更改规则的节点都没有** → **置灰**（`.na`）+ 睁眼 + 提示「画面里没有…」
//   ② 有规则、正显示着                        → 正常色 + 睁眼
//   ③ 有规则、且已隐藏                        → 换色（紫）+ **闭眼**，而且**一直显示**
// ⚠️ ① 的判据 2026-10-06 用户改过：原来是「**选中的节点**有没有规则」，现在是
//   **整个画面（排除折叠起来的）有没有规则** —— 与左下那只「画面里有 Minor/Done 才亮」同一套（anyAiRulesInView）。
// ⚠️ ③ 要求 `has`：画面里没规则时不该显示成"已隐藏"（没东西可隐藏，跟左下那只同一条规矩：
//   没内容就只显示置灰的睁眼）—— 否则眼睛说"我藏起来了"，而画面上本来就没东西。
// 图标写的是"现在是什么状态"（不是"点下去会发生什么"）：显示中 = 睁眼，隐藏中 = 闭眼 ——
//   ⚠️ 2026-10-06 用户实报「两个图标做反了」，原来写反了。
// ⚠️ 提示挂在眼睛自己身上（只有图标、没有文字标签，没提示用户看不懂它干嘛的）。
function syncAiRulesEye() {
  // 没有任何「活着的 AI 行容器」（底部面板关着、右键菜单也没开）就不做 —— 这个方法被 updateToolbar()
  // 顺带调（每处选中变化都走那儿），白跑一遍全树扫描没意义。
  // ⚠️ 2026-10-08：判据从「只看 aiMenu」改成 aiRowHosts() —— 右键菜单里也有一份 AI 行（见 NM_AI_ITEMS）。
  const hosts = aiRowHosts();
  if (!hosts.length) return; // 面板关着、右键菜单也没开 → 白跑一遍全树扫描没意义
  const has = anyAiRulesInView();
  const hiding = has && !aiRulesFullOn;
  const tip = !has ? T('tip.aiRulesEyeNone') : T(hiding ? 'tip.aiRulesEyeOff' : 'tip.aiRulesEyeOn');
  hosts.forEach(h => h.querySelectorAll('[data-act="aiRulesEye"]').forEach(eye => {
    eye.innerHTML = renderIcon(hiding ? 'eye-off' : 'eye', 16);
    eye.classList.toggle('na', !has);
    eye.classList.toggle('hiding', hiding);
    nmApplyTip(eye, tip);
  }));
}
// 切「显示 / 隐藏 AI 更改规则」（2026-10-06）：**全局生效**（存进插件设置，所有导图共用）。
// persist=false = 宿主推来的（init / 设置页推送），别再回写给宿主（否则两边互相 ping-pong）。
function setAiRulesFull(on, persist) {
  aiRulesFullOn = !!on;
  syncAiRulesEye();
  if (persist !== false && !state.historyMode) vscode.postMessage({ type: 'saveAiRulesFull', value: aiRulesFullOn });
  if (!state.tree) return; // 树还没建（自检 / 启动阶段）：只改状态与图标
  if (state.historyMode) { renderHistoryTree(false, true); return; }
  render(); // 显 / 隐会改卡片高度 → 整棵树重排
}
function showAiMenu(anchor) {
  hideCtx(); // 2026-10-08：点工具条按钮时把节点右键菜单收掉 —— 工具条按钮都 stopPropagation，
             //   document 上那条「点别处收菜单」收不到，不主动收就会跟弹出的面板叠在一起
  if (state.historyMode) { hideAiMenu(); return; } // 历史页只读
  hideStyleMenu(); hideMoreMenu(); hideMoreSub(); // 三个面板不同时开
  const m = ensureAiMenu();
  m.classList.remove('hidden');
  syncAiMenuState();
  syncAiRulesEye(); // 小眼睛跟着全局开关（可能刚在别的视图里改过）
  placePanelNear(m, anchor, 8);
}
function hideAiMenu() { if (aiMenu) aiMenu.classList.add('hidden'); }
// 「AI」点击开合（与「＋添加」同款）：面板已开 → 收；没开 → 按按钮位置弹
function toggleAiMenu(anchor) {
  if (aiMenu && !aiMenu.classList.contains('hidden')) { hideAiMenu(); return; }
  showAiMenu(anchor);
}
function aiMenuAction(act) {
  if (act === 'aiEdit') { toggleAiInputBar(); return; }
  if (act === 'aiMark') { toggleAinodeAtFocus(); return; }
  if (act === 'aiRemark') { toggleAiremarkAtFocus(); return; } // 备注标记（2026-10-14）：附属按钮直接调，这里留一份给别的入口
  if (act === 'aiLocate') { copyAILocateAtFocus(); return; }
  if (act === 'aiRules') { editAiRulesOfSelected(); return; }
}
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
// 「这次动作作用于哪些节点」的唯一取法（2026-10-05 抽出）：多选 = 整个选中集；单选 = 当前那个；没选中 = 空。
// 凡是「给节点打属性」的动作（待办 / Now / Minor / 颜色 / AI 生成标记…）一律走这里 ——
//   多选时口径统一（整组推到同一个状态，不是每个节点各转各的），跟底部工具条那排按钮的行为对齐。
function selectedTargetNodes() {
  const ids = state.multiSelected.size > 0 ? [...state.multiSelected] : (state.selectedId ? [state.selectedId] : []);
  return ids.map(id => { const r = findNode(state.tree, id); return r ? r.node : null; }).filter(Boolean);
}
function nodeMenuAction(act, ev) { // ev：待办按钮的点击事件（要区分「裸点击 / ⌥+点击」，2026-09-20）
  hideCtx(); // 2026-10-08：点工具条按钮时把节点右键菜单收掉 —— 工具条按钮都 stopPropagation，
             //   document 上那条「点别处收菜单」收不到，不主动收就会跟弹出的面板叠在一起
  const targets = selectedTargetNodes();
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
      emitUpdate();
      checkShowNowAutoClose({ undoable: true }); // 打成已完成后：若 Now 被 hideDone 藏掉 → 自动关（2026-10-01）
      renderWithMotion(); showNodeMenu();
      return;
    }
    // 单选：沿用老语义（普通→待办 / 待办→普通 / 完成→普通；⌘ 在普通节点上 = 直接设完成）
    const node0 = targets[0];
    const mode = (cmd && (node0.todo || '') === '') ? 'alt' : 'toggle';
    const next = nextTodoState(node0.todo, mode);
    if (next === (node0.todo || '')) return;
    pushUndo();
    node0.todo = next;
    emitUpdate();
    checkShowNowAutoClose({ undoable: true }); // 打成已完成后：若 Now 被 hideDone 藏掉 → 自动关（2026-10-01）
    renderWithMotion(); showNodeMenu(); // 工具栏是独立 DOM，要单独刷按钮状态
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
    emitUpdate();
    // 设为次要后：若「只看 Now」开着且视图里再无可见 Now → 自动关 + toast（统一入口，2026-10-01 重构）
    const _nowFilterOff = (act === 'minor' && !allOn) ? checkShowNowAutoClose({ undoable: true }) : false;
    render(); showNodeMenu();
    // 隐藏 Minor：仅单选提示（多选标记多个，toast 只说一个会误导）；节点消失给可撤销提示（2026-08-24 P1）
    // ⚠️ 已经弹了"筛选项自动关闭"就别弹这条 —— toast 是**替换式**的（全局同一个容器），连弹两条只会看到最后一条
    if (!_nowFilterOff && act === 'minor' && targets.length === 1 && state.hideDone && nodeIsMinor(targets[0])) {
      toast(T('toast.hiddenMinor'), false, { label: T('common.undo'), fn: () => doUndo() });
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
    emitUpdate();
    // 取消 Now 标记后：若「只看 Now」开着且视图里再无可见 Now → 自动关 + toast（2026-10-01 重构）
    const _nowClosed = (allOn) ? checkShowNowAutoClose({ undoable: true }) : false;
    render(); showNodeMenu();
    updateNowFilterItem(); // 标记后可能影响「聚焦当前关注」菜单项的置灰/图标态
    // 「只显示当前关注 Now」视图下：把某个 Now 取消 → 该节点从画面消失，给可撤销提示（类比隐藏次要 Minor；pushUndo 已在函数开头压栈，撤销可还原）
    // ⚠️ 同上：已经弹了"筛选项自动关闭"就别弹这条（toast 是替换式的）
    if (!_nowClosed && state.showNow && targets.length === 1 && allOn) {
      toast(T('toast.hiddenNow'), false, { label: T('common.undo'), fn: () => doUndo() });
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
  const targets = selectedTargetNodes();
  if (!targets.length) return;
  if (targets.every(n => nextTodoState(n.todo, mode) === (n.todo || ''))) return; // 没变化不记撤销
  pushUndo();
  targets.forEach(n => { n.todo = nextTodoState(n.todo, mode); });
  emitUpdate(); renderWithMotion(); showNodeMenu(); // 工具栏是独立 DOM，要单独刷按钮状态
}

// 移动节点（拖拽，2026-08-22 重构：多选拖拽用 moveNodes 批量；单节点 = ids 长度 1 的特例）
// 本质=剪切+粘贴：先全部从原位置移除（保持顺序），再全部插入目标（保持顺序），只 pushUndo/emitUpdate/render 一次
function moveNodes(ids, targetId, before) {
  dbgDrag('moveNodes', 'ids=' + (ids ? ids.length : 0) + ' target=' + (targetId || 'root') + ' before=' + before); // 诊断（临时）
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
// ===== 「在这张图里长出一份副本」的**唯一**入口（2026-10-19 抽出）=====
// 右键「复制」与「⌥ + 拖拽」都走这一份，别再各写一套。规则（⌥ = 复制并拖拽，只对"文档"做特殊处理）：
//   ① 普通节点 / 附件嵌入（`![[图.png]]`）/ 捷径节点 / 导图链接 → 整棵原样克隆。
//      （附件本来就可以多处出现，拷一份不算"两个人管一份文件"；捷径节点本身就是指向别处的壳，
//        再包一层壳没有意义；导图链接同理。）
//   ② **文档节点**（管理 docs/ 里一份文档的那种）不能原样拷 —— 那会让同一份文件被两个节点管理，
//      正是用户要消灭的冲突（2026-10-19 实报：⌥ 拖拽文档节点后变成两个节点管一份）。副本里那一行
//      换成「文档捷径」：请宿主在隐藏目录 docs/ 建一个壳，节点标题改指壳（点它 = 打开原文档）。
//   ③ 建壳要写盘（异步）→ **先等回包再插入**：插入时标题已经是壳，中间不会出现"两个节点管一份"。
//      副本里没有文档节点时全程同步，路径与以前完全一样（不多一次消息）。
//   ④ 建壳失败 / 5 秒没回话 = 整个副本不生成（宁可转不转，也不能让副本指向同一份文档）。
// 参数：sources = 要复制的**原件**节点数组；insertFn(clones, hadShells) = 克隆到手后插到哪
//   （自己 pushUndo + 落位；hadShells=true 表示副本里有节点刚换成了壳 → 调用方要重问一次文档判定）。
const pendingCopies = new Map();   // 等宿主建壳的那几笔复制（id → { jobs, clones, insertFn, timer }）
function copySubtrees(sources, insertFn) {
  if (!sources || !sources.length || !insertFn) return;
  if (state.historyMode) return; // 历史页只读
  const clones = sources.map(n => cloneSubtree(n));
  const jobs = [];
  const walk = (n) => {
    const mg = nmManagedOf(n);
    if (mg && !mg.embed && mg.kind === 'doc') {
      const path = docLinkPathOf(mg.note);
      if (path) jobs.push({ node: n, note: mg.note, path: path });
    }
    (n.children || []).forEach(walk);
  };
  clones.forEach(walk);
  if (!jobs.length) { insertFn(clones, false); return; }
  const id = genId();
  const timer = setTimeout(() => {
    if (!pendingCopies.has(id)) return;
    pendingCopies.delete(id);
    toast(T('toast.copyShellFail'), true);
  }, 5000);
  pendingCopies.set(id, { jobs: jobs, clones: clones, insertFn: insertFn, timer: timer });
  vscode.postMessage({ type: 'createDoclinkShells', id: id, items: jobs.map(j => ({ path: j.path })) });
}
// 宿主回包：每个文档节点换到它的壳。任何一条失败（ok:false / 缺项）→ 整笔复制作废。
function doclinkShellsRes(msg) {
  const job = pendingCopies.get(msg && msg.id);
  if (!job) return;                                  // 已超时作废 / 不是我们发的
  pendingCopies.delete(msg.id);
  clearTimeout(job.timer);
  const links = Array.isArray(msg.links) ? msg.links : [];
  if (!msg.ok || links.length !== job.jobs.length || links.some(l => !l)) { toast(T('toast.copyShellFail'), true); return; }
  job.jobs.forEach((j, i) => { j.node.title = replaceDocLinkInTitle(j.node.title, j.note, links[i]); });
  job.insertFn(job.clones, true);
}
// 把节点标题里指向某份文档的那个链接换成另一个（副本里的文档节点 → 指向新建的壳）。
//   只换**那一个** token：前面的 `!` 与后面的 `|别名` 原样保留（别名是显示名，跟"指向谁"无关）。
function replaceDocLinkInTitle(title, oldNote, newNote) {
  const s = String(title == null ? '' : title);
  const esc = String(oldNote || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc) return s;
  const re = new RegExp('(!?)\\[\\[' + esc + '(\\|[^\\]]*)?\\]\\]');
  return s.replace(re, (m, bang, alias) => (bang || '') + '[[' + newNote + (alias || '') + ']]');
}
// ⌥ + 拖拽（2026-10-18 定）：**复制**到落点 —— 原节点一动不动，拖到哪就在哪长出一棵一样的子树。
//   落点语义与 moveNodes **完全一致**（'root' 主节点末尾 / before / after / over 成子节点），
//   区别只有一点：搬过去的是克隆，不是原件；克隆怎么建（含文档节点换捷径）全在 copySubtrees。
//   · 拖到自己的子树里 = 预览早就判 invalid（drop 里也不会调到这里），复制也照这个规矩。
function copyNodesTo(ids, targetId, before) {
  dbgDrag('copyNodesTo', 'ids=' + (ids ? ids.length : 0) + ' target=' + (targetId || 'root') + ' before=' + before); // 诊断（临时）
  if (state.historyMode) return; // 历史页只读
  if (!ids || !ids.length) return;
  const valid = ids.filter(id => {
    if (id === targetId) return false;
    if (targetId !== 'root' && isDescendant(state.tree, id, targetId)) return false; // 目标在自己子树里 → 无效（与移动同规矩）
    return true;
  });
  if (!valid.length) return;
  // 落点这一刻先粗判一次（判不过就别发消息给宿主建壳了）；真正插入时再按当时的树重判一次
  const tgt0 = (targetId === 'root') ? null : findNode(state.tree, targetId);
  if (targetId !== 'root' && (!tgt0 || (before !== undefined && !tgt0.parent))) return;
  const srcs = [];
  for (const id of valid) {
    const r = findNode(state.tree, id);
    if (r && r.node) srcs.push(r.node);
  }
  if (!srcs.length) return;
  copySubtrees(srcs, (clones, hadShells) => {
    // ⚠️ 等宿主回包期间树可能变了（用户删了目标 / 换了图）→ 插入前按当时的树重新找一遍落点
    const tgt = (targetId === 'root') ? null : findNode(state.tree, targetId);
    if (targetId !== 'root' && (!tgt || (before !== undefined && !tgt.parent))) return;
    pushUndo();
    clones.forEach(registerNowVisible);
    if (!tgt) {
      currentRoot().children.push(...clones);            // 'root'：挂到主节点末尾
    } else if (before === undefined) {
      tgt.node.children.push(...clones);                 // over：变成子节点（不自动展开，与拖拽同规矩）
    } else {
      const idx = tgt.parent.children.indexOf(tgt.node);
      if (before) tgt.parent.children.splice(idx, 0, ...clones);
      else tgt.parent.children.splice(idx + 1, 0, ...clones);
    }
    state.selectedId = clones[0].id;                     // 选中最上面那份副本，好接着操作
    state.multiSelected.clear();
    keepView(currentRoot(), new Set(clones.map(c => c.id)));
    emitUpdate(); renderWithMotion();
    updateToolbar();
    if (hadShells) requestDocLinks();                    // 副本里有刚换成壳的节点 → 立刻重判一次（否则先闪成普通双链）
  });
}
// 新建节点统一工厂（2026-08-27 体检精简：之前同一字面量复制 6 处，加字段容易漏拷——now 字段就是前车之鉴）
function makeNode(title) {
  const n = { id: genId(), title: title || '', note: '', images: [], embeds: [], fold: false, persistId: '', todo: '', children: [] };
  if (nowVisibleSnapshot) nowVisibleSnapshot.add(n.id); // 只看 Now 快照模式下：新建节点注册进快照 → 保持可见（2026-08-28「按下后自由」）
  return n;
}
// 「子文档」（2026-10-09 建；2026-10-12 改版）：在选中节点下挂一份**新建的**文档，并当场开在右侧分屏。
// 流程：画布发 `newChildDoc` → 宿主**不问名字**直接建一份（默认名「未命名」，重名顺延）→ 回 `newChildDocRes`
//   → 这里插子节点（`[[28Notes-Files/docs/名字]]`）、选中它 → 再发 `openDoc` 让宿主把它开在右侧分屏
//   → 分屏就绪后宿主回推 `docSplitOpened`，把新节点摆到左半屏正中（用户要的"点一下就到写作现场"）。
// ⚠️ 等回包期间用户可能已经换了选中节点 → **发消息前先记住母节点 id**，回包时按那个 id 找。
// ⚠️ 落盘靠 emitUpdate（新节点自己带着刚生成的标题占位，不自动进编辑态）。
let pendingChildDocParent = '';
function addChildDoc() {
  if (proGuard()) return;   // Pro 门控（2026-10-11）：子文档（文档库）；命令入口也走这里
  if (state.historyMode) return; // 历史页只读
  // ⚠️ 2026-10-09 用户明确：总开关关掉时**只隐藏「＋添加」面板里那两行 + 文件列表右键那个入口**，
  //   命令与快捷键照旧保留 —— 所以这里**不**判 docsLibraryOn（面板那一行已由 nmAddRowUsable 挡住）。
  // ⚠️ 没选中节点时的提示用 `tb.selectFirst`（"请先选择节点"）—— 原来借用的是 `toast.pasteImg`
  //   （"请先选中一个节点，再粘贴图片"），走命令/快捷键触发时那句话指着"粘贴图片"，纯误导（2026-10-12 改）。
  if (!state.selectedId) { toast(T('tb.selectFirst'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  pendingChildDocParent = state.selectedId;
  vscode.postMessage({ type: 'newChildDoc' });
}
// 把一份文档挂成某个节点的子节点 —— 「子文档」与「转入到选中节点」**共用这一套收尾**（2026-10-12 抽出）。
//   parentId 给了就挂它；**没给 = 挂到此刻选中的节点**（转入那条是宿主发起的，画布没有"母节点记忆"）。
//   返回新节点的 id；挂不上（母节点不在 / 没选中）返回 ''。
function attachDocNode(link, parentId, opts) {
  const r = parentId ? findNode(state.tree, parentId)
                     : (state.selectedId ? findNode(state.tree, state.selectedId) : null);
  if (!r) return '';
  pushUndo();
  const newNode = makeNode('[[' + String(link) + ']]');
  if (r.node.todo) newNode.todo = 'todo'; // 与 addChild 同口径：母节点是待办 → 新子节点默认也是待办
  r.node.children.push(newNode);
  r.node.fold = false;
  state.selectedId = newNode.id;
  state.justCreated.add(newNode.id);
  // 🔴 2026-10-19 用户定：**转入**那条不要锚定（`opts.noAnchor`）—— 锚定会把画面推走（母节点不动 =
  //   视口跟着新卡的布局变化平移），用户看到的还是"视图动了一下"。其余入口（子文档等）照旧锚定。
  if (!(opts && opts.noAnchor)) keepView(r.node);
  emitUpdate();
  requestDocLinks(); // 新节点是「文档节点」→ 立刻问一次判定表，别让它先闪一下普通双链
  newCardAnimMode = 'none'; // 挂成子节点：与新建子节点同一口径，新卡不做入场动画（2026-10-18）
  renderWithMotion();
  return newNode.id;
}
// 「新建副本」的回包（2026-10-19 用户定）：宿主已经在隐藏目录里复制好文件了，
//   这里在**源节点的同级、后面**插一个指向副本的文档节点（不是子节点）。
function dupDocRes(msg) {
  if (!msg || !msg.ok || !msg.link) return;
  const link = String(msg.link);
  const srcId = String(msg.nodeId || '');
  const r = srcId ? findNode(state.tree, srcId) : null;
  if (r && r.parent) {
    pushUndo();
    const n = makeNode('[[' + link + ']]');
    r.parent.children.splice(r.index + 1, 0, n);   // 同级、紧跟源节点后面
    state.selectedId = n.id;
    state.justCreated.add(n.id);
    keepView(r.parent.node);   // 锚定母节点，别让画面跳
    emitUpdate();
    requestDocLinks();
    newCardAnimMode = 'none';
    renderWithMotion();
    return;
  }
  // 兜底：源节点没了（用户刚删的）→ 按"子节点"挂，总比什么都不做强
  attachDocNode(link, '');
}
// 把某个刚建出来的节点摆到画面中央（等一帧布局落定再量；与 locateDocRefOnce 的收尾同一套）。
//   ⚠️ 分屏时画布视口就是左半屏 → 落点天然落在左半屏正中，不用另算。
// 新节点落位。onlyIfOffscreen（2026-10-19 用户定，给「转入」用）：**默认不动画面** ——
//   转入之后视图保持原样，不会"忽然跳一下"；只有新节点**跑到画面外**时才把它拉回视野
//   （那时不动用户就看不见了，等于没转）。
function locateNewNode(id, onlyIfOffscreen) {
  requestAnimationFrame(() => {
    try {
      const row = document.querySelector('.node-row[data-id="' + id + '"]');
      const el = row && row.querySelector('.card');
      if (!el) return;
      if (onlyIfOffscreen) {
        const r = el.getBoundingClientRect();
        const vp = viewMap.getBoundingClientRect();
        const inside = r.left >= vp.left && r.right <= vp.right && r.top >= vp.top && r.bottom <= vp.bottom;
        if (inside) return;                       // 已经在画面里 → 一个像素都不动
      }
      placeCardAtViewport(el, cfgNum('--locate-x', 0.5));
    } catch (_) {}
  });
}
// 宿主建完文档后的回包：插子节点 + 选中 + 摆位置。ok:false（建失败）→ 什么都不做。
//   ⚠️ 这条回包**三处共用**：「子文档」/「导入仓库文档」/「转入 → 挂到选中节点」。
//      前两条画布发起（母节点记在 pendingChildDocParent），第三条由宿主发起、走 importToNodeRes。
function addChildDocRes(msg) {
  const parentId = pendingChildDocParent;
  pendingChildDocParent = '';
  if (!msg || !msg.ok || !msg.link) return;
  if (!parentId || !findNode(state.tree, parentId)) return; // 母节点已经不在（用户删了 / 换了图）→ 安静放弃
  const id = attachDocNode(msg.link, parentId);
  if (!id) return;
  // 🔴 「子文档」那条（2026-10-12 用户定）：**位置交给宿主** —— 接着让宿主把这份新文档开在右侧分屏里，
  //   分屏一就绪宿主会回推 `docSplitOpened` → locateAfterDocSplit 把新节点摆到**左半屏正中**
  //   （那套会盯几帧宽度收敛，比这里"量一次就落"准）。所以这里**不**自己摆，免得先滑一次再被瞬移纠正。
  // 🔴 2026-10-20 用户定：「子文档」那条**不再自动开右侧分屏**（宿主回包不再带 openSplit）。
  //   下面这个 openSplit 分支保留 —— 以后若再加"建完直接看"的入口，宿主带上这个字段就能用。
  if (msg.openSplit && msg.path) {
    vscode.postMessage({ type: 'openDoc', path: String(msg.path), split: true, nodeId: id, forceLocate: true });
    return;
  }
  // 「子文档」/「导入仓库文档」共用：**默认不动画面**，只有新节点跑到视野外才把它拉回来。
  //   （2026-10-20 用户定：建完就"放在那里"，别让画面忽然跳一下。新节点本来就挂在母节点下面，
  //     母节点在视野里时它一般也在，所以多数情况一个像素都不动。）
  locateNewNode(id, true);
}
// 「转入 → 挂到当前导图的选中节点」的回包（2026-10-12 用户定）：宿主把文件搬进 docs/ 之后发过来，
//   这里把它插到**此刻选中的节点**下面。
//   🔴 用户定：「宁可转不转，都不能转错」—— 没选中节点**绝不许**随便找个地方放（更不许挂到最下面）。
//     所以这里插不上就**回一条 fail 给宿主**，让宿主把文件放回原处（等于什么都没发生）；
//     不在这里自己弹提示（消息统一由宿主出，免得用户看到两句不一样的话）。
//   ⚠️ 宿主在搬文件**之前**已经判过"有导图 + 有选中"（没有就弹窗、压根不会走到这儿）；这一层是兜底
//      —— 消息在路上时用户可能把选中清掉了，或画布刚好重载了。
function importToNodeRes(msg) {
  if (!msg || !msg.ok || !msg.link) return;
  const seq = Number(msg.seq || 0);
  // parentId 给了 = 从文件列表**拖进来**那条（2026-10-17）：挂在松手落到的那个节点下 —— 拖拽天然指定了
  //   目标，用户根本没先选节点，所以这条路与"选中"无关。没给 = 右键菜单那条 → 仍按此刻选中的节点。
  const id = attachDocNode(msg.link, String(msg.parentId || ''), { noAnchor: true });
  try {
    // nodeId 一起回去：宿主要在「撤销」时告诉画布摘掉哪一个（2026-10-17）
    vscode.postMessage(id ? { type: 'importToNodeDone', seq: seq, nodeId: id } : { type: 'importToNodeFail', seq: seq });
  } catch (_) {}
  // 🔴 2026-10-19 用户定：转入之后**视图保持不动**（不再把画面挪到新节点居中，那一下很突兀）；
  //   只有新节点落到画面外才把它拉回来（onlyIfOffscreen）。
  if (id) locateNewNode(id, true);
}
// ═══ 「⌥ + 从文件列表拖进来」= 复制进来（2026-10-19）═══
// 宿主已经在隐藏目录 docs/ 里把壳建好了，这里只负责把节点挂上。
// 与「转入」那两条的差别：**一个文件都不搬**，所以没有"挂不上就把文件放回原处"那套事务 ——
//   挂不上就回 fail，让宿主把刚建的壳删掉（等于什么都没发生）。
// ⚠️ 为什么不复用 importFolderRes 那套 entries 构建：那边的 entries 还带 media（媒体挂到 images/embeds）
//   和"母节点是待办 → 子节点也是待办"这些**搬文件才有的语义**；这边全是壳链接，复用反而要加一堆开关。
function shortcutDropRes(msg) {
  if (!msg) return;
  const seq = Number(msg.seq || 0);
  const id = (msg.ok && msg.link) ? attachDocNode(msg.link, String(msg.parentId || '')) : '';
  try { vscode.postMessage(id ? { type: 'shortcutDropDone', seq: seq, nodeId: id } : { type: 'shortcutDropFail', seq: seq }); } catch (_) {}
  if (id) locateNewNode(id);
}
function shortcutDropTreeRes(msg) {
  if (!msg) return;
  const seq = Number(msg.seq || 0);
  const id = (msg.ok && msg.tree) ? attachShortcutTree(msg.tree, String(msg.parentId || '')) : '';
  try { vscode.postMessage(id ? { type: 'shortcutDropDone', seq: seq, nodeId: id } : { type: 'shortcutDropFail', seq: seq }); } catch (_) {}
}
// 把宿主给的壳树挂到落点节点下：{ title, children } 递归，叶子 title 就是 `[[壳路径]]`。
//   文件夹自己 = 一个普通节点（名字 = 文件夹名），里面的文件 = 捷径子节点。
function attachShortcutTree(tree, parentId) {
  const r = parentId ? findNode(state.tree, parentId)
                     : (state.selectedId ? findNode(state.tree, state.selectedId) : null);
  if (!r || !tree) return '';
  const build = (t) => {
    const n = makeNode(String(t.title || T('common.untitled')));
    (t.children || []).forEach(c => n.children.push(build(c)));
    return n;
  };
  const root = build(tree);
  pushUndo();
  r.node.children.push(root);
  r.node.fold = false;
  state.selectedId = root.id;
  state.justCreated.add(root.id);
  keepView(r.node);
  emitUpdate();
  requestDocLinks();      // 树里全是 [[壳]] → 立刻问一次判定，别先闪成普通双链
  newCardAnimMode = 'none';
  renderWithMotion();
  return root.id;
}

// 「转入仓库文件夹（挂到选中节点）」的回包（2026-10-12 用户定）：宿主把整棵文件夹树搬进 docs/ 之后发过来，
//   这里照结构**插到此刻选中的节点**下面 —— 子文件夹 = 普通节点、文件 = 文档节点、媒体 = 附件。
//   🔴 媒体的口径与"建新导图"那条**一致**：那边正文里媒体就是 `![[名字]]` 子行，解析时**不建节点**、
//      只挂到上一个节点的 images/embeds 上（本层没有就挂母节点）→ 这里照做，两种入口长出来的结构才一样。
//   🔴 挂不上（没选中 / 消息到晚了）→ 回 fail 给宿主，让它把文件**整批搬回原处**（宁可转不转）。
//   ⚠️ 先把整棵子树**建好**、再一次挂上：中途抛错 = 什么都没挂上，与"文件搬回去"两边一致。
// ===== 「一步反悔」的收尾（2026-10-17 用户定）=====
// 撤销一次转出用的"刚才摘掉了什么"：token → { node, parentId, index }。
//   宿主在 exportMapDone 里带 token 过来，这里存 8 秒（= 宿主那边撤销窗口），过期就再也插不回去。
const _exportUndo = new Map();
// （撤销转入那条已在 2026-10-19 删掉：用户定「转入不给撤销按钮」，要撤回自己再拖出去。）
// 撤销转出：把 exportMapDone 时存下的那棵子树插回**原来的父节点、原来的位置**。
function undoExportNode(token) {
  const d = _exportUndo.get(String(token || ''));
  if (!d) { toast(T('toast.undoGone'), true); return; }
  _exportUndo.delete(String(token));
  const parent = d.parentId ? findNode(state.tree, d.parentId) : null;
  if (!parent || !parent.node) { toast(T('toast.undoGone'), true); return; }   // 原来的父节点没了
  pushUndo();
  const idx = Math.min(Math.max(0, Number(d.index) || 0), (parent.node.children || []).length);
  parent.node.children.splice(idx, 0, d.node);
  render(); emitUpdate();
  toast(T('toast.undoDone'));
}
function importFolderRes(msg) {
  const seq = Number((msg && msg.seq) || 0);
  const fail = () => { try { vscode.postMessage({ type: 'importFolderFail', seq: seq }); } catch (_) {} };
  try {
    if (!msg || !msg.ok || !Array.isArray(msg.tree) || !msg.tree.length) { fail(); return; }
    // parentId 给了 = 从文件列表拖进来的那个节点（2026-10-17）；没给 = ＋添加那条 → 用此刻选中的节点
    const r = msg.parentId ? findNode(state.tree, String(msg.parentId))
                           : (state.selectedId ? findNode(state.tree, state.selectedId) : null);
    if (!r) { fail(); return; }   // 兜底：消息在路上时选中被清掉了 / 落点节点被删了
    const mediaOps = [];          // { node: 上一个建好的节点 | null, parent: 母节点, name }
    let firstId = '';
    // entries → 建好的节点数组（**先不挂**）；depth0 = 是不是直接挂在选中节点下的那一层
    const build = (entries, depth0) => {
      const out = [];
      let last = null;
      for (const e of entries) {
        if (!e) continue;
        if (e.media) { mediaOps.push({ node: last, name: String(e.media) }); continue; }
        const n = makeNode(e.doc ? '[[' + String(e.doc) + ']]' : String(e.name || T('common.untitled')));
        if (depth0 && r.node.todo) n.todo = 'todo';   // 与 addChild 同口径：母节点是待办 → 直接挂上来的这层默认也是
        out.push(n);
        if (!firstId) firstId = n.id;
        last = n;
        if (Array.isArray(e.kids) && e.kids.length) {
          const kids = build(e.kids, false);
          for (const k of kids) n.children.push(k);
        }
      }
      return out;
    };
    const tops = build(msg.tree, true);
    if (!tops.length) { fail(); return; }
    pushUndo();
    for (const n of tops) r.node.children.push(n);   // 一次性挂上（先建后挂：中途抛错不至于挂一半）
    for (const m of mediaOps) {
      const target = m.node || r.node;               // 本层还没有节点 → 挂到母节点上
      if (isMediaFile(m.name)) (target.embeds = target.embeds || []).push(m.name);
      else (target.images = target.images || []).push(m.name);
    }
    r.node.fold = false;
    if (firstId) { state.selectedId = firstId; state.justCreated.add(firstId); }
    keepView(r.node);   // 锚定母节点：新东西在它下面长出来，母节点自己不许跑
    emitUpdate();
    requestDocLinks();  // 新节点里有「文档节点」→ 立刻问一次判定表，别让它先闪一下普通双链
    renderWithMotion();
    if (firstId) locateNewNode(firstId);
    try { vscode.postMessage({ type: 'importFolderDone', seq: seq }); } catch (_) {}
  } catch (e) { showError('转入仓库文件夹失败: ' + e); fail(); }
}
// 「导入仓库文档」（2026-10-09 用户定）：在选中节点下挂一份**vault 里已有的**文档（搬进数据区 docs/）。
// 与「子文档」同一套收尾：宿主弹窗挑文件 + 搬进 docs/ + 回 newChildDocRes（复用同一条回包），
// 画布这边插子节点、选中、摆到中央。**所以这里也要先记住母节点 id**（同一个变量，两处共用）。
function importRepoDoc() {
  if (proGuard()) return;   // Pro 门控（2026-10-11）：导入仓库文档（文档库）
  if (state.historyMode) return; // 历史页只读
  // 与「子文档」同款：没选中节点时用 `tb.selectFirst`（"请先选择节点"），别借 `toast.pasteImg`（2026-10-12 改）
  if (!state.selectedId) { toast(T('tb.selectFirst'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  pendingChildDocParent = state.selectedId;
  vscode.postMessage({ type: 'pickRepoDoc' });
}
// 「转入仓库文件夹」（2026-10-12 用户定）：＋添加面板那一行 —— 宿主弹窗**搜索挑文件夹**，
//   然后走与"文件列表右键文件夹"**同一套搬文件逻辑**，但收尾改成**挂到当前导图选中的节点**下
//   （不建新导图）。🔴 所以**必须先选中节点**（没选中就提示，别让宿主白搬一趟）。
function importRepoFolder() {
  if (proGuard()) return;   // Pro 门控（2026-10-11）：转入仓库文件夹（文档库）
  if (state.historyMode) return; // 历史页只读
  // 与「转入仓库文档」同款：没选中节点时用 `tb.selectFirst`（"请先选择节点"）
  if (!state.selectedId) { toast(T('tb.selectFirst'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  vscode.postMessage({ type: 'pickRepoFolder' });
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
  emitUpdate();
  newCardAnimMode = 'none'; // 新建子节点：新卡不做入场动画，直接出现（2026-10-18 用户定）；周围卡片照常平滑让位
  renderWithMotion();
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
  emitUpdate();
  newCardAnimMode = 'none'; // 新建同级：直接出现，不做入场动画（2026-10-21 用户定；与公开版 1.8.4 的观感一致）
  renderWithMotion();
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
  emitUpdate();
  newCardAnimMode = 'none'; // 新建同级：直接出现，不做入场动画（2026-10-21 用户定；与公开版 1.8.4 的观感一致）
  renderWithMotion();
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
  emitUpdate();
  newCardAnimMode = 'none'; // 新建同级：直接出现，不做入场动画（2026-10-21 用户定；与公开版 1.8.4 的观感一致）
  renderWithMotion();
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
// 「只看 Now」自动关闭的统一入口（2026-10-01 重构）。
// 判据 = hasNowInScope（不看折叠，只看 hideDone）：折叠 / 拖拽不触发，其他操作触发。
// opts.silent  = true → 不弹 toast（开屏 / 外部刷新用）
// opts.undoable = false → toast 不带撤销按钮（下钻用：撤销没意义）
// 返回 true = 确实关掉了；false = 没关（不满足条件）。
// 调用时机：各操作 handler 里 render() **之前**调一次（带 toast）；render() 内部有安全网兜底（静默）。
let showNowSaved = false; // 「只看 Now」的**用户意图**（= 存档里那份）：只在手动点按钮 / 开屏读存档时更新
function checkShowNowAutoClose(opts = {}) {
  if (state.historyMode) return false; // 沙盒里不干预
  if (!state.showNow || !state.tree) return false; // 已经关着 / 树没建好 → 无事可做
  const root = currentRoot();
  if (!root) return false;
  if (hasNowInScope(root)) return false; // 还有可见 Now → 不关
  // —— 自动关闭 ——
  setShowNow(false, false, true); // 不落盘、不重绘（调用方随后会 render）
  if (!opts.silent) {
    const action = (opts.undoable !== false)
      ? { label: T('common.undo'), fn: () => doUndo() }
      : undefined;
    toast(T('toast.nowFilterOff'), false, action);
  }
  return true;
}
// 多选删除/剪切共用：按树深度从深到浅逐个 splice（防 index 错乱）
function removeNodesDeepFirst(items) {
  items.sort((a, b) => depthOf(state.tree, b.node.id) - depthOf(state.tree, a.node.id));
  items.forEach(r => {
    const cur = findNode(state.tree, r.node.id);
    if (cur && cur.parent) cur.parent.children.splice(cur.index, 1);
  });
}
// skipDocAsk：已经问过宿主了（回答回来时传 true），这次直接走本体。
// 多选是否把「当前视图里渲染出来的每一行」都选上了（= 用户框选了画面上所有东西，2026-10-11 用户定）。
//   用 DOM 行数判：天然把被折叠 / 被隐藏的节点排除在外 —— 用户看不见的当然框不到，
//   所以他框上母节点且没漏掉任何一行时，本意就是"对这一整张图动手"。
function multiSelectedWholeView() {
  try {
    const rows = treeEl.querySelectorAll('.node-row[data-id]');
    if (!rows.length) return false;
    for (const row of rows) { if (!state.multiSelected.has(row.dataset.id)) return false; }
    return true;
  } catch (_) { return false; }
}
// 新边缘情况（2026-10-11 用户定）：画面里有很多节点，但用户框选**恰好只选中了母节点**一个 ——
//   本意同样是"把整棵树带走"。与「全选整视图」同待遇：剪切 / 删除都按 removeRootNode 走。
//   （单选主节点本来就能整棵剪切；这条只是把"框选恰好只中母节点"从无操作改成同款。）
function multiSelectedRootOnly() {
  try {
    if (state.multiSelected.size !== 1) return false;
    const root = currentRoot();
    return !!root && state.multiSelected.has(root.id);
  } catch (_) { return false; }
}
// 母节点整棵走人（剪切 / 删除 / 多选"全选整视图"共用，2026-10-11）：真主节点 → 本图进空态；
//   下钻里的母节点 → 从父节点摘掉 + 视图退回上一层 + 提示。toClipboard=true 时先写剪贴板（剪切的语义）。
function removeRootNode(toClipboard) {
  const root = currentRoot();
  if (!root) return;
  if (toClipboard) vscode.postMessage({ type: 'copyNode', text: serialize(root, 0, true).trim() });
  pushUndo();
  const r = findNode(state.tree, root.id);
  const parentId = (r && r.parent) ? r.parent.id : '';
  if (!parentId) {
    resetTreeToEmpty();               // 真主节点：整图清空 → 画面走「新建母节点」按钮
    state.selectedId = null;
    state.multiSelected.clear();
    emitUpdate(); render();
  } else {
    keepView(r.parent);               // 下钻根：锚定它爸爸再摘掉，画面跟着补
    r.parent.children.splice(r.index, 1);
    state.selectedId = null;
    state.multiSelected.clear();
    emitUpdate();
    goTo(parentId);                   // 视图退回上一层（下钻根没了，不能停在原地）
    toast(T('cut.drillRootOut'));
  }
  checkShowNowAutoClose({ undoable: true });
  updateToolbar(); updateDefaultPathBtn();
}
function deleteNode(skipDocAsk) {
  if (state.historyMode) return; // 历史页只读
  // 选中的是**文档节点** → 先问一句「要不要连这份文档一起删」（用户 2026-10-08 定）。
  // 走右键菜单那条不算（那是明确冲着"删文档"去的）；这里管的是"选中节点直接按删除键"。
  // 宿主的回答从 docNodeDeleteAnswer 回来，那时再带 skipDocAsk=true 走下面的本体。
  if (!skipDocAsk) {
    // 2026-10-09：改成「选中集里**所有**管理着文件的节点一起问一句」——
    //   多选里含被管理的文档/附件时也要问（用户实报：多选删就直接删了，没弹窗）。
    //   一次只弹一个窗，不是每个节点一个。
    let items = [];
    try { items = selectedManagedItems(); } catch (_) { items = []; }
    if (items.length) {
      // 已经问过、正等回答 → 这期间**什么都别做**（不能退化成"直接删节点"，那等于绕过询问）
      if (docNodeAskPending) return;
      docNodeAskPending = true;
      // 本地判定表里有 → 直接给路径；没有（回包还没到 / 节点刚建）→ 给**链接名**，让宿主现场解析一次。
      // 宿主解析完发现一个都不是已放入思维导图数据库的文件 → 回 'notDoc'，画布照常直接删节点（不打断）。
      vscode.postMessage({ type: 'docNodeDeleteAsk', items: items.map(it => ({ path: it.path, name: it.path ? '' : it.note })) });
      return;
    }
  }
  if (state.multiSelected.size > 0) {
    // 多选删除：只删顶层节点（祖先也在选中集的跳过，删父会连带子树）；按深度从深到浅删避免 index 错乱
    const items = [];
    state.multiSelected.forEach(id => {
      const r = findNode(state.tree, id);
      if (r && r.parent && r.node.id !== currentRoot().id && !hasAncestorSelected(id)) items.push(r);
    });
    // 「全选整视图」特例（2026-10-11 用户定）：框选覆盖了画面里每一行 → 对整张图动手，
    //   母节点也一起走（真主节点 → 空态；下钻里的 → 退回上一层）。判据见 multiSelectedWholeView。
    //   「只框中母节点」特例（2026-10-11 用户定，同批）：画面里节点再多，框选恰好只选中母节点一个
    //   → 本意同样是整棵带走。两个判据见 multiSelectedWholeView / multiSelectedRootOnly。
    if (multiSelectedWholeView() || multiSelectedRootOnly()) { removeRootNode(false); return; }
    if (!items.length) return; // 2026-08-24 修：无可删对象时不 pushUndo（之前空按 Delete 也压快照，污染撤销栈）
    let hiddenMinor = 0;
    if (state.hideDone) items.forEach(r => { hiddenMinor += countMinorDescendants(r.node); });
    pushUndo();
    keepView(items[0].parent); // 锚定母节点：删除后画面随它补，避免大块内容消失后视野里什么都不剩（2026-09-13 反馈）
    removeNodesDeepFirst(items);
    state.multiSelected.clear();
    state.selectedId = null;
    // 2026-09-20：多选删除也是整棵树的结构变化 → 走位移过渡，周围卡片平滑收拢（不动效时 renderWithMotion 直接退回 render）
    emitUpdate();
    checkShowNowAutoClose({ undoable: true }); // 删到无 Now → 自动关 + toast（2026-10-01 重构）
    renderWithMotion(); updateToolbar(); updateDefaultPathBtn();
    if (hiddenMinor > 0) toast(T('toast.hiddenAlsoDeleted', hiddenMinor), false, { label: T('common.undo'), fn: () => doUndo() });
    return;
  }
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  // 母节点删除（2026-10-11 用户定）：整棵消失，与剪切同一套收尾，只是不进剪贴板 ——
  //   真主节点 → 这张图空了（画面走「新建母节点」按钮）；下钻里的母节点 → 退回上一层 + 提示。
  //   ⚠️ 多选那条路仍然**跳过**母节点（用户定：多选里框到母节点一律不动它），只有单选才走这里。
  if (r.node.id === currentRoot().id) {
    const hiddenMinorRoot = (state.hideDone && r.node) ? countMinorDescendants(r.node) : 0;
    pushUndo();
    const parentId = r.parent ? r.parent.id : '';
    if (!parentId) {
      resetTreeToEmpty();
      state.selectedId = null;
      emitUpdate();
      render();
    } else {
      keepView(r.parent); // 下钻根：锚定它爸爸，画面跟着补，别让视野里什么都不剩
      r.parent.children.splice(r.index, 1);
      state.selectedId = null;
      emitUpdate();
      goTo(parentId);
      toast(T('cut.drillRootOut'));
    }
    checkShowNowAutoClose({ undoable: true }); // 删到无 Now → 自动关筛选 + toast
    updateToolbar(); updateDefaultPathBtn();
    if (hiddenMinorRoot > 0) toast(T('toast.hiddenAlsoDeleted', hiddenMinorRoot), false, { label: T('common.undo'), fn: () => doUndo() });
    return;
  }
  const hiddenMinor = (state.hideDone && r.node) ? countMinorDescendants(r.node) : 0;
  pushUndo();
  keepView(r.parent); // 锚定母节点：删除后画面随它补，避免大块内容消失后视野里什么都不剩（2026-09-13 反馈）
  r.parent.children.splice(r.index, 1);
  state.selectedId = null;
  emitUpdate();
  checkShowNowAutoClose({ undoable: true }); // 删到无 Now → 自动关 + toast（2026-10-01 重构）
  renderWithMotion(); updateToolbar(); updateDefaultPathBtn(); // 同上：删完周围卡片平滑收拢
  if (hiddenMinor > 0) toast(T('toast.hiddenAlsoDeleted', hiddenMinor), false, { label: T('common.undo'), fn: () => doUndo() });
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
  const newNode = makeNode('[[' + target + ']]'); // 链接就是正文那一行（2026-09-29 起不再有独立链接字段）
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
  const newNode = makeNode('[' + name + '](file://' + path + ')'); // url 保留原末尾斜杠（文件夹 URL 需要）
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
  const newNode = makeNode('[' + urlRootDisplay(u) + '](' + u + ')');
  r.node.children.push(newNode);
  r.node.fold = false;
  state.selectedId = newNode.id;
  emitUpdate(); render(); updateToolbar();
}

// 「刚新建的节点」占位标题的清除（🔴 2026-10-12 用户定）：新建节点后直接粘一张图 → 节点里只留图片、
//   不留那句占位「新节点」（原来粘完还得手动把占位三个字删掉）。
//   ⚠️ 原理 —— 判据**必须两条同时成立**，少一条都可能误伤（用户点名怕出"小 bug"）：
//     ① 节点在 `state.justCreated` 里：这是"**刚建出来、还没正式命名**"的专用标记（新建即进；
//        用户改过字、或按回车确认过占位原文，都会被清掉，见 editSession 的 onFinish 与 cancelNewNode）；
//     ② 标题**正好等于**占位文案 `T('common.newNode')`。
//   → 老节点（不在 justCreated 里）**哪怕标题恰好就叫「新节点」也一个字不动** ——
//     所以"在别的节点里全选文字再粘图片把字冲掉"这种事不可能发生：那条路径压根判不过第 ① 条。
//   → 正在编辑这个刚建节点时粘图：这里只改 node.title，编辑框里的占位由随后的 render→收尾
//     （onFinish 的"没改"分支会 setTitleInner 按 node.title 重画）一并落定，不会把占位写回去。
//   只碰标题，备注 / 附件 / 待办一律不碰。返回 true = 确实清了（给自检用）。
function clearFreshPlaceholderTitle(id) {
  if (!id) return false;
  try {
    if (!state.justCreated.has(id)) return false;                          // ① 不是"刚新建" → 一律不动
    const r = findNode(state.tree, id);
    if (!r) return false;
    if (String(r.node.title || '') !== T('common.newNode')) return false;   // ② 标题不是占位 → 一律不动
    r.node.title = '';
    return true;
  } catch (_) { return false; }
}
// 粘贴图片文本 `![](路径)` → 加到选中节点（可多张）
function addImageToNode(relPath) {
  if (!relPath) return;
  if (!state.selectedId) { toast(T('toast.pasteImg'), true); return; }
  const r = findNode(state.tree, state.selectedId);
  if (!r) return; // 树刚被重建、id 失效的极端时序防崩（2026-08-27 体检修）
  pushUndo();
  r.node.images.push(relPath);
  r.node.ainode = ainodeAfterEdit(r.node.ainode); // 加了图片 = 节点内容被人动过 → AI 节点降为混合（2026-10-14）
  clearFreshPlaceholderTitle(r.node.id); // 刚新建的空节点 → 顺手把占位「新节点」清掉（2026-10-12）
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
  r.node.ainode = ainodeAfterEdit(r.node.ainode); // 加了图片/音视频 = 节点内容被人动过 → AI 节点降为混合（2026-10-14）
  clearFreshPlaceholderTitle(r.node.id); // 刚新建的空节点 → 顺手把占位「新节点」清掉（2026-10-12）
  emitUpdate(); render();
}

// ============ 「AI 编辑」（2026-09-18 加，2026-09-27 抽成公共函数）============
// 右键「复制 AI 定位」的可视化形态：拼好定位文本交给宿主弹窗（弹窗里「复制并关闭」）。
// 入口两处：节点「更多」面板的 aiEdit 项、左下工具栏的 AI 按钮（2026-09-27 新增）。
// opts（2026-09-28 加，AI 输入条用）：{ userText: 框里写的指令, importUrl: 导入的 AI 网页回答链接 }
//   传了就按它们改写定位文案的第 2 / 5 条（见 buildAiEditText）；不传 = 老行为（右键那份固定文案）。
function openAiEditOfSelected(opts) {
  if (state.historyMode) return;
  const o = opts || {};
  const hit = state.selectedId ? findNode(state.tree, state.selectedId) : null;
  // 没选中节点 → 默认把「主节点」当作目标（与定位菜单里的主节点同一判定 = currentRoot()），
  // 不再弹「请先选择节点」（2026-09-27 用户定：点了就当选中了母节点）
  const node = (hit && hit.node) || currentRoot();
  if (!node) { toast(T('tb.selectFirst'), true); return; } // 兜底：连主节点都没有（无数据）
  if (!node.persistId) { node.persistId = genPersistId(); pushUndo(); emitUpdate(); } // 懒分配持久 ID（与右键同源）
  const p = state.filePath || (state.currentFilename || T('common.untitled'));
  autoSnapshotBeforeAi(); // 先把当前内容存一份快照（文案里会注明「已自动备份」，外部 AI 不必再跑 snapshot.py）
  const text = buildAiEditText(p, node.persistId, o.userText, o.importUrl); // 与右键那份同源（见下）
  vscodeApi.postMessage({ type: 'openAiEdit', text });
}
// 拼「AI 编辑」弹窗里的定位文案（2026-09-28 拆句版，中英各一套在 i18n）：
//   框里写了指令        → 第 5 条 =「5.用户指令：<框里的字>」
//   导入了网页回答链接  → 第 2 条追加「以及梳理 AI 网页回答的方式」；
//                        第 5 条 =「5.用户指令：梳理 AI 网页回答，网页链接：<链接>；具体指令：<框里的字>」
//                        （框里没写字就省略「具体指令」那半句）
//   都没有              → 与原来完全一样（第 5 条「基于用户指令开始编辑」）
// ⚠️ 右键「复制 AI 定位路径」不走这里，仍用整句 aiLocate.node —— 那条行为不变。
function buildAiEditText(p, id, userText, importUrl) {
  const u = String(userText || '').trim();
  const url = String(importUrl || '').trim();
  const head = T('aiLocate.nodeHead', p, url ? T('aiLocate.ruleSuffixImport') : '', id);
  const ask = url
    ? (u ? T('aiLocate.askImport', url, u) : T('aiLocate.askImportNoText', url))
    : (u ? T('aiLocate.ask', u) : T('aiLocate.askDefault'));
  return head + ask;
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
  if (act === 'childDoc') { addChildDoc(); return; }   // 子文档（2026-10-09）：新建一份文档并挂到选中节点下
  if (act === 'importDoc') { importRepoDoc(); return; } // 导入仓库文档（2026-10-09）：从 vault 里挑一份已有文档并挂到选中节点下
  if (act === 'importFolder') { importRepoFolder(); return; } // 转入仓库文件夹（2026-10-12）：粘文件夹绝对路径 → 整棵转入 + 建新导图
  if (act === 'url') { addUrlLink(); return; }
  // 「AI 编辑」（2026-09-18 加，2026-09-27 抽成函数：左下工具栏的 AI 按钮也走它）
  if (act === 'aiEdit') { openAiEditOfSelected(); return; }
  // 节点级操作（与左下「更多」里那三项同一个函数，行为完全一致）
  if (act === 'addChild') { addChild(); return; }
  if (act === 'addSibling') { addSibling(); return; }
  // 备注（2026-09-27 从节点工具栏第二个按钮挪进来）：与原来那颗按钮走同一个函数，行为不变
  if (act === 'note') { editNoteOfSelected(); return; }
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
  }, undefined, {
    // 左下角那颗「从本机选择」（2026-10-07 用户定）：拉起系统文件选择器 → 选完自动填好并确认
    label: T('more.pickLocal'),
    onClick: pickLocalFileIntoPrompt,
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
//   ⚠️ 复制只带**画面上看得见的部分**（2026-10-07 用户定：所见即所得 —— 被「隐藏 Minor/Done」/「只看 Now」
//      藏起来的子节点不进剪贴板）；剪切相反，整棵带走（随后要删节点，不能把藏起来的部分丢了）。
// 拷贝节点树进剪贴板（2026-10-19 加 plain 档）：
//   plain=false（默认）= 带格式：行尾注释（id / fold / color / minor / now / AI 标记）一并带上，
//     粘回本插件能还原成一模一样的节点。
//   plain=true = **清除格式**：行尾那截 `<!--…-->` 全部去掉，其余照旧（待办 `- [ ]`、加粗、代码块、
//     备注、缩进层级都保留）。用途：粘到聊天窗口 / 别的笔记里，不带着一堆 `<!--now:1-->` 这种噪音。
//   ⚠️ 两条路都**只带画面上看得见的子节点**（2026-10-07 定：所见即所得，判据在 serialize 里）。
function copySelectedNode(plain, showTip) {
  // 弹一句「已拷贝 / 已拷贝清除格式版本」（2026-10-19 定）：拷贝是"没有画面变化"的操作，
  //   不给反馈用户不知道到底拷没拷上（尤其是 ⌥⌘C 这种新键）。
  // 🔴 2026-10-20 用户定：**只有从右键菜单 / 节点工具条点「拷贝」时才弹** ——
  //   平时 ⌘C 这类普通复制每按一次都弹一句太烦（用户原话："我平时只是普通的拷贝剪切乱七八糟的，他不要给我弹"）。
  //   → 加 showTip 开关，**默认不弹**；菜单/工具条那两个调用点显式传 true。
  const doneTip = () => { if (showTip) toast(T(plain ? 'toast.copiedPlain' : 'toast.copied')); };
  if (state.selectedImg) {
    vscode.postMessage({ type: 'copyImage', text: '![[' + state.selectedImg.path + ']]' });
    doneTip();
    return;
  }
  if (state.multiSelected.size > 0) {
    // 多选复制：只复制「顶层节点」（祖先也在选中集的跳过——父的子树已完整包含它，不重复）
    // 例：框选主节点+它的2个子节点 → 只复制主节点（含全部子节点）；框选父节点+父的同级 → 两个都复制（2026-08-21 定）
    // 2026-10-07（用户定）：**只复制画面上看得见的部分** —— 被「隐藏 Minor/Done」或「只看 Now」藏起来的子节点不进剪贴板。
    //   判据统一由 serialize 内部的 childVisible 给（与渲染同源）；2026-08-25 那条"隐藏完成下只复制未隐藏部分"是它的前身。
    const parts = [];
    state.multiSelected.forEach(id => {
      if (hasAncestorSelected(id)) return;
      const r = findNode(state.tree, id);
      if (r) parts.push(serialize(r.node, 0, true, true, undefined, !!plain).trim());
    });
    if (parts.length) { vscode.postMessage({ type: 'copyNode', text: parts.join('\n') }); doneTip(); return; }
  }
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r) return;
  // 单选复制：同样只带看得见的部分（2026-10-07 用户定，见 serialize 的 onlyVisible）
  vscode.postMessage({ type: 'copyNode', text: serialize(r.node, 0, true, true, undefined, !!plain).trim() });
  doneTip();
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
  r.node.ainode = ainodeAfterEdit(r.node.ainode); // 删了图片/音视频 = 节点内容被人动过 → AI 节点降为混合（2026-10-14）
  state.selectedImg = null;
  emitUpdate(); render();
}
// ===== 「复制」= 建节点树副本（2026-10-18 定）=====
// 右键「基础操作 → 复制」与「⌥ + 拖拽」共用这一套：**原节点一动不动**，另外长出一棵一样的子树。
// 与「拷贝」的区别：拷贝是进剪贴板（系统剪贴板 + 序列化文本），复制是直接在这张图里长出节点。
// ⚠️ 文档节点怎么处理**不在这里**：这里只管克隆，换捷径那一步在 copySubtrees（2026-10-19）。
// 深拷贝一棵节点子树 —— 全项目**唯一**一份（2026-10-19 合并了原来的两套）。
//   旧的两套：cloneNodeDeep（动态拷全部键）与 cloneNode（手写字段清单）。手写那份每加一个节点属性就得
//   补一行，漏一次就丢属性（历史上 color / bold / minor / now / todo / aiRules / ainode 都漏过）。
//   现在只留动态那一套：**所有键都拷**（含 `now` —— 2026-10-19 定：不再分"粘贴带、复制不带"，
//   两边一致；副本本来就被登记进 Now 可见快照，再不带徽标才别扭），数组浅拷一层（别跟原件共享引用），
//   只重建三样 —— children 递归重建；id 重新生成；persistId 清空
//   （它是写进正文注释的「文件里的节点身份」，撞了会让定位 / 墓碑 / 导航历史全乱）。
//   ⚠️ id 必须换新的：两个节点共用同一个 id，节点链接（`[[文件#pid]]`）就会指错人。
function cloneSubtree(node) {
  const c = {};
  Object.keys(node || {}).forEach(k => {
    if (k === 'children' || k === 'id' || k === 'persistId') return;
    const v = node[k];
    c[k] = Array.isArray(v) ? v.slice() : v;
  });
  c.id = genId();
  c.persistId = '';
  c.children = (node.children || []).map(ch => cloneSubtree(ch));
  return c;
}
// 把整棵新子树登记进「只看 Now」的可见快照（否则在 Now 视图下新建的副本会当场被筛掉看不见）
function registerNowVisible(n) {
  if (!nowVisibleSnapshot || !n) return;
  (function reg(x) { nowVisibleSnapshot.add(x.id); (x.children || []).forEach(reg); })(n);
}
// 右键「复制」：副本插在选中节点**后面**（同级）。**母节点一律不能复制**（2026-10-19 扩到所有视图）：
//   除了真主节点（没有同级），**下钻视图里的母节点**也不行 —— 它虽然在整棵树里有父节点，但那一层
//   当前看不见，副本会插到画面外（用户以为没反应，其实悄悄多了一个）。判据 = 是不是当前视图的根。
function duplicateNode() {
  if (state.historyMode) return; // 历史页只读
  if (!state.selectedId) return;
  const r = findNode(state.tree, state.selectedId);
  if (!r || !r.parent) return;   // 母节点没有同级（菜单里那一项已置灰）
  if (r.node.id === currentRoot().id) return; // 下钻视图的母节点：同样不给复制（2026-10-19）
  const parentId = r.parent.id;
  const srcId = r.node.id;
  copySubtrees([r.node], (clones, hadShells) => {
    const p = findNode(state.tree, parentId);
    const src = findNode(state.tree, srcId);
    if (!p || !src) return;      // 等回包期间结构变了 → 放弃（不插到别处去）
    pushUndo();
    const copy = clones[0];
    p.node.children.splice(src.index + 1, 0, copy);
    registerNowVisible(copy);
    state.selectedId = copy.id;
    state.multiSelected.clear();
    keepView(p.node);            // 锚定这一层容器（同级插入会让它重新居中）
    emitUpdate();
    newCardAnimMode = 'none';    // 与「新建同级」同一口径：直接出现（2026-10-21）
    renderWithMotion();
    updateToolbar();
    requestAnimationFrame(() => ensureNewCardAboveToolbar(copy.id)); // 别被底部工具条盖住
    if (hadShells) requestDocLinks();   // 副本里有刚换成壳的节点 → 立刻重判一次（否则先闪成普通双链）
  });
}
function cutSelectedNode(showTip) {
  // 同上（2026-10-20）：剪切那句「已剪切」也只在**点菜单/工具条**时弹，快捷键不弹。
  const tipCut = () => { if (showTip) toast(T('toast.cut')); };
  if (state.historyMode) return; // 历史页只读：禁止剪切
  if (state.selectedImg) {
    removeSelectedImage(true); // 剪切图片：复制 + 从节点移除该图
    tipCut();     // 2026-10-19：剪切后弹一句（没有画面变化时用户不知道拷没拷上）
    return;
  }
  if (state.multiSelected.size > 0) {
    // 「全选整视图」特例（2026-10-11 用户定）：框选把画面里每一行都选上了 → 用户本意就是对
    //   这一整张图动手（典型场景：画面里只剩母节点一个）→ 母节点也一起走（含真主节点进空态）。
    //   「只框中母节点」特例（2026-10-11 用户定，同批）：节点再多、框选恰好只选中母节点 → 同款整棵带走。
    if (multiSelectedWholeView() || multiSelectedRootOnly()) { removeRootNode(true); return; }
    // 剪切多选：复制顶层节点（祖先在选中集的跳过），然后删除（同样只删顶层，按深度反序）
    const parts = [];
    const items = [];
    state.multiSelected.forEach(id => {
      if (hasAncestorSelected(id)) return;
      const r = findNode(state.tree, id);
      if (r && r.parent) items.push(r);
    });
    if (!items.length) return;
    // ⚠️ 剪切**故意不过滤**（与复制的「所见即所得」不同，2026-10-07 定）：剪切随后会把整个节点删掉，
    //    剪贴板若只带看得见的部分，被藏起来的子节点就**永久丢了** —— 宁可粘出完整结构，也不能静默丢数据。
    items.forEach(r => parts.push(serialize(r.node, 0, true).trim()));
    vscode.postMessage({ type: 'copyNode', text: parts.join('\n') });
    tipCut();   // 2026-10-19：剪切后弹一句
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
  if (!r) return; // ⚠️ 只判 !r —— 真主节点没有 parent，判 !r.parent 会在这里提前 return（2026-10-11 用户实报「母节点剪切没反应」就死在这）
  // 母节点剪切（2026-10-11 用户定）：跟普通节点一样**整棵带走**，区别只在"带走之后画面去哪" ——
  //   ① 真主节点（没下钻）→ 这张图空了，画面走「新建母节点」按钮；
  //   ② 下钻里的母节点 → 正常从父节点摘掉，视图退回上一层并弹一条提示（画面忽然变了要说一声）。
  if (r.node.id === currentRoot().id) {
    vscode.postMessage({ type: 'copyNode', text: serialize(r.node, 0, true).trim() });
    pushUndo();
    const parentId = r.parent ? r.parent.id : '';
    if (!parentId) {
      resetTreeToEmpty();                       // 真主节点：整棵走光，本图进入空态
      state.selectedId = null;
      emitUpdate(); render(); updateToolbar(); updateDefaultPathBtn();
      tipCut();                    // 2026-10-19：剪切后弹一句
    } else {
      r.parent.children.splice(r.index, 1);
      state.selectedId = null;
      emitUpdate();
      goTo(parentId);                           // 下钻根没了 → 退回它爸爸那一层
      toast(T('cut.drillRootOut'));
      updateToolbar(); updateDefaultPathBtn();
    }
    return;
  }
  // ⚠️ 同上面多选剪切：剪切不过滤（整棵带走，别让隐藏部分永久丢）
  vscode.postMessage({ type: 'copyNode', text: serialize(r.node, 0, true).trim() });
  pushUndo();
  keepView(r.parent); // 与删除同款：锚定母节点（2026-09-13）
  r.parent.children.splice(r.index, 1);
  state.selectedId = null;
  emitUpdate(); renderWithMotion(); updateToolbar(); updateDefaultPathBtn(); // 剪切 = 复制 + 删除：与删除同款收拢动画
  tipCut();   // 2026-10-19：剪切后弹一句
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
  // 与 parse 同一套换行归一（2026-09-29）：CRLF 文本在这里切块才不会把 \r 带进块里
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
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
    // 2026-10-11：`sub.link` 是 2026-09-29「链接并入正文」后就不存在的死字段（恒空），换 aiRules ——
    //   只挂着 AI 更改规则块的节点也算有内容，别让它的块在粘贴时被整块跳过。
    const hasContent = sub.title || sub.note || (sub.images && sub.images.length) || sub.aiRules || (sub.children && sub.children.length);
    if (!hasContent) return;
    const clone = cloneSubtree(sub); // 深拷贝：刷新 id、清空 persistId（副本独立，将来被复制链接再分配）
    registerNowVisible(clone); // 与旧 cloneNode 一致：粘贴的整棵子树都登记进「只看 Now」的可见快照
    r.node.children.push(clone);
    last = clone;
  });
  if (!last) return;
  r.node.fold = false;
  state.selectedId = last.id;
  keepView(r.node); // 同上：锚定挂靠的母节点（粘贴整棵子树同样适用）
  emitUpdate(); renderWithMotion();
}
// （原来的 cloneNode 手写字段版已在 2026-10-19 合并进 cloneSubtree —— 见那一处注释）

// ============ 右键菜单（节点 → 复制/剪切/复制链接；图片 → 复制图片） ============
let ctxMenu = null;
// 右键菜单的两个边界值（2026-10-07 加）：
//   CTX_EDGE_GAP     = 菜单贴边时收回画面内留的缝（与二级菜单 showCtxSub 用的同一个 6px）
//   CTX_TIP_FLIP_GAP = 菜单右边距画面右边不足这么多 → 菜单行的黑色小提示改往左弹
//                      （提示宽度随文案变，取一个够放一条中等长度提示的值；嫌翻得太早/太晚就改这里）
const CTX_EDGE_GAP = 6;
const CTX_TIP_FLIP_GAP = 240;
// 右键菜单的**下边界**（2026-10-12 用户定：「右键菜单要浮在底部那排菜单上面」）：
//   底部那条节点工具条（#node-menu，fixed bottom）显示着时 → 菜单一律排在它的**上沿**之上（留一道 CTX_EDGE_GAP）；
//   它没显示（没选中节点 / 历史页）→ 用画面底边（老行为）。
//   ⚠️ 只是**尽量**：菜单比"工具条上沿到画面顶"还高时（条目特别多）塞不回去 → 退回老口径（贴画面底边收），
//      那种情况靠 .ctx-menu 的 z-index(89) 保证它**盖住**工具条，而不是被工具条盖住。
function ctxBottomLimit() {
  let limit = window.innerHeight - CTX_EDGE_GAP;
  try {
    const menu = document.getElementById('node-menu');
    if (menu && !menu.classList.contains('hidden')) {
      const mr = menu.getBoundingClientRect();
      if (mr.height > 0) limit = Math.min(limit, mr.top - CTX_EDGE_GAP);
    }
  } catch (_) {}
  return limit;
}
function hideCtx() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } hideCtxSub(); } // 主菜单收掉时二级一起收
// 右键行（2026-09-21 加 kbd = 右侧快捷键提示，形态与左下「更多」菜单里的 .kbd 一致）
// na = 置灰（2026-09-23：剪贴板空时的「粘贴」）。⚠️ 置灰**只管视觉**：点了照样走 fn ——
//   那里面会弹一句明确的提示（"剪贴板里没有可粘贴的内容"），比点了什么都不发生强。
function ctxItem(label, fn, icon, tip, kbd, na) {
  const it = document.createElement('div');
  it.className = 'ctx-item' + (na ? ' ctx-na' : '');
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
  if (tip) { nmSetTipParts(it, tip); it.setAttribute('data-side', 'right'); }
  // 2026-09-21 用户实报：鼠标从「基础操作」滑到下面**带黑字提示**的行时，那个黑框会和仍开着的二级面板叠在一起。
  // 修法与底部工具条那排按钮同款（那边是 mouseenter 里 hideStyleMenu/hideMoreMenu）：**碰到任何非二级面板内的行，
  // 立刻把二级收掉**（不等 200ms 延时 —— 延时是给「父项 → 面板」那条缝留的，这里是要立刻消失）。
  it.addEventListener('mouseenter', () => { if (ctxSub && !ctxSub.contains(it)) hideCtxSub(); });
  // 把事件传出去：右键「待办」那行要区分「裸点击 / {Mod}+点击」（2026-09-23），与底部按钮同款
  it.onclick = (e) => { fn(e); hideCtx(); };
  return it;
}
function ctxSep() { const s = document.createElement('div'); s.className = 'ctx-sep'; return s; }
// 把 AI 那四项渲染成**右键菜单行**（与底部 AI 面板共用 NM_AI_ITEMS —— 见那里的说明）。
//   · 图标：同一个 renderIcon(it.icon, 16)，与面板那行**是同一只图标**；
//   · 动作：同一个 aiMenuAction(it.act)；
//   · 小眼睛：同一个 setAiRulesFull / anyAiRulesInView，外观由 .ctx-eye 那几条 CSS 对齐 .mm-eye。
function ctxAiGroup(menu) {
  // 🔴 2026-10-08 用户定：「AI 功能」总开关关掉时，这一组**整段不出现** —— 连它前面那根分隔线也不画
  //   （用户原话："我关掉的时候连右键菜单那几项也一起藏……右键菜单它不是有个分隔线吗，记得也帮我藏一下"）。
  //   所以分隔线由本函数自己负责画（原来在 buildCtxMenu 里），开关关着时两样一起消失。
  if (!aiFeaturesOn) return;
  menu.appendChild(ctxSep());
  NM_AI_ITEMS.forEach(it => {
    // 2026-10-08 用户定：右键里这组**不要中间那根分隔线**（"复制 AI 定位路径"与"添加 AI 生成标记"
    //   之间那根）—— 四项连着排；底部 AI 面板那边保留分隔线（同一份定义、外观各自取舍）。
    if (it.sep) return;
    // 右键里先屏蔽的那两项（见 NM_AI_CTX_SKIP 的说明）
    if (NM_AI_CTX_SKIP[it.act]) return;
    const item = ctxItem(it.label(), () => aiMenuAction(it.act), it.icon);
    item.dataset.act = it.act;      // 同步态（aiMark 三态 / 小眼睛）靠它认行
    nmApplyTip(item, it.tip(), it.tipAct);
    item.dataset.side = 'right';    // 右键菜单在鼠标处 → 提示往右弹（与同菜单其它行一致）
    if (NM_AI_GATED[it.act]) applyProGate(item);
    if (!it.eye) { menu.appendChild(item); return; }
    // 「添加 AI 更改规则」那行 + 左边的小眼睛：与底部那只**同一个按钮、同一套三态**
    //（置灰 .na / 已隐藏 .hiding 紫+闭眼 / 悬停本行才露），见 syncAiRulesEye。
    // 🔴 2026-10-08 用户实报：眼睛的黑字与**行自己的**黑字**重合**（看不清楚）。
    //    根因 = 提示的显示规则是 `[data-tip]:hover > .nm-tip`（**直接子节点**）：眼睛嵌在 .ctx-item 里时，
    //    悬停眼睛会让 .ctx-item 也处于 :hover → 行的提示与眼睛的提示**一起弹出来**。
    //    底部 AI 面板正是靠「眼睛与行**并列**」避免的（`.mm-row > .mm` + `.mm-row > .mm-eye`）→ 这里照做：
    //    外面包一层 .ctx-airow，行与眼睛**并列**（悬停眼睛时行不再是 :hover）。⚠️ 别改回嵌进去。
    const row = document.createElement('div');
    row.className = 'ctx-airow';
    row.appendChild(item);
    const eye = document.createElement('button');
    eye.className = 'ctx-eye';
    eye.dataset.act = it.eye;
    // 提示往右弹（2026-10-08 用户定：原来没设 → 默认弹在**上方**，把菜单盖住了）。
    //   ⚠️ 菜单贴着屏幕右边时，buildCtxMenu 末尾那段会把本菜单里所有 [data-side] 统一翻成 'left' ——
    //      所以这里只要给出"右"，贴边那条路自动兜住。
    eye.dataset.side = 'right';
    eye.innerHTML = renderIcon('eye', 16); // 16px = 与行图标同尺寸，换上去才是"图标变成了眼睛"
    eye.addEventListener('mousedown', e => { if (state.editingEl) e.preventDefault(); });
    eye.onclick = e => {
      e.stopPropagation(); e.preventDefault();
      if (!anyAiRulesInView()) return; // 置灰档（画面里没规则）点了不响应 —— 与底部那只同一条规矩
      setAiRulesFull(!aiRulesFullOn, true);
    };
    row.appendChild(eye);
    menu.appendChild(row);
  });
}
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
  items.forEach(s => {
    // na / naTip 都可以是函数：剪贴板探测是异步的、选中状态也会变，菜单项数组在建菜单那一刻就写好了，
    // 置灰与说明都得在**展开时**现判
    const naNow = typeof s.na === 'function' ? !!s.na() : !!s.na;
    const naTipNow = typeof s.naTip === 'function' ? (s.naTip() || '') : (s.naTip || '');
    const it = ctxItem(s.label, s.fn, s.icon, s.tip || '', s.kbd || '', naNow);
    if (s.act) it.dataset.act = s.act; // 供事后按名字找到这一行（剪贴板探测回来要改「粘贴」的置灰态）
    // 置灰时换一句说明（「为什么点不了」要看得见，只变灰不给理由用户还是会去点）
    if (naNow && naTipNow) { nmSetTipParts(it, naTipNow); it.setAttribute('data-side', 'right'); }
    ctxSub.appendChild(it);
  });
  ctxSub.addEventListener('mouseenter', cancelHideCtxSub); // 鼠标进面板 → 别收
  ctxSub.addEventListener('mouseleave', scheduleHideCtxSub); // 移走 → 排一次收起
  document.body.appendChild(ctxSub);
  const ar = anchor.getBoundingClientRect();
  let left = ar.right + 2;
  if (left + ctxSub.offsetWidth > window.innerWidth - 6) left = Math.max(6, ar.left - ctxSub.offsetWidth - 2);
  // 竖直：与主菜单同款（2026-10-12）—— 先试「排到底部工具条上沿之上」，塞不进再退回贴画面底边。
  //   主菜单已经让开了工具条，但二级是从**父项**那一行往下长的，父项可能就贴在菜单底部 → 二级照样会探到工具条里。
  const keepOut = ctxBottomLimit();
  let top = Math.min(ar.top - 4, keepOut - ctxSub.offsetHeight);
  if (top < 6) top = Math.max(6, Math.min(ar.top - 4, window.innerHeight - 6 - ctxSub.offsetHeight));
  ctxSub.style.left = left + 'px';
  ctxSub.style.top = top + 'px';
  // 二级菜单也贴着右边 → 它条目的提示同样改往左弹（2026-10-07，与主菜单同一条判据）
  if (window.innerWidth - (left + ctxSub.offsetWidth) < CTX_TIP_FLIP_GAP) {
    ctxSub.querySelectorAll('[data-side]').forEach(el => { el.dataset.side = 'left'; });
  }
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
// —— 剪贴板探测（2026-09-23）：右键「基础操作 → 粘贴」在剪贴板空的时候**置灰** ——
// 起因：剪贴板空时点「粘贴」只弹一句提示，用户分不清是功能坏了还是自己没复制（实报「粘贴了没反应」）。
// ⚠️ 只用来提示、**不拦功能**：navigator.clipboard.readText() 在 iframe 里可能被拒（文档没焦点 / 权限策略），
//    读不到时一律按「有内容」处理 —— 宁可显示成能用，也不能把能用的入口置灰。
let nmClipEmpty = null;   // null=没读到（当作有）/ true=剪贴板是空的 / false=有内容
let nmClipProbing = false;
function probeClipboard(cb) {
  if (!(navigator.clipboard && navigator.clipboard.readText)) return; // 浏览器压根不给读 → 不置灰
  if (nmClipProbing) { if (cb) cb(); return; }
  nmClipProbing = true;
  navigator.clipboard.readText().then((t) => {
    nmClipEmpty = !(t && t.trim());
  }).catch(() => {
    nmClipEmpty = null; // 读不到 ≠ 空（可能是权限/焦点问题）→ 别置灰
  }).then(() => { nmClipProbing = false; if (cb) cb(); });
}
// 「粘贴」什么时候置灰、置灰时说什么（2026-09-23）：
//   ① 剪贴板是空的；② **多选状态** —— 粘贴是「粘到某一个节点下面」的单节点操作，多选时说不清粘给谁
//     （框选那类多选连锚点都没有，粘下去只会弹「请先选中一个节点」；⌘ 多选虽然有锚点，
//      但"粘到三个选中里的某一个"也说不清是哪一个 → 一律按不可用处理，与「多选时隐藏备注按钮」同理）。
function pasteRowNa() { return nmClipEmpty === true || state.multiSelected.size > 0; }
function pasteRowNaTip() { return state.multiSelected.size > 0 ? T('ctx.pasteMultiTip') : T('ctx.pasteEmptyTip'); }
// 从剪贴板读文本粘贴（2026-09-21：右键「粘贴」用 —— 浏览器不允许脚本伪造 paste 事件，只能直接读剪贴板）
function pasteFromClipboard() {
  if (state.historyMode) return;
  if (state.multiSelected.size > 0) { toast(T('ctx.pasteMultiTip')); return; } // 置灰只是提示，真点下来也要说清楚
  if (!(navigator.clipboard && navigator.clipboard.readText)) { toast(T('ctx.pasteUseKey')); return; }
  navigator.clipboard.readText().then((t) => {
    // 2026-09-23：空的、和「粘不动」是两回事 —— 原来两种都弹「请先选中一个节点」，指着错的方向
    if (!(t && t.trim())) { nmClipEmpty = true; toast(T('toast.pasteEmpty')); return; }
    nmClipEmpty = false;
    if (!applyPastedText(t)) toast(T('toast.pasteFirst'));
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
  toast(T('toast.nodeLinkCopied')); // 右键菜单与命令共用本函数，弹一次两边都覆盖（2026-09-22 用户定）
}
function copyAILocateOf(node) {
  // 文案 = i18n 的 'aiLocate.node'（跟着界面语言走）；同时懒注入 ai:/aiLocate: 进文件 frontmatter
  ensurePersistId(node);
  const p = state.filePath || (state.currentFilename || T('common.untitled'));
  autoSnapshotBeforeAi(); // 先把当前内容存一份快照（文案里会注明「已自动备份」，外部 AI 不必再跑 snapshot.py）
  vscode.postMessage({ type: 'copyLink', text: T('aiLocate.node', p, node.persistId, state.aiScriptPath || '') });
  vscode.postMessage({ type: 'ensureAiLocate' });
  toast(T('toast.aiLocateCopied'));
}
// 「复制 AI 定位路径」的落点（2026-10-05）：选中了就用选中那个，**没选中就用当前主节点** ——
//   与「AI 编辑」的落点口径一致（左下角那颗按钮没选中时也是对主节点生效），两条入口行为不能分叉。
function copyAILocateAtFocus() {
  if (proGuard()) return;   // Pro 门控（2026-10-07）：AI 定位路径
  const r = state.selectedId ? findNode(state.tree, state.selectedId) : null;
  const n = r ? r.node : currentRoot();
  if (n) copyAILocateOf(n);
}
// ── 「转出思维导图」（2026-10-10 用户定）──
//   把选中节点所在的**整棵子树**交给宿主导成"文件夹 + 文件"的结构，落在**导图自己所在的目录**里。
//   只带**内容**：标题 / 备注 / 内嵌媒体 / 指向的文件。颜色 / 待办 / Now / Minor / 折叠 / AI 规则
//   一律**不带**（用户定："只要那个正文"；它们是画布上的视图状态，弹窗里会说明、历史里能找回）。
//   ⚠️ 宿主体检不过 / 用户取消 → **什么都不回**，画布这边也就什么都不做（`_exportPending` 留着等下一次）。
// ⚠️ 回包时**只能靠 pid 定位**，不能存节点对象引用（2026-10-10 实踩）：宿主搬文件时 Obsidian 会
//   把导图里指向它的链接一起改写（`[[28Notes-Files/docs/名字]]` → `[[新名字]]`）→ 导图文件变了 →
//   画布走一次**外部重载**，`state.tree` 整个被换成新树 —— 存着的那个旧节点对象已经不在树里了，
//   改它等于改一个孤儿：画面上看到的是新树（主节点显示成 `[] 名字`），切走再回来才读到我落盘的那份。
//   pid 写进文件（`<!--id:xxx-->`）、重载后不变，所以拿它回头找。
let _exportPending = null;   // { pid, isRoot }
// 🔴 转出成功的节点要「永不复活」（2026-10-10 用户实报：子树里**含文档节点**时，转出后原节点没被删掉，
//   那个文档节点还从"文档节点"退化成了普通双链）。
//   根因：转出会把文档节点指向的那份文件从 docs/ **搬**出去 → Obsidian 顺手改写本导图里指向它的链接
//   （`[[28Notes-Files/docs/名字]]` → `[[新名字]]`）→ 导图文件变了 → 宿主走一次**外部重载**
//   （`externalReload` → `sendInit`）。而那次重载要先**异步读盘**，回包常常晚于 `exportMapDone` 一步，
//   把「还没删节点」的旧内容整棵推回来，正好把刚做完的清理冲掉。
//   （子树里没有文档节点时不会搬文件 → 不会重载 → 那条路一直是好的，用户看到的正是这个差异。）
//   → 记一份「墓碑」：之后**任何一次**树被外部内容换掉（`applyIncoming`）时，只要树里还有它，就再摘一次。
//   pid 不会重复分配（`genPersistId`），所以摘掉是安全的；iframe 重建后墓碑随模块重置 ——
//   那时盘上早已是删干净的内容（每次摘掉都会把纠正后的内容写回盘）。
let _exportGrave = new Set();   // 已转出、不许再出现的节点 pid
// 摘掉树里所有「已转出」的墓碑节点（按 pid）。返回是否真摘掉了（摘了才需要把内容写回盘）。
function pruneExportGrave(root) {
  let hit = false;
  (function walk(n) {
    const kids = n.children || [];
    for (let i = kids.length - 1; i >= 0; i--) {
      const c = kids[i];
      if (c.persistId && _exportGrave.has(c.persistId)) { kids.splice(i, 1); hit = true; }
      else walk(c);
    }
  })(root);
  return hit;
}
function exportTreeOf(node) {
  const mg = nmManagedOf(node);
  // 内嵌媒体 = 标题里内联的图 + 节点自己的 images / embeds（渲染时三者一起显示，转出也要一起数）
  const inline = (nmExtractInlineImages(String(node.title || '')).images) || [];
  return {
    title: String(node.title == null ? '' : node.title),
    note: String(node.note == null ? '' : node.note),
    media: inline.concat(node.images || []).concat(node.embeds || []).map(String),
    // 这两个**不落到文件里**，只给宿主的"确认弹窗"用来数"有几个节点会丢东西"（2026-10-10）
    todo: String(node.todo || ''),
    aiRules: String(node.aiRules || ''),
    // 指向 docs/ 里某份文件（文档 / 附件）的节点 —— 那份文件要**搬**出去（不是复制，见宿主侧说明）
    doc: mg ? { note: mg.note, path: docLinkPathOf(mg.note), kind: mg.kind } : null,
    kids: (node.children || []).map(exportTreeOf),
  };
}
function exportNodeTree(node) {
  if (proGuard()) return;   // Pro 门控（2026-10-11）：转出思维导图（文档库）
  if (!node || !state.tree) return;
  // 「母节点」= 整张图的**主节点**（不是当前下钻的根）—— 母节点转出 = 整张图都出去了，导图本身会被删
  const isRoot = (state.tree.id === node.id);
  ensurePersistId(node);   // 先把 pid 落进文件：外部重载后只能靠它找回这个节点（见上面那段说明）
  _exportPending = { pid: node.persistId || '', isRoot: isRoot };
  vscode.postMessage({ type: 'exportMapTree', tree: exportTreeOf(node), isRoot: isRoot });
}
function bookmarkOf(node) {
  // 保存为捷径：在数据文件同目录创建 <名字>.md（frontmatter 28notes: mmlink），点它即打开本文件并下钻到该节点
  ensurePersistId(node);
  showPrompt(T('ctx.bookmark'), T('ctx.bookmarkHint'), (val) => {
    vscode.postMessage({ type: 'createShortcut', pid: node.persistId, title: node.title || T('common.node'), name: (val || '').trim() });
  });
}
// 剪贴板探测回来后，把「粘贴」那一行的置灰补上（菜单往往已经打开了，那行是按旧值渲染的）
function syncPasteRowNa() {
  if (!ctxSub) return;
  const it = ctxSub.querySelector('.ctx-item[data-act="paste"]');
  if (!it) return;
  const na = pasteRowNa();
  it.classList.toggle('ctx-na', na);
  if (na) { nmSetTipParts(it, pasteRowNaTip()); it.setAttribute('data-side', 'right'); }
  else { it.removeAttribute('data-tip'); it.removeAttribute('data-tip-h'); }
}
// （buildAinodeItem 已于 2026-10-05 删除：右键那两项整体挪到底部工具条的 AI 子菜单，
//   入口只剩 aiMenuAction 一处；toggleAinodeOn / toggleAinodeAtFocus 留着，新入口直接用。）
// 手动切换标记（多选共用这一条）：on=true 标成 ai（纯 AI），on=false 摘掉（回到普通节点，文件里那串注释一并消失）。
//   清掉是不可逆的单向动作，所以先存一步撤销；整组只记一条，撤销一次全回来。
function toggleAinodeOn(nodes, on) {
  const list = (nodes || []).filter(Boolean);
  if (!list.length || state.historyMode) return;
  pushUndo();
  list.forEach(n => { n.ainode = on ? 'ai' : ''; });
  emitUpdate();
  render();
}
// 备注的 AI 生成标记（airemark，2026-10-14）：与 toggleAinodeOn 同款，对象换成**备注**那一块。
//   两个入口都走它：AI 面板行左侧那颗按钮、备注栏左侧的 logo。
function toggleAiremarkOn(nodes, on) {
  const list = (nodes || []).filter(Boolean);
  if (!list.length || state.historyMode) return;
  pushUndo();
  list.forEach(n => { n.airemark = on ? 'ai' : ''; });
  emitUpdate();
  render();
}
// 命令 / 快捷键的落点（2026-10-05）：选中了就按选中集（含多选），没选中就用当前主节点 —— 与 copyAILocate 那条命令同款口径
function toggleAinodeAtFocus() {
  if (proGuard()) return;   // Pro 门控（2026-10-07）：AI 生成标记
  const targets = selectedTargetNodes();
  if (targets.length) { toggleAinodeOn(targets, !targets.every(hasAinode)); return; }
  const n = currentRoot();
  if (n) toggleAinodeOn([n], !hasAinode(n));
}
// 备注标记的落点（2026-10-14）：与 toggleAinodeAtFocus **完全同一套口径** ——
//   选中了就按选中集（含多选），没选中就用当前主节点。只是对象换成备注标记（airemark）。
//   ⚠️ 2026-10-14 用户定：**没备注的节点不给打标**（打了也没东西可标）——
//      打标时只作用于「有备注」的节点；**摘标不挡**（备注被删掉了也还能把标记摘掉）。
function hasNoteText(n) { return !!(n && (n.note || '').trim()); }
function toggleAiremarkAtFocus() {
  if (proGuard()) return;   // Pro 门控（2026-10-14）：备注标记也锁
  const targets = selectedTargetNodes();
  if (targets.length) {
    const on = !targets.every(hasAiremark);
    const list = on ? targets.filter(hasNoteText) : targets;
    if (list.length) toggleAiremarkOn(list, on);
    return;
  }
  const n = currentRoot();
  if (!n) return;
  const on = !hasAiremark(n);
  if (on && !hasNoteText(n)) return;
  toggleAiremarkOn([n], on);
}
function buildCtxMenu(x, y, node, mode, imgPath) {
  if (state.historyMode) return; // 历史界面只读：右键菜单整体屏蔽（节点/图片菜单都从这里走，收口一处）
  // 2026-10-08：反方向也补上 —— 开右键菜单时把底部那三个面板收掉，两边不会同时站着
  hideMoreMenu(); hideMoreSub(); hideStyleMenu(); hideAiMenu();
  hideCtx();
  hideCtxSub();
  probeClipboard(syncPasteRowNa); // 右键是用户手势，这一刻读剪贴板最容易被允许；回来后再补一次置灰
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  if (mode === 'image') {
    // 附件（图片 / 视频 / 音频）右键（2026-09-21 用户定）：只有剪切 / 复制 / 删除
    ctxMenu.appendChild(ctxItem(T('ctx.cut'), () => cutSelectedNode(true), 'scissors', '', nmKeySuffix('cut', '{Mod} + X')));
    ctxMenu.appendChild(ctxItem(T('ctx.copy'), () => copySelectedNode(false, true), 'copy', '', nmKeySuffix('copy', '{Mod} + C')));
    ctxMenu.appendChild(ctxItem(T('ctx.deleteImage'), () => {
      // 右键不会触发 click → 先把 selectedImg 指到这张再走统一删除逻辑（2026-09-17）
      state.selectedImg = { nodeId: node.id, path: imgPath };
      removeSelectedImage(false);
    }, 'trash-2'));
  } else {
    // ── 文档节点那几行：**行不在这里造**（2026-10-11 用户定重排菜单）──
    //   「进入当前节点」下面那一段（打开 / 重命名 / 保存为文档捷径 / 删除 / 编辑链接）先在下面攒进
    //   `groupRows`、再统一 append；代码在 `ctxMenu.appendChild(drillItem)` 之后。这里只取一个判据。
    //   判据与图标**同源**（nmManagedOf / docLinkPathOf）—— 所以「看到文档图标」与「右键有这一组」永远同时成立。
    //   开关关着时整组（含分隔线）不出现，界面上看不出有这个功能。
    //   按类型给不同的行（2026-10-08 用户定）：
    //     文档：打开该文档 / 重命名该文档 / 保存为文档捷径 / 删除该文档（四项）
    //     附件：打开该图片·视频·音频 / 删除该图片·视频·音频（两项，**没有重命名**、也没有文档捷径）
    const managed = nmManagedOf(node);
    // ── 菜单最上面那一行：「管理文档」（2026-10-11 用户定稿顺序的第一位）──
    //   **只给「文档警告节点」**（被多处管理的），用警告三角图标 → 点它 = 打开文档面板并切到第 4 页
    //   （与原来那条常驻 toast 的「管理」按钮**同一个动作**，那条 toast 现已隐藏）。
    //   ⚠️ 位置（2026-10-11 用户按真菜单指出来改的）：**在「进入当前节点」上面** —— 原来排在它下面。
    if (nmMultiRefOf(node)) {
      const manageItem = ctxItem(T('ctx.manageDoc'), () => vscode.postMessage({ type: 'openDoclibManage' }), 'triangle-alert');
      nmApplyTip(manageItem, T('ctx.manageDocTip'), ''); // 黑色小字提示；这一项没绑键 → 不给键位段
      manageItem.dataset.side = 'right';
      ctxMenu.appendChild(manageItem);
      ctxMenu.appendChild(ctxSep());
    }
    // 一级菜单**不挂快捷键备注**（2026-09-21 用户定）：一级里四五行、每行右侧都吊一串键位，面板会拉得又长又花；
    // 键位只在**二级菜单**里显示（剪切/复制/粘贴/删除那四项），那里才是「手上有键盘时才用的操作」。
    // 一级**保留黑色小字提示**（data-tip，2026-09-21 用户定：进入当前节点 / 保存为捷径 也要有，文案先预埋）——
    // 提示与键位是两回事：提示在悬浮黑框里，键位在行右侧。
    // 进入当前节点（下钻，非当前根节点；2026-08-24 P1：末尾节点也允许进入——之前要 children.length，叶子点不了）
    // 「进入当前节点」（下钻）：**任何节点都保留这一项**（2026-10-07 用户定：让界面更可预测）——
    // 母节点上就置灰 + 说明「当前为母节点，不可进入」，而不是整项消失（菜单长度会跳、用户找不到）。
    const drillRoot = node.id === currentRoot().id;
    // 提示走 nmApplyTip（2026-10-06）：文案里**不写死括号**，键位段由 `data-tip-kbd` 单独渲染（浅一档），
    // 没绑键时整段消失 —— 不会留一对空括号。母节点不给 act：键位段显示出来也没用，反而误导。
    const drillItem = ctxItem(T('ctx.drill'), () => { if (!drillRoot) drillInto(node.id); }, 'log-in', '', '', drillRoot);
    nmApplyTip(drillItem, drillRoot ? T('ctx.drillRootTip') : T('ctx.drillTip'), drillRoot ? '' : 'drill');
    // ⚠️ 菜单行的提示一律给方向（往右弹）：nmApplyTip 只管文案与键位段，不碰 data-side。
    //    2026-10-06 实踩：上一版这三行改走 nmApplyTip 后丢了 data-side → 提示掉回默认定位
    //    （弹到条目**上方**，压住上面那几行）。ctxItem 里那条 `if (tip)` 只服务「老式调用」，
    //    走 nmApplyTip 的必须自己补这一句。
    drillItem.dataset.side = 'right';
    ctxMenu.appendChild(drillItem);
    ctxMenu.appendChild(ctxSep());
    // 「管理文档」那一行**排在整份菜单的最上面**（2026-10-11 用户定稿顺序第一位）
    //   → 代码在本函数**前半段**（`ctxMenu.appendChild(manageItem)` 那处，在「进入当前节点」**前面**）。
    // ⚠️ 2026-10-09 用户定：**不再看总开关** —— 核心思路是「**已经导入的**，管理体验不受影响；
    //   **没导入的**，把导入入口掐掉」。开关只管宿主侧文件列表那个「转入」入口，
    //   画布上文档节点这一组永远都在。
    // 🔴 2026-10-11 用户定（**定稿顺序**，与调教器「右键菜单」页那张清单一一对应）：
    //   管理文档 ｜ 进入当前节点 ｜ 打开文档 · 重命名文档 · **保存为文档捷径** · 删除文档 · **编辑链接**
    //   ｜ 基础操作 ｜ 复制节点链接 · **保存为视图捷径** · **转出思维导图**
    //   ⚠️ 这些行**不是每个菜单都有**（按节点类型 / 开关出现）：管理文档只给「被多处管理」的节点；
    //     文档那几行只在文档节点上；编辑链接只在「整行就是链接」的节点上；转出思维导图要「文档库」开着。
    //     **行不在时，它那一段的分隔线也不出现** —— 所以先攒进 groupRows，看空不空再决定收不收尾那道线。
    const groupRows = [];
    if (managed) {
      const docPath = docLinkPathOf(managed.note);
      const kind = managed.kind;
      // 每行都挂黑色小字提示（2026-10-11 用户定）：与「转出思维导图」那些**同一条路**（nmApplyTip），
      //   文案**按 kind 分**（文档 / 图片 / 视频 / 音频），与行文字 nmCtxKeyOf 用同一套后缀。
      //   ⚠️ nmApplyTip 不碰 data-side，走它的行**必须自己补** `dataset.side = 'right'`（见上面那段实踩）。
      // 「打开该…」走**新标签页**：从画布点过去不能把正在看的导图顶掉
      const openItem = ctxItem(T(nmCtxKeyOf('ctx.open', kind)),
        () => vscode.postMessage({ type: 'openDoc', path: docPath }), nmIconNameOfKind(kind));
      nmApplyTip(openItem, T(nmCtxKeyOf('ctx.openTip', kind)), '');
      openItem.dataset.side = 'right';
      groupRows.push(openItem);
      // 「重命名该文档」= 改**文件**名（走 Obsidian 官方改名，引用由它自己更新，方案 §4.7）
      if (kind === 'doc') {
        // 图标 pencil-line（用户 2026-10-08 指定；lucide 官方源码已核对过，Obsidian 内置图标库里也有）
        const renameItem = ctxItem(T('ctx.renameDoc'), () => vscode.postMessage({ type: 'renameDoc', path: docPath }), 'pencil-line');
        nmApplyTip(renameItem, T('ctx.renameDocTip'), '');
        renameItem.dataset.side = 'right';
        groupRows.push(renameItem);
      }
      // 「保存为文档捷径」（2026-10-11 用户定）：**只给文档**（附件打不开 markdown 视图）——
      //   建出的壳 frontmatter 是 28notes: doclink、target 直接指文档文件；点那个壳 =
      //   patchSetViewState 的 doclink 分支把 leaf 一步引到文档本身（不经过导图视图，省掉"再点一次节点"）。
      //   命名框与「保存为视图捷径」共用同一个（showPrompt）；Pro 拦截同款。
      // ⚠️ 位置（2026-10-11 用户定，第二版）：排在**「删除文档」上面**（紧跟重命名）。
      if (kind === 'doc') {
        const docBmItem = ctxItem(T('ctx.saveDocShortcut'), () => showPrompt(T('ctx.saveDocShortcut'), T('ctx.bookmarkHint'), (val) => {
          vscode.postMessage({ type: 'createDocBookmark', path: docPath, name: (val || '').trim() });
        }), 'split');
        nmApplyTip(docBmItem, T('ctx.saveDocShortcutTip'));
        docBmItem.dataset.side = 'right'; // 菜单行提示往右弹（与上面几行同款）
        applyProGate(docBmItem);          // 未激活同样走 Pro 拦截（照「保存为捷径」）
        groupRows.push(docBmItem);
      }
      // 「新建副本」（2026-10-19 用户定）：把**文档本体**复制一份到隐藏目录，并在选中节点**同级后面**
      //   插一个指向副本的节点。⚠️ 与「保存为文档捷径」不是一回事：那个只是建个壳指过去，正文还是同一份；
      //   这个是真的复制出**第二份正文**（所以副本的名字按撞名逻辑顺延成「名字 1」）。
      if (kind === 'doc') {
        const dupItem = ctxItem(T('ctx.dupDoc'), () => vscode.postMessage({ type: 'dupDoc', path: docPath, nodeId: node.id }), 'copy-plus');
        nmApplyTip(dupItem, T('ctx.dupDocTip'), '');
        dupItem.dataset.side = 'right';
        groupRows.push(dupItem);
      }
      // 「删除该…」：宿主那边弹二次确认（有引用时还会把要改哪几张图说清楚）后再删
      // fromNode:true → 宿主把确认框标题换成「删除该节点管理的文档？」（用户 2026-10-08 定）
      // 🔴 2026-10-10 用户定：原来那项「转出到 vault」（`ctx.moveOutDoc`）**已合并**到「转出思维导图」里 ——
      //   "在用户的认知里它们是一个意思"：文档节点点它 = 那份文档搬出来；普通节点 = 整棵子树导成文件夹结构。
      //   （消息通道 `moveDocOut` 留着：文档库面板「⋯ → 转出」还在用它。）
      const delItem = ctxItem(T(nmCtxKeyOf('ctx.delete', kind)),
        () => vscode.postMessage({ type: 'deleteDoc', path: docPath, fromNode: true }), 'trash-2');
      nmApplyTip(delItem, T(nmCtxKeyOf('ctx.deleteTip', kind)), '');
      delItem.dataset.side = 'right';
      groupRows.push(delItem);
    }
    // 「编辑链接」（2026-10-11 位置定稿：跟在文档组后面、**在「基础操作」上面**）：
    //   仅「整行就是文件 / URL 链接」的节点显示；节点链接指向本图节点、由节点系统管理，不在此编辑。
    //   2026-09-29：链接没有单独的编辑框了 —— 这一项就是「编辑正文那一行」（与双击同一件事）。
    if (parseFileLink(nmPureLinkOf(node.title)) || parseUrlLink(nmPureLinkOf(node.title))) {
      groupRows.push(ctxItem(T('ctx.editLink'), () => {
        const row = document.querySelector('.node-row[data-id="' + node.id + '"]');
        const el = row && row.querySelector(':scope > .card .title');
        if (el) startEdit(node, el, null, true);
      }, 'file-pen'));
    }
    groupRows.forEach(it => ctxMenu.appendChild(it));
    if (groupRows.length) ctxMenu.appendChild(ctxSep());   // 整组末尾封一道（组内不再分道）
    // 基础操作（2026-09-21 用户定）：剪切 / 拷贝 / 复制 / 粘贴 / 删除收进二级菜单，父项右侧挂箭头
    // 2026-10-18 用户定：原来那项「复制」改名「拷贝」（进剪贴板），**下面新增一项「复制」= 建节点树副本**，
    //   悬浮给黑字说明；母节点没有同级 → 置灰并说明原因（副本要插在选中节点后面）。
    ctxMenu.appendChild(ctxSubItem(T('ctx.basicOps'), [
      { label: T('ctx.cut'), fn: () => cutSelectedNode(true), icon: 'scissors', kbd: nmKeyPlain('cut', '{Mod} + X') },
      // 拷贝（2026-10-19）：裸点击 = 带格式；**按住 ⌘ 点击 = 清除格式版**（与 ⌥⌘C 同一条路）。
      //   黑字提示里把这两种都写明（用户原话给的文案）。
      { label: T('ctx.copy'), fn: (e) => copySelectedNode(!!(e && (e.metaKey || e.ctrlKey)), true), icon: 'copy', kbd: nmKeyPlain('copy', '{Mod} + C'), tip: T('ctx.copyTip') },
      { label: T('ctx.duplicate'), fn: () => duplicateNode(), icon: 'copy-plus', tip: T('ctx.duplicateTip'),
        // 母节点不能复制（2026-10-19 扩到所有视图）：真主节点没有同级；**下钻视图的母节点**虽然
        // 在整棵树里有父节点，但那一层当前看不见，副本会插到画面外 → 一样置灰。
        na: () => { const r = state.selectedId ? findNode(state.tree, state.selectedId) : null; return !r || !r.parent || r.node.id === currentRoot().id; },
        naTip: T('ctx.duplicateNaTip') },
      { label: T('ctx.paste'), fn: () => pasteFromClipboard(), icon: 'clipboard-paste', kbd: nmKeyPlain('paste', '{Mod} + V'), act: 'paste', na: pasteRowNa, naTip: pasteRowNaTip }, // 置灰：剪贴板空 / 多选（见 pasteRowNa）
      { label: T('ctx.delete'), fn: () => deleteNode(), icon: 'trash-2', kbd: nmKeyPlain('delete', 'Delete') },
    ], 'clipboard'));
    // （右键菜单里的「待办」行已随「待办按钮位置」设置一起删除：2026-10-18 —— 设置项 2026-10-07 定稿
    //   固定「底部常驻」后，这条分支就再也不成立，属死代码。）
    ctxMenu.appendChild(ctxSep());
    const linkItem = ctxItem(T('ctx.copyLink'), () => copyNodeLinkOf(node), 'link');
    nmApplyTip(linkItem, T('ctx.copyLinkTip'), 'copyNodeLink');
    linkItem.dataset.side = 'right'; // 同上：菜单行提示往右弹
    ctxMenu.appendChild(linkItem);
    const bookmarkItem = ctxItem(T('ctx.bookmark'), () => bookmarkOf(node), 'split');
    nmApplyTip(bookmarkItem, T('ctx.bookmarkTip'), 'saveShortcut');
    bookmarkItem.dataset.side = 'right'; // 同上
    applyProGate(bookmarkItem); // 保存为捷径：未激活同样走 Pro 拦截（2026-09-04）
    ctxMenu.appendChild(bookmarkItem);
    // ── 「转出思维导图」（2026-10-10 用户定；2026-10-11 位置定稿：排在「保存为视图捷径」**下面**）──
    //   🔴 把原来文档节点那项「转出到 vault」（`ctx.moveOutDoc`）**合并进这一项** ——
    //     用户说"在用户的认知里它们是一个意思"：都是把这份东西从画布里挪到 vault 的文件夹里。
    //     行为上：文档节点 → 那份文档搬出来（等同旧行为）；普通节点 → 整棵子树导成文件夹结构。
    //   ⚠️ **跟着「文档库」实验开关走**（用户定：开关关掉就整项隐藏）。
    if (docsLibraryOn) {
      const exportItem = ctxItem(T('ctx.exportMap'), () => exportNodeTree(node), 'folder-output');
      nmApplyTip(exportItem, T('ctx.exportMapTip'), 'exportMap');
      exportItem.dataset.side = 'right';
      applyProGate(exportItem); // 转出思维导图：未激活同样走 Pro 拦截（2026-10-11，照「保存为捷径」）
      ctxMenu.appendChild(exportItem);
    }
    // ── 右键菜单底部那一组 AI 项**已撤**（2026-10-11 用户定）──
    //   原来这里接一根分隔线 + 「复制 AI 定位路径」「添加 AI 更改规则」两行（条目定义仍共用 NM_AI_ITEMS）。
    //   用户原话：这两项和底部那颗「AI」按钮给的是**同一个东西**，摆两处"认知上有点混乱" ——
    //   所以右键这条路径整体下掉，**AI 只留底部那一个入口**。
    //   要恢复：把 `ctxAiGroup` 那一行调用接回这里（渲染器本体与 NM_AI_CTX_SKIP 名单都还在，
    //   函数内会自己画那根分隔线，开关关掉时整段含线一起消失）。
    // ⚠️ 「编辑链接」原来在**这里**（菜单最底下），2026-10-11 按用户给的顺序挪到「基础操作」**上面**了
    //   —— 代码在本函数前半段（与文档组同一段 groupRows），别在这儿再加一份。
  }
  syncAiMenuState();  // AI 那几行（含「添加/清除 AI 生成标记」三态）按当前节点定稿
  syncAiRulesEye();   // 小眼睛按「画面里有没有规则 / 是否已隐藏」定稿 —— 与底部那只同一套判据
  document.body.appendChild(ctxMenu);
  // 定位 + 边界收回（2026-10-07 用户定）：原来只有 `left = x; top = y`，鼠标贴着右边缘右键时
  // 菜单会有一截跑到画面外、卡在边上 → 这里收回画面内（留 CTX_EDGE_GAP 的缝，与二级菜单同款）。
  // ⚠️ offsetWidth/Height 必须**先 append 再量**（未入文档的节点量出来是 0）。
  const mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
  let left = x, top = y;
  if (left + mw > window.innerWidth - CTX_EDGE_GAP) left = Math.max(CTX_EDGE_GAP, window.innerWidth - CTX_EDGE_GAP - mw);
  // 竖直：先按「排到底部工具条**上沿**之上」算（2026-10-12 用户定）；塞不进去（菜单太高）→ 退回老口径贴画面底边收。
  const keepOut = ctxBottomLimit();
  top = Math.min(y, keepOut - mh);
  if (top < CTX_EDGE_GAP) top = Math.max(CTX_EDGE_GAP, Math.min(y, window.innerHeight - CTX_EDGE_GAP - mh));
  ctxMenu.style.left = left + 'px';
  ctxMenu.style.top = top + 'px';
  // 菜单贴着右边 → 菜单行的黑色小提示一律改往**左**弹（2026-10-07 用户定：往右弹会跑到画面外看不见）。
  // 判据 = 菜单右边到画面右边还剩多少，不够放一条提示就翻；往左弹有地方（菜单自己占着宽度）。
  const tipSide = (window.innerWidth - (left + mw) < CTX_TIP_FLIP_GAP) ? 'left' : 'right';
  if (tipSide === 'left') ctxMenu.querySelectorAll('[data-side]').forEach(el => { el.dataset.side = 'left'; });
}
document.addEventListener('contextmenu', e => {
  const card = e.target.closest ? e.target.closest('.card') : null;
  if (!card) { hideCtx(); return; }
  e.preventDefault();
  const r = findNode(state.tree, card.dataset.id);
  if (!r) return;
  // 右键谁就对谁生效（2026-09-23 用户定）：右键**不会**自动选中（选中只在左键 click 里发生），原来
  // 「在 B 上右键点删除、删的却是先前选中的 A」。→ 落点不在当前选中里就先选上它，菜单里所有操作
  // （剪切/复制/删除/待办…）都对同一个节点。落点在多选集里 → 保持多选不动，剪切/删除按整组走。
  const inSel = (state.multiSelected.size > 0 && state.multiSelected.has(r.node.id)) || state.selectedId === r.node.id;
  if (!inSel) selectNode(r.node.id);
  buildCtxMenu(e.clientX, e.clientY, r.node);
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
// ⚠️ 图片 / 文件 / 链接 / 双链四个分支都要求**整段就是**那样（trim 后 ^…$）—— 一大段正常文字里
//   恰好带了链接 / 图片语法的，按纯文字处理，别把其余文字吞了（2026-10-21 用户定：旁边还有字就不命中）。
// 返回 true = 认领了这次粘贴（调用方据此决定要不要 preventDefault）
function applyPastedText(text) {
  const nonEmpty = text.split('\n').map(l => l.trim()).filter(Boolean);
  // 大纲分支必须看**原始首行**：拷贝出来的空标题图片节点是 `- \n\t![[图]]`，trim 后首行只剩 `-`、
  //   匹配不上列表标记 → 整段掉进纯文字分支按行死拆，那个 `-` 会变成一个真正的节点
  //   （用户实报"粘贴出来多个小横线"，2026-10-21）。
  const firstRaw = String(text || '').split('\n')[0] || '';
  if (nonEmpty.length && (/^[-*+]\s/.test(nonEmpty[0]) || /^[-*+][ \t]/.test(firstRaw))) { addNodeFromText(text); return true; } // 大纲整段
  const wikiImgM = text.match(/^!\[\[([^\]]+)\]\]$/); // 图片文本 v2 ![[名]]（兼容 v1 ![](路径)）；尺寸后缀一起存（Obsidian 宽度，渲染时生效）
  if (wikiImgM) { addImageToNode(wikiImgM[1].trim()); return true; }
  const imgM = text.trim().match(/^!\[[^\]]*\]\(([^)]+)\)$/);
  if (imgM) { addImageToNode(imgM[1]); return true; }
  const filePath = detectFilePath(text); // 裸路径或 [[file://...]] → 指向该文件的子节点
  if (filePath) { addFileLinkChild(filePath); return true; }
  const url = detectUrl(text); // http/https/ftp/mailto/www（含 [名](url)）→ 链接子节点
  if (url) { addUrlLinkChild(url); return true; }
  const linkM = text.trim().match(/^\[\[[^\]]+\]\]$/);
  if (linkM) { addLinkChild(linkM[0]); return true; } // 双链
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
    // ⚠️ 空图（empty）不许套用「未命名 → 文件名」的兜底：套了就等于把空图悄悄补出一个主节点，
  //    用户剪切走主节点后打开又冒出来一个，等于没剪（2026-10-11）。
  if (!state.tree.empty && state.tree.title === '未命名' && state.currentFilename) state.tree.title = state.currentFilename;
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
// 符号键的 e.code → 「未变形字形」。⚠️ Shift 会改变 e.key：Windows 上 Shift+. = '>'、Shift+, = '<'，
// 而 macOS 按住 ⌘ 时系统报告**未变形**键名（⌘+Shift+. = '.'）—— 同一个绑定（如 Mod+Shift+.）两边就对不上
// （实踩 2026-09-22：视图切换 ⌘+Shift+. Mac 能用、Windows 失效）。表里只放「会被 Shift 变形」的符号；
// Tab / Enter / 方向键的 e.key 各平台稳定，不走表。
const NM_CODE_KEY = {
  Period: '.', Comma: ',', Slash: '/', Backslash: '\\', IntlBackslash: '\\',
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Backquote: '`',
};
function nmEventKey(e) { // 事件键名：优先物理键位 e.code。⚠️ macOS 按住 Option 时 e.key 会变成特殊字符
  const c = String(e.code || ''); //（Option+B = ∆、Option+2 = ™），用 e.key 永远匹配不上带 Alt 的绑定（实踩）。
  if (c.indexOf('Key') === 0) return c.slice(3).toLowerCase(); // KeyB → b
  if (c.indexOf('Digit') === 0) return c.slice(5);             // Digit2 → 2
  if (NM_CODE_KEY[c]) return NM_CODE_KEY[c];                   // 符号键：挡住 Shift 变形（Windows Ctrl+Shift+. 是 '>' 不是 '.'）
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
  // 2026-10-24：⌥ 也一起挡 —— ⌥⌘V 由上面的写死分支接管（原生不为它生成 paste 事件），
  // 万一那条没命中（个别键盘 e.code 为空），这里至少别再把它转出去。
  if (k === 'v' && (e.metaKey || e.ctrlKey) && !e.shiftKey) return false;
  return true;
}
// 键位串 → 带括号（zh 全角 / en 半角）；空串 → 空（**连括号一起不显示**，2026-09-18 定）
// ⚠️ 2026-10-20 起只服务**右键菜单右侧那列小字**（nmKeySuffix）—— 提示链路（nmTipRefresh）的键位段
//    已纯化（只含键位本身、括号由文案写在 {0} 两侧），不再过这里。
function nmKbdWrap(k, bare) {
  if (!k) return '';
  // bare = 括号**已经写在文案里**了（形如 `（{0}）`），这里只给键位本身、别再套一层（2026-10-20）。
  //   为什么：括号留在正文段里，`{0}` 就只是中间那一小段灰字 —— 跟「全屏专注模式（⌘=）（按住…）」
  //   完全一致，两个括号之间也就没有段间距了（用户实报"待办那条两个括号中间空太大"）。
  if (bare) return k;
  const en = (typeof getLang === 'function') && getLang() === 'en';
  return en ? ' (' + k + ')' : '（' + k + '）';
}
// ===== 画布里**写死的键**（2026-10-06）=====
// 有几个键不走原生快捷键页（用户绑不了），但提示里还是要显示出来：Tab = 加子节点、Enter = 加同级节点。
// 以前这两条是**把「快捷键：Tab」整句写死在 i18n 里**的（用户 2026-10-06 实报）—— 现在改成：
//   文案只说「点击后，可添加子节点」，键位段由这张表补上，**显示规则与宿主 fmtHotkey 同一套**：
//   Mac 用系统符号（⇥ / ↵），Windows/Linux 用单词（Tab / Enter）。
// ⚠️ 这张表就是「画布写死键」的唯一出口：以后再加写死的键，在这里补一行，别再去 i18n 里写死整句。
const NM_FIXED_KEYS = {
  addChild:   { mac: '⇥', other: 'Tab' },
  addSibling: { mac: '↵', other: 'Enter' },
};
function nmFixedKeyText(act) {
  const d = NM_FIXED_KEYS[act];
  if (!d) return '';
  return ((typeof I18N_MAC !== 'undefined') && I18N_MAC) ? d.mac : d.other;
}
// 兼容老调用（少数几处把键位段直接拼进字符串，见 nmApplyTip 的说明）
function nmKeySuffix(act, fallback) { return nmKbdWrap(nmKeyText(act, fallback)); }
// ===== 黑色小字提示：内容 = 真实元素（2026-10-06 用户定）=====
// 为什么不是伪元素：**键位段 / 后缀段要单独上色**（正文白、后两段浅一档）——
//   伪元素的 content 是一整串字符串，切不开、没法只给其中一段换色。
// 三段各走各的属性（都不拼进 data-tip）：
//   ① data-tip-kbd 键位段：挂提示的地方给「动作 id」，键位自动从命令表接上（改键实时变、没绑就不显示）；
//   ② data-tip-h 后缀段：由文案里的分隔标记「==space==」切出来（2026-10-20 晚起；以前是渲染时拿正则按括号猜，已废）。
// 用法（**挂提示一律走这个**，别再手写 el.dataset.tip = ... + nmKeySuffix(...)）：
//   nmApplyTip(el, 文案, '动作id')                     —— 键位从命令表取
//   nmApplyTip(el, 文案, '', '⌘⇧F')                    —— 键位不是命令表来的（宿主直接发过来的那种）
//   nmApplyTip(el, 文案, '动作id', null, false, 后缀文案) —— 再挂一段浅色后缀（不传就没有）
// 文案里可以带 `{0}` 指定键位段的位置；不带就接在末尾。
// 🔴 键位段**只含键位本身**（2026-10-20 用户定，如「⌘L」不带括号）：括号要就由文案写在 `{0}`
//   两侧（「设为待办（{0}）」）。nmKbdWrap 那套自动加括号只有右键菜单右侧小字列还在用
//   （nmKeySuffix），提示链路不再过它。键位没绑时 `{0}` 连同紧挨的一对空括号一起抹掉（见 nmTipRefresh）。
// 挂过「动作 id」的提示登记在这里（el → { act, kbd }）：键位表到了 / 用户改键推来新表时整批重算。
//   ⚠️ 存的是**动作 id 与兜底键**，不是文案 —— 文案随时会变，刷新时读元素当前的 data-tip（见 refreshCanvasHotkeyTips）。
//   ⚠️ 只登记「键位来自命令表」的（act 非空）。**宿主直发键位**（act 为空，如全屏键 fsHotkeyText）
//      不进登记：那种键由宿主那条 `setFsHotkey` 消息自己刷；登记了反而会在刷新时用旧值盖回去。
const NM_TIP_ACTS = new Map();
// 浅色后缀段不再单独传参（2026-10-20 晚用户改设计）：文案里用分隔标记「==space==」一刀切两段 ——
//   前段 = 正文（白），后段 = 浅色后缀（快捷键 / 备注说明，一律自带括号）；没有 ==space== 就是没有后缀。
//   ⚠️ 不用 '+' 分隔：i18n 里 'a'+'b' 会被 JS 当场拼掉，运行时再也分不开；且半角 '+' 会跟
//   「⌘+Z」这类键位冲突。为什么选 ==space== 而不用单字符（如「｜」）：用户 2026-10-20 定 ——
//   单字符分隔符中英文各有形态（全角｜/半角|）容易打混，且久不用会忘它的含义；
//   ==space== 一眼看得出是「这里隔开」，正常文案里也不可能自然出现。
//   好处：改文案只动 i18n 一处；调用点只传一个参数，渲染规则对所有人生效。
const NM_TIP_SPLIT = '==space==';
function nmApplyTip(el, base, act, kbdText, warn) {
  if (!el || !el.dataset) return;
  const raw = base || '';
  const i = raw.indexOf(NM_TIP_SPLIT);
  el.dataset.tip = i < 0 ? raw : raw.slice(0, i);
  const tail = i >= 0 ? raw.slice(i + NM_TIP_SPLIT.length) : '';   // 分隔符是**多字符**，跳过整段（不是 +1）
  if (tail) el.dataset.tipH = tail; else delete el.dataset.tipH;
  const k = kbdText != null ? kbdText : (act ? nmKeyText(act) : '');
  if (k) el.dataset.tipKbd = k; else delete el.dataset.tipKbd;
  // warn=true → 这条提示走**黄底警告**样式（2026-10-09 用户定：文档警告节点的悬浮小字）。
  //   不传的调用点（绝大多数）照旧黑底，行为一个字不变。
  if (warn) el.dataset.tipWarn = '1'; else delete el.dataset.tipWarn;
  if (act) NM_TIP_ACTS.set(el, { act: act, kbd: kbdText });
  else NM_TIP_ACTS.delete(el); // 不带动作 id（或宿主直发）→ 不登记
  nmTipRefresh(el); // 已经挂过提示元素的 → 就地刷新（文案随状态变的那种，比如待办按钮）
}
// 把「正文==space==后缀」文案写进元素的 data-tip / data-tip-h（不走 nmApplyTip 的场合用：ctxItem / 置灰行）
function nmSetTipParts(el, full) {
  const raw = full || '';
  const i = raw.indexOf(NM_TIP_SPLIT);
  if (i < 0) { el.dataset.tip = raw; delete el.dataset.tipH; }
  else { el.dataset.tip = raw.slice(0, i); const tail = raw.slice(i + NM_TIP_SPLIT.length); if (tail) el.dataset.tipH = tail; else delete el.dataset.tipH; }
}
// 提示元素：**第一次悬停时才挂上来**（不给每个 data-tip 都预先建一个，省 DOM）
function nmTipMaterialize(el) {
  let t = el.querySelector(':scope > .nm-tip');
  if (!t) {
    t = document.createElement('span');
    t.className = 'nm-tip';
    el.appendChild(t);
  }
  // 黄底警告样式（2026-10-09）：跟着 `data-tip-warn` 走。元素是**复用**的（同一张卡第二次悬停不会重建）
  //   → 每次 materialize 都刷一遍类，免得上一条的样式留在这一条上。
  t.classList.toggle('warn', el.dataset.tipWarn === '1');
  return t;
}
// ===== 提示里的浅色「后缀段」（data-tip-h）=====
// 与键位段同为**次要信息** → 一样染成浅一档（.nm-tip-h，用户 2026-10-06 定的「变灰」）。
// 🔴 2026-10-20 前这一截是**渲染时按括号猜**的（NM_HINT_PAREN_RE 把一对括号整段切出来染灰，
//   还要认全半角四种混搭）。猜了三轮没猜干净（半角开+全角收、`（[[ )` 半角收尾+空格、
//   两个灰段挨着间距太大……全是补丁），用户定改成**显式一处**（2026-10-20 晚定稿）：
//   **文案里用 ==space== 一刀切两段** —— 前段正文（白），后段浅色后缀（快捷键 / 备注说明，
//   一律自带括号，可串联如「（{0}）（按住 ⌘ ：设为已完成）」）；不写 ==space== 就没有后缀。
//   i18n 一条文案写全，调用点只传一个参数（nmApplyTip 里拆）。括号正则整段废掉。
// ===== 把文案灌进提示元素。三种段，后两种都变灰：=====
//   ① `.nm-tip-t` 正文（主要语义，白）；
//   ② `.nm-tip-k` 键位段（真快捷键；`{0}` 指定位置）—— **只含键位本身**，括号由文案写
//      （2026-10-20 定，渲染器不再自动套，见 nmApplyTip 的说明）；
//   ③ `.nm-tip-h` 后缀段（==space== 后那截；没有就没有）。
//   `{0}` 在正文里（老文案）或后缀段里都认；哪都没有 → 键位接最末尾。键位只出现一次。
// 键位为空（没绑键）→ `{0}` 占位整条不渲染，**紧挨它的一对空括号也剥掉**，不留「加粗（）」
//   （先例：fsTip 的 {fsHk} 同款处理，2026-10-01；括号是文案写的，这里只剥空的那一对）
function nmStripEmptyKbdParen(segs) {
  for (let i = 1; i < segs.length; i++) {
    if (/^[）)]/.test(segs[i]) && /[（(]$/.test(segs[i - 1])) {
      segs[i - 1] = segs[i - 1].replace(/[（(]$/, '');
      segs[i] = segs[i].replace(/^[）)]/, '');
    }
  }
  return segs;
}
function nmTipRefresh(el) {
  if (!el || !el.dataset || typeof el.dataset.tip !== 'string') return;
  const t = nmTipMaterialize(el);
  const raw = el.dataset.tip || '';
  const kbd = el.dataset.tipKbd || ''; // 纯键位（nmApplyTip 写的，不再过 nmKbdWrap）
  const hint = el.dataset.tipH || '';
  const parts = [];
  let kbdPlaced = false;
  const placeKbd = () => { if (!kbdPlaced) { parts.push([kbd, 'nm-tip-k']); kbdPlaced = true; } };
  // 正文段：`{0}` 指定键位位置（老文案把括号写在正文里，如「恢复默认（{0}）」）
  const segs = raw.split('{0}');
  if (!kbd) nmStripEmptyKbdParen(segs);
  segs.forEach((seg, i) => {
    if (seg) parts.push([seg, '']);
    if (i < segs.length - 1) placeKbd();
  });
  // 后缀段：`{0}` 也可以放在 TipH 里（如「（{0}）（按住 ⌘ ：设为已完成）」），同样只插一次键位
  if (hint) {
    const hsegs = hint.split('{0}');
    if (!kbd) nmStripEmptyKbdParen(hsegs);
    hsegs.forEach((seg, i) => {
      if (seg) parts.push([seg, 'nm-tip-h']);
      if (i < hsegs.length - 1) placeKbd();
    });
  }
  if (!kbdPlaced) placeKbd(); // 哪都没有 {0} → 键位接最末尾（原行为）
  t.textContent = ''; // 文案随状态变（待办按钮 / 过滤眼睛）→ 每次整段重建，别只改第一段
  parts.forEach(p => {
    if (!p[0]) return; // 空段不建（否则悬停会多出零宽 span）
    const s = document.createElement('span');
    s.className = p[1] || 'nm-tip-t';
    s.textContent = p[0];
    t.appendChild(s);
  });
}
// 悬停时把文案灌进提示元素（文案可能随状态变，每次都刷一遍最稳）
document.addEventListener('mouseover', e => {
  const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
  if (el) nmTipRefresh(el);
});
// 不带括号的键位串：右键菜单右侧那一列小字用（2026-09-21 用户定：菜单里不要括号，直接 ⌘C）。
// 注意：**保留它和 nmKeySuffix 共用一份取值逻辑**（都走 nmKeyText），别各写一遍 —— 改键实时变这条不能只生效一半。
function nmKeyPlain(act, fallback) { return nmKeyText(act, fallback); }
function nmKeyText(act, fallback) {
  // 该动作没绑键 → 空串：提示里**连括号一起不显示**（2026-09-18 定格式、2026-09-22 用户重申）。
  // 取值优先级：① 原生快捷键页当前生效的键 → ② 画布写死键（Tab/Enter 这类）→ ③ 传进来的兜底键。
  // fallback **只留给画布内写死的键**（剪切/复制/撤销/重做这类不走 Obsidian 绑定、永远有效的）；
  // 靠命令绑定的动作一律不给 fallback —— 否则用户把键清空后，提示里还会挂着一个按了没反应的键。
  return (state.canvasHotkeys && state.canvasHotkeys.disp && state.canvasHotkeys.disp[act])
    || nmFixedKeyText(act)
    || (fallback ? modStr(fallback) : '');
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
    // 「只显示 Now」固定打一级的 #btn-now-side（2026-10-18 三档机制拆除，二级菜单那条落点已删）；
    // 命令照旧可用（置灰态不响应）
    case 'showNow': { const b = document.getElementById('btn-now-side'); if (b && !b.disabled && !b.classList.contains('disabled')) setShowNow(!state.showNow); break; }
    case 'hideMinor': { const b = document.getElementById('btn-hide-done'); if (b && !b.disabled && !b.classList.contains('disabled')) setHideDone(!state.hideDone); break; }
    case 'drill': if (state.selectedId) drillInto(state.selectedId); break;
// 三条「右键菜单同款」命令（2026-09-21）：选中节点 → 复制节点链接 / 复制 AI 定位路径；视图整体 → 保存为捷径
case 'copyNodeLink': { const r = state.selectedId ? findNode(state.tree, state.selectedId) : null; if (r) copyNodeLinkOf(r.node); break; }
case 'copyAILocate': { const r = state.selectedId ? findNode(state.tree, state.selectedId) : null; if (r) copyAILocateOf(r.node); break; }
// AI 生成标记（2026-10-05）：一次打标、再触发清除，循环切换（toggleAinodeAtFocus 里已含落点判定）
case 'aiMark': toggleAinodeAtFocus(); break;
    case 'aiRules': editAiRulesOfSelected(); break;   // 2026-10-07：新命令「AI｜添加 AI 更改规则」进来走这条
    // 子文档（2026-10-09）：命令「其它｜新增子文档」与「＋添加 → 子文档」同一份实现
    case 'addChildDoc': addChildDoc(); break;
case 'saveShortcut': { const rt = currentRoot(); if (rt) bookmarkOf(rt); break; }
    // 路径三键（2026-10-06 搬到宿主的系统标题栏上）：宿主那几颗按钮发 canvasAction 过来 →
    // 走画布里同一份实现，与「更多」菜单里那四项完全同行为。
    case 'path-back': historyBack(); break;
    case 'path-fwd': historyForward(); break;
    case 'path-default': returnToDefault(); break;
    case 'path-save': saveAsCurrent(); break;
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
// 落点 = app.css :root「定位调参 · 中央」区的 --locate-x / --locate-y：
//   选中/编辑中 → --locate-x + --locate-y；主节点 → 同一个中央（--locate-x + --locate-y）。
// 首版在这里自造了 NM_CENTER_X/Y，用户指出重复造轮子 → 删掉，全部走 locateCenter / placeCardAtViewport。
function canvasCenterSelected() { // **只认选中/编辑中的节点**（2026-09-18 用户定：没选中 → 不动；定位主节点是另一条命令的事，别兜底）
  const activeId = state.selectedId || state.editingTitleId || state.editingNoteId || state.editingAiRulesId || null;
  if (!activeId) return;
  const el = document.querySelector('.node-row[data-id="' + activeId + '"] .card');
  if (el) placeCardAtViewport(el, cfgNum('--locate-x', 0.5));
}
function canvasCenterRoot() { // 主节点（整张导图的根）回**中央**（--locate-x + --locate-y，与选中节点同一位）
  const el = state.tree && document.querySelector('.node-row[data-id="' + state.tree.id + '"] .card');
  if (el) placeCardAtViewport(el, cfgNum('--locate-x', 0.5));
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
// ===== 编辑目标「存 / 取」（2026-10-07 用户定：快捷键改完节点状态要回到**原来那个地方**）=====
// 为什么不能只"光标落末尾"：用户可能正编到标题中间、或者正在改备注 —— 落末尾等于把人踢到别处。
// 存的是「编哪一块（标题/备注）+ 哪个节点 + 光标在纯文字里的字符偏移」；偏移而不是 DOM 位置，
// 因为动作会 render() 重建卡片，旧的 Range / 节点全作废。
function caretOffsetIn(el) {
  try {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer)) return null;
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  } catch (_) { return null; }
}
function setCaretOffset(el, offset) {
  try {
    if (!el || offset == null) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, left = offset;
    while ((n = walker.nextNode())) {
      if (left <= n.nodeValue.length) {
        const r = document.createRange();
        r.setStart(n, left); r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        return true;
      }
      left -= n.nodeValue.length;
    }
  } catch (_) {}
  return false;
}
function captureEditTarget() {
  const el = state.editingEl;
  if (!el) return null;
  const kind = state.editingNoteId ? 'note' : (state.editingTitleId ? 'title' : '');
  const nodeId = state.editingNoteId || state.editingTitleId;
  if (!kind || !nodeId) return null;
  return { kind, nodeId, offset: caretOffsetIn(el) };
}
function resumeEditTarget(t) {
  if (!t) return;
  try {
    const r = findNode(state.tree, t.nodeId);
    if (!r) return;
    const row = document.querySelector('.node-row[data-id="' + t.nodeId + '"]');
    if (!row) return; // 节点被藏起来 / 不在画面上 → 老老实实不回到编辑
    if (t.kind === 'note') {
      const textEl = row.querySelector('.note > div');
      if (!textEl) return;
      const b = textEl.getBoundingClientRect();
      startEditNote(r.node, textEl, { x: b.left + 4, y: b.top + 4 });
      setTimeout(() => setCaretOffset(textEl, t.offset), 0); // 等编辑会话把光标摆好再覆盖
      return;
    }
    const titleEl = row.querySelector('.title');
    if (!titleEl) return;
    startEdit(r.node, titleEl, null, true);
    const tt = titleTextEl(titleEl);
    if (tt) setTimeout(() => setCaretOffset(tt, t.offset), 0);
  } catch (_) {}
}
// 编辑态仍然放行的画布动作（2026-09-18 首版两条；2026-10-01 用户报「编辑时 ⌘L 转不了待办」后扩表）。
// 判据 = **不碰正在编辑的那段文字、也不把编辑会话整个换掉**，只切节点状态 / 视图筛选：
//   · 节点状态类：todo / todoDone / now / minor / red / yellow
//     —— 这几个在编辑时**用鼠标点那排按钮本来就能用**（按钮/菜单条目的 mousedown 早已 preventDefault
//        保住焦点，动作里的 render() 又会先把编辑收尾保存再重建树，见 render() 的重绘闸门）。
//        键盘只是把同一件事补上：以前鼠标能点、键盘按了没反应，纯属这条白名单漏了。
//   · 视图筛选类：showNow / hideMinor。
//   · 光标类：editStart / editEnd（从头 / 从末尾，只挪光标）。
// ⛔ 不放行的（各有理由，别顺手加）：bold（编辑态里它是「选区加粗」，与节点级加粗是两回事）、
//   editNote（会把焦点抢去备注编辑）、drill / locate / center*（挪视图或换当前主节点）、
//   add*（新建节点）、saveShortcut（要弹命名框 + 开新视图）。
// ⚠️ 放行 ≠ 编辑不结束：这些动作最后都会 render()，而 render() 的规矩是「重建前先把编辑收尾保存」
//   → 文字不会丢，但编辑态会结束 —— 与用鼠标点那颗按钮的表现完全一致。
// aiMark（2026-10-05 加入）：与 now / minor 同为「节点标记」类，编辑态放行 —— 行为一致（会结束编辑，但文字不丢）
const NM_EDIT_MODE_ACTIONS = ['editStart', 'editEnd', 'todo', 'todoDone', 'now', 'minor', 'red', 'yellow', 'showNow', 'hideMinor', 'aiMark'];
// 编辑态里执行完这些动作后**回到编辑态**（2026-10-07 用户定）：都是"改当前节点状态"的动作 ——
// 改完多半还想接着打字，不该让人再双击一次才能继续。
// ⛔ 不回的：showNow / hideMinor（视图筛选，跟这段文字没关系）、editStart / editEnd（本身就是光标动作）。
const NM_EDIT_RESUME_ACTIONS = ['todo', 'todoDone', 'now', 'minor', 'red', 'yellow', 'aiMark'];
// 键位表更新后，把**已建好**的提示重写一遍键位段。
// ⚠️ 2026-10-06 改成**登记制**（原来是一张手写的 6 条名单：bold/red/yellow/now/minor/note）。
//    为什么必须改：装载期建的那些提示，建的时候 `state.canvasHotkeys` 还是 null（键位表随 init 才到）
//    → 键位段一律取到空串。名单外的（左下「定位」「隐藏」「Now」、底部「待办」、AI 面板那几行）
//    装载期建完就**再没刷过** → 用户在官方页设了键，界面上一个都不显示（2026-10-06 实报）。
//    → 登记制：凡是用 nmApplyTip 挂过动作 id 的都记一笔，刷新时整批重算，**以后加新提示不会再漏**。
//    ⚠️ 只重算键位段、**不回写文案**：文案会随状态变（待办按钮 3 句、过滤眼睛 3 句），
//       拿登记时那句覆盖回去会把当前该显示的那句冲掉（这就是原来那条 `more.addNoteTip` 踩的坑）。
function refreshCanvasHotkeyTips() {
  NM_TIP_ACTS.forEach((r, el) => {
    if (!el.isConnected) { NM_TIP_ACTS.delete(el); return; } // 元素已经不在页面上 → 顺手清掉，别越攒越多
    if (!el.querySelector(':scope > .nm-tip')) return; // 还没悬停过 → 提示元素没建，等第一次悬停时按新键位建即可
    const k = r.kbd != null ? r.kbd : nmKeyText(r.act);
    if (k) el.dataset.tipKbd = k; else delete el.dataset.tipKbd;
    nmTipRefresh(el); // 用**当前** data-tip 重画（不碰文案）
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
  // ⌘F / Ctrl+F：打开右侧「搜索」面板并聚焦输入框（2026-10-22 用户定）。
  //   画布是 iframe —— 宿主的全局键收不到这里的按键，所以必须由我们截下来再通知宿主。
  //   编辑态（改标题 / 备注）不接管：那里没有"查找"可言，别抢用户的输入。
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'f') {
    if (!(t && t.contentEditable === 'true')) {
      e.preventDefault(); e.stopPropagation();
      vscode.postMessage({ type: 'openSearchPanel' });
      return;
    }
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
      // 白名单内的动作（节点状态 / 视图筛选 / 从头从末尾）编辑态照常放行 —— 名单与理由见 NM_EDIT_MODE_ACTIONS 注释
      else if (hk && NM_EDIT_MODE_ACTIONS.indexOf(hk) >= 0) {
        e.preventDefault();
        // 这些动作最后都会 render() → 编辑收尾保存、编辑态结束（文字不丢）。用户 2026-10-07 定：
        // 「改节点状态」这类动作做完要**回到编辑态**，而且是回到**原来那个地方**
        //（标题中间 / 备注里都算，不是一律甩到末尾）；节点被藏起来时 resumeEditTarget 自己有守卫。
        const _editBack = captureEditTarget();
        runCanvasAction(hk);
        if (_editBack && NM_EDIT_RESUME_ACTIONS.indexOf(hk) >= 0) resumeEditTarget(_editBack);
      }
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
  // ⚠️ 这些分支**只消费裸键**（2026-09-22 实踩修 Ctrl+Tab：Tab 分支原来没排除修饰键，Ctrl+Tab 被
  // addChild() 截胡、转不到宿主 → 「转到下一个标签页」等系统快捷键失灵；Ctrl+Delete 甚至会误删节点）。
  // 带修饰键的组合键一律落到这条链最后的转发分支（nmHostForwardable → 宿主键位表 / 合成 keydown）。
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
  // ⌘A 全选（2026-10-07 用户定）：画面上看得见的节点全部选中，便于批量操作（如全设 Now 再统一取消）。
  // 编辑态 / 历史只读态**跑不到这里**（上面两条分支各自提前 return）→ 编辑时仍是浏览器原生全选文字。
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAllNodes(); }
  // ⌥⌘C = 清除格式拷贝（2026-10-19 用户定）：去掉行尾那截 `<!--id; fold; color; minor; now; AI 标记-->`，
  //   其余（待办 `- [ ]` / 加粗 / 代码块 / 备注 / 缩进层级）照旧 —— 粘到聊天窗口不再带一堆注释噪音。
  //   ⚠️ 必须认 `e.code`：按住 ⌥ 时 macOS 上 `e.key` 会变成 `ç`，按 'c' 判永远不中。
  else if ((e.metaKey || e.ctrlKey) && e.altKey && String(e.code || '') === 'KeyC') { e.preventDefault(); copySelectedNode(true); }
  // ⌥⌘V = 粘贴（2026-10-24 定）：⌥⌘C 清格式复制之后，顺手就想 ⌥⌘V 粘回去。
  //   ⚠️ macOS 上这个组合**不是原生粘贴键**（浏览器不为它生成 paste 事件），而链尾的 nmHostForwardable
  //   原来会把它当"要转给宿主的组合"送出去 → 画布里一点反应都没有。这里直接走右键「粘贴」同一个出口
  //   （读剪贴板 → applyPastedText），效果与 ⌘V 一致。同样必须认 e.code：按住 ⌥ 时 e.key 会变成 '√'。
  else if ((e.metaKey || e.ctrlKey) && e.altKey && String(e.code || '') === 'KeyV') { e.preventDefault(); pasteFromClipboard(); }
  else if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); copySelectedNode(); } // 复制节点：写死键（未迁移，Mod+C 与系统复制撞车不给默认）
  else if ((e.metaKey || e.ctrlKey) && e.key === 'x') { e.preventDefault(); cutSelectedNode(); } // 剪切节点：写死键（未迁移）
  // ⌘E（下钻）/ ⌘P（定位循环）的写死键已删（2026-09-18 用户定：这两个命令已注册进官方快捷键页，
  // 写死内容不再保留 —— 要键位去官方页绑一次）。⌘Z/⌘C/⌘X、Tab/Enter 等未注册，写死保留。
  else if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); addChild(); }
  else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); addSibling(); }
  // 方向键 = 选中导航（2026-09-19 用户定：**回到画布内写死**）。原因：注册成命令后它成了全局快捷键，
  // 源文件视图里按方向键会被截走（实踩：光标动不了）→ 写死在这里，键出不了 iframe，也不再进键位表。
  // 顺序在用户绑的键之后：谁给别的表态动作绑了裸方向键，仍以用户为准。
  else if (e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); canvasSelectPrevNode(); }
  else if (e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); canvasSelectNextSibling(); }
  else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); canvasSelectParent(); }
  else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); canvasSelectChild(); }
  else if (e.key === 'Escape') {
    if (isPreviewOpen()) { e.preventDefault(); closeImagePreview(document.getElementById('img-preview')); } // Esc 关闭预览
    // 全屏中 Esc = 退出全屏（2026-10-01 用户定）：窗口全屏 / 桌面全屏**都直接退到非全屏**，
    // 等价于点那颗「退出全屏专注模式」按钮（不是"退一档"，桌面档也不会先退回窗口档）。
    // ⚠️ 只消费裸键（Escape 带修饰键留给宿主，跟上面其它写死键同一条规矩）。
    // ⚠️ 桌面档另有兜底：Electron leave-full-screen / HTML fullscreenchange 收尾（见 main.js onload）。
    // 📌 编辑态 / IME 组字态的按键**跑不到这里**：上面 `contentEditable === 'true'` 与 typeProxy 两条分支
    //    会提前 return。这是 2026-10-01 换成 Electron 窗口全屏后**才真正成立**的假设 —— HTML fullscreen 时代
    //    浏览器会绕过这条链直接收掉全屏，判据永远跑不到（ROADMAP 有完整诊断）。
    else if (fsModeNow && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); vscode.postMessage({ type: 'fullscreenExit' }); }
  }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    // 2026-08-31 修：选中了图片时，删除 = 删这张图（与 Cmd+X 剪切图片同逻辑），不该删掉整个节点
    if (state.selectedImg) removeSelectedImage();
    else deleteNode();
  }
  else if (e.key === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) { // 空格预览：打开↔关闭切换（对齐 macOS 桌面预览习惯，2026-08-26 改为可再按空格关闭）
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
    // key 用 nmEventKey（归一后的键名）：Windows 上 Shift 会把 e.key 变形（Ctrl+Shift+, = '<'），
    // 原样发出去宿主就对不上绑定（存的是 ','）—— 2026-09-22 修 Windows 符号键失灵的另一半。
    vscode.postMessage({ type: 'hostHotkey', key: nmEventKey(e), code: String(e.code || ''), mod: !!(e.metaKey || e.ctrlKey), alt: !!e.altKey, shift: !!e.shiftKey });
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
  scheduleAutoSnapshot(text); // 复用刚算好的文本（别重复序列化整棵树）；**停手之后**才真去存（见 AUTO_SNAP_IDLE_MS）
  scheduleLinkTitles(); // 内容变了 → 里面可能多了/换了跨文件节点链接，补一次目标标题（节流）
  scheduleDocLinks();    // 同上：可能多了/少了已放入思维导图数据库的文档链接，补一次「是不是文档」的判定（节流，2026-10-08）
}
// 自动快照（2026-08-27）：内容真变了才存，且 AUTO_SNAP_INTERVAL 内最多一次，避免快照爆炸。
// 手动命名存档（manualSaveSnapshot）也走这里并标记，保证"手动存完不会立刻又自动存一份相同内容"。
// 2026-09-14 两处调整：①时间窗判断提到序列化之前——窗口内直接返回，不再白算一遍整棵树；
// ②文本可由 emitUpdate 传入复用。注意 AUTOSNAP 只管"存几个版本"，文件本身每次编辑都已写盘。
// 🔴 2026-10-16 改成「停手之后再存」（用户定）：存一份快照要在磁盘上做 3~5 次读写（写快照 + 读索引 +
//   写索引 + 清理扫描），撞在用户正点着的那一刻就是一下卡（实测：撞上的那次从发起到存完 148ms，
//   没撞上的只要 4~17ms；同一次日志里六次折叠，只有撞上快照的那一次卡）。
//   现在内容一变只记一个待存标记 + 重置静置计时，**停手 AUTO_SNAP_IDLE_MS 之后**才真去存 ——
//   磁盘那几下落在用户没在操作的时候。连续操作一直不停手时按 AUTO_SNAP_MAX_WAIT 保底
//   （与 scheduleEdges 同一套「静默合批 + 保底上限」写法）。
const AUTO_SNAP_INTERVAL = 20 * 1000; // ← 版本颗粒度旋钮：20 秒（原 2 分钟）；改小 = 版本更密、占盘更多
const AUTO_SNAP_IDLE_MS = 1500;       // 停手多久之后才真去存
const AUTO_SNAP_MAX_WAIT = 60000;     // 保底：一直不停手也最多拖这么久（防"一整段连续工作一个版本都没存"）
let lastAutoSnap = 0;
let lastAutoSnapText = ''; // 上次落盘快照的文本，用于"内容没变就不存"
let autoSnapTimer = null, autoSnapFirstAt = 0, autoSnapPending = null;
// 内容变了 → 只排一次「停手后再存」（不在这里做任何磁盘动作）
function scheduleAutoSnapshot(text) {
  if (state.historyMode) return;
  if (typeof text === 'string') autoSnapPending = text;
  if (autoSnapTimer == null) autoSnapFirstAt = Date.now();
  else clearTimeout(autoSnapTimer);
  const wait = (Date.now() - autoSnapFirstAt >= AUTO_SNAP_MAX_WAIT) ? 0 : AUTO_SNAP_IDLE_MS;
  autoSnapTimer = setTimeout(() => { autoSnapTimer = null; flushAutoSnapshot(); }, wait);
}
// 真去存（由静置计时器调；没有待存内容时退回现序列化一份）
function flushAutoSnapshot() {
  if (autoSnapTimer) { clearTimeout(autoSnapTimer); autoSnapTimer = null; }
  autoSnapFirstAt = 0;
  const text = (typeof autoSnapPending === 'string') ? autoSnapPending : undefined;
  autoSnapPending = null;
  autoSnapshot(false, text);
}
function autoSnapshot(force, preText) {
  if (state.historyMode) return; // 历史页只读：不自动存快照（避免存下"快照的快照"）
  const now = Date.now();
  if (!force && now - lastAutoSnap < AUTO_SNAP_INTERVAL) return; // 时间窗内 → 不存（最便宜的检查放前面）
  const text = typeof preText === 'string' ? preText : serialize(state.tree);
  if (!force && text === lastAutoSnapText) return; // 内容没变 → 不存
  lastAutoSnap = now;
  lastAutoSnapText = text;
  vscode.postMessage({ type: 'saveSnapshot', text: text, name: '', source: 'auto' }); // 空 name + auto = 编辑时自动保存（参与清理）
}
// AI 定位前自动备份（2026-09-27 用户定）：点「AI 定位节点」/「AI 编辑」时，插件先把当前内容存一份快照，
// 复制出去的定位文案里会写明「已自动备份，无需再手动备份」→ 外部 AI 读到就不必自己跑 snapshot.py
// （省一步，也少一处出错的地方）。
// 与 autoSnapshot 的差别：① 带快照名（历史面板里一眼认得出是「AI 改前」的版本）；
//   ② source='ai'（与外部脚本 snapshot.py 写的标记一致，同样参与自动清理）；
//   ③ 不受 20 秒时间窗限制 —— 点 AI 定位是明确的「我要改了」信号，每次都该留一份。
// 防连点：与上一次自动备份的内容逐字相同就跳过（AI 还没改之前连点几次，只留一份）。
let lastAiSnapText = '';
function autoSnapshotBeforeAi() {
  if (state.historyMode) return; // 历史页只读，不存快照（同 autoSnapshot）
  const text = serialize(state.tree);
  if (text === lastAiSnapText) return; // 内容没变 → 不存
  lastAiSnapText = text;
  vscode.postMessage({ type: 'saveSnapshot', text: text, name: T('snap.beforeAiEdit'), source: 'ai' });
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
  // 已转出的节点不许被外部重载「复活」（见 `_exportGrave` 那段说明）：转出搬文件触发的重载会把盘上
  //   还没删干净的内容推回来，在这里再摘一次；摘过就把纠正后的内容写回盘（写回幂等 —— 宿主认得自己的写，不会回环）。
  const graveHit = _exportGrave.size ? pruneExportGrave(state.tree) : false;
  if (opts.filename !== undefined) state.currentFilename = opts.filename;
  if (opts.filePath !== undefined) state.filePath = opts.filePath; // 完整绝对路径（复制 AI 定位路径用）
  if (opts.aiScriptPath !== undefined) state.aiScriptPath = opts.aiScriptPath; // 快照脚本绝对路径（预埋进 AI 定位文案，省得 AI 自己推 vault 根）
  // ⚠️ 空图（empty）不许套用「未命名 → 文件名」的兜底：套了就等于把空图悄悄补出一个主节点，
  //    用户剪切走主节点后打开又冒出来一个，等于没剪（2026-10-11）。
  if (!state.tree.empty && state.tree.title === '未命名' && state.currentFilename) state.tree.title = state.currentFilename;
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
  if (graveHit) emitUpdate();   // 墓碑节点刚被摘掉 → 把纠正后的内容写回盘（别等用户下次编辑）
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
  if (msg.type === 'fsMode') { applyFsMode(msg.mode); return; } // 全屏档变化（2026-09-22）：路径条让位见 applyFsMode
  if (msg.type === 'setHideHint') { // 设置页切换「隐藏新增页面提示」→ 即时生效（2026-09-01）
    state.hideHint = !!msg.value;
    render();
    return;
  }
  // （setAddPanel 消息已随「添加面板简化」设置机制一起删除：2026-09-21 起面板顺序固定，不再有可下发配置）
  // （setTodoBtn 消息已随「待办按钮位置」设置一起删除：2026-10-18 —— 固定「底部常驻」，无消息链路）
  if (msg.type === 'setMorePanel') { // 设置页改「按钮简化」→ 左下菜单即时收掉 / 放回条目（2026-09-18）
    state.morePanel = (msg.value && typeof msg.value === 'object') ? msg.value : null;
    updateMoreMenu();
    applyMorePanelButtons(); // 🔴 2026-10-10：名单现在也管左下那两颗按钮（join-group / guide）
    return;
  }
  if (msg.type === 'linkTitlesRes') { // 跨文件节点链接的目标标题（2026-09-29）：拿到就补进显示
    const m = (msg.map && typeof msg.map === 'object') ? msg.map : null;
    let changed = false;
    if (m) for (const k of Object.keys(m)) {
      const t = String(m[k] || '');
      if (t && linkTitleMap[k] !== t) { linkTitleMap[k] = t; changed = true; }
    }
    // 预取模式（展开前，见 prefetchLinkMeta）：只更新表、不渲染 —— 调用方会带着终态统一渲染一次。
    // 这样「展开动画播完又整树重建一次、外面卡片瞬移」就不会发生（2026-10-16 日志实证）。
    if (_prefetchCb) { _prefetchTick(); return; }
    // 标题会改变卡片宽度 → 布局要重排一次。
    // ⚠️ 正在编辑（标题/备注）时绝不能重渲染 —— render 会把编辑框整个换掉，用户正在敲的字当场丢失
    //   （applyIncoming 对同一件事也做了守卫）。编辑结束后自会有下一次渲染用上新标题。
    // ⚠️ `state.tree` 判据不能少（2026-10-08 实报「Cannot read properties of null (reading 'id')」）：
    //   state.tree 为空时 currentRoot() 返回 null → render 拿 null 去 buildRow → 读 node.id 当场抛。
    //   与 enterHistorySnapshot 那条同一个口径（「别拿空树去 buildRow」）。
    if (changed && !booted) {
      // 开屏还没完成（booted 门闩还没放开）：此刻的卡片已经渲染过了，重渲染会插进定位流程中间。
      // 先记一笔，等门闩放开时补一次渲染 —— 否则就会出现「切走再回来，链接显示的还是原文，
      // 点一下别的按钮才变回目标标题」（2026-09-29 实报：请求发得早、响应在揭幕前就到了）。
      linkTitlesPendingRender = true;
    } else if (changed && state.tree && !state.editingEl && !state.editingTitleEl && !state.editingNoteId
        && state.view === 'map' && !state.historyMode) { render(); drawEdges(); }
    return;
  }
  if (msg.type === 'setMotion') { // 设置页「高级 → 动效」（2026-09-20）：正开着的画布立刻生效
    motionEnabled = !!msg.value;
    if (!motionEnabled && motionFrame) { clearCardMove(); drawEdges(); } // 关的那一刻正在播 → 立刻落地
    return;
  }
  if (msg.type === 'setAiFeatures') { // 设置页「高级 → 实验性功能 → AI 功能」（2026-10-08）：正开着的画布立刻生效
    aiFeaturesOn = !!msg.value;
    applyAiFeaturesVisibility();
    return;
  }
  if (msg.type === 'setDocsLibrary') { // 设置页「高级 → 实验性功能 → 文档库」（2026-10-08）：正开着的画布立刻生效
    applyDocsLibrary(!!msg.value);
    return;
  }
  if (msg.type === 'setAiPlusMenu') { // 调试区「AI ＋子菜单」开关（2026-10-18）：正开着的画布立刻生效
    state.aiPlusMenu = !!msg.value;
    if (!state.aiPlusMenu) closeAiPlusMenu(); // 关掉时若子菜单正开着，当场收掉
    return;
  }
  if (msg.type === 'setDebugLog') { // 调试区「日志」总开关（2026-10-18）：开着才把诊断日志发给宿主
    dbgLogOn = !!msg.value;
    return;
  }
  // 「转出思维导图」宿主那边干完了（2026-10-10）：内容已经落成文件夹 / 文件 → 这边收拾画布。
  //   ① 转出的是**主节点** → **不删**（删了这张图就空了、它的历史也跟着没）：
  //      子节点全清 + 主节点标题换成「已转出」（用户定：这也是"这张图已经导出过、可以删了"的提示）。
  //   ② 转出的是**普通节点** → 连它那棵子树一起摘掉（转入是新建、转出就删掉，两边对应）。
  if (msg.type === 'exportMapDone') {
    const p = _exportPending;
    _exportPending = null;
    if (!p || !state.tree) return;
    try {
      // 母节点：整张图都转出去了 → 宿主已经把导图文件删掉（用户 2026-10-10 改主意），
      //   这边什么都不用改 —— 标签页会自己关掉，硬去改反而会往一个已删文件里写东西。
      if (p.isRoot) { toast(T('export.doneToast')); return; }
      // 普通节点：靠 **pid** 回头找（不能用存下来的节点对象 —— 外部重载后它已经不在树里了）
      //   并把它记进「墓碑」：转出搬文件触发的那次外部重载**回包可能晚于本消息**，届时要再摘一次（见 `_exportGrave`）
      if (p.pid) _exportGrave.add(p.pid);
      const found = p.pid ? findNodeByPersistId(state.tree, p.pid) : null;
      if (!found) return;
      const hit = findNode(state.tree, found.node.id);
      if (hit && hit.parent) {
        // 摘之前先存一份"要摘掉的这棵子树 + 它在哪"（2026-10-17）：宿主那条 toast 上要挂「撤销」，
        //   点了就把这个对象原样插回去。对象已经从树里脱开，不存在被后续编辑改脏的问题。
        if (msg.undoToken) {
          try {
            _exportUndo.set(String(msg.undoToken), { node: hit.node, parentId: hit.parent.id, index: hit.index });
            setTimeout(() => { try { _exportUndo.delete(String(msg.undoToken)); } catch (_) {} }, 8000);
          } catch (_) {}
        }
        hit.parent.children.splice(hit.index, 1);
      }
      // 选中的节点可能刚被摘掉 → 清掉选中，别让工具栏 / 菜单对着一个不存在的节点
      if (state.selectedId && !findNode(state.tree, state.selectedId)) state.selectedId = null;
      if (state.editingTitleId && !findNode(state.tree, state.editingTitleId)) closeEdit();
      render();
      emitUpdate();
      toast(T('export.doneToast'));
    } catch (e) { try { wlog('转出后收拾画布失败: ' + e); } catch (_) {} }
    return;
  }
  if (msg.type === 'doclinkShellsRes') { doclinkShellsRes(msg); return; } // 复制时批量建壳的回包（2026-10-19）
  if (msg.type === 'docLinksRes') { // 已放入思维导图数据库的文档判定回包（2026-10-08）：拿到就换图标
    // 整表替换（不是合并）—— 宿主的答案永远是当前实况，转出 / 改名 / 删除后图标自己变回方括号
    const next = (msg.map && typeof msg.map === 'object') ? msg.map : Object.create(null);
    // 2026-10-09 加：名字 → 引用**总处数**（宿主算好的）。它决定"这个节点是不是被多处管理"。
    const nextRefs = (msg.refs && typeof msg.refs === 'object') ? msg.refs : Object.create(null);
    // 🔴 2026-10-10 加：名字 → **文件类型**（'map' / 'mmlink' / 'image' / 'video' / 'audio' / 'doc'）。
    //   文档节点的**前缀图标**按它选（与右侧文档库面板同一套口径）—— 指向思维导图就显示插件图标、
    //   指向捷径就显示 ↗，不再一律显示"文档"那只。
    const nextKinds = (msg.kinds && typeof msg.kinds === 'object') ? msg.kinds : Object.create(null);
    // ⚠️ 内容没变就不重渲染：这个回包每次改内容都会来一趟（emitUpdate → scheduleDocLinks），
    //    无条件 render 会让「每编辑一次」都多一次全量重绘 —— 大图上很显眼。
    const nextKeys = Object.keys(next), prevKeys = Object.keys(docLinkMap);
    let changed = nextKeys.length !== prevKeys.length;
    for (let i = 0; !changed && i < nextKeys.length; i++) { if (docLinkMap[nextKeys[i]] !== next[nextKeys[i]]) changed = true; }
    // 处数变了也要重画（转出 / 新增一处引用都会变）
    const rk = Object.keys(nextRefs), pk = Object.keys(docRefMap);
    if (!changed && rk.length !== pk.length) changed = true;
    for (let i = 0; !changed && i < rk.length; i++) { if (docRefMap[rk[i]] !== nextRefs[rk[i]]) changed = true; }
    // 类型变了也要重画（同一份文件被改名成导图 / 捷径，图标要跟着换）
    const kk = Object.keys(nextKinds), qk = Object.keys(docKindMap);
    if (!changed && kk.length !== qk.length) changed = true;
    for (let i = 0; !changed && i < kk.length; i++) { if (docKindMap[kk[i]] !== nextKinds[kk[i]]) changed = true; }
    docLinkMap = next;
    docRefMap = nextRefs;
    docKindMap = nextKinds;
    // 预取模式（展开前，见 prefetchLinkMeta）：只换表、不渲染（同 linkTitlesRes 那处）。
    if (_prefetchCb) { _prefetchTick(); return; }
    if (!changed) return;
    // 🔴 开屏还没完成（booted 门闩没放开）：卡片此刻已经画过了，重渲染会插进定位流程中间 → 先记一笔，
    //   等门闩放开时补一次渲染（照 linkTitlesRes 那套，见 linkTitlesPendingRender）。
    //   2026-10-08 实踩：漏了这条 → 回包在开屏途中到达就被丢掉，图标一直停在方括号，
    //   得等用户编辑 / 回车触发下一次 render 才对（用户实报「重启后、跳走再回来都渲染不成文档形式」）。
    if (!booted) { docLinksPendingRender = true; return; }
    // 与 linkTitlesRes 同一套守卫（含 state.tree —— 空树时 render 会拿 null 去 buildRow）
    if (state.tree && !state.editingEl && !state.editingTitleEl && !state.editingNoteId
        && state.view === 'map' && !state.historyMode) { render(); drawEdges(); }
    return;
  }
  if (msg.type === 'docsChanged') { // 宿主报告「已放入思维导图数据库的集合变了」（转入 / 转出 / 删除 / 改名之后，2026-10-08）
    // 转出 / 转入改的是**别的**文件，导图文件本身没被改 → 画布收不到 update，只能靠宿主推这一条。
    // 立刻问一次，再补一次：宿主刚改完名，metadataCache 吃进结果可能慢一拍，第一次可能还是旧答案。
    // （重算很便宜：一次消息 + 一张小表的比对；答案没变就不重渲染，见 docLinksRes）
    requestDocLinks();
    scheduleDocLinks();
    // ⚠️ 2026-10-09 加**第三次、更晚的**一次：改名那条路是「Obsidian 去改写别处的链接」，
    //   改写完那个文件要**重新加载**画布才会看到新名字 —— 而重新加载 + 重建树可能比 400ms 还慢。
    //   那时第二次问到的还是**旧名字**（宿主解析不到 → 节点当场掉色，而且要等下一次内容变化才恢复，
    //   用户实报「改名之后蓝色就没了」）。这一枪专门兜这个时间差；答案没变就不重渲染，代价可忽略。
    setTimeout(() => { try { requestDocLinks(); } catch (_) {} }, 1500);
    return;
  }
  if (msg.type === 'docNodeDeleteAnswer') { // 宿主对「这些节点管理着文件，要不要一起删」的回答（2026-10-08 建、2026-10-09 改成数组）
    docNodeAskPending = false;
    // 路径一律用**宿主回传**的（它现场解析过，比本地判定表可靠）
    const paths = (Array.isArray(msg.paths) ? msg.paths : []).map(p => String(p || '')).filter(Boolean);
    if (msg.choice === 'node' || msg.choice === 'notDoc') {
      deleteNode(true); // 'notDoc' = 那些链接都不是已放入思维导图数据库的文件 → 照常直接删节点，不打断
    } else if (msg.choice === 'both') {  // 节点 + 文件一起删
      deleteNode(true);
      // 先删节点（落盘）再叫宿主删文件；宿主会**跳过本视图**（skipSelf），
      // 免得它读到最后落盘前的旧内容、把刚删掉的节点又改回来。
      // ⚠️ 右键菜单那条「删除该文档」**不能**带 skipSelf（那条节点还在，正等着被清理）。
      // confirmed：用户**刚刚在弹窗里确认过**了 → 宿主别再弹第二次确认框（2026-10-08 用户实报"多重弹窗"）。
      for (const p of paths) vscode.postMessage({ type: 'deleteDoc', path: p, fromNode: true, skipSelf: true, confirmed: true });
    }
    return; // 'cancel'（Esc / 点遮罩 / 取消按钮）→ 什么都不做
  }
  if (msg.type === 'newChildDocRes') { // 宿主建完子文档的回包（2026-10-09）：插子节点 + 选中 + 居中
    try { addChildDocRes(msg); } catch (e) { /* 插节点失败不影响画布 */ }
    return;
  }
  if (msg.type === 'importToNodeRes') { // 「转入 → 挂到当前导图的选中节点」的回包（2026-10-12）：插到此刻选中的节点下
    try { importToNodeRes(msg); } catch (e) { /* 插节点失败不影响画布 */ }
    return;
  }
  // 外部拖入（文件列表 → 节点）的三条：**由宿主转发**，因为拖拽事件进不了 iframe（2026-10-17 实测）。
  if (msg.type === 'extDragAt') {   // 指针在画布上的位置（宿主每帧最多发一条，kind 已判好；alt=⌥ 复制进来）
    try { extDragOver(Number(msg.x) || 0, Number(msg.y) || 0, msg.kind, !!msg.alt); } catch (_) {}
    return;
  }
  if (msg.type === 'extDropAt') {   // 松手了（宿主已把文件对象存好；alt=⌥ 复制进来，不搬文件）
    try { extDragDropAt(Number(msg.x) || 0, Number(msg.y) || 0, !!msg.alt); } catch (_) {}
    return;
  }
  // ⌥ 拖进来（复制）的两条回包：单文件 / 整棵文件夹树（2026-10-19）
  if (msg.type === 'dupDocRes') { try { dupDocRes(msg); } catch (_) {} return; }
  if (msg.type === 'shortcutDropRes') { try { shortcutDropRes(msg); } catch (_) {} return; }
  if (msg.type === 'shortcutDropTreeRes') { try { shortcutDropTreeRes(msg); } catch (_) {} return; }
  if (msg.type === 'extDragEnd') {  // 拖到一半放弃 / 拖出画布 → 收提示
    try { endExtDrag(); } catch (_) {}
    return;
  }
  if (msg.type === 'nodeDragOut') { // 拖着**画布节点**出了画布（2026-10-17）：先把贴边自动滚停掉
    try { stopAutoScroll(); } catch (_) {}
    extOutStop = true;   // 记着"指针在外面"：等 iframe 里再收到 dragover 就报 nodeDragIn 回去
    extOutAlt = !!msg.alt;   // 宿主的 dragover 读到的 ⌥（可靠）；自己的 keydown 只当备用
    return;
  }
  if (msg.type === 'nodeDropOut') { // 拖着画布节点在画布外松手（2026-10-17）
    try {
      const id = nodeDragOutId; nodeDragOutId = '';
      const hit = id ? findNode(state.tree, id) : null;
      if (!hit || !hit.node) return;
      if (msg.alt) {
        // ⌥ 拖出 = **创建副本并导出**（镜像一份到外面），画布一动不动（2026-10-18 用户定，原 ⌘ 改成 ⌥）。
        //   结构照转出的老规则来：普通节点 → **文件夹**、文档节点 → **文档捷径壳**（点开一步见正文）、
        //   文档节点还带子节点 → 壳 + 同名文件夹。所以这里**不挑节点**，整棵子树原样交给宿主，
        //   由它按 copyMode 落成结构（体检/重名顺延/建目录全复用转出那套）。
        const isRoot = (state.tree.id === hit.node.id);
        vscode.postMessage({ type: 'exportMapTree', tree: exportTreeOf(hit.node), isRoot: isRoot, copyMode: true });
        return;
      }
      exportNodeTree(hit.node);
    } catch (_) {}
    return;
  }
  // 「一步反悔」（2026-10-17）：宿主把「结果 + 撤销」送到底部这条唯一 toast 上（它那边弹不出带按钮的提示）
  if (msg.type === 'undoToast') {
    try {
      // label 为空 = 纯提示（不挂按钮）：⌘ 拖出生成文档捷径那条走这里（2026-10-17）
      const label = String(msg.label || '');
      toast(String(msg.text || ''), false, label ? {
        label: label,
        fn: () => { try { vscode.postMessage({ type: 'undo', token: String(msg.token || '') }); } catch (_) {} },
      } : null, Number(msg.ms) || 0);
    } catch (_) {}
    return;
  }
  if (msg.type === 'undoExportNode') {   // 撤销转出：把刚才摘掉的子树插回原位
    try { undoExportNode(String(msg.token || '')); } catch (_) {}
    return;
  }
  if (msg.type === 'importFolderRes') { // 「转入仓库文件夹（挂到选中节点）」的回包（2026-10-12）：整棵结构插到选中节点下
    try { importFolderRes(msg); } catch (e) { /* 插节点失败不影响画布（函数内部已回 fail 给宿主） */ }
    return;
  }
  if (msg.type === 'locateDocRef') { // 文档面板点「1｜2｜3」：那张图**已经开着** → 就地定位，不重新开文件
    try { locateDocRefOnce(msg.ref); } catch (_) {}
    return;
  }
  if (msg.type === 'docSplitOpened') { // 点击文档节点后右侧分屏**新建**好了（宿主回推，2026-10-11）：
    // 画布刚被压窄 → 把被点的节点**只沿 X 轴**滑到左侧半屏正中（Y 轴与缩放都不动，见 slideCardToX）。
    try { locateAfterDocSplit(msg.nodeId, Number(msg.wSplit) || 0); } catch (_) {}
    return;
  }
  if (msg.type === 'docSplitsClosed') { // 点了「关闭分屏」图标、右侧分屏已整组关掉（宿主回推，2026-10-11）：
    // 画布刚恢复全宽 → 把画面**向右平移**：平移量 =（恢复的宽度 × --close-split-slide，默认 0.5 = 挪回居中）
    // + extra（左侧边栏被放回时要额外补的那一截）+ wFinal（宿主算好的最终宽度 → 立刻开滑，2026-10-11）。
    try { slideAfterSplitClose(Number(msg.wBefore) || 0, Number(msg.extra) || 0, Number(msg.wFinal) || 0); } catch (_) {}
    return;
  }
  if (msg.type === 'setAiRulesFull') { // 「AI 更改规则」整块显示 / 收成小横条（2026-10-06）：宿主推来 → 只应用、不回写
    setAiRulesFull(!!msg.value, false);
    return;
  }
  // （setFilterMode 消息已随「视图筛选」三档机制一起删除：2026-10-18 —— 固定「展开」，无消息链路）
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
    refreshCanvasHotkeyTips(); // 已建好的提示按登记重算键位段（styleMenu / 底部工具条只在装载时建一次，会冻结旧键位）
    updateMoreMenu(); // 撤销 / 重做那两行的快捷键小字当场刷新
    return;
  }
  // ═══ 搜索（2026-10-21；2026-10-22 去掉路径条与筛选同步）══════════
  if (msg.type === 'searchInMap') {   // 「这张导图」搜索：整张图都搜，结果分四段（看得见 / 折叠 / 被隐藏 / 视图之外）
    const q = String(msg.q || '').trim().toLowerCase();
    // currentRoot() 在下钻时是那一层、没下钻时就是整棵树 —— 用它的子树边界切「当前视图 / 视图之外」
    const res = q ? searchTreeTiers(q, currentRoot()) : null;
    vscode.postMessage({
      type: 'searchInMapResult', reqId: msg.reqId, q: msg.q,
      tiers: res ? res.tiers : { visible: [], folded: [], hidden: [], outside: [] },
      counts: res ? res.counts : { visible: 0, folded: 0, hidden: 0, outside: 0 },
    });
    return;
  }
  if (msg.type === 'searchLocate') {  // 点搜索结果 → 定位到那个节点（title 是没有 pid 时的兜底）
    locateByPidOrId(String(msg.pid || ''), String(msg.id || ''), String(msg.title || ''));
    return;
  }
  if (msg.type === 'setFsHotkey') { // 宿主推来的「全屏专注模式」键位串（2026-10-06）：改了键要当场换掉提示里的 {fsHk}
    // ⚠️ 全屏键**不走画布键位表**（那条命令不是 CANVAS_ACTIONS 里的动作，是宿主命令）→ 单独一条消息推。
    fsHotkeyText = (typeof msg.value === 'string') ? msg.value : '';
    applyFsMode(fsModeNow); // 唯一出口：它会用新 fsHotkeyText 重算 fsTip() 并重挂两颗全屏按钮的提示
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
  if (msg.type === 'crumbGo') { // 宿主标题栏上的面包屑：点其中一段 → 跳到那一层（2026-10-06）
    goTo(msg.pid || null, { keep: 'root' }); // 与原来点面包屑同一个动作：锚点 = 旧主节点
    return;
  }
  if (msg.type === 'navState') { // 上一/下一路径能不能走（宿主算好下发；跨文件之后只有它知道全貌）
    state.navCanBack = !!msg.canBack;
    state.navCanFwd = !!msg.canFwd;
    // 「更多」菜单里那两项跟着置灰（标题栏那两颗由宿主自己刷）
    const mb = document.querySelector('#more-menu .mm[data-act="path-back"]');
    const mf = document.querySelector('#more-menu .mm[data-act="path-fwd"]');
    if (mb) mb.disabled = !state.navCanBack;
    if (mf) mf.disabled = !state.navCanFwd;
    return;
  }
  if (msg.type === 'moreAction') { // 宿主那颗「更多」菜单点了我们这几项 → 走画布自己那套动作（2026-10-06）
    moreMenuAction(msg.act);
    return;
  }
  if (msg.type === 'gotoPid') { // 宿主让我们跳到某一条路径（同一个文件里那种；跨文件由宿主自己开文件）
    goTo(msg.pid || null, { keep: 'root' });
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
        r.node.ainode = ainodeAfterEdit(r.node.ainode); // 粘贴图片 = 节点内容被人动过 → AI 节点降为混合（2026-10-14）
        clearFreshPlaceholderTitle(r.node.id); // 刚新建的空节点 → 顺手把占位「新节点」清掉（2026-10-12）
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
  // 「本地文件链接」弹窗左下角那颗（2026-10-07）：宿主选好文件回传绝对路径 → 填进弹窗并自动确认
  if (msg.type === 'pickLocalPathRes') { applyPickedLocalPath(msg.path || '', !!msg.cancelled); return; }
  if (msg.type === 'setDocSplits') { applyDocSplits(!!msg.on); return; } // 右侧文档分屏开/关（2026-10-11）→ 那颗图标显隐
  if (msg.type === 'imgUriRes') {
    // 资源可访问地址返回：填到对应元素上（img/video/audio 通用），并缓存
    // ⚠️ 「展开前预取」用的游离 <img> 不在 document 里，querySelectorAll 找不到它 → 单独从 imgPrefetchEls 取。
    const _pfEl = imgPrefetchEls.get(msg.id);
    if (_pfEl) imgPrefetchEls.delete(msg.id);
    const _reqEls = Array.from(document.querySelectorAll('[data-req="' + msg.id + '"]'));
    if (_pfEl) _reqEls.push(_pfEl);
    _reqEls.forEach(im => {
      if (msg.uri) {
        im.src = msg.uri; imgUriCache[im.dataset.path] = msg.uri;
        delete imgUriMissTs[im.dataset.path]; // 命中正常缓存：清掉可能存在的负缓存时间戳（2026-10-10）
        im.classList.remove('img-missing'); delete im.dataset.missing; im.alt = ''; // 恢复成正常图
      } else if (im.tagName === 'IMG') {
        imgUriCache[im.dataset.path] = null; imgUriMissTs[im.dataset.path] = Date.now(); // 缺图负缓存：TTL 内不再重复问宿主（2026-10-10）
        markImgMissing(im, im.dataset.path); // 图片 → 显示可见的「缺失」占位（音视频保持原样式）
        // 2026-09-17：主动补一次 error —— 缺失图不会设 src，因此永远不会自己触发 load/error，
        // 而开屏的 layoutSettled 正在等「每张图都有结论」。不补这一下就必等满兜底时间（开屏慢两三秒的根因）。
        try { im.dispatchEvent(new Event('error')); } catch (_) {}
      } else {
        imgUriCache[im.dataset.path] = null; imgUriMissTs[im.dataset.path] = Date.now(); // 音视频缺失同样进负缓存（2026-10-10）
        im.classList.add('img-missing');
      }
    });
    return;
  }
  if (msg.type === 'licenseUpdate') {
    state.isPro = !!msg.isPro; // 授权状态实时更新（host 的 licenseState 变化后推送；hover/click 实时读它，锁立刻跟变）
    if (typeof msg.licenseSource === 'string') state.licenseSource = msg.licenseSource;
    return; // 状态栏那颗「激活 Pro」由宿主自己刷文案/显隐（2026-10-21），前端不再管
  }
  if (msg.type === 'init') {
    // 「全屏专注模式」命令的快捷键显示串（2026-10-01）：**必须在 applyFsMode 之前**收下，
    // 否则首次刷提示时 fsHotkeyText 还是空 → 提示里那对括号永远不出现（要切一次全屏才补上）。
    if (typeof msg.fsHotkey === 'string') fsHotkeyText = msg.fsHotkey;
    applyFsMode(msg.fsMode || ''); // 全屏档随 init 下发：全屏状态下新开的画布也要立刻给路径条让位（2026-09-22）
    // 🔴 2026-10-20 用户实报「改完文档名，右边这张图刷新一下、视图就不知道跑哪去了」：
    //   根因 = 改名会让 Obsidian 改写导图里的 wikilink → 导图文件被 modify → 宿主 externalReload → **再发一次 init**
    //   → 整个画布重建。重建时若照宿主那份存档重新摆位，而存档落后一拍（persist 是异步的），画面就跳了；
    //   更糟的是下面 `savedPid === state.currentRootPid` 那条核对一旦对不上，会直接走"开屏重新居中"。
    //   修法：**重载态（booted=true 说明画布已经渲染过）就以"用户此刻眼前那一帧"为准** ——
    //   把当前 zoom / pan / 下钻路径先记下来，重建完照它还原，压根不看存档。
    const isReloadInit = !!(booted && savedViewKey);
    const keepZoom = zoom, keepPanX = panX, keepPanY = panY;
    const keepRootPid = state.currentRootPid || '';
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
    // 路径位置表随 init 灌入（2026-10-06）：宿主把这份视图攒下的「每条路径一份位置」整个下发，
    // 前端自己按**最终落到哪条路径**去查 —— 宿主猜不准（pid 下钻失败时前端会自愈回主节点）。
    // 顺带兼容老存档：老数据只有 views['']（带 currentRootPid），查不到 pid 分桶时会回落用它。
    pathViews = (msg.viewsByPid && typeof msg.viewsByPid === 'object') ? msg.viewsByPid : {};
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
    // 重载态：沿用重建前所在的那一层（别退回存档里的，也别回默认路径 —— 那正是"跳走"）
    if (isReloadInit) drillPid = keepRootPid;
    else if (hasSavedView && saved.currentRootPid) drillPid = saved.currentRootPid;
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
    // 🔴 2026-10-20 用户实报「新建 / 点开导图时，新手提示先闪一下再消失」：
    //   根因 = `state.hideHint` 原来在 applyIncoming **之后**才赋值（原来那行在下面 applyDarkMode 那一批里），
    //   而 applyIncoming 里就会建树 + 渲染 → **首帧按旧值（首次进来是 false）把提示画出来**，
    //   等 init 后半段把 hideHint 改成 true、再重绘一次才消失 = 用户看到的"闪一下"。
    //   → 挪到建树之前，跟 hideDone / showNow 同一批（上面那条"过滤开关先于建树写入状态"讲的就是这个道理）。
    //   ⚠️ 只影响"首帧画不画提示"，别把它再挪回去。
    if (typeof msg.hideHint === 'boolean') state.hideHint = !!msg.hideHint;
    applyIncoming(msg.text, { filename: msg.filename || '', filePath: msg.filePath || '', aiScriptPath: msg.aiScriptPath || '', drillPid: drillPid, isLink: !!msg.isLink, defaultPid: msg.defaultPid || '' }); // filePath：init 必须透传，否则 state.filePath 空 → 复制 AI 定位路径只剩文件名（2026-09-01 修）
    applyTheme(msg.theme || 'default'); // 主题随 init 下发（2026-08-31）
    // 画布底色两档随 init 下发（2026-09-20）：必须先写进 state，再 applyDarkMode —— 它内部会按当前档贴底色。
    // msg.dark 已是「宿主算好的结论」（跟随档 = Obsidian 明暗；强制档 = 用户选的那档），前端不重复判断。
    if (msg.canvasBg && typeof msg.canvasBg === 'object') {
      state.canvasBgLight = String(msg.canvasBg.light || '');
      state.canvasBgDark = String(msg.canvasBg.dark || '');
    }
    if (typeof msg.docSplits === 'boolean') applyDocSplits(msg.docSplits); // 右侧有没有文档分屏（2026-10-11）→ 那颗「关闭分屏」图标显隐
    applyDarkMode(!!msg.dark); // 深色模式随 init 下发（2026-09-18 跟随 Obsidian；2026-09-20 起可在设置页小窗里强制浅/深）
    applyAccent(msg.accent); // Obsidian 主题色随 init 下发（2026-09-20）：链接色默认跟着它，读不到就留空走 CSS 兜底
    // （2026-10-20 挪走了：`state.hideHint` 现在在 applyIncoming **之前**赋值 —— 否则首帧会先画出新手提示
    //   再被重绘抹掉，用户看到"闪一下"。见上面"过滤开关先于建树写入状态"那段。）
    if (typeof msg.aiPlusMenu === 'boolean') state.aiPlusMenu = !!msg.aiPlusMenu; // AI「＋」子菜单开不弹（调试区开关，2026-10-18）
    if (typeof msg.debugLog === 'boolean') dbgLogOn = !!msg.debugLog; // 统一诊断日志总开关（调试区，2026-10-18）
    if (typeof msg.motion === 'boolean') motionEnabled = msg.motion; // 动效开关随 init 下发（设置页「高级 → 动效」，2026-09-20）
    if (typeof msg.aiFeatures === 'boolean') { aiFeaturesOn = msg.aiFeatures; applyAiFeaturesVisibility(); } // 「AI 功能」总开关随 init 下发（2026-10-08，默认关）
    if (typeof msg.docsLibrary === 'boolean') setDocsLibrary(msg.docsLibrary); // 「文档库」总开关随 init 下发（2026-10-08，默认关）
    // 「AI 更改规则」整块显示 / 收成小横条随 init 下发（2026-10-06）：直接写状态，别走 setAiRulesFull
    // —— 那一刻树还没建好，走它会触发一次多余的 render（init 后面本来就要渲染）。
    if (typeof msg.aiRulesFull === 'boolean') aiRulesFullOn = !!msg.aiRulesFull;
    // （视图筛选形态 2026-10-18 起不再随 init 下发：固定「展开」，无消息链路）
    state.morePanel = (msg.morePanel && typeof msg.morePanel === 'object') ? msg.morePanel : null; // 左下「更多」菜单的条目显隐随 init 下发（2026-09-18）
    state.canvasHotkeys = (msg.canvasHotkeys && typeof msg.canvasHotkeys === 'object') ? msg.canvasHotkeys : { match: {}, disp: {} }; // 画布键位表随 init 下发（2026-09-18）
    refreshCanvasHotkeyTips(); // 底部工具条按钮在装载期就建好了（那时键位表还没到）→ 提示补上键位段
    updateMoreMenu(); // 名单随 init 到 → 当场按它收 / 放（2026-09-18）
    applyMorePanelButtons(); // 🔴 2026-10-10：同一份名单也管左下那两颗按钮（join-group / guide）
    invalidateAddMenus(); // 面板内容跟着新配置走，下次悬浮重建
    state.isLink = !!msg.isLink;
    state.isPro = !!msg.isPro; // 是否 Pro（2026-09-04：= licenseState.active，功能权限；试用期内也为 true → 功能不锁）
    state.licenseSource = msg.licenseSource || 'none'; // 'license'=已授权；'trial'/'none'=未授权（前端拦截用；状态栏那颗由宿主刷）
    state.trialRemainingMs = (typeof msg.trialRemainingMs === 'number' && msg.trialRemainingMs > 0) ? msg.trialRemainingMs : 0; // 试用剩余毫秒（宿主状态栏文案用）
    state.defaultPid = normPid(msg.defaultPid); // 保存的默认路径 pid（.mmlink=文件内 mmlinkPid / 普通思维导图笔记=workspaceState）
    // 「隐藏完成」与「只看 Now」的关闭态已在上方建树前预置（persist=false 不回写，避免 init 时
    // 和扩展互相 ping-pong）；这里只剩「只看 Now」开启态——它需要建树后算可见快照（2026-09-13）
    // 「只看 Now」的开屏恢复（2026-10-01 重构）：
    //   存档里是什么就恢复成什么，然后做**一次静默检查**：若当前视图（含折叠）确实没有可见 Now → 静默关掉。
    //   ⚠️ 不弹 toast、不落盘（showNowSaved 保持 true）：折叠 / 拖拽造成的"暂时看不见"在会话期间不触发，
    //   但重新打开页面时兜底检查一次（用户 2026-10-01 定）。
    //   判据用 collectUsableNows（含折叠 + hideDone），比会话期间的 hasNowInScope 更严格。
    if (typeof msg.showNow === 'boolean') showNowSaved = !!msg.showNow;
    if (showNowSaved) setShowNow(true, false);
    if (state.showNow && state.tree && collectUsableNows(currentRoot()).length === 0) {
      setShowNow(false, false, true); // 静默关，不弹 toast
    }
    updateNowFilterItem();
    requestLinkTitles(); // 跨文件节点链接的目标标题：异步去要，拿到再补（不阻塞开屏定位）
    requestDocLinks();   // 「已放入思维导图数据库的文档」判定：同一套批量问法（2026-10-08；2026-10-09 起不看总开关）
    // 恢复 / 默认 视图：单坐标系下 render 前直接还原即可（无滚动范围依赖，不会被 clamp）
    // 2026-09-29：还原前先核一次「这份存档是哪条路径上记的」，对不上就不用。
    //   存档里的 currentRootPid = 记下这个位置时下钻在哪个节点；而这次真正落到哪条路径，要等
    //   applyIncoming 跑完才知道 —— 下钻失败时它会自愈回主节点、把 currentRootPid 清空（见 goTo 兜底）。
    //   两条对不上还照旧摆旧位置，画面就落到内容之外的角落（主节点跑到画面外，得手动再定位一次）。
    //   这种情况改走开屏定位（与「无记忆」同一条路）：宁可重新居中，也别停在一个看不懂的位置上。
    const savedPid = (saved && saved.currentRootPid) || '';
    // 🔴 2026-10-20：重载态只要**还停在同一层**就用内存里那份位置（不看存档、也不重新居中）；
    //   万一外部变更让那一层不存在了（下钻自愈回主节点）→ 落到下面那条原逻辑，该重新居中就重新居中。
    const reloadPidOk = isReloadInit && (state.currentRootPid || '') === keepRootPid;
    const useSavedView = reloadPidOk || (hasSavedView && savedPid === (state.currentRootPid || ''));
    if (hasSavedView && !useSavedView) {
      vscode.postMessage({ type: 'log', text: 'init 视图记忆与当前路径不符，改用开屏定位: savedPid=' + (savedPid || '(主节点)') + ' curPid=' + (state.currentRootPid || '(主节点)') });
    }
    if (useSavedView) {
      if (reloadPidOk) {
        // 重载态：直接照重建前那一帧摆回去（用户眼前的位置，比存档准）
        zoom = keepZoom; panX = keepPanX; panY = keepPanY;
        vscode.postMessage({ type: 'log', text: 'init 重载：沿用当前视口 zoom=' + zoom + ' pan=' + panX + ',' + panY });
      } else {
        // 2026-10-06：优先用「这条路径自己那份」位置，查不到再用 views[''] 那份（老存档 / 首次访问该层）。
        // 两者此刻必然同 path（上面 useSavedView 已核过 savedPid === 当前 pid），取哪个都不会摆错层。
        const pv = pathViewOf(state.currentRootPid);
        zoom = pv ? pv.zoom : saved.zoom;
        panX = pv ? pv.panX : (saved.panX || 0);
        panY = pv ? pv.panY : (saved.panY || 0);
      }
      applyTreeTransform();
    }
    // 等布局（图片/字体异步加载）真正稳定再定位/揭幕，否则 reflow 让定位结果漂移
    // 2026-08-30 揭幕：render 前 opacity:0，等"首帧布局稳定"再显示（见 startInitCenter 的 onSettled）
    // 🔴 「新建导图开屏进主节点编辑并全选」已整体撤掉（2026-10-10 用户定）：
    //    画面就一个主节点，**不选中、不进编辑、不抢系统焦点** —— 想改名自己点节点。
    //    （原来那套凭证 / enterRootEdit / startEditById 连锁一起删了，别再往回加。）
    const reveal = () => {
      viewMap.style.opacity = '';
    };
    layoutSettled(() => {
      try {
        // 🔴 2026-10-16 修「打开导图后画面重画一次、抖一下」（用户实测复现 + 两轮日志定量确认）：
        //    开屏途中到达的两条回包（linkTitlesRes / docLinksRes）原先一路攒到 booted 放开**之后**才补渲染，
        //    而那时 startInitCenter(reveal) 已经揭幕 → 用户看见「画面又重画一次」，标题变长还会把画面推偏。
        //    改到**揭幕之前、定位之前**同步补：这一帧 viewMap 还是 opacity:0，整树重建看不见；
        //    顺带让下面的开屏定位按**终态**标题算，不再被推偏。
        if (linkTitlesPendingRender || docLinksPendingRender) {
          linkTitlesPendingRender = false;
          docLinksPendingRender = false;
          render();
          drawEdges();
        }
        if (useSavedView) {
          drawEdges(); // 位置已还原，布局稳定后只需重画曲线
        } else {
          // 2026-08-29：开屏智能定位，不再整画布居中（大树会飘走）。
          // 🔴 2026-10-11 用户定（开屏取景换规则）：改用 placeContentAtCenter() —— 按**整张内容**取景
          //   （内容中央对 40%、母节点距左缘 --locate-left-gap 就停），不再按"主节点"对位；
          //   定位按钮 / 下钻返回等其它定位入口不受影响（还是原规则）。
          placeContentAtCenter();
        }
        startInitCenter(reveal);
        updateDefaultPathBtn();
        updateUndoRedo();
        booted = true; // 还原完成，之后用户操作才写回
        // 开屏定位完成 → 现在才把「我落在哪一层」报给宿主（跨文件导航历史要用）。
        // ⚠️ 必须等 booted：init 期间 pid 会从 '' 变到真实值，中途上报会被宿主当成"用户下钻了一步"
        //    → 明明刚打开、什么也没点，却多出一条可回退的路径（2026-10-06 用户实报）。
        updatePathMenuBtns();
        // 兜底（2026-10-16）：揭幕前那一发（见上面 layoutSettled 开头）已经消化了绝大多数回包；
        // 这里只接「定位 / 揭幕期间又恰好到达」的漏网，窗口极小。真走到这儿说明又要可见重建一次 ——
        // 但总比让链接停在原文、文档图标停在方括号上强。
        if (linkTitlesPendingRender || docLinksPendingRender) {
          linkTitlesPendingRender = false;
          docLinksPendingRender = false;
          setTimeout(() => { try { render(); drawEdges(); } catch (_) {} }, 0);
        }
        // 文档面板点进来的「定位到第 N 个引用」（2026-10-08）：同样等开屏收尾后再做，
        // 免得插进定位 / 揭幕流程中间
        if (msg.docRef) { const r = msg.docRef; setTimeout(() => { try { locateDocRefOnce(r); } catch (_) {} }, 0); }
        reportHistState(); // 画布就绪：主动上报一次「我在编辑态」，把面板的 currentTs 清掉（见 reportHistState 注释）
        // 🔴 注：新建导图「开屏进主节点编辑」已整体撤掉（2026-10-10 用户定），这里不再有任何进编辑的钩子
      } catch (e) {
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
    setTimeout(() => { if (!booted) { booted = true; reveal(); if (linkTitlesPendingRender || docLinksPendingRender) { linkTitlesPendingRender = false; docLinksPendingRender = false; try { render(); drawEdges(); } catch (_) {} } try { vscode.postMessage({ type: 'log', text: 'init 门闩兜底：3 秒未到 booted=true，强制放开' }); } catch (_) {} } }, 3000);
    return;
  }
  if (msg.type === 'sync') {
    // 同一文件的另一个面板改了内容：只刷新显示，不写回（防回环）
    applyIncoming(msg.text);
    requestLinkTitles(); // 内容换了 → 里面的跨文件链接可能也换了，重新要一次标题
    scheduleDocLinks();  // 内容换了 → 里面可能多了/少了已放入思维导图数据库的文档链接，补一次判定（节流）
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
    t: n.title || '', // 链接已并入正文（2026-09-29），不再单列一项
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
// recenter 只在【首次进入历史界面】时传 true —— 把当前主节点摆到「中央」，给一个稳定的初始视角。
// 之后换快照 / 折叠触发的重绘一律不传 → 视口原地不动（用户调过的缩放与位置就是"这次进历史的视角"）。
function renderHistoryTree(recenter, withMotion) {
  if (!state.historyTree) return;
  // 历史页模型：state.tree 此时已指向快照树（进入时一次性交换，关闭时还原）。
  // 这里直接 render，不再临时交换——折叠/框选/复制等交互都复用实时视图同一套逻辑。
  state.selectedId = null;               // 历史页无选中高亮
  state.multiSelected = new Set();
  // withMotion：折叠/展开这类交互要平滑让位（2026-09-20 放开历史态动效）；首次进入/切快照仍用普通 render。
  if (withMotion) renderWithMotion(); else render(); // 完全复用：连线、缩放、平移、卡片样式；差异标记由 render 末尾统一补
  // 首次进入归位：2026-10-21 起走 placeContentAtCenter（**按整张内容**取景，与「打开导图」同一套）。
  // ⚠️ 归位内部读 --locate-reset-zoom → 会把 zoom 打回 1，所以只能首次做，否则切快照会清掉用户的缩放。
  // （原 firstDiffNode / centerHistoryOnFirstDiff「居中到第一个差异节点」已按用户意见删除。）
  if (recenter) {
    // 2026-10-21 用户定：首次进历史**按整张内容取景**（与「打开导图」同一套 placeContentAtCenter），
    //   不再按「主节点居中」那把旧尺子 —— 大一点的图主节点会明显偏左，但整张图在画面正中，这才是要的。
    //   ⚠️ 别在这里改回 placeCardAtViewport：它读 --locate-reset-zoom 会把 zoom 打回 1 的副作用两边一样，
    //     但"按主节点对位"是 2026-10-11 就已经在开屏取景里被换掉的旧逻辑。
    placeContentAtCenter();
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
    nowLocateIndex: state.nowLocateIndex,
    zoom: zoom, panX: panX, panY: panY,       // 视口：沙盒里缩放/平移也带不出去
    pathViews: Object.assign({}, pathViews),  // 路径位置表同理：沙盒里逛出来的位置不带出去（2026-10-06）
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
  state.nowLocateIndex = s.nowLocateIndex;
  zoom = s.zoom; panX = s.panX; panY = s.panY;
  pathViews = s.pathViews || {}; // 路径位置表整组还原（2026-10-06）
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
  // 用途：① 沙盒只在首次存白板 / 装初值；② 只在首次把主节点归位到「中央」。
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
  // 这一版【一个 Now 节点都没有】→ 退出「只看 Now」。语义同编辑态的 `checkShowNowAutoClose`
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
  //   完全出画 → 回中央（--locate-x/--locate-y，缩放不变）。其余场景一律保持锚定。
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
    // 手动存版本 = manual：即使名字留空也永不清理（旧逻辑会把它当自动快照清掉）
    vscode.postMessage({ type: 'saveSnapshot', text: text, name: (val || '').trim(), source: 'manual' });
    toast(T('toast.versionSaved'));
  });
}

// 「只看差异」按钮已删除（2026-09-14 用户定）：进历史快照时就自动只看差异，
// 由 enterHistorySnapshot 直接调 applyDiffOnlyFold，不再有开关与消息。

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ webview 内自建浮层（替代 window.prompt/confirm，VSCode webview 禁用原生弹窗） ============
// leftBtn（可选）= 左下角那颗自定义按钮：{ label, onClick }。用于「本地文件链接」弹窗的「从本机选择」。
function showPrompt(title, placeholder, onOk, onCancel, initial, leftBtn) {
  closePrompt(); // 先清掉可能残留的
  const mask = document.createElement('div');
  mask.className = 'wb-mask';
  mask.id = 'wb-prompt-mask';
  mask.innerHTML = '<div class="wb-dialog">'
    + '<div class="wb-dialog-title">' + escapeHtml(title) + '</div>'
    + '<input class="wb-input" type="text" placeholder="' + escapeHtml(placeholder || '') + '">'
    + '<div class="wb-dialog-actions">'
    // 左下角那颗（2026-10-07 用户定）：`wb-btn-left` 靠 margin-right:auto 顶到最左，其余按钮留在右边
    + (leftBtn && leftBtn.label ? '<button class="wb-btn wb-btn-left">' + escapeHtml(leftBtn.label) + '</button>' : '')
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
  if (leftBtn && leftBtn.onClick) {
    const lb = mask.querySelector('.wb-btn-left');
    if (lb) lb.onclick = () => { try { leftBtn.onClick(); } catch (_) {} };
  }
  mask.onclick = e => { if (e.target === mask) cancel(); };
  input.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); ok(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };
  setTimeout(() => input.focus(), 0);
}
// 带说明文字的小弹窗（2026-09-17 加，「更多」菜单里需手填的入口用它）：
// hint = 输入框上方的灰色小字（解释这个入口是什么意思）；fields = 1~2 个输入框的占位提示
// leftBtn（可选）= 左下角那颗自定义按钮：{ label, onClick }。用于「本地文件链接」弹窗的「从本机选择」。
function buildPrompt(title, hint, fields, onOk, initials, leftBtn) {
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
    // 左下角那颗（2026-10-07 用户定）：`wb-btn-left` 靠 margin-right:auto 顶到最左，其余按钮留在右边
    + (leftBtn && leftBtn.label ? '<button class="wb-btn wb-btn-left">' + escapeHtml(leftBtn.label) + '</button>' : '')
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
  if (leftBtn && leftBtn.onClick) {
    const lb = mask.querySelector('.wb-btn-left');
    if (lb) lb.onclick = () => { try { leftBtn.onClick(); } catch (_) {} };
  }
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
function showPromptH(title, hint, placeholder, onOk, initial, leftBtn) {
  buildPrompt(title, hint, [placeholder], vals => { if (onOk) onOk(vals[0]); }, [initial], leftBtn);
}
// 「从本机选择」：请宿主弹出系统文件选择器 —— iframe 里 <input type=file> 拿不到真实磁盘路径
//（新版 Electron 已移除 File.path），所以必须和图片/视频入口一样在宿主侧做（见 main.js pickLocalPath）。
// 用户 2026-10-07 定：选完就等于填好并确认，不用再手动点一下。
function pickLocalFileIntoPrompt() {
  vscode.postMessage({ type: 'pickLocalPath' });
}
// 宿主选好本机文件回传的绝对路径（2026-10-07）：填进弹窗第一个输入框 → 直接点「确定」
function applyPickedLocalPath(p, cancelled) {
  if (!p) { if (!cancelled) toast(T('notice.pickPathFail'), true); return; } // 用户自己取消 → 不报错
  const box = document.querySelector('#wb-prompt-mask .wb-input-0');
  if (box) box.value = p;
  const okBtn = document.querySelector('#wb-prompt-mask .wb-btn-ok');
  if (okBtn) okBtn.click();   // 等同用户点了「确定」
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
// 缺图负缓存（2026-10-10）：缺的图也写缓存（值 = null + 时间戳），TTL 内重渲染直接按缺失画占位，
// 不再每张图每次都问一遍宿主（旧走法：缺图不写缓存 → 每次 render 都重新发一轮 imgUri 消息）。
const imgUriMissTs = {};
const IMG_MISS_TTL = 30000; // 过期后重新问宿主：文件可能已被放回库里
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
// Obsidian 嵌入尺寸后缀：`![[img.png|700]]`（宽 700）/ `![[img.png|700x300]]`（宽×高）——
//   尾段是显示尺寸，不是文件名的一部分。返回 { name, w, h }：name = 剥掉尺寸的文件名；
//   w/h = 像素（没写、或不是尺寸语法 → 0，此时 name = 原串，别瞎剥）。
//   ⚠️ 与宿主 shared.splitEmbedSize 是同一件事的两份实现（前后端语言不通），改一处记得改两处。
function nmEmbedSize(p) {
  const s = String(p == null ? '' : p);
  const bar = s.lastIndexOf('|');
  if (bar < 0) return { name: s, w: 0, h: 0 };
  const m = s.slice(bar + 1).trim().match(/^(\d+)(?:x(\d+))?$/i);
  if (!m) return { name: s, w: 0, h: 0 };
  return { name: s.slice(0, bar).trim(), w: parseInt(m[1], 10) || 0, h: parseInt(m[2], 10) || 0 };
}
// 图片拖拽缩放（2026-10-21 用户定）：悬停图片右下角出现把手，拖动改宽度 → 松手把宽度写回
//   文件名后缀（`![[图.png|宽]]`，与 Obsidian 嵌入尺寸同一套语义，文件里存的就是这个数字）。
//   拖动中实时改内联尺寸（解掉缩略图那两道上限，见渲染处）；只改宽度，高度交给图片自身比例。
// 图片右下角「拖拽缩放」把手的图形（2026-10-21 用户给的设计稿：右下角折角 + 圆头）。
// 只放 <path>，颜色交给 CSS 的 currentColor（.img-resize 里 color: var(--accent)）——
// 主题色一换自动跟着变，这里别写死颜色。尺寸/位置/阴影都在 mindmap-app.css 的 .img-resize。
const IMG_RESIZE_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M20.5626 20.9948C20.1332 21.4242 19.6305 21.6337 18.9497 21.6232L2.99827 21.4451C2.45363 21.4451 1.99279 21.2566 1.60527 20.8691C0.819743 20.0836 0.80927 18.8162 1.59479 18.0307C1.99279 17.6327 2.506 17.4547 3.07158 17.4547L17.2215 17.6327L17.0225 3.50374C17.0225 2.93817 17.211 2.41448 17.5986 2.02696C18.3841 1.24143 19.6406 1.26238 20.4264 2.0479C20.814 2.43543 21.013 2.8858 21.013 3.43043L21.191 19.3818C21.191 20.0521 20.992 20.5653 20.5626 20.9948Z" fill="currentColor"/>' +
  '</svg>';

function bindImgResize(grip, img, p, node) {
  grip.addEventListener('pointerdown', (e) => {
    if (state.historyMode) return;                        // 历史只读：不许改
    e.preventDefault(); e.stopPropagation();              // 别让卡片跟着开始拖拽 / 选中
    const s = zoom || 1;
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width / s;
    const card = img.closest('.card');
    let w = Math.round(startW);
    const onMove = (ev) => {
      w = Math.max(24, Math.round(startW + (ev.clientX - startX) / s)); // 最小 24px，别拖没了
      img.style.width = w + 'px';
      img.style.height = '';                              // 高度交给图片自身比例
      img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
      // 卡片上限：图窄 → 守回 --card-maxw；图超宽 → 上限改成「图片宽 + padding」（不是 none，
      //   否则标题文字不换行、节点无限宽）。2026-10-21 用户定。
      if (card) card.style.maxWidth = cardMaxwForImg(w, card);
      scheduleEdges();                                    // 卡片一变宽，连线整列跟着动 → 下一帧重画（2026-10-21 用户实报"线不刷新"）
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      applyImgSize(node.id, p, w, img);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}
// 把宽度写回节点：附件图（node.images / node.embeds）改条目；标题里的行内图改标题原文。
//   p = 渲染时的 dataset.path（可能已带 |旧尺寸）→ 先剥再拼新尺寸；写完 emitUpdate + render，
//   下一帧就从文件名后缀读出尺寸（与手动写 ![[图|宽]] 完全同一条渲染路）。
// 图片宽度超过卡片最宽限制时才放开卡片上限（2026-10-21 用户定）：
//   图片比 --card-maxw 窄 → 卡片**继续守**上限（不然随手一拖，节点就无上限地变宽，很怪）；
//   图片比上限宽 → 放开，按图片宽度走（否则图被压回去，写了尺寸也看不出来）。
//   渲染期（`![[图|宽]]`）与拖动期（右下角把手）共用这一条判据，两处别各写一份。
function imgOverCardMaxw(w) {
  return (Number(w) || 0) > cfgNum('--card-maxw', 480);
}
// 图片比卡上限宽时，卡片的上限设成「图片宽 + 水平内边距」而**不是 `none`**（2026-10-21 用户定）：
//   设 none 等于卡片无上限 → 卡片 width:max-content 会让标题文字也不换行、一路往后延伸，
//   整个节点看着"无限宽"。设成图片宽 + padding，节点宽度就跟着图片走，文字在这个宽度里正常换行。
//   el 已挂进 DOM → 用实测 padding（准）；渲染期卡片还没进 DOM → 用旋钮近似（差几 px，肉眼无感）。
function cardMaxwForImg(w, el) {
  if (!imgOverCardMaxw(w)) return '';
  let padX;
  if (el && el.isConnected) {
    const cs = getComputedStyle(el);
    padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  } else {
    const padVar = (el && el.classList && el.classList.contains('lv1')) ? '--card-pad-lv1-x' : '--card-pad-x';
    padX = 2 * (cfgNum(padVar, cfgNum('--card-pad-x', 12)) + 1);
  }
  // +2 = 安全余量（渲染期 padding 是估算的、以及亚像素取整）—— 宁可卡片宽 2px，也不要图片被压到内边距上
  return Math.ceil((Number(w) || 0) + padX + 2) + 'px';
}
function applyImgSize(nodeId, p, w, imgEl) {
  const r = findNode(state.tree, nodeId);
  if (!r || !w) return;
  const base = nmEmbedSize(p).name;                       // 剥掉旧尺寸
  if (!base) return;
  const next = base + '|' + Math.round(w);
  const pick = (arr) => {
    if (!arr) return -1;
    let i = arr.indexOf(p);
    if (i < 0) i = arr.findIndex(x => nmEmbedSize(x).name === base);
    return i;
  };
  const iImg = pick(r.node.images), iEmb = pick(r.node.embeds);
  let titleNext = '';
  if (iImg < 0 && iEmb < 0) {                             // 行内图：改标题里的那一段
    const t = String(r.node.title || '');
    const re = new RegExp('!\\[\\[' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\|[^\\]]*)?\\]\\]');
    if (!re.test(t)) return;                              // 找不到来源（结构异常）→ 什么都不动
    titleNext = t.replace(re, '![[' + next + ']]');
  }
  pushUndo();
  if (iImg >= 0) r.node.images[iImg] = next;
  else if (iEmb >= 0) r.node.embeds[iEmb] = next;
  else r.node.title = titleNext;
  emitUpdate();
  // 🔴 2026-10-21：这里**不整树重建**（原来是一句 render()）。用户实报两个症状，都从它来：
  //   ① 「松手之后视图又刷新一下」—— 拖的时候已经把这张图的内联宽高改好了，DOM 本来就是终态，重建纯属多余；
  //   ② 「长窄图拖完，这条节点树往下坠一下又回来」—— render() 会把 <img> 换成一个**新元素**，
  //      而新元素的路径带着**新**宽度后缀（![[图|700]]），旧尺寸缓存是按旧后缀存的 → 查不到 →
  //      新图从 0 高度开始加载 → 卡片先塌下去、图到了再撑回来。宽的图塌得少，长窄图塌得最多，所以它最明显。
  //   现在只做两件事：把新尺寸按**新后缀**记进缓存（下次 render 直接占位、不再塌），再重画一次连线。
  if (imgEl) rememberImgSize(imgEl, next);
  updateUndoRedo();
  scheduleEdges();
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
  // 显式尺寸那套（![[图|700]]）一并撤掉，否则 max-width:none 会让缺失占位方块失去尺寸约束
  img.style.maxWidth = ''; img.style.maxHeight = ''; img.style.objectFit = '';
  if (p) delete imgSizeCache[p];
}
// ── 展开折叠分支前的图片尺寸预取（2026-10-16）────────────────────────────────
// 为什么需要：`imgSizeCache` 只记住**亲眼渲染过**的图的尺寸。折叠分支里的图从没渲染过 →
//   展开时渲染当场没尺寸可占位 → 图到达后把卡片撑高、整片布局下移 = 「第一次展开顿一下」
//   （第二次展开尺寸已记住就不顿）。而「位移过渡」与「重钉」两条补救都被「折叠动画正在播」挡住，救不了。
// 做法：展开**之前**先把该分支里没记住尺寸的图用 `new Image()` 预加载一遍（不进 DOM、不影响布局），
//   拿到自然宽高 → 按 CSS 的 clamp 换算成显示尺寸 → 写进 `imgSizeCache` → 再照常渲染。
//   这样渲染当场就占好位，布局从头到尾不变 —— 从源头消掉那一下跳动。
// ⚠️ 总耗时不变：这些图本来就要加载，只是把「加载」挪到了「渲染」之前；加载完会进浏览器图片缓存，
//   随后渲染进 DOM 是瞬时命中。所以不是"多花时间"，是"换个顺序"。
// ⚠️ 超时兜底：等太久就照旧渲染（宁可偶尔跳一下，也不能让展开卡住）。
const IMG_PREFETCH_TIMEOUT_MS = 400;
const imgPrefetchEls = new Map(); // 预取用的游离 <img>：req id → 元素（imgUriRes 回包时要能找到它）
let _imgPrefetchBusy = false;     // 预取进行中：期间的折叠点击直接忽略（窗口只有几百毫秒）
// 自然宽高 → 显示尺寸：与 `.card .img { max-width: var(--img-maxw); max-height: var(--img-maxh) }`
//   同一套规则（替换元素只有 max 约束时，按原比例缩到刚好不超上限）。
function imgDisplaySize(nw, nh, p) {
  if (!(nw > 0 && nh > 0)) return null;
  // 显式尺寸（`![[图|750]]` / `![[图|750x300]]`，拖拽把手写回去的就是这个）：
  //   渲染出来的显示尺寸就是它，**不能**再按缩略图上限（45×32）缩。
  //   ⚠️ 2026-10-21 用户实报「图片改过大小之后，展开时偶尔轻微抖一下」—— 根因就在这：
  //   预取把拖大的图当成缩略图算成 45×32 塞进缓存，展开当场按 45 占位，图到了再撑到 750。
  //   （与 2026-10-16 那次「第一次展开顿一下」同源：都是「渲染时没有正确的显示尺寸可占位」。）
  const esz = p ? nmEmbedSize(p) : { w: 0, h: 0 };
  if (esz.w || esz.h) {
    if (esz.w && esz.h) return { w: Math.round(esz.w), h: Math.round(esz.h) };
    if (esz.w) return { w: Math.round(esz.w), h: Math.max(1, Math.round(nh * esz.w / nw)) };
    return { w: Math.max(1, Math.round(nw * esz.h / nh)), h: Math.round(esz.h) };
  }
  const cs = getComputedStyle(document.documentElement);
  const maxW = parseFloat(cs.getPropertyValue('--img-maxw')) || 45;
  const maxH = parseFloat(cs.getPropertyValue('--img-maxh')) || 32;
  const k = Math.min(1, maxW / nw, maxH / nh);
  return { w: Math.max(1, Math.round(nw * k)), h: Math.max(1, Math.round(nh * k)) };
}
// 某个节点子树里「还没记住显示尺寸」的图片路径（去重、保序）。
// 收集口径与卡片渲染处一致：标题里的语法提升图（nmExtractInlineImages）+ 手动粘贴的附件图（node.images）。
function imgPathsNeedSize(node) {
  const out = [], seen = Object.create(null);
  (function walk(n) {
    if (!n) return;
    const list = nmExtractInlineImages(n.title || '').images.concat(n.images || []);
    for (const p of list) {
      const c = p && imgSizeCache[p];
      if (!p || (c && c.ref === imgSizeRef) || seen[p]) continue;
      seen[p] = 1; out.push(p);
    }
    (n.children || []).forEach(walk);
  })(node);
  return out;
}
// 预取：全部拿到尺寸（或失败）就 resolve；超时也 resolve（调用方照常渲染，不卡住）
function prefetchImgSizes(paths) {
  return new Promise(resolve => {
    let left = paths.length, settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { finish(); }, IMG_PREFETCH_TIMEOUT_MS);
    const one = () => { if (--left <= 0) finish(); };
    paths.forEach(p => {
      const im = new Image();
      im.onload = () => {
        const sz = imgDisplaySize(im.naturalWidth, im.naturalHeight, p); // p 带上 → 显式尺寸优先（2026-10-21）
        if (sz) imgSizeCache[p] = { w: sz.w, h: sz.h, ref: imgSizeRef };
        one();
      };
      im.onerror = () => one();
      // uri 命中缓存直接用；已知缺失（负缓存 TTL 内）就别再问；其余交给宿主问（回包靠 imgPrefetchEls 找到游离元素）
      if (imgUriCache[p]) { im.src = imgUriCache[p]; return; }
      if (p in imgUriCache && (Date.now() - (imgUriMissTs[p] || 0) < IMG_MISS_TTL)) { one(); return; }
      im.dataset.path = p;
      im.dataset.req = 'pf' + (++imgReqId);
      imgPrefetchEls.set(im.dataset.req, im);
      vscode.postMessage({ type: 'imgUri', path: p, id: im.dataset.req });
    });
  });
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
  if (relPath in imgUriCache) {
    const u = imgUriCache[relPath];
    if (u) { imgEl.src = u; return; }
    // 负缓存命中（TTL 内刚确认缺失）：直接按缺失处理 —— 与 imgUriRes 缺图分支同一套收尾
    //（补 error 是为了开屏 layoutSettled 不等满兜底，见 imgUriRes 处理处的注释）
    if (Date.now() - (imgUriMissTs[relPath] || 0) < IMG_MISS_TTL) {
      if (imgEl.tagName === 'IMG') { markImgMissing(imgEl, relPath); try { imgEl.dispatchEvent(new Event('error')); } catch (_) {} }
      else imgEl.classList.add('img-missing');
      return;
    }
    delete imgUriCache[relPath]; delete imgUriMissTs[relPath]; // 过期 → 重新问（文件可能已放回库里）
  }
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
// 放大后拖动查看（2026-10-07 用户定）：只改 translate、不动 scale。
// 不做边界吸附 —— 能拖出画面再拖回来，符合"放大后想看哪儿就拖哪儿"的直觉。
function startImgPan(e, img) {
  if (e.button !== 0) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, ox = imgPanX, oy = imgPanY;
  img.classList.add('panning');
  const move = ev => { imgPanX = ox + (ev.clientX - sx); imgPanY = oy + (ev.clientY - sy); applyImgZoom(); };
  const up = () => {
    img.classList.remove('panning');
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
function applyImgZoom() {
  const pv = document.getElementById('img-preview');
  if (!pv) return;
  const img = pv.querySelector('.img-preview-img');
  if (img) {
    // translate 在前、scale 在后 → 平移量按屏幕像素算，拖动跟手（2026-10-07）
    img.style.transform = 'translate(' + imgPanX + 'px, ' + imgPanY + 'px) scale(' + imgZoom + ')';
    img.classList.toggle('zoomed', imgZoom > 1.001); // 放大时才给抓手光标（未放大时左键仍是"上一张"）
  }
}
function closeImagePreview(overlay) {
  overlay.classList.add('hidden');
  imgZoom = 1; imgPanX = 0; imgPanY = 0; imgPreviewList = []; imgPreviewIdx = 0;
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
  imgZoom = 1; imgPanX = 0; imgPanY = 0; applyImgZoom(); // 换图 = 缩放与位置一起回到初始（2026-10-07）
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
    // 点图片本身**不再切图**（2026-10-07 用户定：容易误操作）—— 翻图只用下方那排按钮 / 左右方向键。
    // 左键仍留给"放大后拖动查看"；未放大时左键什么都不做（原来会切上一张）。
    big.addEventListener('mousedown', e => {
      if (!isPreviewOpen()) return;
      if (imgZoom > 1.001) { startImgPan(e, big); return; }
    });
    // 右键不再切下一张，只挡掉系统右键菜单（否则在预览上右键会弹出系统菜单）
    big.addEventListener('contextmenu', e => { e.preventDefault(); });
    box.appendChild(big);
  }
  big.src = '';
  reqImg(relPath, big); // 复用缓存 + 消息往返（big 在 DOM 里会被 imgUriRes 填 src）
  imgZoom = 1; imgPanX = 0; imgPanY = 0; applyImgZoom(); // 每次打开都回到原始位置（2026-10-07）
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
// 跨文件节点链接 [[笔记名#pid]] 的目标标题（2026-09-29）：只在显示层面补一句「这个链接指向哪个节点」。
// 宿主读目标文件取回来（纯运行时，不写任何文件）；取不到就照旧显示笔记名，行为与以前完全一致。
let linkTitleMap = Object.create(null);
// 开屏途中收到了目标标题、但那时不能重渲染 → 记一笔，等 booted 放开时补渲染（见 linkTitlesRes）
let linkTitlesPendingRender = false;
function linkTitleOf(note, pid) { return (note && pid) ? (linkTitleMap[note + '#' + pid] || '') : ''; }
// 向宿主要一次当前导图里所有跨文件链接的目标标题（打开时一次；之后靠宿主缓存，文件改了才重取）
function requestLinkTitles() {
  try {
    if (!state.tree) return false;
    const items = [];
    const seen = Object.create(null);
    (function walk(n) {
      if (!n) return;
      // 正文里**所有**跨文件节点链接都收集（整行也好、夹在文字里也好）—— 渲染侧对两者一视同仁，
      // 都显示目标节点当前标题，所以这里也必须一视同仁，否则会出现"有的跟随、有的不跟随"。
      const re = /\[\[([^\]#\n]+)#([^\]\n]+)\]\]/g;
      let m;
      while ((m = re.exec(String(n.title || ''))) !== null) {
        const nl = resolveNodeLink('[[' + m[1].trim() + '#' + m[2].trim() + ']]');
        if (!nl || nl.kind !== 'cross' || !nl.pid) continue;
        const k = nl.note + '#' + nl.pid;
        if (!seen[k] && !linkTitleMap[k]) { seen[k] = 1; items.push({ note: nl.note, pid: nl.pid }); }
      }
      (n.children || []).forEach(walk);
    })(state.tree);
    if (!items.length) return false;               // 没东西要问 → 宿主不会回包（预取方据此决定要不要等）
    vscode.postMessage({ type: 'linkTitles', items: items });
    return true;
  } catch (e) { return false; /* 收集失败不影响渲染：退回显示笔记名 */ }
}
// 内容变更后补一次请求（粘贴/新建/撤销/改链接都会走 emitUpdate）。
// 节流 400ms：连续编辑合并成一次，别每次写回都遍历整棵树。
let _linkTitleTimer = null;
function scheduleLinkTitles() {
  if (_linkTitleTimer) clearTimeout(_linkTitleTimer);
  _linkTitleTimer = setTimeout(() => { _linkTitleTimer = null; requestLinkTitles(); }, 400);
}
// ── 展开前的「链接元数据预取」（2026-10-16）──
// 起因：展开后 emitUpdate 会依次触发 linkTitles / docLinks 两个请求，**内容有变时各自 render() 一次**
//   （无过渡）→ 用户看到「展开动画播完，外面卡片又啪地跳一下」。
//   日志实证：一次大展开之后 1000ms 时，采样的 20 张外部卡片的 getBoundingClientRect 全变 0
//   —— 那说明元素已经被换掉了，= 中间发生过一次整树重建。
// 做法：展开前先把这两张表要到手（预取期间回包**只更新表、不渲染**），拿到之后再带着**终态**渲染一次
//   → 回包回来时发现内容没变（changed=false）→ 不再重建。与「展开前预取图片尺寸」是同一套思路。
// ⚠️ 超时兜底：回包没来也必须放行 —— 宁可还多一次重建，也不能让展开卡住。
const LINK_PREFETCH_TIMEOUT_MS = 150;
let _prefetchLeft = 0;      // 还有几个回包没到
let _prefetchCb = null;     // 全到齐（或超时）后要执行的回调；非 null 即「预取模式」
function _prefetchTick() {
  if (_prefetchLeft <= 0) return;
  _prefetchLeft--;
  if (_prefetchLeft > 0) return;
  const fn = _prefetchCb; _prefetchCb = null;
  if (fn) fn();
}
function prefetchLinkMeta(done) {
  done = done || function () {};
  if (!state.tree) { done(); return; }
  let n = 0;
  try { if (requestLinkTitles()) n++; } catch (_) {}   // 树里没有跨文件链接时它**不发消息** → 不计数
  try { requestDocLinks(); n++; } catch (_) {}         // 这个空数组也照发 → 必回
  if (!n) { done(); return; }
  _prefetchLeft = n;
  _prefetchCb = done;
  setTimeout(() => {
    const fn = _prefetchCb; _prefetchCb = null; _prefetchLeft = 0;
    if (fn) fn();
  }, LINK_PREFETCH_TIMEOUT_MS);
}

// ---- 「已放入思维导图数据库的文档」的判定（2026-10-08，文档库功能）----
// 一个 [[名字]] 指向的文件是不是在 28Notes-Files/docs/ 里 —— 决定这个节点用**文档图标**还是**方括号图标**。
// 通路与 linkTitles 完全同款：打开时把整棵树的链接名**一次打包**问宿主（别一个个问），宿主回一张 { 名字: 绝对路径 } 表。
// ⚠️ 整表**整体替换**、不合并 —— 宿主的答案永远是当前实况，于是文件被转出 / 改名 / 删除时图标会自己变回方括号，
//    不需要任何缓存失效逻辑（这是不缓存换来的好处，别为了省一次消息改成增量合并）。
let docLinkMap = Object.create(null);
// 名字 → 文件类型（'map' / 'mmlink' / 'image' / 'video' / 'audio' / 'doc'），宿主随 docLinksRes 一起回。
// 文档节点的前缀图标按它选（2026-10-10 用户定：与右侧文档库面板同一套）。
let docKindMap = Object.create(null);
// 开屏途中收到判定回包（见 docLinksRes）：那时不能重渲染 → 记一笔，booted 放开时补一次（照 linkTitlesPendingRender）
let docLinksPendingRender = false;
// 「选中一个文档节点直接按删除键」的询问状态（2026-10-08）：已经问过宿主、正等回答 —— 防连按弹出两个弹窗
let docNodeAskPending = false;
// 「文档库」总开关（设置页「高级 → 实验性功能」，**默认关**）的**状态镜像**。
// ⚠️ 2026-10-09 起它**不再门控画布上的任何东西**：用户定「开关只管宿主侧文件列表那个『转入』入口 ——
//   已经导入的，管理体验不受影响；没导入的，把导入入口掐掉」。画布上的文档节点识别、右键那一组、
//   面板都不看它。留着这个变量只是为了切开关时知道当前状态（`applyDocsLibrary` 会重渲染一次）。
let docsLibraryOn = false;
// 名字 → 引用**总处数**（所有导图里加起来，宿主随 docLinksRes 一起回；2026-10-09）。
// 它决定"这个节点管理的文件是不是被多处管理" —— 那种节点要黄虚线框 + 警告图标 + 常驻 toast。
let docRefMap = Object.create(null);
function docLinkPathOf(note) { return (note && docLinkMap[note]) || ''; }
function isStoredDoc(note) { return !!docLinkPathOf(note); }
// 从 `[[...]]` 里抠出来的那串文字 → 去掉 `|别名` 与首尾空白（2026-10-10）。
//   `[[名字|显示名]]` 里那截别名**不参与"指向哪个文件"**：带着它去查判定表 / 比名字永远对不上
//   （`docLinkMap` 的 key 是宿主按链接目标解析出来的，别名不在其中）。
//   ⚠️ 显示名那一支**不要**走它（`wikiDisplayName` 自己要处理 `|`），只有"这是哪份文件"的判断才剥。
function docLinkTokenOf(raw) { return String(raw || '').split('|')[0].trim(); }
// 这个 [[名字]] 该用哪只图标：已放入思维导图数据库 = file-text（文档）；否则 = brackets（普通双链，原样）
// 附件（图片 / 视频 / 音频）用**「＋添加」面板同一套**图标（2026-10-08 用户定）：用户一眼能对上。
function nmIconNameOfKind(kind) {
  return kind === 'image' ? 'image' : kind === 'video' ? 'square-play' : kind === 'audio' ? 'audio-lines' : 'file-text';
}
function wikiIcoName(note) {
  if (!isStoredDoc(note)) return 'brackets';
  // 被**多处管理**的文档 → 用警告三角顶掉文档图标（2026-10-09 用户定），颜色由 CSS 染黄
  if (docRefTotalOf(note) > 1) return 'triangle-alert';
  return doclibIcoOfKind(docKindMap[note], note);
}
// 文档节点的前缀图标（2026-10-10 用户定）：**与右侧文档库面板同一套口径**（面板 = 宿主的 doclibIconOf）——
//   指向**思维导图** → 插件自己的图标；指向**捷径** → ↗；附件 → 「＋添加」面板那三只；其余 → 文档图标。
// ⚠️ `kind` 由宿主随判定回包一起给（`docKindMap`）。回包还没到（开屏那一瞬）→ 退回**按扩展名猜附件**
//   （老口径，`nmMediaKindOf`），至少附件图标是对的，不会退成方括号。
function doclibIcoOfKind(kind, note) {
  const k = kind || nmMediaKindOf(note);
  if (k === 'map') return 'shin-mindmap';
  if (k === 'mmlink') return 'arrow-up-right';
  return nmIconNameOfKind(k);   // image / video / audio / 其余 → file-text
}
// 链接的**显示名**：wikilink 里可能带路径（`[[28Notes-Files/docs/名字]]` —— vault 里出现同名文件时，
// Obsidian 会自动把链接改写成这种带路径的形式，好让它继续指向原来那份），显示时**只取最后一段** ——
// 别让隐藏目录的路径糊在卡片上。纯显示层：落盘文字、data-raw、点击解析全用原文，一个字不动。
// 开销 = 一次 lastIndexOf + slice，可忽略。
function wikiDisplayName(note) {
  let s = String(note == null ? '' : note);
  const bar = s.indexOf('|');
  if (bar >= 0) s = s.slice(bar + 1); // Obsidian 别名：[[目标|显示名]] → 显示别名（剥路径那一步对别名不适用）
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}
// 这个节点是不是「文档节点」：整行是 [[名字]]、且名字指向 docs/ 里已放入思维导图数据库的文档。
// 与图标（wikiIcoName）、节点右键那一组、点击行为（openWikiLink）读的是**同一份判据**，四处永远同时成立。
function nmDocNodeOf(node) { return !!nmManagedOf(node); }
// 这份文档**被几处管理**（所有导图里的引用总处数；判定表里没有 → 0）。2026-10-09 加。
function docRefTotalOf(note) { return (note && docRefMap[note]) || 0; }
// 这个节点管理的文件**被多处管理**？是 → 返回那份文件的 { note, embed, kind }，否则 null。
// 判据 = 总处数 > 1。视觉三件套（黄虚线框 / 警告图标 / 常驻 toast）都读它，永远同时成立。
function nmMultiRefOf(node) {
  const mg = nmManagedOf(node);
  if (!mg) return null;
  return docRefTotalOf(mg.note) > 1 ? mg : null;
}
// 附件按**扩展名**认（与宿主 `doclibKindOf` 同一套表 —— 两边语言不通，前端得自己再写一份，改一处要记得改两处）
const NM_IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'tif', 'tiff'];
const NM_VID_EXT = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg', '3gp'];
const NM_AUD_EXT = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aiff', 'wma'];
function nmMediaKindOf(note) {
  const ext = String(note || '').split('.').pop().toLowerCase();
  if (NM_IMG_EXT.indexOf(ext) >= 0) return 'image';
  if (NM_VID_EXT.indexOf(ext) >= 0) return 'video';
  if (NM_AUD_EXT.indexOf(ext) >= 0) return 'audio';
  return 'doc';
}
// 这个节点**管理的文件**（2026-10-08 用户定）：{ note, embed, kind }；不是 → null。
//   认两种写法：`[[名字]]`（文档节点）与 `![[名字]]`（附件嵌入）；带 #pid 的跨文件节点链接不算。
//   kind = 'doc' | 'image' | 'video' | 'audio' —— 图标、浅蓝底、右键那一组都读它。
// 🔴 2026-10-09 用户定：**不再要求「整行只有那个链接」** —— 节点里加了文字 / 备注 / 标记之后，
//   它仍然是"管理着某份文件的节点"（浅蓝底 + 文件图标 + 那一组右键菜单都该照旧在）。
//   取**第一个**指向数据库文档的链接（整行只有一个链接那种仍是最常见的情形）。
//   ⚠️ 「删文档时要不要连整行一起删」是**另一套**判据（shared.js 的 docRefNodeIsShell），别混。
function nmManagedOf(node) {
  if (!node) return null;
  const t = String(node.title == null ? '' : node.title);
  if (!t) return null;
  const re = /(!?)\[\[([^\]\]#\n]+)\]\]/g;   // 不含 # → [[X#pid]] 这种跨文件节点链接天然被排除
  let m;
  while ((m = re.exec(t)) !== null) {
    const note = docLinkTokenOf(m[2]);   // 剥掉 `|别名`（判定表按链接目标建的，别名不在其中）
    if (!note || !isStoredDoc(note)) continue;
    return { note: note, embed: m[1] === '!', kind: nmMediaKindOf(note) };
  }
  return null;
}
// 右键那一项的文案键：'ctx.openImage' / 'ctx.deleteDoc' …（中英各一份，见 i18n）
function nmCtxKeyOf(prefix, kind) {
  return prefix + (kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Doc');
}
// 当前选中的**单个**节点管理的那份文件的**名字**（2026-10-09 改用 nmManagedOf → 加了文字/备注也认）。
// 单选看 selectedId；**框选恰好一个**也认（用户说"选中一个节点"未必走单击那条路）。
// 多选多个 / 选的是根节点 / 不是管理节点 → 空串（调用方据此决定"要不要问一句"）。
function selectedManagedNote() {
  if (!state.tree) return '';
  let id = state.selectedId;
  if (state.multiSelected.size === 1) id = state.multiSelected.values().next().value;
  else if (state.multiSelected.size > 1) return ''; // 多选走 selectedManagedItems，不走这里
  if (!id) return '';
  const root = currentRoot();
  if (!root || id === root.id) return '';
  const r = findNode(state.tree, id);
  if (!r || !r.node) return '';
  const mg = nmManagedOf(r.node);
  return mg ? mg.note : '';
}
// 选中的节点管理的那份**已放入思维导图数据库的文档**路径；判定表里没有（还没回包 / 不是文档节点）→ 空串
function selectedDocPath() {
  const note = selectedManagedNote();
  return note ? docLinkPathOf(note) : '';
}
// 选中的节点里**管理着文件**的那些（2026-10-09 加：多选也要能问一句）——
// 返回 [{ path, note }]（path 可能为空串 = 本地判定表还没有，让宿主现场解析）。
// 多选时只算**顶层**（祖先也在选中集的跳过：删父会连带子树，不单独问）。
function selectedManagedItems() {
  const items = [];
  if (!state.tree) return items;
  const root = currentRoot();
  if (!root) return items;
  const multi = state.multiSelected.size > 0;
  const ids = multi ? Array.from(state.multiSelected) : (state.selectedId ? [state.selectedId] : []);
  for (const id of ids) {
    if (id === root.id) continue;
    if (multi && hasAncestorSelected(id)) continue;
    const r = findNode(state.tree, id);
    if (!r || !r.node) continue;
    const mg = nmManagedOf(r.node);
    if (!mg) continue;
    items.push({ path: docLinkPathOf(mg.note), note: mg.note });
  }
  return items;
}
// 定位到「引用了某份文档」的那个节点：选中它 + 挪到画面中央。
// 从文档面板点导图名 / 1｜2｜3 进来（宿主在打开导图前挂了 docRefOnce，随 init 下发）。
// ⚠️ 匹配**不依赖 docLinkMap** —— 那要等回包，开屏这一刻可能还是空的；直接拿链接里写的名字跟
//    文档名 / 路径比，`[[X]]` 与 `[[28Notes-Files/docs/X]]` 两种写法都认。
// ⚠️ 按**标题里出现的链接 token** 计数（不是按节点数）—— 这样"第 N 个引用"与宿主按反链算出来的
//    次数口径一致（同一节点里写两次链接也算两次）。
function locateDocRefOnce(ref) {
  try {
    // ⚠️ 这里原来是**静默 return** —— 消息到了但树还没建好时，用户看到的就是"点了没反应"。
    //   现在至少留一行日志（2026-10-10）。
    if (!ref) { try { vscode.postMessage({ type: 'log', text: '定位被丢弃：ref 为空' }); } catch (_) {} return; }
    if (!state.tree) { try { vscode.postMessage({ type: 'log', text: '定位被丢弃：画布还没建树（state.tree 为空）ref=' + JSON.stringify(ref) }); } catch (_) {} return; }
    const name = String(ref.name || '');
    const path = String(ref.path || '');
    // 去掉**最后一个扩展名**（.md / .png / .mp4 都行）。原来只去 `.md` —— 附件（图片 / 视频 / 音频）
    // 于是永远匹配不上，面板里点它只会弹「那个引用已经不在了」，可画面上明明就有
    // （2026-10-08 用户实报）。
    // 🔴 **两边都要去扩展名**再比：节点里写的是 `[[图片.png]]`（带扩展名），而 ref.name 是
    //   `basename`（Obsidian 的 basename **不含**扩展名）—— 上一版只把右边去了扩展名、左边没去，
    //   于是附件照样匹配不上（2026-10-08 用户实报"还是有"）。
    // 🔴🔴 2026-10-10 修「点定位没反应 / 定位到别处」（用户实报，第二版）：
    //   原来是 `replace(/\.[^./\\]+$/, '')` —— **只要最后一个点后面没有斜杠就砍掉**。
    //   于是文件名里本来就带点的那些被砍得只剩前半截：
    //     `1. 内容拆解 Skill` → `1`、`1. 我的视频｜Short 版` → `1`、`2. 口播录音` → `2` …
    //   这些截出来的短串**互相相等** → 所有「数字. 开头」的文档彼此误匹配：
    //   点「1. 内容拆解 Skill」的定位，命中的却是树里第一个 `1.` 开头的节点 → 定位到别处；
    //   hits 还虚高（8 个），于是又弹出一串"第 N 处"菜单。用户 vault 里恰好一大堆
    //   `1.`/`2.`/`3.`/`4.`/`5.` 开头的文档 → 表现为「很多按钮点了不行」。
    //   → 只剥**看起来像扩展名**的尾巴：末尾是 `.` + 1~6 位纯字母数字（`.md` / `.png` / `.mp4`）。
    //     这样 `1. 内容拆解 Skill`（末尾没有 `.xxx`）原样保留，附件照样能剥。
    const stripExt = (s) => {
      const t = String(s || '');
      const m = t.match(/^(.*)\.([A-Za-z0-9]{1,6})$/);
      return m ? m[1] : t;
    };
    const stem = stripExt(path), nameStem = stripExt(name);
    const match = (note) => {
      const n = stripExt(String(note || ''));
      if (!n) return false;
      return n === nameStem || n === stem
        || n.endsWith('/' + nameStem) || n.endsWith('/' + stem)
        || String(note) === name || String(note) === path; // 兜底：万一某一边本来就带扩展名
    };
    const hits = []; // { node, parents }  顺带把祖先链存下来 —— 定位时把挡路的折叠全打开
    const tokens = []; // 树里所有的链接 token —— 只为"找不到时"能一眼看出是哪边名字对不上
    (function walk(n, parents) {
      if (!n) return;
      const re = /\[\[([^\]\n]+)\]\]/g;
      let m;
      while ((m = re.exec(String(n.title || ''))) !== null) {
        // 🔴 带 `#锚点` 的**不算引用**（2026-10-11 用户定）：[[X#pid]] 是"跳到某个节点"的节点链接，
        //   不是"这份文档被谁管着"——宿主 doclibRefIndex 与 ✕「取消这一处」(docRefCountIn) 都不数它，
        //   这里必须同口径：否则面板的「第 N 处」和画布的命中序号错位（同图里锚点/普通混排时差一位）。
        //   （上一版曾反过来"让画布也认锚点"，口径改后作废。）
        const raw = String(m[1] || '');
        if (raw.indexOf('#') >= 0) { tokens.push(docLinkTokenOf(raw)); continue; }
        // ⚠️ 剥掉 `|别名` 再比（2026-10-10）：`[[名字|显示名]]` 里那截别名不参与匹配，
        //   带着它比会永远对不上（`n === nameStem` 挂掉）。
        const tk = docLinkTokenOf(raw);
        tokens.push(tk);
        if (match(tk)) hits.push({ node: n, parents: parents });
      }
      const path = parents.concat(n);
      (n.children || []).forEach(c => walk(c, path));
    })(state.tree, []);
    if (!hits.length) {
      // 找不到就把"手上有什么 / 树里有什么"记一笔（用户 2026-10-08 要求）——
      // 附件（图片 / 视频 / 音频）的匹配最容易出错，下次再报这句，看一眼控制台就知道哪边对不上。
      try {
        vscode.postMessage({ type: 'log', text: '定位失败 ref=' + JSON.stringify(ref)
          + ' 树里的 token=' + JSON.stringify(tokens.slice(0, 20)) });
      } catch (_) {}
      toast(T('toast.docRefGone'), true);
      return;
    }
    const hit = hits[Math.max(0, Math.min(ref.index | 0, hits.length - 1))];
    const node = hit.node;
    // 🔴 目标被视图筛选藏起来 → 自动把那个筛选关掉，让节点现身（2026-10-11 用户定）：
    //   「隐藏次要节点」开着且目标（或其祖先）是次要/已完成 → 关掉它；
    //   「只显示当前关注」开着且目标不在可见集 → 关掉它。
    //   不关的话：树里命中了、画面上却没有这个节点 → selectNode 落空 → 表现为"点了没有任何反应"
    //   （用户实报：次要节点 + 开着隐藏筛选，点面板第 N 处全无反应）。
    //   按用户点按钮同款走 setHideDone/setShowNow（persist=true：按钮图标 / 落盘 / 渲染全跟着走）。
    //   可见性判定与 render 完全同口径：hideDone 连坐祖先（doneChain），showNow 看 nowVisibleSet 成员。
    let filterTurnedOff = '';
    if (state.hideDone) {
      const doneChain = (hit.parents || []).some(p => nodeIsMinor(p) || nodeTodoDone(p));
      if (nodeIsMinor(node) || nodeTodoDone(node) || doneChain) {
        setHideDone(false, true, false);
        filterTurnedOff = 'hideMinor';
      }
    }
    if (state.showNow) {
      const nvSet = nowVisibleSnapshot || computeNowVisible(currentRoot());
      if (nvSet && !nvSet.has(node.id)) {
        setShowNow(false, true, false);
        filterTurnedOff += (filterTurnedOff ? '+' : '') + 'showNow';
      }
    }
    if (filterTurnedOff) {
      try { vscode.postMessage({ type: 'log', text: '定位目标被筛选隐藏 → 自动关闭筛选：' + filterTurnedOff }); } catch (_) {}
      toast(T('toast.locateReveal'), false);
    }
    // 诊断（2026-10-10）：命中了几个、取了第几个、走哪条路 —— 点定位"没反应 / 不对"时
    //   看一眼控制台就能分清是「匹配错了」还是「匹配对了但没摆过去」。
    //   ⚠️ `hits.length` 明显大于宿主报的处数 = 名字被**误匹配**（2026-10-10 修过一版
    //   `stripExt` 把 `1. 内容拆解 Skill` 截成 `1` 的 bug，就是这种情况）。
    try {
      vscode.postMessage({ type: 'log', text: '定位 ref=' + JSON.stringify(ref)
        + ' 命中 ' + hits.length + ' 处，取第 ' + (Math.max(0, Math.min(ref.index | 0, hits.length - 1)) + 1)
        + ' 处 → 节点「' + String(node.title || '').slice(0, 40) + '」' });
    } catch (_) {}
    // 🔴 2026-10-09 用户定：目标节点若被折叠的祖先挡住，定位不到。
    //   把祖先链上的折叠**全打开**（"一直打开到能被定位到"）→ render 一次让 DOM 出节点 → 再走原来的 inView/goTo/selectNode。
    //   ⚠️ 只动内存（不写文件）：render 之后画面对得上，但 fold:1 注释没改 → 下次开这张图恢复原状。
    let unfoldedAny = false;
    for (const p of hit.parents) {
      if (p.fold) { p.fold = false; unfoldedAny = true; }
    }
    if (unfoldedAny) { try { render(); } catch (_) {} }
    // 不在当前下钻范围内 → 先把这一层钻进来（goTo 自己会把它摆到中央），再补一次选中
    const root = currentRoot();
    let inView = false;
    (function check(n) {
      if (inView || !n) return;
      if (n === node) { inView = true; return; }
      (n.children || []).forEach(check);
    })(root);
    if (!inView) {
      goTo(node.id);
      setTimeout(() => { try { selectNode(node.id); } catch (_) {} }, 0);
      return;
    }
    selectNode(node.id);
    const el = document.querySelector('.node-row[data-id="' + node.id + '"] .card');
    if (el) placeCardAtViewport(el, cfgNum('--locate-x', 0.5));
  } catch (_) {}
}
function requestDocLinks() {
  // ⚠️ 2026-10-09 用户定：**不再看总开关** —— 开关只关「转入 / 转出 / 删除」这些入口，
  //   文档节点本身该一直是文档节点（浅蓝底 + 文件图标），不许因为关了开关就退回普通双链。
  try {
    if (!state.tree) return;
    const names = [];
    const seen = Object.create(null);
    (function walk(n) {
      if (!n) return;
      // 整行是 [[名字]] 的、夹在文字里的，都要收（渲染侧两者一视同仁）。
      // 只收**不带 #pid** 的那种 —— 带 #pid 的是跨文件节点链接，走 frame 图标，与文档库无关。
      const re = /\[\[([^\]#\n]+)\]\]/g;
      let m;
      while ((m = re.exec(String(n.title || ''))) !== null) {
        const name = docLinkTokenOf(m[1]);   // 剥掉 `|别名`：判定表按"指向哪份文件"建，别名不参与
        if (name && !seen[name]) { seen[name] = 1; names.push(name); }
      }
      (n.children || []).forEach(walk);
    })(state.tree);
    // 空数组也照发：宿主会回一张空表 → 前端把旧判定清掉（否则删掉最后一个文档节点后，旧条目会一直留着）
    vscode.postMessage({ type: 'docLinks', items: names });
  } catch (e) { /* 收集失败不影响渲染：退回方括号图标 */ }
}
let _docLinkTimer = null;
function scheduleDocLinks() {
  // 同 requestDocLinks：不看总开关（2026-10-09）
  if (_docLinkTimer) clearTimeout(_docLinkTimer);
  _docLinkTimer = setTimeout(() => { _docLinkTimer = null; requestDocLinks(); }, 400);
}
// init 时只记开关（那一刻还在开屏流程里，不能顺手渲染）
function setDocsLibrary(on) { docsLibraryOn = !!on; applyDoclibBtnVisibility(); } // 🔴 2026-10-10：左下那颗文档库按钮跟着显隐
// 设置页切开关（2026-10-09 语义变了：开关**只管入口**）：
//   开 → 立刻去要一次判定表；关 → 只把标记改掉（右键那组入口随之消失），
//   **判定表不清、文档节点照旧是文档节点**（用户明确：关掉开关不许把节点退回普通双链）。
function applyDocsLibrary(on) {
  docsLibraryOn = !!on;
  applyDoclibBtnVisibility(); // 🔴 2026-10-10：左下那颗文档库按钮跟着总开关显隐
  // 「＋添加」面板里「子文档」那一行跟总开关走（见 nmAddRowUsable）→ 面板缓存作废，下次打开重建
  try { invalidateAddMenus(); } catch (_) {}
  // 守卫与 linkTitlesRes 同一套（含 state.tree —— 空树时 render 会拿 null 去 buildRow）；
  // 正在编辑时绝不重渲染（render 会把编辑框换掉、正在敲的字当场丢）
  const canRender = !!state.tree && booted && !state.editingEl && !state.editingTitleEl && !state.editingNoteId
    && state.view === 'map' && !state.historyMode;
  if (canRender) { try { render(); drawEdges(); } catch (_) {} }
  if (docsLibraryOn) requestDocLinks();
}

// 正文整行就是一个链接？是则返回那段原文，否则返回 ''（2026-09-29）。
// 「链接节点」的判定：单行 + 整行是 wikilink 或标准 Markdown 链接（与 parse / 剪贴板同一套正则）。
function nmPureLinkOf(title) {
  const t = String(title == null ? '' : title).trim();
  if (!t || t.indexOf('\n') >= 0) return '';
  return /^(\[\[.+\]\]|\[[^\]]*\]\((?:(?:https?|ftp|mailto|file):[^)]+|www\.[^)]+)\))$/.test(t) ? t : '';
}

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
  const m = t.match(/^\[\[([^\]]+)\]\]$/);
  if (!m) return null;
  // Obsidian 别名：[[目标|显示名]]（#pid 也可带：[[笔记#pid|别名]]）—— 别名只参与显示，
  //   "指向哪个文件 / 哪个节点"一律用 | 之前那截（文件名不许含 |，首个 | 即分界）。
  const bar = m[1].indexOf('|');
  const target = (bar >= 0 ? m[1].slice(0, bar) : m[1]).trim();
  const alias = bar >= 0 ? m[1].slice(bar + 1).trim() : '';
  const h = target.indexOf('#');
  return {
    note: (h >= 0 ? target.slice(0, h) : target).trim(),
    pid: (h >= 0 ? target.slice(h + 1) : '').trim(),
    alias: alias,
  };
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
// 点链接：**文档节点走新标签页**，其余（普通双链 / 跨文件节点链接）照旧跳当前标签页。
// 2026-10-08 用户定：文档节点的语义是"另开一页看资料"，不该把正在看的导图顶掉 ——
//   与右键那项「打开该文档」走同一条消息（宿主 openDocFile → getLeaf('tab')）。
// 打开 wikilink 指向的笔记（可带 #pid 下钻）：交给宿主按 Obsidian 链接解析找文件
//   文档节点额外支持 **⌘（mac）/ Ctrl（win-linux）+ 点击 = 分屏打开**（2026-10-09 用户定）：
//   导图留在左边、文件开在右边；普通点击照旧新标签页。
function openWikiLink(raw, ev, el) {
  const w = parseWikiLink(raw);
  if (!w) return;
  if (!w.pid && isStoredDoc(w.note)) {
    const p = docLinkPathOf(w.note);
    if (p) {
      // 🔴 2026-10-10 用户定（**行为反转**）：**默认就是右侧分屏打开**，按住 ⌘/Ctrl 才是新标签页。
      //   原来反过来（默认新标签页、⌘ 分屏）—— 用户看资料时最常要的是"一边导图一边文档"。
      //   ⚠️ `split` 这个字段名没变（true = 分屏），只是取值反了：宿主 openDocFile / 全屏那条
      //   「分屏打开保住全屏」都不用动，语义自动跟着走。
      const split = !(ev && (ev.metaKey || ev.ctrlKey));
      // 2026-10-11：把**被点的节点**一起报给宿主 —— 分屏"真新建出来"之后，宿主会回推
      //   `docSplitOpened`，画布据此把该节点**只沿 X 轴**滑到左侧半屏正中（locateAfterDocSplit）。
      //   拿不到节点 id（结构异常）就发空串：宿主会跳过回推，分屏照常打开，只是没有滑动。
      const row = el && el.closest ? el.closest('.node-row') : null;
      const nodeId = (row && row.dataset && row.dataset.id) || '';
      // 🔴 2026-10-12 用户定：点文档节点 = 右边开分屏，左边这张图要**把被点的节点选上**
      //   （不然看不出刚才点的是哪一个）。链接自己那次 click 是 stopPropagation 的 → 走不到卡片
      //   那条"点一下选中"的分支，所以这里补一次。选中副作用与点卡片一致（选中框 / 底部工具条 / 快捷键全生效）。
      if (nodeId) { try { selectNode(nodeId); } catch (_) {} }
      dbgSplit('① 画布点击文档节点 → 发给宿主 split=' + split + ' nodeId=' + (nodeId || '无') + ' path=' + p);
      vscode.postMessage({ type: 'openDoc', path: p, split: split, nodeId: nodeId });
      return;
    }
  }
  vscode.postMessage({ type: 'openNote', note: w.note, pid: w.pid });
}
// 文件链接 v2：[显示名](file:///绝对路径)（点击经宿主打开文件）
function parseFileLink(raw) {
  // 路径段允许一层配对括号（文件名常带括号，如 "Frame (1).svg"；写成 [^)]+ 会在第一个 ) 截断 → 整条认不出）
  const m = String(raw || '').match(/^\[([^\]]*)\]\(file:\/\/((?:[^()]|\([^()]*\))+)\)$/);
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
// 这个 Now 在**当前画面里看得见吗**（2026-09-28 用户定，判据从「按标记算」改成「按看得见算」）。
// 判据两条，与渲染剔除同源（buildRow / 折叠标记）：
//   ① 「隐藏次要节点」开着时，自身或祖先链（不含主节点——主节点恒可见）上是 Minor / Done → 整支被剔除，看不见；
//   ② 祖先链上有折叠的节点 → 这一支收起来了（**不含自身**：自己折叠只收起子树，自己那一行还看得见）。
// 用户原话：「这时候用户不知道有当前关注节点啊」—— 看不见就不该算可用。
// ⚠️ 2026-09-28 修的两个 bug：
//   a. 原来只认 Minor，不含 Done → 「Now 同时是 Done」时隐藏次要节点把它收走了，这里却还当可用
//      → 按钮没置灰、点下去可见集里只剩主节点（用户实报）；
//   b. 原来不看折叠 → 折叠藏起来的 Now 也算可用，点下去同样塌缩。
// 旧规矩（2026-09-15「按标记算、与显隐无关」）已作废：那时是为了防"只看 Now 出半截画面"，
// 而现在可见集与剔除口径同源，不存在半截问题。
function nowVisibleInView(root, now) {
  const path = pathTo(root, now.id);
  if (!path) return false;
  for (let i = 1; i < path.length; i++) {
    const n = path[i];
    if (state.hideDone && (nodeIsMinor(n) || nodeTodoDone(n))) return false;
    if (i < path.length - 1 && n.fold) return false;
  }
  return true;
}
// 「可用的 Now」= 当前画面里看得见的那些
// （只看 Now / 定位 / 置灰判定统一用这个口径）
function collectUsableNows(root) {
  return collectNowNodes(root).filter(n => nowVisibleInView(root, n));
}
// 当前视图范围内有没有「未被隐藏次要节点藏掉」的 Now（2026-10-01 重构，替代旧 hasViewableNow / hasUnfoldedNow）。
// ⚠️ 与 collectUsableNows / nowVisibleInView 的区别：本函数**不看折叠**（fold）。
//   用途 = 会话期间的自动关闭判据：折叠 / 拖拽不触发自动关（用户 2026-10-01 定），
//   只有"节点真的没了 / 被 hideDone 藏了 / 下钻到没有 Now 的子树"才触发。
//   开屏静默检查用 collectUsableNows（含折叠），见 init 段。
function hasNowInScope(root) {
  if (!root) return false;
  if (!state.hideDone) return collectNowNodes(root).length > 0; // hideDone 关着 → 任何 Now 都算
  return collectNowNodes(root).some(n => {
    const path = pathTo(root, n.id);
    if (!path) return false;
    // 自身或祖先链（不含主节点）上有 Minor/Done → 被 hideDone 藏掉了
    for (let i = 1; i < path.length; i++) {
      if (nodeIsMinor(path[i]) || nodeTodoDone(path[i])) return false;
    }
    return true;
  });
}
// 计算「只显示 Now」下的可见节点集：Now 节点 + 其祖先链（从主节点导过来的必要路径）+ Now 节点的直接子节点
// （类比 hideDone 的剔除渲染：返回 Set，buildRow 里不在集内且 depth>0 的节点直接 return null）
function computeNowVisible(root) {
  const set = new Set();
  if (!root) return set;
  set.add(root.id); // 主节点恒可见（防画面全空，同 hideDone 保根）
  // 「只看 Now」只作用于当前视图（currentRoot 范围内）：有 Now 标记的提取出来（Now+祖先链+子树），
  // 没有 Now 标记的隐藏。当前视图一个 Now 都没有 → 由 checkShowNowAutoClose / setShowNow 入口兜底退出。
  // 【2026-08-31 反修】此前加过「下钻态子树整体可见」豁免 → 下钻到无 now 标记的普通节点 + showNow 时过滤完全失效
  //（点了「只看 Now」画面毫无变化）。按语义：不看子树整体，只看当前视图里有没有 Now 节点。
  collectNowNodes(root).forEach(now => {
    if (!nowVisibleInView(root, now)) return; // 画面里看不见的 Now 不计入可见集（见 nowVisibleInView）
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
  const out = String(text || '').replace(/!\[\[([^\[\]]+)\]\]|!\[[^\]]*\]\(((?:[^()]|\([^()]*\))+)\)/g, (m, wiki, md) => {
    const p = (wiki ? wiki : md).trim();
    if (/^https?:/i.test(p)) return m;              // 远程图：P1 不做，原样保留
    // ⚠️ 判"是不是图"用图片扩展名正则，不能用 isMediaFile() —— 它只含音视频、不含 png/jpg（用户实踩：
    //    ![[xx.png]] 被当成笔记嵌入放过 → 标题剩「!」+ 双链）。![[笔记]] 嵌入才是 P3。
    if (wiki && !/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|svg)$/i.test(nmEmbedSize(p).name)) return m;
    images.push(p);
    return '';                                       // 从标题里抽走 → 图片行渲染
  // ⚠️ 只收「行内」多空格：原来写的 `\s{2,}` 会把**空行**（\n\n）也压成一个空格 —— 2026-10-07 实踩：
  //    标题里编辑时明明有空行、渲染出来却并成一段（单换行没事，因为只有一个空白字符不匹配）。
  //    备注不走本函数（直接 renderInline），所以备注的空行一直正常 —— 现象差异的根源就在这。
  //    `[^\S\n]` = 空白但排除换行（空格 / tab / 全角空格都算），行内收紧行为不变。
  }).replace(/[^\S\n]{2,}/g, ' ').trim();
  return { text: out, images };
}
// 标题的「前缀图标」HTML（待办 → Now → Minor → AI 生成标记）—— **唯一出处**（2026-10-05 收敛成一份）。
//   有标题的节点：由 setTitleInner 放在 `.title` 上（正文 .tt 之前、**编辑区之外**）；
//   空标题的节点：由 prependIcoIntoTitle 放在 `.title` 里。
//   ⚠️ 以前这套图标在 cardTitleInner 与 prependIcoIntoTitle 里**各写一份**，还得靠断言盯"两边顺序一致"——
//      现在只有这一份，顺序天然一致，加新图标也只改这里（2026-10-05 用户要求「统一用一个代码、只换图标」）。
//   顺序可以同时出现多个：节点既是待办、又是 Now、又是 Minor、又是 AI 生成的很正常。
//   ⚠️ 进度百分比（2026-09-24 起）改放到 .card 下方，不再出现在 .title 里 —— 故此处不 emit。
// 三个「点一下 = 取消这个标记」的图标，提示语统一走 data-tip（黑色小字浮层，见 i18n 的 tip.icoClear*）。
//   待办不在这套里：它点一下是两态互切、⌘+点击才是清除（提示语在 todoIcoHtml 里，随状态变）。
function cardTitleIcos(node) {
  // 文案自带「正文==space==后缀」分隔（2026-10-20 晚定）：整个串写进 data-tip，渲染时 nmApplyTip / nmSetTipParts 拆
  const tip = (key) => ' contenteditable="false" data-tip="' + T(key) + '" data-side="top"';
  return (nodeTodoAny(node) ? todoIcoHtml(node) : '')
    + (nodeIsNow(node) ? '<span class="now-ico"' + tip('tip.icoClearNow') + '>' + renderNowPrefix() + '</span>' : '')
    + (nodeIsMinor(node) ? '<span class="minor-ico"' + tip('tip.icoClearMinor') + '>' + renderMinorIcon(node, 12) + '</span>' : '')
    // AI 标记按钮的提示分两种（2026-10-07 用户定）：纯 AI（ai）/ 含人工内容（mix）。
    // 得说清清掉的是哪一种 —— 含人工内容的那种被当成普通 AI 标记清掉，用户会心疼。
    + (hasAinode(node) ? '<span class="ainode-ico"' + tip(ainodeOf(node.ainode) === 'mix' ? 'tip.icoClearAiMix' : 'tip.icoClearAi') + '>' + renderAinodeIcon(node, 12) + '</span>' : '');
}
// 标题的正文（只有文字与内联链接）—— 会被放进 `.tt` 里（编辑时 `.tt` 才是 contenteditable）。
// contenteditable="false" 那套已经不需要了：图标压根不在这一层（见 cardTitleIcos）。
function cardTitleInner(node) {
  // 2026-09-29：正文只有这一条渲染路 —— 整行是链接也好、文字里夹着链接也好，都由 renderInline 画，
  // 不再有「另起一个链接元素」那条路（那条路才需要管"插在哪儿"，也正是位置错乱的来源）。
  return renderInline(nmExtractInlineImages(node.title || '').text); // 图片语法已抽到图片行（nmExtractInlineImages），标题只留文字
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
  // ⚠️ 路径段不能写 [^)]+：文件名里带括号是常态（"Frame (1).svg"），会在第一个 ) 处被截断、整条认不出。
  // 改成允许**一层配对括号**（2026-09-22 用户实踩：粘贴 [Frame (1).svg](file:///…/Frame (1).svg) 没被识别）。
  const md = t.match(/^\[[^\]]*\]\((file:\/\/(?:[^()]|\([^()]*\))+)\)$/);
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
  // 纯 wikilink：[[笔记名#pid]] = 跨文件节点链接 → 节点框图标 + **目标节点当前标题**（取不到退回笔记名）；
  // [[笔记名]] = 双链 → 方括号图标 + 笔记名
  // 2026-09-29：跟随目标标题这条规则**统一适用**（整行是链接、还是混在文字里，一视同仁），
  //   不再"有的跟随、有的不跟随"。
  let wikiM = t.match(/^\[\[([^\]#]+)#([^\]]+)\]\]$/);
  if (wikiM) {
    // 别名（[[笔记#pid|别名]]）：pid 那截可能带着 |别名 —— 定位用剥掉的，显示用别名
    const note = wikiM[1].trim();
    const bar = wikiM[2].indexOf('|');
    const pid = (bar >= 0 ? wikiM[2].slice(0, bar) : wikiM[2]).trim();
    const alias = bar >= 0 ? wikiM[2].slice(bar + 1).trim() : '';
    return '<span class="inline-wiki" data-raw="' + escapeHtml(t) + '">' + linkIco('frame') + escMd(alias || linkTitleOf(note, pid) || note) + '</span>';
  }
  wikiM = t.match(/^\[\[([^\]#]+)\]\]$/);
  if (wikiM) {
    // 图标按「目标文件是不是在 docs/ 里」分两档：已放入思维导图数据库 = 文档图标(file-text)，否则 = 方括号(brackets)。
    // 显示名走 wikiDisplayName：带路径的链接只显示末段（判据 / 点击仍用原文）
    return '<span class="inline-wiki" data-raw="' + escapeHtml(t) + '">' + linkIco(wikiIcoName(docLinkTokenOf(wikiM[1]))) + escMd(wikiDisplayName(wikiM[1].trim())) + '</span>';
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
  // file 另用「一层配对括号」而不是 [^)]+（本地路径可含空格、也常含括号 —— 如 "Frame (1).svg"，
  // 2026-09-22 实踩：含括号的路径内嵌与纯文件链接都认不出）
  const re = /\[\[[^\[\]]+\]\]|\[[^\[\]]*\]\(file:\/\/(?:[^()]|\([^()]*\))+\)|\[[^\[\]]*\]\((?:https?|ftp):\/\/[^)\s]+\)|\[[^\[\]]*\]\(www\.[^)\s]+\)|mailto:[^)\s]+\)|(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g;
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
        // 带 #pid = 跨文件节点链接 → 节点框图标 + 目标节点当前标题（取不到退回笔记名）；
        // 不带 = 双链 → 已放入思维导图数据库的文档给文档图标，否则方括号图标；显示名一律走 wikiDisplayName（带路径只显示末段）
        if (w) html += '<span class="inline-wiki" data-raw="' + escapeHtml(tok) + '">' + linkIco(w.pid ? 'frame' : wikiIcoName(w.note)) + escMd(w.alias || (w.pid && linkTitleOf(w.note, w.pid)) || wikiDisplayName(w.note)) + '</span>';
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
    // 把事件一起传下去：文档节点要看 ⌘/Ctrl 决定"新标签页"还是"分屏"（2026-10-09）；
    // 元素本身也传（2026-10-11）—— 分屏新建后要反查它所在的节点，把节点滑到左屏正中。
    s.onclick = e => { e.stopPropagation(); openWikiLink(s.dataset.raw, e, s); };
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
//   设置页里那个许可状态调试栏 2026-10-18 也整组删了 —— 现在作者与用户是同一套界面。）

// ============ 左侧工具栏 + 三个点菜单（飞书风重做，2026-08-21） ============
// 撤销/重做置灰（按钮已移入更多菜单，2026-08-25）
function updateUndoRedo() {
  const u = document.querySelector('#more-menu [data-act="undo"]');
  const r = document.querySelector('#more-menu [data-act="redo"]');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}
// 「隐藏次要节点」这一项**有没有东西可隐藏** —— 供二级菜单项与主按钮（小眼睛）判可用性。
// 判据只看 currentRoot() 范围内的**当前视图**（2026-08-30 的教训：用整棵树找会「外面有 Minor 就不置灰，
//   点了却在开关看不见的节点」）。
// 2026-09-21 用户定：**只算「界面上看得见」的** —— 折叠（fold）进去的分支整个不算（折叠节点自身看得见，仍算）。
//   为什么：以前折起来看不见、眼睛还亮着，点下去界面毫无反应，用户以为按钮坏了。
//   ⚠️ 判据**不看 state.hideDone**（不因为"已经被隐藏了"而自己熄灭）—— 否则隐藏后眼睛置灰，就再也点不回来。
// （按钮自己的状态规则在 refreshHideBtnSplit 上面；别把两件事混在这里。）
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
// 「当前画面里有没有节点写了 AI 更改规则」—— AI 面板那颗小眼睛的**置灰判据**（2026-10-06 用户定）。
// 与上面的 anyMinorOrDoneInView 同一套口径（用户原话：「就类似于我画面中左下角那个小眼睛图标」）：
//   · 只看 currentRoot() 范围内的**当前视图**（下钻后在别处的规则不算，跟"看不见就不算"同理）；
//   · **折叠（fold）起来的分支整个不算**（折起来看不见，眼睛就不该亮着）；
//   · ⚠️ **不看 state.hideDone / aiRulesFullOn** —— 不因为"已经被隐藏了"而自己熄灭，否则隐藏后眼睛置灰、
//     就再也点不回来（与 anyMinorOrDoneInView 同一条教训）。
//   · 与它**唯一的不同**：这里连**根节点自己**也算（主节点同样看得见、也能写规则；anyMinorOrDoneInView 不查根
//     是因为主节点本来就不该被标成 Minor）。
function anyAiRulesInView() {
  let hit = false;
  (function w(n) {
    if (!n || hit) return;
    if (n.aiRules) { hit = true; return; }
    (n.children || []).forEach(c => {
      if (hit) return;
      if (!c.fold) w(c); // 折叠起来的分支：里面看不见，不算
    });
  })(currentRoot());
  return hit;
}
// 「隐藏次要节点」按钮（#btn-hide-done，一级）的三态（2026-10-18：三档机制拆除后只剩这一套）——
//   ① 视图里没有次要节点（Minor/Done）→ 置灰（`eye`）
//   ② 有、没开隐藏 → 正常色（`eye`）
//   ③ 已开隐藏 → 主题色（`eye-off` + `.active-hide`）
// 图标一律用小眼睛（eye / eye-off）。
function refreshHideBtnSplit() {
  const b = document.getElementById('btn-hide-done');
  if (!b) return; // 启动早期 / 自检沙箱里没有这个按钮
  const has = anyMinorOrDoneInView();
  const on = has && !!state.hideDone; // 没东西可隐藏时不显示"已隐藏"，只显示置灰的睁眼
  b.innerHTML = renderIcon(on ? 'eye-off' : 'eye', 18);
  b.classList.toggle('disabled', !has);   // 置灰：用 .disabled 类、不用 disabled 属性（这样 hover 仍出 tooltip）
  b.classList.toggle('active-hide', on);  // 主题色由 .tb.active-hide 提供
  nmApplyTip(b, !has ? T('tb.noMinor') : (on ? T('tb.showMinor') : T('tb.hideMinor')), has ? 'hideMinor' : '');
  b.dataset.side = 'right';
}
function refreshHideBtn() {
  refreshHideBtnSplit(); // 刷「隐藏次要节点」
  updateNowSideBtn();    // 「聚焦当前关注」那颗的置灰/图标态一起刷（隐藏会改变可用 Now 的集合）
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
  // 隐藏次要节点会改变画面内容 → 「聚焦当前关注」那一项的可用性/图标态跟着刷一遍
  //（2026-09-28：被次要节点埋掉的 Now 不算可用，隐藏后可能就没得可聚焦了）
  updateNowFilterItem();
  if (persist !== false && !state.historyMode) vscode.postMessage({ type: 'setHideDone', value: !!on }); // 沙盒里不持久化
  if (skipRender) return; // 只写状态与按钮图标，不重建树（init 建树前预置过滤开关用）
  if (!state.tree) return; // 树未初始化（自检脚本 / 启动阶段），只更新图标
  // 隐藏后可能一个看得见的 Now 都不剩 → 自动关 + toast（2026-10-01 重构）
  checkShowNowAutoClose({ undoable: true });
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
  // 口径 = 可用 Now（collectUsableNows = 当前画面里看得见的那些，见 nowVisibleInView）——一个都没有就等于没得可显示。
  if (on && persist !== false && state.tree && collectUsableNows(currentRoot()).length === 0) {
    toast(T('toast.showNowEmpty'));
    if (!state.historyMode) vscode.postMessage({ type: 'setShowNow', value: false }); // 回写 perFile，别存一个无效的 true（沙盒里不落盘）
    updateNowFilterItem();
    return;
  }
  state.showNow = on;
  nowVisibleSnapshot = (on && state.tree) ? computeNowVisible(currentRoot()) : null; // 「按下那一刻」定格可见集；关闭即清空（2026-08-28）
  // ⚠️ 只有**会落盘**的那一路才更新"用户意图"（2026-10-01）：手动点按钮 / 开屏读存档。
  //   自动关（checkShowNowAutoClose 走 persist=false）绝不能改它 —— 那只是"当前视图没东西可显示"的临时态，
  //   改了存档 = 下次刷新就变回"没点过"（用户实报的那个 bug）。
  if (persist !== false && !state.historyMode) { showNowSaved = !!on; vscode.postMessage({ type: 'setShowNow', value: !!on }); } // 沙盒里不持久化
  // 只写状态与按钮图标，不重建树（init 建树前预置「关闭态」用）；开启态需建树后算可见快照，不走这里
  if (skipRender) { updateNowFilterItem(); return; }
  if (!state.tree) { updateNowFilterItem(); return; } // 树未初始化，只更新图标
  // 数据层：仅真实点击开启时展开/折叠（init 恢复与点关闭不触发）
  if (on && persist !== false) {
    pushUndo();
    const root = currentRoot();
    collectUsableNows(root).forEach(now => { // 只展开/折可用 Now（当前画面里看不见的不参与）
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
  // 2026-09-01 修「切走再回 pan 被清零、永远回中央」的头号根因（历史，勿回退）：
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
// 刷新一级的「聚焦当前关注」按钮（#btn-now-side，展开档用，2026-09-30 与菜单项那套并存）：
// 无可用 Now 节点 → 置灰；否则按 showNow 切正常/激活图标。
// 置灰一律用 .disabled 类（不用 disabled 属性）：属性会把 hover tooltip 一起搞没，各浏览器表现还不一。
function updateNowSideBtn() {
  const b = document.getElementById('btn-now-side');
  if (!b) return;
  // 沙盒（2026-09-14 用户定）：历史界面里这个按钮不再置灰 —— 可以点，只影响本界面，退出整组还原。
  const hasNow = state.tree ? collectUsableNows(currentRoot()).length > 0 : false; // 口径=可用 Now（被 Minor 埋掉的不算）
  // 开着的时候**永远可点、永远显示"已按下"**（2026-10-01）：否则"存档是开、但当前没有可用 Now"时，
  // 按钮会变成"置灰 + 未按下"的样子 —— 用户既看不出它开着，也点不掉它（2026-08-27 记过这个坑）。
  b.classList.toggle('disabled', !hasNow && !state.showNow);
  b.classList.toggle('now-on', !!state.showNow);
  b.innerHTML = renderNowIcon(state.showNow ? 'sideOn' : 'side');
  nmApplyTip(b, (!hasNow && !state.showNow) ? T('tb.noNow') : (state.showNow ? T('tb.nowShowAll') : T('tb.nowOnly')), (hasNow || state.showNow) ? 'showNow' : '');
  b.dataset.side = 'right'; // 左侧 toolbar 按钮 → tooltip 向右浮动（避开画布）
}
// 刷新「聚焦当前关注」按钮（#btn-now-side）+ 定位按钮角标（2026-10-18：二级菜单那套已删，只剩一级按钮）。
function updateNowFilterItem() {
  updateLocateNowBadge(); // 定位按钮右下角的「当前关注」数量角标跟着刷（标记/取消 Now 都会走到这里）
  updateNowSideBtn();     // 无可用 Now 节点 → 置灰；否则按 showNow 切正常/激活图标
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
// 更多按钮图标 2026-10-21 起**固定三个点**：原来的「两个圆点 + 一条斜杠」（当前位置 ≠ 默认路径时显示）
// 已删 —— 路径入口 2026-09-15 就收进「更多」菜单了，按钮图标再变只会让人以为点出来是别的东西。
function updateDefaultPathBtn() {
  // 只剩一件事：同步菜单项的置灰（updatePathMenuBtns）。图标恒为默认三点的那个。
  const bMore = document.getElementById('btn-more');
  if (bMore) bMore.innerHTML = renderIcon(ICON_FIXED.more, 18);
  updatePathMenuBtns();
}
// 路径 4 项（「更多」菜单平铺）置灰：上一/下一按历史栈位置，返回默认/设默认按归一位置比较（2026-09-15 定稿）
function updatePathMenuBtns() {
  const back = document.querySelector('#more-menu .mm[data-act="path-back"]');
  const fwd = document.querySelector('#more-menu .mm[data-act="path-fwd"]');
  const def = document.querySelector('#more-menu .mm[data-act="path-default"]');
  const save = document.querySelector('#more-menu .mm[data-act="path-save"]');
  // 上一/下一能不能走：2026-10-06 起由**宿主**算好下发（历史已经跨文件，只有宿主知道全貌）
  if (back) back.disabled = !state.navCanBack;
  if (fwd) fwd.disabled = !state.navCanFwd;
  // 当前/默认位置都走 normPos 归一（主节点统一记号），规则只有一条：相同 → 灰，不同 → 亮
  const cur = normPos(state.currentRootPid);
  const dflt = normPos(state.defaultPid);
  const same = cur === dflt;
  const valid = defaultPathValid();
  if (def) def.disabled = !valid || same;
  if (save) save.disabled = same && valid;
  updatePathTopBar(); // 顶部条那三颗 + 它的二级菜单：同一份判据，一处收口（别在别处再写一套）
}
// ===== 路径三键的状态上报（2026-10-06 搬到宿主的系统标题栏后）=====
// 三颗键（返回 / 前进 / 主页）与它的二级菜单现在都是**宿主界面**上的元素，画布里没有它们了 →
// 这里只把「该不该置灰 / 主页该不该上主题色」算好发给宿主，宿主照着刷。
// ⚠️ 判据与「更多」菜单里那四项**完全一致**（同一份 state 判据），改口径时两边一起看。
// ⚠️ 本函数由 updatePathMenuBtns() 调（路径一变就会刷到），别在别处再调一遍。
// 画布当前的主题档强调色（--accent 由主题档决定：蓝 / 粉…）。宿主标题栏那几颗要跟它一致 ——
// 宿主自己的 --interactive-accent 是 Obsidian 主题色，跟插件主题档不是一回事（2026-10-06 用户实报"怎么是紫的"）。
function accentNow() {
  try { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || ''; } catch (_) { return ''; }
}
function updatePathTopBar() {
  if (state.historyMode) return;          // 沙盒里的一切位置变更都不进导航历史（与位置记忆同一口径）
  if (!booted) return;                    // 开屏还原期间不报：pid 会从 '' 变到真实值，中途报会被当成"用户下钻了一步"
                                          //（booted 置起后 init 尾部会补报一次，那才是最终落点）
  const cur = normPos(state.currentRootPid);
  const dflt = normPos(state.defaultPid);
  const same = cur === dflt;              // 归一后比较（主节点统一记号），规则只有一条
  const valid = defaultPathValid();
  vscode.postMessage({
    type: 'pathState',
    pid: state.currentRootPid || '',      // 宿主靠它把「我现在在哪一层」记进导航历史（跨文件那套）
    onDefault: !same,                     // 主页键：当前 ≠ 默认 → 主题色（跟「更多」那颗变斜杠同一个含义）
    defDisabled: !valid || same,          // 二级菜单「返回默认路径」
    saveDisabled: same && valid,          // 二级菜单「设为当前路径」
    accent: accentNow(),                  // 主题档强调色（宿主标题栏的主页键 / 菜单斜杠都吃它）
  });
}
// 顶部条那三颗键（返回 / 前进 / 主页 + 二级菜单）2026-10-06 整段删掉：
// 它们连同面包屑一起搬到系统标题栏上了（宿主 takeoverLeafHeader 建、openPathHomeMenu 出菜单）。
// 画布这边的活只剩「把状态发上去」（updatePathTopBar）与「收到动作就执行」（runCanvasAction 里那几个 case）。
// （「更多」按钮的双点+斜杠提示图标 2026-10-21 删掉了：按钮恒为三个点，见 updateDefaultPathBtn。）

// 初始化左侧一级菜单按钮图标 + tooltip（undo/redo 已移入更多菜单，2026-08-25；路径按钮 2026-09-15 定稿：删除，入口只在「更多」菜单）
// ⚠️ 这里填的必须是**默认态**图标（2026-09-29）：init 到了之后各按钮会按真实状态再刷一次，
//   若这里先填一个"非默认"的样子（原来「更多」填的是带斜杠那版），开屏时图标就会整体换个形状 = 一次可见的跳变。
//   状态由 updateDefaultPathBtn / refreshHideBtnSplit 在 init 后按真实值刷。
['locate', 'hide', 'ai', 'more', 'join-group', 'guide', 'doclib'].forEach(k => {   // 'full' 2026-10-06 去掉：那颗按钮已删（全屏只剩标题栏那一颗）
  const id = k === 'hide' ? 'btn-hide-done' : 'btn-' + k;
  const b = document.getElementById(id);
  if (!b) return;
  b.innerHTML = renderIcon(ICON_FIXED[k], 18);
  // 表里每项 = [文案, 动作 id, 后缀文案]：动作 id 一给，键位段自动接上（nmApplyTip）；
  //   第三项 = 浅色后缀段（2026-10-20 起显式给，以前括号那截是渲染时正则猜的）
  const tipMap = {
    undo: [T('tb.undo')],
    redo: [T('tb.redo')],
    locate: [T('tb.locate'), 'locate'],
    // 2026-10-18：三档机制拆除，这颗就是「隐藏次要节点」开关 → 提示说动作（真实状态由 refreshHideBtnSplit 随后再刷）
    hide: [T('tb.hideMinor'), 'hideMinor'],
    ai: [T('tb.aiEdit')], // 左下 AI 按钮的提示（2026-10-05：⌘/Ctrl 那条说明已撤，见 btn-ai 的 onclick 注释）
    more: [T('common.more')],
    // 🔴 2026-10-10：左下三颗新按钮的提示（后缀段显式给在第三项）
    'join-group': [T('tb.joinGroupBtn')],
    guide: [T('tb.guideBtn')],
    doclib: [T('tb.doclib')],
  };
  nmApplyTip(b, (tipMap[k] || [])[0] || '', (tipMap[k] || [])[1], null, false, (tipMap[k] || [])[2] || '');
  b.dataset.side = 'right'; // 左侧 toolbar 按钮 → tooltip 向右浮动（避开画布）
});
// 「聚焦当前关注」按钮（展开档，2026-09-30）：装载期先填默认态（未激活那颗 + 未开时的提示），
// init 后由 updateNowSideBtn() 按真实状态再刷一次（合成档它带着 .hidden，填了也看不见）。
(function () {
  const b = document.getElementById('btn-now-side');
  if (!b) return;
  b.innerHTML = renderNowIcon('side');
  nmApplyTip(b, T('tb.nowOnly'), 'showNow');
  b.dataset.side = 'right';
})();
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
  const finish = () => {
    if (isSelMode) keepView(paths[0][paths[0].length - 1]); // 选中节点保持屏幕原位（2026-08-26 位置刷新优化）
    else {
      // view 模式落位（2026-09-15 重做，用户定）：缩放全程不变，按主节点可见性三分——
      // 完整可见 → 原地站住（锚定补偿后画面不动）；被视口截断 → 最小平移露出全卡；
      // 完全不在画面里 → 标准机位（中央：--locate-x / --locate-y，缩放仍不变）。
      keepView(currentRoot()); // 锚点 = 主节点；render 末尾 applyPendingKeepView 把它摆回原屏幕位置
      // 2026-10-21：走 renderWithMotion() —— 层级条折 / 展也是「整棵树的结构变化」，卡片该平滑让位。
      //   原来这里是裸 render()，而动画开关 motionArmed 只由 renderWithMotion() 置位 →
      //   量旧位置那一步直接返回 null，整段过渡压根不启动（= 用户报的「点数字没有动画」）。
      renderWithMotion(); // render 内会调 updateFoldBar 重发状态
      viewFoldLocate();
      return;
    }
    renderWithMotion(); // 同上（选中态：折选中子树 + 外部不变）
  };
  // 🔴 2026-10-16：层级条折叠也会**展开**低层（「折到第 N 层」= N 层以下折起、以上展开）。
  //    展开出来的含图分支若尺寸还没记住，render 当场没占位 → 图到达把布局撑开（同 doToggle 那条「第一次展开顿一下」）。
  //    与 doToggle 用同一套「展开前预取」：先把「还没记住尺寸」的图加载一遍，再往下走。
  const need = imgPathsNeedSize(currentRoot());
  if (need.length && !_imgPrefetchBusy) {
    _imgPrefetchBusy = true;
    prefetchImgSizes(need).then(() => { _imgPrefetchBusy = false; finish(); });
    return;
  }
  finish();
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
    // 完全出画：回中央（缩放不变）
    const c = worldCenter(el);
    panX = vr.width * cfgNum('--locate-x', 0.5) / zoom - c.x;
    panY = vr.height * winAlignY(cfgNum('--locate-y', 0.5)) / zoom - c.y;
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
    // 完全不在画面里：回**中央**（--locate-x / --locate-y，2026-09-18 用户定：
    // 与定位按钮同一落点（2026-10-11 大统一后本来就是一个落点）
    const c = worldCenter(el);
    panX = vr.width * cfgNum('--locate-x', 0.5) / zoom - c.x;
    panY = vr.height * winAlignY(cfgNum('--locate-y', 0.5)) / zoom - c.y;
  }
  applyTreeTransform();
  // 正在播过渡时不重画（2026-10-21）：这里一画会按「卡片此刻的动画位置」重设 path 的 d，
  // 下一帧又被逐帧插值覆盖 → 一帧抖动。过渡收尾（playCardMove 的 finish）本来就会自己 drawEdges()。
  if (!motionFrame) drawEdges();
  persistNow();
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
    if (nodeIsNow(n) && !nowVisibleInView(root, n)) return;   // 看不见的 Now 不进定位序列（2026-09-28 同口径）
    const type = typeOf(n);
    if (!type) { (n.children || []).forEach(c => walk(c, ancDepth, ancIsNow)); return; } // 非感兴趣节点：穿过并继承层深
    // 缩进只发生在「Now 套 Now」内部（2026-09-28 用户定）：只有当前关注节点**挂在另一个当前关注之下**
    //   才缩进一级。主节点、选中节点一律不缩进 —— 选中节点哪怕是某个 Now 的子节点，也按正常位置显示。
    const depth = (type === 'now' && ancIsNow) ? ancDepth + 1 : 0;
    // 空图（2026-10-11）：这时"母节点"其实还不存在，定位到它没意义 → 这一项改叫
    //   「新建母节点」，点它就等于点画面中间那枚按钮（建 + 直接进编辑）。用户定的口径。
    const emptyRootItem = (type === 'root') && !!(state.tree && state.tree.empty);
    const item = {
      type, id: n.id, node: n, depth, emptyRoot: emptyRootItem,
      label: emptyRootItem ? T('emptyRoot.btn') : plainTitle(n.title),
      note: emptyRootItem ? '' : (n.note || ''),
    };
    // 身份图标（2026-09-28 用户定）：一个节点可能同时是**主节点 / 选中节点 / 当前关注**，
    //   条目左侧把这些身份按固定顺序叠出来：主节点 → 选中节点 → 当前关注（最多三个）。
    //   ⚠️ 与上面的 type 是两回事：type 只取一个（决定它落在哪一段，优先级 root > now > selected），
    //   roles 是它**全部**的身份，只用于画图标。
    item.roles = [];
    if (n.id === root.id) item.roles.push('root');
    if (n.id === selId) item.roles.push('selected');
    if (nodeIsNow(n)) item.roles.push('now');
    if (type === 'now') item.idx = nowIdx++;
    items.push(item);
    (n.children || []).forEach(c => walk(c, depth, type === 'now'));
  })(root, 0, false);
  // 2026-09-28 用户定：菜单固定按「主节点 → 当前关注 → 选中节点」三段呈现 ——
  //   组内保持先序（DFS 结果不变），只把组间顺序摆正（sort 是稳定的，同组内相对顺序原样保留）。
  //   ⚠️ DOM 顺序 = 这个数组的顺序：locateIdx 就是数组下标，渲染 / 点击 / 加粗态 / 飞出面板全按它对齐，
  //   所以重排只能在这里做，渲染层不许自己再调顺序。
  const segOrder = { root: 0, now: 1, selected: 2 };
  items.sort((a, b) => segOrder[a.type] - segOrder[b.type]);
  return items;
}
// 定位子菜单每缩进一级的像素（2026-09-28）：paddingLeft 增量与「图标区能借用多少空隙」共用同一个值，
// 改这里两处一起变（原来写死 18 出现在两个地方，容易改一处忘另一处）。
const NOW_INDENT_PX = 18;
// 定位按钮右下角的「当前关注」数量角标（2026-10-11 用户定）：数字 = 定位序列第二段「当前关注」的
//   个数（buildLocateItems 同口径：被 Minor 埋掉 / 当前看不见的 Now 本来就不进序列）。0 个不显示。
//   外观全是旋钮：mindmap-app.css「视觉调参区 · 定位按钮」的 --locate-now-badge-*（字号/距右/距底/颜色）。
function updateLocateNowBadge() {
  try {
    const btn = document.getElementById('btn-locate');
    if (!btn) return;
    let badge = btn.querySelector('.shin-locate-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'shin-locate-badge';
      btn.appendChild(badge);
    }
    const n = buildLocateItems().filter(it => it.type === 'now').length;
    badge.textContent = String(n);
    badge.style.display = n > 0 ? '' : 'none';
  } catch (_) {}
}
// 菜单条目的图标区宽度（2026-09-28，纯函数便于自检）：每条算「它需要的宽度 − 能借用的缩进空隙」，
// 取最大值、下限一格（15px）。含义 ——
//   ① 全菜单都只有 1 个图标 → 15px（不占多余空白）；
//   ② 某行图标多出来 → 整列一起推，行与行文字仍然对齐；
//   ③ 缩进的条目先借用自己缩进让出的空隙（depth × NOW_INDENT_PX），放不下的那一点才推到整列上。
function icoWidthOf(items, gap) {
  const needOf = (n) => n * 15 + (n - 1) * gap;
  return items.reduce((m, it) => {
    const need = needOf((it.roles || []).length || 1);
    const free = (it.depth || 0) * NOW_INDENT_PX;
    return Math.max(m, need - Math.min(need - 15, free));   // 最多借用空隙；剩下的才推到整列上
  }, 15);
}
// 选中节点是否**已经被合并进上面某一段**（它同时是主节点 / 当前关注）——是的话，菜单最后那段整段不画
// （连「无选中节点」占位也不给：上面明明有选中节点、下面却说"无"会自相矛盾）。
// ⚠️ 判据必须排除 type === 'selected' 本身：普通节点选中时，它**就是** selected 段的条目，
//   只看"选中 id 在 items 里"会把这一段连它自己一起跳掉（2026-09-28 实踩：选中普通节点后菜单里没有"选中节点"了）。
function selShownElsewhere(items, selId) {
  return !!selId && items.some(it => it.id === selId && it.type !== 'selected');
}
// 身份 → 小图标（2026-09-28）：主节点 home / 选中节点 square-mouse-pointer / 当前关注 = 底部工具条那款
// （Now 图标自带 stroke="#fff" 的黑底版本，在菜单里由 CSS 改回 currentColor；这里只出 svg）
function roleIcon(role) {
  if (role === 'root') return renderIcon('home', 15);
  if (role === 'now') return renderNowIcon('bottom');
  return renderIcon('square-mouse-pointer', 15); // selected（也作兜底）
}
// 菜单里显示的节点名 = 纯文本（剥掉 ** 加粗 / ~~ 删除线 符号；格式本身是渲染层效果）
function plainTitle(t) {
  return String(t || '').replace(/\*\*/g, '').replace(/~~/g, '').trim();
}
function locateToItem(item, keepDim, autoBrightMs) {
  if (!item) return;
  // 空图里那一项 = 「新建母节点」：不定位，直接建 + 进编辑（与画面中间那枚按钮同一动作，2026-10-11）
  if (item.emptyRoot) {
    const m = document.getElementById('now-menu');
    if (m) m.classList.remove('open'); // 定位菜单住在这个容器里（id = now-menu，收起 = 摘 open）
    createRootAndEdit();
    return;
  }
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
    // ⚠️ 只展开**祖先**（挡路的折叠）、**不动目标节点自己**（2026-10-11 用户实报：选中一个折叠的节点、
    //   点定位按钮，它自己的折叠被顺带展开了）。判据用 id 排除 —— 不依赖 pathTo 的尾部顺序，
    //   与历史界面那边同口径（applyNowThenDiffFold 里的 `path.length - 1`）。
    path.forEach(n => { if (n.id !== item.id && n.fold) { n.fold = false; changed = true; } });
    if (changed) { emitUpdate(); render(); }
  }
  const el = document.querySelector('.node-row[data-id="' + item.id + '"] .card');
  if (!el) return false; // 节点超框（无 el）→ 无法定位
  const x = cfgNum('--locate-x', 0.5);
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
    // 飞出面板不在 #now-menu 内 → 全局查（DOM 顺序 = 渲染顺序 = 三段序：主节点 → 当前关注 → 选中节点，与 locateIdx 对齐）
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
  // 图标区宽度（2026-09-28 用户定）：按**本菜单里最多的身份图标数**算一个宽度，所有条目共用 ——
  //   ① 全菜单都只有 1 个图标时不占多余空白（不写死 3 格，那样单图标行会被推得很远）；
  //   ② 某一行多出图标时，整列文字一起右移、行与行仍然对齐（不会只推那一行，看着像错位）。
  //   ⚠️ 缩进的条目可以**借用自己缩进让出的空隙**：多出来的图标先往左伸进空隙，
  //   空隙放不下的那一点点才让整列一起推（推的量 = 放不下的部分，不是一个整图标宽）。
  //   例：缩进一级（18px 空隙）+ 两个图标（33px）→ 33 − 18 = 15，即一格宽，整列不用推。
  //   图标 15px 是 CSS 里 .now-num-ic svg 的尺寸；间距读 --now-ico-gap；空隙 = depth × NOW_INDENT_PX。
  const icoW = icoWidthOf(items, cfgNum('--now-ico-gap', 3));
  // 条目悬浮定位延时（2026-09-11 用户：一悬浮就定位太灵敏）—— 停够 --locate-item-delay-ms 才预览，扫过不动
  let hoverTimer = null;
  const hoverDelay = cfgNum('--locate-item-delay-ms', 200); // 旋钮在 :root「视觉调参区」--locate-hover-delay-ms 的下一行
  // 2026-09-11 用户定（回归）：多级 = 同面板缩进树 —— 平级项（主/顶层 Now）并排，
  //   Now 之下的子 Now / 选中节点按 depth 缩进一级（每级 18px），全部展开同时可见。
  const renderItem = (item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'now-num' + (i === locateIdx ? ' bold' : '') + (item.type === 'now' ? ' is-now' : '');
    // 多级缩进（2026-09-11 用户定）：Now 之下的子 Now / 选中节点缩进一级（每级 18px）；平级项并排
    if (item.depth) b.style.paddingLeft = (8 + item.depth * NOW_INDENT_PX) + 'px';
    // 不设 b.title：系统原生 tooltip 用户不要（2026-09-11）
    // 2026-09-11 用户定：**与画布节点同源渲染** —— 标题直接用 cardTitleInner(node)
    //   （画布节点卡用的就是它：Minor/Now 前缀图标 + renderInline 富文本，加粗/删除线/链接原样呈现）；
    //   备注放标题**下方**（不左右排）；全文不截断、长了折行（与 .card .title 同款 white-space/word-break）；
    //   菜单项宽度与节点卡一致（max-content，上限同 --card-maxw）。
    const ic = document.createElement('span');
    ic.className = 'now-num-ic';
    // 图标 = 这个节点的**全部身份**（2026-09-28 用户定），顺序：主节点 → 选中节点 → 当前关注。
    // 图标区宽度 = 本菜单最多图标数那一档（见上面的 icoW）：全菜单统一 → 行与行文字对齐。
    // 用固定 width（不是 min-width）：缩进条目图标多出来时**向左溢出**吃进缩进空隙，
    // 文字位置不受影响（靠右排 + 固定宽 → 超出的部分溢到 start 侧）。
    ic.style.width = icoW + 'px';
    ic.innerHTML = (item.roles && item.roles.length ? item.roles : [item.type]).map(roleIcon).join('');
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
  };
  // 三段渲染（2026-09-28 用户定）：主节点 / 当前关注 / 选中节点，段与段之间一条分隔线；
  //   后两段没有内容时插一个**置灰占位项**（「无当前关注节点」/「无选中节点」），
  //   让"这一段本该有什么"一直有预期，菜单结构不会忽长忽短。
  //   ⚠️ 分隔线与占位项都**不带 .now-num** —— 它们不是条目、不可点，也不许参与 locateIdx 的计数
  //   （updateNowMenuBold / 飞出面板都按 `#now-menu .now-num` 的顺序取下标）。
  // 选中节点已经被合并进上面某一段了（它同时是主节点 / 当前关注）→ 最后这段**整个不画**，
  //   连「无选中节点」那句占位也不要（2026-09-28 用户实机反馈：上面明明有选中节点，下面却说"无"，
  //   看着像自相矛盾）。只有真没选中任何节点时，才画占位。
  const selShown = selShownElsewhere(items, state.selectedId);
  const segs = [
    { type: 'root', empty: '' },                    // 主节点段永远有内容，不给占位
    { type: 'now', empty: T('now.none') },
    { type: 'selected', empty: T('now.noSel'), skip: selShown },
  ];
  let drawn = false;
  segs.forEach(seg => {
    if (seg.skip) return;                           // 整段不画（分隔线也不画）
    const list = [];
    items.forEach((item, i) => { if (item.type === seg.type) list.push([item, i]); });
    if (!list.length && !seg.empty) return;         // 主节点自己被标成 Now 时本段会空 → 整段不画（也不画它的分隔线）
    if (drawn) { const s = document.createElement('div'); s.className = 'now-sep'; menu.appendChild(s); }
    if (list.length) list.forEach(([item, i]) => renderItem(item, i));
    else {
      // 占位项也带该段的类型图标（2026-09-28 用户定）：与真条目同款图标，跟着文字一起置灰
      const d = document.createElement('div');
      d.className = 'now-empty';
      const ic = document.createElement('span');
      ic.className = 'now-empty-ic';
      ic.innerHTML = roleIcon(seg.type);   // 占位项也用该段自己的类型图标（与真条目同一套）
      ic.style.width = icoW + 'px';        // 与真条目同宽 → 占位那行文字也和上面的条目对齐
      const tx = document.createElement('span');
      tx.textContent = seg.empty;
      d.appendChild(ic);
      d.appendChild(tx);
      menu.appendChild(d);
    }
    drawn = true;
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
// （二级菜单两项 #fm-now / #fm-minor 及其事件已随三档机制一起删除：2026-10-18 —— 现在两枚一级按钮各管各的）
// 「聚焦当前关注」按钮（#btn-now-side）：切换 showNow，无可用 Now 时置灰
// 置灰用 .disabled 类（不用 disabled 属性，为保留 hover tooltip）→ onclick 必须自己拦
const btnNowSide = document.getElementById('btn-now-side');
if (btnNowSide) {
  btnNowSide.onclick = () => { if (!btnNowSide.classList.contains('disabled')) setShowNow(!state.showNow); };
  applyProGate(btnNowSide); // Pro 拦截（2026-09-04）：侧边 Now 按钮那一份
}
// 初始刷新按钮态（置灰/激活由 init 收到的 msg.showNow / msg.hideDone 经 setShowNow / setHideDone 应用）
updateNowFilterItem();
// 「隐藏次要节点」（#btn-hide-done，一级）：左键直接切（2026-10-18：三档机制拆除后不再有菜单分派）
document.getElementById('btn-hide-done').onclick = (e) => {
  e.stopPropagation();
  const _hb = e.currentTarget;
  if (_hb && !_hb.classList.contains('disabled')) setHideDone(!state.hideDone);
};
applyProGate(document.getElementById('btn-hide-done')); // Pro 拦截（2026-09-04）：Minor（隐藏完成）按钮
// （#filter-menu / #fm-now / #fm-minor 及其开合、点外收起那套已随三档机制一起删除：2026-10-18）
updatePathMenuBtns(); // 菜单项初始置灰态（「更多」平铺 4 项，函数内有 if 守卫，无按钮时不报错）
// 更多（2026-09-28）：改成点击浮出 —— 悬停不再弹，点一下开 / 再点一下收；
// 点菜单项、点画布别处也会收（见下面两处 remove('open')）。
// 「更多」那颗按钮 2026-10-06 已删（功能融进系统标题栏那颗）→ 这里不再绑事件。
// ⚠️ `#more-menu` 本身**保留**：宿主顶部菜单要靠"点它里面的按钮"来执行撤销/重做/历史/保存，
//    置灰状态也从它这儿读（见 updateUndoRedo()）。它默认 display:none，没人加 .open 就永不显示。
// AI 编辑按钮（2026-09-27 用户定）：点击弹出「AI 编辑」弹窗（与右键「复制 AI 定位路径」同源，见 openAiEditOfSelected）；
// 没选中节点也能点 —— 默认把主节点当作目标（2026-09-27 二轮定稿）；图标颜色恒为正常色，不随选中变化。
const btnAi = document.getElementById('btn-ai');
// 2026-09-28 改：点它不再直接弹「AI 编辑」弹窗，而是开合底部的 AI 输入条（功能还没接，先做外观与开合）。
// 原来那条 openAiEditOfSelected() 留着没删 —— 以后接功能时要用它的定位信息。
// ⚠️ 2026-10-05 当天加了「⌘/Ctrl+点击 = 复制 AI 定位路径」，同日又**按用户要求撤掉**：
//   这颗按钮现在只有一个行为 —— 点一下开合底部 AI 输入条。
//   （「复制 AI 定位路径」已经作为独立一项放在**底部工具条的 AI 面板**里，不需要再挂在这颗按钮上。）
if (btnAi) btnAi.onclick = (e) => {
  e.stopPropagation();
  toggleAiInputBar();
};
// 「AI 功能」总开关的显隐（2026-10-08；前身是 2026-09-28 只管左下那颗按钮的版本）。
// 关掉时藏三处 / 收两个浮层：
//   ① 左下角那颗「AI 编辑」按钮（骨架里就叫 #btn-ai）
//   ② 底部工具条那颗「AI」按钮 + 它前面那根分隔线（两颗都带 data-ai，靠容器上的 .ai-off 整组收）
//   ③ 已经打开的 AI 面板 / AI 输入条一并收掉（不然留着一个没有入口的浮层）
// ⚠️ 只藏入口，功能本体都在：右键菜单 / 底部面板里那几项照旧可用。
// ⚠️ 现取元素、不用上面的 btnAi：init 消息可能比那行代码先到，那时 btnAi 还是未初始化。
// ⚠️ 用 class 切换、不用 style.display（2026-09-29）：骨架里的初始显隐也走 .hidden 这个类，
//   两处口径一致才不会被 CSS 的 `.tb.hidden { display:none }` 压过（内联 display:'' 清不掉类）。
// ============ 右侧「关闭分屏」图标（2026-10-11 用户定）============
// 场景：左边点好几个文档节点（⌘/Ctrl 点击）→ 右边堆一堆文档标签，只能一个个关，很烦。
// 口径：只管**插件自己开的那个文档分屏组**（宿主的 docPaneLeaf 那一组），不动用户自己分的屏。
// 链路：宿主 layout-change → 推 `setDocSplits(on)` → 这里显隐；点它 → 发 `closeDocSplits` 让宿主关。
// 位置/大小/颜色全走 CSS 旋钮（--close-splits-*，见 mindmap-app.css 调参区），默认右边缘、上下居中。
let closeSplitsBtn = null, splitMoreBtn = null;
// 🔴 2026-10-20 用户定：三个点那颗「分屏设置」按钮**先隐藏** —— 改由「⌘/Ctrl + 点击 X」打开同一个弹窗，
//   按钮区只留一颗图标（省地方，也免得两颗按钮的 hover / 上膛逻辑一直要维护）。
//   **代码留着不删**（容器 / armed / CSS / 探针全在）：以后想恢复成"悬浮出三个点"，把这里改 true 即可。
const SPLIT_MORE_BTN_ENABLED = false;
function ensureCloseSplitsBtn() {
  if (closeSplitsBtn && document.body.contains(closeSplitsBtn)) return closeSplitsBtn;
  const host = document.getElementById('view-map') || document.body;
  // 🔴 2026-10-20 二改（用户实报"悬浮了但三个点不出现"）：把两颗按钮**包进一个容器**，
  //   显隐交给容器的 `:hover`，不再靠 JS 的 mouseenter/mouseleave 计时。
  //   为什么：两颗之间有一小段缝，指针从 X 往下滑时先离开 X、还没进到三个点上 ——
  //   JS 那套靠"延时收"硬撑，任何时序抖动（layout-change 重推、事件顺序）都会让三个点闪掉。
  //   包进容器后**缝也算容器的地盘**，`#split-ctrl:hover` 一直成立 → 指针怎么滑都不断。
  //   容器自己负责定位（原来两颗各自 absolute）；按钮改成 static 排在容器里。
  let wrap = document.getElementById('split-ctrl');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'split-ctrl';
    wrap.className = 'split-ctrl hidden';
    host.appendChild(wrap);
  }
  const b = document.createElement('button');
  b.id = 'btn-close-splits';
  b.type = 'button';
  b.className = 'close-splits-btn';
  b.innerHTML = renderIcon('close-splits', 20); // 尺寸由 CSS 的 --close-splits-size 收口（这里给的只是兜底）
  // 点 X：**普通点击 = 关分屏**（原行为）；**⌘/Ctrl + 点击 = 打开「分屏设置」**（2026-10-20 用户定：
  //   原来那颗「更多」三个点已隐藏，功能挪到这个手势上）。与画布其它按钮同一套习惯（⌘/Ctrl = 另一种用法）。
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) { vscode.postMessage({ type: 'openSplitMore' }); return; }
    vscode.postMessage({ type: 'closeDocSplits' });
  });
  nmApplyTip(b, T('tb.closeSplits')); // 黑色小字提示（与画布其它按钮同一套）
  // 提示**放图标左边**（2026-10-11 用户定）：这颗图标贴着画布右边缘，提示放上面会被右边缘切掉/遮住。
  b.dataset.side = 'left';
  wrap.appendChild(b);
  closeSplitsBtn = b;

  if (SPLIT_MORE_BTN_ENABLED) {
    // 「更多」（2026-10-20 用户定）：鼠标悬浮「关闭分屏」时，它**下面**冒出三个点；
    //   点开是宿主那边一个小弹窗（「点击文档节点时，自动隐藏侧边栏」开关）。
    //   图标复用画布左下那颗「更多」（ICON_FIXED.more = more-horizontal），尺寸照 --close-splits-* 同一套旋钮。
    //   ⚠️ 显隐是**纯 CSS**（`.split-ctrl:hover #btn-split-more`），这里不挂任何 mouse 事件 —— 见上面容器的说明。
    const m = document.createElement('button');
    m.id = 'btn-split-more';
    m.type = 'button';
    m.className = 'close-splits-btn split-more-btn';
    // ⚠️ 2026-10-20：这里原来是 `renderIcon('more', 20)` —— ICONS 里**没有** `more` 这个键
    //   （那颗图标在 ICONS 里叫 `more-horizontal`，`more` 只是 ICON_FIXED 的**别名**）。
    //   renderIcon 查不到就返回空串 → 按钮里什么都没有 = 悬浮了也看不见三个点（用户实报"不出来"）。
    //   所以图标名一律走 ICON_FIXED.more，别手写字面量。
    m.innerHTML = renderIcon(ICON_FIXED.more, 20);
    m.addEventListener('click', (e) => { e.stopPropagation(); vscode.postMessage({ type: 'openSplitMore' }); });
    // 提示小字用「分屏设置」（2026-10-20 用户定：原来借的是 `common.more`「更多」，和别处的「更多」混在一起分不清）
    nmApplyTip(m, T('splitMore.tip'), '');
    m.dataset.side = 'left';
    wrap.appendChild(m);
    splitMoreBtn = m;

    // 三段式（2026-10-20 三改，用户定）：
    //   ① 指针**必须先碰到 X** → 给容器上膛（data-armed）；
    //   ② 之后在容器里怎么滑都保持（CSS 判 `[data-armed="1"]:hover`，缝也算容器地盘）；
    //   ③ 离开容器 → 卸膛。
    //   为什么不能只用 `:hover`：三个点 `opacity:0` 但**保留占位**（容器高度要恒定），
    //   那块占位区也在容器里 → 指针从下往上滑、还没到 X 时就会把容器 hover 上，
    //   三个点提前冒出来，用户觉得"很怪"（原话）。
    b.addEventListener('mouseenter', () => { wrap.dataset.armed = '1'; });
    wrap.addEventListener('mouseleave', () => { delete wrap.dataset.armed; });
  }
  return b;
}
function applyDocSplits(on) {
  ensureCloseSplitsBtn();
  // 显隐只看**容器**：分屏在 → 露出 X（三个点仍由 :hover 决定）；分屏没了 → 整块收起
  const wrap = document.getElementById('split-ctrl');
  if (wrap) wrap.classList.toggle('hidden', !on);
}
function applyAiFeaturesVisibility() {
  const on = aiFeaturesOn;
  const b = document.getElementById('btn-ai');
  if (b) b.classList.toggle('hidden', !on);
  const m = document.getElementById('node-menu');
  if (m) m.classList.toggle('ai-off', !on);
  if (!on) { hideAiMenu(); if (aiInputOn) closeAiInputBar(); }
}
// 左下那颗「内嵌文件管理」按钮 2026-10-08 当天加、当天按用户要求**撤掉**（入口改到系统标题栏「更多」菜单里）。
// 消息通道 `openDocLibrary` 与宿主那条 case 都留着：要把按钮放回来，骨架里补一颗带 data-icon-key 的按钮、这里补 onclick 即可。
// 🔴 2026-10-10 用户定：左下**加回三颗按钮**（挂在 AI 按钮下面 / 最下面）——
//   ① 「加入群聊」② 「使用指南」：原来在「更多」菜单里，现在搬出来当按钮（设置页「按钮简化」
//      那两行开关改为控制这两颗，同一名单 join-group / guide）；动作与菜单里那两项**完全相同**。
//   ③ 「思维导图文档库」：挂最下面，点击发 openDocLibrary → 宿主开侧边栏面板（默认「被当前思维导图管理的文档」分页）；
//      设置「实验性功能 → 文档库」关着时整颗藏（骨架按 docsOn 写死 + applyDocsLibrary 随开关即时切）。
const btnJoinGroup = document.getElementById('btn-join-group');
if (btnJoinGroup) btnJoinGroup.onclick = (e) => { e.stopPropagation(); openUrl(JOIN_GROUP_URL); };
const btnGuide = document.getElementById('btn-guide');
if (btnGuide) btnGuide.onclick = (e) => { e.stopPropagation(); openUrl(GUIDE_URL); };
const btnDoclib = document.getElementById('btn-doclib');
if (btnDoclib) btnDoclib.onclick = (e) => { e.stopPropagation(); vscode.postMessage({ type: 'openDocLibrary' }); };
if (btnDoclib) applyProGate(btnDoclib); // Pro 拦截（2026-10-11）：文档库入口（未激活悬浮变票、点击进激活引导）
// 「按钮简化」那两行 → 左下两颗按钮的显隐（init / setMorePanel 两处都调；用 class 与骨架同一口径）
function applyMorePanelButtons() {
  const raw = (state.morePanel && typeof state.morePanel === 'object') ? state.morePanel : {};
  const hidden = Array.isArray(raw.hidden) ? raw.hidden : [];
  const jg = document.getElementById('btn-join-group');
  if (jg) jg.classList.toggle('hidden', hidden.indexOf('join-group') >= 0);
  const gd = document.getElementById('btn-guide');
  if (gd) gd.classList.toggle('hidden', hidden.indexOf('guide') >= 0);
}
// 「文档库」总开关 → 左下那颗文档库按钮的显隐（setDocsLibrary / applyDocsLibrary 两处都调）
function applyDoclibBtnVisibility() {
  const b = document.getElementById('btn-doclib');
  if (b) b.classList.toggle('hidden', !docsLibraryOn);
}

// ⚠️ 装载期**不要再无条件调一次**（2026-09-29 移除）：那一刻 aiFeaturesOn 还是默认值（关），
//   会把「设置为开」的按钮也先藏起来，等 init 到了再展开 —— 用户看到的就是"按钮坍缩一下又展开"。
//   初始显隐已由骨架按设置写死（见 main.js buildFrameHtml 的 aiOn），这里等 init / 设置页推送再改。
// ===== AI 输入条（2026-09-28）=====
// 结构：框外左侧关闭叉 + 蓝框（左加号 / 中间输入框 / 右发送圆钮）。
// 位置与底部工具条同一档（居中、距底边同高），宽度略长；显隐与工具条互斥（见 showNodeMenu 的守卫）。
function ensureAiInputBar() {
  if (aiInputBar) return aiInputBar;
  const bar = document.createElement('div');
  bar.id = 'ai-input-bar';
  bar.className = 'hidden';
  // tip 传空 = 不挂黑色小字（关闭叉与加号都不挂，用户 2026-09-28：这两个看图标就懂）
  const mkBtn = (id, cls, icon, size, tip) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = cls;
    if (tip) { b.dataset.tip = tip; b.dataset.side = 'top'; } // 底部元素 → 提示向上弹
    b.innerHTML = renderIcon(icon, size);
    return b;
  };
  const main = document.createElement('div');
  main.className = 'ai-bar-main';
  // 关闭叉：2026-09-28 从「框外左侧」挪到「框的右上方」（在提示词那一行的右端，见下面的 hintWrap）
  const close = mkBtn('ai-bar-close', 'ai-bar-close', 'x', 18);
  close.onclick = (e) => { e.stopPropagation(); closeAiInputBar(); };
  const box = document.createElement('div');
  box.className = 'ai-bar-box';
  const plus = mkBtn('ai-bar-plus', 'ai-bar-plus', 'plus', 20);
  // 「＋」的子菜单（2026-09-28）：目前一项「导入 AI 网页回答」；点了弹输入链接的弹窗，确认后先不做任何事
  plus.onclick = (e) => {
    e.stopPropagation();
    // 2026-10-18：原来的「作者本机才可用」判据（state.authorMachine）已随机器检测一起删掉；
    //   现在由调试区「AI ＋子菜单」开关控制（settings.aiPlusMenu，默认关）——
    //   关着点「＋」弹「功能开发中」；开着弹子菜单。功能正式开放时把开关删掉、这里永久接回子菜单。
    if (!state.aiPlusMenu) { toast(T('toast.featureSoon'), true); return; }
    toggleAiPlusMenu();
  };
  const ta = document.createElement('textarea');
  ta.id = 'ai-bar-input';
  ta.className = 'ai-bar-input';
  ta.rows = 1;
  ta.spellcheck = false;
  ta.placeholder = T('aiBar.placeholder'); // 「你想让 AI 做什么？」灰字，一打字就没（原生 placeholder）
  // 打字多了往上长（底部固定 → 只能往上长）：先塌成 auto 再量 scrollHeight，超过上限就框内滚动
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, cfgNum('--ai-bar-maxh', 160)) + 'px';
  });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeAiInputBar(); } });
  // 发送钮图标换成用户给的那颗（实心圆 + 挖空箭头一体成型，2026-09-28）；颜色跟随主题色
  const send = mkBtn('ai-bar-send', 'ai-bar-send', 'send-circle', 26, T('aiBar.send'));
  send.onclick = (e) => { e.stopPropagation(); sendAiInput(); };
  box.appendChild(plus);
  box.appendChild(ta);
  box.appendChild(send);
  main.appendChild(close);
  main.appendChild(box);
  // 框上方的小提示词（2026-09-28 用户定）：没选中 →「当前视图」；选中 1 个 →「当前 xxx 节点」；
  //   多选 →「当前选中 N 个节点」。鼠标浮上去，右侧冒出一个 ✕ = 取消选中（回到"当前视图"）。
  const hintWrap = document.createElement('div');
  hintWrap.className = 'ai-bar-hint-wrap';
  const hint = document.createElement('span');
  hint.id = 'ai-bar-hint';
  hint.className = 'ai-bar-hint';
  const hintClear = mkBtn('ai-bar-hint-clear', 'ai-bar-hint-clear', 'x', 13);
  hintClear.onclick = (e) => {
    e.stopPropagation();
    state.selectedId = null;
    state.multiSelected.clear();
    refreshSelectionClasses(); // 末尾会顺手刷新提示词（见那里的 aiInputOn 分支）
    hideNodeMenu();
    updateToolbar();
  };
  hintWrap.appendChild(hint);
  hintWrap.appendChild(hintClear);
  hintWrap.appendChild(close);   // 关闭叉放这一行最右端 → 视觉上在「框的右上方」
  // 「＋」的子菜单：挂在输入条里（absolute 定位到加号上方）
  const plusMenu = document.createElement('div');
  plusMenu.id = 'ai-plus-menu';
  plusMenu.className = 'hidden';
  const imp = document.createElement('button');
  imp.type = 'button';
  imp.id = 'ai-plus-import';
  imp.className = 'ai-plus-item';
  imp.innerHTML = renderIcon('square-arrow-right-enter', 16) + '<span>' + T('aiBar.import') + '</span>';
  imp.onclick = (e) => { e.stopPropagation(); closeAiPlusMenu(); openAiImportPrompt(); };
  plusMenu.appendChild(imp);
  // 导入链接后，输入框**上方**多出来的一条小条（2026-09-28）：
  //   [导入图标] 导入 AI 回答链接，<链接>   ………  ✕（点它取消这次导入）
  const chip = document.createElement('div');
  chip.id = 'ai-import-chip';
  chip.className = 'hidden';
  const chipIc = document.createElement('span');
  chipIc.className = 'ai-chip-ic';
  chipIc.innerHTML = renderIcon('square-arrow-right-enter', 15);
  const chipTx = document.createElement('span');
  chipTx.className = 'ai-chip-text';
  const chipX = document.createElement('button');
  chipX.type = 'button';
  chipX.className = 'ai-chip-close';
  chipX.innerHTML = renderIcon('x', 14);
  chipX.onclick = (e) => { e.stopPropagation(); aiImportUrl = ''; updateAiImportChip(); };
  // 点小条本身（不是右边的叉）→ 再弹一次导入弹窗，里面预填上次那条链接，方便改（2026-09-28 用户定）
  chip.onclick = (e) => {
    if (e.target && e.target.closest && e.target.closest('.ai-chip-close')) return; // 点叉交给叉自己
    e.stopPropagation();
    openAiImportPrompt();
  };
  chip.appendChild(chipIc);
  chip.appendChild(chipTx);
  chip.appendChild(chipX);
  bar.appendChild(hintWrap);
  bar.appendChild(chip);
  bar.appendChild(main);
  bar.appendChild(plusMenu);
  // 点别处收掉子菜单（点输入条自己内部不算）
  document.addEventListener('mousedown', (e) => {
    if (!aiPlusMenuOpen) return;
    if (e.target && e.target.closest && (e.target.closest('#ai-plus-menu') || e.target.closest('#ai-bar-plus'))) return;
    closeAiPlusMenu();
  });
  // 滚轮只滚框内、不带动画布（2026-09-28 用户实报）：画布的滚轮平移是冒泡触发的，这里截住即可。
  // 只拦 wheel —— 键盘一律不拦（框里要正常打字，画布那套 menuKeyGuard 不适用）。
  bar.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  document.body.appendChild(bar);
  aiInputBar = bar;
  return bar;
}
// 提示词刷新加固（2026-09-28 实踩两次）：改选中的路径有好几条（点选 / ⌘多选 / Shift 区间 / 框选 / 取消），
// 靠一个个挂钩子漏了两次 → 这里直接盯画布行的 class 变化（选中就是换 class），变了就刷，rAF 合并。
// 只在输入条开着时才做事，开销可忽略。
function watchAiBarHint() {
  if (aiHintWatcher) return;
  try {
    aiHintWatcher = new MutationObserver(() => {
      if (!aiInputOn || aiHintRaf) return;
      aiHintRaf = requestAnimationFrame(() => { aiHintRaf = 0; updateAiBarHint(); });
    });
    aiHintWatcher.observe(treeEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
  } catch (_) {}
}
// 框上方那行小提示词：跟着当前选中状态走（refreshSelectionClasses / 框选结束 / class 观察器三处都会叫它）
//   没选中 →「当前视图」（**不显示**取消叉：没东西可取消）
//   选中 N 个 →「选中一个节点」/「选中 N 个节点」，这时才冒出取消叉（点了清掉选中，回到「当前视图」）
function updateAiBarHint() {
  const el = document.getElementById('ai-bar-hint');
  if (!el) return;
  const clr = document.getElementById('ai-bar-hint-clear');
  // 选中个数：**以画面上高亮的选中行数为准**（.selected / .multi-selected），state 兜底取较大值。
  // ⚠️ 2026-09-28 实踩：只看 state.multiSelected 时，多选后仍显示"编辑当前视图" ——
  //   因为框线高亮与 state 在个别路径上不同步。用户看到几个选中就该报几个，所以两边取大的那个。
  const domN = document.querySelectorAll('#tree .node-row.selected, #tree .node-row.multi-selected').length;
  const stateN = state.multiSelected.size > 1 ? state.multiSelected.size : (state.selectedId ? 1 : 0);
  const n = Math.max(domN, stateN);
  if (!n) {
    el.textContent = T('aiBar.hintView');
    if (clr) clr.classList.add('hidden');
    return;
  }
  // 多选：AI 一次只处理一个节点 → 直说"只支持选中一个节点"，旁边的叉点了就取消选中（2026-09-28 用户定）
  el.textContent = n === 1 ? T('aiBar.hintOne') : T('aiBar.hintMultiUnsupported');
  if (clr) clr.classList.remove('hidden');
}
// 导入的 AI 网页回答链接（2026-09-28）：由「＋ → 导入 AI 网页回答」写入；只有 chip 的 ✕ 会清掉
//（关闭输入条**不再**清空内容与链接 —— 用户 2026-09-28 定：关掉再打开要保留，方便接着改）
let aiImportUrl = '';
// 导入弹窗（2026-09-28）：两处入口共用 —— 「＋」菜单里的那一项、以及点输入框上方那条小条。
// 预填上次填过的链接（initial），所以是"可二次编辑"的。
function openAiImportPrompt() {
  showPromptH(T('aiBar.importTitle'), T('aiBar.importHint'), T('aiBar.importPh'), (val) => {
    const url = String(val || '').trim();
    if (!url) return;
    aiImportUrl = url;
    updateAiImportChip();
  }, aiImportUrl);
}
// 输入框上方那条「导入 AI 回答链接，xxx」小条的显隐与文字
function updateAiImportChip() {
  const chip = document.getElementById('ai-import-chip');
  if (!chip) return;
  if (!aiImportUrl) { chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  const t = chip.querySelector('.ai-chip-text');
  if (t) t.textContent = T('aiBar.importChip', aiImportUrl);
}
// 点发送（2026-09-28）：把框里的字 + 导入的链接交给 AI 编辑弹窗（文案按情况改写），然后收起输入条。
// 框是空的、也没导入链接时也照弹 —— 与「点左下 AI 编辑按钮」的老行为一致（第 5 条走默认那句）。
function sendAiInput() {
  const ta = aiInputBar && aiInputBar.querySelector('#ai-bar-input');
  const text = ta ? ta.value.trim() : '';
  openAiEditOfSelected({ userText: text, importUrl: aiImportUrl });
  closeAiInputBar();
}
// 「＋」的子菜单开合（2026-09-28）
let aiPlusMenuOpen = false;
function toggleAiPlusMenu() {
  const m = document.getElementById('ai-plus-menu');
  if (!m) return;
  if (aiPlusMenuOpen) { closeAiPlusMenu(); return; }
  aiPlusMenuOpen = true;
  m.classList.remove('hidden');
}
function closeAiPlusMenu() {
  aiPlusMenuOpen = false;
  const m = document.getElementById('ai-plus-menu');
  if (m) m.classList.add('hidden');
}
// 清空输入条内容（框里的字 + 导入的链接）：只在"关太久再打开"时用（2026-09-28 用户定）
function clearAiInputBar() {
  if (!aiInputBar) return;
  const ta = aiInputBar.querySelector('#ai-bar-input');
  if (ta) { ta.value = ''; ta.style.height = ''; }
  aiImportUrl = '';
  updateAiImportChip();
}
function openAiInputBar() {
  const bar = ensureAiInputBar();
  aiInputOn = true;
  // 关太久（超过 AI_INPUT_KEEP_MS）再打开 → 内容不保留了，清空重新开始
  if (aiClosedAt && Date.now() - aiClosedAt > AI_INPUT_KEEP_MS) clearAiInputBar();
  aiClosedAt = 0;
  bar.classList.remove('hidden');
  updateAiBarHint();
  updateAiImportChip();
  watchAiBarHint();
  hideNodeMenu(); // 底部那排节点按钮让位（两者不叠在一起）
  const ta = bar.querySelector('#ai-bar-input');
  if (ta) setTimeout(() => { try { ta.focus(); } catch (_) {} }, 0);
}
function closeAiInputBar() {
  aiInputOn = false;
  closeAiPlusMenu(); // 子菜单一起收
  if (aiInputBar) aiInputBar.classList.add('hidden');
  // 关掉**不清空**（再点开还是原来那些字），但记下关闭时刻：超过 AI_INPUT_KEEP_MS 再打开才清（见 openAiInputBar）
  aiClosedAt = Date.now();
  showNodeMenu(); // 收起来后把节点按钮还回来（有选中就重新显示）
}
function toggleAiInputBar() { if (aiInputOn) closeAiInputBar(); else openAiInputBar(); }
// 画布里的两颗全屏按钮（左下 #btn-full / 顶部条 #btn-full-top）2026-10-06 都删了：
// 全屏只剩系统标题栏上那一颗（宿主 takeoverLeafHeader 建）——点击=窗口全屏、⌘/Ctrl+点击=桌面全屏，
// 全屏中点击=退出（那一档判断在宿主那颗的 click 里，走 toggleFullscreen 同一套状态机）。
// Esc 那条入口不受影响，仍在下面的 keydown 里（fsModeNow）。
// 左下「更多」菜单（2026-09-28）：点击开合。
// 原先是 hover 浮出（bindHoverMenu：mouseenter 开 / mouseleave 延迟 220ms 收）—— 那套是为
// 「按钮 ↔ 菜单」间隙的死区准备的，改点击后不再需要，整段删掉。
// 显隐仍走 #more-menu 的 .open 类（CSS `#more-menu.open{display:flex}`），与原来一致。
function toggleLeftMoreMenu() {
  const menu = document.getElementById('more-menu');
  if (menu) menu.classList.toggle('open');
}
// 左下那颗「更多」按钮（2026-10-18 放回来）：点击开合菜单。这颗 2026-10-06 删过一次
//   （当时入口在系统标题栏那颗「更多」）；现在标题栏那颗被藏起来，入口回到这里。
//   ⚠️ 点外部收起那条逻辑早就排除 #btn-more 了（见文件末尾的 mousedown），这里只补 click。
(function bindLeftMoreBtn() {
  const b = document.getElementById('btn-more');
  if (!b) return;
  b.onclick = (e) => { e.stopPropagation(); toggleLeftMoreMenu(); };
})();

// ===== 左下「更多」菜单的条目显隐（2026-09-18，设置页「按钮简化」）=====
// 与 main.js 的 MORE_PANEL_TOKENS / MORE_PANEL_LOCKED 一一对应（那边管设置页、这边管渲染）；
// 顺序还有第三处：宿主 buildFrameHtml 里 #more-menu 的骨架 —— 改顺序要三处一起改。
// 这个菜单**不可拖**（用户定）→ 骨架写死顺序，这里只按 hidden 名单收 / 放。
// 2026-09-21 用户定：删除「将该视图存为捷径 / 快捷键 / 设置与 Bug 提报 / 自定义该面板」四项 ——
// 捷径改走命令 canvas-save-shortcut（⌘/）与右键菜单；另三项入口收进设置页与原生快捷键页。
// 🔴 2026-10-20 用户定（本菜单改版）：
//   ① 路径那 4 项（path-back / path-fwd / path-default / path-save）**删掉** —— 那几个动作已经在画布左上角了；
//   ② 空出来的位置换成「文档属性」「思维导图文档库」两个查看入口（props / doclib）；
//   ③ 「join-group / guide」2026-10-10 曾搬到**左下角按钮**，2026-10-20 搬回菜单（sep3 也跟着回来）；
//      设置页那两行开关仍走 settings.morePanel.hidden（token 名没变，自动生效）。
// ⚠️ 数组字面量里**只放字符串**：test.mjs 会把它抠出来 `JSON.parse`，夹注释会当场炸（2026-10-20 实踩）。
const NM_MORE_ORDER = ['undo', 'redo', 'sep1', 'props', 'doclib', 'search', 'sep2',
  'history', 'save-snapshot', 'sep3', 'join-group', 'guide'];
// 锁定项：必须在菜单里、且关不掉（设置页里那几行是「开 + 置灰」）。脏数据里带着它们也一律纠正回来。
const NM_MORE_LOCKED = ['history', 'save-snapshot']; // 「设置与 Bug 提报」2026-09-18 用户定允许关闭
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
    btn.dataset.side = 'right'; // 提示弹到条目**右侧**（朝画布内侧）。菜单本身在 more 按钮右侧弹出（left:100%），
    //   条目提示再向左伸会掉出菜单盒子（还会被画布左缘切）—— 2026-10-20 修：原来写 'left' 是反的，注释也写反了。
    // 黑色小字提示（2026-10-20 用户定：以前只有部分项有，现在每一项都补上）——
    //   撤销/重做的快捷键也挪到提示里了，菜单右侧不再重复显示（骨架里已去掉 data-shortcut）。
    //   浅色后缀段走骨架的 data-tip-h（显式给；没有就没有那一段）。
    nmApplyTip(btn, btn.dataset.tip || label);
  });
})();
document.getElementById('more-menu').querySelectorAll('.mm').forEach(btn => {
  btn.onclick = e => {
    e.stopPropagation();
    const act = btn.dataset.act;
    if (act === 'undo') doUndo();
    else if (act === 'redo') doRedo();
    // ⛔ 2026-10-20 退役：路径 4 项已从菜单里删掉（那几个动作在画布左上角）。
    //   分支**留着不删** —— 以后想把菜单项加回来，接上就能用。
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
    // 2026-10-20 用户定：菜单里点哪一项，右侧面板就**只展开哪一组**（另外两组折上）。
    //   「历史记录」不再是"打开历史面板"，而是切到属性页、只展开第三组。
    else if (act === 'history') vscode.postMessage({ type: 'openDocProps', group: 'hist' });
    else if (act === 'save-snapshot') manualSaveSnapshot();
    // 2026-10-20 新增：两个「查看」入口（原来这块是路径那 4 项）
    else if (act === 'props') vscode.postMessage({ type: 'openDocProps' });   // 「文档属性」→ 右侧面板的「本文档属性」页
    else if (act === 'doclib') vscode.postMessage({ type: 'openDocLibrary' }); // 「思维导图文档库」→ 右侧面板的文档库页
    // 2026-10-22 新增：打开右侧面板的搜索页并聚焦输入框（与 ⌘F 同一个出口）
    else if (act === 'search') vscode.postMessage({ type: 'openSearchPanel' });
    // 2026-10-20：从菜单按钮搬回菜单（2026-10-10 曾搬去左下角）
    else if (act === 'join-group') openUrl(JOIN_GROUP_URL);
    else if (act === 'guide') openUrl(GUIDE_URL);
    // 🔴 「join-group / guide」2026-10-10 搬到左下角按钮了（见 btn-join-group / btn-guide 的 onclick），这两支撤掉
    else if (act === 'settings') { vscode.postMessage({ type: 'log', text: '更多菜单→打开设置请求发出' }); vscode.postMessage({ type: 'openSettings' }); } // 更多菜单「设置与 bug 提报」（2026-09-01）
    else if (act === 'hotkeys') { vscode.postMessage({ type: 'openHotkeys' }); } // 更多菜单「快捷键」→ 打开原生快捷键页并预填搜索只看本插件（2026-09-18）
    else if (act === 'custom-panel') { vscode.postMessage({ type: 'openSettings', pagePath: [T('settings.uiSimplify'), T('settings.morePanelSimplify')] }); } // 更多菜单「自定义该面板」→ 设置页「按钮简化」（与节点侧面板的同名按钮同一套，2026-09-18）
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
// ⌥ 状态（**在 iframe 里自己记**，2026-10-17 起；2026-10-18 改成只认 ⌥）：拖拽源在画布里、焦点也在画布里
//   → keydown 收得到；父窗口收不到（宿主那份 `_altDown` 一直 false 就是这个原因，不是"修饰键不可靠"）。
//   ⚠️ 只认 ⌥：⌘/Ctrl 在 macOS 上被系统保留给「建别名」拖拽，认它会让"没按修饰键的普通拖出"误判成复制
//      （键盘自记漏了 keyup 就一直 true —— 用户实报的"有时没按 ⌘ 也生成副本"就是它）。
let nmAltDown = false;
let _copySentAt = 0;
document.addEventListener('keydown', (e) => { if (e.altKey) nmAltDown = true; });
document.addEventListener('keyup', (e) => { if (e.key === 'Alt') nmAltDown = false; });
window.addEventListener('blur', () => { nmAltDown = false; });
document.addEventListener('dragend', (e) => {
  dbgDrag('dragend', 'dropDone=' + !!state._dropDone
    + ' dropEffect=' + (e && e.dataTransfer ? e.dataTransfer.dropEffect : '?')
    + ' extOut=' + extOutStop + ' canceled=' + nmDragCanceled
    + ' dtOver=' + (_dbgOverAt ? Math.round(performance.now() - _dbgOverAt) : -1) + 'ms'
    + ' preview=' + (state.dragPreview ? ((state.dragPreview.targetId || '-') + ':' + state.dragPreview.position) : 'null'));
  // 🔴 **先收提示，再干活**（2026-10-17 用户实报"拖出后提示会顿一两秒"）：
  //   普通拖出有 drop → 宿主当场 hideOutHint；⌥ 拖出（以及被系统吞掉的拖拽）没有 drop，只能等这里。
  //   而系统的 dragend 在"被吞掉的拖拽"上本身就慢一拍 → 所以这一条必须排在兜底执行**前面**，
  //   让宿主第一时间把「松手转出」那行收掉，再去建文件（建文件要读写盘，会拖慢观感）。
  try { vscode.postMessage({ type: 'nodeDragEnd' }); } catch (_) {}
  // 🔴 ⌥ 拖出画布的**兜底收尾**（2026-10-17 立，2026-10-18 从 ⌘ 换成 ⌥）：跨 iframe 时
  //   `effectAllowed` 到宿主可能变成 `none` → 系统**根本不派发 drop**，宿主永远等不到。
  //   所以这里不靠 drop：只要"松手时最后一次状态是拖在画布外"且"按着 ⌥"，就直接按**创建副本并导出**执行。
  //   ⚠️ **只做复制**：Esc 取消拖拽同样会触发 dragend、也可能被误判 —— 但复制是安全操作，
  //      误判的代价只是外面多一份镜像，绝不会删掉任何东西。转出那条仍然只走 drop，不在这里。
  //   ⚠️ 3 秒内只发一次：万一哪天 drop 真派发了，宿主那边已经执行过，这里别再来一遍。
  if (extOutStop && (extOutAlt || nmAltDown) && Date.now() - _copySentAt > 3000) {
    try {
      const id = nodeDragOutId;
      const hit = id ? findNode(state.tree, id) : null;
      if (hit && hit.node) {
        _copySentAt = Date.now();
        vscode.postMessage({ type: 'exportMapTree', tree: exportTreeOf(hit.node), isRoot: false, copyMode: true });
      }
    } catch (_) {}
  }
  // 🩹 **drop 被系统吞掉时的兜底落位**（2026-10-18）：⌘+拖 走不到 drop，但最后一次 dragover 已经把落点算好了。
  //   条件全满足才动：这次拖拽没收到过 drop / 指针最后在画布内 / 不是 Esc 放弃 / 有预测落点。
  //   代价是慢一拍（等系统那 ~1s 的失败收尾走完），但至少不会「白拖一次、节点弹回原位」。
  //   ⚠️ 只在**没收到 drop** 时才走（state._dropDone），别跟正常那条路重复移动。
  //   ⚠️ 拖到一半按过 ⌘/Ctrl（`state._metaNoDrop`）→ **不兜底**：那一档的语义是"松手什么都不做"（2026-10-19）。
  if (!state._dropDone && state.dragId && !extOutStop && !nmDragCanceled && !state._metaNoDrop && state.dragPreview) {
    const dp = state.dragPreview;
    dbgDrag('dragend·兜底落位', 'target=' + (dp.targetId || '-') + ' pos=' + dp.position);
    if (dp.position !== 'invalid') {
      // ⌥ 拖着 = 复制到落点（与 drop 那条同一判据）；不按修饰键 = 移动
      const go = (tid, before) => { armDropStart(state._dragCX || 0, state._dragCY || 0); (state._dragAlt ? copyNodesTo : moveNodes)(state.dragIds, tid, before); };
      if (dp.targetId && dp.targetId !== state.dragId) {
        if (dp.position === 'before') go(dp.targetId, true);
        else if (dp.position === 'after') go(dp.targetId, false);
        else go(dp.targetId);
      } else go('root');
    }
  }
  state.dragId = null;
  state.dragIds = null;
  state.dragRows = null;
  clearDragCaches(); // 清拖拽矩形 / 集合 / 旋钮全套缓存（2026-10-10 统一出口）
  if (state._dragRAF) { cancelAnimationFrame(state._dragRAF); state._dragRAF = null; }
  state.dragPreview = null;
  state.dragGrabDX = 0; state.dragGrabDY = 0;
  pendingDropStart = null; // 没走成落位（ESC 取消 / 无效落点 / 拖出窗口）→ 别把起点留到下一次 render
  cleanupDragGhost(); // 兜底（ESC 取消/拖出窗口等未走 drop 的路径）
  clearDragSrcMark(); // 同上：拖拽源卡的原地标记兜底摘除
  stopAutoScroll();
  clearDragHighlights();
  extOutStop = false;   // 拖拽结束 → "指针在外面"这条状态作废（下一次拖拽重新判）
  extOutAlt = false;   // 同上：⌥ 状态也一起作废，别带到下一次拖拽
  nmAltDown = false;   // 2026-10-19：键盘自记也清零 —— 原生拖拽期间 keyup 可能收不到，留着会卡成 true
  // ⚠️ 这里**不能**清 nodeDragOutId：宿主的 nodeDropOut 是异步消息，会比 dragend 晚到；
  //    提前清了它就拿不到"转出谁"了。那个变量交给 nodeDropOut 自己清（下次 dragstart 也会覆盖）。
});
// ===== 悬浮面板的两个手感修补（2026-10-19 用户实报）=====
// ① 「点了二级菜单后，鼠标移到其它按钮，它要**立刻**消失，不要拖沓」——
//    原来只有 mouseleave 里那 320ms 延时，扫到旁边那颗按钮时面板还挂着，跟新按钮的提示叠在一起。
//    做法：左下工具条**任意一颗**按钮被悬停时，先把"别人家的"悬浮面板立刻收掉（自己家的不动，否则刚开就被关）。
// ② 「想滑到二级 / 三级菜单上点，结果它先没了」——
//    从父行划到面板之间有一段既不在行上、也不在面板上的空隙（--mm-sub-offset-x 把它拉开到 7px）。
//    这条 2026-10-19/10-20 连改四版（延时加长 → 过桥区 → 到点看指针）都没断根，真因是**一级面板上那条
//    「鼠标挪到别的行 → 二级当场收」**：指针穿过那条缝时正压在一级面板的留白上，被它一瞬间收掉，
//    而二级收掉后不吃指针 → mouseenter 永远等不到（所以表现为"有时能用、后面就不行"）。
//    最终做法：缝本身按容差封顶（showMoreSub 里的 maxLeft），**所有**收二级的入口先问一句
//    「指针是不是在二级的过桥区里」（nmSubNearAt / nmPointerNearSub），是就一律不收。

// 左下工具条：悬停任意一颗按钮 → **别家的**悬浮面板立刻收（2026-10-19 用户实报"还不是立即消失"）。
//   ⚠️ 左下「更多」那颗开的是 #more-menu（class 'open'），**不是** 添加面板的 moreMenu（class 'hidden'）——
//     两套是不同元素，别只收一套（第一次改就漏在这）。
['btn-locate', 'btn-hide-done', 'btn-ai', 'btn-more', 'btn-join-group', 'btn-guide', 'btn-doclib', 'btn-now-side'].forEach((id) => {
  const b = document.getElementById(id);
  if (!b) return;
  b.addEventListener('mouseenter', () => {
    if (id !== 'btn-more') {
      const lm = document.getElementById('more-menu'); if (lm) lm.classList.remove('open');   // 左下「更多」面板
      hideMoreMenu(); hideMoreSub();                                                          // 添加面板 + 它的二级
    }
    if (id !== 'btn-locate') { const nm = document.getElementById('now-menu'); if (nm) nm.classList.remove('open'); }
  });
});
wlog('webview 脚本加载完成，发送 ready');
window.__MM_FLUSH__ = persistNow; // 宿主 rebind 重建 iframe 前同步调用，把当前 view 立即落盘（2026-09-01 修源思维导图切走丢位置）
// 全屏位置锚定（2026-10-02 用户定：进/出全屏，思维导图不许在屏幕上跟着画布面板移动）
// 宿主在切换期间的**每个动画帧**测一次本 iframe 的屏幕位置，把「相对上一帧的位移」同步喂进来，画布反向补 pan。
// 与 2026-10-01 那版（一次性前后测量，已回退 b5aa656）的本质区别：那版撞上系统窗口动画这种连续 ~450ms 的
// 布局变化，测到的必然是中间态、补错之后又无从自愈（实测反复上下闪）。这版是**逐帧增量**：某一帧测偏
// 只等于少补一帧，下一帧自动补齐，布局 settle 后必然对齐 —— 不需要测准，也不需要掐过渡。
// 换算与 panBy 同规则：内容的屏幕位移 = zoom × Δpan → 抵消 dx 需 panX -= dx/zoom。
// 只动相机（pan），不动布局 → 连线层是 #tree 的子元素、跟着同一个 transform 走，**不需要 drawEdges**。
window.__MM_FS_COMPENSATE__ = function (dx, dy) {
  try {
    dx = +dx || 0; dy = +dy || 0;
    if (!dx && !dy) return;
    const z = zoom || 1;
    if (!(z > 0)) return; // zoom 未初始化 / 异常值：不补（补了就是把画面甩飞）
    panX -= dx / z;
    panY -= dy / z;
    applyTreeTransform();
    // 与「锚定续命」互斥：reanchorAfterReflow 盯的是卡片**在 iframe 内**的位置，而这次补偿正是让内容
    // 相对 iframe 反向移动（好让它相对屏幕不动）。旧锚点若还活着，它会按老坐标把画面拽回去 = 两边打架。
    lastKeepAnchor = null;
  } catch (_) {}
};

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
