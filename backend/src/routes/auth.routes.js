const valid = require('../utils/validation');
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { role, name, phone, password } = req.body;
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";

  if (!role || !["student", "company"].includes(role)) {
    return res.status(400).json({ error: "Role must be 'student' or 'company'." });
  }
  if (!valid.text(name, 150) || !valid.email(email) || !valid.phone(phone)) {
    return res.status(400).json({ error: "Name, email, phone and password are required." });
  }
  if (!valid.password(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and at most 72 UTF-8 bytes." });
  }

  try {
    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (role, name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, role, name, email, phone, created_at`,
      [role, name.trim(), email, phone, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An account with this email already exists." });
    console.error(err);
    res.status(500).json({ error: "Could not create account." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { password } = req.body;
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!valid.email(email) || typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = signToken(user);
    delete user.password_hash;
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed." });
  }
});

module.exports = router;
