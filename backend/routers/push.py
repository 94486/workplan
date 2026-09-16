"""数据对接路由：外部程序通过「对接码」推送统计数据 → 待审查箱 → 审查后合并入库。

流程设计（满足"一键发送 + 审查后接收合并"）：
1. 外部程序（如自研计时软件）用对接码（X-Api-Key 头）POST 数据到 /api/push；
2. 推送数据**不直接入库**，先写入 push_inbox 待审查箱（status=pending）；
3. 工作台界面「数据对接」里可查看待审查数据，逐条或全部「接收合并」（走与文件导入相同的
   合并去重逻辑，名称+类型+计划日期相同视为重复跳过）或「丢弃」；
4. 对接码用于防止未经授权的外部程序写入；审查操作是工作台内的本地操作，不要求对接码。

与文件导入共用 data_io._normalize_all / _merge_into_db，保证规整与判重口径完全一致。
"""

import json
import secrets
from datetime import date

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from backend import database as db
from backend.routers import data_io

router = APIRouter(prefix="/api/push", tags=["数据对接"])


# ---------------------------------------------------------------- 对接码

def _get_config() -> dict:
    """读取对接配置；不存在则自动生成并持久化。"""
    row = db.query_one("SELECT id, api_key, updated_at FROM push_config WHERE id=1")
    if row:
        return row
    key = "wd_" + secrets.token_urlsafe(24)
    now = db.now_str()
    conn = db.get_conn()
    try:
        conn.execute("INSERT INTO push_config (id, api_key, updated_at) VALUES (1, ?, ?)", (key, now))
        conn.commit()
    finally:
        conn.close()
    return {"id": 1, "api_key": key, "updated_at": now}


@router.get("/config")
def get_config():
    cfg = _get_config()
    return {"api_key": cfg["api_key"], "updated_at": cfg["updated_at"]}


class ConfigUpdate(BaseModel):
    regenerate: bool = True  # 默认重新生成；若想自定义请传 regenerate=False + api_key
    api_key: str | None = Field(None, min_length=8, max_length=128)


