# -*- coding: utf-8 -*-
"""test_robustness.py — 对抗性健壮性测试（捶后端 API + 数据完整性）

用法:  python test_robustness.py [http://127.0.0.1:8000]
安全:  只操作【回归测试】前缀临时数据并在 finally 清理；
       导入用例仅发畸形负载并验证库未受损；跑前自动备份活动 DB 到 %TEMP%。
判定:  FAIL=500/数据损坏/越权写入 | BUG=校验缺口(4xx但行为可疑/不一致) | PASS
"""
import json, os, re, shutil, sqlite3, sys, threading, urllib.request, urllib.error, datetime

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
ROOT = os.path.dirname(os.path.abspath(__file__))
TODAY = datetime.date.today().isoformat()
created_ids, results = [], []

def rec(tag, name, detail=""):
    results.append((tag, name, detail)); print(f"[{tag}] {name}" + (f"  —— {detail}" if detail else ""))

def req(method, path, payload=None, raw_body=None, ctype="application/json"):
    url = BASE + path
    data = raw_body if raw_body is not None else (
        json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None)
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": ctype})
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            b = resp.read()
            try: return resp.status, json.loads(b or b"null")
            except Exception: return resp.status, b
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"null")
        except Exception: return e.code, b[:150].decode("utf-8", "ignore")
    except Exception as e:
        return 0, str(e)

def mk(name, **kw):
    body = {"name": name, "work_type": "regular", "duration_hours": 1,
            "planned_date": TODAY, "expected_income": 10, "notes": ""}
    body.update(kw)
    return req("POST", "/api/works", body)

def count_works():
    st, rows = req("GET", "/api/works")
    return len(rows) if isinstance(rows, list) else -1

# ---------- 备份活动 DB ----------
def backup_db():
    st, rows = req("GET", "/api/works")
    n = len(rows) if isinstance(rows, list) else -1
    for cand in [os.path.join(ROOT, "dist", "data", "works.db"), os.path.join(ROOT, "data", "works.db")]:
        if not os.path.exists(cand): continue
        try:
            c = sqlite3.connect(cand); m = c.execute("select count(*) from works").fetchone()[0]; c.close()
            if m == n:
                dst = os.path.join(os.environ.get("TEMP", "."), f"works_backup_{datetime.datetime.now():%Y%m%d_%H%M%S}.db")
                shutil.copy2(cand, dst); rec("PASS", f"活动DB已备份 {cand} -> {dst}", f"rows={m}")
                return cand
        except Exception: pass
    rec("WARN", "未能定位活动DB文件（exe 数据目录未知），导入用例降级为只发畸形负载", f"api_rows={n}")
    return None

print(f"== 健壮性测试目标: {BASE} ==\n-- 备份 --")
DB = backup_db()
N0 = count_works()

# ---------- A. 输入边界 ----------
print("\n-- A. 输入边界与注入 --")
st, _ = req("POST", "/api/works", {"name": "   ", "planned_date": TODAY})
rec("PASS" if st == 422 else "FAIL", "全空格名 → 422", f"status={st}")

st, _ = req("POST", "/api/works", {"name": "x" * 101, "planned_date": TODAY})
rec("PASS" if st == 422 else "FAIL", "name 101字符 → 422", f"status={st}")

st, r = req("POST", "/api/works", {"name": "边界100", "planned_date": TODAY, "notes": "n" * 2000})
if st == 201: created_ids.append(r["id"])
rec("PASS" if st == 201 else "FAIL", "notes 2000字符边界 → 201", f"status={st}")
st, _ = req("POST", "/api/works", {"name": "超长备注", "planned_date": TODAY, "notes": "n" * 2001})
rec("PASS" if st == 422 else "FAIL", "notes 2001 → 422", f"status={st}")

XSS = '<img src=x onerror="window.__xss=1">'
st, r = req("POST", "/api/works", {"name": XSS, "work_type": "regular", "duration_hours": 1,
                                    "planned_date": TODAY, "expected_income": 10,
                                    "notes": "<script>window.__xss2=1</script>"})
xss_id = r.get("id") if st == 201 else None
if xss_id: created_ids.append(xss_id)
rec("PASS" if st == 201 else "FAIL", "XSS 字面量入库(存储层不转义属预期)", f"status={st}")

st, r = req("POST", "/api/works", {"name": "z'); DROP TABLE works; --", "work_type": "regular",
                                    "duration_hours": 1, "planned_date": TODAY, "expected_income": 10,
                                    "notes": "1; DELETE FROM works"})
