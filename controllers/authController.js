// controllers/authController.js
const crypto  = require('crypto');
const db      = require('../config/db');
const mailer  = require('../config/mailer');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const { validateLogin, validateForgotPassword, validateResetPassword } = require('../middleware/validate');

exports.getStudentLogin = (req, res) => {
  res.sendFile('Login_s.html', { root: './public' });
};

exports.postStudentLogin = async (req, res) => {
  const { email, password } = req.body;

  const errors = validateLogin({ email, password });
  if (errors.length) return res.redirect(`/auth/login-student?error=${encodeURIComponent(errors[0])}`);

  try {
    const [rows] = await db.query('SELECT * FROM students WHERE email = ?', [email.trim().toLowerCase()]);
    if (!rows.length) return res.redirect('/auth/login-student?error=Wrong+email+or+password.');

    const passwordCheck = await verifyPassword(password, rows[0].password);
    const match = passwordCheck.match;
    if (!match) return res.redirect('/auth/login-student?error=Wrong+email+or+password.');

    if (passwordCheck.needsRehash) {
      const upgradedHash = await hashPassword(password);
      await db.query('UPDATE students SET password = ? WHERE id = ?', [upgradedHash, rows[0].id]);
    }

    req.session.userId    = rows[0].id;
    req.session.userEmail = rows[0].email;
    req.session.userName  = rows[0].name;
    req.session.role      = 'student';

    res.redirect('/student/dashboard');
  } catch (err) {
    console.error('Student login error:', err);
    res.redirect('/auth/login-student?error=Something+went+wrong.+Please+try+again.');
  }
};

exports.getAdminLogin = (req, res) => {
  res.sendFile('login_ad.html', { root: './public' });
};

exports.postAdminLogin = async (req, res) => {
  const { email, password } = req.body;

  const errors = validateLogin({ email, password });
  if (errors.length) return res.redirect(`/auth/login-admin?error=${encodeURIComponent(errors[0])}`);

  try {
    const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email.trim().toLowerCase()]);
    if (!rows.length) return res.redirect('/auth/login-admin?error=Wrong+email+or+password.');

    const passwordCheck = await verifyPassword(password, rows[0].password);
    const match = passwordCheck.match;
    if (!match) return res.redirect('/auth/login-admin?error=Wrong+email+or+password.');

    if (passwordCheck.needsRehash) {
      const upgradedHash = await hashPassword(password);
      await db.query('UPDATE admins SET password = ? WHERE id = ?', [upgradedHash, rows[0].id]);
    }

    req.session.userId    = rows[0].id;
    req.session.userEmail = rows[0].email;
    req.session.userName  = rows[0].name;
    req.session.role      = 'admin';

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Admin login error:', err);
    res.redirect('/auth/login-admin?error=Something+went+wrong.+Please+try+again.');
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/auth/login-student');
  });
};

exports.getForgotPassword = (req, res) => {
  res.sendFile('forgot_password.html', { root: './public' });
};

exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;

  const errors = validateForgotPassword({ email });
  if (errors.length) return res.redirect(`/auth/forgot-password?error=${encodeURIComponent(errors[0])}`);

  try {
    const normalizedEmail = email.trim().toLowerCase();

    const [students] = await db.query('SELECT id FROM students WHERE email = ?', [normalizedEmail]);
    const [admins]   = await db.query('SELECT id FROM admins   WHERE email = ?', [normalizedEmail]);

    if (!students.length && !admins.length) {
      return res.redirect('/auth/forgot-password?sent=true');
    }

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.query('DELETE FROM password_resets WHERE email = ?', [normalizedEmail]);
    await db.query('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
                   [normalizedEmail, token, expiresAt]);

    await mailer.sendPasswordResetEmail(normalizedEmail, token);

    res.redirect('/auth/forgot-password?sent=true');
  } catch (err) {
    console.error('Forgot password error:', err);
    res.redirect('/auth/forgot-password?error=Something+went+wrong.+Please+try+again.');
  }
};

exports.getResetPassword = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/auth/forgot-password?error=Missing+reset+link.');

  try {
    const [rows] = await db.query(
      'SELECT id FROM password_resets WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    if (!rows.length) {
      return res.redirect('/auth/forgot-password?error=This+reset+link+expired.+Please+request+a+new+one.');
    }
    res.sendFile('Pass_reset.html', { root: './public' });
  } catch (err) {
    console.error('Get reset password error:', err);
    res.redirect('/auth/forgot-password?error=Something+went+wrong.');
  }
};

exports.postResetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token) return res.redirect('/auth/forgot-password?error=Missing+reset+token.');

  const errors = validateResetPassword({ password, confirmPassword });
  if (errors.length) {
    return res.redirect(`/auth/reset-password?token=${token}&error=${encodeURIComponent(errors[0])}`);
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    if (!rows.length) return res.redirect('/auth/forgot-password?error=This+reset+link+expired.');

    const hashed = await hashPassword(password);
    const email  = rows[0].email;

    await db.query('UPDATE students SET password = ? WHERE email = ?', [hashed, email]);
    await db.query('UPDATE admins   SET password = ? WHERE email = ?', [hashed, email]);

    await db.query('DELETE FROM password_resets WHERE token = ?', [token]);

    res.redirect('/auth/login-student?success=Password+updated.+You+can+log+in+now.');
  } catch (err) {
    console.error('Reset password error:', err);
    res.redirect(`/auth/reset-password?token=${token}&error=Something+went+wrong.`);
  }
};

exports.getStudentRegister = (req, res) => {
  res.sendFile('register_student.html', { root: './public' });
};

exports.postStudentRegister = async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (!email || !password) {
    return res.redirect('/auth/register-student?error=All+fields+are+required.');
  }
  if (password !== confirmPassword) {
    return res.redirect('/auth/register-student?error=Passwords+do+not+match.');
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const generatedStudentNumber = `S${Date.now()}`;

    const [existing] = await db.query('SELECT id FROM students WHERE email = ?', [normalizedEmail]);
    if (existing.length) {
      return res.redirect('/auth/register-student?error=Email+already+registered.');
    }

    const [existingAdmin] = await db.query('SELECT id FROM admins WHERE email = ?', [normalizedEmail]);
    if (existingAdmin.length) {
      return res.redirect('/auth/register-student?error=Email+already+registered.');
    }

    const hashed = await hashPassword(password);
    await db.query(
      'INSERT INTO students (name, email, password, student_number) VALUES (?, ?, ?, ?)',
      ['Student', normalizedEmail, hashed, generatedStudentNumber]
    );

    res.redirect('/auth/login-student?success=Account+created!+You+can+now+log+in.');
  } catch (err) {
    console.error('Register error:', err);
    res.redirect('/auth/register-student?error=Something+went+wrong.+Please+try+again.');
  }
};
