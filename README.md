# Family Tree Builder

Build a family tree visually — add people, connect parents / children / partners,
and get an automatically laid-out, crossing-free tree you can export as an image.
It's a **Next.js web app** with username/password login, deployed on Vercel;
trees and photos are saved to the cloud so they follow you across devices.

The app lives in [`web/`](web/) — see [`web/README.md`](web/README.md) for setup
and deployment.

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

## Stack

- **Next.js** (App Router) on **Vercel**
- **Auth** — username/password, bcrypt-hashed, session as a JWT in an httpOnly
  cookie; middleware-gated
- **Vercel Postgres** — one tree per user (`JSONB`)
- **Vercel Blob** — photo storage

## Quick start

```bash
cd web
npm install
cp .env.example .env.local   # fill in AUTH_SECRET, POSTGRES_URL, BLOB_READ_WRITE_TOKEN
npm run dev                  # http://localhost:3000
```

Full setup and Vercel deployment steps are in [`web/README.md`](web/README.md).