sqli_id = r.get("id") if st == 201 else None
if sqli_id: created_ids.append(sqli_id)
st2, rows = req("GET", "/api/works")
rec("PASS" if st == 201 and st2 == 200 and isinstance(rows, list) else "FAIL",
    "SQLi 字面量入库且表存活", f"create={st} list={st2}")

for d, want in [("2026-02-30", 422), ("2028-02-29", 201), ("2026-9-3", 422), ("9999-12-31", 201)]:
    st, r = req("POST", "/api/works", {"name": f"日期{d}", "planned_date": d})
    if st == 201: created_ids.append(r["id"])
    rec("PASS" if st == want else "FAIL", f"planned_date {d} → {want}", f"got={st}")

st, _ = req("POST", "/api/works", {"name": "负时长", "planned_date": TODAY, "duration_hours": -1})
rec("PASS" if st == 422 else "FAIL", "duration -1 → 422", f"status={st}")
st, _ = req("POST", "/api/works", {"name": "巨收入", "planned_date": TODAY, "expected_income": 1e7 + 1})
rec("PASS" if st == 422 else "FAIL", "income 越上限 → 422", f"status={st}")

st, _ = req("POST", "/api/works", None, raw_body='{"name":"NaN探针","planned_date":"%s","duration_hours":NaN}' % TODAY)
rec("PASS" if st in (400, 422) else ("BUG" if st == 201 else "FAIL"),
    "非法JSON NaN → 拒绝", f"status={st}")
st, _ = req("POST", "/api/works", None, raw_body='{"name":"Inf探针","planned_date":"%s","duration_hours":1e999}' % TODAY)
rec("PASS" if st in (400, 422) else ("BUG" if st == 201 else "FAIL"),
    "Infinity → 拒绝", f"status={st}")

st, r = mk("emoji🐉+换行\n\t制表", notes="多行\n备注\r\nCRLF")
if st == 201:
    created_ids.append(r["id"])
    ok = r["name"].startswith("emoji🐉") and "\n" in (r["notes"] or "")
    rec("PASS" if ok else "BUG", "emoji/CRLF 保真", f"name={r['name'][:14]!r}")
else:
    rec("FAIL", "emoji/CRLF 保真", f"status={st}")

# ---------- B. HTTP 协议层 ----------
print("\n-- B. HTTP 协议层 --")
st, _ = req("GET", "/api/works/abc")
rec("PASS" if st == 422 else "FAIL", "路径参数非数字 → 422", f"status={st}")
st, _ = req("GET", "/api/works/-5")
rec("PASS" if st in (404, 422) else "FAIL", "负数 id → 404/422", f"status={st}")
st, _ = req("GET", "/api/works/1/complete")
rec("PASS" if st == 405 else "FAIL", "GET complete → 405", f"status={st}")
st, _ = req("PATCH", "/api/works/1")
rec("PASS" if st == 405 else "FAIL", "PATCH → 405", f"status={st}")
st, _ = req("POST", "/api/works", None, raw_body=b'{"name": broken')
rec("PASS" if st in (400, 422) else "FAIL", "畸形JSON → 4xx", f"status={st}")
st, _ = req("GET", "/api/works?status=hack'--")
rec("PASS" if st == 422 else "FAIL", "status 枚举校验(pattern)", f"status={st}")
st, _ = req("GET", "/api/works?date_from=乱写")
rec("PASS" if st == 200 else "INFO", "date_from 无格式校验(字符串比较,良性)", f"status={st}")

# ---------- C. 状态机 ----------
print("\n-- C. 状态机 --")
st, w = mk("状态机样本", duration_hours=3, expected_income=50)
sid = w["id"]; created_ids.append(sid)

st, w2 = req("POST", f"/api/works/{sid}/complete", {"actual_duration_hours": 4, "actual_income": 60})
rec("PASS" if st == 200 and w2.get("status") == "done" else "FAIL", "complete", f"status={st}")

st, w3 = req("POST", f"/api/works/{sid}/complete", {})
ok = st == 200 and w3.get("actual_duration_hours") == 4 and w3.get("actual_income") == 60
rec("PASS" if ok else "BUG", "重复complete不覆盖已有实际值", f"got dur={w3.get('actual_duration_hours')} inc={w3.get('actual_income')}")

st, w4 = req("PUT", f"/api/works/{sid}", {"name": "已完成后改名", "duration_hours": 99})
done_edit = st == 200 and w4.get("status") == "done" and w4.get("duration_hours") == 99
rec("BUG" if done_edit else "PASS", "已完成仍接受PUT改计划字段(docstring称仅待完成可改)",
    f"status={st} 计划时长被改为99 但实际=4 → 计划/实际语义漂移")

