# CAD Review Platform

A web app to **upload CAD models, view & measure them in the browser, mark them up, and
resolve comments across revisions** — replacing the back-and-forth of emailing CAD files.
Built to run for free locally and deploy to Vercel.

## Features

- **3D viewer** (three.js + OpenCascade WASM): STEP, IGES, BREP, STL, OBJ, PLY, glTF/GLB.
  - Rotate / zoom / pan, **fit-to-view**
  - **Component tree** from the STEP assembly hierarchy with **hide / isolate / show**
  - **Section / clipping plane** (X/Y/Z, draggable, flip)
  - **Measurement** (point-to-point distance)
- **2D viewer** (pdf.js): PDF drawings & documents
- **Markup & review**
  - 📍 **Comment pins** anchored to a 3D point — clicking a comment **flies the camera back to the exact saved viewpoint**
  - ✏ **Sketch overlay**: pencil, box, arrow, text (locked to a saved viewpoint)
  - **Severity tags** on every markup: Low / Medium / High / Critical (pins are colored by severity)
  - **Comment threads** with reply + **Resolve / Reopen**
- **Sharing**: invite by email (accounts required for everyone); per-project `view` / `comment` / `edit` permissions
- **Versioning**: engineers re-upload a corrected file as a new **revision**; older revisions are kept
- **Activity log**: every upload, comment, resolve, share, and new revision is recorded with time + author
- **Native CAD files** (`.easm`, `.sldasm`, `.dwg`, …) are stored & shareable as **downloadable attachments**
  (they cannot be rendered in a browser — export to STEP/PDF for inline review)

### Concurrency model
Each viewer's camera is **independent** — one user rotating/zooming never moves another's view.
Markup & comments are **private until you click Send**; others see them after that (the app polls
every 5s, so no websocket server is needed).

## Tech stack

| Concern | Tech |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript + Tailwind |
| 3D parsing | `occt-import-js` (OpenCascade WASM), runs in the browser |
| 2D | `pdfjs-dist` |
| Auth | Auth.js (NextAuth v5), Credentials + scrypt, JWT sessions |
| DB | Prisma + **Neon Postgres** (configured) |
| Storage | local disk in dev; any **S3-compatible** provider in prod (Backblaze B2 recommended — 10 GB free) via presigned uploads |
| Email | none — sharing grants access by email; invitee sees it under "Shared with you" after sign-in |

## Local development

```bash
npm install
npx prisma db push        # creates the SQLite dev DB
npm run dev               # http://localhost:3000
```

The `.env` is preconfigured for local dev (SQLite + local storage + console email).
Try the **viewer without an account** at `/viewer` (drag in a STEP/STL file).
For the full review workflow, sign up at `/signup`, then upload at `/upload`.

> A real assembly STEP for testing ships in
> `node_modules/occt-import-js/test/testfiles/cax-if/as1_pe_203.stp`.

## Deploying to Vercel (free tier)

1. **Database** — ✅ already configured for Neon Postgres (`provider = "postgresql"`,
   `DATABASE_URL` pooled + `DIRECT_URL` direct). `npx prisma db push` has been run.
2. **Storage** — ✅ configured for **Backblaze B2** (bucket `cdviewer`). Env vars:
   ```
   STORAGE_DRIVER=r2
   S3_ENDPOINT=https://s3.us-east-005.backblazeb2.com
   S3_REGION=us-east-005
   R2_BUCKET=cdviewer
   R2_ACCESS_KEY_ID=<B2 keyID>
   R2_SECRET_ACCESS_KEY=<B2 applicationKey>
   ```
   Files upload **directly to B2** via presigned PUT (avoids Vercel's 4.5 MB body limit) — verified
   working. **For browser uploads** (not server-side), add a CORS rule to the bucket allowing your
   origin with `s3_put`/`s3_get`/`s3_head` (see the CORS JSON snippet in chat / Backblaze docs).
3. **Auth** — set a strong `AUTH_SECRET` (`npx auth secret`) and `NEXTAUTH_URL` to your domain.
4. Push to GitHub and import into Vercel (requires `git`, which is **not currently installed** on
   this machine — install Git for Windows first). Set all env vars in the Vercel dashboard.

## Project structure

```
src/
  app/
    (app)/                 # authenticated area (dashboard, upload, projects/[id])
    api/                   # signup, auth, upload, projects, revisions, annotations, comments, shares, activity, files
    login / signup / viewer
  components/
    viewer/                # ModelViewer, ComponentTree, ViewerToolbar, SketchOverlay, PdfViewer, LocalViewer
    project/ProjectWorkspace.tsx
  lib/
    cad/                   # loadModel (occt + three loaders), types
    db, storage, email, password, session, access, uploadClient, clientTypes
prisma/schema.prisma
public/wasm/occt-import-js.wasm   public/pdf.worker.min.mjs
```

## Known limitations / next steps

- Sketch/markup overlay is implemented for the **3D** view; **PDF markup** (drawing on PDF pages)
  is a planned next step — PDF currently supports viewing + zoom only.
- Markup interaction was validated via the data pipeline + a full backend integration test; do a
  quick manual pass in the browser after deploy.
- No native `.easm`/SolidWorks inline rendering (by design — would require a paid engine like
  Autodesk APS or CAD Exchanger).
