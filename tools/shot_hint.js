/* 生成带「恢复提示条」的最终截图 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9224;
const APP = "http://127.0.0.1:8000/?theme=light";
const USER_DIR = path.join(__dirname, "..", "data", ".edge-verify2");
const SHOT = path.join(__dirname, "..", "data", "screenshots", "restore-hint-light.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DIR}`,
    "--window-size=1920,1200", "--disable-gpu", "--no-first-run", APP,
  ], { stdio: "ignore" });
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
  const ready = async () => { for (let i = 0; i < 40; i++) { if (await evalJS(`document.readyState === "complete" && !!document.querySelector("#btnNewWork")`)) return; await sleep(250); } };
  await ready();
  await evalJS(`localStorage.setItem('wd_last_regular', JSON.stringify({name:'客户方案设计', duration_hours:2.5, expected_income:800, notes:'上次填写的备注内容'})); location.reload(); true`);
  await ready();
  await evalJS(`document.getElementById('btnNewWork').click(); true`);
  await sleep(600);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT, Buffer.from(shot.result.data, "base64"));
  console.log("saved:", SHOT);
  ws.close(); edge.kill();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
