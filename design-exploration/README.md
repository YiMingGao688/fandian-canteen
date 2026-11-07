# 禾序 Web 管理后台设计探索

当前交付只包含独立原型，等待选择后再实施 Vue 后台。

新增第11套融合原型：`prototypes/11-studio.html`，采用用户指定的「顶部导航 + Bento Grid + 浮动工具栏」。原有十套保留，画廊现有11个入口。说明见 `hybrid-notes.md`。

## 打开

直接双击本目录 `index.html`，或在 PowerShell 执行：

```powershell
Start-Process 'C:\Users\31603\Documents\ChatGPT\点餐 2\campus-ordering\design-exploration\index.html'
```

需要本地 HTTP 预览时，在本目录运行：

```powershell
python serve.py
```

浏览 `http://127.0.0.1:15180`。服务只监听电脑回环地址，目录限制在本次设计探索，不需要启动数据库、Redis 或后端。

## 交付结构

- `index.html`：十套初始方案与第11套融合原型，可筛选和选择两套并排比较。
- `prototypes/*.html`：十一个独立入口，使用共享 Mock，页面结构各不相同。
- `screenshots/`：1440px 桌面完整截图、画廊缩略图与移动端检查图。
- `research.html`：20 个实际查看的公开产品界面分析，原始收录链接与访问限制。
- `research-sources.json`：38 个具名来源；受限案例不充作已查看界面。
- `project-analysis.md`：用户、业务、结构、当前问题与范围。
- `comparison.md`：十套方案的结构和取舍。
- `data-notes.md`、`mock-data.json`：字段口径与样本。
- `qa/verification.json`：浏览器与源码未变更检查。
- `qa.mjs`：可重复的本地截图与交互检查，使用项目已有 Playwright 和 Edge。

所有原型只使用本地资源，可断网打开。案例来源链接需要联网。图表本轮用原生 SVG 表达视觉；正式实施沿用 ECharts。研究截图是本地证据，不是原型页面素材。

## 重新生成

```powershell
python build.py
& 'D:\node\node.exe' qa.mjs
```

构建不接触任何现有业务文件；浏览器截图需要系统允许启动 Edge。Playwright 从 `web/node_modules` 读取现有依赖，无须为本次探索新增 npm 依赖。

## 选择

回复一个编号（例如 01），或指定两个编号和想保留的部分（例如 01 的布局 + 10 的餐饮品牌）。未明确确认前不进入正式开发。
