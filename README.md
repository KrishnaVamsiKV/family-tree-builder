# Family Tree Builder

Build a family tree visually — add people, connect parents / children / partners,
and get an automatically laid-out, crossing-free tree you can export as an image.

This repo has two things:

| Path         | What it is |
|--------------|------------|
| `index.html` | **Standalone** version. Open it in a browser — no install, no server. Saves to your browser's `localStorage`, exports JSON and PNG. Great offline. |
| `web/`       | **Cloud web app** (Next.js, deploys to Vercel). Username/password login, trees + photos saved to the cloud so they follow you across devices. |

## Features

- Add **parents, children, partners**; partners automatically co-parent each other's children (one-marriage model).
- Automatic layout: generations aligned, couples grouped, **no overlapping cards and no crossed connector lines** (verified by a fuzz test over thousands of random build sequences).
- Children ordered by **date of birth** when it doesn't hurt the layout.
- **Photos** on cards (avatar; initials fallback).
- **Date of birth** input; cards show the year.
- Pan / zoom / fit, **JSON import/export**, and **PNG export** of the whole tree.

## The standalone app

Just open `index.html` in any modern browser. That's it.

## The cloud web app

See [`web/README.md`](web/README.md) for setup and deployment to Vercel
(Postgres for data, Blob for photos, username/password auth).
