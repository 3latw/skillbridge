const { normalizeSkill } = require('../utils/skills');
const valid = require('../utils/validation');
const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { analyzeJob } = require("../utils/matcher");

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) return res.status(400).json({ error: 'Invalid job ID.' });
  next();
});

async function attachSkills(jobs) {
  if (!jobs.length) return jobs;
  const ids = jobs.map((j) => j.id);
  const { rows } = await db.query(
    `SELECT job_id, skill_name, required_level FROM job_skills WHERE job_id = ANY($1)`,
    [ids]
  );
  const byJob = new Map();
  for (const r of rows) {
    if (!byJob.has(r.job_id)) byJob.set(r.job_id, []);
    byJob.get(r.job_id).push({ skill_name: r.skill_name, required_level: r.required_level });
  }
  return jobs.map((j) => ({ ...j, required_skills: byJob.get(j.id) || [] }));
}

async function loadStudentsWithSkills(companyId, jobId = null) {
  const studentsResult = await db.query(
    `SELECT u.id, u.name, u.email, u.phone,
       array_agg(a.job_id) AS applied_jobs
     FROM users u JOIN applications a ON a.student_id = u.id
     JOIN jobs j ON j.id = a.job_id
     WHERE j.company_id = $1 AND ($2::integer IS NULL OR j.id = $2)
     GROUP BY u.id ORDER BY u.name`, [companyId, jobId]
  );
  const students = studentsResult.rows;
  if (!students.length) return [];

  const ids = students.map((student) => student.id);
  const skillsResult = await db.query(
    `SELECT student_id, skill_name, level
     FROM student_skills
     WHERE student_id = ANY($1)
     ORDER BY level DESC, skill_name`,
    [ids]
  );

  const skillsByStudent = new Map();
  for (const skill of skillsResult.rows) {
    if (!skillsByStudent.has(skill.student_id)) skillsByStudent.set(skill.student_id, []);
    skillsByStudent.get(skill.student_id).push({
      skill_name: skill.skill_name,
      level: skill.level,
    });
  }

  return students.map((student) => ({
    ...student,
    skills: skillsByStudent.get(student.id) || [],
  }));
}

function getRequiredSkillSnapshot(studentSkills, requiredSkills) {
  const studentMap = new Map(
    studentSkills.map((skill) => [normalizeSkill(skill.skill_name), Number(skill.level)])
  );
  return requiredSkills.map((reqSkill) => ({
    skill_name: reqSkill.skill_name,
    required_level: reqSkill.required_level,
    current_level: studentMap.get(normalizeSkill(reqSkill.skill_name)) || 0,
  }));
}

// Jobs include server-computed readiness for students.
router.get("/", requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT j.id, j.title, j.description, j.created_at,
              u.id AS company_id, u.name AS company_name
       FROM jobs j
       JOIN users u ON u.id = j.company_id
       ORDER BY j.created_at DESC`
    );
    let jobs = await attachSkills(rows);
    if (req.user.role === 'student') {
      const { rows: skills } = await db.query('SELECT skill_name, level FROM student_skills WHERE student_id = $1', [req.user.id]);
      const { rows: applications } = await db.query('SELECT job_id, status, applied_at FROM applications WHERE student_id = $1', [req.user.id]);
      jobs = jobs.map(job => ({ ...job, analysis: analyzeJob(skills, job.required_skills), application: applications.find(a => a.job_id === job.id) || null }));
    }
    res.json({ jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load jobs." });
  }
});

// GET /api/jobs/mine -> jobs posted by the logged-in company
router.get("/mine", requireAuth, requireRole("company"), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, description, contact_email, contact_phone, created_at
       FROM jobs WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    const jobs = await attachSkills(rows);
    res.json({ jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load your jobs." });
  }
});

// GET /api/jobs/mine/stats -> candidate-readiness statistics across the company's jobs
router.get("/mine/stats", requireAuth, requireRole("company"), async (req, res) => {
  try {
    const jobsResult = await db.query(
      `SELECT id, title
       FROM jobs
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    const jobs = await attachSkills(jobsResult.rows);
    const students = await loadStudentsWithSkills(req.user.id);

    let totalReadyMatches = 0;
    let jobsWithCandidates = 0;

    const jobStats = jobs.map((job) => {
      let readyCount = 0;
      let nearCount = 0;
      let notReadyCount = 0;
      const candidatePreview = [];

      const applicants = students.filter(student => student.applied_jobs.includes(job.id));
      for (const student of applicants) {
        const analysis = analyzeJob(student.skills, job.required_skills);
        if (analysis.status === "ready") {
          readyCount += 1;
          if (candidatePreview.length < 4) {
            candidatePreview.push({ id: student.id, name: student.name });
          }
        } else if (analysis.status === "near") {
          nearCount += 1;
        } else {
          notReadyCount += 1;
        }
      }

      totalReadyMatches += readyCount;
      if (readyCount > 0) jobsWithCandidates += 1;

      return {
        id: job.id,
        title: job.title,
        total_students: applicants.length,
        ready_count: readyCount,
        near_count: nearCount,
        not_ready_count: notReadyCount,
        match_rate: applicants.length ? Math.round((readyCount / applicants.length) * 100) : 0,
        candidate_preview: candidatePreview,
      };
    });

    res.json({
      summary: {
        total_jobs: jobs.length,
        total_students: students.length,
        total_ready_matches: totalReadyMatches,
        jobs_with_candidates: jobsWithCandidates,
      },
      jobs: jobStats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load company statistics." });
  }
});

