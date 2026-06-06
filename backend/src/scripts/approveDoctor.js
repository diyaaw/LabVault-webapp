/**
 * CLI Script: Approve a doctor by email
 * Usage: node src/scripts/approveDoctor.js <email>
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

async function approveDoctor(email) {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const result = await User.findOneAndUpdate(
            { email, role: 'doctor' },
            { status: 'APPROVED' },
            { new: true }
        );

        if (result) {
            console.log(`\n✅ Success: Doctor ${result.name} (${result.email}) has been APPROVED!`);
        } else {
            console.log(`\n❌ Error: Doctor with email "${email}" was not found or is not a doctor role.`);
        }
        process.exit(0);
    } catch (err) {
        console.error('Error during approval:', err.message);
        process.exit(1);
    }
}

const email = process.argv[2];
if (!email) {
    console.log('Usage: node src/scripts/approveDoctor.js <email>');
    process.exit(1);
}

approveDoctor(email);
