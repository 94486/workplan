/* shot_polish.js — 验证设计升级后的页面渲染：hero 横幅 / 深浅主题 / 三个视图
 * 截图输出到 data/screenshots/polish-*.png，并打印关键 DOM 检查结果
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9230;
const APP = "http://127.0.0.1:8000/";
const USER_DIR = path.join(__dirname, "..", "data", ".edge-polish");
const SHOT_DIR = path.join(__dirname, "..", "data", "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DIR}`,
    "--window-size=1920,1200", "--disable-gpu", "--no-first-run",
    "--force-device-scale-factor=1", APP,
  ], { stdio: "ignore" });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); targets = await r.json(); if (targets.length) break; } catch {}
    await sleep(500);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJS = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result.result.value;
  };
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    const f = path.join(SHOT_DIR, name);
    fs.writeFileSync(f, Buffer.from(s.result.data, "base64"));
    console.log("saved:", name);
  };
  const waitFor = async (expr, tries = 60) => {
    for (let i = 0; i < tries; i++) { if (await evalJS(expr)) return true; await sleep(250); }
    return false;
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  await waitFor(`document.readyState === "complete" && !!document.querySelector("#kanban .kanban-day")`);

  // ---------- 1. 深色 · 看板周视图 ----------
  await sleep(700);
  console.log("greet:", await evalJS(`document.getElementById("heroGreet").textContent`));
  console.log("sub  :", await evalJS(`document.getElementById("heroSub").textContent`));
  const t1 = await evalJS(`document.getElementById("clockTime").textContent`);
  await sleep(1200);
  const t2 = await evalJS(`document.getElementById("clockTime").textContent`);
  console.log("clock tick:", t1, "->", t2, t1 !== t2 ? "(运行中 ✓)" : "(静止 ✗)");
  console.log("mascot removed:", await evalJS(`!document.querySelector(".mascot-strip, .brickman-walk")`));
  await shot("polish-dark-kanban.png");

  // ---------- 2. 浅色 · 看板周视图 ----------
  await evalJS(`localStorage.setItem("wd_theme","light"); location.reload(); true`);
  await waitFor(`document.readyState === "complete" && !!document.querySelector("#kanban .kanban-day")`);
  await sleep(700);
  await shot("polish-light-kanban.png");

  // ---------- 3. 深色 · 统计视图（主卡图标） ----------
  await evalJS(`localStorage.setItem("wd_theme","dark"); location.reload(); true`);
  await waitFor(`document.readyState === "complete" && !!document.querySelector("#kanban .kanban-day")`);
  await sleep(400);
  await evalJS(`location.hash = "stats"; true`);
  await waitFor(`!!document.querySelector("#statsHero .stat-icon") && !!document.querySelector("#statsHero .stat-value")`);
  await sleep(800);
  console.log("stat icons:", await evalJS(`document.querySelectorAll("#statsHero .stat-icon").length`));
  await shot("polish-dark-stats.png");

  // ---------- 4. 深色 · 全部工作列表 ----------
  await evalJS(`location.hash = "list"; true`);
  await waitFor(`!!document.querySelector("#workTable tbody tr")`);
  await sleep(600);
  console.log("table rows:", await evalJS(`document.querySelectorAll("#workTable tbody tr").length`));
  await shot("polish-dark-list.png");

  // ---------- 5. 深色 · 月视图 ----------
  await send("Page.navigate", { url: `${APP}?view=month#kanban` });
  await waitFor(`document.readyState === "complete" && !!document.querySelector("#kanban.month-grid")`);
  await sleep(600);
  console.log("month hero exists:", await evalJS(`!!document.getElementById("heroBanner")`));
  await evalJS(`window.scrollTo(0, 0); true`);
  await sleep(400);
  await shot("polish-dark-month.png");

  console.log("console errors:", errors.length ? errors : "none ✓");
  ws.close(); edge.kill();
  console.log("ALL DONE");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
