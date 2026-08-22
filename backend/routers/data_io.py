"""数据导入导出 API：备份 / 迁移 / 批量录入。

- GET  /api/data/export?format=json|csv —— 导出全部工作为 JSON / CSV 文件下载。
- POST /api/data/import                 —— 上传 JSON / CSV 文件导入，支持两种模式：
    * mode=merge   合并导入：跳过与现有数据重复（同名称+类型+计划日期）的条目；
    * mode=replace 覆盖导入：清空现有数据后全量写入（导入前请先导出备份）。

CSV 兼容 Excel：导出带 UTF-8 BOM，表头使用中文名称；导入时中英文表头均可识别。
"""

import csv
import io
import json
import urllib.parse
from datetime import date, datetime

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response

from backend import database as db

router = APIRouter(prefix="/api/data", tags=["data"])

WORK_COLS = (
    "id,name,work_type,duration_hours,planned_date,expected_income,notes,"
    "status,actual_duration_hours,completed_date,actual_income,created_at,updated_at"
)

# CSV 列顺序（中文表头，导出/导入共用）
CSV_HEADERS = [
    "工作名称", "类型", "状态", "计划日期", "花费时长(小时)", "预期收入(元)",
    "完成日期", "实际时长(小时)", "实际收入(元)", "备注",
]

TYPE_LABEL = {"regular": "常规工作", "other": "其他工作"}
TYPE_MAP = {"常规工作": "regular", "其他工作": "other", "regular": "regular", "other": "other"}
STATUS_LABEL = {"pending": "待完成", "done": "已完成"}
STATUS_MAP = {"待完成": "pending", "已完成": "done", "pending": "pending", "done": "done"}

# 导入时可识别的表头别名（中文列名 -> 标准字段）
HEADER_ALIASES = {
    "工作名称": "name", "名称": "name", "name": "name",
    "类型": "work_type", "工作类型": "work_type", "work_type": "work_type",
    "状态": "status", "status": "status",
    "计划日期": "planned_date", "计划完成日期": "planned_date", "planned_date": "planned_date",
    "花费时长(小时)": "duration_hours", "花费时长": "duration_hours",
    "计划时长(小时)": "duration_hours", "duration_hours": "duration_hours",
    "预期收入(元)": "expected_income", "预期收入": "expected_income", "expected_income": "expected_income",
    "完成日期": "completed_date", "completed_date": "completed_date",
    "实际时长(小时)": "actual_duration_hours", "实际时长": "actual_duration_hours",
    "实际花费时长(小时)": "actual_duration_hours", "actual_duration_hours": "actual_duration_hours",
    "实际收入(元)": "actual_income", "实际收入": "actual_income", "actual_income": "actual_income",
    "备注": "notes", "notes": "notes",
}


def _fetch_all() -> list[dict]:
    return db.query_all(f"SELECT {WORK_COLS} FROM works ORDER BY planned_date ASC, id ASC")


def _download_filename(name: str) -> str:
    """Content-Disposition 中的中文文件名（RFC 5987）。"""
    return f"attachment; filename=works_backup; filename*=UTF-8''{urllib.parse.quote(name)}"


# ============================================================
# 导出
# ============================================================

@router.get("/export")
def export_data(format: str = Query("json", pattern="^(json|csv)$", description="导出格式")):
    """导出全部工作数据（文件下载）。"""
    rows = _fetch_all()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format == "csv":
        buf = io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM：保证 Excel 直接打开不乱码
        writer = csv.writer(buf)
        writer.writerow(CSV_HEADERS)
        for r in rows:
            writer.writerow([
                r["name"],
                TYPE_LABEL.get(r["work_type"], r["work_type"]),
                STATUS_LABEL.get(r["status"], r["status"]),
                r["planned_date"],
                r["duration_hours"] or 0,
                r["expected_income"] or 0,
                r["completed_date"] or "",
                r["actual_duration_hours"] if r["actual_duration_hours"] is not None else "",
                r["actual_income"] if r["actual_income"] is not None else "",
                r["notes"] or "",
            ])
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": _download_filename(f"工作数据_{stamp}.csv")},
        )

    payload = {
        "app": "WorkDashboard",
        "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "count": len(rows),
        "works": [
            {
                "name": r["name"],
                "work_type": r["work_type"],
                "duration_hours": float(r["duration_hours"] or 0),
                "planned_date": r["planned_date"],
                "expected_income": float(r["expected_income"] or 0),
                "notes": r["notes"] or "",
                "status": r["status"],
                "actual_duration_hours": float(r["actual_duration_hours"]) if r["actual_duration_hours"] is not None else None,
                "completed_date": r["completed_date"],
                "actual_income": float(r["actual_income"]) if r["actual_income"] is not None else None,
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ],
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": _download_filename(f"工作数据_{stamp}.json")},
    )


# ============================================================
# 导入
# ============================================================

def _norm_str(v) -> str:
    return str(v).strip() if v is not None else ""


def _norm_num(v) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _norm_date(v) -> str | None:
    s = _norm_str(v)
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return None


def _normalize_row(raw: dict) -> dict | None:
    """把一行原始数据（JSON dict / CSV 表头映射后的 dict）规整为可入库的记录。

    返回 None 表示该行无效（缺名称或计划日期非法）。
    """
    name = _norm_str(raw.get("name"))
    if not name:
        return None
    planned = _norm_date(raw.get("planned_date"))
    if not planned:
        return None

    work_type = TYPE_MAP.get(_norm_str(raw.get("work_type")), "regular")
    status = STATUS_MAP.get(_norm_str(raw.get("status")), "pending")

    def opt_num(key):
        v = raw.get(key)
        return None if v is None or _norm_str(v) == "" else _norm_num(v)

    duration = max(0.0, _norm_num(raw.get("duration_hours")))
    expected = max(0.0, _norm_num(raw.get("expected_income")))

    if status == "done":
        # 已完成工作归一化：缺完成日期/实际值时回退到计划值，
        # 避免导入后从统计报表（按 completed_date 汇总）和看板中消失。
        completed = _norm_date(raw.get("completed_date")) or planned
        actual_dur = opt_num("actual_duration_hours")
        if actual_dur is None:
            actual_dur = duration
        actual_income = opt_num("actual_income")
        if actual_income is None:
            actual_income = expected
    else:
        completed = None
        actual_dur = None
        actual_income = None

    return {
        "name": name[:100],
        "work_type": work_type,
        "duration_hours": duration,
        "planned_date": planned,
        "expected_income": expected,
        "notes": _norm_str(raw.get("notes"))[:2000],
        "status": status,
        "actual_duration_hours": actual_dur,
        "completed_date": completed,
        "actual_income": actual_income,
    }


def _parse_csv_text(text: str) -> list[dict]:
    """解析 CSV 文本：中/英文表头均可识别，返回原始行 dict 列表。"""
    if text.startswith("\ufeff"):
        text = text[1:]
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        return []
    keys = [HEADER_ALIASES.get(h.strip(), "") for h in header]
    if "name" not in keys or "planned_date" not in keys:
        raise HTTPException(status_code=400, detail="CSV 表头无法识别：请确保包含「工作名称」和「计划日期」列（建议使用本系统导出的模板）")
    rows = []
    for i, values in enumerate(reader, start=2):
        if not values or all(str(v).strip() == "" for v in values):
            continue
        raw = {k: v for k, v in zip(keys, values) if k}
        raw["_line"] = i
        rows.append(raw)
    return rows


def _parse_json_text(text: str) -> list[dict]:
    """解析 JSON 文本：支持数组或 {"works": [...]} 结构。"""
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON 解析失败：文件不是合法的 JSON")
    if isinstance(data, dict):
        data = data.get("works", [])
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="JSON 结构不支持：应为工作数组或 {\"works\": [...]}")
    return data


