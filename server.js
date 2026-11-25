const express = require('express');
const path = require('path');
const fs = require('fs').promises;

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
  "Human-editable World Map Maker file. Under 'countries', use country names as keys, set 'color' to a palette name (see colorPalette) or #hex code (or null), and store any custom JSON object in 'data'.";

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure maps directory exists
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

function normalizeCountryRecord(rawEntry) {
  if (rawEntry === null || rawEntry === undefined) {
    return null;
  }
  if (typeof rawEntry === 'string') {
    return {
      color: rawEntry.trim() || null,
      data: {},
    };
  }
  if (Array.isArray(rawEntry)) {
    return {
      color: null,
      data: { items: rawEntry },
    };
  }
  if (typeof rawEntry === 'object') {
    const color =
      typeof rawEntry.color === 'string' && rawEntry.color.trim()
        ? rawEntry.color.trim()
        : null;

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

    // Preserve any extra fields placed directly on the country object during offline edits
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
  const rawCountries =
    input.countries && typeof input.countries === 'object' && !Array.isArray(input.countries)
      ? input.countries
      : {};

  // Sort country keys alphabetically for clean offline reading and git diffs
  const sortedCountries = {};
  const countryKeys = Object.keys(rawCountries).sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' })
  );

  for (const key of countryKeys) {
    const trimmedKey = key.trim();
    if (!trimmedKey) continue;
    const normalized = normalizeCountryRecord(rawCountries[key]);
    if (normalized) {
      sortedCountries[trimmedKey] = normalized;
    }
  }

  const fillOpacity =
    typeof input.settings?.fillOpacity === 'number'
      ? input.settings.fillOpacity
      : typeof input.fillOpacity === 'number'
        ? input.fillOpacity
        : 0.55;

  const pins = Array.isArray(input.pins)
    ? input.pins
    : Array.isArray(input.dots)
      ? input.dots
      : [];

  const freehandStrokes = Array.isArray(input.freehandStrokes)
    ? input.freehandStrokes
    : Array.isArray(input.strokes)
      ? input.strokes
      : [];

  const doc = {
    _guide: FILE_GUIDE,
    formatVersion: 2,
    id,
    name: String(input.name || id || 'Untitled Map').trim() || 'Untitled Map',
    updatedAt: nowIso,
    settings: {
      fillOpacity: Math.round(fillOpacity * 100) / 100,
    },
    colorPalette: {
      ...DEFAULT_COLOR_PALETTE,
      ...(input.colorPalette && typeof input.colorPalette === 'object' ? input.colorPalette : {}),
    },
    countries: sortedCountries,
    pins,
    freehandStrokes,
  };

  // If legacy countryFills was sent without countries, keep it so client can migrate
  if (
    Object.keys(sortedCountries).length === 0 &&
    input.countryFills &&
    typeof input.countryFills === 'object' &&
    Object.keys(input.countryFills).length > 0
  ) {
    doc.countryFills = input.countryFills;
  }

  return doc;
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

// API Routes

// List all maps
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

    // Sort by most recently modified
    maps.sort((a, b) => b.lastModified - a.lastModified);
    res.json(maps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list maps' });
  }
});

// Get a specific map (always read fresh from disk so offline edits appear immediately)
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

    parsed.id = req.params.id;
    parsed.fileName = `${req.params.id}.json`;
    parsed.diskModifiedAt = new Date(stat.mtimeMs).toISOString();
    res.json(parsed);
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save map' });
  }
});

// Update an existing map
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

    // Rename file on disk only if user explicitly changed the map name
    // or if upgrading from an old numeric/hash ID
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update map' });
  }
});

// Patch a single country's color/JSON data while preserving concurrent offline edits to other countries
app.patch('/api/maps/:id/countries/:countryName', async (req, res) => {
  const mapId = req.params.id;
  const countryName = String(req.params.countryName || '').trim();
  const filePath = resolveMapFilePath(mapId);

  if (!filePath || !countryName) {
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

    if (!existing.countries || typeof existing.countries !== 'object' || Array.isArray(existing.countries)) {
      existing.countries = {};
    }

    // Remove any case-insensitive duplicate key before setting canonical countryName
    for (const existingKey of Object.keys(existing.countries)) {
      if (existingKey.toLowerCase() === countryName.toLowerCase() && existingKey !== countryName) {
        delete existing.countries[existingKey];
      }
    }

    const normalized = normalizeCountryRecord(req.body);
    if (normalized) {
      existing.countries[countryName] = normalized;
    } else {
      delete existing.countries[countryName];
    }

    const formatted = formatMapDocument(existing, mapId);
    await fs.writeFile(filePath, JSON.stringify(formatted, null, 2) + '\n', 'utf8');

    res.json({
      success: true,
      id: mapId,
      fileName: `${mapId}.json`,
      countryName,
      entry: formatted.countries[countryName] || null,
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

    // Graceful shutdown on Ctrl+C to evacuate port
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

module.exports = { app, formatMapDocument, slugifyMapName };
