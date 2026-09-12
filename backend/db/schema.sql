-- SkillBridge database schema (PostgreSQL, raw SQL)

CREATE TYPE user_role AS ENUM ('student', 'company');

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    role          user_role NOT NULL,
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    phone         VARCHAR(30)  NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_skills (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_name  VARCHAR(100) NOT NULL,
    level       SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
    UNIQUE (student_id, skill_name)
);

CREATE TABLE jobs (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    description    TEXT,
    contact_email  VARCHAR(150) NOT NULL,
    contact_phone  VARCHAR(30)  NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_skills (
    id              SERIAL PRIMARY KEY,
    job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_name      VARCHAR(100) NOT NULL,
    required_level  SMALLINT NOT NULL CHECK (required_level BETWEEN 1 AND 5)
);

CREATE TABLE courses (
    id          SERIAL PRIMARY KEY,
    skill_name  VARCHAR(100) NOT NULL,
    course_name VARCHAR(200) NOT NULL,
    provider    VARCHAR(100) NOT NULL,
    link        TEXT NOT NULL
);

CREATE INDEX idx_student_skills_student ON student_skills(student_id);
CREATE INDEX idx_job_skills_job ON job_skills(job_id);
CREATE INDEX idx_courses_skill ON courses(skill_name);
CREATE INDEX idx_jobs_company ON jobs(company_id);

CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
