const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendOtpEmail } = require('../services/emailService');
const { generateOtp, hashOtp, compareOtp, getOtpExpiry } = require('../utils/otpHelper');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key';
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);

async function createAndSendOtp(user, purpose = 'verification') {
    const otp = generateOtp();
    user.otpHash = await hashOtp(otp);
    user.otpExpiresAt = getOtpExpiry(OTP_EXPIRY_MINUTES);
    user.otpPurpose = purpose;
    await user.save();

    try {
        await sendOtpEmail(user.email, otp, user.fullName, purpose);
    } catch (error) {
        console.error('[OTP] Email send failed:', error.message);
        throw error;
    }

    return otp;
}

async function validateOtp(user, otp, expectedPurpose) {
    if (!user.otpHash || !user.otpExpiresAt) {
        return { valid: false, message: 'No OTP found. Please request a new one.' };
    }

    if ((user.otpPurpose || 'verification') !== expectedPurpose) {
        return { valid: false, message: 'Invalid OTP type. Please request a new code.' };
    }

    if (new Date() > user.otpExpiresAt) {
        return { valid: false, message: 'OTP has expired. Please request a new one.' };
    }

    const isValidOtp = await compareOtp(String(otp).trim(), user.otpHash);
    if (!isValidOtp) {
        return { valid: false, message: 'Invalid OTP. Please try again.' };
    }

    return { valid: true };
}

function clearOtp(user) {
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpPurpose = 'verification';
}

router.post('/signup', async (req, res) => {
    try {
        const { fullName, email, password, userRole, region, organization } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            if (user.emailVerified === false) {
                await createAndSendOtp(user, 'verification');
                return res.status(200).json({
                    message: 'Account exists but is not verified. A new OTP has been sent to your email.',
                    email: user.email,
                    requiresVerification: true,
                });
            }
            return res.status(400).json({ message: 'User already exists with this email.' });
        }

        user = new User({
            fullName,
            email,
            password,
            userRole,
            region,
            organization,
            emailVerified: false,
        });

        await user.save();
        await createAndSendOtp(user, 'verification');

        res.status(201).json({
            message: 'Registration successful. Please verify your email with the OTP sent.',
            email: user.email,
            requiresVerification: true,
        });
    } catch (error) {
        console.log('>>>> CLG SIGNUP ERROR LAYER:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ message: 'No account found for this email.' });
        }

        if (user.emailVerified === true) {
            const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
            return res.status(200).json({
                message: 'Email already verified.',
                token,
                userId: user._id,
            });
        }

        if (!user.otpHash || !user.otpExpiresAt) {
            return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
        }

        const otpCheck = await validateOtp(user, otp, 'verification');
        if (!otpCheck.valid) {
            return res.status(400).json({ message: otpCheck.message });
        }

        user.emailVerified = true;
        clearOtp(user);
        await user.save();

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({
            message: 'Email verified successfully.',
            token,
            userId: user._id,
            fullName: user.fullName,
            email: user.email,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ message: 'No account found for this email.' });
        }

        if (user.emailVerified === true) {
            return res.status(400).json({ message: 'Email is already verified.' });
        }

        await createAndSendOtp(user, 'verification');

        res.status(200).json({ message: 'A new OTP has been sent to your email.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({
                message: 'No account found with this email address.',
            });
        }

        await createAndSendOtp(user, 'password_reset');

        res.status(200).json({
            message: 'If an account exists for this email, a reset code has been sent.',
            email: user.email,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                message: 'Email, OTP, and new password are required.',
            });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({
                message: 'Password must be at least 6 characters long.',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ message: 'No account found for this email.' });
        }

        const otpCheck = await validateOtp(user, otp, 'password_reset');
        if (!otpCheck.valid) {
            return res.status(400).json({ message: otpCheck.message });
        }

        user.password = newPassword;
        clearOtp(user);
        await user.save();

        res.status(200).json({ message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }

        if (user.emailVerified === false) {
            await createAndSendOtp(user, 'verification');
            return res.status(403).json({
                message: 'Email not verified. A new OTP has been sent to your email.',
                requiresVerification: true,
                email: user.email,
            });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({ message: 'Login successful', token, userId: user._id, fullName: user.fullName, email: user.email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/update-profile/:userId', async (req, res) => {
    try {
        const { fullName, email } = req.body;
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        if (fullName) user.fullName = fullName;
        if (email && email !== user.email) {
            const existing = await User.findOne({ email: email.toLowerCase().trim() });
            if (existing) return res.status(400).json({ message: 'Email already in use by another account.' });
            user.email = email.toLowerCase().trim();
        }
        await user.save();
        res.status(200).json({ message: 'Profile updated successfully.', fullName: user.fullName, email: user.email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/change-password/:userId', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword)
            return res.status(400).json({ message: 'Current and new password are required.' });
        if (newPassword.length < 6)
            return res.status(400).json({ message: 'New password must be at least 6 characters.' });

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });

        user.password = newPassword;
        await user.save();
        res.status(200).json({ message: 'Password changed successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/delete/:userId', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        // Also delete all scans belonging to this user
        const Scan = require('../models/Scan');
        await Scan.deleteMany({ userId: req.params.userId });
        res.status(200).json({ message: 'Account deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/profile/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('fullName email');
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.status(200).json({ fullName: user.fullName, email: user.email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
