# Loading 感知优化方案（Git Switcher v1.6.1）

> 目标：让用户在任何异步等待中都能回答三个问题——**「是否在加载？」「加载什么 / 加载到哪一步？」「我能取消 / 重试吗？」**
> 本文只做分析与方案，不含已落地的代码改动。

---

## 0. 结论摘要（TL;DR）

| # | 问题 | 根因（证据） | 影响 |
|---|------|-------------|------|
| P0-1 | 全局刷新完全不可见 | `useProjects.ts:197-242` 的 `refreshAll` 从不设置任何 loading 状态；`loading` 只在挂载时用一次（`useProjects.ts:16,32-46`） | 定时刷新(30s)/窗口聚焦/托盘/后台服务/Cmd+R 全部静默，用户无法区分「已刷新且无变化」与「没刷新」 |
| P0-2 | 批量操作一点击就丢失全部进度 | `BatchOpsToolbar` 渲染在 `DropdownMenu` 内，`primitives.tsx:337-340` 的 `onClick={() => setTimeout(() => setOpen(false), 0)}` 在点击后卸载它；`batchLoading/batchProgress` 在全仓库只有这一个消费者（`Header.tsx:345-357`） | 用户点击 Fetch All 后菜单关闭，**没有任何**「正在执行」的视觉残留，只能等 toast |
| P0-3 | 批量「进度」其实只在结束时才出现 | Rust `git.rs:1260` 先 `let results = op(&paths)` 全部算完，再 `:1263-1279` 循环 emit `batch-result` | `ProgressBadge` 从 0 直接跳到 N，不是流式进度 |
| P0-4 | 启动自动 fetch 没有前置指示 | `App.tsx:242-275`：先跑完 3 个并发 worker 抢完全部项目，才 `setAutoFetchFailures`；没有任何「正在 fetch N 个仓库」的全局状态 | 启动后一段安静期 + 行内 `ActiveOpBanner` 只在可见行上出现 |
| P0-5 | 加载态不可被辅助技术感知 | 全仓库 `aria-busy`: 0 处，`role="status"`: 3 处（均非 loading），loading 专用 `aria-live`: 0 处；4 个纯 spinner 无任何可访问名（`NotificationPanel.tsx:110`、`OperationLogPanel.tsx:261`、`CustomCommandsManager.tsx:146`、`CredentialsSettings.tsx:181`） | VoiceOver 用户完全感知不到「正在加载」 |
| P1-1 | 指示器「方言」不统一 | 35 处 `animate-spin`（其中 25 处是旋转 `↻` 字形，7 处边框圆环，3 处重复 SVG）、约 26 处纯文字、9 处 `animate-pulse`、3 处硬编码 `...` | 同一种「加载中」在不同视图出现 6 种长相 |
| P1-2 | 骨架屏只有 1 个消费方且形状不符 | `Skeleton*` 仅在 `ProjectGrid.tsx:180-229` 使用；`SkeletonTable` 7 列表头 vs `ProjectTable` 9 列（`ProjectTable.tsx:118-135`）；`SkeletonCard` 缺色条/状态点/拖拽把手 | 骨架→内容切换有明显跳动 |
| P1-3 | 骨架屏不遵守设计令牌 | `Skeleton.tsx:10` 硬编码 `bg-gray-200 dark:bg-gray-700`；容器又是 `animate-pulse`（`:19,38,55`） | 深色模式下灰块比 `--surface-2` 更亮，骨架「发光」；掉色域 |
| P1-4 | `prefers-reduced-motion` 降级写法有风险 | `globals.css:823-841`：全局 `0.01ms !important; iteration-count:1`，随后用 `animation-duration: revert !important` 试图恢复 spinner——`revert` 回滚到 **UA 来源**而非 Tailwind utilities 层，结果可能是静止 spinner 或 0.01ms×infinite 闪烁 | 前庭敏感用户反而看到频闪 |
| P1-5 | 同一刷新操作在不同入口反馈不一致 | 只有行内刷新按钮设 `refreshing`（`useProjectRow.ts:65-72`）；空格键（`App.tsx:777-781`）、右键菜单（`projectMenu.tsx:230-240`）、冲突解决器（`App.tsx:1137`）、分组指派（`ProjectRowShell.tsx:837`）都直接调 `refreshProject`，零反馈 | 用户以为按键失效，反复按 |
| P1-6 | 首屏/切换时「假空态」 | 任务工作区（`TaskWorkspaceDialog.tsx:30-35`）、命令面板数据（`useCommandPalette.ts:107-142`）加载期无指示；`GitOpsPanel` 文件列表首次打开 `files.length===0` 时整段不渲染（`GitOpsPanel.tsx:452`），面板展开后约 200–500ms 内看起来「没有改动」 | 用户把「加载中」误读为「没有数据」 |
| P2-1 | 文案/i18n 漂移 | en 中 98 处以 ASCII `...` 结尾、34 处用 `…`，同义键混用（`common.loading`="Loading..." vs `menu.loading`="Loading…"）；zh-CN 存在错别字 `stash.loadingStashes`="加载蔽薯中..."（`locales/zh-CN.json:1636`）、`row.op.cherry_pick`="樱桃掌加中"（`locales/zh-CN.json:618`） | 加载文案观感粗糙 |
| P2-2 | 无首屏 shell | `index.html:37` 只有一个空 `#root` | 冷启动白屏期无品牌化反馈 |

