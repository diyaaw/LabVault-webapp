const User = require('../models/User');

const generateLvId = async () => {
    let isUnique = false;
    let lvId = '';

    while (!isUnique) {
        // Generate random 5-digit number
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        lvId = `LV-${randomNum}`;

        // Check if exists
        const existingUser = await User.findOne({ lvId });
        if (!existingUser) {
            isUnique = true;
        }
    }

    return lvId;
};

module.exports = generateLvId;
