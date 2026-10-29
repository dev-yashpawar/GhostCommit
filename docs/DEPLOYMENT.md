# Deploy GhostCommit to Render

Render hosts the Express API and the built React site together, at the same URL. The persistent disk holds SQLite, imported repositories and separate patch workspaces. This is a **single-owner workspace** protected by a shared browser login, not a multi-user SaaS. Anyone with that login can access all workspace data and use the configured AI provider.

## 1. Push the code to GitHub

Create an empty GitHub repository (no generated README, license or gitignore). A private repository is supported when you connect your GitHub account to Render. From PowerShell:

```powershell
cd D:\Hactoberfest\GhostCommit
git status
# Only if this folder has not been initialized yet:
git init -b main
git add .
git diff --cached --stat
git commit -m "Prepare GhostCommit for Render deployment"
git remote add origin https://github.com/YOUR_USERNAME/GhostCommit.git
git push -u origin main
```

If an initial local commit or origin already exists, skip those creation commands. Check `git remote -v` and use the repository you intend to publish to. GitHub may prompt for sign-in; use Git Credential Manager or a personal access token, not your GitHub account password. Never put a token into the remote URL.

`.env`, `.ghostcommit`, `node_modules`, build output and test artifacts are excluded by `.gitignore`. Check `git ls-files .env .ghostcommit node_modules dist test-artifacts` prints nothing before pushing. The example environment file contains placeholders only.

## 2. Create the Render service

1. Sign in at https://dashboard.render.com and connect GitHub.
2. Choose **New → Blueprint**, select your repository and the `main` branch. Render reads the root `render.yaml`.
3. Review the paid **512 MB web service** and **1 GB persistent disk** before approving creation. Persistent disks are not available on free web services. Check Render's current prices in the dashboard.
4. Enter the requested secret values:
   - `GEMINI_API_KEY`: your Google AI Studio key.
   - `GHOSTCOMMIT_PASSWORD`: a unique password of at least 16 characters. Your browser login username is `admin`.
5. Deploy. The Blueprint installs dependencies, builds the SPA, and runs `npm start`. No separate frontend service is needed.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. Hosted mode binds to `0.0.0.0`, admits only the configured public host/origin, requires a browser login for all workspace/API/stream requests, and retains mutation session-token checks. `/api/health` intentionally exposes only a small unauthenticated health response so Render can probe it. Missing hosted URL or password stops startup.

The build uses `npm ci --include=dev && npm run build`: the TypeScript/Vite build and `tsx` startup require development dependencies to remain installed. Node 22.14.0 is pinned in `.node-version` and the Blueprint. Render's native Node runtime must include Git (`git --version` in the service shell).

### Manual Web Service alternative

If you prefer **New → Web Service**, use these values:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/api/health` |
| Instances | 1 |
| Disk mount path | `/var/data` |
| Disk size | 1 GB or more |
| `NODE_VERSION` | `22.14.0` |
| `NODE_ENV` | `production` |
| `GHOSTCOMMIT_HOSTED` | `true` |
| `GHOSTCOMMIT_DATA` | `/var/data/ghostcommit` |
| `GHOSTCOMMIT_USERNAME` | `admin` |
| `GHOSTCOMMIT_PASSWORD` | Your unique password, at least 16 characters |
| `GEMINI_API_KEY` | Your server-side Google key |

## 3. Configure and check the running app

1. Open the Render HTTPS URL and sign in with `admin` and your chosen password. Use the browser's own login prompt. Do not embed credentials in URLs.
2. Go to **Settings → AI provider**, choose Google, refresh models, select an available model (for example `gemini-2.5-flash` if listed), enable cloud analysis consent, and save.
3. Import a small public GitHub repository. Run AI autopsy and check the working animation and completed report.
4. Redeploy once and confirm the repository/report remain. Only data under the mounted disk survives deployments.

Existing laptop imports/settings are not uploaded. The new hosted workspace starts empty. Local repository picking refers to the server's filesystem, not the visitor's laptop. Ollama requires a separately available local inference service; use Google on this Render deployment.

For a custom domain, add it in Render and set `GHOSTCOMMIT_PUBLIC_URL=https://your-domain.example` (origin only, no path), then redeploy. The original Render URL remains allowed. Never use a `VITE_` prefix for API keys or passwords.

## 4. Push updates

```powershell
cd D:\Hactoberfest\GhostCommit
git add .
git commit -m "Describe your change"
git push origin main
```

Render deploys updates from the linked branch when auto-deploy is enabled. Disk-backed services have a short interruption during deployment; active AI/import jobs may be interrupted and can be retried. Keep one instance: SQLite, job cancellation and event subscribers are local to this process. Monitor disk use and back up the entire data directory while the service is stopped (SQLite uses WAL files).

## Troubleshooting

- **Password/configuration startup error:** check the secret exists and has at least 16 characters. Never paste it into logs or Git.
- **403 unrecognized host/origin:** check `GHOSTCOMMIT_PUBLIC_URL`, especially after adding a custom domain. Do not disable host or CSRF checks.
- **401:** the browser login is missing or incorrect. Every API call needs the same authenticated browser session.
- **Build out of memory:** increase available build memory; avoid running multiple builds concurrently. For constrained build environments try `RAYON_NUM_THREADS=1` and `NODE_OPTIONS=--max-old-space-size=1024` if at least that much memory is available.
- **Data disappears:** verify the paid disk is mounted at `/var/data` and `GHOSTCOMMIT_DATA=/var/data/ghostcommit`.
- **AI unavailable:** use Settings to check the key, selected model and cloud consent. Inspect Render logs for provider errors; Google quota/billing is separate.

## Why not deploy the complete app on Vercel?

This backend needs durable local SQLite/files, Git subprocesses, long-lived in-process jobs and same-origin server-sent events. Vercel Functions do not provide durable local filesystem storage. Vercel-only deployment would need a storage/database and job-worker redesign. A Vercel frontend could be added later, but the current same-origin security and browser login would also need adaptation. Render hosts this version as one service.

References: [Render Blueprints](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks), [Render environment variables](https://render.com/docs/environment-variables), [Vercel SQLite support](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