**核心判断**：问题不只是「特效不够花」，而是**语义层缺失**——没有一个统一原语承载「进行中」这一状态，于是各视图各自手搓，而最需要反馈的全局刷新与批量操作恰好完全没有反馈。

---

## 1. 现状盘点

### 1.1 加载指示器清单（`grep` 统计）

| 形态 | 数量 | 代表位置 | 问题 |
|------|-----:|---------|------|
| 旋转 `↻` 字形 | 25 | `BatchOpsToolbar.tsx:45,66,88,112,139`、`ProjectRowShell.tsx:409,528,545,563,605`、`AiReviewDialog.tsx:267,282,325`、`CommitLog.tsx:190`、`GitLogViewer.tsx:397`、`BranchDropdown.tsx:228` | 字号 `text-xs`→`text-3xl` 无规范；16 处漏写 `inline-block`，行内非替换盒不可 transform，**可能根本不转** |
| 边框圆环 spinner | 7 | `ReflogView.tsx:140`、`FileHistoryView.tsx:67`、`NotificationPanel.tsx:110`、`OperationLogPanel.tsx:261`、`BranchCompareView.tsx:61`、`CustomCommandsManager.tsx:146`、`CredentialsSettings.tsx:181` | 硬编码 `border-blue-500`，绕过 `--accent`；其中 4 处无文字无标签 |
| SVG 弧 spinner | 3 | `CommandPalette.tsx:369`、`QuickDiffPanel.tsx:142`、`LlmSettings.tsx:223` | 同一段 SVG 复制三份，颜色不一致（`text-gray-400` 在 `--surface-1` 上约 2.5:1） |
| 纯文字 | ~26 | `BlameView.tsx:139`、`TraySettings.tsx:135`、`DiffViewer.tsx:1039`、`GitOpsCommitBar.tsx:136` 等 `t("common.loading")` | 无动效、无 live region，像空白/卡死 |
| 骨架屏 | 9 行 / 4 组件 | `ui/Skeleton.tsx`；另有 3 处内联重写：`ProjectGrid.tsx:197`、`ProjectStatsPanel.tsx:66`、`BranchHealthPanel.tsx:76` | 只有 opacity pulse，没有 shimmer；令牌不一致 |
| 按钮文案切换 + `disabled` | 38 处 `disabled={loading…}` | `GitOpsPanel.tsx:559-563`、`InteractiveRebase.tsx:315-319`、`ConfirmDialog.tsx:87` | 信号叠加（禁用+换文案+转圈），有的只有禁用无文案（`AddProjectDialog.tsx:114-121`） |
| 硬编码省略号 | 3 | `BisectPanel.tsx:114,121`、`ProjectRowShell.tsx:410`、`GitOpsPanel.tsx:524,534` | 未走 i18n |
| 已做得好的范例 | — | `ActiveOpBanner`（`ProjectRowShell.tsx:394-428`）：spinner + 操作名 + 已耗时 + 取消；`AiReviewDialog.tsx:280-288`：流式已接收字符数；`BranchHealthPanel.tsx:74-88` 骨架 | **应当作为全局模板推广** |

### 1.2 异步流程 × 当前反馈 × 缺口

| 流程 | 触发 | 当前反馈 | 缺口 | 级别 |
|------|------|---------|------|------|
| 首屏项目列表 | 挂载 | 全视图骨架（`ProjectGrid.tsx:180-229`）；Header 同时显示计数 `0` | 失败时骨架换成「欢迎添加项目」空态（`ProjectGrid.tsx:231-247`），错误被 toast 吞掉，无重试 | P1 |
| 全部刷新（手动） | Cmd+R / 命令面板 / 托盘 / 撤销后 / 导入后 / 拖放 | **无**，只在失败时 toast | 同上 P0-1；连续 Cmd+R 并发打 `list_projects`，无 in-flight 去重 | P0 |
| 定时/聚焦/联网自动刷新 | 30s、focus(1.5s 冷却)、online | **无** | 无法区分「已刷新」与「陈旧」 | P1 |
| 启动自动 fetch | `App.tsx:263-275` | 仅可见行上的 `ActiveOpBanner`（依赖后端 `git-op-start`） | 无全局「N/M 个仓库」进度；离线横幅的 Retry 无 busy 态可重复触发（`OfflineBanner.tsx:81-86`） | P0 |
| 单项目刷新 | 行内按钮 | 按钮 `↻` 旋转（`ProjectRowShell.tsx:604-608`） | 其它入口（空格/右键/冲突解决/分组）零反馈 | P1 |
| 分支切换 | `BranchDropdown` | 下拉内 spinner + disabled；乐观更新立即改分支名 | 乐观更新掩盖了等待感；失败回滚是静默闪变 | P1 |
| 单项目 fetch/pull/push | 行按钮 / 右键菜单 | 按钮 spinner + `ActiveOpBanner` | 菜单关闭后只剩小 spinner | P2 |
| 批量 fetch/pull/push/sync | 更多菜单 / 命令面板 / 快捷键 / 托盘 | 菜单内 spinner + `ProgressBadge` | **点击即卸载**（P0-2）；进度非流式（P0-3） | P0 |
| 命令面板数据加载 | 打开 | **无** | 运行项/脚本异步到达，首次打开像空的；模块级 `scriptCache` 永不失效（`useCommandPalette.ts:57`） | P2 |
| 面板/弹窗类（日志、diff、reflog、blame、文件历史、对比…） | 打开 / 切换 | 各自手搓 spinner 或骨架 | 6 种长相，无 live region；`GitOpsPanel` 文件区首次打开不渲染任何加载态 | P1 |

