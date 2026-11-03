# AGENT INSTRUCTIONS & REPOSITORY RULES

> **MANDATORY POLICY FOR ALL DEVELOPERS AND AI AGENTS**:
> Whenever you **add**, **modify**, or **delete** any file, feature, component, API endpoint, or database table in this repository, you **MUST immediately record it in the `doc/` directory**, specifically:
> 1. Append a detailed entry in `doc/CHANGELOG.md` detailing what was added, changed, or deleted.
> 2. Update the relevant documentation files in `doc/` (`doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md`, `doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md`, `doc/HUONG_DAN_SU_DUNG.md`, `doc/DOCKER_BACKEND.md`).
> 3. Read `doc/QUY_TAC_PHAT_TRIEN.md` for full instructions.

### Tech Stack Summary
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v3, Zustand with LocalStorage persistence.
- **Backend**: Containerized Docker setup with Node.js/Express (TypeScript), PostgreSQL 16, Cron Service for 24/7 Gmail notifications.
- **AI**: Vietnamese rule-based NLP + Google Gemini 1.5 Flash Vision.
- **Language**: Vietnamese (UI text, documentation).

