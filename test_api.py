# -*- coding: utf-8 -*-
"""test_api.py — 项目一键回归测试（标准库实现，无第三方依赖）

用法:  python test_api.py  [http://127.0.0.1:8000]
前提:  服务已在跑（源码 uvicorn 或 WorkDashboard.exe 均可）。

覆盖:
  A. 静态资源 + 前端版本漂移检测（服务端 js/css 与源码逐字节对比）
  B. /api/works 全生命周期（临时数据，跑完自动删除，不污染真实库）
  C. 只读统计/配置接口
  D. 负向用例（404 / 422）
退出码: 0=全过, 1=有 FAIL（WARN 不算失败）
"""
import io, json, os, sys, urllib.request, urllib.error, hashlib, datetime

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
ROOT = os.path.dirname(os.path.abspath(__file__))
TODAY = datetime.date.today().isoformat()

results = []
def check(name, ok, detail=""):
    tag = "PASS" if ok is True else ("FAIL" if ok is False else "WARN")
    results.append((tag, name, detail))
    print(f"[{tag}] {name}" + (f"  —— {detail}" if detail else ""))

def req(method, path, payload=None, raw=False):
    url = BASE + path
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            body = resp.read()
            return resp.status, (body if raw else json.loads(body or b"null"))
    except urllib.error.HTTPError as e:
        body = e.read()
        try: out = json.loads(body or b"null")
        except Exception: out = body.decode("utf-8", "ignore")[:200]
        return e.code, out
    except Exception as e:
        return 0, str(e)

print(f"== 目标: {BASE} ==")

# ---------- A. 静态资源与版本漂移 ----------
st, body = req("GET", "/", raw=True)
check("首页 GET /", st == 200 and b"<html" in (body or b"").lower()[:2000], f"status={st}")

for f in ["js/app.js", "js/stats.js", "js/charts.js", "css/style.css"]:
    st, served = req("GET", "/static/" + f, raw=True)
    src = os.path.join(ROOT, "frontend", *f.split("/"))
    if st != 200:
        check(f"静态 {f}", False, f"status={st}")
        continue
    if os.path.exists(src):
        local = open(src, "rb").read()
        same = hashlib.md5(local).hexdigest() == hashlib.md5(served).hexdigest()
        check(f"版本一致 {f}", True if same else "WARN",
              "" if same else f"服务端与源码 frontend\\{f} 不一致（exe 内嵌旧版？）")
    else:
        check(f"静态 {f}", True, "(无本地源可比)")

# ---------- B. works 全生命周期 ----------
tmp_id = None
try:
    st, w = req("POST", "/api/works", {"name": "【回归测试】临时条目", "work_type": "regular",
                                       "duration_hours": 1.5, "planned_date": TODAY,
                                       "expected_income": 100, "notes": "auto-test"})
    ok = st == 201 and isinstance(w, dict) and w.get("id")
    check("POST /api/works 新建", bool(ok), f"status={st}")
    tmp_id = w.get("id") if ok else None

    if tmp_id:
        st, w2 = req("GET", f"/api/works/{tmp_id}")
        check("GET 单条", st == 200 and w2.get("name") == "【回归测试】临时条目", f"status={st}")

        st, w3 = req("PUT", f"/api/works/{tmp_id}", {"notes": "updated-by-test"})
        check("PUT 编辑", st == 200 and w3.get("notes") == "updated-by-test", f"status={st}")

        st, w4 = req("POST", f"/api/works/{tmp_id}/complete",
                     {"actual_duration_hours": 2.0, "actual_income": 120, "completed_date": TODAY})
        check("POST complete", st == 200 and w4.get("status") == "done", f"status={st}")

        st, w5 = req("POST", f"/api/works/{tmp_id}/reopen")
        check("POST reopen", st == 200 and w5.get("status") == "pending", f"status={st}")

        st, _ = req("DELETE", f"/api/works/{tmp_id}")
        check("DELETE", st == 204, f"status={st}")
        st, _ = req("GET", f"/api/works/{tmp_id}")
        check("删除后 GET 404", st == 404, f"status={st}")
        tmp_id = None
finally:
    if tmp_id:  # 保险清理
        req("DELETE", f"/api/works/{tmp_id}")

# ---------- C. 只读接口 ----------
st, rows = req("GET", "/api/works")
check("GET /api/works 列表", st == 200 and isinstance(rows, list), f"count={len(rows) if isinstance(rows, list) else '-'}")

st, rows = req("GET", "/api/works?status=done&work_type=regular")
check("GET 列表带过滤", st == 200 and isinstance(rows, list), f"status={st}")

st, s = req("GET", "/api/stats/summary")
check("GET /api/stats/summary", st == 200 and isinstance(s, dict) and "groups" in s,
      f"keys={list(s)[:6] if isinstance(s, dict) else s}")

st, d = req("GET", "/api/stats/daily")
check("GET /api/stats/daily", st == 200, f"status={st}")

st, wk = req("GET", "/api/stats/weekly")
check("GET /api/stats/weekly", st == 200, f"status={st}")

st, p = req("GET", "/api/presets")
check("GET /api/presets", st == 200 and isinstance(p, list), f"status={st}")

st, cfg = req("GET", "/api/push/config")
check("GET /api/push/config", st == 200, f"status={st}")

st, ms = req("GET", "/api/monthly/settings")
check("GET /api/monthly/settings", True if st == 200 else "WARN", f"status={st}")

st, mw = req("GET", "/api/monthly/works")
check("GET /api/monthly/works", True if st == 200 else "WARN", f"status={st}")

st, body = req("GET", "/api/data/export", raw=True)
check("GET /api/data/export", st == 200 and len(body) > 10, f"bytes={len(body) if isinstance(body, bytes) else 0}")

# ---------- D. 负向 ----------
st, _ = req("GET", "/api/works/99999999")
check("不存在 id → 404", st == 404, f"status={st}")

st, _ = req("POST", "/api/works", {"name": "坏日期", "planned_date": "2026-13-99"})
check("非法日期 → 422", st == 422, f"status={st}")

# ---------- 汇总 ----------
fails = [r for r in results if r[0] == "FAIL"]
warns = [r for r in results if r[0] == "WARN"]
print(f"\n== 汇总: {len(results)} 项 | PASS {len(results)-len(fails)-len(warns)} | WARN {len(warns)} | FAIL {len(fails)} ==")
sys.exit(1 if fails else 0)
