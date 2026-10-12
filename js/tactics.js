(function () {
  "use strict";

  // ---------- Константы ----------
  var W = 1000;               // ширина системы координат карты; высота H = W / соотношение сторон
  var H = 1000;
  var ar = 1;
  var LIMIT = 7;              // танков на команду
  var COPY_ARROWS_TO_BRANCH = false; // true — разветвление копирует и стрелки родителя, false — только значки
  var NS = "http://www.w3.org/2000/svg";

  var CLASSES = [
    { id: "lt",  label: "ЛТ",  name: "Лёгкий",  title: "Лёгкий танк" },
    { id: "st",  label: "СТ",  name: "Средний", title: "Средний танк" },
    { id: "tt",  label: "ТТ",  name: "Тяжёлый", title: "Тяжёлый танк" },
    { id: "pt",  label: "ПТ",  name: "ПТ-САУ",  title: "ПТ-САУ" },
    { id: "spg", label: "САУ", name: "САУ",     title: "САУ" },
    { id: "base", label: "★",  name: "База",    title: "База" }
  ];
  var TEAMS = {
    ally:  { color: "#5ad14b" },
    enemy: { color: "#ff4a3a" }
  };
  var ARROW_COLORS = [
    { color: "#5ad14b", title: "Зелёная" },
    { color: "#ff4a3a", title: "Красная" },
    { color: "#ffc83a", title: "Жёлтая" },
    { color: "#ffffff", title: "Белая" }
  ];

  // ---------- Элементы ----------
  function el(id) { return document.getElementById(id); }

  var stage = el("tac-stage");
  var board = el("board");
  var boardBg = el("board-bg");
  var boardImg = el("board-img");
  var boardMissing = el("board-missing");
  var layerArrows = el("layer-arrows");
  var layerUnits = el("layer-units");
  var layerDraft = el("layer-draft");
  var tacticList = el("tactic-list");
  var sceneList = el("scene-list");
  var btnNewBranch = el("btn-new-branch");
  var swatchBox = el("swatches");

  // ---------- Состояние ----------
  var currentMap = null;
  var mapStore = null;
  var tool = { mode: "cursor", type: null, team: null }; // cursor | arrow | place
  var arrowColor = ARROW_COLORS[0].color;
  var drag = null;
  var draw = null;
  var imgToken = 0;
  var saveWarned = false;
  var paletteButtons = [];
  var swatchButtons = [];

  // ---------- Утилиты ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function f(v) { return Math.round(v * 10) / 10; }
  function round4(v) { return Math.round(v * 10000) / 10000; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function toSvg(e) {
    var ctm = board.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var pt = board.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    var p = pt.matrixTransform(ctm.inverse());
    return { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) };
  }

  function save() {
    if (!Store.save() && !saveWarned) {
      saveWarned = true;
      App.toast("Не удалось сохранить: хранилище браузера недоступно");
    }
  }

  function getTactic() {
    if (!mapStore) return null;
    for (var i = 0; i < mapStore.tactics.length; i++) {
      if (mapStore.tactics[i].id === mapStore.activeTacticId) return mapStore.tactics[i];
    }
    return null;
  }

  function getScene(t) {
    for (var i = 0; i < t.scenes.length; i++) {
      if (t.scenes[i].id === t.activeSceneId) return t.scenes[i];
    }
    return t.scenes[0];
  }

  function countsOf(s) {
    var c = { ally: { units: 0, base: false }, enemy: { units: 0, base: false } };
    s.items.forEach(function (it) {
      if (it.type === "base") c[it.team].base = true;
      else c[it.team].units++;
    });
    return c;
  }

  function cancelPointer() {
    drag = null;
    draw = null;
    layerDraft.textContent = "";
  }

  // ---------- Диалоги ----------
  var modalEl = el("modal");
  var mTitle = el("modal-title");
  var mText = el("modal-text");
  var mInput = el("modal-input");
  var mOk = el("modal-ok");
  var mCancel = el("modal-cancel");
  var mResolve = null;
  var mMode = null;

  function openModal(opts) {
    return new Promise(function (resolve) {
      mResolve = resolve;
      mMode = opts.input ? "text" : "confirm";
      mTitle.textContent = opts.title;
      mText.textContent = opts.text || "";
      mText.hidden = !opts.text;
      mInput.hidden = !opts.input;
      mInput.value = opts.value || "";
      mOk.textContent = opts.okLabel || "ОК";
      modalEl.hidden = false;
      if (opts.input) { mInput.focus(); mInput.select(); } else { mOk.focus(); }
    });
  }

  function finishModal(value) {
    if (!mResolve) return;
    var res = mResolve;
    mResolve = null;
    modalEl.hidden = true;
    res(value);
  }

  function askText(title, value) {
    return openModal({ title: title, input: true, value: value, okLabel: "СОХРАНИТЬ" });
  }

  function askConfirm(title, text) {
    return openModal({ title: title, text: text, okLabel: "УДАЛИТЬ" }).then(function (r) { return r === true; });
  }

  mOk.addEventListener("click", function () {
    if (mMode === "text") {
      var v = mInput.value.trim();
      if (!v) return;
      finishModal(v);
    } else {
      finishModal(true);
    }
  });
  mCancel.addEventListener("click", function () { finishModal(null); });
  modalEl.addEventListener("pointerdown", function (e) {
    if (e.target === modalEl) finishModal(null);
  });

  document.addEventListener("keydown", function (e) {
    if (!modalEl.hidden) {
      if (e.key === "Escape") { finishModal(null); }
      else if (e.key === "Enter" && e.target !== mCancel) { e.preventDefault(); mOk.click(); }
      return;
    }
    if (e.key === "Escape" && el("screen-tactics").classList.contains("active") && tool.mode !== "cursor") {
      setTool("cursor");
    }
  });

  // ---------- Геометрия стрелок ----------
  function pathD(p) {
    var d = "M" + f(p[0].x) + " " + f(p[0].y);
    if (p.length === 2) return d + " L" + f(p[1].x) + " " + f(p[1].y);
    for (var i = 1; i < p.length - 1; i++) {
      var mx = (p[i].x + p[i + 1].x) / 2;
      var my = (p[i].y + p[i + 1].y) / 2;
      d += " Q" + f(p[i].x) + " " + f(p[i].y) + " " + f(mx) + " " + f(my);
    }
    var l = p[p.length - 1];
    return d + " L" + f(l.x) + " " + f(l.y);
  }

  function arrowNodeView(pts, color, id) {
    var HL = 24, HW = 14;
    var n = pts.length;
    var tip = pts[n - 1];
    var ref = pts[0];
    for (var i = n - 2; i >= 0; i--) {
      if (dist(pts[i], tip) >= 16) { ref = pts[i]; break; }
    }
    var dx = tip.x - ref.x, dy = tip.y - ref.y;
    var len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    var base = { x: tip.x - dx * HL, y: tip.y - dy * HL };

    var line = pts.slice();
    while (line.length > 1 && dist(line[line.length - 1], tip) < HL) line.pop();
    line.push(base);

    var d = pathD(line);
    var head = f(tip.x) + "," + f(tip.y) + " " +
      f(base.x - dy * HW) + "," + f(base.y + dx * HW) + " " +
      f(base.x + dy * HW) + "," + f(base.y - dx * HW);

    var g = svg("g", { "class": "arrow" });
    g.dataset.kind = "arrow";
    g.dataset.id = id;
    g.appendChild(svg("path", { d: d, "class": "arrow-hit", fill: "none", stroke: "transparent",
      "stroke-width": 26, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    g.appendChild(svg("path", { d: d, fill: "none", stroke: "#000", "stroke-opacity": 0.55,
      "stroke-width": 10, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    g.appendChild(svg("path", { d: d, fill: "none", stroke: color,
      "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    g.appendChild(svg("polygon", { points: head, fill: color, stroke: "#000", "stroke-opacity": 0.55,
      "stroke-width": 3, "stroke-linejoin": "round" }));
    return g;
  }

  function arrowNode(a) {
    var pts = a.points.map(function (p) { return { x: p.x * W, y: p.y * H }; });
    return arrowNodeView(pts, a.color, a.id);
  }

  function pathLength(pts) {
    var s = 0;
    for (var i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
    return s;
  }

  // ---------- Значки ----------
  function unitNode(it) {
    var color = TEAMS[it.team].color;
    var g = svg("g", { "class": "unit", transform: "translate(" + f(it.x * W) + " " + f(it.y * H) + ")" });
    g.dataset.kind = "unit";
    g.dataset.id = it.id;

    if (it.type === "base") {
      g.appendChild(svg("circle", { r: 38, fill: color, "fill-opacity": 0.28, stroke: color,
        "stroke-width": 5, "stroke-dasharray": "10 6" }));
      var star = svg("text", { y: -8, "text-anchor": "middle", "dominant-baseline": "central",
        "font-size": 26, "font-weight": 700, fill: color, stroke: "#000", "stroke-width": 3, "paint-order": "stroke" });
      star.textContent = "★";
      var cap = svg("text", { y: 16, "text-anchor": "middle", "dominant-baseline": "central",
        "font-size": 15, "font-weight": 700, fill: "#fff", stroke: "#000", "stroke-width": 3, "paint-order": "stroke" });
      cap.textContent = "БАЗА";
      g.appendChild(star);
      g.appendChild(cap);
    } else {
      var label = "";
      for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].id === it.type) label = CLASSES[i].label;
      g.appendChild(svg("circle", { r: 22, fill: color, stroke: "#0b0c0f", "stroke-width": 3 }));
      var t = svg("text", { "text-anchor": "middle", "dominant-baseline": "central",
        "font-size": label.length > 2 ? 14 : 17, "font-weight": 700, fill: "#0b0c0f" });
      t.textContent = label;
      g.appendChild(t);
    }
    return g;
  }

  // ---------- Отрисовка доски ----------
  function renderBoard() {
    layerArrows.textContent = "";
    layerUnits.textContent = "";
    var t = getTactic();
    stage.classList.toggle("empty", !t);
    if (!t) return;
    var s = getScene(t);
    s.arrows.forEach(function (a) { layerArrows.appendChild(arrowNode(a)); });
    s.items.filter(function (i) { return i.type === "base"; })
      .forEach(function (i) { layerUnits.appendChild(unitNode(i)); });
    s.items.filter(function (i) { return i.type !== "base"; })
      .forEach(function (i) { layerUnits.appendChild(unitNode(i)); });
  }

  function updateDraft() {
    layerDraft.textContent = "";
    if (draw && draw.points.length >= 2) {
      layerDraft.appendChild(arrowNodeView(draw.points, arrowColor, "draft"));
    }
  }

  function fit() {
    var sw = stage.clientWidth - 28;
    var sh = stage.clientHeight - 28;
    if (sw <= 0 || sh <= 0) return;
    var w = sw, h = w / ar;
    if (h > sh) { h = sh; w = h * ar; }
    board.style.width = Math.floor(w) + "px";
    board.style.height = Math.floor(h) + "px";
  }

  function setRatio(newAr) {
    ar = newAr;
    H = W / ar;
    board.setAttribute("viewBox", "0 0 " + W + " " + f(H));
    boardBg.setAttribute("height", f(H));
    boardImg.setAttribute("height", f(H));
    boardMissing.setAttribute("y", f(H / 2));
    fit();
    renderBoard();
  }

  function loadImage(map) {
    var token = ++imgToken;
    boardImg.removeAttribute("href");
    boardImg.setAttribute("display", "none");
    boardMissing.setAttribute("display", "none");
    setRatio(1);
    var img = new Image();
    img.onload = function () {
      if (token !== imgToken) return;
      setRatio(img.naturalWidth / img.naturalHeight);
      boardImg.setAttribute("href", map.file);
      boardImg.removeAttribute("display");
    };
    img.onerror = function () {
      if (token !== imgToken) return;
      boardMissing.removeAttribute("display");
      App.toast("Не найдена картинка карты: " + map.file);
    };
    img.src = map.file;
  }

  // ---------- Палитра и инструменты ----------
  function buildPalette() {
    ["ally", "enemy"].forEach(function (team) {
      var box = el("units-" + team);
      CLASSES.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "unit-btn";
        b.title = "Добавить: " + c.title;
        b.dataset.team = team;
        b.dataset.type = c.id;
        var chip = document.createElement("span");
        chip.className = "chip";
        chip.style.background = TEAMS[team].color;
        chip.textContent = c.label;
        var nm = document.createElement("span");
        nm.className = "unit-name";
        nm.textContent = c.name;
        b.appendChild(chip);
        b.appendChild(nm);
        b.addEventListener("click", function () {
          if (tool.mode === "place" && tool.team === team && tool.type === c.id) setTool("cursor");
          else setTool("place", c.id, team);
        });
        box.appendChild(b);
        paletteButtons.push(b);
      });
    });

    ARROW_COLORS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.title = c.title;
      b.style.background = c.color;
      b.addEventListener("click", function () {
        arrowColor = c.color;
        setTool("arrow");
      });
      swatchBox.appendChild(b);
      swatchButtons.push({ el: b, color: c.color });
    });

    document.querySelectorAll(".tool-btn").forEach(function (b) {
      b.addEventListener("click", function () { setTool(b.dataset.tool); });
    });
  }

  function setTool(mode, type, team) {
    tool = { mode: mode, type: type || null, team: team || null };
    updatePalette();
  }

  function syncToolUI() {
    document.querySelectorAll(".tool-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tool === tool.mode);
    });
    swatchButtons.forEach(function (s) {
      s.el.classList.toggle("active", tool.mode === "arrow" && s.color === arrowColor);
    });
    paletteButtons.forEach(function (b) {
      b.classList.toggle("active", tool.mode === "place" && b.dataset.team === tool.team && b.dataset.type === tool.type);
    });
    stage.classList.toggle("mode-arrow", tool.mode === "arrow");
    stage.classList.toggle("mode-place", tool.mode === "place");
  }

  function updatePalette() {
    var t = getTactic();
    var c = t ? countsOf(getScene(t)) : null;
    ["ally", "enemy"].forEach(function (team) {
      el("cnt-" + team).textContent = (c ? c[team].units : 0) + "/" + LIMIT;
    });
    paletteButtons.forEach(function (b) {
      var team = b.dataset.team, type = b.dataset.type;
      var off = !c || (type === "base" ? c[team].base : c[team].units >= LIMIT);
      b.disabled = off;
      if (off && tool.mode === "place" && tool.team === team && tool.type === type) {
        tool = { mode: "cursor", type: null, team: null };
      }
    });
    if (!t && tool.mode !== "cursor") tool = { mode: "cursor", type: null, team: null };
    syncToolUI();
  }

  // ---------- Действия на доске ----------
  function addItem(type, team, p, s) {
    var c = countsOf(s)[team];
    if (type === "base") {
      if (c.base) { App.toast("База уже поставлена"); return; }
    } else if (c.units >= LIMIT) {
      App.toast("Лимит: " + LIMIT + " танков на команду");
      return;
    }
    s.items.push({ id: Store.uid(), type: type, team: team, x: round4(p.x / W), y: round4(p.y / H) });
    save();
    renderBoard();
    updatePalette();
  }

  function removeById(kind, id) {
    var t = getTactic();
    if (!t) return;
    var s = getScene(t);
    if (kind === "unit") s.items = s.items.filter(function (i) { return i.id !== id; });
    else s.arrows = s.arrows.filter(function (a) { return a.id !== id; });
    save();
    renderBoard();
    updatePalette();
  }

  function extendDraw(p, shift) {
    var pts = draw.points;
    if (shift) {
      draw.points = [pts[0], p];
    } else if (dist(pts[pts.length - 1], p) >= 8) {
      pts.push(p);
    }
  }

  function finishArrow() {
    var pts = draw.points;
    draw = null;
    layerDraft.textContent = "";
    var t = getTactic();
    if (!t || pts.length < 2 || pathLength(pts) < 40) return;
    getScene(t).arrows.push({
      id: Store.uid(),
      color: arrowColor,
      points: pts.map(function (p) { return { x: round4(p.x / W), y: round4(p.y / H) }; })
    });
    save();
    renderBoard();
  }

  board.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    var t = getTactic();
    if (!t) return;
    var s = getScene(t);
    var p = toSvg(e);

    if (tool.mode === "arrow") {
      draw = { points: [p] };
      board.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    var node = e.target.closest ? e.target.closest(".unit") : null;
    if (node) {
      var idx = -1;
      for (var i = 0; i < s.items.length; i++) if (s.items[i].id === node.dataset.id) idx = i;
      if (idx < 0) return;
      var it = s.items.splice(idx, 1)[0];
      s.items.push(it); // поднимаем наверх
      layerUnits.appendChild(node);
      drag = { item: it, node: node, dx: it.x * W - p.x, dy: it.y * H - p.y };
      board.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (tool.mode === "place") addItem(tool.type, tool.team, p, s);
  });

  board.addEventListener("pointermove", function (e) {
    if (drag) {
      var p = toSvg(e);
      drag.item.x = round4(clamp((p.x + drag.dx) / W, 0, 1));
      drag.item.y = round4(clamp((p.y + drag.dy) / H, 0, 1));
      drag.node.setAttribute("transform", "translate(" + f(drag.item.x * W) + " " + f(drag.item.y * H) + ")");
    } else if (draw) {
      extendDraw(toSvg(e), e.shiftKey);
      updateDraft();
    }
  });

  function endPointer(e) {
    if (drag) {
      drag = null;
      save();
    }
    if (draw) {
      if (e.type === "pointerup") extendDraw(toSvg(e), e.shiftKey);
      finishArrow();
    }
  }
  board.addEventListener("pointerup", endPointer);
  board.addEventListener("pointercancel", endPointer);

  board.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (!getTactic()) return;
    var node = e.target.closest ? e.target.closest("[data-kind]") : null;
    if (node && node.dataset.kind !== "draft") {
      removeById(node.dataset.kind, node.dataset.id);
    } else if (tool.mode !== "cursor") {
      setTool("cursor");
    }
  });

  // ---------- Списки справа ----------
  function actBtn(text, title, handler, danger) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "row-act" + (danger ? " danger" : "");
    b.textContent = text;
    b.title = title;
    b.addEventListener("click", function (e) { e.stopPropagation(); handler(); });
    return b;
  }

  function makeRow(o) {
    var li = document.createElement("li");
    var row = document.createElement("div");
    row.className = "row" + (o.active ? " active" : "") + (o.depth ? " child" : "");
    var main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    main.textContent = o.name;
    main.title = o.name;
    if (o.depth) main.style.paddingLeft = (10 + o.depth * 14) + "px";
    main.addEventListener("click", o.onSelect);
    row.appendChild(main);
    row.appendChild(actBtn("✎", "Переименовать", o.onRename, false));
    if (o.onDelete) row.appendChild(actBtn("✕", "Удалить", o.onDelete, true));
    li.appendChild(row);
    return li;
  }

  function emptyNote(text) {
    var li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = text;
    return li;
  }

  function renderTactics() {
    tacticList.textContent = "";
    if (!mapStore.tactics.length) {
      tacticList.appendChild(emptyNote("Пока нет тактик"));
      return;
    }
    mapStore.tactics.forEach(function (t) {
      tacticList.appendChild(makeRow({
        name: t.name,
        active: t.id === mapStore.activeTacticId,
        depth: 0,
        onSelect: function () { selectTactic(t.id); },
        onRename: function () { renameTactic(t); },
        onDelete: function () { deleteTactic(t); }
      }));
    });
  }

  function renderScenes() {
    sceneList.textContent = "";
    var t = getTactic();
    btnNewBranch.disabled = !t;
    if (!t) {
      sceneList.appendChild(emptyNote("Выбери или создай тактику"));
      return;
    }
    var activeId = getScene(t).id;
    function walk(parentId, depth) {
      t.scenes.forEach(function (s) {
        if (s.parentId !== parentId) return;
        sceneList.appendChild(makeRow({
          name: s.name,
          active: s.id === activeId,
          depth: depth,
          onSelect: function () { selectScene(s.id); },
          onRename: function () { renameScene(s); },
          onDelete: s.parentId === null ? null : function () { deleteScene(s); }
        }));
        walk(s.id, depth + 1);
      });
    }
    walk(null, 0);
  }

  function renderAll() {
    renderTactics();
    renderScenes();
    renderBoard();
    updatePalette();
  }

  // ---------- Тактики ----------
  function newTactic() {
    if (!mapStore) return;
    askText("Название тактики", "Тактика " + (mapStore.tactics.length + 1)).then(function (name) {
      if (!name) return;
      var root = { id: Store.uid(), name: "Раскатка", parentId: null, items: [], arrows: [] };
      var t = { id: Store.uid(), name: name, scenes: [root], activeSceneId: root.id };
      mapStore.tactics.push(t);
      mapStore.activeTacticId = t.id;
      cancelPointer();
      save();
      renderAll();
    });
  }

  function selectTactic(id) {
    if (mapStore.activeTacticId === id) return;
    cancelPointer();
    mapStore.activeTacticId = id;
    save();
    renderAll();
  }

  function renameTactic(t) {
    askText("Название тактики", t.name).then(function (name) {
      if (!name) return;
      t.name = name;
      save();
      renderTactics();
    });
  }

  function deleteTactic(t) {
    askConfirm("Удалить тактику?", "Тактика «" + t.name + "» и все её ситуации будут удалены.").then(function (ok) {
      if (!ok) return;
      mapStore.tactics = mapStore.tactics.filter(function (x) { return x.id !== t.id; });
      if (mapStore.activeTacticId === t.id) {
        mapStore.activeTacticId = mapStore.tactics.length ? mapStore.tactics[0].id : null;
      }
      cancelPointer();
      save();
      renderAll();
    });
  }

  // ---------- Ситуации (раскатка и разветвления) ----------
  function selectScene(id) {
    var t = getTactic();
    if (!t || t.activeSceneId === id) return;
    cancelPointer();
    t.activeSceneId = id;
    save();
    renderScenes();
    renderBoard();
    updatePalette();
  }

  function renameScene(s) {
    askText("Название ситуации", s.name).then(function (name) {
      if (!name) return;
      s.name = name;
      save();
      renderScenes();
    });
  }

  function collectIds(t, id, out) {
    out.push(id);
    t.scenes.forEach(function (s) { if (s.parentId === id) collectIds(t, s.id, out); });
    return out;
  }

  function deleteScene(s) {
    var t = getTactic();
    if (!t || s.parentId === null) return;
    askConfirm("Удалить ситуацию?", "Ситуация «" + s.name + "» и все её разветвления будут удалены.").then(function (ok) {
      if (!ok) return;
      var ids = collectIds(t, s.id, []);
      t.scenes = t.scenes.filter(function (x) { return ids.indexOf(x.id) < 0; });
      if (ids.indexOf(t.activeSceneId) >= 0) t.activeSceneId = s.parentId;
      cancelPointer();
      save();
      renderScenes();
      renderBoard();
      updatePalette();
    });
  }

  function newBranch() {
    var t = getTactic();
    if (!t) return;
    var parent = getScene(t);
    askText("Название разветвления", "Ветка " + t.scenes.length).then(function (name) {
      if (!name) return;
      var scene = {
        id: Store.uid(),
        name: name,
        parentId: parent.id,
        items: parent.items.map(function (i) {
          return { id: Store.uid(), type: i.type, team: i.team, x: i.x, y: i.y };
        }),
        arrows: COPY_ARROWS_TO_BRANCH ? parent.arrows.map(function (a) {
          return { id: Store.uid(), color: a.color, points: a.points.map(function (p) { return { x: p.x, y: p.y }; }) };
        }) : []
      };
      t.scenes.push(scene);
      t.activeSceneId = scene.id;
      cancelPointer();
      save();
      renderScenes();
      renderBoard();
      updatePalette();
    });
  }

  // ---------- Вход на экран ----------
  function open(map) {
    currentMap = map;
    mapStore = Store.map(map.id);
    el("tac-map-name").textContent = map.name;
    cancelPointer();
    tool = { mode: "cursor", type: null, team: null };

    var found = mapStore.tactics.some(function (t) { return t.id === mapStore.activeTacticId; });
    if (!found) mapStore.activeTacticId = mapStore.tactics.length ? mapStore.tactics[0].id : null;

    renderAll();
    loadImage(map);
  }

  buildPalette();
  el("btn-new-tactic").addEventListener("click", newTactic);
  btnNewBranch.addEventListener("click", newBranch);
  window.addEventListener("resize", fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);

  window.Tactics = { open: open };
})();
