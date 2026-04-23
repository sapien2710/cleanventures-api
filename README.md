# CleanVentures API

Backend API for the CleanVentures mobile app — Node.js + TypeScript + Fastify + Supabase.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework | Fastify 4 |
| Language | TypeScript 5 |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (JWT) |
| Storage | Supabase Storage |
| Push | Expo Push Notifications |
| Chat | Stream Chat (separate service) |
| Hosting | Railway |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/sapien2710/cleanventures-api.git
cd cleanventures-api
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in `.env` with your credentials (see Environment Variables section below).

### 3. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. Go to **Storage** and create two buckets:
   - `avatars` (public)
   - `venture-images` (public)
4. Copy your **Project URL** and **Service Role Key** from Settings → API into `.env`

### 4. Run locally

```bash
npm run dev
```

The server starts at `http://localhost:3000`.

### 5. Deploy to Railway

1. Create a project at [railway.app](https://railway.app)
2. Connect your GitHub repo (`sapien2710/cleanventures-api`)
3. Add all environment variables from `.env` in the Railway dashboard
4. Railway auto-deploys on every push to `main`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only, never expose to client) |
| `SUPABASE_ANON_KEY` | Anon/public key |
| `JWT_SECRET` | Secret for signing internal tokens (min 32 chars) |
| `STREAM_API_KEY` | Stream Chat API key |
| `STREAM_API_SECRET` | Stream Chat API secret |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | `development` or `production` |

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Sign in, returns JWT |
| POST | `/auth/refresh` | — | Refresh access token |
| GET | `/auth/me` | ✓ | Get current user profile |
| PATCH | `/auth/me` | ✓ | Update profile |

### Ventures

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/ventures` | ✓ | List ventures (`?mine=true` for own, `?status=`, `?search=`) |
| GET | `/ventures/:id` | ✓ | Get venture with members |
| POST | `/ventures` | ✓ | Create venture |
| PATCH | `/ventures/:id` | ✓ | Update venture (owner/co-organiser) |
| DELETE | `/ventures/:id` | ✓ | Delete venture (owner only) |
| POST | `/ventures/:id/join` | ✓ | Join venture |
| DELETE | `/ventures/:id/leave` | ✓ | Leave venture |
| GET | `/ventures/:id/activity` | ✓ | Activity feed |

### Tasks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/ventures/:id/tasks` | ✓ | List tasks |
| POST | `/ventures/:id/tasks` | ✓ | Create task (organiser) |
| PATCH | `/ventures/:id/tasks/:taskId` | ✓ | Update task |
| DELETE | `/ventures/:id/tasks/:taskId` | ✓ | Delete task (organiser) |

### Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/notifications` | ✓ | List notifications (`?unread_only=true`) |
| PATCH | `/notifications/:id/read` | ✓ | Mark one as read |
| PATCH | `/notifications/read-all` | ✓ | Mark all as read |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |

---

## Project Structure

```
src/
  server.ts          — Fastify app entry point
  lib/
    supabase.ts      — Supabase service-role client
    push.ts          — Expo push notification helpers
  middleware/
    auth.ts          — JWT verification middleware
  routes/
    auth.ts          — Auth endpoints
    ventures.ts      — Venture CRUD + members
    tasks.ts         — Task management
    notifications.ts — Notification endpoints
  types/
    database.ts      — TypeScript types matching DB schema
supabase/
  schema.sql         — Full PostgreSQL schema (run once in Supabase SQL Editor)
```

---

## Next Steps (V1 Roadmap)

- [ ] Wire up Stream Chat channel creation on venture creation
- [ ] Connect mobile app auth-store to `/auth/login` and `/auth/register`
- [ ] Replace mock ventures-store with API calls
- [ ] Register Expo push tokens on login
- [ ] EAS Build + App Store submission
