# Family Tree Builder

Build a family tree visually — add people, connect parents / children / partners,
and get an automatically laid-out, crossing-free tree you can export as an image.
It's a **Next.js web app** with username/password login, deployed on Vercel;
trees and photos are saved to the cloud so they follow you across devices.

The Next.js app is at the repo root, so Vercel deploys it with no extra config.

## Features

- Add **parents, children, partners**; partners automatically co-parent each
  other's children (one-marriage model).
- Automatic layout: generations aligned, couples grouped, **no overlapping cards
  and no crossed connector lines** (verified by a fuzz test over thousands of
  random build sequences).
- Children ordered by **date of birth** when it doesn't hurt the layout.
- **Photos** on cards (avatar; initials fallback), stored in Vercel Blob.
- **Date of birth** input; cards show the year.
- Pan / zoom / fit, **JSON import/export**, and **PNG export** of the whole tree.

## Architecture

- **Next.js** (App Router) on **Vercel**. The tree UI/engine lives in
  `public/app.js` (+ `public/app.css`, markup in `lib/markup.js`); the page
  (`app/page.jsx`) renders it and it persists to the server via API routes.
- **Auth** — `lib/auth.js`: bcrypt password hashing, session as a signed JWT
  (`jose`) in an httpOnly cookie. `middleware.js` gates every page; API routes
  check the session themselves. Sign-up is self-service at `/register`.
- **Data** — `lib/db.js` + `app/api/tree`: one `trees` row per user (`JSONB`).
  Tables (`users`, `trees`) are auto-created on first use.
- **Photos** — `app/api/photo`: the client downscales to a 256px JPEG and
  uploads the bytes; the route stores them in Vercel Blob and returns a URL.

## Environment variables

Copy `.env.example` → `.env.local` and fill in:

| Var | How to get it |
|-----|----------------|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `POSTGRES_URL` | Create a Postgres store in the Vercel dashboard (Storage tab), then `vercel env pull .env.local` |
| `BLOB_READ_WRITE_TOKEN` | Create a Blob store in the Vercel dashboard, then `vercel env pull .env.local` |

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values above
npm run dev                  # http://localhost:3000
```

## Deploy to Vercel

1. Import this repo in Vercel (framework auto-detected as Next.js — no Root
   Directory needed since the app is at the repo root).
2. In the dashboard → **Storage**: create a **Postgres** store and a **Blob**
   store and connect both to the project (injects `POSTGRES_URL` and
   `BLOB_READ_WRITE_TOKEN`).
3. In **Settings → Environment Variables**, add `AUTH_SECRET`.
4. Deploy (push to the repo, or `vercel --prod`).

## Notes

- Each account has exactly one tree. Register at `/register`, then you're in.
- Photos are public-URL blobs (unguessable UUID paths). If you need them fully
  private, switch the Blob access model and proxy them through an authed route.
