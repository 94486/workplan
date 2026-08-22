/* verify_delayed_weekend.js — 验证「延迟完成」标记 + 月视图周末差异化 + 问候语
 * 流程：造一条延迟完成数据 → 列表视图检查徽章/行样式 → 月视图检查 weekend 类
 *       → 检查问候语 → 截图（深色列表 / 深色月 / 浅色月）→ 清理测试数据
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9230;
const APP = "http://127.0.0.1:8000/";
const USER_DIR = path.join(__dirname, "..", "data", ".edge-dw");
const SHOT_DIR = path.join(__dirname, "..", "data", "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DIR}`, "--window-size=1920,1200", "--disable-gpu",
    "--no-first-run", APP], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); targets = await r.json(); if (targets.length) break; } catch {}
    await sleep(500);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJS = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
  const waitFor = async (expr, tries = 50) => { for (let i = 0; i < tries; i++) { if (await evalJS(expr)) return true; await sleep(250); } return false; };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    const p = path.join(SHOT_DIR, name);
    fs.writeFileSync(p, Buffer.from(s.result.data, "base64"));
    console.log("saved:", p);
  };

  await send("Page.enable"); await send("Runtime.enable");
  await waitFor(`document.readyState === "complete" && !!document.querySelector("#btnNewWork")`);

  // 默认以深色主题验证，避免系统偏好影响
  await evalJS(`document.documentElement.dataset.theme = "dark"; localStorage.setItem("wd_theme", "dark"); true`);

  // ---- 1. 通过页面 fetch 创建「延迟完成」测试数据（计划 08-19，今天 08-21 完成） ----
  const createRes = await evalJS(`fetch("/api/works", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "延迟完成测试·计划19日", work_type: "regular", duration_hours: 2, planned_date: "2026-08-19", expected_income: 300, notes: "验证用" }) })
    .then(r => r.json()).then(j => j.id)`);
  console.log("created test work id:", createRes);
  const complRes = await evalJS(`fetch("/api/works/${createRes}/complete", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actual_duration_hours: 3, completed_date: "2026-08-21", actual_income: 320 }) }).then(r => r.json()).then(j => j.id)`);
  console.log("completed test work id:", complRes);

  // ---- 2. 列表视图：延迟完成徽章 + 行样式 ----
  await evalJS(`location.hash = "list"; location.reload(); true`);
  await waitFor(`document.readyState === "complete" && !!document.querySelector("#workTableBody")`);
  await waitFor(`!!document.querySelector(".delayed-badge")`);
  const listChecks = await evalJS(`(() => {
    const badge = document.querySelector(".delayed-badge");
    const tr = document.querySelector("tr.row-delayed");
    return {
      badgeText: badge ? badge.textContent : null,
      rowExists: !!tr,
      rowDone: tr ? tr.classList.contains("row-done") : false,
      badgeColor: badge ? getComputedStyle(badge).color : null,
    };
  })()`);
  console.log("list checks:", JSON.stringify(listChecks));
  await sleep(400);
  await shot("delayed-list-dark.png");

  // ---- 3. 月视图：周末差异化（直接导航到 ?view=month#kanban，避免连续导航竞态） ----
  await send("Page.navigate", { url: `${APP}?view=month#kanban` });
  await waitFor(`document.readyState === "complete" && !!document.querySelector("#kanban.month-grid")`);
  await waitFor(`document.querySelectorAll(".kanban-day.month.weekend").length > 0`);
  const monthChecks = await evalJS(`(() => {
    const w = document.querySelectorAll(".kanban-day.month.weekend");
    const wd = document.querySelectorAll(".kanban-day.month.weekend .month-date");
    const today = document.querySelector(".kanban-day.month.today");
    const todayIsWeekend = today ? today.classList.contains("weekend") : null;
    return { weekendCount: w.length, firstWeekendDate: wd.length ? wd[0].textContent : null, todayIsWeekend };
  })()`);
  console.log("month checks:", JSON.stringify(monthChecks));
  await sleep(600);
  await shot("delayed-month-dark.png");

  // 浅色主题月视图
  await evalJS(`document.documentElement.dataset.theme = "light"; localStorage.setItem("wd_theme", "light"); true`);
  await sleep(500);
  await shot("delayed-month-light.png");

  // ---- 4. 问候语 ----
  const greet = await evalJS(`document.getElementById("heroGreet").textContent`);
  console.log("greeting:", greet);

  // ---- 5. 清理测试数据 ----
  await evalJS(`fetch("/api/works/${createRes}", { method: "DELETE" }).then(r => r.ok)`);
  console.log("test work cleaned up");

  ws.close(); edge.kill();
  const ok = listChecks.badgeText === "延迟完成" && listChecks.rowExists && listChecks.rowDone
    && monthChecks.weekendCount === 10 && greet === "为人民服务";
  console.log(ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
