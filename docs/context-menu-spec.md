# 右键菜单（Context Menu）设计规范

状态：P0 待实现 · 关联文档：`.claude/CLAUDE.md`

---

## 1. 现状事实

| 事实 | 证据 |
| --- | --- |
| 全项目零原生右键菜单 | `src` 下 `onContextMenu` 命中数 = 0；`src-tauri` 无 context menu 处理 |
| `ProjectContextMenu.tsx` 名不副实 | 实为 kebab（⋯）触发的下拉，由 `ProjectRowShell.tsx:579` 挂载 |
| 菜单基础设施只有一个 | `ui/primitives.tsx` 的 `DropdownMenu` + `MenuItem`，trigger 锚定 + 非受控 |
| 行本身无点击语义 | 仅行内控件可点（路径按钮 / 拖拽手柄 / 描述编辑 / BranchDropdown） |
| 键盘导航已就绪 | 行带 `data-project-id` / `data-project-index`（`App.tsx` ↑↓ 导航、Enter 展开分支下拉） |
| 全局 Escape 集中一处 | `App.tsx:596` 单个 handler 关闭全部面板 |

所需动作 95% 已存在于 `useProjectRow` / `ProjectContext` / 各面板 handler。

---

## 2. 基础设施

### 2.1 为什么不能直接复用 `DropdownMenu`

1. 定位依赖 `triggerRef.getBoundingClientRect()`，右键需要 `clientX/clientY`。
2. 打开靠包裹 div 的 `onClick` + `cloneElement` 注入 `aria-*`，右键无 trigger 元素。
3. 外部关闭判定依赖 `triggerRef.contains(target)`，右键场景无 trigger。
4. 打开即 focus 第一项、关闭回焦 trigger；右键应默认不抢焦点。

### 2.2 `ContextMenu` API

```tsx
interface ContextMenuProps {
  open: boolean;
  anchor: { x: number; y: number };
  onClose: () => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end"; // 默认 start
  gap?: number;                        // 默认 6（与 DropdownMenu GAP 一致）
  edge?: number;                       // 默认 8（与 DropdownMenu EDGE 一致）
  minWidth?: number;                   // 默认 200（min-w-50）
  restoreFocus?: boolean;              // 默认 false
}
```

### 2.3 `useContextMenu` hook

```tsx
function useContextMenu(): {
  anchor: { x: number; y: number } | null;
  onContextMenu: (e: React.MouseEvent) => void;
  close: () => void;
  menuProps: {
    open: boolean;
    anchor: { x: number; y: number };
    onClose: () => void;
  };
};
```

### 2.4 必须补齐的公共能力

- `{x, y}` 锚点定位（与 rect 模式并存）
- 受控 `open` / `onOpenChange`
- 无 trigger 时的外部关闭判定（只判断菜单自身）
- `MenuSeparator` 独立组件
- `disabled` 与快捷键 hint（`shortcut?: string`）
- `Submenu` 二级菜单（用于项目菜单的「打开方式」）

### 2.5 样式约束（沿用设计系统）

- portal 到 `document.body`，`position: fixed`，`zIndex: 9999`（Modal `z-50`、DropdownMenu `9999`，同一 stacking context，右键菜单可位于 Modal 之上）
- 动画用 `popoverAnimation`（`animate-[popoverIn_180ms_var(--ease-spring)]`）
- 面板样式：`bg-(--surface-1) border-(--border-color) rounded-xl shadow-lg py-1.5 min-w-50 overflow-y-auto overscroll-contain`
- 禁止自造 keyframes，`globals.css` 是动画唯一来源

### 2.6 全局交互规则

