
# 28 Notes MindMap

 [English Version Introduction](#english-documentation)

- 纯本地、Markdown 格式的思维导图，AI 可直接读写，修改。
- 设计理念源自「[28 笔记法](https://space.bilibili.com/481595180)」，可一键聚焦重点 / 隐藏非重点。
- 简洁，优雅，易用。

<img  alt="banner" src="https://github.com/user-attachments/assets/562ae41a-8c18-4b9b-9a7f-b6ba9b91514a" />


---
<br>

## 🧤 如何安装

1. 打开 Obsidian 桌面端，进入设置 → 第三方插件 → 社区插件
2. 搜索 **28 Notes MindMap**，安装并启用

---
<br>

## 🪴 Key Features

### ❶ 简洁易用

- **简洁易用**：没有复杂的功能，繁复的界面，如同白纸一般简单；操作方式对齐常规思维导图软件，让你没有任何切换成本，轻松即可上手，思维飞扬。
- **Obsidian 编辑器**：在 Obsidian 中央编辑器直接编辑，无需另开渲染窗口，所见即所得。
- **历史功能**：秒级存储历史，数据安全，历史操作可细致回顾。你还可以自行保存版本。查看历史时，只会聚焦差异节点，简洁易用。


![28 Notes MindMap 界面](assets/ui-main.png)

*图注：28 Notes MindMap 界面*

<br>

### ❷ AI 友好

大多数思维导图软件，把数据存在私有格式里，
导致 AI Agent 工具难以直接阅读和更改。

而 28 Notes MindMap 从设计之初，就为了 AI 易用：

- **纯 Markdown 存储**：你的导图就是一个普通 `.md` 本地文件，内容是纯粹的大纲形式。关掉插件、甚至不用 Obsidian，用任何文本编辑器都能读。
- **AI 快速定位**：右键节点，即可快速复制节点路径，粘贴给 AI Agent（Claude Code、Cursor、Codex 等），它就能精确定位到你要编辑的节点，沟通非常便捷。
- **预埋 AI 指令**：你可以直接让 AI 改内容，而无需担心格式损坏。因为「格式规范」已经直接预埋在文件里了。未来预计将支持内置指令（简化版 Skill），和 AI 配合更丝滑。

![Markdown 大纲格式源文件](assets/source-md.png)

*图注：28 Notes MindMap 源文件：Markdown 大纲格式*

![右键复制 AI 定位路径](assets/ai-path.png)
*图注：右键复制 AI 定位路径*

<br>

### ❸ 聚焦重点

思维导图最大的痛点就是节点变多后，
一打开密密麻麻，难以使用。

28 Notes MindMap 设计了大量的创新模式，以解决这个问题：

- **当下关注 Now 功能**：你可以将当前关注的节点标记为 Now。 然后可以一键只显示当前关注节点。瞬间聚焦重点。
- **次要 Minor 功能**：你可以将次要的节点标记为 Minor。 然后一键隐藏所有次要 Minor 节点。 瞬间清净。
- **按层级折叠功能**：右下角有层级数字，点击某个数字，如数字 2，可以一键只显示一二层级。瞬间从迷失到清晰。
- **视图功能**：你可以在定位按钮里快速跳转 / 编辑 Now 节点，让你的视线从整个思维导图，聚焦到少数视图。

![只显示 Now](assets/demo-focus.gif)

*图注：「一键只显示重点」功能演示*

![折叠第二层级](assets/demo-fold.gif)

*图注：「一键折叠至第二层级」功能演示*

<br>

除此之外，28 Notes MindMap 还支持：

- **进入节点功能**：你可以一键进入某个节点，只显示这个节点和它的子节点。外面纷纷扰扰，这里清净聚焦。
- **存为捷径功能**：你可以将进入的某个节点视图存为捷径，下次一打开直接进入。上次思维漫游到哪里，这次直接看哪里。


![进入当前节点](assets/demo-enter.gif)

*图注：「进入节点」功能演示*

<br>

### ❹ 专为知识管理优化

- **高度集成 Obsidian**：支持 Obsidian 原生双链，超大编辑器，超多可自定义快捷键。
- **知识管理友好**：极简，无繁杂；不含连线、概要等功能，利于知识压缩；侧重大批量笔记的知识管理，20 万字超大型思维导图加载仅需 2S。
- **连接知识**：支持插入图片、视频、音频、本地文件链接、跨思维导图节点等，多样知识，一处集成。未来将支持更多 Obsidian 双链功能。

![支持 Obsidian 双链](assets/obsidian-link.png)

*图注：支持Obsidian 双链*

---
<br>

## 🚀 快速开始

### 创建你的第一张导图

- 点击左侧功能区的“28 Notes”图标即可。
- 你也可以打开命令面板，搜索 28，用命令/快捷键，快速新建。

### 基础快捷键

| 操作 | 默认快捷键 |
|-|-|
| 加粗节点 | `Cmd + B` |
| 将选中节点标为红色 | `Cmd + R` |
| 将选中节点标为黄色 | `Cmd + Y` |
| （不）设为 Now 当前节点 | `Cmd + N` |
| （不）设为 Minor 次要节点 | `Cmd + M` |
| 节点备注 | `Shift + Return` |
| （只）显示 Now 当前节点 | `Cmd + Option + N` |
| 显示/隐藏 Minor 次要节点 | `Cmd + Option + M` |
| 选择上一个节点 | `↑`（不可自定义） |
| 选择下一个节点 | `↓`（不可自定义） |
| 选择母节点 | `←`（不可自定义） |
| 选择子节点 | `→`（不可自定义） |
| 进入当前节点 | `Cmd + =` |
| 定位循环 | `Option + Space` |
| 在上方新建同级节点 | `Option + Cmd + Up` |
| 光标插入节点开始 | `Cmd + [` |
| 光标插入节点末尾 | `Cmd + ]` |
| 在上一层新建同级节点 | 无默认值，可自设定 |
| 新建思维导图（28 Notes） | 无默认值，可自设定 |
| 打开历史记录面板 | 无默认值，可自设定 |
| 切换源文件 / 思维导图视图 | 无默认值，可自设定 |


>  `Cmd` 在Windows 平台为 `Ctrl`。

---
<br>

## 💰 试用与付费

### 14 天免费试用

安装后自动开始 14 天全功能试用，无任何功能限制。

### 试用结束后

我们采用特别的付费方案：

- **市面上思维导图软件存在的大多数功能：无限制使用**
- 如：无限量生成思维导图、插入图片、备注、Obsidian 双链、本地文件链接、节点链接等。

- **28 Notes 原创的创新功能：试用期结束后，需激活以使用**
- 如：Now、Minor、捷径、AI定位路径、多级折叠等。

**具体如下：**

| 功能 | 通用免费版 | 创新 Pro 版 |
|------|--------|--------|
| 无限制生成思维导图 | ✅ | ✅ |
| 思维导图通用编辑（增删节点、拖拽、撤销重做等） | ✅ | ✅ |
| 进入某节点/面包屑导航 | ✅ | ✅ |
| 双链/文件链接/节点链接 | ✅ | ✅ |
| 备注 | ✅ | ✅ |
| 多主题 | ✅ | ✅ |
| 历史版本快照 | ✅ | ✅ |
| 界面简化 | ✅ | ✅ |
| Now 节点 | ❌ | ✅ |
| Minor 节点 | ❌ | ✅ |
| 保存为捷径 | ❌ | ✅ |
| 复制 AI 定位路径 | ❌ | ✅ |
| 高级折叠（按层折叠） | ❌ | ✅ |

### 价格

- **早鸟价 ¥38**（~~原价 ¥76~~ → -50%）
- 买断制：一次购买，永久使用本地功能
- 支持 **3 台设备**激活
- 付款与激活方式：下载插件后，见：Obsidian → 设置 → 28 Notes → 许可证

> 注：买断覆盖本地全部功能。但不包含未来可能上线的在线式 AI 生成服务 / 涉及服务器的功能（此处仅为说明，此类功能大概率不会做，因为目前 AI Agent  足够简单易用）

---
<br>

## ❓ 常见问题

### 我的数据会被上传吗？

不会。28 Notes 完全本地运行，不收集数据、不调用任何外部 API。

### 和其他思维导图软件/插件有什么区别？

- **其它思维导图软件 / 插件**：私有格式，AI 无法直接编辑；功能趋同
- **28 Notes**：Markdown 格式，适合 AI Agent 操作；大量创新功能

### 支持移动端吗？

目前仅桌面端。移动端可能会做，但没有明确时间表。

### 激活码可以换电脑吗？

可以。一个码支持 3 个设备同时激活。
换电脑时在旧设备解除激活，即可在新设备上使用。

### 我可以用 AI 直接编辑导图文件吗？

可以！这正是 28 Notes 的设计目标。
你只要选中思维导图节点后，右键「复制 AI 定位路径」，给到 Agent，AI 就能精确定位和编辑。你甚至不需要告诉 AI 应该遵循什么格式，不需要加任何 Skill 外框。因为 28 Notes 已经考虑并预埋好了。

---
<br>

## 🗺️ 路线图

- [ ] Obsidian 高级双链功能
- [ ] AI 技能优化

---
<br>

## 📄 许可

本插件代码仅供 Obsidian 审核和社区核查，不得二次分发或用于商业转售。详见 License。

---

*28 Notes MindMap — 极简，无混乱，AI 友好*

---

## English Documentation


# 28 Notes MindMap

- Markdown-based mind maps that AI can read, write, and edit directly.
- Design inspired by the "[28 Notes Method](https://space.bilibili.com/481595180)", with one-click focus on key points / hiding of non-essentials.
- Simple, elegant, and easy to use.

![banner](https://github.com/user-attachments/assets/562ae41a-8c18-4b9b-9a7f-b6ba9b91514a)

---

## 🧤 Installation

1. Open Obsidian desktop, go to Settings → Third-party plugins → Community plugins.
2. Search for **28 Notes MindMap**, install and enable it.

---

## 🪴 Key Features

### ❶ Simple & Easy to Use

- **Simple & easy to use**: No complex features or cluttered UI — as plain as a blank sheet of paper. The interaction aligns with conventional mind-map software, so you can pick it up with zero switching cost and let your thoughts flow.
- **Obsidian editor**: Edit directly in Obsidian's central editor, no separate render window needed — what you see is what you get.
- **History**: Snapshots are saved minute by minute, keeping your data safe. You can also save a version manually at any time. While browsing history, only the changed nodes are highlighted — clean and easy to read.

![28 Notes MindMap interface](assets/ui-main.png)

*Caption: 28 Notes MindMap interface*

### ❷ AI-Friendly

Most mind-map software stores data in proprietary formats, making it hard for AI Agent tools to read or modify directly.

28 Notes MindMap was designed from the ground up to be AI-friendly:

- **Pure Markdown storage**: Your map is just a plain local `.md` file in outline form. Close the plugin, or even skip Obsidian entirely — any text editor can read it.
- **Fast AI locating**: Right-click a node to copy its path, paste it to an AI Agent (Claude Code, Cursor, Codex, etc.), and it can pinpoint exactly the node you want to edit — communication is effortless.
- **Embedded AI instructions**: You can ask the AI to edit content directly without worrying about breaking the format, because the "format spec" is already embedded in the file. Built-in instructions (a simplified Skill) are planned to make AI collaboration even smoother.

![Markdown outline source file](assets/source-md.png)

*Caption: 28 Notes MindMap source file — Markdown outline format*

![Right-click to copy the AI location path](assets/ai-path.png)

*Caption: Right-click to copy the AI location path*

### ❸ Focus on What Matters

The biggest pain point of mind maps is that once nodes grow, opening one feels overwhelming and unusable.

28 Notes MindMap introduces many innovative modes to solve this:

- **Now focus**: Mark the node you're currently focused on as Now, then show only Now nodes with one click — instantly zero in on what matters.
- **Minor**: Mark secondary nodes as Minor, then hide all Minor nodes with one click — instantly declutter.
- **Level folding**: Level numbers sit at the bottom-right; click a number (e.g. 2) to show only levels 1–2 — instantly go from lost to clear.
- **Views**: Inside the locate button you can jump between / edit Now nodes quickly, narrowing your view from the whole mind map down to a handful of views.

![Show only Now](assets/demo-focus.gif)

*Caption: "Show only what matters" demo*

![Fold to level 2](assets/demo-fold.gif)

*Caption: "Fold to level 2" demo*

On top of that, 28 Notes MindMap also supports:

- **Enter node**: Drill into a node with one click, showing only it and its children. Peace and focus amid the noise.
- **Save as shortcut**: Save a drilled-in node view as a shortcut and reopen it directly next time — pick up exactly where your mind left off.

![Enter current node](assets/demo-enter.gif)

*Caption: "Enter node" demo*

### ❹ Optimized for Knowledge Management

- **Deep Obsidian integration**: Supports native Obsidian bidirectional links, the full-size editor, and a large set of customizable shortcuts.
- **Knowledge-management friendly**: Minimal, no clutter. No connectors or summary frames — better for compressing knowledge; built for managing large volumes of notes, with a 200,000-character mind map loading in about 2 seconds.
- **Connect knowledge**: Insert images, video, audio, local file links, cross-map node links and more — diverse knowledge, all in one place. More Obsidian link features are on the way.

![Supports Obsidian bidirectional links](assets/obsidian-link.png)

*Caption: Supports Obsidian bidirectional links*

---

## 🚀 Quick Start

### Create your first map

- Click the "28 Notes" icon in the left ribbon.
- Or open the command palette, search "28", and use the command / hotkey to create one quickly.

### Basic shortcuts

| Action | Default shortcut |
|---|---|
| Bold node | `Cmd + B` |
| Mark selected node red | `Cmd + R` |
| Mark selected node yellow | `Cmd + Y` |
| (Un)set Now | `Cmd + N` |
| (Un)set Minor | `Cmd + M` |
| Node note | `Shift + Return` |
| Show only Now | `Cmd + Option + N` |
| Show / hide Minor | `Cmd + Option + M` |
| Select previous node | `↑` (not customizable) |
| Select next node | `↓` (not customizable) |
| Select parent node | `←` (not customizable) |
| Select child node | `→` (not customizable) |
| Enter current node | `Cmd + =` |
| Locate cycle | `Option + Space` |
| Add sibling above | `Option + Cmd + ↑` |
| Move caret to node start | `Cmd + [` |
| Move caret to node end | `Cmd + ]` |
| Add sibling one level up | No default — set your own |
| New mind map (28 Notes) | No default — set your own |
| Open history panel | No default — set your own |
| Toggle source file / mind map view | No default — set your own |

> `Cmd` is `Ctrl` on Windows; `Option` is `Alt` on Windows.

---

## 💰 Trial & Pricing

### 14-day free trial

A full-feature 14-day trial starts automatically after install, with no limitations.

### After the trial

We use a special pricing model:

- **Most features found in mainstream mind-map software: unlimited**
  - e.g. unlimited map generation, images, notes, Obsidian links, local file links, node links, etc.
- **28 Notes' original innovations: require activation after the trial**
  - e.g. Now, Minor, shortcuts, AI location path, multi-level folding, etc.

Details:

| Feature | Free | Pro |
|---|---|---|
| Unlimited map generation | ✅ | ✅ |
| General editing (add/delete nodes, drag, undo/redo…) | ✅ | ✅ |
| Enter node / breadcrumb nav | ✅ | ✅ |
| Bidirectional / file / node links | ✅ | ✅ |
| Notes | ✅ | ✅ |
| Multiple themes | ✅ | ✅ |
| History snapshots | ✅ | ✅ |
| UI simplification | ✅ | ✅ |
| Now node | ❌ | ✅ |
| Minor node | ❌ | ✅ |
| Save as shortcut | ❌ | ✅ |
| Copy AI location path | ❌ | ✅ |
| Advanced folding (by level) | ❌ | ✅ |

### Pricing

- **Early-bird price ¥38** (~~original ¥76~~ → -50%)
- One-time purchase: buy once, use local features forever
- Supports activation on **3 devices**
- Payment & activation: after installing the plugin, see Obsidian → Settings → 28 Notes → License

> Note: The one-time purchase covers all local features, but excludes possible future online AI-generation services / server-dependent features (noted for clarity only; such features are unlikely, since current AI Agents are already simple and easy to use).

---

## ❓ FAQ

### Will my data be uploaded?

No. 28 Notes runs fully locally — no data collection, no external API calls.

### How is it different from other mind-map software / plugins?

- **Other mind-map software / plugins**: proprietary formats that AI cannot edit directly; features converge.
- **28 Notes**: Markdown format, suited for AI Agents; packed with original features.

### Mobile support?

Desktop only for now. Mobile may come, but there is no fixed timeline.

### Can the activation code move to another computer?

Yes. One code activates up to 3 devices at the same time. Deactivate on the old device to use it on the new one.

### Can I let AI edit the map file directly?

Yes! That's exactly the design goal. Select a node, right-click "Copy AI location path", hand it to the Agent, and it can pinpoint and edit precisely. You don't even need to tell the AI what format to follow or add any Skill wrapper — 28 Notes has already taken care of it.

---

## 🗺️ Roadmap

- [ ] Advanced Obsidian link features
- [ ] AI skills optimization

---

## 📄 License

The plugin code is for Obsidian review and community verification only; redistribution or commercial resale is prohibited. See License for details.

---

*28 Notes MindMap — Minimal, no clutter, AI-friendly*
