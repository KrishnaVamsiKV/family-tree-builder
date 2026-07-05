# Family Tree Builder — cloud web app

Next.js app for Vercel. Username/password auth, per-user tree stored in Vercel
Postgres, photos stored in Vercel Blob. The tree UI is the same engine as the
standalone `../index.html`, with persistence swapped from `localStorage` to the
server (`public/app.js`, `lib/markup.js`).

## Architecture

- **Auth** — `lib/auth.js`: bcrypt password hashing, session as a signed JWT
  (`jose`) in an httpOnly cookie. `middleware.js` gates every page; API routes
  check the session themselves.
- **Data** — `lib/db.js` + `app/api/tree`: one `trees` row per user (`JSONB`).
  Tables are auto-created on first use.
- **Photos** — `app/api/photo`: client downscales to a 256px JPEG, uploads the
  bytes; the route stores them in Vercel Blob and returns a public URL.

## Environment variables

Copy `.env.example` → `.env.local` and fill in:

| Var | How to get it |
|-----|----------------|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `POSTGRES_URL` | Create a Postgres store in the Vercel dashboard (Storage tab), then `vercel env pull .env.local` |
| `BLOB_READ_WRITE_TOKEN` | Create a Blob store in the Vercel dashboard, then `vercel env pull .env.local` |

## Local development

```bash
cd web
npm install
cp .env.example .env.local   # then fill in the values (see above)
npm run dev                  # http://localhost:3000
```

Tables (`users`, `trees`) are created automatically the first time an API route
runs — no manual migration needed.

## Deploy to Vercel

```bash
cd web
npm i -g vercel        # if you don't have the CLI
vercel link            # link this folder to a Vercel project
```

1. In the Vercel dashboard → **Storage**: create a **Postgres** store and a
   **Blob** store, and connect both to the project (this injects `POSTGRES_URL`
   and `BLOB_READ_WRITE_TOKEN`).
2. In **Settings → Environment Variables**, add `AUTH_SECRET`.
3. Deploy:

```bash
vercel --prod
```

> **Root directory:** this app lives in `web/`. If you import the GitHub repo
> through the Vercel dashboard, set the project's **Root Directory** to `web`.

## Notes

- Each account has exactly one tree. Register at `/register`, then you're in.
- Photos are public-URL blobs (unguessable UUID paths). If you need them fully
  private, switch the Blob access model and proxy them through an authed route.
