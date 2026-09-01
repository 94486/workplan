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

  /* ---------- 近 6 个月汇总对比表 ---------- */
  function renderMonthlyTable() {
    const works = Store.getWorks();
    if (!works) return;
    const now = new Date();
    const rows = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const done = works.filter((w) => w.status === "done" && w.completed_date >= from && w.completed_date <= to);
      const hours = done.reduce((s, w) => s + (w.actual_duration_hours || 0), 0);
      const income = done.reduce((s, w) => s + (w.actual_income || 0), 0);
      const hourly = hours > 0 ? income / hours : 0;
      const isCurrent = i === 0;
      rows.push({ label: `${m + 1}月`, year: y, count: done.length, hours, income, hourly, isCurrent });
    }

    const maxHours = Math.max(...rows.map((r) => r.hours), 1);
    const maxIncome = Math.max(...rows.map((r) => r.income), 1);
    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const totalIncome = rows.reduce((s, r) => s + r.income, 0);
    const avgHourly = totalHours > 0 ? totalIncome / totalHours : 0;

    const html = `
      <div class="panel table-panel">
        <div class="panel-title">近 6 个月汇总对比<span class="panel-note">完成项 · 工时 · 收入 · 小时工资</span></div>
        <table class="data-table">
          <thead>
            <tr>
              <th>月份</th>
              <th class="num">完成项</th>
              <th class="num">总工时</th>
              <th class="num">工时占比</th>
              <th class="num">总收入</th>
              <th class="num">收入占比</th>
              <th class="num">小时工资</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr class="${r.isCurrent ? "row-current" : ""}">
                <td><b>${r.label}</b><small class="row-year">${r.year}</small></td>
                <td class="num">${r.count}</td>
                <td class="num">${fmtNum(Math.round(r.hours * 10) / 10)} h</td>
                <td class="num"><div class="cell-bar"><div class="cell-bar-fill cb-hours" style="width:${(r.hours / maxHours * 100).toFixed(1)}%"></div></div></td>
                <td class="num">${fmtMoney(r.income)}</td>
                <td class="num"><div class="cell-bar"><div class="cell-bar-fill cb-income" style="width:${(r.income / maxIncome * 100).toFixed(1)}%"></div></div></td>
                <td class="num"><b>${fmtMoney(r.hourly)}</b></td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>合计 / 均值</td>
              <td class="num">${totalCount}</td>
              <td class="num">${fmtNum(Math.round(totalHours * 10) / 10)} h</td>
              <td class="num">—</td>
              <td class="num">${fmtMoney(totalIncome)}</td>
              <td class="num">—</td>
              <td class="num">${fmtMoney(avgHourly)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
    return html;
  }

  /* ---------- 工作类型效率对比表 ---------- */
  function renderTypeEfficiencyTable(summary) {
    const works = Store.getWorks();
    if (!works || !summary) return "";
    const g = summary.groups; // [regular, other]
    const types = [
      { key: "regular", label: "常规工作", color: "var(--regular)", data: g[0] },
      { key: "other", label: "其他工作", color: "var(--other)", data: g[1] },
    ];

    const rows = types.map((t) => {
      const typeWorks = works.filter((w) => w.work_type === t.key);
      const done = typeWorks.filter((w) => w.status === "done");
      const pending = typeWorks.filter((w) => w.status === "pending");
      const total = typeWorks.length;
      const rate = total > 0 ? done.length / total : 0;
      const avgHours = done.length > 0 ? t.data.hours / done.length : 0;
      const avgIncome = done.length > 0 ? t.data.income / done.length : 0;
      return { ...t, done: done.length, pending: pending.length, total, rate, avgHours, avgIncome };
    });

    const html = `
      <div class="panel table-panel">
        <div class="panel-title">工作类型效率对比<span class="panel-note">完成率 · 平均产出 · 小时工资</span></div>
        <table class="data-table">
          <thead>
            <tr>
              <th>类型</th>
              <th class="num">已完成</th>
              <th class="num">待完成</th>
              <th class="num">完成率</th>
              <th class="num">总工时</th>
              <th class="num">总收入</th>
              <th class="num">平均工时/项</th>
              <th class="num">平均收入/项</th>
              <th class="num">小时工资</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td><span class="type-dot" style="background:${r.color}"></span><b>${r.label}</b></td>
                <td class="num">${r.done}</td>
                <td class="num">${r.pending}</td>
                <td class="num">
                  <div class="rate-cell">
                    <div class="rate-bar"><div class="rate-bar-fill" style="width:${(r.rate * 100).toFixed(0)}%;background:${r.color}"></div></div>
                    <span>${(r.rate * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td class="num">${fmtNum(Math.round(r.data.hours * 10) / 10)} h</td>
                <td class="num">${fmtMoney(r.data.income)}</td>
                <td class="num">${fmtNum(Math.round(r.avgHours * 10) / 10)} h</td>
                <td class="num">${fmtMoney(r.avgIncome)}</td>
                <td class="num"><b>${fmtMoney(r.data.hourly_rate)}</b></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>`;
    return html;
  }

  function renderTables(summary) {
    const container = document.getElementById("statsTables");
    if (!container) return;
    container.innerHTML = renderMonthlyTable() + renderTypeEfficiencyTable(summary);
  }

  return {
    /** 渲染整个统计视图（进入该 Tab 时调用） */
    async render() {
      const summary = Store.getSummary();
      if (!summary) return;
      renderReport(summary);
      renderSub();
      renderTables(summary);
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
