require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to at least 32 random characters.');

const authRoutes = require("./routes/auth.routes");
const studentRoutes = require("./routes/students.routes");
const jobRoutes = require("./routes/jobs.routes");
const courseRoutes = require("./routes/courses.routes");

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
app.use(helmet({ contentSecurityPolicy: { directives: {
  "script-src": ["'self'"], "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  "font-src": ["'self'", 'https://fonts.gstatic.com'], "upgrade-insecure-requests": null
} }, strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false }));
const origins = (process.env.CORS_ORIGINS || 'http://localhost:4000,http://localhost:8080').split(',').map(s => s.trim());
app.use(cors({ origin(origin, callback) {
  if (!origin || origins.includes(origin)) return callback(null, true);
  const error = new Error('Origin not allowed.'); error.status = 403; callback(error);
} }));
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'A JSON object is required.' });
  }
  next();
});
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' } }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/courses", courseRoutes);

app.use(express.static(path.join(__dirname, '../../frontend')));

app.use((req, res) => res.status(404).json({ error: "Not found." }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err.message);
  res.status(status).json({ error: err.type === "entity.parse.failed" ? "Invalid JSON body." : err.type === "entity.parse.failed" ? "Invalid JSON body." : status < 500 ? err.message : "Unexpected server error." });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) app.listen(PORT, () => console.log(`SkillBridge API running on port ${PORT}`));

module.exports = app;
