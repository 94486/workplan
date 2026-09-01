# 个人工作管理工作台 WorkDashboard

一个**本地优先**的个人工作管理工作台：录入常规/其他两类工作，日程看板直观安排日程，工时收入统计看板实时汇总收入产出。数据存储在**本地 SQLite 文件**，无需任何外部服务；支持打包为 **Docker 镜像** 与 **Windows 可执行文件 (exe)**。

> 专业蓝紫色系界面（极光浮动 · 透视网格 · 微动感背景） · 零前端依赖（原生 JS + SVG 图表）· 前后端分离结构 · 数据实时同步

---

## 功能特性

| 模块 | 说明 |
| --- | --- |
| 📅 日程看板 | 支持**周视图**与**月视图**切换；周视图按 7 天横向展开，月视图按日历网格展示整月；已完成按「完成日期」归位；周/月汇总条实时统计完成/工时/收入/待办/逾期；卡片支持一键完成 |
| 📝 工作录入 | 支持两类工作：**常规工作** / **其他工作**；字段：工作名称、花费时长、计划完成日期、预期收入、备注；点击空白格快速录入；**预设功能按类型独立**——常规/其他各自维护预设列表，选择预设一键填充，可将当前表单存为预设或删除预设 |
| ✅ 完成回填 | 标记完成时可修改实际时长/完成日期/实际收入；修改完成日期后卡片自动跳转、统计报表自动归入新日期所在周/日；计划日期已过未完成自动标红提醒 |
| 📊 工时收入看板 | **分类报表卡**：常规工作 / 其他工作 / 总统计三张卡，分别统计总工时、总收入、小时工资；副卡含完成率/本周工时/本周收入/逾期待办；近 8 周双轴趋势图（工时柱状 + 收入折线，渐变发光科技风）；上月收入与今年至今总收入面板（各配常规/其他迷你构成图） |
| 🗂 全部工作 | 表格视图支持类型、状态、日期筛选；表头点击排序；逾期行高亮；底部实时汇总工时/收入 |
| 🔗 地址栏锚点与视图参数 | URL `#kanban/#stats/#list` 自动切换视图，`?view=month` 直达月视图，刷新后保持当前页面 |
| 💾 本地存储 | 所有数据保存于本地 `data/works.db`（SQLite 单文件，可随时备份/迁移） |
| ⇕ 数据导入导出 | 一键导出 **JSON / CSV** 备份文件（CSV 带 BOM，Excel 直接打开）；支持上传 JSON / CSV **合并导入**（自动跳过重复）或**覆盖导入**（迁移恢复），CSV 中英文表头均可识别 |
| ⚡ 实时同步 | 任何增删改操作完成后，看板 / 统计 / 列表三视图自动刷新 |
| 🎯 快速预设 | 常规工作与其他工作各自独立维护预设列表，录入时选择预设一键填充名称/时长/收入/备注，支持存为预设和删除 |
| 🥚 隐藏彩蛋 | 点击顶部「为人民服务」标题可切换为「我是一台无情的赚钱机器 💰」，金色渐变光效 |
| 🖥 Windows 桌面模式 | 打包为 exe 后无黑框、自动打开浏览器、状态栏托盘图标可打开页面/退出 |

## 快速开始

### 方式一：本地开发运行（Python 3.10–3.13）

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 启动服务（默认 http://127.0.0.1:8000）
python -m backend.main

