/* store.js — 全局数据状态与变更通知
 *
 * 单一数据源：所有视图从 Store.getWorks() 渲染；
 * 任何增删改完成后调用 Store.refresh() 拉取最新数据，
 * 各视图通过订阅 onRefresh 回调自动重渲染，实现“报表实时同步更新”。
 *
 * 双模式支持（日薪 daily / 月薪 monthly）：
 * - 两套数据完全独立（后端独立表），refresh() 同时拉取、互不干扰；
 * - Store.getWorks()/getSummary() 返回「当前模式」的数据；
 * - setMode() 切换当前模式并通知各视图重渲染，模式记忆在 localStorage。
 */
const Store = (() => {
  const MODE_KEY = "wd_mode";
  let mode = "daily";                       // 当前模式：daily | monthly
  const data = {                            // 两套数据，互不干扰
    daily: { works: [], summary: null },
    monthly: { works: [], summary: null },
  };
  let listeners = [];                       // 刷新回调（视图注册）

  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === "monthly" || m === "daily") mode = m;
  } catch (e) { /* 忽略 */ }

  const TYPE_LABEL = { regular: "常规工作", other: "其他工作" };

  function current() {
    return data[mode];
  }

  function notify() {
    listeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error("[store] listener error:", e); }
    });
  }

  async function refresh() {
    // 两套数据同时拉取，各自独立、互不影响
    const [w, s, mw, ms] = await Promise.all([
      API.listWorks(),
      API.getSummary(),
      API.listMonthlyWorks(),
      API.getMonthlySummary(),
    ]);
    data.daily.works = w;
    data.daily.summary = s;
    data.monthly.works = mw;
    data.monthly.summary = ms;
    notify();
    return { works: current().works, summary: current().summary };
  }

  /** 切换模式（daily | monthly），通知各视图重渲染 */
  function setMode(m) {
    if (m !== "daily" && m !== "monthly") return;
    if (m === mode) return;
    mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 忽略 */ }
    notify();
  }

  return {
    TYPE_LABEL,

    /** 重新拉取全部数据并通知各视图刷新（每次写操作后调用） */
    refresh,

    /** 切换当前模式（daily | monthly） */
    setMode,

    /** 当前模式：'daily' | 'monthly' */
    getMode: () => mode,

    /** 订阅数据变更，返回取消订阅函数 */
    subscribe(fn) {
      listeners.push(fn);
      return () => { listeners = listeners.filter((f) => f !== fn); };
    },

    getWorks: () => current().works,
    getSummary: () => current().summary,

    /** 在指定日期（YYYY-MM-DD）展示的工作：已完成的按完成日期归位 */
    worksOn(dateStr) {
      return current().works.filter((w) =>
        w.status === "done" ? w.completed_date === dateStr : w.planned_date === dateStr
      );
    },

    /** 按类型过滤（type: '' | 'regular' | 'other'） */
    byType(type) {
      return type ? current().works.filter((w) => w.work_type === type) : current().works;
    },

    /** 按状态过滤（status: '' | 'pending' | 'done'） */
    byStatus(status) {
      return status ? current().works.filter((w) => w.status === status) : current().works;
    },
  };
})();
