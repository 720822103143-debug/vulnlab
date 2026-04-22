// ============================================================
// VulnLab - Deliberately Vulnerable Web Application
// FOR EDUCATIONAL PURPOSES ONLY - LOCAL USE ONLY
// ============================================================

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3000;

// ============================================================
// VULNERABILITY: Hardcoded credentials in source code
// ============================================================
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const SECRET_KEY = 'supersecretkey123'; // weak secret
const DB_BACKUP_PASSWORD = 'password';

// ============================================================
// VULNERABILITY: CORS misconfiguration - allow all origins
// ============================================================
app.use(cors({ origin: '*', credentials: true }));

// ============================================================
// VULNERABILITY: No security headers (CSP, X-Frame-Options, etc.)
// ============================================================
// (No helmet or security middleware used intentionally)

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================================
// VULNERABILITY: Insecure session configuration
// ============================================================
app.use(session({
  secret: 'weak_secret',      // weak secret
  resave: true,
  saveUninitialized: true,
  cookie: {
    httpOnly: false,          // accessible via JS (XSS can steal cookies)
    secure: false,            // works over HTTP
    maxAge: 1000 * 60 * 60 * 24 * 365  // 1 year - no expiration
  }
}));

// ============================================================
// VULNERABILITY: Directory listing enabled for uploads
// ============================================================
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  index: false,
  dotfiles: 'allow'
}));
app.use('/uploads', (req, res, next) => {
  const dir = path.join(__dirname, 'public/uploads');
  if (req.path === '/' || req.path === '') {
    const files = fs.readdirSync(dir);
    res.send(`<html><body><h2>Index of /uploads</h2><ul>${files.map(f => `<li><a href="/uploads/${f}">${f}</a></li>`).join('')}</ul></body></html>`);
    return;
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// VULNERABILITY: File upload - no type/size validation
// ============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename: (req, file, cb) => cb(null, file.originalname) // keeps original name, allows path traversal
});
const upload = multer({ storage }); // no file type or size limits

// ============================================================
// SQLite Database Setup (in-memory for demo, persisted to file)
// ============================================================
let db;
const DB_PATH = path.join(__dirname, 'data/vulnlab.db');

async function initDB() {
  const SQL = await initSqlJs();
  
  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    email TEXT,
    role TEXT DEFAULT 'user',
    bio TEXT,
    balance REAL DEFAULT 100.0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    content TEXT,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT,
    to_user TEXT,
    content TEXT,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    description TEXT
  )`);

  // Seed sample data
  const userCount = db.exec("SELECT COUNT(*) as c FROM users")[0].values[0][0];
  if (userCount === 0) {
    db.run(`INSERT INTO users (username, password, email, role, bio, balance) VALUES 
      ('admin', 'admin123', 'admin@vulnlab.local', 'admin', 'Site administrator', 9999.99),
      ('alice', 'password123', 'alice@example.com', 'user', 'Hi I am Alice!', 250.00),
      ('bob', 'bob1234', 'bob@example.com', 'user', 'Bob here. I love security!', 175.50),
      ('charlie', 'charlie99', 'charlie@example.com', 'user', 'Charlie checking in', 80.00),
      ('moderator', 'mod_pass', 'mod@vulnlab.local', 'moderator', 'Content moderator', 300.00)
    `);
    db.run(`INSERT INTO comments (user_id, username, content, created_at) VALUES
      (2, 'alice', 'Great platform for learning!', datetime('now')),
      (3, 'bob', 'This is really helpful for bug bounty practice.', datetime('now')),
      (4, 'charlie', 'Found my first XSS here. Thanks!', datetime('now'))
    `);
    db.run(`INSERT INTO products (name, price, description) VALUES
      ('Security Course', 49.99, 'Learn ethical hacking'),
      ('VPN Subscription', 9.99, 'Monthly VPN plan'),
      ('Bug Bounty Guide', 29.99, 'Step by step bug bounty guide')
    `);
  }

  saveDB();
  console.log('[DB] Database initialized');
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ============================================================
// HELPER
// ============================================================
function isLoggedIn(req) {
  return !!req.session.user;
}

// ============================================================
// PAGES
// ============================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public/register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'public/profile.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, 'public/upload.html')));

// ============================================================
// AUTH ROUTES
// ============================================================

// VULNERABILITY: SQL Injection in login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // !! INTENTIONAL SQL INJECTION VULNERABILITY !!
  // Try: username = ' OR '1'='1' --
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  
  try {
    const result = db.exec(query);
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0];
      const cols = result[0].columns;
      const user = {};
      cols.forEach((c, i) => user[c] = row[i]);
      
      req.session.user = { id: user.id, username: user.username, role: user.role };
      
      // VULNERABILITY: Insecure cookie with sensitive data
      res.cookie('user_data', JSON.stringify({ id: user.id, username: user.username, role: user.role }), {
        httpOnly: false // readable by JS
      });
      res.cookie('session_token', `token_${user.id}_${user.username}`, { httpOnly: false });

      res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (e) {
    // VULNERABILITY: Debug mode - exposes SQL errors
    res.status(500).json({ success: false, error: e.message, query: query });
  }
});

// VULNERABILITY: Weak password validation, no rate limiting
app.post('/api/register', (req, res) => {
  const { username, password, email } = req.body;
  // No rate limiting, no CAPTCHA, accepts any password length
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  // Passwords as short as 1 character accepted
  try {
    db.run(`INSERT INTO users (username, password, email) VALUES ('${username}', '${password}', '${email}')`);
    saveDB();
    res.json({ success: true, message: 'Registered!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('user_data');
  res.clearCookie('session_token');
  res.json({ success: true });
});

// ============================================================
// USER API - IDOR VULNERABILITIES
// ============================================================

// VULNERABILITY: IDOR - any user can access any user's data by changing the ID
app.get('/api/users/:id', (req, res) => {
  // No authorization check - just returns any user's data
  const result = db.exec(`SELECT * FROM users WHERE id = ${req.params.id}`);
  if (result.length > 0 && result[0].values.length > 0) {
    const cols = result[0].columns;
    const row = result[0].values[0];
    const user = {};
    cols.forEach((c, i) => user[c] = row[i]);
    // VULNERABILITY: Sensitive data exposure - returns password too!
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// VULNERABILITY: Update any user's profile without authorization check
app.put('/api/users/:id', (req, res) => {
  const { bio, email } = req.body;
  db.run(`UPDATE users SET bio = '${bio}', email = '${email}' WHERE id = ${req.params.id}`);
  saveDB();
  res.json({ success: true, message: 'Profile updated' });
});

// VULNERABILITY: Open API - lists all users with sensitive data
app.get('/api/users', (req, res) => {
  // No authentication required
  const result = db.exec("SELECT * FROM users");
  if (result.length > 0) {
    const cols = result[0].columns;
    const users = result[0].values.map(row => {
      const u = {};
      cols.forEach((c, i) => u[c] = row[i]);
      return u;
    });
    res.json(users); // includes passwords!
  } else {
    res.json([]);
  }
});

// ============================================================
// COMMENTS - STORED XSS
// ============================================================

// VULNERABILITY: Stored XSS - comment content not sanitized
app.post('/api/comments', (req, res) => {
  const { content } = req.body;
  const user = req.session.user || { id: 0, username: 'anonymous' };
  // !! XSS payload stored directly: <script>alert(1)</script>
  db.run(`INSERT INTO comments (user_id, username, content, created_at) VALUES (${user.id}, '${user.username}', '${content.replace(/'/g, "''")}', datetime('now'))`);
  saveDB();
  res.json({ success: true });
});