### 1.3 现有可复用资产（避免重复造轮子）

- `useGitOpTracker`（`useGitOpTracker.ts`）：已有 `git-op-start/done/error` 事件流，带 `id/op/path/startedAt`，后端 20+ 个命令已 emit（`git.rs:82,251,300,…,1955`）——**这是全局「进行中」的现成数据源**。
- `useBatchOps` 的 `batch-result` / `batch-done` 事件。
- `useAutoRefresh` 的 `busyOpsRef`（`useAutoRefresh.ts:13-31`）：已经知道何时有 git 操作在跑，是刷新去重/暂停的天然挂点。
- `ui/Skeleton.tsx`、`SkeletonRow/Card/Table`。
- `ActiveOpBanner` 的「spinner + 动词 + 耗时 + 取消」信息结构。
- 设计令牌：`--accent`、`--surface-0/1/2`、`--border-color`、`--ease-spring`、`--ease-out-soft`、`prefersReducedMotion()`、`usePresence()`。

---

## 2. 设计原则（约束后续实现）

1. **三态胜过两态**：任何区域都应有 `loading（首次）/ refreshing（有旧数据）/ idle`，刷新时**保留旧内容并给出弱提示**，不要回到骨架屏（避免闪烁与焦点丢失）。
2. **延迟出现、最短驻留**：等待 <150ms 不显示任何指示器（防闪烁）；一旦显示至少驻留 300–400ms（防闪一下就没）。用 `useDelayedFlag(active, {delay, minDuration})` 统一实现。
3. **就地反馈优先于全局遮挡**：能局部解决的绝不用全屏遮罩；全局只保留一条 2px 顶部进度条 + 「N 项进行中」胶囊。
4. **每个等待都应可解释、可中途取消（长任务）**：>2s 的操作显示动词与已耗时；能取消的（已由 `cancelGitOp` 支持）显示取消。
5. **一个原语，所有场景**：`Spinner` / `LoadingState` / `ProgressBar` / `Skeleton` 四件套，禁止再手写 `<span className="animate-spin">↻</span>`。
6. **可访问性是一等公民**：每个 loading 区域 `aria-busy`；全局只用一个 `aria-live="polite"` 播报点，避免多个 live region 互相打断。
7. **动效服务信息**：动效时长 150–300ms，`--ease-out-soft`；reduced-motion 下**保留静态状态字**而非关闭反馈。

---

## 3. 方案

### 阶段 0：地基（新增原语 + 令牌 + 修复 reduced-motion）

**3.1 `ui/loading.tsx` 新增四件套**

```tsx
// Spinner：唯一允许的旋转指示器
<Spinner size="xs|sm|md|lg" tone="accent|muted" label={t("common.loading")} />
// - SVG 弧线 + currentColor，颜色走 text-[var(--accent)] / text-gray-400
// - 内层 svg aria-hidden，外层可选 role="status" + sr-only label
// - reduced-motion：animation: none + 静态半透明弧（仍是「沙漏」语义）

// LoadingState：区域级加载占位（替代 26 处纯文字与 4 处无标签 spinner）
<LoadingState label={t("log.loading")} variant="inline|block" skeleton={<Rows n={8} />} />

// Skeleton 家族：改为令牌驱动 + shimmer + 单层 pulse
<Skeleton width="w-32" height="h-4" />
// bar: bg-[var(--skeleton)] ；容器: bg-[var(--surface-1)] border-[var(--border-color)]
// shimmer: ::after 渐变 translateX 扫过，1.6s linear，仅 prefers-reduced-motion: no-preference

// ProgressBar：程序化进度（批量/长任务）
<ProgressBar value={completed} max={total} label=... />
// role="progressbar" aria-valuenow/min/max，宽度 transition 300ms var(--ease-spring)

// useDelayedFlag(value, { delay: 150, minDuration: 350 })
```

**3.2 新增 CSS 令牌**（`globals.css` `:root` / `.dark`）

```css
--skeleton: var(--surface-2);                     /* 浅色 */
--skeleton: color-mix(in oklab, var(--surface-2), black 6%); /* 深色，略暗于 surface-2 */
--skeleton-highlight: color-mix(in oklab, var(--skeleton), white 8%);
--loading-bar-h: 2px;
```

