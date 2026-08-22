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
        <div class="seg-btn ${current === "regular" ? "active-regular" : ""}" data-type="regular">◈ 常规工作</div>
        <div class="seg-btn ${current === "other" ? "active-other" : ""}" data-type="other">✦ 其他工作</div>
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

  /* ---------- 录入记忆（按工作类型独立，localStorage） ----------
   * 「常规工作」与「其他工作」各自独立记忆上次填写内容（名称/时长/预期收入/备注），
   * 互不影响；新建弹窗中切换类型时，当前输入自动存回原类型，并载入新类型的记忆。
   * 计划完成日期始终更新为今天（或点击的日期格）。
   * 输入即记忆：填写过程中实时保存，未点保存/中途关闭也能在下一次自动载入。 */
  const LAST_KEYS = { regular: "wd_last_regular", other: "wd_last_other" };
  const typeLabel = (t) => (t === "regular" ? "常规工作" : "其他工作");

  function loadLast(type) {
    try {
      const v = JSON.parse(localStorage.getItem(LAST_KEYS[type]) || "null");
      return v && typeof v === "object" ? v : null;
    } catch (e) { return null; }
  }

  function saveLast(type, data) {
    try { localStorage.setItem(LAST_KEYS[type], JSON.stringify(data)); } catch (e) { /* 忽略 */ }
  }

  function clearLast(type) {
    try { localStorage.removeItem(LAST_KEYS[type]); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 1. 新建工作 ---------- */
  function openCreate(defaults = {}) {
    const initialType = defaults.work_type || "regular";
    // 预填：显式传入的字段优先（如日期格点击），其余取自该类型的上次记忆
    const last = loadLast(initialType) || {};
    const merged = {
      work_type: initialType,
      name: defaults.name || last.name || "",
      duration_hours: defaults.duration_hours ?? last.duration_hours ?? "",
      planned_date: defaults.planned_date || todayISO(),
      expected_income: defaults.expected_income ?? last.expected_income ?? "",
      notes: defaults.notes ?? last.notes ?? "",
    };
    const restored = !!(last.name || last.notes);
    const dateIsToday = merged.planned_date === todayISO();

    open(`
      <div class="form-grid">
        ${typeSegHTML(merged.work_type)}
        <div class="form-item full restore-hint" id="restoreHint" ${restored ? "" : "hidden"}>
          <span id="restoreHintText">🧠 已载入上次「${typeLabel(initialType)}」的填写内容${dateIsToday ? "，日期已更新为今天" : ""}</span>
          <button class="btn btn-ghost btn-xs" id="btnClearLast" type="button">清空重填</button>
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
        <div class="form-item">
          <label>预期收入（元）</label>
          <input class="input" id="fIncome" type="number" min="0" step="100" value="${merged.expected_income}" placeholder="0" />
        </div>
        <div class="form-item full">
          <label>备注</label>
          <textarea class="input" id="fNotes" maxlength="2000" placeholder="补充说明…">${esc(merged.notes)}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSubmit">保存</button>
      </div>`, "📝 录入工作");

    const curType = () => body().querySelector("#fType").value;

    // 把表单当前内容保存到指定类型的记忆
    function snapshotFor(type) {
      saveLast(type, {
        name: body().querySelector("#fName").value.trim(),
        duration_hours: numVal("fDur"),
        expected_income: numVal("fIncome"),
        notes: body().querySelector("#fNotes").value.trim(),
      });
    }

    // 载入指定类型的记忆到表单，并同步提示条
    function applyLast(type) {
      const m = loadLast(type) || {};
      body().querySelector("#fName").value = m.name || "";
      body().querySelector("#fDur").value = m.duration_hours ?? "";
      body().querySelector("#fIncome").value = m.expected_income ?? "";
      body().querySelector("#fNotes").value = m.notes || "";
      const hint = body().querySelector("#restoreHint");
      if (!hint) return;
      if (m.name || m.notes) {
        hint.hidden = false;
        body().querySelector("#restoreHintText").textContent = `🧠 已载入上次「${typeLabel(type)}」的填写内容`;
      } else {
        hint.hidden = true;
      }
    }

    // 切换类型：当前输入存回原类型 → 载入新类型的记忆（两类别互不干扰）
    bindTypeSeg((prev, next) => {
      snapshotFor(prev);
      applyLast(next);
    });

    // 记忆提示条：一键清空（仅清除当前类型的记忆，下次不再自动载入）
    const clearBtn = body().querySelector("#btnClearLast");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        clearLast(curType());
        ["fName", "fDur", "fIncome", "fNotes"].forEach((id) => {
          const el = body().querySelector(`#${id}`);
          if (el) el.value = "";
        });
        body().querySelector("#restoreHint").hidden = true;
        Toast.show(`已清空「${typeLabel(curType())}」的记忆，下次不再自动载入`, "ok");
      });
    }

    // 输入即记忆：实时保存到当前类型，未保存/中途关闭也能保留
    ["fName", "fDur", "fIncome", "fNotes"].forEach((id) => {
      const el = body().querySelector(`#${id}`);
      if (el) el.addEventListener("input", () => snapshotFor(curType()));
    });

    if (restored) {
      Toast.show(`已载入上次「${typeLabel(initialType)}」的填写内容${dateIsToday ? "，日期已更新为今天" : ""} ✨`, "ok");
    }

    document.getElementById("btnSubmit").addEventListener("click", async () => {
      const name = document.getElementById("fName").value.trim();
      const planned = document.getElementById("fPlanned").value;
      if (!name) return Toast.show("请输入工作名称", "err");
      if (!planned) return Toast.show("请选择计划完成日期", "err");
      const workType = document.getElementById("fType").value;
      const payload = {
        name,
        work_type: workType,
        duration_hours: numVal("fDur"),
        planned_date: planned,
        expected_income: numVal("fIncome"),
        notes: document.getElementById("fNotes").value.trim(),
      };
      try {
        await API.createWork(payload);
        // 按类型独立记忆，供下次录入自动载入
        saveLast(workType, {
          name: payload.name,
          duration_hours: payload.duration_hours,
          expected_income: payload.expected_income,
          notes: payload.notes,
        });
        close();
        Toast.show("工作已录入 ✔", "ok");
        await Store.refresh();
      } catch (e) { Toast.show(e.message, "err"); }
    });
  }

  /* ---------- 2. 编辑工作 ---------- */
  function openEdit(work) {
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
      <div class="form-item">
        <label>实际收入（元）</label>
        <input class="input" id="fActIncome" type="number" min="0" step="100" value="${work.actual_income ?? ""}" />
      </div>` : "";

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
        <div class="form-item">
          <label>预期收入（元）</label>
          <input class="input" id="fIncome" type="number" min="0" step="100" value="${work.expected_income}" />
        </div>
        <div class="form-item full">
          <label>备注</label>
          <textarea class="input" id="fNotes" maxlength="2000">${esc(work.notes)}</textarea>
        </div>
        ${actualSection}
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnSubmit">保存修改</button>
      </div>`, "✏️ 编辑工作");
    bindTypeSeg();

    document.getElementById("btnSubmit").addEventListener("click", async () => {
      const name = document.getElementById("fName").value.trim();
      const planned = document.getElementById("fPlanned").value;
      if (!name) return Toast.show("请输入工作名称", "err");
      if (!planned) return Toast.show("请选择计划完成日期", "err");
      try {
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
        close();
        Toast.show("已保存 ✔", "ok");
        await Store.refresh();
      } catch (e) { Toast.show(e.message, "err"); }
    });
  }

  /* ---------- 3. 卡片操作 ---------- */
  function openWorkActions(work) {
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
          <div class="form-item full">
            <label>实际收入（元，默认取预期值）</label>
            <input class="input" id="cIncome" type="number" min="0" step="100" value="${work.expected_income}" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-ghost" id="btnEdit">编辑</button>
          <button class="btn btn-primary" id="btnComplete">✔ 标记完成</button>
        </div>`, "✅ 标记完成");
      document.getElementById("btnComplete").addEventListener("click", async () => {
        try {
          await API.completeWork(work.id, {
            actual_duration_hours: numVal("cDur"),
            completed_date: document.getElementById("cDate").value || todayISO(),
            actual_income: numVal("cIncome"),
          });
          close();
          Toast.show("已标记完成，报表已同步 ✔", "ok");
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
          <button class="btn btn-ghost" id="btnReopen">↺ 重新打开</button>
          <button class="btn btn-primary" id="btnEdit">编辑实际数据</button>
        </div>`, "🔍 已完成工作");
      document.getElementById("btnEdit").addEventListener("click", () => openEdit(work));
      document.getElementById("btnReopen").addEventListener("click", async () => {
        try {
          await API.reopenWork(work.id);
          close();
          Toast.show("已恢复为待完成", "ok");
          await Store.refresh();
        } catch (e) { Toast.show(e.message, "err"); }
      });
    }
  }

  /* ---------- 4. 删除确认 ---------- */
  function confirmDelete(work) {
    open(`
      <p style="color:var(--text-1);line-height:1.8">
        确定删除工作 <b style="color:var(--text-0)">${esc(work.name)}</b> 吗？<br/>
        删除后不可恢复。
      </p>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary btn-danger" id="btnDel">删除</button>
      </div>`, "🗑 删除确认");
    document.getElementById("btnDel").addEventListener("click", async () => {
      try {
        await API.deleteWork(work.id);
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
          <p class="io-hint">💡 导出的文件可用于备份、迁移到其他电脑，或编辑后再导入回来。</p>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnDoExport">⇩ 导出文件</button>
      </div>`, "⇩ 导出数据");
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
        btn.textContent = "⇩ 导出文件";
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
            <div class="io-file-main" id="ioFileMain">📄 点击选择文件，或把文件拖到这里</div>
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
          <p class="io-hint io-warn" id="ioWarn" hidden>⚠️ 覆盖导入会先删除当前全部数据，建议先「导出」一份备份再继续。</p>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="btnDoImport" disabled>⇧ 开始导入</button>
      </div>`, "⇧ 导入数据");

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
        mainEl.textContent = "📄 已选择文件，点击可重新选择";
        submitBtn.disabled = false;
      } else {
        nameEl.textContent = "";
        mainEl.textContent = "📄 点击选择文件，或把文件拖到这里";
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
        submitBtn.textContent = "⇧ 开始导入";
      }
    });
  }

  return { openCreate, openEdit, openWorkActions, confirmDelete, openExport, openImport, close };
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
