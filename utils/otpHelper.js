const bcrypt = require('bcryptjs');

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashOtp(otp) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(otp, salt);
}

async function compareOtp(otp, otpHash) {
    return bcrypt.compare(otp, otpHash);
}

function getOtpExpiry(minutes = 10) {
    return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = { generateOtp, hashOtp, compareOtp, getOtpExpiry };