**3.3 修复 reduced-motion 块**（`globals.css:823-841`）

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* 状态反馈保留但去除频闪：显式时长，不用 revert（revert 回滚到 UA 而非 utilities） */
  .loading-spin { animation: loadingSpin 2s linear infinite !important; }
  .animate-pulse { animation: none !important; opacity: 0.7; }
  .skeleton-shimmer::after { display: none; }
}
```

**3.4 i18n 收口**：新增键 `common.loadingGeneric`、`common.refreshing`、`common.stillLoading`、`common.cancel`（已有）、`common.loadingStarted`；修正 `stash.loadingStashes`、`row.op.cherry_pick` 错别字；统一 `…`；在 `scripts/check-i18n.mjs` 增加规则：**loading 类键不得以 ASCII `...` 结尾**。

### 阶段 1：全局「正在刷新」可见化（解决 P0-1 / P0-4）

**3.5 `useProjects` 增加刷新状态**

```ts
// 关键点：不把现有 loading 改成每次刷新都 true（那会让全屏骨架屏反复闪）
const [refreshState, setRefreshState] = useState<{ active: number; lastDoneAt: number }>(...)
```

- `refreshAll` / `refreshProject` 进出时维护 `active` 计数 + `lastDoneAt`；
- in-flight 去重：同一路径或全局刷新正在进行时，返回同一个 Promise（`App.tsx` 的连续 Cmd+R 不再并发打 IPC）；
- 暴露 `isRefreshing`、`lastUpdatedAt`、`refreshingPaths: Set<string>`。

**3.6 全局刷新指示（App 外壳）**

- `Header` 增加一个**刷新状态区**：`Spinner(xs) + "刷新中…"`，空闲时显示相对时间「刚刚更新 / 2 分钟前」，hover 显示「点击刷新」（`role="status" aria-live="polite"`）。
- `<main>` 顶部叠加 `ProgressBar` 的**不确定态**（indeterminate）细条，用 `useDelayedFlag` 150ms 延迟出现，刷新结束后 300ms 淡出。
- 定时刷新（`useAutoRefresh`）时只显示弱化文案「正在后台刷新」，不闪烁。

**3.7 单项目刷新效果统一**

- 在 `useProjects` 暴露 `refreshingPaths`，所有入口（行按钮、空格键、右键菜单、分组指派、冲突解决器）读同一个状态，行上呈现统一的「整行弱化 + 行内 spinner」而非各自维护 `refreshing`。
- 乐观更新的分支切换：切换期间在分支名旁显示 `Spinner(xs)`，且**延迟 150ms** 再出现，避免快速切换时的闪烁。

**3.8 启动自动 fetch 全局进度**

- `runAutoFetch` 改为维护 `{ total, done, failed, running }`，Header 状态区显示「正在获取 3/12 个仓库」；
- 完成后展示汇总 + 失败可点开（复用 `OfflineBanner` 的失败列表）；
- `OfflineBanner` 的 Retry 在运行中显示 busy 并禁用，避免重复触发。

### 阶段 2：批量操作进度不再「点击即消失」（解决 P0-2 / P0-3）

- **UI**：批量操作启动后，Header 状态区切换为「批量拉取中 4/12」+ 可取消；`BatchOpsToolbar` 保留菜单内反馈，但**不再是唯一入口**。
- **后端**：`execute_batch`（`git.rs:1250-1282`）改为**每完成一个就 emit 一次**——需要把 `op(&paths)` 从「批量返回 Vec」改为逐项迭代回调（或至少按 chunk 处理），使 `batch-result` 真实流式。这是本方案唯一涉及 Rust 侧的改动，可独立提交、单独测试。
- **超时语义**：`useBatchOps.ts:70-77` 的 120s 安全超时不应把 UI 置空后仍让后端继续跑——改为超时后进入「仍在运行，已失去进度」降级态，并在 `batch-done` 到达时正确收敛。

### 阶段 3：视图级语义化（解决 P1-1 / P1-2 / P1-3 / P1-6）

按「改动收益/成本」排序：

1. **优先替换 26 处纯文字 + 4 处无标签 spinner** → `<LoadingState>`（几乎零风险，收益最直观）。
2. **统一 7 处边框圆环 + 3 处 SVG 弧 + 25 处 `↻`** → `<Spinner>`；顺带修复 16 处 `inline-block` 缺失导致的「不转」问题。
3. **骨架屏对齐真实布局**：`SkeletonTable` 改为从 `ProjectTable` 的列定义生成列宽；`SkeletonCard` 补色条、状态点、拖拽把手；行高与 `ProjectTable.ROW_HEIGHT` 一致。
4. **骨架→内容交叉淡入**：骨架与内容各用 `usePresence` 160ms `var(--ease-out-soft)` 交叉，避免硬切。
5. **消灭假空态**：`TaskWorkspaceDialog`、`GitOpsPanel` 文件区、命令面板首开，统一改为「加载中占位 → 空态 → 内容」三分支（`ProjectRowShell.tsx:935-947` 的分组选择器已是正确范例，照抄）。
6. **面板/弹窗**：`DiffViewer`、`CommitLog`、`GitLogViewer`、`ReflogView`、`BlameView`、`FileHistoryView`、`BranchCompareView` 统一 `LoadingState variant="block"`，并把「Loading commit log...」等硬编码英文换成 i18n 键。

### 阶段 4：动效与首屏收尾

- **shimmer 骨架**：1.6s linear 扫过（比 opacity pulse 更能表达「进行中」），实现放 `globals.css` keyframes + 仅在 `no-preference` 下启用。
- **首屏 shell**：`index.html` 内联极简骨架（与 `SkeletonRow` 形状一致 + 品牌色 spinner），React 挂载后由 `#root` 替换，消除冷启动白屏。
- **全局「进行中」胶囊**（可选）：基于 `useGitOpTracker.activeOps`，在 Header 常驻显示「2 个操作进行中」，点击展开可逐个取消——直接复用后端已有的 `cancel_git_op`。

---

## 4. 可访问性规格

