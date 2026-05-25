async function sendPasswordResetEmail(toEmail, token) {
  const resetLink = `http://localhost:3000/auth/reset-password?token=${token}`;
  console.log(`\n--- PASSWORD RESET LINK for ${toEmail} ---`);
  console.log(resetLink);
  console.log(`------------------------------------------\n`);
}

module.exports = { sendPasswordResetEmail };