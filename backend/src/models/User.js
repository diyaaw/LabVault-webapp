const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { Schema } = mongoose;

const userSchema = new Schema({
    lvId: { type: String, unique: true, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['patient', 'doctor', 'pathology', 'admin', 'SuperAdmin'],
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'],
        default: 'APPROVED'
    },
    name: { type: String, required: true },
    avatarUrl: { type: String, default: '' },
    isVerified: { type: Boolean, default: false },
    doctorAccess: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    affiliatedLabs: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    lastLoginAt: { type: Date },
    // Patient demographics
    age: { type: Number, default: null },
    gender: {
        type: String,
        enum: ['male', 'female', 'other', null],
        default: null
    },
    dateOfBirth: { type: Date, default: null },
    bloodGroup: { type: String, default: null },

    // Stored server-side to enable token revocation
    refreshToken: { type: String, default: null },

}, { timestamps: true });

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Compares a plain-text password with the stored hash.
 * Always use this instead of calling bcrypt.compare directly in controllers.
 */
userSchema.methods.isPasswordCorrect = async function (password) {
    return bcrypt.compare(password, this.password);
};

/**
 * Generates a short-lived access token.
 * Payload contains only what's needed for authorization decisions.
 */
userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id:   this._id,
            id:    this._id,   // backward compat — existing middleware reads req.user.id
            email: this.email,
            role:  this.role,
            lvId:  this.lvId,
        },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );
};

/**
 * Generates a long-lived refresh token.
 * Minimal payload — only the user _id is needed to look them up.
 */
userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        { _id: this._id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
    );
};

module.exports = mongoose.model('User', userSchema);

