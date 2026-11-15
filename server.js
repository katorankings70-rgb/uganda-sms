const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite Central Database
const db = new sqlite3.Database(path.join(__dirname, 'uganda_sms.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    district TEXT,
    join_code TEXT UNIQUE,
    payload TEXT NOT NULL,
    updated_at INTEGER
  )`);
});

// List all registered school names (for quick search/sign-in)
app.get('/api/schools', (req, res) => {
  db.all(`SELECT id, name, district, join_code, updated_at FROM schools ORDER BY name ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Load a specific school workspace by ID or exact name
app.get('/api/schools/:identifier', (req, res) => {
  const idOrName = decodeURIComponent(req.params.identifier).trim();
  db.get(
    `SELECT * FROM schools WHERE id = ? OR LOWER(name) = LOWER(?)`,
    [idOrName, idOrName],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'School not found' });
      res.json({ ...row, payload: JSON.parse(row.payload) });
    }
  );
});

// Sync (Create or Update) School Workspace from Offline/Online Clients
app.post('/api/sync', (req, res) => {
  const { id, name, district, join_code, payload, updated_at } = req.body;
  if (!id || !name || !payload) {
    return res.status(400).json({ error: 'Missing required school fields' });
  }
  const serialized = JSON.stringify(payload);
  db.run(
    `INSERT INTO schools (id, name, district, join_code, payload, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       district = excluded.district,
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
    [id, name, district || '', join_code, serialized, updated_at || Date.now()],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'synced', id, updated_at });
    }
  );
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Uganda SMS Server running on http://localhost:${PORT}`);
});
