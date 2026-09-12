# SkillBridge

Student Skill-to-Job Matching Platform — منصة مطابقة مهارات الطلاب مع الوظائف.

Students record self-reported skills, compare them with job requirements, and submit applications when qualified. Companies review only students who applied to their jobs. Arabic and English interfaces support RTL and LTR.

## Run with Docker

1. Copy `.env.example` to `.env` in the project root.
2. Replace both password placeholders. Use a URL-safe database password and a random JWT secret of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Start Docker Desktop (Linux containers), then run `docker compose up --build`.
4. Open http://localhost:8080. Health endpoint: http://localhost:8080/api/health.

Only the web service is published, on the local loopback interface. PostgreSQL data persists in a named volume. Schema and starter courses are initialized only on first boot.

### Existing database

Back up your database before upgrading. Apply `backend/db/migrations/001_applications.sql` once with `psql`, or pipe its contents to `docker compose exec -T db psql -U skillbridge -d skillbridge`. Do not rerun the full schema on an existing database. No old Apply records exist to migrate because the previous version did not save them. Existing skills are normalized at comparison time; saving skills uses canonical names.

## Run locally

Use Node.js 22+ and PostgreSQL 16+. Create a `skillbridge` database and execute `backend/db/schema.sql`, then `backend/db/seed.sql` using `psql`.

```sh
cd backend
cp .env.example .env
# Set DATABASE_URL and a random JWT_SECRET in backend/.env.
npm ci
npm test
npm start
```

Open http://localhost:4000. Express serves the frontend and API on the same origin; no separate static server is needed. On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if preferred.

## Matching and applications

- Readiness is the average of `min(currentLevel / requiredLevel, 1)`, rounded to a percentage.
- `ready`: all requirements met; `near`: at most two gaps, each no more than two levels; otherwise `not_ready`.
- No requirements gives 100%; creating a job requires at least one skill.
- Names are normalized for case, whitespace, Unicode and common aliases such as JS/JavaScript, NodeJS/Node.js and Postgres/PostgreSQL. C++ and C# stay distinct.
- The backend is the only matching implementation. Jobs carry analysis results for the student dashboard.
- `POST /api/jobs/:id/apply` checks eligibility and saves a unique application with status `submitted` and a timestamp. Repeating a request returns the existing application.
- Only after submission are company contact details unlocked. The owner sees applicants through `GET /api/jobs/:id/candidates`; no non-applicant contact details are exposed.
- Applicants remain visible if their skills later change. Analytics show current readiness, not verified qualifications. Application review statuses and withdrawal are not implemented.

## Project layout

`backend/src/routes/` contains authentication, profiles, jobs and courses. Shared matching and validation live in `backend/src/utils/`. SQL schema and migrations are in `backend/db/`. `frontend/` contains plain HTML, CSS and JavaScript with no build step. `backend/test/` contains matcher and HTTP tests.

## Security and configuration

The API validates lengths, types, skill levels, email format and Jordanian mobile numbers (`07[789]…` or `+9627[789]…`). New passwords require 8 characters and at most 72 UTF-8 bytes. SQL uses parameters; application and skill writes use transactions. Helmet adds response headers and the authentication routes allow 30 requests per IP per 15 minutes.

`CORS_ORIGINS` is a comma-separated exact origin list. For a hosted deployment set the real HTTPS origin. `TRUST_PROXY_HOPS=1` is for the bundled nginx proxy; direct local execution uses 0. Do not expose the backend directly with a trusted proxy configuration. Rate-limit counters are in memory and intended for one API instance. JWTs are stored in browser localStorage; configure HTTPS for hosting and keep the frontend free of untrusted scripts.

`.env` and dependencies are excluded from version control. `package-lock.json` supports reproducible `npm ci` installs. See `CHANGELOG.md` and `TEST_REPORT.md` for this revision and its verification limits.

## Integration tests

`npm test` runs matcher and HTTP tests without a database. To include the application lifecycle test, point `TEST_DATABASE_URL` at a separate PostgreSQL test database initialized with the schema and seed, then run `npm test`. The test creates temporary users and removes only those users and their associated records. Never point test settings at a production database.

The `qs` override selects 6.16.0 to avoid advisories affecting Express's transitive dependency. Recheck with `npm audit` when updating dependencies.