1. **文本选择豁免**：`window.getSelection().toString()` 非空时不拦截右键（表格 / diff / log 需复制）。全局 `user-select: none`，仅 `select-text` 区域例外。
2. **控件豁免**：`target.closest('button, input, textarea, a, [data-drag-handle], [role="button"]')` 命中则跳过。
   实现中该选择器提为常量 `ROW_MENU_SKIP`（`ProjectRowShell.tsx`），鼠标与键盘两条路径共用。
   注：`[data-drag-handle]` 目前是死选择器——三个拖拽手柄（`ProjectList` / `ProjectCompact` / `ProjectCard`）都是 `<button>`，已被 `button` 覆盖。保留它作为防御，或后续给手柄补属性以消除该歧义。
3. **DnD 安全**：排序监听仅在独立手柄上，右键落在行体不触发排序。
4. **键盘可达**：`Shift+F10` / `ContextMenu` 键等效打开。已在 5 个行根元素实现（`ProjectRowShell.tsx` 的 `onRowKeyDown`），复用 `ROW_MENU_SKIP`。
   注：规范原要求「聚焦对应 `data-project-index` 行」——键盘打开时已 focus 行元素自身；但**同步 `focusIndex` 状态（高亮 ring 跟随）尚未实现**，因它必须同时改 `ProjectGrid.tsx` 与 `App.tsx` 的状态归属，已列为 P2。
5. **关闭**：在菜单内用 `capture: true` 消费 Escape（`DropdownMenu` 已有先例），或向 `App.tsx` 全局 handler 注册。
6. **输入框不拦截**：搜索框 / 文本域保留 WebView 原生右键。

---

## 3. 各处菜单规范

### 3.1 项目行（Table / Grid / List / Compact / Card，5 视图统一）

绑定位置：`ProjectTable` 的 `<tr>` 与虚拟化 row div、`ProjectListRow`、`ProjectCompactRow`、`ProjectCard`、Dashboard 行根 div。

菜单定义数据化（`useProjectMenuGroups(detail, row)` 返回 `{group, items}`），kebab 与右键渲染同一份数据。

| 分组 | 菜单项 | 动作 / API |
| --- | --- | --- |
| Git | Fetch / Pull / Push | `onFetch` `onPull` `onPush` |
| | Branch Manager | `row.handleOpenBranchMgr` |
| | Tags | `row.handleOpenTagMgr` |
| | Stash Manager | `row.handleOpenStashMgr`（需先补 `RowModals` 渲染） |
| | Commit History | `row.handleOpenLog` |
| | AI Code Review | `row.handleOpenAiReview` |
| | Project Tools ▸ | 现有二级 `Modal`（10 个工具） |
| | Refresh | `row.handleRefresh` |
| 打开方式 | Run Script… / Built-in Terminal / System Terminal / Finder / VS Code | 现有 handler |
| 外观与元数据 | Set Color ▸ / Group ▸ / Edit Description / Notes / Edit Alias | `ColorPicker` `GroupAssignDropdown` `descEditTrigger++` `notesEditTrigger++` `setProjectAlias` |
| ⚠️ 危险 | Remove Project | `row.handleRemove` → `api.removeProject`，必须接 `ConfirmDialog` |

UI 细节：Compact 视图操作按钮 hover-only，右键是其主要可发现性补充。

> **P2 待办**：「右键同步 `focusIndex`、ring 跟随光标」**未实现**。`focusIndex` 存在于 `App.tsx` 并经 `ProjectGrid.tsx` 单向下传，同步它需新增 `onFocusProject` 链路并改 `App.tsx`（该文件当前含第三方并发改动，风险过高故搁置）。

### 3.2 GitOps 文件列表

> **实现目标更正**：本节原写为 `GitOpsFileList.tsx`，但该文件是**从未被引用的死代码**（详见 §5.6）。实际在用的是 `src/components/GitOpsPanel.tsx` 的**内联列表**（约 :378-455）。右键必须接在 `GitOpsPanel.tsx`，且该文件的内联版本**不提供** Discard / Blame / File History，这些 handler 需一并接线。
>
> **嵌套冒泡**：`GitOpsPanel` 位于项目行内部，文件行的 `onContextMenu` 必须 `preventDefault()` + `stopPropagation()`，否则事件冒泡到行根会**同时弹出两个菜单**。该行为需要测试断言（外层包裹组件计数），不能只靠代码审查。

