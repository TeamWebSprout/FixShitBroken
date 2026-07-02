# Deploy fixshitbroken — auto-refreshing, no local Node

This runs the whole data pipeline in the cloud on a schedule and publishes the
site for free. You never install Node or run a command on your Mac. You do this
setup once (about 15 minutes); after that it updates itself.

## What it does once set up

Every day (and any time you click "Run workflow"), GitHub:
1. pulls the current roster of all 535+ members (keyless),
2. pulls recent House + Senate roll-call votes,
3. summarizes the bills from the Congressional Research Service (keyless),
4. pulls real donor totals from FEC filings,
5. regenerates all member pages + the legislation feed,
6. commits the fresh data and publishes the site.

## One-time setup

### 1. Get two free API keys (2 minutes)

- **Congress.gov** (for votes): https://api.congress.gov/sign-up/ — enter your
  email, the key arrives instantly.
- **OpenFEC** (for donors): https://api.open.fec.gov/developers/ — click "Sign
  up for an API key" (it's a DATA.gov key), arrives instantly.

Keep both keys handy for step 3.

### 2. Put the project on GitHub (5 minutes)

If you don't have a GitHub account, create one at https://github.com (free).

Easiest path without the command line:
- Install **GitHub Desktop**: https://desktop.github.com
- In GitHub Desktop: `File → Add Local Repository`, choose the
  `FixShitBroken` folder, then `Publish repository`. Uncheck "Keep this code
  private" if you want the site public. This uploads everything.

(The repository's top level should contain the `app/`, `web/`, and `.github/`
folders — i.e. publish the `FixShitBroken` folder itself, not its parent.)

### 3. Add the two keys as repository secrets (2 minutes)

On github.com, open your new repo:
`Settings → Secrets and variables → Actions → New repository secret`

Add two secrets (names must match exactly):
- `CONGRESS_GOV_API_KEY` → paste your Congress.gov key
- `FEC_API_KEY` → paste your OpenFEC key

### 4. Turn on the pieces (2 minutes)

- **Actions**: open the `Actions` tab; if prompted, click "I understand my
  workflows, go ahead and enable them."
- **Pages**: `Settings → Pages → Build and deployment → Source: GitHub Actions`.

### 5. First run

`Actions` tab → **Refresh congressional data** → `Run workflow`.
Optional: check **full_bills** to summarize *every* bill in Congress (slow —
leave it unchecked for the fast "voted bills only" run). When it finishes, the
site publishes automatically. Your live URL appears under `Settings → Pages`
(usually `https://<your-username>.github.io/<repo-name>/`).

## After setup

- It refreshes **every day at 07:00 UTC** on its own.
- Run it any time from the Actions tab.
- To pull the full bill corpus occasionally, run it manually with **full_bills**
  checked (this can take a while and chips away at all ~15,000 bills).

## Keys and cost

- Both API keys are free.
- GitHub Actions + Pages are free for public repositories.
- No database, no server to manage. The site is static files; the workers only
  run during the scheduled job.

## Local runs (optional, if you ever install Node)

```
cd app
npm install
export CONGRESS_GOV_API_KEY=... FEC_API_KEY=...
npm run build:site:full        # roster + summaries + embeds + pages (keyless parts)
node worker/ingest-votes.mjs --no-db
node worker/ingest-donors.mjs
node worker/generate-rep-pages.mjs
```
