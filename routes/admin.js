// routes/admin.js – mounted at /admin in server.js
// All routes here require an admin session
const express  = require('express');
const router   = express.Router();
const { requireAdmin } = require('../middleware/auth');
const ctrl     = require('../controllers/settingsController');

router.use(requireAdmin);    // Every route below this line is protected

router.get( '/dashboard',       (req, res) => res.sendFile('admin_dashboard.html', { root: './public' }));
router.get( '/courses',         (req, res) => res.sendFile('Courses Page.html', { root: './public' }));
router.get( '/analytics',       (req, res) => res.sendFile('Analyticss.html', { root: './public' }));
router.get( '/templates',       (req, res) => res.sendFile('Courses Template.html', { root: './public' }));
router.get( '/settings',        ctrl.getAdminSettings);
router.post('/settings',        ctrl.updateAdminSettings);
router.post('/change-password', ctrl.changeAdminPassword);
router.get( '/settings-page',   (req, res) => res.sendFile('Settings.html', { root: './public' }));

module.exports = router;