文件行的 Diff / Blame / History 按钮为 `opacity-0 group-hover:opacity-100`，hover-only，可发现性差 → 收益最高。

| 状态 | 菜单项 | API / handler |
| --- | --- | --- |
| staged | Unstage、Stage All、Unstage All、View Full Diff、Blame…、File History…、Copy Path | `onUnstage` `gitStageAll` `gitUnstageAll` `onSetDiffFile` `onSetBlameFile` `onSetHistoryFile` |
| | **Discard…**（danger） | `onDiscard` → `gitDiscardFile`，需 `ConfirmDialog` |
| unstaged | Stage、Stage All、Unstage All、View Full Diff、Copy Path | `onStage` 等 |
| | Blame / File History 仅已跟踪文件（`f.status !== "untracked"`） | 同现有按钮 |
| | **Discard…**（danger） | 同上 |
| 容器空白 | Stage All / Unstage All / Refresh / Commit | `onStageAll` `onUnstageAll` |

### 3.3 提交视图

**`GitLogViewer` 提交行**：

| 条件 | 菜单项 | API | 确认 |
| --- | --- | --- | --- |
| HEAD（`index === 0`） | Amend | `gitAmendCommit` | `OperationConfirmDialog` |
| 任意 | Revert | `gitRevertCommit` | ✅ |
| 任意 | Cherry-pick | `gitCherryPick` | ✅ |
| 任意 | Copy hash / full hash / message | clipboard | ❌ |
| `unpushedCount > 0 && index < unpushedCount` | Reword / Drop | `gitRewordCommit` / `gitDropCommit` | ✅ Drop 需 |
| 冲突中 | Continue / Abort Revert | `gitRevertContinue` / `gitRevertAbort` | ✅ |
| 非 HEAD | Create Branch at commit… / Checkout commit | `createBranch` / `gitCheckoutCommit` | ⚠️ 轻确认 |

硬约束：`isRewritable(index)` 为 `unpushedCount > 0 && index < unpushedCount`，Reword / Drop 必须在该条件下可见。

**`CommitLog`**：右键 = 现有 checkbox 选择 + Copy hash + Cherry-pick，另加 `Set as range start / range end`（服务已有 Range Cherry-pick）。

**`CommitGraph`**：纯装饰列，不加右键。

### 3.4 Git 管理器面板

> **实现目标更正**：本节原假设各面板都有「行列表」，但 `BranchManager` 的**本地分支是用 `SelectDropdown` 渲染的**（`localBranches.map` 生成 options），不存在可绑定的行结构——原表中的「本地分支行 → Checkout/Merge/Rebase/Compare/Delete Merged」**无处可绑**，且这些能力已由 6 个 tab 承载。因此 BranchManager **只在远程分支列表行**上加右键；本地分支明确不在范围内。要给本地分支加快捷操作，需先新建行列表 UI，属独立功能而非右键接线。

| 面板 | 右键菜单项 | API |
| --- | --- | --- |
| 本地分支 | Checkout、Merge into current、Rebase onto、Compare with current、Copy name、Delete Merged | `switchBranch` `mergeBranch` `gitRebase` `gitCompareBranches` `deleteMergedBranches` |
| 远程分支 | Checkout locally、Push current to this、Copy name、Delete remote（danger） | `switchBranch` `gitPush(path, branch)` `gitDeleteRemoteBranch` |
| 标签 | Push tag、Checkout（detached）、Copy name、Delete（danger） | `gitPushTag` `switchBranch` `gitDeleteTag` |
| Stash | Show diff、Apply、Pop、Drop（danger）、Copy message | `gitStashShow/Apply/Pop/Drop` |
| Remote | Edit URL、Fetch now、Copy URL、Remove（danger） | `gitSetRemoteUrl` `gitFetch` `gitRemoveRemote` |
| Worktree | Switch to、Open in Terminal / Finder、Remove（danger） | `switchBranch` `gitRemoveWorktree` |
| Submodule | Update、Open path、Copy name | `gitUpdateSubmodule` `gitInitSubmodules` |
| Reflog | Checkout（detach HEAD）、Copy hash、Create Branch here | `gitCheckoutCommit` `createBranch` |