| 项 | 要求 |
|----|------|
| 区域级 | 加载容器 `aria-busy="true"`；完成后移除 |
| 播报 | **全局仅一个** `role="status" aria-live="polite"`（放 Header 状态区）播报「开始刷新 / 完成 / 失败 N 个」；局部 loading 用 `sr-only` 文本，不新建 live region |
| 装饰性 | 所有 spinner SVG `aria-hidden="true"`；`↻` 字形的文本节点必须移入 `aria-hidden` 包裹 |
| 可访问名 | 无文字的 spinner 容器必须有 `role="status"` + `sr-only` 标签（如「正在加载通知」） |
| 进度 | `ProgressBar` 使用 `role="progressbar"` + `aria-valuenow/min/max/valuetext` |
| 焦点 | 加载→内容切换不得移动焦点；面板挂载加载占位时保留触发按钮的焦点 |
| 对比度 | 指示器前景 ≥3:1；`--skeleton` 与背景对比 ≥1.2，并随 `prefers-contrast: more` 加强 |
| 动效 | reduced-motion 下 spinner 降为静态弧 + 文字，pulse/shimmer 关闭（按 3.3 显式实现） |

---

## 5. 建议的实施批次（每批可独立提交、独立回滚）

| 批次 | 内容 | 预估 | 风险 |
|:---:|---|---|---|
| B1 | 3.1 四件套 + 3.2 令牌 + 3.3 reduced-motion 修复 + 单测 | 1–1.5d | 低（纯新增） |
| B2 | 阶段 1：`useProjects` 刷新态 + Header 状态区 + 去重 | 1–1.5d | 中（触及核心数据流，需回归 `useAutoRefresh.test.tsx` 的聚焦去重契约） |
| B3 | 阶段 2：批量进度 UI 外置（先只改前端，Rust 流式单独一 PR） | 1d | 中 |
| B4 | 阶段 3 第 1–2 步：替换纯文字与 spinner（机械替换，可分批按目录） | 0.5–1d | 低 |
| B5 | 阶段 3 第 3–6 步：骨架对齐 + 交叉淡入 + 消灭假空态 + 面板统一 | 1.5–2d | 中 |
| B6 | 阶段 4：shimmer + 首屏 shell + 全局操作胶囊 | 1d | 低 |
| B7 | 3.4 i18n 收口 + `check-i18n` 规则 + 错别字修复 | 0.5d | 低 |

## 6. 验证与测试清单

- **单测**：`Spinner` 在 reduced-motion 下静态；`LoadingState` 暴露 `role="status"`；`SkeletonTable` 列数与 `ProjectTable` 一致；`useDelayedFlag` 的延迟/最短驻留；`useProjects` 去重（并发 `refreshAll` 只发一次 IPC）；批量进度在 `batch-result` 流式到达时递增。
- **回归**：`useAutoRefresh.test.tsx`（focus 合并语义）、`ProjectRowShell.test.tsx:184-215`（分组加载/错误/重试三分支）、`ProjectGrid.test.tsx`（骨架分支——目前完全没有覆盖 loading=true）。
- **手工验收**：30 个项目下首屏、Cmd+R 连按、断网后恢复、批量 fetch 途中切到别的视图、VoiceOver 播报、系统开启「减弱动态效果」。
- **视觉验收**：浅色/深色 × loading/refreshing/empty 三态截图，纳入 `preview-shots/` 对照。

## 7. 不做的（明确边界）

- 不引入动画库（Framer Motion 等），避免为 loading 增加约 40KB 依赖；CSS 足够。
- 不改「首屏用骨架屏」这一策略——它是对的，只需让它更贴近真实布局。
- 不把刷新状态做成全屏遮罩：Git 客户端的数据刷新频繁，全局遮挡会严重打断操作。

---

## 8. 实施记录（B1–B7 已落地）

