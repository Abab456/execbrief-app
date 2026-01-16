const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* =========================
   USERS (JSON persistence)
========================= */
const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
    try {
        return fs.existsSync(USERS_FILE)
            ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
            : {};
    } catch (e) {
        console.error("Error loading users:", e);
        return {};
    }
}

/* =========================
   SESSIONS & SECURITY
========================= */
const sessions = {};
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h

function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

function generateResetToken() {
    return crypto.randomBytes(24).toString('hex');
}

function hashPassword(password) {
    // Note: For 2026 production, consider upgrading to bcrypt or argon2
    return crypto.createHash('sha256').update(password).digest('hex');
}

/* =========================
   VALIDATION & PARSING
========================= */
function validateEmail(email) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function validatePassword(password) {
    const errors = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters.');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter.');
    if (!/[0-9]/.test(password)) errors.push('Password must contain a number.');
    return errors;
}

function parseCookies(header) {
    const list = {};
    if (!header) return list;
    header.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
    return list;
}

function parseBody(req) {
    return new Promise(resolve => {
        let data = '';
        req.on('data', c => (data += c));
        req.on('end', () => {
            const params = new URLSearchParams(data);
            const obj = {};
            for (const [k, v] of params) obj[k] = v;
            resolve(obj);
        });
    });
}

