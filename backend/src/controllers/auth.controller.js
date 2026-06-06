/**
 * controllers/auth.controller.js
 *
 * Implements the full JWT lifecycle:
 *   login        → issues access + refresh tokens
 *   refreshToken → rotates the access token (and optionally the refresh token)
 *   logout       → revokes tokens server-side and clears cookies
 *
 * Tokens are NEVER exposed in the response JSON — only via HTTP-only cookies.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/ApiError');
const { ApiResponse } = require('../utils/ApiResponse');
const { setAuthCookies, clearAuthCookies } = require('../utils/tokenCookies');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates both tokens for a user, persists the refresh token to DB,
 * and returns both strings.
 */
const generateAndSaveTokens = async (user) => {
    const accessToken  = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Save refresh token to DB — enables server-side revocation on logout
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/v2/auth/login
 *
 * 1. Find user by email
 * 2. Verify password using the model method
 * 3. Block PENDING doctors / pathology accounts
 * 4. Generate access + refresh tokens
 * 5. Persist refresh token in DB
 * 6. Set both tokens as HTTP-only cookies
 * 7. Return user data (no tokens in JSON body)
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json(
                new ApiError(400, 'Email and password are required.')
            );
        }

        // Find user — include password field (normally excluded)
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json(
                new ApiError(401, 'Invalid credentials.')
            );
        }

        // Use the model method — keeps bcrypt logic in the model
        const isPasswordValid = await user.isPasswordCorrect(password);
        if (!isPasswordValid) {
            return res.status(401).json(
                new ApiError(401, 'Invalid credentials.')
            );
        }

        // Block PENDING accounts for regulated roles
        if (
            (user.role === 'doctor' || user.role === 'pathology') &&
            user.status !== 'APPROVED'
        ) {
            return res.status(403).json(
                new ApiError(403, 'Your account is pending admin approval.')
            );
        }

        const { accessToken, refreshToken } = await generateAndSaveTokens(user);

        // Set cookies — tokens never touch the response body
        setAuthCookies(res, accessToken, refreshToken);

        // Return safe user object (no password, no refreshToken)
        const safeUser = {
            _id:      user._id,
            id:       user._id,
            name:     user.name,
            email:    user.email,
            role:     user.role,
            lvId:     user.lvId,
            status:   user.status,
            avatarUrl: user.avatarUrl,
        };

        return res.status(200).json(
            new ApiResponse(200, { user: safeUser }, 'Login successful.')
        );

    } catch (error) {
        console.error('[login]', error);
        return res.status(500).json(new ApiError(500, 'Server error during login.'));
    }
};

/**
 * POST /api/v2/auth/refresh-token
 *
 * Refresh flow:
 * 1. Read refreshToken from the cookie
 * 2. Verify signature with REFRESH_TOKEN_SECRET
 * 3. Find user by decoded._id
 * 4. Compare cookie token against the one stored in DB
 *    → If they don't match, the token was already used/revoked — reject
 * 5. Issue a NEW accessToken (and rotate the refreshToken)
 * 6. Set new cookies
 */
const refreshToken = async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken;

        if (!incomingRefreshToken) {
            return res.status(401).json(
                new ApiError(401, 'No refresh token provided.')
            );
        }

        // Verify signature
        let decoded;
        try {
            decoded = jwt.verify(
                incomingRefreshToken,
                process.env.REFRESH_TOKEN_SECRET
            );
        } catch (err) {
            const msg = err.name === 'TokenExpiredError'
                ? 'Refresh token expired. Please log in again.'
                : 'Invalid refresh token.';
            return res.status(401).json(new ApiError(401, msg));
        }

        // Find the user
        const user = await User.findById(decoded._id);
        if (!user) {
            return res.status(401).json(
                new ApiError(401, 'User not found.')
            );
        }

        // Token rotation security check:
        // If the incoming token doesn't match what's in the DB, someone may
        // have already used (or stolen) this refresh token — invalidate immediately.
        if (user.refreshToken !== incomingRefreshToken) {
            // Clear the stored token → forces a full re-login
            user.refreshToken = null;
            await user.save({ validateBeforeSave: false });
            clearAuthCookies(res);
            return res.status(401).json(
                new ApiError(401, 'Refresh token reuse detected. Please log in again.')
            );
        }

        // Generate and rotate both tokens
        const { accessToken, refreshToken: newRefreshToken } = await generateAndSaveTokens(user);
        setAuthCookies(res, accessToken, newRefreshToken);

        return res.status(200).json(
            new ApiResponse(200, {}, 'Tokens refreshed successfully.')
        );

    } catch (error) {
        console.error('[refreshToken]', error);
        return res.status(500).json(new ApiError(500, 'Server error during token refresh.'));
    }
};

/**
 * POST /api/v2/auth/logout
 *
 * 1. Remove the refresh token from the DB → server-side revocation
 * 2. Clear both HTTP-only cookies
 */
const logout = async (req, res) => {
    try {
        // req.user is set by the verifyJWT middleware on this route
        await User.findByIdAndUpdate(
            req.user._id || req.user.id,
            { $set: { refreshToken: null } },
            { new: true }
        );

        clearAuthCookies(res);

        return res.status(200).json(
            new ApiResponse(200, {}, 'Logged out successfully.')
        );

    } catch (error) {
        console.error('[logout]', error);
        return res.status(500).json(new ApiError(500, 'Server error during logout.'));
    }
};

module.exports = { login, refreshToken, logout };
