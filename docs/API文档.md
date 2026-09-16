# API 文档

基础路径：`http://127.0.0.1:8000`（本地）或你的服务器地址。
所有接口返回 JSON。启动后可访问 `/docs` 查看交互式 Swagger 文档。

---

## 通用

### 健康检查

`GET /api/health`

```json
{ "status": "ok", "db": "data/works.db" }
```

---

## 日薪模式 - 工作任务

### 获取工作列表

`GET /api/works?status=pending&work_type=regular&date_from=2026-09-01&date_to=2026-09-30`

参数均可选：

| 参数 | 说明 |
|---|---|
| `status` | `pending` / `done` |
| `work_type` | `regular` / `other` |
| `date_from` / `date_to` | 计划日期范围 `YYYY-MM-DD`（非法日期返回 422） |

返回数组。

### 新建工作

`POST /api/works`

```json
{
  "name": "撰写周报",
  "work_type": "regular",
  "planned_date": "2026-09-02",
  "duration_hours": 2,
  "expected_income": 300,
  "notes": "备注"
}
```

### 编辑工作

`PUT /api/works/{id}`，请求体同新建。

### 删除工作

`DELETE /api/works/{id}`

### 标记完成

`POST /api/works/{id}/complete`

```json
{
  "actual_duration_hours": 2.5,
  "actual_income": 320,
  "completed_date": "2026-09-02"
}
```

### 重新打开

`POST /api/works/{id}/reopen`

---

## 日薪模式 - 统计

### 统计摘要

`GET /api/stats/summary`

返回分类汇总（常规/其他/总计）、总工时、总收入、小时工资等。

```json
{
  "groups": [
    { "type": "regular", "label": "常规工作", "hours": 24.0, "income": 16800.0, "count": 6, "hourly_rate": 700.0 },
    { "type": "other", "label": "其他工作", "hours": 8.5, "income": 2200.0, "count": 3, "hourly_rate": 258.82 }
  ],
  "totals": { "hours": 32.5, "income": 19000.0, "count": 9, "hourly_rate": 584.62 },
  "counts": { "pending": 2, "done": 9 },
  "generated_at": "2026-09-15 12:00:00"
}
```

### 每日统计

`GET /api/stats/daily?days=14`

`days` 为最近天数（7–90，默认 14），返回每日完成工时/收入（用于趋势图）：

```json
[
  { "date": "2026-09-01", "hours": 2.5, "income": 400 },
  { "date": "2026-09-02", "hours": 1.5, "income": 200 }
]
```

### 每周统计

`GET /api/stats/weekly`（无参数，固定近 8 周）

返回近 8 周的工时与收入趋势（`week_start` 为周一起始日期）。

---

## 日薪模式 - 预设

### 获取预设列表

`GET /api/presets?work_type=regular`

按类型过滤（regular / other），常规与其他预设各自独立。

### 新建预设

`POST /api/presets`

```json
{
  "name": "日报撰写",
  "work_type": "regular",
  "duration_hours": 1,
  "expected_income": 100,
  "notes": ""
}
```

### 编辑 / 删除预设

`PUT /api/presets/{id}` / `DELETE /api/presets/{id}`

---

## 月薪模式 - 工作任务

接口路径前缀 `/api/monthly/works`，字段与日薪相同，但**无 expected_income / actual_income 字段**。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/monthly/works` | 列表（支持 status / work_type / date_from / date_to 过滤） |
| POST | `/api/monthly/works` | 新建 |
| PUT | `/api/monthly/works/{id}` | 编辑 |
| DELETE | `/api/monthly/works/{id}` | 删除 |
| POST | `/api/monthly/works/{id}/complete` | 完成（actual_duration_hours / completed_date） |
| POST | `/api/monthly/works/{id}/reopen` | 重新打开 |

---

## 月薪模式 - 预设

接口路径前缀 `/api/monthly/presets`，与日薪预设完全隔离。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/monthly/presets?work_type=regular` | 列表（按类型过滤） |
| POST | `/api/monthly/presets` | 新建（无 expected_income） |
| PUT | `/api/monthly/presets/{id}` | 编辑 |
| DELETE | `/api/monthly/presets/{id}` | 删除 |

---

## 月薪模式 - 收入配置

### 获取配置

`GET /api/monthly/settings`

```json
{
  "month_key": "2026-08",
  "regular_income": 15000,
  "other_income": 2500,
  "total_income": 17500
}
```

### 更新配置

`PUT /api/monthly/settings`

```json
{
  "month_key": "2026-08",
  "regular_income": 15000,
  "other_income": 2500
}
```

`total_income` 由后端自动计算。

---

