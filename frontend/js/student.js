(function () {
  requireSession("index.html");
  const user = getUser();
  if (!user || user.role !== "student") {
    window.location.href = user ? "company.html" : "index.html";
    return;
  }

  document.getElementById("userName").textContent = user.name;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearSession();
    window.location.href = "index.html";
  });

  const skillRowsEl = document.getElementById("skillRows");
  const addSkillRowBtn = document.getElementById("addSkillRow");
  const saveSkillsBtn = document.getElementById("saveSkills");
  const skillsMsg = document.getElementById("skillsMsg");
  const jobsList = document.getElementById("jobsList");
  const contactCard = document.getElementById("contactCard");
  const skillOverview = document.getElementById("skillOverview");
  const statsEl = document.getElementById("studentStats");
  const filtersEl = document.getElementById("jobFilters");
  const modal = document.getElementById("analysisModal");
  const modalBody = document.getElementById("modalBody");

  let currentSkills = [];
  let currentJobs = [];
  let currentStats = null;
  let currentProfile = null;
  let jobFilter = "all";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function addSkillRow(name = "", level = "") {
    const row = document.createElement("div");
    row.className = "skill-row";
    row.innerHTML = `
      <input type="text" required aria-label="${escapeHtml(t("skill_name_ph"))}" maxlength="100" class="skill-name" placeholder="${escapeHtml(t("skill_name_ph"))}" value="${escapeHtml(name)}" />
      <input type="number" required aria-label="${escapeHtml(t("skill_level_ph"))}" min="1" max="5" class="skill-level" placeholder="${escapeHtml(t("skill_level_ph"))}" value="${escapeHtml(level)}" />
      <button type="button" class="remove-row" aria-label="${escapeHtml(t("remove_skill"))}">&times;</button>
    `;
    row.querySelector(".remove-row").addEventListener("click", () => row.remove());
    skillRowsEl.appendChild(row);
  }

  addSkillRowBtn.addEventListener("click", () => {
    addSkillRow();
    const rows = skillRowsEl.querySelectorAll(".skill-row");
    rows[rows.length - 1]?.querySelector(".skill-name")?.focus();
  });

  function readSkillRows() {
    return Array.from(skillRowsEl.querySelectorAll(".skill-row"))
      .map((row) => ({
        skill_name: row.querySelector(".skill-name").value.trim(),
        level: Number(row.querySelector(".skill-level").value),
      }));
  }

  function renderContactCard() {
    if (!currentProfile) return;
    contactCard.innerHTML = `
      <div class="ledger-row"><span>${escapeHtml(t("field_name_student"))}</span><span>${escapeHtml(currentProfile.name)}</span></div>
      <div class="ledger-row"><span>${escapeHtml(t("field_email"))}</span><span>${escapeHtml(currentProfile.email)}</span></div>
      <div class="ledger-row"><span>${escapeHtml(t("field_phone"))}</span><span>${escapeHtml(currentProfile.phone)}</span></div>
    `;
  }

  function renderSkillOverview() {
    if (!currentSkills.length) {
      skillOverview.innerHTML = `<div class="empty-note">${escapeHtml(t("no_skills"))}</div>`;
      return;
    }

    const sorted = [...currentSkills].sort((a, b) => b.level - a.level || a.skill_name.localeCompare(b.skill_name));
    skillOverview.innerHTML = sorted
      .map((skill) => {
        const width = Math.max(0, Math.min(100, (Number(skill.level) / 5) * 100));
        return `
          <div class="skill-meter-card">
            <div class="skill-meter-head">
              <b>${escapeHtml(skill.skill_name)}</b>
              <span>${escapeHtml(t("level_word"))} ${Number(skill.level)}/5</span>
            </div>
            <div class="meter-track"><div class="meter-fill" style="--meter-width:${width}%"></div></div>
          </div>
        `;
      })
      .join("");
  }

  function renderStudentStats() {
    if (!currentStats) return;
    statsEl.innerHTML = `
      <div class="stat-card"><span>${escapeHtml(t("stat_skills"))}</span><b>${currentStats.skills_count}</b><small>${escapeHtml(t("stat_skills_hint"))}</small></div>
      <div class="stat-card"><span>${escapeHtml(t("stat_eligible_jobs"))}</span><b>${currentStats.eligible_jobs}</b><small>${escapeHtml(t("stat_eligible_jobs_hint"))}</small></div>
      <div class="stat-card"><span>${escapeHtml(t("stat_eligible_companies"))}</span><b>${currentStats.eligible_companies}</b><small>${escapeHtml(t("stat_eligible_companies_hint"))}</small></div>
      <div class="stat-card"><span>${escapeHtml(t("stat_average_level"))}</span><b>${currentStats.average_level}/5</b><small>${escapeHtml(t("stat_average_level_hint"))}</small></div>
    `;
  }

  function jobCardHTML(job, analysis) {
    const tags = job.required_skills
      .map((skill) => `<span class="tag">${escapeHtml(skill.skill_name)} · ${Number(skill.required_level)}</span>`)
      .join("");

    const description = job.description
      ? `<div class="job-card-description">${escapeHtml(job.description)}</div>`
      : "";

    const contactState = job.application
      ? `<div class="job-card-contact match-count">✓ ${escapeHtml(t("applied"))}</div>`
      : analysis.status === "ready"
      ? `<div class="job-card-contact match-count">✓ ${escapeHtml(t("contact_unlocked_ready"))}</div>`
      : `<div class="job-card-contact">🔒 ${escapeHtml(t("contact_locked"))}</div>`;

    const applyButton = job.application
      ? `<button class="btn btn-small" disabled>${escapeHtml(t("applied"))}</button>`
      : analysis.status === "ready"
      ? `<button class="btn btn-apply btn-small apply-job" data-job-id="${job.id}">${escapeHtml(t("apply_now"))}</button>`
      : "";

    return `
      <div class="job-card" data-job-id="${job.id}">
        <div>
          <div class="job-card-title">${escapeHtml(job.title)}</div>
          <div class="job-card-company">${escapeHtml(job.company_name)}</div>
          ${description}
          <div class="job-card-skills">${tags}</div>
          ${contactState}
          <div class="job-readiness-line">
            <span>${analysis.readinessPercent}%</span>
            <div class="meter-track"><div class="meter-fill" style="--meter-width:${analysis.readinessPercent}%"></div></div>
          </div>
        </div>
        <div class="job-card-actions">
          <span class="status-badge status-${analysis.status}">${escapeHtml(t("status_" + analysis.status))}</span>
          ${applyButton}
          <button class="btn btn-ghost btn-small view-analysis" data-job-id="${job.id}">${escapeHtml(t("view_analysis"))}</button>
        </div>
      </div>
    `;
  }

  function renderJobs() {
    if (!currentJobs.length) {
      jobsList.innerHTML = `<div class="empty-note">${escapeHtml(t("no_jobs_yet"))}</div>`;
      return;
    }

    const scored = currentJobs
      .map((job) => ({ job, analysis: job.analysis }))
      .filter(({ analysis }) => jobFilter === "all" || analysis.status === jobFilter)
      .sort((a, b) => b.analysis.readinessPercent - a.analysis.readinessPercent);

    if (!scored.length) {
      jobsList.innerHTML = `<div class="empty-note">${escapeHtml(t("no_jobs_in_filter"))}</div>`;
      return;
    }

    jobsList.innerHTML = scored.map(({ job, analysis }) => jobCardHTML(job, analysis)).join("");

    jobsList.querySelectorAll(".view-analysis").forEach((button) => {
      button.addEventListener("click", () => openAnalysis(button.dataset.jobId));
    });
    jobsList.querySelectorAll(".apply-job").forEach((button) => {
      button.addEventListener("click", () => openAnalysis(button.dataset.jobId, true));
    });
  }

  async function loadStats() {
    const { stats } = await api("/students/me/stats", { auth: true });
    currentStats = stats;
    renderStudentStats();
  }

  async function loadJobs() {
    const { jobs } = await api("/jobs", { auth: true });
    currentJobs = jobs;
    renderJobs();
  }

  saveSkillsBtn.addEventListener("click", async () => {
    if (!Array.from(skillRowsEl.querySelectorAll("input")).every(input => input.reportValidity())) return;
    const skills = readSkillRows();
    skillsMsg.className = "form-msg";
    saveSkillsBtn.disabled = true;

    try {
      const result = await api("/students/me/skills", { method: "PUT", auth: true, body: { skills } });
      currentSkills = result.skills;
      renderSkillOverview();
      await Promise.all([loadJobs(), loadStats()]);
      skillsMsg.textContent = t("skills_saved");
      skillsMsg.className = "form-msg success";
    } catch (err) {
      skillsMsg.textContent = err.message;
      skillsMsg.className = "form-msg error";
    } finally {
      saveSkillsBtn.disabled = false;
    }
  });

  filtersEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    jobFilter = button.dataset.filter;
    filtersEl.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderJobs();
  });

  async function openAnalysis(jobId, fromApply = false) {
    modal.classList.add("open");
    modalBody.innerHTML = `<div class="empty-note">${escapeHtml(t("loading"))}</div>`;

    try {
      if (fromApply) {
        await api(`/jobs/${jobId}/apply`, { method: 'POST', auth: true, body: {} });
        await loadJobs();
      }
      const data = await api(`/jobs/${jobId}/analysis`, { auth: true });
      const gaugeColor = data.status === "ready" ? "#57a67e" : data.status === "near" ? "#d89a4e" : "#b8593f";
      const circumference = 2 * Math.PI * 32;
      const offset = circumference - (data.readinessPercent / 100) * circumference;

      const gapsHTML = data.gaps.length
        ? data.gaps
            .map(
              (gap) => `<div class="ledger-row gap"><span>${escapeHtml(gap.skill_name)}</span><span>${escapeHtml(t("have"))} ${gap.current_level} / ${escapeHtml(t("required"))} ${gap.required_level}</span></div>`
            )
            .join("")
        : `<p>${escapeHtml(t("no_gap"))}</p>`;

      const coursesHTML = data.courses.length
        ? data.courses
            .map(
              (course) => `<div class="course-item"><span>${escapeHtml(course.skill_name)} — ${escapeHtml(course.course_name)} (${escapeHtml(course.provider)})</span><a href="${escapeHtml(course.link)}" target="_blank" rel="noopener">↗</a></div>`
            )
            .join("")
        : "";

      const contactHTML = data.application_contact
        ? `
          <div class="application-unlocked" id="applicationContact">
            <h3>✓ ${escapeHtml(t("application_unlocked_title"))}</h3>
            <p>${escapeHtml(t("application_unlocked_body"))}</p>
            <div class="contact-actions">
              <a class="contact-link" href="mailto:${escapeHtml(data.application_contact.email)}">✉ ${escapeHtml(data.application_contact.email)}</a>
              <a class="contact-link" href="tel:${escapeHtml(data.application_contact.phone)}">☎ ${escapeHtml(data.application_contact.phone)}</a>
            </div>
          </div>
        `
        : `<div class="locked-contact mt-16">🔒 <span>${escapeHtml(t("application_locked_body"))}</span></div>`;

      modalBody.innerHTML = `
        <div class="gauge-big">
          <svg width="88" height="88" viewBox="0 0 76 76" aria-label="${data.readinessPercent}%">
            <circle cx="38" cy="38" r="32" fill="none" stroke="#1a2338" stroke-width="6"/>
            <circle cx="38" cy="38" r="32" fill="none" stroke="${gaugeColor}" stroke-width="6"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" transform="rotate(-90 38 38)"/>
            <text x="38" y="43" text-anchor="middle" font-family="IBM Plex Mono" font-size="16" fill="#F4EFE3">${data.readinessPercent}%</text>
          </svg>
          <div>
            <b style="font-family:var(--font-display);font-size:19px;">${escapeHtml(data.job.title)}</b>
            <p>${escapeHtml(data.job.company_name)}</p>
          </div>
        </div>
        <h3 style="font-size:15px;margin-bottom:10px;">${escapeHtml(t("missing_skills"))}</h3>
        ${gapsHTML}
        ${
          data.courses.length
            ? `<h3 style="font-size:15px;margin:18px 0 6px;">${escapeHtml(t("suggested_courses"))}</h3>${coursesHTML}`
            : ""
        }
        ${contactHTML}
      `;

      if (fromApply && data.application_contact) {
        document.getElementById("applicationContact")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (err) {
      modalBody.innerHTML = `<div class="empty-note">${escapeHtml(err.message)}</div>`;
    }
  }

  document.getElementById("closeModal").addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.remove("open");
  });

  async function init() {
    try {
      const [{ profile, skills }, jobsData, statsData] = await Promise.all([
        api("/students/me", { auth: true }),
        api("/jobs", { auth: true }),
        api("/students/me/stats", { auth: true }),
      ]);

      currentProfile = profile;
      currentSkills = skills.map((skill) => ({ skill_name: skill.skill_name, level: Number(skill.level) }));
      currentJobs = jobsData.jobs;
      currentStats = statsData.stats;

      skillRowsEl.innerHTML = "";
      if (currentSkills.length) currentSkills.forEach((skill) => addSkillRow(skill.skill_name, skill.level));
      else addSkillRow();

      renderContactCard();
      renderSkillOverview();
      renderStudentStats();
      renderJobs();
    } catch (err) {
      skillsMsg.textContent = err.message;
      skillsMsg.className = "form-msg error";
    }
  }

  document.body.addEventListener("langchange", () => {
    document.querySelectorAll('.skill-name').forEach(input => { input.placeholder = t('skill_name_ph'); input.setAttribute('aria-label', t('skill_name_ph')); });
    document.querySelectorAll('.skill-level').forEach(input => { input.placeholder = t('skill_level_ph'); input.setAttribute('aria-label', t('skill_level_ph')); });
    document.querySelectorAll('.remove-row').forEach(button => button.setAttribute('aria-label', t('remove_skill')));
    renderContactCard();
    renderSkillOverview();
    renderStudentStats();
    renderJobs();
  });

  init();
})();
