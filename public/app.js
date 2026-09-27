/* ═══════════════════════════════════════════════════════════
   World Map Maker — Core Application
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Color Palette ────────────────────────────────────── */
  const COLORS = [
    { name: "Crimson",    hex: "#e63946" },
    { name: "Tangerine",  hex: "#f77f00" },
    { name: "Sunflower",  hex: "#fcbf49" },
    { name: "Emerald",    hex: "#2a9d8f" },
    { name: "Ocean",      hex: "#457b9d" },
    { name: "Indigo",     hex: "#6366f1" },
    { name: "Violet",     hex: "#8b5cf6" },
    { name: "Rose",       hex: "#ec4899" },
    { name: "Slate",      hex: "#64748b" },
    { name: "Espresso",   hex: "#78350f" },
  ];

  /* ── State ────────────────────────────────────────────── */
  const state = {
    mode: "view",            // "view" | "edit"
    tool: "country-fill",    // "country-fill" | "freehand" | "dot" | "eraser"
    color: COLORS[0].hex,
    colorName: COLORS[0].name,
    brushSize: 10,
    fillOpacity: 0.55,

    // Country fills: { countryId: hex }
    countryFills: {},

    // Freehand strokes: array of { points, color, size }
    strokes: [],
    undoneStrokes: [],
    currentStroke: null,

    // Dots: array of { id, geoCoords:[lon,lat], title, text, color }
    dots: [],

    // Map state
    transform: null,
    projection: null,
    path: null,
    geoData: null,
    countryNames: [],
  };

  /* ── DOM References ───────────────────────────────────── */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const mapContainer  = $("#map-container");
  const mapSvg        = $("#map-svg");
  const paintCanvas   = $("#paint-canvas");
  const dotsLayer     = $("#dots-layer");
  const editPanel     = $("#edit-panel");
  const loadingScreen = $("#loading-screen");

  const ctx = paintCanvas.getContext("2d");

  /* ── Projection & Path ────────────────────────────────── */
  function initProjection() {
    const w = mapContainer.clientWidth;
    const h = mapContainer.clientHeight;
    state.projection = d3.geoEqualEarth()
      .fitSize([w, h], { type: "Sphere" });
    state.path = d3.geoPath(state.projection);
  }

  /* ── Load World Data ──────────────────────────────────── */
  async function loadWorldData() {
    const url = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
    const topoData = await d3.json(url);
    const countries = topojson.feature(topoData, topoData.objects.countries);
    state.geoData = countries;

    // Build name list from the embedded properties + a manual fallback map
    const idToName = buildCountryNameMap(topoData);
    state.countryNames = countries.features.map((f) => ({
      id: f.id || f.properties?.name,
      name: idToName[f.id] || f.properties?.name || `Region ${f.id}`,
      feature: f,
    }));

    return countries;
  }

  /* Numeric ISO-3166 ID → name mapping (common countries) */
  function buildCountryNameMap(topo) {
    // world-atlas uses numeric ISO ids; we provide a comprehensive map
    const m = {
      "004":"Afghanistan","008":"Albania","012":"Algeria","024":"Angola",
      "032":"Argentina","051":"Armenia","036":"Australia","040":"Austria",
      "031":"Azerbaijan","044":"Bahamas","050":"Bangladesh","112":"Belarus",
      "056":"Belgium","084":"Belize","204":"Benin","064":"Bhutan","068":"Bolivia",
      "070":"Bosnia and Herzegovina","072":"Botswana","076":"Brazil",
      "096":"Brunei","100":"Bulgaria","854":"Burkina Faso","108":"Burundi",
      "116":"Cambodia","120":"Cameroon","124":"Canada",
      "140":"Central African Republic","148":"Chad","152":"Chile","156":"China",
      "170":"Colombia","178":"Republic of the Congo",
      "180":"Democratic Republic of the Congo","188":"Costa Rica",
      "384":"Ivory Coast","191":"Croatia","192":"Cuba","196":"Cyprus",
      "203":"Czech Republic","208":"Denmark","262":"Djibouti",
      "214":"Dominican Republic","218":"Ecuador","818":"Egypt",
      "222":"El Salvador","226":"Equatorial Guinea","232":"Eritrea",
      "233":"Estonia","231":"Ethiopia","238":"Falkland Islands","242":"Fiji",
      "246":"Finland","250":"France","266":"Gabon","270":"Gambia",
      "268":"Georgia","276":"Germany","288":"Ghana","300":"Greece",
      "304":"Greenland","320":"Guatemala","324":"Guinea","624":"Guinea-Bissau",
      "328":"Guyana","332":"Haiti","340":"Honduras","348":"Hungary",
      "352":"Iceland","356":"India","360":"Indonesia","364":"Iran","368":"Iraq",
      "372":"Ireland","376":"Israel","380":"Italy","388":"Jamaica","392":"Japan",
      "400":"Jordan","398":"Kazakhstan","404":"Kenya","408":"North Korea",
      "410":"South Korea","414":"Kuwait","417":"Kyrgyzstan","418":"Laos",
      "428":"Latvia","422":"Lebanon","426":"Lesotho","430":"Liberia",
      "434":"Libya","440":"Lithuania","442":"Luxembourg","807":"North Macedonia",
      "450":"Madagascar","454":"Malawi","458":"Malaysia","466":"Mali",
      "478":"Mauritania","484":"Mexico","496":"Mongolia","499":"Montenegro",
      "504":"Morocco","508":"Mozambique","104":"Myanmar","516":"Namibia",
      "524":"Nepal","528":"Netherlands","554":"New Zealand","558":"Nicaragua",
      "562":"Niger","566":"Nigeria","578":"Norway","512":"Oman","586":"Pakistan",
      "275":"Palestine","591":"Panama","598":"Papua New Guinea","600":"Paraguay",
      "604":"Peru","608":"Philippines","616":"Poland","620":"Portugal",
      "634":"Qatar","642":"Romania","643":"Russia","646":"Rwanda",
      "682":"Saudi Arabia","686":"Senegal","688":"Serbia","694":"Sierra Leone",
      "703":"Slovakia","705":"Slovenia","706":"Somalia","710":"South Africa",
      "728":"South Sudan","724":"Spain","144":"Sri Lanka","729":"Sudan",
      "740":"Suriname","748":"Eswatini","752":"Sweden","756":"Switzerland",
      "760":"Syria","158":"Taiwan","762":"Tajikistan","834":"Tanzania",
      "764":"Thailand","768":"Togo","780":"Trinidad and Tobago","788":"Tunisia",
      "792":"Turkey","795":"Turkmenistan","800":"Uganda","804":"Ukraine",
      "784":"United Arab Emirates","826":"United Kingdom",
      "840":"United States of America","858":"Uruguay","860":"Uzbekistan",
      "862":"Venezuela","704":"Vietnam","887":"Yemen","894":"Zambia",
      "716":"Zimbabwe","-99":"N. Cyprus","010":"Antarctica",
      "570":"Niue","574":"Norfolk Island","585":"Palau",
      "090":"Solomon Islands","548":"Vanuatu","882":"Samoa",
      "162":"Christmas Island",
    };
    return m;
  }

  /* ── Render Map ───────────────────────────────────────── */
  function renderMap(countries) {
    const svg = d3.select("#map-svg");
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("id", "map-g");

    // Graticule
    const graticule = d3.geoGraticule();
    g.append("path")
      .datum(graticule())
      .attr("class", "graticule")
      .attr("d", state.path);

    // Countries
    g.selectAll(".country")
      .data(countries.features)
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("d", state.path)
      .attr("data-id", (d) => d.id)
      .attr("data-name", (d) => {
        const entry = state.countryNames.find((c) => c.id === d.id);
        return entry ? entry.name : "";
      })
      .on("mouseenter", onCountryHover)
      .on("mousemove", onCountryMove)
      .on("mouseleave", onCountryLeave)
      .on("click", onCountryClick);

    // Apply saved fills
    applyCountryFills();

    // Setup zoom
    const zoom = d3.zoom()
      .scaleExtent([1, 20])
      .on("zoom", (event) => {
        state.transform = event.transform;
        g.attr("transform", event.transform);
        redrawCanvas();
        repositionDots();
      });

    svg.call(zoom);

    // Disable zoom when painting/erasing
    state._zoom = zoom;
    state._svg = svg;

    // Initial transform
    state.transform = d3.zoomIdentity;
  }

  function applyCountryFills() {
    Object.entries(state.countryFills).forEach(([id, hex]) => {
      const el = mapSvg.querySelector(`.country[data-id="${id}"]`);
      if (el) {
        el.style.fill = hex;
        el.style.fillOpacity = state.fillOpacity;
      }
    });
  }

  /* ── Country Interactions ─────────────────────────────── */
  function onCountryHover(event, d) {
    const tooltip = $("#country-tooltip");
    const entry = state.countryNames.find((c) => c.id === d.id);
    tooltip.textContent = entry ? entry.name : `Region ${d.id}`;
    tooltip.classList.remove("hidden");
  }

  function onCountryMove(event) {
    const tooltip = $("#country-tooltip");
    tooltip.style.left = event.clientX + 14 + "px";
    tooltip.style.top = event.clientY - 10 + "px";
  }

  function onCountryLeave() {
    $("#country-tooltip").classList.add("hidden");
  }

  function onCountryClick(event, d) {
    if (state.mode !== "edit") return;

    // If dot tool is active, delegate to dot placement
    if (state.tool === "dot") {
      onMapClickForDot(event);
      return;
    }

    if (state.tool !== "country-fill") return;

    const id = d.id;
    const el = event.currentTarget;

    // If already this color, remove the fill
    if (state.countryFills[id] === state.color) {
      delete state.countryFills[id];
      el.style.fill = "";
      el.style.fillOpacity = "";
    } else {
      state.countryFills[id] = state.color;
      el.style.fill = state.color;
      el.style.fillOpacity = state.fillOpacity;
    }
  }

  /* ── Canvas Sizing ────────────────────────────────────── */
  function resizeCanvas() {
    const rect = mapContainer.getBoundingClientRect();
    paintCanvas.width = rect.width * window.devicePixelRatio;
    paintCanvas.height = rect.height * window.devicePixelRatio;
    paintCanvas.style.width = rect.width + "px";
    paintCanvas.style.height = rect.height + "px";
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    redrawCanvas();
  }

  /* ── Freehand Drawing on Canvas ───────────────────────── */
  function setupCanvasEvents() {
    let isDrawing = false;

    paintCanvas.addEventListener("pointerdown", (e) => {
      if (state.mode !== "edit") return;
      if (state.tool !== "freehand" && state.tool !== "eraser") return;

      isDrawing = true;
      paintCanvas.setPointerCapture(e.pointerId);

      // Convert screen coords to "map-space" coords (accounting for zoom/pan)
      const pt = screenToMapCoords(e.clientX, e.clientY);

      if (state.tool === "freehand") {
        state.currentStroke = {
          points: [pt],
          color: state.color,
          size: state.brushSize,
        };
        state.undoneStrokes = []; // new action clears redo stack
      } else {
        // Eraser: erase by drawing with destination-out
        state.currentStroke = {
          points: [pt],
          color: "eraser",
          size: state.brushSize,
        };
      }
    });

    paintCanvas.addEventListener("pointermove", (e) => {
      if (!isDrawing || !state.currentStroke) return;
      const pt = screenToMapCoords(e.clientX, e.clientY);
      state.currentStroke.points.push(pt);
      redrawCanvas();
    });

    const endDraw = () => {
      if (!isDrawing) return;
      isDrawing = false;
      if (state.currentStroke && state.currentStroke.points.length > 1) {
        state.strokes.push(state.currentStroke);
      }
      state.currentStroke = null;
    };

    paintCanvas.addEventListener("pointerup", endDraw);
    paintCanvas.addEventListener("pointercancel", endDraw);
  }

  function screenToMapCoords(sx, sy) {
    // Subtract container offset
    const rect = mapContainer.getBoundingClientRect();
    const x = sx - rect.left;
    const y = sy - rect.top;

    // Reverse the D3 zoom transform to get "base" map coords
    const t = state.transform || d3.zoomIdentity;
    return {
      x: (x - t.x) / t.k,
      y: (y - t.y) / t.k,
    };
  }

  function mapToScreenCoords(mx, my) {
    const t = state.transform || d3.zoomIdentity;
    return {
      x: mx * t.k + t.x,
      y: my * t.k + t.y,
    };
  }

  function redrawCanvas() {
    const w = paintCanvas.width / window.devicePixelRatio;
    const h = paintCanvas.height / window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    const allStrokes = state.currentStroke
      ? [...state.strokes, state.currentStroke]
      : state.strokes;

    const t = state.transform || d3.zoomIdentity;

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;

      ctx.save();

      if (stroke.color === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = stroke.color;
      }

      ctx.lineWidth = stroke.size * t.k;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = stroke.color === "eraser" ? 1 : 0.7;

      ctx.beginPath();
      const first = mapToScreenCoords(stroke.points[0].x, stroke.points[0].y);
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < stroke.points.length; i++) {
        const p = mapToScreenCoords(stroke.points[i].x, stroke.points[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ── Undo / Redo ──────────────────────────────────────── */
  function undo() {
    if (state.strokes.length === 0) return;
    state.undoneStrokes.push(state.strokes.pop());
    redrawCanvas();
  }

  function redo() {
    if (state.undoneStrokes.length === 0) return;
    state.strokes.push(state.undoneStrokes.pop());
    redrawCanvas();
  }

  /* ── Dots ─────────────────────────────────────────────── */
  function onMapClickForDot(event) {
    if (state.mode !== "edit" || state.tool !== "dot") return;

    // Don't place dot if clicked on existing dot
    if (event.target.closest(".map-dot")) return;

    const rect = mapContainer.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;

    // Convert screen to map base coords, then invert projection to get geo coords
    const t = state.transform || d3.zoomIdentity;
    const baseX = (sx - t.x) / t.k;
    const baseY = (sy - t.y) / t.k;
    const geo = state.projection.invert([baseX, baseY]);
    if (!geo) return;

    const dot = {
      id: "dot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      geoCoords: geo,
      title: "",
      text: "",
      color: state.color,
    };

    state.dots.push(dot);
    renderDot(dot);
    showToast("Dot placed — click it to add notes");
  }

  function renderDot(dot) {
    const el = document.createElement("div");
    el.className = "map-dot";
    el.dataset.dotId = dot.id;
    el.style.background = dot.color;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openDotPopup(dot, el);
    });
    dotsLayer.appendChild(el);
    positionDotElement(dot, el);
  }

  function positionDotElement(dot, el) {
    const projected = state.projection(dot.geoCoords);
    if (!projected) { el.style.display = "none"; return; }
    const screen = mapToScreenCoords(projected[0], projected[1]);
    el.style.left = screen.x + "px";
    el.style.top = screen.y + "px";
    el.style.display = "";
  }

  function repositionDots() {
    dotsLayer.querySelectorAll(".map-dot").forEach((el) => {
      const dot = state.dots.find((d) => d.id === el.dataset.dotId);
      if (dot) positionDotElement(dot, el);
    });
  }

  function renderAllDots() {
    dotsLayer.innerHTML = "";
    state.dots.forEach((d) => renderDot(d));
  }

  /* ── Dot Popup ────────────────────────────────────────── */
  let activeDot = null;

  function openDotPopup(dot, dotEl) {
    activeDot = dot;
    const popup = $("#dot-popup");
    popup.classList.remove("hidden");

    // Position near dot
    const dotRect = dotEl.getBoundingClientRect();
    let left = dotRect.right + 12;
    let top = dotRect.top - 20;
    if (left + 330 > window.innerWidth) left = dotRect.left - 332;
    if (top + 250 > window.innerHeight) top = window.innerHeight - 260;
    if (top < 60) top = 60;
    popup.style.left = left + "px";
    popup.style.top = top + "px";

    if (state.mode === "edit") {
      // Edit mode
      $("#dot-popup-view").classList.add("hidden");
      $("#dot-popup-edit").classList.remove("hidden");
      $("#dot-title-input").value = dot.title;
      $("#dot-text-input").value = dot.text;
    } else {
      // View mode
      $("#dot-popup-view").classList.remove("hidden");
      $("#dot-popup-edit").classList.add("hidden");
      $("#dot-popup-title").textContent = dot.title || "Annotation";
      $("#dot-popup-text").textContent = dot.text;
    }
  }

  function closeDotPopup() {
    $("#dot-popup").classList.add("hidden");
    activeDot = null;
  }

  function saveDot() {
    if (!activeDot) return;
    activeDot.title = $("#dot-title-input").value.trim();
    activeDot.text = $("#dot-text-input").value.trim();
    closeDotPopup();
    showToast("Notes saved");
  }

  function deleteDot() {
    if (!activeDot) return;
    const id = activeDot.id;
    state.dots = state.dots.filter((d) => d.id !== id);
    const el = dotsLayer.querySelector(`[data-dot-id="${id}"]`);
    if (el) {
      el.classList.add("removing");
      setTimeout(() => el.remove(), 300);
    }
    closeDotPopup();
    showToast("Dot removed");
  }

  /* ── Mode & Tool Switching ────────────────────────────── */
  function setMode(mode) {
    state.mode = mode;
    $$(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    const toggle = $(".mode-toggle");
    toggle.classList.toggle("edit-active", mode === "edit");
    editPanel.classList.toggle("hidden", mode !== "edit");
    mapContainer.classList.toggle("panel-open", mode === "edit");

    // Update canvas interactivity
    updateCanvasInteractivity();
    // Update zoom vs draw
    updateZoomState();
    // Close popup if open
    closeDotPopup();

    // Resize after panel transition
    setTimeout(() => {
      resizeCanvas();
      repositionDots();
    }, 360);
  }

  function setTool(tool) {
    state.tool = tool;
    $$(".tool-btn").forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
    updateCanvasInteractivity();
    updateZoomState();

    // Update cursor on SVG for dot tool
    const svgEl = document.getElementById("map-svg");
    svgEl.style.cursor = (tool === "dot") ? "crosshair" : "";

    // Show/hide brush size section based on tool
    const brushSection = $("#brush-section");
    const opacitySection = $("#opacity-section");
    brushSection.style.display = (tool === "freehand" || tool === "eraser") ? "" : "none";
    opacitySection.style.display = (tool === "country-fill") ? "" : "none";
  }

  function updateCanvasInteractivity() {
    const active = state.mode === "edit" && (state.tool === "freehand" || state.tool === "eraser");
    paintCanvas.classList.toggle("active", active);
    paintCanvas.classList.toggle("erasing", state.mode === "edit" && state.tool === "eraser");
  }

  function updateZoomState() {
    if (!state._svg || !state._zoom) return;
    // Disable zoom when painting or erasing
    if (state.mode === "edit" && (state.tool === "freehand" || state.tool === "eraser")) {
      state._svg.on(".zoom", null);
    } else {
      state._svg.call(state._zoom);
    }
  }

  /* ── Color Palette ────────────────────────────────────── */
  function buildPalette() {
    const container = $("#color-palette");
    COLORS.forEach((c, i) => {
      const swatch = document.createElement("button");
      swatch.className = "color-swatch" + (i === 0 ? " active" : "");
      swatch.style.background = c.hex;
      swatch.title = c.name;
      swatch.dataset.color = c.hex;
      swatch.dataset.name = c.name;
      swatch.addEventListener("click", () => selectColor(c.hex, c.name));
      container.appendChild(swatch);
    });
    updateActiveColorDisplay();
  }

  function selectColor(hex, name) {
    state.color = hex;
    state.colorName = name;
    $$(".color-swatch").forEach((s) => s.classList.toggle("active", s.dataset.color === hex));
    updateActiveColorDisplay();
  }

  function updateActiveColorDisplay() {
    $("#active-color-swatch").style.background = state.color;
    $("#active-color-name").textContent = state.colorName;
  }

  /* ── Country Search ───────────────────────────────────── */
  function setupSearch() {
    const input = $("#country-search");
    const results = $("#search-results");

    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) {
        results.classList.remove("open");
        return;
      }

      const matches = state.countryNames
        .filter((c) => c.name.toLowerCase().includes(query))
        .slice(0, 10);

      if (matches.length === 0) {
        results.classList.remove("open");
        return;
      }

      results.innerHTML = matches
        .map((c) => `<div class="search-result-item" data-id="${c.id}">${c.name}</div>`)
        .join("");

      results.classList.add("open");

      results.querySelectorAll(".search-result-item").forEach((item) => {
        item.addEventListener("click", () => {
          const id = item.dataset.id;
          zoomToCountry(id);
          results.classList.remove("open");
          input.value = item.textContent;
        });
      });
    });

    // Close search results on outside click
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrapper")) {
        results.classList.remove("open");
      }
    });
  }

  function zoomToCountry(id) {
    const entry = state.countryNames.find((c) => String(c.id) === String(id));
    if (!entry) return;

    const bounds = state.path.bounds(entry.feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const cx = (bounds[0][0] + bounds[1][0]) / 2;
    const cy = (bounds[0][1] + bounds[1][1]) / 2;

    const containerRect = mapContainer.getBoundingClientRect();
    const w = containerRect.width;
    const h = containerRect.height;

    const scale = Math.min(8, 0.85 / Math.max(dx / w, dy / h));
    const translate = [w / 2 - scale * cx, h / 2 - scale * cy];

    const t = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);

    state._svg
      .transition()
      .duration(800)
      .call(state._zoom.transform, t);

    // Highlight the country briefly
    const el = mapSvg.querySelector(`.country[data-id="${id}"]`);
    if (el) {
      el.classList.add("highlighted");
      setTimeout(() => el.classList.remove("highlighted"), 4500);
    }
  }

  /* ── Database Save / Load ─────────────────────── */
  function openSaveModal() {
    $("#save-modal").classList.remove("hidden");
    $("#save-modal-backdrop").classList.remove("hidden");
    $("#save-map-name").value = state.currentMapName === "Untitled Map" ? "" : state.currentMapName;
  }
  
  function closeSaveModal() {
    $("#save-modal").classList.add("hidden");
    $("#save-modal-backdrop").classList.add("hidden");
  }

  async function saveMapToDb() {
    const name = $("#save-map-name").value.trim() || "Untitled Map";
    const data = {
      name,
      countryFills: state.countryFills,
      strokes: state.strokes,
      dots: state.dots,
      fillOpacity: state.fillOpacity,
    };

    try {
      showToast("Saving to database...");
      const method = state.currentMapId ? 'PUT' : 'POST';
      const url = state.currentMapId ? `/api/maps/${state.currentMapId}` : '/api/maps';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      
      if (result.success) {
        state.currentMapId = result.id;
        state.currentMapName = name;
        showToast("Map saved to database!");
        closeSaveModal();
      } else {
        showToast("Failed to save map.");
      }
    } catch (err) {
      console.error(err);
      showToast("Error saving map.");
    }
  }

  async function openDbModal() {
    $("#db-modal").classList.remove("hidden");
    $("#db-modal-backdrop").classList.remove("hidden");
    const container = $("#db-list-container");
    container.innerHTML = "Loading maps...";
    
    try {
      const res = await fetch('/api/maps');
      const maps = await res.json();
      
      if (maps.length === 0) {
        container.innerHTML = "<p style='color: var(--text-muted); padding: 10px;'>No maps found.</p>";
        return;
      }
      
      container.innerHTML = "";
      maps.forEach(map => {
        const item = document.createElement("div");
        item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;";
        
        const nameSpan = document.createElement("span");
        nameSpan.textContent = map.name;
        nameSpan.style.color = "var(--text-primary)";
        nameSpan.style.fontWeight = "500";
        
        const dateSpan = document.createElement("span");
        dateSpan.textContent = new Date(map.lastModified).toLocaleDateString();
        dateSpan.style.color = "var(--text-muted)";
        dateSpan.style.fontSize = "12px";

        item.addEventListener("click", () => loadMapFromDb(map.id));
        item.appendChild(nameSpan);
        item.appendChild(dateSpan);
        container.appendChild(item);
      });
    } catch (err) {
      container.innerHTML = "<p style='color: var(--danger);'>Failed to load maps.</p>";
    }
  }

  function closeDbModal() {
    $("#db-modal").classList.add("hidden");
    $("#db-modal-backdrop").classList.add("hidden");
  }

  async function loadMapFromDb(id) {
    try {
      showToast("Loading map...");
      const res = await fetch(`/api/maps/${id}`);
      const data = await res.json();
      
      state.currentMapId = id;
      state.currentMapName = data.name;
      state.countryFills = data.countryFills || {};
      state.strokes = data.strokes || [];
      state.dots = data.dots || [];
      state.fillOpacity = data.fillOpacity || 0.55;
      
      mapSvg.querySelectorAll(".country").forEach((el) => {
        el.style.fill = "";
        el.style.fillOpacity = "";
      });
      applyCountryFills();
      redrawCanvas();
      renderAllDots();
      $("#fill-opacity").value = Math.round(state.fillOpacity * 100);
      $("#fill-opacity-value").textContent = Math.round(state.fillOpacity * 100) + "%";
      
      closeDbModal();
      showToast(`Map loaded: ${data.name}`);
    } catch (err) {
      showToast("Failed to load map");
    }
  }

  function sanitizeName(name) {
    return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").replace(/^_|_$/g, "");
  }

  /* ── Render Map to Canvas (shared helper) ───────────── */
  function renderMapToCanvas() {
    return new Promise((resolve) => {
      const rect = mapContainer.getBoundingClientRect();
      const exportCanvas = document.createElement("canvas");
      const dpr = window.devicePixelRatio;
      exportCanvas.width = rect.width * dpr;
      exportCanvas.height = rect.height * dpr;
      const ectx = exportCanvas.getContext("2d");
      ectx.scale(dpr, dpr);

      // Background
      ectx.fillStyle = "#12141d";
      ectx.fillRect(0, 0, rect.width, rect.height);

      // Serialize SVG
      const svgClone = mapSvg.cloneNode(true);
      svgClone.setAttribute("width", rect.width);
      svgClone.setAttribute("height", rect.height);
      svgClone.querySelectorAll(".country").forEach((c) => {
        const orig = mapSvg.querySelector(`[data-id="${c.dataset.id}"]`);
        if (orig) {
          if (orig.style.fill) {
            c.setAttribute("fill", orig.style.fill);
            c.setAttribute("fill-opacity", orig.style.fillOpacity || state.fillOpacity);
          } else {
            c.setAttribute("fill", "#1e2030");
          }
          c.setAttribute("stroke", "rgba(255,255,255,0.12)");
          c.setAttribute("stroke-width", "0.5");
        }
      });
      svgClone.querySelectorAll(".graticule").forEach((g) => {
        g.setAttribute("fill", "none");
        g.setAttribute("stroke", "rgba(255,255,255,0.03)");
        g.setAttribute("stroke-width", "0.5");
      });

      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        ectx.drawImage(img, 0, 0, rect.width, rect.height);
        URL.revokeObjectURL(svgUrl);

        // Draw the paint canvas on top
        ectx.drawImage(paintCanvas, 0, 0, rect.width, rect.height);

        // Draw dots
        state.dots.forEach((dot) => {
          const projected = state.projection(dot.geoCoords);
          if (!projected) return;
          const screen = mapToScreenCoords(projected[0], projected[1]);
          ectx.beginPath();
          ectx.arc(screen.x, screen.y, 6, 0, Math.PI * 2);
          ectx.fillStyle = dot.color;
          ectx.fill();
          ectx.strokeStyle = "#fff";
          ectx.lineWidth = 2;
          ectx.stroke();
        });

        resolve(exportCanvas);
      };
      img.src = svgUrl;
    });
  }

  /** Convert a canvas to a JPEG Blob */
  function canvasToJpegBlob(canvas, quality) {
    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality || 0.92);
    });
  }

  async function exportAsImage() {
    showToast("Rendering JPEG...");
    try {
      const canvas = await renderMapToCanvas();
      const blob = await canvasToJpegBlob(canvas, 0.92);
      const safeName = sanitizeName(state.currentMapName || "Untitled_Map");
      const filename = `${safeName}.jpeg`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${filename}`);
    } catch (e) {
      showToast("Failed to export JPEG");
    }
  }

  function clearAll() {
    if (!confirm("Clear all paintings, country fills, and dots? This cannot be undone.")) return;
    state.countryFills = {};
    state.strokes = [];
    state.undoneStrokes = [];
    state.dots = [];
    state.currentMapId = null;
    state.currentMapName = "Untitled Map";

    mapSvg.querySelectorAll(".country").forEach((el) => {
      el.style.fill = "";
      el.style.fillOpacity = "";
    });
    redrawCanvas();
    renderAllDots();
    showToast("Map cleared");
  }

  /* ── Toast ────────────────────────────────────────────── */
  let toastTimeout;
  function showToast(msg) {
    const toast = $("#toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add("hidden"), 2800);
  }

  /* ── Wire Up Events ───────────────────────────────────── */
  function wireEvents() {
    // Mode toggles
    $("#btn-view-mode").addEventListener("click", () => setMode("view"));
    $("#btn-edit-mode").addEventListener("click", () => setMode("edit"));

    // Tool buttons
    $$(".tool-btn").forEach((btn) =>
      btn.addEventListener("click", () => setTool(btn.dataset.tool))
    );

    // Brush size
    $("#brush-size").addEventListener("input", (e) => {
      state.brushSize = parseInt(e.target.value);
      $("#brush-size-value").textContent = state.brushSize + "px";
    });

    // Fill opacity
    $("#fill-opacity").addEventListener("input", (e) => {
      state.fillOpacity = parseInt(e.target.value) / 100;
      $("#fill-opacity-value").textContent = e.target.value + "%";
    });

    // Undo/Redo
    $("#btn-undo").addEventListener("click", undo);
    $("#btn-redo").addEventListener("click", redo);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); openSaveModal(); }
    });

    // Save / Load / Export / Clear
    $("#btn-save").addEventListener("click", openSaveModal);
    $("#btn-load").addEventListener("click", openDbModal);
    $("#btn-export").addEventListener("click", exportAsImage);
    $("#btn-clear-all").addEventListener("click", clearAll);

    // Save Modal
    $("#save-modal-close").addEventListener("click", closeSaveModal);
    $("#save-modal-backdrop").addEventListener("click", closeSaveModal);
    $("#save-btn-save").addEventListener("click", saveMapToDb);

    // Database Modal
    $("#db-modal-close").addEventListener("click", closeDbModal);
    $("#db-modal-backdrop").addEventListener("click", closeDbModal);

    // Dot popup
    $("#dot-popup-close").addEventListener("click", closeDotPopup);
    $("#dot-save-btn").addEventListener("click", saveDot);
    $("#dot-delete-btn").addEventListener("click", deleteDot);

    // Dot placement via click on map container
    mapContainer.addEventListener("click", onMapClickForDot);

    // Resize
    window.addEventListener("resize", () => {
      initProjection();
      // Re-render paths with new projection
      const g = d3.select("#map-g");
      g.selectAll(".country").attr("d", state.path);
      g.selectAll(".graticule").attr("d", state.path);
      resizeCanvas();
      repositionDots();
    });
  }

  /* ── Initialization ───────────────────────────────────── */
  async function init() {
    initProjection();
    const countries = await loadWorldData();
    renderMap(countries);
    resizeCanvas();
    setupCanvasEvents();
    buildPalette();
    setupSearch();
    wireEvents();
    setTool("country-fill"); // default tool

    // Hide loading screen
    loadingScreen.classList.add("fade-out");
    setTimeout(() => loadingScreen.remove(), 600);
  }

  init();
})();
