function isApiRequest(req) {
  const accept = String(req.headers.accept || '');
  return req.originalUrl.startsWith('/api/') || accept.includes('application/json');
}

function sendAuthFailure(req, res, redirectPath, options) {
  if (isApiRequest(req)) {
    return res.status(options.status).json({ error: options.error });
  }

  return res.redirect(redirectPath);
}

function requireStudent(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'student') {
    return next();
  }

  const isLoggedIn = req.session && req.session.userId;
  return sendAuthFailure(req, res, '/auth/login-student', {
    status: isLoggedIn ? 403 : 401,
    error: isLoggedIn ? 'Student access required.' : 'Please log in as a student.'
  });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  }

  const isLoggedIn = req.session && req.session.userId;
  return sendAuthFailure(req, res, '/auth/login-admin', {
    status: isLoggedIn ? 403 : 401,
    error: isLoggedIn ? 'Admin access required.' : 'Please log in as an admin.'
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }

  return sendAuthFailure(req, res, '/auth/login-student', {
    status: 401,
    error: 'Please log in to continue.'
  });
}

// Prevents already-logged-in users from seeing login pages
function redirectIfLoggedIn(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin/dashboard' : '/student/dashboard');
  }

  next();
}

module.exports = { requireStudent, requireAdmin, requireAuth, redirectIfLoggedIn };
