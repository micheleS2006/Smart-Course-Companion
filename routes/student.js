// routes/student.js – mounted at /student in server.js
// All routes here require a student session
const express  = require('express');
const router   = express.Router();
const { requireStudent } = require('../middleware/auth');
const ctrl     = require('../controllers/settingsController');

router.use(requireStudent);    // Every route below this line is protected

router.get( '/dashboard',       (req, res) => res.sendFile('dashboardtrial.html', { root: './public' }));
router.get( '/settings',        ctrl.getStudentSettings);
router.post('/settings',        ctrl.updateStudentSettings);
router.post('/change-password', ctrl.changeStudentPassword);
router.get( '/settings-page',   (req, res) => res.sendFile('myaccount.html', { root: './public' }));

module.exports = router;