@router.put("/config")
def update_config(body: ConfigUpdate):
    now = db.now_str()
    if (not body.regenerate) and body.api_key and body.api_key.strip():
        key = body.api_key.strip()
    else:
        key = "wd_" + secrets.token_urlsafe(24)
    conn = db.get_conn()
    try:
        conn.execute(
            """INSERT INTO push_config (id, api_key, updated_at) VALUES (1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET api_key=excluded.api_key, updated_at=excluded.updated_at""",
            (key, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {"api_key": key, "updated_at": now}


def _require_key(x_api_key: str | None) -> None:
    """推送接口的鉴权：校验 X-Api-Key 与配置的对接码一致。"""
    cfg = _get_config()
    if not x_api_key or not secrets.compare_digest(x_api_key, cfg["api_key"]):
        raise HTTPException(status_code=401, detail="对接码无效或缺失")


# ---------------------------------------------------------------- 推送

class PushPayload(BaseModel):
    source: str = Field("", max_length=100)          # 推送方标识，如"计时软件"
    pushed_at: str = Field("", max_length=64)        # 推送方自报推送时间（仅审查展示）
    data: dict | list                                # 对象（完整备份结构）或 works 数组


@router.post("")
def push(payload: PushPayload, x_api_key: str | None = Header(None)):
    """接收外部程序推送的数据，进入待审查箱（不直接入库）。"""
    _require_key(x_api_key)
    parsed = payload.data
    if isinstance(parsed, list):
        parsed = {"works": parsed}
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="data 必须是对象（备份结构）或数组（works 列表）")
    try:
        norm = data_io._normalize_all(parsed)
    except Exception:
        raise HTTPException(status_code=400, detail="数据格式无法识别")

    valid_count = (len(norm["records"]) + len(norm["preset_records"]) + len(norm["monthly_records"])
                   + len(norm["monthly_preset_records"]) + len(norm["monthly_setting_records"]))
    if valid_count == 0:
        raise HTTPException(status_code=400,
                            detail=f"未识别到有效记录（无效 {norm['invalid']} 条：缺名称/日期非法/类型或状态无法识别）")

    now = db.now_str()
    conn = db.get_conn()
    try:
        # source / pushed_at 为识别字段，不建立独立数据库列，随完整推送快照一并保存
        payload_doc = {
            "source": payload.source[:100],
            "pushed_at": payload.pushed_at[:64],
            "data": parsed,
        }
        cur = conn.execute(
            "INSERT INTO push_inbox (payload, record_count, status, received_at) VALUES (?,?,?,?)",
            (json.dumps(payload_doc, ensure_ascii=False), valid_count, "pending", now),
        )
        conn.commit()
        inbox_id = cur.lastrowid
    finally:
        conn.close()

    return {
        "inbox_id": inbox_id,
        "received": valid_count,
        "invalid": norm["invalid"],
        "message": f"已接收 {valid_count} 条待审查（无效 {norm['invalid']} 条），请在「数据对接」中确认后合并",
    }


# ---------------------------------------------------------------- 待审查箱

@router.get("/inbox")
def list_inbox(status: str = "pending"):
    """列出待审查（或已处理）的推送记录，附带每条记录的可读预览。"""
    conn = db.get_conn()
    try:
        rows = conn.execute(
            "SELECT id, payload, record_count, status, received_at, merged_at "
            "FROM push_inbox WHERE status=? ORDER BY received_at DESC",
            (status,),
        ).fetchall()
    finally:
        conn.close()

    out = []
    for r in rows:
        preview = []
        invalid_count = 0
        source = ""
        pushed_at = ""
        try:
            doc = json.loads(r["payload"])
            # 新格式：payload 为 {source, pushed_at, data}；旧格式：payload 直接是 data
            if isinstance(doc, dict) and "data" in doc:
                parsed = doc["data"]
                source = str(doc.get("source") or "")[:100]
                pushed_at = str(doc.get("pushed_at") or "")[:64]
            else:
                parsed = doc
            # 核验 + 预览都基于归一化后的结果：仅展示会被入库的有效记录，
            # 无效行（缺名称/日期非法/类型或状态无法识别）单独计数提示，不混入预览
            norm = data_io._normalize_all(parsed)
            invalid_count = norm["invalid"]

            # 明细预览：日薪工作 + 月薪任务合并，携带时长/收入/类别，方便审查
            preview_rows = []
            for rec in norm["records"]:
                preview_rows.append({
                    "kind": "日薪", "name": rec["name"], "work_type": rec["work_type"],
                    "planned_date": rec["planned_date"], "status": rec["status"],
                    "duration": rec["duration_hours"],
                    "income": rec["expected_income"] if rec["status"] != "done" else rec["actual_income"],
                })
            for rec in norm["monthly_records"]:
                preview_rows.append({
                    "kind": "月薪", "name": rec["name"], "work_type": rec["work_type"],
                    "planned_date": rec["planned_date"], "status": rec["status"],
                    "duration": rec["duration_hours"], "income": None,
                })
            preview_rows.sort(key=lambda x: x["planned_date"])
            preview = preview_rows[:20]

            # 统计摘要：类别构成 / 工时 / 收入 / 类型分布 / 状态分布 / 日期范围
            cats = {
                "daily_works": len(norm["records"]),
                "daily_presets": len(norm["preset_records"]),
                "monthly_works": len(norm["monthly_records"]),
                "monthly_presets": len(norm["monthly_preset_records"]),
                "settings": len(norm["monthly_setting_records"]),
            }
            daily_hours = sum(float(r2["duration_hours"] or 0) for r2 in norm["records"])
            daily_income = sum(float(r2["actual_income"] or 0) if r2["status"] == "done"
                               else float(r2["expected_income"] or 0) for r2 in norm["records"])
            monthly_hours = sum(float(r2["duration_hours"] or 0) for r2 in norm["monthly_records"])
            types = {"regular": 0, "other": 0}
            statuses = {"pending": 0, "done": 0}
            dates = [r2["planned_date"] for r2 in norm["records"] + norm["monthly_records"] if r2["planned_date"]]
            for r2 in norm["records"] + norm["monthly_records"]:
                types[r2["work_type"]] = types.get(r2["work_type"], 0) + 1
                statuses[r2["status"]] = statuses.get(r2["status"], 0) + 1
            summary = {
                "categories": cats,
                "daily_hours": round(daily_hours, 2),
                "daily_income": round(daily_income, 2),
                "monthly_hours": round(monthly_hours, 2),
                "types": types,
                "statuses": statuses,
                "date_min": min(dates) if dates else None,
                "date_max": max(dates) if dates else None,
            }
        except Exception:
            preview = []
            summary = None
        out.append({
            "id": r["id"], "source": source,
            "pushed_at": pushed_at,
            "record_count": r["record_count"],   # 有效记录数（将入库）
            "invalid_count": invalid_count,      # 无效记录数（将被跳过）
            "status": r["status"], "received_at": r["received_at"],
            "preview": preview, "summary": summary,
        })
    return out


@router.post("/inbox/{item_id}/approve")
def approve(item_id: int):
    """审查后接收合并：把该条待审查数据以合并模式写入正式表。"""
    row = db.query_one("SELECT * FROM push_inbox WHERE id=? AND status='pending'", (item_id,))
    if not row:
        raise HTTPException(status_code=404, detail="待审查记录不存在或已处理")
    try:
        doc = json.loads(row["payload"])
        # 新格式：payload 为 {source, pushed_at, data}；旧格式：payload 直接是 data
        if isinstance(doc, dict) and "data" in doc:
            parsed = doc["data"]
        else:
            parsed = doc
    except Exception:
        raise HTTPException(status_code=400, detail="推送数据损坏，无法解析")
    try:
        norm = data_io._normalize_all(parsed)
    except Exception:
        raise HTTPException(status_code=400, detail="推送数据格式无法识别")

    conn = db.get_conn()
    try:
        merged = data_io._merge_into_db(conn, norm)
        conn.execute(
            "UPDATE push_inbox SET status='merged', merged_at=? WHERE id=?",
            (db.now_str(), item_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "merged": merged["inserted"],
        "skipped": merged["skipped"],
        "invalid": norm["invalid"],
        **data_io._summary_fields(merged),
        "message": data_io._summary_msg("已合并", merged, norm["invalid"]),
    }


@router.post("/inbox/{item_id}/discard")
def discard(item_id: int):
    """丢弃该条待审查数据（不入库）。"""
    row = db.query_one("SELECT id FROM push_inbox WHERE id=? AND status='pending'", (item_id,))
    if not row:
        raise HTTPException(status_code=404, detail="待审查记录不存在或已处理")
    db.execute("UPDATE push_inbox SET status='discarded' WHERE id=?", (item_id,))
    return {"ok": True, "message": "已丢弃"}


# ---------------------------------------------------------------- 数据查询（只读）

def _query_date(v: str, name: str) -> str:
    """查询日期参数校验：空串放行，否则必须是合法 YYYY-MM-DD（与 P5 修复口径一致）。"""
    if not v:
        return ""
    try:
        date.fromisoformat(v)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"{name} 格式非法，应为 YYYY-MM-DD")
    return v


@router.get("/query")
def query_data(
    scope: str = Query("all",
                       pattern="^(all|works|presets|monthly_works|monthly_presets|monthly_settings)$",
                       description="查询范围：all=全部；works/presets/monthly_works/monthly_presets/monthly_settings=单类"),
    from_: str = Query("", alias="from", description="计划日期起始 YYYY-MM-DD（作用于日薪/月薪工作）"),
    to: str = Query("", description="计划日期截止 YYYY-MM-DD（作用于日薪/月薪工作）"),
    status: str = Query("", pattern="^(pending|done|)$", description="状态过滤（作用于日薪/月薪工作）"),
    x_api_key: str | None = Header(None),
):
    """外部程序通过对接码只读查询工作台数据。

    - 鉴权与推送一致：请求头 X-Api-Key 携带对接码（常量时间比较），防止未授权读取。
    - 返回字段与「导出 JSON」完全一致（含 id），其他程序可直接消费；
      需要回传时把 data 原样 POST /api/push 即可（多余字段导入时自动忽略）。
    - 纯只读接口，不修改任何数据。
    """
    _require_key(x_api_key)
    f = _query_date(from_, "from")
    t = _query_date(to, "to")
    if f and t and f > t:
        raise HTTPException(status_code=422, detail="from 不能晚于 to")

    where, params = [], []
    if f:
        where.append("planned_date >= ?"); params.append(f)
    if t:
        where.append("planned_date <= ?"); params.append(t)
    if status:
        where.append("status = ?"); params.append(status)
    wsql = (" WHERE " + " AND ".join(where)) if where else ""

    conn = db.get_conn()
    try:
        data: dict = {}
        if scope in ("all", "works"):
            data["works"] = [dict(r) for r in conn.execute(
                f"SELECT {data_io.WORK_COLS} FROM works{wsql} ORDER BY planned_date ASC, id ASC",
                params).fetchall()]
        if scope in ("all", "presets"):
            data["presets"] = [dict(r) for r in conn.execute(
                "SELECT id, name, work_type, duration_hours, expected_income, notes, created_at "
                "FROM presets ORDER BY id").fetchall()]
        if scope in ("all", "monthly_works"):
            data["monthly_works"] = [dict(r) for r in conn.execute(
                "SELECT id, name, work_type, duration_hours, planned_date, status, "
                "actual_duration_hours, completed_date, notes, created_at "
                f"FROM monthly_works{wsql} ORDER BY planned_date ASC, id ASC",
                params).fetchall()]
        if scope in ("all", "monthly_presets"):
            data["monthly_presets"] = [dict(r) for r in conn.execute(
                "SELECT id, name, work_type, duration_hours, notes, created_at "
                "FROM monthly_presets ORDER BY id").fetchall()]
        if scope in ("all", "monthly_settings"):
            data["monthly_settings"] = [dict(r) for r in conn.execute(
                "SELECT month_key, regular_income, other_income, updated_at "
                "FROM monthly_settings ORDER BY month_key").fetchall()]
    finally:
        conn.close()

    count = sum(len(v) for v in data.values())
    return {
        "app": "WorkDashboard",
        "version": 2,
        "exported_at": db.now_str(),
        "scope": scope,
        "filter": {"from": f, "to": t, "status": status},
        "count": count,
        "data": data,
    }