st, w5 = req("POST", f"/api/works/{sid}/reopen")
rec("PASS" if st == 200 and w5.get("status") == "pending" and w5.get("actual_income") is None else "FAIL",
    "reopen 清实际值", f"status={st}")

st, w6 = req("POST", f"/api/works/{sid}/reopen")
rec("PASS" if st == 200 else "FAIL", "pending 重复reopen幂等", f"status={st}")

st, _ = req("POST", f"/api/works/{sid}/complete", {"completed_date": "2099-01-01"})
rec("BUG" if st == 200 else "PASS", "完成日期可填未来日(2099)", f"status={st}")
req("POST", f"/api/works/{sid}/reopen")

# ---------- D. 并发 ----------
print("\n-- D. 并发 --")
ids, errs = [], []
def worker(i):
    st, r = mk(f"并发{i}", duration_hours=1)
    (ids.append(r["id"]) if st == 201 else errs.append((st, str(r)[:60])))
ts = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
[t.start() for t in ts]; [t.join(30) for t in ts]
created_ids += ids
uniq = len(set(ids)) == len(ids)
rec("PASS" if len(ids) == 10 and not errs and uniq else "FAIL",
    "10并发新建", f"ok={len(ids)} errs={errs[:2]}")

st, a = mk("并发完成竞态")
rid = a["id"]; created_ids.append(rid)
outs = []
def comp(): outs.append(req("POST", f"/api/works/{rid}/complete", {"actual_income": 77}))
t1, t2 = threading.Thread(target=comp), threading.Thread(target=comp)
t1.start(); t2.start(); t1.join(15); t2.join(15)
codes = [o[0] for o in outs]
st, fin = req("GET", f"/api/works/{rid}")
ok = all(c == 200 for c in codes) and fin.get("status") == "done" and fin.get("actual_income") == 77
rec("PASS" if ok else "FAIL", "同条并发complete竞态", f"codes={codes} final={fin.get('status')}/{fin.get('actual_income')}")

# ---------- E. 导入安全（multipart 真实形态 + 备份保护） ----------
print("\n-- E. 导入安全 --")
import uuid
def multipart(path, filename, content_bytes, mode="merge"):
    b = "----rob" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\""
            f"\r\nContent-Type: application/octet-stream\r\n\r\n").encode() + content_bytes + \
           f"\r\n--{b}--\r\n".encode()
    return req("POST", f"/api/data/import?mode={mode}", raw_body=body,
               ctype=f"multipart/form-data; boundary={b}")

probe_names = ["【导入探针】垃圾", "【导入探针】CSV", "【导入探针】JSON", "【导入探针】坏数"]
def purge_probes():
    st, rows = req("GET", "/api/works")
    if st == 200:
        for w in rows:
            if any(p in w["name"] for p in probe_names):
                req("DELETE", f"/api/works/{w['id']}")

try:
    st, r = multipart("x", "junk.csv", b"\xff\xfe\x00\x01binary garbage not csv")
    rec("PASS" if st in (400, 422, 200) else "FAIL", "二进制垃圾CSV导入",
        f"status={st} resp={str(r)[:90]}")

    st, r = multipart("x", "empty.csv", b"")
    rec("PASS" if st in (400, 422, 200) else "FAIL", "空文件导入", f"status={st} resp={str(r)[:90]}")

    csv_ok = ("工作名称,类型,状态,计划日期,花费时长(小时),预期收入(元),完成日期,实际时长(小时),实际收入(元),备注\n"
              "【导入探针】CSV,常规工作,待完成,2026-09-03,2,88,,,,\n").encode("utf-8-sig")
    st, r = multipart("x", "ok.csv", csv_ok)
    imported = isinstance(r, dict) and r.get("imported", 0) >= 1
    rec("PASS" if st == 200 and imported else "FAIL", "合法CSV导入生效", f"status={st} resp={str(r)[:90]}")

    bad_csv = ("工作名称,类型,状态,计划日期,花费时长(小时),预期收入(元)\n"
               "【导入探针】坏数,常规工作,待完成,2026-13-99,abc,xyz\n").encode("utf-8-sig")
    st, r = multipart("x", "bad.csv", bad_csv)
    handled = st in (400, 422) or (isinstance(r, dict) and (r.get("invalid", 0) or r.get("skipped", 0) or r.get("imported", 0) == 0))
    rec("PASS" if handled else "BUG", "坏值CSV被拒绝/计入invalid", f"status={st} resp={str(r)[:110]}")

    js_ok = json.dumps({"works": [{"name": "【导入探针】JSON", "work_type": "other",
                                    "duration_hours": 3, "planned_date": "2026-09-03",
                                    "expected_income": 66, "status": "pending"}]}, ensure_ascii=False).encode()
    st, r = multipart("x", "bk.json", js_ok)
    rec("PASS" if st == 200 else "FAIL", "合法JSON备份导入", f"status={st} resp={str(r)[:90]}")

    st, rows = req("GET", "/api/works")
    found = [w for w in rows if isinstance(w, dict) and ("【导入探针】CSV" in w["name"] or "【导入探针】JSON" in w["name"])]
    rec("PASS" if len(found) >= 2 else "FAIL", "导入数据可在API查见", f"n={len(found)}")
