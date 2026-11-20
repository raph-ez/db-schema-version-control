# Migrations & GitHub VCS URL 修改说明

修改目标：点击左侧 **Migrations & GitHub VCS**，浏览器地址仍为 `http://localhost:3000/`，并且显示完整 Migration 页面。

具体实现：
- `app/components/DashboardShell.tsx`：删除指向 `/migrations` 的侧边栏 Link，使用 `onSelectTab` 在首页切换。
- `app/page.tsx`：直接渲染 `<MigrationsPanel>`，并传入 `onOpenMigrations` 给 SchemaComparisonPanel。
- `app/SchemaComparisonPanel.tsx`：生成 Migration 后使用 `onOpenMigrations?.()` 切换页签，不再使用 `router.push`。
- `app/MigrationsPanel.tsx`：将原来 `/migrations` 页面的内容提取为可在首页嵌入的组件，保留 SQL 编辑、审批、历史记录和 GitHub VCS 操作。
- `app/migrations/page.tsx`：旧页面地址重定向至 `/`，避免旧书签报错。

## 替换方法

**推荐**：直接解压完整项目 ZIP，在 VS Code 打开含有 package.json 的项目文件夹。

**保留你自己的其他改动**：从修改文件 ZIP 逐个覆盖对应路径（请备份原文件）。注意 `app/MigrationsPanel.tsx` 为**新文件**。

## 运行

```bash
npm install
npm run dev
```

在浏览器打开 `http://localhost:3000/`，点击 Sidebar 的 **Migrations & GitHub VCS**；浏览器地址应保持 `/`。

没有执行完整 Next.js build：当前环境中没有安装该项目的 npm 依赖。已通过 TSX 语法检查和导航流程静态检查。
