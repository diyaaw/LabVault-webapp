const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/:patientId', authMiddleware(), analyticsController.getAnalytics);

module.exports = router;