| 批次 | 落地内容 | 关键文件 |
|:--:|---|---|
| B1 | 四件套 `Spinner / LoadingState / Skeleton / ProgressBar` + `LoadingBar` + `SkeletonGroup` + `useDelayedFlag(delay 150 / minDuration 350)`；新增 `--skeleton`、`--skeleton-highlight`、`--loading-bar-h`、`--loading-bar-track`；重写 reduced-motion 块（`revert` → 显式 2s 旋转、pulse 关闭、shimmer 关闭） | `src/components/ui/loading.tsx`、`src/components/ui/Skeleton.tsx`、`src/styles/globals.css`、`src/components/ui/loading.test.tsx` |
| B2 | `useProjects` 增加 `isRefreshing / isRefreshingAll / refreshingProjectCount / refreshingPaths / lastRefreshedAt`，`refreshAll` 与 `refreshProject` 均做 in-flight 合并，`dataGenerationRef` 防止旧快照覆盖乐观更新；Header 常驻状态区；`<main>` 顶部 2px indeterminate 细条；启动 auto-fetch 显示 `3/12` 并对 Retry 加占用锁；行内刷新状态改由共享 `refreshingPaths` 驱动 | `src/hooks/useProjects.ts`、`src/hooks/useProjectRow.ts`、`src/context/ProjectContext.tsx`、`src/components/RefreshStatus.tsx`、`src/components/Header.tsx`、`src/App.tsx`、`src/hooks/useProjects.test.tsx`、`src/components/RefreshStatus.test.tsx` |
| B3 | 后端 `run_batch_streaming`（滑动窗口，并发上限仍为 8）+ `BatchStart` 事件；`BatchOperation` 改为单仓库签名，`fetch/pull/push/sync_single` 就位；前端 `batch-start` 提供分母、`BatchStatus` 常驻胶囊（菜单关闭后仍在）、超时改为「stalled」降级而非伪结束、重复触发给出解释 | `src-tauri/src/services/git_service.rs`、`src-tauri/src/commands/git.rs`、`src-tauri/src/models/project.rs`、`src/hooks/useBatchOps.ts`、`src/components/BatchStatus.tsx`、`src/components/BatchOpsToolbar.tsx`、`src-tauri/src/tests.rs`、`src/hooks/useBatchOps.test.tsx`、`src/components/BatchStatus.test.tsx` |
| B4 | 30 个面板/弹窗的 spinner、纯文字、`"..."`、重复 SVG 全部换为 `Spinner` / `LoadingState`；顺带修掉 16 处缺 `inline-block` 导致「不转」的字形；生产代码中 `animate-spin` 归零 | ReflogView、FileHistoryView、NotificationPanel、OperationLogPanel、BranchCompareView、CustomCommandsManager、CredentialsSettings、CommitLog、GitLogViewer、InteractiveRebase、StashManager、WorktreeManager、TagManager、SubmoduleManager、HooksManager、BlameView、CommitPreview、TraySettings、BackgroundSettings、GeneralSettings、OperationConfirmDialog、QuickDiffPanel、CommandPalette、LlmSettings、AiReviewDialog、GitOpsCommitBar、BisectPanel、GitignoreEditor、ProjectStatsPanel、BatchOpsToolbar、BranchDropdown、ProjectRowShell、GitOpsPanel |
| B5 | 骨架屏对齐真实布局（卡片补色条/操作行/分支控件/状态胶囊，表格列数来自 `TABLE_COLUMNS=9`）；骨架→内容 200ms 交叉淡入（reduced-motion 下直接切换）；三处假空态改为「加载 → 失败+重试 → 空」；`GitOpsPanel` 文件区首次加载骨架、后续刷新保留旧列表 | `src/components/ProjectGrid.tsx`、`src/components/ui/Skeleton.tsx`、`src/components/BranchHealthPanel.tsx`、`src/components/TaskWorkspaceDialog.tsx`、`src/components/GitOpsPanel.tsx`、`src/components/ProjectGroupsPanel.tsx`、`src/components/loadingFeedback.b5.test.tsx` |
| B6 | shimmer 骨架（1.6s 扫光，reduced-motion 关闭）；`index.html` 首屏 shell（与真实布局同形、随 React 挂载被替换、终端窗口不显示）；`ActiveOpsIndicator` 全局操作条（聚合 `useGitOpTracker`，可逐个取消）；`ActivityBar` 补 `progressbar` 语义；复制成功不再用 `animate-pulse` | `index.html`、`src/styles/globals.css`、`src/components/ActiveOpsIndicator.tsx`、`src/components/ProjectStatsPanel.tsx`、`src/components/DiffViewer.tsx`、`src/App.tsx` |
| B7 | 加载类文案 66(en)/51(zh) 条 `...` → `…`；`check-i18n.mjs` 新增规则「loading 类键不得以 ASCII `...` 结尾」；修 zh 错别字 `蔽薯`→`贮藏`（10 处）、`樱桃掌加中`→`正在拣选…`，并统一 `row.op.*` 措辞 | `locales/en.json`、`locales/zh-CN.json`、`scripts/check-i18n.mjs` |

### 验收数据

| 指标 | 之前 | 之后 |
|---|--:|--:|
| 生产代码 `animate-spin` | 35 | **0** |
| `aria-busy` | 0 | 8 |
| `role="status"` | 3 | 13 |
| `LoadingState` 调用点 | 0 | 27 |
| `Spinner` 调用点 | 0 | 26 |
| 手写骨架（硬编码 gray） | 4 组件 | 0（全部走 `--skeleton`） |
| 无标签 spinner | 4 | 0 |
| 加载文案 ASCII `...` | 71 条 | 0（CI 阻止新增） |

验证：`tsc --noEmit` 0 error；`vitest` 93 文件 / 565 测试全绿；`vite build` 通过；`cargo fmt --check`、`clippy -D warnings` 通过；`cargo test` 96 passed（4 个 terminal pty 测试因沙箱禁止 openpty 失败，在未改动的基线上同样失败）。

---

## 9. 终端界面（补做）

第一轮 B1–B7 覆盖了主窗口的面板与弹窗，但**终端**是一块自成体系的界面，之前没有纳入。终端的「加载」不是网络请求，而是 pty 生命周期：会话列表恢复、shell 启动、首屏输出。这些阶段全都是黑屏，用户无法区分「正在启动」和「卡死了」。

