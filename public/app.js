/* ═══════════════════════════════════════════════════════════
   World Map Maker — Core Application
   Supports per-country JSON objects, interactive checklists,
   raw JSON editing, and human-editable v2 map files.
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Color Palette ────────────────────────────────────── */
  const COLORS = [
    { name: "Crimson",   hex: "#e63946" },
    { name: "Tangerine", hex: "#f77f00" },
    { name: "Sunflower", hex: "#fcbf49" },
    { name: "Emerald",   hex: "#2a9d8f" },
    { name: "Ocean",     hex: "#457b9d" },
    { name: "Indigo",    hex: "#6366f1" },
    { name: "Violet",    hex: "#8b5cf6" },
    { name: "Rose",      hex: "#ec4899" },
    { name: "Slate",     hex: "#64748b" },
    { name: "Espresso",  hex: "#78350f" },
  ];

  /* Microstates & regions not in 110m Natural Earth polygons so offline/search JSON still works */
  const EXTRA_COUNTRIES = [
    "Andorra", "Antigua and Barbuda", "Bahrain", "Barbados", "Cape Verde",
    "Comoros", "Dominica", "Grenada", "Hong Kong", "Kiribati", "Liechtenstein",
    "Macau", "Maldives", "Malta", "Marshall Islands", "Mauritius", "Micronesia",
    "Monaco", "Saint Kitts and Nevis", "Saint Lucia",
    "Saint Vincent and the Grenadines", "San Marino", "Sao Tome and Principe",
    "Seychelles", "Singapore", "Tonga", "Tuvalu", "Vatican City",
  ];

  /* Common country aliases for human-friendly offline JSON editing */
  const COUNTRY_ALIASES = {
    "usa": "United States of America",
    "us": "United States of America",
    "u.s.": "United States of America",
    "u.s.a.": "United States of America",
    "united states": "United States of America",
    "america": "United States of America",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "great britain": "United Kingdom",
    "britain": "United Kingdom",
    "england": "United Kingdom",
    "uae": "United Arab Emirates",
    "emirates": "United Arab Emirates",
    "korea": "South Korea",
    "republic of korea": "South Korea",
    "rok": "South Korea",
    "dprk": "North Korea",
    "russian federation": "Russia",
    "czechia": "Czech Republic",
    "turkiye": "Turkey",
    "türkiye": "Turkey",
    "viet nam": "Vietnam",
    "cote d'ivoire": "Ivory Coast",
    "côte d'ivoire": "Ivory Coast",
    "drc": "Democratic Republic of the Congo",
    "dr congo": "Democratic Republic of the Congo",
    "congo-kinshasa": "Democratic Republic of the Congo",
    "congo": "Republic of the Congo",
    "congo-brazzaville": "Republic of the Congo",
    "holland": "Netherlands",
    "the netherlands": "Netherlands",
    "burma": "Myanmar",
    "swaziland": "Eswatini",
    "macedonia": "North Macedonia",
    "bosnia": "Bosnia and Herzegovina",
    "trinidad": "Trinidad and Tobago",
    "east timor": "Timor-Leste",
    "n cyprus": "N. Cyprus",
    "northern cyprus": "N. Cyprus",
  };

  const TOOL_HINTS = {
    "country-fill": "Click a country to color it. Right-click any country to edit its JSON.",
    "country-data": "Click any country on the map to view or edit its custom JSON object.",
    "freehand": "Drag anywhere on the map to paint freehand strokes across borders.",
    "dot": "Click anywhere on the map to drop an annotated location pin.",
    "eraser": "Drag across freehand paint strokes to erase them.",
  };

  /* ── State ────────────────────────────────────────────── */
  const state = {
    mode: "view",            // "view" | "edit"
    tool: "country-fill",    // "country-fill" | "country-data" | "freehand" | "dot" | "eraser"
    color: COLORS[0].hex,
    colorName: COLORS[0].name,
    brushSize: 10,
    fillOpacity: 0.55,

    currentMapId: null,
    currentMapName: "Untitled Map",
    currentMapFile: null,
    loadedFormatVersion: 2,

    // Country fills: { [countryId]: hex }
    countryFills: {},

    // Country custom JSON objects: { [countryId]: plainObject }
    countryData: {},

    // Custom color palette overrides preserved from file
    customPalette: {},

    // Freehand strokes: array of { points, color, size }
    strokes: [],
    undoneStrokes: [],
    currentStroke: null,

    // Pins/Dots: array of { id, geoCoords:[lon,lat], title, text, color }
    dots: [],

    // Map D3 state
    transform: null,
    projection: null,
    path: null,
    geoData: null,
    countryNames: [],
  };

  /* Country Modal Working State */
  const modalState = {
    isOpen: false,
    countryId: null,
    countryName: "",
    activeTab: "interactive", // "interactive" | "raw"
    workingData: {},
    workingColor: null,
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

  /* ── Color Helpers ────────────────────────────────────── */
  function resolveColorHex(colorInput, filePalette = {}) {
    if (!colorInput || typeof colorInput !== "string") return null;
    const trimmed = colorInput.trim();
    if (!trimmed) return null;

    // Check file's colorPalette first (case-insensitive)
    for (const [name, hex] of Object.entries(filePalette || {})) {
      if (name.toLowerCase() === trimmed.toLowerCase() && typeof hex === "string") {
        return hex.trim();
      }
    }

    // Check built-in palette
    const match = COLORS.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (match) return match.hex;

    return trimmed;
  }

  function serializeColorValue(hex) {
    if (!hex || typeof hex !== "string") return null;
    const normalized = hex.trim().toLowerCase();
    if (!normalized) return null;

    const match = COLORS.find((c) => c.hex.toLowerCase() === normalized);
    if (match) return match.name;

    for (const [name, pHex] of Object.entries(state.customPalette || {})) {
      if (typeof pHex === "string" && pHex.trim().toLowerCase() === normalized) {
        return name;
      }
    }
    return hex.trim();
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function isPlainObject(val) {
    return Boolean(val) && typeof val === "object" && !Array.isArray(val);
  }

  function hasNonEmptyData(data) {
    if (!isPlainObject(data)) return false;
    return Object.keys(data).length > 0;
  }

  function slugifyPreview(name) {
    const slug = String(name || "untitled-map")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "untitled-map";
  }

  /* ── Projection & Path ────────────────────────────────── */
  function initProjection() {
    const w = mapContainer.clientWidth;
    const h = mapContainer.clientHeight;
    state.projection = d3.geoEqualEarth().fitSize([w, h], { type: "Sphere" });
    state.path = d3.geoPath(state.projection);
  }

  /* ── Load World Data ──────────────────────────────────── */
  async function loadWorldData() {
    const url = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
    const topoData = await d3.json(url);
    const countries = topojson.feature(topoData, topoData.objects.countries);

    const idToName = buildCountryNameMap();
    const seenNames = new Set();

    countries.features.forEach((f, idx) => {
      if (f.id === undefined || f.id === null || f.id === "") {
        f.id = f.properties?.name ? `region:${f.properties.name}` : `region:${idx}`;
      } else {
        f.id = String(f.id);
      }
    });

    state.geoData = countries;
    state.countryNames = countries.features.map((f) => {
      const name = idToName[f.id] || f.properties?.name || `Region ${f.id}`;
      seenNames.add(name.toLowerCase());
      return {
        id: f.id,
        name,
        feature: f,
        hasGeometry: true,
      };
    });

    // Register microstates/regions so they can be searched and preserved in JSON
    for (const extraName of EXTRA_COUNTRIES) {
      if (!seenNames.has(extraName.toLowerCase())) {
        seenNames.add(extraName.toLowerCase());
        state.countryNames.push({
          id: `extra:${extraName}`,
          name: extraName,
          feature: null,
          hasGeometry: false,
        });
      }
    }

    state.countryNames.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    return countries;
  }

  /* Numeric ISO-3166 ID → canonical human-readable country name */
  function buildCountryNameMap() {
    return {
      "004": "Afghanistan", "008": "Albania", "012": "Algeria", "024": "Angola",
      "032": "Argentina", "051": "Armenia", "036": "Australia", "040": "Austria",
      "031": "Azerbaijan", "044": "Bahamas", "050": "Bangladesh", "112": "Belarus",
      "056": "Belgium", "084": "Belize", "204": "Benin", "064": "Bhutan", "068": "Bolivia",
      "070": "Bosnia and Herzegovina", "072": "Botswana", "076": "Brazil",
      "096": "Brunei", "100": "Bulgaria", "854": "Burkina Faso", "108": "Burundi",
      "116": "Cambodia", "120": "Cameroon", "124": "Canada",
      "140": "Central African Republic", "148": "Chad", "152": "Chile", "156": "China",
      "170": "Colombia", "178": "Republic of the Congo",
      "180": "Democratic Republic of the Congo", "188": "Costa Rica",
      "384": "Ivory Coast", "191": "Croatia", "192": "Cuba", "196": "Cyprus",
      "203": "Czech Republic", "208": "Denmark", "262": "Djibouti",
      "214": "Dominican Republic", "218": "Ecuador", "818": "Egypt",
      "222": "El Salvador", "226": "Equatorial Guinea", "232": "Eritrea",
      "233": "Estonia", "231": "Ethiopia", "238": "Falkland Islands", "242": "Fiji",
      "246": "Finland", "250": "France", "266": "Gabon", "270": "Gambia",
      "268": "Georgia", "276": "Germany", "288": "Ghana", "300": "Greece",
      "304": "Greenland", "320": "Guatemala", "324": "Guinea", "624": "Guinea-Bissau",
      "328": "Guyana", "332": "Haiti", "340": "Honduras", "348": "Hungary",
      "352": "Iceland", "356": "India", "360": "Indonesia", "364": "Iran", "368": "Iraq",
      "372": "Ireland", "376": "Israel", "380": "Italy", "388": "Jamaica", "392": "Japan",
      "400": "Jordan", "398": "Kazakhstan", "404": "Kenya", "408": "North Korea",
      "410": "South Korea", "414": "Kuwait", "417": "Kyrgyzstan", "418": "Laos",
      "428": "Latvia", "422": "Lebanon", "426": "Lesotho", "430": "Liberia",
      "434": "Libya", "440": "Lithuania", "442": "Luxembourg", "807": "North Macedonia",
      "450": "Madagascar", "454": "Malawi", "458": "Malaysia", "466": "Mali",
      "478": "Mauritania", "484": "Mexico", "496": "Mongolia", "499": "Montenegro",
      "504": "Morocco", "508": "Mozambique", "104": "Myanmar", "516": "Namibia",
      "524": "Nepal", "528": "Netherlands", "554": "New Zealand", "558": "Nicaragua",
      "562": "Niger", "566": "Nigeria", "578": "Norway", "512": "Oman", "586": "Pakistan",
      "275": "Palestine", "591": "Panama", "598": "Papua New Guinea", "600": "Paraguay",
      "604": "Peru", "608": "Philippines", "616": "Poland", "620": "Portugal",
      "634": "Qatar", "642": "Romania", "643": "Russia", "646": "Rwanda",
      "682": "Saudi Arabia", "686": "Senegal", "688": "Serbia", "694": "Sierra Leone",
      "703": "Slovakia", "705": "Slovenia", "706": "Somalia", "710": "South Africa",
      "728": "South Sudan", "724": "Spain", "144": "Sri Lanka", "729": "Sudan",
      "740": "Suriname", "748": "Eswatini", "752": "Sweden", "756": "Switzerland",
      "760": "Syria", "158": "Taiwan", "762": "Tajikistan", "834": "Tanzania",
      "764": "Thailand", "768": "Togo", "780": "Trinidad and Tobago", "788": "Tunisia",
      "792": "Turkey", "795": "Turkmenistan", "800": "Uganda", "804": "Ukraine",
      "784": "United Arab Emirates", "826": "United Kingdom",
      "840": "United States of America", "858": "Uruguay", "860": "Uzbekistan",
      "862": "Venezuela", "704": "Vietnam", "887": "Yemen", "894": "Zambia",
      "716": "Zimbabwe", "-99": "N. Cyprus", "010": "Antarctica",
      "570": "Niue", "574": "Norfolk Island", "585": "Palau",
      "090": "Solomon Islands", "548": "Vanuatu", "882": "Samoa",
      "162": "Christmas Island",
    };
  }

  function getCountryEntryById(id) {
    return state.countryNames.find((c) => String(c.id) === String(id)) || null;
  }

  function resolveOrCreateCountryEntry(rawKey) {
    const key = String(rawKey || "").trim();
    if (!key) return null;

    // 1. Exact ID match (including legacy numeric ISO IDs like "392" or "004")
    const byId = state.countryNames.find((c) => String(c.id) === key);
    if (byId) return byId;

    // Zero-padded 3-digit numeric ISO check (e.g. "4" -> "004")
    if (/^\d{1,3}$/.test(key)) {
      const padded = key.padStart(3, "0");
      const byPadded = state.countryNames.find((c) => String(c.id) === padded);
      if (byPadded) return byPadded;
    }

    // 2. Exact name match (case-insensitive)
    const lower = key.toLowerCase();
    const byName = state.countryNames.find((c) => c.name.toLowerCase() === lower);
    if (byName) return byName;

    // 3. Common alias match
    const aliasTarget = COUNTRY_ALIASES[lower];
    if (aliasTarget) {
      const byAlias = state.countryNames.find(
        (c) => c.name.toLowerCase() === aliasTarget.toLowerCase()
      );
      if (byAlias) return byAlias;
    }

    // 4. Preserve custom offline country/region name so user data is never lost
    const customEntry = {
      id: `custom:${key}`,
      name: key,
      feature: null,
      hasGeometry: false,
    };
    state.countryNames.push(customEntry);
    state.countryNames.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    return customEntry;
  }

  /* ── Summarize Country JSON for Badges & Tooltips ─────── */
  function summarizeCountryData(data) {
    if (!hasNonEmptyData(data)) return "";

    // Check for checklist arrays (e.g. dishes: [{ name, tried }])
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) && val.length > 0 && val.every((item) => isPlainObject(item))) {
        const boolKey = detectChecklistBoolKey(val);
        if (boolKey) {
          const trueCount = val.filter((item) => Boolean(item[boolKey])).length;
          return `${trueCount}/${val.length} ${boolKey}`;
        }
        return `${val.length} ${key}`;
      }
      if (isBooleanMapObject(val)) {
        const entries = Object.values(val);
        const trueCount = entries.filter(Boolean).length;
        return `${trueCount}/${entries.length} ${key}`;
      }
    }

    // Top-level boolean map (e.g. { "Ramen": true, "Sushi": false })
    if (isBooleanMapObject(data)) {
      const entries = Object.values(data);
      const trueCount = entries.filter(Boolean).length;
      return `${trueCount}/${entries.length} checked`;
    }

    const keys = Object.keys(data);
    return keys.length === 1 ? `1 field (${keys[0]})` : `${keys.length} fields`;
  }

  /* ── Render Map ───────────────────────────────────────── */
  function renderMap(countries) {
    const svg = d3.select("#map-svg");
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("id", "map-g");

    const graticule = d3.geoGraticule();
    g.append("path")
      .datum(graticule())
      .attr("class", "graticule")
      .attr("d", state.path);

    g.selectAll(".country")
      .data(countries.features)
      .enter()
      .append("path")
      .attr("class", "country clickable-country")
      .attr("d", state.path)
      .attr("data-id", (d) => d.id)
      .attr("data-name", (d) => {
        const entry = getCountryEntryById(d.id);
        return entry ? entry.name : "";
      })
      .on("mouseenter", onCountryHover)
      .on("mousemove", onCountryMove)
      .on("mouseleave", onCountryLeave)
      .on("click", onCountryClick)
      .on("contextmenu", onCountryContextMenu);

    refreshMapCountryStyles();

    const zoom = d3.zoom()
      .scaleExtent([1, 20])
      .on("zoom", (event) => {
        state.transform = event.transform;
        g.attr("transform", event.transform);
        redrawCanvas();
        repositionDots();
      });

    svg.call(zoom);
    state._zoom = zoom;
    state._svg = svg;
    state.transform = d3.zoomIdentity;
  }

  function refreshMapCountryStyles() {
    mapSvg.querySelectorAll(".country").forEach((el) => {
      const id = el.dataset.id;
      const hex = state.countryFills[id];
      const hasData = hasNonEmptyData(state.countryData[id]);

      if (hex) {
        el.style.fill = hex;
        el.style.fillOpacity = state.fillOpacity;
      } else {
        el.style.fill = "";
        el.style.fillOpacity = "";
      }
      el.classList.toggle("has-data", hasData);
    });

    updateCountryDataIndicators();
  }

  function updateCountryDataIndicators() {
    const entriesWithData = Object.keys(state.countryData)
      .filter((id) => hasNonEmptyData(state.countryData[id]))
      .map((id) => {
        const entry = getCountryEntryById(id);
        return {
          id,
          name: entry ? entry.name : id,
          summary: summarizeCountryData(state.countryData[id]),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

    const count = entriesWithData.length;
    const badge = $("#data-count-badge");
    badge.textContent = String(count);
    badge.classList.toggle("hidden", count === 0);

    $("#panel-data-count").textContent = String(count);

    const listEl = $("#panel-country-data-list");
    if (count === 0) {
      listEl.innerHTML = `<p class="panel-data-empty">No country JSONs yet. Click a country with <strong>Country JSON Data</strong> or right-click any country.</p>`;
      return;
    }

    listEl.innerHTML = "";
    entriesWithData.forEach((item) => {
      const row = document.createElement("div");
      row.className = "panel-data-item";
      const nameSpan = document.createElement("span");
      nameSpan.className = "panel-data-item-name";
      nameSpan.textContent = item.name;

      const metaSpan = document.createElement("span");
      metaSpan.className = "panel-data-item-meta";
      metaSpan.textContent = item.summary;

      row.appendChild(nameSpan);
      row.appendChild(metaSpan);
      row.addEventListener("click", () => {
        zoomToCountry(item.id, false);
        openCountryModal(item.id);
      });
      listEl.appendChild(row);
    });
  }

  /* ── Country Interactions ─────────────────────────────── */
  function onCountryHover(event, d) {
    const tooltip = $("#country-tooltip");
    const entry = getCountryEntryById(d.id);
    const name = entry ? entry.name : `Region ${d.id}`;
    const summary = summarizeCountryData(state.countryData[d.id]);

    tooltip.innerHTML = "";
    const titleSpan = document.createElement("span");
    titleSpan.className = "tooltip-title";
    titleSpan.textContent = name;
    tooltip.appendChild(titleSpan);

    if (summary) {
      const metaSpan = document.createElement("span");
      metaSpan.className = "tooltip-meta";
      metaSpan.textContent = summary;
      tooltip.appendChild(metaSpan);
    }

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

  function onCountryContextMenu(event, d) {
    event.preventDefault();
    openCountryModal(d.id);
  }

  function onCountryClick(event, d) {
    if (event.defaultPrevented) return;

    // In View mode, clicking any country opens its Country JSON modal
    if (state.mode === "view") {
      openCountryModal(d.id);
      return;
    }

    // In Edit mode, route according to selected tool
    if (state.tool === "dot") {
      onMapClickForDot(event);
      return;
    }

    if (state.tool === "country-data") {
      openCountryModal(d.id);
      return;
    }

    if (state.tool !== "country-fill") return;

    const id = d.id;
    const el = event.currentTarget;

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

  /* ── Canvas Sizing & Freehand Drawing ─────────────────── */
  function resizeCanvas() {
    const rect = mapContainer.getBoundingClientRect();
    paintCanvas.width = rect.width * window.devicePixelRatio;
    paintCanvas.height = rect.height * window.devicePixelRatio;
    paintCanvas.style.width = rect.width + "px";
    paintCanvas.style.height = rect.height + "px";
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    redrawCanvas();
  }

  function setupCanvasEvents() {
    let isDrawing = false;

    paintCanvas.addEventListener("pointerdown", (e) => {
      if (state.mode !== "edit") return;
      if (state.tool !== "freehand" && state.tool !== "eraser") return;

      isDrawing = true;
      paintCanvas.setPointerCapture(e.pointerId);
      const pt = screenToMapCoords(e.clientX, e.clientY);

      if (state.tool === "freehand") {
        state.currentStroke = {
          points: [pt],
          color: state.color,
          size: state.brushSize,
        };
        state.undoneStrokes = [];
      } else {
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
    const rect = mapContainer.getBoundingClientRect();
    const x = sx - rect.left;
    const y = sy - rect.top;
    const t = state.transform || d3.zoomIdentity;
    return {
      x: Math.round(((x - t.x) / t.k) * 100) / 100,
      y: Math.round(((y - t.y) / t.k) * 100) / 100,
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
      if (!Array.isArray(stroke.points) || stroke.points.length < 2) continue;

      ctx.save();
      if (stroke.color === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = stroke.color;
      }

      const strokeSize = stroke.size || stroke.brushSize || 10;
      ctx.lineWidth = strokeSize * t.k;
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

  /* ── Pins / Dots ──────────────────────────────────────── */
  function onMapClickForDot(event) {
    if (state.mode !== "edit" || state.tool !== "dot") return;
    if (event.target.closest(".map-dot")) return;

    const rect = mapContainer.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;

    const t = state.transform || d3.zoomIdentity;
    const baseX = (sx - t.x) / t.k;
    const baseY = (sy - t.y) / t.k;
    const geo = state.projection.invert([baseX, baseY]);
    if (!geo) return;

    const dot = {
      id: "pin-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      geoCoords: [
        Math.round(geo[0] * 10000) / 10000,
        Math.round(geo[1] * 10000) / 10000,
      ],
      title: "",
      text: "",
      color: state.color,
    };

    state.dots.push(dot);
    renderDot(dot);
    showToast("Pin placed — click it to add notes");
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
    if (!projected) {
      el.style.display = "none";
      return;
    }
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

  /* ── Pin Popup ────────────────────────────────────────── */
  let activeDot = null;

  function openDotPopup(dot, dotEl) {
    activeDot = dot;
    const popup = $("#dot-popup");
    popup.classList.remove("hidden");

    const dotRect = dotEl.getBoundingClientRect();
    let left = dotRect.right + 12;
    let top = dotRect.top - 20;
    if (left + 330 > window.innerWidth) left = dotRect.left - 332;
    if (top + 250 > window.innerHeight) top = window.innerHeight - 260;
    if (top < 60) top = 60;
    popup.style.left = left + "px";
    popup.style.top = top + "px";

    if (state.mode === "edit") {
      $("#dot-popup-view").classList.add("hidden");
      $("#dot-popup-edit").classList.remove("hidden");
      $("#dot-title-input").value = dot.title;
      $("#dot-text-input").value = dot.text;
    } else {
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
    showToast("Pin notes saved");
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
    showToast("Pin removed");
  }

  /* ── Mode & Tool Switching ────────────────────────────── */
  function setMode(mode) {
    state.mode = mode;
    $$(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    const toggle = $(".mode-toggle");
    toggle.classList.toggle("edit-active", mode === "edit");
    editPanel.classList.toggle("hidden", mode !== "edit");
    mapContainer.classList.toggle("panel-open", mode === "edit");

    updateCanvasInteractivity();
    updateZoomState();
    closeDotPopup();

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

    const svgEl = document.getElementById("map-svg");
    svgEl.style.cursor = tool === "dot" ? "crosshair" : "";

    $("#brush-section").style.display =
      tool === "freehand" || tool === "eraser" ? "" : "none";
    $("#opacity-section").style.display = tool === "country-fill" ? "" : "none";
    $("#color-section").style.display =
      tool === "country-data" || tool === "eraser" ? "none" : "";

    const hintEl = $("#tool-hint");
    if (hintEl && TOOL_HINTS[tool]) {
      hintEl.textContent = TOOL_HINTS[tool];
    }
  }

  function updateCanvasInteractivity() {
    const active =
      state.mode === "edit" && (state.tool === "freehand" || state.tool === "eraser");
    paintCanvas.classList.toggle("active", active);
    paintCanvas.classList.toggle("erasing", state.mode === "edit" && state.tool === "eraser");
  }

  function updateZoomState() {
    if (!state._svg || !state._zoom) return;
    if (state.mode === "edit" && (state.tool === "freehand" || state.tool === "eraser")) {
      state._svg.on(".zoom", null);
    } else {
      state._svg.call(state._zoom);
    }
  }

  /* ── Color Palette ────────────────────────────────────── */
  function buildPalette() {
    const container = $("#color-palette");
    container.innerHTML = "";
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

    // Build mini swatches inside Country JSON Modal
    const modalSwatches = $("#country-modal-swatches");
    modalSwatches.innerHTML = "";
    COLORS.forEach((c) => {
      const mini = document.createElement("button");
      mini.type = "button";
      mini.className = "mini-swatch";
      mini.style.background = c.hex;
      mini.title = c.name;
      mini.dataset.color = c.hex;
      mini.addEventListener("click", () => {
        modalState.workingColor =
          modalState.workingColor === c.hex ? null : c.hex;
        syncModalColorSwatches();
      });
      modalSwatches.appendChild(mini);
    });
  }

  function syncModalColorSwatches() {
    const activeHex = (modalState.workingColor || "").toLowerCase();
    $$("#country-modal-swatches .mini-swatch").forEach((el) => {
      el.classList.toggle("active", el.dataset.color.toLowerCase() === activeHex);
    });
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
        .slice(0, 12);

      if (matches.length === 0) {
        results.classList.remove("open");
        return;
      }

      results.innerHTML = "";
      matches.forEach((c) => {
        const item = document.createElement("div");
        item.className = "search-result-item";

        const nameSpan = document.createElement("span");
        nameSpan.className = "search-result-name";
        nameSpan.textContent = c.name;

        const jsonBtn = document.createElement("button");
        jsonBtn.type = "button";
        const hasData = hasNonEmptyData(state.countryData[c.id]);
        jsonBtn.className = "search-result-json-btn" + (hasData ? " has-data" : "");
        jsonBtn.textContent = hasData ? "{…}" : "{ }";
        jsonBtn.title = `Edit JSON data for ${c.name}`;

        jsonBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          results.classList.remove("open");
          zoomToCountry(c.id, false);
          openCountryModal(c.id);
        });

        item.addEventListener("click", () => {
          zoomToCountry(c.id, true);
          results.classList.remove("open");
          input.value = c.name;
          if (state.tool === "country-data") {
            openCountryModal(c.id);
          }
        });

        item.appendChild(nameSpan);
        item.appendChild(jsonBtn);
        results.appendChild(item);
      });

      results.classList.add("open");
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrapper")) {
        results.classList.remove("open");
      }
    });
  }

  function zoomToCountry(id, warnIfNoGeometry = true) {
    const entry = getCountryEntryById(id);
    if (!entry || !entry.feature) {
      if (warnIfNoGeometry && entry) {
        showToast(`${entry.name} has no polygon at 110m scale — opening JSON data`);
        openCountryModal(id);
      }
      return;
    }

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

    state._svg.transition().duration(750).call(state._zoom.transform, t);

    const el = mapSvg.querySelector(`.country[data-id="${CSS.escape(String(id))}"]`);
    if (el) {
      el.classList.add("highlighted");
      setTimeout(() => el.classList.remove("highlighted"), 4500);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Country JSON Modal (Interactive Checklist + Raw JSON)
     ═══════════════════════════════════════════════════════════ */

  function detectChecklistLabelKey(items) {
    const preferred = ["name", "dish", "title", "item", "label"];
    for (const k of preferred) {
      if (items.some((it) => typeof it[k] === "string")) return k;
    }
    for (const it of items) {
      for (const [k, v] of Object.entries(it)) {
        if (typeof v === "string") return k;
      }
    }
    return "name";
  }

  function detectChecklistBoolKey(items) {
    const preferred = ["tried", "visited", "done", "checked", "completed"];
    for (const k of preferred) {
      if (items.some((it) => typeof it[k] === "boolean")) return k;
    }
    for (const it of items) {
      for (const [k, v] of Object.entries(it)) {
        if (typeof v === "boolean") return k;
      }
    }
    return null;
  }

  function isChecklistArray(val) {
    if (!Array.isArray(val) || val.length === 0) return false;
    if (!val.every((item) => isPlainObject(item))) return false;
    return Boolean(detectChecklistBoolKey(val));
  }

  function isBooleanMapObject(val) {
    if (!isPlainObject(val)) return false;
    const keys = Object.keys(val);
    if (keys.length === 0) return false;
    return keys.every((k) => typeof val[k] === "boolean");
  }

  function isPrimitiveArray(val) {
    if (!Array.isArray(val)) return false;
    return val.every(
      (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    );
  }

  function openCountryModal(countryId) {
    const entry = getCountryEntryById(countryId);
    if (!entry) return;

    closeDotPopup();
    closeDataOverviewModal();

    modalState.isOpen = true;
    modalState.countryId = String(entry.id);
    modalState.countryName = entry.name;
    modalState.workingData = deepClone(state.countryData[entry.id] || {});
    modalState.workingColor = state.countryFills[entry.id] || null;
    modalState.activeTab = "interactive";

    $("#country-modal-name").textContent = entry.name;
    $("#country-modal-subtitle").textContent = `countries[${JSON.stringify(entry.name)}].data`;
    $("#country-modal-zoom").style.display = entry.feature ? "" : "none";

    syncModalColorSwatches();
    switchEditorTab("interactive", true);

    $("#country-modal").classList.remove("hidden");
    $("#country-modal-backdrop").classList.remove("hidden");
  }

  function closeCountryModal() {
    modalState.isOpen = false;
    $("#country-modal").classList.add("hidden");
    $("#country-modal-backdrop").classList.add("hidden");
  }

  function parseRawJsonTextarea() {
    const raw = $("#country-json-textarea").value.trim();
    if (!raw) {
      return { ok: true, value: {} };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) {
        return {
          ok: false,
          error: "Top-level value must be a JSON object { ... }",
        };
      }
      return { ok: true, value: parsed };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function updateRawJsonValidationUI() {
    const statusEl = $("#json-validation-status");
    const result = parseRawJsonTextarea();
    if (result.ok) {
      statusEl.textContent = "✓ Valid JSON object";
      statusEl.className = "json-status valid";
    } else {
      statusEl.textContent = `✗ ${result.error}`;
      statusEl.className = "json-status invalid";
    }
    return result;
  }

  function switchEditorTab(targetTab, skipSyncFromRaw = false) {
    if (modalState.activeTab === "raw" && targetTab === "interactive" && !skipSyncFromRaw) {
      const parsed = updateRawJsonValidationUI();
      if (!parsed.ok) {
        showToast("Please fix the JSON syntax error before switching to Interactive View");
        $("#country-json-textarea").focus();
        return;
      }
      modalState.workingData = parsed.value;
    }

    modalState.activeTab = targetTab;
    $("#tab-btn-interactive").classList.toggle("active", targetTab === "interactive");
    $("#tab-btn-raw").classList.toggle("active", targetTab === "raw");
    $("#country-editor-interactive").classList.toggle("hidden", targetTab !== "interactive");
    $("#country-editor-raw").classList.toggle("hidden", targetTab !== "raw");

    if (targetTab === "interactive") {
      renderInteractiveEditor();
    } else {
      $("#country-json-textarea").value = JSON.stringify(modalState.workingData, null, 2);
      updateRawJsonValidationUI();
    }
  }

  function renderInteractiveEditor(focusSelector = null) {
    const container = $("#interactive-fields-container");
    container.innerHTML = "";

    const keys = Object.keys(modalState.workingData);
    if (keys.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "interactive-empty";
      emptyDiv.innerHTML = `No JSON data stored for <strong></strong> yet.<br/>Use <strong>+ Dish Checklist</strong> below, add a custom field, or switch to <strong>Raw JSON</strong>.`;
      emptyDiv.querySelector("strong").textContent = modalState.countryName;
      container.appendChild(emptyDiv);
      return;
    }

    keys.forEach((key) => {
      const val = modalState.workingData[key];
      const card = document.createElement("div");
      card.className = "field-card";

      const header = document.createElement("div");
      header.className = "field-card-header";

      const keyBadge = document.createElement("span");
      keyBadge.className = "field-key-badge";
      keyBadge.textContent = key;

      const headerRight = document.createElement("div");
      headerRight.className = "field-header-right";

      const deleteFieldBtn = document.createElement("button");
      deleteFieldBtn.type = "button";
      deleteFieldBtn.className = "row-remove-btn";
      deleteFieldBtn.title = `Delete field "${key}"`;
      deleteFieldBtn.innerHTML = "&times;";
      deleteFieldBtn.addEventListener("click", () => {
        delete modalState.workingData[key];
        renderInteractiveEditor();
      });

      header.appendChild(keyBadge);

      // 1. Checklist Array (e.g., dishes: [{ name: "Ramen", tried: true }])
      if (isChecklistArray(val)) {
        const labelKey = detectChecklistLabelKey(val);
        const boolKey = detectChecklistBoolKey(val) || "tried";
        const trueCount = val.filter((it) => Boolean(it[boolKey])).length;

        const progress = document.createElement("span");
        progress.className = "field-progress-pill";
        progress.textContent = `${trueCount} / ${val.length} ${boolKey}`;
        headerRight.appendChild(progress);
        headerRight.appendChild(deleteFieldBtn);
        header.appendChild(headerRight);
        card.appendChild(header);

        const listWrap = document.createElement("div");
        listWrap.className = "checklist-items";

        val.forEach((item, idx) => {
          const row = document.createElement("div");
          row.className = "checklist-row";

          const isChecked = Boolean(item[boolKey]);
          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.className = "tried-toggle-btn" + (isChecked ? " is-true" : "");
          toggleBtn.textContent = isChecked ? `✓ ${boolKey}` : `○ not ${boolKey}`;
          toggleBtn.addEventListener("click", () => {
            item[boolKey] = !item[boolKey];
            renderInteractiveEditor();
          });

          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.className = "checklist-name-input";
          nameInput.dataset.focusId = `chk-${key}-${idx}`;
          nameInput.placeholder = `Enter ${labelKey}…`;
          nameInput.value = item[labelKey] !== undefined ? String(item[labelKey]) : "";
          nameInput.addEventListener("input", () => {
            item[labelKey] = nameInput.value;
          });
          nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              val.splice(idx + 1, 0, { [labelKey]: "", [boolKey]: false });
              renderInteractiveEditor(`[data-focus-id="chk-${CSS.escape(key)}-${idx + 1}"]`);
            }
          });

          row.appendChild(toggleBtn);
          row.appendChild(nameInput);

          // Indicate if extra properties exist on this object
          const extraKeys = Object.keys(item).filter((k) => k !== labelKey && k !== boolKey);
          if (extraKeys.length > 0) {
            const extraBadge = document.createElement("span");
            extraBadge.className = "extra-props-badge";
            extraBadge.textContent = `+${extraKeys.length}`;
            extraBadge.title = `Extra fields preserved: ${extraKeys.join(", ")}`;
            row.appendChild(extraBadge);
          }

          const rmBtn = document.createElement("button");
          rmBtn.type = "button";
          rmBtn.className = "row-remove-btn";
          rmBtn.title = "Remove item";
          rmBtn.innerHTML = "&times;";
          rmBtn.addEventListener("click", () => {
            val.splice(idx, 1);
            renderInteractiveEditor();
          });

          row.appendChild(rmBtn);
          listWrap.appendChild(row);
        });

        card.appendChild(listWrap);

        const addItemBtn = document.createElement("button");
        addItemBtn.type = "button";
        addItemBtn.className = "mini-btn";
        addItemBtn.style.alignSelf = "flex-start";
        addItemBtn.textContent = `+ Add ${key === "dishes" ? "dish" : "item"}`;
        addItemBtn.addEventListener("click", () => {
          val.push({ [labelKey]: "", [boolKey]: false });
          renderInteractiveEditor(
            `[data-focus-id="chk-${CSS.escape(key)}-${val.length - 1}"]`
          );
        });
        card.appendChild(addItemBtn);
      }
      // 2. Boolean Map Object (e.g., { "Sushi": true, "Ramen": false })
      else if (isBooleanMapObject(val)) {
        const entries = Object.entries(val);
        const trueCount = entries.filter(([, b]) => b).length;

        const progress = document.createElement("span");
        progress.className = "field-progress-pill";
        progress.textContent = `${trueCount} / ${entries.length} true`;
        headerRight.appendChild(progress);
        headerRight.appendChild(deleteFieldBtn);
        header.appendChild(headerRight);
        card.appendChild(header);

        const listWrap = document.createElement("div");
        listWrap.className = "checklist-items";

        entries.forEach(([subKey, boolVal], idx) => {
          const row = document.createElement("div");
          row.className = "checklist-row";

          const toggleBtn = document.createElement("button");
          toggleBtn.type = "button";
          toggleBtn.className = "tried-toggle-btn" + (boolVal ? " is-true" : "");
          toggleBtn.textContent = boolVal ? "✓ true" : "○ false";
          toggleBtn.addEventListener("click", () => {
            val[subKey] = !val[subKey];
            renderInteractiveEditor();
          });

          const keyInput = document.createElement("input");
          keyInput.type = "text";
          keyInput.className = "checklist-name-input";
          keyInput.dataset.focusId = `bmap-${key}-${idx}`;
          keyInput.value = subKey;
          keyInput.placeholder = "Item name…";
          keyInput.addEventListener("change", () => {
            const nextKey = keyInput.value.trim();
            if (!nextKey || nextKey === subKey) {
              keyInput.value = subKey;
              return;
            }
            const rebuilt = {};
            for (const [ek, ev] of Object.entries(val)) {
              rebuilt[ek === subKey ? nextKey : ek] = ev;
            }
            modalState.workingData[key] = rebuilt;
            renderInteractiveEditor();
          });

          const rmBtn = document.createElement("button");
          rmBtn.type = "button";
          rmBtn.className = "row-remove-btn";
          rmBtn.innerHTML = "&times;";
          rmBtn.addEventListener("click", () => {
            delete val[subKey];
            renderInteractiveEditor();
          });

          row.appendChild(toggleBtn);
          row.appendChild(keyInput);
          row.appendChild(rmBtn);
          listWrap.appendChild(row);
        });

        card.appendChild(listWrap);

        const addEntryBtn = document.createElement("button");
        addEntryBtn.type = "button";
        addEntryBtn.className = "mini-btn";
        addEntryBtn.style.alignSelf = "flex-start";
        addEntryBtn.textContent = "+ Add boolean entry";
        addEntryBtn.addEventListener("click", () => {
          let newItemName = "New Item";
          let n = 2;
          while (Object.prototype.hasOwnProperty.call(val, newItemName)) {
            newItemName = `New Item ${n++}`;
          }
          val[newItemName] = false;
          const idx = Object.keys(val).length - 1;
          renderInteractiveEditor(`[data-focus-id="bmap-${CSS.escape(key)}-${idx}"]`);
        });
        card.appendChild(addEntryBtn);
      }
      // 3. Primitive Boolean
      else if (typeof val === "boolean") {
        headerRight.appendChild(deleteFieldBtn);
        header.appendChild(headerRight);
        card.appendChild(header);

        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "tried-toggle-btn" + (val ? " is-true" : "");
        toggleBtn.style.alignSelf = "flex-start";
        toggleBtn.textContent = val ? "✓ true" : "○ false";
        toggleBtn.addEventListener("click", () => {
          modalState.workingData[key] = !modalState.workingData[key];
          renderInteractiveEditor();
        });
        card.appendChild(toggleBtn);
      }
      // 4. Primitive Number or String
      else if (typeof val === "string" || typeof val === "number") {
        headerRight.appendChild(deleteFieldBtn);
        header.appendChild(headerRight);
        card.appendChild(header);

        const input = document.createElement("input");
        input.type = typeof val === "number" ? "number" : "text";
        if (typeof val === "number") input.step = "any";
        input.className = "field-text-input";
        input.dataset.focusId = `prim-${key}`;
        input.value = String(val);
        input.placeholder = typeof val === "number" ? "0" : "Enter text…";
        input.addEventListener("input", () => {
          if (typeof val === "number") {
            const parsedNum = Number(input.value);
            modalState.workingData[key] = Number.isNaN(parsedNum) ? 0 : parsedNum;
          } else {
            modalState.workingData[key] = input.value;
          }
        });
        card.appendChild(input);
      }
      // 5. Primitive / Empty Array
      else if (isPrimitiveArray(val)) {
        headerRight.appendChild(deleteFieldBtn);
        header.appendChild(headerRight);
        card.appendChild(header);

        const listWrap = document.createElement("div");
        listWrap.className = "checklist-items";

        val.forEach((itemVal, idx) => {
          const row = document.createElement("div");
          row.className = "checklist-row";

          const input = document.createElement("input");
          input.type = "text";
          input.className = "checklist-name-input";
          input.dataset.focusId = `arr-${key}-${idx}`;
          input.value = String(itemVal);
          input.addEventListener("input", () => {
            val[idx] = input.value;
          });

          const rmBtn = document.createElement("button");
          rmBtn.type = "button";
          rmBtn.className = "row-remove-btn";
          rmBtn.innerHTML = "&times;";
          rmBtn.addEventListener("click", () => {
            val.splice(idx, 1);
            renderInteractiveEditor();
          });

          row.appendChild(input);
          row.appendChild(rmBtn);
          listWrap.appendChild(row);
        });

        card.appendChild(listWrap);

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "6px";

        const addStrBtn = document.createElement("button");
        addStrBtn.type = "button";
        addStrBtn.className = "mini-btn";
        addStrBtn.textContent = "+ Add text item";
        addStrBtn.addEventListener("click", () => {
          val.push("");
          renderInteractiveEditor(`[data-focus-id="arr-${CSS.escape(key)}-${val.length - 1}"]`);
        });
        btnRow.appendChild(addStrBtn);

        if (val.length === 0) {
          const addTriedBtn = document.createElement("button");
          addTriedBtn.type = "button";
          addTriedBtn.className = "mini-btn";
          addTriedBtn.textContent = "+ Add tried/not-tried item";
          addTriedBtn.addEventListener("click", () => {
            val.push({ name: "", tried: false });
            renderInteractiveEditor(`[data-focus-id="chk-${CSS.escape(key)}-0"]`);
          });
          btnRow.appendChild(addTriedBtn);
        }

        card.appendChild(btnRow);
      }
      // 6. Arbitrary Nested JSON Object / Mixed Array
      else {
        const editRawBtn = document.createElement("button");
        editRawBtn.type = "button";
        editRawBtn.className = "mini-btn";
        editRawBtn.textContent = "Edit in Raw JSON →";
        editRawBtn.addEventListener("click", () => switchEditorTab("raw"));

        headerRight.appendChild(editRawBtn);
        headerRight.appendChild(deleteFieldBtn);
        header.appendChild(headerRight);
        card.appendChild(header);

        const pre = document.createElement("pre");
        pre.className = "nested-json-preview";
        pre.textContent = JSON.stringify(val, null, 2);
        card.appendChild(pre);
      }

      container.appendChild(card);
    });

    if (focusSelector) {
      const target = container.querySelector(focusSelector);
      if (target) {
        target.focus();
        if (target.select && target.value.startsWith("New Item")) {
          target.select();
        }
      }
    }
  }

  function addFieldFromBar() {
    const keyInput = $("#new-field-key");
    const typeSelect = $("#new-field-type");
    const rawKey = keyInput.value.trim();
    if (!rawKey) {
      showToast("Enter a field name first (e.g. dishes, visited, notes)");
      keyInput.focus();
      return;
    }

    if (Object.prototype.hasOwnProperty.call(modalState.workingData, rawKey)) {
      showToast(`Field "${rawKey}" already exists`);
      return;
    }

    const type = typeSelect.value;
    let focusTarget = null;

    if (type === "checklist") {
      modalState.workingData[rawKey] = [{ name: "", tried: false }];
      focusTarget = `[data-focus-id="chk-${CSS.escape(rawKey)}-0"]`;
    } else if (type === "boolmap") {
      modalState.workingData[rawKey] = { "New Item": false };
      focusTarget = `[data-focus-id="bmap-${CSS.escape(rawKey)}-0"]`;
    } else if (type === "boolean") {
      modalState.workingData[rawKey] = false;
    } else if (type === "string") {
      modalState.workingData[rawKey] = "";
      focusTarget = `[data-focus-id="prim-${CSS.escape(rawKey)}"]`;
    } else if (type === "number") {
      modalState.workingData[rawKey] = 0;
      focusTarget = `[data-focus-id="prim-${CSS.escape(rawKey)}"]`;
    } else if (type === "list") {
      modalState.workingData[rawKey] = [""];
      focusTarget = `[data-focus-id="arr-${CSS.escape(rawKey)}-0"]`;
    } else if (type === "object") {
      modalState.workingData[rawKey] = {};
    }

    keyInput.value = "";
    renderInteractiveEditor(focusTarget);
  }

  function applyQuickTemplate(templateName) {
    if (templateName === "dishes") {
      const targetKey =
        modalState.workingData.dishes === undefined || Array.isArray(modalState.workingData.dishes)
          ? "dishes"
          : "dishList";
      if (!Array.isArray(modalState.workingData[targetKey])) {
        modalState.workingData[targetKey] = [];
      }
      modalState.workingData[targetKey].push({ name: "", tried: false });
      renderInteractiveEditor(
        `[data-focus-id="chk-${CSS.escape(targetKey)}-${modalState.workingData[targetKey].length - 1}"]`
      );
    } else if (templateName === "boolmap") {
      const targetKey = modalState.workingData.dishes ? "items" : "dishes";
      if (!isPlainObject(modalState.workingData[targetKey])) {
        modalState.workingData[targetKey] = {};
      }
      modalState.workingData[targetKey]["New Dish"] = false;
      const idx = Object.keys(modalState.workingData[targetKey]).length - 1;
      renderInteractiveEditor(`[data-focus-id="bmap-${CSS.escape(targetKey)}-${idx}"]`);
    } else if (templateName === "notes") {
      if (modalState.workingData.notes === undefined) {
        modalState.workingData.notes = "";
      }
      renderInteractiveEditor(`[data-focus-id="prim-notes"]`);
    }
  }

  async function saveCountryModal() {
    if (!modalState.isOpen || !modalState.countryId) return;

    if (modalState.activeTab === "raw") {
      const parsed = updateRawJsonValidationUI();
      if (!parsed.ok) {
        showToast("Fix the JSON syntax error before saving");
        $("#country-json-textarea").focus();
        return;
      }
      modalState.workingData = parsed.value;
    }

    const id = modalState.countryId;
    const countryName = modalState.countryName;

    // Clean empty trailing unnamed items ONLY if completely blank? Keep user data as entered
    const finalData = deepClone(modalState.workingData);

    if (modalState.workingColor) {
      state.countryFills[id] = modalState.workingColor;
    } else {
      delete state.countryFills[id];
    }

    if (hasNonEmptyData(finalData)) {
      state.countryData[id] = finalData;
    } else {
      delete state.countryData[id];
    }

    refreshMapCountryStyles();
    closeCountryModal();

    // If a map file from data/maps/ is currently loaded, persist immediately
    if (state.currentMapId) {
      try {
        if (state.loadedFormatVersion < 2) {
          // Upgrade legacy v1 map to v2 format in full so numeric countryFills are migrated
          const payload = serializeStateToMapDocument(state.currentMapName);
          const putRes = await fetch(`/api/maps/${encodeURIComponent(state.currentMapId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const putResult = await putRes.json();
          if (putRes.ok && putResult.success) {
            state.currentMapId = putResult.id;
            state.currentMapFile = putResult.fileName;
            state.loadedFormatVersion = 2;
            updateActiveMapBanner();
            showToast(`Saved ${countryName} & upgraded to data/maps/${putResult.fileName}`);
          } else {
            showToast(putResult.error || `Saved ${countryName} locally`);
          }
        } else {
          const res = await fetch(
            `/api/maps/${encodeURIComponent(state.currentMapId)}/countries/${encodeURIComponent(countryName)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                color: serializeColorValue(modalState.workingColor),
                data: finalData,
              }),
            }
          );
          const result = await res.json();
          if (res.ok && result.success && result.map) {
            applyLoadedMapObject(result.map);
            showToast(`Saved ${countryName} to data/maps/${result.fileName}`);
          } else {
            showToast(result.error || `Saved ${countryName} locally`);
          }
        }
      } catch (err) {
        console.error(err);
        showToast(`Saved ${countryName} in app (failed to reach server)`);
      }
    } else {
      showToast(`Saved ${countryName} JSON (press Ctrl+S to save map file)`);
    }
  }

  function clearCountryModalData() {
    const hasAnything =
      hasNonEmptyData(modalState.workingData) ||
      (modalState.activeTab === "raw" && $("#country-json-textarea").value.trim() !== "{}");

    if (hasAnything && !confirm(`Clear all JSON data for ${modalState.countryName}?`)) {
      return;
    }

    modalState.workingData = {};
    if (modalState.activeTab === "raw") {
      $("#country-json-textarea").value = "{}";
      updateRawJsonValidationUI();
    } else {
      renderInteractiveEditor();
    }
  }

  /* ── Country Data Overview Modal (Top Bar "{ }" Button) ─ */
  function openDataOverviewModal() {
    $("#data-overview-modal").classList.remove("hidden");
    $("#data-overview-backdrop").classList.remove("hidden");
    const searchInput = $("#data-overview-search");
    searchInput.value = "";
    renderDataOverviewList("");
    searchInput.focus();
  }

  function closeDataOverviewModal() {
    $("#data-overview-modal").classList.add("hidden");
    $("#data-overview-backdrop").classList.add("hidden");
  }

  function renderDataOverviewList(query) {
    const listEl = $("#data-overview-list");
    const q = String(query || "").trim().toLowerCase();

    let candidates;
    if (q.length > 0) {
      candidates = state.countryNames
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, 30);
    } else {
      candidates = state.countryNames.filter((c) => hasNonEmptyData(state.countryData[c.id]));
    }

    if (candidates.length === 0) {
      listEl.innerHTML = q
        ? `<p class="db-helper-note">No matching country found. Press Enter to add "${query.trim()}" as a custom entry.</p>`
        : `<p class="db-helper-note">No countries have JSON data yet. Type a country name above or click any country on the map!</p>`;
      return;
    }

    listEl.innerHTML = "";
    candidates.forEach((c) => {
      const item = document.createElement("div");
      item.className = "db-map-item";

      const info = document.createElement("div");
      info.className = "db-map-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "db-map-name";
      nameSpan.textContent = c.name;

      const metaSpan = document.createElement("span");
      metaSpan.className = "db-map-meta";
      const summary = summarizeCountryData(state.countryData[c.id]);
      metaSpan.textContent = summary || "No JSON data yet — click to add";

      info.appendChild(nameSpan);
      info.appendChild(metaSpan);
      item.appendChild(info);

      item.addEventListener("click", () => {
        closeDataOverviewModal();
        zoomToCountry(c.id, false);
        openCountryModal(c.id);
      });

      listEl.appendChild(item);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     v2 Serialization & Deserialization (with v1 Compatibility)
     ═══════════════════════════════════════════════════════════ */

  function serializeStateToMapDocument(mapName) {
    const colorPalette = {};
    COLORS.forEach((c) => {
      colorPalette[c.name] = c.hex;
    });
    Object.assign(colorPalette, state.customPalette || {});

    const allCountryIds = new Set([
      ...Object.keys(state.countryFills),
      ...Object.keys(state.countryData),
    ]);

    const countriesDict = {};
    const sortedEntries = Array.from(allCountryIds)
      .map((id) => {
        const entry = getCountryEntryById(id);
        return {
          id,
          name: entry ? entry.name : String(id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

    for (const { id, name } of sortedEntries) {
      const color = serializeColorValue(state.countryFills[id]);
      const data = hasNonEmptyData(state.countryData[id])
        ? deepClone(state.countryData[id])
        : {};

      if (color || hasNonEmptyData(data)) {
        countriesDict[name] = {
          color: color || null,
          data,
        };
      }
    }

    const pins = state.dots.map((d) => ({
      id: d.id,
      title: d.title || "",
      notes: d.text || "",
      color: serializeColorValue(d.color) || COLORS[0].name,
      coordinates: {
        latitude: Math.round(d.geoCoords[1] * 10000) / 10000,
        longitude: Math.round(d.geoCoords[0] * 10000) / 10000,
      },
    }));

    const freehandStrokes = state.strokes.map((s) => ({
      color: s.color === "eraser" ? "eraser" : serializeColorValue(s.color) || s.color,
      brushSize: s.size || s.brushSize || 10,
      points: (s.points || []).map((pt) => ({
        x: Math.round(pt.x * 100) / 100,
        y: Math.round(pt.y * 100) / 100,
      })),
    }));

    return {
      formatVersion: 2,
      name: mapName,
      settings: {
        fillOpacity: Math.round(state.fillOpacity * 100) / 100,
      },
      colorPalette,
      countries: countriesDict,
      pins,
      freehandStrokes,
    };
  }

  function applyLoadedMapObject(doc) {
    const filePalette = isPlainObject(doc.colorPalette) ? doc.colorPalette : {};
    state.customPalette = {};
    for (const [k, v] of Object.entries(filePalette)) {
      const builtIn = COLORS.find((c) => c.name.toLowerCase() === k.toLowerCase());
      if (!builtIn && typeof v === "string") {
        state.customPalette[k] = v;
      }
    }

    state.currentMapId = doc.id || state.currentMapId;
    state.currentMapName = doc.name || state.currentMapId || "Untitled Map";
    state.currentMapFile = doc.fileName || (state.currentMapId ? `${state.currentMapId}.json` : null);
    state.loadedFormatVersion = Number(doc.formatVersion || (doc.countries ? 2 : 1));

    const nextFills = {};
    const nextData = {};

    // 1. Legacy v1 countryFills support
    if (isPlainObject(doc.countryFills)) {
      for (const [rawKey, rawColor] of Object.entries(doc.countryFills)) {
        const entry = resolveOrCreateCountryEntry(rawKey);
        const hex = resolveColorHex(rawColor, filePalette);
        if (entry && hex) {
          nextFills[entry.id] = hex;
        }
      }
    }

    // 2. Human-editable v2 countries dictionary support (including shorthand/offline edits)
    if (isPlainObject(doc.countries)) {
      for (const [rawCountryKey, rawRecord] of Object.entries(doc.countries)) {
        const entry = resolveOrCreateCountryEntry(rawCountryKey);
        if (!entry || rawRecord === null || rawRecord === undefined) continue;

        if (typeof rawRecord === "string") {
          const hex = resolveColorHex(rawRecord, filePalette);
          if (hex) nextFills[entry.id] = hex;
        } else if (Array.isArray(rawRecord)) {
          if (rawRecord.length > 0) {
            nextData[entry.id] = { items: deepClone(rawRecord) };
          }
        } else if (isPlainObject(rawRecord)) {
          if (typeof rawRecord.color === "string" && rawRecord.color.trim()) {
            const hex = resolveColorHex(rawRecord.color, filePalette);
            if (hex) nextFills[entry.id] = hex;
          } else if (rawRecord.color === null) {
            delete nextFills[entry.id];
          }

          let extractedData = {};
          if (rawRecord.data !== undefined && rawRecord.data !== null) {
            if (isPlainObject(rawRecord.data)) {
              extractedData = deepClone(rawRecord.data);
            } else if (Array.isArray(rawRecord.data)) {
              extractedData = { items: deepClone(rawRecord.data) };
            } else {
              extractedData = { value: rawRecord.data };
            }
          }

          // Also pick up any extra keys written directly on the country object offline
          for (const [k, v] of Object.entries(rawRecord)) {
            if (k !== "color" && k !== "data") {
              extractedData[k] = deepClone(v);
            }
          }

          if (hasNonEmptyData(extractedData)) {
            nextData[entry.id] = extractedData;
          }
        }
      }
    }

    state.countryFills = nextFills;
    state.countryData = nextData;

    // Opacity
    const loadedOpacity =
      typeof doc.settings?.fillOpacity === "number"
        ? doc.settings.fillOpacity
        : typeof doc.fillOpacity === "number"
          ? doc.fillOpacity
          : 0.55;
    state.fillOpacity = Math.min(1, Math.max(0.1, loadedOpacity));

    // Pins / Dots
    const rawPins = Array.isArray(doc.pins)
      ? doc.pins
      : Array.isArray(doc.dots)
        ? doc.dots
        : [];

    state.dots = rawPins
      .map((p, idx) => {
        let lon = null;
        let lat = null;
        if (isPlainObject(p.coordinates)) {
          lat = Number(p.coordinates.latitude ?? p.coordinates.lat);
          lon = Number(p.coordinates.longitude ?? p.coordinates.lon ?? p.coordinates.lng);
        } else if (Array.isArray(p.geoCoords) && p.geoCoords.length >= 2) {
          lon = Number(p.geoCoords[0]);
          lat = Number(p.geoCoords[1]);
        }
        if (Number.isNaN(lon) || Number.isNaN(lat) || lon === null || lat === null) {
          return null;
        }
        return {
          id: p.id || `pin-${idx + 1}`,
          geoCoords: [lon, lat],
          title: p.title || "",
          text: p.notes !== undefined ? String(p.notes) : String(p.text || ""),
          color: resolveColorHex(p.color, filePalette) || COLORS[0].hex,
        };
      })
      .filter(Boolean);

    // Freehand Strokes
    const rawStrokes = Array.isArray(doc.freehandStrokes)
      ? doc.freehandStrokes
      : Array.isArray(doc.strokes)
        ? doc.strokes
        : [];

    state.strokes = rawStrokes.map((s) => ({
      color:
        s.color === "eraser"
          ? "eraser"
          : resolveColorHex(s.color, filePalette) || COLORS[0].hex,
      size: Number(s.brushSize ?? s.size ?? 10),
      points: Array.isArray(s.points) ? s.points : [],
    }));
    state.undoneStrokes = [];

    // Update UI & URL
    refreshMapCountryStyles();
    redrawCanvas();
    renderAllDots();
    $("#fill-opacity").value = Math.round(state.fillOpacity * 100);
    $("#fill-opacity-value").textContent = Math.round(state.fillOpacity * 100) + "%";
    updateActiveMapBanner();
  }

  function updateActiveMapBanner() {
    const pill = $("#active-map-pill");
    if (state.currentMapId) {
      pill.classList.remove("hidden");
      $("#active-map-label").textContent = state.currentMapName;
      $("#active-map-file").textContent = `data/maps/${state.currentMapFile || state.currentMapId + ".json"}`;
      const url = new URL(window.location.href);
      url.searchParams.set("map", state.currentMapId);
      window.history.replaceState(null, "", url.toString());
    } else {
      pill.classList.add("hidden");
      const url = new URL(window.location.href);
      url.searchParams.delete("map");
      window.history.replaceState(null, "", url.toString());
    }
  }

  /* ── Database Save / Load / Reload ────────────────────── */
  function updateSavePreview() {
    const typed = $("#save-map-name").value.trim();
    const slug = slugifyPreview(typed || state.currentMapName || "untitled-map");
    const fileLabel =
      state.currentMapId && (!typed || typed === state.currentMapName)
        ? state.currentMapFile || `${state.currentMapId}.json`
        : `${slug}.json`;
    $("#save-file-preview").textContent = `data/maps/${fileLabel}`;
  }

  function openSaveModal() {
    $("#save-modal").classList.remove("hidden");
    $("#save-modal-backdrop").classList.remove("hidden");
    $("#save-map-name").value =
      state.currentMapName === "Untitled Map" ? "" : state.currentMapName;
    $("#save-btn-copy").classList.toggle("hidden", !state.currentMapId);
    $("#save-btn-label").textContent = state.currentMapId ? "Save Changes" : "Save Map";
    updateSavePreview();
    $("#save-map-name").focus();
  }

  function closeSaveModal() {
    $("#save-modal").classList.add("hidden");
    $("#save-modal-backdrop").classList.add("hidden");
  }

  async function saveMapToDb(saveAsNewCopy = false) {
    const name = $("#save-map-name").value.trim() || "Untitled Map";
    const payload = serializeStateToMapDocument(name);

    try {
      showToast("Saving map file...");
      const isUpdate = Boolean(state.currentMapId) && !saveAsNewCopy;
      const method = isUpdate ? "PUT" : "POST";
      const url = isUpdate
        ? `/api/maps/${encodeURIComponent(state.currentMapId)}`
        : "/api/maps";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        state.currentMapId = result.id;
        state.currentMapName = result.name || name;
        state.currentMapFile = result.fileName || `${result.id}.json`;
        updateActiveMapBanner();
        closeSaveModal();
        showToast(`Saved to data/maps/${state.currentMapFile}`);
      } else {
        showToast(result.error || "Failed to save map.");
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
    container.innerHTML = `<p class="db-helper-note">Loading maps from data/maps/…</p>`;

    try {
      const res = await fetch("/api/maps");
      const maps = await res.json();

      if (!Array.isArray(maps) || maps.length === 0) {
        container.innerHTML = `<p class="db-helper-note" style="padding: 10px 0;">No map files found in <code>data/maps/</code> yet.</p>`;
        return;
      }

      container.innerHTML = "";
      maps.forEach((map) => {
        const item = document.createElement("div");
        item.className = "db-map-item" + (map.invalidJson ? " invalid" : "");

        const info = document.createElement("div");
        info.className = "db-map-info";

        const titleRow = document.createElement("div");
        titleRow.className = "db-map-title-row";

        const nameSpan = document.createElement("span");
        nameSpan.className = "db-map-name";
        nameSpan.textContent = map.name;

        const fileSpan = document.createElement("code");
        fileSpan.className = "db-map-file";
        fileSpan.textContent = `data/maps/${map.fileName || map.id + ".json"}`;

        titleRow.appendChild(nameSpan);
        titleRow.appendChild(fileSpan);
        info.appendChild(titleRow);

        if (map.invalidJson) {
          const errSpan = document.createElement("span");
          errSpan.className = "db-map-error";
          errSpan.textContent = `Invalid JSON from offline edit: ${map.parseError}`;
          info.appendChild(errSpan);
        } else {
          const metaSpan = document.createElement("span");
          metaSpan.className = "db-map-meta";
          const parts = [];
          if (map.countryCount) parts.push(`${map.countryCount} countries`);
          if (map.dataCountryCount) parts.push(`${map.dataCountryCount} with JSON`);
          if (map.pinCount) parts.push(`${map.pinCount} pins`);
          parts.push(`Updated ${new Date(map.lastModified).toLocaleString()}`);
          metaSpan.textContent = parts.join(" • ");
          info.appendChild(metaSpan);

          item.addEventListener("click", () => loadMapFromDb(map.id));
        }

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "db-delete-btn";
        delBtn.title = `Delete data/maps/${map.fileName || map.id + ".json"}`;
        delBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${map.name}" (data/maps/${map.fileName || map.id + ".json"})?`)) {
            return;
          }
          try {
            const delRes = await fetch(`/api/maps/${encodeURIComponent(map.id)}`, {
              method: "DELETE",
            });
            if (delRes.ok) {
              if (state.currentMapId === map.id) {
                state.currentMapId = null;
                state.currentMapFile = null;
                updateActiveMapBanner();
              }
              showToast(`Deleted ${map.name}`);
              openDbModal();
            } else {
              showToast("Failed to delete map");
            }
          } catch {
            showToast("Failed to delete map");
          }
        });

        item.appendChild(info);
        item.appendChild(delBtn);
        container.appendChild(item);
      });
    } catch (err) {
      container.innerHTML = `<p class="db-map-error">Failed to load maps from server.</p>`;
    }
  }

  function closeDbModal() {
    $("#db-modal").classList.add("hidden");
    $("#db-modal-backdrop").classList.add("hidden");
  }

  async function loadMapFromDb(id, silentToast = false) {
    try {
      if (!silentToast) showToast("Loading map from disk...");
      const res = await fetch(`/api/maps/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.details ? `${data.error}: ${data.details}` : data.error || "Failed to load map");
        return false;
      }

      applyLoadedMapObject(data);
      closeDbModal();
      if (!silentToast) {
        showToast(`Loaded ${data.name} (data/maps/${state.currentMapFile})`);
      }
      return true;
    } catch (err) {
      console.error(err);
      if (!silentToast) showToast("Failed to load map");
      return false;
    }
  }

  async function reloadCurrentMapFromDisk() {
    if (!state.currentMapId) return;
    const ok = await loadMapFromDb(state.currentMapId, true);
    if (ok) {
      showToast(`Reloaded latest changes from data/maps/${state.currentMapFile}`);
    }
  }

  function sanitizeName(name) {
    return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").replace(/^_|_$/g, "");
  }

  /* ── Render Map to Canvas & Export JPEG ───────────────── */
  function renderMapToCanvas() {
    return new Promise((resolve) => {
      const rect = mapContainer.getBoundingClientRect();
      const exportCanvas = document.createElement("canvas");
      const dpr = window.devicePixelRatio;
      exportCanvas.width = rect.width * dpr;
      exportCanvas.height = rect.height * dpr;
      const ectx = exportCanvas.getContext("2d");
      ectx.scale(dpr, dpr);

      ectx.fillStyle = "#12141d";
      ectx.fillRect(0, 0, rect.width, rect.height);

      const svgClone = mapSvg.cloneNode(true);
      svgClone.setAttribute("width", rect.width);
      svgClone.setAttribute("height", rect.height);
      svgClone.querySelectorAll(".country").forEach((c) => {
        const orig = mapSvg.querySelector(`[data-id="${CSS.escape(c.dataset.id)}"]`);
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

        ectx.drawImage(paintCanvas, 0, 0, rect.width, rect.height);

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
    } catch {
      showToast("Failed to export JPEG");
    }
  }

  function clearAll() {
    if (!confirm("Clear all paintings, country fills, country JSON data, and pins from the canvas?")) {
      return;
    }
    state.countryFills = {};
    state.countryData = {};
    state.customPalette = {};
    state.strokes = [];
    state.undoneStrokes = [];
    state.dots = [];
    state.currentMapId = null;
    state.currentMapName = "Untitled Map";
    state.currentMapFile = null;

    refreshMapCountryStyles();
    redrawCanvas();
    renderAllDots();
    updateActiveMapBanner();
    showToast("Canvas cleared");
  }

  /* ── Toast ────────────────────────────────────────────── */
  let toastTimeout;
  function showToast(msg) {
    const toast = $("#toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3200);
  }

  /* ── Wire Up Events ───────────────────────────────────── */
  function wireEvents() {
    $("#btn-view-mode").addEventListener("click", () => setMode("view"));
    $("#btn-edit-mode").addEventListener("click", () => setMode("edit"));

    $$(".tool-btn").forEach((btn) =>
      btn.addEventListener("click", () => setTool(btn.dataset.tool))
    );

    $("#brush-size").addEventListener("input", (e) => {
      state.brushSize = parseInt(e.target.value, 10);
      $("#brush-size-value").textContent = state.brushSize + "px";
    });

    $("#fill-opacity").addEventListener("input", (e) => {
      state.fillOpacity = parseInt(e.target.value, 10) / 100;
      $("#fill-opacity-value").textContent = e.target.value + "%";
      refreshMapCountryStyles();
    });

    $("#btn-undo").addEventListener("click", undo);
    $("#btn-redo").addEventListener("click", redo);

    // Top bar actions
    $("#btn-country-data-list").addEventListener("click", openDataOverviewModal);
    $("#btn-reload-disk").addEventListener("click", reloadCurrentMapFromDisk);
    $("#btn-save").addEventListener("click", openSaveModal);
    $("#btn-load").addEventListener("click", openDbModal);
    $("#btn-export").addEventListener("click", exportAsImage);
    $("#btn-clear-all").addEventListener("click", clearAll);

    // Save Modal
    $("#save-modal-close").addEventListener("click", closeSaveModal);
    $("#save-modal-backdrop").addEventListener("click", closeSaveModal);
    $("#save-map-name").addEventListener("input", updateSavePreview);
    $("#save-map-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveMapToDb(false);
    });
    $("#save-btn-save").addEventListener("click", () => saveMapToDb(false));
    $("#save-btn-copy").addEventListener("click", () => saveMapToDb(true));

    // Database Modal
    $("#db-modal-close").addEventListener("click", closeDbModal);
    $("#db-modal-backdrop").addEventListener("click", closeDbModal);

    // Country Data Directory Modal
    $("#data-overview-close").addEventListener("click", closeDataOverviewModal);
    $("#data-overview-backdrop").addEventListener("click", closeDataOverviewModal);
    $("#data-overview-search").addEventListener("input", (e) => {
      renderDataOverviewList(e.target.value);
    });
    $("#data-overview-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = e.target.value.trim();
        if (!val) return;
        const entry = resolveOrCreateCountryEntry(val);
        if (entry) {
          closeDataOverviewModal();
          zoomToCountry(entry.id, false);
          openCountryModal(entry.id);
        }
      }
    });

    // Country JSON Modal
    $("#country-modal-close").addEventListener("click", closeCountryModal);
    $("#country-modal-backdrop").addEventListener("click", closeCountryModal);
    $("#country-btn-cancel").addEventListener("click", closeCountryModal);
    $("#country-btn-save").addEventListener("click", saveCountryModal);
    $("#country-btn-clear").addEventListener("click", clearCountryModalData);
    $("#country-modal-clear-color").addEventListener("click", () => {
      modalState.workingColor = null;
      syncModalColorSwatches();
    });
    $("#country-modal-zoom").addEventListener("click", () => {
      if (modalState.countryId) zoomToCountry(modalState.countryId, false);
    });

    $("#tab-btn-interactive").addEventListener("click", () => switchEditorTab("interactive"));
    $("#tab-btn-raw").addEventListener("click", () => switchEditorTab("raw"));

    $("#btn-add-field").addEventListener("click", addFieldFromBar);
    $("#new-field-key").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addFieldFromBar();
      }
    });

    $$(".template-pill").forEach((pill) => {
      pill.addEventListener("click", () => applyQuickTemplate(pill.dataset.template));
    });

    // Raw JSON Editor helpers
    const rawTextarea = $("#country-json-textarea");
    rawTextarea.addEventListener("input", updateRawJsonValidationUI);
    rawTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = rawTextarea.selectionStart;
        const end = rawTextarea.selectionEnd;
        rawTextarea.value =
          rawTextarea.value.substring(0, start) + "  " + rawTextarea.value.substring(end);
        rawTextarea.selectionStart = rawTextarea.selectionEnd = start + 2;
        updateRawJsonValidationUI();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        saveCountryModal();
      }
    });

    $("#btn-json-format").addEventListener("click", () => {
      const parsed = updateRawJsonValidationUI();
      if (parsed.ok) {
        rawTextarea.value = JSON.stringify(parsed.value, null, 2);
      } else {
        showToast("Cannot format until JSON syntax error is fixed");
      }
    });

    $("#btn-json-template-dishes").addEventListener("click", () => {
      const parsed = parseRawJsonTextarea();
      const base = parsed.ok ? parsed.value : {};
      if (!Array.isArray(base.dishes)) {
        base.dishes = [
          { name: "Signature Dish 1", tried: true },
          { name: "Signature Dish 2", tried: false },
        ];
      } else {
        base.dishes.push({ name: "New Dish", tried: false });
      }
      rawTextarea.value = JSON.stringify(base, null, 2);
      updateRawJsonValidationUI();
    });

    // Global Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modalState.isOpen) closeCountryModal();
        closeSaveModal();
        closeDbModal();
        closeDataOverviewModal();
        closeDotPopup();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (modalState.isOpen) {
          saveCountryModal();
        } else {
          openSaveModal();
        }
        return;
      }

      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    });

    // Pin popup
    $("#dot-popup-close").addEventListener("click", closeDotPopup);
    $("#dot-save-btn").addEventListener("click", saveDot);
    $("#dot-delete-btn").addEventListener("click", deleteDot);

    mapContainer.addEventListener("click", onMapClickForDot);

    window.addEventListener("resize", () => {
      initProjection();
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
    setTool("country-fill");
    updateCountryDataIndicators();

    // Auto-load map if ?map=<id> is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const initialMapId = urlParams.get("map");
    if (initialMapId) {
      await loadMapFromDb(initialMapId, true);
    }

    loadingScreen.classList.add("fade-out");
    setTimeout(() => loadingScreen.remove(), 600);
  }

  init();
})();
