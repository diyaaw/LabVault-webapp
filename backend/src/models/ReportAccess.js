const mongoose = require('mongoose');

const reportAccessSchema = new mongoose.Schema({
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'approved', 'revoked', 'expired'], default: 'approved' },
    accessLevel: { type: String, enum: ['summary_only', 'full_report'], default: 'full_report' },
    grantedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    revokedAt: { type: Date }
}, { timestamps: true });

reportAccessSchema.index({ reportId: 1, doctorId: 1 }, { unique: true });

module.exports = mongoose.model('ReportAccess', reportAccessSchema);
