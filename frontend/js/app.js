/* app.js — 应用入口：初始化、Tab 切换、全部工作列表视图
 *
 * 启动流程：
 * 1. 绑定静态事件（Tab 切换 / 弹窗关闭 / 新建 / 刷新 / 列表筛选与排序）；
 * 2. Store.refresh() 拉取数据，各视图通过订阅自动渲染；
 * 3. 默认展示日程看板。
 *
 * 全部工作列表：类型/状态/日期筛选 + 表头排序（点击切换升降序）+
 * 逾期行高亮 + 底部合计行（工时 / 预期收入 / 实际收入）。
 */
const App = (() => {
  let sortKey = "planned_date";     // 当前排序字段
  let sortDir = "desc";             // asc / desc
  let activeTab = "kanban";         // 当前激活的 Tab

  /* ---------- 主题切换 ---------- */
  const THEME_KEY = "wd_theme";

  function currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  function syncThemeBtn() {
    // 图标表示「点击后切换到的主题」：深色时显示 ☀️，浅色时显示 🌙
    const btn = document.getElementById("btnTheme");
    if (!btn) return;
    const next = currentTheme() === "dark" ? "light" : "dark";
    btn.textContent = next === "light" ? "☀️" : "🌙";
    btn.title = next === "light" ? "切换到浅色主题" : "切换到深色主题";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    syncThemeBtn();
  }

  function bindTheme() {
    document.getElementById("btnTheme").addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 忽略 */ }
      applyTheme(next);
      Toast.show(next === "light" ? "已切换为浅色主题 ☀️" : "已切换为深色主题 🌙");
    });
  }

  /* ---------- Tab 切换 ---------- */
  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".view").forEach((v) =>
      v.classList.remove("active"));
    activeTab = name;
    document.getElementById(`view-${name}`).classList.add("active");
    if (location.hash !== `#${name}`) location.hash = name; // 支持刷新保持视图
    if (name === "stats") Stats.render();
    if (name === "list") renderList();
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => activateTab(tab.dataset.tab));
    });
    // 浏览器前进/后退时同步视图
    window.addEventListener("hashchange", () => {
      const name = location.hash.replace("#", "");
      if (["kanban", "stats", "list"].includes(name)) activateTab(name);
    });
  }

  /* ---------- 列表筛选与排序 ---------- */
  function filteredList() {
    const type = document.getElementById("filterType").value;
    const status = document.getElementById("filterStatus").value;
    const from = document.getElementById("filterFrom").value;
    const to = document.getElementById("filterTo").value;

    let list = Store.getWorks();
    if (type) list = list.filter((w) => w.work_type === type);
    if (status) list = list.filter((w) => w.status === status);
    if (from) list = list.filter((w) => w.planned_date >= from);
    if (to) list = list.filter((w) => w.planned_date <= to);

    // 排序（升降序），空值恒排最后
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      if (va === "" && vb === "") return 0;
      if (va === "") return 1;
      if (vb === "") return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "zh-CN") * dir;
    });
    return list;
  }

  /* ---------- 全部工作列表 ---------- */
  function renderList() {
    const today = new Date().toISOString().slice(0, 10);
    const list = filteredList();

    document.getElementById("listCount").textContent = `共 ${list.length} 项`;

    // 表头排序指示
    document.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.key === sortKey);
      th.classList.toggle("asc", th.dataset.key === sortKey && sortDir === "asc");
      th.classList.toggle("desc", th.dataset.key === sortKey && sortDir === "desc");
    });

    const tbody = document.getElementById("workTableBody");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">暂无数据</td></tr>`;
      document.getElementById("workTableFoot").innerHTML = "";
      return;
    }

    tbody.innerHTML = list.map((w) => {
      const isDone = w.status === "done";
      const overdue = !isDone && w.planned_date < today;
      // 延迟完成：已完成，但完成日期晚于计划日期
      const delayed = isDone && !!w.completed_date && !!w.planned_date && w.completed_date > w.planned_date;
      const hours = isDone ? (w.actual_duration_hours ?? w.duration_hours) : w.duration_hours;
      return `
      <tr class="${isDone ? "row-done" : ""} ${overdue ? "row-overdue" : ""} ${delayed ? "row-delayed" : ""}" data-id="${w.id}">
        <td class="cell-name" title="${escAttr(w.notes || w.name)}">
          ${escHtml(w.name)}
          ${overdue ? '<span class="overdue-badge">逾期</span>' : ""}
          ${delayed ? '<span class="delayed-badge">延迟完成</span>' : ""}
        </td>
        <td><span class="badge ${w.work_type === "regular" ? "tag-regular" : "tag-other"}" style="display:inline-block">${Store.TYPE_LABEL[w.work_type]}</span></td>
        <td><span class="badge badge-status ${w.status}">${isDone ? "已完成" : "待完成"}</span></td>
        <td class="num">${w.planned_date}</td>
        <td class="num">${hours}h</td>
        <td class="num">¥ ${w.expected_income.toLocaleString()}</td>
        <td class="num">${w.completed_date || "—"}</td>
        <td class="num">${isDone ? "¥ " + (w.actual_income ?? 0).toLocaleString() : "—"}</td>
        <td>
          <div class="row-actions">
            ${isDone
              ? `<button class="mini" data-act="edit">编辑</button>
                 <button class="mini" data-act="reopen">重新打开</button>`
              : `<button class="mini done" data-act="complete">完成</button>
                 <button class="mini" data-act="edit">编辑</button>`}
            <button class="mini del" data-act="del">删除</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    // 底部合计行
    const planHours = list.reduce((s, w) => s + (w.duration_hours || 0), 0);
    const expectIncome = list.reduce((s, w) => s + (w.expected_income || 0), 0);
    const actualHours = list.reduce(
      (s, w) => s + (w.status === "done" ? (w.actual_duration_hours || 0) : 0), 0);
    const actualIncome = list.reduce(
      (s, w) => s + (w.status === "done" ? (w.actual_income || 0) : 0), 0);
    document.getElementById("workTableFoot").innerHTML = `
      <tr>
        <td colspan="4">合计（筛选结果 ${list.length} 项）</td>
        <td class="num">${planHours}h<span class="foot-sub"> / 实际 ${actualHours}h</span></td>
        <td class="num">¥ ${expectIncome.toLocaleString()}</td>
        <td class="num"></td>
        <td class="num">¥ ${actualIncome.toLocaleString()}</td>
        <td></td>
      </tr>`;

    // 行内操作按钮
    tbody.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tr = btn.closest("tr");
        const work = Store.getWorks().find((w) => w.id === Number(tr.dataset.id));
        if (!work) return;
        const act = btn.dataset.act;
        if (act === "edit") Modal.openEdit(work);
        else if (act === "complete") Modal.openWorkActions(work);
        else if (act === "reopen") reopen(work);
        else if (act === "del") Modal.confirmDelete(work);
      });
    });

    // 点击行（非按钮区域）打开操作弹窗
    tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("click", () => {
        const work = Store.getWorks().find((w) => w.id === Number(tr.dataset.id));
        if (work) Modal.openWorkActions(work);
      });
    });
  }

  /* ---------- 表头排序 ---------- */
  function bindSort() {
    document.querySelectorAll("th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = key;
          sortDir = key === "name" ? "asc" : "desc";
        }
        renderList();
      });
    });
  }

  async function reopen(work) {
    try {
      await API.reopenWork(work.id);
      Toast.show("已恢复为待完成", "ok");
      await Store.refresh();
    } catch (e) { Toast.show(e.message, "err"); }
  }

  function escHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  const escAttr = escHtml;

  /* ---------- 顶部欢迎横幅：问候语 + 实时时钟 ---------- */
  const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];
  const MONTH_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const WEEKDAY_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  function renderHeroBanner() {
    const now = new Date();
    const greetEl = document.getElementById("heroGreet");
    const NORMAL_TEXT = "为人民服务";
    const EGG_TEXT = "我是一台无情的赚钱机器 💰";

    // 彩蛋：点击切换文案
    if (!greetEl.dataset.bound) {
      greetEl.dataset.bound = "1";
      greetEl.style.cursor = "pointer";
      greetEl.title = "点击有惊喜";
      greetEl.addEventListener("click", () => {
        const isEgg = greetEl.dataset.egg === "1";
        greetEl.dataset.egg = isEgg ? "0" : "1";
        greetEl.classList.toggle("hero-egg", !isEgg);
        greetEl.textContent = isEgg ? NORMAL_TEXT : EGG_TEXT;
        // 切换弹出动画
        greetEl.classList.remove("hero-pop");
        void greetEl.offsetWidth;
        greetEl.classList.add("hero-pop");
        setTimeout(() => greetEl.classList.remove("hero-pop"), 550);
      });
    }
    greetEl.textContent = greetEl.dataset.egg === "1" ? EGG_TEXT : NORMAL_TEXT;
    if (greetEl.dataset.egg === "1") greetEl.classList.add("hero-egg");

    const wd = now.getDay();
    const left = wd === 0 ? 0 : 6 - wd; // 距周末剩余天数（周日=0）
    const dateStr =
      `今天是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK_CN[wd]}` +
      (left > 0 ? ` · 距周末还有 ${left} 天` : " · 周末快乐");
    document.getElementById("heroSub").textContent = dateStr;

    document.getElementById("clockDate").textContent =
      `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${WEEKDAY_EN[wd]}`;

    const tick = () => {
      const t = new Date();
      document.getElementById("clockTime").textContent =
        `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    // 顶栏日期
    const d = new Date();
    document.getElementById("todayChip").textContent =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 周${WEEK_CN[d.getDay()]}`;

    renderHeroBanner();

    bindTabs();
    bindSort();
    bindTheme();
    syncThemeBtn();
    // 初始视图：读取 URL hash（如 #stats），默认看板
    const initTab = location.hash.replace("#", "");
    if (["kanban", "stats", "list"].includes(initTab) && initTab !== "kanban") {
      activateTab(initTab);
    }
    // 看板视图：?view=week|month（默认周视图）
    const initView = new URLSearchParams(location.search).get("view");
    if (initView === "month" || initView === "week") {
      Kanban.setView(initView);
    }

    // 弹窗关闭：点遮罩 / 关闭按钮
    const mask = document.getElementById("workModalMask");
    mask.addEventListener("click", (e) => {
      if (e.target === mask || e.target.closest("[data-close]")) Modal.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") Modal.close();
    });

    // 新建 / 刷新 / 导入 / 导出按钮
    document.getElementById("btnNewWork").addEventListener("click", () => Modal.openCreate());
    document.getElementById("btnImport").addEventListener("click", () => Modal.openImport());
    document.getElementById("btnExport").addEventListener("click", () => Modal.openExport());
    const btnRefresh = document.getElementById("btnRefresh");
    btnRefresh.addEventListener("click", async () => {
      btnRefresh.classList.add("spin");
      try {
        await Store.refresh();
        Toast.show("数据已刷新 ✔", "ok");
      } catch (e) {
        Toast.show("刷新失败：" + e.message, "err");
      } finally {
        btnRefresh.classList.remove("spin");
      }
    });

    // 列表筛选
    ["filterType", "filterStatus", "filterFrom", "filterTo"].forEach((id) => {
      document.getElementById(id).addEventListener("change", renderList);
    });
    document.getElementById("btnClearFilter").addEventListener("click", () => {
      ["filterType", "filterStatus", "filterFrom", "filterTo"].forEach((id) => {
        document.getElementById(id).value = "";
      });
      renderList();
    });
    // 数据变更后列表自动刷新（仅在列表视图可见时）
    Store.subscribe(() => {
      if (activeTab === "list") renderList();
    });

    Kanban.bind();
    Stats.bind();

    // 首次加载数据（失败时给出提示）
    try {
      await Store.refresh();
    } catch (e) {
      Toast.show("无法连接后端服务：" + e.message, "err");
    }
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => App.init());
