/* test_stats_render.js — 无浏览器渲染桩测试
 * 用最小 DOM 桩执行 charts.js + stats.js，验证：
 * 1) 近8周组合图生成柱 + 折线 + 渐变/发光滤镜；
 * 2) statsSub 不再包含「平均单项收入」；
 * 3) 上月 / 今年至今面板与迷你构成图正常生成；
 * 4) 全程无运行时异常。
 */
const fs = require("fs");
const path = require("path");

function makeElem(name) {
  return {
    tagName: name,
    children: [],
    attrs: {},
    textContent: "",
    innerHTML: "",
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    classList: { contains: () => false },
  };
}

const elements = {};
function getEl(id) {
  if (!elements[id]) elements[id] = Object.assign(makeElem("div"), { id });
  return elements[id];
}

global.document = {
  createElementNS: (ns, name) => makeElem(name),
  getElementById: (id) => getEl(id),
  documentElement: {},
};
global.getComputedStyle = () => ({
  getPropertyValue: (n) =>
    ({ "--regular": "#38bdf8", "--other": "#f472b6", "--accent-2": "#a78bfa" }[n] || ""),
});

// —— 样例数据：覆盖上月 / 今年 / 本周 ——
const now = new Date();
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lmMid = new Date(now.getFullYear(), now.getMonth() - 1, 15);
const thisWeek = new Date(now.getTime() - 2 * 86400000);

global.Store = {
  getWorks: () => [
    { id: 1, status: "done", work_type: "regular", completed_date: iso(lmMid), actual_duration_hours: 8, actual_income: 2400 },
    { id: 2, status: "done", work_type: "other", completed_date: iso(lmMid), actual_duration_hours: 4, actual_income: 900 },
    { id: 3, status: "done", work_type: "regular", completed_date: iso(thisWeek), actual_duration_hours: 6, actual_income: 3000 },
    { id: 4, status: "pending", work_type: "other", planned_date: "2026-01-01", actual_income: 0 },
  ],
  getSummary: () => ({
    groups: [
      { type: "regular", label: "常规工作", hours: 14, income: 5400, count: 2, hourly_rate: 385.71 },
      { type: "other", label: "其他工作", hours: 4, income: 900, count: 1, hourly_rate: 225 },
    ],
    totals: { hours: 18, income: 6300, count: 3, hourly_rate: 350 },
    counts: { pending: 1, done: 3 },
  }),
  subscribe: () => {},
};
global.API = {
  getWeekly: async () =>
    Array.from({ length: 8 }, (_, i) => ({
      week_start: `w${i}`, label: `8/${i * 7 + 3}`,
      hours: i === 7 ? 6.5 : i * 0.5, income: i === 7 ? 3000 : i * 120,
    })),
};

const base = path.resolve(__dirname, "..", "frontend", "js");
const code =
  fs.readFileSync(path.join(base, "charts.js"), "utf8") + "\n" +
  fs.readFileSync(path.join(base, "stats.js"), "utf8") +
  "\n;globalThis.__exports = { Charts, Stats };";
eval(code);

const { Stats } = globalThis.__exports;

let failures = [];
const check = (name, cond) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + name);
  if (!cond) failures.push(name);
};

Stats.render().then(() => {
  const weekly = elements["chartWeekly"];
  const tags = (e) => e.children.map((c) => c.tagName);
  const allTags = (e) => {
    let out = [];
    const walk = (n) => { out.push(n.tagName); n.children.forEach(walk); };
    e.children.forEach(walk);
    return out;
  };

  check("副卡不含「平均单项收入」", !elements["statsSub"].innerHTML.includes("平均单项收入"));
  check("副卡含逾期待办", elements["statsSub"].innerHTML.includes("逾期待办"));
  check("组合图已渲染", weekly && weekly.children.length > 0);
  const wt = allTags(weekly);
  check("组合图含柱状 rect", wt.filter((t) => t === "rect").length >= 8);
  check("组合图含折线 path", wt.filter((t) => t === "path").length >= 2);
  check("组合图含发光节点 circle", wt.filter((t) => t === "circle").length >= 1);
  check("组合图含渐变 linearGradient", wt.filter((t) => t === "linearGradient").length >= 2);
  check("组合图含发光滤镜 filter", wt.filter((t) => t === "filter").length >= 2);
  check("组合图含双轴刻度（左右 text）", weekly.children.filter((c) => c.tagName === "text" && c.attrs["x"] === "852").length > 0);

  check("期间面板已生成", !!elements["statsPeriods"] && elements["statsPeriods"].innerHTML.length > 100);
  check("期间面板含「上月收入」", elements["statsPeriods"].innerHTML.includes("上月收入"));
  check("期间面板含「今年至今总收入」", elements["statsPeriods"].innerHTML.includes("今年至今总收入"));

  const lm = elements["chartLastMonth"];
  const ytd = elements["chartYtd"];
  check("上月迷你图已渲染", lm && allTags(lm).filter((t) => t === "rect").length >= 4);
  check("今年迷你图已渲染", ytd && allTags(ytd).filter((t) => t === "rect").length >= 4);

  // 上月 = 2400 + 900 = 3300
  check("上月总额正确(¥3,300)", elements["statsPeriods"].innerHTML.includes("3,300"));
  // YTD = 3300 + 3000 = 6300
  check("YTD 总额正确(¥6,300)", elements["statsPeriods"].innerHTML.includes("6,300"));

  console.log(failures.length ? `\n${failures.length} 项失败` : "\n全部通过");
  process.exit(failures.length ? 1 : 0);
}).catch((e) => {
  console.error("渲染异常:", e);
  process.exit(1);
});
