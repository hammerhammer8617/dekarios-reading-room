# 接力工单：v0.4 独立“今天读到这里”卡片最小闭环

> 接力对象：下一个 ChatGPT Work 窗口  
> 优先级：P0  
> 类型：架构恢复 / 最小纵切  
> 基线分支：`feat/gtd-reading-room`  
> 建议工作分支：`agent/isolated-reading-end-v1`  
> 总体判断与约束：[reading-room-v04-recovery-direction.md](../reading-room-v04-recovery-direction.md)

## 一句话任务

从现有数据层之上重新建立一个**完全隔离、可复现、能正确上报高度的“今天读到这里”卡片**；只有它通过全部本地与 host 验收后，才开始处理书架。

## 0. 开工前必须先做

1. 阅读总体检查点文档。
2. 确认线上当前仍为 `app-v35` / build `32a3cbedb2423d0a2d021329a060149bc3b384af`。
3. 使用一个干净 checkout，或明确区分现有 dirty worktree 中哪些改动属于 v35。
4. 从 `feat/gtd-reading-room` 创建新分支；不要基于默认 `main` 猜测生产状态。
5. 先阅读这些现有文件，但不要默认沿用其结构：
   - `shared/src/tool-schemas.ts`
   - `server/src/mcp/register-reading-room-tools.ts`
   - `server/src/services/reading-room-service.ts`
   - `web/src/bridge/host.ts`
   - `web/src/ReadingRoomEntry.tsx`
   - `web/src/components/ReadingRoomSurface.tsx`
   - `web/src/styles/app.css`
   - `web/src/styles/reading-room.css`

## 1. 本工单目标

完成一条可验证的数据与 UI 链路：

```text
record/finish reading operation
        ↓
persist authoritative end snapshot
        ↓
render by snapshot identity
        ↓
isolated reading-end resource
        ↓
correct intrinsic-height report
```

最终卡片必须来自持久化快照，而不是来自 render tool 临时传入的文案。

## 2. 明确非目标

本工单不要处理：

- 书架 UI；
- 书籍详情 UI；
- 案件簿 UI；
- 旧完整阅读器；
- EPUB/漫画导入；
- R2 正文同步；
- UI 全局换色；
- Notion 页面实际写入流程重构；
- “共读已开始”卡；
- 生产部署。

如果实现过程中需要修改上述功能才能让收尾卡工作，先停下并说明耦合点，不要顺手扩大范围。

## 3. 数据合同

### 3.1 建立持久化 reading-end snapshot

为每一次完成的阅读 operation 保存或幂等生成一份快照。名称可以调整，但语义必须明确，例如：

```ts
type ReadingEndSnapshot = {
  id: string;
  bookId: string;
  operationId: string;
  createdAt: string;
  title: string;
  positionLabel: string;
  progressSummary: string;
  readingSummary: string;
  tavThought?: string;
  galeThought?: string;
  openQuestion?: string;
  notionSyncStatus: "synced" | "pending" | "not_requested";
  thoughtCount: number;
};
```

约束：

- `bookId + operationId` 必须幂等。
- `progressSummary` 必须有故事/论证含义，不能只是“第 91 页”。
- `readingSummary` 只能基于塔芙实际提供的书页。
- 没有出现的 Tav/Gale thought 或 open question 应省略，不能编造占位文案。
- summary 和 thoughts 的长度应在保存阶段限制到能被紧凑卡片完整呈现。
- 快照一旦用于渲染，同一 identity 重读必须得到相同内容。

### 3.2 保存入口

可以选择：

- 扩展 `record_reading_turn`，使它同 operation 保存 snapshot 所需字段；或
- 增加一个单一用途的 `finish_reading_session` mutation tool。

无论选择哪种方式：

- render tool 不能承担保存；
- render tool 不能接收新的 `progressSummary` / `readingSummary` 自由文本；
- 写入失败时不能继续渲染成功卡；
- Notion 尚未同步不能伪装成已同步。

### 3.3 Render tool

目标合同应接近：

```ts
render_reading_end_card({
  snapshotId
})
```

或在现有 repository 约束下使用：

```ts
render_reading_end_card({
  bookId,
  operationId
})
```

返回的 `structuredContent` 必须有精确 `outputSchema`，并与 UI fixture 一致。

缺少快照、快照字段不全或 identity 不匹配时：

- 返回明确 tool error；
- 不挂载空白 UI；
- 不给模型“今天读到这里”的成功 invocation 文案。

## 4. 独立 UI resource

### 4.1 隔离要求

新建独立 resource / entry，例如：

- `ui://dekarios-reading-room/reading-end-v1.html`

具体 URI 可按项目约定调整，但必须与旧 `app-v35` resource 分离。

该入口不得导入：

- `web/src/styles/app.css`；
- `ReadingRoomEntry`；
- 旧 reader shell；
- bookshelf/detail/casebook 组件；
- 任何 `100vh` / `100dvh` 页面布局。

允许共享：

- 经过明确筛选的 design tokens；
- 六张结束卡背景图；
- 小型、无副作用的 host adapter；
- snapshot TypeScript 类型。

