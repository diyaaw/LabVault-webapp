/**
 * CLI Script: Audit all doctors in the database
 * Usage: node src/scripts/auditDoctors.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

async function audit() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const doctors = await User.find({ role: 'doctor' }).select('name email status');
        console.log('AUDIT_START');
        console.log(JSON.stringify(doctors, null, 2));
        console.log('AUDIT_END');
        console.log(`\n📊 Total doctors found: ${doctors.length}`);
        process.exit(0);
    } catch (err) {
        console.error('Audit failed:', err.message);
        process.exit(1);
    }
}

audit();
