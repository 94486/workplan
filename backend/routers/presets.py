"""预设 API：工作录入预设的增删改查。

常规工作和其他工作各自独立维护预设列表（通过 work_type 字段区分）。
预设保存名称、时长、预期收入、备注，录入时选择后可快速填充表单。
"""

from fastapi import APIRouter, HTTPException, Query

from backend import database as db
from backend.models import PresetCreate, PresetUpdate

router = APIRouter(prefix="/api/presets", tags=["presets"])

PRESET_COLS = (
    "id,name,work_type,duration_hours,expected_income,notes,created_at,updated_at"
)


def _row_to_dict(row: dict) -> dict:
    """统一输出字段，空值转 0/'' 便于前端处理。"""
    return {
        "id": row["id"],
        "name": row["name"],
        "work_type": row["work_type"],
        "duration_hours": float(row["duration_hours"] or 0),
        "expected_income": float(row["expected_income"] or 0),
        "notes": row["notes"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _get_or_404(preset_id: int) -> dict:
    row = db.query_one("SELECT * FROM presets WHERE id=?", (preset_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"预设 #{preset_id} 不存在")
    return row


@router.get("")
def list_presets(
    work_type: str | None = Query(None, pattern="^(regular|other)$", description="按类型过滤"),
):
    """查询预设列表，支持按类型过滤。"""
    sql = f"SELECT {PRESET_COLS} FROM presets WHERE 1=1"
    params: list = []
    if work_type:
        sql += " AND work_type=?"
        params.append(work_type)
    sql += " ORDER BY id DESC"
    return [_row_to_dict(r) for r in db.query_all(sql, tuple(params))]


@router.get("/{preset_id}")
def get_preset(preset_id: int):
    row = _get_or_404(preset_id)
    return _row_to_dict(row)


@router.post("", status_code=201)
def create_preset(payload: PresetCreate):
    """新建预设。"""
    now = db.now_str()
    pid = db.execute(
        """INSERT INTO presets
           (name, work_type, duration_hours, expected_income, notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?)""",
        (payload.name, payload.work_type, payload.duration_hours,
         payload.expected_income, payload.notes, now, now),
    )
    return _row_to_dict(db.query_one(f"SELECT {PRESET_COLS} FROM presets WHERE id=?", (pid,)))


@router.put("/{preset_id}")
def update_preset(preset_id: int, payload: PresetUpdate):
    """编辑预设。"""
    row = _get_or_404(preset_id)
    updates, params = [], []
    data = payload.model_dump(exclude_unset=True)
    for key in ("name", "work_type", "duration_hours", "expected_income", "notes"):
        if key in data:
            updates.append(f"{key}=?")
            params.append(data[key])
    if not updates:
        return _row_to_dict(row)
    params.append(db.now_str())
    params.append(preset_id)
    db.execute(f"UPDATE presets SET {', '.join(updates)}, updated_at=? WHERE id=?", tuple(params))
    return _row_to_dict(db.query_one(f"SELECT {PRESET_COLS} FROM presets WHERE id=?", (preset_id,)))


@router.delete("/{preset_id}", status_code=204)
def delete_preset(preset_id: int):
    """删除预设。"""
    _get_or_404(preset_id)
    db.execute("DELETE FROM presets WHERE id=?", (preset_id,))
