const express = require("express");
const db = require("../db");
const { normalizeSkill } = require("../utils/skills");

const router = express.Router();

// GET /api/courses?skill=React -> browse the course catalogue, optionally filtered by skill
router.get("/", async (req, res) => {
  try {
    const { skill } = req.query;
    if (skill !== undefined && (typeof skill !== 'string' || skill.length > 100)) return res.status(400).json({ error: 'Invalid skill filter.' });
    const result = await db.query('SELECT * FROM courses ORDER BY skill_name');
    const key = normalizeSkill(skill);
    res.json({ courses: key ? result.rows.filter(course => normalizeSkill(course.skill_name).includes(key)) : result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load courses." });
  }
});

module.exports = router;
