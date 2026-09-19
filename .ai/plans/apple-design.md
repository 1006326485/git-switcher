# Apple Design 分阶段实施计划

> 依据：`apple-design` skill（WWDC Designing Fluid Interfaces 等）对 git-switcher 的 10 项改进建议。
> 原则：每阶段独立可交付、可回滚；每阶段结束跑 `npm run check`（test + build + rust）。
> 不做自动 commit；每阶段完成后由主人验收。

## 现状基线（已确认的代码事实）

- 窗口：`src-tauri/tauri.conf.json` 已 `titleBarStyle: Overlay` + `transparent: true` —— 材质化可行。
- 动效：全部为固定时长 keyframes（`globals.css` 的 `fadeIn 0.15s`、`slideIn 0.2s`），无 reduced-motion 支持。
- 全局 `* { transition: 150ms }`（`globals.css` "Smooth transitions" 段）。
- 浮层定义分散：`ui/primitives.tsx`（Dropdown :130、Dialog :246-250）、`CommandPalette.tsx`、`QuickDiffPanel.tsx`、`BranchDropdown.tsx:162`、`ColorPicker.tsx:89`、`CommitPreview.tsx:63` 各自写了 `animate-[fadeIn_0.15s_ease-out]`。
- Header：`Header.tsx:122` 不透明 `bg-[var(--surface-1)]` + `border-b`；主滚动区是 `App.tsx:680` 的 `<main>`。
- 拖拽：`hooks/useSortableRow.ts` 直接透传 dnd-kit 默认 transition 曲线。
- 按压反馈：`primitives.tsx` Button/IconButton 有 `active:scale-*`；Header 过滤 pills、SegmentedControl、ProjectCard、侧栏项等多数可点元素只有 hover 变色。
- 字体：`index.html` 未声明 font-family（依赖 Tailwind preflight 默认）。

---

## 阶段 1 — 无障碍底线（reduced-motion / transparency / contrast）

**目标**：任何动效与材质都有降级路径。纯 CSS，零行为改动，风险最低，先做。

改动：
1. `src/styles/globals.css` 末尾新增三个媒体查询块：
   - `prefers-reduced-motion: reduce`：动画时长压到 0.01ms、仅保留 opacity/color 类 transition；`.project-pulse`、`slideIn`、`fadeIn` 全部静默降级。
   - `prefers-reduced-transparency: reduce`：为后续阶段的 `backdrop-blur` 表面预留 `.material` 工具类的降级（实底 + 去 blur）。
   - `prefers-contrast: more`：浮层背景提到实底、边框加深（`--border-color` 单独覆盖）。
2. 新增工具类 `.material`（半透明底 + blur + saturate），本阶段只定义不铺开，供阶段 4/5 使用。

验收：
- 系统设置开启"减弱动态效果"后，打开任意弹窗/下拉无滑动与缩放，仅瞬时/淡入。
- `npm run check` 通过。

## 阶段 2 — 反馈手感：按压态统一 + 全局 transition 收敛

**目标**：响应即时（skill §1/§10），消灭交互路径上的隐性延迟。

改动：
1. 按压态统一（在 primitives 层解决，避免逐组件补）：
   - `primitives.tsx`：为 pill 类可点元素（SegmentedControl 选项 :57、Dropdown MenuItem :162）补 `active:scale-[0.98]` + `active:` 底色加深。
   - `Header.tsx` 过滤 pills（:170 附近按钮）补 `active:scale-[0.97]`。
   - `ProjectCard.tsx:80` 卡片本体补 `active:scale-[0.995]`（大目标用更小幅度）。
2. 按压反馈提速：新增 `.press` 工具类（`transition: transform 90ms ease-out, ...`），Button/IconButton 的 `transition-all duration-150` 改为 `.press`，保证"按下即响应"。
3. `globals.css` 全局 transition 收敛：
   - 属性列表去掉 box-shadow/transform（这两类高频变化不需要主题过渡）。
   - 新增 `.dragging, .dragging * { transition: none !important; }`，并在 `useSortableRow.ts` 的 style 中于 `isDragging` 时附加 `dragging` 类（或直接在返回值里给出 no-transition style），拖拽期间不再有黏滞感。

