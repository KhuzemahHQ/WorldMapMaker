# 🌍 World Map Maker

An interactive world map application for painting, annotating, storing structured per-country JSON data, and exploring. Color countries, maintain per-country checklists or custom JSON objects (both in-app and offline in `data/maps/`), draw freehand across borders, place annotated pins, and export maps as high-resolution JPEG images.

![World Map Maker](https://img.shields.io/badge/Made_with-Node.js_%26_Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript)
![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C?style=for-the-badge&logo=d3.js)

---

## ✨ Features

### `{ }` Per-Country JSON Data (In-App & Offline)
Attach arbitrary JSON objects to any country — such as culinary checklists (`tried: true/false`), travel logs, language notes, or custom metadata:
- **Interactive View**: Visual editor with one-click `✓ tried` / `○ not tried` checklist toggles, boolean maps, custom fields, and starter templates (`+ Dish Checklist`, `+ Boolean Map`, `+ Notes`).
- **Raw JSON View**: Built-in monospace JSON editor with live syntax validation, `Tab` indentation, and `Prettify` formatting.
- **Quick Access Anywhere**:
  - **View Mode**: Click any country on the map to inspect or update its JSON data.
  - **Edit Mode**: Select the **Country JSON Data** tool, **right-click** any country at any time, or click `{ }` next to a country in search results.
  - **Top Bar `{ }` Directory**: Browse and filter all countries with stored JSON data.
- **Seamless Offline Editing**: Maps are saved as clean, human-readable `.json` files in `data/maps/`. Edit them in any text editor and click the `↻` reload icon (or refresh the page) to see updates immediately.

### 🎨 Country Fill
Click any country in Edit Mode (`Fill` tool) to color it with one of 10 palette colors. Click again with the same color to clear the fill. Adjust fill opacity dynamically.

### 🖌️ Freehand Paint & Eraser
Draw freely across country borders with an adjustable brush (`2px`–`40px`), undo/redo history, and eraser tool.

### 📍 Location Pins
Drop coordinate pins anywhere on the map with titles and notes.

### 📸 JPEG Export
Export your rendered map (fills, freehand strokes, and pins) as a crisp JPEG image.

---

## 📂 Human-Editable Data Format (`formatVersion: 2`)

Each saved map lives in `data/maps/<map-slug>.json` (for example, `data/maps/culinary.json`) with self-explanatory keys:

- **Readable filenames**: Derived from your map name (`Culinary` → `data/maps/culinary.json`).
- **Country names as keys**: Countries are listed alphabetically by name (`"Italy"`, `"Japan"`, `"Mexico"`), with automatic support for common aliases (`"USA"`, `"UK"`, `"UAE"`, `"South Korea"`, etc.) when editing offline.
- **Named or custom colors**: Set `"color"` to any palette name (`"Crimson"`, `"Emerald"`, `"Sunflower"`, etc.), any CSS hex code (`"#10b981"`), or `null` if uncolored.
- **Flexible `"data"` object**: Store any valid JSON object per country.

```json
{
  "_guide": "Human-editable World Map Maker file. Under 'countries', use country names as keys, set 'color' to a palette name (see colorPalette) or #hex code (or null), and store any custom JSON object in 'data'.",
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
        ],
        "notes": "Try Hiroshima-style okonomiyaki next"
      }
    }
  },
  "pins": [
    {
      "id": "pin-tokyo",
      "title": "Tokyo Ramen Street",
      "notes": "Eight famous ramen shops",
      "color": "Emerald",
      "coordinates": {
        "latitude": 35.6812,
        "longitude": 139.7671
      }
    }
  ],
  "freehandStrokes": []
}
```

> **Legacy Compatibility**: Older `formatVersion: 1` files using ISO-3166 numeric codes (`countryFills`) and `dots`/`strokes` arrays continue to load automatically and upgrade cleanly when saved.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)

### Run Locally

```bash
npm install
npm start
```

Then open `http://localhost:8080` in your browser.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + S` / `Cmd + S` | Save map file (or save open Country JSON modal) |
| `Ctrl + Enter` | Save open Raw JSON editor |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo freehand stroke |
| `Right-Click` on country | Open Country JSON editor directly |
| `Esc` | Close active modal or popup |

---

## 🏗️ Project Structure

```text
WorldMapMaker/
├── server.js          # Express server & REST API for data/maps/*.json
├── data/
│   └── maps/          # Human-editable map JSON files (e.g. culinary.json)
├── public/
│   ├── index.html     # Application layout & modals
│   ├── styles.css     # Dark-mode glassmorphism styling
│   └── app.js         # Map rendering, Country JSON builder/editor & sync
└── README.md
```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
