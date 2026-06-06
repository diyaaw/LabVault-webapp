const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/analytics', authMiddleware(['pathology', 'admin']), dashboardController.getPathologyAnalytics);

module.exports = router;
