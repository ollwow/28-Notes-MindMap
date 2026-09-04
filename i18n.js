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
    'frame.refresh': '刷新画面（重新读取文件并重新渲染）', // 顶部刷新按钮 tooltip（当前该按钮隐藏，留作备用）
    'frame.nowSide': '只显示 Now 节点', // 左侧 Now 按钮的初始 tooltip（运行时会被动态文案覆盖，改了可能看不到）
    'frame.mdPlaceholder': '- 一级节点\n  - 子节点', // 文本视图输入框的灰色占位示例（当前文本视图无 UI 入口，备用）
    // ---- 左下角「更多」(三个点)弹层菜单的菜单项 ----
    'mm.addChild': '子节点', // 菜单项：新建子节点（快捷键 Tab）
    'mm.addSibling': '同级', // 菜单项：新建同级节点（快捷键 Enter）
    'mm.delete': '删除', // 菜单项：删除选中节点
    'mm.undo': '撤销', // 菜单项：撤销（Cmd+Z）
    'mm.redo': '重做', // 菜单项：重做（Cmd+Shift+Z）
    'mm.pathLink': '路径链接', // 菜单分组标题：下钻路径相关的四个子项（下面四条）
    'mm.pathBack': '上一路径', // 路径子菜单：回到上一下钻位置
    'mm.pathFwd': '下一路径', // 路径子菜单：前进到下一下钻位置
    'mm.pathDefault': '返回默认路径', // 路径子菜单：回到保存的默认下钻位置
    'mm.pathSave': '更新为当前路径', // 路径子菜单：把当前下钻位置存为默认（普通导图）/ 更新书签指向（书签文件）
    'mm.debug': '界面调试', // 菜单项：界面调试入口（已隐藏，备用）
    'mm.history': '历史记录', // 菜单项：打开历史记录页
    'mm.saveVersion': '保存此版本', // 菜单项：手动命名保存当前版本快照
    'mm.about': '了解 28 笔记法 ↗', // 菜单项：跳转 B 站了解插件
    'mm.settings': '设置与 Bug 提报', // 菜单项：打开插件设置页（2026-09-01）

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
    // ---- 命令面板（Cmd+P）与文件右键菜单里显示的命令名（改完要重载插件才变）----
    'cmd.newMap': '新建思维导图（28 Notes）', // 命令名 + 左侧 Ribbon 按钮悬停提示：新建导图
    'cmd.openAsMarkdown': '查看源文件（28 Notes）', // 命令/文件右键菜单：按纯文本打开（豁免导图视图）
    'cmd.openAsMindmap': '返回思维导图视图（28 Notes）', // 命令/文件右键菜单：从纯文本切回导图视图
    // ---- 文件名相关 ----
    'newMap.name': '未命名思维导图', // 新建导图的默认文件名（重名自动加「 1」「 2」序号）
    'copy.suffix': '-副本', // 「创建副本」的文件名后缀：原文件名 + 这个后缀 + .md
    'snap.beforeRestore': '还原前 · ', // 还原历史版本时自动存的「还原前」快照的命名前缀（后接日期时间）
    // ---- 文件列表徽章（左侧文件树里文件名右侧的小字）----
    'badge.bookmark': '↗', // 文件列表里书签文件右侧的小字（触发点在 main.js updateBookmarkBadges：拼进文件树徽章 CSS）
    'badge.mindmap': '28 Notes', // 文件列表里导图文件右侧的小字（同上，main.js updateBookmarkBadges）
    'menu.newMindmap': '新建思维导图（28 Notes）', // 文件面板右键空白处/文件夹 → 新建菜单项（2026-09-01）
    'menu.copyAiLocate': '复制 AI 定位路径（28Notes）', // 文件面板右键文件名 → 复制「绝对路径（+选中节点 ID）」供 AI Agent 定位编辑（2026-09-02）
    'fold.moreLevels': '更多层级', // 折叠层级「+更多」按钮的悬停提示（Obsidian 状态栏）

    // ============ 设置页（设置 → 第三方插件 → 28 Notes）============
    'settings.uiHeading': '界面', // 设置页最顶端 H2 标题（2026-09-01 定）
    'settings.language': '界面语言', // 语言设置项的名称
    'settings.languageDesc': '支持中文和英文。', // 语言项下方说明文字
    'settings.langAuto': '跟随 Obsidian', // 语言下拉选项一：跟随客户端语言
    'settings.langZh': '中文', // 语言下拉选项二
    'settings.langEn': 'English', // 语言下拉选项三
    'settings.theme': '主题', // 主题设置项名称（2026-08-31）
    'settings.themeDescMd': '选择你已经习惯的平台风格，以降低使用摩擦。', // 主题项说明（<br> = 换行）
    'settings.themeFeishu': '飞书（蓝线版）', // 主题下拉：飞书蓝线（2026-09-01 与灰/粉对称，改为带括号）
    'settings.themeFeishuGray': '飞书（灰线版）', // 主题下拉：飞书灰线
    'settings.themeFeishuPink': '飞书（粉线版）', // 主题下拉：飞书粉线（2026-09-01 新增）
    'settings.themeObsidian': 'Obsidian（适配中）', // 主题下拉：Obsidian（置灰不可选）
    'settings.themeMindNode': 'MindNode（适配中）', // 主题下拉：MindNode（置灰不可选）
    'settings.badgeStyle': '文件类型徽标', // 文件树徽章样式（2026-08-31）：文本/图标
    'settings.badgeStyleDesc': '指文件列表里，文件名右侧的类型徽标。此设计可避免文件类型混淆。',
    'settings.badgeStyleText': '28 Notes 文字', // 徽章样式下拉：文本（默认）
    'settings.badgeStyleIcon': '28 Notes 图标', // 徽章样式下拉：图标
    'settings.hideHint': '隐藏新增页面提示', // 界面简化栏标题（2026-09-01）
    'settings.hideHintDesc': '新增思维导图后，主节点下方会有一行新手提示，可选择隐藏。',



    'settings.hintShow': '显示提示', // 界面简化下拉：显示
    'settings.hintHide': '隐藏提示', // 界面简化下拉：隐藏
    'settings.tips': '使用技巧', // 「使用技巧」说明的标题（2026-09-01 挪到设置页最底部）
    'settings.tipsMd': '{Mod} + Enter：节点内换行；选中图片后点击空格：放大查看；<br>状态栏（编辑窗口底部右侧）：高级折叠功能（请点击试试 =)', // 使用技巧内容（2026-09-01 新文案；<br> = 换行）
    'settings.tutorial': '使用教程', // 「使用教程」说明的标题（2026-09-01 新增，放在设置页最底部）
    'settings.tutorialMd': '点击右侧按钮查看本插件使用教程。<br>另外，本插件设计大量融入「28笔记法」思想，<br>请在 B 站/小红书搜索「羊清乐」了解更多。', // 使用教程说明文案
    'settings.tutorialBtn': '查看教程 ↗', // 使用教程右侧按钮文案
    'settings.footnote': '尾注', // 「尾注」节标题
    'settings.qrMissing': '（二维码图片未找到）', // 赞助二维码图片缺失时的占位文字
    'settings.sponsor': '赞助开发者', // 赞助项名称
    'settings.sponsorMd': 'OTL', // 赞助说明内容
    'settings.sponsorBtn': '好！', // 展开/收起赞助二维码的按钮文字
    'settings.bug': 'Bug 与功能建议', // 建议反馈项名称
    'settings.bugMd': '请点击右侧 GitHub Issue 提交。<br>如不便访问，请添加 Up 主微信：Hi28Notes 直接沟通。<br><br>添加 Up 主微信后，你也可加入 28 笔记法插件开发群 / 知识管理交流群。', // 建议反馈内容（2026-09-01 去 <br> 压成一段，无空行）

    // ---- 许可证 / 付费激活（2026-09-02 新增）----
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
    'pro.ctaBtn': '激活创新 Pro 版', // 右上角提示按钮文案（未购买时显示，点击进激活弹窗；2026-09-04）
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
    'license.ctaDescTrialMd': '你的试用期还剩 {0} 天。试用结束后，部分创新功能将受限。\n本插件为买断制，激活码永久有效，可激活三台设备。（不包含在线生成式 AI 功能）\n如有任何激活问题，请联系开发者微信：Hi28Notes', // 试用中备注（{0}=剩余天数）
    'license.ctaDescExpiredMd': '你的试用期已结束，请激活创新 Pro 版以使用全部功能。\n本插件为买断制，激活码永久有效，可激活三台设备。（不包含在线生成式 AI 功能）\n如有任何激活问题，请联系开发者微信：Hi28Notes', // 试用已结束备注
    'license.howToActivateBtn': '如何激活 ↗', // 设置页右侧按钮 → 直接弹付费教程弹窗
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
    'license.proRequired': '这是 Pro 功能，激活后可用。', // 付费功能被拦时的提示
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
    'hint.line1': '选中节点 + Tab / 回车 → 新增子/同级节点', // 空图提示第一行
    'hint.line2': '按住空格 + 拖动鼠标 → 移动视图', // 空图提示第二行
    'hint.line3': 'Cmd + 鼠标滚动 → 缩放视图', // 空图提示第三行
    // ============ 导图画面：节点图标 / 折叠箭头 / 备注等悬停提示 ============
    'tip.minorIcon': '此节点已次要 Minor（置灰）', // Minor 节点标题前小图标的悬停提示
    'tip.nowIcon': '此节点已标记 Now', // Now 节点标题前小圆点的悬停提示
    'tip.unfold': '点击展开', // 节点右侧折叠箭头悬停提示（折叠态）
    'tip.fold': '点击折叠', // 节点右侧折叠箭头悬停提示（展开态）
    'tip.editNote': '双击编辑备注', // 备注行（灰竖条文字）悬停提示
    'tip.image': '单击选中 · 双击放大 · 右键复制', // 节点里图片的悬停提示
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
    'tb.drill': '进入当前节点（{Mod} + E）', // 「进入该节点」按钮：已选中时
    'tb.drillDefault': '进入当前节点（需选择节点后操作）（{Mod} + E）', // 同按钮初始 tooltip（未选中时）
    'tb.selectFirst': '请先选择节点', // 未选中节点时多个按钮的通用兜底提示
    'tb.noMinor': '当前视图没有 Minor 节点', // 当前视图里没有 Minor 节点时，隐藏 Minor 按钮的提示（按钮置灰）
    'tb.showMinor': '显示 Minor 节点（{Mod} + {Alt} + M）', // 隐藏 Minor 按钮：隐藏中（点此显示）
    'tb.hideMinor': '隐藏 Minor 节点（{Mod} + {Alt} + M）', // 隐藏 Minor 按钮：显示中（点此隐藏）
    'tb.nowReadonly': '此按钮在历史页面无法操作', // 历史页里 Now 按钮被禁用的提示
    'tb.noNow': '当前没有 Now 节点（{Alt}+{Mod}+N）', // 图里没有任何 Now 节点时 Now 按钮的提示（置灰）
    'tb.nowShowAll': '取消只显示 Now 节点 （{Mod} + {Alt} + N）', // 只看 Now 按钮：开启中（点此恢复显示全部）
    'tb.nowOnly': '只显示 Now 节点 （{Mod} + {Alt} + N）', // 只看 Now 按钮：关闭中（点此只看 Now）
    'tb.pathInvalid': '默认路径已失效（绑定节点已不存在）', // 默认路径按钮：存的默认路径指向的节点被删（置灰）
    'tb.pathIsDefault': '当前已是默认路径', // 默认路径按钮：当前就在默认路径上（置灰）
    'tb.pathBack': '路径已变，点击返回默认路径', // 默认路径按钮：偏离了默认路径（蓝色可点返回）
    'tb.undo': '撤销（{Mod}+Z）', // 撤销按钮 tooltip
    'tb.redo': '重做（{Mod}+Shift+Z）', // 重做按钮 tooltip
    'tb.locate': '定位到中心节点（{Mod}+P）', // 定位按钮 tooltip（循环定位下钻路径各层）
    'tb.defaultPath': '默认路径', // 路径链接（斜杠）按钮的默认 tooltip
    'tb.minorToggle': '隐藏/显示次要 Minor 节点（{Alt}+{Mod}+M）', // 隐藏/显示 Minor 按钮初始 tooltip

    // ============ 节点工具栏（选中节点时底部弹出的黑色圆条按钮 tooltip）============
    'nm.bold': '加粗节点（{Mod} + B）',
    'nm.red': '标为红色（{Mod} + R）', // 标红按钮
    'nm.yellow': '标为黄色（{Mod} + Y）', // 标黄按钮
    'nm.note': '添加备注（Shift + Enter）', // 写备注按钮
    'nm.now': '设为当前关注 Now 节点（{Mod} + N）', // 标记 Now 按钮
    'nm.minor': '设为次要 Minor 节点（{Mod} + M）', // 标记 Minor 按钮

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
    'toast.restored': '已还原到该历史版本（还原前的内容也已保存，可随时找回）', // 历史还原成功后
    'toast.copyCreated': '已创建副本：{0}', // 从历史快照创建副本成功（{0}=新文件名）
    'toast.jumpFail': '未找到链接目标（可能已被删除）', // 点节点链接但目标节点已被删
    'toast.histReadonly': '历史页为只读，退出历史页后才能保存当前版本', // 历史页里点「保存此版本」时
    'toast.versionSaved': '已保存当前版本', // 手动命名保存版本成功后
    'toast.aiLocateCopied': '已复制，请在 Agent 里粘贴', // 复制 AI 定位路径 成功后

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
    'ctx.drill': '进入当前节点', // 菜单项：下钻把该节点当主节点
    'ctx.copyLink': '复制节点链接', // 菜单项：复制 [[文件名#pid]] 节点链接
    'ctx.bookmark': '保存为捷径', // 菜单项：为该节点创建书签文件
    'ctx.bookmarkHint': '不写默认为节点名', // 书签命名弹框输入框里的灰色占位提示
    'ctx.editLink': '编辑链接', // 菜单项：双击编辑链接的菜单版（仅文件/URL 链接显示）
    'ctx.copyAILocate': '复制 AI 定位路径', // 菜单项：复制「文件绝对路径 + 节点 ID」，供 AI Agent 定位编辑
    'ctx.copyAILocateTip': '让 AI Agent 快速定位你要编辑的节点', // 复制 AI 定位路径 悬浮说明
    'ctx.copyLinkTip': '可粘贴到其它思维导图，点击跳转回这里', // 复制节点链接 悬浮说明

    // ============ 折叠层级数字按钮悬停提示（右下角状态栏层级条）============
    'fold.selBelow': '折叠选中节点之下第 {0} 层', // 选中态数字按钮（{0}=相对选中节点的层数）
    'fold.level': '折叠第 {0} 层', // 未选中态数字按钮（{0}=相对主节点的层数）

    // ============ 定位菜单（点定位按钮/Now 侧边按钮弹出的目标列表）============
    'locate.root': '主节点', // 列表项标签：主节点
    'locate.selected': '选中节点', // 列表项标签：当前选中节点
    'locate.to': '定位到{0}', // 列表项悬停提示（{0}=目标名，如「定位到主节点」）

    // ============ 历史记录页（左侧时间线 + 弹窗）============
    'hist.exit': '返回编辑', // 历史页左上工具条：退出历史页按钮
    'hist.diff': '只看差异', // 历史页左上工具条：只显示与当前不同的节点
    'hist.restore': '还原此版本', // 历史页左上工具条：把快照覆盖回当前文件
    'hist.copy': '创建副本', // 历史页左上工具条：把快照存成一个新文件
    'hist.promptTitle': '给这个版本起个名字', // 「保存此版本」弹框标题
    'hist.promptHint': '（可空）', // 「保存此版本」弹框输入框占位提示
    'hist.confirmRestore': '确定用此历史版本覆盖当前文件？当前内容将被替换。', // 点「还原此版本」后的确认弹窗文字
    'hist.empty': '暂无历史记录。<br>每次编辑会自动保存版本（每 2 分钟一次），也可点左下角「保存此版本」手动命名存档。', // 没有历史快照时时间线的占位（<br> = 换行）
    'hist.auto': '自动保存', // 自动快照在时间线里的标签（手动命名的显示你起的名字）
    'hist.justNow': '刚刚 · {0}', // 时间线时间：3 分钟内（{0}=时:分）
    'hist.today': '今天', // 时间线时间：当天
    'hist.yesterday': '昨天', // 时间线时间：昨天
    'hist.dateMD': '{0} 月 {1} 日', // 时间线时间：同年（{0}=月 {1}=日）
    'hist.dateYMD': '{0} 年 {1} 月 {2} 日', // 时间线时间：跨年（{0}=年 {1}=月 {2}=日）

    // ============ 图片预览 / 图片缺失 ============
    'img.prev': '上一张（左键/←）', // 大图预览左翻页按钮悬停提示
    'img.next': '下一张（右键/→）', // 大图预览右翻页按钮悬停提示
    'img.missing': '[图片缺失]', // 图片加载失败时图片位置显示的占位文字

    // ============ 通用弹窗按钮 ============
    'btn.cancel': '取消', // 弹窗取消按钮（命名框/确认框）
    'btn.ok': '确定' // 弹窗确定按钮
  },
  en: {
    // 英文翻译（2026-08-30 按中文文案统一翻译；改英文只动这个区块，规则同 zh）
    'common.untitled': 'Untitled',
    'common.node': 'Node',
    'common.newNode': 'New node',
    'common.more': 'More',
    'common.undo': 'Undo',
    'common.mindmap': 'Mind map',
    'common.cancel': 'Cancel',
    'common.ok': 'OK',

    'frame.refresh': 'Refresh (re-read the file and re-render)',
    'frame.nowSide': 'Show Now nodes only',
    'frame.mdPlaceholder': '- Top-level node\n  - Child node',
    'mm.addChild': 'Child node',
    'mm.addSibling': 'Sibling',
    'mm.delete': 'Delete',
    'mm.undo': 'Undo',
    'mm.redo': 'Redo',
    'mm.pathLink': 'Path links',
    'mm.pathBack': 'Previous path',
    'mm.pathFwd': 'Next path',
    'mm.pathDefault': 'Back to default path',
    'mm.pathSave': 'Set current as default path',
    'mm.debug': 'UI debug',
    'mm.history': 'History',
    'mm.saveVersion': 'Save this version',
    'mm.about': 'About the 28 Notes Method ↗',
    'mm.settings': 'Settings & bug report',

    'display.mindmap': 'Mind map',
    'notice.bookmarkInvalid': 'Invalid shortcut (missing target): ',
    'notice.bookmarkMissing': 'The mind map this shortcut points to does not exist: ',
    'notice.bookmarkReadFail': 'Failed to read the shortcut target: ',
    'notice.writeFailNoFile': 'Failed to save: view is not bound to a file',
    'notice.writeFail': 'Failed to save the mind map: ',
    'notice.copyFail': 'Copy failed: ',
    'notice.openUrlFail': 'Failed to open link: ',
    'notice.openSettingsFail': 'Failed to open settings: ',
    'notice.updateBookmarkFail': 'Failed to update shortcut: ',
    'notice.createBookmarkFail': 'Failed to create shortcut: view is not bound to a data file',
    'notice.createBookmarkFail2': 'Failed to create shortcut: ',
    'notice.restoreFail': 'Failed to restore this version: ',
    'notice.newMapFail': 'Failed to create the mind map: ',
    'notice.fileMissing': 'The file this link points to does not exist: ',
    'notice.openFileFail': 'Failed to open file: ',
    'notice.noteMissing': 'Note not found: ',
    'notice.openNoteFail': 'Failed to open note: ',
    'notice.copyFailSnap': 'Failed to create a copy: ',
    'notice.githubUnset': 'GitHub link is not configured yet',
    'cmd.newMap': 'New mind map (28 Notes)',
    'cmd.openAsMarkdown': 'View in the Obsidian editor',
    'cmd.openAsMindmap': 'View in the 28 Notes mind map editor',
    'newMap.name': 'Untitled mind map',
    'copy.suffix': ' copy',
    'snap.beforeRestore': 'Before restore · ',
    'badge.bookmark': '↗',
    'badge.mindmap': 'Mind map',
    'menu.newMindmap': 'New mind map (28 Notes)',
    'menu.copyAiLocate': 'Copy AI locate path (28Notes)',
    'fold.moreLevels': 'More levels',

    'settings.uiHeading': 'Interface',
    'settings.language': 'Interface language',
    'settings.languageDesc': 'Supports Chinese and English.',
    'settings.langAuto': 'Follow Obsidian',
    'settings.langZh': '中文',
    'settings.langEn': 'English',
    'settings.theme': 'Theme',
    'settings.themeDescMd': 'Pick the platform style you are used to, to reduce friction.',
    'settings.themeFeishu': 'Feishu (blue lines)',
    'settings.themeFeishuGray': 'Feishu (gray lines)',
    'settings.themeFeishuPink': 'Feishu (pink lines)',
    'settings.themeObsidian': 'Obsidian (coming soon)',
    'settings.themeMindNode': 'MindNode (coming soon)',
    'settings.badgeStyle': 'File type badge',
    'settings.badgeStyleDesc': 'It refers to the type badge on the right of the file name in the file list. This design avoids confusion between file types.',
    'settings.badgeStyleText': '28 Notes text',
    'settings.badgeStyleIcon': '28 Notes icon',
    'settings.hideHint': 'Hide new-page hint',
    'settings.hideHintDesc': 'After creating a new mind-map, a beginner hint appears below the root node. You can choose to hide it. ',
    'settings.hintShow': 'Show hint',
    'settings.hintHide': 'Hide hint',
    'settings.tips': 'Tips',
    'settings.tipsMd': '{Mod} + Enter: line break within a node;<br>After selecting an image, press Space to preview;<br>The status bar (bottom-right of the editing window) hides an advanced folding feature — give it a click =)',
    'settings.tutorial': 'Tutorial',
    'settings.tutorialMd': 'Click the button on the right to view the plugin tutorial.<br>The plugin design borrows heavily from the "28 Notes Method". Search "羊清乐" on Bilibili / Xiaohongshu for more.',
    'settings.tutorialBtn': 'View tutorial ↗',
    'settings.footnote': 'Footnote',
    'settings.qrMissing': '(QR code image not found)',
    'settings.sponsor': 'Sponsor the developer',
    'settings.sponsorMd': 'The developer has put a lot of effort into this plugin.<br>If you like it, feel free to Buy Me a Coffee OTL',
    'settings.sponsorBtn': 'Sure!',
    'settings.bug': 'Bugs & feature requests',
    'settings.bugMd': 'Please submit via the GitHub Issue button on the right.<br>If that\'s inconvenient, you can email ShinContactEM@Gmail.com,<br>or add the developer on WeChat: Hi28Notes.<br><br>After adding the developer on WeChat, you can also join the 28 Notes plugin development / knowledge management group chat.',

    // ---- License / paid activation (added 2026-09-02) ----
    'license.heading': 'License',
    'license.active': 'Activated',
    'license.inactive': 'Not activated',
    'license.buyMd': 'Pay via Alipay, then email the payment screenshot to ShinContactEM@Gmail.com to receive an activation code (one code covers up to 3 devices).',
    'license.trialActive': 'Trial active',
    'license.trialRemainingFmt': '{0} days left in your trial. Activate to keep full features after it ends.',
    'license.trialExpired': 'Trial ended',
    'license.trialDaysDebug': 'Trial days (debug)',
    'license.trialDaysDebugDesc': 'Only visible on the author machine. Set a small value to quickly test trial expiry. Note: the auto trial is always 14 days (hardcoded, unaffected by this setting); this only changes the local check threshold.',
    'license.resetTrialBtn': 'Reset to 14 days',
    'license.okReset': 'Reset to 14 days',
    // ---- Pro features modal (2026-09-02) ----
    'pro.heading': 'Pro features',
    'pro.shortDesc': 'See all Pro features and how to buy',
    'pro.viewBtn': 'View Pro features',
    'pro.ctaBtn': 'Activate Pro',
    'pro.desc': 'These features require Pro activation',
    'pro.empty': '(No Pro features yet)',
    'license.inputPh': 'Paste your activation code (starts with 28N)',
    'license.activateBtn': 'Activate',
    'license.deactivateBtn': 'Deactivate',
    'license.lidLabel': 'License ID',
    'license.devicesLabel': 'Device limit',
    'license.atLabel': 'Activated at',
    'license.receiptLabel': 'Activation receipt',
    'license.receiptHintMd': 'When moving to a new device or adding one, send this receipt to the developer to register it. Not required for normal use.',
    'license.copyBtn': 'Copy',
    'license.okActivated': 'Activated. Thank you for the support!',
    'license.okDeactivated': 'Deactivated',
    // ---- License section (2026-09-04 merged into a single row) ----
    'license.ctaTitle': 'Activate 28 Notes Pro',
    'license.ctaDescTrialMd': 'Your trial has {0} days left. Some Pro features will be limited once it ends.\n\nThis is a one-time purchase: the code never expires and works on up to 3 devices (online generative AI features not included).\n\nActivation issues? Contact the developer on WeChat: Hi28Notes',
    'license.ctaDescExpiredMd': 'Your trial has ended. Activate 28 Notes Pro to use all features.\n\nThis is a one-time purchase: the code never expires and works on up to 3 devices (online generative AI features not included).\n\nActivation issues? Contact the developer on WeChat: Hi28Notes',
    'license.howToActivateBtn': 'How to activate ↗',
    'license.activeTitle': '28 Notes Pro activated',
    'license.activeDescMd': 'License ID: {0}; Device limit: {1}; Activated: {2}\n\nBefore switching devices, click "Unbind" on the right, then activate on the new device.',
    'license.unbindBtn': 'Unbind',
    // ---- Debug section (2026-09-04, author machine only) ----
    'debug.heading': 'Debug',
    'debug.toggleName': 'Debug mode',
    'debug.toggleDesc': 'When on, debug options appear. When off, this page looks exactly like a regular user’s.',
    'debug.stateName': 'Set activation state',
    'debug.stateDesc': 'Local machine only: force the trial to a given remaining time, or force it to expired.',
    'license.okCopied': 'Receipt copied',
    'license.proRequired': 'This is a Pro feature. Activate to use it.',
    'license.err.unknown': 'Activation failed. Please check the code.',
    'license.err.empty': 'Please enter an activation code',
    'license.err.format': 'Malformed code. Make sure you copied the whole thing.',
    'license.err.signature': 'Invalid activation code',
    'license.err.product': 'This code is not for 28 Notes',
    'license.err.expired': 'This activation code has expired',
    'license.err.revoked': 'This activation code has been disabled. Please contact the developer.',
    'license.err.payload': 'Corrupted code. Please copy it again.',
    'license.err.lockedFmt': 'Too many attempts. Try again in {0} minutes.',

    // ============ Empty-map usage hint (shown under root node after creating a blank mind map) ============
    'hint.line1': 'Select a node + Tab / Enter to add',
    'hint.line2': 'Space + Drag to pan',
    'hint.line3': 'Cmd + Scroll to zoom',

    'tip.minorIcon': 'This node is marked Minor (grayed out)',
    'tip.nowIcon': 'This node is marked Now',
    'tip.unfold': 'Click to unfold',
    'tip.fold': 'Click to fold',
    'tip.editNote': 'Double-click to edit the note',
    'tip.image': 'Click to select · double-click to zoom · right-click to copy',
    'tip.editLinkSuffix': '\nDouble-click to edit the link',
    'tip.jump': 'Click to jump',
    'tip.openNote': 'Click to open the note: {0}',
    'tip.locateNode': ' (locate node {0})',
    'tip.openFile': 'Click to open the file: {0}',
    'tip.openUrl': 'Click to open in the browser: {0}',

    'tb.foldSel': 'Fold nearby nodes ({Mod} + F)',
    'tb.foldNoSel': 'Fold nearby nodes (select a node first) ({Mod} + F)',
    'tb.foldDefault': 'Fold/unfold nearby nodes (select a node first) ({Mod}+F)',
    'tb.drill': 'Enter the current node ({Mod} + E)',
    'tb.drillDefault': 'Enter the current node (select a node first) ({Mod} + E)',
    'tb.selectFirst': 'Select a node first',
    'tb.noMinor': 'No Minor nodes in the current view',
    'tb.showMinor': 'Show Minor nodes ({Mod} + {Alt} + M)',
    'tb.hideMinor': 'Hide Minor nodes ({Mod} + {Alt} + M)',
    'tb.nowReadonly': 'This button is unavailable on the history page',
    'tb.noNow': 'No Now nodes yet ({Alt}+{Mod}+N)',
    'tb.nowShowAll': 'Stop showing Now nodes only ({Mod} + {Alt} + N)',
    'tb.nowOnly': 'Show Now nodes only ({Mod} + {Alt} + N)',
    'tb.pathInvalid': 'The default path is broken (its node no longer exists)',
    'tb.pathIsDefault': 'You are on the default path',
    'tb.pathBack': 'Path has changed — click to return to the default path',
    'tb.undo': 'Undo ({Mod}+Z)',
    'tb.redo': 'Redo ({Mod}+Shift+Z)',
    'tb.locate': 'Locate the central node ({Mod}+P)',
    'tb.defaultPath': 'Default path',
    'tb.minorToggle': 'Hide/show Minor nodes ({Alt}+{Mod}+M)',

    'nm.bold': 'Bold the node ({Mod}+B)',
    'nm.red': 'Mark red ({Mod}+R)',
    'nm.yellow': 'Mark yellow ({Mod}+Y)',
    'nm.note': 'Add a note (Shift+Enter)',
    'nm.now': 'Mark as Now ({Mod}+N)',
    'nm.minor': 'Mark as Minor ({Mod}+M)',

    'toast.hiddenMinor': 'Minor node hidden',
    'toast.hiddenNow': 'Now node hidden',
    'toast.hiddenAlsoDeleted': 'Note: {0} hidden Minor child nodes were deleted as well',
    'toast.pasteLink': 'Select a node before pasting a link',
    'toast.pasteFileLink': 'Select a node before pasting a file link',
    'toast.pasteImg': 'Select a node before pasting an image',
    'toast.pasteFirst': 'Select a node before pasting',
    'toast.imgSavedNoNode': 'Image saved, but the target node no longer exists',
    'toast.showNowEmpty': 'No Now nodes in the current view — "Focus on Now" not enabled',
    'toast.imgSaveFail': 'Failed to save the image',
    'toast.bookmarkRelocated': 'The shortcut node has been deleted or renamed — relocated to the central node',
    'toast.restored': 'Restored to this version (the content before the restore has been saved too, and can be recovered anytime)',
    'toast.copyCreated': 'Copy created: {0}',
    'toast.jumpFail': 'Link target not found (it may have been deleted)',
    'toast.histReadonly': 'The history page is read-only — exit it before saving the current version',
    'toast.versionSaved': 'Current version saved',
    'toast.aiLocateCopied': 'Copied — paste it into your AI agent',

    'warn.root': 'Line {0}: unrecognized (the first line should be the central topic `- Central topic`); kept as-is',
    'warn.tabIndent': 'Line {0}: branches must be indented with Tabs (one Tab per level) and cannot sit at the same level as the central topic; kept as-is',
    'warn.spaceIndent': 'Line {0}: please indent with Tabs, not spaces; kept as-is',
    'warn.unrecognized': 'Line {0}: unrecognized "{1}"; kept as-is (only `- node`, `> note`, `![]image`, `[[link]]` are supported)',
    'warn.dupId': 'Duplicate node ID: {0} (ID not cleared when copying? Keep only one of them)',
    'warn.deadLink': 'Broken link: {0} points to a node that no longer exists (it may have been deleted)',
    'warn.boxPrefix': '⚠ Formatting issues: ',

    'ctx.copyImage': 'Copy image',
    'ctx.drill': 'Enter the current node',
    'ctx.copyLink': 'Copy node link',
    'ctx.bookmark': 'Save as shortcut',
    'ctx.bookmarkHint': "(Optional — defaults to the node's title)",
    'ctx.editLink': 'Edit link',
    'ctx.copyAILocate': 'Copy AI locate path',
    'ctx.copyAILocateTip': 'Let an AI agent quickly locate the node you want to edit',
    'ctx.copyLinkTip': 'Paste into another mind map to jump back here',

    'fold.selBelow': 'Collapse level {0} below the selected node',
    'fold.level': 'Collapse level {0}',

    'locate.root': 'Central node',
    'locate.selected': 'Selected node',
    'locate.to': 'Locate {0}',

    'hist.exit': 'Back to editing',
    'hist.diff': 'Show differences only',
    'hist.restore': 'Restore this version',
    'hist.copy': 'Create a copy',
    'hist.promptTitle': 'Name this version',
    'hist.promptHint': '(Optional)',
    'hist.confirmRestore': 'Overwrite the current file with this version? The current content will be replaced.',
    'hist.empty': 'No history yet.<br>A version is saved automatically as you edit (every 2 minutes). You can also click "Save this version" at the bottom-left to save a named one.',
    'hist.auto': 'Auto save',
    'hist.justNow': 'Just now · {0}',
    'hist.today': 'Today',
    'hist.yesterday': 'Yesterday',
    'hist.dateMD': '{0}/{1}',
    'hist.dateYMD': '{1}/{2}/{0}',

    'img.prev': 'Previous (left click / ←)',
    'img.next': 'Next (right click / →)',
    'img.missing': '[Image missing]',

    'btn.cancel': 'Cancel',
    'btn.ok': 'OK'
  }
};
// 当前语言：iframe 由宿主注入 window.__MM_LANG__；宿主/test.mjs 装载后调 setLang
var I18N_LANG = (typeof window !== 'undefined' && window.__MM_LANG__ === 'en') ? 'en' : 'zh';
function setLang(l) { if (I18N[l]) I18N_LANG = l; }
function getLang() { return I18N_LANG; }
// 平台键位：文案里 {Mod}/{Alt} 占位 —— Mac 显示 Cmd/Option，Windows/Linux 显示 Ctrl/Alt
// （navigator 覆盖 iframe；process 覆盖宿主 main.js；都没有（test.mjs 沙箱）回退非 Mac，只影响测试取值）
var I18N_MAC = (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(String(navigator.platform || navigator.userAgent || '')))
  || (typeof process !== 'undefined' && process.platform === 'darwin');
function modStr(s) { // {Mod}/{Alt} → 平台实际键名
  return String(s)
    .split('{Mod}').join(I18N_MAC ? 'Cmd' : 'Ctrl')
    .split('{Alt}').join(I18N_MAC ? 'Option' : 'Alt');
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
