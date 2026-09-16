"""数据库层：基于 SQLite 的本地 DB 文件存储。

设计要点：
- 通过环境变量 WORK_DB_PATH 指定 DB 文件路径（Docker 部署时映射到数据卷）。
- 未设置时默认使用项目根目录 data/works.db，保证打包成 exe 后仍可本地读写。
- 每个操作使用独立连接（短连接），避免多线程共享连接问题，简单可靠。
- 提供 init_db() 幂等初始化，首次启动自动建表并写入演示数据（可选）。
"""

import os
import sqlite3
import sys
from pathlib import Path
from datetime import datetime


def get_project_root() -> Path:
    """项目根目录。

    - 源码运行：backend 的上一级目录。
    - PyInstaller 打包后：exe 所在目录（保证数据落在用户可见位置，
      而不是 _MEIPASS 临时目录——临时目录会在退出后清空导致数据丢失）。
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


PROJECT_ROOT = get_project_root()

# 数据文件路径：优先使用环境变量，默认 data/works.db
def get_db_path() -> Path:
    env_path = os.environ.get("WORK_DB_PATH", "")
    if env_path:
        p = Path(env_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    data_dir = PROJECT_ROOT / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "works.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS works (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,                    -- 工作名称
    work_type     TEXT    NOT NULL DEFAULT 'regular',  -- 类型: regular=常规 / other=其他
    duration_hours REAL   NOT NULL DEFAULT 0,          -- 花费时长(小时, 计划)
    planned_date  TEXT    NOT NULL,                    -- 计划完成日期 YYYY-MM-DD
    expected_income REAL  NOT NULL DEFAULT 0,          -- 预期收入(元)
    notes         TEXT    NOT NULL DEFAULT '',         -- 备注
    status        TEXT    NOT NULL DEFAULT 'pending',  -- 状态: pending=待完成 / done=已完成
    actual_duration_hours REAL,                        -- 实际花费时长(小时)
    completed_date TEXT,                               -- 完成日期 YYYY-MM-DD
    actual_income REAL,                                -- 实际收入(元)
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_works_planned_date ON works(planned_date);
CREATE INDEX IF NOT EXISTS idx_works_status        ON works(status);
CREATE INDEX IF NOT EXISTS idx_works_work_type     ON works(work_type);

CREATE TABLE IF NOT EXISTS presets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,                    -- 预设名称（展示用，通常同工作名）
    work_type       TEXT    NOT NULL DEFAULT 'regular',  -- 类型: regular=常规工作, other=其他工作
    duration_hours  REAL    NOT NULL DEFAULT 0,          -- 花费时长(小时)
    expected_income REAL    NOT NULL DEFAULT 0,          -- 预期收入(元)
    notes           TEXT    NOT NULL DEFAULT '',         -- 备注
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_presets_work_type ON presets(work_type);

-- ============================================================
-- 月薪模式（独立数据，与日薪模式完全隔离，互不干扰）
-- 任务无每日收入字段：收入按「上月常规收入 + 上月其它收入」整体核算
-- ============================================================

CREATE TABLE IF NOT EXISTS monthly_works (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    work_type     TEXT    NOT NULL DEFAULT 'regular',
    duration_hours REAL   NOT NULL DEFAULT 0,
    planned_date  TEXT    NOT NULL,
    notes         TEXT    NOT NULL DEFAULT '',
    status        TEXT    NOT NULL DEFAULT 'pending',
    actual_duration_hours REAL,
    completed_date TEXT,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mworks_planned_date ON monthly_works(planned_date);
CREATE INDEX IF NOT EXISTS idx_mworks_status        ON monthly_works(status);
CREATE INDEX IF NOT EXISTS idx_mworks_work_type     ON monthly_works(work_type);

CREATE TABLE IF NOT EXISTS monthly_presets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    work_type       TEXT    NOT NULL DEFAULT 'regular',
    duration_hours  REAL    NOT NULL DEFAULT 0,
    notes           TEXT    NOT NULL DEFAULT '',
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mpresets_work_type ON monthly_presets(work_type);

CREATE TABLE IF NOT EXISTS monthly_settings (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    month_key      TEXT    NOT NULL DEFAULT '',
    regular_income REAL    NOT NULL DEFAULT 0,
    other_income   REAL    NOT NULL DEFAULT 0,
    updated_at     TEXT    NOT NULL
);

-- ============================================================
-- 数据对接（外部程序推送）：对接码 + 待审查箱
-- 外部程序通过对接码推送数据 → 进入待审查箱（不直接入库）
-- 用户审查后在界面「接收合并」→ 以合并模式写入正式表，或「丢弃」
-- ============================================================

CREATE TABLE IF NOT EXISTS push_config (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    api_key    TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_inbox (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    payload      TEXT    NOT NULL,                 -- 推送的完整 JSON 快照（含 source/pushed_at/data）
    record_count INTEGER NOT NULL DEFAULT 0,       -- 可识别记录数（供界面展示）
    status       TEXT    NOT NULL DEFAULT 'pending', -- pending / merged / discarded
    received_at  TEXT    NOT NULL,
    merged_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_inbox_status ON push_inbox(status);
"""


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_conn() -> sqlite3.Connection:
    """返回一个新的数据库连接（调用方负责 close）。"""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def query_all(sql: str, params: tuple = ()) -> list[dict]:
    """查询多行，返回 dict 列表。"""
    conn = get_conn()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def query_one(sql: str, params: tuple = ()) -> dict | None:
    """查询单行，返回 dict 或 None。"""
    conn = get_conn()
    try:
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def execute(sql: str, params: tuple = ()) -> int:
    """执行写操作，返回 lastrowid。"""
    conn = get_conn()
    try:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def init_db(with_demo: bool = False) -> None:
    """初始化数据库：建表；可选写入演示数据。"""
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        count = conn.execute("SELECT COUNT(*) AS c FROM works").fetchone()["c"]
        if count == 0 and with_demo:
            _seed_demo(conn)
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    """轻量兼容迁移：为已存在的旧表补充/清理列（CREATE IF NOT EXISTS 不会加列）。

    推送识别字段（source / pushed_at）不建立独立数据库列：它们随 payload
    完整快照保存，仅用于待审查箱的识别展示。旧版本遗留的独立列在此清理；
    用 PRAGMA 探测避免重复操作，DROP 失败（旧版 SQLite / 列被引用）则忽略，
    空列保留不影响功能。
    """
    existing = {r["name"] for r in conn.execute("PRAGMA table_info(push_inbox)").fetchall()}
    for col in ("source", "pushed_at", "device", "username"):
        if col in existing:
            try:
                conn.execute(f"ALTER TABLE push_inbox DROP COLUMN {col}")
            except sqlite3.OperationalError:
                pass  # 旧版 SQLite 不支持 DROP COLUMN 时保留，不影响功能