/* =========================
   UI RENDERING
========================= */
function renderPage(title, body, isDashboard = false) {
    // If it's a dashboard, we don't wrap it in the narrow 'container' class
    const wrapperClass = isDashboard ? "" : "container";
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | ExecBrief</title>
    <link rel="stylesheet" href="/public/styles.css">
</head>
<body>
    <div class="${wrapperClass}">
        ${body}
    </div>
</body>
</html>`;
}

function loginForm(error = '', email = '') {
    return renderPage('Login', `
        <h1>ExecBrief</h1>
        ${error ? `<p class="errors">${error}</p>` : ''}
        <form method="POST" action="/login">
            <input type="email" name="email" placeholder="Email" value="${email}" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Log in</button>
        </form>
        <p><a href="/forgot-password">Forgot password?</a></p>
        <p>No account? <a href="/signup">Sign up</a></p>
    `);
}

function signupForm(error = '', email = '') {
    return renderPage('Sign up', `
        <h1>Create account</h1>
        ${error ? `<p class="errors">${error}</p>` : ''}
        <form method="POST" action="/signup">
            <input type="email" name="email" value="${email}" placeholder="Email" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Create account</button>
        </form>
        <p><a href="/login">Back to login</a></p>
    `);
}

function forgotPasswordForm(message = '') {
    return renderPage('Forgot password', `
        <h1>Reset password</h1>
        ${message ? `<p class="info">${message}</p>` : ''}
        <form method="POST" action="/forgot-password">
            <input type="email" name="email" placeholder="Email" required>
            <button type="submit">Generate reset link</button>
        </form>
        <p><a href="/login">Back to login</a></p>
    `);
}

function resetPasswordForm(token, error = '') {
    return renderPage('Reset password', `
        <h1>Set new password</h1>
        ${error ? `<p class="errors">${error}</p>` : ''}
        <form method="POST" action="/reset-password">
            <input type="hidden" name="token" value="${token}">
            <input type="password" name="password" placeholder="New password" required>
            <button type="submit">Save password</button>
        </form>
    `);
}

function dashboardPage(email) {
    const userHandle = email.split('@')[0];
    return renderPage('Dashboard', `
        <header class="topbar">
            <div class="brand">ExecBrief</div>
            <form method="POST" action="/logout" style="margin:0">
                <button type="submit" class="logout">Log out (${userHandle})</button>
            </form>
        </header>
        <main class="dashboard">
            <section class="card" style="margin-bottom: 32px;">
                <h2>Welcome back, ${userHandle}</h2>
                <p>ExecBrief helps you turn complex inputs into clear, decision-ready summaries.</p>
            </section>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
                <section class="card">
                    <h2>Quick Analysis</h2>
                    <p>Paste a report URL to generate an executive brief.</p>
                    <input type="text" placeholder="https://example.com/report">
                    <button style="margin-top:10px">Generate</button>
                </section>
                <section class="card">
                    <h2>Account Usage</h2>
                    <div class="info">Free Tier Active</div>
                    <p>Briefs remaining: <strong>12 / 20</strong></p>
                </section>
            </div>
        </main>
    `, true);
}

/* =========================
   CORE SERVER LOGIC
========================= */
const server = http.createServer(async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.sessionId;
    let userEmail = null;

    // Session Management
    if (sessionId && sessions[sessionId]) {
        const s = sessions[sessionId];
        if (s.expiresAt > Date.now()) {
            userEmail = s.email;
        } else {
            delete sessions[sessionId];
            res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
        }
    }

    // Static Files (CSS, Images, JS)
    if (req.url.startsWith('/public/')) {
        const safePath = path.normalize(req.url).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(__dirname, safePath);

        if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            return res.end('Not found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg'
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        return fs.createReadStream(filePath).pipe(res);
    }

    // Helper to always send HTML headers
    const sendHtml = (content) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(content);
    };

    /* ROUTES */
    
    // Home / Root
    if (req.method === 'GET' && req.url === '/') {
        if (userEmail) {
            res.writeHead(302, { 'Location': '/dashboard' });
            return res.end();
        }
        return sendHtml(loginForm());
    }

    // Login
    if (req.method === 'GET' && req.url === '/login') return sendHtml(loginForm());
    if (req.method === 'POST' && req.url === '/login') {
        const { email, password } = await parseBody(req);
        const users = loadUsers();
        const user = users[email];

        if (!user || user.passwordHash !== hashPassword(password)) {
            return sendHtml(loginForm('Invalid email or password', email));
        }

        const sid = generateSessionId();
        sessions[sid] = { email, expiresAt: Date.now() + SESSION_TTL };
        res.setHeader('Set-Cookie', `sessionId=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
        res.writeHead(302, { 'Location': '/dashboard' });
        return res.end();
    }

    // Signup
    if (req.method === 'GET' && req.url === '/signup') return sendHtml(signupForm());
    if (req.method === 'POST' && req.url === '/signup') {
        const { email, password } = await parseBody(req);
        const users = loadUsers();

        const errors = [
            !validateEmail(email) && 'Invalid email format.',
            ...validatePassword(password),
            users[email] && 'Account already exists.'
        ].filter(Boolean);

        if (errors.length) return sendHtml(signupForm(errors.join(' '), email));

        users[email] = { email, passwordHash: hashPassword(password) };
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

        const sid = generateSessionId();
        sessions[sid] = { email, expiresAt: Date.now() + SESSION_TTL };
        res.setHeader('Set-Cookie', `sessionId=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
        res.writeHead(302, { 'Location': '/dashboard' });
        return res.end();
    }

    // Dashboard
    if (req.method === 'GET' && req.url === '/dashboard') {
        if (!userEmail) {
            res.writeHead(302, { 'Location': '/login' });
            return res.end();
        }
        return sendHtml(dashboardPage(userEmail));
    }

    // Logout
    if (req.method === 'POST' && req.url === '/logout') {
        if (sessionId) delete sessions[sessionId];
        res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
        res.writeHead(302, { 'Location': '/login' });
        return res.end();
    }

    // Forgot Password
    if (req.method === 'GET' && req.url === '/forgot-password') return sendHtml(forgotPasswordForm());
    if (req.method === 'POST' && req.url === '/forgot-password') {
        const { email } = await parseBody(req);
        const users = loadUsers();
        if (users[email]) {
            const token = generateResetToken();
            users[email].resetToken = token;
            users[email].resetExpiresAt = Date.now() + (30 * 60 * 1000); // 30 mins
            fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
            return sendHtml(forgotPasswordForm(`Reset Link: <br><code>/reset-password?token=${token}</code>`));
        }
        return sendHtml(forgotPasswordForm('If an account exists, a reset link was generated.'));
    }

    // Reset Password
    if (req.method === 'GET' && req.url.startsWith('/reset-password')) {
        const token = new URL(req.url, 'http://x').searchParams.get('token');
        const users = loadUsers();
        const user = Object.values(users).find(u => u.resetToken === token && u.resetExpiresAt > Date.now());
        if (!user) return sendHtml(renderPage('Error', '<p>Invalid or expired link.</p>'));
        return sendHtml(resetPasswordForm(token));
    }
    if (req.method === 'POST' && req.url === '/reset-password') {
        const { token, password } = await parseBody(req);
        const users = loadUsers();
        const user = Object.values(users).find(u => u.resetToken === token && u.resetExpiresAt > Date.now());

        if (!user) return sendHtml(renderPage('Error', '<p>Session expired.</p>'));

        const passErrors = validatePassword(password);
        if (passErrors.length) return sendHtml(resetPasswordForm(token, passErrors.join(' ')));

        user.passwordHash = hashPassword(password);
        delete user.resetToken;
        delete user.resetExpiresAt;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.writeHead(302, { 'Location': '/login' });
        return res.end();
    }

    // 404
    res.statusCode = 404;
    sendHtml(renderPage('Not Found', '<h1>404</h1><p>The page you are looking for does not exist.</p>'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ExecBrief running on port ${PORT}`));