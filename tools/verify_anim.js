/* 验证搬砖小人动画确实在运行：不同时间点读取 computed transform */
const { spawn } = require("child_process");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9226;
const APP = "http://127.0.0.1:8000/";
const USER_DIR = path.join(__dirname, "..", "data", ".edge-anim");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DIR}`,
    "--window-size=1920,1200", "--disable-gpu", "--no-first-run", APP], { stdio: "ignore" });
  let targets = null;
  for (let i = 0; i < 30; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); targets = await r.json(); if (targets.length) break; } catch {} await sleep(500); }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJS = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
  await send("Page.enable"); await send("Runtime.enable");
  for (let i = 0; i < 40; i++) { if (await evalJS(`document.readyState === "complete" && !!document.querySelector("#btnNewWork")`)) break; await sleep(250); }

  const sample = async (label, at) => {
    await sleep(at);
    const r = await evalJS(`(() => {
      const w = getComputedStyle(document.querySelector('.brickman-walk')).transform;
      const f = getComputedStyle(document.querySelector('.brickman-flip')).transform;
      const h = getComputedStyle(document.querySelector('.brick-hand')).opacity;
      const g = getComputedStyle(document.querySelector('.brick-grow')).opacity;
      const bob = getComputedStyle(document.querySelector('.brickman-bob')).transform;
      const leg = getComputedStyle(document.querySelector('.leg-l')).transform;
      return { walk: w, flip: f, hand: h, grow: g, bob, leg };
    })()`);
    console.log(`[${label}]`, JSON.stringify(r));
  };

  // 动画周期 4.2s：去程 40%=1.68s 到达，50%=2.1s 转身，90%=3.78s 回到起点
  await sample("t≈1.2s 去程中段", 1200);
  await sample("t≈2.0s 到达放砖", 800);
  await sample("t≈3.2s 回程", 1200);
  await sample("t≈4.5s 新周期去程", 1300);
  ws.close(); edge.kill();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
