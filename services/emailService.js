const nodemailer = require('nodemailer');

let transporter;

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePassword(value) {
    if (typeof value !== 'string') return '';
    // App passwords are often copied as "abcd efgh ijkl mnop"
    return value.trim().replace(/\s+/g, '');
}

function isEmailConfigured() {
    return Boolean(
        normalizeEmail(process.env.SMTP_USER) &&
        normalizePassword(process.env.SMTP_PASS) &&
        (process.env.SMTP_HOST || process.env.SMTP_SERVICE)
    );
}

function isGmailAddress(email) {
    return email.endsWith('@gmail.com') || email.endsWith('@googlemail.com');
}

function getSmtpCredentials() {
    return {
        user: normalizeEmail(process.env.SMTP_USER),
        pass: normalizePassword(process.env.SMTP_PASS),
    };
}

function warnIfGmailPasswordLooksInvalid(user, pass) {
    if (!isGmailAddress(user)) return;

    if (pass.length !== 16) {
        console.warn('[EMAIL] Gmail App Passwords are exactly 16 characters.');
        console.warn('[EMAIL] Your SMTP_PASS looks like a normal password. Gmail blocks those for SMTP.');
        console.warn('[EMAIL] Create one at: https://myaccount.google.com/apppasswords');
    }
}

function getTransporter() {
    if (transporter) return transporter;

    const { user, pass } = getSmtpCredentials();

    if (!user || !pass) {
        return null;
    }

    warnIfGmailPasswordLooksInvalid(user, pass);

    const service = process.env.SMTP_SERVICE;
    const host = process.env.SMTP_HOST;
    const useGmail = service === 'gmail' || host === 'smtp.gmail.com' || isGmailAddress(user);

    if (useGmail) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass },
        });
    } else if (host) {
        transporter = nodemailer.createTransport({
            host: host.trim(),
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user, pass },
        });
    } else {
        return null;
    }

    return transporter;
}

function formatSmtpError(error) {
    const message = error?.message || 'Unknown SMTP error';

    if (message.includes('535') || message.includes('BadCredentials')) {
        return [
            'Gmail rejected the login (535 BadCredentials).',
            'SMTP_PASS must be a Gmail App Password, not your normal Gmail password.',
            'Steps:',
            '  1. Turn on 2-Step Verification: https://myaccount.google.com/security',
            '  2. Create App Password: https://myaccount.google.com/apppasswords',
            '  3. Choose Mail + Other device, copy the 16-character password',
            '  4. Put it in finalyze_backend/.env as SMTP_PASS (spaces optional)',
            '  5. Restart the backend',
        ].join('\n');
    }

    return message;
}

async function verifyEmailConnection() {
    if (!isEmailConfigured()) {
        console.warn('[EMAIL] SMTP is not configured. OTP emails will fail.');
        console.warn('[EMAIL] Add SMTP_USER, SMTP_PASS, and SMTP_HOST to finalyze_backend/.env');
        return false;
    }

    try {
        const mailTransport = getTransporter();
        await mailTransport.verify();
        console.log(`[EMAIL] SMTP ready. Sending from ${getSmtpCredentials().user}`);
        return true;
    } catch (error) {
        console.error('[EMAIL] SMTP verification failed:\n' + formatSmtpError(error));
        return false;
    }
}

async function sendOtpEmail(to, otp, fullName, purpose = 'verification') {
    if (!isEmailConfigured()) {
        throw new Error(
            'Email is not configured. Set SMTP_USER, SMTP_PASS, and SMTP_HOST in finalyze_backend/.env'
        );
    }

    const from = process.env.EMAIL_FROM || `Finalyze <${getSmtpCredentials().user}>`;
    const isPasswordReset = purpose === 'password_reset';
    const subject = isPasswordReset
        ? 'Your Finalyze password reset code'
        : 'Your Finalyze verification code';
    const intro = isPasswordReset
        ? 'Use the code below to reset your password:'
        : 'Use the code below to verify your email address:';
    const title = isPasswordReset
        ? 'Finalyze Password Reset'
        : 'Finalyze Email Verification';
    const footer = isPasswordReset
        ? 'If you did not request a password reset, you can ignore this email.'
        : 'If you did not create a Finalyze account, you can ignore this email.';

    const text = `Hi ${fullName},\n\n${intro}\n\n${otp}\n\nThis code expires in 10 minutes.\n\n${footer}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #1A5694;">${title}</h2>
            <p>Hi ${fullName},</p>
            <p>${intro}</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1A5694; padding: 16px 0;">
                ${otp}
            </div>
            <p style="color: #666;">This code expires in 10 minutes.</p>
            <p style="color: #999; font-size: 12px;">${footer}</p>
        </div>
    `;

    const mailTransport = getTransporter();

    try {
        const info = await mailTransport.sendMail({ from, to, subject, text, html });
        console.log(`[EMAIL] OTP sent to ${to} (messageId: ${info.messageId})`);
        return { success: true };
    } catch (error) {
        const friendlyError = formatSmtpError(error);
        console.error('[EMAIL] Failed to send OTP:\n' + friendlyError);
        throw new Error(friendlyError);
    }
}

module.exports = { sendOtpEmail, verifyEmailConnection, isEmailConfigured };