// POST /api/jobs -> company creates a job with required skills
// body: { title, description, contact_email, contact_phone, skills: [{skill_name, required_level}] }
router.post("/", requireAuth, requireRole("company"), async (req, res) => {
  const { title, description, contact_email, contact_phone, skills } = req.body;

  if (
    !valid.text(title, 150) ||
    !valid.email(contact_email) ||
    !valid.phone(contact_phone) ||
    !Array.isArray(skills) || !skills.length
  ) {
    return res.status(400).json({
      error: "Title, contact email, contact phone and at least one required skill are needed.",
    });
  }
  if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 10000)) {
    return res.status(400).json({ error: "Description must be text." });
  }
  if (skills.length > 20) {
    return res.status(400).json({ error: "A job can contain at most 20 required skills." });
  }

  const seen = new Set();
  const cleanedSkills = [];
  for (const s of skills) {
    const name = normalizeSkill(s?.skill_name);
    if (!name || name.length > 100 || !Number.isInteger(s.required_level) || s.required_level < 1 || s.required_level > 5) {
      return res.status(400).json({ error: "Each required skill needs a valid name and a level from 1 to 5." });
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return res.status(400).json({ error: `Duplicate required skill: ${name}.` });
    }
    seen.add(key);
    cleanedSkills.push({ skill_name: name, required_level: s.required_level });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query("BEGIN");
    const jobResult = await client.query(
      `INSERT INTO jobs (company_id, title, description, contact_email, contact_phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, title, description, contact_email, contact_phone, created_at`,
      [req.user.id, title.trim(), (description || "").trim(), contact_email.trim(), contact_phone.trim()]
    );
    const job = jobResult.rows[0];

    for (const s of cleanedSkills) {
      await client.query(
        `INSERT INTO job_skills (job_id, skill_name, required_level) VALUES ($1, $2, $3)`,
        [job.id, s.skill_name, s.required_level]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ job: { ...job, required_skills: cleanedSkills } });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not create job." });
  } finally {
    client?.release();
  }
});