危险操作统一：复用面板内已有的 `OperationConfirmDialog`（按 operation 字符串）与 `ConfirmDialog`；菜单项用 `MenuItem danger` 红色 + 前置分隔线，危险项不放菜单首项。

分组顺序：`查看 / 导航 → 写操作 → 复制 → ── 危险操作`。

### 3.5 终端（`TerminalWorkspace`）

| 区域 | 菜单项 |
| --- | --- |
| 标签页 | New Terminal（同 cwd）、Restart、Close、Close Others（danger）、Rename Tab…、Copy Path、Open in Finder / System Terminal / VS Code、Save Workspace… |
| 终端画布 | ⚠️ **跳过**（见 §5 #15）：Copy / Paste / Select All / Clear 均需终端内部能力，`useTerminal()` 未对外暴露；且本 hook 的「文本选区非空不弹菜单」豁免与画布的复制场景直接冲突 |
| 标签栏空白 | New Terminal、Save Workspace…、Kill All |
| 侧栏项目条目 | New Terminal here、Close All Terminals、Open in Finder / Terminal / VS Code、Copy Path、Kill All in Group（danger） |

接管画布 `contextmenu` 时须 `preventDefault`，且不破坏 xterm 自身选择交互。

### 3.6 分组面板 / Header

| 位置 | 菜单项 | API |
| --- | --- | --- |
| 分组条目 | Rename…、Change Color…、New Group…、Delete Group（danger，接 `ConfirmDialog`） | `api.createGroup` `updateGroup` `deleteGroup` 已具备 |
| All Projects | New Group…、Refresh | 同上 |
| Header 空白 | Toggle Sidebar、Command Palette、Add Project、Bulk Import、Export/Import、View ▸、Theme ▸、Open Terminal、Settings、Shortcuts | 复用现有 kebab 动作 |

---

## 4. 优先级

| 级别 | 范围 |
| --- | --- |
| P0 | `ContextMenu` + `useContextMenu` + `MenuSeparator` 基础设施（含 test） |
| P0 | 项目行右键（5 视图）+ 菜单项数据化重构 + Remove 确认 + Stash 死代码补齐 |
| P0 | GitOps 文件列表右键 |
| P1 | GitLogViewer / CommitLog 提交行、分支 / stash / tag 行 |
| P1 | 终端标签页与画布 |
| P2 | 分组条目、Header、worktree / remote / submodule / reflog、Submenu、Split 终端 |

---

## 5. 已发现的既有缺口

