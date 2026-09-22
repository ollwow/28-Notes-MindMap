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
    'mm.history': '历史记录', // 菜单项：打开历史记录面板
    'mm.saveVersion': '保存此版本', // 菜单项：手动命名保存当前版本快照
    'mm.guide': '使用指南 ↗', // 菜单项：打开使用指南（飞书文档，与设置页「使用教程」同一个链接）
    'mm.joinGroup': '加入微信群 ↗', // 菜单项：跳转飞书 wiki 进群页（2026-09-07）
    'mm.saveShortcut': '将该视图存为捷径', // 菜单项（2026-09-18）：右键「保存为捷径」的可视化形态，对当前视图根节点建捷径
    'mm.hotkeys': '快捷键', // 菜单项：打开原生「快捷键」页并预填搜索只看本插件（2026-09-18）
    'mm.settings': '设置与 Bug 提报', // 菜单项：打开插件设置页（2026-09-01）
    'aiEdit.desc': '复制下面的定位信息，粘贴到其他 AI Agent 里（如 Claude Code、Codex、WorkBuddy 等），AI 就能直接定位到该节点并精准修改。修改时，AI 会自动遵循本插件内置的格式说明。你只需沟通需求，而无需关心格式。', // 「AI 编辑」弹窗顶部说明
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
    'notice.fileMissing': '文件链接指向的文件不存在：', // 点本地文件链接但文件不存在时（后接路径）
    'notice.openFileFail': '打开文件失败：', // 打开本地文件出错时（后接错误）
    'notice.noteMissing': '找不到笔记：', // 点笔记链接但 vault 里找不到时（后接笔记名）
    'notice.openNoteFail': '打开笔记失败：', // 打开笔记出错时（后接错误）
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
    'notice.dataGuardBlocked': '已拦截 28 Notes Mind Map 隐藏文件误删行为（{0} 项）',
    'notice.aiDocsRestored': '已重建 AI 契约文件：{0}', // 28Notes-Files/AI/ 缺失后自动重建完成时（2026-09-17）
    // 全屏（2026-09-22 用户定）：按钮提示 + 两条命令名（均不设默认快捷键，用户自己绑）
    'tb.fullscreen': '窗口全屏（按住 {Mod} 点击：桌面全屏）', // 左侧工具栏全屏按钮悬浮提示（非全屏时）；{Mod} 走 modStr（Mac=⌘ / Win=Ctrl）
    'tb.fullscreenInWindow': '退出全屏模式（按住 {Mod} 点击：桌面全屏）', // 窗口全屏时：直接点击=退出，⌘+点击=升级为桌面全屏（2026-09-22 用户定稿）
    'tb.fullscreenExit': '退出全屏模式', // 桌面全屏时：点 / ⌘+点击 都是退出，所以不再提修饰键
    'cmd.fullscreenWindow': '视图显示｜窗口全屏', // 命令：循环切换（再点一次=退出）
    'cmd.fullscreenDesktop': '视图显示｜桌面全屏', // 命令：循环切换（再点一次=退出）
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
    'cmd.copyAILocate': '其它｜复制 AI 定位路径', // 同上（⌥⌘A）
    'cmd.saveShortcut': '视图整体｜保存为捷径', // 同上（⌘/；对当前视图的主节点建捷径）
    'cmd.editNote': '编辑文本｜节点备注', // 命令：画布动作（默认 Shift+Enter）
    'cmd.toggleShowNow': '视图整体｜（只）显示 Now 当前节点', // 命令：画布动作（默认 Mod+Alt+N）
    'cmd.toggleHideMinor': '视图整体｜显示/隐藏 Minor 次要节点', // 命令：画布动作（默认 Mod+Alt+M）
    'cmd.drillInto': '视图整体｜进入当前节点', // 命令：画布动作（不设默认键：Mod+E 与核心编辑/预览切换撞车）
    'cmd.locateCycle': '视图定位｜定位循环', // 命令：画布动作（不设默认键：Mod+P 与命令面板撞车）
    'cmd.toggleSourceView': '视图切换｜源文件/思维导图视图', // 命令：合并原「查看源文件 / 返回思维导图视图」（2026-09-18）
    'cmd.addSiblingAbove': '新建｜在上方新建同级节点', // 命令：原 ↑ 占用的新建动作（不设默认键，2026-09-18 放给用户）
    'cmd.addParentSibling': '新建｜在上一层新建同级节点', // 命令：原 ← 占用的新建动作（不设默认键）
    'cmd.editStart': '编辑操作｜光标插入节点开始处', // 命令：编辑类（不设默认键；光标落最前；编辑中再按 = 只挪光标）
    'cmd.editEnd': '编辑操作｜光标插入节点末尾处', // 命令：编辑类（不设默认键；光标落最后）
    'cmd.centerNode': '视图定位｜选中节点定位到画面中央', // 命令：居中类（不设默认键；落点 = app.css 定位调参 --locate-selected-x/--locate-y）
    'cmd.centerRoot': '视图定位｜主节点定位到画面中央', // 命令：居中类（不设默认键；落点 = --locate-selected-x/--locate-y，与选中节点同一个自定义居中位）
    'cmd.openAsMarkdown': '查看源文件（28 Notes）', // 命令/文件右键菜单：按纯文本打开（豁免导图视图）
    'cmd.openAsMindmap': '返回思维导图视图（28 Notes）', // 命令/文件右键菜单：从纯文本切回导图视图
    // ---- 文件名相关 ----
    'newMap.name': 'Mind Map', // [已弃用] 新建导图命名已硬编码为 Mind Map N（2026-09-18 用户定：中英文统一，不再走 i18n；键留作兼容）
    'copy.suffix': '-副本', // 「创建副本」的文件名后缀：原文件名 + 这个后缀 + .md
    'snap.beforeRestore': '还原前 · ', // 还原历史版本时自动存的「还原前」快照的命名前缀（后接日期时间）
    'snap.restoredTo': '还原到 · ', // 还原历史版本后自动存的「还原到」快照的命名前缀（后接来源版本的名字或时间）
    // ---- 文件列表徽章（左侧文件树里文件名右侧的小字）----
    'badge.bookmark': '↗', // 文件列表里书签文件右侧的小字（触发点在 main.js updateBookmarkBadges：拼进文件树徽章 CSS）
    'badge.mindmap': '28 Notes', // 文件列表里导图文件右侧的小字（同上，main.js updateBookmarkBadges）
    'menu.newMindmap': '新建思维导图（28 Notes）', // 文件面板右键空白处/文件夹 → 新建菜单项（2026-09-01）
    'menu.copyAiLocate': '复制 AI 定位路径（28Notes）', // 文件面板右键文件名 → 复制「绝对路径（+选中节点 ID）」供 AI Agent 定位编辑（2026-09-02）
    'fold.moreLevels': '更多层级', // 折叠层级「+更多」按钮的悬停提示（Obsidian 状态栏）

    // ============ 设置页（设置 → 第三方插件 → 28 Notes）============
    'settings.uiHeading': '界面', // 设置页最顶端 H2 标题（2026-09-01 定）
    'settings.language': '界面语言', // 语言设置项的名称（2026-09-11 删「支持中文和英文」说明）
    'settings.langAuto': '跟随 Obsidian', // 语言下拉选项一：跟随客户端语言
    'settings.langZh': '中文', // 语言下拉选项二
    'settings.langEn': 'English', // 语言下拉选项三
    'settings.theme': '界面样式', // 主题设置项名称（2026-08-31）
    'settings.themeFeishu': '蓝线', // 主题下拉：飞书蓝线（2026-09-01 与灰/粉对称，改为带括号）
    'settings.themeFeishuGray': '灰线', // 主题下拉：飞书灰线
    'settings.themeFeishuPink': '粉线', // 主题下拉：飞书粉线（2026-09-01 新增）
    // 画布明暗 + 背景色（2026-09-20）：设置页「界面样式」左边那个调色板小按钮弹出来的小窗
    'palette.tip': '高级样式设计',
    'palette.title': '高级样式设计',
    'palette.mode': '明暗模式',
    'palette.modeFollow': '跟随界面',
    'palette.modeLight': '浅色模式',
    'palette.modeDark': '暗色模式',
    'palette.bgLight': '自定义背景色｜浅色模式',
    'palette.bgDark': '自定义背景色｜暗色模式',
    'palette.resetTip': '恢复默认（{0}）',
    // 2026-09-17：媒体分目录（images/video/audio）后，清理范围同步扩大 → 文案由「图片」改「附件」
    'cleanup.heading': '清理未使用的附件', // 设置页区块标题（2026-09-16）
    'cleanup.desc': '为支持删除后撤回操作，<br> 删除带图片/视频等附件的节点时，附件不会被直接删除，需手动清理。<br> 建议每半年扫描清理一次。',
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
    // 二级页入口右侧的灰字说明（2026-09-18 用户定：两行都去掉，入口只留标题 + 箭头）
    'settings.uiSimplify': '界面简化', // 「界面」栏的原生二级页（2026-09-18）：收纳文件类型徽标 / 新增页面提示等
    'settings.advanced': '高级', // 「更多」栏的原生二级页（2026-09-18）：收纳低频且影响数据的操作
    'settings.motion': '动效', // 高级页（2026-09-20）：节点位移过渡的开关，默认开
    'settings.motionDesc': '如果交互时出现卡顿，可关闭动效以减少性能消耗。',
    // ---- 「界面简化」页里的两个分组标题（2026-09-21 改版：不再进二级页，直接摊在这一页）----
    'settings.general': '通用', // 分组标题一：文件类型徽标 / 新增页面提示
    'settings.morePanelSimplify': '更多面板简化', // 分组标题二：左下「更多」菜单那两个可选条目的开关
    'settings.morePanelNote': '为保证基础使用体验，部分操作按钮不支持关闭。', // 备用说明（2026-09-21 起这一页不再显示备注，键先留着）
    'settings.addPanelSimplify': '「添加」面板简化', // ⚠️ 已废弃（该页 2026-09-21 删除）：键留着防旧引用报错
    'settings.addPanelSimplifyDesc': '指选中节点后，底部操作按钮中，+（添加按钮）内操作项',
    'settings.sepRow': '分隔线', // 列表里的分隔线行；三根同名（2026-09-18 用户定：不编号，靠位置区分）
    'settings.presetRow': '介绍', // 「添加面板简化」与「更多面板简化」页顶部共用的一排一次性动作按钮
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
    'settings.tutorialBtn': '查看教程 ↗', // 使用教程右侧按钮文案
    'settings.footnote': '更多', // 「更多」节标题（2026-09-16 由「尾注」改名）
    'settings.centerMode': '画布中央', // 定位基准设置项名称（2026-09-16）
    'settings.centerModeDesc': '建议设为视觉中央，更符合人眼视觉。', // 设置项说明文字
    'settings.centerCanvas': '画布中央', // 选项①：视口几何正中心（默认）
    'settings.centerVisual': '视觉中央', // 选项②：保留自定义落点（＝现在的位置，偏左上）
    'settings.qrMissing': '（二维码图片未找到）', // 赞助二维码图片缺失时的占位文字
    'settings.sponsor': '赞赏开发者', // 赞助项名称
    'settings.sponsorBtn': '赞赏 ↗', // 赞助按钮文字（2026-09-18 起点它弹二维码弹窗）
    'settings.sponsorThanks': '谢谢！', // 赞助弹窗里二维码下方那句话
    'settings.bug': 'Bug 与功能建议', // 建议反馈项名称
    'settings.bugMd': '请添加 Up 主微信：Hi28Notes 沟通。或加入群聊 →', // 建议反馈内容（2026-09-01 去 <br> 压成一段，无空行）

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
    'pro.ctaBtn': '激活创新 Pro 版', // 右上角提示按钮文案（未授权时显示，点击进激活弹窗；2026-09-04）
    'pro.ctaHintTrial': '试用期还剩 {0} 天', // 按钮下方小字：试用中剩余天数（{0}=天数；2026-09-16）
    'pro.ctaHintExpired': '试用期已结束', // 按钮下方小字：试用到期
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
    // ---- 调试栏（2026-09-04，仅作者本机可见）----
    'debug.heading': '调试', // 调试栏大标题
    'debug.toggleName': '调试模式', // 调试开关
    'debug.toggleDesc': '开启后显示调试选项；关闭后本页与普通用户看到的完全一致', // 开关说明
    'debug.stateName': '设置目前激活状态', // 调试项：强制设定本机授权状态
    'debug.stateDesc': '仅影响本机：可直接把试用期设成指定剩余时长，或强制为未激活（已过期）', // 调试项说明
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
    // ============ 导图画面：节点图标 / 折叠箭头 / 备注等悬停提示 ============
    'tip.minorIcon': '此节点已次要 Minor（置灰）', // Minor 节点标题前小图标的悬停提示
    'tip.nowIcon': '此节点已标记 Now', // Now 节点标题前小圆点的悬停提示
    'tip.todoIconTodo': '待办：点击小图标标记为已完成', // 待办节点标题前小方框的悬停提示（2026-09-20）
    'tip.todoIconDone': '已完成：点击小图标标记为待办',
    // 母节点「进度百分比」的黑框提示（2026-09-21 第七轮）：**按"点击之后会变成什么"说**
    'tip.todoPctDone': '点击设为：全部完成',     // 进度未满 100%（**含 0%**：0% 点了就是全部设为完成，2026-09-21 用户定）
    'tip.todoPctUndone': '点击设为：全部未完成', // 100% 时（"回到全都未完成"的出口，不然做完就回不去）
    'tip.unfold': '点击展开', // 节点右侧折叠箭头悬停提示（折叠态）
    'tip.fold': '点击折叠', // 节点右侧折叠箭头悬停提示（展开态）
    'tip.editNote': '双击编辑备注', // 备注行（灰竖条文字）悬停提示
    'tip.image': '单击选中 · 双击放大 · 右键复制', // 节点里图片的悬停提示
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
    'tb.noMinor': '隐藏 Minor 和 Done 节点（当前视图有 M/D 节点时可点击）', // 置灰判据 = **看得见的**范围内没有（2026-09-21 起折叠分支不算）
    'tb.showMinor': '显示 Minor 和 Done 节点', // 隐藏过滤按钮：隐藏中（点此显示；键位段动态追加）
    'tb.hideMinor': '隐藏 Minor 和 Done 节点', // 隐藏过滤按钮：显示中（点此隐藏）
    'tb.nowReadonly': '此按钮在历史页面无法操作', // 历史页里 Now 按钮被禁用的提示
    'tb.noNow': '只显示 Now 节点（当前视图有 Now 节点时可点击）', // 图里没有任何 Now 节点时 Now 按钮的提示（置灰）
    'tb.nowShowAll': '取消只显示 Now 节点', // 只看 Now 按钮：开启中（点此恢复显示全部；键位段动态追加）
    'tb.nowOnly': '只显示 Now 节点', // 只看 Now 按钮：关闭中（点此只看 Now）
    'tb.undo': '撤销（{Mod}+Z）', // 撤销按钮 tooltip（写死键不给自定义，静态没问题）
    'tb.redo': '重做（{Mod}+Shift+Z）', // 重做按钮 tooltip（同上）
    'tb.locate': '定位到中心节点', // 定位按钮 tooltip（键位段动态追加；未绑时回退写死的 Mod+P）
    'tb.minorToggle': '隐藏/显示次要 Minor 节点', // 隐藏/显示 Minor 按钮初始 tooltip（键位段动态追加）

    // ============ 节点工具栏（选中节点时底部弹出的黑色圆条按钮 tooltip）============
    'nm.bold': '加粗节点', // 键位段由画布键位表动态追加（nmKeySuffix），不再写死（2026-09-18）
    'nm.red': '标为红色', // 标红按钮
    'nm.yellow': '标为黄色', // 标黄按钮
    'nm.note': '添加备注', // 写备注按钮（键位段由 nmKeySuffix 动态追加，随改键实时变）
    'nm.now': '设为当前关注 Now 节点', // 标记 Now 按钮
    'nm.minor': '设为次要 Minor 节点', // 标记 Minor 按钮
    // 待办按钮（2026-09-20）：提示两行随选中节点状态换 —— {0}/{1} 是动态键位段（nmKeySuffix）
    'nm.todoPlainTip': '设为待办节点{0}（按住 {Mod} ：设为已完成）', // 选中普通节点（2026-09-21 第五轮；{Mod} 按平台=⌘/Ctrl）
    'nm.todoOffTip': '设为普通节点{0}', // 选中待办 / 已完成节点（此时按住 ⌘ 无特殊效果）
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
    'more.addChild': '添加子节点',
    'more.addChildTip': '快捷键：Tab',
    'more.addSibling': '添加同级节点',
    'more.addSiblingTip': '快捷键：Enter',
    'more.delNode': '删除节点',
    'more.delNodeTip': '快捷键：Delete',
    // 注：「添加其他内容」与底部「样式」按钮都**有子菜单 → 不挂提示**（会和子菜单叠住），
    // 所以它们的提示文案/短标签已删；说明文案改挂在子菜单那一项上（见 nm.bold / nm.red / nm.yellow）。
    'more.addOther': '添加其他内容',
    'more.aiEdit': 'AI 编辑', // 添加面板新条目（2026-09-18）：右键「复制 AI 定位」的可视化形态
    'more.aiEditTip': '点击复制 AI 定位信息',
    'more.customPanel': '自定义该面板', // 二级面板底部入口：点开 → 设置页「添加面板简化」
    'more.customPanelTip': '可选择隐藏部分操作按钮',
    'more.addImage': '添加图片',
    'more.addImageTip': '支持主流图片格式（可直接粘贴）', // 用户指定文案
    'more.addVideo': '添加视频',
    'more.addVideoTip': '支持主流视频格式',
    'more.addAudio': '添加音频',
    'more.addAudioTip': '支持主流音频格式',
    'more.addVaultAttach': '添加 Obsidian 附件',
    'more.addVaultAttachTip': '添加后，可引用库里已有的音视频（可直接粘贴）',
    'more.addVaultAttachHint': '当你在普通笔记粘贴图片 / 视频时，该文件会存入 Obsidian 默认附件文件夹。你可以选择将它的文件名（如 xxx.png）或路径粘进来，思维导图会识别并渲染。（只是建立引用，不会复制文件）',
    'more.addFileLink': '添加本地文件链接',
    'more.addFileLinkTip': '添加后，点击即可跳转至本地文件（可直接粘贴）',
    'more.addFileLinkHint': '请填写完整文件路径，例如 /Users/…/文件.pdf。（你也可在选中节点时（非编辑状态下），直接粘贴地址）',
    'more.addWiki': '添加双链',
    'more.addWikiTip': '添加后，可一键跳转至其它页面（快捷键：[[ )', // ⚠️ 末尾「[[ )」是**半角右括号 + 空格**，用户特意这么写的（2026-09-21），别"顺手"改成全角
    'more.addNodeLink': '添加关联节点',
    'more.addNodeLinkTip': '添加后，可一键跳转至对应节点（可直接粘贴）',
    'more.addNodeLinkHint': '选中要关联的节点，右键「复制节点链接」，并粘贴至此处即可关联。支持跨思维导图粘贴；支持选中节点后直接粘贴。',
    // 两个输入框的**预设文字**（2026-09-20 从代码里抽出来）：英文界面曾露出中文「文件」/「文件名」
    'more.addFileLinkPh': '/Users/…/文件.pdf',
    'more.addNodeLinkPh': '[[文件名#节点ID]]',
    // 「建议反馈」行右侧的加群按钮（2026-09-20 从代码里抽出来：英文界面曾只有中文）
    'settings.joinGroupBtn': '加入群聊 ↗',
    // Pro / 付费弹窗里的少量固定文案（2026-09-20 抽出）。⚠️ 弹窗正文是设计稿绝对定位的长页，仍为中文（要英文版得单独做一版排版）
    'pm.scrollHint': '鼠标滚动以向下查看',
    'pay.shareBtn': '分享免费领会员',
    'pay.emailCopied': '邮箱已复制',
    'pay.emailCopyFail': '复制失败，请手动复制',
    'more.addUrlLink': '添加网页链接',
    'more.addUrlLinkTip': '添加后，可一键打开网页（可直接粘贴）',
    'more.urlText': '显示文字',
    'more.urlAddr': '链接地址',
    // 「添加网页链接」弹窗里的说明——与条目悬浮提示**分开两个键**，方便各自单独改（用户 2026-09-17）
    'more.addUrlLinkHint': '网址请以 www. / https://www. 开头，否则可能识别异常。显示文字留空时，会直接显示网址。',
    'more.pickFail': '导入失败：没能读取所选文件',
    'more.pickPrompt': '选择要导入的文件',

    // ============ 操作提示条（画面底部/顶部黑色浮出提示）============
    'toast.hiddenMinor': '已隐藏此 Minor 节点', // 隐藏 Minor 后（带撤销按钮）
    'toast.hiddenNow': '已隐藏此 Now 节点', // 只看 Now 视图下取消 Now 标记后（节点从画面消失，带撤销）
    'toast.hiddenAlsoDeleted': '提示：{0} 个被隐藏的次要 Minor 子节点也被删除了', // 删除节点时连带删除了被隐藏的 Minor 子节点（{0}=数量）
    'toast.pasteLink': '请先选中一个节点，再粘贴链接', // 未选中节点就 Cmd+V 粘贴链接时
    'toast.pasteFileLink': '请先选中一个节点，再粘贴文件链接', // 未选中节点就粘贴文件链接时
    'toast.pasteImg': '请先选中一个节点，再粘贴图片', // 未选中节点就粘贴图片时
    'toast.pasteFirst': '请先选中一个节点，再粘贴', // 未选中节点就粘贴普通文本时
    'toast.imgSavedNoNode': '图片已保存，但目标节点已不存在', // 粘贴图片存盘成功但目标节点已被删
    'toast.showNowEmpty': '当前视图没有 Now 节点，「只看当前关注」未开启', // 点「只看 Now」但当前视图（当前根范围）没有 now 标记节点（2026-08-31）
    'toast.imgSaveFail': '图片保存失败', // 粘贴图片写盘失败
    'toast.bookmarkRelocated': '原捷径节点已被删除 / 更名，已重定位至主节点', // 打开书签但指向的节点已被删（回退到主节点）
    'toast.restored': '已还原到该历史版本（已记成一条新版本；还原前的内容也保留着，随时能找回）', // 历史还原成功后
    'toast.copyCreated': '已创建副本：{0}', // 从历史快照创建副本成功（{0}=新文件名）
    'toast.histSnapGone': '找不到正在查看的这一版了（它可能已被删除）。回历史记录里重新点一条再试。', // 横幅按钮取不到那一版快照时（2026-09-19；绝不静默）
    'toast.restoreFinishFail': '这一版已经还原到文件里了，但画布刷新出错 —— 重开这个导图即可看到', // 宿主还原成功、前端收尾抛异常时（2026-09-19）
    'toast.jumpFail': '未找到链接目标（可能已被删除）', // 点节点链接但目标节点已被删
    'toast.histReadonly': '历史页为只读，退出历史页后才能保存当前版本', // 历史页里点「保存此版本」时
    'toast.histNoEdit': '历史界面只读，不能修改内容', // 历史界面里碰到编辑入口时（如定位菜单二次点击改标题）
    'toast.versionSaved': '已保存当前版本', // 手动命名保存版本成功后
    'toast.versionDeleted': '已删除该版本', // 删除单条历史版本成功后
    'toast.versionRenamed': '已重命名该版本', // 重命名单条历史版本成功后
    'toast.aiLocateCopied': '已复制，请在 Agent 里粘贴', // 复制 AI 定位路径 成功后
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
    'ctx.drillTip': '让视图中只显示这一节点内容{0}', // ⚠️ 预埋文案（2026-09-21 用户要求「你先自己预埋」，待用户改）
    'ctx.bookmarkTip': '保存为新页面，下次可快速进入该视图{0}', // ⚠️ 预埋文案（同上）
    'ctx.basicOps': '基础操作', // 右键二级菜单（2026-09-21）：剪切 / 复制 / 粘贴 / 删除收在这里
    'ctx.cut': '剪切',
    'ctx.copy': '复制',
    'ctx.paste': '粘贴',
    'ctx.delete': '删除',
    'ctx.pasteUseKey': '读不到剪贴板，请用 {Mod}+V 粘贴', // 右键「粘贴」读剪贴板失败时的提示（{Mod} 按平台=⌘/Ctrl）
    'more.kbdPaste': '粘贴', // 「＋添加」面板各条目右侧的操作提示（2026-09-21 用户定）：直接粘贴即可
    'more.kbdWiki': '[[', // 双链：打两个方括号触发
    'more.kbdTab': 'Tab', // 添加子节点
    'more.kbdEnter': 'Enter', // 添加同级节点
    'ctx.copyLink': '复制节点链接', // 菜单项：复制 [[文件名#pid]] 节点链接
    'ctx.bookmark': '保存为捷径', // 菜单项：为该节点创建书签文件
    'ctx.bookmarkHint': '不写默认为节点名', // 书签命名弹框输入框里的灰色占位提示
    'ctx.editLink': '编辑链接', // 菜单项：双击编辑链接的菜单版（仅文件/URL 链接显示）
    'ctx.copyAILocate': '复制 AI 定位路径', // 菜单项：复制「文件绝对路径 + 节点 ID」，供 AI Agent 定位编辑
    'ctx.copyAILocateTip': '让 AI Agent 快速定位你要编辑的节点{0}', // 复制 AI 定位路径 悬浮说明
    // 复制给 AI 的定位文案（2026-09-20 用户改版）：**单行 + 【】外框**（用户要「一整块粘贴」，所以不分行），
    // 路径 / 节点 ID 用占位符填入。两版：node = 带节点 ID（节点右键 / AI 编辑按钮）；file = 只有路径（文件列表右键）。
    // 语言跟着界面语言（中文界面复制中文、英文界面复制英文）—— AI 读的是文案本身，所以必须跟着走。
    'aiLocate.node': '【1. 找到待编辑文档，路径：{0}；2. 查看文档顶部的 FrontMatter 提示，了解编辑时需严格遵循的格式准则；3. 使用节点 id 定位到要编辑的节点，节点 ID 为：{1}；4. 基于用户指令开始编辑】',
    'aiLocate.file': '【1. 找到待编辑文档，路径：{0}；2. 查看文档顶部的 FrontMatter 提示，了解编辑时需严格遵循的格式准则；3. 基于用户指令开始编辑】',
    // 新建导图时预埋进 frontmatter 的两段 AI 提示（2026-09-20）：**新建/首次注入那一刻按当时的语言写死**，
    // 之后切语言一律不改（存量文件里的文字保持原样 —— 变来变去容易出错，用户定）。
    'fm.ai': '改本文件前先读 28Notes-Files/AI/index.md，严格按其指引操作，否则文件打开可能会出现严重乱码',
    'fm.aiLocate': '定位节点：在文件中搜索 id:<节点ID>（节点 ID 形如 <!--id:xxx-->，写在标题行行尾，不是 Obsidian 的 ^块锚点，不要拼到文件路径后面打开）。',
    'ctx.copyLinkTip': '可粘贴到其它思维导图，点击跳转回这里{0}', // 复制节点链接 悬浮说明

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
    'hist.empty': '还没有历史版本。<br>编辑时会自动存档（内容有变化、且距上一份 ≥20 秒）；也可用画布「更多」菜单里的「保存此版本」手动命名存档。', // 面板/列表没有历史快照时的占位（<br> = 换行）
    'hist.auto': '自动保存', // 自动快照在时间线里的标签（手动命名的显示你起的名字）
    'hist.justNow': '刚刚 · {0}', // 时间线时间：3 分钟内（{0}=时:分）
    'hist.today': '今天', // 时间线时间：当天
    'hist.yesterday': '昨天', // 时间线时间：昨天
    'hist.dateMD': '{0} 月 {1} 日', // 时间线时间：同年（{0}=月 {1}=日）
    'hist.dateYMD': '{0} 年 {1} 月 {2} 日', // 时间线时间：跨年（{0}=年 {1}=月 {2}=日）
    'hist.rename': '重命名此版本', // 每条记录「⋯」菜单：给这条版本改名
    'hist.delete': '删除此版本', // 每条记录「⋯」菜单：删掉这条版本
    'hist.itemMenu': '更多操作', // 每条记录右侧「⋯」按钮的悬停提示
    'hist.renameTitle': '重命名这个版本', // 重命名弹框标题
    'hist.renameHint': '（留空 = 记为「自动保存」）', // 重命名弹框输入框占位
    'hist.confirmDelete': '确定删除这条历史版本？删除后插件内无法找回（文件会移入系统废纸篓）。', // 删除版本确认弹窗
    // ---- 原生「历史记录」右侧面板（2026-09-14）----
    'hist.panelTitle': '28 Notes Mind Map 历史记录', // 面板标签名 / tooltip / 面板顶部标题
    'hist.rules': '保存规则', // 面板顶部右侧小按钮：点开/收起下面的规则说明
    // 点「保存规则」展开的三行小字（带 <br>，必须走 innerHTML；用 text 会把标签当字面量显示出来）
    'hist.rulesText': '编辑时会高频保存历史版本，<br>时间较久的版本会自动删减，<br>手动保存 / 重命名的版本不会自动删减。',
    'hist.noMap': '当前没有打开的思维导图', // 面板空态：没有可跟随的导图（非 28 Notes 文件时列表直接清空，不显示文案）
    'cmd.openHistory': '其它｜打开历史记录面板', // 命令：面板被关掉后的找回入口
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

    'frame.nowSide': 'Show Now Nodes Only',
    'frame.mdPlaceholder': '- Top-Level Node\n  - Child Node',
    'mm.undo': 'Undo',
    'mm.redo': 'Redo',
    'mm.pathBack': 'Previous Path',
    'mm.pathFwd': 'Next Path',
    'mm.pathDefault': 'Back to Default Path',
    'mm.pathSave': 'Set Current as Default Path',
    'mm.history': 'History',
    'mm.saveVersion': 'Save This Version',
    'mm.guide': 'User Guide ↗',
    'mm.joinGroup': 'Join WeChat Group ↗',
    'mm.saveShortcut': 'Save This View as a Shortcut',
    'aiEdit.desc': 'Copy the locator below and paste it into any AI agent — it will open this document and jump straight to the node.',
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
    'notice.fileMissing': 'The File This Link Points to Does Not Exist: ',
    'notice.openFileFail': 'Failed to Open File: ',
    'notice.noteMissing': 'Note Not Found: ',
    'notice.openNoteFail': 'Failed to Open Note: ',
    'notice.copyFailSnap': 'Failed to Create a Copy: ',
    'notice.githubUnset': 'GitHub Link Is Not Configured yet',
    'cmd.newMap': 'New Mind Map (28 Notes)',
    'cmd.boldNode': 'Text | Bold Node',
    'cmd.redNode': 'Node | Mark the Selected Node Red',
    'cmd.yellowNode': 'Node | Mark the Selected Node Yellow',
    'cmd.nowNode': 'Node | (Un)Set the Selected Node as Now',
    'cmd.minorNode': 'Node | (Un)Set the Selected Node as Minor',
    // Two to-do commands (2026-09-20): a plain node lands on Todo / Done respectively, then both cycle.
    // Only one to-do command now (2026-09-20): pure toggle, same as the toolbar button.
    'cmd.todoNode': 'Node | (Un)Set as To-Do',
    'cmd.todoDoneNode': 'Node | (Un)Set as Done',
    'cmd.copyNodeLink': 'Other | Copy Node Link',
    'cmd.copyAILocate': 'Other | Copy AI Locate Path',
    'cmd.saveShortcut': 'View | Save as Shortcut',
    'cmd.editNote': 'Text | Node Note',
    'cmd.toggleShowNow': 'View | Show Only Now Nodes',
    'cmd.toggleHideMinor': 'View | Show/Hide Minor Nodes',
    'cmd.drillInto': 'View | Enter the Current Node',
    'cmd.locateCycle': 'Locate | Locate Cycle',
    'cmd.toggleSourceView': 'Toggle | Source / Mind-Map View',
    'cmd.addSiblingAbove': 'New | Add a Sibling Above',
    'cmd.addParentSibling': 'New | Add a Sibling One Level up',
    'cmd.editStart': 'Cursor | Move the Caret to the Start of the Node',
    'cmd.editEnd': 'Cursor | Move the Caret to the End of the Node',
    'cmd.centerNode': 'Locate | Center the Selected Node (Works while Editing)',
    'cmd.centerRoot': 'Locate | Center the Root Node',
    'cmd.openAsMarkdown': 'View in the Obsidian Editor',
    'cmd.openAsMindmap': 'View in the 28 Notes Mind Map Editor',
    'newMap.name': 'Mind Map', // [deprecated] naming is hardcoded as "Mind Map N" now (2026-09-18)
    'copy.suffix': ' Copy',
    'snap.beforeRestore': 'Before Restore · ',
    'snap.restoredTo': 'Restored to · ',
    'badge.bookmark': '↗',
    'badge.mindmap': 'Mind Map',
    'menu.newMindmap': 'New Mind Map (28 Notes)',
    'menu.copyAiLocate': 'Copy AI Locate Path (28Notes)',
    'fold.moreLevels': 'More Levels',

    'settings.uiHeading': 'Interface',
    'settings.language': 'Interface Language',
    'settings.langAuto': 'Follow Obsidian',
    'settings.langZh': '中文',
    'settings.langEn': 'English',
    'settings.theme': 'Interface Style',
    'settings.themeFeishu': 'Blue Lines',
    'settings.themeFeishuGray': 'Gray Lines',
    // Canvas light/dark + background (2026-09-20): opened from the palette button left of "Interface style"
    'palette.tip': 'Advanced Styling',
    'palette.title': 'Advanced Styling',
    'palette.mode': 'Light & Dark',
    'palette.modeFollow': 'Follow UI',
    'palette.modeLight': 'Light Mode',
    'palette.modeDark': 'Dark Mode',
    'palette.bgLight': 'Custom Background｜Light Mode',
    'palette.bgDark': 'Custom Background｜Dark Mode',
    'palette.resetTip': 'Restore Default ({0})',
    'settings.themeFeishuPink': 'Pink Lines',
    // 2026-09-17: media split into images/video/audio → cleanup now covers all three; wording "images" → "attachments"
    'cleanup.heading': 'Clean up Unused Attachments',
    'cleanup.desc': 'So that deleting can be undone,<br> when you delete a node that contains attachments (images / videos / audio), the files themselves are not deleted — clean them up manually.<br> A scan every six months is recommended.',
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
    'notice.dataGuardBlocked': 'Blocked an Accidental Deletion of the 28 Notes Mind Map Hidden Files ({0} Items)',
    'notice.aiDocsRestored': 'Rebuilt AI Contract File: {0}',
    'tb.fullscreen': 'Fullscreen (Hold {Mod} and Click for True Full Screen)',
    'tb.fullscreenInWindow': 'Exit Full Screen (Hold {Mod} and Click for True Full Screen)',
    'tb.fullscreenExit': 'Exit Full Screen',
    'cmd.fullscreenWindow': 'View | Window Fullscreen',
    'cmd.fullscreenDesktop': 'View | Desktop Fullscreen',
    'settings.badgeStyle': 'File Type Badge',
    'settings.badgeStyleDesc': 'It refers to the type badge on the right of the file name in the file list. This design avoids confusion between file types.',
    'settings.badgeStyleText': '28 Notes Text',
    'settings.badgeStyleIcon': '28 Notes Icon',
    'settings.hideHint': 'New-Page Hint',
    'settings.hideHintDesc': 'After creating a new mind-map, a beginner hint appears below the root node. You can choose to hide it. ',
    'settings.uiSimplify': 'Interface Simplification', // Native sub-page under "Interface" (2026-09-18)
    'settings.advanced': 'Advanced', // Native sub-page under "More" (2026-09-18)
    'settings.motion': 'Motion', // Under "Advanced" (2026-09-20): node shift transition, on by default
    'settings.motionDesc': 'If Interaction Feels Laggy, Turn Motion off to Reduce Performance Cost.',
    // ---- Two group headings inside "Interface simplification" (2026-09-21: no more sub-page) ----
    'settings.general': 'General',
    'settings.morePanelSimplify': '"More" Panel Simplification',
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
    'settings.tutorialBtn': 'View Tutorial ↗',
    'settings.footnote': 'More',
    'settings.centerMode': 'Canvas Center',
    'settings.centerModeDesc': 'Tip: Choose Visual Center — It Fits Natural Eye Movement Better.',
    'settings.centerCanvas': 'Canvas Center',
    'settings.centerVisual': 'Visual Center',
    'settings.qrMissing': '(QR Code Image Not Found)',
    'settings.sponsor': 'Tip the Developer',
    'settings.sponsorBtn': 'Tip ↗',
    'settings.sponsorThanks': 'Thank You!',
    'settings.bug': 'Bugs & Feature Requests',
    'settings.bugMd': 'Add the creator on WeChat: Hi28Notes. Or join the group chat →',

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
    'pro.ctaHintTrial': 'Trial: {0} Days Left', // button-below hint: trial remaining days
    'pro.ctaHintExpired': 'Trial Ended', // button-below hint: trial expired
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
    // ---- Debug section (2026-09-04, author machine only) ----
    'debug.heading': 'Debug',
    'debug.toggleName': 'Debug Mode',
    'debug.toggleDesc': 'When on, debug options appear. When off, this page looks exactly like a regular user’s.',
    'debug.stateName': 'Set Activation State',
    'debug.stateDesc': 'Local machine only: force the trial to a given remaining time, or force it to expired.',
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

    'tip.minorIcon': 'This Node Is Marked Minor (Grayed out)',
    'tip.nowIcon': 'This Node Is Marked Now',
    'tip.todoIconTodo': 'To-Do: Click the Icon to Mark as Done', // to-do node prefix icon (2026-09-20)
    'tip.todoIconDone': 'Done: Click the Icon to Mark as To-Do',
    // Parent progress-percentage tooltip (2026-09-21): phrased as "what clicking will do"
    'tip.todoPctDone': 'Click to Set All as Done',    // progress below 100% (including 0%)
    'tip.todoPctUndone': 'Click to Set All as Not Done', // at 100% — the way back
    'tip.unfold': 'Click to Unfold',
    'tip.fold': 'Click to Fold',
    'tip.editNote': 'Double-Click to Edit the Note',
    'tip.image': 'Click to Select · Double-Click to Zoom · Right-Click to Copy',
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
    'tb.noMinor': 'Hide Minor and Done Nodes (Active When This View Has M/D Nodes)', // 中文同步（2026-09-22）：说的是「这个按钮干什么」而不是「为什么灰」
    'tb.showMinor': 'Show Minor and Done Nodes',
    'tb.hideMinor': 'Hide Minor and Done Nodes',
    'tb.nowReadonly': 'This Button Is Unavailable on the History Page',
    'tb.noNow': 'Show Now Nodes Only (Active When This View Has a Now Node)', // 中文同步（2026-09-22）
    'tb.nowShowAll': 'Stop Showing Now Nodes Only',
    'tb.nowOnly': 'Show Now Nodes Only',
    'tb.undo': 'Undo ({Mod}+Z)',
    'tb.redo': 'Redo ({Mod}+Shift+Z)',
    'tb.locate': 'Locate the Central Node',
    'tb.minorToggle': 'Hide/Show Minor Nodes',

    'nm.bold': 'Bold the Node',
    'nm.red': 'Mark Red',
    'nm.yellow': 'Mark Yellow',
    'nm.note': 'Add a Note',
    'nm.now': 'Mark as Now Node',
    'nm.minor': 'Mark as Minor Node',
    // To-do button (2026-09-20): the tip swaps with the selected node's state; {0}/{1} = dynamic key segments
    'nm.todoPlainTip': 'Click to Mark as Todo{0} (Hold {Mod}: Mark Done)',
    'nm.todoOffTip': 'Mark as a Plain Node{0}',
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
    'more.addChild': 'Add Child Node',
    'more.addChildTip': 'Shortcut: Tab',
    'more.addSibling': 'Add Sibling Node',
    'more.addSiblingTip': 'Shortcut: Enter',
    'more.delNode': 'Delete Node',
    'more.delNodeTip': 'Shortcut: Delete',
    'more.addOther': 'More Options',
    'more.aiEdit': 'AI Edit',
    'more.aiEditTip': 'Click to Copy the AI Locator Info',
    'more.customPanel': 'Customize This Panel',
    'more.customPanelTip': 'Choose Which Buttons to Hide',
    'more.addImage': 'Add Image',
    'more.addImageTip': 'Supports Common Image Formats (Paste Directly)',
    'more.addVideo': 'Add Video',
    'more.addVideoTip': 'Supports Common Video Formats',
    'more.addAudio': 'Add Audio',
    'more.addAudioTip': 'Supports Common Audio Formats',
    'more.addVaultAttach': 'Add Attachment from Vault',
    'more.addVaultAttachTip': 'Reference Images / Videos Already in Your Vault (Paste Directly)',
    'more.addVaultAttachHint': 'When you paste an image / video into a normal note, Obsidian saves the file into its default attachment folder. Paste its file name (e.g. xxx.png) or path here and the mind map will find and render it. (This only creates a reference — the file is not copied.)',
    'more.addFileLink': 'Add Local File Link',
    'more.addFileLinkTip': 'Click It Later to Open the Local File (Paste Directly)',
    'more.addFileLinkHint': 'Enter a file path, e.g. /Users/…/file.pdf. (You can also select a node while not editing and paste the path directly.)',
    'more.addWiki': 'Add Wiki Link',
    'more.addWikiTip': 'Click It Later to Jump to That Page (Shortcut: [[ )', // trailing "[[ )" = half-width paren + space, intentional (matches zh)
    'more.addNodeLink': 'Add Linked Node',
    'more.addNodeLinkTip': 'Click It Later to Jump to That Node (Paste Directly)',
    'more.addNodeLinkHint': 'Select the target node in the other mind map, right-click "Copy node link", then paste it here. Works across mind maps; you can also select a node and paste directly.',
    // Input placeholder presets (2026-09-20): these used to be hard-coded Chinese and leaked into the English UI
    'more.addFileLinkPh': '/Users/…/File.Pdf',
    'more.addNodeLinkPh': '[[File Name#Node ID]]',
    'settings.joinGroupBtn': 'Join Group Chat ↗',
    // A few fixed strings inside the Pro / payment modals (2026-09-20). ⚠️ The payment page body is a designed,
    // absolutely-positioned Chinese layout and stays Chinese for now (an English version needs its own layout pass).
    'pm.scrollHint': 'Scroll Down to See More',
    'pay.shareBtn': 'Share to Get Free Membership',
    'pay.emailCopied': 'Email Copied',
    'pay.emailCopyFail': 'Copy Failed — Please Copy It Manually',
    'more.addUrlLink': 'Add Web Link',
    'more.addUrlLinkTip': 'Open the webpage with one click (Paste Directly)',
    'more.urlText': 'Display Text',
    'more.urlAddr': 'URL',
    'more.addUrlLinkHint': 'Top: the display text. Bottom: the URL (starting with www. / https://). If the display text is left empty, the URL is shown instead.',
    'more.pickFail': 'Import Failed: Could Not Read the Selected File',
    'more.pickPrompt': 'Choose File(s) to Import',

    'toast.hiddenMinor': 'Minor Node Hidden',
    'toast.hiddenNow': 'Now Node Hidden',
    'toast.hiddenAlsoDeleted': 'Note: {0} Hidden Minor Child Nodes Were Deleted as Well',
    'toast.pasteLink': 'Select a Node before Pasting a Link',
    'toast.pasteFileLink': 'Select a Node before Pasting a File Link',
    'toast.pasteImg': 'Select a Node before Pasting an Image',
    'toast.pasteFirst': 'Select a Node before Pasting',
    'toast.imgSavedNoNode': 'Image Saved, but the Target Node No Longer Exists',
    'toast.showNowEmpty': 'No Now Nodes in the Current View — "Focus on Now" Not Enabled',
    'toast.imgSaveFail': 'Failed to Save the Image',
    'toast.bookmarkRelocated': 'The Shortcut Node Has Been Deleted or Renamed — Relocated to the Central Node',
    'toast.restored': 'Restored to this version (it is saved as a new version; the content before the restore is kept too)',
    'toast.copyCreated': 'Copy Created: {0}',
    'toast.histSnapGone': 'The version you were viewing could not be found (it may have been deleted). Open history and pick a version again.',
    'toast.restoreFinishFail': 'This version is already restored in the file, but the canvas failed to refresh — reopen this map to see it',
    'toast.jumpFail': 'Link Target Not Found (It May Have Been Deleted)',
    'toast.histReadonly': 'The History Page Is Read-Only — Exit It before Saving the Current Version',
    'toast.histNoEdit': 'The history view is read-only; content cannot be edited here',
    'toast.versionSaved': 'Current Version Saved',
    'toast.versionDeleted': 'Version Deleted',
    'toast.versionRenamed': 'Version Renamed',
    'toast.aiLocateCopied': 'Copied — Paste It into Your AI Agent',
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
    'ctx.drill': 'Enter the Current Node',
    'ctx.drillTip': 'Show Only This Node in the View{0}', // {0} = hotkey segment, filled by nmKeySuffix()
    'ctx.bookmarkTip': 'Save as a New Page to Jump Back into This View Later{0}', // {0} = hotkey segment
    'ctx.basicOps': 'Basic Actions',
    'ctx.cut': 'Cut',
    'ctx.copy': 'Copy',
    'ctx.paste': 'Paste',
    'ctx.delete': 'Delete',
    'ctx.pasteUseKey': 'Clipboard Unavailable — Paste with {Mod}+V',
    'more.kbdPaste': 'Paste',
    'more.kbdWiki': '[[',
    'more.kbdTab': 'Tab',
    'more.kbdEnter': 'Enter',
    'ctx.copyLink': 'Copy Node Link',
    'ctx.bookmark': 'Save as Shortcut',
    'ctx.bookmarkHint': "(Optional — defaults to the node's title)",
    'ctx.editLink': 'Edit Link',
    'ctx.copyAILocate': 'Copy AI Locate Path',
    'ctx.copyAILocateTip': 'Let an AI Agent Quickly Locate the Node You Want to Edit{0}', // {0} = hotkey segment
    // AI locate text (2026-09-20): single line wrapped in 【】 (user wants to paste it as one block), {0} = path, {1} = node ID.
    'aiLocate.node': '【1. Find the document to edit, path: {0}; 2. Check the FrontMatter hint at the top of the document for the format rules you must follow strictly; 3. Use the node id to locate the node to edit, node ID: {1}; 4. Start editing based on the user\'s instruction】',
    'aiLocate.file': '【1. Find the document to edit, path: {0}; 2. Check the FrontMatter hint at the top of the document for the format rules you must follow strictly; 3. Start editing based on the user\'s instruction】',
    // Frontmatter AI hints written into a file when it is created / first injected (2026-09-20):
    // language is taken **at write time** and never rewritten afterwards (switching language must not touch existing files).
    'fm.ai': 'Before editing this file, read 28Notes-Files/AI/index.md and follow it strictly — otherwise the file may show garbled content when opened',
    'fm.aiLocate': 'Locate a node: search for id:<node ID> in the file (node IDs look like <!--id:xxx-->, they sit at the end of the heading line — not an Obsidian ^block anchor, and must not be appended to the file path when opening).',
    'ctx.copyLinkTip': 'Paste into Another Mind Map to Jump Back Here{0}', // {0} = hotkey segment

    'fold.menuKeep': 'Fold the Selected Node to Level {0} (Keep Everything Else Unchanged) (Click)',
    'fold.menuMin': 'Fold the selected node to level {0} (fold everything else to the minimum) (hold {Mod} and click)',
    'fold.level': 'Fold to Level {0}',
    'fold.levelKeep': 'Fold the Selected Node to Level {0}',
    'fold.levelMin': 'Fold "the Selected Node" to Level {0} (Fold Everything Else to the Minimum)',
    'fold.noMore': 'Temporarily Unavailable',

    'locate.root': 'Central Node',
    'locate.selected': 'Selected Node',
    'locate.to': 'Locate {0}',

    'banner.setLatest': 'Set This Version as Latest',
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
    'hist.copy': 'Create a Copy',
    'hist.promptTitle': 'Name This Version',
    'hist.promptHint': '(Optional)',
    'hist.confirmRestore': 'Overwrite the current file with this version? ',
    'hist.empty': 'No history yet.<br>A version is saved automatically as you edit (only when the content changed and at least 20s after the previous one). You can also use "Save this version" in the canvas "More" menu to save a named one.',
    'hist.auto': 'Auto Save',
    'hist.justNow': 'Just Now · {0}',
    'hist.today': 'Today',
    'hist.yesterday': 'Yesterday',
    'hist.dateMD': '{0}/{1}',
    'hist.dateYMD': '{1}/{2}/{0}',
    'hist.rename': 'Rename This Version',
    'hist.delete': 'Delete This Version',
    'hist.itemMenu': 'More Actions',
    'hist.renameTitle': 'Rename This Version',
    'hist.renameHint': '(Empty = "Auto Save")',
    'hist.confirmDelete': 'Delete this version? It cannot be recovered from the plugin (the file goes to the system trash).',
    'hist.panelTitle': '28 Notes Mind Map History',
    'hist.rules': 'Save Rules',
    'hist.rulesText': 'Versions are saved frequently while editing.<br>Old versions are thinned out automatically.<br>Manually saved / renamed versions are never thinned out.',
    'hist.noMap': 'No Mind Map Is Open',
    'cmd.openHistory': 'Other | Open History Panel',
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
