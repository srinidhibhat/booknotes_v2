# Booknotes v2

Static site + scripts to collect and visualize book highlights/quotes.

- Inputs: Kindle/Goodreads exports as CSV or bullet-list TXT in `data/raw/` and `data/goodreads/`.
- Outputs: Normalized JSON in `data/books.json` and `data/quotes.json`, rendered by `index.html` + `assets/`.
- Runtimes: Python 3.9+ (no third‑party deps) and optional Node.js 16+ (no deps) for the JS ingest.

## Repo Layout
- `index.html` and `assets/`: front-end for browsing notes.
- `data/`: persistent data store (JSON plus source CSV/TXT under `raw/` and `goodreads/`).
- `scripts/`: import utilities:
  - `ingest.py`: parse bullet-list TXT highlights into JSON.
  - `csv_to_txt.py`: convert Kindle CSV export into simple TXT bullets.
  - `goodreads_from_export.py`: normalize Goodreads export CSV and optionally enrich `data/books.json`.
  - `ingest.js`: Node alternative that handles CSV/TXT directly (no external deps).

## Prerequisites
- Python 3.9+ (no packages required)
- Optional: Node.js 16+ (no packages required)

## Setup
- Clone the repo and, if desired, create a virtual environment:
  - `python -m venv .venv && source .venv/bin/activate` (macOS/Linux)
  - `python -m venv .venv ; .venv\\Scripts\\Activate.ps1` (Windows PowerShell)
- Install Python requirements (none, but kept for consistency):
  - `pip install -r requirements.txt`

## Data Ingestion Workflows
1) Kindle CSV → TXT → JSON (Python)
- Put Kindle CSV files into `data/raw/`.
- Convert CSV to TXT bullets:
  - `python scripts/csv_to_txt.py data/raw/` (writes adjacent `.txt` files)
- Ingest TXT bullets into JSON:
  - `python scripts/ingest.py` (updates `data/books.json` and `data/quotes.json`)

2) Goodreads export (Python)
- Place your Goodreads `export.csv` at `data/goodreads/export.csv`.
- Build normalized JSON:
  - `python scripts/goodreads_from_export.py`
- Optionally merge Goodreads metadata into `data/books.json`:
  - `python scripts/goodreads_from_export.py --merge`

3) Node-based ingest (CSV/TXT → JSON)
- `node scripts/ingest.js`

Notes
- The scripts expect UTF‑8 inputs.
- De-duplication is based on a stable hash of `bookId|quoteText`.

## Running the Site
- Open `index.html` directly in a browser or serve the folder with any static server.

## Publishing to GitHub
This folder already contains a `.git` directory locally. To publish to a new GitHub repo:
- `git remote remove origin` (only if an old origin exists)
- `git remote add origin https://github.com/<your-user>/booknotes_v2.git`
- `git branch -M main`
- `git add .`
- `git commit -m "Initial import"`
- `git push -u origin main`