### 4.2 卡片内容顺序

卡片至少按以下层级呈现：

1. 日期 / “今天读到这里”；
2. 《书名》；
3. 当前位置；
4. **读到哪里**：`progressSummary`；
5. **今天读了什么**：`readingSummary`；
6. **塔芙留下**：有才显示；
7. **盖尔留下**：有才显示；
8. **留到下次**：有才显示；
9. 同步状态。

视觉约束：

- mobile-first；
- 390 px 宽度下不横向溢出；
- 不使用内部滚动；
- 不依赖 fullscreen；
- 不显示空 section；
- 背景图只做氛围，不牺牲文字可读性；
- 允许对过长字段做服务器侧摘要和有限行数约束，但不能只剩页码。

## 5. Host bridge 与高度

### 5.1 标准路径

优先使用 MCP Apps 标准 bridge。确认 SDK auto-resize 确实在初始化完成后启动，并对动态内容变化发送 size-changed notification。

### 5.2 兼容 fallback

修复当前“连接失败仍继续使用 bridge 对象”的状态。

要求：

- 标准 bridge 初始化失败必须成为可观察状态；
- 失败后回退到 capability-detected `window.openai`；
- `window.openai.notifyIntrinsicHeight` 可用时，在首次稳定 mount 和 ResizeObserver 变化时调用；
- fallback 不可用时显示可诊断错误，不可静默压成一条线；
- `requestDisplayMode("inline")` 不算完成高度上报。

不要吞掉 connect error 后继续返回一个假 ready bridge。

## 6. 必需测试

### 6.1 Schema / service

至少覆盖：

- snapshot 必填字段；
- bare page 不能作为 `progressSummary` 的唯一内容；
- 相同 `bookId + operationId` 幂等；
- Tav / Gale / open question 分别存在与省略；
- render 只从 snapshot 读取；
- 缺失 snapshot 返回错误；
- `outputSchema` 与真实 `structuredContent` 完全匹配。

### 6.2 Component fixture

创建固定 fixture，内容不得使用 lorem ipsum。至少包含：

- 《打怪》
- 位置：第 19 页
- progressSummary：读完“崇高的怪物性”，进入“受遏制的怪物性”
- readingSummary：一段能验证换行与层级的中文总结
- Tav thought
- Gale thought
- open question
- pending sync

在以下宽度保存/检查截图：

- 390 px；
- 768 px。

验收：

- 所有字段可见；
- 背景裁切合理；
- 无横向滚动；
- 无内部纵向滚动；
- 页面高度等于内容高度，不是 `100vh`；
- 无 bootstrap/legacy reader 闪屏。

### 6.3 Host adapter

必须模拟：

1. 标准 bridge 成功并发送 size change；
2. 标准 bridge 初始化失败、兼容 API 成功；
3. 动态 snapshot 到达后高度变化；
4. 两条路径都不可用时的可诊断错误；
5. 不重复发送无变化高度；
6. StrictMode 双 effect 不留下失效 observer。

### 6.4 构建产物审计

最终单文件或 resource 产物中不得包含旧 reader 的关键壳样式/文案：

- `100dvh` reader shell；
- `open_reading_nest` boot diagnostics；
- bookshelf/detail/casebook 组件文本；
- 旧 app-v35 route switch。

同时确认六张 card background 仍可从隔离入口正确选择。

## 7. 验收闸门

### Gate 1 — data

- 保存快照；
- 重新读取得到完全相同 payload；
- 缺失字段时明确失败。

### Gate 2 — visual

- 390/768 fixtures 通过；
- 无 internal scroll；
- 文本层级与背景都可读。

### Gate 3 — host

- 标准与兼容路径测试全部通过；
- intrinsic height 有明确测试证据；
- 不再存在“组件有内容但外层高度接近 0”的路径。

### Gate 4 — ChatGPT

前三关全部通过后，才：

1. 部署一个新的、版本化的 reading-end resource；
2. 刷新插件连接一次；
3. 在一个新聊天里进行一次真实验收；
4. 截图确认卡片可见且字段与快照一致。

在 Gate 4 以前，不要让塔芙充当测试环境。

## 8. 完成定义

本工单完成时，PR 必须提供：

- 新 snapshot 数据合同；
- migration/兼容策略（如数据结构变化需要）；
- 新独立 reading-end resource；
- host fallback；
- schema/service/component/host 测试；
- 390 px 与 768 px fixture 截图；
- 构建与测试命令及结果；
- 明确说明没有修改的旧功能；
- 一个尚未部署的候选版本号。

只有这一条纵切完全可靠，下一张工单才处理书架。

## 9. 交接纪律

- 不继续给旧 `reading-room.css` 打补丁。
- 不把“模型说生成成功”当作验收。
- 不要求塔芙连续刷新或重复同一句指令。
- 遇到 host 行为不确定时，先添加观测与测试，再修改。
- 不因赶进度扩大范围。
- 任何会触发生产部署的修改都要在 Gate 1–3 全绿后再做。
