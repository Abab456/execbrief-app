const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const users = {};
const sessions = {};

function renderPage(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="/public/styles.css">
</head>
<body>
<div class="container">
<h1>${title}</h1>
${body}
</div>
</body>
</html>`;
}

function parseCookies(header) {
  const list = {};
  if (!header) return list;
  header.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const value = decodeURIComponent(parts.join('='));
    list[key] = value;
  });
  return list;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) req.connection.destroy();
    });
    req.on('end', () => {
      const params = new URLSearchParams(data);
      const result = {};
      for (const [k, v] of params) result[k] = v;
      resolve(result);
    });
  });
}

function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function validateEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function validatePassword(password) {
  const errors = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters long.');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number.');
  return errors;
}

function signupForm(errors = [], email = '') {
  const errorHtml = errors.length ? `<ul class="errors">${errors.map(e => `<li>${e}</li>`).join('')}</ul>` : '';
  const body = `
<p>Create an account to access your ExecBrief dashboard.</p>
${errorHtml}
<form method="POST" action="/signup">
<label for="email">Email</label>
<input type="email" id="email" name="email" value="${email.replace(/"/g, '&quot;')}" required autocomplete="email" autofocus>
<label for="password">Password</label>
<input type="password" id="password" name="password" required pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}" title="At least 8 characters, one uppercase letter and one number." autocomplete="new-password">
<small>Use at least 8 characters, including an uppercase letter and a number.</small>
<button type="submit">Create your account</button>
</form>
<p>Already have an account? <a href="/login">Log in</a></p>
`;
  return renderPage('Sign Up', body);
}

function loginForm(errors = [], email = '') {
  const errorHtml = errors.length ? `<ul class="errors">${errors.map(e => `<li>${e}</li>`).join('')}</ul>` : '';
  const body = `
<p>Welcome back! Log in to continue.</p>
${errorHtml}
<form method="POST" action="/login">
<label for="email">Email</label>
<input type="email" id="email" name="email" value="${email.replace(/"/g, '&quot;')}" required autocomplete="email" autofocus>
<label for="password">Password</label>
<input type="password" id="password" name="password" required autocomplete="current-password">
<button type="submit">Log in</button>
</form>
<p>Don’t have an account? <a href="/signup">Sign up</a></p>
`;
  return renderPage('Log In', body);
}

function dashboardPage(email) {
  const body = `
<p>Welcome, ${email}! You are now logged in.</p>
<p>This is your ExecBrief dashboard. Build something great!</p>
<form method="POST" action="/logout">
<button type="submit">Log out</button>
</form>
`;
  return renderPage('Dashboard', body);
}

function serveStatic(req, res) {
  const requestedPath = decodeURIComponent(req.url.replace('/public', ''));
  const safePath = path.normalize(requestedPath).replace(/^\.\.(\/|\\)/, '');
  const filePath = path.join(__dirname, 'public', safePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.sessionId;
  const userEmail = sessionId && sessions[sessionId];

  if (req.url.startsWith('/public/')) {
    return serveStatic(req, res);
  }

  if (req.method === 'GET' && req.url === '/') {
    res.statusCode = 302;
    res.setHeader('Location', userEmail ? '/dashboard' : '/signup');
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/signup') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(signupForm());
  }

  if (req.method === 'POST' && req.url === '/signup') {
    const body = await parseBody(req);
    const email = body.email || '';
    const password = body.password || '';
    const errors = [];
    if (!validateEmail(email)) errors.push('Please enter a valid email address.');
    errors.push(...validatePassword(password));
    if (users[email]) errors.push('An account with this email already exists.');
    if (errors.length) {
      res.setHeader('Content-Type', 'text/html');
      return res.end(signupForm(errors, email));
    }
    users[email] = { email, passwordHash: hashPassword(password) };
    const sid = generateSessionId();
    sessions[sid] = email;
    res.setHeader('Set-Cookie', 'sessionId=' + sid + '; HttpOnly; Path=/; Max-Age=86400');
    res.statusCode = 302;
    res.setHeader('Location', '/dashboard');
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/login') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(loginForm());
  }

  if (req.method === 'POST' && req.url === '/login') {
    const body = await parseBody(req);
    const email = body.email || '';
    const password = body.password || '';
    const user = users[email];
    if (!user || user.passwordHash !== hashPassword(password)) {
      res.setHeader('Content-Type', 'text/html');
      return res.end(loginForm(['Invalid email or password.'], email));
    }
    const sid = generateSessionId();
    sessions[sid] = email;
    res.setHeader('Set-Cookie', 'sessionId=' + sid + '; HttpOnly; Path=/; Max-Age=86400');
    res.statusCode = 302;
    res.setHeader('Location', '/dashboard');
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/dashboard') {
    if (!userEmail) {
      res.statusCode = 302;
      res.setHeader('Location', '/login');
      return res.end();
    }
    res.setHeader('Content-Type', 'text/html');
    return res.end(dashboardPage(userEmail));
  }

  if (req.method === 'POST' && req.url === '/logout') {
    if (sessionId) delete sessions[sessionId];
    res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; Path=/; Max-Age=0');
    res.statusCode = 302;
    res.setHeader('Location', '/login');
    return res.end();
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Page not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});