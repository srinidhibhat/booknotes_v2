#!/usr/bin/env python3
"""
Ingest raw highlights from data/raw/*.csv and *.txt into:
  - data/books.json (append/update)
  - data/quotes.json (append, de-duplicate by stable hash)
Reads UTF-8; handles Kindle CSV preamble and simple TXT bullet lists.
"""
from __future__ import annotations
import csv
import hashlib
import json
import os
import re
from datetime import date

ROOT = os.getcwd()
DATA_DIR = os.path.join(ROOT, 'data')
RAW_DIR = os.path.join(DATA_DIR, 'raw')
BOOKS_PATH = os.path.join(DATA_DIR, 'books.json')
QUOTES_PATH = os.path.join(DATA_DIR, 'quotes.json')


def load_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def slug(s: str) -> str:
    s = (s or '').lower()
    s = re.sub(r"[\u0300-\u036f]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip('-')
    return s


def book_key(title: str, author: str) -> str:
    return f"{slug(title)}|{slug(author)}"


def quote_id(book_id: str, text: str) -> str:
    h = hashlib.sha1(f"{book_id}|{text}".encode('utf-8')).hexdigest()[:12]
    return f"q_{h}"


def sanitize_text(s: str) -> str:
    if not s:
        return ''
    rep = (
        ('\uFFFD', ''),
        ('\u2018', "'"), ('\u2019', "'"), ('\u201A', "'"), ('\u201B', "'"),
        ('\u201C', '"'), ('\u201D', '"'), ('\u201E', '"'), ('\u201F', '"'),
        ('\u2013', '-'), ('\u2014', '-'), ('\u2015', '-'),
    )
    for a, b in rep:
        s = s.replace(a.encode('utf-8').decode('unicode_escape'), b)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def index_books(books):
    by_id = {b['id']: b for b in books}
    by_key = {book_key(b.get('title', ''), (b.get('authors') or [''])[0]): b for b in books}
    return by_id, by_key


def ensure_book(by_id, by_key, books, title, author):
    t = (title or 'Untitled').strip()
    a = re.sub(r"^by\s+", "", (author or ''), flags=re.I).strip()
    k = book_key(t, a)
    if k in by_key:
        b = by_key[k]
        b['newlyAdded'] = False
        return b
    base = f"bk_{slug(t)}"
    bid = base
    i = 2
    while bid in by_id:
        bid = f"{base}_{i}"
        i += 1
    b = {"id": bid, "title": t, "authors": [a] if a else [], "year": None, "pages": None, "genres": []}
    books.append(b)
    by_id[bid] = b
    by_key[k] = b
    b['newlyAdded'] = True
    return b


def parse_kindle_csv(text: str):
    lines = text.splitlines()
    title = None
    author = None
    start_idx = None
    for i, raw in enumerate(lines):
        l = raw.strip().strip('"')
        if not l:
            continue
        ll = l.lower()
        if 'annotation type' in ll and 'location' in ll:
            start_idx = i
            break
        if not title and not re.match(r"^your kindle notes for", ll) and not re.match(r"^free kindle", ll) and not re.match(r"^https?://", ll) and not re.match(r"^-{5,}$", l):
            title = l.strip('"')
        if not author and l.lower().startswith('by '):
            author = l[3:].strip()
    rows = []
    if start_idx is not None:
        reader = csv.reader(lines[start_idx+1:])
        for row in reader:
            if len(row) < 4:
                continue
            typ, location, _star, annotation = row[:4]
            if not re.search(r"highlight", typ or '', flags=re.I):
                continue
            rows.append({"annotation": annotation, "location": location})
    return title, author, rows


def parse_plain_text_bullets(text: str):
    lines = text.splitlines()
    title = None
    author = None
    items = []
    for l in lines:
        l = l.rstrip()
        if not l:
            continue
        if title is None:
            title = re.sub(r"^=+\s*|\s*=+$", "", l)
            title = re.sub(r"^-+\s*|\s*-+$", "", title).strip()
            continue
        if author is None and l.lower().startswith('by '):
            author = l[3:].strip()
            continue
        if l.strip().startswith('- '):
            items.append(l.strip()[2:].strip())
    return title, author, items


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    books = load_json(BOOKS_PATH, [])
    quotes = load_json(QUOTES_PATH, [])
    by_id, by_key = index_books(books)
    existing_ids = {q.get('id') for q in quotes}

    today = date.today().isoformat()

    if not os.path.isdir(RAW_DIR):
        print(f"[ingest] No raw dir: {RAW_DIR}")
        return

    files = [f for f in os.listdir(RAW_DIR) if os.path.isfile(os.path.join(RAW_DIR, f))]
    new_books = 0
    new_quotes = 0
    for name in files:
        full = os.path.join(RAW_DIR, name)
        ext = os.path.splitext(name)[1].lower()
        try:
            with open(full, 'r', encoding='utf-8') as fh:
                text = fh.read()
        except Exception as e:
            print(f"[ingest] Skip (read error) {name}: {e}")
            continue

        if ext == '.csv' or name.lower().endswith('.csv'):
            # Skip CSV: we now ingest only TXT converted from CSV
            continue
        elif ext == '.txt' or name.lower().endswith('.txt'):
            title, author, items = parse_plain_text_bullets(text)
            if not items:
                continue
            book = ensure_book(by_id, by_key, books, title or guess_title_from_filename(name), author)
            if book.get('newlyAdded'):
                new_books += 1
            for item in items:
                txt = sanitize_text(item)
                if not txt:
                    continue
                qid = quote_id(book['id'], txt)
                if qid in existing_ids:
                    continue
                quotes.append({
                    "id": qid,
                    "bookId": book['id'],
                    "text": txt,
                    "location": {},
                    "tags": [],
                    "addedAt": today,
                })
                existing_ids.add(qid)
                new_quotes += 1
        else:
            # Skip other extensions
            continue

    save_json(BOOKS_PATH, books)
    save_json(QUOTES_PATH, quotes)
    print(f"[ingest] Added {new_quotes} quotes, {new_books} new books.")


def guess_title_from_filename(name: str) -> str:
    base = re.sub(r"\.[^./\\]+$", "", name)
    return re.sub(r"[._-]+", " ", base).strip()


if __name__ == '__main__':
    main()
