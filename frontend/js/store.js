/* store.js — 全局数据状态与变更通知
 *
 * 单一数据源：所有视图从 store.works 渲染；
 * 任何增删改完成后调用 Store.refresh() 拉取最新数据，
 * 各视图通过订阅 onRefresh 回调自动重渲染，实现“报表实时同步更新”。
 */
const Store = (() => {
  let works = [];                 // 全部工作（最新）
  let summary = null;             // 统计摘要
  let listeners = [];             // 刷新回调（视图注册）

  const TYPE_LABEL = { regular: "常规工作", other: "其他工作" };

  function notify() {
    listeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error("[store] listener error:", e); }
    });
  }

  async function refresh() {
    const [w, s] = await Promise.all([API.listWorks(), API.getSummary()]);
    works = w;
    summary = s;
    notify();
    return { works, summary };
  }

  return {
    TYPE_LABEL,

    /** 重新拉取全部数据并通知各视图刷新（每次写操作后调用） */
    refresh,

    /** 订阅数据变更，返回取消订阅函数 */
    subscribe(fn) {
      listeners.push(fn);
      return () => { listeners = listeners.filter((f) => f !== fn); };
    },

    getWorks: () => works,
    getSummary: () => summary,

    /** 在指定日期（YYYY-MM-DD）展示的工作：已完成的按完成日期归位 */
    worksOn(dateStr) {
      return works.filter((w) =>
        w.status === "done" ? w.completed_date === dateStr : w.planned_date === dateStr
      );
    },

    /** 按类型过滤（type: '' | 'regular' | 'other'） */
    byType(type) {
      return type ? works.filter((w) => w.work_type === type) : works;
    },

    /** 按状态过滤（status: '' | 'pending' | 'done'） */
    byStatus(status) {
      return status ? works.filter((w) => w.status === status) : works;
    },
  };
})();