| 缺口 | 之前的行为 | 现在 |
|---|---|---|
| 会话列表恢复（`terminal_list`） | `useTerminal` 以 `EMPTY_TABS` 起步，请求还在飞就已经渲染 `TerminalBlankSlate` —— 召唤窗口时先告诉用户「No terminals open」并邀请新建，几百毫秒后才把真实标签页塞进来。请求失败则被 `.catch(() => {})` 吞掉，永久停在这个错误空态 | 新增 `bootstrapping` / `bootstrapError` / `retrySessions`。加载中显示 `TerminalRestoringSkeleton`（标签条 + 画布两段骨架，`aria-busy`），失败显示原因 + 重试按钮 |
| 新建会话 | 点「New Terminal」只把按钮灰掉，画布区毫无变化 —— 分不清「正在开」和「点了没反应」 | 按钮内显示 `Spinner` 并把文案切成「正在启动 shell…」；标签栏「+」同样换成 spinner |
| 首屏输出 | 面板挂载后 xterm 已 open 但 shell 还没打印，画布是一片底色，与「终端卡死」视觉完全一致 | `TerminalCanvas` 覆盖一层 `Starting shell…`（spinner + 文案），收到该会话第一个 `terminal-data` 字节后淡出 200ms 卸载；已 `exited` 的会话永不显示（它不会再输出，覆盖层会是永久的谎言） |
| Quick-run 菜单 | 加载行是一段灰色 body 文字 | 换成 `LoadingState variant="inline"`（spinner + `role="status"`），首次展开菜单时这是用户看到的第一行 |
| 项目列表首次读取 | `TerminalWorkspace` 自己 `listProjects()`，但没有 loading 标志：`projects` 初值是 `[]`，于是「还没读完」和「你一个项目都没有」在渲染上完全一样。冷启动进终端，空画布只剩一个孤零零的「New Terminal」按钮——看起来像项目丢了，而不是正在读 | 拆出 `projectsLoaded` / `projectsError` 两个标志：未读完时卡片位渲染 3 个骨架卡（含「正在读取项目列表…」+ spinner），侧栏「Projects」标题旁也有小 spinner；读取失败时给原因 + 重试，且不清空已有列表 |
| 空态项目卡片 | 每个卡片的快捷命令异步加载，`items[cwd]` 为 `undefined` 时整块不渲染 —— 「还在取」与「这个项目没有命令」长得一样 | 加载中渲染两行骨架（`data-testid="terminal-blank-cmd-skeleton"`），加载完且为空才保持静默 |

覆盖层有两个逃生阀，避免「启动中」变成新的卡死感：用户一旦敲键即算活着（`term.onData` 同时置 ready），以及 3 秒后无论有没有输出都撤掉——像 `sleep 60` 这种静默命令不应该让人在「正在启动 shell…」下面盲打。

唯一不能靠「等到有输出」判断的是「读项目列表」，它有自己的冷启动：见上表第 5 行。

验证：`src/components/TerminalWorkspace.loading.test.tsx`（8 个新测试覆盖恢复骨架、恢复失败+重试、项目列表读取中/失败重试、首屏覆盖层、静默命令自动撤除、已退出会话不覆盖、卡片骨架）全绿。

### 顺带修掉的测试债（两处）

`src/components/TerminalWindowApp.wakeChords.test.tsx` 的 `waitFor` 用的是默认 1 秒超时：整套 94 个文件并发跑时，`terminalClose` 的断言偶发超时（单跑必过）。与 `TerminalWorkspace.wakeChords.test.tsx` 早前的处理一致，7 处统一抬到 5 秒，断言内容未改。

`src/components/TerminalWorkspace.hotkeys.test.tsx` 存在 mock 泄漏：测试 3 里 `terminalList.mockResolvedValue(demoSessions)`，而 `vi.clearAllMocks()` 只清调用记录、**不清实现**，于是之后每个用例都继承了非空会话列表，挂载屏障（等「No terminals open」）靠偶然时序才通过。现在在 `beforeEach` 里显式重置为 `[]`，每个用例各自声明夹具。

## 10. 下拉菜单（补做）

第 9 节把终端的两条冷启动路径修好了，但它们都只覆盖「画布上看得见的地方」。下拉菜单是第三个面：**选项列表异步加载，打开时还是空的**。`SelectDropdown` 在这种情况下渲染 `No options found`，`DropdownMenu` 则由调用方自己写一句「暂无」，两者都是同一个错误——把「还没读到」说成「没有」。

### 原语：两个下拉都支持 loading

| 原语 | 新增 | 行为 |
|---|---|---|
| `src/components/ui/SelectDropdown.tsx` | `loading?: boolean`、`loadingLabel?: string` | listbox 加 `aria-busy`；面板内渲染 3 行**选项几何**的骨架 + `sr-only` 文案；加载中不再渲染 `ui.select.noOptions`。**触发器不再挂 spinner**；骨架排在已到达选项**之后**；加载中搜索框照常渲染 |
| `src/components/ui/primitives.tsx` `DropdownMenu` | `loading?: boolean`、`loadingLabel?: string`、`loadingSkeleton?: ReactNode` | 面板顶部渲染骨架，加载中不渲染 children（调用方传入的「空态文案」自然让位）；默认骨架 = 单行 `MenuItem` 几何，条目带 description / 图标 / 尾部操作时由调用方传自己的 `loadingSkeleton`；导出 `MenuSkeletonRows` 复用 |

两个设计细节：

