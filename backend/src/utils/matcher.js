const { normalizeSkill } = require('./skills');

function analyzeJob(studentSkills, jobSkills) {
  const studentMap = new Map(
    studentSkills.map((s) => [normalizeSkill(s.skill_name), s.level])
  );

  const gaps = [];
  let progress = 0;

  for (const req of jobSkills) {
    const key = normalizeSkill(req.skill_name);
    const have = studentMap.get(key) || 0;
    progress += Math.min(have / req.required_level, 1);
    if (have < req.required_level) {
      gaps.push({
        skill_name: req.skill_name,
        required_level: req.required_level,
        current_level: have,
        gap: req.required_level - have,
      });
    }
  }

  let status;
  if (gaps.length === 0) {
    status = "ready";
  } else if (gaps.length <= 2 && gaps.every((g) => g.gap <= 2)) {
    status = "near";
  } else {
    status = "not_ready";
  }

  const readinessPercent = jobSkills.length
    ? Math.round((progress / jobSkills.length) * 100)
    : 100;

  return { status, gaps, readinessPercent };
}

module.exports = { analyzeJob };
