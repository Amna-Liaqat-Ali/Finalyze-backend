const express = require('express');
const router = express.Router();
const Scan = require('../models/Scan');
const User = require('../models/User');

const MAX_SCANS = 15;
const WINDOW_MS = 24 * 60 * 60 * 1000;

router.get('/limit/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('scanCount scanWindowStart');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const now = Date.now();
        const windowStart = user.scanWindowStart ? user.scanWindowStart.getTime() : null;
        const expired = !windowStart || (now - windowStart) >= WINDOW_MS;

        const count = expired ? 0 : (user.scanCount || 0);
        const resetAt = expired ? null : new Date(windowStart + WINDOW_MS).toISOString();

        res.json({ used: count, max: MAX_SCANS, resetAt, isLimited: count >= MAX_SCANS });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/limit/increment/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('scanCount scanWindowStart');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const now = Date.now();
        const windowStart = user.scanWindowStart ? user.scanWindowStart.getTime() : null;
        const expired = !windowStart || (now - windowStart) >= WINDOW_MS;

        let count = expired ? 0 : (user.scanCount || 0);
        const newWindowStart = expired ? new Date(now) : user.scanWindowStart;

        if (count >= MAX_SCANS) {
            const resetAt = new Date(newWindowStart.getTime() + WINDOW_MS).toISOString();
            return res.status(429).json({ used: count, max: MAX_SCANS, resetAt, isLimited: true });
        }

        count += 1;
        await User.findByIdAndUpdate(req.params.userId, {
            scanCount: count,
            scanWindowStart: newWindowStart,
        });

        const resetAt = new Date(newWindowStart.getTime() + WINDOW_MS).toISOString();
        res.json({ used: count, max: MAX_SCANS, resetAt, isLimited: count >= MAX_SCANS });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/history/:userId', async (req, res) => {
    try {
        // Exclude imageData from list — loaded separately per scan
        const historyLogs = await Scan.find({ userId: req.params.userId })
            .select('-imageData')
            .sort({ createdAt: -1 });
        res.status(200).json(historyLogs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/detail/:scanId', async (req, res) => {
    try {
        const scan = await Scan.findById(req.params.scanId);
        if (!scan) return res.status(404).json({ message: 'Scan not found.' });
        res.status(200).json(scan);
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
