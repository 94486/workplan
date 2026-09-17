/* modal.js — 弹窗交互
 *
 * 弹窗列表：
 * 1. 新建工作（openCreate）           —— 录入基础字段
 * 2. 编辑工作（openEdit）             —— 待完成改基础字段 / 已完成改实际字段
 * 3. 卡片操作（openWorkActions）      —— 标记完成 / 编辑 / 重新打开 / 删除
 * 4. 删除确认（confirmDelete）
 * 5. 数据导出（openExport）           —— 选择 JSON / CSV 格式下载备份
 * 6. 数据导入（openImport）           —— 上传 JSON / CSV，合并或覆盖导入
 * 录入记忆按「常规工作 / 其他工作」类型独立保存（localStorage），互不影响。
 * 所有写操作成功后统一 Store.refresh()，各视图实时同步。
 */
const Modal = (() => {
  const mask = () => document.getElementById("workModalMask");
  const body = () => document.getElementById("modalBody");
  const title = () => document.getElementById("modalTitle");

  function open(html, t) {
    title().textContent = t;
    body().innerHTML = html;
    mask().classList.add("open");
  }

  function close() {
    mask().classList.remove("open");
    body().innerHTML = "";
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const typeSegHTML = (current = "regular") => `
    <div class="form-item full">
      <label>工作类型</label>
      <div class="seg">
        <div class="seg-btn ${current === "regular" ? "active-regular" : ""}" data-type="regular">常规工作</div>
        <div class="seg-btn ${current === "other" ? "active-other" : ""}" data-type="other">其他工作</div>
      </div>
      <input type="hidden" id="fType" value="${current}" />
    </div>`;

  function bindTypeSeg(onChange) {
    body().querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prev = body().querySelector("#fType").value;
        const type = btn.dataset.type;
        if (prev === type) return;
        body().querySelector("#fType").value = type;
        body().querySelectorAll(".seg-btn").forEach((b) => {
          b.className = "seg-btn";
          if (b.dataset.type === type) b.classList.add(type === "regular" ? "active-regular" : "active-other");
        });
        if (onChange) onChange(prev, type);
      });
    });
  }

  /* ---------- 表单取值工具 ---------- */
  function numVal(id) {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) || v < 0 ? 0 : v;
  }

  /* ---------- 1. 新建工作 ---------- */
  function openCreate(defaults = {}) {
    const monthly = Store.getMode() === "monthly";
    const initialType = defaults.work_type || "regular";
    const merged = {
      work_type: initialType,
      name: defaults.name || "",
      duration_hours: defaults.duration_hours ?? "",
      planned_date: defaults.planned_date || todayISO(),
      expected_income: defaults.expected_income ?? "",
      notes: defaults.notes ?? "",
    };

    open(`
      <div class="form-grid">
        ${typeSegHTML(merged.work_type)}
        <div class="form-item full" id="presetRow">
          <label id="presetLabel">快速预设（${initialType === "regular" ? "常规工作" : "其他工作"}）</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select class="input" id="fPreset" style="flex:1">
              <option value="">选择预设快速填入…</option>
            </select>
            <button class="btn btn-ghost btn-sm" id="btnSavePreset" type="button"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>存为预设</button>
            <button class="btn btn-ghost btn-sm" id="btnDelPreset" type="button" disabled>删除</button>
          </div>
        </div>
        <div class="form-item full">
          <label>工作名称 *</label>
          <input class="input" id="fName" maxlength="100" placeholder="例如：客户方案设计" value="${esc(merged.name)}" />
        </div>
        <div class="form-item">
          <label>花费时长（小时）</label>
          <input class="input" id="fDur" type="number" min="0" step="0.5" value="${merged.duration_hours}" placeholder="0" />
        </div>
        <div class="form-item">
          <label>计划完成日期 *</label>
          <input class="input" id="fPlanned" type="date" value="${esc(merged.planned_date)}" />
        </div>
        ${monthly ? "" : `
        <div class="form-item">
          <label>预期收入（元）</label>
          <input class="input" id="fIncome" type="number" min="0" step="100" value="${merged.expected_income}" placeholder="0" />
        </div>`}
        <div class="form-item full">
          <label>备注</label>
          <textarea class="input" id="fNotes" maxlength="2000" placeholder="补充说明…">${esc(merged.notes)}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSubmit">保存</button>
      </div>`, monthly ? "录入月薪任务" : "录入工作");

    const curType = () => body().querySelector("#fType").value;

    /* ---------- 预设功能（常规工作 / 其他工作，月薪模式独立一套） ---------- */
    let presets = [];
    const presetRow = () => body().querySelector("#presetRow");
    const presetSel = () => body().querySelector("#fPreset");
    const delPresetBtn = () => body().querySelector("#btnDelPreset");
    const presetLabel = () => body().querySelector("#presetLabel");

    // 更新预设标签文字
    function updatePresetLabel(type) {
      const el = presetLabel();
      if (!el) return;
      const tag = monthly ? "月薪·" : "";
      el.textContent = type === "regular"
        ? `快速预设（${tag}常规工作）`
        : `快速预设（${tag}其他工作）`;
    }

    // 拉取当前类型的预设列表并刷新下拉
    async function loadPresets() {
      const type = curType();
      try {
        presets = monthly ? await API.listMonthlyPresets(type) : await API.listPresets(type);
        const sel = presetSel();
        if (!sel) return;
        sel.innerHTML =
          '<option value="">选择预设快速填入…</option>' +
          presets.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
        delPresetBtn().disabled = true;
      } catch (e) { /* 预设加载失败不影响录入 */ }
    }

    // 用预设数据填充表单（不覆盖计划日期；月薪模式无收入字段）
    function applyPreset(p) {
      if (!p) return;
      body().querySelector("#fName").value = p.name || "";
      body().querySelector("#fDur").value = p.duration_hours ?? "";
      if (!monthly) body().querySelector("#fIncome").value = p.expected_income ?? "";
      body().querySelector("#fNotes").value = p.notes || "";
    }

    // 选择预设：自动填入字段
    presetSel().addEventListener("change", () => {
      const id = parseInt(presetSel().value, 10);
      delPresetBtn().disabled = !presetSel().value;
      if (!id) return;
      const p = presets.find((x) => x.id === id);
      if (p) {
        applyPreset(p);
        Toast.show(`已填入预设「${p.name}」`, "ok");
      }
    });

    // 把当前表单内容存为新预设（名称取工作名称，类型取当前类型）
    body().querySelector("#btnSavePreset").addEventListener("click", async () => {
      const name = body().querySelector("#fName").value.trim();
      if (!name) return Toast.show("请先输入工作名称，再存为预设", "err");
      try {
        if (monthly) {
          const p = await API.createMonthlyPreset({
            name,
            work_type: curType(),
            duration_hours: numVal("fDur"),
            notes: body().querySelector("#fNotes").value.trim(),
          });
          await loadPresets();
          presetSel().value = String(p.id);
          delPresetBtn().disabled = false;
          Toast.show(`已保存预设「${p.name}」`, "ok");
        } else {
          const p = await API.createPreset({
            name,
            work_type: curType(),
            duration_hours: numVal("fDur"),
            expected_income: numVal("fIncome"),
            notes: body().querySelector("#fNotes").value.trim(),
          });
          await loadPresets();
          presetSel().value = String(p.id);
          delPresetBtn().disabled = false;
          Toast.show(`已保存预设「${p.name}」`, "ok");
        }
      } catch (e) { Toast.show(e.message, "err"); }
    });

    // 删除当前选中的预设
    delPresetBtn().addEventListener("click", async () => {
      const id = parseInt(presetSel().value, 10);
      if (!id) return;
      const p = presets.find((x) => x.id === id);
      if (!confirm(`确定删除预设「${p ? p.name : "#" + id}」吗？`)) return;
      try {
        if (monthly) await API.deleteMonthlyPreset(id);
        else await API.deletePreset(id);
        await loadPresets();
        Toast.show("预设已删除", "ok");
      } catch (e) { Toast.show(e.message, "err"); }
    });

    // 初始加载当前类型的预设
    updatePresetLabel(initialType);
    loadPresets();

    // 切换类型：预设列表切换到对应类型，各自独立
    bindTypeSeg((prev, next) => {
      updatePresetLabel(next);
      loadPresets();
    });

    document.getElementById("btnSubmit").addEventListener("click", async () => {
      const name = document.getElementById("fName").value.trim();
      const planned = document.getElementById("fPlanned").value;
      if (!name) return Toast.show("请输入工作名称", "err");
      if (!planned) return Toast.show("请选择计划完成日期", "err");
      const workType = document.getElementById("fType").value;
      try {
        if (monthly) {
          await API.createMonthlyWork({
            name,
            work_type: workType,
            duration_hours: numVal("fDur"),
            planned_date: planned,
            notes: document.getElementById("fNotes").value.trim(),
          });
        } else {
          await API.createWork({
            name,
            work_type: workType,
            duration_hours: numVal("fDur"),
            planned_date: planned,
            expected_income: numVal("fIncome"),
            notes: document.getElementById("fNotes").value.trim(),
          });
        }
        close();
        Toast.show("工作已录入", "ok");
        await Store.refresh();
      } catch (e) { Toast.show(e.message, "err"); }
    });
  }

  /* ---------- 2. 编辑工作 ---------- */
  function openEdit(work) {
    const monthly = Store.getMode() === "monthly";
    const done = work.status === "done";
    const actualSection = done ? `
      <div class="form-item full" style="border-top:1px dashed var(--line);padding-top:12px;margin-top:6px">
        <label style="color:var(--done)">▼ 实际完成数据（已完成工作可修改）</label>
      </div>
      <div class="form-item">
        <label>实际花费时长（小时）</label>
        <input class="input" id="fActDur" type="number" min="0" step="0.5" value="${work.actual_duration_hours ?? ""}" />
      </div>
      <div class="form-item">
        <label>完成日期</label>
        <input class="input" id="fActDate" type="date" value="${esc(work.completed_date || todayISO())}" />
      </div>
      ${monthly ? "" : `
      <div class="form-item">
        <label>实际收入（元）</label>
        <input class="input" id="fActIncome" type="number" min="0" step="100" value="${work.actual_income ?? ""}" />
      </div>`}` : "";

    open(`
      <div class="form-grid">
        ${typeSegHTML(work.work_type)}
        <div class="form-item full">
          <label>工作名称 *</label>
          <input class="input" id="fName" maxlength="100" value="${esc(work.name)}" />
        </div>
        <div class="form-item">
          <label>花费时长（小时）</label>
          <input class="input" id="fDur" type="number" min="0" step="0.5" value="${work.duration_hours}" />
        </div>
        <div class="form-item">
          <label>计划完成日期 *</label>
          <input class="input" id="fPlanned" type="date" value="${esc(work.planned_date)}" />
        </div>
        ${monthly ? "" : `
        <div class="form-item">
          <label>预期收入（元）</label>
          <input class="input" id="fIncome" type="number" min="0" step="100" value="${work.expected_income}" />
        </div>`}
        <div class="form-item full">
          <label>备注</label>
          <textarea class="input" id="fNotes" maxlength="2000">${esc(work.notes)}</textarea>
        </div>
        ${actualSection}
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSubmit">保存修改</button>
      </div>`, "编辑工作");
    bindTypeSeg();

    document.getElementById("btnSubmit").addEventListener("click", async () => {
      const name = document.getElementById("fName").value.trim();
      const planned = document.getElementById("fPlanned").value;
      if (!name) return Toast.show("请输入工作名称", "err");
      if (!planned) return Toast.show("请选择计划完成日期", "err");
      try {
        if (monthly) {
          const base = {
            name,
            work_type: document.getElementById("fType").value,
            duration_hours: numVal("fDur"),
            planned_date: planned,
            notes: document.getElementById("fNotes").value.trim(),
          };
          if (done) {
            const actDurRaw = document.getElementById("fActDur").value;
            await API.updateMonthlyWork(work.id, base);
            await API.completeMonthlyWork(work.id, {
              actual_duration_hours: actDurRaw === "" ? work.actual_duration_hours : numVal("fActDur"),
              completed_date: document.getElementById("fActDate").value || work.completed_date || todayISO(),
            });
          } else {
            await API.updateMonthlyWork(work.id, base);
          }
        } else {
          const base = {
            name,
            work_type: document.getElementById("fType").value,
            duration_hours: numVal("fDur"),
            planned_date: planned,
            expected_income: numVal("fIncome"),
            notes: document.getElementById("fNotes").value.trim(),
          };
          if (done) {
            // 已完成：先恢复基础字段，再写实际字段（服务端 complete 会合并实际数据）
            // 实际字段留空时保留原值，避免误清零
            const actDurRaw = document.getElementById("fActDur").value;
            const actIncRaw = document.getElementById("fActIncome").value;
            const act = {
              actual_duration_hours: actDurRaw === "" ? work.actual_duration_hours : numVal("fActDur"),
              completed_date: document.getElementById("fActDate").value || work.completed_date || todayISO(),
              actual_income: actIncRaw === "" ? work.actual_income : numVal("fActIncome"),
            };
            await API.updateWork(work.id, base);
            await API.completeWork(work.id, act);
          } else {
            await API.updateWork(work.id, base);
          }
        }
        close();
        Toast.show("已保存", "ok");
        await Store.refresh();
      } catch (e) { Toast.show(e.message, "err"); }
    });
  }

  /* ---------- 3. 卡片操作 ---------- */
  function openWorkActions(work) {
    const monthly = Store.getMode() === "monthly";
    if (work.status === "pending") {
      open(`
        <div class="form-grid">
          <div class="form-item full">
            <label>标记完成 — ${esc(work.name)}</label>
          </div>
          <div class="form-item">
            <label>实际花费时长（小时，默认取计划值）</label>
            <input class="input" id="cDur" type="number" min="0" step="0.5" value="${work.duration_hours}" />
          </div>
          <div class="form-item">
            <label>完成日期（默认今天，修改后自动跳转至对应日期）</label>
            <input class="input" id="cDate" type="date" value="${todayISO()}" />
          </div>
          ${monthly ? "" : `
          <div class="form-item full">
            <label>实际收入（元，默认取预期值）</label>
            <input class="input" id="cIncome" type="number" min="0" step="100" value="${work.expected_income}" />
          </div>`}
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-ghost" id="btnEdit">编辑</button>
          <button class="btn btn-primary" id="btnComplete"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>标记完成</button>
        </div>`, "标记完成");
      document.getElementById("btnComplete").addEventListener("click", async () => {
        try {
          if (monthly) {
            await API.completeMonthlyWork(work.id, {
              actual_duration_hours: numVal("cDur"),
              completed_date: document.getElementById("cDate").value || todayISO(),
            });
          } else {
            await API.completeWork(work.id, {
              actual_duration_hours: numVal("cDur"),
              completed_date: document.getElementById("cDate").value || todayISO(),
              actual_income: numVal("cIncome"),
            });
          }
          close();
          Toast.show("已标记完成，报表已同步", "ok");
          await Store.refresh();
        } catch (e) { Toast.show(e.message, "err"); }
      });
      document.getElementById("btnEdit").addEventListener("click", () => openEdit(work));
    } else {
      open(`
        <div class="form-grid">
          <div class="form-item full">
            <label>${esc(work.name)} 已完成于 ${esc(work.completed_date || "-")}</label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" data-close>关闭</button>
          <button class="btn btn-ghost" id="btnReopen"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>重新打开</button>
          <button class="btn btn-primary" id="btnEdit">编辑实际数据</button>
        </div>`, "已完成工作");
      document.getElementById("btnEdit").addEventListener("click", () => openEdit(work));
      document.getElementById("btnReopen").addEventListener("click", async () => {
        try {
          if (monthly) await API.reopenMonthlyWork(work.id);
          else await API.reopenWork(work.id);
          close();
          Toast.show("已恢复为待完成", "ok");
          await Store.refresh();
        } catch (e) { Toast.show(e.message, "err"); }
      });
    }
  }

  /* ---------- 7. 月薪收入管理（独立弹窗 · 按月台账增删改） ---------- */
  async function openMonthlyIncome() {
    let settings = [];
    try { settings = await API.getMonthlySettings(); } catch (e) { /* 保持空 */ }
    const ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const ICON_DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const monthLabel = (mk) => { const [y, m] = String(mk).split("-"); return `${y}年${Number(m)}月`; };
    const _d = new Date();
    const curMonth = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}`;

    open(`
      <div class="income-mgr">
        <p class="io-hint">按月台账：每月一条收入，跨月独立并存。<b>遇到调薪就编辑对应月份</b>，或为新月新增一条。月薪报表默认展示本月实时数据。</p>
        <div class="im-form">
          <label class="im-field">月份<input class="input" id="imMonth" type="month" value="${esc(curMonth)}" /></label>
          <label class="im-field">常规收入<input class="input" id="imReg" type="number" min="0" step="100" placeholder="0" /></label>
          <label class="im-field">其它收入<input class="input" id="imOth" type="number" min="0" step="100" placeholder="0" /></label>
          <button class="btn btn-primary btn-sm" id="imSave">保存该月</button>
        </div>
        <div class="im-list" id="imList"></div>
      </div>`, "月薪收入管理");

    const renderList = () => {
      const el = document.getElementById("imList");
      if (!el) return;
      if (!settings.length) { el.innerHTML = `<div class="push-empty">还没有收入记录，用上方表单新增。</div>`; return; }
      el.innerHTML = `<table class="im-table"><thead><tr><th>月份</th><th class="num">常规</th><th class="num">其它</th><th class="num">合计</th><th class="num">操作</th></tr></thead><tbody>` +
        settings.map((s) => `<tr>
          <td>${monthLabel(s.month_key)}</td>
          <td class="num">${Number(s.regular_income || 0).toLocaleString()}</td>
          <td class="num">${Number(s.other_income || 0).toLocaleString()}</td>
          <td class="num"><b>${Number(s.total_income || 0).toLocaleString()}</b></td>
          <td class="num"><div class="row-actions">
            <button class="mini" data-load="${s.month_key}" title="载入到上方表单编辑">${ICON_EDIT}</button>
            <button class="mini del" data-del="${s.month_key}" title="删除该月">${ICON_DEL}</button>
          </div></td></tr>`).join("") + `</tbody></table>`;
    };
    renderList();

    document.getElementById("imList").addEventListener("click", async (e) => {
      const load = e.target.closest("[data-load]");
      const del = e.target.closest("[data-del]");
      if (load) {
        const s = settings.find((x) => x.month_key === load.dataset.load);
        if (s) {
          document.getElementById("imMonth").value = s.month_key;
          document.getElementById("imReg").value = s.regular_income || "";
          document.getElementById("imOth").value = s.other_income || "";
          document.getElementById("imReg").focus();
        }
      } else if (del) {
        const mk = del.dataset.del;
        if (del.dataset.confirm !== "1") {
          del.dataset.confirm = "1"; const orig = del.innerHTML; del.textContent = "确认?";
          setTimeout(() => { if (del.isConnected && del.dataset.confirm === "1") { del.dataset.confirm = ""; del.innerHTML = orig; } }, 3000);
          return;
        }
        try {
          await API.deleteMonthlySetting(mk);
          settings = await API.getMonthlySettings(); renderList();
          Toast.show(`已删除 ${mk} 收入记录`, "ok");
          await Store.refresh();
        } catch (err) { Toast.show(err.message, "err"); }
      }
    });

    document.getElementById("imSave").addEventListener("click", async () => {
      const mk = document.getElementById("imMonth").value;
      if (!mk) { Toast.show("请选择月份", "err"); return; }
      try {
        await API.upsertMonthlySetting({ month_key: mk, regular_income: numVal("imReg"), other_income: numVal("imOth") });
        settings = await API.getMonthlySettings(); renderList();
        Toast.show(`${mk} 收入已保存`, "ok");
        await Store.refresh();
      } catch (e) { Toast.show(e.message, "err"); }
    });
  }

  /* ---------- 4. 删除确认 ---------- */
  function confirmDelete(work) {
    const monthly = Store.getMode() === "monthly";
    open(`
      <p style="color:var(--text-1);line-height:1.8">
        确定删除工作 <b style="color:var(--text-0)">${esc(work.name)}</b> 吗？<br/>
        删除后不可恢复。
      </p>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary btn-danger" id="btnDel">删除</button>
      </div>`, "删除确认");
    document.getElementById("btnDel").addEventListener("click", async () => {
      try {
        // 严格按当前模式删除对应数据表的任务，避免误删另一套数据
        if (monthly) await API.deleteMonthlyWork(work.id);
        else await API.deleteWork(work.id);
        close();
        Toast.show("已删除", "ok");
        await Store.refresh();
      } catch (e) { Toast.show(e.message, "err"); }
    });
  }

  /* ---------- 5. 数据导出 ---------- */
  function openExport() {
    let format = "json";
    open(`
      <div class="form-grid">
        <div class="form-item full">
          <label>选择导出格式（导出全部工作数据为备份文件）</label>
          <div class="seg io-seg">
            <div class="seg-btn active-io" data-fmt="json">
              <b>JSON</b><small>结构化备份，适合完整恢复</small>
            </div>
            <div class="seg-btn" data-fmt="csv">
              <b>CSV</b><small>Excel 可直接打开查看</small>
            </div>
          </div>
        </div>
        <div class="form-item full">
          <p class="io-hint">导出的文件可用于备份、迁移到其他电脑，或编辑后再导入回来。</p>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnDoExport"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>导出文件</button>
      </div>`, "导出数据");
    body().querySelectorAll(".io-seg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        format = btn.dataset.fmt;
        body().querySelectorAll(".io-seg .seg-btn").forEach((b) => b.classList.remove("active-io"));
        btn.classList.add("active-io");
      });
    });
    document.getElementById("btnDoExport").addEventListener("click", async () => {
      const btn = document.getElementById("btnDoExport");
      btn.disabled = true;
      btn.textContent = "导出中…";
      try {
        const name = await API.exportData(format);
        close();
        Toast.show(`已导出：${name}`, "ok");
      } catch (e) {
        Toast.show(e.message, "err");
        btn.disabled = false;
        btn.textContent = "导出文件";
      }
    });
  }

  /* ---------- 6. 数据导入 ---------- */
  function openImport() {
    let mode = "merge";
    open(`
      <div class="form-grid">
        <div class="form-item full">
          <label>选择导入文件（.json / .csv，支持本系统导出的备份）</label>
          <div class="io-file" id="ioFileBox">
            <input type="file" id="ioFile" accept=".json,.csv" hidden />
            <div class="io-file-main" id="ioFileMain"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px;margin-right:6px" aria-hidden="true"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>点击选择文件，或把文件拖到这里</div>
            <div class="io-file-name" id="ioFileName"></div>
          </div>
        </div>
        <div class="form-item full">
          <label>导入方式</label>
          <div class="seg io-seg">
            <div class="seg-btn active-io" data-mode="merge">
              <b>合并导入</b><small>保留现有数据，跳过重复条目</small>
            </div>
            <div class="seg-btn" data-mode="replace">
              <b>覆盖导入</b><small>清空现有数据后全量写入</small>
            </div>
          </div>
        </div>
        <div class="form-item full">
          <p class="io-hint io-warn" id="ioWarn" hidden>覆盖导入会先删除当前全部数据，建议先「导出」一份备份再继续。</p>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnDoImport" disabled><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>开始导入</button>
      </div>`, "导入数据");

    const fileInput = document.getElementById("ioFile");
    const nameEl = document.getElementById("ioFileName");
    const mainEl = document.getElementById("ioFileMain");
    const box = document.getElementById("ioFileBox");
    const submitBtn = document.getElementById("btnDoImport");
    let picked = null;

    const syncFile = () => {
      picked = fileInput.files && fileInput.files[0];
      if (picked) {
        const sizeKb = (picked.size / 1024).toFixed(1);
        nameEl.textContent = `${picked.name}（${sizeKb} KB）`;
        mainEl.textContent = "已选择文件，点击可重新选择";
        submitBtn.disabled = false;
      } else {
        nameEl.textContent = "";
        mainEl.textContent = "点击选择文件，或把文件拖到这里";
        submitBtn.disabled = true;
      }
    };

    box.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", syncFile);
    // 拖拽支持
    ["dragover", "dragenter"].forEach((ev) =>
      box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) =>
      box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.remove("drag"); }));
    box.addEventListener("drop", (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        const f = e.dataTransfer.files[0];
        const dt = new DataTransfer();
        dt.items.add(f);
        fileInput.files = dt.files;
        syncFile();
      }
    });

    body().querySelectorAll(".io-seg .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        mode = btn.dataset.mode;
        body().querySelectorAll(".io-seg .seg-btn").forEach((b) => b.classList.remove("active-io"));
        btn.classList.add("active-io");
        document.getElementById("ioWarn").hidden = mode !== "replace";
      });
    });

    submitBtn.addEventListener("click", async () => {
      if (!picked) return;
      if (mode === "replace" && !confirm("覆盖导入将删除当前全部数据，确定继续吗？\n（建议先导出一份备份）")) return;
      submitBtn.disabled = true;
      submitBtn.textContent = "导入中…";
      try {
        const result = await API.importData(picked, mode);
        close();
        Toast.show(result.message || `导入完成：新增 ${result.imported} 条`, "ok");
        await Store.refresh();
      } catch (e) {
        Toast.show(e.message, "err");
        submitBtn.disabled = false;
        submitBtn.textContent = "开始导入";
      }
    });
  }

  /* ---------- 8. 数据对接（推送 + 审查合并） ---------- */
  async function openPush() {
    open(`
      <div class="form-grid">
        <div class="form-item full">
          <label>数据对接 · 外部程序推送</label>
          <p class="io-hint">外部程序推送统计数据 → 进入待审查箱 → 确认后合并入库（重复自动跳过）</p>
        </div>
        <div class="form-item full">
          <label>对接码 <small class="muted">（推送方需在请求头 X-Api-Key 中携带）</small></label>
          <div class="push-key-row">
            <input class="input" id="pushKey" readonly value="加载中…" />
            <button class="btn btn-ghost btn-sm" id="btnCopyKey" type="button">复制</button>
            <button class="btn btn-ghost btn-sm" id="btnRegenKey" type="button">重新生成</button>
          </div>
        </div>
        <div class="form-item full">
          <label>推送地址（POST）</label>
          <div class="push-key-row">
            <input class="input" id="pushUrl" readonly value="" />
            <button class="btn btn-ghost btn-sm" id="btnCopyUrl" type="button">复制</button>
          </div>
        </div>
        <div class="form-item full">
          <label>查询地址（GET）<small class="muted">（同一对接码只读查询，返回与导出一致的 JSON）</small></label>
          <div class="push-key-row">
            <input class="input" id="queryUrl" readonly value="" />
            <button class="btn btn-ghost btn-sm" id="btnCopyQuery" type="button">复制</button>
          </div>
        </div>
        <div class="form-item full">
          <label>待审查箱 <small class="muted">（接收合并 / 丢弃）</small></label>
          <div id="pushInbox" class="push-inbox"></div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>关闭</button>
        <button class="btn btn-primary" id="btnApproveAll"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>全部接收</button>
      </div>`, "数据对接");

    const inboxEl = () => document.getElementById("pushInbox");
    const urlEl = () => document.getElementById("pushUrl");

    const typeLabel = (t) => (t === "other" ? "其他" : "常规");
    const statusLabel = (s) => (s === "done" ? "已完成" : "待完成");
    const fmtTime = (s) => (s ? String(s).replace("T", " ").slice(0, 16) : "-");
    const fmtNum = (v) => (v == null ? "0" : String(Number(v).toFixed(1)).replace(/\.0$/, ""));
    const fmtMoney = (v) => (v == null ? "—" : "¥" + Number(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 }));

    // 复制文本到剪贴板
    async function copy(text, tip) {
      try {
        await navigator.clipboard.writeText(text);
        Toast.show(tip || "已复制", "ok");
      } catch (e) {
        Toast.show("复制失败，请手动选择复制", "err");
      }
    }

    // 渲染待审查列表
    async function renderInbox() {
      try {
        const items = await API.listPushInbox("pending");
        const box = inboxEl();
        if (!box) return;
        if (!items.length) {
          box.innerHTML = `<div class="push-empty">暂无待审查数据 — 推送后记录会显示在这里，确认后合并入库。</div>`;
        } else {
          box.innerHTML = items.map((it) => {
            const s = it.summary || {};
            const cats = s.categories || {};
            const catLabels = [
              ["日薪工作", cats.daily_works], ["日薪预设", cats.daily_presets],
              ["月薪任务", cats.monthly_works], ["月薪预设", cats.monthly_presets],
              ["收入配置", cats.settings],
            ];
            const catHtml = catLabels
              .filter(([, n]) => n > 0)
              .map(([label, n]) => `<span class="push-cat">${label} <b>${n}</b></span>`)
              .join("");
            const invalidBadge = (it.invalid_count || 0) > 0
              ? `<span class="push-invalid">无效 ${it.invalid_count} 条</span>` : "";
            const totalTasks = (cats.daily_works || 0) + (cats.monthly_works || 0)
                             + (cats.daily_presets || 0) + (cats.monthly_presets || 0)
                             + (cats.settings || 0);
            const previewCount = (it.preview || []).length;
            const summaryRows = [];
            if ((s.daily_hours || 0) > 0 || (s.monthly_hours || 0) > 0)
              summaryRows.push(`<span>工时 <b>${fmtNum((s.daily_hours || 0) + (s.monthly_hours || 0))}h</b></span>`);
            if ((s.daily_income || 0) > 0)
              summaryRows.push(`<span>收入 <b>${fmtMoney(s.daily_income)}</b></span>`);
            if ((s.types && s.types.regular) || (s.types && s.types.other))
              summaryRows.push(`<span>常规 ${s.types.regular || 0} · 其他 ${s.types.other || 0}</span>`);
            if (s.date_min)
              summaryRows.push(`<span>${s.date_min} ~ ${s.date_max || s.date_min}</span>`);
            const summaryHtml = summaryRows.length
              ? `<div class="push-summary">${summaryRows.join("")}</div>` : "";
            const moreTip = previewCount > 0 && totalTasks > previewCount
              ? `<div class="push-more">共 ${totalTasks} 条，预览前 ${previewCount} 条</div>` : "";
            const tableHtml = previewCount ? `
              <div class="push-table-wrap">
                <table class="push-table">
                  <thead><tr><th>类别</th><th>名称</th><th>类型</th><th>日期</th><th>状态</th><th>时长</th><th>收入</th></tr></thead>
                  <tbody>${it.preview.map((p) => `
                    <tr>
                      <td><span class="push-kind ${p.kind === "月薪" ? "m" : ""}">${p.kind}</span></td>
                      <td class="push-tname" title="${esc(p.name)}">${esc(p.name)}</td>
                      <td>${typeLabel(p.work_type)}</td>
                      <td class="push-tdate">${esc(p.planned_date || "-")}</td>
                      <td><span class="push-status ${p.status === "done" ? "done" : ""}">${statusLabel(p.status)}</span></td>
                      <td class="push-tnum">${fmtNum(p.duration)}h</td>
                      <td class="push-tnum">${p.income == null ? "—" : fmtMoney(p.income)}</td>
                    </tr>`).join("")}</tbody>
                </table>
              </div>${moreTip}` : "";
            const timeStr = it.pushed_at ? fmtTime(it.pushed_at) : fmtTime(it.received_at);
            const timeLabel = it.pushed_at ? "推送" : "接收";
            return `
            <div class="push-item${(it.invalid_count || 0) > 0 ? " has-invalid" : ""}" data-id="${it.id}">
              <div class="push-item-head">
                <span class="push-item-src">${esc(it.source || "未命名来源")}</span>
                <span class="push-item-meta">${invalidBadge}<span>${it.record_count} 条</span><span>${timeLabel} ${timeStr}</span></span>
              </div>
              ${catHtml ? `<div class="push-cats">${catHtml}</div>` : ""}
              ${summaryHtml}
              ${tableHtml}
              <div class="push-item-actions">
                <button class="btn btn-primary btn-sm" data-act="approve"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>接收合并</button>
                <button class="btn btn-ghost btn-sm" data-act="discard">丢弃</button>
              </div>
            </div>`;
          }).join("");
          box.querySelectorAll("[data-act]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const id = parseInt(btn.closest(".push-item").dataset.id, 10);
              if (btn.dataset.act === "discard" && !confirm("确定丢弃这批待审查数据吗？丢弃后不可恢复。")) return;
              btn.disabled = true;
              try {
                const r = btn.dataset.act === "approve" ? await API.approvePush(id) : await API.discardPush(id);
                Toast.show(r.message || "已处理", "ok");
                await renderInbox();
              } catch (e) {
                Toast.show(e.message, "err");
                btn.disabled = false;
              }
            });
          });
        }
      } catch (e) {
        const box = inboxEl();
        if (box) box.innerHTML = `<div class="push-empty">待审查箱加载失败：${esc(e.message)}</div>`;
      }
      // 通知全局刷新对接按钮角标（审核/丢弃后即时更新）
      try { document.dispatchEvent(new CustomEvent("push-inbox-changed")); } catch (e) { /* noop */ }
    }

    // 加载对接码 + 地址
    try {
      const cfg = await API.getPushConfig();
      if (document.getElementById("pushKey")) document.getElementById("pushKey").value = cfg.api_key;
      urlEl().value = `${location.origin}/api/push`;
      if (document.getElementById("queryUrl")) document.getElementById("queryUrl").value = `${location.origin}/api/push/query?scope=all`;
    } catch (e) {
      if (document.getElementById("pushKey")) document.getElementById("pushKey").value = "加载失败";
      Toast.show(e.message, "err");
    }

    document.getElementById("btnCopyKey").addEventListener("click", () => copy(document.getElementById("pushKey").value, "对接码已复制"));
    document.getElementById("btnCopyUrl").addEventListener("click", () => copy(urlEl().value, "推送地址已复制"));
    document.getElementById("btnCopyQuery").addEventListener("click", () => copy(document.getElementById("queryUrl").value, "查询地址已复制"));
    document.getElementById("btnRegenKey").addEventListener("click", async () => {
      if (!confirm("重新生成对接码后，旧对接码立即失效，已对接的程序需更新对接码。确定继续吗？")) return;
      try {
        const r = await API.regeneratePushKey();
        document.getElementById("pushKey").value = r.api_key;
        Toast.show("对接码已更新，旧码已失效", "ok");
      } catch (e) { Toast.show(e.message, "err"); }
    });
    document.getElementById("btnApproveAll").addEventListener("click", async () => {
      try {
        const items = await API.listPushInbox("pending");
        if (!items.length) return Toast.show("当前没有待审查数据", "ok");
        if (!confirm(`确定全部接收并合并这 ${items.length} 批数据吗？`)) return;
        const btn = document.getElementById("btnApproveAll");
        btn.disabled = true;
        let dw = 0, mw = 0, dp = 0, mp = 0, st = 0, skip = 0, inv = 0;
        for (const it of items) {
          const r = await API.approvePush(it.id);
          dw += r.daily_works || 0; mw += r.monthly_works || 0;
          dp += r.daily_presets || 0; mp += r.monthly_presets || 0; st += r.settings || 0;
          skip += r.skipped || 0; inv += r.invalid || 0;
        }
        let m = `全部接收完成：日薪工作 ${dw} 条、月薪任务 ${mw} 条`;
        if (dp) m += `、日薪预设 ${dp} 条`;
        if (mp) m += `、月薪预设 ${mp} 条`;
        if (st) m += `、收入配置 ${st} 条`;
        if (skip) m += `，跳过重复 ${skip} 条`;
        if (inv) m += `，无效 ${inv} 条`;
        Toast.show(m, "ok");
        btn.disabled = false;
        await renderInbox();
      } catch (e) {
        Toast.show(e.message, "err");
        document.getElementById("btnApproveAll").disabled = false;
      }
    });

    renderInbox();
  }

  return { openCreate, openEdit, openWorkActions, confirmDelete, openExport, openImport, openPush, openMonthlyIncome, close };
})();

/* ---------- Toast 轻提示 ---------- */
const Toast = {
  show(msg, type = "") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { t.className = "toast"; }, 2200);
  },
};
