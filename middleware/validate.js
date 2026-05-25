// middleware/validate.js – Input validation helpers
// Each function returns an array of error strings. Empty array = valid.

function validateLogin({ email, password }) {
  const errors = [];
  if (!email    || !email.trim())    errors.push('Please enter your email.');
  else if (!isValidEmail(email))     errors.push('Please enter a valid email.');
  if (!password || !password.trim()) errors.push('Please enter your password.');
  return errors;
}

function validateForgotPassword({ email }) {
  const errors = [];
  if (!email || !email.trim())   errors.push('Please enter your email.');
  else if (!isValidEmail(email)) errors.push('Please enter a valid email.');
  return errors;
}

function validateResetPassword({ password, confirmPassword }) {
  const errors = [];
  if (!password || !password.trim())    errors.push('Please enter a new password.');
  else if (password.length < 8)         errors.push('Password must have at least 8 characters.');
  if (password !== confirmPassword)     errors.push('The two passwords do not match.');
  return errors;
}

function validateProfileUpdate({ name, email }) {
  const errors = [];
  if (!name  || name.trim().length < 2) errors.push('Please enter your full name.');
  if (!email || !isValidEmail(email))   errors.push('Please enter a valid email.');
  return errors;
}

function validateChangePassword({ currentPassword, newPassword, confirmNewPassword }) {
  const errors = [];
  if (!currentPassword)                   errors.push('Please enter your current password.');
  if (!newPassword || newPassword.length < 8) errors.push('Your new password must have at least 8 characters.');
  if (newPassword !== confirmNewPassword) errors.push('The new passwords do not match.');
  if (currentPassword === newPassword)    errors.push('Your new password must be different from the old one.');
  return errors;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = {
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateProfileUpdate,
  validateChangePassword
};
