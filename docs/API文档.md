# API 文档

Base URL：`http://127.0.0.1:8000`（可通过环境变量 `PORT` 修改）

交互式文档：启动后访问 `/docs`（Swagger UI）或 `/redoc`。

---

## 通用说明

- 请求/响应均为 JSON，编码 `UTF-8`。
- 日期格式统一为 `YYYY-MM-DD`。
- 错误响应：`{"detail": "错误信息"}`，HTTP 状态码 400/404 等。
- 金额单位：元；时长单位：小时（支持小数，如 1.5）。

---

## 1. 查询工作列表

`GET /api/works`

Query 参数（均可选）：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| status | string | `pending` / `done` |
| work_type | string | `regular` / `other` |
| date_from | string | 计划日期 ≥ 该日期 |
| date_to | string | 计划日期 ≤ 该日期 |

响应示例：

```json
[
  {
    "id": 1,
    "name": "客户方案设计",
    "work_type": "regular",
    "duration_hours": 6.0,
    "planned_date": "2026-08-21",
    "expected_income": 3000.0,
    "notes": "含架构与原型",
    "status": "done",
    "actual_duration_hours": 5.5,
    "completed_date": "2026-08-21",
    "actual_income": 3000.0,
    "created_at": "2026-08-21 11:00:00",
    "updated_at": "2026-08-21 11:00:00"
  }
]
```

---

## 2. 新建工作

`POST /api/works`

请求体：

```json
{
  "name": "代码评审",
  "work_type": "regular",
  "duration_hours": 2.0,
  "planned_date": "2026-08-22",
  "expected_income": 800,
  "notes": "评审 3 个 PR"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| name | ✅ | 1-100 字符 |
| work_type | 否 | 默认 `regular`，仅 `regular`/`other` |
| duration_hours | 否 | ≥ 0，默认 0 |
| planned_date | ✅ | 合法日期 |
| expected_income | 否 | ≥ 0，默认 0 |
| notes | 否 | ≤ 2000 字符 |

响应：201，返回完整工作对象（`status="pending"`）。

---

## 3. 编辑工作

`PUT /api/works/{id}`

请求体：与新建相同，但**所有字段可选**（传哪些改哪些，`model_dump(exclude_unset=True)`）。

```json
{ "duration_hours": 3.0, "notes": "更新后的备注" }
```

响应：200，返回更新后的完整对象。

> 说明：已完成的工作也可调用本接口修改基础字段；实际字段（实际时长/完成日期/实际收入）请使用「标记完成」接口回填。

---

## 4. 删除工作

`DELETE /api/works/{id}`

响应：204，无内容。不存在时返回 404。

---

## 5. 标记完成

`POST /api/works/{id}/complete`

请求体（均可选，未传自动回退）：

```json
{
  "actual_duration_hours": 5.0,
  "completed_date": "2026-08-21",
  "actual_income": 2800
}
```

回退规则（按优先级依次回退）：

| 字段 | ① 本次传入 | ② 已有实际值* | ③ 最终回退 |
| --- | --- | --- | --- |
| actual_duration_hours | actual_duration_hours | actual_duration_hours | 计划时长 duration_hours |
| completed_date | completed_date | completed_date | 今天 |
| actual_income | actual_income | actual_income | 预期收入 expected_income |

\* 「已有实际值」仅对该工作已是 `done` 状态时生效——重复调用本接口（如仅修改完成日期）不会把已填写的实际数据覆盖回计划值。

响应：200，返回更新后的对象（`status="done"`，实际字段已回填）。

> 提示：修改完成日期后，统计报表（每周/每日趋势）会自动把该工作的工时与收入归入新日期所在的周/日。

---

## 6. 重新打开

`POST /api/works/{id}/reopen`

恢复为 `pending` 并清空 `actual_duration_hours` / `completed_date` / `actual_income`。

响应：200，返回更新后的对象。

---

## 7. 工时收入统计摘要

`GET /api/stats/summary`

响应：

```json
{
  "groups": [
    {
      "type": "regular",
      "label": "常规工作",
      "hours": 6.5,
      "income": 3000.0,
      "count": 2,
      "hourly_rate": 461.54
    },
    {
      "type": "other",
      "label": "其他工作",
      "hours": 0.0,
      "income": 0.0,
      "count": 0,
      "hourly_rate": 0.0
    }
  ],
  "totals": {
    "hours": 6.5,
    "income": 3000.0,
    "count": 2,
    "hourly_rate": 461.54
  },
  "counts": { "pending": 5, "done": 2 },
  "generated_at": "2026-08-21 11:00:00"
}
```

> 口径：仅统计 `status='done'` 的工作，工时=SUM(actual_duration_hours)、收入=SUM(actual_income)、小时均收入=收入/工时。

---

## 8. 每日完成统计

`GET /api/stats/daily?days=14`

参数：`days`，7-90，默认 14。

> 注：当前前端统计页已移除「近 14 天每日趋势」图，该接口保留供 API 调用方 / 二次开发使用。

响应（从 N 天前到今天，每日一条，缺失日期补 0）：

```json
[
  { "date": "2026-08-08", "hours": 0.0, "income": 0.0 },
  { "date": "2026-08-21", "hours": 5.5, "income": 3000.0 }
]
```

---

## 9. 每周完成统计

`GET /api/stats/weekly`

响应（近 8 周，每周一条）：

```json
[
  { "week_start": "2026-06-29", "label": "6/29", "hours": 12.0, "income": 4000.0 }
]
```

> 口径：按 `completed_date`（完成日期）归属到所在自然周（周一为一周起点）。修改完成日期后，工时与收入自动迁移到新日期所在周。

---

## 10. 健康检查

`GET /api/health`

```json
{ "status": "ok", "db": "D:\\...\\data\\works.db" }
```

---

## 11. 数据导出

`GET /api/data/export?format=json|csv`

导出全部工作数据为备份文件（浏览器直接下载）。

Query 参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| format | string | `json`（默认）/ `csv` |

说明：

- JSON：结构化完整备份，适合恢复与迁移；
- CSV：带 UTF-8 BOM，Excel 可直接打开；表头为中文（工作名称/类型/状态/计划日期/花费时长(小时)/预期收入(元)/完成日期/实际时长(小时)/实际收入(元)/备注）；
- 响应头 `Content-Disposition` 携带中文文件名，如 `工作数据_20260821_224105.json`。

---

## 12. 数据导入

`POST /api/data/import`（`multipart/form-data`）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| file | file | `.json` 或 `.csv` 文件（≤10MB，UTF-8 / GBK 编码均可） |
| mode | string | `merge`（默认，合并导入，跳过重复）/ `replace`（覆盖导入，先清空现有数据） |

导入规则：

- JSON 支持本系统导出的备份文件（对象或数组均可）；
- CSV 中英文表头均可识别（建议使用本系统导出的模板）；
- 重复判定：名称 + 类型 + 计划日期均相同视为重复（仅 merge 模式生效）；
- 缺少名称或计划日期非法的行为无效行，自动跳过并计数；
- 已完成工作的归一化：缺完成日期回退为计划日期，缺实际时长/实际收入回退为计划值，确保导入后能正常计入统计报表与看板。

响应示例：

```json
{
  "mode": "merge",
  "total_in_file": 8,
  "imported": 3,
  "skipped": 5,
  "invalid": 0,
  "message": "合并导入完成：新增 3 条，跳过重复 5 条"
}
```
