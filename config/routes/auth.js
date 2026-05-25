// routes/auth.js – mounted at /auth in server.js
const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/authController');
const { redirectIfLoggedIn } = require('../middleware/auth');

router.get( '/login-student',   redirectIfLoggedIn, ctrl.getStudentLogin);
router.post('/login-student',                       ctrl.postStudentLogin);
router.get( '/login-admin',     redirectIfLoggedIn, ctrl.getAdminLogin);
router.post('/login-admin',                         ctrl.postAdminLogin);
router.get( '/logout',                              ctrl.logout);
router.get( '/forgot-password',                     ctrl.getForgotPassword);
router.post('/forgot-password',                     ctrl.postForgotPassword);
router.get( '/reset-password',                      ctrl.getResetPassword);
router.post('/reset-password',                      ctrl.postResetPassword);
router.get( '/register-student', ctrl.getStudentRegister);
router.post('/register-student', ctrl.postStudentRegister);
module.exports = router;
