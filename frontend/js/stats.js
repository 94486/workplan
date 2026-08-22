/* stats.js — 工时收入统计看板
 *
 * 顶部 3 张分类报表卡：常规工作 / 其他工作 / 总统计，
 * 每张分别统计 总工时、总收入、小时工资（小时均收入）；
 * 第二行 4 张副卡：完成率（环形进度）/ 本周完成工时 / 本周收入 / 逾期待办；
 * 图表区：
 * - 近 8 周工时·收入双轴趋势图（工时柱状 + 收入折线，科技感渐变/发光）；
 * - 上月收入、今年至今总收入两张面板，各配「常规 / 其他」迷你构成图。
 * 主数据来自 /api/stats/summary、/weekly；副卡与期间统计由前端基于 works 计算，
 * 随 Store.refresh 自动更新。
 */
const Stats = (() => {
  const fmtMoney = (v) => "¥ " + Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  const fmtNum = (v) => Number(v).toLocaleString("zh-CN");

  /** 将 CSS 变量解析为具体颜色值（供 SVG 渐变 / 滤镜使用，避免 var() 兼容问题） */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function mondayISO() {
    const d = new Date();
    const diff = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** 完成率环形进度（内联 SVG） */
  function ringHTML(rate) {
    const r = 26, c = 2 * Math.PI * r;
    const pct = Math.round(rate * 100);
    const dash = rate * c;
    return `
    <div class="ring-box">
      <svg viewBox="0 0 64 64" class="ring">
        <circle cx="32" cy="32" r="${r}" class="ring-bg"/>
        <circle cx="32" cy="32" r="${r}" class="ring-fg"
                stroke-dasharray="${dash} ${c - dash}" transform="rotate(-90 32 32)"/>
        <text x="32" y="37" text-anchor="middle" class="ring-text">${pct}%</text>
      </svg>
      <span class="ring-note">已完成 / 全部任务</span>
    </div>`;
  }

  /* ---------- 第二行副卡：完成率 / 本周工时 / 本周收入 / 逾期 ---------- */
  function renderSub() {
    const works = Store.getWorks();
    if (!works) return;
    const today = todayISO();
    const monday = mondayISO();

    const done = works.filter((w) => w.status === "done");
    const pending = works.filter((w) => w.status === "pending");
    const rate = works.length ? done.length / works.length : 0;

    const doneThisWeek = done.filter(
      (w) => (w.completed_date || "") >= monday && (w.completed_date || "") <= today + "\uffff"
    );
    const weekHours = doneThisWeek.reduce((s, w) => s + (w.actual_duration_hours || 0), 0);
    const weekIncome = doneThisWeek.reduce((s, w) => s + (w.actual_income || 0), 0);
    const overdue = pending.filter((w) => w.planned_date < today);

    document.getElementById("statsSub").innerHTML = `
      <div class="stat-mini">
        <div class="stat-label">完成率</div>
        ${ringHTML(rate)}
      </div>
      <div class="stat-mini">
        <div class="stat-label">本周完成工时</div>
        <div class="mini-value">${fmtNum(Math.round(weekHours * 10) / 10)} <small>小时</small></div>
        <div class="stat-sub">本周完成 ${doneThisWeek.length} 项工作</div>
      </div>
      <div class="stat-mini">
        <div class="stat-label">本周收入</div>
        <div class="mini-value">${fmtMoney(weekIncome)}</div>
        <div class="stat-sub">日均 ${fmtMoney(weekHours ? weekIncome / 7 : 0)}</div>
      </div>
      <div class="stat-mini ${overdue.length ? "mini-danger" : ""}">
        <div class="stat-label">逾期待办</div>
        <div class="mini-value ${overdue.length ? "text-danger" : "text-ok"}">${overdue.length} <small>项</small></div>
        <div class="stat-sub">${overdue.length ? "最早逾期：" + overdue.map((w) => w.planned_date).sort()[0] : "无逾期，节奏健康 ✔"}</div>
      </div>`;
  }

  /* ---------- 分类报表卡：常规工作 / 其他工作 / 总统计 ----------
   * 每张卡分别统计 总工时 / 总收入 / 小时工资。 */
  function reportCardHTML(cls, icon, title, countText, hours, income, rate) {
    return `
      <div class="report-card ${cls}">
        <div class="rc-head">
          <span class="rc-icon">${icon}</span>
          <span class="rc-title">${title}</span>
          <span class="rc-count">${countText}</span>
        </div>
        <div class="rc-metrics">
          <div class="rc-metric">
            <div class="rm-label">总工时</div>
            <div class="rm-value">${fmtNum(hours)}<small> h</small></div>
          </div>
          <div class="rc-metric">
            <div class="rm-label">总收入</div>
            <div class="rm-value">${fmtMoney(income)}</div>
          </div>
          <div class="rc-metric">
            <div class="rm-label">小时工资</div>
            <div class="rm-value">${fmtMoney(rate)}<small> /h</small></div>
          </div>
        </div>
      </div>`;
  }

  function renderReport(summary) {
    const g = summary.groups;
    const t = summary.totals;
    const c = summary.counts;
    document.getElementById("statsHero").innerHTML =
      reportCardHTML("rc-regular", "◈", "常规工作",
        `已完成 ${g[0].count} 项`, g[0].hours, g[0].income, g[0].hourly_rate) +
      reportCardHTML("rc-other", "✦", "其他工作",
        `已完成 ${g[1].count} 项`, g[1].hours, g[1].income, g[1].hourly_rate) +
      reportCardHTML("rc-total", "Σ", "总统计",
        `已完成 ${t.count} 项 · 待完成 ${c.pending} 项`, t.hours, t.income, t.hourly_rate);
  }

  /* ---------- 期间统计：上月收入 / 今年至今总收入 ---------- */
  /** 统计某日期区间内已完成工作的收入构成（常规/其他）、工时、数量 */
  function statsFor(works, fromISO, toISO) {
    const done = works.filter(
      (w) => w.status === "done" &&
             (w.completed_date || "") >= fromISO &&
             (w.completed_date || "") <= toISO
    );
    const sumIncome = (t) => done
      .filter((w) => w.work_type === t)
      .reduce((s, w) => s + (w.actual_income || 0), 0);
    const hours = done.reduce((s, w) => s + (w.actual_duration_hours || 0), 0);
    const regular = sumIncome("regular");
    const other = sumIncome("other");
    return { regular, other, total: regular + other, hours, count: done.length };
  }

  function periodPanelHTML(id, label, badge, s, subText) {
    return `
      <div class="panel period-panel">
        <div class="period-head">
          <div>
            <div class="ph-label">${label}<span class="ph-badge">${badge}</span></div>
            <div class="ph-value">${fmtMoney(s.total)}</div>
            <div class="ph-sub">${subText}</div>
          </div>
        </div>
        <div class="chart-wrap"><svg id="${id}" class="chart chart-mini"></svg></div>
      </div>`;
  }

  function renderPeriods() {
    const works = Store.getWorks();
    if (!works) return;
    const now = new Date();
    const today = todayISO();

    // 上月：上一个自然月
    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const lm = statsFor(works, iso(lmStart), iso(lmEnd));

    // 今年至今
    const ytd = statsFor(works, `${now.getFullYear()}-01-01`, today);

    document.getElementById("statsPeriods").innerHTML =
      periodPanelHTML("chartLastMonth",
        `上月收入 · ${lmStart.getMonth() + 1} 月`, `${lmStart.getFullYear()}`,
        lm,
        lm.count
          ? `完成 ${lm.count} 项 · ${fmtNum(Math.round(lm.hours * 10) / 10)} 小时 · 小时工资 ${fmtMoney(lm.hours ? lm.total / lm.hours : 0)}`
          : "上月暂无完成记录") +
      periodPanelHTML("chartYtd",
        "今年至今总收入", `${now.getFullYear()}`,
        ytd,
        ytd.count
          ? `完成 ${ytd.count} 项 · ${fmtNum(Math.round(ytd.hours * 10) / 10)} 小时 · 小时工资 ${fmtMoney(ytd.hours ? ytd.total / ytd.hours : 0)}`
          : "今年暂无完成记录");

    const cRegular = cssVar("--regular");
    const cOther = cssVar("--other");
    const items = (s) => [
      { label: "常规工作", value: s.regular, color: cRegular, valueText: fmtMoney(s.regular) },
      { label: "其他工作", value: s.other, color: cOther, valueText: fmtMoney(s.other) },
    ];
    Charts.miniSplit(document.getElementById("chartLastMonth"), items(lm), { total: lm.total });
    Charts.miniSplit(document.getElementById("chartYtd"), items(ytd), { total: ytd.total });
  }

  async function renderCharts() {
    const weekly = await API.getWeekly();
    const fmtK = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v));

    // 近 8 周趋势：工时（柱，右轴）+ 收入（折线，左轴），科技感渐变/发光
    Charts.comboChart(document.getElementById("chartWeekly"), {
      labels: weekly.map((w) => w.label),
      barSeries: { name: "工时(h)", color: cssVar("--regular"), values: weekly.map((w) => w.hours) },
      lineSeries: { name: "收入(¥)", color: cssVar("--accent-2"), values: weekly.map((w) => w.income) },
      fmtL: fmtK,
      fmtR: (v) => Math.round(v),
      fmtVal: fmtK,
    });

    renderPeriods();
  }

  return {
    /** 渲染整个统计视图（进入该 Tab 时调用） */
    async render() {
      const summary = Store.getSummary();
      if (!summary) return;
      renderReport(summary);
      renderSub();
      await renderCharts();
    },

    bind() {
      Store.subscribe(() => {
        // 仅当统计 Tab 可见时才重绘图表，避免后台消耗
        if (document.getElementById("view-stats").classList.contains("active")) {
          Stats.render();
        }
      });
    },
  };
})();
