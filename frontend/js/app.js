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

  const ICON_MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const ICON_WALLET = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>';
  const ICON_BRIEFCASE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';

  // 列表行内操作图标（L3：文字按钮 → 图标按钮，配 title 提示）
  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICON_REOPEN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function syncThemeBtn() {
    // 图标表示「点击后切换到的主题」：深色时显示 ☀️（用 SVG），浅色时显示 🌙（用 SVG）
    const btn = document.getElementById("btnTheme");
    if (!btn) return;
    const next = currentTheme() === "dark" ? "light" : "dark";
    btn.innerHTML = next === "light" ? ICON_SUN : ICON_MOON;
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
      Toast.show(next === "light" ? "已切换为浅色主题" : "已切换为深色主题");
    });
  }

  /* ---------- 日薪 / 月薪模式切换 ---------- */
  function bindModeSwitch() {
    const sw = document.getElementById("modeSwitch");
    if (!sw) return;
    const LABELS = {
      daily: ["日薪模式", ICON_WALLET],
      monthly: ["月薪模式", ICON_BRIEFCASE],
    };
    const sync = () => {
      const m = Store.getMode();
      sw.classList.toggle("active", m === "monthly");
      const [txt, ico] = LABELS[m];
      sw.querySelector(".mt-text").textContent = txt;
      sw.querySelector(".mt-ico").innerHTML = ico;
      sw.title = m === "monthly"
        ? "当前为月薪模式，点击切换为日薪模式"
        : "当前为日薪模式，点击切换为月薪模式";
      const mi = document.getElementById("btnMonthlyIncome");
      if (mi) mi.hidden = m !== "monthly";
    };
    sw.addEventListener("click", () => {
      const m = Store.getMode() === "daily" ? "monthly" : "daily";
      Store.setMode(m);   // 触发所有视图订阅重渲染（看板/统计/列表）
      sync();
      Toast.show(m === "monthly" ? "已切换为月薪模式" : "已切换为日薪模式");
    });
    sync();
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
    const searchEl = document.getElementById("filterSearch");
    const q = searchEl ? searchEl.value.trim().toLowerCase() : "";

    let list = Store.getWorks();
    if (type) list = list.filter((w) => w.work_type === type);
    if (status) list = list.filter((w) => w.status === status);
    if (from) list = list.filter((w) => w.planned_date >= from);
    if (to) list = list.filter((w) => w.planned_date <= to);
    if (q) list = list.filter((w) =>
      String(w.name || "").toLowerCase().includes(q) ||
      String(w.notes || "").toLowerCase().includes(q));

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
    const _now = new Date();
    const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
    const monthly = Store.getMode() === "monthly";
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
        <td class="num">${monthly ? "—" : "¥ " + w.expected_income.toLocaleString()}</td>
        <td class="num">${w.completed_date || "—"}</td>
        <td class="num">${monthly ? "—" : (isDone ? "¥ " + (w.actual_income ?? 0).toLocaleString() : "—")}</td>
        <td>
          <div class="row-actions">
            ${isDone
              ? `<button class="mini" data-act="edit" title="编辑" aria-label="编辑">${ICON_EDIT}</button>
                 <button class="mini" data-act="reopen" title="重新打开" aria-label="重新打开">${ICON_REOPEN}</button>`
              : `<button class="mini done" data-act="complete" title="标记完成" aria-label="标记完成">${ICON_CHECK}</button>
                 <button class="mini" data-act="edit" title="编辑" aria-label="编辑">${ICON_EDIT}</button>`}
            <button class="mini del" data-act="del" title="删除" aria-label="删除">${ICON_TRASH}</button>
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
        <td class="num">${monthly ? "—" : "¥ " + expectIncome.toLocaleString()}</td>
        <td class="num"></td>
        <td class="num">${monthly ? "—" : "¥ " + actualIncome.toLocaleString()}</td>
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
      // 严格按当前模式操作对应数据表，避免误动另一套数据
      if (Store.getMode() === "monthly") await API.reopenMonthlyWork(work.id);
      else await API.reopenWork(work.id);
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

  function renderTopbar() {
    const now = new Date();
    const greetEl = document.getElementById("heroGreet");
    // 彩蛋：点击随机触发趣味文案（含 2 个经典彩蛋 + 更多惊喜），并带微光特效
    const HERO_STATES = [
      { text: "为人民服务", egg: false },
      { text: "我是一台无情的赚钱机器", egg: true },
      { text: "革命尚未成功，同志仍需努力", egg: true },
      { text: "打工人，打工魂，打工都是人上人", egg: true },
      { text: "摸鱼一时爽，一直摸鱼一直爽", egg: true },
      { text: "优秀员工正在营业中…", egg: true },
      { text: "今天也要元气满满地搬砖", egg: true },
      { text: "世界那么大，先把手头的工作做完", egg: true },
    ];

    if (greetEl && !greetEl.dataset.bound) {
      greetEl.dataset.bound = "1";
      greetEl.style.cursor = "pointer";
      greetEl.title = "点击有惊喜";
      greetEl.addEventListener("click", () => {
        const cur = parseInt(greetEl.dataset.egg || "0", 10) || 0;
        let st;
        do {
          st = Math.floor(Math.random() * HERO_STATES.length);
        } while (st === cur && HERO_STATES.length > 1);
        greetEl.dataset.egg = String(st);
        greetEl.classList.toggle("hero-egg", HERO_STATES[st].egg);
        greetEl.textContent = HERO_STATES[st].text;
        // 切换弹出动画 + 品牌区微光脉冲
        greetEl.classList.remove("hero-pop");
        void greetEl.offsetWidth;
        greetEl.classList.add("hero-pop");
        const brand = document.querySelector(".brand");
        if (brand) {
          brand.classList.remove("hero-egging");
          void brand.offsetWidth;
          brand.classList.add("hero-egging");
          setTimeout(() => brand.classList.remove("hero-egging"), 900);
        }
        setTimeout(() => greetEl.classList.remove("hero-pop"), 550);
      });
    }
    if (greetEl) {
      const curState = HERO_STATES[parseInt(greetEl.dataset.egg || "0", 10) || 0];
      greetEl.textContent = curState.text;
      greetEl.classList.toggle("hero-egg", curState.egg);
    }

    // 顶栏小型时间（分钟级更新）
    const tick = () => {
      const t = new Date();
      const el = document.getElementById("topClock");
      if (el) {
        el.innerHTML =
          `<span class="tc-time">${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}</span>` +
          ` <span class="tc-week">周${WEEK_CN[t.getDay()]}</span>` +
          ` · <span class="tc-date">${t.getMonth() + 1}月${t.getDate()}日</span>`;
      }
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    renderTopbar();

    bindTabs();
    bindSort();
    bindTheme();
    bindModeSwitch();
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
    document.getElementById("btnPush").addEventListener("click", () => Modal.openPush());
    const miBtn = document.getElementById("btnMonthlyIncome");
    if (miBtn) miBtn.addEventListener("click", () => Modal.openMonthlyIncome());
    const repoBtn = document.getElementById("btnRepo");
    if (repoBtn) repoBtn.addEventListener("click", () => window.open("https://github.com/94486/workplan", "_blank", "noopener,noreferrer"));

    /* ---------- 数据对接待审查提醒（角标 + 轮询） ----------
     * 外部程序推送的数据不依赖工作台在线即可缓存到待审查箱；
     * 本页面加载时与每 30 秒轮询一次待审查批次数，有新增时角标提示并可进入审核。 */
    async function refreshPushBadge() {
      try {
        const items = await API.listPushInbox("pending");
        const n = items.length;
        const badge = document.getElementById("pushBadge");
        if (n > 0) {
          badge.textContent = n > 99 ? "99+" : String(n);
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
        if (n > 0 && n !== window._lastPushCount) {
          Toast.show(`收到 ${n} 批待审查数据，点「对接」审核`, "");
        }
        window._lastPushCount = n;
      } catch (e) { /* 服务暂不可达等忽略，轮询自会恢复 */ }
    }
    document.addEventListener("push-inbox-changed", refreshPushBadge);
    refreshPushBadge();
    setInterval(refreshPushBadge, 30000);
    const btnRefresh = document.getElementById("btnRefresh");
    btnRefresh.addEventListener("click", async () => {
      btnRefresh.classList.add("spin");
      try {
        await Store.refresh();
        Toast.show("数据已刷新", "ok");
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
    // 名称/备注搜索：即时过滤
    const searchEl = document.getElementById("filterSearch");
    if (searchEl) searchEl.addEventListener("input", renderList);
    document.getElementById("btnClearFilter").addEventListener("click", () => {
      ["filterType", "filterStatus", "filterFrom", "filterTo"].forEach((id) => {
        document.getElementById(id).value = "";
      });
      if (searchEl) searchEl.value = "";
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