finally:
    purge_probes()

N1 = count_works()
rec("PASS" if N1 == N0 + len(created_ids) else "FAIL", "导入测试后行数符合预期(探针已清,临时数据稍后清)",
    f"rows {N0}->{N1} 临时未清={len(created_ids)}")
st, r = req("POST", "/api/data/import", None, raw_body=b'{"works":[]}', ctype="application/json")
rec("PASS" if st == 422 else "INFO", "非multipart导入 → 422", f"status={st}")

# ---------- F. monthly / push 边界 ----------
print("\n-- F. monthly / push --")
st, _ = req("POST", "/api/push/inbox/9999999/approve")
rec("PASS" if st in (404, 400, 422) else "FAIL", "approve 不存在inbox id", f"status={st}")
st, _ = req("PUT", "/api/monthly/settings", {"regular_income": -5, "other_income": "abc"})
rec("PASS" if st in (400, 422) else "BUG", "月薪配置负数/字符串 → 拒绝", f"status={st}")

# 部分更新语义测试（先存后还，防真实配置受损）
st, orig = req("GET", "/api/monthly/settings")
if st == 200 and isinstance(orig, dict):
    o_reg, o_oth, o_mk = orig.get("regular_income"), orig.get("other_income"), orig.get("month_key")
    st, after = req("PUT", "/api/monthly/settings", {"other_income": (o_oth or 0) + 1})
    zeroed = isinstance(after, dict) and after.get("regular_income") == 0 and (o_reg or 0) > 0
    rec("BUG" if zeroed else "PASS",
        "PUT部分字段→未提交字段被清零(应保留原值)",
        f"原regular={o_reg} PUT后={after.get('regular_income') if isinstance(after, dict) else '?'}")
    # 恢复原值（month_key 仅在原本合法时回传，避免 pattern 422 卡死恢复）
    restore = {"regular_income": o_reg or 0, "other_income": o_oth or 0}
    if isinstance(o_mk, str) and re.match(r"^\d{4}-(0[1-9]|1[0-2])$", o_mk):
        restore["month_key"] = o_mk
    st, back = req("PUT", "/api/monthly/settings", restore)
    ok = st == 200 and back.get("regular_income") == (o_reg or 0) and back.get("other_income") == (o_oth or 0)
    rec("PASS" if ok else "FAIL", "配置已恢复原值", f"regular={back.get('regular_income') if isinstance(back, dict) else '?'}")
else:
    rec("INFO", "settings 读取异常，跳过部分更新测试", f"status={st}")
st, _ = req("GET", "/api/monthly/works?date_from=2026-13-01")
rec("INFO", "monthly 过滤参数校验", f"status={st}")

# ---------- 清理 ----------
print("\n-- 清理 --")
leak = []
for wid in created_ids:
    st, _ = req("DELETE", f"/api/works/{wid}")
    if st not in (204, 404): leak.append((wid, st))
N2 = count_works()
rec("PASS" if not leak and N2 == N0 else "FAIL", f"临时数据全清 {len(created_ids)}条", f"rows {N0}->{N2} leak={leak[:3]}")
if xss_id:
    rec("INFO", "XSS探针已随清理删除(浏览器端验证另跑)", f"id={xss_id}")

# ---------- 汇总 ----------
f = [r for r in results if r[0] == "FAIL"]; b = [r for r in results if r[0] == "BUG"]
p = [r for r in results if r[0] == "PASS"]
print(f"\n== 汇总: {len(results)} 项 | PASS {len(p)} | BUG {len(b)} | FAIL {len(f)} | 备份: {DB or '未定位'} ==")
for tag, name, d in b + f: print(f"  [{tag}] {name} :: {d}")
sys.exit(1 if f else 0)
