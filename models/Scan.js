const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    imageData: {
        type: String,
        required: true
    },
    fishName: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    percentage: {
        type: Number,
        required: true
    },
    area: {
        type: String,
        required: true
    },
    scanDate: {
        type: String,
        required: true
    },
    scanTime: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Scan', scanSchema);
