/* 截图验证：搬砖小人动画（不同相位）+ 深浅主题 + console 异常检测 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9225;
const APP = "http://127.0.0.1:8000/";
const USER_DIR = path.join(__dirname, "..", "data", ".edge-mascot");
const SHOT_DIR = path.join(__dirname, "..", "data", "screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DIR}`,
    "--window-size=1920,1300", "--disable-gpu", "--no-first-run", "--force-device-scale-factor=1", APP,
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
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJS = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const p = path.join(SHOT_DIR, name);
    fs.writeFileSync(p, Buffer.from(r.result.data, "base64"));
    return p;
  };
  const ready = async () => { for (let i = 0; i < 40; i++) { if (await evalJS(`document.readyState === "complete" && !!document.querySelector("#btnNewWork")`)) return; await sleep(250); } };

  await send("Page.enable"); await send("Runtime.enable");
  await ready();

  const out = {};
  // 深色：去程抱砖（约 1.0s 时）
  await evalJS(`document.documentElement.dataset.theme = "dark"; true`);
  await sleep(300);
  await evalJS(`location.reload(); true`); await ready();
  await sleep(1000);
  out["深色-去程抱砖"] = await shot("mascot-dark-carry.png");
  // 深色：到达放砖（约 2.0s：mWalk 40%=1.68s 停住）
  await sleep(1000);
  out["深色-到达放砖"] = await shot("mascot-dark-drop.png");
  // 浅色
  await evalJS(`document.documentElement.dataset.theme = "light"; location.reload(); true`); await ready();
  await sleep(1500);
  out["浅色"] = await shot("mascot-light.png");
  // 整页看板（深色）确认整体设计
  await evalJS(`document.documentElement.dataset.theme = "dark"; location.reload(); true`); await ready();
  await sleep(1800);
  out["深色-整页看板"] = await shot("mascot-dark-fullboard.png");
  // 统计页
  await evalJS(`location.hash = "#stats"; true`);
  await sleep(900);
  out["深色-统计页"] = await shot("mascot-dark-stats.png");
  // 交互元素 DOM 检查
  out["DOM检查"] = await evalJS(`(() => {
    const m = document.querySelector('.mascot-strip');
    return {
      strip: !!m,
      svg: !!document.querySelector('.mascot-svg'),
      man: !!document.querySelector('.brickman-walk'),
      hand: !!document.querySelector('.brick-hand'),
      grow: !!document.querySelector('.brick-grow'),
      title: document.querySelector('.mascot-text b')?.textContent,
      tag: document.querySelector('.mascot-tag')?.textContent,
    };
  })()`);
  out["console错误"] = errors.length ? errors : "无";
  console.log(JSON.stringify(out, null, 2));
  ws.close(); edge.kill();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
