# Git Switcher

<p align="center">
  <img src="public/app-icon.png" width="128" alt="Git Switcher Logo" />
</p>

<p align="center">
  <strong>A lightweight, cross-platform desktop Git repository manager</strong><br/>
  Manage all your Git projects in one place — switch branches, batch operations, and AI-powered code review.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri_2-Rust-FFC131?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React_19-TypeScript-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite_8-FF6B35?logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/v1.3.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

[中文文档](#中文文档) | [English](#english)

---

## English

### Why Git Switcher?

If you work on multiple Git repositories every day — switching between projects, pulling latest changes, checking branch status across repos — you know the pain: endless terminal tabs, repetitive commands, and no single view of what's going on.

**Git Switcher** solves this by giving you a unified desktop app to manage all your Git repositories visually.

### Features

- **Multi-Repository Dashboard** — See all your projects at a glance with real-time Git status (modified files, ahead/behind counts, current branch)
- **One-Click Branch Switching** — Switch branches across any project without leaving the app
- **Batch Operations** — Fetch, pull, or perform any Git operation across multiple repositories simultaneously
- **Project Groups** — Organize repositories into logical groups with custom colors
- **Multiple View Modes** — Card, List, Compact, or Table view to match your workflow
- **AI Code Review** — Review branch diffs with LLM integration (OpenAI-compatible API)
- **Git Log Viewer** — Browse commit history for any project
- **Staging & Commit** — Stage files, write commit messages, and commit without opening a terminal
- **Import/Export** — Backup and restore your project list, or import from VS Code workspace files
- **Cross-Platform** — Native builds for macOS, Windows, and Linux via Tauri
- **Lightweight** — Built with Tauri 2, the app binary is tiny compared to Electron alternatives
- **Dark/Light Theme** — Automatic system theme detection or manual override
- **Git Worktree Management** — Manage multiple working directories from a single project. Create, remove, and prune worktrees directly from the UI
- **Git Blame View** — See line-by-line authorship information with commit details and time-based color coding. Virtualized for large files
- **Branch Health Dashboard** — Analyze branch health across all projects. Identify merged branches ready for cleanup, stale branches, and branches significantly behind their base
- **Side-by-Side Diff View** — Compare code changes in split view with synchronized scrolling, alongside the existing unified diff format
- **Inline Diff Preview** — Click any file to see changes inline without opening a modal. View file change statistics (+N/-N) at a glance
- **Smart Batch Operations** — Pull only behind projects, push only ahead projects, or sync all repositories with intelligent conflict detection
- **Per-Project Quick Actions** — Fetch, pull, or push individual projects with one click from the project card
- **System Tray Integration** — App runs in the system tray with background monitoring. Automatic silent fetch to keep repositories up to date
- **Quick Filter & Sort** — Filter projects by status (changed, behind, ahead, stale) with one-click chips. Sort by name, last modified, changes, or branch
- **Project Color Labels** — Organize projects with 8 color options. Color stripes on project cards for quick visual identification
- **Enhanced Command Palette** — Search projects by name, alias, path, or branch. Quick filters: "behind", "changes", "stale". Jump to any project instantly
- **Commit Message Templates** — Quick-fill commit message prefixes (feat, fix, chore, docs) with character count and recent commit history
- **Keyboard Navigation** — Arrow keys to navigate projects, Enter to expand, Space to refresh. Full keyboard-driven workflow
- **Toast Error Retry** — Failed operations show retry button directly in the toast notification
- **Global Content Search** — Search across all repositories with `Cmd+Shift+F` or `/` prefix in Command Palette. Find code, config, or text instantly across your entire workspace
- **Git Stash Manager** — Full stash workflow: create with message, list all stashes, apply/pop/drop, and preview stash diffs before applying. Supports untracked files (`-u` flag)
- **Git Tag Manager** — Create lightweight and annotated tags, list all tags, push tags to remote, and delete tags with confirmation
- **Branch Comparison** — Compare any two branches to see ahead/behind counts and changed files list
- **File History** — View per-file commit log to trace changes to any specific file
- **Interactive Rebase** — Reorder, squash, pick, or drop commits with drag-to-reorder UI. Squash last N commits in one action
- **Notification Center** — Bell icon in header with in-memory notification store. Tracks background operations and errors
- **Git Log Visualization** — Lane-based commit graph showing branch topology and merge history
- **Keyboard Shortcuts Help** — `Cmd+/` opens searchable modal listing all available shortcuts
- **Error Recovery UI** — Error recovery banner with actionable suggestions when operations fail
- **Auto-Fetch on Launch** — Background fetch for all projects when the app starts, keeping repos up to date silently
- **Drag & Drop Import** — Drop Git repository folders directly onto the app window to import them
- **Quick Diff Overview** — `Cmd+D` shows a summary of all changes across all projects in one view
- **Project Statistics** — View commit count, contributors, branches, and tags for any project
- **Bulk Import** — Scan a directory recursively to find and import all Git repositories
- **Gitignore Manager** — Edit `.gitignore` files with common templates for popular languages and frameworks
- **Git Remote Manager** — List, add, remove, and edit remote repositories for any project
- **Theme Customization** — 8 accent color presets to personalize the app appearance
- **Git Bisect** — Binary search for bugs: start bisect, mark commits as good/bad, and let Git find the culprit
- **Git Reflog** — View reference log to see all HEAD movements and recover lost commits
- **Git Reset** — Soft, mixed, or hard reset to any commit with safety confirmations for destructive operations
- **Git Clean** — Preview untracked files before removing them, with option to include ignored files
- **Git Patch** — Create patches from commits and apply patch files to repositories
- **Git Hooks Manager** — View, toggle, and inspect Git hooks (pre-commit, commit-msg, etc.)
- **Git Submodule Manager** — Manage Git submodules: init, update, and view submodule status
- **Project Notes** — Add personal notes to any project, stored in local SQLite database
- **Conflict Resolver** — Visual interface for merge conflicts: list conflicts, resolve with ours/theirs, or abort merge
- **Git Archive** — Export repository as zip/tar archive at any commit
- **Cherry-Pick** — Cherry-pick commits from commit log with inline button. Supports multi-select and range cherry-pick with conflict handling
- **Merge Strategy Options** — Choose merge strategy (default, no-ff, squash) when merging branches
- **Enhanced Diff Viewer** — Word-level diff highlighting, syntax highlighting for 10+ languages, collapsible unchanged sections, line numbers, search with match highlighting, file tree navigation, statistics summary, keyboard navigation (J/K files, N/P hunks), and copy diff functionality
- **Enhanced Blame View** — Color-coded authorship, compact mode toggle, and virtualized scrolling for large files
- **Code Splitting** — Lazy-loaded modal components for faster initial load time
- **README Preview** — Hover over projects to see the first 500 characters of their README

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 |
| Build Tool | Vite 8 |
| Desktop Runtime | Tauri 2 (Rust backend) |
| Git Engine | libgit2 (via git2 crate) |
| Database | SQLite (via rusqlite) |
| LLM Integration | OpenAI-compatible API (configurable endpoint) |
| System Tray | Tauri 2 Tray API (native) |
| Background Service | Tokio async runtime |

### Getting Started

#### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

#### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Run the complete local quality suite (type checks, behavior tests, Rust fmt/clippy/tests, and frontend build)
npm run check

# Build the Tauri application for production
npm run tauri build
```

#### Download

Check the [Releases](../../releases) page for pre-built binaries.

### Architecture

```
git-switcher/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── BlameView.tsx         # Git blame viewer
│   │   ├── BranchHealthPanel.tsx # Branch health analysis
│   │   ├── ColorPicker.tsx       # Project color selector
│   │   ├── WorktreeManager.tsx   # Git worktree management
│   │   └── ...
│   ├── hooks/              # React hooks
│   └── lib/                # Utilities & types
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/
│   │   ├── commands/       # Tauri command handlers
│   │   ├── db/             # SQLite database layer
│   │   ├── models/         # Data models
│   │   └── services/       # Git, LLM & background services
│   │       └── background.rs # Background refresh service
│   └── Cargo.toml
└── package.json
```

### Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

### License

MIT

---

## 中文文档

### 为什么选择 Git Switcher？

如果你每天需要在多个 Git 仓库之间切换 —— 不断打开终端、输入重复的命令、逐个检查分支状态 —— 你一定深有体会：窗口太多、操作太碎、没有全局视图。

**Git Switcher** 是一个轻量级桌面应用，让你在一个界面中统一管理所有 Git 仓库。

### 功能特性

- **多仓库仪表盘** —— 一览所有项目的实时 Git 状态（修改文件数、领先/落后提交数、当前分支）
- **一键切换分支** —— 无需打开终端，直接在应用中切换任意项目的分支
- **批量操作** —— 同时对多个仓库执行 fetch、pull 等 Git 操作
- **项目分组** —— 将仓库按逻辑分组，支持自定义颜色标识
- **多种视图模式** —— 卡片、列表、紧凑、表格四种视图，适配不同工作习惯
- **AI 代码审查** —— 集成 LLM（兼容 OpenAI API），一键审查分支差异
- **Git 日志浏览** —— 查看任意项目的提交历史
- **暂存与提交** —— 在应用内完成文件暂存、编写提交信息、执行提交
- **导入/导出** —— 备份和恢复项目列表，支持从 VS Code 工作区文件导入
- **跨平台** —— 通过 Tauri 构建 macOS、Windows、Linux 原生应用
- **极致轻量** —— 基于 Tauri 2，安装包体积远小于 Electron 方案
- **明暗主题** —— 自动跟随系统主题，也支持手动切换
- **Git Worktree 管理** —— 从单个项目管理多个工作目录，直接在 UI 中创建、删除和清理 worktree
- **Git Blame 视图** —— 逐行查看作者信息、提交详情和基于时间的颜色编码，大文件虚拟化渲染
- **分支健康仪表盘** —— 分析所有项目的分支健康状态，识别已合并待清理、长期未更新和严重落后的分支
- **并排差异对比** —— 以分屏视图对比代码变更，支持同步滚动，同时保留统一差异格式
- **内联差异预览** —— 点击文件即可内联查看变更，无需弹窗。一眼查看文件变更统计（+N/-N）
- **智能批量操作** —— 仅拉取落后项目、仅推送领先项目，或同步所有仓库，支持智能冲突检测
- **单项目快捷操作** —— 在项目卡片上一键 fetch、pull 或 push 单个项目
- **系统托盘集成** —— 应用在系统托盘运行并后台监控，自动静默 fetch 保持仓库更新
- **快速筛选与排序** —— 按状态（已修改、落后、领先、陈旧）一键筛选项目，支持按名称、修改时间、变更数或分支排序
- **项目颜色标签** —— 8 种颜色选项组织项目，卡片上显示彩色条纹便于快速识别
- **增强命令面板** —— 按名称、别名、路径或分支搜索项目，快捷筛选："behind"、"changes"、"stale"，瞬间跳转到任意项目
- **提交信息模板** —— 快速填充提交信息前缀（feat、fix、chore、docs），显示字符计数和最近提交历史
- **键盘导航** —— 方向键浏览项目，Enter 展开，Space 刷新，全键盘驱动工作流
- **Toast 错误重试** —— 失败操作在 Toast 通知中直接显示重试按钮
- **全局内容搜索** —— 在所有仓库中搜索代码、配置或文本，使用 `Cmd+Shift+F` 或命令面板中输入 `/` 前缀
- **Git Stash 管理器** —— 完整的 stash 工作流：创建（支持消息）、列表、应用/弹出/删除，预览 stash 差异，支持未跟踪文件（`-u` 选项）
- **Git 标签管理器** —— 创建轻量和注释标签，列出所有标签，推送标签到远程，确认后删除标签
- **分支比较** —— 比较任意两个分支的领先/落后提交数和变更文件列表
- **文件历史** —— 查看特定文件的提交日志，追踪文件变更历史
- **交互式变基** —— 拖拽排序、选择/压缩/丢弃提交的可视化界面，支持压缩最近 N 个提交
- **通知中心** —— 标题栏铃铛图标，内存通知存储，追踪后台操作和错误
- **Git 日志可视化** —— 基于泳道的提交图，展示分支拓扑和合并历史
- **快捷键帮助** —— `Cmd+/` 打开可搜索的快捷键列表弹窗
- **错误恢复 UI** —— 操作失败时显示错误恢复横幅和可操作建议
- **启动时自动 Fetch** —— 应用启动时后台 fetch 所有项目，静默保持仓库更新
- **拖放导入** —— 将 Git 仓库文件夹直接拖放到应用窗口即可导入
- **快速差异概览** —— `Cmd+D` 在一个视图中查看所有项目的变更摘要
- **项目统计** —— 查看任意项目的提交数、贡献者、分支数和标签数
- **批量导入** —— 递归扫描目录，查找并导入所有 Git 仓库
- **Gitignore 管理器** —— 编辑 `.gitignore` 文件，提供常用语言和框架的模板
- **Git Remote 管理器** —— 列出、添加、删除和编辑项目的远程仓库
- **主题自定义** —— 8 种强调色预设，个性化应用外观
- **Git Bisect** —— 二分查找 bug：开始 bisect，标记好/坏提交，让 Git 定位问题提交
- **Git Reflog** —— 查看引用日志，追踪所有 HEAD 移动，恢复丢失的提交
- **Git Reset** —— 软重置、混合重置或硬重置到任意提交，破坏性操作有安全确认
- **Git Clean** —— 预览未跟踪文件后再删除，支持包含忽略文件选项
- **Git Patch** —— 从提交创建补丁文件，将补丁应用到仓库
- **Git Hooks 管理器** —— 查看、切换和检查 Git hooks（pre-commit、commit-msg 等）
- **Git 子模块管理器** —— 管理 Git 子模块：初始化、更新和查看子模块状态
- **项目备注** —— 为任意项目添加个人备注，存储在本地 SQLite 数据库
- **冲突解决器** —— 可视化合并冲突界面：列出冲突，选择 ours/theirs 解决，或中止合并
- **Git Archive** —— 将仓库导出为 zip/tar 归档文件，支持任意提交
- **Cherry-Pick** —— 从提交日志中 cherry-pick 提交，支持多选和范围选择，带冲突处理
- **合并策略选项** —— 合并分支时选择策略（默认、no-ff、squash）
- **增强差异查看器** —— 词级差异高亮、10+ 语言语法高亮、可折叠未变更区域、行号、搜索匹配高亮、文件树导航、统计摘要、键盘导航（J/K 切换文件、N/P 切换 hunk）、复制差异功能
- **增强 Blame 视图** —— 按作者颜色编码、紧凑模式切换、大文件虚拟化滚动
- **代码分割** —— 弹窗组件懒加载，加快初始加载速度
- **README 预览** —— 悬停项目即可查看 README 的前 500 个字符

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS 4 |
| 构建工具 | Vite 8 |
| 桌面运行时 | Tauri 2（Rust 后端） |
| Git 引擎 | libgit2（通过 git2 crate） |
| 数据库 | SQLite（通过 rusqlite） |
| LLM 集成 | 兼容 OpenAI 的 API（可配置端点） |
| 系统托盘 | Tauri 2 Tray API（原生） |
| 后台服务 | Tokio 异步运行时 |

### 快速开始

#### 环境要求

- [Node.js](https://nodejs.org/)（v18+）
- [Rust](https://www.rust-lang.org/tools/install)（最新稳定版）
- [Tauri 环境准备](https://v2.tauri.app/start/prerequisites/)

#### 开发模式

```bash
# 安装依赖
npm install

# 启动开发环境
npm run tauri dev

# 运行完整本地质量检查（类型检查、行为测试、Rust fmt/clippy/tests 与前端构建）
npm run check

# 构建 Tauri 生产版本
npm run tauri build
```

#### 下载

前往 [Releases](../../releases) 页面下载预编译的安装包。

### 项目结构

```
git-switcher/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   │   ├── BlameView.tsx         # Git blame 查看器
│   │   ├── BranchHealthPanel.tsx # 分支健康分析
│   │   ├── ColorPicker.tsx       # 项目颜色选择器
│   │   ├── WorktreeManager.tsx   # Git worktree 管理
│   │   └── ...
│   ├── hooks/              # React Hooks
│   └── lib/                # 工具函数与类型定义
├── src-tauri/              # Rust 后端（Tauri）
│   ├── src/
│   │   ├── commands/       # Tauri 命令处理
│   │   ├── db/             # SQLite 数据库层
│   │   ├── models/         # 数据模型
│   │   └── services/       # Git、LLM 与后台服务
│   │       └── background.rs # 后台刷新服务
│   └── Cargo.toml
└── package.json
```

### 参与贡献

欢迎提交 Issue 和 Pull Request！

### 许可证

MIT
