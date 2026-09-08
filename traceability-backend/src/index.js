require('dotenv').config();
const express = require('express');
const cors = require('cors');
const publicRouter = require('./routes/public');
const { getDb } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3004);
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = String(process.env.FRONTEND_URL || 'http://localhost:5177')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (isProduction) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed'));
  },
  methods: ['GET'],
}));
app.use(express.json({ limit: '100kb' }));

getDb();

app.use('/api/public', publicRouter);
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'traceability-backend',
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  console.error('[Traceability API]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Traceability backend running on port ${PORT}`);
});
