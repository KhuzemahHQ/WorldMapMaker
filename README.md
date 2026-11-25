# 🌍 World Map Maker

A 100% code-driven interactive world map application with a built-in **Web JSON Portal** and offline human-editable JSON storage. Maps are stored purely as structured JSON files in `data/maps/` and rendered live via D3.js & SVG; raster JPEG snapshots are only generated on demand when clicking the **Share** icon.

![World Map Maker](https://img.shields.io/badge/Made_with-Node.js_%26_Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript)
![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C?style=for-the-badge&logo=d3.js)

---

## 🔄 Data & Rendering Pipeline

Everything rendered on screen comes directly from JSON data — no screenshots or images are ever used to persist or render maps:

```text
data/country-catalog.json  ──┐
                             ├──► Express API (server.js) ◄──► Web Portal (D3 SVG Map + Live JSON Editor)
data/maps/<map-name>.json  ──┘                                          │
                                                                 [Share Icon Click]
                                                                        ▼
                                                             One-time .jpeg Download
```

1. **Country Catalog (`data/country-catalog.json`)**: Shared canonical dictionary mapping world TopoJSON feature IDs and common aliases (`"USA"`, `"UK"`, `"UAE"`, `"South Korea"`, etc.) to human-readable **Country Names** (`GET /api/catalog`).
2. **Map JSON Files (`data/maps/*.json`)**: Single source of truth for each map (`GET/POST/PUT/PATCH /api/maps`). On page load, the web portal automatically fetches `/api/maps` and renders your active/latest map (such as `data/maps/culinary.json`).
3. **Live Code Rendering**: Country polygons, fills, pins, and vector stroke coordinates render dynamically in the browser. Edits made in-app automatically sync back to `data/maps/<map>.json`, and offline file edits load immediately on refresh or clicking `↻`.
4. **Share Snapshot Export**: Clicking the **Share** icon in the top bar renders a one-time `.jpeg` download for sharing externally.

---

## ✨ Three Modes in the Web Portal

Use the top-bar toggle to switch between **View**, **Edit**, and **JSON**:

| Mode | What It Does |
|------|--------------|
| **View** | Pan & zoom the SVG map. Click any country to open its interactive checklist (`✓ tried` / `○ not tried`) or per-country JSON modal. |
| **Edit** | Opens the visual tools sidebar: **Fill** countries with palette colors, open **Country JSON Data**, draw **Paint** strokes, drop **Pins**, or use the **Eraser**. Changes auto-sync to `data/maps/<map>.json`. |
| **JSON** | Opens the side-by-side **Map JSON Portal** right inside the browser. View and edit the entire map JSON file (with all **Country Names** visible), search/insert any world country via `+ Country`, validate syntax live, and click **Apply & Save JSON** (`Ctrl+S`) to re-render the map and write to disk. |

---

## 📂 Human-Editable JSON Format (`formatVersion: 2`)

Every map in `data/maps/<slug>.json` uses Country Names as keys under `"countries"`:

```json
{
  "_guide": "Human-editable World Map Maker file. Under 'countries', keys are Country Names, 'color' is a palette name (see colorPalette) or #hex (or null), and 'data' holds any custom JSON object.",
  "formatVersion": 2,
  "id": "culinary",
  "name": "Culinary",
  "updatedAt": "2026-11-25T19:15:00.000Z",
  "settings": {
    "fillOpacity": 0.55
  },
  "colorPalette": {
    "Crimson": "#e63946",
    "Tangerine": "#f77f00",
    "Sunflower": "#fcbf49",
    "Emerald": "#2a9d8f",
    "Ocean": "#457b9d",
    "Indigo": "#6366f1",
    "Violet": "#8b5cf6",
    "Rose": "#ec4899",
    "Slate": "#64748b",
    "Espresso": "#78350f"
  },
  "countries": {
    "Italy": {
      "color": "Crimson",
      "data": {
        "dishes": [
          { "name": "Carbonara", "tried": true },
          { "name": "Osso Buco", "tried": false }
        ]
      }
    },
    "Japan": {
      "color": "Emerald",
      "data": {
        "dishes": [
          { "name": "Ramen", "tried": true },
          { "name": "Okonomiyaki", "tried": false }
        ]
      }
    }
  },
  "pins": [],
  "freehandStrokes": []
}
```

---

## 🚀 Getting Started

```bash
npm install
npm start
```

Open `http://localhost:8080` in your browser. (If the server was already running before pulling updates, restart `npm start` so the updated API routes take effect.)

---

## 🏗️ Project Structure

```text
WorldMapMaker/
├── server.js                    # Express API & server-side JSON normalization
├── data/
│   ├── country-catalog.json     # Canonical Country Names, ISO IDs & aliases
│   └── maps/                    # Human-editable map JSON files (e.g. culinary.json)
├── public/
│   ├── index.html               # Web portal layout (View | Edit | JSON modes)
│   ├── styles.css               # Dark-mode glassmorphism design system
│   └── app.js                   # D3 SVG map renderer, JSON portal &checklist UI
└── README.md
```

---

## 📄 License

Available under the [MIT License](LICENSE).
