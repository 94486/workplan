"""统计 API：工时收入看板数据源。

汇总口径（全部基于「已完成」工作的实际数据，避免预期/实际混算）：
- 工时 = SUM(actual_duration_hours)
- 收入 = SUM(actual_income)
- 小时均收入 = 收入 / 工时（工时 > 0 时）
- 按 常规(regular) / 其他(other) 分组，同时给出总计
"""

from datetime import date, timedelta
from fastapi import APIRouter

from backend import database as db

router = APIRouter(prefix="/api/stats", tags=["stats"])

TYPES = [("regular", "常规工作"), ("other", "其他工作")]


@router.get("/summary")
def summary():
    """总览：常规/其他分组的工时、收入、小时均收入 + 待完成数量。"""
    rows = db.query_all(
        """SELECT work_type,
                  SUM(actual_duration_hours) AS hours,
                  SUM(actual_income)        AS income,
                  COUNT(*)                  AS cnt
           FROM works
           WHERE status='done'
           GROUP BY work_type"""
    )
    by_type = {r["work_type"]: r for r in rows}
    totals = {"hours": 0.0, "income": 0.0, "cnt": 0}

    groups = []
    for key, label in TYPES:
        r = by_type.get(key)
        hours = float(r["hours"]) if r and r["hours"] else 0.0
        income = float(r["income"]) if r and r["income"] else 0.0
        cnt = int(r["cnt"]) if r else 0
        groups.append({
            "type": key,
            "label": label,
            "hours": round(hours, 2),
            "income": round(income, 2),
            "count": cnt,
            "hourly_rate": round(income / hours, 2) if hours > 0 else 0.0,
        })
        totals["hours"] += hours
        totals["income"] += income
        totals["cnt"] += cnt

    pending = db.query_one("SELECT COUNT(*) AS c FROM works WHERE status='pending'")["c"]
    done = db.query_one("SELECT COUNT(*) AS c FROM works WHERE status='done'")["c"]

    return {
        "groups": groups,
        "totals": {
            "hours": round(totals["hours"], 2),
            "income": round(totals["income"], 2),
            "count": totals["cnt"],
            "hourly_rate": round(totals["income"] / totals["hours"], 2) if totals["hours"] > 0 else 0.0,
        },
        "counts": {"pending": pending, "done": done},
        "generated_at": db.now_str(),
    }


@router.get("/daily")
def daily(days: int = 14):
    """近 N 天每日完成工时/收入（用于趋势图）。"""
    days = max(7, min(days, 90))
    today = date.today()
    start = today - timedelta(days=days - 1)

    rows = db.query_all(
        """SELECT completed_date AS d,
                  SUM(actual_duration_hours) AS hours,
                  SUM(actual_income)        AS income
           FROM works
           WHERE status='done' AND completed_date IS NOT NULL
           GROUP BY completed_date"""
    )
    m = {r["d"]: r for r in rows}

    result = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        r = m.get(d)
        result.append({
            "date": d,
            "hours": round(float(r["hours"]), 2) if r and r["hours"] else 0.0,
            "income": round(float(r["income"]), 2) if r and r["income"] else 0.0,
        })
    return result


@router.get("/weekly")
def weekly():
    """近 8 周每周完成工时/收入（用于周趋势图）。"""
    today = date.today()
    result = []
    for w in range(7, -1, -1):
        week_start = today - timedelta(days=today.weekday() + w * 7)
        week_end = week_start + timedelta(days=6)
        r = db.query_one(
            """SELECT SUM(actual_duration_hours) AS hours, SUM(actual_income) AS income
               FROM works
               WHERE status='done' AND completed_date BETWEEN ? AND ?""",
            (week_start.isoformat(), week_end.isoformat()),
        )
        result.append({
            "week_start": week_start.isoformat(),
            "label": f"{week_start.month}/{week_start.day}",
            "hours": round(float(r["hours"]), 2) if r and r["hours"] else 0.0,
            "income": round(float(r["income"]), 2) if r and r["income"] else 0.0,
        })
    return result