# 可选：首次启动写入演示数据
SEED_DEMO=1 python -m backend.main
```

### 方式二：Docker 运行

```bash
docker build -t work-dashboard .
docker run -d -p 8000:8000 -v work-data:/data work-dashboard
# 或使用 compose 一键启动
docker compose up -d
```

### 方式三：Windows exe（推荐个人桌面使用）

```bash
# 在 Windows 上执行
build_exe.bat
# 产物: dist\WorkDashboard.exe，双击运行：
#   - 无黑色命令行窗口
#   - 自动启动服务并打开浏览器
#   - 状态栏图标：左键/双击打开页面，右键可「打开工作台」或「退出程序」
#   - 重复启动会自动复用已有实例并打开浏览器
# 数据保存在 exe 同级的 data\works.db，日志在 logs\app.log
```

> **打包环境要求**：建议使用 Python 3.10–3.13。Python 3.14 过新，部分依赖（pydantic-core、Pillow）可能无预编译 wheel 导致 `pip install` 卡住。如遇此问题，使用你平时打包其他程序的 Python 环境即可。脚本不自动安装依赖，需提前 `pip install -r requirements.txt pyinstaller`。

## 项目结构

```
work-dashboard/
├── backend/                 # 后端（FastAPI + SQLite）
│   ├── main.py              # 应用入口、静态资源挂载、启动逻辑
│   ├── database.py          # 数据库层（建表 / 连接 / CRUD 工具）
│   ├── models.py            # Pydantic 请求参数校验
│   └── routers/
│       ├── works.py         # 工作 CRUD、标记完成/重新打开
│       ├── stats.py         # 统计接口（摘要 / 每日 / 每周）
│       ├── presets.py       # 预设 CRUD（常规/其他工作各自独立）
│       └── data_io.py       # 数据导入导出（JSON / CSV）
├── frontend/                # 前端（原生 HTML/CSS/JS，零依赖）
│   ├── index.html           # 单页结构
│   ├── css/style.css        # 科技感主题样式
│   └── js/                  # 分层模块（api / store / charts / kanban / stats / modal / app）
├── assets/                  # 应用图标（app.ico / app.png）
├── data/                    # SQLite 数据文件目录（自动创建）
├── docs/                    # 完整文档
├── tools/                   # 工具脚本（如图标生成）
├── Dockerfile               # Docker 镜像
├── docker-compose.yml       # 容器编排
├── requirements.txt         # Python 依赖
├── work_dashboard.spec      # PyInstaller 打包配置
├── build_exe.bat            # Windows 一键构建脚本
└── run_exe.py               # exe 桌面入口（托盘 + 自动开浏览器）
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WORK_DB_PATH` | `data/works.db` | SQLite 数据库文件路径（Docker 中映射为 `/data/works.db`） |
| `PORT` | `8000` | 服务监听端口 |
| `HOST` | `127.0.0.1` | 监听地址；默认仅本机访问，需要局域网或 Docker 访问时设为 `0.0.0.0` |
| `SEED_DEMO` | `0` | 首次启动时写入演示数据（`1` 开启） |
| `AUTO_OPEN_BROWSER` | `1` | exe/桌面入口启动后是否自动打开浏览器（`0` 关闭） |

## 接口概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/works` | 查询工作列表（支持 status / work_type / 日期范围过滤） |
| POST | `/api/works` | 新建工作 |
| PUT | `/api/works/{id}` | 编辑工作 |
| DELETE | `/api/works/{id}` | 删除工作 |
| POST | `/api/works/{id}/complete` | 标记完成（可传实际时长/完成日期/实际收入） |
| POST | `/api/works/{id}/reopen` | 重新打开 |
| GET | `/api/stats/summary` | 工时收入统计摘要 |
| GET | `/api/stats/daily` | 每日完成统计（趋势图） |
| GET | `/api/stats/weekly` | 每周完成统计（趋势图） |
| GET | `/api/presets?work_type=regular\|other` | 查询预设列表（按类型过滤） |
| POST | `/api/presets` | 新建预设 |
| PUT | `/api/presets/{id}` | 编辑预设 |
| DELETE | `/api/presets/{id}` | 删除预设 |
| GET | `/api/data/export?format=json\|csv` | 导出全部数据为备份文件（下载） |
| POST | `/api/data/import` | 导入 JSON / CSV 文件（merge 合并 / replace 覆盖） |
| GET | `/api/health` | 健康检查 |

完整 API 文档见 [docs/API文档.md](docs/API文档.md)；启动后可访问 `http://127.0.0.1:8000/docs` 查看交互式接口文档。

## 文档索引

- [架构设计](docs/架构设计.md) — 技术栈、目录职责、数据模型、前端模块、实时同步机制
- [API 文档](docs/API文档.md) — 全部接口的请求/响应示例
- [部署指南](docs/部署指南.md) — 本地 / Docker / Windows exe 三种部署方式详解与常见问题

## 技术栈

- **后端**：Python + FastAPI + Uvicorn，SQLite（标准库 sqlite3）本地存储
- **前端**：原生 HTML / CSS / JavaScript（ES2020），零第三方依赖，SVG 自绘图表
- **桌面集成**：PyInstaller + pystray + Pillow（无黑框、自动开浏览器、系统托盘）
- **打包**：Docker（多阶段部署）+ PyInstaller（Windows exe）

## 许可

MIT License，可自由使用与二次开发。
