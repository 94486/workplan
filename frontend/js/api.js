/* api.js — 后端 REST API 封装层
 * 所有 HTTP 请求集中在这里，业务代码只调用语义化函数。
 */
const API = (() => {
  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.detail || `请求失败 (${res.status})`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return data;
  }

  return {
    /** 查询工作列表（支持 status / work_type / date_from / date_to 过滤） */
    listWorks: (params = {}) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== "" && v != null)
      ).toString();
      return request("GET", `/api/works${q ? "?" + q : ""}`);
    },
    createWork: (data) => request("POST", "/api/works", data),
    updateWork: (id, data) => request("PUT", `/api/works/${id}`, data),
    deleteWork: (id) => request("DELETE", `/api/works/${id}`),
    completeWork: (id, data) => request("POST", `/api/works/${id}/complete`, data),
    reopenWork: (id) => request("POST", `/api/works/${id}/reopen`),

    /** 预设接口（常规工作 / 其他工作各自独立） */
    listPresets: (work_type = "regular") =>
      request("GET", `/api/presets${work_type ? `?work_type=${work_type}` : ""}`),
    createPreset: (data) => request("POST", "/api/presets", data),
    updatePreset: (id, data) => request("PUT", `/api/presets/${id}`, data),
    deletePreset: (id) => request("DELETE", `/api/presets/${id}`),

    /** 月薪模式：任务接口（无收入字段） */
    listMonthlyWorks: (params = {}) => {
      const q = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== "" && v != null)
      ).toString();
      return request("GET", `/api/monthly/works${q ? "?" + q : ""}`);
    },
    createMonthlyWork: (data) => request("POST", "/api/monthly/works", data),
    updateMonthlyWork: (id, data) => request("PUT", `/api/monthly/works/${id}`, data),
    deleteMonthlyWork: (id) => request("DELETE", `/api/monthly/works/${id}`),
    completeMonthlyWork: (id, data) => request("POST", `/api/monthly/works/${id}/complete`, data),
    reopenMonthlyWork: (id) => request("POST", `/api/monthly/works/${id}/reopen`),

    /** 月薪模式：预设接口 */
    listMonthlyPresets: (work_type = "regular") =>
      request("GET", `/api/monthly/presets${work_type ? `?work_type=${work_type}` : ""}`),
    createMonthlyPreset: (data) => request("POST", "/api/monthly/presets", data),
    updateMonthlyPreset: (id, data) => request("PUT", `/api/monthly/presets/${id}`, data),
    deleteMonthlyPreset: (id) => request("DELETE", `/api/monthly/presets/${id}`),

    /** 月薪模式：收入台账（按月） + 统计 */
    getMonthlySettings: () => request("GET", "/api/monthly/settings"),
    upsertMonthlySetting: (data) => request("PUT", "/api/monthly/settings", data),
    deleteMonthlySetting: (monthKey) => request("DELETE", `/api/monthly/settings/${encodeURIComponent(monthKey)}`),
    getMonthlySummary: (month) => request("GET", `/api/monthly/stats/summary${month ? `?month=${month}` : ""}`),
    getMonthlyWeekly: () => request("GET", "/api/monthly/stats/weekly"),
    getMonthlyMonthly: () => request("GET", "/api/monthly/stats/monthly"),

    /** 统计接口 */
    getSummary: () => request("GET", "/api/stats/summary"),
    getDaily: (days = 14) => request("GET", `/api/stats/daily?days=${days}`),
    getWeekly: () => request("GET", "/api/stats/weekly"),

    /** 健康检查 */
    health: () => request("GET", "/api/health"),

    /** 数据对接（外部程序推送 + 待审查合并） */
    getPushConfig: () => request("GET", "/api/push/config"),
    regeneratePushKey: () => request("PUT", "/api/push/config", { regenerate: true }),
    listPushInbox: (status = "pending") =>
      request("GET", `/api/push/inbox?status=${encodeURIComponent(status)}`),
    approvePush: (id) => request("POST", `/api/push/inbox/${id}/approve`),
    discardPush: (id) => request("POST", `/api/push/inbox/${id}/discard`),

    /** 数据导出：下载 JSON / CSV 备份文件（通过 blob 触发浏览器下载） */
    async exportData(format = "json") {
      const res = await fetch(`/api/data/export?format=${encodeURIComponent(format)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `导出失败 (${res.status})`);
      }
      const blob = await res.blob();
      // 从 Content-Disposition 解析服务端给出的中文文件名
      const cd = res.headers.get("Content-Disposition") || "";
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : `works_backup.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      return name;
    },

    /** 数据导入：上传 JSON / CSV 文件（mode: merge=合并 / replace=覆盖） */
    async importData(file, mode = "merge") {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch("/api/data/import", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `导入失败 (${res.status})`);
      }
      return data;
    },
  };
})();
