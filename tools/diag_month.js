/* diag_month.js — 诊断月视图渲染的 class 与日期 */
const { spawn } = require("child_process");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9231;
const APP = "http://127.0.0.1:8000/";
const USER_DIR = path.join(__dirname, "..", "data", ".edge-dw2");
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
  await send("Page.enable"); await send("Runtime.enable");
  for (let i = 0; i < 40; i++) { if (await evalJS(`document.readyState === "complete" && !!document.querySelector("#btnNewWork")`)) break; await sleep(250); }

  // 直接通过 JS 调 Kanban 切换月视图（不走 URL 刷新）
  const r1 = await evalJS(`(() => {
    Kanban.setView("month");
    const cells = [...document.querySelectorAll(".kanban-day.month")];
    return {
      view: document.getElementById("kanban").className,
      total: cells.length,
      weekend: cells.filter(c => c.classList.contains("weekend")).length,
      sample: cells.slice(0, 8).map(c => ({ d: c.dataset.date, cls: c.className })),
    };
  })()`);
  console.log("direct setView:", JSON.stringify(r1, null, 2));

  // 再试 URL ?view=month 方式
  const r2 = await evalJS(`(async () => {
    location.search = "?view=month";
    await new Promise(r => setTimeout(r, 800));
    const cells = [...document.querySelectorAll(".kanban-day.month")];
    return {
      url: location.href,
      view: document.getElementById("kanban").className,
      total: cells.length,
      weekend: cells.filter(c => c.classList.contains("weekend")).length,
    };
  })()`);
  console.log("url setView:", JSON.stringify(r2, null, 2));

  ws.close(); edge.kill();
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
