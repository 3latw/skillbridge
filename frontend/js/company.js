(function () {
  requireSession("index.html");
  const user = getUser();
  if (!user || user.role !== "company") {
    window.location.href = user ? "student.html" : "index.html";
    return;
  }

  document.getElementById("userName").textContent = user.name;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearSession();
    window.location.href = "index.html";
  });

  const reqSkillRows = document.getElementById("reqSkillRows");
  const addReqSkillBtn = document.getElementById("addReqSkill");
  const publishBtn = document.getElementById("publishJob");
  const jobMsg = document.getElementById("jobMsg");
  const myJobsEl = document.getElementById("myJobs");
  const companyStatsEl = document.getElementById("companyStats");
  const jobAnalyticsEl = document.getElementById("jobAnalytics");
  const candidatesModal = document.getElementById("candidatesModal");
  const candidatesModalBody = document.getElementById("candidatesModalBody");

  let currentJobs = [];
  let currentStats = { summary: null, jobs: [] };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);
  }

  function addReqSkillRow(name = "", level = "") {
    const row = document.createElement("div");
    row.className = "skill-row";
    row.innerHTML = `
      <input type="text" required aria-label="${escapeHtml(t("skill_name_ph"))}" maxlength="100" class="req-skill-name" placeholder="${escapeHtml(t("skill_name_ph"))}" value="${escapeHtml(name)}" />
      <input type="number" required aria-label="${escapeHtml(t("skill_level_ph"))}" min="1" max="5" class="req-skill-level" placeholder="${escapeHtml(t("skill_level_ph"))}" value="${escapeHtml(level)}" />
      <button type="button" class="remove-row" aria-label="${escapeHtml(t("remove_skill"))}">&times;</button>
    `;
    row.querySelector(".remove-row").addEventListener("click", () => row.remove());
    reqSkillRows.appendChild(row);
  }

  function resetCompanyContactFields() {
    document.getElementById("jobEmail").value = user.email || "";
    document.getElementById("jobPhone").value = user.phone || "";
  }

  addReqSkillRow();
  resetCompanyContactFields();
  addReqSkillBtn.addEventListener("click", () => {
    addReqSkillRow();
    const rows = reqSkillRows.querySelectorAll(".skill-row");
    rows[rows.length - 1]?.querySelector(".req-skill-name")?.focus();
  });

  function readReqSkills() {
    return Array.from(reqSkillRows.querySelectorAll(".skill-row"))
      .map((row) => ({
        skill_name: row.querySelector(".req-skill-name").value.trim(),
        required_level: Number(row.querySelector(".req-skill-level").value),
      }));
  }

  function statForJob(jobId) {
    return currentStats.jobs.find((item) => Number(item.id) === Number(jobId));
  }

  function renderCompanyStats() {
    const summary = currentStats.summary;
    if (!summary) return;

    companyStatsEl.innerHTML = `
      <div class="stat-card"><span>${escapeHtml(t("stat_open_jobs"))}</span><b>${summary.total_jobs}</b><small>${escapeHtml(t("stat_open_jobs_hint"))}</small></div>
      <div class="stat-card"><span>${escapeHtml(t("stat_ready_candidates"))}</span><b>${summary.total_ready_matches}</b><small>${escapeHtml(t("stat_ready_candidates_hint"))}</small></div>
      <div class="stat-card"><span>${escapeHtml(t("stat_students_scanned"))}</span><b>${summary.total_students}</b><small>${escapeHtml(t("stat_students_scanned_hint"))}</small></div>
      <div class="stat-card"><span>${escapeHtml(t("stat_jobs_with_matches"))}</span><b>${summary.jobs_with_candidates}</b><small>${escapeHtml(t("stat_jobs_with_matches_hint"))}</small></div>
    `;
  }

  function jobRowHTML(job) {
    const tags = job.required_skills
      .map((skill) => `<span class="tag">${escapeHtml(skill.skill_name)} · ${Number(skill.required_level)}</span>`)
      .join("");
    const stat = statForJob(job.id);
    const matchText = stat
      ? `<div class="job-match-summary"><span>✓</span><span>${stat.ready_count} ${escapeHtml(t("ready_students_short"))}</span></div>`
      : "";

    return `
      <div class="job-card" data-job-id="${job.id}">
        <div>
          <div class="job-card-title">${escapeHtml(job.title)}</div>
          ${job.description ? `<div class="job-card-description">${escapeHtml(job.description)}</div>` : ""}
          <div class="job-card-contact mt-8">${escapeHtml(job.contact_email)} · ${escapeHtml(job.contact_phone)}</div>
          <div class="job-card-skills mt-8">${tags}</div>
          ${matchText}
        </div>
        <div class="job-card-actions">
          <button class="btn btn-apply btn-small view-candidates" data-job-id="${job.id}">${escapeHtml(t("view_matching_students"))}</button>
          <button class="btn btn-danger btn-small remove-job" data-job-id="${job.id}">${escapeHtml(t("remove_job"))}</button>
        </div>
      </div>
    `;
  }

  function renderMyJobs() {
    if (!currentJobs.length) {
      myJobsEl.innerHTML = `<div class="empty-note">${escapeHtml(t("no_jobs_yet"))}</div>`;
      return;
    }

    myJobsEl.innerHTML = currentJobs.map(jobRowHTML).join("");
    myJobsEl.querySelectorAll(".remove-job").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm(t("confirm_remove_job"))) return;
        try {
          await api(`/jobs/${button.dataset.jobId}`, { method: "DELETE", auth: true });
          await loadDashboard();
        } catch (err) {
          jobMsg.textContent = err.message;
          jobMsg.className = "form-msg error";
        }
      });
    });
    myJobsEl.querySelectorAll(".view-candidates").forEach((button) => {
      button.addEventListener("click", () => openCandidates(button.dataset.jobId));
    });
  }

  function barRow(label, count, total, className) {
    const width = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="chart-row">
        <span>${escapeHtml(label)}</span>
        <div class="chart-track"><div class="chart-fill ${className}" style="--chart-width:${width}%"></div></div>
        <b>${count}</b>
      </div>
    `;
  }

  function renderAnalytics() {
    if (!currentStats.jobs.length) {
      jobAnalyticsEl.innerHTML = `<div class="empty-note">${escapeHtml(t("analytics_empty"))}</div>`;
      return;
    }

    jobAnalyticsEl.innerHTML = currentStats.jobs
      .map((job) => {
        const preview = job.candidate_preview.length
          ? `<div class="candidate-preview">${job.candidate_preview
              .map((candidate) => `<span class="candidate-name-chip">${escapeHtml(candidate.name)}</span>`)
              .join("")}</div>`
          : `<div class="job-card-contact mt-8">${escapeHtml(t("no_ready_candidates"))}</div>`;

        return `
          <div class="analytics-card">
            <div class="analytics-card-head">
              <div>
                <h3>${escapeHtml(job.title)}</h3>
                <span>${job.match_rate}% ${escapeHtml(t("match_rate"))}</span>
              </div>
              <button class="btn btn-ghost btn-small view-candidates" data-job-id="${job.id}">${escapeHtml(t("who_are_they"))}</button>
            </div>
            ${barRow(t("status_ready"), job.ready_count, job.total_students, "ready")}
            ${barRow(t("status_near"), job.near_count, job.total_students, "near")}
            ${barRow(t("status_not_ready"), job.not_ready_count, job.total_students, "not-ready")}
            ${preview}
          </div>
        `;
      })
      .join("");

    jobAnalyticsEl.querySelectorAll(".view-candidates").forEach((button) => {
      button.addEventListener("click", () => openCandidates(button.dataset.jobId));
    });
  }

  async function openCandidates(jobId) {
    candidatesModal.classList.add("open");
    candidatesModalBody.innerHTML = `<div class="empty-note">${escapeHtml(t("loading"))}</div>`;

    try {
      const data = await api(`/jobs/${jobId}/candidates`, { auth: true });
      const summary = `
        <div class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:18px;">
          <div class="stat-card"><span>${escapeHtml(t("status_ready"))}</span><b>${data.stats.ready_count}</b><small>${escapeHtml(t("ready_students_short"))}</small></div>
          <div class="stat-card"><span>${escapeHtml(t("status_near"))}</span><b>${data.stats.near_count}</b><small>${escapeHtml(t("students_count_label"))}</small></div>
          <div class="stat-card"><span>${escapeHtml(t("status_not_ready"))}</span><b>${data.stats.not_ready_count}</b><small>${escapeHtml(t("students_count_label"))}</small></div>
        </div>
      `;

      if (!data.candidates.length) {
        candidatesModalBody.innerHTML = `${summary}<div class="empty-note">${escapeHtml(t("no_ready_candidates"))}</div>`;
        return;
      }

      const candidatesHTML = data.candidates
        .map((candidate) => {
          const skills = candidate.required_skills
            .map(
              (skill) => `<span class="tag">${escapeHtml(skill.skill_name)} ${skill.current_level}/${skill.required_level}</span>`
            )
            .join("");

          return `
            <div class="candidate-card">
              <div class="candidate-card-head">
                <div>
                  <h3>${escapeHtml(candidate.name)}</h3>
                  <span class="match-count">${candidate.readiness_percent}% ${escapeHtml(t("match"))}</span>
                </div>
              </div>
              <div class="candidate-contact">
                <a href="mailto:${escapeHtml(candidate.email)}">✉ ${escapeHtml(candidate.email)}</a>
                <a href="tel:${escapeHtml(candidate.phone)}">☎ ${escapeHtml(candidate.phone)}</a>
              </div>
              <div class="job-card-skills">${skills}</div>
            </div>
          `;
        })
        .join("");

      candidatesModalBody.innerHTML = `
        <h3 style="font-size:16px;margin-bottom:14px;">${escapeHtml(data.job.title)}</h3>
        ${summary}
        <div class="candidate-list">${candidatesHTML}</div>
      `;
    } catch (err) {
      candidatesModalBody.innerHTML = `<div class="empty-note">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadDashboard() {
    try {
      const [jobsData, statsData] = await Promise.all([
        api("/jobs/mine", { auth: true }),
        api("/jobs/mine/stats", { auth: true }),
      ]);
      currentJobs = jobsData.jobs;
      currentStats = statsData;
      renderCompanyStats();
      renderMyJobs();
      renderAnalytics();
    } catch (err) {
      myJobsEl.innerHTML = `<div class="empty-note">${escapeHtml(err.message)}</div>`;
      jobAnalyticsEl.innerHTML = `<div class="empty-note">${escapeHtml(err.message)}</div>`;
    }
  }

  document.getElementById("post").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    jobMsg.className = "form-msg";
    const skills = readReqSkills();
    const body = {
      title: document.getElementById("jobTitle").value.trim(),
      description: document.getElementById("jobDesc").value.trim(),
      contact_email: document.getElementById("jobEmail").value.trim(),
      contact_phone: document.getElementById("jobPhone").value.trim(),
      skills,
    };

    publishBtn.disabled = true;
    try {
      await api("/jobs", { method: "POST", auth: true, body });
      jobMsg.textContent = t("job_published");
      jobMsg.className = "form-msg success";
      document.getElementById("jobTitle").value = "";
      document.getElementById("jobDesc").value = "";
      resetCompanyContactFields();
      reqSkillRows.innerHTML = "";
      addReqSkillRow();
      await loadDashboard();
    } catch (err) {
      jobMsg.textContent = err.message;
      jobMsg.className = "form-msg error";
    } finally {
      publishBtn.disabled = false;
    }
  });

  document.getElementById("closeCandidatesModal").addEventListener("click", () => candidatesModal.classList.remove("open"));
  candidatesModal.addEventListener("click", (event) => {
    if (event.target === candidatesModal) candidatesModal.classList.remove("open");
  });

  document.body.addEventListener("langchange", () => {
    document.querySelectorAll('.req-skill-name').forEach(input => { input.placeholder = t('skill_name_ph'); input.setAttribute('aria-label', t('skill_name_ph')); });
    document.querySelectorAll('.req-skill-level').forEach(input => { input.placeholder = t('skill_level_ph'); input.setAttribute('aria-label', t('skill_level_ph')); });
    document.querySelectorAll('.remove-row').forEach(button => button.setAttribute('aria-label', t('remove_skill')));
    renderCompanyStats();
    renderMyJobs();
    renderAnalytics();
  });

  loadDashboard();
})();
