## Task 5: Docker Compose + Dockerfile + env example (local up green)

**Files:**
- Create: `backend/Dockerfile`, `backend/entrypoint.sh`, `infra/docker-compose.yml`, `.env.example`

**Interfaces:**
- Produces: `docker compose -f infra/docker-compose.yml up` → postgres + backend, Alembic migrated, `GET /healthz` 200.

- [ ] **Step 1: Backend image + entrypoint**

Create `backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000
CMD ["./entrypoint.sh"]
```

Create `backend/entrypoint.sh` (local SP2a: migrate then serve — SP2b will split this):
```bash
#!/usr/bin/env sh
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- [ ] **Step 2: Compose file**

Create `infra/docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: oms
      POSTGRES_PASSWORD: oms
      POSTGRES_DB: oms
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U oms"]
      interval: 3s
      timeout: 3s
      retries: 10
  backend:
    build: ../backend
    environment:
      DATABASE_URL: postgresql+psycopg://oms:oms@db:5432/oms
    depends_on:
      db:
        condition: service_healthy
    ports: ["8000:8000"]
```

- [ ] **Step 3: Env example**

Create `.env.example`:
```
# Backend
DATABASE_URL=postgresql+psycopg://oms:oms@localhost:5432/oms
# Frontend (same-origin path, not a host)
VITE_API_BASE=/api
```

- [ ] **Step 4: Verify a clean bring-up**

Run:
```bash
docker compose -f infra/docker-compose.yml up -d --build
sleep 8
curl -fsS localhost:8000/healthz
curl -fsS localhost:8000/api/document
docker compose -f infra/docker-compose.yml down
```
Expected: `{"status":"ok"}` then `{"doc":null,"revision":0,"schema_version":null}`.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/entrypoint.sh infra/ .env.example
git commit -m "feat(infra): local Docker Compose (postgres + backend) with migrate-on-start"
```

---

