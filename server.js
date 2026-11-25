const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const countryCatalog = require('./data/country-catalog.json');

const app = express();
const PORT = process.env.PORT || 8080;
const MAPS_DIR = path.join(__dirname, 'data', 'maps');

const DEFAULT_COLOR_PALETTE = {
  Crimson: '#e63946',
  Tangerine: '#f77f00',
  Sunflower: '#fcbf49',
  Emerald: '#2a9d8f',
  Ocean: '#457b9d',
  Indigo: '#6366f1',
  Violet: '#8b5cf6',
  Rose: '#ec4899',
  Slate: '#64748b',
  Espresso: '#78350f',
};

const FILE_GUIDE =
  "Human-editable World Map Maker file. Under 'countries', keys are Country Names, 'color' is a palette name (see colorPalette) or #hex (or null), and 'data' holds any custom JSON object.";

// Build fast lookup tables for server-side country key normalization
const CANONICAL_NAMES_LOWER = new Map();
for (const name of Object.values(countryCatalog.isoToName)) {
  CANONICAL_NAMES_LOWER.set(name.toLowerCase(), name);
}
for (const name of countryCatalog.extraCountries) {
  CANONICAL_NAMES_LOWER.set(name.toLowerCase(), name);
}

function normalizeCountryName(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return null;

  // 1. Numeric ISO-3166 code (e.g. "124" or "4" -> "Canada" / "Afghanistan")
  if (countryCatalog.isoToName[key]) {
    return countryCatalog.isoToName[key];
  }
  if (/^\d{1,3}$/.test(key)) {
    const padded = key.padStart(3, '0');
    if (countryCatalog.isoToName[padded]) {
      return countryCatalog.isoToName[padded];
    }
  }

  // 2. Canonical country name (case-insensitive)
  const lower = key.toLowerCase();
  if (CANONICAL_NAMES_LOWER.has(lower)) {
    return CANONICAL_NAMES_LOWER.get(lower);
  }

  // 3. Common alias (e.g. "USA" -> "United States of America")
  if (countryCatalog.aliases[lower]) {
    return countryCatalog.aliases[lower];
  }

  // 4. Preserve custom region/country key as entered
  return key;
}

