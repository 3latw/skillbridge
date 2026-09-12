const { normalizeSkill } = require('../utils/skills');
const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { analyzeJob } = require("../utils/matcher");

const router = express.Router();

async function getJobsWithSkills() {
  const jobsResult = await db.query(
    `SELECT j.id, j.company_id, j.title
     FROM jobs j
     ORDER BY j.created_at DESC`
  );

  if (!jobsResult.rows.length) return [];

  const ids = jobsResult.rows.map((job) => job.id);
  const skillsResult = await db.query(
    `SELECT job_id, skill_name, required_level
     FROM job_skills
     WHERE job_id = ANY($1)`,
    [ids]
  );

  const skillsByJob = new Map();
  for (const skill of skillsResult.rows) {
    if (!skillsByJob.has(skill.job_id)) skillsByJob.set(skill.job_id, []);
    skillsByJob.get(skill.job_id).push({
      skill_name: skill.skill_name,
      required_level: skill.required_level,
    });
  }

  return jobsResult.rows.map((job) => ({
    ...job,
    required_skills: skillsByJob.get(job.id) || [],
  }));
}

// GET /api/students/me -> profile + skills of the logged-in student
router.get("/me", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const profile = await db.query(
      "SELECT id, name, email, phone, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    const skills = await db.query(
      "SELECT skill_name, level FROM student_skills WHERE student_id = $1 ORDER BY level DESC, skill_name",
      [req.user.id]
    );
    res.json({ profile: profile.rows[0], skills: skills.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load profile." });
  }
});

// GET /api/students/me/stats -> dashboard summary for the logged-in student
router.get("/me/stats", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const skillsResult = await db.query(
      "SELECT skill_name, level FROM student_skills WHERE student_id = $1 ORDER BY level DESC, skill_name",
      [req.user.id]
    );
    const jobs = await getJobsWithSkills();

    let eligibleJobs = 0;
    let nearJobs = 0;
    let developmentJobs = 0;
    const eligibleCompanies = new Set();

    for (const job of jobs) {
      const analysis = analyzeJob(skillsResult.rows, job.required_skills);
      if (analysis.status === "ready") {
        eligibleJobs += 1;
        eligibleCompanies.add(job.company_id);
      } else if (analysis.status === "near") {
        nearJobs += 1;
      } else {
        developmentJobs += 1;
      }
    }

    const levels = skillsResult.rows.map((skill) => Number(skill.level));
    const averageLevel = levels.length
      ? Math.round((levels.reduce((sum, level) => sum + level, 0) / levels.length) * 10) / 10
      : 0;

    res.json({
      stats: {
        skills_count: skillsResult.rows.length,
        average_level: averageLevel,
        eligible_jobs: eligibleJobs,
        eligible_companies: eligibleCompanies.size,
        near_jobs: nearJobs,
        development_jobs: developmentJobs,
        total_jobs: jobs.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load student statistics." });
  }
});

// PUT /api/students/me/skills -> replace the student's skill set
// body: { skills: [{ skill_name, level }, ...] }
router.put("/me/skills", requireAuth, requireRole("student"), async (req, res) => {
  const { skills } = req.body;
  if (!Array.isArray(skills)) {
    return res.status(400).json({ error: "skills must be an array." });
  }
  if (skills.length > 30) {
    return res.status(400).json({ error: "A maximum of 30 skills is allowed." });
  }

  const seen = new Set();
  const cleanedSkills = [];
  for (const s of skills) {
    const name = normalizeSkill(s?.skill_name);
    if (!name || name.length > 100 || !Number.isInteger(s.level) || s.level < 1 || s.level > 5) {
      return res.status(400).json({ error: "Each skill needs a valid name and a level from 1 to 5." });
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return res.status(400).json({ error: `Duplicate skill: ${name}.` });
    }
    seen.add(key);
    cleanedSkills.push({ skill_name: name, level: s.level });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    await client.query("DELETE FROM student_skills WHERE student_id = $1", [req.user.id]);
    for (const s of cleanedSkills) {
      await client.query(
        `INSERT INTO student_skills (student_id, skill_name, level) VALUES ($1, $2, $3)`,
        [req.user.id, s.skill_name, s.level]
      );
    }
    await client.query("COMMIT");
    res.json({ message: "Skills updated.", skills: cleanedSkills });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not update skills." });
  } finally {
    client?.release();
  }
});

module.exports = router;
