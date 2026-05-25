// controllers/settingsController.js
// Handles: profile GET/POST and change-password for students and admins

const db     = require('../config/db');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const { validateProfileUpdate, validateChangePassword } = require('../middleware/validate');

// ── GET /student/settings ─────────────────────────────────────
exports.getStudentSettings = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, student_number, program, current_term, created_at FROM students WHERE id = ?',
      [req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student account not found.' });
    res.json({ student: rows[0] });
  } catch (err) {
    console.error('getStudentSettings error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// ── POST /student/settings ────────────────────────────────────
exports.updateStudentSettings = async (req, res) => {
  const { name, email, student_number, program, current_term } = req.body;

  const errors = validateProfileUpdate({ name, email });
  if (errors.length) return res.status(400).json({ error: errors[0] });

  try {
    const normalizedEmail = email.trim().toLowerCase();

    // Make sure the email isn't taken by a different student
    const [existing] = await db.query(
      'SELECT id FROM students WHERE email = ? AND id != ?',
      [normalizedEmail, req.session.userId]
    );
    if (existing.length) return res.status(400).json({ error: 'That email is already being used.' });

    const [existingAdmin] = await db.query(
      'SELECT id FROM admins WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    if (existingAdmin.length) return res.status(400).json({ error: 'That email is already being used.' });

    await db.query(
      'UPDATE students SET name=?, email=?, student_number=?, program=?, current_term=? WHERE id=?',
      [
        name.trim(), normalizedEmail,
        student_number || null, program || null, current_term || null,
        req.session.userId
      ]
    );

    req.session.userName  = name.trim();
    req.session.userEmail = normalizedEmail;

    res.json({ success: 'Your profile was updated.' });
  } catch (err) {
    console.error('updateStudentSettings error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// ── POST /student/change-password ────────────────────────────
exports.changeStudentPassword = async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  const errors = validateChangePassword({ currentPassword, newPassword, confirmNewPassword });
  if (errors.length) return res.status(400).json({ error: errors[0] });

  try {
    const [rows] = await db.query('SELECT password FROM students WHERE id = ?', [req.session.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found.' });

    const passwordCheck = await verifyPassword(currentPassword, rows[0].password);
    const isMatch = passwordCheck.match;
    if (!isMatch) return res.status(400).json({ error: 'Your current password is incorrect.' });

    const newHash = await hashPassword(newPassword);
    await db.query('UPDATE students SET password = ? WHERE id = ?', [newHash, req.session.userId]);

    res.json({ success: 'Your password was changed.' });
  } catch (err) {
    console.error('changeStudentPassword error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// ── GET /admin/settings ───────────────────────────────────────
exports.getAdminSettings = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, department, role, created_at FROM admins WHERE id = ?',
      [req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Admin account not found.' });
    res.json({ admin: rows[0] });
  } catch (err) {
    console.error('getAdminSettings error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// ── POST /admin/settings ──────────────────────────────────────
exports.updateAdminSettings = async (req, res) => {
  const { name, email, department } = req.body;

  const errors = validateProfileUpdate({ name, email });
  if (errors.length) return res.status(400).json({ error: errors[0] });

  try {
    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await db.query(
      'SELECT id FROM admins WHERE email = ? AND id != ?',
      [normalizedEmail, req.session.userId]
    );
    if (existing.length) return res.status(400).json({ error: 'That email is already being used.' });

    const [existingStudent] = await db.query(
      'SELECT id FROM students WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    if (existingStudent.length) return res.status(400).json({ error: 'That email is already being used.' });

    await db.query(
      'UPDATE admins SET name=?, email=?, department=? WHERE id=?',
      [name.trim(), normalizedEmail, department || null, req.session.userId]
    );

    req.session.userName  = name.trim();
    req.session.userEmail = normalizedEmail;

    res.json({ success: 'Your profile was updated.' });
  } catch (err) {
    console.error('updateAdminSettings error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// ── POST /admin/change-password ───────────────────────────────
exports.changeAdminPassword = async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  const errors = validateChangePassword({ currentPassword, newPassword, confirmNewPassword });
  if (errors.length) return res.status(400).json({ error: errors[0] });

  try {
    const [rows] = await db.query('SELECT password FROM admins WHERE id = ?', [req.session.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Account not found.' });

    const passwordCheck = await verifyPassword(currentPassword, rows[0].password);
    const isMatch = passwordCheck.match;
    if (!isMatch) return res.status(400).json({ error: 'Your current password is incorrect.' });

    const newHash = await hashPassword(newPassword);
    await db.query('UPDATE admins SET password = ? WHERE id = ?', [newHash, req.session.userId]);

    res.json({ success: 'Your password was changed.' });
  } catch (err) {
    console.error('changeAdminPassword error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};

// ── GET /api/session ──────────────────────────────────────────
// Called by HTML pages to know who is currently logged in
exports.getSessionInfo = (req, res) => {
  res.json({
    userId:    req.session.userId,
    userName:  req.session.userName,
    userEmail: req.session.userEmail,
    role:      req.session.role
  });
};
