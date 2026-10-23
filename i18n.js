// ============ i18n 文案中心 ============
// 所有界面文案集中在这个文件（main.js 宿主 + mindmap-app.js 前端共用一份）。
// 文案只改每行冒号右边引号里的字；key 与行尾注释不动。
// 占位符：{0} {1} …会替换成实际内容（行号/文件名/层数等），注释里标了每个 {n} 是什么。
// en 为英文完整翻译（2026-08-30 按定稿中文填）；新增文案时 zh/en 要同步补。
// 运行环境：iframe 内联 <script> / test.mjs vm 沙箱 / main.js new Function 装载（三种都靠顶层 var/function 升全局）。
var I18N = {
  zh: {
    // ============ 通用 ============
    'common.untitled': '未命名', // 文件名兜底：打开的文件没有名字时的显示名（标签页/复制链接）
    'common.node': '节点', // 「保存为书签」时书签文件的默认名（节点没有标题时用它当文件名）
    'common.newNode': '新节点', // 新建节点的默认标题（Tab/Enter/↑/← 新建节点、粘贴图片转节点等）
    'common.more': '更多', // 左侧工具栏「更多」(三个点)按钮的 tooltip
    'common.undo': '撤销', // 操作后底部提示条上的「撤销」按钮（隐藏 Minor/Now、删除节点等场景出现）
    'common.mindmap': '思维导图', // 标签页标题兜底（视图未绑定到文件时 Obsidian 显示的视图名）
    'common.cancel': '取消', // 弹窗的「取消」按钮（保存版本命名框、还原确认框等）
    'common.ok': '确定', // 弹窗的「确定」按钮（同上；历史还原的危险确认框也用它）
    'common.vaultRoot': 'vault 根目录', // 转出兜底落点（转出专用文件夹建不出来时用）

    // ============ 导图画面骨架（iframe 里的静态 HTML；切语言随视图重建刷新）============
    'frame.nowSide': '只显示 Now 节点', // 左侧 Now 按钮的初始 tooltip（运行时会被动态文案覆盖，改了可能看不到）
    'frame.mdPlaceholder': '- 一级节点\n  - 子节点', // 文本视图输入框的灰色占位示例（当前文本视图无 UI 入口，备用）
    // ---- 左下角「更多」(三个点)弹层菜单的菜单项 ----
    // （2026-09-17 删：mm.addChild / mm.addSibling / mm.delete —— 那三个节点操作按钮已挪到
    //   「节点工具条 → 添加 → 添加其他内容」，文案改用 more.addChild / more.addSibling / more.delNode。）
    'mm.undo': '撤销', // 菜单项：撤销（Cmd+Z）
    'mm.redo': '重做', // 菜单项：重做（Cmd+Shift+Z）
    'mm.pathBack': '返回上一路径', // 更多菜单：回到上一下钻位置
    'mm.pathFwd': '返回下一路径', // 更多菜单：前进到下一下钻位置
    'mm.pathDefault': '返回默认路径', // 路径子菜单：回到保存的默认下钻位置
    'mm.pathSave': '设当前为默认路径', // 路径子菜单：把当前下钻位置存为默认（普通导图）/ 更新书签指向（书签文件）
    // 顶部条「路径三键」里那颗主页键的提示（2026-10-06；左/右两颗直接复用上面的 mm.pathBack / mm.pathFwd）
    'tip.pathHome': '路径设置',
    'pro.needActivate': '此功能激活可用',
    // 设置页尾注那一排（2026-10-07 用户定）：使用教程 · 加入群聊 · 更新历史 · Bug 反馈 · 版本号 · Make Something Wonderful
    'footer.tutorial': '使用教程',
    'footer.joinGroup': '加入群聊',
    'footer.releases': '更新历史',
    'footer.bug': 'Bug 反馈',
    'footer.version': '版本',
    'toast.featureSoon': '功能开发中，敬请期待',   // AI 输入条「＋」在非作者本机上点了弹这句（2026-10-07 用户定）   // 未激活时点受控功能（含快捷键）弹的提示（2026-10-07 用户定）
    'tip.alreadyDefault': '当前已是默认路径',
    'tip.toggleSidebar': '显示文件列表',   // 全屏时那颗「侧边栏」按钮的悬停提示（2026-10-06）   // 主页菜单里那两项**不可点**时的悬停提示（2026-10-06 用户定；可点时不给提示）   // 2026-10-06 用户定：就这四个字，别再自己写「点击后可以…」那种解释
    'more.splitRight': '左右分屏',
    'more.showInFolder': '在访达中显示',
    'more.revealInFiles': '在文件列表中显示',
    'more.openSource': '查看原文件',
    'more.viewAsMarkdown': '以 Markdown 格式查看',
    'more.copyAiLocate': '使用外部 Agent 编辑',
    'more.saveVersion': '保存此版本',
    'mm.history': '历史记录', // 菜单项：打开历史记录面板
    'mm.saveVersion': '保存此版本', // 菜单项：手动命名保存当前版本快照
    'mm.guide': '使用指南 ↗', // 菜单项：打开使用指南（飞书文档，与设置页「使用教程」同一个链接）
    'mm.joinGroup': '加入微信群 ↗', // 菜单项：跳转飞书 wiki 进群页（2026-09-07）
    // ---- 左下「更多」菜单：每一项的黑色小字提示（2026-10-20 用户定：以前只有部分项有，现在全补上）----
    //   撤销 / 重做那两条的键位**写死**（画布写死键，不走原生快捷键页，跟 tb.undo / tb.redo 同一个口径）。
    //   xxxTipH = 浅色后缀段（2026-10-20 起显式给，骨架 data-tip-h；以前括号那截是渲染时正则猜的，已废）。
    'mm.undoTip': '点击后，撤回上一操作==space==（{Mod} + Z）',
    'mm.redoTip': '点击后，重回下一操作==space==（{Mod} + Shift + Z）',
    'mm.docProps': '本文档属性', // 2026-10-20 新增：打开右侧面板的「本文档属性」页（2026-10-22 改名：与分页标题一致）
    'mm.docPropsTip': '点击后，查看本文档属性',
    'mm.docLib': '思维导图文档库', // 2026-10-20 新增：打开右侧「思维导图」面板的文档库页
    'mm.docLibTip': '点击后，查看思维导图文档库',
    'mm.search': '搜索', // 2026-10-22 新增：打开右侧面板的搜索页（⌘F）
    // ⚠️ `==space==` 是提示小字的分段符（前段正文白、后段浅色）—— 括号里的快捷键走浅色段，
    //    与其它提示同一套，别自己另写样式（2026-10-22 用户定）。
    'mm.searchTip': '点击后，搜索节点==space==（{Mod} + F）',
    'mm.historyTip': '点击后，查看历史记录',
    'mm.saveVersionTip': '点击后，保存此版本',
    'mm.joinGroupTip': '点击后，加入 28 Notes 微信群==space==（可在设置页面隐藏此按钮）', // 2026-10-20 用户补：与左下角那颗同开关的按钮同一句后缀
    'mm.guideTip': '点击后，打开使用指南==space==（可在设置页面隐藏此按钮）',
    'mm.saveShortcut': '将该视图存为捷径', // 菜单项（2026-09-18）：右键「保存为捷径」的可视化形态，对当前视图根节点建捷径
    'mm.hotkeys': '快捷键', // 菜单项：打开原生「快捷键」页并预填搜索只看本插件（2026-09-18）
    'mm.settings': '设置与 Bug 提报', // 菜单项：打开插件设置页（2026-09-01）
    'aiEdit.desc': '复制下面的定位信息，粘贴到其他 AI Agent 里（如 Claude Code、WorkBuddy 等），AI 就能直接定位到对应节点并精准编辑。编辑时，AI 会自动遵循本插件内置的格式说明。你只需沟通需求，而无需关心格式。<br> <br> 我们知道这种操作并不理想。未来将支持连接 AI API key，以在导图内直接操作。', // 「AI 编辑」弹窗顶部说明
    'aiEdit.copy': '复制并关闭', // 「AI 编辑」弹窗右下角按钮

    // ============ 宿主侧通知（屏幕右上角弹条）============
    'display.mindmap': '思维导图', // 标签页标题兜底（视图未绑定文件时；与 common.mindmap 同义，两处独立使用）
    'notice.bookmarkInvalid': '捷径内容无效（缺 target）：', // 打开书签文件但缺 target 字段时（后接文件路径）
    'notice.bookmarkMissing': '捷径指向的导图不存在：', // 书签 target 指向的文件找不到时（后接路径）
    'notice.bookmarkReadFail': '捷径目标读取失败：', // 书签目标文件读取出错时（后接路径）
    'notice.writeFailNoFile': '思维导图写盘失败：视图未绑定文件', // 写盘时视图没绑定到文件（异常兜底，正常不出现）
    'notice.writeFail': '思维导图写盘失败：', // 写盘出错时（后接文件路径）
    'notice.copyFail': '复制失败：', // 复制节点/图片/链接到剪贴板失败时（后接错误）
    'notice.openUrlFail': '打开链接失败：', // 打开网页链接失败时（后接错误）
    'notice.openSettingsFail': '打开设置页失败：', // 更多菜单「设置与 bug 提报」打开失败时（后接错误）
    'notice.updateBookmarkFail': '更新捷径失败：', // 「更新为当前路径」写书签文件失败时（后接错误）
    'notice.createBookmarkFail': '创建捷径失败：视图未绑定数据文件', // 「保存为书签」时视图未绑定数据文件（异常兜底）
    'notice.createBookmarkFail2': '创建捷径失败：', // 「保存为书签」创建文件失败时（后接错误）
    'notice.restoreFail': '还原历史版本失败：', // 历史还原写盘失败时（后接错误）
    'notice.newMapFail': '新建思维导图失败：', // Ribbon/命令新建导图失败时（后接错误）
    'notice.shortcutBudget': '文件夹太大了：只建了前 {1} 个文档捷径，还有 {0} 个文件没进来', // ⌥ 拖入文件夹超过上限（{0}=跳过的文件数、{1}=上限，2026-10-19）
    'notice.dataAreaGuard': '「{0}」在思维导图的数据区里，不能搬到外面 —— 已放回原处', // 数据区守卫：别的东西（整理类插件）把数据区里的文件拖走时（2026-10-19）
    'notice.fileMissing': '文件链接指向的文件不存在：', // 点本地文件链接但文件不存在时（后接路径）
    'notice.openFileFail': '打开文件失败：', // 打开本地文件出错时（后接错误）
    'notice.noteMissing': '找不到笔记：', // 点笔记链接但 vault 里找不到时（后接笔记名）
    'notice.importDocFail': '转入失败：', // 「转入思维导图」出错时（后接错误信息，2026-10-08）
    // 「转入 → 挂到当前导图的选中节点」没挂上时的撤销提示（2026-10-12 用户定：宁可转不转，都不能转错）
    'notice.importRolledBack': '没有挂上节点，这次转入已撤销 —— 文件退回在：{0}',
    // 撤销按钮点了但已经过期（2026-10-17）：只在**找不到那条反向记录**时弹（没有画布也能看到）
    'notice.undoExpired': '这条撤销已经过期了',
    // 从左侧文件列表把文件**拖到节点上**时，节点上方那行黑底小字（2026-10-17 用户定文案）
    // 只在指针压住某个节点时出现；画布空白处不出现（用户原话：「没到任一节点就没有提示，松手文件还在原处」）
    'extDrop.dropHere': '松手转入此节点',
    // 按住 ⌥ 拖进画布：不搬文件，只在隐藏目录建壳 + 挂节点（2026-10-19，与上面"转入"同一条路的两副面孔）
    'extDrop.shortcutHere': '松手在此节点创建捷径',
    // 还没压住任何节点时，跟着鼠标走的那行黑字（2026-10-19 用户定）：说清"要压节点"和"松手=取消"
    'extDrop.dragToNode': '拖到节点上以转入（松手取消）',
    'extDrop.dragToNodeCopy': '拖到节点以创建捷径（松手取消）',
    // 拖的就是**当前这张导图自己** → 同一行小字换成红字说明（2026-10-17 用户定：拖过去就看出不行）
    'extDrop.selfHere': '不能将思维导图转入自己内部',
    // 把画布上的节点**拖到画布外**松手 = 转出（提示画在宿主那一侧，出了 iframe 才看得见）
    'extDrop.dropOut': '松手转出到 vault',
    // 按住 ⌥ 拖出画布：不转出，按结构**镜像**一份到外面（文档节点 → 文档捷径壳，其余 → 文件夹）
    'extDrop.shortcutOut': '松手在 vault 创建捷径', // 2026-10-18：⌘ 换成 ⌥（macOS 把 ⌘ 留给系统拖拽）
    'notice.moveOutDocFail': '转出失败：', // 「转出到 vault」出错时（后接错误信息，2026-10-08）
    'notice.openNoteFail': '打开笔记失败：', // 打开笔记出错时（后接错误）
    'notice.fsDocUnsupported': '当前文档不支持思维导图全屏专注模式，已退出全屏', // 全屏中打开普通文档 → 自动退出全屏时的说明（2026-10-11 用户定）
    'notice.copyFailSnap': '创建副本失败：', // 从历史快照创建副本失败时（后接错误）
    'notice.githubUnset': 'GitHub 链接尚未配置', // 设置页点「↗ GitHub」按钮但链接还没填时
    'notice.dataAreaGone': '⚠️ 刚删除的是 28 Notes 数据区（图片/历史/AI 契约）：{0} —— 现在落在{1}；误删请立刻放回 28Notes-Files/ 原路径（仅作者本机提示）', // 数据区顶层目录被删时的告警（2026-09-17）；{1} = 去向，2026-09-22 起带
    'notice.trashLocal': 'Obsidian 废纸篓（库根目录里的 .trash 文件夹）', // 删除去向：默认设置（2026-09-22）
    'notice.trashSystem': '系统废纸篓（Dock 里的垃圾桶）', // 删除去向：设置里改成了「系统废纸篓」
    'notice.trashNone': '⚠️ 你当前的删除设置是「永久删除」，没有留下任何副本', // 删除去向：设置里改成了永久删除
    // 数据区守卫（2026-09-22 用户定稿文案）：删前直接拦下 + 一句通知；真删掉了就告知该放回哪
    'notice.dataLostTitle': '警告！你刚刚删除了 28 Notes Mind Map 隐藏文件！',
    // {0} = 被删的文件夹名；{1} = 本机绝对路径。系统垃圾桶里如果已经有同名文件夹，Obsidian 会给新来的加一串
    // 「时-分-秒-毫秒」后缀（如「AI 23-46-58-575」）—— 文案里把这层说破，用户才不会以为没删成功。
    'notice.dataLostBody': '28 Notes Mind Map 将历史记录等源文件隐藏，以防止误删。但在极少数情况下（如使用Flexplorer、Notebook Navigator等插件），仍有可能误删此类文件。\n\n我们已监测到刚刚存在误删行为。请到系统垃圾桶中找到「{0}」的文件夹（名字后面可能被系统加了一串数字，比如「{0} 23-46-58-575」，如是此类情况，请删除数字后放回），并放至此目录：\n{1}',
    'btn.dismiss': '好的',
    'notice.dataGuardBlocked': '已拦截 28 Notes Mind Map 隐藏文件误删行为；如要删除附件，请到「设置 - 高级」内手动清理。',
    'notice.aiDocsRestored': '已重建 AI 契约文件：{0}', // 28Notes-Files/AI/ 缺失后自动重建完成时（2026-09-17）
    // 全屏（2026-09-22 用户定）：按钮提示 + 两条命令名（均不设默认快捷键，用户自己绑）
    // 2026-10-20 用户定：括号一律用**全角**（原来第二个是半角开 + 全角收的混搭，跟别条提示不统一）。
    //   两段灰之间的间距由 CSS 的 --tip-seg-gap-tight 收紧，不靠半角括号省地方。
    'tb.fullscreen': '全屏专注模式（{fsHk}）（按住 {Mod} 点击：仅在窗口内全屏）', // 非全屏时的按钮提示（2026-10-01 用户定：点击=桌面全屏，⌘+点击=仅在窗口内）。{Mod} 走 modStr（Mac=⌘ / Win=Ctrl）；{fsHk} = 该命令的快捷键（**不含**括号，两侧括号写在文案里），**没绑定就连括号整段消失**、不留空括号（2026-10-21 修正注释：原来写「含括号」是错的）
    'tb.fullscreenExit': '退出全屏专注模式（Esc）', // 全屏中（窗口档 / 桌面档**共用这一句**）：点 / ⌘+点击 都是退出，两档行为一致
    'cmd.fullscreenWindow': '视图显示｜全屏专注模式（仅在窗口内）', // 命令：非全屏→仅在窗口内全屏；再点一次→退出
    'cmd.fullscreenDesktop': '视图显示｜全屏专注模式', // 命令：非全屏→桌面全屏；窗口全屏→升级为桌面全屏；桌面全屏→退出
    // ---- 命令面板（Cmd+P）与文件右键菜单里显示的命令名（改完要重载插件才变）----
    'cmd.newMap': '新建思维导图（28 Notes）', // 命令名 + 左侧 Ribbon 按钮悬停提示：新建导图（2026-09-20 去掉「新建｜」前缀：Ribbon 悬停时前缀多余）
    'cmd.boldNode': '编辑文本｜加粗节点', // 命令：画布动作（键位在原生快捷键页改，2026-09-18）
    'cmd.redNode': '编辑节点｜将选中节点标为红色', // 命令：画布动作
    'cmd.yellowNode': '编辑节点｜将选中节点标为黄色', // 命令：画布动作
    'cmd.nowNode': '编辑节点｜（不）设为 Now 当前节点', // 命令：画布动作
    'cmd.minorNode': '编辑节点｜（不）设为 Minor 次要节点', // 命令：画布动作
    // 待办两条命令（2026-09-20）：普通节点分别进「待办」「已完成」档，之后都在两档之间循环
    // 2026-09-20 三次定稿：待办**只剩这一条命令**，语义 = 纯开关（普通 ↔ 待办），与底部按钮完全同款。
    // （原来第二条 ⌘⌥L「设为已完成…」已删 —— 用户定：没必要；id canvas-todo 保持不变，用户自绑的键不失效）
    'cmd.todoNode': '编辑节点｜（不）设为待办 Todo 节点',
    'cmd.todoDoneNode': '编辑节点｜（不）设为完成 Done 节点', // 2026-09-20 第三轮新增：⌥⌘L，与按钮 ⌥+点击同款
    'cmd.copyNodeLink': '其它｜复制节点链接', // 2026-09-21 由右键菜单注册成命令（⌥⌘C）
    'cmd.addChildDoc': '新建｜新建子文档', // 2026-10-12 用户定：从「其它｜」挪进「新建｜」组（与"在上方新建同级节点"那两条同组）；**不设默认键**，交用户自己绑（选中节点才有效）
    'cmd.copyAILocate': 'AI｜复制 AI 定位路径', // 2026-10-07 用户定：分类从「其它」改成「AI」
    'cmd.saveShortcut': '视图整体｜保存为捷径', // 同上（⌘/；对当前视图的主节点建捷径）
    'cmd.aiMark': 'AI｜添加 AI 生成标记', // 2026-10-05：一次打标、再触发清除（名字 2026-10-07 用户定成「添加…」，别管它也能删，就叫这个）
    'cmd.aiRules': 'AI｜添加 AI 更改规则', // 2026-10-07 用户定：新注册的命令（菜单里那项同源）
    'cmd.editNote': '编辑文本｜节点备注', // 命令：画布动作（默认 Shift+Enter）
    'cmd.toggleShowNow': '视图整体｜（只）显示 Now 当前节点', // 命令：画布动作（默认 Mod+Alt+N）
    'cmd.toggleHideMinor': '视图整体｜显示/隐藏 Minor 次要节点', // 命令：画布动作（默认 Mod+Alt+M）
    'cmd.drillInto': '视图整体｜进入当前节点', // 命令：画布动作（不设默认键：Mod+E 与核心编辑/预览切换撞车）
    'cmd.locateCycle': '视图定位｜定位循环', // 命令：画布动作（不设默认键：Mod+P 与命令面板撞车）
    'cmd.searchPanel': '视图定位｜搜索节点', // 2026-10-22：打开右侧面板的搜索页（默认 ⌘F，只在导图视图认领）
    'cmd.toggleSourceView': '视图切换｜源文件/思维导图视图', // 命令：合并原「查看源文件 / 返回思维导图视图」（2026-09-18）
    'cmd.addSiblingAbove': '新建｜在上方新建同级节点', // 命令：原 ↑ 占用的新建动作（不设默认键，2026-09-18 放给用户）
    'cmd.addParentSibling': '新建｜在上一层新建同级节点', // 命令：原 ← 占用的新建动作（不设默认键）
    'cmd.editStart': '编辑操作｜光标插入节点开始处', // 命令：编辑类（不设默认键；光标落最前；编辑中再按 = 只挪光标）
    'cmd.editEnd': '编辑操作｜光标插入节点末尾处', // 命令：编辑类（不设默认键；光标落最后）
    'cmd.centerNode': '视图定位｜选中节点定位到画面中央', // 命令：居中类（不设默认键；落点 = app.css 定位调参 --locate-selected-x/--locate-y）
    'cmd.centerRoot': '视图定位｜主节点定位到画面中央', // 命令：居中类（不设默认键；落点 = --locate-selected-x/--locate-y，与选中节点同一个自定义居中位）
    'cmd.openAsMarkdown': '查看 Markdown 源文件', // 命令/文件右键菜单：按纯文本打开（豁免导图视图）
    'cmd.openAsMindmap': '返回思维导图视图', // 命令/文件右键菜单：从纯文本切回导图视图
    // ---- 文件名相关 ----
    'newMap.name': 'Mind Map', // [已弃用] 新建导图命名已硬编码为 Mind Map N（2026-09-18 用户定：中英文统一，不再走 i18n；键留作兼容）
    'copy.suffix': '-副本', // 「创建副本」的文件名后缀：原文件名 + 这个后缀 + .md
    'snap.beforeRestore': '还原前 · ', // 还原历史版本时自动存的「还原前」快照的命名前缀（后接日期时间）
    'snap.restoredTo': '还原到 · ', // 还原历史版本后自动存的「还原到」快照的命名前缀（后接来源版本的名字或时间）
    'snap.beforeAiEdit': 'AI 更改前备份', // 点「AI 定位节点」/「AI 编辑」时插件自动存的快照名（2026-09-27）
                                          // ⚠️ 与 snapshot.py 的 DEFAULT_NAME['zh'] 必须一字不差（AI 外部脚本用同一个名字）
    // ---- 文件列表徽章（左侧文件树里文件名右侧的小字）----
    'badge.bookmark': '↗', // 文件列表里书签文件右侧的小字（触发点在 main.js updateBookmarkBadges：拼进文件树徽章 CSS）
    'badge.mindmap': '28 Notes', // 文件列表里导图文件右侧的小字（同上，main.js updateBookmarkBadges）
    'menu.newMindmap': '新建思维导图', // 文件面板右键空白处/文件夹 → 新建菜单项（2026-09-01）
    'menu.newDocShortcut': '新建文档捷径', // 文件列表右键**文件** → 在该文件所在文件夹建一个 doclink 壳（2026-10-19）
    'menu.newDocShortcutHint': '不写默认为原文档名', // 上面那一项命名弹框输入框里的灰色占位提示（2026-10-19）
    'menu.importToMap': '转入思维导图', // 文件列表右键文件 → 把文件搬进 28Notes-Files/docs/ 并新建导图（2026-10-08；「用思维导图管理文档」开关开着才出现）
    // 上面那项现在是个**二级菜单**（2026-10-12 用户定）：进去分两条 —— 新建导图（原行为）/ 挂到当前导图的选中节点。
    // ⚠️ 走的是 Obsidian 未公开的 `MenuItem.setSubmenu()`（本体自己在用，d.ts 里没写）→ 拿不到就退回平铺一条。
    'menu.importToMapNew': '新思维导图',
    'menu.importToMapNode': '旧思维导图的选中节点',
    // 二级菜单第三项（2026-10-20 用户定）：分隔线下面那一条，纯介绍、不搬任何文件
    'menu.importHelp': '★ 了解转入功能',
    // 文件列表右键「查看文档属性」（2026-10-20 用户定）：打开右侧「思维导图」面板 → 切到「本文档属性」页
    //   → 只展开「文档属性」那一组（文档管理 / 历史记录收起）。
    //   右键的是**捷径**（视图捷径 mmlink / 文档捷径 doclink）时用下面那条，暗示"点它能看原文件是谁"。
    'menu.viewDocProps': '查看文档属性',
    // ⛔ 退役（2026-10-20 用户定）：`menu.viewDocPropsSrc`「查看文档属性（源文件）」**已删** ——
    //   它和下面那条「查看 Markdown 源文件」里的"源文件"撞车，看着很怪。现在一律只写「查看文档属性」。
    // 二级菜单入口（2026-10-20 用户定）：文件列表右键与标签页右键**统一成同一套**，
    //   主菜单只留「新建思维导图 / 转入思维导图 / 更多 28 设置项」三项，
    //   后面那些低频项（新建文档捷径 / 查看文档属性 / 查看 Markdown 源文件 / 使用外部 Agent 编辑）全收进这里。
    'menu.more28': '更多 28 设置项',
    'menu.copyAiLocate': '使用外部 Agent 编辑', // 文件面板右键文件名 → 复制「绝对路径（+选中节点 ID）」供 AI Agent 定位编辑（2026-09-02）
    'fold.moreLevels': '更多层级', // 折叠层级「+更多」按钮的悬停提示（Obsidian 状态栏）

    // ============ 设置页（设置 → 第三方插件 → 28 Notes）============
    'settings.uiHeading': '界面',
    'settings.groupSettings': '设置',   // 2026-10-07 用户定：设置页并成两块「许可证」+「设置」，原来「界面」「更多」两块并进后者 // 设置页最顶端 H2 标题（2026-09-01 定）
    'settings.language': '界面语言', // 语言设置项的名称（2026-09-11 删「支持中文和英文」说明）
    'settings.langAuto': '跟随黑曜石（默认）', // 语言下拉选项一：跟随客户端语言。2026-10-01 用户定：界面语言同在调试组（只有本机可见），默认档同样尾随「用户默认」四字
    'settings.langZh': '中文', // 语言下拉选项二
    'settings.langEn': 'English', // 语言下拉选项三
    'settings.theme': '界面样式', // 主题设置项名称（2026-08-31）
    'settings.themeFeishu': '蓝线', // 主题下拉：飞书蓝线（2026-09-01 与灰/粉对称，改为带括号）
    'settings.themeFeishuGray': '灰线', // 主题下拉：飞书灰线
    'settings.themeFeishuPink': '粉线', // 主题下拉：飞书粉线（2026-09-01 新增）
    // 画布明暗 + 背景色（2026-09-20）：设置页「界面样式」左边那个调色板小按钮弹出来的小窗
    'palette.tip': '高级样式设计',
    'palette.title': '高级样式设计',
    'palette.bgLight': '自定义背景色｜浅色模式',
    'palette.bgDark': '自定义背景色｜暗色模式',
    'palette.resetTip': '恢复默认（{0}）',
    // 2026-09-17：媒体分目录（images/video/audio）后，清理范围同步扩大 → 文案由「图片」改「附件」
    'cleanup.heading': '清理未使用的附件', // 设置页区块标题（2026-09-16）
    'cleanup.desc': '为支持删除后撤回操作，删除带图片/视频等附件的节点时，附件不会被直接删除。<br> 因此可能会存在未被使用的冗余附件，建议每半年扫描清理一次。',
    'cleanup.scanBtn': '开始扫描', // 设置页按钮（2026-09-16：名称改由 cleanup.heading 承担「清理未使用的附件」）
    'cleanup.scanning': '正在扫描…', // 扫描进行中按钮文案
    'cleanup.none': '没有找到未使用的附件 ✓', // 扫描结果：零孤儿
    'cleanup.found': '找到 {0} 个未被引用的附件，共 {1}', // 弹窗标题行
    'cleanup.note': '建议迁移到桌面，然后手动上传至你的云盘，防止以后要用。', // 弹窗备注（用户定稿文案）
    'cleanup.deleteBtn': '直接删除', // 弹窗按钮一：进系统废纸篓
    'cleanup.moveBtn': '迁移到桌面', // 弹窗按钮二：迁移到桌面备份文件夹（用户定稿命名）
    'cleanup.movedOk': '已迁移 {0} 个附件到桌面：{1}', // 迁移成功通知
    'cleanup.deletedOk': '已删除 {0} 个附件（可在系统废纸篓找回）', // 删除成功通知
    'cleanup.partialFail': '{0} 个成功，{1} 个失败：{2}', // 部分失败通知
    'settings.badgeStyle': '文件类型徽标', // 文件树徽章样式（2026-08-31）：文本/图标
    'settings.badgeStyleDesc': '指文件列表里，文件名右侧的类型徽标。此设计可避免文件类型混淆。',
    'settings.badgeStyleText': '28 Notes 文字', // 徽章样式下拉：文本（默认）
    'settings.badgeStyleIcon': '28 Notes 图标', // 徽章样式下拉：图标
    'settings.hideHint': '新增页面提示', // 界面简化栏标题（2026-09-01）
    'settings.hideHintDesc': '新增思维导图后，主节点下方会有一行新手提示，可选择隐藏。',
    // （「待办按钮位置」「视图筛选」两套设置项及其标题 / 选项文案 2026-10-18 全部删除 ——
    //   两项均定稿固定：待办按钮恒在底部、视图筛选恒为「展开」，设置页不再有这两行）
    // ---- AI 生成标记（ainode）的配色（2026-10-05，只在调试组）----
    'settings.aiMarkPalette': '色卡', // 常驻色卡（不是选项）：小色块 + 中文颜色名
    // 12 个 iOS 官方色 + 一个次要节点的置灰：只给中文名，不给色号（用户看色号没概念）
    'aiColor.orange': '橙色', 'aiColor.yellow': '黄色', 'aiColor.green': '绿色', 'aiColor.blue': '蓝色',
    'aiColor.cyan': '青色', 'aiColor.lightblue': '轻蓝色', 'aiColor.waterblue': '水蓝色',
    'aiColor.purple': '紫色', 'aiColor.magenta': '红紫色', 'aiColor.pink': '粉色',
    'aiColor.brown': '棕色', 'aiColor.gray': '灰色', // 灰 = 次要节点的置灰色；2026-10-05 起节点上固定用这个（那三个设置项已删）
    // 二级页入口右侧的灰字说明（2026-09-18 用户定：两行都去掉，入口只留标题 + 箭头）
    'settings.uiSimplify': '界面简化', // 「界面」栏的原生二级页（2026-09-18）：收纳文件类型徽标 / 新增页面提示等
    'settings.advanced': '高级', // 「更多」栏的原生二级页（2026-09-18）：收纳低频且影响数据的操作
    'settings.motion': '动效', // 高级页（2026-09-20）：节点位移过渡的开关，默认开
    'settings.motionDesc': '如果交互时出现卡顿，可关闭动效以减少性能消耗。',
    'settings.motionSysOff': '监测到你的电脑已关闭动画，请在系统设置内打开。', // 系统 prefers-reduced-motion 时替换说明 + 开关置灰（2026-10-10）
    // ---- 「高级」页的两个分组标题（2026-10-08 用户定：上面「基础」、下面「实验性功能」）----
    'settings.advancedBasic': '基础',
    'settings.advancedExp': '实验性功能',
    'settings.expWarn': '实验期间，功能设计会经常调整，甚至删除。请勿过度依赖。',
    'settings.aiFeatures': 'AI 功能', // 「实验性功能」组（2026-10-08）：AI 入口总开关，**默认关**
    'settings.aiFeaturesDesc': '开启后，界面会出现 AI 编辑按钮。',
    'settings.docsLibrary': '用思维导图管理文档', // 「实验性功能」组（2026-10-08）：把 vault 里的文件收进思维导图，**默认关**
    'settings.docsLibraryDesc': '开启后，支持将已有文档转入思维导图进行管理，你也能在思维导图内新增子文档。',
    // ⚠️ 下面两个是 2026-09-28 那版「AI 编辑按钮」的键（2026-10-08 已被上面那对取代）；键先留着，防旧引用报错
    'settings.aiEditBtn': 'AI 编辑按钮',
    'settings.aiEditBtnDesc': '开启后，会在视图左下角出现 AI 编辑按钮。实验性功能，默认关闭。',
    // ---- 「界面简化」页里的两个分组标题（2026-09-21 改版：不再进二级页，直接摊在这一页）----
    'settings.general': '通用', // 分组标题一：文件类型徽标 / 新增页面提示
    'settings.morePanelSimplify': '按钮简化', // 分组标题二：左下「更多」菜单那两个可选条目的开关（**2026-09-24 用户改名：原叫「更多面板简化」**）
    'settings.morePanelNote': '为保证基础使用体验，部分操作按钮不支持关闭。', // 备用说明（2026-09-21 起这一页不再显示备注，键先留着）
    'settings.addPanelSimplify': '「添加」面板简化', // ⚠️ 已废弃（该页 2026-09-21 删除）：键留着防旧引用报错
    'settings.addPanelSimplifyDesc': '指选中节点后，底部操作按钮中，+（添加按钮）内操作项',
    'settings.sepRow': '分隔线', // 列表里的分隔线行；三根同名（2026-09-18 用户定：不编号，靠位置区分）
    'settings.presetRow': '介绍', // 「添加面板简化」与「按钮简化」页顶部共用的一排一次性动作按钮
    'settings.presetRowDesc': '全部关闭后，「添加」按钮将会同步隐藏。',
    'settings.presetDefault': '恢复默认',
    'settings.presetAllOn': '全部打开',
    'settings.presetAllOff': '全部关闭',
    'settings.subEntryRow': '添加其他内容', // 列表里那条"分界线"行
    'settings.subEntryRowDesc': '▶︎ 此条目以下的按钮，将被折入二级菜单',
    'settings.addPanelEmpty': '（没有可显示的条目）',



    'settings.hintShow': '显示提示', // 界面简化下拉：显示
    'settings.hintHide': '隐藏提示', // 界面简化下拉：隐藏
    'settings.tutorial': '使用教程', // 「使用教程」说明的标题（2026-09-01 新增，放在设置页最底部）
    'settings.tutorialBtn': '查看教程', // 使用教程右侧按钮文案
    'settings.footnote': '更多', // 「更多」节标题（2026-09-16 由「尾注」改名）
    'settings.qrMissing': '（二维码图片未找到）', // 赞助二维码图片缺失时的占位文字
    'settings.sponsor': '赞赏开发者', // 赞助项名称
    'settings.sponsorBtn': '赞赏', // 赞助按钮文字（2026-09-18 起点它弹二维码弹窗）
    'settings.sponsorThanks': '谢谢！', // 赞助弹窗里二维码下方那句话
    'settings.bug': 'Bug 与功能建议', // 建议反馈项名称
    'settings.bugMd': '请添加 Up 主微信：Hi28Notes 沟通。或加入群聊 →', // 建议反馈内容（2026-09-01 去 <br> 压成一段，无空行）
    // ---- 设置页底部「Make Something Wonderful」小字（2026-09-27 用户定）----
    // 灰色小字放在设置页最底，点击弹 Obsidian 系统弹窗、内放 Steve Jobs 2007 年那段话。
    // 引文保持英文原文（人名引用不翻译）；zh / en 文案内容完全一致。
    'settings.appreciationLink': 'Make Something Wonderful With ♥︎', // 设置页底部灰色小字
    'settings.appreciationTitle': 'Make Something Wonderful', // 弹窗标题
    'settings.appreciationQuoteMd': 'There’s lots of ways to be, as a person. And some people express their deep appreciation in different ways. But one of the ways that I believe people express their appreciation to the rest of humanity is to make something wonderful and put it out there.<br><br>And you never meet the people. You never shake their hands. You never hear their story or tell yours. But somehow, in the act of making something with a great deal of care and love, something’s transmitted there. And it’s a way of expressing to the rest of our species our deep appreciation. So we need to be true to who we are and remember what’s really important to us.', // 弹窗正文（Steve Jobs 2007 年引文，保持原文；落款单独一句）
    'settings.appreciationSignature': '—Steve, 2007', // 引文落款（单独一行右对齐）

    // ---- 授权（2026-09-02 新增）----
    'license.heading': '许可证', // 设置页许可证区块标题
    'license.active': '已激活', // 状态标签：已激活
    'license.inactive': '未激活', // 状态标签：未激活
    'license.buyMd': '支付宝付款后，将付款截图发送至邮箱 ShinContactEM@Gmail.com 获取激活码（一码最多 3 台设备）。', // 未激活/试用结束时的购买引导
    'license.trialActive': '试用中', // 状态标签：14 天免费试用期内
    'license.trialRemainingFmt': '试用剩余 {0} 天，到期后需激活才能继续使用完整功能。', // 试用剩余天数；{0} = 天数
    'license.trialExpired': '试用已结束', // 状态标签：试用到期、未激活
    'license.trialDaysDebug': '试用天数（调试）', // 调试项：试用判定阈值
    'license.trialDaysDebugDesc': '仅作者本机可见；改成小值可快速测试「试用到期」。注意：自动试用永远是 14 天（硬编码、不受此处影响），本选项只改本机的判定。',
    'license.resetTrialBtn': '重置为 14 天', // 调试项右侧的重置按钮（一键回到默认）
    'license.okReset': '已重置为 14 天', // 重置成功提示
    // ---- Pro 功能详情弹窗（2026-09-02）----
    'pro.heading': 'Pro 功能', // Pro 详情页/按钮标题
    'pro.shortDesc': '查看 Pro 版包含的全部功能与购买方式', // 设置页入口的描述
    'pro.viewBtn': '查看 Pro 功能详情', // 设置页"打开 Pro 弹窗"按钮
    'pro.ctaBtn': '激活创新 Pro 版', // Pro 介绍页底部的 CTA 按钮（2026-09-04；画布右上角那颗浮层已删，状态栏用下面三条）
    'pro.barActivate': '激活 Pro 版', // 标题栏「激活 Pro」按钮：试用还剩 >7 天、或没有试用记录（2026-10-21 搬进系统标题栏最右）
    'pro.barDays': '激活 Pro 版（{0} 天）', // 同上：试用 ≤7 天，{0}=剩余天数
    'pro.barExpired': '激活 Pro 版（试用期已结束）', // 同上：试用已结束（用户 2026-10-21 定：文案要「已结束」）
    'pro.desc': '以下功能需要激活 Pro 版才能使用', // 弹窗顶部说明
    'pro.empty': '（暂无 Pro 功能）', // PRO_LOCKS 表全免费时显示
    'license.inputPh': '粘贴激活码（28N 开头）', // 激活码输入框占位文字
    'license.activateBtn': '激活', // 激活按钮
    'license.deactivateBtn': '解除激活', // 解除激活按钮
    'license.lidLabel': '许可证号', // 已激活信息行：许可证号（8 位）
    'license.devicesLabel': '设备上限', // 已激活信息行：最多几台设备
    'license.atLabel': '激活时间', // 已激活信息行：本机激活时间
    'license.receiptLabel': '激活回执', // 已激活信息行：可复制给作者的回执串
    'license.receiptHintMd': '换设备或加设备时，把回执发给作者登记即可；不发也能正常用。', // 回执说明
    'license.copyBtn': '复制', // 复制回执按钮
    'license.okActivated': '激活成功，感谢支持！', // 激活成功提示
    'license.okDeactivated': '已解除激活', // 解除激活提示
    // ---- 许可证栏（2026-09-04 合并为一行：未激活 / 已激活各一套文案）----
    'license.ctaTitle': '激活创新 Pro 版', // 未激活时的栏目标题
    'license.ctaDescTrialMd': '你的试用期还剩 {0} 天。试用结束后，部分创新功能将受限。', // 试用中备注（{0}=剩余天数）
    'license.ctaDescExpiredMd': '你的试用期已结束，请激活创新 Pro 版以使用全部功能。', // 试用已结束备注
    'license.howToActivateBtn': '如何激活 ↗', // 设置页右侧按钮 → 直接弹激活教程弹窗
    'license.activeTitle': '已激活创新 Pro 版', // 已激活时的栏目标题
    'license.activeDescMd': '许可证号：{0}；设备上限：{1}；激活时间：{2}\n更换设备后，请点击右侧「解除绑定」后，再至新设备激活。', // 已激活备注（{0}许可证号 {1}设备上限 {2}激活时间）
    'license.unbindBtn': '解除绑定', // 已激活时右侧按钮（换设备前先解绑）
    // ---- 调试项（2026-10-18 起收在「高级 → 实验性功能」标题右侧的小虫子后面）----
    'debug.heading': '调试', // 小虫子按钮的悬浮提示
    // ⛔ 退役（2026-10-20 用户定）：`debug.hideLeftOnDoc` / `debug.hideLeftOnDocDesc` 两条**已删** ——
    //   「点文档节点自动收侧边栏」已转正，入口搬到画布「关闭分屏」图标悬浮出的「更多」里（见 splitMore.*）。
    //   设置项本身（`settings.hideLeftOnDoc`）**保留原字段名**（老 data.json 里存过值，改名要迁移），
    //   但语义从"只收左侧"扩成"左右都收"。
    'debug.fsBtnPos': '全屏按钮位置', // 调试项（2026-10-18）：标题栏那颗全屏按钮站在哪一侧
    'debug.fsBtnPosDesc': '',
    'debug.fsRight': '右侧（默认）',
    'debug.fsLeft': '左侧',
    // ⛔ 退役（2026-10-20）：debug.hideLeftOnDocDesc 已删（见上面 debug.hideLeftOnDoc 那条注释）
    // ⚠️ 2026-10-12 用户定：默认档必须标出来（他实报「改默认值不标文案，我看不出哪个是默认」）。
    //   写法 2026-10-18 改短：默认档后面只挂「（默认）」两个字（原「（用户默认）」退役）。
    //   调试区文案另有一条：**说人话**，不写技术细节（CSS 旋钮名 / 函数名 / 日志前缀一律不出现），
    //   默认值放在句首（「默认关闭。…」）。样板见 debug.logDesc。
    // ⛔ 退役（2026-10-20）：debug.leftKeep / debug.leftHide —— 那个下拉控件（hideLeftOnDocControl）已删，
    //   功能转正成画布「更多 → 分屏选项」里的 toggle（见 splitMore.hideSidebars）。
    'debug.aiPlusMenu': 'AI ＋ 菜单', // 调试项（2026-10-18）：AI 输入条「＋」的子菜单开不弹（功能未转正）
    // ⚠️ 这两项是 toggle（2026-10-18 用户定：两档设置不用两项下拉 —— 下拉的选中项文字会随开关变，
    //   同一个设置出现两套文案）。所以**没有选项标签**，默认值写进说明里（「默认关闭」，普通文字、不加粗）。
    'debug.aiPlusMenuDesc': '默认关闭。开启后，AI 编辑栏左侧的 + 按钮可点击。',
    'debug.log': '日志', // 调试项（2026-10-18）：**统一诊断日志总开关** —— 与具体功能无关，开着才把诊断日志打到控制台
    'debug.logDesc': '默认关闭。开启后，控制台会出现诊断日志，以定位 Bug 根源。普通用户建议关闭。',
    'license.okCopied': '回执已复制', // 复制回执成功提示
    'license.proRequired': '这是 Pro 功能，激活后可用。', // 受控功能被拦时的提示
    'license.err.unknown': '激活失败，请检查激活码', // 未归类错误兜底
    'license.err.empty': '请输入激活码', // 空输入
    'license.err.format': '激活码格式不对，请检查是否复制完整', // 拆不出 payload.signature
    'license.err.signature': '激活码无效', // 验签不过（伪造/复制缺字/改过）
    'license.err.product': '这不是 28 Notes 的激活码', // 别的产品/测试码
    'license.err.expired': '激活码已过期', // 超过 exp
    'license.err.revoked': '该激活码已被停用，请联系作者', // 命中吊销名单
    'license.err.payload': '激活码内容损坏，请重新复制', // payload 解析失败
    'license.err.lockedFmt': '尝试次数过多，请 {0} 分钟后再试', // 激活限流；{0} = 剩余分钟数

    // ============ 空图使用提示（新建空白思维导图后，主节点下方的三行提示） ============
    'hint.line1': '选中节点 + Tab → 新增子节点', // 空图提示第一行
    'hint.line2': '选中子节点 + 回车 → 新增同级节点', // 空图提示第二行
    'hint.line3': '按住空格 + 拖动鼠标 → 移动视图', // 空图提示第三行
    // 🔴 2026-10-10：**主节点自己就是文档节点**时（转入生成的导图）换这两行，且**不受设置页
    //   「新增页面提示」开关影响**（那张图"看起来像空图"但不是空图，这是它唯一的用法说明）。
    //   语感照旧版那句「已转入，请剪切并粘贴至适当位置 →」；把"剪切"改成"复制"是因为
    //   2026-10-11 改回「剪切」：母节点现在真的能剪切了（整棵带走，本图随之变空），
    //   复制会让同一份文档被多张图管理、触发「多处管理」警告，剪切才是正解。第二行不再需要
    //   （剪走之后这张图就是空的，画面上直接给「新建母节点」按钮，不用再教用户删图）。
    'hint.docLine1': '请选中节点，剪切并粘贴至适当位置。',
    'emptyRoot.btn': '新建母节点', // 空图（没有主节点）时画面中间那枚按钮（2026-10-11）
    'emptyRoot.placeholder': '请输入节点名', // 点「新建母节点」后预置的占位文字（进编辑即全选，直接敲字覆盖）
    // 2026-10-20 用户定：三个点那颗「分屏设置」按钮隐藏，改由「⌘/Ctrl + 点击」打开同一个弹窗 →
    //   提示里补一句手势说明（用户写的「cmd」改成 {Mod} 占位，Mac=⌘ / Win=Ctrl，别写死字面量）。
    'tb.closeSplits': '关闭右侧分屏==space==（按住 {Mod} 点击：查看分屏设置）', // 画布右边缘那颗图标（2026-10-11）：一键关掉右侧的文档分屏；后缀段显式给 tipH
    'cut.drillRootOut': '已剪切，画面退回上一层', // 下钻里把当层母节点剪切走后的提示（画面忽然换层要说一声）
    // ============ 导图画面：节点图标 / 折叠箭头 / 备注等悬停提示 ============
    'tip.todoIconTodo': '设为已完成', // 待办节点标题前小方框的悬停提示（2026-09-20；2026-10-06 撤掉 ⌘ 那段）
    'tip.todoIconDone': '已完成：点击小图标标记为待办',
    'tip.todoIconProgress': '子节点完成进度：{0}%', // 母节点自己是待办 + 有子待办时的合并模式提示（{0} = 只算子节点的完成百分比，2026-09-24）
    // 整个**文档 / 附件节点**悬停的提示（2026-10-09 用户定）：挂在卡片上（不是那个小图标），
    //   告诉用户"点它干嘛"以及 ⌘ 点击的额外效果。
    // 🔴 2026-10-10 用户定（行为反转）：默认 = 右侧分屏打开，按住 ⌘/Ctrl 才是新标签页。
    //   后缀段（按住 ⌘ 那段）2026-10-20 起显式给 xxxTipH（以前括号那截是渲染时正则猜的，已废）。
    'tip.openDocNode': '点击在右侧打开==space==（按住 {Mod} 点击：在新标签页打开）',
    'tip.openFileNode': '点击在右侧打开该文件==space==（按住 {Mod} 点击：在新标签页打开）',
    // 「文档警告节点」（被多处管理的）的悬浮小字（2026-10-09 用户定）：换这句 + **黄底**样式，
    //   后缀段走 xxxTipH（浅色）。
    'tip.multiRefDoc': '此文档正在被多处管理，建议减少为一处==space==（右键管理）',
    // 节点前缀图标「点一下 = 取消这个标记」的悬停提示（2026-10-05）：四个图标统一走 data-tip 黑色小字
    'tip.icoClearNow': '清除 Now 标记',
    'tip.icoClearMinor': '清除 Minor 标记',
    'tip.icoClearAi': '清除 AI 生成标记',
    'tip.icoClearAiMix': '清除 AI 生成标记==space==（含人工内容）', // 句中括号挪到末尾（2026-10-20）；后缀段显式给 tipH
    'tip.aiRemarkNa': '点击后，将清除备注的 AI 生成标记==space==（此节点无备注，暂不可用）', // 备注标记按钮的置灰档（2026-10-14）
    'tip.unfold': '点击展开', // 节点右侧折叠箭头悬停提示（折叠态）
    'tip.fold': '点击折叠', // 节点右侧折叠箭头悬停提示（展开态）
    'tip.editNote': '备注（双击编辑）', // 备注行（灰竖条文字）悬停提示
    'tip.image': '单击选中 · 双击放大 · 右键复制', // 节点里图片的悬停提示
    'tip.imgResize': '拖动改图片大小（松手后写进文件）', // 图片右下角缩放把手
    'tip.imgMissing': '图片缺失 · 双击重试', // 缺失图片的悬停提示（上方还会拼上文件名）
    'tip.editLinkSuffix': '\n双击编辑链接', // 链接悬停提示的第二行（自动拼在各类链接提示后面，\n = 换行）
    'tip.jump': '点击跳转', // 节点链接（[[#pid]] 指向本图节点）的悬停提示
    'tip.openNote': '点击打开笔记：{0}', // 笔记链接悬停提示（{0}=笔记名）
    'tip.locateNode': '（定位节点 {0}）', // 笔记链接带节点 ID 时的附加提示（{0}=节点 ID）
    'tip.openFile': '点击打开文件：{0}', // 本地文件链接悬停提示（{0}=文件路径）
    'tip.openUrl': '点击在浏览器打开：{0}', // 网页链接悬停提示（{0}=网址）

    // ============ 左侧工具栏按钮 tooltip ============
    'tb.foldSel': '折叠附近节点（{Mod} + F）', // 折叠按钮：已选中节点时
    'tb.foldNoSel': '折叠附近节点（需选择节点后操作）（{Mod} + F）', // 折叠按钮：未选中节点时
    'tb.foldDefault': '折叠/展开附近节点（需选择节点后操作）（{Mod} + F）', // 折叠按钮的初始 tooltip（进画面未选中时）
    'tb.drill': '进入当前节点', // 「进入该节点」按钮：已选中时（键位段由 nmKeySuffix 动态追加，随改键实时变）
    'tb.drillDefault': '进入当前节点（需选择节点后操作）', // 同按钮初始 tooltip（未选中时）
    'tb.drillAtRoot': '已在主节点，无需进入', // 选中主节点时：无处可钻，按钮置灰（2026-09-15）
    'tb.selectFirst': '请先选择节点', // 未选中节点时多个按钮的通用兜底提示
    'tb.noMinor': '隐藏 Minor 和 Done 节点==space==（当前视图有 M/D 节点时可点击）', // 置灰判据 = **看得见的**范围内没有（2026-09-21 起折叠分支不算）；后缀段（为什么灰）显式给 tipH
    'tb.showMinor': '显示 Minor 和 Done 节点==space==（{0}）', // 隐藏过滤按钮：隐藏中（点此显示）；键位走 tipH 里的 {0}
    'tb.hideMinor': '隐藏 Minor 和 Done 节点==space==（{0}）', // 隐藏过滤按钮：显示中（点此隐藏）
    'tb.nowReadonly': '此按钮在历史页面无法操作', // 历史页里 Now 按钮被禁用的提示
    'tb.noNow': '只显示 Now 节点==space==（当前视图有 Now 节点时可点击）', // 图里没有任何 Now 节点时 Now 按钮的提示（置灰）；后缀段显式给 tipH
    'tb.nowShowAll': '取消只显示 Now 节点==space==（{0}）', // 只看 Now 按钮：开启中（点此恢复显示全部）
    'tb.nowOnly': '只显示 Now 节点==space==（{0}）', // 只看 Now 按钮：关闭中（点此只看 Now）
    'tb.undo': '撤销（{Mod}+Z）', // 撤销按钮 tooltip（写死键不给自定义，静态没问题）
    'tb.redo': '重做（{Mod}+Shift+Z）', // 重做按钮 tooltip（同上）
    'tb.locate': '定位到中心节点==space==（{0}）', // 定位按钮 tooltip；键位走 tipH 里的 {0}（未绑时占位连同空括号一起剥掉）
    // 定位子菜单（2026-09-28）：分「主节点 / 当前关注 / 选中节点」三段，后两段没内容时用占位项（置灰不可点）
    'now.none': '无当前关注节点', // 中间那段为空时的占位
    'now.noSel': '无选中节点', // 最后那段为空时的占位
    'tb.minorToggle': '隐藏/显示次要 Minor 节点', // 隐藏/显示 Minor 按钮初始 tooltip（键位段动态追加）
    // （tb.viewFilter / viewFilterRcHide / viewFilterRcShow 已随三档机制一起删除：2026-10-18 —— 展开档固定用 hideMinor/showMinor）
    // 左下 AI 按钮的小字（2026-10-05）：⌘/Ctrl + 点击 = 复制 AI 定位路径（就是右键菜单里暂隐那一项做的事）。
    // ⚠️ 不与 more.aiEdit 共用：那个键同时是 AI 定位弹窗的标题，改它会把弹窗标题一起改掉。
    // {Mod} 走 modStr（Mac=⌘ / Win=Ctrl），与其它 tb.* 提示同一套写法。
    'tb.aiEdit': 'AI 编辑', // 左下那颗 AI 按钮的提示（2026-10-05：⌘/Ctrl 那条说明已撤）
    'tb.doclib': '思维导图文档库', // 左下那颗文档面板按钮的提示（2026-10-10 用户定：按钮放回来了，名字跟面板新名）
    'tb.joinGroupBtn': '加入群聊==space==（可在设置页面隐藏此按钮）', // 左下那颗群聊按钮（2026-10-10）；后缀段显式给 tipH
    'tb.guideBtn': '查看使用教程==space==（可在设置页面隐藏此按钮）', // 左下那颗教程按钮（2026-10-10）
    // AI 输入条（2026-09-28）：点左下「AI 编辑」→ 底部弹出的输入框。
    // 关闭叉与加号**不挂**悬浮提示（看图标就懂，用户定），只有发送挂。
    'aiBar.send': '发送',
    'aiBar.placeholder': '你想让 AI 做什么？', // 输入框里的灰字，一打字就没（原生 placeholder）
    // 框上方那行小提示词：说明这次是对谁说话（没选中 / 选中 N 个两档；没选中时不显示叉）
    'aiBar.hintView': '编辑当前视图',
    'aiBar.hintOne': '编辑选中节点',
    'aiBar.hintMultiUnsupported': '暂不支持选中多个节点，已回退至编辑当前视图', // 多选时（2026-09-28 用户定稿文案）；旁边的叉点了取消选中
    // 「＋」的子菜单与导入弹窗（2026-09-28：本轮只做界面，确认后不做任何操作）
    'aiBar.import': '导入 AI 网页回答',
    'aiBar.importTitle': '导入 AI 网页回答',
    'aiBar.importHint': '请将 AI 回答的分享链接贴至下方，AI Agent 会查看并整理成思维导图格式。（粘贴多个链接时，请以分号分隔开）',
    'aiBar.importPh': '分享链接：分享 AI 回答时生成的链接',
    'aiBar.importChip': '导入 AI 回答链接：{0}', // 导入后输入框上方那条小条：{0} = 链接（超长由 CSS 截断）
    // （fm.nowFocus / fm.hideMinor 已随二级菜单 #fm-* 一起删除：2026-10-18）

    // ============ 节点工具栏（选中节点时底部弹出的黑色圆条按钮 tooltip）============
    'nm.bold': '加粗==space==（{0}）', // 键位段走 tipH 里的 {0}（2026-10-20：浅色段一律括号括起整段进 TipH）
    'nm.red': '标为红色==space==（{0}）', // 标红按钮
    'nm.yellow': '标为黄色==space==（{0}）', // 标黄按钮
    'nm.note': '备注', // 写备注按钮（键位段由 nmKeySuffix 动态追加，随改键实时变）
    'nm.now': '设为当前关注 Now==space==（{0}）', // 标记 Now 按钮（键位段 2026-10-21 补：原来只写正文，提示里不带键）
    'nm.minor': '设为次要 Minor==space==（{0}）', // 键位段（2026-10-20 用户规律：浅色那截一律括号括起；没绑键时整段不显示）
    'nm.add': '添加', // 底部工具条最右「＋」按钮的悬浮提示（2026-09-28：改成点击弹面板后，悬停不再弹面板，提示才挂得上）
    // 底部工具条最右那颗「AI」按钮 + 它的横排子菜单（2026-10-05，四项）
    'nm.ai': 'AI', // 底部工具条最右那颗「AI」按钮的悬浮提示（与「＋添加」那颗的「添加」同款）
    'nm.aiEdit': 'AI 编辑', // 子菜单项：等同原来右键那条，开合底部 AI 输入条
    'nm.aiEditTip': '点击后，让 AI 快速编辑', // 那一行的悬浮提示（2026-10-06 用户定）
    'nm.aiMark': '添加 AI 生成标记', // 子菜单项：未标记时（点一下 = 打标）
    'nm.aiMarkOn': '清除 AI 生成标记', // 子菜单项：已标记时（ai / mix 都是这一条，图标+文字变主题色，再点 = 清除）
    // 那一行的**悬浮提示分三态**（用户 2026-10-05 定：沿用原来右键那套 —— 行文字只有"添加/清除"两态，
    // 但提示要把"这节点现在是纯 AI 还是混合"说准）
    'nm.aiMarkTip': '点击后，将此节点标记为 AI 生成==space==（{0}）', // 未标记
    'nm.aiMarkTipAi': '点击后，将清除节点的 AI 生成标记==space==（{0}）', // 已标记 ainode:ai
    'nm.aiMarkTipMix': '点击后，将清除 AI 生成标记==space==（含人工内容）（{0}）', // 已标记 ainode:mix；浅色段（含人工内容 + 键位）整段进 TipH
    // 备注标记那颗附属按钮（2026-10-14）：它只有图标、没有文字标签，所以文案只有提示语
    'nm.aiRemarkTip': '点击后，将此节点的备注标记为 AI 生成', // 未标记
    'nm.aiRemarkTipOn': '点击后，将清除备注的 AI 生成标记', // 已标记 airemark:ai
    'nm.aiRemarkTipMix': '点击后，将清除备注的 AI 生成标记（含人工内容）==space==（含人工内容）', // 已标记 airemark:mix；句中括号挪末尾，后缀段显式给 tipH
    'nm.aiLocate': '外部 Agent 编辑', // 子菜单项：等同原来右键那条
    'nm.aiLocateTip': '点击后，可复制路径，让外部 AI Agent 快速定位和修改==space==（{0}）', // 悬浮说明；键位走 tipH 里的 {0}
    'nm.aiRules': '添加 AI 更改规则', // 子菜单项：给这个节点写「AI 改它时要遵守的规则」
    'tip.aiRulesHint': '点击后，可添加规则，AI Agent 更改此文件时会遵循此规则', // 「添加 AI 更改规则」的悬浮说明（用户 2026-10-05 定的原话）
    'tip.editAiRules': 'AI 更改规则（双击编辑）', // 卡片上那一块自己的原生提示（与备注同款）
    // 小眼睛（2026-10-06 定稿形态）：AI 面板「AI 更改规则」那一行**右边**那颗，切「显示 / 隐藏 AI 更改规则」
    // （全局生效；隐藏 = **整个不渲染**，像隐藏次要节点那样，不是收成小横条）。
    // 写的是**点下去会发生什么**：现在显示着 → 提示「点击后隐藏…」+ 闭眼。
    'tip.aiRulesEyeOn': '点击后，画面中不显示更改规则，更简洁', // 当前是**显示** → 点了变隐藏
    'tip.aiRulesEyeOff': '点击后，显示 AI 更改规则', // 当前是**隐藏** → 点了变显示
    // 置灰档（画面里一个带规则的节点都没有；**置灰 = 不可点**，2026-10-06 用户定）——
    // 句式和另外两条一致（"点击后…"），后缀段补一句为什么是灰的（2026-10-20 起显式给 tipH）
    'tip.aiRulesEyeNone': '点击后，画面中不显示更改规则，更简洁==space==（当前视图无此类规则）',
    // 待办按钮（2026-09-20）：提示两行随选中节点状态换 —— {0} 是键位段占位
    // 2026-10-20 用户定（第三版）：括号写进文案（「（{0}）」），键位段只含键位本身；
    //   后缀段「（按住 ⌘：设为已完成）」显式拆到 xxxTipH，不再靠括号正则猜。
    'nm.todoPlainTip': '设为待办==space==（{0}）（按住 {Mod} ：设为已完成）', // 浅色段整段进 TipH（2026-10-20 用户规律：括号括起来、从括号处切开）
    'nm.todoOffTip': '清除待办属性==space==（{0}）', // 选中待办 / 已完成节点（此时按住 ⌘ 无特殊效果）；2026-09-23 用户定：不叫「普通节点」
    // 底部一级按钮在设置页「添加面板简化」列表里的行名（2026-09-20 第五轮：底部按钮注册进面板统一排序/显隐）
    'addPanel.btnStyle': '格式按钮',
    'addPanel.btnNote': '备注按钮',
    'addPanel.btnTodo': '待办按钮（Todo）',
    'addPanel.btnTodoDone': '完成按钮（Done）',
    'addPanel.btnNow': '当前关注按钮（Now）',
    'addPanel.btnMinor': '次要按钮（Minor）',
    'addPanel.btnMore': '添加按钮',
    'settings.primarySepRow': '主操作分隔线', // 「添加面板简化」列表里的特殊行（2026-09-20 用户定）
    'settings.primarySepRowDesc': '此条目以上的按钮将会出现在节点底部的一级菜单（最多 8 个）。本行不可关闭，只能上下拖动。',
    // 底部菜单最右「更多」（2026-09-17 加）：悬浮弹出的添加类入口。
    // 注：该按钮**刻意不挂提示框**（悬浮时会和弹出的子菜单叠在一起，用户 2026-09-17），
    // 所以原来那条 'nm.more' 文案已删。
    // 一级菜单（2026-09-17 二次改版：原来 8 项挤在一起看着过载 → 只留 4 项常用 + 一个二级入口）
    // 三次改版（同日稍后）：节点操作（加子节点/加同级/删除）也收进「添加其他内容」二级里，一级不再单列
    'more.addChild': '子节点',
    // 2026-10-06 用户定：提示改成「点击后，可…」+ 键位段自动接（tipAct → NM_FIXED_KEYS 那张写死键表）。
    //   原来这两条是**整句写死键位**的（'快捷键：Tab' / '快捷键：Enter'）—— 键位现在不再进 i18n。
    'more.addChildTip': '点击后，可添加子节点==space==（{0}）',
    'more.addSibling': '同级节点',
    'more.addSiblingTip': '点击后，可添加同级节点==space==（{0}）',
    // ⚠️ 下面这几条已**无人引用**（对应功能早删了：删除节点 / 添加其他内容 / 自定义该面板 / AI 编辑入口）——
    //    留着只是没清；别再照着它们的写法（把键位写进文案）加新提示，键位一律走 tipAct / NM_FIXED_KEYS。
    'more.delNode': '删除节点',
    'more.delNodeTip': '快捷键：Delete',
    // 注：「添加其他内容」与底部「样式」按钮都**有子菜单 → 不挂提示**（会和子菜单叠住），
    // 所以它们的提示文案/短标签已删；说明文案改挂在子菜单那一项上（见 nm.bold / nm.red / nm.yellow）。
    'more.addOther': '添加其他内容',
    'more.aiEdit': 'AI 编辑', // 添加面板新条目（2026-09-18）：右键「复制 AI 定位」的可视化形态
    'more.aiEditTip': '点击复制 AI 定位信息',
    'more.customPanel': '自定义该面板', // 二级面板底部入口：点开 → 设置页「添加面板简化」
    'more.customPanelTip': '可选择隐藏部分操作按钮',
    'more.addNoteTip': '点击后，可添加备注==space==（{0}）', // 添加面板「备注」行的悬浮提示（2026-10-06 用户定）
    'more.moreAdd': '更多添加项', // ＋添加面板的二级入口行（2026-10-12 拆两级；悬浮 / 点击展开右侧二级面板；不挂黑字提示——悬浮直接出面板）
    'more.addImage': '图片',
    'more.addImageTip': '点击后，可添加图片==space==（可直接粘贴）', // 用户指定文案；后缀段显式给 tipH
    'more.addVideo': '视频',
    'more.addVideoTip': '点击后，可添加视频',
    'more.addAudio': '音频',
    'more.addAudioTip': '点击后，可添加音频',
    'more.addVaultAttach': '仓库附件',
    'more.addVaultAttachTip': '点击后，可引用库里已有的音视频==space==（可直接粘贴）',
    'more.addVaultAttachHint': '当你在普通笔记粘贴图片 / 视频时，该文件会存入 Obsidian 默认附件文件夹。你可以选择将它的文件名（如 xxx.png）或路径粘进来，思维导图会识别并渲染。（只是建立引用，不会复制文件）',
    'more.addFileLink': '本地文件链接',
    'more.addFileLinkTip': '点击后，可添加本地文件链接==space==（可直接粘贴）',
    'more.addFileLinkHint': '请填写完整文件路径，例如 /Users/…/文件.pdf。（你也可在选中节点时（非编辑状态下），直接粘贴地址）',
    'more.addWiki': '双链',
    'more.addWikiTip': '点击后，可添加双链，一键跳转至其它页面==space==（[[ )', // ⚠️ 后缀「（[[ )」是**半角右括号 + 空格**，用户特意这么写的（2026-09-21），别"顺手"改成全角
    'more.addNodeLink': '关联节点',
    'more.addNodeLinkTip': '点击后，可添加关联节点，一键跳转至对应节点==space==（可直接粘贴）',
    'more.addNodeLinkHint': '选中要关联的节点，右键「复制节点链接」，并粘贴至此处即可关联。支持跨思维导图粘贴；支持选中节点后直接粘贴。',
    // 导入仓库文档（2026-10-09 用户定）：排在「子文档」**上面** —— 从 vault 里挑一份**已有**文档挂上来。
    'more.importRepoDoc': '转入仓库文档',
    'more.importRepoDocTip': '点击后，可转入左侧文件列表的文档==space==（支持拖拽快速转入）',
    // 转入仓库文件夹（2026-10-12 用户定）：排在「转入仓库文档」**下面** —— 点开弹窗粘**文件夹绝对路径**。
    //   为什么用绝对路径：Obsidian 没有"选文件夹"的原生选择器，文件夹也进不了 `[[ ]]` 建议列表。
    'more.importRepoFolder': '转入仓库文件夹',
    'more.importRepoFolderTip': '点击后，可转入左侧文件列表的文件夹==space==（支持拖拽快速转入）',
    // 子文档（2026-10-09 用户定）：排在「关联节点」下面 —— 在选中节点下挂一份**新建的**文档
    //   （文件真建在数据区 `28Notes-Files/docs/` 里，节点就是指向它的文档节点）。
    //   提示的键位段走 tipAct（绑了键才显示，没绑就连占位带空括号一起不显示）。
    'more.addChildDoc': '子文档',
    'more.addChildDocTip': '点击后，可新增子文档==space==（{0}）',
    // 两个输入框的**预设文字**（2026-09-20 从代码里抽出来）：英文界面曾露出中文「文件」/「文件名」
    'more.addFileLinkPh': '/Users/…/文件.pdf',
    'more.pickLocal': '从本机选择',   // 「本地文件链接」弹窗左下角那颗（2026-10-07 用户定）：拉起系统文件选择器
    'more.pickLocalPrompt': '选择要链接的文件或文件夹',   // 系统选择框上那句提示（2026-10-07 放开文件夹）
    'notice.pickPathFail': '没能拿到这个文件的完整路径（当前平台可能不支持，请手动粘贴路径）',
    'more.addNodeLinkPh': '[[文件名#节点ID]]',
    // 「建议反馈」行右侧的加群按钮（2026-09-20 从代码里抽出来：英文界面曾只有中文）
    'settings.joinGroupBtn': '加入群聊',
    // Pro / 付费两个弹窗的文案（2026-09-20 抽出少量固定句；2026-09-27 正文全部抽到这里）。
    // 版面（哪块在前、间距多大）由 main.js 的 PRO_PAGES 清单决定，这里只管字；改字不用动代码。
    // 价格 / 邮箱 / 微信号 / 活动链接是**商业参数**，走 main.js 的 PRO_PLAN（不在这里）。
    'pm.scrollHint': '鼠标滚动以向下查看',
    'pay.shareBtn': '分享免费领会员',
    'pm.shareLink': '（分享免费领会员）', // Pro 弹窗价格那行 ¥38 右边的小字链接（2026-09-24 用户定）：点击跳同一个分享活动页；括号跟语言走（中文全角 / 英文半角）
    'pay.emailCopied': '邮箱已复制',
    'pay.emailCopyFail': '复制失败，请手动复制',
    'pm.priceLead': '早鸟价优惠', // 价格行开头（后面跟 ¥76 → ¥38）
    'pm.trialLeft': '你的试用期还剩 {0} 天。试用结束后，部分创新功能将受限。', // {0} = 剩余天数（不足 1 天按 1 天）
    'pm.trialEnded': '你的试用期已结束，请激活创新 Pro 版以使用全部功能。',
    'pm.secFreeH': '🌱 了解免费版',
    'pm.secFreeMarket': '市面上思维导图软件<span class="pm-blue">存在的大多数功能，无限制使用</span>。', // 允许带强调标记
    'pm.secFreeDim': '无限量生成思维导图、插入图片、备注、Obsidian 双链、本地文件链接、节点链接等。',
    'pm.secProH': '🪴 了解创新 Pro 版',
    'pm.secProMarket': '<span class="pm-blue">28 Notes 原创的创新功能</span>，试用期结束后，需激活以使用。',
    'pm.secProDim': 'Now、Minor、捷径、AI 定位路径、多级折叠等。',
    'pm.capBefore': '原视图：庞大混乱', // 第一张对比图下的图注
    'pm.capAfter': '使用创新功能 Now 和 Minor 后：瞬间清晰，聚焦重点',
    'pm.thanks': '你的支持可以让我持续开发，做出美好的产品，谢谢你！',
    'pm.note': '本产品为买断制，激活码永久有效，可激活三台设备。（不包含在线生成式 AI 功能）',
    'pay.h1': '微信扫码支付 {0}', // {0} = 现价（PRO_PLAN.priceNowText，如 ¥38）
    'pay.emailLead': '将付款截图发送至邮箱：',
    'pay.step1': '1. 截图需包转账单号（样式如下）',
    'pay.step2': '2. 发送后，24h 内左右会收到激活码',
    'pay.alt1': '如不便发送邮件，也可添加开发者微信 {0} 直接激活', // {0} = 微信号
    'pay.h3': '激活',
    'pay.path': '在 Obsidian → 设置 → 第三方插件 → 28 Notes 里激活',
    'pay.alt3': '如遇激活问题，请发送邮件 / 联系开发者微信：{0} 解决',
    'pay.thanks': '=) 谢谢你的支持！',
    'more.addUrlLink': '网页',
    'more.addUrlLinkTip': '点击后，可添加网页链接==space==（可直接粘贴）', // 后缀段显式给 tipH
    'more.urlText': '显示文字',
    'more.urlAddr': '链接地址',
    // 「添加网页链接」弹窗里的说明——与条目悬浮提示**分开两个键**，方便各自单独改（用户 2026-09-17）
    'more.addUrlLinkHint': '网址请以 www. / https://www. 开头，否则可能识别异常。显示文字留空时，会直接显示网址。',
    'more.pickFail': '导入失败：没能读取所选文件',
    'more.pickPrompt': '选择要导入的文件',

    // ============ 操作提示条（画面底部/顶部黑色浮出提示）============
    'toast.hiddenMinor': '已隐藏此 Minor 节点', // 隐藏 Minor 后（带撤销按钮）
    'toast.hiddenNow': '已隐藏此 Now 节点', // 只看 Now 视图下取消 Now 标记后（节点从画面消失，带撤销）
    'toast.nowFilterOff': '视图中已无「当前关注」节点，「当前关注-视图筛选按钮」已自动关闭', // 「聚焦当前关注」开着时把最后一个 Now 设为次要节点 → 它被「隐藏次要节点」藏掉、画面再无 Now 可显示 → 自动关掉这项筛选（不落盘，意图保留；带撤销）
    'toast.hiddenAlsoDeleted': '提示：{0} 个被隐藏的次要 Minor 子节点也被删除了', // 删除节点时连带删除了被隐藏的 Minor 子节点（{0}=数量）
    'toast.pasteLink': '请先选中一个节点，再粘贴链接', // 未选中节点就 Cmd+V 粘贴链接时
    'toast.pasteFileLink': '请先选中一个节点，再粘贴文件链接', // 未选中节点就粘贴文件链接时
    'toast.pasteImg': '请先选中一个节点，再粘贴图片', // 未选中节点就粘贴图片时
    'toast.pasteFirst': '请先选中一个节点，再粘贴', // 未选中节点就粘贴普通文本时
    'toast.pasteEmpty': '剪贴板里没有可粘贴的内容', // 剪贴板是空的（2026-09-23：原来跟上面共用一句"请先选中节点"，指着错的方向）
    'toast.imgSavedNoNode': '图片已保存，但目标节点已不存在', // 粘贴图片存盘成功但目标节点已被删
    'toast.showNowEmpty': '当前视图没有 Now 节点，「只看当前关注」未开启', // 点「只看 Now」但当前视图（当前根范围）没有 now 标记节点（2026-08-31）
    'toast.imgSaveFail': '图片保存失败', // 粘贴图片写盘失败
    'toast.bookmarkRelocated': '原捷径节点已被删除 / 更名，已重定位至主节点', // 打开书签但指向的节点已被删（回退到主节点）
    'toast.restored': '已还原到该历史版本（已记成一条新版本；还原前的内容也保留着，随时能找回）', // 历史还原成功后
    'toast.copyCreated': '已创建副本：{0}', // 从历史快照创建副本成功（{0}=新文件名）
    'toast.copyShellFail': '创建文档捷径失败，这份副本没有生成', // 复制 / ⌥ 拖拽时副本里的文档节点换壳失败（整笔复制作废，2026-10-19）
    'toast.copied': '已拷贝', // 拷贝节点树进剪贴板之后（2026-10-19）
    'toast.copiedPlain': '已拷贝清除格式版本', // ⌥⌘C / 按住 ⌘ 点「拷贝」之后（2026-10-19）
    'toast.cut': '已剪切', // 剪切节点之后（2026-10-19）
    'toast.histSnapGone': '找不到正在查看的这一版了（它可能已被删除）。回历史记录里重新点一条再试。', // 横幅按钮取不到那一版快照时（2026-09-19；绝不静默）
    'toast.restoreFinishFail': '这一版已经还原到文件里了，但画布刷新出错 —— 重开这个导图即可看到', // 宿主还原成功、前端收尾抛异常时（2026-09-19）
    'toast.jumpFail': '未找到链接目标（可能已被删除）', // 点节点链接但目标节点已被删
    'toast.histReadonly': '历史页为只读，退出历史页后才能保存当前版本', // 历史页里点「保存此版本」时
    'toast.histNoEdit': '历史界面只读，不能修改内容', // 历史界面里碰到编辑入口时（如定位菜单二次点击改标题）
    'toast.versionSaved': '已保存当前版本', // 手动命名保存版本成功后
    'toast.versionDeleted': '已删除该版本', // 删除单条历史版本成功后
    'toast.versionRenamed': '已重命名该版本', // 重命名单条历史版本成功后
    'toast.aiLocateCopied': '已复制文档路径，请在外部 AI Agent 里粘贴并编辑', // 复制 AI 定位路径 成功后
    'toast.docImported': '已转入', // 转入成功提示（{0} = 文档名，2026-10-08）
    'toast.docImportedToNode': '已转入', // 转入到指定节点（{0} = 节点名，{1} = 文档名，2026-10-12）
    'toast.docMovedOut': '已转出', // 转出成功提示（{0} = 文档名，{1} = 落点目录，2026-10-08）
    // 「一步反悔」的两条回话（2026-10-17）：点 toast 上那颗「撤销」之后
    'toast.undoDone': '已撤销',
    'toast.undoGone': '无法撤销（目标节点已不存在）',
    // ⌥ 拖出画布：镜像一份完成（{0} = 顶层名字，{1} = 落点）
    'toast.mapCopiedOut': '已在 {1} 创建捷径',
    'toast.doclibLinkCopied': '已复制双链，可直接粘贴到导图里', // 文档面板里点「复制链接」成功
    'toast.docRefGone': '该引用已不存在（导图内容可能被改过）', // 面板点 1/2/3 定位时，树里找不到对应节点
    'toast.locateReveal': '目标节点被视图筛选藏起来了，已自动关闭对应筛选', // 面板定位的目标是次要/已完成节点（或不在 Now 可见集）且筛选开着 → 自动关筛选让节点现身（2026-10-11 用户定）
    'toast.docDeleted': '已删除：{0}', // 删除已放入思维导图数据库的文档成功（{0} = 文档名）
    'notice.docDeleteFail': '删除失败：', // 删除已放入思维导图数据库的文档出错时（后接错误信息）
    'toast.nodeLinkCopied': '已复制，请粘贴至需关联的节点', // 复制节点链接 成功后

    // ============ 格式警告（打开文件时顶部的黄色警告条）============
    'warn.root': '第 {0} 行：无法识别（第一行应是中心主题 `- 中心主题`），已原样保留', // {0}=行号
    'warn.tabIndent': '第 {0} 行：分支必须用 Tab 缩进（一个 Tab = 一级），不能和中心主题平级，已原样保留', // {0}=行号
    'warn.spaceIndent': '第 {0} 行：缩进请用 Tab，不要用空格，已原样保留', // {0}=行号
    'warn.unrecognized': '第 {0} 行：无法识别「{1}」，已原样保留（只支持 `- 节点`、`> 备注`、`![]图片`、`[[链接]]`）', // {0}=行号 {1}=内容片段
    'warn.dupId': '重复的节点 ID：{0}（复制节点时未清 ID？保留其中一个即可）', // {0}=重复的 ID
    'warn.deadLink': '断链：{0} 指向的节点不存在（可能已被删除）', // {0}=链接原文
    'warn.boxPrefix': '⚠ 格式问题：', // 黄条的开头前缀（后接各条警告，分号分隔）

    // ============ 右键菜单（画布里右键节点弹出的菜单）============
    'ctx.copyImage': '复制图片', // 菜单项：复制节点里的图片
    'ctx.deleteImage': '删除该附件', // 菜单项：把这张图片/视频/音频从节点上移除（2026-09-17 补）
    'more.pickBadType': '只支持图片 / 视频 / 音频，其它格式已跳过', // 选了不支持的格式时提示
    'ctx.drill': '进入当前节点', // 菜单项：下钻把该节点当主节点
    'ctx.drillTip': '点击后，视图中只会显示此节点树==space==（{0}）', // ⚠️ 预埋文案（2026-09-21 用户要求「你先自己预埋」，待用户改）；键位走 tipH 里的 {0}
    'ctx.drillRootTip': '当前为母节点，不可进入', // 母节点上「进入当前节点」那一项置灰时的说明（2026-10-07 用户定）
    'ctx.bookmarkTip': '点击后，可将此视图保存为快捷页面==space==（{0}）', // ⚠️ 预埋文案（同上）
    'ctx.basicOps': '基础操作', // 右键二级菜单（2026-09-21）：剪切 / 复制 / 粘贴 / 删除收在这里
    // （右键「待办」行的五个文案键 ctx.todo* 已随那行死分支一起删除：2026-10-18）
    'ctx.cut': '剪切',
    'ctx.copy': '拷贝', // 2026-10-18 改名：这一项是**进剪贴板**（拷贝），下面新加的「复制」才是建副本
    'ctx.copyTip': '点击后，可拷贝该节点树==space==（按住 {Mod} 点击 / {Mod} + {Alt} + C：拷贝清除格式版本）', // 拷贝行悬浮说明（2026-10-19 用户给的文案；2026-10-23 补上清格式快捷键）。{Mod}/{Alt} 由 T() 按平台换成 ⌘⌥ / Ctrl+Alt，Mac 侧加号会被 modStr 收成「⌘⌥C」；后缀段显式给 tipH
    'ctx.duplicate': '复制', // 2026-10-18 新增：在选中节点后面建一棵一模一样的子树（文档节点落成文档捷径）
    'ctx.duplicateTip': '点击后，可生成该节点树副本==space==（可按住 {Alt} 拖拽操作）', // 用户原话（2026-10-18）；后缀段显式给 tipH
    'ctx.duplicateNaTip': '当前为母节点，不支持复制', // 置灰说明
    'ctx.paste': '粘贴',
    'ctx.delete': '删除',
    'ctx.pasteUseKey': '读不到剪贴板，请用 {Mod}+V 粘贴', // 右键「粘贴」读剪贴板失败时的提示（{Mod} 按平台=⌘/Ctrl）
    'ctx.pasteEmptyTip': '剪贴板里没有可粘贴的内容==space==（先复制节点或文字）', // 右键「粘贴」置灰时的悬浮说明（2026-09-23）；后缀段显式给 tipH
    'ctx.pasteMultiTip': '多选状态下不能粘贴==space==（先选中单个节点）', // 右键「粘贴」在多选时置灰的说明（2026-09-23）
    'more.kbdPaste': '粘贴', // 「＋添加」面板各条目右侧的操作提示（2026-09-21 用户定）：直接粘贴即可
    'more.kbdWiki': '[[', // 双链：打两个方括号触发
    'more.kbdTab': 'Tab', // 添加子节点
    'more.kbdEnter': 'Enter', // 添加同级节点
    'ctx.copyLink': '复制节点链接', // 菜单项：复制 [[文件名#pid]] 节点链接
    'ctx.manageDoc': '管理文档', // 菜单项（**只给「文档警告节点」**，2026-10-09 用户定；2026-10-11 挪到「进入当前节点」下面）
    'ctx.manageDocTip': '点击后，可查看并管理此问题文档', // 黑色小字提示（2026-10-11 用户定文案）
    'ctx.openDoc': '打开文档', // 菜单项（仅已放入思维导图数据库的文档节点）：新标签页打开这份被收纳的文档（2026-10-08）
    'ctx.moveOutDoc': '转出思维导图', // 菜单项（仅已放入思维导图数据库的文档节点）：把文档搬回 vault 根目录（2026-10-08）
    'ctx.deleteDoc': '删除文档', // 菜单项（仅已放入思维导图数据库的文档节点）：删除这份文档（二次确认 + 替换导图里的引用，2026-10-08）
    'ctx.renameDoc': '重命名文档', // 菜单项（同上）：改**文件**名，走 Obsidian 官方改名（引用自动更新，2026-10-08 方案 §4.7）
    // 附件节点（图片 / 视频 / 音频）的右键菜单（2026-10-08 用户定）：只有打开 / 删除两项 ——
    // 「重命名」对附件没意义，不给。文案按类型分，用户一眼知道自己在操作什么。
    'ctx.openImage': '打开图片',
    'ctx.openVideo': '打开视频',
    'ctx.openAudio': '打开音频',
    'ctx.deleteImage': '删除图片',
    'ctx.deleteVideo': '删除视频',
    'ctx.deleteAudio': '删除音频',
    // 上面这一组的黑色小字提示（2026-10-11 用户定）：「打开 / 删除」按类型分（后缀与行文字 nmCtxKeyOf 同一套），
    //   「重命名」只有文档那一种。⚠️ 改中文时英文段（i18n.js 下半部分）必须同步。
    'ctx.openTipDoc': '点击后，可在新标签页打开此文档',
    'ctx.openTipImage': '点击后，可在新标签页打开此图片',
    'ctx.openTipVideo': '点击后，可在新标签页打开此视频',
    'ctx.openTipAudio': '点击后，可在新标签页打开此音频',
    'ctx.renameDocTip': '点击后，可重命名该文档',
    'ctx.deleteTipDoc': '点击后，可删除此文档',
    'ctx.deleteTipImage': '点击后，可删除此图片',
    'ctx.deleteTipVideo': '点击后，可删除此视频',
    'ctx.deleteTipAudio': '点击后，可删除此音频',
    'ctx.bookmark': '建立视图捷径', // 菜单项：为该节点创建书签文件（2026-10-11 改名：与新增的「建立文档捷径」区分）
    'ctx.saveDocShortcut': '建立文档捷径', // 菜单项（仅文档节点，2026-10-11 用户定）：建 28notes: doclink 壳，点壳直接打开文档
    'ctx.saveDocShortcutTip': '点击后，可将此文档保存为快捷页面==space==（按住 {Alt} 拖拽：快速建立捷径）', // 后缀段显式给 tipH
    'ctx.dupDoc': '新建副本', // 文档节点右键（2026-10-19）：复制正文到 docs/ + 同级插一个节点
    'ctx.dupDocTip': '点击后，会生成该文档的副本', // 黑色小字提示（2026-10-11 用户定文案）
    // ---- 转出思维导图（2026-10-10 用户定；把原来文档节点那项「转出到 vault」合并进来了）----
    'ctx.exportMap': '转出思维导图',
    'ctx.exportMapTip': '点击后，可将此节点树转出仓库==space==（支持拖拽 / 按住 {Alt} 拖拽转出）（{0}）', // 黑色小字提示；浅色段（支持拖拽说明 + 键位）整段进 TipH
    'export.untitled': '未命名',
    // ⛔ 退役（2026-10-10 用户改主意）：母节点转出现在**直接删掉整张导图**，不再保留 + 改名
    'export.doneRootTitle': '已转出',
    'export.doneToast': '已转出',
    'export.doneNotice': '已转出',
    'export.snapName': '转出前',
    'notice.exportMapFail': '转出思维导图失败：',
    // 确认弹窗（树里带"标题以外的东西"时）
    'export.warnTitle': '转出提示',
    // ⚠️ 弹窗正文走的是 setText（不解析 markdown）→ 文案里**不要写 `**加粗**`**，会原样显示出来
    'export.warnBody': '此节点树包含以下附属内容，转出后将会清除。请确认无误后再转出。（转出后，你仍可以在思维导图的历史记录里查看被清除内容）',
    'export.warnOk': '确定转出',
    // 母节点转出（= 整张图都出去，导图本身也会被删）→ 换这一句，把"不可找回、不可撤销"说清
    //（2026-10-10 用户给的原文；普通节点仍用上面那句）
    'export.warnRootBody': '此节点树包含以下附属内容，转出后将会清除。请确认无误后再转出。（转出后，清除的内容不可找回，不可撤销）',
    // 「转出」被拦下时的弹窗 —— **与转入分开**（2026-10-10 用户定：不能共用一个弹窗，
    //   转入讲"搬进数据区"、转出讲"导成文件夹"，标题 / 正文 / 原因都不一样）
    'export.blockedTitle': '无法转出',
    'export.blockedBody': '转出失败。本次没有转出任何内容。请按以下提示更改后再转出：',
    'export.warnNotes': '· {0} 个节点包含备注，转出后会清除',
    'export.warnMedia': '· {0} 个节点包含图片 / 视频，不会同步转出，请提前处理（即使未处理，原件也不会删除）',
    'export.warnTodo': '· {0} 个节点带待办标记，转出后会清除',
    'export.warnRules': '· {0} 个节点带 AI 更改规则，转出后会清除',
    // 体检不过时逐条列出的原因 + 怎么改
    'export.badEmpty': '「{0}」的标题为空',
    'export.badEmptyFix': '请给添加标题',
    'export.badSpace': '「{0}」的标题首/尾有多余的空格',
    'export.badSpaceFix': '请把标题首/尾的空格删除',
    'export.badChar': '「{0}」的标题里有「{1}」',
    'export.badCharFix': '此字符无法作为文件夹名/文件名，请去除或更换成其它字符',
    'export.badFs': '「{0}」的标题里有文件名禁用的字符（\\ / : * ? " < > |）',
    'export.badFsFix': '请将此类字符删除或换成别的字',
    'export.badLong': '「{0}」的标题过长（超过 {1} 个字符）',
    'export.badLongFix': '请将标题改短',
    'export.badDeep': '「{0}」层级过深（超过 {1} 层）',
    'export.badDeepFix': '请分批次转出',
    'export.refDupInTree': '「{0}」在这棵子树里被多个节点管理',
    'export.refDupInTreeFix': '同一份文件只能落一个位置，请先把重复的节点清除',
    'export.refUsedElsewhere': '「{0}」还在被别的节点管理',
    'export.refUsedElsewhereFix': '请右键该节点，清除额外的管理项，再转出',
    'export.missingDoc': '找不到这份文件（可能已经被删 / 移走）：',
    'ctx.bookmarkHint': '不写默认为节点名', // 书签命名弹框输入框里的灰色占位提示
    'ctx.editLink': '编辑链接', // 菜单项：双击编辑链接的菜单版（仅文件/URL 链接显示）
    // 清除项的悬浮说明按当前标记分两版（2026-10-05）：一句话里说清「现在是什么」+「点了会怎样」
    // 复制给 AI 的定位文案（2026-09-20 用户改版）：**单行 + 【】外框**（用户要「一整块粘贴」，所以不分行），
    // 路径 / 节点 ID 用占位符填入。两版：node = 带节点 ID（节点右键 / AI 编辑按钮）；file = 只有路径（文件列表右键）。
    // 语言跟着界面语言（中文界面复制中文、英文界面复制英文）—— AI 读的是文案本身，所以必须跟着走。
    'aiLocate.node': '【1. 找到待编辑文档，路径：{0}；2. 查看文档顶部的 FrontMatter 提示，了解编辑时需严格遵循的格式准则；3. 快照已由插件自动保存，无需再手动备份（跳过 index.md 的「改文件前」流程，不要再跑 snapshot.py）；4. 使用节点 id 定位到要编辑的节点，节点 ID 为：{1}；5. 基于用户指令开始编辑】',
    // 非导图文件专用：它顶部没有 FrontMatter 提示、也没有 index.md 可读，所以只留「定位 + 开始编辑」两步（2026-09-23 用户定）
    'aiLocate.file': '【1. 找到待编辑文档，路径：{0}；2. 基于用户指令开始编辑】',
    // AI 编辑弹窗（点 AI 输入条的发送）用的**拆句版**（2026-09-28）：按「框里写没写指令 / 有没有导入网页链接」
    // 拼第 2、5 条。右键「复制 AI 定位路径」仍用上面那条整句 aiLocate.node，行为不变。
    'aiLocate.nodeHead': '【1. 找到待编辑文档，路径：{0}；2. 查看文档顶部的 FrontMatter 提示，了解编辑时需严格遵循的格式准则{1}；3. 快照已由插件自动保存，无需再手动备份（跳过 index.md 的「改文件前」流程，不要再跑 snapshot.py）；4. 使用节点 id 定位到要编辑的节点，节点 ID 为：{2}；',
    'aiLocate.ruleSuffixImport': '，以及梳理 AI 网页回答的方式', // 拼进第 2 条的 {1}（有导入链接时才加）
    'aiLocate.askDefault': '5. 基于用户指令开始编辑】', // 框里没写东西、也没导入链接
    'aiLocate.ask': '5.用户指令：{0}】', // 框里写了指令
    'aiLocate.askImport': '5.用户指令：梳理 AI 网页回答，网页链接：{0}；具体指令：{1}】', // 有链接 + 框里也写了
    'aiLocate.askImportNoText': '5.用户指令：梳理 AI 网页回答，网页链接：{0}】', // 只有链接
    // 文件列表右键 · 目标是 28Notes 导图时用这版（多一步「先存快照」，脚本路径 = {1}）。
    // 非导图文件仍用上面那版：它没有 frontmatter、读不到 index.md，也不需要快照（脚本认 28notes-id，会直接失败）。
    'aiLocate.fileMm': '【1. 找到待编辑文档，路径：{0}；2. 查看文档顶部的 FrontMatter 提示，了解编辑时需严格遵循的格式准则；3. 快照已由插件自动保存，无需再手动备份（跳过 index.md 的「改文件前」流程，不要再跑 snapshot.py）；4. 基于用户指令开始编辑】',
    // 新建导图时预埋进 frontmatter 的两段 AI 提示（2026-09-20）：**新建/首次注入那一刻按当时的语言写死**，
    // 之后切语言一律不改（存量文件里的文字保持原样 —— 变来变去容易出错，用户定）。
    'fm.ai': '改本文件前先读 28Notes-Files/AI/index.md，严格按其指引操作，否则文件打开可能会出现严重乱码',
    'fm.aiLocate': '定位节点：在文件中搜索 id:<节点ID>（节点 ID 形如 <!--id:xxx-->，写在标题行行尾，不是 Obsidian 的 ^块锚点，不要拼到文件路径后面打开）。',
    'ctx.copyLinkTip': '点击后，可复制粘贴到其它思维导图，快速跳转==space==（{0}）', // 复制节点链接 悬浮说明；键位走 tipH 里的 {0}

    // ============ 折叠层级数字按钮悬停提示（右下角状态栏层级条）============
    'fold.menuKeep': '选中节点 折叠到第 {0} 层级（同时外部保持不变）（点击）', // 折叠数字右键第一项 = 选中后的默认左键行为（{0}=按钮数字；2026-09-13 文案用户定）
    'fold.menuMin': '选中节点 折叠到第 {0} 层级（同时外部折叠到最简）（按住 {Mod} 并点击）', // 折叠数字右键第二项（{0}=按钮数字；{Mod} 按平台=⌘/Ctrl）
    'fold.level': '折叠到第 {0} 层级', // 悬浮提示·未选中节点（{0}=按钮数字；2026-09-11 文案用户定）
    'fold.levelKeep': '选中节点 折叠到第 {0} 层级', // 悬浮提示·选中节点（不按修饰键 = 默认行为；2026-09-13 用户定）
    'fold.levelMin': '选中节点 折叠到第 {0} 层级（同时外部折叠到最简）', // 悬浮提示·选中节点 + 按住 Cmd（2026-09-13 用户定）
    'fold.noMore': '暂不可用', // 悬浮提示·置灰的按钮（选中后超出该节点子树层数 / 「+」里全是置灰项；2026-09-13 用户定，后改「暂不可用」）

    // ============ 定位菜单（点定位按钮/Now 侧边按钮弹出的目标列表）============
    'locate.root': '主节点', // 列表项标签：主节点
    'locate.selected': '选中节点', // 列表项标签：当前选中节点
    'locate.to': '定位到{0}', // 列表项悬停提示（{0}=目标名，如「定位到主节点」）

    // ============ 历史记录（右侧原生面板 + 画布顶部横幅）============
    // 画布顶部历史横幅（2026-09-14 用户定）：整条贯通、浅黄底 —— 刻意不跟主题走，要一眼看出"现在看的是历史版本"
    'banner.setLatest': '将此版本设为最新版本', // 横幅右侧按钮：把这一版做成时间线上最新的一版
    // 常驻说明（横幅下方第一枚小按钮）的四种说法（2026-09-14 用户定稿的文案）：
    //   完全相同 → sameAsNow；只差主节点 → onlyRootDiff；只差节点数 → onlyCountDiff；
    //   主节点变了 + 节点数也不同 → rootAndCountDiff（{0} = addNodes / removeNodes 的整句）。
    // ⚠️ 措辞一律【不能说"下面的内容没有变化"】：比对只按同层位置比节点文字，当前版本"多出来的节点"
    //    比对不到 —— 所以节点数不同时必须把差数说出来（用户 2026-09-14 指出）。
    'hist.sameAsNow': '此版本和最新版本相同',
    'hist.onlyRootDiff': '此版本和最新版本相比，仅主节点不同',
    'hist.addNodes': '新增 {0} 个节点',      // 最新版比这一版多 N 个
    'hist.removeNodes': '减少 {0} 个节点',   // 最新版比这一版少 N 个
    'hist.onlyCountDiff': '最新版在此版本基础上，{0}',              // 内容无差异、只是节点数不同
    'hist.rootAndCountDiff': '最新版在此版本基础上，修改了主节点，并{0}', // 主节点变了 + 节点数也不同
    'hist.tipText': '黄色节点为和最新版本不同的节点', // 常驻第二枚小按钮（固定文案）：画布上黄框的含义
    'hist.aspectTitle': '名字', // 差异项名称：主节点标题（rootChangedAspects 内部用；当前文案不再逐项列出）
    'hist.aspectNote': '备注', // 差异项名称：备注
    'hist.aspectLink': '链接', // 差异项名称：链接
    'hist.aspectImage': '图片', // 差异项名称：图片张数
    'hist.exit': '返回编辑', // 横幅左侧按钮：退出历史只读态、回到编辑
    'hist.copy': '创建副本', // 历史页左上工具条：把快照存成一个新文件
    'hist.promptTitle': '给这个版本起个名字', // 「保存此版本」弹框标题
    'hist.promptHint': '（可空）', // 「保存此版本」弹框输入框占位提示
    'hist.confirmRestore': '用这一版覆盖当前文件？', // 点「还原此版本」后的确认弹窗文字（⚠️ 弹窗标题走纯文本，别放 <br>）
    'hist.empty': '无历史版本。<br>编辑时会自动存档，你也可在右上角「更多」菜单里，点击「保存此版本」手动存档。', // 面板/列表没有历史快照时的占位（<br> = 换行）
    'hist.auto': '自动保存', // 自动快照在时间线里的标签（手动命名的显示你起的名字）
    'hist.justNow': '刚刚 · {0}', // 时间线时间：3 分钟内（{0}=时:分）
    'hist.today': '今天', // 时间线时间：当天
    'hist.yesterday': '昨天', // 时间线时间：昨天
    'hist.dateMD': '{0} 月 {1} 日', // 时间线时间：同年（{0}=月 {1}=日）
    'hist.dateYMD': '{0} 年 {1} 月 {2} 日', // 时间线时间：跨年（{0}=年 {1}=月 {2}=日）
    'hist.rename': '重命名此版本', // 每条记录「⋯」菜单：给这条版本改名
    'hist.lock': '锁定此版本', // 「⋯」菜单：锁住这一版（不参与自动清理）——与点条目上的小锁同一动作；「此版本」跟同菜单的重命名 / 删除保持一致
    'hist.unlock': '取消锁定', // 「⋯」菜单：解锁这一版（重新参与自动清理）
    'hist.delete': '删除此版本', // 每条记录「⋯」菜单：删掉这条版本
    'hist.itemMenu': '更多操作', // 每条记录右侧「⋯」按钮的悬停提示
    'hist.lockedTip': '已锁定（不会被自动精简）', // 条目上的锁（已锁态）悬停提示
    'hist.unlockedTip': '锁定此版本（未锁定版本会被自动精简）', // 条目上的锁（未锁态，平时透明、悬停才出现）悬停提示
    'hist.renameTitle': '重命名这个版本', // 重命名弹框标题
    'hist.renameHint': '（留空 = 记为「自动保存」）', // 重命名弹框输入框占位
    'hist.confirmDelete': '确定删除？删除后此版本会移入系统废纸篓。', // 删除版本确认弹窗
    // ---- 原生「历史记录」右侧面板（2026-09-14）----
    // ---- 文档面板「用思维导图管理文档」（2026-10-08）----
    'doclib.title': '思维导图文档库', // 面板标签名 / tooltip（2026-10-09 用户定：原来叫「用思维导图管理文档」）
    // ---- 合并后的「思维导图」面板（2026-10-18 用户定：历史记录 + 文档库合成一个）----
    'panel.title': '思维导图', // 面板标签名 / tooltip（图标 = 插件 logo）
    'panel.tabProps': '本文档属性', // 分页①：当前文件的属性（2026-10-19 起三组：文档属性 / 文档管理 / 历史记录）
    'panel.grpProps': '文档属性', // 属性页第 1 组（2026-10-19 用户定）
    'panel.grpManage': '文档管理', // 属性页第 2 组：子文档 + 父文档合进来（组内不再分隔线）
    'panel.grpDerived': '派生的捷径文档', // 文档管理第 3 组（2026-10-19）：谁指向这份文件
    'panel.noDerived': '暂无捷径指向这份文件',
    'panel.propSrc': '源文件：', // 「源文件：」这一行（只有捷径页面才出现，2026-10-19 用户定文案）
    'panel.propSrcGone': '源文件已被删除', // 捷径指向的文件已经不在了
    'panel.propLinks': '链接：', // 「链接：双链｜本地路径」这一行
    'panel.propLink': '双链：', // 行标签；点后面的值 = 复制带路径的双链
    'panel.propPath': '本地路径：', // （旧行标签，2026-10-19 起改用下面这行）
    'panel.propPathRow': '路径：', // 属性页第 2 行（库内相对路径；悬浮出两颗复制按钮）
    'panel.pathHidden': '隐藏文件夹内',
    'panel.pathHiddenShort': '隐藏', // 派生捷径行里：数据区路径未悬浮时写「隐藏/文件名」 // 路径在数据区里时，未悬浮只写这句，悬浮才露出真路径
    'panel.copyLinkTip': '复制双链',
    'panel.copyPathTip': '复制本地路径',
    'panel.reload': '刷新', // 面板标题行那颗刷新按钮（2026-10-19）
    'panel.copy': '复制',
    'toast.pathCopied': '已复制路径',
    'toast.docDuped': '已生成副本',
    'panel.tabLib': '思维导图文档库',
    // ---- 搜索分页（2026-10-21）----
    'panel.tabSearch': '搜索', // 分页③：搜「当前思维导图」或「所有思维导图」的节点标题与备注
    'search.ph': '搜索节点标题或备注 …',
    'search.scopeView': '当前思维导图',
    'search.scopeAll': '所有思维导图',
    'search.searching': '搜索中 …',
    'search.empty': '未找到。',
    'search.more': '还有 {0} 条。',
    'search.notMap': '仅支持在思维导图内搜索。（如未正确识别，请点击右上方刷新按钮刷新此面板）',
    'search.hint': '',
    'search.clear': '清空搜索',
    'search.gone': '此节点已不存在（可能已被删除或改名）',
    'search.gotoFail': '打不开那张导图（文件可能被移动或删掉了）',
    'panel.grpDocs': '管理的子文档', // 属性页第 1 组（2026-10-19 用户定：永远显示，不再"非导图就消失"）
    'panel.grpParents': '管理本文档的父文档', // 属性页第 2 组：谁在管着当前这份文件
    'panel.noParents': '暂无思维导图在管理本文档。', // 第 2 组空态
    'panel.noDocsNotMap': '当前文档不是思维导图，没有被管理的子文档。', // 2026-10-19：组 1 在普通文档下的占位
    'panel.grpHist': '历史记录', // 属性页第 3 组（上面「保存规则」小组 + 下面平铺列表）
    'panel.grpNormal': '正常文档', // 文档库页第 2 组（2026-10-19 用户定：给"按思维导图查看"套的外框，点开才显示）
    // 2026-10-19 用户定：孤儿组空态的两行说明（`\n` 会被 `_mkNote` 转成 <br>）。
    //   第二行解释"什么是孤儿文档"，免得用户看到「暂无孤儿文件。」一头雾水。
    'doclib.noOrphan': '暂无孤儿文档。\n\n孤儿文档指：已导入思维导图文档库，但未被任何思维导图管理的文档。',
    'doclib.noManaged': '暂无被管理的文档。', // 「正常文档」组空态（2026-10-19）
    // 顶部三个分页改成**图标**（2026-10-09 用户定，照 Obsidian 大纲面板那种小图标条）：
    //   📌 图钉（=「设为当前关注」那只）= 被当前思维导图管理的文档；
    //   面板自己那只图标 = 已转入思维导图的所有文档；？ = 了解如何用思维导图管理文档。
    // 图标塞不下文字 → 分页名挪到下面当**小标题**（secCur / secAll），同时也是图标按钮的 tooltip。
    'doclib.secCur': '被当前思维导图管理的文档', // 分页①（图钉）的小标题 + tooltip
    'doclib.secAll': '已转入思维导图的所有文档', // 分页②（面板图标）的小标题 + tooltip
    'doclib.tabHelp': '管理教程', // 分页③（问号）的小标题 + tooltip
    // 分页④（警告三角，2026-10-09 用户定）：列出**当前选中节点那份文档**被哪些导图管理，一处一行
    'doclib.secManage': '被多处管理的问题文档', // 分页④（警告三角）的名字 / tooltip（2026-10-09 用户定）
    'doclib.blkMaps': '管理此文档的思维导图', // ⚠️ 2026-10-09 起**不再使用**（用户要求把展开后那行小字标题去掉）
    'doclib.clearFilter': '清除筛选', // 第 3 页顶部的「清除筛选 ✕」（从「管理该文档」跳进来时才出现）
    'doclib.noMultiDoc': '暂无一个文档被多处管理。', // 第 3 页空态（2026-10-09 用户定）
    'doclib.blkDoc': '文档', // ⚠️ 2026-10-09 起**不再使用**（第 3 页改成"每份文档可折叠"，没有这一栏标题了）
    'doclib.manageNoSel': '请先在思维导图里选中一个文档节点',
    'doclib.manageNone': '这份文档目前没有被任何思维导图管理', // 没选中 / 选中的不是文档节点时的空态
    'doclib.whyMultiRef': '为什么不建议一个文档被多处管理 ↗', // 分页④ 最下面那行小字（点开在线文档）
    'doclib.mgrOccurrence': '第 {0} 处', // 同一张导图里引用多处时，折叠里面那几行（{0}=第几处）
    // 「取消某一处管理」（分页④ 每行右边那颗 ✕）：只去掉**这一处**引用，文件不动
    'doclib.unmanageTitle': '取消这一处管理？',
    'doclib.unmanageBody': '此操作只影响这一个节点，其它管理此文档的节点不受影响。此操作不可撤销。', // 用户 2026-10-09 改成不带占位符的短句
    'doclib.unmanageOk': '取消这一处',
    'doclib.unmanagedPlaceholder': '「已取消管理：{0}」', // 取消一处管理时写进导图里的**纯文字**（会落进文件）
    'toast.docUnmanaged': '已取消一处管理：{0}',
    'notice.unmanageFail': '取消管理失败：',
    // ⚠️ 「查看方式」那三个键（`doclib.viewMode` / `viewFlat` / `viewByMap`）2026-10-09 随
    //   「按文档查看」那一套**整体删掉**了（用户定：两个查看方式合并成一个，只留按思维导图查看）。
    // 这一行**最右边**那颗按钮的两态提示（2026-10-09 用户定：照 Obsidian 官方「大纲」面板那颗按钮，
    //   文案也照它那两条 ——「全部折叠」/「全部展开」）。图标：chevrons-down-up / chevrons-up-down
    'doclib.collapseAll': '全部折叠',
    'doclib.expandAll': '全部展开',
    // 分页②「按文档查看」的三块（2026-10-09 用户定，**每块可折叠**；组名已说明是什么，行里不再写小字）
    'doclib.grpOrphan': '暂未被管理的孤儿文档', // 第一块：没有任何导图引用它（「按思维导图查看」的孤儿组也用它，2026-10-19 用户定）
    'doclib.grpMulti': '被多处管理的文档', // 第二块：被 2 个及以上节点管理
    'doclib.grpSingle': '被单处管理的文档', // 第三块：只被 1 个节点管理
    'doclib.toggle': '展开 / 收起',
    // 「定位到该节点」（2026-10-09 用户定）：面板条目「⋯」里 / 树形二级行悬浮那颗按钮。
    // 效果 = 打开（或激活）那张导图 + 把引用这份文件的节点**选中并挪到画面中央**。
    'doclib.locate': '定位到该节点',
    'doclib.warnJump': '此文档正在被多处管理，建议减少为一处（点击管理）', // 2026-10-09 实验：被多处管理的文档行那颗警告按钮（点了切到第 4 个分页）
    'doclib.locateN': '定位到第 {0} 处', // 同一张图里引用多次时，一项一处
    // ⚠️ 下面两条 2026-10-09 起**不再使用**（用户要求把「了解孤儿文档」那个按钮删掉 ——
    //   组名「暂未被管理的孤儿文件」已经说得很清楚）。键先留着，万一要放回来。
    'doclib.helpToggle': '了解孤儿文档',
    'doclib.helpText': '孤儿文档指已导入思维导图数据库，但未被任何思维导图管理的文档。',
    'doclib.noMap': '请先打开一个思维导图。（如未正常显示，请点击思维导图空白处，插件会自动刷新此列表）', // 分页① 的空态（另一栏照常列）
    'doclib.empty': '当前思维导图未管理任何文档。',
    'doclib.copyLink': '复制链接', // 条目右侧那颗按钮
    'doclib.delete': '删除', // 条目「更多」菜单里那一项（2026-10-08）
    'doclib.confirmDeleteTitle': '删除此文档？', // 二次确认弹窗标题（入口 = 面板「更多 → 删除」）
    'doclib.confirmDeleteNodeTitle': '同时删除该节点管理的文档？', // 二次确认弹窗标题（入口 = 画布上文档节点右键，2026-10-08 用户定）
    'doclib.confirmDeleteNodesTitle': '同时删除这些节点管理的文件？', // 同上，但**多选**（画布上选了不止一个被管理的节点，2026-10-09）
    // 面板入口用这两条（用户 2026-10-08 定：**面板保持原来那套提示**，别加"去哪儿看"那句）
    'doclib.confirmDeleteRefs': '此文档正在被 {2} 张思维导图管理。删除后，此文档将会进入 Obsidian 废纸篓。\n此操作不可撤销，请谨慎操作。', // {0}=文档名 {1}=引用次数 {2}=导图张数
    'doclib.confirmDeleteOrphan': '此文档没有被任何思维导图管理。删除后将会进入 Obsidian 废纸篓。\n此操作不可撤销，请谨慎操作。',
    // 画布节点入口用这两条（多一句"去哪儿看" —— 用户 2026-10-08 定）
    'doclib.confirmDeleteNodeRefs': '此文档正在被 {2} 张思维导图管理，可在视图右上角「更多」→「查看被管理的文档」里查看。\n删除后，此文档将会进入 Obsidian 废纸篓。此操作不可撤销，请谨慎操作。',
    'doclib.confirmDeleteNodeOrphan': '此文档没有被任何思维导图管理。\n删除后将会进入 Obsidian 废纸篓。此操作不可撤销，请谨慎操作。',
    // 画布上**选中一个文档节点直接按删除键**时的询问（2026-10-08 用户定）：三个出口 —— 取消 / 只删节点 / 连文档一起删
    // 这份文档**只有当前这一个节点**在管（2026-10-08 用户定的两版文案）
    'docNode.askOnly': '此节点管理着「{0}」文档。是否同时删除该文档？',
    // 这份文档**还被别的节点**管着 —— 多一句"去哪儿看"，并给出管它的**节点数**
    'docNode.askShared': '此节点管理着「{0}」文档。此文档还被 {1} 个节点管理（可在视图右上角「更多」→「查看被管理的文档」里查看），是否同时删除该文档？', // {0}=文档名 {1}=管它的节点数
    // **多选**里含被管理的文件时（2026-10-09 用户定）：一次只弹一个窗，说清有几个、其中几处还被别的节点管
    'docNode.askMulti': '正在删除的节点里有 {0} 个被管理的文件，其中 {1} 处还被别的节点管理（可在视图右上角「更多」→「查看被管理的文档」里查看），是否同时删除这些文件？', // {0}=选中的文件数 {1}=别处的引用数
    // 多选、但**一处都没被别的地方管**时用这条（2026-10-09 用户实报：写「其中 0 处还被别的节点管理」很奇怪）
    'docNode.askMultiOnly': '正在删除的节点里有 {0} 个被管理的文件，是否同时删除这些文件？', // {0}=选中的文件数
    'docNode.onlyNode': '只删节点', // 第二个按钮
    'docNode.nodeAndDoc': '删除节点和文档', // 第三个按钮（危险动作，走 mod-warning）
    'docNode.nodesAndDocs': '删除节点和文件', // 同上，但**多选**（可能既有文档又有附件，2026-10-09）
    // 删文档时写进导图里替换掉那串链接的**纯文字**（会落进文件）。外面这对「」是用户 2026-10-08 点名要的
    // —— 有了它才能和节点里的普通文字一眼分开。（节点里**只有**这个链接时不写这句，直接整行删掉）
    'doclib.deletedPlaceholder': '「已删除：{0}」',
    'doclib.learnMore': '了解如何用思维导图管理文档 ↗', // 分页下面那行小字：点开在线文档（2026-10-08 用户定）
    'mm.doclib': '查看被管理的文档', // 系统标题栏「更多」菜单里那一项（排在历史记录上面；左下那颗按钮已撤）
    // ---- 「转入思维导图」新建的那张导图：文件名 + 根节点 + 说明链接（2026-10-08 用户定，照他手写的参考文件）----
    // ⚠️ 文件名里不能出现半角冒号（Obsidian 全平台禁 `:`，create 会直接抛错）
    // ⛔ 以下三条**已退役**（2026-10-10 用户定改版：导图文件名 = 被转入的文档名 / 文件夹名，
    //   根节点就是文档本身 / 文件夹名，那两行「已转入…→」+ 说明链接被用户称为"一堆废话"、已撤）。
    //   键**留着**（不删，防老存档 / 外部引用报错），但代码里一个字都不许再引用。
    'import.mapPrefix': '已转入 →', // ⛔ 退役（曾是新导图的文件名）
    'import.rootTitle': '已转入，请剪切并粘贴至适当位置 →', // ⛔ 退役（曾是根节点文字）
    'import.helpLink': '了解如何用思维导图管理文档', // ⛔ 退役（曾是根节点下那行说明链接）
    // ---- 「重命名该导入文件」（2026-10-08 方案 §4.7）----
    'doclib.renameTitle': '重命名该导入文件',
    'doclib.renameHint': '输入新的文件名（不用带扩展名）',
    // 新建子文档（2026-10-09 用户定）：「＋添加 → 子文档」/ 命令「其它｜新增子文档」都走这个输入框。
    //   建出来的文件真放进数据区 docs/，节点写成 `[[28Notes-Files/docs/名字]]`（带路径，防同名歧义）。
    // ⚠️ 这两个键**已退役**（2026-10-12 用户定：子文档不再弹输入框，直接用默认名「未命名」建 + 开右侧分屏）。
    //    留着不引用 —— 以后若要「建完再改名」那种入口，文案还在这儿。
    'doclib.newChildDocTitle': '请输入文档名',
    'doclib.newChildDocPh': '不能包含特殊符号，例如 \\ / : * ? " < > # ^ 等',
    // 「选择导入的文档」弹窗（2026-10-09 用户定）：正文那两行是他原话，别改口径
    'doclib.pickDocTitle': '选择要转入的文档',
    'doclib.pickDocBody': '转入后，文档会从左侧文件列表，转入本思维导图管理。\n\n提示：如果你只是想链接文档，请关闭本窗口，并使用双链功能。',
    'doclib.pickDocPh': '请输入文档名',
    // 「选择要转入的仓库文件夹」弹窗（2026-10-12 用户定）：**搜索式**，与「转入仓库文档」同一套原生建议面板
    //   —— 敲文件夹名实时筛选，从候选里挑一个（候选 = 本库所有文件夹，显示 vault 相对路径）。
    //   ⚠️ 2026-10-12 用户定：**不做"粘绝对路径"那条老路**（有新路就不要老路）。
    'doclib.pickFolderTitle': '选择要转入的仓库文件夹',
    'doclib.pickFolderBody': '转入后，文件夹会从左侧文件列表，转入本思维导图管理。\n\n提示：为避免循环转入带来的混乱，如果当前思维导图在某个文件夹内，则不可转入该文件夹。',
    'doclib.pickFolderPh': '请输入文件夹名',
    'doclib.pickFolderOk': '确认转入',
    // 选中的候选翻不成文件夹时的原因（走 reportImportBlocked 那个「无法转入」弹窗）
    'folderBad.notFound': '没找到这个文件夹。请在下方输入框里搜文件夹名，从弹出的候选里挑一个再确认。',
    'folderBad.inData': '这个文件夹已经在思维导图数据库里了。',
    'notice.importRepoFail': '导入文档失败：',
    'toast.childDocCreated': '已新建子文档：{0}',
    'notice.newChildDocFail': '新建子文档失败：',
    'notice.docNameBad': '这个名字不能用作文档名（不能带 \\ / : * ? " < > | 与 # | ^ [ ]）：',
    'toast.docRenamed': '已重命名：{0}',
    'notice.renameTaken': '该名字已被占用：',
    'notice.renameFail': '重命名失败：',
    'notice.renameBadName': '名字里不能包含 \\ / : * ? " < > | 这些字符，也不能带 # | ^ [ ]',
    // ---- 文件夹批量转入（2026-10-08 方案 §4.3）----
    'toast.folderImported': '已转入文件夹：{0}',
    // 本批发生过重名顺延 → 完成提示后面补这句（2026-10-10 用户定）
    'toast.renamedNote': '（包含重名内容，已重命名）',
    'notice.importFolderFail': '转入文件夹失败：',
    'notice.importFolderSkipped': '有 {0} 个文件的名字写不出链接（带 # | ^ [ ] 等），已跳过、留在原处',
    // ---- 转入被拦下的告知弹窗（2026-10-10 用户定：不合格就一个都不搬，但要讲清哪个、为什么、怎么改）----
    'doclib.blockedTitle': '无法转入',
    // 「挂到当前导图的选中节点」用不了时的纯告知弹窗（2026-10-12 用户定：没有导图 / 没选中节点都走这个）
    'doclib.needTargetTitle': '请选中节点后再次尝试',
    'doclib.needTargetBody': '你需要打开思维导图，并选中节点后才可使用此功能。',
    // ⛔ 退役（2026-10-12 用户定）：正文不再说"当前问题为：{0}"（他判断不准、也没必要）→
    //   `doclib.needTargetNoMap` / `doclib.needTargetNoSel` 两个键**已删**，别再加回来。
    // 「不许转入到自己内部」（2026-10-12 用户定）：被右键的文件就是当前打开的那张导图 → 两种模式都不许。
    'doclib.selfImportTitle': '不可循环转入',
    'doclib.selfImportBody': '为避免混乱，不支持将思维导图转入它的内部节点。\n\n请切换新的思维导图，再尝试转入。',
    // ---- 「了解转入功能」介绍弹窗（2026-10-20 用户定）----
    //   入口两处：① 文件列表右键「转入思维导图」二级菜单最后一项；
    //             ② 「转入仓库文档 / 转入仓库文件夹」两个弹窗左下角那颗按钮。
    //   纯介绍，不搬任何文件。正文允许 HTML（<b> 加粗 / <br> 换行），渲染走 innerHTML（内容是自家常量，无注入风险）。
    //   ⚠️ 修饰键一律写 {Alt} 占位（T() 按平台换成 ⌥ / Alt），值里写死 Option 会被 test.mjs 拦下。
    'importHelp.title': '★ 了解转入功能',
    'importHelp.detailBtn': '★ 详细了解转入功能', // 两个转入弹窗左下角那颗按钮（照「从本机转入」那颗的样式）
    'importHelp.intro1': '从左侧文档列表，<b>直接拖拽</b>文档 / 文件夹到思维导图里，就能快速用思维导图管理你的文档。',
    'importHelp.intro2': '你也可以从思维导图，将节点树直接拖拽到左侧文档列表，快速转出。',
    'importHelp.tipsTitle': 'Tips：',
    'importHelp.tip1': '按住 {Alt} 拖拽，可以在不影响原结构的基础上，快速建立捷径，用完即删，更便捷。',
    // ⚠️ 文档库入口在画布**左下角**那颗按钮（不是右上下拉菜单 —— 2026-10-20 核实过代码）
    // ⚠️ 2026-10-20 用户定：入口写「右上方下拉菜单」—— 文档库按钮待挪到画布右上（现在还在左下角）。
    //    挪完之前这条文案与实物不一致，挪的时候一起验。
    'importHelp.tip2': '在思维导图右上方下拉菜单中，选择「思维导图文档库」，即可查看和管理所有转入的文档。',
    'importHelp.learnMore': '详细了解如何用思维导图管理文档 ↗', // 跳 DOCLIB_GUIDE_URL（与文档面板底部那条同一个链接）
    'importHelp.foldTitle': '我使用了社区插件，导致拖拽失效怎么办？', // 折叠标题，默认收起
    'importHelp.foldLead1': '拖拽转入 / 转出只支持 Obsidian 默认文件列表。',
    'importHelp.foldLead2': '如果你使用社区插件托管了文件列表，则推荐下列方式转入 / 转出。',
    'importHelp.inTitle': '一：转入',
    'importHelp.in1': '在左侧文档列表，选中文件 / 文件夹后右键，点击「转入思维导图」。',
    'importHelp.in1a': '点击「新思维导图」：会新建思维导图，并转入文档。',
    'importHelp.in1b': '点击「旧思维导图的选中节点」：会转入到打开思维导图的选中节点。使用此功能需要打开思维导图并选中节点。',
    'importHelp.in2': '在思维导图内选中节点，点击底部「添加 - 更多添加项」，选择「转入仓库文档 / 转入仓库文件夹」，按提示转入即可。',
    'importHelp.outTitle': '二：转出',
    'importHelp.out1': '在思维导图内选中节点，右键选择「转出思维导图」即可。',
    // ---- 右侧分屏那颗「更多」（2026-10-20 用户定）----
    //   入口：画布右边缘「关闭分屏」图标，鼠标悬浮时它**下面**冒出「更多」（图标 = 画布左下那颗三点）；
    //   点开一个小弹窗：一行「点击文档节点时，自动隐藏侧边栏」+ 右侧开关。
    //   开关原先是调试区的一项（`settings.hideLeftOnDoc`），2026-10-20 转正：从调试区删掉、搬到这里，
    //   并且从"只收左侧"扩成"左右都收"。
    'splitMore.title': '分屏设置',
    'splitMore.tip': '分屏设置', // 那颗「更多」三个点的黑色小字提示（2026-10-20 用户定：原来写「更多」，改成这个）
    'splitMore.hideSidebars': '点击文档节点时，自动隐藏侧边栏',
    'splitMore.hideSidebarsDesc': '打开后，点击文档节点打开分屏时，左右侧边栏会自动收起；关掉分屏时恢复成原来的样子。',
    // 正文开头：{0} = 被拦下的文件数；后面接「路径 + 原因 + 怎么改」的清单，**全部列出**（不截断），
    // 条与条之间空一行；条数多时靠弹窗正文区自己滚（`max-height: 55vh; overflow-y: auto`）。
    'doclib.blockedBody': '有 {0} 个文件名包含错误，整体取消转入。请按以下提示修复后再尝试转入：',
    // 文件夹转入时的第二行：告诉用户这批文件属于哪个文件夹
    'doclib.blockedWhere': '所在文件夹：{0}',
    'doclib.blockUnknown': '（未指明文件）',
    // 五种拦下原因（{0} = 出问题的那个字符 / 字段）
    'doclib.blockEmptyName': '文件名为空',
    'doclib.blockEmptyNameFix': '请给它起个名字',
    'doclib.blockChar': '此文件名里含有「{0}」字符',
    'doclib.blockCharFix': '该字符在 Obsidian 双链语法 [[链接]] 里有语法含义，会造成冲突。请删除该字符，或换成别的字符。',
    // 首尾带空格：链接文字会被 trim 掉，指不到这个文件（用户 2026-10-10 实报 `优化版 .md`）
    'doclib.blockSpace': '此文件名首尾有多余的空格',
    'doclib.blockSpaceFix': '双链 [[名字]] 里首尾的空格会被忽略，链接就指不到这个文件了（点节点会提示「找不到笔记」）。请把文件名首尾的空格删掉。',
    // 没有扩展名的文件：Obsidian 解析 [[链接]] 时**会自动补上 .md 再去找文件**，所以它永远链接不上
    //（2026-10-10 用户实报「点了提示找不到笔记」，扒 obsidian.asar 的 getLinkpathDest 源码确认，不是推断）
    'doclib.blockNoExt': '此文件没有扩展名',
    'doclib.blockNoExtFix': 'Obsidian 解析 [[链接]] 时会自动补上 .md 再去找文件，没有扩展名的文件永远点不开。请给它加一个扩展名（纯文本笔记加 .md 即可）。',
    'hist.panelTitle': '思维导图历史记录', // 面板标签名 / tooltip / 面板顶部标题
    'hist.rules': '保存规则', // 面板顶部右侧小按钮：点开/收起下面的规则说明
    // 点「保存规则」展开的说明（走 innerHTML：文案里可能带 <br>，用 text 会把标签当字面量显示出来）
    'hist.rulesText': '编辑时会高频保留历史版本，后续会自动精简冗余版本（精简至每周 1-7 份）；手动存储 / 重命名 / 锁定的版本不会被自动精简。',
    'hist.noMap': '请先打开一个思维导图。（如未正常显示，请点击思维导图空白处，插件会自动刷新此列表）', // 面板空态：没有可跟随的导图（非 28 Notes 文件时列表直接清空，不显示文案）
    // （2026-10-18：「打开历史记录面板」「打开文档面板」两条命令已删 → 文案键一并撤掉）
    'notice.panelFail': '打开右侧历史面板失败', // 右侧栏取不到 leaf 时的提示

    // ============ 图片预览 / 图片缺失 ============
    'img.prev': '上一张（左键/←）', // 大图预览左翻页按钮悬停提示
    'img.next': '下一张（右键/→）', // 大图预览右翻页按钮悬停提示
    'img.missing': '图片缺失', // 图片加载失败时占位方块里的文字（去掉方括号：占位是正方形小色块，4 字正好折成 2 行）
    'img.missingTitle': '图片已丢失', // 双击缺失图片弹出的说明框标题
    'img.missingHint': '这张图在库里找不到了。把它放回库里后，重启 Obsidian 就会恢复显示。', // 说明框正文（撤掉「重新查找」按钮后：直接告诉他怎么救，而不是给个没人会用的重试入口）

    // ============ 通用弹窗按钮 ============
    'btn.cancel': '取消', // 弹窗取消按钮（命名框/确认框）
    'btn.okay': '好的', // 弹窗的单一确认按钮（纯说明框，点一下关掉）
    'btn.ok': '确定' // 弹窗确定按钮
  },
  en: {
    // 英文翻译（2026-08-30 按中文文案统一翻译；改英文只动这个区块）。
    // 英文风格约定：短标签（菜单/按钮/提示/toast/设置名/命令名）统一 Title Case —— 每词首字母大写，
    // 冠词·介词·连词（to/the/as/and/or…）小写，首词永远大写，|、`、`( `、换行后的首词也大写，连字符两端都大写；
    // {n} 占位符与缩写（Obsidian/AI/Now/Pro…）原样保留。长描述段落（多句/<br>/超长句）保持句首大写即可。
    // 专有功能词 Now/Minor/Todo/Done/Pro 始终大写；注意 now 也是时间副词（如 "now in {1}"），段落里不做 blanket 大写。
    'common.untitled': 'Untitled',
    'common.node': 'Node',
    'common.newNode': 'New Node',
    'common.more': 'More',
    'common.undo': 'Undo',
    'common.mindmap': 'Mind Map',
    'common.cancel': 'Cancel',
    'common.ok': 'OK',
    'common.vaultRoot': 'the vault root', // Fallback destination for "move out" (used when the export folder cannot be created)

    'frame.nowSide': 'Show Now Nodes Only',
    'frame.mdPlaceholder': '- Top-Level Node\n  - Child Node',
    'mm.undo': 'Undo',
    'mm.redo': 'Redo',
    'mm.pathBack': 'Previous Path',
    'mm.pathFwd': 'Next Path',
    'mm.pathDefault': 'Back to Default Path',
    'mm.pathSave': 'Set Current as Default Path',
    // Tip for the home button in the top bar's path trio (2026-10-06; the back/forward pair reuses mm.pathBack / mm.pathFwd)
    'tip.pathHome': 'Path Settings',
    'pro.needActivate': 'Activate to use this feature',
    'footer.tutorial': 'Tutorial',
    'footer.joinGroup': 'Join Group',
    'footer.releases': 'Release Notes',
    'footer.bug': 'Bug Report',
    'footer.version': 'Version',
    'toast.featureSoon': 'Coming soon',
    'tip.alreadyDefault': 'Already the Default Path',
    'tip.toggleSidebar': 'Show File List',   // 2026-10-10: shortened to mirror 「显示文件列表」
    'more.splitRight': 'Split Right',
    'more.showInFolder': 'Reveal in Finder',
    'more.revealInFiles': 'Reveal in File List',
    'more.openSource': 'Open Source File',
    'more.viewAsMarkdown': 'View as Markdown',
    'more.copyAiLocate': 'Edit with External Agent',
    'more.saveVersion': 'Save Version',
    'mm.history': 'History',
    'mm.saveVersion': 'Save Version',
    'mm.guide': 'User Guide ↗',
    'mm.joinGroup': 'Join WeChat Group ↗',
    // ---- "More" menu item tooltips (2026-10-20: every item now has one) ----
    //   xxxTipH = light suffix segment (explicit since 2026-10-20, wired via data-tip-h; the old
    //   "guess it from parentheses" rendering is gone).
    'mm.undoTip': 'Click to Undo==space==({Mod} + Z)',
    'mm.redoTip': 'Click to Redo==space==({Mod} + Shift + Z)',
    'mm.docProps': "This File's Properties",
    'mm.docPropsTip': "Click to View This File's Properties",
    'mm.docLib': 'Mind Map Document Library',
    'mm.docLibTip': 'Click to Open the Mind Map Document Library',
    'mm.search': 'Search',
    'mm.searchTip': 'Click to Search Nodes==space==({Mod} + F)',
    'mm.historyTip': 'Click to View Version History',
    'mm.saveVersionTip': 'Click to Save This Version',
    'mm.joinGroupTip': 'Click to Join the 28 Notes WeChat Group==space==(Hide This Button in Settings)',
    'mm.guideTip': 'Click to Open the User Guide==space==(Hide This Button in Settings)',
    'mm.saveShortcut': 'Save View as Shortcut',
    'aiEdit.desc': 'Copy the locator below and paste it into any AI agent (e.g. Claude Code, WorkBuddy) — it will open the document and jump straight to the node. While editing, the AI will automatically follow this plugin\'s built-in format guide, so you only need to describe what you want.<br> <br> We know this workflow is not ideal. Connecting an AI API key to edit directly inside the map is coming.',
    'aiEdit.copy': 'Copy & Close',
    'mm.hotkeys': 'Hotkeys',
    'mm.settings': 'Settings & Bug Report',

    'display.mindmap': 'Mind Map',
    'notice.bookmarkInvalid': 'Invalid Shortcut (Missing Target): ',
    'notice.bookmarkMissing': 'The Mind Map This Shortcut Points to Does Not Exist: ',
    'notice.bookmarkReadFail': 'Failed to Read the Shortcut Target: ',
    'notice.writeFailNoFile': 'Failed to Save: View Is Not Bound to a File',
    'notice.writeFail': 'Failed to Save the Mind Map: ',
    'notice.copyFail': 'Copy Failed: ',
    'notice.openUrlFail': 'Failed to Open Link: ',
    'notice.openSettingsFail': 'Failed to Open Settings: ',
    'notice.updateBookmarkFail': 'Failed to Update Shortcut: ',
    'notice.createBookmarkFail': 'Failed to Create Shortcut: View Is Not Bound to a Data File',
    'notice.createBookmarkFail2': 'Failed to Create Shortcut: ',
    'notice.restoreFail': 'Failed to Restore This Version: ',
    'notice.newMapFail': 'Failed to Create the Mind Map: ',
    'notice.shortcutBudget': 'Folder Too Large: Only the First {1} Document Shortcuts Were Created — {0} Files Were Skipped',
    'notice.dataAreaGuard': '“{0}” Lives in the Mind Map Data Folder and Cannot Be Moved Out — It Has Been Put Back',
    'notice.fileMissing': 'The File This Link Points to Does Not Exist: ',
    'notice.openFileFail': 'Failed to Open File: ',
    'notice.noteMissing': 'Note Not Found: ',
    'notice.importDocFail': 'Move failed: ', // 「转入思维导图」失败（错误跟在后面，2026-10-08）
                                             // 🔤 2026-10-12 用户定：英文那个动词统一 "Import" → "Move"
                                             //    —— 见下方 menu.importToMap 那条的理由（与「转出 = Move Out」成对）
    // Nothing was added — the import to a selected node was undone (2026-10-12)
    'notice.importRolledBack': 'Nothing was added — the move was undone. The file is back at: {0}',
    // Undo was clicked after its window closed (2026-10-17)
    'notice.undoExpired': 'That undo has expired',
    // Hint above the node while a file is dragged in from the file explorer (2026-10-17).
    // Only shown while the pointer is over a node; over empty canvas there is no hint at all.
    'extDrop.dropHere': 'Release to import into this node',
    // Dragging the mind map itself onto one of its own nodes (2026-10-17)
    'extDrop.selfHere': 'A Mind Map Cannot Be Imported Into Itself',
    'extDrop.shortcutHere': 'Release to Create a Shortcut in This Node',
    'extDrop.dragToNode': 'Drop Onto a Node to Move It In (Release to Cancel)',
    'extDrop.dragToNodeCopy': 'Drop Onto a Node to Create a Shortcut (Release to Cancel)',
    // Dropping a canvas node outside the canvas = move it out to the vault
    'extDrop.dropOut': 'Release to move out to the vault',
    // Hold ⌘ and drag out: mirror the subtree outside — documents become shortcut shells, the rest folders
    'extDrop.shortcutOut': 'Release to Create a Shortcut in the Vault', // 2026-10-18: ⌘ → ⌥ (macOS reserves ⌘ for system drags)
    'notice.moveOutDocFail': 'Move out failed: ', // "Move out to vault" failed (error follows, 2026-10-08)
    'notice.openNoteFail': 'Failed to Open Note: ',
    'notice.fsDocUnsupported': 'This document does not support the mind map fullscreen focus mode. Exited fullscreen.',
    'notice.copyFailSnap': 'Failed to Create a Copy: ',
    'notice.githubUnset': 'GitHub Link Is Not Configured yet',
    'cmd.newMap': 'New Mind Map (28 Notes)',
    'cmd.boldNode': 'Text | Bold Node',
    'cmd.redNode': 'Node | Mark Selected Node Red',
    'cmd.yellowNode': 'Node | Mark Selected Node Yellow',
    'cmd.nowNode': 'Node | (Un)Set Selected Node as Now',
    'cmd.minorNode': 'Node | (Un)Set Selected Node as Minor',
    // Two to-do commands (2026-09-20): a plain node lands on Todo / Done respectively, then both cycle.
    // Only one to-do command now (2026-09-20): pure toggle, same as the toolbar button.
    'cmd.todoNode': 'Node | (Un)Set as To-Do',
    'cmd.todoDoneNode': 'Node | (Un)Set as Done',
    'cmd.copyNodeLink': 'Other | Copy Node Link',
    'cmd.addChildDoc': 'New | Add Child Document', // 2026-10-12: moved from "Other |" to "New |" (no default hotkey — user binds it)
    'cmd.copyAILocate': 'AI | Copy AI Locate Path',
    'cmd.saveShortcut': 'View | Save as Shortcut',
    'cmd.aiMark': 'AI | Add AI-Generated Mark',
    'cmd.aiRules': 'AI | Add AI Rules',
    'cmd.editNote': 'Text | Node Note',
    'cmd.toggleShowNow': 'View | Show Only Now Nodes',
    'cmd.toggleHideMinor': 'View | Show/Hide Minor Nodes',
    'cmd.drillInto': 'View | Enter Current Node',
    'cmd.locateCycle': 'Locate | Locate Cycle',
    'cmd.searchPanel': 'Locate | Search Nodes',
    'cmd.toggleSourceView': 'Toggle | Source / Mind-Map View',
    'cmd.addSiblingAbove': 'New | Add Sibling Above',
    'cmd.addParentSibling': 'New | Add Sibling One Level up',
    'cmd.editStart': 'Cursor | Move Caret to Node Start',
    'cmd.editEnd': 'Cursor | Move Caret to Node End',
    'cmd.centerNode': 'Locate | Center Selected Node (Works while Editing)',
    'cmd.centerRoot': 'Locate | Center Root Node',
    'cmd.openAsMarkdown': 'View in Obsidian Editor',
    'cmd.openAsMindmap': 'View in 28 Notes Mind Map Editor',
    'newMap.name': 'Mind Map', // [deprecated] naming is hardcoded as "Mind Map N" now (2026-09-18)
    'copy.suffix': ' Copy',
    'snap.beforeRestore': 'Before Restore · ',
    'snap.restoredTo': 'Restored to · ',
    'snap.beforeAiEdit': 'AI backup before edit', // Snapshot auto-saved when the user clicks "AI locate node" / "AI edit" (2026-09-27)
                                                  // ⚠️ Must match snapshot.py's DEFAULT_NAME['en'] exactly (the external AI script uses the same name)
    'badge.bookmark': '↗',
    'badge.mindmap': 'Mind Map',
    'menu.newMindmap': 'New Mind Map',
    'menu.newDocShortcut': 'New Document Shortcut', // File list right-click on a file → creates a doclink shell next to that file (2026-10-19)
    'menu.newDocShortcutHint': 'Leave Empty to Use the Document Name',
    // 🔤 2026-10-12 用户定：英文动词 "Import" → **"Move"**（同一家族全部跟着改，见下方 more.importRepoDoc）。
    //    理由：这个动作本质就是**把文件搬进** 28Notes-Files/docs/，不是"导入一份副本"；
    //    而且反向那条早就是 "Move Out of Mind Map"（ctx.moveOutDoc）—— 改完英文正好**成对**（Move into / Move out）。
    'menu.importToMap': 'Move into Mind Map', // File list right-click → move the file into 28Notes-Files/docs/ and create a map (2026-10-08; only when the document-management switch is on)
    // The item above is a **two-level submenu** now (2026-10-12): New mind map / Add to the selected node in the current map.
    'menu.importToMapNew': 'New Mind Map',
    'menu.importToMapNode': 'Selected Node in Open Mind Map',
    'menu.importHelp': '★ About Moving Documents In',
    'menu.viewDocProps': 'View Document Properties',
    // Removed (2026-10-20): menu.viewDocPropsSrc — clashed with "View Markdown Source File" below it.
    'menu.more28': 'More 28 Notes Options',
    'menu.copyAiLocate': 'Edit with External Agent',
    'fold.moreLevels': 'More Levels',

    'settings.uiHeading': 'Interface',
    'settings.groupSettings': 'Settings',
    'settings.language': 'Interface Language',
    'settings.langAuto': 'Follow Obsidian (default)', // 2026-10-18: the default tag is now just "(default)" (matches the Chinese side)
    'settings.langZh': '中文',
    'settings.langEn': 'English',
    'settings.theme': 'Interface Style',
    'settings.themeFeishu': 'Blue Lines',
    'settings.themeFeishuGray': 'Gray Lines',
    // Canvas light/dark + background (2026-09-20): opened from the palette button left of "Interface style"
    'palette.tip': 'Advanced Styling',
    'palette.title': 'Advanced Styling',
    'palette.bgLight': 'Custom Background｜Light Mode',
    'palette.bgDark': 'Custom Background｜Dark Mode',
    'palette.resetTip': 'Restore Default ({0})',
    'settings.themeFeishuPink': 'Pink Lines',
    // 2026-09-17: media split into images/video/audio → cleanup now covers all three; wording "images" → "attachments"
    'cleanup.heading': 'Clean up Unused Attachments',
    'cleanup.desc': 'To support undo after deletion, attachments (images / videos / etc.) are not deleted when you delete a node that holds them.<br> Unused attachments can therefore pile up — a scan every six months is recommended.',
    'cleanup.scanBtn': 'Start Scan',
    'cleanup.scanning': 'Scanning…',
    'cleanup.none': 'No Unused Attachments Found ✓',
    'cleanup.found': 'Found {0} Unreferenced Attachments, {1} Total',
    'cleanup.note': 'Tip: move them to the Desktop, then upload to your cloud drive in case you need them later.',
    'cleanup.deleteBtn': 'Delete',
    'cleanup.moveBtn': 'Move to Desktop',
    'cleanup.movedOk': 'Moved {0} Attachments to Desktop: {1}',
    'cleanup.deletedOk': 'Deleted {0} Attachments (Recoverable from the System Trash)',
    'cleanup.partialFail': '{0} Succeeded, {1} Failed: {2}',
    'notice.dataAreaGone': '⚠️ You just deleted the 28 Notes data folder (images / history / AI contract): {0} — now in {1}; if unintentional, put it back under 28Notes-Files/ now',
    'notice.trashLocal': "the Obsidian trash (the .trash folder in your vault)",
    'notice.trashSystem': 'The System Trash',
    'notice.trashNone': '⚠️ Your Settings Use Permanent Deletion — No Copy Was Kept',
    'notice.dataLostTitle': 'Warning! You Just Deleted the 28 Notes Mind Map Hidden Files!',
    'notice.dataLostBody': '28 Notes Mind Map hides its source files (history records and more) to keep them from being deleted by accident. In rare cases — for example when using plugins such as Flexplorer or Notebook Navigator — they can still be caught in a bulk delete.\n\nWe detected that this just happened. Please open the system trash and find the folder "{0}". The system may have appended a string of digits to its name — for example, "{0} 23-46-58-575"; if so, remove that trailing number first. Then move the folder back to:\n{1}',
    'btn.dismiss': 'OK',
    'notice.dataGuardBlocked': 'Blocked an Accidental Deletion of the 28 Notes Mind Map Hidden Files. To Delete Attachments, Clean Them up Manually in "Settings - Advanced".',
    'notice.aiDocsRestored': 'Rebuilt AI Contract File: {0}',
    'tb.fullscreen': 'Full-Screen Focus ({Mod} and Click for Window-Only)', // 2026-10-01: plain click = desktop full-screen, {Mod}+click = window-only; {fsHk} = the command hotkey (**without** brackets — the brackets live in the string), dropped entirely (brackets included) when unbound; 2026-10-21: fixed this note, it used to say "with brackets"
    'tb.fullscreenExit': 'Exit Full-Screen Focus (Esc)', // 2026-10-01: shared by both full-screen kinds (click and {Mod}+click both exit)
    'cmd.fullscreenWindow': 'View | Full-Screen Focus (Window Only)', // 2026-10-01: renamed (was "Window Fullscreen")
    'cmd.fullscreenDesktop': 'View | Full-Screen Focus', // 2026-10-01: renamed (was "Desktop Fullscreen")
    'settings.badgeStyle': 'File Type Badge',
    'settings.badgeStyleDesc': 'It refers to the type badge on the right of the file name in the file list. This design avoids confusion between file types.',
    'settings.badgeStyleText': '28 Notes Text',
    'settings.badgeStyleIcon': '28 Notes Icon',
    'settings.hideHint': 'New-Page Hint',
    'settings.hideHintDesc': 'After creating a new mind-map, a beginner hint appears below the root node. You can choose to hide it. ',
    // (The "To-Do Button Placement" and "View Filter" settings and all their labels were removed 2026-10-18 —
    //  both are fixed now: the To-Do button always sits at the bottom, the filter always uses the expanded form.)
    'settings.aiMarkPalette': 'Swatches',
    'aiColor.orange': 'Orange', 'aiColor.yellow': 'Yellow', 'aiColor.green': 'Green', 'aiColor.blue': 'Blue',
    'aiColor.cyan': 'Cyan', 'aiColor.lightblue': 'Light Blue', 'aiColor.waterblue': 'Water Blue',
    'aiColor.purple': 'Purple', 'aiColor.magenta': 'Magenta', 'aiColor.pink': 'Pink',
    'aiColor.brown': 'Brown', 'aiColor.gray': 'Gray', // Gray = the muted gray used for Minor nodes; hard-coded as of 2026-10-05
    'settings.uiSimplify': 'Interface Simplification', // Native sub-page under "Interface" (2026-09-18)
    'settings.advanced': 'Advanced', // Native sub-page under "More" (2026-09-18)
    'settings.motion': 'Motion', // Under "Advanced" (2026-09-20): node shift transition, on by default
    'settings.motionDesc': 'If Interaction Feels Laggy, Turn Motion off to Reduce Performance Cost.',
    'settings.motionSysOff': 'Animations Are Turned off by Your System. Enable Them in System Settings to Use Motion.', // Shown (with the toggle greyed out) when the system prefers-reduced-motion is on (2026-10-10)
    // ---- Two group headings inside "Advanced" (2026-10-08: "Basics" on top, "Experimental Features" below) ----
    'settings.advancedBasic': 'Basics',
    'settings.advancedExp': 'Experimental Features',
    'settings.expWarn': 'During the experimental period, features may change frequently or even be removed. Please do not rely on them too heavily.',
    'settings.aiFeatures': 'AI Features', // Under "Experimental Features" (2026-10-08): master switch for AI entries, OFF by default
    'settings.aiFeaturesDesc': 'When on, AI edit buttons appear in the interface.',
    'settings.docsLibrary': 'Manage Documents with Mind Maps', // Under "Experimental Features" (2026-10-08): collect vault files into mind maps, OFF by default
    'settings.docsLibraryDesc': 'When on, you can move existing documents into a mind map to manage them, and embed documents inside a mind map.',
    // Kept from 2026-09-28 (superseded by the pair above); left in place so stale refs do not break
    'settings.aiEditBtn': 'AI Edit Button',
    'settings.aiEditBtnDesc': 'Turn this on to show an AI Edit button at the bottom-left of the view. Experimental feature, off by default.',
    // ---- Two group headings inside "Interface simplification" (2026-09-21: no more sub-page) ----
    'settings.general': 'General',
    'settings.morePanelSimplify': 'Button Simplification', // renamed 2026-09-24 (was '"More" Panel Simplification')
    'settings.morePanelNote': 'To Keep the Basics Working, Some Buttons Cannot Be Turned off.', // spare note (not shown since 2026-09-21)
    'settings.addPanelSimplify': '"Add" Panel Simplification', // DEPRECATED (page removed 2026-09-21); key kept to avoid stale refs
    'settings.addPanelSimplifyDesc': 'Items Inside the "Add" (+) Button on a Selected Node\'s Bottom Toolbar.',
    'settings.sepRow': 'Divider',
    'settings.presetRow': 'About',
    'settings.presetRowDesc': 'When Everything Is off, the "Add" Button Hides as Well.',
    'settings.presetDefault': 'Restore Defaults',
    'settings.presetAllOn': 'Turn Everything on',
    'settings.presetAllOff': 'Turn Everything off',
    'settings.subEntryRow': 'Add Other Content',
    'settings.subEntryRowDesc': '▶︎ Buttons Below This Entry Fold into the Sub-Menu.',
    'settings.addPanelEmpty': '(No Items to Show)',
    'settings.hintShow': 'Show Hint',
    'settings.hintHide': 'Hide Hint',
    'settings.tutorial': 'Tutorial',
    'settings.tutorialBtn': 'View Tutorial',
    'settings.footnote': 'More',
    'settings.qrMissing': '(QR Code Image Not Found)',
    'settings.sponsor': 'Tip Developer',
    'settings.sponsorBtn': 'Tip',
    'settings.sponsorThanks': 'Thank You!',
    'settings.bug': 'Bugs & Feature Requests',
    'settings.bugMd': 'Add the creator on WeChat: Hi28Notes. Or join the group chat →',
    // ---- Settings page bottom "Make Something Wonderful" link (added 2026-09-27) ----
    // Small gray line at the bottom of the settings page; click opens a system Modal with Steve Jobs's 2007 quote.
    // Quote stays in English (do not translate direct quotations); zh / en content are identical.
    'settings.appreciationLink': 'Make Something Wonderful With ♥︎',
    'settings.appreciationTitle': 'Make Something Wonderful',
    'settings.appreciationQuoteMd': 'There’s lots of ways to be, as a person. And some people express their deep appreciation in different ways. But one of the ways that I believe people express their appreciation to the rest of humanity is to make something wonderful and put it out there.<br><br>And you never meet the people. You never shake their hands. You never hear their story or tell yours. But somehow, in the act of making something with a great deal of care and love, something’s transmitted there. And it’s a way of expressing to the rest of our species our deep appreciation. So we need to be true to who we are and remember what’s really important to us.',
    'settings.appreciationSignature': '—Steve, 2007',

    // ---- License / paid activation (added 2026-09-02) ----
    'license.heading': 'License',
    'license.active': 'Activated',
    'license.inactive': 'Not Activated',
    'license.buyMd': 'Pay via Alipay, then email the payment screenshot to ShinContactEM@Gmail.com to receive an activation code (one code covers up to 3 devices).',
    'license.trialActive': 'Trial Active',
    'license.trialRemainingFmt': '{0} days left in your trial. Activate to keep full features after it ends.',
    'license.trialExpired': 'Trial Ended',
    'license.trialDaysDebug': 'Trial Days (Debug)',
    'license.trialDaysDebugDesc': 'Only visible on the author machine. Set a small value to quickly test trial expiry. Note: the auto trial is always 14 days (hardcoded, unaffected by this setting); this only changes the local check threshold.',
    'license.resetTrialBtn': 'Reset to 14 Days',
    'license.okReset': 'Reset to 14 Days',
    // ---- Pro features modal (2026-09-02) ----
    'pro.heading': 'Pro Features',
    'pro.shortDesc': 'See All Pro Features and How to Buy',
    'pro.viewBtn': 'View Pro Features',
    'pro.ctaBtn': 'Activate Pro',
    'pro.barActivate': 'Activate Pro',
    'pro.barDays': 'Activate Pro ({0} days)',
    'pro.barExpired': 'Activate Pro (Trial ended)',
    'pro.desc': 'These Features Require Pro Activation',
    'pro.empty': '(No Pro Features yet)',
    'license.inputPh': 'Paste Your Activation Code (Starts with 28N)',
    'license.activateBtn': 'Activate',
    'license.deactivateBtn': 'Deactivate',
    'license.lidLabel': 'License ID',
    'license.devicesLabel': 'Device Limit',
    'license.atLabel': 'Activated at',
    'license.receiptLabel': 'Activation Receipt',
    'license.receiptHintMd': 'When moving to a new device or adding one, send this receipt to the developer to register it. Not required for normal use.',
    'license.copyBtn': 'Copy',
    'license.okActivated': 'Activated. Thank you for the support!',
    'license.okDeactivated': 'Deactivated',
    // ---- License section (2026-09-04 merged into a single row) ----
    'license.ctaTitle': 'Activate 28 Notes Pro',
    'license.ctaDescTrialMd': 'Your trial has {0} days left. Some Pro features will be limited once it ends.',
    'license.ctaDescExpiredMd': 'Your trial has ended. Activate 28 Notes Pro to use all features.',
    'license.howToActivateBtn': 'How to Activate ↗',
    'license.activeTitle': '28 Notes Pro Activated',
    'license.activeDescMd': 'License ID: {0}; Device limit: {1}; Activated: {2}\n\nBefore switching devices, click "Unbind" on the right, then activate on the new device.',
    'license.unbindBtn': 'Unbind',
    // ---- Debug options (2026-10-18: behind the bug icon on the Experimental Features heading) ----
    'debug.heading': 'Debug',
    // Removed (2026-10-20): debug.hideLeftOnDoc — promoted to a real setting, see splitMore.hideSidebars.
    'debug.fsBtnPos': 'Full-Screen Button Position', // Debug option (2026-10-18): which side of the title bar the full-screen button sits on
    'debug.fsBtnPosDesc': '', // 2026-10-18: no description — the two option labels say it all
    'debug.fsRight': 'Right (default)',
    'debug.fsLeft': 'Left',
    // Removed (2026-10-20): debug.hideLeftOnDocDesc
    // ⚠️ 2026-10-18: the default option is tagged "(default)" — the longer "(user default)" tag is retired.
    // Removed (2026-10-20): debug.leftKeep / debug.leftHide — that dropdown was deleted with
    // hideLeftOnDocControl; the feature is now a toggle in the canvas "More → Split Options" modal.
    'debug.aiPlusMenu': 'AI "+" Menu', // Debug option (2026-10-18): whether the "+" in the AI input bar opens its menu (feature not shipped)
    // Both are toggles (2026-10-18): two-state settings must not use a two-option dropdown — its selected
    // label would change with the value, i.e. one setting showing two different texts. Default goes in the desc.
    'debug.aiPlusMenuDesc': 'Off by default. When on, the + button on the left of the AI editing bar becomes clickable.',
    'debug.log': 'Logs', // Debug option (2026-10-18): master switch for ALL diagnostic logs — feature-agnostic
    'debug.logDesc': 'Off by default. When on, diagnostic logs appear in the console to help track down bugs. Regular users should keep it off.',
    'license.okCopied': 'Receipt Copied',
    'license.proRequired': 'This is a Pro feature. Activate to use it.',
    'license.err.unknown': 'Activation failed. Please check the code.',
    'license.err.empty': 'Please Enter an Activation Code',
    'license.err.format': 'Malformed code. Make sure you copied the whole thing.',
    'license.err.signature': 'Invalid Activation Code',
    'license.err.product': 'This Code Is Not for 28 Notes',
    'license.err.expired': 'This Activation Code Has Expired',
    'license.err.revoked': 'This activation code has been disabled. Please contact the developer.',
    'license.err.payload': 'Corrupted code. Please copy it again.',
    'license.err.lockedFmt': 'Too many attempts. Try again in {0} minutes.',

    // ============ Empty-map usage hint (shown under root node after creating a blank mind map) ============
    'hint.line1': 'Select a Node + Tab to Add',
    'hint.line2': 'Select a Child Node + Enter to Add a Sibling Node',
    'hint.line3': 'Space + Drag to Pan',
    // When the root node itself IS a document node (a map created by "import"): different copy, and the
    // "New-Page Hint" setting does not apply (this is the only explanation of how to use that map).
    // Phrasing follows the old "Imported — cut and paste it wherever you like →" line. Back to "cut"
    // (2026-10-11): the root node can really be cut now (the whole tree goes with it, and the map
    // becomes empty); copying would leave the same document managed from multiple maps and trigger
    // the "managed in multiple places" warning — cutting is the right way. The second line is no
    // longer needed (after the cut the map is empty and shows a "New root node" button — no need to
    // teach deleting the map).
    'hint.docLine1': 'Select the node, then cut and paste it where you want it.',
    'emptyRoot.btn': 'New root node', // button shown in the middle of an empty map (no root line yet, 2026-10-11)
    'emptyRoot.placeholder': 'Enter node name', // placeholder pre-filled after clicking the button (selected, so typing replaces it)
    'tb.closeSplits': 'Close Split Panes==space==({Mod} and Click for Split Settings)', // icon on the canvas right edge (2026-10-11): closes the doc split panes on the right; 2026-10-20: {Mod}+click opens the split settings modal; suffix goes to tipH
    'cut.drillRootOut': 'Cut — the view moved up one level', // shown after cutting the root of a drilled-in view

    'tip.todoIconTodo': 'Mark as Done', // to-do node prefix icon (2026-09-20; the {Mod} hint was removed 2026-10-06)
    'tip.todoIconDone': 'Done: Click the Icon to Mark as To-Do',
    'tip.todoIconProgress': 'Child Progress: {0}%', // merged mode: parent is a to-do + has to-do children ({0} = children-only percentage, 2026-09-24)
    // Hovering the whole document / attachment NODE (2026-10-09): attached to the card, not the little icon.
    // {Mod} is turned into ⌘ / Ctrl by T() → modStr (the "no hard-coded Mac keys in i18n" rule).
    // 2026-10-10 (behaviour reversed): plain click opens in a split on the right; hold {Mod} for a new tab.
    // The parenthesised part is auto-dimmed by `NM_HINT_PAREN_RE` (do not add markup here).
    'tip.openDocNode': 'Click to open in a split on the right==space==(hold {Mod} to open in a new tab)',
    'tip.openFileNode': 'Click to open this file in a split on the right==space==(hold {Mod} to open in a new tab)',
    // Hover tip for a multi-managed document node (2026-10-09): yellow style + this wording.
    // The parenthetical becomes the lighter nm-tip-h segment automatically.
    'tip.multiRefDoc': 'This document is managed in more than one place; keeping it in one is recommended==space==(right-click to manage)',
    'tip.icoClearNow': 'Clear Now Mark',
    'tip.icoClearMinor': 'Clear Minor Mark',
    'tip.icoClearAi': 'Clear the AI-Generated Mark',
    'tip.icoClearAiMix': 'Clear the AI-Generated Mark==space==(with Human Content)',
    'tip.aiRemarkNa': 'Click to Clear the AI-Generated Mark on This Note==space==(No Note on This Node Yet — Currently Unavailable)',
    'tip.unfold': 'Click to Unfold',
    'tip.fold': 'Click to Fold',
    'tip.editNote': 'Note (Double-Click to Edit)',
    'tip.image': 'Click to Select · Double-Click to Zoom · Right-Click to Copy',
    'tip.imgResize': 'Drag to Resize (Saved to File)',
    'tip.imgMissing': 'Image Missing · Double-Click to Retry',
    'tip.editLinkSuffix': '\NDouble-Click to Edit the Link',
    'tip.jump': 'Click to Jump',
    'tip.openNote': 'Click to Open the Note: {0}',
    'tip.locateNode': ' (Locate Node {0})',
    'tip.openFile': 'Click to Open the File: {0}',
    'tip.openUrl': 'Click to Open in the Browser: {0}',

    'tb.foldSel': 'Fold Nearby Nodes ({Mod} + F)',
    'tb.foldNoSel': 'Fold Nearby Nodes (Select a Node First) ({Mod} + F)',
    'tb.foldDefault': 'Fold/Unfold Nearby Nodes (Select a Node First) ({Mod}+F)',
    'tb.drill': 'Enter the Current Node',
    'tb.drillDefault': 'Enter the Current Node (Select a Node First)',
    'tb.drillAtRoot': 'Already at the Main Node',
    'tb.selectFirst': 'Select a Node First',
    'tb.noMinor': 'Hide Minor and Done Nodes==space==(Active When This View Has M/D Nodes)', // 中文同步（2026-09-22）：说的是「这个按钮干什么」而不是「为什么灰」；后缀段显式给 tipH
    'tb.showMinor': 'Show Minor and Done Nodes==space==({0})',
    'tb.hideMinor': 'Hide Minor and Done Nodes==space==({0})',
    'tb.nowReadonly': 'This Button Is Unavailable on the History Page',
    'tb.noNow': 'Show Now Nodes Only==space==(Active When This View Has a Now Node)', // 中文同步（2026-09-22）；后缀段显式给 tipH
    'tb.nowShowAll': 'Stop Showing Now Nodes Only==space==({0})',
    'tb.nowOnly': 'Show Now Nodes Only==space==({0})',
    'tb.undo': 'Undo ({Mod}+Z)',
    'tb.redo': 'Redo ({Mod}+Shift+Z)',
    'tb.locate': 'Locate the Central Node==space==({0})', // hotkey lives in tipH's {0} (dropped with its parens when unbound)
    'now.none': 'No Now Node', // 定位子菜单：中间那段为空时的占位（2026-09-28）
    'now.noSel': 'No Node Selected', // 定位子菜单：最后那段为空时的占位
    'tb.minorToggle': 'Hide/Show Minor Nodes',
    // (tb.viewFilter* keys removed with the three-mode mechanism: 2026-10-18)
    'tb.aiEdit': 'AI Edit', // bottom-left AI button (the Hold-Mod hint was removed 2026-10-05)
    'tb.doclib': 'Mind Map Document Library', // tooltip of the bottom-left documents button (back 2026-10-10, renamed)
    'tb.joinGroupBtn': 'Join the group chat==space==(hide this button in Settings)', // bottom-left group button (2026-10-10); suffix goes to tipH
    'tb.guideBtn': 'Open the user guide==space==(hide this button in Settings)', // bottom-left guide button (2026-10-10)
    'aiBar.send': 'Send', // AI 输入条（2026-09-28）：关闭叉与加号不挂提示，只有发送挂
    'aiBar.placeholder': 'What do you want AI to do?',
    'aiBar.hintView': 'Edit Current View',
    'aiBar.hintOne': 'Edit Selected Node',
    'aiBar.hintMultiUnsupported': 'Multiple Nodes Not Supported — Editing the Current View Instead',
    'aiBar.import': 'Import AI Web Answer',
    'aiBar.importTitle': 'Import AI Web Answer',
    'aiBar.importHint': 'Paste the share link(s) of the AI answer below — the AI Agent will read them and organize the content into mind map format. (Separate multiple links with a semicolon.)',
    'aiBar.importPh': 'Share link: the link generated when sharing an AI answer',
    'aiBar.importChip': 'Imported AI Answer Link, {0}',
    // (fm.nowFocus / fm.hideMinor removed with the #fm-* submenu: 2026-10-18)

    'nm.bold': 'Bold==space==({0})', // hotkey lives in tipH's {0} (2026-10-20: light segments go whole, parens included, into TipH)
    'nm.red': 'Mark Red==space==({0})',
    'nm.yellow': 'Mark Yellow==space==({0})',
    'nm.note': 'Note',
    'nm.now': 'Mark as Now==space==({0})',
    'nm.minor': 'Mark as Minor==space==({0})',
    'nm.add': 'Add', // 底部工具条最右「＋」按钮的悬浮提示（2026-09-28）
    // Bottom toolbar "AI" button + its horizontal submenu (2026-10-05, four items)
    'nm.ai': 'AI',
    'nm.aiEdit': 'AI Edit',
    'nm.aiEditTip': 'Click to Let AI Edit It Quickly',
    'nm.aiMark': 'Add AI Mark',
    'nm.aiMarkOn': 'Clear AI Mark',
    'nm.aiMarkTip': 'Click to Mark This Node as AI-Generated==space==({0})',
    'nm.aiMarkTipAi': 'Click to Clear the AI-Generated Mark==space==({0})',
    'nm.aiMarkTipMix': 'Click to Clear the AI-Generated Mark==space==(with Human Content) ({0})',
    'nm.aiRemarkTip': 'Click to Mark This Node\'s Note as AI-Generated',
    'nm.aiRemarkTipOn': 'Click to Clear the AI-Generated Mark on This Note',
    'nm.aiRemarkTipMix': 'Click to Clear the AI-Generated Mark on This Note (with Human Content)==space==(with Human Content)',
    'nm.aiLocate': 'Edit with External Agent', // submenu item: same as the old right-click item
    'nm.aiLocateTip': 'Click to Copy the Path — an External AI Agent Can Then Locate and Edit This Node==space==({0})', // hotkey lives in tipH's {0}
    'nm.aiRules': 'Add AI Editing Rules',
    'tip.aiRulesHint': 'Click to Add Rules the AI Agent Will Follow When Editing This File',
    'tip.editAiRules': 'AI Editing Rules (Double-Click to Edit)',
    // The little eye at the right of the "AI Editing Rules" row (2026-10-06): toggles show/hide globally.
    // Hiding = not rendered at all (like hiding Minor nodes). The tip says what a click WILL do.
    'tip.aiRulesEyeOn': 'Click to Hide AI Editing Rules in the Canvas for a Cleaner View', // currently shown -> clicking hides
    'tip.aiRulesEyeOff': 'Click to Show AI Editing Rules', // currently hidden -> clicking shows
    // Grayed out (this view has no rules at all; grayed = not clickable, 2026-10-06).
    // Same sentence shape as the other two; the parenthetical says why it is gray (renders in the dimmer segment).
    'tip.aiRulesEyeNone': 'Click to Hide AI Editing Rules in the Canvas for a Cleaner View==space==(No Such Rules in This View)',
    // To-do button (2026-09-20): the tip swaps with the selected node's state; {0}/{1} = dynamic key segments
    'nm.todoPlainTip': 'Click to Mark as Todo==space==({0}) (Hold {Mod}: Mark Done)',
    'nm.todoOffTip': 'Clear the Todo Mark==space==({0})', // 2026-09-23: "plain node" renamed to "non-Todo node" (user's wording)
    'addPanel.btnStyle': 'Format Button',
    'addPanel.btnNote': 'Note Button',
    'addPanel.btnTodo': 'To-Do Button (Todo)',
    'addPanel.btnTodoDone': 'Done Button',
    'addPanel.btnNow': 'Now Button',
    'addPanel.btnMinor': 'Minor Button',
    'addPanel.btnMore': 'Add Button',
    'settings.primarySepRow': 'Primary Actions Divider',
    'settings.primarySepRowDesc': 'Buttons above this line appear in the primary toolbar above the node (max 8). This line cannot be turned off — drag it up or down only.',
    // Bottom bar "More" menu (2026-09-17): hover panel with add-entries.
    // Note: this button intentionally has NO tooltip (it would overlap the panel), so 'nm.more' was removed.
    'more.addChild': 'Child Node',
    'more.addChildTip': 'Click to Add a Child Node==space==({0})',
    'more.addSibling': 'Sibling Node',
    'more.addSiblingTip': 'Click to Add a Sibling Node==space==({0})',
    'more.delNode': 'Delete Node',
    'more.delNodeTip': 'Shortcut: Delete',
    'more.addOther': 'More Options',
    'more.aiEdit': 'AI Edit',
    'more.aiEditTip': 'Click to Copy the AI Locator Info',
    'more.customPanel': 'Customize Panel',
    'more.customPanelTip': 'Choose Which Buttons to Hide',
    'more.addNoteTip': 'Click to Add a Note==space==({0})', // note row in the Add panel (2026-10-06; the hotkey comes from tipAct)
    'more.moreAdd': 'More Items',
    'more.addImage': 'Image',
    'more.addImageTip': 'Click to Add an Image==space==(Paste Directly)', // suffix goes to tipH
    'more.addVideo': 'Video',
    'more.addVideoTip': 'Click to Add a Video',
    'more.addAudio': 'Audio',
    'more.addAudioTip': 'Click to Add an Audio',
    'more.addVaultAttach': 'Vault Attachment',
    'more.addVaultAttachTip': 'Click to Reference Images / Videos Already in Your Vault==space==(Paste Directly)',
    'more.addVaultAttachHint': 'When you paste an image / video into a normal note, Obsidian saves the file into its default attachment folder. Paste its file name (e.g. xxx.png) or path here and the mind map will find and render it. (This only creates a reference — the file is not copied.)',
    'more.addFileLink': 'Local File Link',
    'more.addFileLinkTip': 'Click to Add a Local File Link==space==(Paste Directly)',
    'more.addFileLinkHint': 'Enter a file path, e.g. /Users/…/file.pdf. (You can also select a node while not editing and paste the path directly.)',
    'more.addWiki': 'Wiki Link',
    'more.addWikiTip': 'Click to Add a Wiki Link That Jumps to Another Page==space==([[ )', // trailing "[[ )" = half-width paren + space, intentional (matches zh); suffix goes to tipH
    'more.addNodeLink': 'Linked Node',
    'more.addNodeLinkTip': 'Click to Add a Linked Node That Jumps to It==space==(Paste Directly)',
    'more.addNodeLinkHint': 'Select the target node in the other mind map, right-click "Copy node link", then paste it here. Works across mind maps; you can also select a node and paste directly.',
    // Child document (2026-10-09): sits right below "Linked Node" — creates a NEW document under the
    // selected node (the file really lands in 28Notes-Files/docs/, the node points at it).
    // The key segment comes from tipAct (shown only when the user has bound a hotkey).
    'more.importRepoDoc': 'Move Vault Document Here',
    'more.importRepoDocTip': 'Click to Move a Document in from the File List==space==(Dragging Also Works)',
    // Move a vault folder in (2026-10-12): sits right below "Move a Vault Document Here"; the modal asks
    // for the folder's **absolute path** (Obsidian has no native folder picker).
    'more.importRepoFolder': 'Move Vault Folder Here',
    'more.importRepoFolderTip': 'Click to Move a Folder in from the File List==space==(Dragging Also Works)',
    'more.addChildDoc': 'Child Document',
    'more.addChildDocTip': 'Click to Add a Child Document==space==({0})',
    // Input placeholder presets (2026-09-20): these used to be hard-coded Chinese and leaked into the English UI
    'more.addFileLinkPh': '/Users/…/File.Pdf',
    'more.pickLocal': 'Choose from Mac',
    'more.pickLocalPrompt': 'Choose a File or Folder to Link',
    'notice.pickPathFail': 'Could not get the full path of that file (not supported on this platform — paste the path manually).',
    'more.addNodeLinkPh': '[[File Name#Node ID]]',
    'settings.joinGroupBtn': 'Join Group Chat',
    // Copy for the Pro / payment modals (a few lines on 2026-09-20; the full body on 2026-09-27).
    // Layout (order and spacing) lives in PRO_PAGES in main.js — this file holds the words only.
    // Price, email, WeChat ID and the share link are business values and live in PRO_PLAN (main.js), not here.
    'pm.scrollHint': 'Scroll Down to See More',
    'pay.shareBtn': 'Share for Free',
    'pm.shareLink': '(Share to Get Free Membership)', // small link next to ¥38 in the Pro modal (2026-09-24); opens the same share page
    'pay.emailCopied': 'Email Copied',
    'pay.emailCopyFail': 'Copy Failed — Please Copy It Manually',
    'pm.priceLead': 'Early Bird Price',
    'pm.trialLeft': 'Your trial has {0} days left. Some creative features will be locked after it ends.', // {0} = days left
    'pm.trialEnded': 'Your trial has ended. Activate Pro to unlock all features.',
    'pm.secFreeH': '🌱 What the Free Version Gives You',
    'pm.secFreeMarket': '<span class="pm-blue">Most features</span> found in mind map tools, all without limits.',
    'pm.secFreeDim': 'Unlimited mind maps, images, notes, Obsidian links, local file links, node links and more.',
    'pm.secProH': '🪴 What Pro Adds',
    'pm.secProMarket': '<span class="pm-blue">The original creative features of 28 Notes</span>, which need activation after the trial.',
    'pm.secProDim': 'Now, Minor, shortcuts, AI path locating, multi-level folding and more.',
    'pm.capBefore': 'Before: Large and Messy',
    'pm.capAfter': 'After Now and Minor: Clear and Focused',
    'pm.thanks': 'Your support keeps this product growing. Thank you!',
    'pm.note': 'One-time purchase. The code never expires and works on up to three devices. (Online generative AI features are not included.)',
    'pay.h1': 'Pay {0} by WeChat QR Code', // {0} = price (PRO_PLAN.priceNowText)
    'pay.emailLead': 'Send a screenshot of the payment to:',
    'pay.step1': '1. The screenshot must show the transfer number (sample below)',
    'pay.step2': '2. The license code arrives within about 24h',
    'pay.alt1': 'If email is inconvenient, add the developer on WeChat: {0}', // {0} = WeChat ID
    'pay.h3': 'Activate',
    'pay.path': 'Obsidian → Settings → Community Plugins → 28 Notes',
    'pay.alt3': 'Activation trouble? Email us, or reach the developer on WeChat: {0}',
    'pay.thanks': '=) Thank you for your support!',
    'more.addUrlLink': 'Web Page',
    'more.addUrlLinkTip': 'Click to Add a Web Link==space==(Paste Directly)', // suffix goes to tipH
    'more.urlText': 'Display Text',
    'more.urlAddr': 'URL',
    'more.addUrlLinkHint': 'Top: the display text. Bottom: the URL (starting with www. / https://). If the display text is left empty, the URL is shown instead.',
    'more.pickFail': 'Import Failed: Could Not Read the Selected File',
    'more.pickPrompt': 'Choose File(s) to Import',

    'toast.hiddenMinor': 'Minor Node Hidden',
    'toast.hiddenNow': 'Now Node Hidden',
    'toast.nowFilterOff': 'No Now Nodes Left in This View, so This View Filter Has Been Turned Off', // 2026-10-01: last Now marked as Minor while "Hide Minor" is on
    'toast.hiddenAlsoDeleted': 'Note: {0} Hidden Minor Child Nodes Were Deleted as Well',
    'toast.pasteLink': 'Select a Node before Pasting a Link',
    'toast.pasteFileLink': 'Select a Node before Pasting a File Link',
    'toast.pasteImg': 'Select a Node before Pasting an Image',
    'toast.pasteFirst': 'Select a Node before Pasting',
    'toast.pasteEmpty': 'Nothing to Paste in the Clipboard', // empty clipboard (2026-09-23: split off from the "select a node" message)
    'toast.imgSavedNoNode': 'Image Saved, but the Target Node No Longer Exists',
    'toast.showNowEmpty': 'No Now Nodes in the Current View — "Focus on Now" Not Enabled',
    'toast.imgSaveFail': 'Failed to Save the Image',
    'toast.bookmarkRelocated': 'The Shortcut Node Has Been Deleted or Renamed — Relocated to the Central Node',
    'toast.restored': 'Restored to this version (it is saved as a new version; the content before the restore is kept too)',
    'toast.copyCreated': 'Copy Created: {0}',
    'toast.copyShellFail': 'Failed to Create the Document Shortcut — This Copy Was Not Created',
    'toast.copied': 'Copied',
    'toast.copiedPlain': 'Copied Without Formatting',
    'toast.cut': 'Cut',
    'toast.histSnapGone': 'The version you were viewing could not be found (it may have been deleted). Open history and pick a version again.',
    'toast.restoreFinishFail': 'This version is already restored in the file, but the canvas failed to refresh — reopen this map to see it',
    'toast.jumpFail': 'Link Target Not Found (It May Have Been Deleted)',
    'toast.histReadonly': 'The History Page Is Read-Only — Exit It before Saving the Current Version',
    'toast.histNoEdit': 'The history view is read-only; content cannot be edited here',
    'toast.versionSaved': 'Current Version Saved',
    'toast.versionDeleted': 'Version Deleted',
    'toast.versionRenamed': 'Version Renamed',
    'toast.aiLocateCopied': 'Document path copied — paste it into an external AI agent to edit',
    'toast.docImported': 'Moved In', // Move-in success ({0} = document name, 2026-10-08)
    'toast.docImportedToNode': 'Moved In', // Move into a specific node ({0} = node title, {1} = doc name, 2026-10-12)
    'toast.docMovedOut': 'Moved Out', // Move-out success ({0} = document name, {1} = destination folder, 2026-10-08)
    // One-step undo reply (2026-10-17): after clicking the "Undo" on the toast
    'toast.undoDone': 'Undone',
    'toast.undoGone': 'Cannot Undo (the Target Node No Longer Exists)',
    // ⌘ drag-out: mirror finished ({0} = top-level name, {1} = destination)
    'toast.mapCopiedOut': 'Shortcut Created in {1}',
    'toast.doclibLinkCopied': 'Wikilink copied — paste it into a mind map', // "Copy Link" in the documents panel succeeded
    'toast.docRefGone': 'That Reference No Longer Exists (the Mind Map May Have Changed)', // Locating from the panel found no matching node
    'toast.locateReveal': 'The target node was hidden by a view filter — turned the filter off for you', // Panel locate target hidden by hideMinor/Now filter → auto turn it off (2026-10-11)
    'toast.docDeleted': 'Deleted: {0}', // Stored document deleted successfully ({0} = document name)
    'notice.docDeleteFail': 'Delete failed: ', // Deleting a stored document failed (error follows)
    'toast.nodeLinkCopied': 'Copied — Paste It on the Node to Link', // node link copied

    'warn.root': 'Line {0}: unrecognized (the first line should be the central topic `- Central topic`); kept as-is',
    'warn.tabIndent': 'Line {0}: branches must be indented with Tabs (one Tab per level) and cannot sit at the same level as the central topic; kept as-is',
    'warn.spaceIndent': 'Line {0}: please indent with Tabs, not spaces; kept as-is',
    'warn.unrecognized': 'Line {0}: unrecognized "{1}"; kept as-is (only `- node`, `> note`, `![]image`, `[[link]]` are supported)',
    'warn.dupId': 'Duplicate node ID: {0} (ID not cleared when copying? Keep only one of them)',
    'warn.deadLink': 'Broken link: {0} points to a node that no longer exists (it may have been deleted)',
    'warn.boxPrefix': '⚠ Formatting Issues: ',

    'ctx.copyImage': 'Copy Image',
    'ctx.deleteImage': 'Remove Attachment',
    'more.pickBadType': 'Only image / video / audio files are supported; other formats were skipped',
    'ctx.drill': 'Enter Current Node',
    'ctx.drillTip': 'Click to Show Only This Node Tree in the View==space==({0})', // hotkey lives in tipH's {0}
    'ctx.drillRootTip': 'This Is the Main Node — Cannot Enter',
    'ctx.bookmarkTip': 'Click to Save This View as a Shortcut Page==space==({0})', // hotkey lives in tipH's {0}
    'ctx.basicOps': 'Basic',
    // (Context-menu To-Do row and its five ctx.todo* keys removed with the dead branch: 2026-10-18)
    'ctx.cut': 'Cut',
    'ctx.copy': 'Copy', // 2026-10-18: this one goes to the clipboard; the new "Duplicate" below builds a copy
    'ctx.copyTip': 'Click to Copy This Node Tree==space==(Hold {Mod} and Click / {Mod} + {Alt} + C: Copy Without Formatting)', // 2026-10-23: added the plain-copy hotkey; modStr collapses the + signs on macOS → ⌘⌥C, keeps Ctrl + Alt + C on Windows. suffix goes to tipH
    'ctx.duplicate': 'Duplicate', // 2026-10-18: insert a full copy of this subtree right after the selected node (doc nodes become doc shortcuts)
    'ctx.duplicateTip': 'Click to Create a Copy of This Node Tree==space==(or Hold {Alt} and Drag)', // user's wording (2026-10-18); suffix goes to tipH
    'ctx.duplicateNaTip': 'The Mother Node Cannot Be Duplicated', // greyed-out reason
    'ctx.paste': 'Paste',
    'ctx.delete': 'Delete',
    'ctx.pasteUseKey': 'Clipboard Unavailable — Paste with {Mod}+V',
    'ctx.pasteEmptyTip': 'Nothing to Paste in the Clipboard==space==(Copy a Node or Text First)', // tip shown on the greyed-out Paste row (2026-09-23); suffix goes to tipH
    'ctx.pasteMultiTip': 'Cannot Paste with Multiple Nodes Selected==space==(Select One Node First)', // Paste is greyed out in multi-select (2026-09-23)
    'more.kbdPaste': 'Paste',
    'more.kbdWiki': '[[',
    'more.kbdTab': 'Tab',
    'more.kbdEnter': 'Enter',
    'ctx.copyLink': 'Copy Node Link',
    'ctx.manageDoc': 'Manage Document', // Context menu item (multi-managed document nodes only, 2026-10-09; moved under "Enter This Node" 2026-10-11)
    'ctx.manageDocTip': 'Click to View and Manage This Document', // black hover tip
    'ctx.openDoc': 'Open Document', // Context menu (stored-document nodes only): open the stored document in a new tab (2026-10-08)
    'ctx.moveOutDoc': 'Move Out of Mind Map', // Context menu (managed-file nodes only): move the file back to the vault root (2026-10-08; renamed 2026-10-09 to match the Chinese)
    'ctx.deleteDoc': 'Delete Document', // Context menu (stored-document nodes only): delete the document (confirm + rewrite the links, 2026-10-08)
    'ctx.renameDoc': 'Rename Document', // Context menu (same nodes): renames the **file** via Obsidian's rename API, so links update themselves (spec §4.7)
    // Attachment nodes (image / video / audio) get only Open / Delete — renaming an attachment is pointless.
    'ctx.openImage': 'Open Image',
    'ctx.openVideo': 'Open Video',
    'ctx.openAudio': 'Open Audio',
    'ctx.deleteImage': 'Delete Image',
    'ctx.deleteVideo': 'Delete Video',
    'ctx.deleteAudio': 'Delete Audio',
    // Black hover tips for the group above (2026-10-11): Open / Delete are per-kind (same suffix scheme as the
    //   label via nmCtxKeyOf); Rename exists for documents only.
    'ctx.openTipDoc': 'Click to Open This Document in a New Tab',
    'ctx.openTipImage': 'Click to Open This Image in a New Tab',
    'ctx.openTipVideo': 'Click to Open This Video in a New Tab',
    'ctx.openTipAudio': 'Click to Open This Audio in a New Tab',
    'ctx.renameDocTip': 'Click to Rename This Document',
    'ctx.deleteTipDoc': 'Click to Delete This Document',
    'ctx.deleteTipImage': 'Click to Delete This Image',
    'ctx.deleteTipVideo': 'Click to Delete This Video',
    'ctx.deleteTipAudio': 'Click to Delete This Audio',
    'ctx.bookmark': 'Create View Shortcut',
    'ctx.saveDocShortcut': 'Create Document Shortcut', // doc nodes only (2026-10-11): creates a 28notes: doclink shell that opens the doc directly
    'ctx.saveDocShortcutTip': 'Click to Save This Document as a Shortcut Page==space==(Hold {Alt} and Drag to Create One Quickly)', // suffix goes to tipH
    'ctx.dupDoc': 'Duplicate Document',
    'ctx.dupDocTip': 'Click to create a copy of this document', // black hover tip
    // ---- Export mind map (2026-10-10, user's call; the old per-document "Move out of vault" is merged in) ----
    'ctx.exportMap': 'Export Mind Map',
    'ctx.exportMapTip': 'Click to Export This Node Tree to the Vault==space==(or Drag / Hold {Alt} and Drag to Export) ({0})', // light segment (drag note + hotkey) goes whole into tipH
    'export.untitled': 'Untitled',
    // ⛔ RETIRED (2026-10-10): exporting the root now deletes the whole map instead of keeping + renaming it
    'export.doneRootTitle': 'Exported',
    'export.doneToast': 'Exported',
    'export.doneNotice': 'Exported',
    'export.snapName': 'Before export',
    'notice.exportMapFail': 'Export failed: ',
    'export.warnTitle': 'Confirm Before Exporting',
    // NOTE: the dialog body uses setText (no markdown) — do not use **bold** markup here.
    'export.warnBody': 'This node tree contains the following extra content, which will be cleared on export. Please confirm before continuing. (You can still review the cleared content in the mind map history afterwards.)',
    'export.warnOk': 'Export Anyway',
    // Exporting the ROOT node means the whole map goes out and the map file itself is deleted → different copy.
    'export.warnRootBody': 'This node tree contains the following extra content, which will be cleared on export. Please confirm before continuing. (Once exported, the cleared content cannot be recovered or undone.)',
    // The "export blocked" dialog is SEPARATE from the import one (2026-10-10): different titles, body and reasons.
    'export.blockedTitle': 'Cannot Export',
    'export.blockedBody': 'Export failed. Nothing was exported this time. Please fix the issues as suggested below and then export again:',
    'export.warnNotes': '· {0} node(s) have notes — notes are discarded',
    'export.warnMedia': '· {0} node(s) embed images / videos — these are NOT carried over, please handle them yourself',
    'export.warnTodo': '· {0} node(s) have to-do marks — dropped',
    'export.warnRules': '· {0} node(s) have AI editing rules — dropped',
    'export.badEmpty': '"{0}" has an empty title',
    'export.badEmptyFix': 'Please give it a title',
    'export.badSpace': '"{0}" has extra spaces at the start or end of its title',
    'export.badSpaceFix': 'Please remove them',
    'export.badChar': '"{0}" contains "{1}"',
    'export.badCharFix': 'That character cannot be used in a folder / file name — remove it or replace it with another character',
    'export.badFs': '"{0}" contains characters not allowed in file names (\\ / : * ? " < > |)',
    'export.badFsFix': 'Please remove them or use other characters',
    'export.badLong': '"{0}" is too long (over {1} characters)',
    'export.badLongFix': 'Please shorten it (folder / file names have a length limit)',
    'export.badDeep': '"{0}" is nested too deeply (over {1} levels)',
    'export.badDeepFix': 'Please flatten this subtree a bit before exporting',
    'export.refDupInTree': '"{0}" appears more than once in this subtree',
    'export.refDupInTreeFix': 'One file can only land in one place — please remove the duplicate node first',
    'export.refUsedElsewhere': '"{0}" is still managed somewhere else',
    'export.refUsedElsewhereFix': 'Exporting would move it away and break the other place — please unmanage it there first (right-click → Manage This Document)',
    'export.missingDoc': 'File not found (may have been deleted or moved):',
    'ctx.bookmarkHint': "(Optional — defaults to the node's title)",
    'ctx.editLink': 'Edit Link',
    // AI locate text (2026-09-20): single line wrapped in 【】 (user wants to paste it as one block), {0} = path, {1} = node ID.
    'aiLocate.node': '【1. Find the document to edit, path: {0}; 2. Check the FrontMatter hint at the top of the document for the format rules you must follow strictly; 3. A snapshot has already been saved automatically by the plugin — do not back up again (skip the "Before editing" section of index.md and do not run snapshot.py); 4. Use the node id to locate the node to edit, node ID: {1}; 5. Start editing based on the user\'s instruction】',
    'aiLocate.file': '【1. Find the document to edit, path: {0}; 2. Start editing based on the user\'s instruction】',
    // Split version used by the AI edit dialog (send button) — 2026-09-28
    'aiLocate.nodeHead': '【1. Find the document to edit, path: {0}; 2. Check the FrontMatter hint at the top of the document for the format rules you must follow strictly{1}; 3. A snapshot has already been saved automatically by the plugin — do not back up again (skip the "Before editing" section of index.md and do not run snapshot.py); 4. Use the node id to locate the node to edit, node ID: {2}; ',
    'aiLocate.ruleSuffixImport': ', as well as how to digest an AI web answer',
    'aiLocate.askDefault': '5. Start editing based on the user\'s instruction】',
    'aiLocate.ask': '5. User instruction: {0}】',
    'aiLocate.askImport': '5. User instruction: digest the AI web answer, web link: {0}; specific instruction: {1}】',
    'aiLocate.askImportNoText': '5. User instruction: digest the AI web answer, web link: {0}】',
    // File-list right-click · when the target is a 28Notes mindmap, use this one (extra "save a snapshot" step, script path = {1}).
    // Plain notes keep the shorter version above: they have no frontmatter, can't reach index.md, and don't need a snapshot.
    'aiLocate.fileMm': '【1. Find the document to edit, path: {0}; 2. Check the FrontMatter hint at the top of the document for the format rules you must follow strictly; 3. A snapshot has already been saved automatically by the plugin — do not back up again (skip the "Before editing" section of index.md and do not run snapshot.py); 4. Start editing based on the user\'s instruction】',
    // Frontmatter AI hints written into a file when it is created / first injected (2026-09-20):
    // language is taken **at write time** and never rewritten afterwards (switching language must not touch existing files).
    'fm.ai': 'Before editing this file, read 28Notes-Files/AI/index.md and follow it strictly — otherwise the file may show garbled content when opened',
    'fm.aiLocate': 'Locate a node: search for id:<node ID> in the file (node IDs look like <!--id:xxx-->, they sit at the end of the heading line — not an Obsidian ^block anchor, and must not be appended to the file path when opening).',
    'ctx.copyLinkTip': 'Click to Copy and Paste into Another Mind Map for Quick Jumps==space==({0})', // hotkey lives in tipH's {0}

    'fold.menuKeep': 'Fold the Selected Node to Level {0} (Keep Everything Else Unchanged) (Click)',
    'fold.menuMin': 'Fold the selected node to level {0} (fold everything else to the minimum) (hold {Mod} and click)',
    'fold.level': 'Fold to Level {0}',
    'fold.levelKeep': 'Fold the Selected Node to Level {0}',
    'fold.levelMin': 'Fold "the Selected Node" to Level {0} (Fold Everything Else to the Minimum)',
    'fold.noMore': 'Temporarily Unavailable',

    'locate.root': 'Central Node',
    'locate.selected': 'Selected Node',
    'locate.to': 'Locate {0}',

    'banner.setLatest': 'Set as Latest',
    'hist.sameAsNow': 'This Version Is Identical to the Latest Version',
    'hist.onlyRootDiff': 'Compared with the Latest Version, This One Differs Only in the Root Node',
    'hist.addNodes': 'Added {0} Node(s)',
    'hist.removeNodes': 'Removed {0} Node(s)',
    'hist.onlyCountDiff': 'The Latest Version {0} on Top of This One',
    'hist.rootAndCountDiff': 'The Latest Version Modifies the Root Node and {0} on Top of This One',
    'hist.tipText': 'Yellow Nodes Differ from the Latest Version',
    'hist.aspectTitle': 'Title',
    'hist.aspectNote': 'Note',
    'hist.aspectLink': 'Link',
    'hist.aspectImage': 'Images',
    'hist.exit': 'Back to Editing',
    'hist.copy': 'Create Copy',
    'hist.promptTitle': 'Name This Version',
    'hist.promptHint': '(Optional)',
    'hist.confirmRestore': 'Overwrite the current file with this version? ',
    'hist.empty': 'No history yet.<br>A version is saved automatically as you edit (only when the content changed and at least 20s after the previous one). You can also use "Save this version" in the "More" menu at the top right to save a named one.',
    'hist.auto': 'Auto Save',
    'hist.justNow': 'Just Now · {0}',
    'hist.today': 'Today',
    'hist.yesterday': 'Yesterday',
    'hist.dateMD': '{0}/{1}',
    'hist.dateYMD': '{1}/{2}/{0}',
    'hist.rename': 'Rename Version',
    'hist.lock': 'Lock Version',
    'hist.unlock': 'Unlock Version',
    'hist.delete': 'Delete Version',
    'hist.itemMenu': 'More Actions',
    'hist.lockedTip': 'Locked (Never Auto-Trimmed)',
    'hist.unlockedTip': 'Lock This Version (Unlocked Versions Are Auto-Trimmed)',
    'hist.renameTitle': 'Rename This Version',
    'hist.renameHint': '(Empty = "Auto Save")',
    'hist.confirmDelete': 'Delete this version? It will be moved to the system trash.',
    // ---- Documents panel "Manage Documents with Mind Maps" (2026-10-08) ----
    'doclib.title': 'Mind Map Document Library', // Panel tab name / tooltip (renamed 2026-10-09)
    // ---- Unified "Mind Map" panel (2026-10-18: history + document library merged) ----
    'panel.title': 'Mind Map',
    'panel.tabProps': 'This File',
    'panel.grpProps': 'File Properties',
    'panel.grpManage': 'Document Management',
    'panel.grpDerived': 'Derived Shortcuts',
    'panel.noDerived': 'No shortcuts point to this file',
    'panel.propSrc': 'Source: ',
    'panel.propSrcGone': 'Source File Deleted',
    'panel.propLinks': 'Links: ',
    'panel.propLink': 'Wiki: ',
    'panel.propPath': 'Local Path: ',
    'panel.propPathRow': 'Path: ',
    'panel.pathHidden': 'In Hidden Folder',
    'panel.pathHiddenShort': 'Hidden',
    'panel.copyLinkTip': 'Copy Wiki Link',
    'panel.copyPathTip': 'Copy Local Path',
    'panel.reload': 'Refresh',
    'panel.copy': 'Copy',
    'toast.pathCopied': 'Path Copied',
    'toast.docDuped': 'Copy Created',
    'panel.tabLib': 'Mind Map Document Library',
    'panel.tabSearch': 'Search',
    'search.ph': 'Search titles or notes …',
    'search.scopeView': 'Current mind map',
    'search.scopeAll': 'All mind maps',
    'search.searching': 'Searching …',
    'search.empty': 'Not found.',
    'search.more': '{0} more.',
    'search.notMap': 'Search works only inside a mind map. (If it is not detected, click the refresh button at the top right.)',
    'search.hint': '',
    'search.clear': 'Clear search',
    'search.gone': 'This node no longer exists (it may have been deleted or renamed).',
    'search.gotoFail': 'Could not open that mind map (file moved or deleted)',
    'panel.grpDocs': 'Managed Documents', // 2026-10-19: always shown (was "map files only")
    'panel.grpParents': 'Mind Maps Managing This File',
    'panel.noParents': 'No mind map is managing this file yet.',
    'panel.noDocsNotMap': 'This file is not a mind map, so it has no managed sub-documents.', // 2026-10-19
    'panel.grpHist': 'History',
    'panel.grpNormal': 'Documents', // Library tab, 2nd group (wraps the by-map view; collapsed by default)
    // 2026-10-19: two-line placeholder — the second line explains what an "orphan" is.
    'doclib.noOrphan': 'No orphan documents.\nOrphan = a document imported into the mind map database but not yet managed by any mind map.',
    'doclib.noManaged': 'No managed documents yet.',
    // The three tabs became **icons** (2026-10-09): pin = documents managed by the current map,
    // the panel's own icon = all documents imported into the database, "?" = how-to.
    // Icons can't hold text, so the tab names moved below as **section titles** (secCur / secAll)
    // and double as the icon buttons' tooltips.
    'doclib.secCur': 'Documents Managed by the Current Mind Map', // Section title + tooltip of tab 1 (pin)
    'doclib.secAll': 'All Documents Moved into the Mind Map Database', // Section title + tooltip of tab 2
    'doclib.tabHelp': 'Guide', // Section title + tooltip of tab 3 (shortened 2026-10-09, mirrors 「管理教程」)
    // Tab 4 (warning triangle, 2026-10-09): which maps manage the document of the CURRENTLY SELECTED node
    'doclib.secManage': 'Problem Documents Managed in Multiple Places', // Name / tooltip of tab 4 (alert triangle)
    'doclib.blkMaps': 'Mind Maps Managing This Document', // Unused since 2026-10-09 (that heading row was removed)
    'doclib.clearFilter': 'Clear filter', // "Clear filter ✕" at the top of tab 4 (only when arrived via "Manage This Document")
    'doclib.noMultiDoc': 'No document is managed in more than one place yet.', // Empty state of tab 4
    'doclib.blkDoc': 'Document', // Unused since 2026-10-09 (tab 4 now lists foldable documents, no such heading)
    'doclib.manageNoSel': 'Select a document node in a mind map first',
    'doclib.manageNone': 'This document is not managed by any mind map right now', // Empty state (nothing / non-document selected)
    'doclib.whyMultiRef': 'Why a document should not be managed in more than one place ↗', // Small link at the bottom of tab 4
    'doclib.mgrOccurrence': 'Occurrence {0}', // Rows inside the fold when one map references it several times
    // "Stop managing this occurrence" (the ✕ on each row of tab 4): drops just THIS reference, file untouched
    'doclib.unmanageTitle': 'Stop managing this occurrence?',
    'doclib.unmanageBody': 'This only affects this one node; the other nodes managing this document are untouched. This cannot be undone.',
    'doclib.unmanageOk': 'Stop managing it',
    'doclib.unmanagedPlaceholder': '"No longer managed: {0}"', // Plain text written into the map (persisted to disk)
    'toast.docUnmanaged': 'Stopped managing one occurrence: {0}',
    'notice.unmanageFail': 'Could not stop managing it: ',
    // The three "view as" keys (viewMode / viewFlat / viewByMap) were removed 2026-10-09
    // together with the "By document" view (the two view modes were merged into one).
    // The right-most button in that row (two states, mirroring Obsidian's own Outline pane)
    'doclib.collapseAll': 'Collapse all',
    'doclib.expandAll': 'Expand all',
    // Tab 2 "By document" has three collapsible groups (2026-10-09); the group name says it all,
    // so rows inside no longer carry the "not managed by any mind map" sub-line.
    'doclib.grpOrphan': 'Orphaned Documents Not Managed Yet', // 2026-10-19: "files" → "documents"
    'doclib.grpMulti': 'Managed in More Than One Place', // Group 2: referenced by 2+ nodes
    'doclib.grpSingle': 'Managed in One Place', // Group 3: referenced by exactly 1 node
    'doclib.toggle': 'Expand / collapse',
    // "Locate the node" (2026-10-09): in a row's "More" menu / the hover button in the tree's second level.
    // Opens (or activates) that mind map and selects + centres the node referencing this file.
    'doclib.locate': 'Locate Node',
    'doclib.warnJump': 'This document is managed in more than one place; keeping it in one is recommended (click to manage)',
    'doclib.locateN': 'Locate occurrence {0}', // One entry per reference when a map references it several times
    // ⚠️ These two are UNUSED since 2026-10-09 (the "What Are Orphaned Documents?" button was removed —
    //    the group name "Orphaned Files Not Managed Yet" says it all). Keys kept in case it comes back.
    'doclib.helpToggle': 'What Are Orphaned Documents?',
    'doclib.helpText': 'Orphaned documents are documents that were moved into the mind map database but are not managed by any mind map.',
    'doclib.noMap': 'Open a mind map first.', // Empty state of tab 1 (the other tab still lists)
    'doclib.empty': 'The current mind map does not manage any documents yet.',
    'doclib.copyLink': 'Copy Link', // Button on the right of each row
    'doclib.delete': 'Delete', // Item in each row's "More" menu (2026-10-08)
    'doclib.confirmDeleteTitle': 'Delete this document?', // Confirmation dialog title (from the panel)
    'doclib.confirmDeleteNodeTitle': 'Delete the document managed by this node?', // Confirmation dialog title (from a canvas node, 2026-10-08)
    'doclib.confirmDeleteNodesTitle': 'Also delete the files managed by these nodes?', // Same, but for a MULTI-selection on the canvas (2026-10-09)
    // Panel entry uses these two (2026-10-08: the panel keeps its original wording, without the "where to look" line)
    'doclib.confirmDeleteRefs': 'This document is managed by {2} mind map(s). After deleting, it will be moved to the Obsidian trash.\nThis cannot be undone.', // {0}=document name {1}=reference count {2}=map count
    'doclib.confirmDeleteOrphan': 'This document is not managed by any mind map. It will be moved to the Obsidian trash.\nThis cannot be undone.',
    // Canvas-node entry uses these two (one extra line telling where to look)
    'doclib.confirmDeleteNodeRefs': 'This document is managed by {2} mind map(s). You can view them via "More" at the top right of the view → "View managed documents".\nAfter deleting, it will be moved to the Obsidian trash. This cannot be undone.',
    'doclib.confirmDeleteNodeOrphan': 'This document is not managed by any mind map.\nIt will be moved to the Obsidian trash. This cannot be undone.',
    // Pressing Delete on a selected document node (2026-10-08): three ways out — cancel / node only / node + document
    // This document is managed by **this node only** (the two variants were fixed 2026-10-08)
    'docNode.askOnly': 'This node manages the document "{0}". Delete that document as well?',
    // It is **also managed by other nodes** — one extra line telling where to look, plus the node count
    'docNode.askShared': 'This node manages the document "{0}". It is also managed by {1} node(s) (see "More" at the top right of the view → "View managed documents"). Delete that document as well?', // {0}=document name {1}=node count
    // A **multi-selection** containing managed files (2026-10-09): one single dialog, saying how many and how
    // many of those references live elsewhere.
    'docNode.askMulti': 'The nodes being deleted include {0} managed file(s), {1} of whose references are managed elsewhere (see "More" at the top right of the view → "View managed documents"). Delete those files as well?', // {0}=selected file count {1}=references elsewhere
    // Multi-selection where **none** of them is managed anywhere else (2026-10-09 — "0 of whose references…" read badly)
    'docNode.askMultiOnly': 'The nodes being deleted include {0} managed file(s). Delete those files as well?', // {0}=selected file count
    'docNode.onlyNode': 'Delete node only', // Second button
    'docNode.nodeAndDoc': 'Delete node and document', // Third button (destructive → mod-warning)
    'docNode.nodesAndDocs': 'Delete nodes and files', // Same, but for a MULTI-selection (may mix documents and attachments, 2026-10-09)
    // Plain text written into mind maps to replace the link when a document is deleted (persisted to disk).
    // The surrounding quotes were requested 2026-10-08 so it reads as one chunk, distinct from the rest of the node.
    // (When the node holds nothing but that link, the whole line is removed instead — no placeholder at all.)
    'doclib.deletedPlaceholder': '"Deleted: {0}"',
    'doclib.learnMore': 'Learn How to Manage Documents with Mind Maps ↗', // Line under the tabs: opens the online doc (2026-10-08)
    'mm.doclib': 'View Managed Documents', // Item in the title-bar "More" menu (above History; the bottom-left button was removed)
    // ---- The map created by "Import into mind map": file name + root node + help link (2026-10-08) ----
    // ⚠️ The file name must not contain a half-width colon (Obsidian forbids `:` on every platform; create() throws)
    // ⛔ RETIRED (2026-10-10 rework): the map is now named after the imported document / folder, and the
    // root node IS that document / folder name — the "Imported →" + help-link lines were dropped.
    // The keys stay (so old data / external references don't break) but must not be referenced in code.
    'import.mapPrefix': 'Imported →', // ⛔ RETIRED (was the new map's file name)
    'import.rootTitle': 'Imported — cut and paste it wherever you like →', // ⛔ RETIRED (was the root node text)
    'import.helpLink': 'Learn how to manage documents with mind maps', // ⛔ RETIRED (was the help link under the root node)
    // ---- "Rename the imported file" (2026-10-08, spec §4.7) ----
    'doclib.renameTitle': 'Rename the Moved-in File',
    'doclib.renameHint': 'Enter a new file name (no extension needed)',
    // New child document (2026-10-09): the "Add → Child Document" row and the "Add Child Document"
    // command both go through this input. The file really lands in 28Notes-Files/docs/, and the node
    // is written as `[[28Notes-Files/docs/name]]` (with the path, to stay unambiguous).
    'doclib.newChildDocTitle': 'Enter a Document Name',
    'doclib.newChildDocPh': 'No special characters — e.g. \\ / : * ? " < > # ^',
    // "Choose a Document to Move In" dialog (2026-10-09): the two body lines are the user's own wording
    'doclib.pickDocTitle': 'Choose a Document to Move In',
    // ⚠️ 这里**不再说 "moves out of the file list"**：英文里 "Moved out" 是另一个动作（转出回 vault，
    //    toast.docMovedOut / ctx.moveOutDoc），同一句话里既 move in 又 move out 会看反。改成 "leaves"。
    'doclib.pickDocBody': 'Once moved in, the document leaves the file list on the left and becomes managed by THIS mind map.\n\nNote: if you only want to link it, close this window and use a wiki link instead.',
    'doclib.pickDocPh': 'Enter a document name',
    // "Choose a Folder to Move In" modal (2026-10-12): **search-based**, same native suggestion panel as
    // "Move a Vault Document Here" — type a folder name, pick from the dropdown (vault-relative paths).
    // 2026-10-12: no "paste an absolute path" fallback — the new way replaces the old one.
    'doclib.pickFolderTitle': 'Choose a Folder to Move In',
    'doclib.pickFolderBody': 'Once moved in, the folder leaves the file list on the left and becomes managed by THIS mind map.\n\nNote: to avoid a folder moving inside itself, if the current mind map lives inside a folder, that folder cannot be moved in.',
    'doclib.pickFolderPh': 'Enter a folder name',
    'doclib.pickFolderOk': 'Move In',
    // Why the picked item could not be resolved (shown in the "Cannot Move In" modal)
    'folderBad.notFound': 'No such folder. Search for the folder name below and pick one from the dropdown before confirming.',
    'folderBad.inData': 'This folder is already in the mind map database.',
    'notice.importRepoFail': 'Could not move the document: ',
    'toast.childDocCreated': 'Child document created: {0}',
    'notice.newChildDocFail': 'Could not create the child document: ',
    'notice.docNameBad': 'That name cannot be used for a document (no \\ / : * ? " < > | or # | ^ [ ]): ',
    'toast.docRenamed': 'Renamed: {0}',
    'notice.renameTaken': 'That name is already taken: ',
    'notice.renameFail': 'Rename failed: ',
    'notice.renameBadName': 'A name cannot contain \\ / : * ? " < > | or # | ^ [ ]',
    // ---- Folder import (2026-10-08, spec §4.3) ----
    'toast.folderImported': 'Folder moved in: {0}',
    'toast.renamedNote': ' (duplicate names were renamed)',
    'notice.importFolderFail': 'Folder move failed: ',
    'notice.importFolderSkipped': '{0} file(s) have names that cannot be written as links (# | ^ [ ] etc.) — skipped and left in place',
    // ---- "Import blocked" dialog (2026-10-10, user's call): if anything fails the check, nothing is moved
    // at all — but say which file, where it is, why, and how to fix it. ----
    'doclib.blockedTitle': 'Cannot Move In',
    // Pure-notice modal when "Selected Node in an Open Mind Map" is unavailable (2026-10-12)
    'doclib.needTargetTitle': 'Select a Node and Try Again',
    'doclib.needTargetBody': 'Open a mind map and select a node to use this item.',
    // Removed (2026-10-12): doclib.needTargetNoMap / doclib.needTargetNoSel — the body no longer
    // names the problem, so those two keys are gone. Do not add them back.
    // Self-import guard (2026-10-12): the right-clicked file IS the map you have open → blocked in both modes.
    'doclib.selfImportTitle': 'No Circular Moves',
    'doclib.selfImportBody': 'To avoid confusion, a mind map cannot be moved into one of its own nodes.\n\nSwitch to another mind map and try again.',
    // ---- "About Moving Documents In" help modal (2026-10-20) ----
    //   Opened from: ① the last item of the "Move into Mind Map" submenu in the file list;
    //                ② the button at the bottom-left of the "Move in Vault Document / Folder" modals.
    //   Purely informational — moves nothing. Body allows HTML (<b> / <br>), rendered via innerHTML.
    //   ⚠️ Modifier keys must use the {Alt} placeholder (T() maps it to ⌥ / Alt per platform).
    'importHelp.title': '★ About Moving Documents In',
    'importHelp.detailBtn': '★ Learn More About Moving In',
    'importHelp.intro1': 'Drag a document or folder from the left file list <b>straight onto a mind map</b> to manage it with the map.',
    'importHelp.intro2': 'The other way round works too: drag a node tree from the mind map back to the left file list to move it out.',
    'importHelp.tipsTitle': 'Tips:',
    'importHelp.tip1': 'Hold {Alt} while dragging to create a shortcut without touching the original structure — delete it when you are done.',
    'importHelp.tip2': 'In the drop-down menu at the top-right of the mind map, choose "Mind Map Documents" to browse and manage every document moved in.',
    'importHelp.learnMore': 'Learn How to Manage Documents with Mind Maps ↗',
    'importHelp.foldTitle': 'Drag and drop stopped working because of a community plugin. What now?',
    'importHelp.foldLead1': 'Drag-in / drag-out only works with the default Obsidian file list.',
    'importHelp.foldLead2': 'If a community plugin takes over your file list, use the following ways instead.',
    'importHelp.inTitle': '1. Moving In',
    'importHelp.in1': 'In the left file list, select the file / folder, right-click, and choose "Move into Mind Map".',
    'importHelp.in1a': 'Click "New Mind Map": creates a new mind map and moves the document in.',
    'importHelp.in1b': 'Click "Selected Node in Open Mind Map": moves it under the selected node of the open mind map. This requires an open mind map with a node selected.',
    'importHelp.in2': 'Select a node in the mind map, click "Add – More Options" at the bottom, then choose "Move in Vault Document / Move in Vault Folder" and follow the prompt.',
    'importHelp.outTitle': '2. Moving Out',
    'importHelp.out1': 'Select a node in the mind map, right-click, and choose "Export Mind Map".',
    // ---- "More" next to the close-split icon (2026-10-20) ----
    //   The "auto-hide sidebars on doc click" switch used to live in the debug group; promoted to a real
    //   setting on 2026-10-20 (debug entry removed) and widened from "left sidebar only" to both sides.
    'splitMore.title': 'Split Settings',
    'splitMore.tip': 'Split Settings',
    'splitMore.hideSidebars': 'Hide Sidebars Automatically When Opening a Document Node',
    'splitMore.hideSidebarsDesc': 'When on, opening a document node in the split view collapses both sidebars; closing the split restores them.',
    // Opening line: {0} = number of blocked files; followed by a "path + reason + how to fix" list —
    // **every entry is listed** (no truncation), a blank line between entries; a long list scrolls
    // inside the dialog body (`max-height: 55vh; overflow-y: auto`).
    'doclib.blockedBody': '{0} of the file names contain invalid characters, so the entire import was cancelled. Fix them as suggested below and try importing again:',
    'doclib.blockedWhere': 'Folder: {0}',
    'doclib.blockUnknown': '(no file specified)',
    'doclib.blockEmptyName': 'The file name is empty',
    'doclib.blockEmptyNameFix': 'Please give it a name',
    'doclib.blockChar': 'This file name contains the character "{0}"',
    'doclib.blockCharFix': 'That character has a special meaning in the Obsidian wiki-link syntax [[...]] and will cause a conflict. Remove it, or replace it with another character.',
    // Leading/trailing spaces: the link text gets trimmed, so the link cannot find this file
    // (reported by the user 2026-10-10 with `优化版 .md`).
    'doclib.blockSpace': 'This file name has extra spaces at the start or end',
    'doclib.blockSpaceFix': 'Spaces at the start or end of [[link]] text are ignored, so the link cannot find this file (clicking the node shows "Note Not Found"). Please remove them from the file name.',
    // A file with no extension: Obsidian's link resolver **appends `.md`** before looking the file up,
    // so such a file can never be linked (reported by the user 2026-10-10; confirmed by reading
    // getLinkpathDest in obsidian.asar — this is a verified fact, not a guess).
    'doclib.blockNoExt': 'This file has no extension',
    'doclib.blockNoExtFix': 'Obsidian appends .md when resolving [[links]], so a file without an extension can never be opened. Give it an extension (for a plain-text note, .md will do).',
    'hist.panelTitle': 'Mind Map History', // Panel tab name / tooltip / the small title on both history tabs (shortened 2026-10-10)
    'hist.rules': 'Save Rules',
    'hist.rulesText': 'Versions are kept frequently while editing; redundant ones are later auto-trimmed (down to 1-7 per week). Manually saved / renamed / locked versions are never auto-trimmed.',
    'hist.noMap': 'No Mind Map Is Open',
    // (2026-10-18: the "Open History Panel" / "Open Documents Panel" commands were removed, keys dropped)
    'notice.panelFail': 'Failed to Open the Right Sidebar History Panel',

    'img.prev': 'Previous (Left Click / ←)',
    'img.next': 'Next (Right Click / →)',
    'img.missing': 'Missing',
    'img.missingTitle': 'Image Not Found',
    'img.missingHint': 'This image can no longer be found in the vault. Put the file back, then restart Obsidian to show it again.',

    'btn.cancel': 'Cancel',
    'btn.okay': 'OK',
    'btn.ok': 'OK'
  }
};
// 当前语言：iframe 由宿主注入 window.__MM_LANG__；宿主/test.mjs 装载后调 setLang
var I18N_LANG = (typeof window !== 'undefined' && window.__MM_LANG__ === 'en') ? 'en' : 'zh';
function setLang(l) { if (I18N[l]) I18N_LANG = l; }
function getLang() { return I18N_LANG; }
// 平台键位：文案里 {Mod}/{Alt} 占位 —— **Mac 一律换成系统符号**（⌘/⌥/⇧），Windows/Linux 用 Ctrl/Alt 前缀
// （navigator 覆盖 iframe；process 覆盖宿主 main.js；都没有（test.mjs 沙箱）回退非 Mac，只影响测试取值）
// 2026-09-21 用户定：Mac 不要写「Cmd / Command」这种字面词，跟系统符号保持一致（fmtHotkey 那一套）；
// 顺手把含修饰键占位的串里的「+」收掉（「⌘ + X」→「⌘X」），只在含占位符时做，免得误伤正文里的加号。
var I18N_MAC = (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(String(navigator.platform || navigator.userAgent || '')))
  || (typeof process !== 'undefined' && process.platform === 'darwin');
function modStr(s) { // {Mod}/{Alt} → 平台实际键名 / 符号
  var out = String(s);
  var hadPlaceholder = /\{Mod\}|\{Alt\}/.test(out);
  if (I18N_MAC) {
    out = out.split('{Mod}').join('⌘').split('{Alt}').join('⌥');
    out = out.replace(/\bShift\b/g, '⇧');
    if (hadPlaceholder) out = out.replace(/\s*\+\s*/g, ''); // 只收含占位符的串
  } else {
    out = out.split('{Mod}').join('Ctrl').split('{Alt}').join('Alt');
  }
  return out;
}
function T(key) { // 取文案：当前语言 → zh 回退 → key 兜底；{0}{1}… 占位符替换 + {Mod}/{Alt} 平台键位
  var tbl = I18N[I18N_LANG] || {};
  var s = tbl[key] != null ? tbl[key] : I18N.zh[key];
  if (s == null) return key;
  for (var i = 1; i < arguments.length; i++) {
    s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
  }
  return modStr(s);
}
if (typeof module !== 'undefined' && module.exports) module.exports = { I18N: I18N, setLang: setLang, getLang: getLang, T: T, modStr: modStr };