## 月薪模式 - 统计

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/monthly/stats/summary` | 月薪统计摘要（截至上月：分组工时/完成/收入/小时工资 + 待完成 + 收入配置 + 统计月份） |
| GET | `/api/monthly/stats/weekly` | 近 8 周工时·完成趋势 |
| GET | `/api/monthly/stats/monthly` | 近 6 个完整月完成对比（最新为上月，不含进行中的本月） |

`/api/monthly/stats/summary` 响应示例：

```json
{
  "groups": [
    { "type": "regular", "label": "常规工作", "hours": 24.0, "income": 16800.0,
      "count": 6, "pending_count": 1, "hourly_rate": 700.0 },
    { "type": "other", "label": "其他工作", "hours": 8.5, "income": 2200.0,
      "count": 3, "pending_count": 1, "hourly_rate": 258.82 }
  ],
  "totals": { "hours": 32.5, "income": 19000.0, "count": 9, "hourly_rate": 584.62 },
  "counts": { "pending": 2, "done": 9 },
  "settings": { "month_key": "2026-08", "regular_income": 16800.0, "other_income": 2200.0, "total_income": 19000.0 },
  "period": { "month_key": "2026-08", "label": "2026年8月", "first_day": "2026-08-01", "last_day": "2026-08-31" },
  "generated_at": "2026-09-15 12:00:00"
}
```

口径说明：统计月份取收入配置 `month_key`（默认上月）；收入来自配置，工时/完成取该月内完成任务的实际数据，**小时工资 = 收入 ÷ 工时**，待完成取计划日期落在该月的未完成任务。

---

## 数据导入导出

### 导出

`GET /api/data/export?format=json`（或 `csv`）

返回文件下载。CSV 带 BOM，Excel 可直接打开。

### 导入

`POST /api/data/import`

`multipart/form-data`，字段：
- `file`：JSON 或 CSV 文件
- `mode`：`merge`（合并，跳过重复）或 `replace`（覆盖，迁移恢复用）

---

## 数据对接（外部程序推送）

供外部程序（如自研计时软件）用「对接码」一键推送统计数据。推送数据先进入**待审查箱**（不直接入库），审查确认后以合并模式入库（与文件导入完全一致的规整/判重逻辑）。完整对接说明见 [docs/数据对接API.md](数据对接API.md)。

### 获取 / 重生成对接码

```
GET /api/push/config → { "api_key": "wd_xxx", "updated_at": "..." }
PUT /api/push/config → body: { "regenerate": true }（或自定义 { "regenerate": false, "api_key": "..." }）
```

### 推送数据

`POST /api/push`，请求头 `X-Api-Key: <对接码>`

```json
{
  "source": "计时软件",                    // 识别字段（可选）：来源名称，仅待审查箱展示，不入库
  "pushed_at": "2026-09-01 18:00:00",     // 识别字段（可选）：推送时间，仅展示，不入库
  "data": {
    "works": [ ... ],
    "monthly_works": [ ... ],
    "presets": [ ... ],
    "monthly_presets": [ ... ],
    "monthly_settings": [ ... ]
  }
}
```

`data` 也支持直接传数组（等价于 `{"works": [...]}`）。

响应：`{ "inbox_id": 1, "received": 3, "invalid": 0, "message": "..." }`

### 待审查箱

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/push/inbox?status=pending` | 待审查列表（含 source/pushed_at、record_count 有效数、invalid_count 无效数、summary 统计摘要、preview 明细前 20 条） |
| POST | `/api/push/inbox/{id}/approve` | 审查后合并入库（合并模式，重复跳过）→ `{merged, skipped, invalid, daily_works, ...}` |
| POST | `/api/push/inbox/{id}/discard` | 丢弃该批数据（不入库） |

**规则要点**
- **识别字段**：`source` / `pushed_at` 仅用于待审查箱识别展示，随推送快照保存，**不写入数据库正式表、不参与任何统计**。
- **归属规则**：数据归日薪还是月薪由 `data` 顶层键决定——`works`→日薪表、`monthly_works`→月薪表、`monthly_settings`→收入配置，与界面当前所处模式无关。
- **判重**：日薪/月薪工作 = 名称+类型+计划日期 三者全等视为重复，合并时跳过；收入配置不覆盖现有。

---

## 错误响应

```json
{ "detail": "错误描述" }
```

常见状态码：400（参数错误）、401（对接码无效/缺失）、404（不存在）、422（校验失败）、500（服务器错误）。

422 校验失败常见场景：名称全空格 / 超长、日期格式非法（须 `YYYY-MM-DD`）、收入配置月份非法（须 `YYYY-MM`）、负时长 / 负收入、**完成日期晚于今天**、月薪任务携带收入字段（`extra="forbid"`）、无效工作类型或状态。