function normalizeColorNameOrHex(rawColor, palette = DEFAULT_COLOR_PALETTE) {
  if (!rawColor || typeof rawColor !== 'string') return null;
  const trimmed = rawColor.trim();
  if (!trimmed) return null;

  // Convert matching hex (e.g. "#e63946") to human-readable palette name ("Crimson")
  for (const [name, hex] of Object.entries(palette)) {
    if (
      name.toLowerCase() === trimmed.toLowerCase() ||
      (typeof hex === 'string' && hex.trim().toLowerCase() === trimmed.toLowerCase())
    ) {
      return name;
    }
  }
  return trimmed;
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function ensureMapsDir() {
  try {
    await fs.mkdir(MAPS_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating maps directory:', err);
  }
}

function slugifyMapName(name) {
  const slug = String(name || 'untitled-map')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled-map';
}

function resolveMapFilePath(id) {
  if (!id || typeof id !== 'string') return null;
  if (id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\0')) {
    return null;
  }
  const resolvedMapsDir = path.resolve(MAPS_DIR);
  const filePath = path.resolve(MAPS_DIR, `${id}.json`);
  if (!filePath.startsWith(resolvedMapsDir + path.sep)) {
    return null;
  }
  return filePath;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getUniqueMapId(desiredSlug, ignoreId = null) {
  let candidate = desiredSlug;
  let counter = 2;
  while (candidate !== ignoreId && (await fileExists(resolveMapFilePath(candidate)))) {
    candidate = `${desiredSlug}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function hasNonEmptyData(data) {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data)) return data.length > 0;
  return Object.keys(data).length > 0;
}

function normalizeCountryRecord(rawEntry, palette = DEFAULT_COLOR_PALETTE) {
  if (rawEntry === null || rawEntry === undefined) {
    return null;
  }
  if (typeof rawEntry === 'string') {
    const color = normalizeColorNameOrHex(rawEntry, palette);
    return color ? { color, data: {} } : null;
  }
  if (Array.isArray(rawEntry)) {
    return rawEntry.length > 0 ? { color: null, data: { items: rawEntry } } : null;
  }
  if (typeof rawEntry === 'object') {
    const color = normalizeColorNameOrHex(rawEntry.color, palette);

    let dataObj = {};
    if (rawEntry.data !== undefined && rawEntry.data !== null) {
      if (typeof rawEntry.data === 'object' && !Array.isArray(rawEntry.data)) {
        dataObj = { ...rawEntry.data };
      } else if (Array.isArray(rawEntry.data)) {
        dataObj = { items: rawEntry.data };
      } else {
        dataObj = { value: rawEntry.data };
      }
    }

    // Preserve any extra fields placed directly on the country object during offline/JSON edits
    for (const [k, v] of Object.entries(rawEntry)) {
      if (k !== 'color' && k !== 'data') {
        dataObj[k] = v;
      }
    }

    if (!color && !hasNonEmptyData(dataObj)) {
      return null;
    }

    return {
      color,
      data: dataObj,
    };
  }
  return null;
}

function formatMapDocument(input, id) {
  const nowIso = new Date().toISOString();
  const mergedPalette = {
    ...DEFAULT_COLOR_PALETTE,
    ...(input.colorPalette && typeof input.colorPalette === 'object' ? input.colorPalette : {}),
  };

  const combinedCountries = {};

  // 1. Migrate any legacy numeric countryFills automatically using countryCatalog
  if (input.countryFills && typeof input.countryFills === 'object' && !Array.isArray(input.countryFills)) {
    for (const [rawKey, rawHex] of Object.entries(input.countryFills)) {
      const canonicalName = normalizeCountryName(rawKey);
      const color = normalizeColorNameOrHex(rawHex, mergedPalette);
      if (canonicalName && color) {
        combinedCountries[canonicalName] = { color, data: {} };
      }
    }
  }

  // 2. Normalize v2 countries dictionary (resolving aliases/ISO codes -> canonical Country Names)
  if (input.countries && typeof input.countries === 'object' && !Array.isArray(input.countries)) {
    for (const [rawKey, rawVal] of Object.entries(input.countries)) {
      const canonicalName = normalizeCountryName(rawKey);
      if (!canonicalName) continue;
      const normalized = normalizeCountryRecord(rawVal, mergedPalette);
      if (normalized) {
        const prev = combinedCountries[canonicalName];
        combinedCountries[canonicalName] = prev
          ? {
              color: normalized.color || prev.color || null,
              data: { ...(prev.data || {}), ...(normalized.data || {}) },
            }
          : normalized;
      } else {
        delete combinedCountries[canonicalName];
      }
    }
  }

  // Sort country names alphabetically for clean human reading & git diffs
  const sortedCountries = {};
  for (const key of Object.keys(combinedCountries).sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' })
  )) {
    sortedCountries[key] = combinedCountries[key];
  }

  const fillOpacity =
    typeof input.settings?.fillOpacity === 'number'
      ? input.settings.fillOpacity
      : typeof input.fillOpacity === 'number'
        ? input.fillOpacity
        : 0.55;

  const rawPins = Array.isArray(input.pins)
    ? input.pins
    : Array.isArray(input.dots)
      ? input.dots
      : [];

  const pins = rawPins
    .map((p, idx) => {
      const lat =
        p.coordinates && typeof p.coordinates === 'object'
          ? Number(p.coordinates.latitude ?? p.coordinates.lat)
          : Array.isArray(p.geoCoords)
            ? Number(p.geoCoords[1])
            : NaN;
      const lon =
        p.coordinates && typeof p.coordinates === 'object'
          ? Number(p.coordinates.longitude ?? p.coordinates.lon ?? p.coordinates.lng)
          : Array.isArray(p.geoCoords)
            ? Number(p.geoCoords[0])
            : NaN;
      if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
      return {
        id: p.id || `pin-${idx + 1}`,
        title: String(p.title || ''),
        notes: p.notes !== undefined ? String(p.notes) : String(p.text || ''),
        color: normalizeColorNameOrHex(p.color, mergedPalette) || 'Crimson',
        coordinates: {
          latitude: Math.round(lat * 10000) / 10000,
          longitude: Math.round(lon * 10000) / 10000,
        },
      };
    })
    .filter(Boolean);

  const rawStrokes = Array.isArray(input.freehandStrokes)
    ? input.freehandStrokes
    : Array.isArray(input.strokes)
      ? input.strokes
      : [];

  const freehandStrokes = rawStrokes.map((s) => ({
    color:
      s.color === 'eraser'
        ? 'eraser'
        : normalizeColorNameOrHex(s.color, mergedPalette) || 'Crimson',
    brushSize: Number(s.brushSize ?? s.size ?? 10),
    points: Array.isArray(s.points) ? s.points : [],
  }));

  return {
    _guide: FILE_GUIDE,
    formatVersion: 2,
    id,
    name: String(input.name || id || 'Untitled Map').trim() || 'Untitled Map',
    updatedAt: nowIso,
    settings: {
      fillOpacity: Math.round(fillOpacity * 100) / 100,
    },
    colorPalette: mergedPalette,
    countries: sortedCountries,
    pins,
    freehandStrokes,
  };
}

function summarizeMap(parsed, fileId, statMtimeMs) {
  const parsedTime = parsed.updatedAt
    ? Date.parse(parsed.updatedAt)
    : typeof parsed.lastModified === 'number'
      ? parsed.lastModified
      : 0;
  const lastModified = Math.max(parsedTime || 0, Math.floor(statMtimeMs || 0)) || Date.now();

  let countryCount = 0;
  let dataCountryCount = 0;

  if (parsed.countries && typeof parsed.countries === 'object') {
    for (const rawEntry of Object.values(parsed.countries)) {
      const norm = normalizeCountryRecord(rawEntry);
      if (norm) {
        countryCount += 1;
        if (hasNonEmptyData(norm.data)) {
          dataCountryCount += 1;
        }
      }
    }
  } else if (parsed.countryFills && typeof parsed.countryFills === 'object') {
    countryCount = Object.keys(parsed.countryFills).length;
  }

  const pinCount = Array.isArray(parsed.pins)
    ? parsed.pins.length
    : Array.isArray(parsed.dots)
      ? parsed.dots.length
      : 0;

  return {
    id: fileId,
    fileName: `${fileId}.json`,
    name: parsed.name || fileId,
    updatedAt: new Date(lastModified).toISOString(),
    lastModified,
    countryCount,
    dataCountryCount,
    pinCount,
    formatVersion: parsed.formatVersion || 1,
  };
}

// ── API Routes ─────────────────────────────────────────────

// Serve canonical country catalog so frontend and backend share one dictionary
app.get('/api/catalog', (req, res) => {
  res.json(countryCatalog);
});

// List all maps in data/maps/
app.get('/api/maps', async (req, res) => {
  try {
    await ensureMapsDir();
    const files = await fs.readdir(MAPS_DIR);
    const maps = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fileId = file.slice(0, -5);
      const filePath = path.join(MAPS_DIR, file);

      try {
        const [data, stat] = await Promise.all([
          fs.readFile(filePath, 'utf8'),
          fs.stat(filePath),
        ]);
        const parsed = JSON.parse(data);
        maps.push(summarizeMap(parsed, fileId, stat.mtimeMs));
      } catch (parseErr) {
        let mtimeMs = Date.now();
        try {
          const stat = await fs.stat(filePath);
          mtimeMs = stat.mtimeMs;
        } catch {
          // Ignore stat error
        }
        maps.push({
          id: fileId,
          fileName: file,
          name: fileId,
          updatedAt: new Date(mtimeMs).toISOString(),
          lastModified: mtimeMs,
          invalidJson: true,
          parseError: parseErr.message,
        });
      }
    }

    maps.sort((a, b) => b.lastModified - a.lastModified);
    res.json(maps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list maps' });
  }
});

// Read a specific map fresh from disk (normalized to v2 with Country Names)
app.get('/api/maps/:id', async (req, res) => {
  const filePath = resolveMapFilePath(req.params.id);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid map ID' });
  }

  try {
    const [raw, stat] = await Promise.all([
      fs.readFile(filePath, 'utf8'),
      fs.stat(filePath),
    ]);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (syntaxErr) {
      return res.status(400).json({
        error: `Invalid JSON in data/maps/${req.params.id}.json`,
        details: syntaxErr.message,
      });
    }

    // Normalize into clean v2 structure in response so client & web JSON editor always see Country Names
    const normalized = formatMapDocument(parsed, req.params.id);
    normalized.updatedAt =
      parsed.updatedAt || new Date(stat.mtimeMs).toISOString();
    normalized.fileName = `${req.params.id}.json`;
    normalized.diskModifiedAt = new Date(stat.mtimeMs).toISOString();
    res.json(normalized);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Map not found' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to read map' });
  }
});

// Create a new map
app.post('/api/maps', async (req, res) => {
  try {
    await ensureMapsDir();
    const desiredSlug = slugifyMapName(req.body?.name);
    const id = await getUniqueMapId(desiredSlug);
    const formatted = formatMapDocument(req.body || {}, id);

    const filePath = resolveMapFilePath(id);
    await fs.writeFile(filePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');

    res.json({
      success: true,
      id,
      fileName: `${id}.json`,
      name: formatted.name,
      updatedAt: formatted.updatedAt,
      map: formatted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save map' });
  }
});

// Save / update an existing map
app.put('/api/maps/:id', async (req, res) => {
  const currentId = req.params.id;
  const currentFilePath = resolveMapFilePath(currentId);
  if (!currentFilePath) {
    return res.status(400).json({ error: 'Invalid map ID' });
  }

  try {
    await ensureMapsDir();
    let existingDoc = null;
    if (await fileExists(currentFilePath)) {
      try {
        existingDoc = JSON.parse(await fs.readFile(currentFilePath, 'utf8'));
      } catch {
        existingDoc = null;
      }
    }

    let targetId = currentId;
    const incomingName = String(req.body?.name || '').trim();
    const previousName = existingDoc?.name ? String(existingDoc.name).trim() : '';

    const isLegacyHashId = /^\d{13}[a-z0-9]+$/i.test(currentId);
    if (incomingName && (isLegacyHashId || (previousName && incomingName !== previousName))) {
      const desiredSlug = slugifyMapName(incomingName);
      if (desiredSlug !== currentId) {
        targetId = await getUniqueMapId(desiredSlug, currentId);
      }
    }

    const formatted = formatMapDocument(req.body || {}, targetId);
    const targetFilePath = resolveMapFilePath(targetId);
    await fs.writeFile(targetFilePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');

    if (targetId !== currentId && (await fileExists(currentFilePath))) {
      await fs.unlink(currentFilePath);
    }

    res.json({
      success: true,
      id: targetId,
      fileName: `${targetId}.json`,
      name: formatted.name,
      updatedAt: formatted.updatedAt,
      map: formatted,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update map' });
  }
});

// Patch a single country's color/JSON data while preserving concurrent offline edits to other countries
app.patch('/api/maps/:id/countries/:countryName', async (req, res) => {
  const mapId = req.params.id;
  const canonicalCountry = normalizeCountryName(req.params.countryName);
  const filePath = resolveMapFilePath(mapId);

  if (!filePath || !canonicalCountry) {
    return res.status(400).json({ error: 'Invalid map ID or country name' });
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    let existing;
    try {
      existing = JSON.parse(raw);
    } catch (syntaxErr) {
      return res.status(400).json({
        error: `Cannot update because data/maps/${mapId}.json contains invalid JSON from an offline edit`,
        details: syntaxErr.message,
      });
    }

    // Upgrade existing doc first (in case it was v1 or used aliases)
    const upgraded = formatMapDocument(existing, mapId);
    const normalizedEntry = normalizeCountryRecord(req.body, upgraded.colorPalette);

    if (normalizedEntry) {
      upgraded.countries[canonicalCountry] = normalizedEntry;
    } else {
      delete upgraded.countries[canonicalCountry];
    }

    const formatted = formatMapDocument(upgraded, mapId);
    await fs.writeFile(filePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');

    res.json({
      success: true,
      id: mapId,
      fileName: `${mapId}.json`,
      countryName: canonicalCountry,
      entry: formatted.countries[canonicalCountry] || null,
      updatedAt: formatted.updatedAt,
      map: formatted,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Map not found' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update country data' });
  }
});

// Delete a map
app.delete('/api/maps/:id', async (req, res) => {
  const filePath = resolveMapFilePath(req.params.id);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid map ID' });
  }

  try {
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

// Start server
if (require.main === module) {
  ensureMapsDir().then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

    process.on('SIGINT', () => {
      console.log('\nGracefully shutting down (Ctrl+C)...');
      server.close(() => {
        console.log('Port evacuated. Goodbye!');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\nGracefully shutting down...');
      server.close(() => {
        console.log('Port evacuated. Goodbye!');
        process.exit(0);
      });
    });
  });
}

module.exports = { app, formatMapDocument, slugifyMapName, normalizeCountryName };
