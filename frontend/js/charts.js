/* charts.js — 零依赖 SVG 图表库（科技感风格）
 *
 * 提供：
 * - comboChart  双轴组合图：柱状（工时，右轴）+ 折线趋势（收入，左轴），
 *               带渐变填充、面积光晕、发光节点与虚线网格；
 * - miniSplit   迷你横向构成图：常规 / 其他收入对比小图；
 * - groupedBars 分组柱状图（通用）；donut 环形图（通用）。
 * 不依赖外部 CDN，离线可用，且与暗色科技主题统一。
 */
const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const W = 900, H = 300;
  let uid = 0;

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  /** 垂直渐变定义（每个 SVG 实例独立 id，避免冲突） */
  function vGradient(svg, id, color, fromA = 0.18, toA = 0.95) {
    const defs = el("defs", {}, svg);
    const grad = el("linearGradient", { id, x1: "0", y1: "1", x2: "0", y2: "0" }, defs);
    el("stop", { offset: "0%", "stop-color": color, "stop-opacity": fromA }, grad);
    el("stop", { offset: "100%", "stop-color": color, "stop-opacity": toA }, grad);
    return id;
  }

  /** 发光滤镜 */
  function glowFilter(svg, id, color, blur = 3) {
    const defs = el("defs", {}, svg);
    const f = el("filter", { id, x: "-60%", y: "-60%", width: "220%", height: "220%" }, defs);
    const g = el("feGaussianBlur", { stdDeviation: blur, result: "b" }, f);
    el("feFlood", { "flood-color": color, "flood-opacity": 0.55, result: "c" }, f);
    el("feComposite", { in: "c", in2: "b", operator: "in", result: "g" }, f);
    el("feMerge", {}, f);
    const m = f.lastChild;
    el("feMergeNode", { in: "g" }, m);
    el("feMergeNode", { in: "SourceGraphic" }, m);
    return id;
  }

  /* ---------- 双轴组合图：柱（右轴）+ 折线趋势（左轴）· 动感重构 ---------- */
  function comboChart(svg, {
    labels,
    barSeries,   // {name, color, values[]}
    lineSeries,  // {name, color, values[]}
    fmtL = (v) => v, fmtR = (v) => v, fmtVal = null,
  }) {
    clear(svg);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.classList.add("combo-chart");

    const fmt = fmtVal || fmtL;
    const pad = { l: 60, r: 60, t: 40, b: 44 };
    const left = pad.l, right = W - pad.r, top = pad.t, bottom = H - pad.b;
    const plotH = bottom - top;

    const maxBar = Math.max(...barSeries.values, 1);
    const maxLine = Math.max(...lineSeries.values, 1);
    const yMaxR = niceMax(maxBar * 1.2);
    const yMaxL = niceMax(maxLine * 1.2);

    const id = uid++;
    const barGrad = vGradient(svg, "barGrad" + id, barSeries.color, 0.15, 1);
    const lineGrad = vGradient(svg, "lineGrad" + id, lineSeries.color, 0.3, 0.02);
    const barGlow = glowFilter(svg, "barGlow" + id, barSeries.color, 2.5);
    const lineGlow = glowFilter(svg, "lineGlow" + id, lineSeries.color, 3);

    // 背景：绘图区微妙渐变底
    el("rect", {
      x: left, y: top, width: right - left, height: plotH,
      fill: "url(#plotBg" + id + ")", opacity: 0.4, rx: 6,
    }, svg);
    const plotDefs = el("defs", {}, svg);
    const plotGrad = el("linearGradient", { id: "plotBg" + id, x1: "0", y1: "0", x2: "0", y2: "1" }, plotDefs);
    el("stop", { offset: "0%", "stop-color": barSeries.color, "stop-opacity": 0.04 }, plotGrad);
    el("stop", { offset: "100%", "stop-color": "transparent", "stop-opacity": 0 }, plotGrad);

    // 横向网格线（渐变淡出）
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = top + (plotH * i) / steps;
      const valL = yMaxL - (yMaxL * i) / steps;
      const valR = yMaxR - (yMaxR * i) / steps;
      const isBase = i === steps;
      el("line", {
        x1: left, x2: right, y1: y, y2: y,
        stroke: isBase ? "var(--line-strong)" : "var(--line)",
        "stroke-width": isBase ? 1 : 0.5,
        "stroke-dasharray": isBase ? "none" : "3 7",
        opacity: isBase ? 0.9 : 0.4,
        class: "combo-grid",
      }, svg);
      el("text", {
        x: left - 10, y: y + 4, "text-anchor": "end",
        "font-size": 10, fill: "var(--text-2)",
        "font-family": "var(--mono)", "font-variant-numeric": "tabular-nums",
      }, svg).textContent = fmtL(valL);
      el("text", {
        x: right + 10, y: y + 4, "text-anchor": "start",
        "font-size": 10, fill: "var(--text-2)",
        "font-family": "var(--mono)", "font-variant-numeric": "tabular-nums",
      }, svg).textContent = fmtR(valR);
    }

    const n = labels.length;
    const groupW = (right - left) / n;
    const cx = (i) => left + groupW * i + groupW / 2;
    const barW = Math.min(32, groupW * 0.38);

    // 当前周垂直高亮线（最后一个）
    const lastX = cx(n - 1);
    el("line", {
      x1: lastX, x2: lastX, y1: top, y2: bottom,
      stroke: "var(--accent)", "stroke-width": 1,
      "stroke-dasharray": "2 4", opacity: 0.3,
    }, svg);

    // 柱（工时，右轴）：入场生长动画 + 渐变柱身 + 顶部高光
    barSeries.values.forEach((v, i) => {
      const h = (v / yMaxR) * plotH;
      if (v <= 0) return;
      const x = cx(i) - barW / 2;
      const y = bottom - h;
      const delay = 0.1 + i * 0.07;
      // 柱身渐变（生长动画）
      el("rect", {
        x, y, width: barW, height: Math.max(h, 1), rx: 4,
        fill: `url(#${barGrad})`, filter: `url(#${barGlow})`,
        class: "combo-bar",
        style: `animation-delay:${delay}s`,
      }, svg);
      // 顶部高光线
      el("rect", {
        x: x + 2, y: y + 1, width: barW - 4, height: 2, rx: 1,
        fill: "#fff", opacity: 0.35,
        class: "combo-bar-hl",
        style: `animation-delay:${delay + 0.15}s`,
      }, svg);
      // 顶部数值（延迟淡入）
      el("text", {
        x: cx(i), y: y - 8, "text-anchor": "middle",
        "font-size": 10, fill: barSeries.color, "font-weight": 700,
        "font-family": "var(--mono)", "font-variant-numeric": "tabular-nums",
        class: "combo-bar-label",
        style: `animation-delay:${delay + 0.25}s`,
      }, svg).textContent = fmt(v);
    });

    // 折线（收入，左轴）：平滑曲线 + 面积渐变 + 绘制动画 + 发光节点
    const pts = lineSeries.values.map((v, i) => ({ x: cx(i), y: bottom - (v / yMaxL) * plotH }));
    if (pts.length) {
      // Catmull-Rom → 贝塞尔平滑路径
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
      }
      // 面积填充（淡入）
      el("path", {
        d: `${d} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`,
        fill: `url(#${lineGrad})`, stroke: "none",
        class: "combo-area",
      }, svg);
      // 外发光层
      el("path", {
        d, fill: "none", stroke: lineSeries.color, "stroke-width": 5,
        "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.2,
        class: "combo-line-glow", pathLength: "1",
      }, svg);
      // 主线（绘制动画）
      el("path", {
        d, fill: "none", stroke: lineSeries.color, "stroke-width": 2.4,
        "stroke-linecap": "round", "stroke-linejoin": "round",
        filter: `url(#${lineGlow})`,
        class: "combo-line", pathLength: "1",
      }, svg);
      // 节点（脉冲动画）
      pts.forEach((p, i) => {
        const v = lineSeries.values[i];
        if (v <= 0) return;
        const delay = 0.6 + i * 0.07;
        // 外光晕（脉冲）
        el("circle", {
          cx: p.x, cy: p.y, r: 8, fill: lineSeries.color, opacity: 0,
          class: "combo-dot-pulse",
          style: `animation-delay:${delay}s`,
        }, svg);
        // 节点外圆
        el("circle", {
          cx: p.x, cy: p.y, r: 4.5, fill: "var(--bg-1)", stroke: lineSeries.color, "stroke-width": 2.2,
          filter: `url(#${lineGlow})`,
          class: "combo-dot",
          style: `animation-delay:${delay}s`,
        }, svg);
        // 节点内芯
        el("circle", {
          cx: p.x, cy: p.y, r: 1.8, fill: lineSeries.color,
          class: "combo-dot-core",
          style: `animation-delay:${delay + 0.1}s`,
        }, svg);
        // 数值标签
        el("text", {
          x: p.x, y: p.y - 13, "text-anchor": "middle",
          "font-size": 10, fill: lineSeries.color, "font-weight": 700,
          "font-family": "var(--mono)", "font-variant-numeric": "tabular-nums",
          class: "combo-dot-label",
          style: `animation-delay:${delay + 0.15}s`,
        }, svg).textContent = fmt(v);
      });
    }

    // X 轴标签
    labels.forEach((lb, i) => {
      const isLast = i === n - 1;
      el("text", {
        x: cx(i), y: bottom + 24, "text-anchor": "middle",
        "font-size": 11, fill: isLast ? "var(--accent)" : "var(--text-1)",
        "font-weight": isLast ? 700 : 500,
        "font-family": "var(--mono)",
        class: isLast ? "combo-x-last" : "",
      }, svg).textContent = lb;
    });

    // 图例（右上角，精致胶囊样式）
    let lx = right;
    [[lineSeries, "line"], [barSeries, "rect"]].forEach(([s, kind]) => {
      const tw = s.name.length * 11 + 34;
      lx -= tw;
      // 胶囊背景
      el("rect", {
        x: lx - 4, y: 8, width: tw - 4, height: 20, rx: 10,
        fill: "var(--bg-2)", opacity: 0.6,
      }, svg);
      if (kind === "rect") {
        el("rect", { x: lx + 2, y: 13, width: 10, height: 10, rx: 2.5, fill: s.color, opacity: 0.95 }, svg);
      } else {
        el("line", { x1: lx + 2, x2: lx + 14, y1: 18, y2: 18, stroke: s.color, "stroke-width": 2.4, "stroke-linecap": "round" }, svg);
        el("circle", { cx: lx + 8, cy: 18, r: 2.5, fill: "var(--bg-1)", stroke: s.color, "stroke-width": 1.8 }, svg);
      }
      el("text", { x: lx + 18, y: 22, "font-size": 11, fill: "var(--text-1)", "font-weight": 500 }, svg).textContent = s.name;
    });
  }

  /* ---------- 迷你横向构成图：[{label, value, color, valueText}] ---------- */
  function miniSplit(svg, items, { total = 0, totalText = "" } = {}) {
    clear(svg);
    const w = 360, h = 96;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const sum = total || items.reduce((s, it) => s + it.value, 0);
    const trackX = 74, trackW = w - trackX - 92, rowH = 30, gap = 12;
    let y = 10;

    items.forEach((it) => {
      // 左侧标签
      el("text", { x: 0, y: y + rowH / 2 + 4, "font-size": 12, fill: "var(--text-1)" }, svg)
        .textContent = it.label;
      // 轨道
      el("rect", {
        x: trackX, y: y + rowH / 2 - 6, width: trackW, height: 12, rx: 6,
        fill: "rgba(90,160,255,.10)",
      }, svg);
      // 填充条（渐变 + 发光帽）
      const fw = sum > 0 ? Math.max((it.value / sum) * trackW, it.value > 0 ? 6 : 0) : 0;
      if (fw > 0) {
        const gid = vGradient(svg, "miniGrad" + uid, it.color, 0.45, 0.95);
        const flt = glowFilter(svg, "miniGlow" + uid, it.color, 1.6);
        uid++;
        el("rect", {
          x: trackX, y: y + rowH / 2 - 6, width: fw, height: 12, rx: 6,
          fill: `url(#${gid})`, filter: `url(#${flt})`,
        }, svg);
        el("circle", { cx: trackX + fw, cy: y + rowH / 2, r: 3.2, fill: it.color }, svg);
      }
      // 占比 + 数值
      const pct = sum > 0 ? Math.round((it.value / sum) * 100) : 0;
      el("text", { x: w, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: "var(--text-0)", "font-family": "var(--mono)", "font-weight": 700 }, svg)
        .textContent = it.valueText || it.value;
      el("text", { x: w - (it.valueText || String(it.value)).length * 7.2 - 8, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--text-2)" }, svg)
        .textContent = pct + "%";
      y += rowH + gap - 6;
    });
  }

  /** 通用：画坐标轴 + 网格线 */
  function drawAxes(svg, { left, top, right, bottom, yMax, xCount, fmtY }) {
    // 收入柱状图渐变（显式 DOM 创建，保证 SVG 命名空间正确）
    const defs = el("defs", {}, svg);
    const grad = el("linearGradient", { id: "incomeGrad", x1: "0", y1: "1", x2: "0", y2: "0" }, defs);
    el("stop", { offset: "0%", "stop-color": "rgba(96,165,250,.25)" }, grad);
    el("stop", { offset: "100%", "stop-color": "rgba(96,165,250,.95)" }, grad);
    const plotH = bottom - top, plotW = right - left;
    // 横向网格 + Y 轴刻度
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = top + (plotH * i) / steps;
      const val = yMax - (yMax * i) / steps;
      el("line", { x1: left, x2: right, y1: y, y2: y, class: "axis-line", "stroke-width": 0.6 }, svg);
      el("text", { x: left - 8, y: y + 4, "text-anchor": "end", class: "tick-label" }, svg)
        .textContent = fmtY(val);
    }
    // X 轴基线
    el("line", { x1: left, x2: right, y1: bottom, y2: bottom, class: "axis-line", "stroke-width": 1 }, svg);
    return { plotW, plotH };
  }

  /** 分组柱状图：series = [{name, color, values[]}]，labels[] 为 X 轴标签 */
  function groupedBars(svg, { labels, series, fmtY = (v) => v, formatter = null }) {
    clear(svg);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const pad = { l: 62, r: 14, t: 24, b: 34 };
    const left = pad.l, right = W - pad.r, top = pad.t, bottom = H - pad.b;
    const maxVal = Math.max(...series.flatMap((s) => s.values), 1);
    const yMax = niceMax(maxVal * 1.15);
    drawAxes(svg, { left, top, right, bottom, yMax, fmtY });

    const n = labels.length;
    const groupW = (right - left) / n;
    const barW = Math.min(26, (groupW * 0.62) / series.length);

    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const h = (v / yMax) * (bottom - top);
        const x = left + groupW * i + groupW / 2 - (barW * series.length) / 2 + barW * si;
        const y = bottom - h;
        el("rect", {
          x, y, width: barW, height: Math.max(h, 1), rx: 3,
          fill: s.color, opacity: 0.92,
        }, svg);
        // 顶部数值
        if (v > 0) {
          el("text", {
            x: x + barW / 2, y: y - 5, "text-anchor": "middle",
            "font-size": 10, fill: s.color,
          }, svg).textContent = formatter ? formatter(v) : fmtY(v);
        }
      });
    });

    labels.forEach((lb, i) => {
      el("text", {
        x: left + groupW * i + groupW / 2, y: bottom + 20,
        "text-anchor": "middle", "font-size": 11,
      }, svg).textContent = lb;
    });
    // 图例
    let lx = left;
    series.forEach((s) => {
      el("rect", { x: lx, y: 8, width: 10, height: 10, rx: 2, fill: s.color }, svg);
      el("text", { x: lx + 15, y: 17, "font-size": 11 }, svg).textContent = s.name;
      lx += 15 + s.name.length * 12 + 20;
    });
  }

  /** 环形图：items = [{label, value, color}] */
  function donut(svg, items, { center = null, height = 260 } = {}) {
    clear(svg);
    const w = 380, h = height;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const cx = 130, cy = h / 2, r = 82, sw = 30;
    const total = items.reduce((s, it) => s + it.value, 0);

    if (total <= 0) {
      el("circle", { cx, cy, r, fill: "none", stroke: "rgba(90,160,255,.14)", "stroke-width": sw }, svg);
      el("text", { x: cx, y: cy + 5, "text-anchor": "middle", "font-size": 12, fill: "var(--text-2)" }, svg)
        .textContent = "暂无数据";
      return;
    }

    const circ = 2 * Math.PI * r;
    let offset = 0;
    items.forEach((it) => {
      const frac = it.value / total;
      const dash = frac * circ;
      el("circle", {
        cx, cy, r, fill: "none",
        stroke: it.color, "stroke-width": sw,
        "stroke-dasharray": `${dash} ${circ - dash}`,
        "stroke-dashoffset": -offset,
        "transform": `rotate(-90 ${cx} ${cy})`,
        opacity: 0.92,
      }, svg);
      offset += dash;
    });

    const c = center || {};
    el("text", { x: cx, y: cy - 8, "text-anchor": "middle", "font-size": 12, fill: "var(--text-2)" }, svg)
      .textContent = c.label || "";
    el("text", { x: cx, y: cy + 18, "text-anchor": "middle", "font-size": 20, "font-weight": 700, fill: "var(--text-0)", "font-family": "var(--mono)" }, svg)
      .textContent = c.value || "";

    // 图例（右侧）
    let ly = h / 2 - items.length * 14 + 6;
    items.forEach((it) => {
      el("rect", { x: 250, y: ly - 10, width: 10, height: 10, rx: 2, fill: it.color }, svg);
      el("text", { x: 268, y: ly, "font-size": 12, fill: "var(--text-1)" }, svg).textContent = `${it.label}`;
      el("text", {
        x: 340, y: ly, "font-size": 12, fill: "var(--text-0)",
        "font-family": "var(--mono)", "text-anchor": "end",
      }, svg).textContent = it.valueText || it.value;
      ly += 28;
    });
  }

  return { comboChart, miniSplit, groupedBars, donut };
})();
