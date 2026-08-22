"""工作条目 API：增删改查、标记完成、重新打开。"""

from datetime import date
from fastapi import APIRouter, HTTPException, Query

from backend import database as db
from backend.models import WorkCreate, WorkUpdate, WorkComplete

router = APIRouter(prefix="/api/works", tags=["works"])

WORK_COLS = (
    "id,name,work_type,duration_hours,planned_date,expected_income,notes,"
    "status,actual_duration_hours,completed_date,actual_income,created_at,updated_at"
)


def _row_to_dict(row: dict) -> dict:
    """统一输出字段，空值转 0/'' 便于前端处理。"""
    return {
        "id": row["id"],
        "name": row["name"],
        "work_type": row["work_type"],
        "duration_hours": float(row["duration_hours"] or 0),
        "planned_date": row["planned_date"],
        "expected_income": float(row["expected_income"] or 0),
        "notes": row["notes"] or "",
        "status": row["status"],
        "actual_duration_hours": float(row["actual_duration_hours"]) if row["actual_duration_hours"] is not None else None,
        "completed_date": row["completed_date"],
        "actual_income": float(row["actual_income"]) if row["actual_income"] is not None else None,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _get_or_404(work_id: int) -> dict:
    row = db.query_one("SELECT * FROM works WHERE id=?", (work_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"工作 #{work_id} 不存在")
    return row


@router.get("")
def list_works(
    status: str | None = Query(None, pattern="^(pending|done)$", description="按状态过滤"),
    work_type: str | None = Query(None, pattern="^(regular|other)$", description="按类型过滤"),
    date_from: str | None = Query(None, description="计划日期 >= YYYY-MM-DD"),
    date_to: str | None = Query(None, description="计划日期 <= YYYY-MM-DD"),
):
    """查询工作列表，支持状态/类型/日期范围过滤。"""
    sql = f"SELECT {WORK_COLS} FROM works WHERE 1=1"
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
    return [_row_to_dict(r) for r in db.query_all(sql, tuple(params))]


@router.get("/{work_id}")
def get_work(work_id: int):
    row = _get_or_404(work_id)
    return _row_to_dict(row)


@router.post("", status_code=201)
def create_work(payload: WorkCreate):
    """新建工作。"""
    now = db.now_str()
    wid = db.execute(
        """INSERT INTO works
           (name, work_type, duration_hours, planned_date, expected_income, notes,
            status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,'pending',?,?)""",
        (payload.name, payload.work_type, payload.duration_hours, payload.planned_date,
         payload.expected_income, payload.notes, now, now),
    )
    return _row_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM works WHERE id=?", (wid,)))


@router.put("/{work_id}")
def update_work(work_id: int, payload: WorkUpdate):
    """编辑工作（待完成状态可改全部基础字段）。"""
    row = _get_or_404(work_id)
    updates, params = [], []
    data = payload.model_dump(exclude_unset=True)
    for key in ("name", "work_type", "duration_hours", "planned_date", "expected_income", "notes"):
        if key in data:
            updates.append(f"{key}=?")
            params.append(data[key])
    if not updates:
        return _row_to_dict(row)
    params.append(db.now_str())
    params.append(work_id)
    db.execute(f"UPDATE works SET {', '.join(updates)}, updated_at=? WHERE id=?", tuple(params))
    return _row_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM works WHERE id=?", (work_id,)))


@router.delete("/{work_id}", status_code=204)
def delete_work(work_id: int):
    """删除工作。"""
    _get_or_404(work_id)
    db.execute("DELETE FROM works WHERE id=?", (work_id,))


@router.post("/{work_id}/complete")
def complete_work(work_id: int, payload: WorkComplete):
    """标记完成。

    可同时提交实际花费时长、完成日期、实际收入；未提交的字段按以下优先级回退：
    1. 该工作已有的实际值（已完成的工作再次调用时不会被计划值覆盖）；
    2. 对应计划值 / 今天。
    """
    row = _get_or_404(work_id)
    now = db.now_str()
    today = date.today().isoformat()
    already_done = row["status"] == "done"

    def _fallback(actual_key, plan_value):
        """本次未提交 → 已有实际值（仅已完成工作）→ 计划值。"""
        if already_done and row[actual_key] is not None:
            return row[actual_key]
        return plan_value

    actual_dur = payload.actual_duration_hours
    if actual_dur is None:
        actual_dur = _fallback("actual_duration_hours", row["duration_hours"])
    completed = payload.completed_date
    if not completed:
        completed = _fallback("completed_date", None) or today
    actual_income = payload.actual_income
    if actual_income is None:
        actual_income = _fallback("actual_income", row["expected_income"])
    db.execute(
        """UPDATE works SET status='done',
           actual_duration_hours=?, completed_date=?, actual_income=?, updated_at=?
           WHERE id=?""",
        (actual_dur, completed, actual_income, now, work_id),
    )
    return _row_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM works WHERE id=?", (work_id,)))


@router.post("/{work_id}/reopen")
def reopen_work(work_id: int):
    """重新打开：恢复为待完成，清空实际数据（保留计划数据）。"""
    _get_or_404(work_id)
    db.execute(
        """UPDATE works SET status='pending',
           actual_duration_hours=NULL, completed_date=NULL, actual_income=NULL, updated_at=?
           WHERE id=?""",
        (db.now_str(), work_id),
    )
    return _row_to_dict(db.query_one(f"SELECT {WORK_COLS} FROM works WHERE id=?", (work_id,)))
