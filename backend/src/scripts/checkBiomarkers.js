/**
 * CLI Script: Inspect the 5 most recent biomarker entries
 * Usage: node src/scripts/checkBiomarkers.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const ReportBiomarker = require('../models/ReportBiomarker');

async function checkBiomarkers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const biomarkers = await ReportBiomarker.find()
            .sort({ createdAt: -1 })
            .limit(5);

        console.log('Latest 5 biomarkers:');
        console.log(
            biomarkers.map(x => ({
                name: x.biomarkerName,
                value: x.value,
                display: x.valueDisplay,
            }))
        );
        process.exit(0);
    } catch (err) {
        console.error('Check failed:', err.message);
        process.exit(1);
    }
}

checkBiomarkers();
