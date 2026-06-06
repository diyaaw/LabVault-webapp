/**
 * backfill_doctor_briefs.js
 * Run once to populate doctorBriefEn for all existing reports.
 * Usage: node backfill_doctor_briefs.js
 */
require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const ReportAiAnalysis = require('./src/models/ReportAiAnalysis');
const ReportBiomarker = require('./src/models/ReportBiomarker');
const aiService = require('./src/services/aiService');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/labvault';

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all analyses that have OCR text but no doctor brief
    const analyses = await ReportAiAnalysis.find({
        ocrText: { $exists: true, $ne: '' },
        $or: [{ doctorBriefEn: { $exists: false } }, { doctorBriefEn: '' }]
    });

    console.log(`Found ${analyses.length} reports to backfill.`);

    for (const analysis of analyses) {
        try {
            // Fetch biomarkers for this report
            const biomarkers = await ReportBiomarker.find({ reportId: analysis.reportId }).lean();
            const brief = await aiService.generateDoctorBrief(analysis.ocrText, biomarkers);
            await ReportAiAnalysis.findByIdAndUpdate(analysis._id, { doctorBriefEn: brief });
            console.log(`✅ Backfilled report ${analysis.reportId} — ${brief.substring(0, 60)}...`);
        } catch (err) {
            console.warn(`⚠️  Skipped report ${analysis.reportId}: ${err.message}`);
        }
    }

    console.log('Backfill complete.');
    await mongoose.disconnect();
}

run().catch(console.error);
