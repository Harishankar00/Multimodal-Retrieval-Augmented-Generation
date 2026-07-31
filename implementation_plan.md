# Implementation Plan - Production Upgrade: Database, Auth & Cloud Deployment

Upgrade the single-user RAG prototype to a multi-tenant production system deployed on the cloud.

---

## Proposed Changes

### Component A: Relational Database & User Auth

#### [NEW] [user.py](file:///home/harishankar/Multimodal-Retrieval-Augmented-Generation/backend/app/models/user.py)
* Define user model properties (id, email, password_hash, created_at).

#### [NEW] [database.py](file:///home/harishankar/Multimodal-Retrieval-Augmented-Generation/backend/app/database.py)
* Initialize database engine (SQLite for local tests, PostgreSQL via `pgvector` for cloud).
* Configure connection pooling and session management helpers.

#### [NEW] [auth.py](file:///home/harishankar/Multimodal-Retrieval-Augmented-Generation/backend/app/services/auth.py)
* Add security services:
  * Password hashing (`passlib` with bcrypt).
  * JWT generation and validation helper functions (`python-jose`).
  * FastAPI security dependencies (`HTTPBearer` check for token headers).

---

### Component B: Dockerization & Cloud Deployment

#### [NEW] [Dockerfile](file:///home/harishankar/Multimodal-Retrieval-Augmented-Generation/backend/Dockerfile)
Create a production Docker image compiling dependencies:
* Install system layout packages (like `libgl1-mesa-glx` for EasyOCR image operations).
* Set up virtual environment and bundle application code.

#### [NEW] [deploy.yml](file:///home/harishankar/Multimodal-Retrieval-Augmented-Generation/.github/workflows/deploy.yml)
GitHub Actions CI/CD deployment configuration:
* Run pytest validation on pull requests.
* Auto-build Docker containers on main merge.
* Deploy frontend pages to static hosting (Vercel/Netlify) and backend containers to GCP Run/AWS ECS.

---

## Verification Plan

### Automated Tests
* Create unit tests under `backend/tests/test_auth.py` verifying JWT token issue, user signups, password validations, and access controls.

### Manual Verification
* Deploy sandbox stack, attempt database queries across isolated accounts, and confirm no user can view or search documents of another account.
