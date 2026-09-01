/* kanban.js — 日程看板（周视图 / 月视图）
 *
 * 周视图：横向展示连续 7 天（可前后翻周），每天一列；
 * 月视图：6×7 日历网格展示整个月（可前后翻月），每月日期灰色、今天高亮；
 * 通用规则：
 * - 待完成工作挂在「计划完成日期」，已完成工作挂在「完成日期」（自动跳转归位）；
 * - 卡片通过边框/标签区分 常规(regular) / 其他(other)、待完成 / 已完成；
 * - 计划日期已过且未完成 → 逾期红色徽章；
 * - 悬浮卡片右上角 ✓ 可一键按默认值完成；
 * - 顶部汇总条随视图切换：本周 / 本月 完成数、工时、收入，及全局待办、逾期；
 * - 点击卡片弹出操作弹窗；点击空白日期格快速录入；月视图「+N 项更多」跳转周视图。
 */
const Kanban = (() => {
  const DAY_MS = 86400000;
  const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  const MONTH_MAX_SHOW = 3; // 月视图每格最多显示的卡片数

  let baseDate = startOfWeek(new Date()); // 当前视图锚点（周：周一；月：任意日期，取其年月）
  let viewMode = "week"; // "week" | "month"

  function fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function startOfWeek(d) {
    const copy = new Date(d);
    const diff = (copy.getDay() + 6) % 7; // 周一为起点
    copy.setDate(copy.getDate() - diff);
    return copy;
  }

  function parse(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  const isOverdue = (w, todayStr) => w.status === "pending" && w.planned_date < todayStr;

  /* ---------- 通用卡片（周视图） ---------- */
  function cardHTML(w, todayStr) {
    const isRegular = w.work_type === "regular";
    const isDone = w.status === "done";
    const overdue = !isDone && isOverdue(w, todayStr);
    const delayed = isDone && w.completed_date && w.planned_date && w.completed_date > w.planned_date;
    const typeTag = isRegular ? "常规" : "其他";
    const hours = isDone
      ? (w.actual_duration_hours ?? w.duration_hours)
      : w.duration_hours;
    const income = isDone
      ? (w.actual_income ?? w.expected_income)
      : w.expected_income;

    return `
    <div class="work-card type-${w.work_type} ${isDone ? "done" : ""} ${overdue ? "overdue" : ""} ${delayed ? "delayed" : ""}"
         data-id="${w.id}" title="${esc(w.notes || w.name)}">
      ${!isDone ? '<button class="quick-done" data-quick="1" title="一键完成（按计划值 / 今天）">✓</button>' : ""}
      <div class="card-top">
        <span class="type-tag ${isRegular ? "tag-regular" : "tag-other"}">${typeTag}</span>
        <span class="card-name">${esc(w.name)}</span>
        ${isDone ? '<span class="done-badge">✓ 已完成</span>' : ""}
        ${delayed ? '<span class="delayed-badge">延迟</span>' : ""}
        ${overdue ? '<span class="overdue-badge">逾期</span>' : ""}
      </div>
      <div class="card-meta">
        <span>⏱ <b>${hours}h</b></span>
        <span class="income-pos">¥ <b>${income.toLocaleString()}</b></span>
        ${w.notes ? '<span class="note-flag" title="' + esc(w.notes) + '">💬</span>' : ""}
      </div>
    </div>`;
  }

  /* ---------- 紧凑卡片（月视图） ---------- */
  function monthCardHTML(w, todayStr) {
    const isRegular = w.work_type === "regular";
    const isDone = w.status === "done";
    const overdue = !isDone && isOverdue(w, todayStr);
    const delayed = isDone && w.completed_date && w.planned_date && w.completed_date > w.planned_date;
    const hours = isDone
      ? (w.actual_duration_hours ?? w.duration_hours)
      : w.duration_hours;
    const income = isDone
      ? (w.actual_income ?? w.expected_income)
      : w.expected_income;

    return `
    <div class="work-card month-card type-${w.work_type} ${isDone ? "done" : ""} ${overdue ? "overdue" : ""} ${delayed ? "delayed" : ""}"
         data-id="${w.id}" title="${esc(w.notes || w.name)}">
      ${!isDone ? '<button class="quick-done" data-quick="1" title="一键完成">✓</button>' : ""}
      <span class="mc-name">${esc(w.name)}</span>
      ${overdue ? '<span class="overdue-badge">逾期</span>' : ""}
      ${delayed ? '<span class="delayed-badge">迟</span>' : ""}
      <span class="mc-meta">⏱${hours}h · ¥${income.toLocaleString()}</span>
    </div>`;
  }

  /* ---------- 汇总条：本周 / 本月完成情况 + 全局待办/逾期 ---------- */
  function renderSummary(todayStr) {
    let lo, hi, label, scopeLabel;
    if (viewMode === "month") {
      const y = baseDate.getFullYear();
      const m = baseDate.getMonth();
      lo = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      hi = `${y}-${String(m + 1).padStart(2, "0")}-${new Date(y, m + 1, 0).getDate()}`;
      label = "本月";
      scopeLabel = "📅 本月概览";
    } else {
      lo = fmt(baseDate);
      hi = fmt(new Date(baseDate.getTime() + 6 * DAY_MS));
      label = "本周";
      scopeLabel = "📆 本周概览";
    }
    const inScope = (dateStr) => dateStr >= lo && dateStr <= hi;

    const doneScope = Store.getWorks().filter(
      (w) => w.status === "done" && inScope(w.completed_date || "")
    );
    const scopeHours = doneScope.reduce((s, w) => s + (w.actual_duration_hours || 0), 0);
    const scopeIncome = doneScope.reduce((s, w) => s + (w.actual_income || 0), 0);
    const pendingAll = Store.getWorks().filter((w) => w.status === "pending");
    const overdueAll = pendingAll.filter((w) => isOverdue(w, todayStr));
    const todayPending = pendingAll.filter((w) => w.planned_date === todayStr).length;
    const todayDone = Store.getWorks().filter(
      (w) => w.status === "done" && w.completed_date === todayStr
    ).length;

    const item = (l, v, cls = "", icon = "") =>
      `<div class="ws-item ${cls}"><span class="ws-label">${icon}${l}</span><span class="ws-value">${v}</span></div>`;

    document.getElementById("weekSummary").innerHTML = `
      <span class="ws-scope ws-scope-click" title="点击切换周/月视图">${scopeLabel}<span class="ws-scope-hint">点击切换 ›</span></span>
      ${item("今日待办", todayPending, todayPending ? "ws-warn" : "ws-muted", "⏰ ")}
      ${item("今日完成", todayDone, todayDone ? "ws-ok" : "ws-muted", "✅ ")}
      ${item(`${label}完成`, doneScope.length + " 项", "ws-done", "📋 ")}
      ${item(`${label}工时`, scopeHours.toFixed(1) + " h", "ws-hours", "⏱ ")}
      ${item(`${label}收入`, "¥" + Math.round(scopeIncome).toLocaleString(), "ws-income", "💰 ")}
      ${item("待办合计", pendingAll.length + " 项", "ws-pending", "📝 ")}
      ${item("已逾期", overdueAll.length + " 项", overdueAll.length ? "ws-danger" : "ws-muted", "⚠️ ")}
    `;
  }

  /* ---------- 周视图 ---------- */
  function renderWeek() {
    const board = document.getElementById("kanban");
    board.classList.remove("month-grid");
    const todayStr = fmt(new Date());
    let html = "";

    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate.getTime() + i * DAY_MS);
      const dStr = fmt(d);
      const items = Store.worksOn(dStr);
      const isToday = dStr === todayStr;
      const isPast = dStr < todayStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      const doneList = items.filter((w) => w.status === "done");
      const pendingList = items.filter((w) => w.status === "pending");
      const actualHours = doneList.reduce((s, w) => s + (w.actual_duration_hours || 0), 0);
      const income = doneList.reduce((s, w) => s + (w.actual_income || 0), 0);
      const planHours = pendingList.reduce((s, w) => s + (w.duration_hours || 0), 0);
      const totalHours = planHours + actualHours;
      // 工时进度条：已完成工时 / 总工时
      const progress = totalHours > 0 ? Math.min(100, (actualHours / totalHours) * 100) : 0;
      const cards = [...pendingList, ...doneList]
        .map((w) => cardHTML(w, todayStr)).join("");

      html += `
      <div class="kanban-day ${isToday ? "today" : ""} ${isPast ? "past-day" : ""} ${isWeekend ? "weekend-col" : ""}" data-date="${dStr}">
        <div class="day-head">
          <div>
            <div class="day-week">周${WEEK[d.getDay()]}${isToday ? ' · <span class="today-tag">今天</span>' : ""}</div>
            <div class="day-date ${isToday ? "today-date" : ""}">${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}</div>
          </div>
          <div class="day-counts">
            ${pendingList.length ? `<span class="chip chip-pending">待 ${pendingList.length}</span>` : ""}
            ${doneList.length ? `<span class="chip chip-done">完 ${doneList.length}</span>` : ""}
            ${!items.length ? '<span class="day-meta">休息日</span>' : ""}
          </div>
        </div>
        <div class="day-body">
          ${cards || `<div class="day-empty">＋ 点击录入</div>`}
        </div>
        <div class="day-totals">
          ${items.length
            ? `<div class="hours-bar"><div class="hours-bar-fill" style="width:${progress}%"></div></div>
               <div class="hours-text">计划 ${planHours}h · 实际 ${actualHours}h · 收入 ¥${income.toLocaleString()}</div>`
            : "—"}
        </div>
      </div>`;
    }
    board.innerHTML = html;

    const startTxt = `${baseDate.getMonth() + 1}月${baseDate.getDate()}日`;
    const end = new Date(baseDate.getTime() + 6 * DAY_MS);
    document.getElementById("boardRange").textContent =
      `${startTxt} — ${end.getMonth() + 1}月${end.getDate()}日`;
  }

  /* ---------- 月视图 ---------- */
  function renderMonth() {
    const board = document.getElementById("kanban");
    board.classList.add("month-grid");
    const todayStr = fmt(new Date());
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();

    // 当月 1 号所在周的周一作为网格起点（最多覆盖 6 行 × 7 列 = 42 格）
    const firstDay = new Date(year, month, 1);
    const gridStart = new Date(firstDay);
    gridStart.setDate(1 - ((firstDay.getDay() + 6) % 7));

    // 计算当月最大工时，用于迷你条比例
    let maxDayHours = 0;
    const dayHoursMap = {};
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getTime() + i * DAY_MS);
      const dStr = fmt(d);
      if (d.getMonth() === month) {
        const items = Store.worksOn(dStr);
        const h = items.reduce((s, w) => s + (w.status === "done" ? (w.actual_duration_hours || 0) : (w.duration_hours || 0)), 0);
        dayHoursMap[dStr] = h;
        if (h > maxDayHours) maxDayHours = h;
      }
    }

    let html = `<div class="month-head">${WEEK.map((w) => `<span class="month-head-cell">周${w}</span>`).join("")}</div>`;

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getTime() + i * DAY_MS);
      const dStr = fmt(d);
      const inMonth = d.getMonth() === month;
      const isToday = dStr === todayStr;
      const isPast = dStr < todayStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      const items = Store.worksOn(dStr);
      const doneList = items.filter((w) => w.status === "done");
      const pendingList = items.filter((w) => w.status === "pending");
      const overdueCount = pendingList.filter((w) => isOverdue(w, todayStr)).length;
      const dayHours = dayHoursMap[dStr] || 0;
      const barPct = maxDayHours > 0 ? (dayHours / maxDayHours) * 100 : 0;

      const all = [...pendingList, ...doneList];
      const shown = all.slice(0, MONTH_MAX_SHOW);
      const rest = all.length - shown.length;
      const cards = shown.map((w) => monthCardHTML(w, todayStr)).join("") +
        (rest > 0
          ? `<div class="month-more" data-jump="${dStr}" title="跳转周视图查看该日全部工作">+${rest} 项更多 ›</div>`
          : "");

      html += `
      <div class="kanban-day month ${inMonth ? "" : "out-month"} ${inMonth && isWeekend ? "weekend" : ""} ${isToday ? "today" : ""} ${isPast ? "past-day" : ""}" data-date="${dStr}">
        ${isToday ? '<div class="today-ring"></div>' : ""}
        <div class="month-day-head">
          <span class="month-date">${d.getDate()}</span>
          <span class="month-weekday">周${WEEK[d.getDay()]}</span>
          <span class="month-counts">
            ${pendingList.length ? `<span class="chip chip-pending">待 ${pendingList.length}</span>` : ""}
            ${doneList.length ? `<span class="chip chip-done">完 ${doneList.length}</span>` : ""}
          </span>
        </div>
        <div class="day-body month-body">
          ${cards || (inMonth ? `<div class="month-empty">＋</div>` : "")}
        </div>
        ${inMonth && dayHours > 0 ? `<div class="month-mini-bar"><div class="mmb-fill" style="width:${barPct}%"></div><span class="mmb-text">${dayHours}h</span></div>` : ""}
      </div>`;
    }
    board.innerHTML = html;

    document.getElementById("boardRange").textContent =
      `${month + 1}月 · ${year}年`;
  }

  function render() {
    const todayStr = fmt(new Date());
    if (viewMode === "month") {
      renderMonth();
    } else {
      renderWeek();
    }
    renderSummary(todayStr);
  }

  /* ---------- 翻页：周 ±7 天 / 月 ±1 月 ---------- */
  function prev() {
    if (viewMode === "month") {
      baseDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
    } else {
      baseDate = new Date(baseDate.getTime() - 7 * DAY_MS);
    }
    render();
  }
  function next() {
    if (viewMode === "month") {
      baseDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
    } else {
      baseDate = new Date(baseDate.getTime() + 7 * DAY_MS);
    }
    render();
  }
  function goToday() {
    if (viewMode === "month") {
      baseDate = new Date();
    } else {
      baseDate = startOfWeek(new Date());
    }
    render();
  }

  /* ---------- 视图切换 ---------- */
  function setView(mode) {
    if (mode === viewMode) return;
    viewMode = mode;
    document.querySelectorAll(".view-switch .vs-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === mode)
    );
    render();
  }

  /** 一键完成：按计划时长 / 今天 / 预期收入直接完成 */
  async function quickComplete(work) {
    try {
      const today = fmt(new Date());
      await API.completeWork(work.id, {
        actual_duration_hours: work.duration_hours,
        completed_date: today,
        actual_income: work.expected_income,
      });
      Toast.show(`「${work.name}」已完成，报表已同步 ✔`, "ok");
      await Store.refresh();
    } catch (e) { Toast.show(e.message, "err"); }
  }

  /** 月视图「+N 更多」→ 跳转周视图定位到该周 */
  function jumpToWeek(dateStr) {
    setView("week");
    baseDate = startOfWeek(parse(dateStr));
    render();
  }

  /** 点击看板：一键完成 → 更多跳转 → 卡片操作 → 空白快速录入 */
  function onBoardClick(e) {
    // 1. 一键完成按钮
    const quick = e.target.closest(".quick-done");
    if (quick) {
      e.stopPropagation();
      const card = quick.closest(".work-card");
      const work = Store.getWorks().find((w) => w.id === Number(card.dataset.id));
      if (work) quickComplete(work);
      return;
    }
    // 2. 月视图「+N 更多」跳转
    const more = e.target.closest(".month-more");
    if (more) {
      jumpToWeek(more.dataset.jump);
      return;
    }
    // 3. 卡片操作
    const card = e.target.closest(".work-card");
    if (card) {
      const work = Store.getWorks().find((w) => w.id === Number(card.dataset.id));
      if (work) Modal.openWorkActions(work);
      return;
    }
    // 4. 空白日期格 → 快速录入（仅当月）
    const day = e.target.closest(".kanban-day.month");
    if (day) {
      if (day.classList.contains("out-month")) return;
      Modal.openCreate({ planned_date: day.dataset.date });
      return;
    }
    const weekDay = e.target.closest(".kanban-day");
    if (weekDay) Modal.openCreate({ planned_date: weekDay.dataset.date });
  }

  return {
    render,
    prev,
    next,
    goToday,
    setView,
    bind() {
      document.getElementById("boardPrev").addEventListener("click", prev);
      document.getElementById("boardNext").addEventListener("click", next);
      document.getElementById("boardToday").addEventListener("click", goToday);
      document.getElementById("kanban").addEventListener("click", onBoardClick);
      document.querySelectorAll(".view-switch .vs-btn").forEach((btn) =>
        btn.addEventListener("click", () => setView(btn.dataset.mode))
      );
      // 点击「本周概览/本月概览」切换视图
      document.getElementById("weekSummary").addEventListener("click", (e) => {
        if (e.target.closest(".ws-scope-click")) {
          setView(viewMode === "week" ? "month" : "week");
        }
      });
      // 数据变更后自动重绘
      Store.subscribe(render);
    },
  };
})();