1. **状态行画在已有选项之上，而不是替换它们。** 已经到达的选项是真的、可点的（例如项目列表里的 `Home — default shell`），只有还没到的那些是 pending。整块替换会让「我就要开个 Home 终端」在等待期间变成不可能。
2. **`DropdownMenu` 的状态行放在点击关闭层之外。** 面板里任何点击都会 `setOpen(false)`，而读一行状态不是选择，不该把用户正在等的菜单关掉。
3. **面板里放骨架行，不放「spinner + 一句话」。** 文案降级为 `sr-only`，屏幕阅读器仍能读到名字，视觉上只剩骨架。
4. **骨架必须和真实行同几何，不是「差不多」。** 真实选项行是 `px-3 py-2` + `text-sm`（行盒 20px），骨架行就照抄：`px-3 py-2` 里放一个 `h-5` 的行盒，盒内是 `h-4` 的条；有 hint 徽章的那行再补一个 `h-4 w-10 rounded-full`。菜单项同理，两行式条目用 `h-5`（名称行）+ `mt-0.5 h-4`（description 行）+ 尾部 14px 方块（hover 才出现的删除按钮位）。高度对上了，真实数据落地时面板就不会跳。
5. **触发器上不加 loading 圆圈。** 转圈贴在标签旁是噪音：真正要读的是「列表里有什么」，而那在面板里。
6. **骨架排在「已经到达的选项」之后。** 项目选择器第一行是 `Home`（家目录），它不依赖网络、立刻可点；pending 的只有项目行。把骨架画在 `Home` 上面等于说「先等一批还不知道有没有的行，再给你能用的」，读序反了。
7. **搜索框在加载期间照常渲染。** 它属于面板的最终形状；等列表到达才出现会把整列选项往下顶一行，而那正是骨架想避免的跳动。
8. **占位要长得像这一类选项本身的 hint。** 项目行的 hint 走 `hintStyle: "text"`（灰的 `text-[10px]` 路径），所以占位是 `h-3 w-12 rounded-sm` 的文字条，而不是胶囊徽章——徽章占位会暗示「这里有 merged/unmerged 标签」。
9. **不加没必要的 loading 装饰。** 侧栏「Projects」标题旁的小 spinner、空画布中央的「正在读取项目列表…」都被去掉了：那里已经有三张骨架卡在说同一件事，再叠一层文字与转圈只是噪音。

### 接入的三个真实异步源

| 位置 | 之前 | 现在 |
|---|---|---|
| 终端侧栏「New」项目选择器（`TerminalWorkspace.tsx`） | 列表只有 `Home`，看不出是「读完了只有这些」还是「还没读完」 | `loading={projectsPending}`，面板内 3 行选项几何骨架；`Home` 仍可点 |
| 终端侧栏「Workspaces」菜单（`TerminalWorkspace.tsx`） | `presets` 初值 `[]`，`listRunPresets()` 在路上时就显示 "No workspaces saved" | 新增 `presetsLoading`，读期间显示 2 行「名称 + 数量描述 + 删除位」骨架（自定义 `loadingSkeleton`） |
| 设置里的模型选择器（`LlmSettings.tsx`） | `disabled={modelOptions.length === 0}`：拉取中是个灰控件，不给任何理由 | `loading={modelsLoading}` + 拉取中允许打开（能读到「Fetching…」的原因），只有真正空且没在拉取时才禁用 |

### 测试

- `src/components/ui/SelectDropdown.test.tsx`：加载中出现 `select-dropdown-loading` 骨架、`aria-busy="true"`、不出现 `No options found`，`sr-only` 名字可读；**触发器无 `.loading-spin`**；3 行骨架每行都是 `px-3 py-2` + `h-5` 行盒；**已到达的 `Home` 排在骨架之前、搜索框在加载期可见**；选项到达后骨架消失、选项出现。
- `src/components/ui/primitives.test.tsx`：`DropdownMenu` 加载中不渲染 children、渲染骨架；点击骨架不关闭菜单；`loadingSkeleton` 覆盖默认骨架且不与默认叠加；默认骨架 3 行且每行 `px-3` + `h-5`。
- `src/components/TerminalWorkspace.loading.test.tsx`：空画布给三张骨架卡且不出现兜底按钮、不出现说明文字；项目读取中打开「New」下拉能看到骨架（`sr-only` 文案可读）且静态的 `Home` 仍可选；读取完成后出现 `demo` 选项。

### 文案：`Home` 那个选项

zh 原来是「首屏 — 默认壳」，两个词都不对：`Home` 指家目录，`首屏` 是「首屏/折叠线以上」的意思，属误译；`壳` 是 `shell` 的直译，中文开发者嘴上说的是 shell。现改为「Home — 默认 shell」（en 不变：`Home — default shell`，右侧 hint 仍显示 `~`）。刻意不译 `Home`：这个词在终端语境里人人认得，「家目录」反而要多想一步。

### 顺手修掉的测试竞态（第三次）

`TerminalWorkspace.wakeChords.test.tsx` 与 `TerminalWindowApp.wakeChords.test.tsx` 里「关闭当前标签」的用例，在 `findByText("zsh")` 之后立刻按下 Ctrl+W。但标签文字先渲染、`activeId` 由随后的一次 effect 提交，而关闭快捷键读的正是 `activeId`——落在两者之间的那次按键是**静默空转且不会被重试**。整套并发跑时这两个 commit 可能隔得够远，于是偶发 5 秒超时（单跑必过）。现在按两条路径各自加了 `awaitActivePane(id)`：等到 `terminal-canvas-<id>` 不再是 `hidden` 再按键。断言内容未改。
