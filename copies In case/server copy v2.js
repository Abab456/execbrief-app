require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. MIDDLEWARE ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'execbrief', 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set true if using HTTPS on Plesk
        maxAge: 3600000 // 1 Hour
    }
}));

// --- 2. DATA LOADERS (MOCK DB) ---
const getUsers = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8'));
const getCompanies = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'companies.json'), 'utf8'));

// --- 3. AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
};

// --- 4. PUBLIC ROUTES ---

// Health Check (Success Criteria)
app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        // Create Session
        req.session.user = { 
            id: user.id, 
            username: user.username, 
            name: user.name,
            companyId: user.companyId 
        };
        return res.json({ success: true, redirect: '/dashboard.html' });
    }
    
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// --- 5. PROTECTED ROUTES (DATA) ---

// Get Company Context & Summary
app.get('/api/company', requireAuth, (req, res) => {
    const companies = getCompanies();
    const company = companies.find(c => c.id === req.session.user.companyId);
    
    if (!company) return res.status(404).json({ error: 'Company not found' });

    res.json({
        name: company.name,
        user: req.session.user.name
    });
});

app.get('/api/summary', requireAuth, (req, res) => {
    const companies = getCompanies();
    const company = companies.find(c => c.id === req.session.user.companyId);
    if (!company) return res.status(404).json({ error: 'Data not found' });
    
    res.json({ summary: company.summary });
});

app.get('/api/signals', requireAuth, (req, res) => {
    const companies = getCompanies();
    const company = companies.find(c => c.id === req.session.user.companyId);
    res.json(company ? company.signals : []);
});

app.get('/api/actions', requireAuth, (req, res) => {
    const companies = getCompanies();
    const company = companies.find(c => c.id === req.session.user.companyId);
    res.json({
        actions: company ? company.actions : [],
        scenarios: company ? company.scenarios : []
    });
});

// --- 6. AI ENDPOINT (PLACEHOLDER FOR STEP 6) ---
app.post('/api/ai/analyze', requireAuth, (req, res) => {
    // This will be implemented in Step 6
    // Currently returns a stub response to prevent 404s if tested
    res.json({ 
        analysis: "AI Module not yet active.", 
        risk_score: 0 
    });
});

// --- ROOT REDIRECT ---
app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        res.redirect('/dashboard.html');
    } else {
        res.redirect('/login.html');
    }
});

// --- SERVER START ---

app.listen(PORT, () => {
    console.log(`ExecBrief running on port ${PORT}`);
});