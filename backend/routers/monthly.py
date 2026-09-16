"""月薪模式 API：任务 / 预设 / 收入配置 / 统计。

月薪模式与日薪模式（works / presets）完全隔离：
- 任务表 monthly_works：无每日收入字段（收入按月整体核算）；
- 预设表 monthly_presets：无收入字段；
- 收入配置 monthly_settings（单行 id=1）：上月常规收入 + 上月其它收入；
- 统计聚焦「工时与任务执行」，收入为配置的月度参考值。
"""

from datetime import date, timedelta
from fastapi import APIRouter, HTTPException, Query

from backend import database as db
from backend.models import (
    MonthlyWorkCreate, MonthlyWorkUpdate, MonthlyWorkComplete,
    MonthlyPresetCreate, MonthlyPresetUpdate, MonthlySettingsUpdate,
)

router = APIRouter(prefix="/api/monthly", tags=["monthly"])

WORK_COLS = (
    "id,name,work_type,duration_hours,planned_date,notes,"
    "status,actual_duration_hours,completed_date,created_at,updated_at"
)
PRESET_COLS = "id,name,work_type,duration_hours,notes,created_at,updated_at"
TYPES = [("regular", "常规工作"), ("other", "其他工作")]


def _work_to_dict(row: dict) -> dict:
    """统一输出月薪任务字段。为兼容前端通用渲染，补齐 income 字段（恒为 0）。"""
    return {
        "id": row["id"],
        "name": row["name"],
        "work_type": row["work_type"],
        "duration_hours": float(row["duration_hours"] or 0),
        "planned_date": row["planned_date"],
        "expected_income": 0.0,
        "notes": row["notes"] or "",
        "status": row["status"],
        "actual_duration_hours": float(row["actual_duration_hours"]) if row["actual_duration_hours"] is not None else None,
        "completed_date": row["completed_date"],
        "actual_income": 0.0,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _preset_to_dict(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "work_type": row["work_type"],
        "duration_hours": float(row["duration_hours"] or 0),
        "expected_income": 0.0,
        "notes": row["notes"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _get_work_or_404(work_id: int) -> dict:
    row = db.query_one("SELECT * FROM monthly_works WHERE id=?", (work_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"月薪任务 #{work_id} 不存在")
    return row


def _get_preset_or_404(preset_id: int) -> dict:
    row = db.query_one("SELECT * FROM monthly_presets WHERE id=?", (preset_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"月薪预设 #{preset_id} 不存在")
    return row


# ============================================================
# 月薪任务 CRUD
# ============================================================

@router.get("/works")
def list_works(
    status: str | None = Query(None, pattern="^(pending|done)$", description="按状态过滤"),
    work_type: str | None = Query(None, pattern="^(regular|other)$", description="按类型过滤"),
    date_from: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="计划日期 >= YYYY-MM-DD"),
    date_to: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="计划日期 <= YYYY-MM-DD"),
):
    for _name, _v in (("date_from", date_from), ("date_to", date_to)):
        if _v:
            try:
                date.fromisoformat(_v)
            except ValueError:
                raise HTTPException(status_code=422, detail=f"{_name} 必须是合法日期 YYYY-MM-DD")
    sql = f"SELECT {WORK_COLS} FROM monthly_works WHERE 1=1"
    params: list = []
    if status:
        sql += " AND status=?"
        params.append(status)
    if work_type:
        sql += " AND work_type=?"
        params.append(work_type)
    if date_from:
        sql += " AND planned_date>=?"
        params.append(date_from)
    if date_to:
        sql += " AND planned_date<=?"
        params.append(date_to)
    sql += " ORDER BY planned_date ASC, id DESC"
    return [_work_to_dict(r) for r in db.query_all(sql, tuple(params))]


@router.get("/works/{work_id}")
def get_work(work_id: int):
    return _work_to_dict(_get_work_or_404(work_id))


@router.post("/works", status_code=201)
def create_work(payload: MonthlyWorkCreate):
    now = db.now_str()
    wid = db.execute(
        """INSERT INTO monthly_works
           (name, work_type, duration_hours, planned_date, notes, status, created_at, updated_at)
           VALUES (?,?,?,?,?,'pending',?,?)""",
        (payload.name, payload.work_type, payload.duration_hours,
         payload.planned_date, payload.notes, now, now),
    )
    return _work_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM monthly_works WHERE id=?", (wid,)))


@router.put("/works/{work_id}")
def update_work(work_id: int, payload: MonthlyWorkUpdate):
    row = _get_work_or_404(work_id)
    updates, params = [], []
    data = payload.model_dump(exclude_unset=True)
    for key in ("name", "work_type", "duration_hours", "planned_date", "notes"):
        if key in data:
            updates.append(f"{key}=?")
            params.append(data[key])
    if not updates:
        return _work_to_dict(row)
    params.append(db.now_str())
    params.append(work_id)
    db.execute(f"UPDATE monthly_works SET {', '.join(updates)}, updated_at=? WHERE id=?", tuple(params))
    return _work_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM monthly_works WHERE id=?", (work_id,)))


@router.delete("/works/{work_id}", status_code=204)
def delete_work(work_id: int):
    _get_work_or_404(work_id)
    db.execute("DELETE FROM monthly_works WHERE id=?", (work_id,))


@router.post("/works/{work_id}/complete")
def complete_work(work_id: int, payload: MonthlyWorkComplete):
    row = _get_work_or_404(work_id)
    now = db.now_str()
    today = date.today().isoformat()
    already_done = row["status"] == "done"

    def _fallback(actual_key, plan_value):
        if already_done and row[actual_key] is not None:
            return row[actual_key]
        return plan_value

    actual_dur = payload.actual_duration_hours
    if actual_dur is None:
        actual_dur = _fallback("actual_duration_hours", row["duration_hours"])
    completed = payload.completed_date
    if completed:
        # 完成日期不能晚于今天（防未来完成导致统计口径漂移）
        if date.fromisoformat(completed) > date.today():
            raise HTTPException(status_code=422, detail="完成日期不能晚于今天")
    if not completed:
        completed = _fallback("completed_date", None) or today
    db.execute(
        """UPDATE monthly_works SET status='done',
           actual_duration_hours=?, completed_date=?, updated_at=?
           WHERE id=?""",
        (actual_dur, completed, now, work_id),
    )
    return _work_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM monthly_works WHERE id=?", (work_id,)))


@router.post("/works/{work_id}/reopen")
def reopen_work(work_id: int):
    _get_work_or_404(work_id)
    db.execute(
        """UPDATE monthly_works SET status='pending',
           actual_duration_hours=NULL, completed_date=NULL, updated_at=?
           WHERE id=?""",
        (db.now_str(), work_id),
    )
    return _work_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM monthly_works WHERE id=?", (work_id,)))


# ============================================================
# 月薪预设 CRUD
# ============================================================

@router.get("/presets")
def list_presets(
    work_type: str | None = Query(None, pattern="^(regular|other)$", description="按类型过滤"),
):
    sql = f"SELECT {PRESET_COLS} FROM monthly_presets WHERE 1=1"
    params: list = []
    if work_type:
        sql += " AND work_type=?"
        params.append(work_type)
    sql += " ORDER BY id DESC"
    return [_preset_to_dict(r) for r in db.query_all(sql, tuple(params))]


@router.get("/presets/{preset_id}")
def get_preset(preset_id: int):
    return _preset_to_dict(_get_preset_or_404(preset_id))


@router.post("/presets", status_code=201)
def create_preset(payload: MonthlyPresetCreate):
    now = db.now_str()
    pid = db.execute(
        """INSERT INTO monthly_presets
           (name, work_type, duration_hours, notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?)""",
        (payload.name, payload.work_type, payload.duration_hours, payload.notes, now, now),
    )
    return _preset_to_dict(db.query_one(f"SELECT {PRESET_COLS} FROM monthly_presets WHERE id=?", (pid,)))


@router.put("/presets/{preset_id}")
def update_preset(preset_id: int, payload: MonthlyPresetUpdate):
    row = _get_preset_or_404(preset_id)
    updates, params = [], []
    data = payload.model_dump(exclude_unset=True)
    for key in ("name", "work_type", "duration_hours", "notes"):
        if key in data:
            updates.append(f"{key}=?")
            params.append(data[key])
    if not updates:
        return _preset_to_dict(row)
    params.append(db.now_str())
    params.append(preset_id)
    db.execute(f"UPDATE monthly_presets SET {', '.join(updates)}, updated_at=? WHERE id=?", tuple(params))
    return _preset_to_dict(db.query_one(f"SELECT {PRESET_COLS} FROM monthly_presets WHERE id=?", (preset_id,)))


@router.delete("/presets/{preset_id}", status_code=204)
def delete_preset(preset_id: int):
    _get_preset_or_404(preset_id)
    db.execute("DELETE FROM monthly_presets WHERE id=?", (preset_id,))


# ============================================================
# 月薪收入配置
# ============================================================

def _get_settings() -> dict:
    row = db.query_one("SELECT * FROM monthly_settings WHERE id=1")
    if not row:
        return {"id": 1, "month_key": "", "regular_income": 0.0, "other_income": 0.0}
    return {
        "id": 1,
        "month_key": row["month_key"] or "",
        "regular_income": float(row["regular_income"] or 0),
        "other_income": float(row["other_income"] or 0),
    }


@router.get("/settings")
def get_settings():
    """获取月薪收入配置（上月常规收入 + 上月其它收入）。"""
    s = _get_settings()
    s["total_income"] = round(s["regular_income"] + s["other_income"], 2)
    return s


@router.put("/settings")
def update_settings(payload: MonthlySettingsUpdate):
    """更新月薪收入配置。首次调用自动创建单行记录；未提交字段保留原值（部分更新不清零）。"""
    now = db.now_str()
    data = payload.model_dump(exclude_unset=True)
    # 合并语义：只覆盖显式提交的字段，缺省字段保留现有行值（防止部分更新把未提交字段清零）
    existing = db.query_one("SELECT month_key, regular_income, other_income FROM monthly_settings WHERE id=1")
    month_key = data["month_key"] if "month_key" in data else (existing["month_key"] if existing else "")
    regular = data["regular_income"] if "regular_income" in data else (
        float(existing["regular_income"] or 0) if existing else 0.0)
    other = data["other_income"] if "other_income" in data else (
        float(existing["other_income"] or 0) if existing else 0.0)
    db.execute(
        """INSERT INTO monthly_settings (id, month_key, regular_income, other_income, updated_at)
           VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             month_key=excluded.month_key,
             regular_income=excluded.regular_income,
             other_income=excluded.other_income,
             updated_at=excluded.updated_at""",
        (month_key, regular, other, now),
    )
    return get_settings()


# ============================================================
# 月薪统计（聚焦「上月」完整月度，与月薪收入配置配对核算）
# ============================================================

def _default_month_key() -> str:
    """默认统计月份 = 上月（YYYY-MM）。"""
    today = date.today()
    y, m = today.year, today.month
    if m == 1:
        return f"{y - 1}-12"
    return f"{y}-{m - 1:02d}"


def _period_range(month_key: str) -> tuple[str, str] | None:
    """解析 YYYY-MM → (first_day_iso, last_day_iso)；非法返回 None。"""
    try:
        y, m = month_key.split("-")
        y, m = int(y), int(m)
        if not (1 <= m <= 12):
            return None
        first = date(y, m, 1)
        last = (date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)) - timedelta(days=1)
        return first.isoformat(), last.isoformat()
    except (ValueError, TypeError):
        return None


@router.get("/stats/summary")
def stats_summary():
    """月薪报表（截至上月，非当天）：完成工时 / 完成项 / 收入(配置) / 小时工资=收入/工时。

    统计口径：以收入配置 month_key 对应的完整月份为基准（默认上月）。
    - 收入：来自配置的常规/其它收入（任务本身无收入字段）；
    - 工时 / 完成数：该月内完成任务的 actual_duration_hours 与数量；
    - 待完成：计划日期落在该月且尚未完成的任务。
    """
    settings = _get_settings()
    settings["total_income"] = round(settings["regular_income"] + settings["other_income"], 2)

    month_key = (settings["month_key"] or "").strip()
    rng = _period_range(month_key)
    if not rng:
        month_key = _default_month_key()
        rng = _period_range(month_key)
    first, last = rng
    year, month = int(month_key[:4]), int(month_key[5:7])

    rows = db.query_all(
        """SELECT work_type,
                  SUM(actual_duration_hours) AS hours,
                  COUNT(*)                  AS cnt
           FROM monthly_works
           WHERE status='done' AND completed_date BETWEEN ? AND ?
           GROUP BY work_type""",
        (first, last),
    )
    by_type = {r["work_type"]: r for r in rows}

    pend_rows = db.query_all(
        """SELECT work_type, COUNT(*) AS c
           FROM monthly_works
           WHERE status='pending' AND planned_date BETWEEN ? AND ?
           GROUP BY work_type""",
        (first, last),
    )
    pend_by_type = {r["work_type"]: int(r["c"]) for r in pend_rows}

    totals = {"hours": 0.0, "income": 0.0, "cnt": 0}
    groups = []
    for key, label in TYPES:
        r = by_type.get(key)
        hours = float(r["hours"]) if r and r["hours"] else 0.0
        cnt = int(r["cnt"]) if r else 0
        income = float(settings["regular_income"]) if key == "regular" else float(settings["other_income"])
        groups.append({
            "type": key,
            "label": label,
            "hours": round(hours, 2),
            "income": round(income, 2),
            "count": cnt,
            "pending_count": pend_by_type.get(key, 0),
            "hourly_rate": round(income / hours, 2) if hours > 0 else 0.0,
        })
        totals["hours"] += hours
        totals["income"] += income
        totals["cnt"] += cnt

    pending = sum(pend_by_type.values())

    return {
        "groups": groups,
        "totals": {
            "hours": round(totals["hours"], 2),
            "income": round(totals["income"], 2),
            "count": totals["cnt"],
            "hourly_rate": round(totals["income"] / totals["hours"], 2) if totals["hours"] > 0 else 0.0,
        },
        "counts": {"pending": pending, "done": totals["cnt"]},
        "settings": settings,
        "period": {
            "month_key": month_key,
            "label": f"{year}年{month}月",
            "first_day": first,
            "last_day": last,
        },
        "generated_at": db.now_str(),
    }


@router.get("/stats/weekly")
def stats_weekly():
    """近 8 周每周完成工时 / 完成项数（月薪趋势图）。"""
    today = date.today()
    result = []
    for w in range(7, -1, -1):
        week_start = today - timedelta(days=today.weekday() + w * 7)
        week_end = week_start + timedelta(days=6)
        r = db.query_one(
            """SELECT SUM(actual_duration_hours) AS hours, COUNT(*) AS cnt
               FROM monthly_works
               WHERE status='done' AND completed_date BETWEEN ? AND ?""",
            (week_start.isoformat(), week_end.isoformat()),
        )
        result.append({
            "week_start": week_start.isoformat(),
            "label": f"{week_start.month}/{week_start.day}",
            "hours": round(float(r["hours"]), 2) if r and r["hours"] else 0.0,
            "count": int(r["cnt"]) if r and r["cnt"] else 0,
        })
    return result


@router.get("/stats/monthly")
def stats_monthly():
    """近 6 个完整月每月完成工时 / 完成项数（最新为「上月」，不含进行中的本月）。"""
    today = date.today()
    cur_idx = today.year * 12 + (today.month - 1)  # 本月 0-based 月序号
    result = []
    for i in range(6):
        target = cur_idx - 1 - (5 - i)  # 最旧 cur_idx-6 → 最新 cur_idx-1（上月）
        y, m0 = divmod(target, 12)
        m = m0 + 1
        first = date(y, m, 1)
        next_first = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        last = next_first - timedelta(days=1)
        r = db.query_one(
            """SELECT SUM(actual_duration_hours) AS hours, COUNT(*) AS cnt
               FROM monthly_works
               WHERE status='done' AND completed_date BETWEEN ? AND ?""",
            (first.isoformat(), last.isoformat()),
        )
        result.append({
            "year": y,
            "month": m,
            "label": f"{m}月",
            "hours": round(float(r["hours"]), 2) if r and r["hours"] else 0.0,
            "count": int(r["cnt"]) if r and r["cnt"] else 0,
        })
    return result
