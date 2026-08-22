/* 验证「常规工作录入记忆」全流程（CDP 驱动无头 Edge）
 * 场景1：预设记忆 → 打开新建弹窗 → 检查预填+提示条
 * 场景2：输入即记忆（不点保存，仅触发 input → localStorage 已更新）
 * 场景3：点击清空重填 → 字段清空 + localStorage 清除
 * 场景4：截图
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9223;
const APP = "http://127.0.0.1:8000/";
const USER_DIR = path.join(__dirname, "..", "data", ".edge-verify");
const SHOT = path.join(__dirname, "..", "data", "screenshots", "restore-hint.png");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const edge = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DIR}`, "--window-size=1920,1200",
    "--disable-gpu", "--no-first-run", "--no-default-browser-check", APP,
  ], { stdio: "ignore", detached: false });

  // 等待调试端口就绪
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      if (targets.length) break;
    } catch (e) { /* retry */ }
    await sleep(500);
  }
  if (!targets || !targets.length) throw new Error("CDP 端口未就绪");

  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJS = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error("eval 异常: " + JSON.stringify(r.result.exceptionDetails));
    return r.result ? r.result.result.value : undefined;
  };
  const waitReady = async () => {
    for (let i = 0; i < 40; i++) {
      const ok = await evalJS(`document.readyState === "complete" && !!document.querySelector("#btnNewWork")`);
      if (ok) return;
      await sleep(250);
    }
    throw new Error("页面加载超时");
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await waitReady();
  const results = {};

  // ---- 场景1：预设记忆 → 打开弹窗 ----
  await evalJS(`localStorage.setItem('wd_last_regular', JSON.stringify({
    name:'客户方案设计', duration_hours:2.5, expected_income:800, notes:'上次填写的备注内容'})); location.reload(); true`);
  await waitReady();
  await evalJS(`document.getElementById('btnNewWork').click(); true`);
  await sleep(400);
  results["场景1 预填"] = await evalJS(`(() => {
    const g = (id) => document.getElementById(id).value;
    return {
      name: g('fName'), dur: g('fDur'), planned: g('fPlanned'), income: g('fIncome'),
      notes: g('fNotes'), hint: !!document.querySelector('.restore-hint'),
      hintText: document.querySelector('.restore-hint span')?.textContent || '',
      toast: document.getElementById('toast').textContent,
    };
  })()`);

  // ---- 场景2：输入即记忆（不保存） ----
  await evalJS(`(() => {
    const n = document.getElementById('fName'); n.value = '周报整理';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(200);
  results["场景2 输入即记忆"] = await evalJS(`JSON.parse(localStorage.getItem('wd_last_regular') || 'null')`);

  // ---- 场景3：清空重填 ----
  await evalJS(`document.getElementById('btnClearLast').click(); true`);
  await sleep(200);
  results["场景3 清空后"] = await evalJS(`(() => {
    const g = (id) => document.getElementById(id).value;
    return {
      name: g('fName'), dur: g('fDur'), income: g('fIncome'), notes: g('fNotes'),
      memory: localStorage.getItem('wd_last_regular'),
      hintGone: !document.querySelector('.restore-hint'),
      toast: document.getElementById('toast').textContent,
    };
  })()`);

  // ---- 场景4：重新填回内容并截图（展示提示条） ----
  await evalJS(`(() => {
    const n = document.getElementById('fName'); n.value = '客户方案设计';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('fDur').value = 2.5;
    document.getElementById('fIncome').value = 800;
    document.getElementById('fNotes').value = '上次填写的备注内容';
    return true;
  })()`);
  await sleep(300);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(SHOT, Buffer.from(shot.result.data, "base64"));
  results["截图"] = SHOT;

  console.log(JSON.stringify(results, null, 2));
  ws.close();
  edge.kill();
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
