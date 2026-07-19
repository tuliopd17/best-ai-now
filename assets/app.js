/* Melhor IA Agora — ranking dinâmico de custo-benefício.
   Dados: Artificial Analysis (https://artificialanalysis.ai), via data/models.js|json. */
(function () {
  "use strict";

  // ------------------------------------------------------------- estado
  var PRESETS = {
    balanced: { gamma: 4, beta: 0.35 },
    budget: { gamma: 3, beta: 0.5 },
    performance: { gamma: 5, beta: 0.25 },
  };
  var state = {
    gamma: 4,
    beta: 0.35,
    minII: 40,
    includeEstimated: false,
    sortKey: "score",
    sortDir: -1,
  };
  var DATA = window.__AA_DATA__ || null;

  // ------------------------------------------------------------- utilidades
  var $ = function (id) { return document.getElementById(id); };
  var nf = function (dec) {
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  var f0 = nf(0), f1 = nf(1), f2 = nf(2);
  function fmtPrice(v) { return v == null ? "—" : "US$ " + (v < 10 ? f2 : f1).format(v); }
  function fmtCtx(v) {
    if (v == null) return "—";
    if (v >= 1e6) return f1.format(v / 1e6).replace(",0", "") + "M";
    if (v >= 1e3) return Math.round(v / 1e3) + "k";
    return String(v);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ------------------------------------------------------------- fórmula
  function computeRanking() {
    if (!DATA) return [];
    var out = [];
    for (var i = 0; i < DATA.models.length; i++) {
      var m = DATA.models[i];
      if (m.deprecated) continue;
      if (m.estimated && !state.includeEstimated) continue;
      if (m.intelligenceIndex == null || m.intelligenceIndex < state.minII) continue;
      if (m.blendedPrice == null || m.blendedPrice <= 0) continue;
      var raw = Math.pow(m.intelligenceIndex / 100, state.gamma) / Math.pow(m.blendedPrice, state.beta);
      out.push({ m: m, raw: raw });
    }
    var max = 0;
    out.forEach(function (r) { if (r.raw > max) max = r.raw; });
    out.forEach(function (r) { r.score = max > 0 ? (100 * r.raw) / max : 0; });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  // ------------------------------------------------------------- tooltip
  var tip = $("tip");
  function showTip(x, y, title, rows) {
    tip.textContent = "";
    tip.appendChild(el("div", "tt-title", title));
    rows.forEach(function (r) {
      var row = el("div", "tt-row");
      row.appendChild(el("span", null, r[0]));
      row.appendChild(el("b", null, r[1]));
      tip.appendChild(row);
    });
    tip.style.display = "block";
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var px = Math.min(x + 14, window.innerWidth - w - 8);
    var py = y - h - 12;
    if (py < 8) py = y + 16;
    tip.style.left = px + "px";
    tip.style.top = py + "px";
  }
  function hideTip() { tip.style.display = "none"; }
  function tipRowsFor(r) {
    var m = r.m;
    return [
      ["Score", f1.format(r.score)],
      ["Inteligência (Índice AA)", f1.format(m.intelligenceIndex)],
      ["Preço combinado /M tokens", fmtPrice(m.blendedPrice)],
      ["Entrada / saída", fmtPrice(m.inputPrice) + " · " + fmtPrice(m.outputPrice)],
      ["Velocidade", m.outputSpeed ? f0.format(m.outputSpeed) + " tokens/s" : "—"],
      ["Criador", m.creator || "—"],
    ];
  }

  // ------------------------------------------------------------- herói + pódio
  function renderHero(rank) {
    var hero = $("hero"), podium = $("podium");
    hero.textContent = "";
    podium.textContent = "";
    if (!rank.length) {
      hero.appendChild(el("p", "champ-sub", "Nenhum modelo passa nos filtros atuais — reduza a inteligência mínima."));
      return;
    }
    var top = rank[0], m = top.m;
    hero.appendChild(el("p", "kicker", "Melhor custo-benefício agora"));
    hero.appendChild(el("h2", "champ", m.name));
    var sub = el("p", "champ-sub");
    sub.textContent = (m.creator ? m.creator + " · " : "") +
      (m.isReasoning ? "modelo de raciocínio" : "modelo direto") +
      (m.isOpenWeights ? " · pesos abertos" : "");
    hero.appendChild(sub);

    // topo de inteligência entre os elegíveis, para contexto
    var smartest = rank.slice().sort(function (a, b) { return b.m.intelligenceIndex - a.m.intelligenceIndex; })[0];
    var kpis = el("div", "kpis");
    kpis.appendChild(tile("Inteligência (Índice AA)", f1.format(m.intelligenceIndex),
      f0.format((100 * m.intelligenceIndex) / smartest.m.intelligenceIndex) + "% do modelo mais inteligente"));
    kpis.appendChild(tile("Preço por 1M tokens", fmtPrice(m.blendedPrice), "combinado 3 entrada : 1 saída"));
    kpis.appendChild(tile("Velocidade", m.outputSpeed ? f0.format(m.outputSpeed) + " t/s" : "—", "mediana de tokens de saída"));
    var ratio = smartest.m.blendedPrice / m.blendedPrice;
    kpis.appendChild(tile(
      "Vantagem de custo",
      ratio > 1.05 ? f1.format(ratio) + "× mais barato" : "preço de topo",
      "que " + smartest.m.name + ", nº 1 em inteligência"
    ));
    hero.appendChild(kpis);

    for (var i = 1; i < Math.min(3, rank.length); i++) {
      var r = rank[i];
      var card = el("div", "p-card");
      var left = el("div", null);
      left.appendChild(el("span", "p-rank", (i + 1) + "º"));
      left.appendChild(el("span", "p-name", r.m.name));
      left.appendChild(el("span", "p-creator", r.m.creator || ""));
      card.appendChild(left);
      card.appendChild(el("span", "p-score",
        "score " + f1.format(r.score) + " · " + f1.format(r.m.intelligenceIndex) + " int · " + fmtPrice(r.m.blendedPrice)));
      podium.appendChild(card);
    }
  }
  function tile(label, value, note) {
    var t = el("div", "tile");
    t.appendChild(el("div", "t-label", label));
    t.appendChild(el("div", "t-value", value));
    if (note) t.appendChild(el("div", "t-note", note));
    return t;
  }

  // ------------------------------------------------------------- barras (top 12)
  function renderBars(rank) {
    var box = $("bars");
    box.textContent = "";
    var top = rank.slice(0, 12);
    top.forEach(function (r, i) {
      var row = el("div", "bar-row" + (i === 0 ? " lead" : ""));
      row.tabIndex = 0;
      var label = el("div", "bar-label");
      label.appendChild(document.createTextNode(r.m.name + " "));
      label.appendChild(el("span", "c", r.m.creator || ""));
      row.appendChild(label);

      var track = el("div", "bar-track");
      var fill = el("div", "bar-fill");
      var pct = Math.max(2, r.score);
      fill.style.width = pct + "%";
      track.appendChild(fill);
      var val = el("span", "bar-value", f1.format(r.score));
      val.style.left = "calc(" + pct + "% + 8px)";
      track.appendChild(val);
      row.appendChild(track);

      function over(ev) {
        var p = ev.touches ? ev.touches[0] : ev;
        var rect = row.getBoundingClientRect();
        showTip(p.clientX != null ? p.clientX : rect.right, p.clientY != null ? p.clientY : rect.top, r.m.name, tipRowsFor(r));
      }
      row.addEventListener("pointermove", over);
      row.addEventListener("pointerleave", hideTip);
      row.addEventListener("focus", function () {
        var rect = row.getBoundingClientRect();
        showTip(rect.left + rect.width / 2, rect.top, r.m.name, tipRowsFor(r));
      });
      row.addEventListener("blur", hideTip);
      box.appendChild(row);
    });
  }

  // ------------------------------------------------------------- dispersão
  function renderScatter(rank) {
    var box = $("scatter");
    box.textContent = "";
    if (rank.length < 2) return;

    var W = 760, H = 440, L = 52, R = 18, T = 14, B = 46;
    var pw = W - L - R, ph = H - T - B;

    var prices = rank.map(function (r) { return r.m.blendedPrice; });
    var iis = rank.map(function (r) { return r.m.intelligenceIndex; });
    var minP = Math.min.apply(null, prices), maxP = Math.max.apply(null, prices);
    var minI = Math.min.apply(null, iis), maxI = Math.max.apply(null, iis);
    var x0 = Math.log10(minP * 0.8), x1 = Math.log10(maxP * 1.25);
    var y0 = Math.max(0, Math.floor(minI / 5) * 5 - 2), y1 = Math.ceil(maxI) + 2;
    var X = function (p) { return L + ((Math.log10(p) - x0) / (x1 - x0)) * pw; };
    var Y = function (v) { return T + ph - ((v - y0) / (y1 - y0)) * ph; };

    var svg = svgEl("svg", { class: "scatter", viewBox: "0 0 " + W + " " + H, role: "img" });
    svg.setAttribute("aria-label", "Dispersão de preço por inteligência dos modelos de IA");

    // grade + eixos (hairline, recessivos)
    var yt;
    for (yt = Math.ceil(y0 / 5) * 5; yt <= y1; yt += 5) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: Y(yt), y2: Y(yt), stroke: "var(--grid)", "stroke-width": 1 }));
      var ty = svgEl("text", { x: L - 8, y: Y(yt) + 4, "text-anchor": "end", class: "axis-t" });
      ty.textContent = f0.format(yt);
      svg.appendChild(ty);
    }
    [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].forEach(function (p) {
      if (Math.log10(p) < x0 || Math.log10(p) > x1) return;
      svg.appendChild(svgEl("line", { x1: X(p), x2: X(p), y1: T, y2: T + ph, stroke: "var(--grid)", "stroke-width": 1 }));
      var tx = svgEl("text", { x: X(p), y: H - B + 18, "text-anchor": "middle", class: "axis-t" });
      tx.textContent = p < 1 ? f2.format(p).replace(/0$/, "") : f0.format(p);
      svg.appendChild(tx);
    });
    svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: T + ph, y2: T + ph, stroke: "var(--axis)", "stroke-width": 1 }));
    var xn = svgEl("text", { x: L + pw / 2, y: H - 8, "text-anchor": "middle", class: "axis-name" });
    xn.textContent = "Preço combinado (US$ por 1M tokens, escala log)";
    svg.appendChild(xn);
    var yn = svgEl("text", { x: 14, y: T + ph / 2, class: "axis-name", transform: "rotate(-90 14 " + (T + ph / 2) + ")", "text-anchor": "middle" });
    yn.textContent = "Índice de inteligência (AA)";
    svg.appendChild(yn);

    // fronteira de eficiência (não-dominados: mais barato E mais inteligente)
    var byPrice = rank.slice().sort(function (a, b) { return a.m.blendedPrice - b.m.blendedPrice; });
    var frontier = [], best = -Infinity;
    byPrice.forEach(function (r) {
      if (r.m.intelligenceIndex > best) { frontier.push(r); best = r.m.intelligenceIndex; }
    });
    var d = frontier.map(function (r, i) {
      return (i ? "L" : "M") + X(r.m.blendedPrice).toFixed(1) + " " + Y(r.m.intelligenceIndex).toFixed(1);
    }).join(" ");
    svg.appendChild(svgEl("path", { d: d, fill: "none", stroke: "var(--demph)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.55 }));

    // pontos (líder em azul, demais em cinza; anel de 2px na cor da superfície)
    var lead = rank[0];
    var dots = [];
    rank.forEach(function (r) {
      var isLead = r === lead;
      var c = svgEl("circle", {
        cx: X(r.m.blendedPrice).toFixed(1),
        cy: Y(r.m.intelligenceIndex).toFixed(1),
        r: isLead ? 7 : 5,
        fill: isLead ? "var(--accent)" : "var(--demph)",
        stroke: "var(--surface-1)",
        "stroke-width": 2,
        tabindex: 0,
      });
      c.addEventListener("focus", function () {
        var rect = c.getBoundingClientRect();
        showTip(rect.left + rect.width / 2, rect.top, r.m.name, tipRowsFor(r));
      });
      c.addEventListener("blur", hideTip);
      svg.appendChild(c);
      dots.push({ r: r, c: c });
    });

    // rótulos diretos, seletivos: líder, mais inteligente, mais barato da fronteira
    var labeled = [];
    var smartest = frontier[frontier.length - 1];
    var cheapest = frontier[0];
    [[lead, -10, "end"], [smartest, -10, "end"], [cheapest, 12, "start"]].forEach(function (spec) {
      var r = spec[0];
      if (!r || labeled.indexOf(r) !== -1) return;
      labeled.push(r);
      var t = svgEl("text", {
        x: X(r.m.blendedPrice) + (spec[2] === "end" ? -10 : 10),
        y: Y(r.m.intelligenceIndex) + (r === cheapest ? 16 : -8),
        "text-anchor": spec[2],
        class: "pt-label",
        "paint-order": "stroke",
        stroke: "var(--surface-1)",
        "stroke-width": 3,
      });
      t.textContent = r.m.name;
      svg.appendChild(t);
    });

    // hover por ponto mais próximo (alvo maior que a marca)
    svg.addEventListener("pointermove", function (ev) {
      var rect = svg.getBoundingClientRect();
      var sx = ((ev.clientX - rect.left) / rect.width) * W;
      var sy = ((ev.clientY - rect.top) / rect.height) * H;
      var bestD = Infinity, hit = null;
      dots.forEach(function (dd) {
        var dx = sx - parseFloat(dd.c.getAttribute("cx"));
        var dy = sy - parseFloat(dd.c.getAttribute("cy"));
        var dist = dx * dx + dy * dy;
        if (dist < bestD) { bestD = dist; hit = dd; }
      });
      if (hit && bestD < 28 * 28) {
        dots.forEach(function (dd) { dd.c.setAttribute("r", dd.r === lead ? 7 : 5); });
        hit.c.setAttribute("r", parseInt(hit.c.getAttribute("r"), 10) < 8 ? 8 : hit.c.getAttribute("r"));
        showTip(ev.clientX, ev.clientY, hit.r.m.name, tipRowsFor(hit.r));
      } else {
        dots.forEach(function (dd) { dd.c.setAttribute("r", dd.r === lead ? 7 : 5); });
        hideTip();
      }
    });
    svg.addEventListener("pointerleave", function () {
      dots.forEach(function (dd) { dd.c.setAttribute("r", dd.r === lead ? 7 : 5); });
      hideTip();
    });

    box.appendChild(svg);
  }

  // ------------------------------------------------------------- tabela
  var COLS = [
    { key: "rank", label: "#", get: function (r) { return r.rankPos; }, fmt: function (v) { return f0.format(v); } },
    { key: "name", label: "Modelo", get: function (r) { return r.m.name; }, fmt: String, cls: "name" },
    { key: "creator", label: "Criador", get: function (r) { return r.m.creator || ""; }, fmt: String, cls: "muted" },
    { key: "score", label: "Score", get: function (r) { return r.score; }, fmt: function (v) { return f1.format(v); } },
    { key: "ii", label: "Inteligência", get: function (r) { return r.m.intelligenceIndex; }, fmt: function (v) { return f1.format(v); } },
    { key: "price", label: "US$ combinado", get: function (r) { return r.m.blendedPrice; }, fmt: function (v) { return f2.format(v); } },
    { key: "in", label: "US$ entrada", get: function (r) { return r.m.inputPrice; }, fmt: function (v) { return f2.format(v); } },
    { key: "out", label: "US$ saída", get: function (r) { return r.m.outputPrice; }, fmt: function (v) { return f2.format(v); } },
    { key: "speed", label: "Tokens/s", get: function (r) { return r.m.outputSpeed; }, fmt: function (v) { return v == null ? "—" : f0.format(v); } },
    { key: "lat", label: "Latência (s)", get: function (r) { return r.m.latency; }, fmt: function (v) { return v == null ? "—" : f1.format(v); } },
    { key: "ctx", label: "Contexto", get: function (r) { return r.m.contextWindowTokens; }, fmt: fmtCtx },
  ];

  function renderTable(rank) {
    var table = $("table");
    table.textContent = "";
    rank.forEach(function (r, i) { r.rankPos = i + 1; });

    var thead = el("thead"), trh = el("tr");
    COLS.forEach(function (col) {
      var th = el("th", col.key === state.sortKey ? "sorted" : null, col.label);
      if (col.key === state.sortKey) th.textContent += state.sortDir < 0 ? " ↓" : " ↑";
      th.addEventListener("click", function () {
        if (state.sortKey === col.key) state.sortDir *= -1;
        else { state.sortKey = col.key; state.sortDir = col.key === "name" || col.key === "creator" ? 1 : -1; }
        renderTable(rank);
      });
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var col = COLS.filter(function (c) { return c.key === state.sortKey; })[0] || COLS[3];
    var rows = rank.slice().sort(function (a, b) {
      var av = col.get(a), bv = col.get(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return state.sortDir * av.localeCompare(bv, "pt-BR");
      return state.sortDir * (av - bv);
    });

    var tbody = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr", r.rankPos === 1 ? "lead" : null);
      COLS.forEach(function (c) {
        var v = c.get(r);
        var td = el("td", c.cls, c.fmt(v == null ? null : v));
        if (c.key === "score" && r.rankPos === 1) {
          td.textContent = "";
          td.appendChild(el("span", "score-pill", f1.format(r.score)));
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  // ------------------------------------------------------------- render geral
  function renderAll() {
    var rank = computeRanking();
    renderHero(rank);
    renderBars(rank);
    renderScatter(rank);
    renderTable(rank);
    $("model-count").textContent = rank.length + " modelos no ranking (" +
      (DATA ? DATA.models.length : 0) + " monitorados)";
  }

  function renderMeta() {
    if (!DATA) return;
    var d = new Date(DATA.fetchedAt);
    $("updated-at").textContent = "Atualizado em " +
      d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    $("ii-version").textContent = "v" + (DATA.intelligenceIndexVersion || "?");
  }

  // ------------------------------------------------------------- controles
  function bindControls() {
    var gamma = $("gamma"), beta = $("beta"), minII = $("min-ii"),
      preset = $("preset"), inclEst = $("include-estimated");

    function syncLabels() {
      $("gamma-val").textContent = f1.format(state.gamma);
      $("beta-val").textContent = f2.format(state.beta);
      $("min-ii-val").textContent = f0.format(state.minII);
    }
    function detectPreset() {
      for (var k in PRESETS) {
        if (Math.abs(PRESETS[k].gamma - state.gamma) < 1e-9 && Math.abs(PRESETS[k].beta - state.beta) < 1e-9) return k;
      }
      return "custom";
    }
    preset.addEventListener("change", function () {
      var p = PRESETS[preset.value];
      if (!p) return;
      state.gamma = p.gamma;
      state.beta = p.beta;
      gamma.value = p.gamma;
      beta.value = p.beta;
      syncLabels();
      renderAll();
    });
    gamma.addEventListener("input", function () {
      state.gamma = parseFloat(gamma.value);
      preset.value = detectPreset();
      syncLabels();
      renderAll();
    });
    beta.addEventListener("input", function () {
      state.beta = parseFloat(beta.value);
      preset.value = detectPreset();
      syncLabels();
      renderAll();
    });
    minII.addEventListener("input", function () {
      state.minII = parseInt(minII.value, 10);
      syncLabels();
      renderAll();
    });
    inclEst.addEventListener("change", function () {
      state.includeEstimated = inclEst.checked;
      renderAll();
    });
    syncLabels();

    $("theme-toggle").addEventListener("click", function () {
      var cur = document.documentElement.dataset.theme ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("theme", next);
    });
  }

  // ------------------------------------------------------------- dados frescos
  // Servido via http(s): busca o JSON mais recente e re-renderiza se mudou.
  function refreshData() {
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    fetch("data/models.json", { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (fresh) {
        if (fresh && (!DATA || fresh.fetchedAt !== DATA.fetchedAt)) {
          DATA = fresh;
          renderMeta();
          renderAll();
        }
      })
      .catch(function () { /* mantém os dados embutidos */ });
  }

  // ------------------------------------------------------------- boot
  if (!DATA) {
    $("hero").textContent = "Dados ainda não gerados — rode: node scripts/update-data.mjs";
  } else {
    renderMeta();
  }
  bindControls();
  renderAll();
  refreshData();
  setInterval(refreshData, 15 * 60 * 1000);
})();
