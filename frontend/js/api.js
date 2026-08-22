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

    /** 统计接口 */
    getSummary: () => request("GET", "/api/stats/summary"),
    getDaily: (days = 14) => request("GET", `/api/stats/daily?days=${days}`),
    getWeekly: () => request("GET", "/api/stats/weekly"),

    /** 健康检查 */
    health: () => request("GET", "/api/health"),

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
