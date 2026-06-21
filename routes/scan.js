const express = require('express');
const router = express.Router();
const Scan = require('../models/Scan');

router.get('/history/:userId', async (req, res) => {
    try {
        const historyLogs = await Scan.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.status(200).json(historyLogs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/save-scan', async (req, res) => {
    try {
        const {
            userId,
            fishName,
            category,
            percentage,
            area,
            scanDate,
            scanTime,
            imageData,
        } = req.body;

        if (!imageData) {
            return res.status(400).json({ message: "Image data payload is required." });
        }

        const newScan = new Scan({
            userId,
            imageData,
            fishName,
            category,
            percentage: parseFloat(percentage),
            area,
            scanDate,
            scanTime,
        });

        await newScan.save();
        res.status(201).json({
            message: "Scan metrics saved successfully to history profile!",
            scan: newScan,
        });
    } catch (error) {
        console.error("Save Scan Backend Failure:", error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:scanId', async (req, res) => {
    try {
        const scan = await Scan.findByIdAndDelete(req.params.scanId);
        if (!scan) return res.status(404).json({ message: 'Scan not found.' });
        res.status(200).json({ message: 'Scan deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
