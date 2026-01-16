console.log('🚀 SERVER.JS LOADED');

app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
require('dotenv').config();

const app = express();

/* =========================
   MIDDLEWARES
   ========================= */
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'execbrief-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

/* =========================
   DATA (users.json)
   ========================= */
const USERS_FILE = 'users.json';
let users = {};
if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to parse users.json', err);
    users = {};
  }
}


function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* =========================
   AUTH
   ========================= */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!req.session.user.company) {
    return res.status(500).json({ error: 'Company missing' });
  }

  if (req.session.user.company.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Account not activated' });
  }

  next();
}

/* =========================
   AUTH ROUTES
   ========================= */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const user = users[email];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.user = {
      email,
      role: user.role,
      company: user.company
    };

    res.json({ success: true });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ error: 'Login failed (server error)' });
  }
});


app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* =========================
   COMPANY
   ========================= */
app.get('/api/company', requireAuth, (req, res) => {
  res.json(req.session.user.company);
});

/* =========================
   EXECBRIEF DATA
   ========================= */
app.get('/api/summary', requireAuth, (req, res) => {
  res.json({
    text: `Weekly executive summary for ${req.session.user.company.name}.`
  });
});

app.get('/api/signals', requireAuth, (req, res) => {
  res.json([
    {
      title: "CAC ↑ 18%",
      description: "Paid media efficiency declined.",
      type: "warning"
    }
  ]);
});

app.get('/api/actions', requireAuth, (req, res) => {
  res.json([
    {
      title: "Pause Meta campaigns",
      impact: "High",
      confidence: "0.78",
      reasoning: "Spend efficiency dropped.",
      consequence: "Potential $12k–18k loss.",
      type: "danger"
    }
  ]);
});

app.get('/api/scenarios', requireAuth, (req, res) => {
  res.json([
    {
      title: "If no action is taken",
      description: "Marketing efficiency will continue to degrade."
    }
  ]);
});

/* =========================
   AI (mock for now)
   ========================= */
app.post('/api/ai/analyze', requireAuth, (req, res) => {
  res.json({
    summary: "AI-generated executive summary.",
    signals: [],
    actions: [],
    scenarios: []
  });
});

/* =========================
   START
   ========================= */
module.exports = app;
 
