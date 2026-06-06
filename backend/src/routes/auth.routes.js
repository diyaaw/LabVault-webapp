/**
 * routes/auth.routes.js
 *
 * V2 auth routes using the full access + refresh token lifecycle.
 * Mounted at /api/v2/auth in app.js.
 *
 *   POST /login           → public
 *   POST /refresh-token   → public  (reads refreshToken cookie)
 *   POST /logout          → protected (requires valid accessToken)
 */

const express = require('express');
const router  = express.Router();

const { login, refreshToken, logout } = require('../controllers/auth.controller');
const verifyJWT = require('../middleware/verifyJWT');

router.post('/login',         login);
router.post('/refresh-token', refreshToken);
router.post('/logout',        verifyJWT, logout);  // must be logged in to log out

module.exports = router;