app.get('/api/comments', (req, res) => {
  const result = db.exec("SELECT * FROM comments ORDER BY id DESC");
  if (result.length > 0) {
    const cols = result[0].columns;
    const comments = result[0].values.map(row => {
      const c = {};
      cols.forEach((col, i) => c[col] = row[i]);
      return c;
    });
    res.json(comments);
  } else {
    res.json([]);
  }
});

// ============================================================
// SEARCH - REFLECTED XSS
// ============================================================

// VULNERABILITY: Reflected XSS - q param reflected in response without encoding
app.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  // !! q is reflected directly into HTML - try: <script>alert('XSS')</script>
  const result = db.exec(`SELECT * FROM products WHERE name LIKE '%${q}%' OR description LIKE '%${q}%'`);
  let products = [];
  if (result.length > 0) {
    const cols = result[0].columns;
    products = result[0].values.map(row => {
      const p = {}; cols.forEach((c, i) => p[c] = row[i]); return p;
    });
  }
  // Returns raw query in response - reflected XSS
  res.json({ query: q, results: products, message: `Search results for: ${q}` });
});

// ============================================================
// FILE UPLOAD - No validation
// ============================================================

// VULNERABILITY: No file type, extension, or content validation
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    success: true,
    filename: req.file.originalname,
    path: `/uploads/${req.file.originalname}`,
    size: req.file.size
  });
});

