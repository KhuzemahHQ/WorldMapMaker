const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 8080;
const MAPS_DIR = path.join(__dirname, 'data', 'maps');

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

// API Routes

// List all maps
app.get('/api/maps', async (req, res) => {
  try {
    const files = await fs.readdir(MAPS_DIR);
    const maps = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(MAPS_DIR, file);
        const data = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(data);
        maps.push({
          id: parsed.id || file.replace('.json', ''),
          name: parsed.name || 'Untitled Map',
          lastModified: parsed.lastModified || Date.now()
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

// Get a specific map
app.get('/api/maps/:id', async (req, res) => {
  try {
    const filePath = path.join(MAPS_DIR, `${req.params.id}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(404).json({ error: 'Map not found' });
  }
});

// Create a new map
app.post('/api/maps', async (req, res) => {
  try {
    const newMap = req.body;
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 8);
    
    newMap.id = id;
    newMap.lastModified = Date.now();
    
    const filePath = path.join(MAPS_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newMap, null, 2));
    
    res.json({ success: true, id, name: newMap.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save map' });
  }
});

// Update an existing map
app.put('/api/maps/:id', async (req, res) => {
  try {
    const updateData = req.body;
    updateData.id = req.params.id;
    updateData.lastModified = Date.now();
    
    const filePath = path.join(MAPS_DIR, `${req.params.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(updateData, null, 2));
    
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update map' });
  }
});

// Delete a map
app.delete('/api/maps/:id', async (req, res) => {
  try {
    const filePath = path.join(MAPS_DIR, `${req.params.id}.json`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

// Start server
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