验收：
- 逐个点击 UI 中可点元素，全部有按下反馈且无滞后。
- 拖拽 ProjectCard 排序，卡片跟手无"追赶"延迟。
- 主题切换仍平滑（回归项）。

## 阶段 3 — 弹性曲线：用 spring 感曲线替换默认过渡

**目标**：可拖拽/可展开元素具备 Apple 式阻尼感（skill §4/§6）。

改动：
1. `globals.css` 定义两档曲线 token：
   - `--ease-spring: cubic-bezier(0.32, 0.72, 0, 1)`（Apple sheet 同款手感，用于位移/展开）。
   - `--ease-out-soft: cubic-bezier(0.25, 0.1, 0.25, 1)`（用于微交互）。
2. `useSortableRow.ts`：给 dnd-kit 的 `transition` 覆盖为 `transform 260ms var(--ease-spring)`（dnd-kit 默认线性，观感差距最大的一处）。
3. 可展开面板（侧栏开关 `App.tsx:630`、各 Collapsible/分支列表展开）位移类过渡改用 `--ease-spring`。
4. ProjectCard 拖起时的 `shadow-lg`/ring 变化加 200ms 曲线，松手回落不生硬。

验收：
- 排序拖拽释放后，卡片以阻尼曲线滑入目标位，无跳变。
- 侧栏开合观感明显柔和，但不拖沓（≤300ms）。

## 阶段 4 — 浮层进出场统一：材质化 + 锚定来源 + 空间一致性

**目标**：skill §7/§12 —— 同类浮层共享同一进出场定义；进场是"材质落下"而非纯淡入；从触发点展开。

改动：
1. `globals.css` 新增统一 keyframes：
   - `popoverIn`：opacity 0→1 + scale 0.96→1，`transform-origin` 由使用点指定；时长 180ms `--ease-spring`。
   - `sheetIn`：opacity + scale 0.98→1 + 轻微 y 位移（Dialog 用）。
   - `toastIn`：替换现 `slideIn`（translateX 100%），改为 x: 24px + fade，200ms。
   - reduced-motion（阶段 1 已建）自动降级这些 keyframes。
2. 抽到 `primitives.tsx` 单一来源：导出 `popoverAnimation` / `dialogAnimation` class 常量，替换以下散落的 `animate-[fadeIn_0.15s_ease-out]`：
   - `primitives.tsx:130` Dropdown；`BranchDropdown.tsx:162`；`ColorPicker.tsx:89`；`CommitPreview.tsx:63`（均设 `transform-origin` 指向触发元素方位）。
3. `primitives.tsx:246-250` Dialog：内容层加 `sheetIn`；scrim（:247）从纯黑遮罩改为 `opacity + blur` 同步 180ms 淡入（§12 "dim to focus"）；Dialog 内滚动区保留。
4. `CommandPalette.tsx`：容器加 `popoverIn`，`origin-top`（自顶部下拉，符合 Spotlight 心智）。
5. `QuickDiffPanel.tsx:60`：与 Dialog 共用同一套进出场（消除阶段评估 #10 的路径不一致）。
6. `Toast.tsx:89`：换 `toastIn`；退出动画补 fade-out（当前只有进场）。
7. Dialog 头部 `border-b` 硬分割改为更轻的 `border-b border-black/5 dark:border-white/5`（层次靠材质，不靠线）。

验收：
- 所有下拉/菜单从触发点展开；所有 Dialog 进出路径对称（§7）。
- 慢放（系统动画放慢或逐帧录屏）检查无"淡入跳变"。
- light/dark 双主题各过一遍。

## 阶段 5 — 材质层次：Header/侧栏半透明 + 滚动边缘效应

**目标**：skill §12 —— 浮动 chrome 是半透明功能层，内容在其下滚动；层次靠材质权重表达。