1. **`stashMgrOpen` / `handleOpenStashMgr` 为死代码** —— `useProjectRow` 导出但全仓无使用点，`RowModals` 不渲染 `StashManager`（后者仅从 `GitOpsPanel` 打开）。右键加 Stash Manager 前必须先补渲染。
2. **Remove Project 无确认** —— `IconButton → row.handleRemove` 直接删除，进右键菜单必须配 `ConfirmDialog`。
3. **`tauri.ts` 无分支 Rename API** —— 如需 Rename 项需先在 Rust 侧新增。
4. **`gitCreateBranch` 不存在** —— 正确函数名是 `createBranch`；其余 15 个引用 API 均已核实存在。
5. `.claude/CLAUDE.md` 的 "What's Not Implemented Yet" 已过期（worktree / blame / submodule 均已实现）。
6. ~~**`src/components/GitOpsFileList.tsx` 是死代码**~~ → ✅ **已解决（选项 A：删除）**：全仓零 import，已连同只被它使用的 `filelist.*` 25 个 i18n 键一并移除（en/zh 同步），`ChipButton` 的注释同步更正。此前保留的合并思路（选项 B）被否决，理由：其优势能力 Blame / File History / Discard 已由 §3.2 的右键菜单提供，剩余的行内 diff 展开与 diff 统计**属于新功能而非重构**（Rust 侧无 `inline_diff`，需新增 patch 拉取与 `diffUtils` 客户端解析，且该组件零测试），应独立立项，不宜夹带在死代码清理中。
7. ~~`ROW_MENU_SKIP` 中 `[data-drag-handle]` 为死选择器~~ ✅ **已解决**：grep 确认 4 处手柄（`DragHandle.tsx` / `ProjectList` / `ProjectCompact` / `ProjectCard`）**全部是 `<button>`**、全仓 0 处挂载该属性，已从 `ROW_MENU_SKIP` 移除。见 §2.6 规则 2。
8. ~~i18n 迁移并发进行中~~ ✅ **已解决**：i18n 禁区解除后全项目补齐 **47 个 key**（en 取值与原英文逐字节一致、zh 另译），11 个源文件完成替换；`GitOpsPanel.tsx` 的 2 项英文直写已接入 `panel.copyPath` / `panel.discardEllipsis`。迁移形态：`projectMenu.tsx` / `ProjectRowShell.tsx` / `ProjectContextMenu.tsx` 已为 `t("menu.item.*")`，资源在仓库根 `locales/en.json` 与 `locales/zh-CN.json`，测试经 `src/test/setup.ts` 的 `applyLanguageChoice("en")` 钉住英文。
9. **WebView 自带菜单（Reload / Inspect Elements）** → ✅ **已解决**：Tauri 2.12 **没有**开关（已查 `@tauri-apps/cli/config.schema.json` 与 `tauri-2.12.0` crate 源码，均无 `contextMenu` 配置项），菜单由 WebView 自身提供，唯一抑制手段是取消 `contextmenu` 默认行为。已新建 `src/lib/contextMenuGuard.ts` 的 `installContextMenuGuard()`（捕获阶段监听），在 `src/main.tsx` 调用一次——**Vite 单入口、`main.tsx` 统一渲染两个窗口，故主窗口与终端窗口均覆盖**。设计：`input` / `textarea` / `select` / `contenteditable` **豁免**以保留原生 Cut/Copy/Paste（该菜单不含 Reload/Inspect，砍掉属体验倒退）；并已用测试证明阻止默认**不会**中断 React 层的自定义菜单处理器。6 条测试。**连带修复**：该 guard 同时废掉了 `useContextMenu` 里「有选区就早退，把浏览器菜单让给原生 Copy」这条规则的前提——原生菜单已被压制，早退等于**两边都不弹、用户一无所获**。终端是最先暴露的场景（xterm.js 的选区就存在 `window.getSelection()` 里，选中终端输出后右键标签即静默无反应），但**14 个面板都中招**（如选中提交信息后右键另一个提交）。已根治：删除 `useContextMenu` 的选区豁免与 `ignoreSelection` 选项（所有面板菜单均自带 Copy 项），并反转 `ContextMenu.test.tsx` 与 `TagManager.contextMenu.test.tsx` 中固化旧行为的两条用例。

---