def _seed_demo(conn: sqlite3.Connection) -> None:
    """写入一组演示数据，便于首次打开直接看到界面效果。"""
    now = now_str()
    samples = [
        # (name, work_type, duration, planned, expected, notes, status, actual_dur, completed, actual_income)
        ("编写周报", "regular", 1.5, _d(-1), 0, "每周五提交", "done", 1.0, _d(-1), 0),
        ("客户方案设计", "regular", 6.0, _d(0), 3000, "含架构与原型", "done", 5.5, _d(0), 3000),
        ("代码评审", "regular", 2.0, _d(1), 800, "评审 3 个 PR", "pending", None, None, None),
        ("公众号文章撰写", "other", 4.0, _d(2), 1500, "科技类选题", "pending", None, None, None),
        ("技术分享直播", "other", 2.5, _d(3), 1200, "线上直播 1 小时", "pending", None, None, None),
        ("数据库优化", "regular", 5.0, _d(4), 2000, "慢查询治理", "pending", None, None, None),
        ("视频剪辑", "other", 3.0, _d(5), 600, "B 站更新", "pending", None, None, None),
        ("团队月度复盘", "regular", 1.0, _d(6), 0, "月度例会", "pending", None, None, None),
    ]
    for s in samples:
        conn.execute(
            """INSERT INTO works
               (name, work_type, duration_hours, planned_date, expected_income, notes,
                status, actual_duration_hours, completed_date, actual_income, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (*s, now, now),
        )


def _d(offset: int) -> str:
    """返回今天 + offset 天的日期字符串，用于演示数据。"""
    from datetime import timedelta
    return (datetime.now() + timedelta(days=offset)).strftime("%Y-%m-%d")
