const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scan');
const { verifyEmailConnection } = require('./services/emailService');

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(cors());

app.get('/', (req, res) => res.json({ status: 'Finalyze backend is running' }));

app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

verifyEmailConnection().catch((err) => {
  console.error('[EMAIL] SMTP verification failed:', err.message);
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
