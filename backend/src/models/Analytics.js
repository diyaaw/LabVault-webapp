const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    healthScore: {
        type: Number
    },
    riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high']
    },
    lastCalculatedAt: {
        type: Date
    },
    breakdown: {
        abnormalCount: { type: Number },
        criticalCount: { type: Number },
        lastReportId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Report'
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('Analytics', analyticsSchema);