## 6. 实施进度

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| 规范 | 本文档 | ✅ 完成 |
| 1 | `ContextMenu` + `useContextMenu` + `MenuSeparator` + `MenuItem.disabled/shortcut` | ✅ 完成并审查通过（0 Critical / 0 Major） |
| 2 | 项目行右键：单一数据源、5 视图绑定、键盘可达、Remove 确认、Stash 死代码、分组重排 | ✅ 完成；C1/C2/M1/m2 经增量复审全部 CLOSED |
| 3 | GitOps 文件列表右键（§3.2，选项 C） | ✅ 完成；6 条测试含冒泡断言 |
| 4 | 提交视图（§3.3） | GitLogViewer ✅（9 tests）；CommitLog ✅（5 tests） |
| 5 | Git 管理器面板（§3.4） | ✅ 全部完成：StashManager / BranchManager（仅远程行）/ TagManager / ReflogView / RemoteManager / WorktreeManager / SubmoduleManager；本地分支不适用（见 §3.4 更正） |
| 6 | 终端（§3.5） | ✅ 标签栏、侧栏、**画布**（Copy / Paste / Select All / Clear）。`useTerminal` 已暴露 `getSelection` / `selectAll` / `clearScreen` / `sendInput`；`useContextMenu` 新增 `ignoreSelection` 选项且**默认仍豁免**（已加双向回归测试） |
| 7 | 分组（§3.6） | ✅ 分组条目（Rename / Change color / New Group / Copy name / Delete）；**Header ❌ 按用户裁决不做** |
| 8 | 搁置项清零 | ✅ i18n 47 key、阶段 2 的 3 条 P2、死选择器、Tag Checkout tag、Reflog Create Branch、CommitLog range 起止点、`GitOpsFileList` 已删除 ❌ **Worktree Switch to**（git 技术限制，不适用）❌ **Header**（用户裁决） |
| — | 最终门禁 | ✅ `tsc` 退出码 0；**54 文件 / 263 tests 全部通过** |

阶段 2 遗留的 P2 ✅ **已全部修复**：Group 选择器改为在**成功分支内**关闭（失败时保留对话框与已选内容，不再丢失用户选择）；加载/失败态区分 `groups.loading` / `groups.loadFailed` + 重试按钮，仅「加载成功且为空」才显示 "No groups yet."；Group / Alias 两个 Modal 补了 7 条测试（含「失败时对话框保持打开」与「取消不调用 API」）。失败改为**内联错误 + 可重试**而非 toast，避免同一失败双重提示。

阶段 3 遗留（不阻塞，均为待办而非缺陷）：

9. ~~`GitOpsPanel` 文件菜单的 2 项未国际化~~ ✅ **已解决**：`Copy Path` / `Discard…` 已分别接入 `panel.copyPath` / `panel.discardEllipsis`；i18n 禁区解除后，全项目共补齐 **47 个 key**，11 个源文件完成替换。
10. **Stage / Unstage 分支依据是 `status` 而非 `staged`**：文件菜单（及原有行内按钮）用 `f.status === "untracked"` 判断，故已修改但未暂存的文件会显示 Unstage。这是**先于本任务存在**的既有行为，右键菜单为保持与按钮一致而沿用，未单独修正。若要改，应连同行内按钮一起改并补测试。
11. ~~（汇总）新增菜单项的 label 未国际化~~ ✅ **已解决**：i18n 禁区解除后，阶段 3/4A/4B 的直写文案（`Copy Path`、`Discard…`、`Copy hash`、`Copy full hash`、`Copy message`、`Select this commit`、`Deselect this commit`、`Clear selection`、`Cherry-pick…`、`Cherry-pick range…` 等）已全部改用 `panel.*` / `commitLog.*` 等既有命名空间，全项目共 47 key / 11 文件。
12. ~~CommitLog 的「Set as range start / range end」未实现~~ ✅ **已解决**：`rangeStart` / `rangeEnd` 双状态 + `hasBothRangeEndpoints` 判定 + Set↔Unset 双向切换已落地（5 条测试），不再是单一 `openRangeCherryPick` 推导。
13. ~~三个主动跳过的菜单项~~ ✅ **全部闭环**：TagManager `Checkout tag` —— Rust 侧 `git_service.rs:1503` 已确认支持，**已实现**（带独立 loading、detached HEAD 文案）；ReflogView `Create Branch here` —— **已实现**（行内输入态 + 分支名合法性校验，未引入新组件）；WorktreeManager `Switch to` —— **判定为 git 技术限制**（工作树已将该分支 checkout 给 GitSwitcher 主仓库，Git 会拒绝），改以「Copy path」为主路径，**不进菜单**。
14. **行结构决定用哪种跳过规则（共 3 种，已全部落地）**：这三种写法都有**会静默失效**的风险（菜单弹不出来且不报错），新增右键位置前必须先看清行根类型再选：

    | 行结构 | 正确写法 | 已落地位置 |
    | --- | --- | --- |
    | **A. 行根是 div，内嵌按钮** | `if (target.closest('button, input, textarea, a, [role="button"]')) return;` | `GitOpsPanel`、`StashManager`、`BranchManager`（仅远程行）、`RemoteManager`、`WorktreeManager`、`SubmoduleManager`、`TerminalWorkspace`（标签栏 + 侧栏） |
    | **B. 行根本身就是 button** | `const inner = target.closest(...); if (inner && inner !== e.currentTarget) return;`（inner === currentTarget 表示命中行自身） | `TagManager`、`ReflogView` |
    | **C. 行根是 div，但「条目入口」本身是 button** | 放行入口按钮，只跳过带 aria-label 的内嵌控件：`if (target.closest('input, textarea, a, [role="button"], button[aria-label]')) return;` | `ProjectGroupsPanel`（名称按钮是入口，hover ✕ 删除键保留原生菜单） |

    案例 C 的成因：简报曾把该面板描述为「名称是普通 span」，实际名称包在 `<button>` 里；若按 A 型规则，右键名称（最大命中区）会被跳过、菜单几乎不可达。**结论：任务书里的行结构描述必须以实际代码为准，先读再选型。**

    无论哪种选型，**测试都必须显式断言「右键确实打开了菜单」**。
