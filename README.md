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

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 |
| Build Tool | Vite 8 |
| Desktop Runtime | Tauri 2 (Rust backend) |
| Git Engine | libgit2 (via git2 crate) |
| Database | SQLite (via rusqlite) |
| LLM Integration | OpenAI-compatible API (configurable endpoint) |

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

# Build for production
npm run tauri build
```

#### Download

Check the [Releases](../../releases) page for pre-built binaries.

### Architecture

```
git-switcher/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── hooks/              # React hooks
│   └── lib/                # Utilities & types
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/
│   │   ├── commands/       # Tauri command handlers
│   │   ├── db/             # SQLite database layer
│   │   ├── models/         # Data models
│   │   └── services/       # Git & LLM services
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

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS 4 |
| 构建工具 | Vite 8 |
| 桌面运行时 | Tauri 2（Rust 后端） |
| Git 引擎 | libgit2（通过 git2 crate） |
| 数据库 | SQLite（通过 rusqlite） |
| LLM 集成 | 兼容 OpenAI 的 API（可配置端点） |

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

# 构建生产版本
npm run tauri build
```

#### 下载

前往 [Releases](../../releases) 页面下载预编译的安装包。

### 项目结构

```
git-switcher/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   ├── hooks/              # React Hooks
│   └── lib/                # 工具函数与类型定义
├── src-tauri/              # Rust 后端（Tauri）
│   ├── src/
│   │   ├── commands/       # Tauri 命令处理
│   │   ├── db/             # SQLite 数据库层
│   │   ├── models/         # 数据模型
│   │   └── services/       # Git 与 LLM 服务
│   └── Cargo.toml
└── package.json
```

### 参与贡献

欢迎提交 Issue 和 Pull Request！

### 许可证

MIT
