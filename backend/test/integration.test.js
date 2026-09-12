const { test } = require('node:test');
const assert = require('node:assert/strict');

test('PostgreSQL application lifecycle and privacy', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'integration-test-secret-01234567890123456789';
  const app = require('../src/server');
  const db = require('../src/db');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const users = [];
  async function request(path, method = 'GET', body, token, expected = 200) {
    const response = await fetch(base + path, { method, headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  }
  async function register(role, suffix) {
    const data = await request('/auth/register', 'POST', { role, name: 'Integration ' + suffix,
      email: `test-${Date.now()}-${suffix}@example.com`, phone: '0791234567', password: 'Test-password-123' }, null, 201);
    users.push(data.user.id); return data;
  }
  try {
    const company = await register('company', 'owner');
    const stranger = await register('company', 'other');
    const student = await register('student', 'applicant');
    const nonApplicant = await register('student', 'private');
    const login = await request('/auth/login', 'POST', { email: student.user.email.toUpperCase(), password: 'Test-password-123' });
    assert.equal(login.user.id, student.user.id);
    const skills = level => ({ skills: [{ skill_name: ' JS ', level }] });
    await request('/students/me/skills', 'PUT', skills(4), student.token);
    await request('/students/me/skills', 'PUT', skills(5), nonApplicant.token);
    const jobBody = { title: 'Developer', description: 'Test job', contact_email: company.user.email,
      contact_phone: company.user.phone, skills: [{ skill_name: 'JavaScript', required_level: 5 }] };
    const { job } = await request('/jobs', 'POST', jobBody, company.token, 201);
    const list = await request('/jobs', 'GET', undefined, student.token);
    assert.equal(list.jobs.find(j => j.id === job.id).analysis.readinessPercent, 80);
    assert.equal((await request(`/jobs/${job.id}/analysis`, 'GET', undefined, student.token)).application_contact, null);
    await request(`/jobs/${job.id}/apply`, 'POST', {}, student.token, 403);
    assert.equal((await request(`/jobs/${job.id}/candidates`, 'GET', undefined, company.token)).candidates.length, 0);
    await request('/students/me/skills', 'PUT', skills(5), student.token);
    const submitted = await request(`/jobs/${job.id}/apply`, 'POST', {}, student.token, 201);
    const again = await request(`/jobs/${job.id}/apply`, 'POST', {}, student.token);
    assert.equal(submitted.application.id, again.application.id);
    assert.equal(submitted.application.status, 'submitted');
    assert.ok(submitted.application.applied_at);
    assert.ok((await request(`/jobs/${job.id}/analysis`, 'GET', undefined, student.token)).application_contact);
    const applicants = await request(`/jobs/${job.id}/candidates`, 'GET', undefined, company.token);
    assert.deepEqual(applicants.candidates.map(c => c.id), [student.user.id]);
    await request(`/jobs/${job.id}/candidates`, 'GET', undefined, stranger.token, 404);
    await request(`/jobs/${job.id}`, 'DELETE', undefined, stranger.token, 404);
    await request('/students/me/skills', 'PUT', skills(3), student.token);
    const changed = await request(`/jobs/${job.id}/candidates`, 'GET', undefined, company.token);
    assert.equal(changed.candidates[0].readiness_percent, 60);
    const stats = await request('/jobs/mine/stats', 'GET', undefined, company.token);
    assert.equal(stats.summary.total_students, 1);
    assert.equal(stats.jobs[0].near_count, 1);
    await request('/jobs', 'POST', { ...jobBody, title: 'x'.repeat(151) }, company.token, 400);
    await request('/jobs', 'POST', { ...jobBody, skills: [null] }, company.token, 400);
    await request('/students/me/skills', 'PUT', { skills: [{ skill_name: 'JS', level: 2 }, { skill_name: 'JavaScript', level: 3 }] }, student.token, 400);
    const courses = await request('/courses?skill=JS');
    assert.ok(courses.courses.some(c => c.skill_name === 'JavaScript'));
    await request(`/jobs/${job.id}`, 'DELETE', undefined, company.token);
    const { rows } = await db.query('SELECT * FROM applications WHERE job_id = $1', [job.id]);
    assert.equal(rows.length, 0);
  } finally {
    await db.query('DELETE FROM users WHERE id = ANY($1::integer[])', [users]);
    await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  }
});
