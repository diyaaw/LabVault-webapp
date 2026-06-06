const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Import routes
const authRoutes = require('./routes/authRoutes');
const authV2Routes = require('./routes/auth.routes');       // ← v2: access + refresh token lifecycle
const reportRoutes = require('./routes/reportRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const accessRoutes = require('./routes/accessRoutes');
const patientRoutes = require('./routes/patientRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const pathologyRoutes = require('./routes/pathologyRoutes');

const reportController = require('./controllers/reportController');
const aiController = require('./controllers/aiController');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (origin.startsWith('http://localhost:')) return callback(null, true);
        if (origin.startsWith('http://127.0.0.1:')) return callback(null, true);
        if (origin === process.env.CORS_ORIGIN) return callback(null, true);
        callback(null, false);
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); 

// Serve uploaded files as static assets
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/v2/auth', authV2Routes);   // full access + refresh token lifecycle
app.use('/api/reports', reportRoutes);

// Backwards compatibility: patient report prefix used by some frontend pages
app.use('/api/patient/reports', reportRoutes);

// Backwards compatibility: legacy voice endpoint
app.post('/api/voice', authMiddleware(), reportController.generateVoice);

// Unified AI audio instruction route
app.post('/api/ai/audio', authMiddleware(), reportController.generateVoice);

// Ask AI — patient chat with their report context
app.post('/api/ai/ask', authMiddleware(), aiController.askAI);

app.use('/api/analytics', analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifs', notificationRoutes);
app.use('/api/pathology', pathologyRoutes);
app.use('/api/admin', adminRoutes);

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
});

module.exports = app;
