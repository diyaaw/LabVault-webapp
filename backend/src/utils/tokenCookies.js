/**
 * utils/tokenCookies.js
 *
 * Centralises cookie configuration so options are never duplicated
 * between login, refresh, and logout handlers.
 */

const isProd = process.env.NODE_ENV === 'production';

/** Shared base options applied to every auth cookie */
const BASE_OPTIONS = {
    httpOnly: true,               // JS cannot read → XSS protection
    secure: isProd,               // HTTPS-only in production
    sameSite: 'lax',              // sent on same-site requests (localhost OK)
};

/** Cookie options for the short-lived access token */
const accessTokenCookieOptions = {
    ...BASE_OPTIONS,
    maxAge: 24 * 60 * 60 * 1000, // 1 day in ms  (mirrors ACCESS_TOKEN_EXPIRY=1d)
};

/** Cookie options for the long-lived refresh token */
const refreshTokenCookieOptions = {
    ...BASE_OPTIONS,
    maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days in ms  (mirrors REFRESH_TOKEN_EXPIRY=10d)
};

/**
 * Sets both auth cookies on the response object.
 * @param {import('express').Response} res
 * @param {string} accessToken
 * @param {string} refreshToken
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
    res.cookie('accessToken',  accessToken,  accessTokenCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);
};

/**
 * Clears both auth cookies.
 * Must pass the same options (httpOnly, secure, sameSite) used when setting,
 * otherwise some browsers will not clear the cookie.
 * @param {import('express').Response} res
 */
const clearAuthCookies = (res) => {
    res.clearCookie('accessToken',  BASE_OPTIONS);
    res.clearCookie('refreshToken', BASE_OPTIONS);
};

module.exports = { setAuthCookies, clearAuthCookies };
