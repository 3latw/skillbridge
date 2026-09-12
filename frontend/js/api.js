const API_BASE = "/api";

function getToken() {
  return localStorage.getItem("sb_token");
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("sb_user") || "null");
  } catch {
    return null;
  }
}

function setSession(token, user) {
  localStorage.setItem("sb_token", token);
  localStorage.setItem("sb_user", JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem("sb_token");
  localStorage.removeItem("sb_user");
}

async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || t("error_generic"));
  }
  return data;
}

function requireSession(redirectTo = "index.html") {
  if (!getToken()) {
    window.location.href = redirectTo;
  }
}