// Applicants for a company-owned job, with current skill readiness.
router.get("/:id/candidates", requireAuth, requireRole("company"), async (req, res) => {
  try {
    const jobResult = await db.query(
      `SELECT id, title
       FROM jobs
       WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!jobResult.rows.length) return res.status(404).json({ error: "Job not found." });

    const jobSkillsResult = await db.query(
      `SELECT skill_name, required_level
       FROM job_skills
       WHERE job_id = $1
       ORDER BY skill_name`,
      [req.params.id]
    );
    const students = await loadStudentsWithSkills(req.user.id, Number(req.params.id));

    const ready = [];
    let nearCount = 0;
    let notReadyCount = 0;

    for (const student of students) {
      const analysis = analyzeJob(student.skills, jobSkillsResult.rows);
      ready.push({
          id: student.id,
          name: student.name,
          email: student.email,
          phone: student.phone,
          readiness_percent: analysis.readinessPercent,
          required_skills: getRequiredSkillSnapshot(student.skills, jobSkillsResult.rows),
      });
      if (analysis.status === 'near') nearCount += 1;
      if (analysis.status === 'not_ready') notReadyCount += 1;
    }

    res.json({
      job: jobResult.rows[0],
      requirements: jobSkillsResult.rows,
      stats: {
        total_students: students.length,
        ready_count: ready.length - nearCount - notReadyCount,
        near_count: nearCount,
        not_ready_count: notReadyCount,
      },
      candidates: ready,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load matching students." });
  }
});

// DELETE /api/jobs/:id -> company removes its own job
router.delete("/:id", requireAuth, requireRole("company"), async (req, res) => {
  try {
    const result = await db.query(
      "DELETE FROM jobs WHERE id = $1 AND company_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Job not found." });
    }
    res.json({ message: "Job removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove job." });
  }
});

// GET /api/jobs/:id/analysis -> gap analysis + suggested courses for the logged-in student
router.get("/:id/analysis", requireAuth, requireRole("student"), async (req, res) => {
  try {
    const jobResult = await db.query(
      `SELECT j.id, j.title, j.contact_email, j.contact_phone, u.name AS company_name
       FROM jobs j
       JOIN users u ON u.id = j.company_id WHERE j.id = $1`,
      [req.params.id]
    );
    if (!jobResult.rows.length) return res.status(404).json({ error: "Job not found." });

    const jobSkillsResult = await db.query(
      "SELECT skill_name, required_level FROM job_skills WHERE job_id = $1",
      [req.params.id]
    );
    const studentSkillsResult = await db.query(
      "SELECT skill_name, level FROM student_skills WHERE student_id = $1",
      [req.user.id]
    );

    const analysis = analyzeJob(studentSkillsResult.rows, jobSkillsResult.rows);

    let courses = [];
    if (analysis.gaps.length) {
      const names = analysis.gaps.map((g) => g.skill_name);
      const coursesResult = await db.query(
        "SELECT skill_name, course_name, provider, link FROM courses"
      );
      courses = coursesResult.rows.filter(course => names.map(normalizeSkill).includes(normalizeSkill(course.skill_name)));
    }

    const rawJob = jobResult.rows[0];
    const job = {
      id: rawJob.id,
      title: rawJob.title,
      company_name: rawJob.company_name,
    };

    const { rows: applications } = await db.query("SELECT id FROM applications WHERE job_id = $1 AND student_id = $2", [req.params.id, req.user.id]);
    const applicationContact =
      applications.length > 0
        ? { email: rawJob.contact_email, phone: rawJob.contact_phone }
        : null;

    res.json({ job, ...analysis, courses, application_contact: applicationContact });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not analyze job." });
  }
});


// Eligibility is checked again when an application is submitted.
router.post('/:id/apply', requireAuth, requireRole('student'), async (req, res, next) => {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const { rows: jobs } = await client.query('SELECT id FROM jobs WHERE id = $1 FOR SHARE', [req.params.id]);
    if (!jobs.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Job not found.' }); }
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const { rows: existing } = await client.query('SELECT * FROM applications WHERE job_id = $1 AND student_id = $2', [req.params.id, req.user.id]);
    if (existing.length) { await client.query('COMMIT'); return res.json({ application: existing[0] }); }
    const { rows: skills } = await client.query('SELECT skill_name, level FROM student_skills WHERE student_id = $1', [req.user.id]);
    const { rows: requirements } = await client.query('SELECT skill_name, required_level FROM job_skills WHERE job_id = $1', [req.params.id]);
    if (analyzeJob(skills, requirements).status !== 'ready') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Meet every required skill level before applying.' });
    }
    const { rows } = await client.query('INSERT INTO applications (job_id, student_id) VALUES ($1, $2) RETURNING *', [req.params.id, req.user.id]);
    await client.query('COMMIT');
    res.status(201).json({ application: rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    next(err);
  } finally { client?.release(); }
});

module.exports = router;