改动：
1. `Header.tsx:122`：`bg-[var(--surface-1)]` → `.material`（白 70% / 黑 40% + `backdrop-blur-xl saturate-180`），去掉 `border-b`。
2. 滚动边缘效应：`App.tsx:680` 的 `<main>` 监听 scroll（已有 `scrollParentRef`，加一个 `useScrollEdge` hook：rAF 节流、只 setState 布尔值），滚过 8px 时 Header 下方出现 12px 高的 `mask-image` 渐隐模糊条；未滚动时无任何分割线。
3. `App.tsx:630` 侧栏：改用"更重材质"（白 80% / 黑 55% + 更强 blur + 右侧渐隐替代 `border-r`），体现 §12 的"表面越大材质越重"。
4. 移动端抽屉形态（:630 fixed 分支）同步，保留 `shadow-2xl`。
5. ~~Tauri 原生 vibrancy~~【决策点 A 后续：主人验收认为效果不达预期，**已回退**】：
   - 回退内容：Rust 侧 `window-vibrancy` 依赖与 `apply_vibrancy` 调用、前端 `native-vibrancy` 平台检测、`.native-vibrancy` CSS 规则及媒体查询覆盖已全部移除。
   - 替代方案：材质改由纯 CSS 提供，`.material` / `.material-heavy` 升级为“渐变 + backdrop-blur”玻璃质感（顶栏竖向渐变、侧栏横向渐变，明暗双套）。
   - 已知局限：Header/侧栏位于 flex 流内，下方没有滚动内容经过，blur 主要作用于应用自身底色，质感来自渐变+柔光而非“透出背后内容”；真磨砂需另行布局改造（内容延伸至 chrome 下方），不在本次范围。

验收：
- 主列表滚动时内容"穿过" Header 底部，边缘呈渐隐而非硬切。
- 深色模式下 Header 与内容对比度足够（配合阶段 1 的 contrast 降级）。
- 滚动性能：rAF 只读一个布尔值，不引起列表重渲染（用 React DevTools profiler 或肉眼确认长列表无掉帧）。

## 阶段 6 — 排版与细节打磨（craft）

**目标**：skill §15 + 滚动条行为。

改动：
1. `index.html` / `globals.css`：显式 `font-family: system-ui, -apple-system, "SF Pro Text", sans-serif`；正文 leading 1.5。
2. 层级字距：大号数字/标题（DashboardView 统计、Dialog title `primitives.tsx:255`）加 `tracking-tight`；11px 级小标签（Badge、表头）加 `tracking-wide`。
3. 统计数字用 `tabular-nums`（部分已有，统一补齐）。
4. 滚动条（`globals.css` :130 附近）：默认 thumb 全透明，`#root:hover` 时淡入（200ms），贴 macOS 行为。
5. 顺手项：`Toast` 剩余的进度条颜色/圆角统一到 token。

验收：
- 全局字号不破坏现有布局（特别是紧凑模式 `ProjectCompact`/`ProjectTable`）。
- 系统字号放大（macOS 显示设置）下无截断/重叠。

## 阶段 7 — 多模态反馈【决策点 B：主人已确认不做，整个阶段取消】

（原计划：操作完成音效/触觉反馈。主人确认不需要，不再实施；相关代码零引入。）

---

## 全局约定

- 每阶段一个分支/一次交付；阶段内改动不跨阶段主题。
- 所有新增动效必须同时写 reduced-motion 降级（阶段 1 建立的机制）。
- 动画只动 `transform`/`opacity`；性能敏感列表（virtualized）内禁止新增动画。
- 每阶段验收都包含：`npm run check` + light/dark 双主题目测 + 关键交互（弹窗、下拉、拖拽、Toast）手动过一遍。
- 决策状态：**A（原生 vibrancy）实施后主人验收不满意，已回退**为 CSS 渐变+blur 材质方案；**B（音效/触觉）已确认不做**（阶段 7 取消）。

## 预期节奏

| 阶段 | 规模 | 风险 |
| --- | --- | --- |
| 1 无障碍降级 | S（纯 CSS） | 极低 |
| 2 按压+transition 收敛 | S–M | 低（需回归主题切换） |
| 3 弹性曲线 | S | 低 |
| 4 浮层统一进出场 | M（涉及 6+ 组件） | 中（视觉回归面广） |
| 5 材质 Header/侧栏（CSS 渐变材质，vibrancy 已回退） | M | 中（滚动边缘性能） |
| 6 排版打磨 | S | 低 |
| 7 多模态（决策 B） | — | 已取消（主人确认不需要） |
