const mongoose = require('mongoose');

const pathologyProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    labName: { type: String, required: true },
    licenseNumber: { type: String, unique: true, required: true },
    address: { type: String },
    city: { type: String },
    logoUrl: { type: String },
    apiKeyHash: { type: String, sparse: true },
    webhookSecret: { type: String },
    isVerified: { type: Boolean, default: false },
    paymentPlan: { type: String, enum: ['free', 'basic', 'pro'], default: 'free' }
}, { timestamps: true });

module.exports = mongoose.model('PathologyProfile', pathologyProfileSchema);
