// server.js — Entry point. Run with: node server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const flash   = require('connect-flash');
const path    = require('path');
const cors    = require('cors');
require('./db');

const authRoutes    = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes   = require('./routes/admin');
const gradesRouter  = require('./routes/grades');
const apiRoutes     = require('./routes/api');
const studentApiRoutes = require('./routes/studentApi');

const { getSessionInfo } = require('./controllers/settingsController');
const { requireAuth } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Parse request bodies ──────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// ── Sessions ──────────────────────────────────────────
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure:   false,
        maxAge:   1000 * 60 * 60 * 24
    }
}));

// ── Flash messages ────────────────────────────────────
app.use(flash());

// ── Serve static files from /public ──────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Direct page routes (fixes 404 on navigation) ─────
app.get('/dashboardtrial.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboardtrial.html'));
});
app.get('/MYCOURSES.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'MYCOURSES.html'));
});
app.get('/analytics.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});
app.get('/analytics-soen287.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics-soen287.html'));
});
app.get('/analytics-comp249.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics-comp249.html'));
});
app.get('/analytics-engr233.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics-engr233.html'));
});
app.get('/analytics-soen228.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'analytics-soen228.html'));
});
app.get('/detailsSOEN287.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'detailsSOEN287.html'));
});
app.get('/detailscomp249.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'detailscomp249.html'));
});
app.get('/detailsENGR233.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'detailsENGR233.html'));
});
app.get('/detailsSOEN228.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'detailsSOEN228.html'));
});
app.get('/myaccount.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'myaccount.html'));
});
app.get('/Login_s.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Login_s.html'));
});
app.get('/login_ad.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login_ad.html'));
});
app.get('/admin_dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin_dashboard.html'));
});

// ── Routes ────────────────────────────────────────────
app.use('/auth',       authRoutes);
app.use('/student',    studentRoutes);
app.use('/admin',      adminRoutes);
app.use('/api',        apiRoutes);
app.use('/api/student', studentApiRoutes);
app.use('/api/grades', gradesRouter);

// ── Session info endpoint ─────────────────────────────
app.get('/api/session', requireAuth, getSessionInfo);

// ── Root → redirect to student login ─────────────────
app.get('/', (req, res) => res.redirect('/auth/login-student'));

// ── 404 handler ───────────────────────────────────────
app.use((req, res) => {
    res.status(404).send(`
        <h2 style="font-family:sans-serif">404 — Page Not Found</h2>
        <p style="font-family:sans-serif">
            The path <code>${req.path}</code> does not exist.
        </p>
        <a href="/" style="font-family:sans-serif">Back to Login</a>
    `);
});

// ── Start server ──────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n✅ Smart Course Companion running`);
    console.log(`   Student login → http://localhost:${PORT}/auth/login-student`);
    console.log(`   Admin login   → http://localhost:${PORT}/auth/login-admin\n`);
});
