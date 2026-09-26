# 🌍 World Map Maker

An interactive world map application for painting, annotating, and exploring. Color countries, draw freehand across borders, place annotated dots, and save your personalized maps as JPEG images with version control.

![World Map Maker Screenshot](https://img.shields.io/badge/Made_with-Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript)
![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C?style=for-the-badge&logo=d3.js)

---

## ✨ Features

### 🎨 Country Fill
Click any country to fill it with your selected color. Click again to remove the fill. Adjust fill opacity with the slider.

### 🖌️ Freehand Paint
Draw freely across the map — strokes ignore country borders entirely. Adjustable brush size from 2px to 40px.

### 📍 Dot Annotations
Place pins anywhere on the map. Click a dot to add a title and notes. In View mode, click dots to read your saved annotations.

### 🔍 Country Search
Type a country name to find it instantly. Selecting a result smoothly zooms the map and highlights the country with a pulsing border.

### 🗑️ Eraser
Remove freehand paint strokes with an adjustable eraser tool.

### 💾 Save & Load
Map data (fills, strokes, dots) is automatically persisted in browser localStorage. Manually save/load at any time.

### 📸 JPEG Export with Versioning
Save your map as a high-quality JPEG image:
- **Choose a folder** on your computer (via the File System Access API)
- The app creates a **dedicated subdirectory** for each map name
- On subsequent saves, choose **Replace** (overwrite) or **New Version** (auto-incremented)
- Falls back to a standard browser download if your browser doesn't support folder access

```
MyMaps/
└── Culinary_Exploration/
    ├── Culinary_Exploration.jpeg       ← initial save
    ├── Culinary_Exploration_v2.jpeg    ← first "New Version"
    ├── Culinary_Exploration_v3.jpeg    ← second "New Version"
    └── ...
```

---

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Edge, or Brave recommended for full File System Access API support)
- No build tools, frameworks, or package managers required

### Run Locally

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/WorldMapMaker.git
   cd WorldMapMaker
   ```

2. **Serve the files** using any static server:
   ```bash
   # Option A: npx (Node.js)
   npx http-server -p 8080

   # Option B: Python
   python -m http.server 8080

   # Option C: Just open index.html directly in your browser
   ```

3. **Open** `http://localhost:8080` in your browser

> **Note:** Opening `index.html` directly (via `file://`) will work for most features, but the JPEG folder-save feature requires a local server due to browser security policies.

---

## 🎮 Usage

### Modes
| Mode | Description |
|------|-------------|
| **View** (default) | Browse your map. Click dots to read annotations. Pan & zoom freely. |
| **Edit** | Access all painting and annotation tools via the side panel. |

### Tools (Edit Mode)
| Tool | Description |
|------|-------------|
| **Fill** | Click a country to fill it with the selected color |
| **Paint** | Freehand drawing — ignores country borders |
| **Dots** | Click anywhere to place an annotation pin |
| **Eraser** | Remove freehand paint strokes |

### Color Palette
10 curated colors: Crimson, Tangerine, Sunflower, Emerald, Ocean, Indigo, Violet, Rose, Slate, Espresso.

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl + Z` | Undo last freehand stroke |
| `Ctrl + Y` | Redo |
| `Ctrl + S` | Save map data to browser storage |

---

## 💡 Use Case Ideas

- **🍜 Culinary Exploration** — Shade regions whose cuisine you've tried (green) or want to try (yellow)
- **✈️ Travel Map** — Mark countries you've visited, drop dots on cities with trip notes
- **🗣️ Language Map** — Paint regions where people speak languages you know, freehand dialect boundaries
- **📚 History Study** — Color historical empires, trade routes, or cultural regions
- **🎯 Bucket List** — Track places you want to visit with annotated dots

---

## 🏗️ Project Structure

```
WorldMapMaker/
├── index.html      # Main HTML — layout, toolbar, edit panel, modals
├── styles.css      # Dark-mode design system with glassmorphism
├── app.js          # Core application logic
└── README.md       # This file
```

### Tech Stack
- **[D3.js v7](https://d3js.org/)** — Map rendering from TopoJSON, Natural Earth projection, pan/zoom
- **[TopoJSON](https://github.com/topojson/topojson)** — Efficient world geometry data
- **Canvas API** — Freehand drawing layer
- **File System Access API** — Direct folder saving with versioning
- **Vanilla CSS** — Premium dark-mode design, no frameworks

---

## 🌐 Browser Support

| Feature | Chrome/Edge | Firefox | Safari |
|---------|:-----------:|:-------:|:------:|
| Map rendering | ✅ | ✅ | ✅ |
| Country fill | ✅ | ✅ | ✅ |
| Freehand paint | ✅ | ✅ | ✅ |
| Dot annotations | ✅ | ✅ | ✅ |
| JPEG folder save | ✅ | ⬇️ download | ⬇️ download |
| localStorage save | ✅ | ✅ | ✅ |

> ⬇️ = Falls back to standard browser download (no folder versioning)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
