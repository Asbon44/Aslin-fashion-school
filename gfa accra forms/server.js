const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'backend_db.json');

function loadDatabase() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.applications) {
      return parsed;
    }
  } catch (err) {
    console.warn('Database file missing or invalid, creating new one.');
  }
  return { applications: {} };
}

function saveDatabase(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function normalizeSerial(serial) {
  return (serial || '').toString().trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
}

app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.static(path.join(__dirname)));

app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', (req, res) => {
  const { serial, pin } = req.body || {};
  const normalizedSerial = normalizeSerial(serial);
  const normalizedPin = (pin || '').toString().trim();

  if (!normalizedSerial || !normalizedPin) {
    return res.status(400).json({ valid: false, error: 'Serial and PIN are required.' });
  }

  const db = loadDatabase();
  const record = db.applications[normalizedSerial];
  if (!record) {
    return res.json({ valid: false, used: false });
  }

  if (record.pin !== normalizedPin) {
    return res.status(401).json({ valid: false, used: false, error: 'Invalid PIN for this serial.' });
  }

  return res.json({
    valid: true,
    used: true,
    serial: record.serial,
    pin: record.pin,
    submittedAt: record.submittedAt,
    formData: record.formData || null,
  });
});

app.post('/api/submit', (req, res) => {
  const { serial, pin, formData } = req.body || {};
  const normalizedSerial = normalizeSerial(serial);
  const normalizedPin = (pin || '').toString().trim();

  if (!normalizedSerial || !normalizedPin || !formData || typeof formData !== 'object') {
    return res.status(400).json({ success: false, error: 'Serial, PIN and formData are required.' });
  }

  const db = loadDatabase();
  db.applications[normalizedSerial] = {
    serial: normalizedSerial,
    pin: normalizedPin,
    submittedAt: new Date().toISOString(),
    formData,
  };
  saveDatabase(db);

  return res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Backend server is running at http://localhost:${PORT}`);
  console.log('It will store application form data in backend_db.json.');
});
