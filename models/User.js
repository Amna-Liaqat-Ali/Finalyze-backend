const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    userRole: {
        type: String,
        enum: ['End Consumer', 'Seafood Vendor / Retailer', 'Commercial Fisherman', 'Quality Control Inspector'],
        default: 'End Consumer'
    },
    region: {
        type: String,
        default: '',
        trim: true
    },
    organization: {
        type: String,
        default: '',
        trim: true
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    otpHash: {
        type: String
    },
    otpExpiresAt: {
        type: Date
    },
    otpPurpose: {
        type: String,
        enum: ['verification', 'password_reset'],
        default: 'verification'
    },
    scanCount: { type: Number, default: 0 },
    scanWindowStart: { type: Date, default: null }
}, { timestamps: true });

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw error; 
    }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);