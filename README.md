# CareerIntel-Engine (NeoCity Academy Career Explorer)

An AI career counselor for high school students: conversations that persist across sessions, memory the student controls, resume/transcript understanding, career exploration, personalized plans with PDF export, and progress tracking.

## Services

| Service | Port | Notes |
|---|---|---|
| Next.js frontend | 3001 | The only service browsers talk to |
| FastAPI backend | 8080 (127.0.0.1) | Called only by the Next.js server |
| vLLM (Qwen2.5-VL-32B-Instruct-AWQ, served as `cie-vl`) | 8000 (127.0.0.1) | `infra/docker-compose.yml` |
| PostgreSQL 16 | 5432 (127.0.0.1) | `infra/docker-compose.yml` |

## Running

```bash
# Backend
cd backend
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head          # additive migrations; safe to re-run
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080

# Frontend (always production mode)
cd frontend
npm run build
npm run start -- -p 3001
```

In production both run as systemd services that restart on failure and at boot:

```bash
(cd frontend && npm run build)           # after frontend changes
infra/systemd/install.sh                 # first time: installs and starts both
sudo systemctl restart cie-backend cie-frontend
journalctl -u cie-backend -f             # logs
```

Tests: `cd backend && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest`

### Settings in `backend/.env`

| Variable | Purpose |
|---|---|
| `CIE_SMTP_HOST`, `CIE_SMTP_PORT`, `CIE_SMTP_USERNAME`, `CIE_SMTP_PASSWORD`, `CIE_SMTP_FROM` | Email for password reset and email confirmation. Without `CIE_SMTP_HOST`, emails (including their links) are written to the backend log instead. |
| `CIE_APP_URL` | Public site address used in emailed links (default `http://localhost:3001`). |
| `CIE_STAFF_EMAILS` | Comma-separated school counselor emails. They get the Counselor Dashboard once their sign-in email is verified. |

Back up before schema changes: `docker exec cie-postgres pg_dump -U cie -d cie -Fc > backups/cie_$(date +%Y%m%d_%H%M%S).dump`

## How requests are authorized

The browser calls `/api/cie/*` on Next.js. That route (`frontend/src/app/api/cie/[...path]/route.ts`) checks the Auth.js session and forwards to FastAPI with the shared bridge secret plus the session's provider and subject. FastAPI (`backend/app/core/security.py`) resolves the student from its identity tables. No endpoint accepts a student ID from the client, and every query is filtered by the resolved student.

## Accounts

- One account per email. A first Google sign-in for an email that already has a password account is linked after the student enters that password once (or automatically if the email was confirmed).
- Password reset links last 30 minutes; confirmation links 2 days. Tokens are stored hashed and are single-use. Resetting a password signs out older sessions.
- Duplicate accounts from before linking existed can be merged with `backend/scripts/merge_students.py` (dry run by default).
- School counselors (see `CIE_STAFF_EMAILS`) see profile, interest quiz, plan, progress, roadmaps, saved careers, and document names. Never chat messages. Detail views are logged.

## The counselor

`backend/app/services/counselor_service.py` runs one bounded turn per message:

1. Save the message.
2. Assemble context within a token budget (`context_service.py`): profile, confirmed and pending facts, document overview and full-text-ranked passages, related past conversations, plan and progress, and recent turns.
3. Make one structured-output call to Qwen. The deployed vLLM has no tool-call parser, so guided JSON decoding is used. When the student picks a deep dive (skill check, project ideas, certificates, interview practice, career roadmap), the matching original CIE module runs instead.
4. Validate the output: career links must exist in the catalog, and remembered facts must quote the student's own message.
5. Save the reply. Facts are stored as *suggested* until the student confirms them.
6. Summarize older turns in the background. Raw messages are always kept.

Uploaded documents are wrapped as untrusted data in prompts. Scanned PDFs are read with Qwen2.5-VL.

## Data

- Migrations: `backend/alembic/` (`0001_baseline` matches the pre-redesign schema). Messages from before the redesign live in one "Earlier chats" conversation per student.
- Career catalog: `backend/app/data/careers.json`, built by `backend/scripts/build_career_catalog.py` from the O\*NET 31.0 Database (USDOL/ETA, CC BY 4.0). No salary or outlook figures.