@router.post("/import")
async def import_data(
    file: UploadFile = File(..., description="导入文件（.json 或 .csv）"),
    mode: str = Form("merge", pattern="^(merge|replace)$", description="merge=合并导入 / replace=覆盖导入"),
):
    """导入数据文件。

    - JSON：支持本系统导出的备份文件（对象或数组均可）；
    - CSV：支持本系统导出的模板（中文表头），中英文表头均可识别；
    - merge 模式跳过重复条目（名称+类型+计划日期均相同视为重复）；
    - replace 模式先清空现有数据再写入，导入前建议先导出备份。
    """
    filename = (file.filename or "").lower()
    raw_bytes = await file.read()
    if len(raw_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大（超过 10MB），请分批导入")
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw_bytes.decode("gbk")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="文件编码无法识别：请使用 UTF-8 编码的文件")

    if filename.endswith(".csv"):
        raw_rows = _parse_csv_text(text)
    elif filename.endswith(".json"):
        raw_rows = _parse_json_text(text)
    else:
        raise HTTPException(status_code=400, detail="仅支持 .json 或 .csv 文件")

    records = []
    invalid = 0
    for raw in raw_rows:
        rec = _normalize_row(raw)
        if rec is None:
            invalid += 1
        else:
            records.append(rec)

    now = db.now_str()
    conn = db.get_conn()
    try:
        if mode == "replace":
            conn.execute("DELETE FROM works")
            inserted = 0
            for rec in records:
                conn.execute(
                    """INSERT INTO works
                       (name, work_type, duration_hours, planned_date, expected_income, notes,
                        status, actual_duration_hours, completed_date, actual_income, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (rec["name"], rec["work_type"], rec["duration_hours"], rec["planned_date"],
                     rec["expected_income"], rec["notes"], rec["status"],
                     rec["actual_duration_hours"], rec["completed_date"], rec["actual_income"], now, now),
                )
                inserted += 1
            conn.commit()
            return {
                "mode": "replace",
                "total_in_file": len(raw_rows),
                "imported": inserted,
                "skipped": 0,
                "invalid": invalid,
                "message": f"覆盖导入完成：清空原有数据，写入 {inserted} 条"
                           + (f"，跳过无效行 {invalid} 条" if invalid else ""),
            }

        # merge：跳过重复（名称 + 类型 + 计划日期相同）
        existing = {
            (r["name"], r["work_type"], r["planned_date"])
            for r in conn.execute("SELECT name, work_type, planned_date FROM works").fetchall()
        }
        inserted = 0
        for rec in records:
            key = (rec["name"], rec["work_type"], rec["planned_date"])
            if key in existing:
                continue
            existing.add(key)
            conn.execute(
                """INSERT INTO works
                   (name, work_type, duration_hours, planned_date, expected_income, notes,
                    status, actual_duration_hours, completed_date, actual_income, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (rec["name"], rec["work_type"], rec["duration_hours"], rec["planned_date"],
                 rec["expected_income"], rec["notes"], rec["status"],
                 rec["actual_duration_hours"], rec["completed_date"], rec["actual_income"], now, now),
            )
            inserted += 1
        conn.commit()
        skipped = len(records) - inserted
        return {
            "mode": "merge",
            "total_in_file": len(raw_rows),
            "imported": inserted,
            "skipped": skipped,
            "invalid": invalid,
            "message": f"合并导入完成：新增 {inserted} 条"
                       + (f"，跳过重复 {skipped} 条" if skipped else "")
                       + (f"，无效行 {invalid} 条" if invalid else ""),
        }
    finally:
        conn.close()
