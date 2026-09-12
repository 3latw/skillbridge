(function () {
  let role = "student";
  let mode = "login"; // or "register"

  const roleButtons = document.querySelectorAll("[data-role]");
  const nameLabel = document.getElementById("nameLabel");
  const authTitle = document.getElementById("authTitle");
  const authSubmit = document.getElementById("authSubmit");
  const authSwitchLink = document.getElementById("authSwitchLink");
  const registerOnlyFields = document.querySelectorAll(".register-only");
  const form = document.getElementById("authForm");
  const formMsg = document.getElementById("formMsg");
  const navAuthBtn = document.getElementById("navAuthBtn");
  const navJobs = document.getElementById("navJobs");

  function refreshLabels() {
    nameLabel.setAttribute("data-i18n", role === "student" ? "field_name_student" : "field_name_company");
    authTitle.setAttribute("data-i18n", mode === "login" ? "auth_title_login" : "auth_title_register");
    authSubmit.setAttribute("data-i18n", mode === "login" ? "submit_login" : "submit_register");
    authSwitchLink.setAttribute("data-i18n", mode === "login" ? "auth_switch_to_register" : "auth_switch_to_login");
    registerOnlyFields.forEach((f) => f.classList.toggle("hidden", mode === "login"));
    [nameLabel, authTitle, authSubmit, authSwitchLink].forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    registerOnlyFields.forEach(field => field.querySelectorAll('input').forEach(input => {
      input.disabled = mode === 'login'; input.required = mode === 'register';
    }));
    form.querySelector('[name=password]').minLength = mode === 'register' ? 8 : 1;
  }

  roleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      role = btn.getAttribute("data-role");
      roleButtons.forEach((b) => b.classList.toggle("active", b === btn));
      refreshLabels();
    });
  });

  authSwitchLink.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    formMsg.className = "form-msg";
    refreshLabels();
  });

  document.querySelectorAll("[data-role-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      const targetRole = el.getAttribute("data-role-cta");
      roleButtons.forEach((b) => b.classList.toggle("active", b.getAttribute("data-role") === targetRole));
      role = targetRole;
      refreshLabels();
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMsg.className = "form-msg";
    const fd = new FormData(form);
    const payload = {
      email: fd.get("email"),
      password: fd.get("password"),
    };

    try {
      let data;
      if (mode === "register") {
        payload.role = role;
        payload.name = fd.get("name");
        payload.phone = fd.get("phone");
        data = await api("/auth/register", { method: "POST", body: payload });
      } else {
        data = await api("/auth/login", { method: "POST", body: payload });
      }
      setSession(data.token, data.user);
      window.location.href = data.user.role === "student" ? "student.html" : "company.html";
    } catch (err) {
      formMsg.textContent = err.message;
      formMsg.className = "form-msg error";
    }
  });

  function updateNav() {
    const user = getUser();
    if (user) {
      navAuthBtn.textContent = t("nav_dashboard");
      navAuthBtn.href = user.role === "student" ? "student.html" : "company.html";
    }
  }

  navJobs.addEventListener("click", (e) => {
    e.preventDefault();
    const user = getUser();
    if (user) {
      window.location.href = user.role === "student" ? "student.html#jobs" : "company.html";
    } else {
      document.getElementById("auth").scrollIntoView({ behavior: "smooth" });
    }
  });

  document.body.addEventListener("langchange", refreshLabels);
  refreshLabels();
  updateNav();
})();