15. **终端画布区右键已评估后主动跳过（决策记录）**：spec §3.5 原列的 Copy / Paste / Select All / Clear **全部需要终端实例能力**（`getSelection()` / 写入 pty / `selectAll()` / `clear()`），而 `useTerminal()` 的返回值只暴露 `fitTerminal` / `focusTerminal` / `attachTerminal` / `detachTerminal` / `setTerminalDark` 等，**无任何读写终端内容的能力**。实现它必须修改 `src/hooks/useTerminal.ts`：
    - 该文件属于并发开发会话的重点文件（其最后的改动在 02:30 前后，与 `terminalViewport.ts` 同一批），改动风险高；
    - 更关键的**设计冲突**：`useContextMenu` 内置「文本选区非空则不打开菜单」豁免（用于保护原生复制），而画布正是「用户选中文本后想复制」的场景——自定义菜单会在用户最需要它的那一刻不弹出。要修就得给画布单独开一个「忽略选区豁免」的旁路，而该旁路又与规范的全局规则 §2.6.1 相矛盾。
    - 收益评估：终端已有原生右键与快捷键复制/粘贴，自定义菜单与原生功能重复，**风险远大于收益**。
    - 重启条件：若将来需要，必须先让 `useTerminal` 对外暴露 `clear(id)` / `getSelection(id)` / `write(id, data)` 三个句柄，并为画布定义与 §2.6.1 不冲突的例外规则。终端画布的 **Restart / Copy cwd / Open in Finder** 等不需终端内部能力的项可以随时单独补——但需先确认不会因选区豁免而不可用。

---

### 新增菜单项文案清单（待 i18n 化）

| 阶段 | 文件 | 英文直写文案 |
| --- | --- | --- |
| 3 | `GitOpsPanel.tsx` | `Copy Path`、`Discard…` |
| 4A | `GitLogViewer.tsx` | `Copy hash`、`Copy full hash`、`Copy message` |
| 4B | `CommitLog.tsx` | `Select this commit`、`Deselect this commit`、`Clear selection`、`Copy hash`、`Copy full hash`、`Copy message`、`Cherry-pick…`、`Cherry-pick range…` |
