# 德卡里奥斯家的书房：app-v35 进度检查点与 v0.4 恢复方向

> 记录时间：2026-08-19  
> 用途：在更换 ChatGPT Work 窗口前，固定当前事实、用户需求、失败结论与下一阶段架构边界。  
> 状态：**冻结 v35 UI 补丁；数据层保留；UI resource 层重新拆分。**

## 1. 当前线上状态

- Repository: `hammerhammer8617/dekarios-reading-room`
- Production branch: `feat/gtd-reading-room`
- Worker app version: `0.3.0`
- UI resource version: `app-v35`
- Deployed build SHA: `32a3cbedb2423d0a2d021329a060149bc3b384af`
- v35 PR: [#12](https://github.com/hammerhammer8617/dekarios-reading-room/pull/12)
- 线上 health 已返回以上版本，因此最近一次实测失败不能继续归因于“仍在使用旧部署”。

## 2. 用户真实观察到的结果

真实 ChatGPT 会话里已经出现过以下阶段性失败：

1. 早期书架以大型网页形式打开，几乎占满屏幕，并继承旧阅读器的深紫/黑色外壳。
2. 第一版“今天读到这里”卡片只有章节/页码，未可靠呈现：
   - 实际读到故事或论证的哪里；
   - 今天读了什么；
   - 塔芙的想法；
   - 盖尔的想法；
   - 留给下一次的问题。
3. v35 尝试压缩 UI 后，`open_bookshelf` 与 `render_reading_end_card` 均可能只显示为接近零高度的一条横线。
4. ChatGPT 仍可能在组件外说“书架已经打开”或“卡片生成出来了”，但实际组件不可见。因此模型旁白不能作为验收证据。
5. 多次刷新、重新连接和重复测试没有把结果变得稳定。

## 3. 仍然有效的产品要求

### 3.1 共读输入与自动流程

- 书页通过 ChatGPT 官端自带的图像理解输入：塔芙截图或拍摄她认为需要一起看的页。
- 塔芙本人就是内容筛选器；不要求导入整本书，也不再以“必须让模型实时看到全部视野”为目标。
- 当塔芙说“我们一起读”“你看这一页”、继续一本已命名的书，或在明确共读语境中发送书页图片时，应自动找到或恢复对应单本书。
- 普通共读过程中不要求塔芙操作 MCP UI。
- 支持同时共读多本书，所有进度、思考、问题和案件簿都必须按单本书隔离。
- 保留塔芙进度与共同/盖尔进度的分离：塔芙翻到更后面不能自动推进盖尔确认读过的位置。

### 3.2 书架

只有塔芙明确说“打开书架”“我最近在读什么”“看看某本书记录”等时才显示 UI。

书架必须移动端优先、紧凑。每本在读书至少显示：

- 书名；
- 塔芙当前读到哪里；
- 共同/盖尔读到哪里；
- 最近一条值得留下的思考；
- 仍保留的问题数或同步状态（有意义时）。

打开某本书后，应看到该书最新进度、按作者区分的最近思考、开放问题；推理小说还应能进入案件簿。

### 3.3 “今天读到这里”卡片

新生成的收尾卡必须显示有意义的内容，而非只显示页码：

- 书名与当前位置；
- 故事/论证推进到哪里；
- 基于塔芙实际提供书页的无剧透本次阅读总结；
- 塔芙本次留下的想法（如果出现）；
- 盖尔本次留下的想法（如果出现）；
- 一个值得带到下次的未解决问题（如果出现）；
- Notion/书页边缘同步状态。

塔芙已经提供的六张收尾卡背景图与一张书房背景图继续保留。

### 3.4 长期数据

继续保留：

- 塔芙 / 盖尔 / 共同三类署名思考；
- 开放问题、预测、分歧、连接与解释修订；
- 推理案件簿中的人物、关系、线索、假说、时间线与下一观察任务；
- 不越过当前剧透边界；
- 每本书对应 Notion 中的“《书名》｜书页边缘”；
- 增量同步与同步确认。

本轮恢复**不得修改无关的旧阅读器、导入、正文云存储或 R2 功能**。

## 4. 哪些成果可以保留

当前失败不要求推倒整个 MCP：

- Cloudflare Worker / D1 / R2 部署；
- 单本书 session；
- 塔芙与共同进度分离；
- 署名 durable thoughts；
- 开放问题；
- mystery casebook；
- Notion 增量准备与确认；
- 七张已批准视觉资产；
- “一工具一意图”的总体方向。

需要重新设计的是 **UI resource 边界、host bridge 兼容层与收尾卡数据流**。

## 5. 架构诊断

### 5.1 一个 UI resource 同时承担了互不兼容的产品

当前同一个 `web/index.html` / React entry 同时服务：

- 旧版完整阅读器；
- 书架；
- 书籍详情；
- 共读开始卡；
- 共读结束卡；
- 案件簿。

`web/src/main.tsx` 导入旧阅读器全局 `app.css`。该样式把页面视为完整视口，含有 `100vh` / `100dvh` 等规则；新小卡片只能靠运行时 class 与更高权重 CSS 把这些规则反向覆盖。这种结构会在“大型网页”和“被压成细线”之间反复失控。

### 5.2 高度协商存在未测试的失败路径

`web/src/bridge/host.ts` 只要发现自己位于 iframe 中，就创建标准 `McpApp`，并把连接错误静默吞掉：

```ts
appReady = app.connect().catch(() => undefined);
```

即使初始化失败，bridge 对象仍继续被选中。此时：

- 标准 MCP Apps 的自动 size notification 可能根本没有启动；
- 兼容 `window.openai` 路径没有被接管；
- 代码没有为兼容 host 显式上报 intrinsic height。

现有测试只 mock 了 bridge 连接成功，没有覆盖：

- 标准 MCP Apps 初始化失败；
- 只有 `window.openai` 的兼容 host；
- 动态内容 mount 后的高度上报；
- bootstrap 切换成书架/收尾卡后的高度变化。

这条失败路径与实测的“只有一条横线”高度吻合。

### 5.3 inline 卡片被做成了一个小网站

当前书架和收尾卡使用内部 `max-height + overflow: auto`；书架还在同一个组件内钻取书籍详情。它因此拥有嵌套滚动和深层导航，不再是一个聚焦的聊天内卡片。

### 5.4 收尾卡含义是临时参数，不是可靠记录

v35 的 `render_reading_end_card` 要求模型在“渲染时”传入 `progressSummary`、`readingSummary` 等自由文本。这些内容没有先作为本次阅读的权威快照持久化。

因此会出现：

- 模型口头说已生成，但没有可复查的数据记录；
- 新聊天只能用稀疏旧进度编造“测试总结”；
- 相同阅读操作再次渲染不一定复现同一张卡；
- UI 无法证明内容来自刚才保存的阅读回合。

### 5.5 render tool 缺少完整输出合同

所有返回 `structuredContent` 的 render tool 应声明准确的 `outputSchema`。缺少必填快照字段时，UI 应明确失败，而不是渲染空白组件或让模型在外面宣布成功。

## 6. v0.4 恢复方向

### A. 冻结 v35 UI 补丁

- 不再继续给现有 `reading-room.css` 打补丁。
- v35 只作为回滚/诊断参考。
- 在隔离 resource 的最小闭环通过以前，不再部署新 UI。

### B. 拆成单一用途的独立 resources

1. **Bookshelf summary surface**
   - 紧凑 inline list；
   - 不导入旧阅读器 CSS；
   - 不使用内部滚动；
   - 点书后调用独立工具/resource，而不是在同一张卡里深入导航。

2. **Book detail surface**
   - 一次只显示一本书；
   - 与书架 resource 隔离；
   - 可以提供案件簿入口，但不把书架变成多屏网站。

3. **Reading-end surface**
   - 纯渲染器；
   - 只读取已保存的权威快照；
   - 不带 reader shell、boot screen、路由切换或无关 feature import。

“共读已开始”卡不是必需品，且不得为每张书页重复渲染。默认体验仍然是：官端读图 + 自然聊天 + 后台记录。

### C. 先保存 reading-end snapshot，再渲染

正确顺序：

1. 保存本次进度与 durable thoughts；
2. 在同一次 operation 中保存“读到哪里”与本次阅读总结；
3. 生成或读取幂等的 reading-end snapshot；
4. render tool 只接受 `snapshotId`，或稳定的 `bookId + operationId`；
5. UI 只显示 snapshot 内容。

render tool 不再接收新的自由文本总结。

### D. 建立 standards-first host adapter 和可验证 fallback

- 标准 MCP Apps 初始化成功时，使用标准 bridge 与自动 resize。
- 初始化失败时，必须转入 `window.openai` capability fallback。
- 兼容 API 可用时，在 mount 与 ResizeObserver 变化时上报 intrinsic height。
- 不允许吞掉 bridge 错误后继续假装 ready。
- `requestDisplayMode("inline")` 不能替代 intrinsic-height 上报。

### E. 发布闸门

只有以下四关全部通过，才允许生产部署：

1. MCP 输入、输出 schema 与精确 fixture 测试；
2. 390 px 手机宽度与桌面宽度的静态 widget fixture；
3. host 测试：标准 bridge 成功路径 + 兼容/失败路径 + intrinsic height；
4. 一次真实 ChatGPT 验收。

只有前三关全绿，才请塔芙刷新/重连一次并执行第四关。

## 7. 明确停止条件

- 不让塔芙重复执行同一个不确定测试。
- 不合并或部署猜测性的 CSS-only 修复。
- 不根据 tool invocation 文案判断 UI 已工作。
- 不改无关旧阅读器、导入和云正文功能。
- 如果独立收尾卡不能通过 host-height 测试，停止并报告失败层；不要继续扩展到书架。