// ============================================================
// ADMIN PANEL - Missing Access Control
// ============================================================

// VULNERABILITY: No proper auth check for admin actions
app.get('/api/admin/users', (req, res) => {
  // Should check req.session.user.role === 'admin' but doesn't properly enforce it
  const result = db.exec("SELECT * FROM users");
  if (result.length > 0) {
    const cols = result[0].columns;
    const users = result[0].values.map(row => {
      const u = {}; cols.forEach((c, i) => u[c] = row[i]); return u;
    });
    res.json(users);
  } else {
    res.json([]);
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  // VULNERABILITY: No authorization check - anyone can delete users
  db.run(`DELETE FROM users WHERE id = ${req.params.id}`);
  saveDB();
  res.json({ success: true, message: `User ${req.params.id} deleted` });
});

app.get('/api/admin/logs', (req, res) => {
  // VULNERABILITY: Sensitive data exposure - no auth required
  res.json({
    server: 'VulnLab v1.0',
    debug: true,
    secret_key: SECRET_KEY,
    db_password: DB_BACKUP_PASSWORD,
    admin_credentials: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    sessions: 'stored in memory',
    uptime: process.uptime()
  });
});

// ============================================================
// OPEN REDIRECT
// ============================================================

// VULNERABILITY: Open redirect - redirects to any URL
app.get('/redirect', (req, res) => {
  const url = req.query.url;
  // No validation of the redirect URL - can redirect to malicious sites
  res.redirect(url || '/');
});

// ============================================================
// CSRF - No token protection
// ============================================================

// VULNERABILITY: No CSRF token - state-changing requests accept cross-origin form posts
app.post('/api/change-password', (req, res) => {
  const { user_id, new_password } = req.body;
  // No CSRF token check, no current password required
  db.run(`UPDATE users SET password = '${new_password}' WHERE id = ${user_id}`);
  saveDB();
  res.json({ success: true, message: 'Password changed' });
});

app.post('/api/transfer', (req, res) => {
  const { from_id, to_id, amount } = req.body;
  // VULNERABILITY: CSRF - no token, no auth check
  db.run(`UPDATE users SET balance = balance - ${amount} WHERE id = ${from_id}`);
  db.run(`UPDATE users SET balance = balance + ${amount} WHERE id = ${to_id}`);
  saveDB();
  res.json({ success: true, message: `Transferred $${amount}` });
});

// ============================================================
// SESSION INFO - Sensitive Data Exposure
// ============================================================
app.get('/api/session', (req, res) => {
  // VULNERABILITY: Exposes full session data
  res.json({ session: req.session, cookies: req.cookies });
});

// ============================================================
// DEBUG ENDPOINT - Security Misconfiguration
// ============================================================
app.get('/api/debug', (req, res) => {
  // VULNERABILITY: Debug mode exposes environment info
  res.json({
    node_version: process.version,
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
    memory: process.memoryUsage(),
    secret: SECRET_KEY,
    admin_pass: ADMIN_PASSWORD
  });
});

// ============================================================
// MESSAGES - IDOR
// ============================================================
app.get('/api/messages/:username', (req, res) => {
  // VULNERABILITY: IDOR - no auth check, any username's messages accessible
  const result = db.exec(`SELECT * FROM messages WHERE to_user = '${req.params.username}' OR from_user = '${req.params.username}'`);
  let messages = [];
  if (result.length > 0) {
    const cols = result[0].columns;
    messages = result[0].values.map(row => { const m = {}; cols.forEach((c,i)=>m[c]=row[i]); return m; });
  }
  res.json(messages);
});

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('  VulnLab - Vulnerable Web App for Security Training');
    console.log(`${'='.repeat(60)}`);
    console.log(`  Running at: http://localhost:${PORT}`);
    console.log(`  Admin panel: http://localhost:${PORT}/admin`);
    console.log(`  Debug info: http://localhost:${PORT}/api/debug`);
    console.log(`${'='.repeat(60)}`);
    console.log('  ⚠️  FOR EDUCATIONAL USE ONLY - DO NOT EXPOSE PUBLICLY');
    console.log(`${'='.repeat(60)}\n`);
  });
});
