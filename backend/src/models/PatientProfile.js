const mongoose = require('mongoose');

const patientProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    bloodGroup: { type: String }, // 'A+', 'o-' etc.
    emergencyContactName: { type: String },
    emergencyContactPhone: { type: String },
    preferredLanguage: { type: String, default: 'en' }
}, { timestamps: true });

module.exports = mongoose.model('PatientProfile', patientProfileSchema);
