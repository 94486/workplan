/* stats.js — 工时收入统计看板（支持日薪 / 月薪双模式）
 *
 * 日薪模式（现有）：
 * - 顶部 3 张分类报表卡（常规/其他/总），统计总工时、总收入、小时工资；
 * - 第二行 4 张副卡：完成率 / 本周工时 / 本周收入 / 逾期待办；
 * - 近 8 周工时·收入双轴趋势图；上月收入与今年至今总收入面板。
 *
 * 月薪模式（重新规划）：
 * - 顶部 3 张收入卡（上月常规收入 / 上月其它收入 / 月收入合计，来自配置）+ 编辑入口；
 * - 第二行 4 张副卡：完成率 / 本月工时 / 本月完成 / 逾期待办；
 * - 近 8 周工时·完成项数双轴趋势图；上月与今年至今「完成工时」构成面板；
 * - 近 6 个月完成对比表 + 类型效率对比表（聚焦工时与任务执行）。
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

  /* ============================================================
   * 日薪模式
   * ============================================================ */

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

  /* ---------- 分类报表卡：常规工作 / 其他工作 / 总统计 ---------- */
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
      reportCardHTML("rc-regular", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg', "常规工作",
        `已完成 ${g[0].count} 项`, g[0].hours, g[0].income, g[0].hourly_rate) +
      reportCardHTML("rc-other", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg', "其他工作",
        `已完成 ${g[1].count} 项`, g[1].hours, g[1].income, g[1].hourly_rate) +
      reportCardHTML("rc-total", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg', "总统计",
        `已完成 ${t.count} 项 · 待完成 ${c.pending} 项`, t.hours, t.income, t.hourly_rate);
  }

  /* ---------- 期间统计：上月收入 / 今年至今总收入 ---------- */
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

    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const lm = statsFor(works, iso(lmStart), iso(lmEnd));
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

    const title = document.getElementById("weeklyChartTitle");
    const range = weekly.length
      ? `${weekly[0].week_start.slice(5).replace("-", "/")} ~ ${weekly[weekly.length - 1].week_start.slice(5).replace("-", "/")}`
      : "";
    if (title) title.innerHTML = `
      <span class="wt-main">工时 / 收入趋势（近 8 周）<small class="wt-range">${range}</small></span>
      <span class="combo-legend">
        <span class="lg"><i class="lg-swatch" style="background:${cssVar("--accent-2")}"></i>收入（左轴）</span>
        <span class="lg"><i class="lg-swatch" style="background:${cssVar("--regular")}"></i>工时（右轴）</span>
      </span>`;

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
    if (!works) return "";
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

    return `
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

    return `
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
  }

  function renderTables(summary) {
    const container = document.getElementById("statsTables");
    if (!container) return;
    container.innerHTML = renderMonthlyTable() + renderTypeEfficiencyTable(summary);
  }

  /* ============================================================
   * 月薪模式（统计聚焦「上月」完整月度，与收入配置配对核算）
   * ============================================================ */

  function mRenderReport(summary, settings) {
    const g = summary.groups;
    const t = summary.totals;
    const c = summary.counts;
    const p = summary.period || {};
    const cur = p.month_key || "";
    const monthLabel = (mk) => { const [y, m] = mk.split("-"); return `${y}年${Number(m)}月`; };
    const months = Array.from(new Set([...(settings || []).map((s) => s.month_key), cur])).filter(Boolean).sort().reverse();
    const opts = months.map((mk) => `<option value="${mk}" ${mk === cur ? "selected" : ""}>${monthLabel(mk)}</option>`).join("");
    document.getElementById("statsHero").innerHTML = `
      <div class="stats-hero-actions" style="grid-column:1 / -1">
        <span class="sha-label">月薪报表 ·
          <select id="mMonthPick" class="select select-sm" title="切换查看月份">${opts}</select>
          <small>（收入取自该月台账 · 工时/完成取自该月）</small>
        </span>
        <button class="btn btn-sm btn-record" id="btnMonthlySettings"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>记录月收入</button>
      </div>
      ${reportCardHTML("rc-regular", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg', "常规工作",
        `已完成 ${g[0].count} 项`, g[0].hours, g[0].income, g[0].hourly_rate)}
      ${reportCardHTML("rc-other", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg', "其他工作",
        `已完成 ${g[1].count} 项`, g[1].hours, g[1].income, g[1].hourly_rate)}
      ${reportCardHTML("rc-total", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg', "总统计",
        `已完成 ${t.count} 项 · 待完成 ${c.pending} 项`, t.hours, t.income, t.hourly_rate)}`;
  }

  function mRenderSub(summary) {
    // 月薪报表：完成率 / 工时 / 收入 / 待完成（针对所选月）
    const g = summary.groups;
    const t = summary.totals;
    const c = summary.counts;
    const p = summary.period || {};
    const periodLabel = p.label || "本月";
    const total = t.count + c.pending;
    const rate = total > 0 ? t.count / total : 0;

    document.getElementById("statsSub").innerHTML = `
      <div class="stat-mini">
        <div class="stat-label">完成率 <small>${periodLabel}</small></div>
        ${ringHTML(rate)}
      </div>
      <div class="stat-mini">
        <div class="stat-label">完成工时 <small>${periodLabel}</small></div>
        <div class="mini-value">${fmtNum(Math.round(t.hours * 10) / 10)} <small>小时</small></div>
        <div class="stat-sub">常规 ${fmtNum(Math.round(g[0].hours * 10) / 10)} h · 其它 ${fmtNum(Math.round(g[1].hours * 10) / 10)} h</div>
      </div>
      <div class="stat-mini">
        <div class="stat-label">月薪收入 <small>${periodLabel}</small></div>
        <div class="mini-value">${fmtMoney(t.income)}</div>
        <div class="stat-sub">小时工资 ${fmtMoney(t.hourly_rate)}</div>
      </div>
      <div class="stat-mini ${c.pending ? "mini-danger" : ""}">
        <div class="stat-label">待完成 <small>${periodLabel}</small></div>
        <div class="mini-value ${c.pending ? "text-danger" : "text-ok"}">${c.pending} <small>项</small></div>
        <div class="stat-sub">${c.pending ? "上月计划未完成" : "上月任务全部完成"}</div>
      </div>`;
  }

  async function mRenderCharts() {
    const weekly = await API.getMonthlyWeekly();

    const title = document.getElementById("weeklyChartTitle");
    const range = weekly.length
      ? `${weekly[0].week_start.slice(5).replace("-", "/")} ~ ${weekly[weekly.length - 1].week_start.slice(5).replace("-", "/")}`
      : "";
    if (title) title.innerHTML = `
      <span class="wt-main">工时 / 完成项趋势（近 8 周）<small class="wt-range">${range}</small></span>
      <span class="combo-legend">
        <span class="lg"><i class="lg-swatch" style="background:${cssVar("--accent-2")}"></i>完成项（左轴）</span>
        <span class="lg"><i class="lg-swatch" style="background:${cssVar("--regular")}"></i>工时（右轴）</span>
      </span>`;

    Charts.comboChart(document.getElementById("chartWeekly"), {
      labels: weekly.map((w) => w.label),
      barSeries: { name: "工时(h)", color: cssVar("--regular"), values: weekly.map((w) => w.hours) },
      lineSeries: { name: "完成项", color: cssVar("--accent-2"), values: weekly.map((w) => w.count) },
      fmtL: (v) => Math.round(v),
      fmtR: (v) => Math.round(v),
      fmtVal: (v) => Math.round(v * 10) / 10,
      axisL: "完成项", axisR: "工时 h",
    });
  }

  /** 月薪：统计某区间已完成任务的工时构成（常规/其它） */
  function mStatsFor(works, fromISO, toISO) {
    const done = works.filter(
      (w) => w.status === "done" &&
             (w.completed_date || "") >= fromISO &&
             (w.completed_date || "") <= toISO
    );
    const hoursOf = (t) => done
      .filter((w) => w.work_type === t)
      .reduce((s, w) => s + (w.actual_duration_hours || 0), 0);
    const regular = hoursOf("regular");
    const other = hoursOf("other");
    return { regular, other, total: regular + other, hours: regular + other, count: done.length };
  }

  function mPeriodPanelHTML(id, label, badge, s, subText) {
    return `
      <div class="panel period-panel">
        <div class="period-head">
          <div>
            <div class="ph-label">${label}<span class="ph-badge">${badge}</span></div>
            <div class="ph-value">${fmtNum(Math.round(s.hours * 10) / 10)} <small>小时</small></div>
            <div class="ph-sub">${subText}</div>
          </div>
        </div>
        <div class="chart-wrap"><svg id="${id}" class="chart chart-mini"></svg></div>
      </div>`;
  }

  function mRenderPeriods() {
    const works = Store.getWorks();
    if (!works) return;
    const now = new Date();

    const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const lm = mStatsFor(works, iso(lmStart), iso(lmEnd));
    // 月薪报表口径统一「截至上月」：今年至今 = 1月1日 ~ 上月最后一天
    const ytd = mStatsFor(works, `${now.getFullYear()}-01-01`, iso(lmEnd));

    const avgOf = (s) => (s.count ? Math.round((s.hours / s.count) * 10) / 10 : 0);

    document.getElementById("statsPeriods").innerHTML =
      mPeriodPanelHTML("chartLastMonth",
        `上月完成工时 · ${lmStart.getMonth() + 1} 月`, `${lmStart.getFullYear()}`,
        lm,
        lm.count
          ? `完成 ${lm.count} 项 · 平均每项 ${avgOf(lm)} 小时`
          : "上月暂无完成记录") +
      mPeriodPanelHTML("chartYtd",
        "今年完成工时（截至上月）", `${now.getFullYear()}`,
        ytd,
        ytd.count
          ? `完成 ${ytd.count} 项 · 平均每项 ${avgOf(ytd)} 小时`
          : "今年暂无完成记录");

    const cRegular = cssVar("--regular");
    const cOther = cssVar("--other");
    const items = (s) => [
      { label: "常规工作", value: s.regular, color: cRegular, valueText: fmtNum(Math.round(s.regular * 10) / 10) + " h" },
      { label: "其他工作", value: s.other, color: cOther, valueText: fmtNum(Math.round(s.other * 10) / 10) + " h" },
    ];
    Charts.miniSplit(document.getElementById("chartLastMonth"), items(lm), { total: lm.total });
    Charts.miniSplit(document.getElementById("chartYtd"), items(ytd), { total: ytd.total });
  }

  /** 月薪：近 6 个月完成对比表（后端数据） */
  function mMonthlyTableHTML(rows) {
    const maxHours = Math.max(...rows.map((r) => r.hours), 1);
    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    const avgPerItem = totalCount ? totalHours / totalCount : 0;

    return `
      <div class="panel table-panel">
        <div class="panel-title">近 6 个月完成对比<span class="panel-note">完成项 · 工时 · 平均每项工时（截至上月）</span></div>
        <table class="data-table">
          <thead>
            <tr>
              <th>月份</th>
              <th class="num">完成项</th>
              <th class="num">总工时</th>
              <th class="num">工时占比</th>
              <th class="num">平均每项工时</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr class="${i === rows.length - 1 ? "row-current" : ""}">
                <td><b>${r.label}</b><small class="row-year">${r.year}</small></td>
                <td class="num">${r.count}</td>
                <td class="num">${fmtNum(Math.round(r.hours * 10) / 10)} h</td>
                <td class="num"><div class="cell-bar"><div class="cell-bar-fill cb-hours" style="width:${(r.hours / maxHours * 100).toFixed(1)}%"></div></div></td>
                <td class="num">${r.count ? fmtNum(Math.round((r.hours / r.count) * 10) / 10) + " h" : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td>合计 / 均值</td>
              <td class="num">${totalCount}</td>
              <td class="num">${fmtNum(Math.round(totalHours * 10) / 10)} h</td>
              <td class="num">—</td>
              <td class="num">${fmtNum(Math.round(avgPerItem * 10) / 10)} h</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  /** 月薪：工作类型效率对比表（含收入 / 小时工资，数据全部来自「上月」汇总） */
  function mTypeTableHTML(summary) {
    const g = summary.groups;
    const types = [
      { key: "regular", label: "常规工作", color: "var(--regular)", data: g[0] },
      { key: "other", label: "其他工作", color: "var(--other)", data: g[1] },
    ];

    const rows = types.map((t) => {
      const done = t.data.count;
      const pending = t.data.pending_count || 0;
      const total = done + pending;
      const rate = total > 0 ? done / total : 0;
      const avgHours = done > 0 ? t.data.hours / done : 0;
      const avgIncome = done > 0 ? t.data.income / done : 0;
      return { ...t, done, pending, total, rate, avgHours, avgIncome };
    });

    return `
      <div class="panel table-panel">
        <div class="panel-title">工作类型效率对比<span class="panel-note">完成率 · 工时 · 收入 · 小时工资</span></div>
        <table class="data-table">
          <thead>
            <tr>
              <th>类型</th>
              <th class="num">已完成</th>
              <th class="num">待完成</th>
              <th class="num">完成率</th>
              <th class="num">总工时</th>
              <th class="num">收入</th>
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
  }

  /* ---------- 月薪：收入台账 + 月份切换 ---------- */
  let mSelectedMonth = null;      // 当前查看月份 YYYY-MM；null = 最近已配置月
  let mLedgerSettings = [];       // 供一次性绑定的委托事件读取
  let mTablesDelegated = false;   // #statsTables 委托监听只绑一次

  const M_ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const M_ICON_DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function mLedgerHTML(settings) {
    const monthLabel = (mk) => { const [y, m] = mk.split("-"); return `${y}年${Number(m)}月`; };
    const rows = (settings && settings.length)
      ? settings.map((s) => `
        <tr>
          <td>${monthLabel(s.month_key)}</td>
          <td class="num">${fmtMoney(s.regular_income)}</td>
          <td class="num">${fmtMoney(s.other_income)}</td>
          <td class="num"><b>${fmtMoney(s.total_income)}</b></td>
          <td class="num">
            <div class="row-actions">
              <button class="mini" data-medit="${s.month_key}" title="编辑该月收入">${M_ICON_EDIT}</button>
              <button class="mini del" data-mdel="${s.month_key}" title="删除该月收入">${M_ICON_DEL}</button>
            </div>
          </td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="empty-cell">还没有收入记录，点上方「记录月收入」新增</td></tr>`;
    return `
      <div class="table-panel">
        <div class="panel-title">月收入台账<span class="panel-note">每月一条 · 调薪即编辑对应月份，跨月互不影响</span></div>
        <table class="data-table">
          <thead><tr><th>月份</th><th class="num">常规收入</th><th class="num">其它收入</th><th class="num">合计</th><th class="num">操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function bindMonthlyControls(settings) {
    mLedgerSettings = settings || [];
    const pick = document.getElementById("mMonthPick");
    if (pick) pick.addEventListener("change", () => { mSelectedMonth = pick.value; renderMonthlyStats(); });
    const addBtn = document.getElementById("btnMonthlySettings");
    if (addBtn) addBtn.addEventListener("click", () => Modal.openMonthlySettings(null));
    if (!mTablesDelegated) {
      mTablesDelegated = true;
      const table = document.getElementById("statsTables");
      if (table) table.addEventListener("click", async (e) => {
        const edit = e.target.closest("[data-medit]");
        const del = e.target.closest("[data-mdel]");
        if (edit) {
          const rec = mLedgerSettings.find((s) => s.month_key === edit.dataset.medit);
          if (rec) Modal.openMonthlySettings(rec);
        } else if (del) {
          const mk = del.dataset.mdel;
          if (del.dataset.confirm !== "1") {   // 两步确认，避免误删
            del.dataset.confirm = "1";
            const orig = del.innerHTML;
            del.textContent = "确认?";
            setTimeout(() => { if (del.isConnected && del.dataset.confirm === "1") { del.dataset.confirm = ""; del.innerHTML = orig; } }, 3000);
            return;
          }
          try {
            await API.deleteMonthlySetting(mk);
            if (mSelectedMonth === mk) mSelectedMonth = null;
            Toast.show(`已删除 ${mk} 收入记录`, "ok");
            await Store.refresh();
          } catch (err) { Toast.show(err.message, "err"); }
        }
      });
    }
  }

  async function renderMonthlyStats() {
    const settings = await API.getMonthlySettings();
    const summary = await API.getMonthlySummary(mSelectedMonth || undefined);
    if (!summary) return;
    if (summary.period) mSelectedMonth = summary.period.month_key;
    mRenderReport(summary, settings);
    mRenderSub(summary);
    await mRenderCharts();
    mRenderPeriods();
    const monthly = await API.getMonthlyMonthly();
    const container = document.getElementById("statsTables");
    if (container) container.innerHTML = mLedgerHTML(settings) + mMonthlyTableHTML(monthly) + mTypeTableHTML(summary);
    bindMonthlyControls(settings);
  }

  return {
    /** 渲染整个统计视图（进入该 Tab 时调用，按模式分派） */
    async render() {
      if (Store.getMode() === "monthly") {
        await renderMonthlyStats();
        return;
      }
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
