const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/grant', authMiddleware('patient'), accessController.grantAccess);
router.post('/revoke', authMiddleware('patient'), accessController.revokeAccess);
router.get('/list', authMiddleware('patient'), accessController.getAccessList);

module.exports = router;
