CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
