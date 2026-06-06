/**
 * middleware/verifyJWT.js
 *
 * Verifies the accessToken from cookies (preferred) or the
 * Authorization: Bearer header (fallback for API clients / Postman).
 *
 * On success  → attaches decoded payload to req.user and calls next()
 * On failure  → returns 401 with a meaningful error message
 */

const jwt = require('jsonwebtoken');
const { ApiError } = require('../utils/ApiError');

const verifyJWT = (req, res, next) => {
    try {
        // Prefer cookie; fall back to Bearer header for API clients
        const token =
            req.cookies?.accessToken ||
            req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json(
                new ApiError(401, 'Access denied. No access token provided.')
            );
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        // Attach to request — both .id and ._id are set for backward compatibility
        req.user = decoded;
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json(
                new ApiError(401, 'Access token expired. Please refresh.')
            );
        }
        return res.status(401).json(
            new ApiError(401, 'Invalid access token.')
        );
    }
};

module.exports = verifyJWT;
