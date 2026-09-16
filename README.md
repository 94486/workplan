# 龙猫工作统计台（WorkDashboard）

一个**本地优先**的个人工作管理工作台：录入常规/其他两类工作，日程看板直观安排日程，工时收入统计看板实时汇总收入产出。内置**日薪 / 月薪双模式**，两套数据与页面完全独立、互不干扰。数据存储在**本地 SQLite 文件**，无需任何外部服务；支持打包为 **Docker 镜像** 与 **Windows 可执行文件 (exe)**。

> 专业蓝紫色系界面（极光浮动 · 透视网格 · 微动感背景） · 零前端依赖（原生 JS + SVG 图表）· 前后端分离结构 · 数据实时同步 · 深色 / 浅色双主题

---

## 功能特性

| 模块 | 说明 |
| --- | --- |
| 📅 日程看板 | 支持**周视图**与**月视图**切换；周视图按 7 天横向展开（始终单行，窄窗横向滚动），月视图按日历网格展示整月；已完成按「完成日期」归位；周/月汇总条实时统计完成/工时/收入/待办/逾期；每日卡片底部**细长可视化进度条**（6px 蓝紫渐变，100% 变绿）+ 百分比，任务标题支持 2 行显示；卡片支持一键完成 |
| 📝 工作录入 | 支持两类工作：**常规工作** / **其他工作**；字段：工作名称、花费时长、计划完成日期、预期收入、备注；点击空白格快速录入；**预设功能按类型独立**——常规/其他各自维护预设列表，选择预设一键填充，可将当前表单存为预设或删除预设 |
| ✅ 完成回填 | 标记完成时可修改实际时长/完成日期/实际收入；修改完成日期后卡片自动跳转、统计报表自动归入新日期所在周/日；计划日期已过未完成自动标红提醒 |
| 📊 工时收入看板 | **分类报表卡**：常规工作 / 其他工作 / 总统计三张卡，分别统计总工时、总收入、小时工资；副卡含完成率/本周工时/本周收入/逾期待办；近 8 周双轴趋势图（工时柱状 + 收入折线，渐变发光科技风）；上月收入与今年至今总收入面板（各配常规/其他迷你构成图） |
| 🗂 全部工作 | 表格视图支持类型、状态、日期筛选；表头点击排序；逾期行高亮；底部实时汇总工时/收入 |
| 🔗 地址栏锚点与视图参数 | URL `#kanban/#stats/#list` 自动切换视图，`?view=month` 直达月视图，刷新后保持当前页面 |
| 💾 本地存储 | 所有数据保存于本地 `data/works.db`（SQLite 单文件，可随时备份/迁移） |
| ⇕ 数据导入导出 | 一键导出 **JSON / CSV** 备份文件（JSON v2 含日薪工作/预设 + 月薪工作/预设/收入配置，CSV 带 BOM Excel 直接打开）；支持上传 JSON / CSV **合并导入**（自动跳过重复）或**覆盖导入**（迁移恢复）；**自动兼容旧版备份**（旧版只有 works 数组，自动识别导入到日薪模式），CSV 中英文表头均可识别 |
| 🔗 数据对接 | 外部程序（如自研计时软件）通过**对接码**（`X-Api-Key`）一键推送统计数据 → 进入**待审查箱**（不直接入库）→ 在界面逐条或「全部接收」以**合并模式**入库（重复自动跳过）或丢弃；推送方只需对接码 + JSON，字段容错与文件导入一致（类型/状态别名识别、done 自动回退）；推送可附 `source`（名称）/`pushed_at`（时间）**识别字段**（可选，仅待审查箱展示，不入库、不参与统计）；见 [docs/数据对接API.md](docs/数据对接API.md) |
| 🔍 数据查询 | 其它设备 / 程序用**同一对接码**（`X-Api-Key`）**只读查询**工作台数据：`GET /api/push/query`，支持 `scope`（日薪/月薪/预设/配置）/ `from`/`to`/`status` 过滤，返回与导出一致的 JSON，可直接作为推送 `data` 回传；见 [docs/数据查询规范.md](docs/数据查询规范.md) |
| ⚡ 实时同步 | 任何增删改操作完成后，看板 / 统计 / 列表三视图自动刷新 |
| 🎯 快速预设 | 常规工作与其他工作各自独立维护预设列表，录入时选择预设一键填充名称/时长/收入/备注，支持存为预设和删除 |
| 🥚 隐藏彩蛋 | 点击品牌名「龙猫工作统计台」下方的小字可随机切换 8 条趣味文案（含「为人民服务」「我是一台无情的赚钱机器 💰」「革命尚未成功，同志仍需努力」等），金色渐变光效 + 弹出动画 |
| 💼 日薪 / 月薪双模式 | 顶部单按钮一键切换两种模式，**两套数据与页面完全独立、互不干扰**：日薪模式按任务记录每日收入；月薪模式任务无每日收入，收入为月度整体配置（上月常规收入 + 上月其它收入）。月薪统计页向日薪看齐——分类报表卡（总工时 / 总收入 / **小时工资** = 收入 ÷ 工时）、完成率/工时/收入/待完成副卡、近 6 个月对比与类型效率表（含收入与小时工资列），**报表数据截至上月（收入配置对应月份的完整数据）而非当天**。**注意：月薪模式只是薪资以月度统计，任务管理/视图/工时趋势仍按周维度运作** |
| 🌓 深色 / 浅色主题 | 顶栏一键切换，两套配色均经过对比度与层级校准；浅色卡片柔和扩散阴影 + 今日列淡蓝锚点，深色辅助文字提亮 + 卡片背景分层 |
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
# 打包脚本会自动备份并恢复 data\works.db，不会因重新打包丢失数据
```

> 若 `build_exe.bat` 在依赖检查 / `pause` 处卡住（部分中文 Windows 批处理代码页问题），可直接执行等价的 `python -m PyInstaller --noconfirm work_dashboard.spec`，效果相同且更稳。

> **打包环境要求**：建议使用 Python 3.10–3.13。Python 3.14 过新，部分依赖（pydantic-core、Pillow）可能无预编译 wheel 导致 `pip install` 卡住。如遇此问题，使用你平时打包其他程序的 Python 环境即可。脚本不自动安装依赖，需提前 `pip install -r requirements.txt pyinstaller`。

## 图标体系（统一龙猫 Logo）

程序四处图标统一使用同一张龙猫 Logo（白色主体大头特写、蓝紫渐变背景）：

| 位置 | 文件 | 说明 |
| --- | --- | --- |
| exe 程序图标 | `assets/app.ico` | 打包时写入 exe 资源（16~256 六档尺寸），任务栏/资源管理器显示 |
| 网页 favicon | `frontend/favicon.ico` | 浏览器标签页图标 |
| 左上角 Logo | `frontend/logo.png` | 顶部导航品牌图标（40px，圆角） |
| 系统托盘图标 | `assets/app.png` | 打包后托盘区显示的图标（run_exe.py 读取） |

> 替换图标：准备一张正方形 PNG → 用 Pillow 生成多尺寸 ico（参考 `tools/_make_icons2.py`）→ 更新 `assets/` 与 `frontend/` 对应文件 → 重新打包。**不要用 PowerShell `Set-Content` 修改任何源码/HTML 文件**（见下方编码注意事项）。

## 编码注意事项（重要）

**历史事故复盘**：曾用 PowerShell `Set-Content -Encoding UTF8` 修改 `frontend/index.html` 版本号，导致：
1. Windows PowerShell 5.1 默认按 ANSI(GBK) 读取 UTF-8 文件，中文全部变成乱码（mojibake）；
2. 破坏 `</title>` 等闭合标签（不可逆），浏览器把整页吞进 title、JS 不执行、页面纯白；
3. 且打包前未用真实浏览器验证，坏文件一路打进 exe，造成"程序无法运行"。

**铁律（写进工作流）**：
- 改 HTML/JS/Python/文档一律用**编辑器或 Python 脚本**（明确指定 `utf-8` 编码），**禁止 PowerShell `Set-Content`/`Get-Content` 改写文本文件**；
- **打包前必须用真实浏览器验证页面渲染**（如 Edge headless `--dump-dom` 检查页面含看板/统计渲染文本），验证通过才允许打包；
- 打包/启动前后检查 8000 端口归属，确保 exe 独占服务、不被残留 python 进程干扰。

## 打包验证流程（推荐）

```bash
# 1. 改完前端/后端后先做静态校验
node --check frontend/js/*.js            # JS 语法（如有 node；注意 PowerShell 下通配符展开）
python tools/_validate_html.py            # HTML 标签闭合 + 编码校验
python -c "import pathlib,py_compile; fs=[str(p) for p in pathlib.Path('backend').rglob('*.py')]+['run_exe.py']; [py_compile.compile(f,doraise=True) for f in fs]; print('OK',len(fs))"  # 后端语法（py_compile 不支持命令行通配符，用 Python 遍历）

# 2. 打包（自动备份/恢复 dist\data\works.db，不丢数据）
build_exe.bat                             # 若在依赖检查/pause 处卡住，改用手动命令：
python -m PyInstaller --noconfirm work_dashboard.spec

# 3. 启动后用真实浏览器验证
#    运行 dist\WorkDashboard.exe → 浏览器访问 http://127.0.0.1:8000
#    确认页面渲染（看板/统计/双模式切换），再用 API 抽查数据
```

> **build_exe.bat 为什么是全英文**：中文 Windows 的 cmd 批处理解析代码页不稳定（GBK/UTF-8 切换），bat 内中文注释/echo 会被拆成乱码命令导致脚本失败。因此该脚本使用**纯 ASCII（英文）**，在任何代码页下都能正确解析，功能完全不受影响。

## 日薪 / 月薪模式说明

| 维度 | 日薪模式 | 月薪模式 |
| --- | --- | --- |
| 任务收入 | 每个任务填写预期/实际收入 | 任务**无收入字段** |
| 收入统计 | 按任务实际收入累加 | 月度整体配置：上月常规收入 + 上月其它收入 |
| 任务/视图 | 周视图 + 月视图 | 周视图 + 月视图（与日薪相同维度） |
| 工时趋势 | 近 8 周工时·收入双轴 | 近 8 周工时·完成趋势 |
| 报表口径 | 数据截至当天 | 数据截至**上月**（收入配置月份，完整月度） |
| 小时工资 | 实际收入 ÷ 实际工时 | 配置收入 ÷ 上月完成工时 |
| 预设 | 常规/其他各自独立 | 常规/其他各自独立（与日薪预设完全隔离） |
| 数据表 | `works` / `presets` / `settings` | `monthly_works` / `monthly_presets` / `monthly_settings` |

> **关键澄清**：月薪模式只是**薪资以月度统计**，不是整个应用变成月度模式。任务管理、周/月视图、工时趋势仍按周维度运作，仅收入来源从"逐任务记录"变为"月度整体配置"。两套模式的数据库表完全分离，切换模式不会互相影响数据。

## 数据安全与健壮性

- **双模式数据隔离**：日薪（`works`/`presets`）与月薪（`monthly_works`/`monthly_presets`/`monthly_settings`）使用完全独立的数据库表；月薪接口**拒绝收入等额外字段**（`extra="forbid"`），杜绝误传导致的数据混淆；日薪/月薪的删除、重新打开等操作严格按当前模式路由到对应表，不会误动另一套数据。
- **输入校验**：所有工作/预设名称自动去除首尾空格（全空格拒绝）；日期字段严格校验 `YYYY-MM-DD`；收入配置月份严格校验 `YYYY-MM`；负时长/负收入、非法类型均被拒绝（HTTP 422）。
- **统计除零保护**：空数据 / 0 工时 / 0 收入场景下小时工资恒为 0，不崩溃、不产生 NaN。
- **导入兼容**：支持新版 v2 备份（含月薪数据）与**旧版仅 works 数组**的备份自动识别；merge 导入自动跳过重复条目（名称+类型+计划日期），且**不覆盖已存在的月薪收入配置**；CSV 中英文表头均可识别，GBK/UTF-8 双编码回退。
- **类型/状态智能识别**：工作类型（常规/其他）与状态（待完成/已完成）支持中英文及常见别名（如 `daily`→常规、`completed`→已完成）；字段缺失用安全默认值（常规/待完成），**明确写了但无法识别时该行判为无效并提示**，不再静默归类错误；无效原因在导入结果中明确展示。
- **数据对接鉴权与审查**：推送接口通过 `X-Api-Key` 对接码鉴权（常量时间比较，重生成后旧码立即失效）；推送数据先入待审查箱，审查合并复用与文件导入完全一致的规整/判重逻辑，未经确认的数据绝不写入正式表。
- **已完成工作防覆盖**：已完成任务再次调用"标记完成"时保留已有实际值，不会被计划值覆盖。

## 示例数据（example/）

`example/demo_backup_2months.json` 提供两个月（2026-07、2026-08）的完整模拟数据（日薪 50 条、月薪 40 条，月薪配置常规 ¥8,000 / 其他 ¥1,000），可直接通过「导入数据」功能加载，用于功能演示与界面测试。详见 [example/README.md](example/README.md)。

## 回归测试（tools/）

所有测试均使用**临时数据库 + 独立端口**，不触碰 `data/works.db` 真实数据。

- `tools/_robust_test.py` — 后端全量健壮性回归（**43 项**：CRUD / 校验 / 除零 / 导入兼容 / 数据隔离 / 数据对接），运行：`python tools/_robust_test.py`。
- `tools/_monthly_stats_test.py` — 月薪统计专项（**16 项**：截至上月口径 / 小时工资 / 周趋势 / 月对比），运行：`python tools/_monthly_stats_test.py`。
- `tools/_verify_fixes.py` — 健壮性修复回归（**17 项**：P1–P6 修复验证）。
- `tools/_test_push.py` — 数据对接接口回归（对接码鉴权 / 推送入待审查箱 / 审查合并 / 丢弃 / 判重 / 对接码重生成）。
- `tools/_verify_meta.py` / `_verify_simple.py` — 推送识别字段（source/pushed_at 不入库）与旧库自动迁移专项。
- `tools/_verify_push_view.py` — 待审查箱数据逻辑专项（大推送预览截断 / 无效计数 / 类别摘要）。
- `tools/_push_live_test.py` / `_push_live_simple.py` — 针对真实 exe（端口 8000）的推送链路实测。
- `tools/_gen_demo_data.py` / `_verify_demo.py` — 重新生成 / 校验示例数据。

## 项目结构

```
work-dashboard/
├── backend/                 # 后端（FastAPI + SQLite）
│   ├── main.py              # 应用入口、静态资源挂载、启动逻辑
│   ├── database.py          # 数据库层（建表 / 连接 / CRUD 工具）
│   ├── models.py            # Pydantic 请求参数校验
│   └── routers/
│       ├── works.py         # 日薪工作 CRUD、标记完成/重新打开
│       ├── stats.py         # 日薪统计接口（摘要 / 每日 / 每周）
│       ├── presets.py       # 日薪预设 CRUD（常规/其他工作各自独立）
│       ├── monthly.py       # 月薪模式：任务/预设/收入配置/统计（独立表，与日薪隔离）
│       ├── data_io.py       # 数据导入导出（JSON / CSV）
│       └── push.py          # 数据对接（对接码鉴权 / 推送 / 待审查箱 / 审查合并）
├── frontend/                # 前端（原生 HTML/CSS/JS，零依赖）
│   ├── index.html           # 单页结构（顶栏品牌+彩蛋小字+小型时间 · 看板 · 统计 · 列表）
│   ├── css/style.css        # 科技感主题样式（深色/浅色双主题 · 专业蓝紫配色）
│   └── js/                  # 分层模块
│       ├── api.js           # 后端 API 封装（日薪+月薪共 30+ 方法）
│       ├── store.js         # 双模式数据隔离（data.daily/data.monthly · localStorage 记忆模式）
│       ├── charts.js        # SVG 自绘图表（趋势图 · 构成图）
│       ├── kanban.js        # 周/月视图渲染（7列单行 · 日程卡 · 工时进度条）
│       ├── stats.js         # 日薪+月薪双统计页
│       ├── modal.js         # 录入/编辑/预设/收入配置/数据对接弹窗
│       └── app.js           # 入口（路由 · 模式切换 · 主题 · 彩蛋 · 顶栏时间）
├── assets/                  # 应用图标（app.ico / app.png）
├── data/                    # SQLite 数据文件目录（自动创建）
├── docs/                    # 完整文档
├── example/                 # 示例数据（两个月模拟备份 + 说明）
├── tools/                   # 工具脚本（图标生成 / 回归测试 / 示例数据生成）
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
| GET | `/api/monthly/works` | 月薪任务列表（支持 status / work_type / 日期过滤） |
| POST | `/api/monthly/works` | 新建月薪任务（无收入字段） |
| PUT | `/api/monthly/works/{id}` | 编辑月薪任务 |
| DELETE | `/api/monthly/works/{id}` | 删除月薪任务 |
| POST | `/api/monthly/works/{id}/complete` | 月薪任务标记完成（实际时长/完成日期） |
| POST | `/api/monthly/works/{id}/reopen` | 月薪任务重新打开 |
| GET | `/api/monthly/presets?work_type=regular\|other` | 月薪预设列表（按类型独立） |
| POST | `/api/monthly/presets` | 新建月薪预设 |
| PUT | `/api/monthly/presets/{id}` | 编辑月薪预设 |
| DELETE | `/api/monthly/presets/{id}` | 删除月薪预设 |
| GET | `/api/monthly/settings` | 获取月薪收入配置（上月常规/其它收入） |
| PUT | `/api/monthly/settings` | 更新月薪收入配置 |
| GET | `/api/monthly/stats/summary` | 月薪统计摘要（截至上月：分组工时/完成/收入/小时工资 + 待完成 + 收入配置 + 统计月份） |
| GET | `/api/monthly/stats/weekly` | 月薪近 8 周工时·完成趋势 |
| GET | `/api/monthly/stats/monthly` | 月薪近 6 个完整月完成对比（最新为上月，不含进行中的本月） |
| GET | `/api/data/export?format=json\|csv` | 导出全部数据为备份文件（下载） |
| POST | `/api/data/import` | 导入 JSON / CSV 文件（merge 合并 / replace 覆盖） |
| GET | `/api/push/config` | 获取数据对接码 |
| PUT | `/api/push/config` | 重新生成（或自定义）对接码 |
| POST | `/api/push` | 外部程序推送数据（需 `X-Api-Key` 对接码，进入待审查箱；`source`/`pushed_at` 为可选识别字段，不入库） |
| GET | `/api/push/inbox` | 待审查箱列表（含记录预览） |
| POST | `/api/push/inbox/{id}/approve` | 审查后合并入库（合并模式，重复跳过） |
| POST | `/api/push/inbox/{id}/discard` | 丢弃该批待审查数据 |
| GET | `/api/push/query` | 只读查询工作台数据（需 `X-Api-Key` 对接码；`scope`/`from`/`to`/`status` 过滤，返回与导出一致的 JSON） |
| GET | `/api/health` | 健康检查 |

完整 API 文档见 [docs/API文档.md](docs/API文档.md)；启动后可访问 `http://127.0.0.1:8000/docs` 查看交互式接口文档。

## 文档索引

- [架构设计](docs/架构设计.md) — 技术栈、目录职责、数据模型、前端模块、实时同步机制
- [数据库设计](docs/数据库设计.md) — 完整表结构与索引、设计决策与权衡、完整性与迁移策略、数据文件位置与打包保留规则
- [API 文档](docs/API文档.md) — 全部接口的请求/响应示例
- [部署指南](docs/部署指南.md) — 本地 / Docker / Windows exe 三种部署方式详解与常见问题
- [导入数据格式规范](docs/导入数据格式规范.md) — 供第三方工具（如计时软件）构建可导入/可推送的数据文件
- [数据对接标准](docs/数据对接标准.md) — 数据标准参考（含 JSON Schema 与可直接照抄的完整模板），让其他程序按标准生成数据；机器可读标准见 [docs/work_dashboard_data.schema.json](docs/work_dashboard_data.schema.json)
- [数据对接 API](docs/数据对接API.md) — 外部程序通过对接码一键推送 + 审查合并的对接说明与示例
- [数据查询规范](docs/数据查询规范.md) — 其它设备 / 程序通过对接码只读查询数据的规范与示例（含 Docker 场景）
- [健壮性测试报告](docs/健壮性测试报告_20260903.md) — 对抗性测试记录（功能回归 24 项 + 健壮性 46 项）与 P1–P6 缺陷修复进展（附录）

## 技术栈

- **后端**：Python + FastAPI + Uvicorn，SQLite（标准库 sqlite3）本地存储
- **前端**：原生 HTML / CSS / JavaScript（ES2020），零第三方依赖，SVG 自绘图表
- **桌面集成**：PyInstaller + pystray + Pillow（无黑框、自动开浏览器、系统托盘）
- **打包**：Docker（多阶段部署）+ PyInstaller（Windows exe）

## 许可

MIT License，可自由使用与二次开发。
