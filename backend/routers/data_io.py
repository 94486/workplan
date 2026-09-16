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
# 导入时识别的类型别名（缺失时默认常规；明确写了但无法识别则视为无效行，避免静默归类错误）
TYPE_MAP = {
    "常规工作": "regular", "其他工作": "other",
    "regular": "regular", "other": "other",
    "日常工作": "regular", "常规": "regular", "daily": "regular", "routine": "regular",
    "临时工作": "other", "兼职": "other", "other_work": "other", "extra": "other",
}
STATUS_LABEL = {"pending": "待完成", "done": "已完成"}
# 导入时识别的状态别名（缺失时默认待完成；明确写了但无法识别则视为无效行）
STATUS_MAP = {
    "待完成": "pending", "已完成": "done",
    "pending": "pending", "done": "done",
    "未完成": "pending", "进行中": "pending", "in_progress": "pending",
    "completed": "done", "finished": "done", "complete": "done",
}

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

    # 导出预设（日薪）
    presets = db.query_all("SELECT id, name, work_type, duration_hours, expected_income, notes, created_at FROM presets ORDER BY id")
    # 导出月薪数据（如有）
    try:
        monthly_works = db.query_all("SELECT id, name, work_type, duration_hours, planned_date, status, actual_duration_hours, completed_date, notes, created_at FROM monthly_works ORDER BY planned_date ASC, id ASC")
    except Exception:
        monthly_works = []
    try:
        monthly_presets = db.query_all("SELECT id, name, work_type, duration_hours, notes, created_at FROM monthly_presets ORDER BY id")
    except Exception:
        monthly_presets = []
    try:
        monthly_settings = db.query_all("SELECT month_key, regular_income, other_income, updated_at FROM monthly_settings ORDER BY month_key")
    except Exception:
        monthly_settings = []

    payload = {
        "app": "WorkDashboard",
        "version": 2,
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
        "presets": [
            {
                "name": p["name"], "work_type": p["work_type"],
                "duration_hours": float(p["duration_hours"] or 0),
                "expected_income": float(p["expected_income"] or 0),
                "notes": p["notes"] or "",
            }
            for p in presets
        ],
        "monthly_works": [
            {
                "name": w["name"], "work_type": w["work_type"],
                "duration_hours": float(w["duration_hours"] or 0),
                "planned_date": w["planned_date"], "status": w["status"],
                "actual_duration_hours": float(w["actual_duration_hours"]) if w["actual_duration_hours"] is not None else None,
                "completed_date": w["completed_date"], "notes": w["notes"] or "",
            }
            for w in monthly_works
        ],
        "monthly_presets": [
            {
                "name": p["name"], "work_type": p["work_type"],
                "duration_hours": float(p["duration_hours"] or 0), "notes": p["notes"] or "",
            }
            for p in monthly_presets
        ],
        "monthly_settings": [
            {
                "month_key": st["month_key"],
                "regular_income": float(st["regular_income"] or 0),
                "other_income": float(st["other_income"] or 0),
            }
            for st in monthly_settings
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

    返回 None 表示该行无效（缺名称、计划日期非法、或类型/状态明确写了但无法识别）。
    """
    name = _norm_str(raw.get("name"))
    if not name:
        return None
    planned = _norm_date(raw.get("planned_date"))
    if not planned:
        return None

    # 类型/状态：字段缺失时用安全默认；明确写了但无法识别 → 无效行（避免静默归类错误）
    wt_raw = _norm_str(raw.get("work_type"))
    work_type = TYPE_MAP.get(wt_raw) if wt_raw else "regular"
    if work_type is None:
        return None
    st_raw = _norm_str(raw.get("status"))
    status = STATUS_MAP.get(st_raw) if st_raw else "pending"
    if status is None:
        return None

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


def _parse_json_text(text: str) -> dict:
    """解析 JSON 文本，返回完整结构。

    兼容旧版（只有 works 数组）和新版（含 presets/monthly_*）。
    返回 {"works": [...], "presets": [...], "monthly_works": [...], ...}
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON 解析失败：文件不是合法的 JSON")
    if isinstance(data, list):
        # 旧版纯数组格式
        return {"works": data, "presets": [], "monthly_works": [], "monthly_presets": [], "monthly_settings": []}
    if isinstance(data, dict):
        return {
            "works": data.get("works", []) or [],
            "presets": data.get("presets", []) or [],
            "monthly_works": data.get("monthly_works", []) or [],
            "monthly_presets": data.get("monthly_presets", []) or [],
            "monthly_settings": data.get("monthly_settings", []) or [],
        }
    raise HTTPException(status_code=400, detail="JSON 结构不支持：应为工作数组或包含 works 字段的对象")


def _normalize_all(parsed: dict) -> dict:
    """把解析后的结构规整为可入库的记录集合（供文件导入与数据对接共用）。

    返回: raw_rows / records / preset_records / monthly_records /
         monthly_preset_records / monthly_setting_records / invalid
    """
    raw_rows = parsed.get("works", [])
    records = []
    invalid = 0
    for raw in raw_rows:
        rec = _normalize_row(raw)
        if rec is None:
            invalid += 1
        else:
            records.append(rec)

    # 规整预设（日薪）
    preset_records = []
    for raw in parsed.get("presets", []):
        name = _norm_str(raw.get("name"))
        if not name:
            continue
        wt_raw = _norm_str(raw.get("work_type"))
        wt = TYPE_MAP.get(wt_raw) if wt_raw else "regular"
        if wt is None:
            continue
        preset_records.append({
            "name": name[:100],
            "work_type": wt,
            "duration_hours": max(0.0, _norm_num(raw.get("duration_hours"))),
            "expected_income": max(0.0, _norm_num(raw.get("expected_income"))),
            "notes": _norm_str(raw.get("notes"))[:2000],
        })

    # 规整月薪任务
    monthly_records = []
    for raw in parsed.get("monthly_works", []):
        name = _norm_str(raw.get("name"))
        planned = _norm_date(raw.get("planned_date"))
        if not name or not planned:
            continue
        wt_raw = _norm_str(raw.get("work_type"))
        wt = TYPE_MAP.get(wt_raw) if wt_raw else "regular"
        if wt is None:
            continue
        st_raw = _norm_str(raw.get("status"))
        st = STATUS_MAP.get(st_raw) if st_raw else "pending"
        if st is None:
            continue
        dur = max(0.0, _norm_num(raw.get("duration_hours")))
        if st == "done":
            completed = _norm_date(raw.get("completed_date")) or planned
            actual_dur = raw.get("actual_duration_hours")
            actual_dur = float(actual_dur) if actual_dur is not None and _norm_str(actual_dur) != "" else dur
        else:
            completed = None
            actual_dur = None
        monthly_records.append({
            "name": name[:100], "work_type": wt, "duration_hours": dur,
            "planned_date": planned, "status": st,
            "actual_duration_hours": actual_dur, "completed_date": completed,
            "notes": _norm_str(raw.get("notes"))[:2000],
        })

    # 规整月薪预设
    monthly_preset_records = []
    for raw in parsed.get("monthly_presets", []):
        name = _norm_str(raw.get("name"))
        if not name:
            continue
        wt_raw = _norm_str(raw.get("work_type"))
        wt = TYPE_MAP.get(wt_raw) if wt_raw else "regular"
        if wt is None:
            continue
        monthly_preset_records.append({
            "name": name[:100],
            "work_type": wt,
            "duration_hours": max(0.0, _norm_num(raw.get("duration_hours"))),
            "notes": _norm_str(raw.get("notes"))[:2000],
        })

    # 月薪收入配置
    monthly_setting_records = []
    for raw in parsed.get("monthly_settings", []):
        mk = _norm_str(raw.get("month_key"))
        if not mk:
            continue
        monthly_setting_records.append({
            "month_key": mk,
            "regular_income": max(0.0, _norm_num(raw.get("regular_income"))),
            "other_income": max(0.0, _norm_num(raw.get("other_income"))),
        })

    return {
        "raw_rows": raw_rows,
        "records": records,
        "preset_records": preset_records,
        "monthly_records": monthly_records,
        "monthly_preset_records": monthly_preset_records,
        "monthly_setting_records": monthly_setting_records,
        "invalid": invalid,
    }


def _make_inserts(conn, now: str):
    """返回各表的插入函数闭包（data_io 与数据对接共用）。"""
    def _insert_work(rec):
        conn.execute(
            """INSERT INTO works
               (name, work_type, duration_hours, planned_date, expected_income, notes,
                status, actual_duration_hours, completed_date, actual_income, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (rec["name"], rec["work_type"], rec["duration_hours"], rec["planned_date"],
             rec["expected_income"], rec["notes"], rec["status"],
             rec["actual_duration_hours"], rec["completed_date"], rec["actual_income"], now, now),
        )

    def _insert_preset(rec):
        conn.execute(
            """INSERT INTO presets (name, work_type, duration_hours, expected_income, notes, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?)""",
            (rec["name"], rec["work_type"], rec["duration_hours"], rec["expected_income"], rec["notes"], now, now),
        )

    def _insert_monthly_work(rec):
        conn.execute(
            """INSERT INTO monthly_works
               (name, work_type, duration_hours, planned_date, status,
                actual_duration_hours, completed_date, notes, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (rec["name"], rec["work_type"], rec["duration_hours"], rec["planned_date"],
             rec["status"], rec["actual_duration_hours"], rec["completed_date"], rec["notes"], now, now),
        )

    def _insert_monthly_preset(rec):
        conn.execute(
            """INSERT INTO monthly_presets (name, work_type, duration_hours, notes, created_at, updated_at)
               VALUES (?,?,?,?,?,?)""",
            (rec["name"], rec["work_type"], rec["duration_hours"], rec["notes"], now, now),
        )

    def _upsert_monthly_setting(rec):
        # monthly_settings 是单行表（id=1 约束），存储当前月度收入配置
        conn.execute(
            """INSERT INTO monthly_settings (id, month_key, regular_income, other_income, updated_at)
               VALUES (1, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 month_key=excluded.month_key,
                 regular_income=excluded.regular_income,
                 other_income=excluded.other_income,
                 updated_at=excluded.updated_at""",
            (rec["month_key"], rec["regular_income"], rec["other_income"], now),
        )

    return {
        "work": _insert_work, "preset": _insert_preset,
        "monthly_work": _insert_monthly_work, "monthly_preset": _insert_monthly_preset,
        "monthly_setting": _upsert_monthly_setting,
    }


def _replace_into_db(conn, norm: dict) -> dict:
    """覆盖模式：清空五表后全量写入。返回各表写入条数（含 daily/monthly 归属明细）。"""
    now = db.now_str()
    ins = _make_inserts(conn, now)
    for tbl in ("works", "presets", "monthly_works", "monthly_presets", "monthly_settings"):
        try:
            conn.execute(f"DELETE FROM {tbl}")
        except Exception:
            pass  # 旧版数据库可能没有月薪表，忽略
    daily_works = daily_presets = monthly_works = monthly_presets = settings = 0
    for rec in norm["records"]:
        ins["work"](rec); daily_works += 1
    for rec in norm["preset_records"]:
        ins["preset"](rec); daily_presets += 1
    for rec in norm["monthly_records"]:
        ins["monthly_work"](rec); monthly_works += 1
    for rec in norm["monthly_preset_records"]:
        ins["monthly_preset"](rec); monthly_presets += 1
    for rec in norm["monthly_setting_records"]:
        ins["monthly_setting"](rec); settings += 1
    inserted = daily_works + daily_presets + monthly_works + monthly_presets + settings
    return {
        "inserted": inserted, "skipped": 0,
        "daily_works": daily_works, "daily_presets": daily_presets,
        "monthly_works": monthly_works, "monthly_presets": monthly_presets,
        "settings": settings,
    }


def _merge_into_db(conn, norm: dict) -> dict:
    """合并模式：各类数据分别按判重键去重后追加。返回 {"inserted": n, "skipped": n}。"""
    now = db.now_str()
    ins = _make_inserts(conn, now)
    existing_works = {
        (r["name"], r["work_type"], r["planned_date"])
        for r in conn.execute("SELECT name, work_type, planned_date FROM works").fetchall()
    }
    existing_presets = {
        (r["name"], r["work_type"])
        for r in conn.execute("SELECT name, work_type FROM presets").fetchall()
    }
    try:
        existing_mworks = {
            (r["name"], r["work_type"], r["planned_date"])
            for r in conn.execute("SELECT name, work_type, planned_date FROM monthly_works").fetchall()
        }
        existing_mpresets = {
            (r["name"], r["work_type"])
            for r in conn.execute("SELECT name, work_type FROM monthly_presets").fetchall()
        }
    except Exception:
        existing_mworks = set()
        existing_mpresets = set()

    daily_works = daily_presets = monthly_works = monthly_presets = settings = 0
    for rec in norm["records"]:
        key = (rec["name"], rec["work_type"], rec["planned_date"])
        if key in existing_works:
            continue
        existing_works.add(key)
        ins["work"](rec); daily_works += 1
    for rec in norm["preset_records"]:
        key = (rec["name"], rec["work_type"])
        if key in existing_presets:
            continue
        existing_presets.add(key)
        ins["preset"](rec); daily_presets += 1
    for rec in norm["monthly_records"]:
        key = (rec["name"], rec["work_type"], rec["planned_date"])
        if key in existing_mworks:
            continue
        existing_mworks.add(key)
        ins["monthly_work"](rec); monthly_works += 1
    for rec in norm["monthly_preset_records"]:
        key = (rec["name"], rec["work_type"])
        if key in existing_mpresets:
            continue
        existing_mpresets.add(key)
        ins["monthly_preset"](rec); monthly_presets += 1
    # 收入配置：merge 模式仅在库中尚无配置时才写入，绝不覆盖现有配置
    try:
        has_setting = conn.execute("SELECT 1 FROM monthly_settings WHERE id=1").fetchone() is not None
    except Exception:
        has_setting = False
    for rec in norm["monthly_setting_records"]:
        if has_setting:
            continue
        ins["monthly_setting"](rec)
        settings += 1
        has_setting = True
    total_processed = (len(norm["records"]) + len(norm["preset_records"]) + len(norm["monthly_records"])
                       + len(norm["monthly_preset_records"]) + len(norm["monthly_setting_records"]))
    inserted = daily_works + daily_presets + monthly_works + monthly_presets + settings
    skipped = max(0, total_processed - inserted)
    return {
        "inserted": inserted, "skipped": skipped,
        "daily_works": daily_works, "daily_presets": daily_presets,
        "monthly_works": monthly_works, "monthly_presets": monthly_presets,
        "settings": settings,
    }


def _summary_msg(prefix: str, m: dict, invalid: int) -> str:
    """生成带日薪/月薪归属明细的提示消息。"""
    parts = []
    if m.get("daily_works"): parts.append(f"日薪工作 {m['daily_works']} 条")
    if m.get("monthly_works"): parts.append(f"月薪任务 {m['monthly_works']} 条")
    if m.get("daily_presets"): parts.append(f"日薪预设 {m['daily_presets']} 条")
    if m.get("monthly_presets"): parts.append(f"月薪预设 {m['monthly_presets']} 条")
    if m.get("settings"): parts.append(f"收入配置 {m['settings']} 条")
    total = m.get("inserted", 0)
    msg = f"{prefix} {total} 条（{'、'.join(parts) if parts else '无新增'}）"
    if m.get("skipped"): msg += f"，跳过重复 {m['skipped']} 条"
    if invalid: msg += f"，无效 {invalid} 条（缺名称/日期非法/类型或状态无法识别）"
    return msg


def _summary_fields(m: dict) -> dict:
    """把合并/覆盖结果中的归属明细字段抽出（供接口返回）。"""
    return {
        "daily_works": m.get("daily_works", 0),
        "daily_presets": m.get("daily_presets", 0),
        "monthly_works": m.get("monthly_works", 0),
        "monthly_presets": m.get("monthly_presets", 0),
        "settings": m.get("settings", 0),
    }


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
        parsed = {"works": _parse_csv_text(text), "presets": [], "monthly_works": [], "monthly_presets": [], "monthly_settings": []}
    elif filename.endswith(".json"):
        parsed = _parse_json_text(text)
    else:
        raise HTTPException(status_code=400, detail="仅支持 .json 或 .csv 文件")

    norm = _normalize_all(parsed)
    invalid = norm["invalid"]

    conn = db.get_conn()
    try:
        if mode == "replace":
            result = _replace_into_db(conn, norm)
            conn.commit()
            return {
                "mode": "replace",
                "total_in_file": len(norm["raw_rows"]),
                "imported": result["inserted"],
                "skipped": 0,
                "invalid": invalid,
                **_summary_fields(result),
                "message": _summary_msg("覆盖导入完成：清空原有数据，写入", result, invalid),
            }

        # merge
        merged = _merge_into_db(conn, norm)
        conn.commit()
        return {
            "mode": "merge",
            "total_in_file": len(norm["raw_rows"]),
            "imported": merged["inserted"],
            "skipped": merged["skipped"],
            "invalid": invalid,
            **_summary_fields(merged),
            "message": _summary_msg("合并导入完成：新增", merged, invalid),
        }
    finally:
        conn.close()
