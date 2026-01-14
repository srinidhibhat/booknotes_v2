#!/usr/bin/env python3
"""
Process Goodreads export CSV into:
  - data/goodreads/goodreads.json (normalized metadata)
  - Optionally enrich data/books.json by filling missing authors/year/pages and attaching goodreadsId

Usage:
  python3 scripts/goodreads_from_export.py [--merge]

Requires: data/goodreads/export.csv (get the export file from: https://www.goodreads.com/review/import)
"""
from __future__ import annotations
import csv
import json
import os
import re
from datetime import datetime
from typing import List, Dict, Any

ROOT = os.getcwd()
GOODREADS_DIR = os.path.join(ROOT, 'data', 'goodreads')
EXPORT_CSV = os.path.join(GOODREADS_DIR, 'export.csv')
OUT_JSON = os.path.join(GOODREADS_DIR, 'goodreads.json')
BOOKS_JSON = os.path.join(ROOT, 'data', 'books.json')


def read_csv(path: str) -> List[Dict[str, str]]:
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)


def clean_excel_eq(s: str | None) -> str:
    if not s:
        return ''
    s = s.strip()
    # Remove Excel's ="..." wrapping
    if s.startswith('="') and s.endswith('"'):
        s = s[2:-1]
    return s.strip()


def to_int(s: str) -> int | None:
    try:
        return int(s)
    except Exception:
        try:
            return int(float(s))
        except Exception:
            return None


def to_float(s: str) -> float | None:
    try:
        return float(s)
    except Exception:
        return None


def norm_date(s: str) -> str | None:
    if not s:
        return None
    s = s.strip()
    for fmt in ('%Y/%m/%d', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except Exception:
            pass
    return s  # leave as-is if unknown


def split_authors(primary: str, additional: str) -> List[str]:
    out: List[str] = []
    if primary:
        out.append(primary.strip())
    if additional:
        # Additional authors are comma-separated; remove role suffixes in parens
        parts = [p.strip() for p in additional.split(',') if p.strip()]
        cleaned = [re.sub(r"\s*\(.*?\)\s*$", "", p).strip() for p in parts]
        out.extend([c for c in cleaned if c and c not in out])
    return out


def slug(s: str) -> str:
    s = (s or '').lower()
    s = re.sub(r"[\u0300-\u036f]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip('-')
    return s


def book_key(title: str, author: str) -> str:
    return f"{slug(title)}|{slug(author)}"


def normalize_export(rows: List[Dict[str, str]]) -> Dict[str, Any]:
    books: List[Dict[str, Any]] = []
    for r in rows:
        gid = (r.get('Book Id') or '').strip()
        title = (r.get('Title') or '').strip()
        author = (r.get('Author') or '').strip()
        add_auth = (r.get('Additional Authors') or '').strip()
        isbn = clean_excel_eq(r.get('ISBN'))
        isbn13 = clean_excel_eq(r.get('ISBN13'))
        my_rating = to_int(r.get('My Rating') or '')
        avg_rating = to_float(r.get('Average Rating') or '')
        publisher = (r.get('Publisher') or '').strip()
        binding = (r.get('Binding') or '').strip()
        pages = to_int(r.get('Number of Pages') or '')
        year = to_int(r.get('Original Publication Year') or '') or to_int(r.get('Year Published') or '')
        date_read = norm_date(r.get('Date Read') or '')
        date_added = norm_date(r.get('Date Added') or '')
        shelves = []
        for field in ('Bookshelves', 'Exclusive Shelf'):
            val = (r.get(field) or '').strip()
            if val:
                shelves.extend([p.strip() for p in val.split(',') if p.strip()])
        shelves = sorted(list({s for s in shelves if s}))
        authors = split_authors(author, add_auth)

        books.append({
            'goodreadsId': gid,
            'title': title,
            'authors': authors,
            'isbn': isbn or None,
            'isbn13': isbn13 or None,
            'pages': pages,
            'year': year,
            'publisher': publisher or None,
            'binding': binding or None,
            'rating': my_rating,
            'averageRating': avg_rating,
            'shelves': shelves,
            'dateRead': date_read,
            'dateAdded': date_added,
        })
    return { 'books': books }


def enrich_books(existing: List[Dict[str, Any]], gr: Dict[str, Any]) -> List[Dict[str, Any]]:
    # Build indexes on existing books by key and id
    by_id = {b.get('id'): b for b in existing}
    by_key = {book_key(b.get('title', ''), (b.get('authors') or [''])[0]): b for b in existing}

    def ensure_unique_id(base: str) -> str:
        bid = base
        i = 2
        while bid in by_id:
            bid = f"{base}_{i}"
            i += 1
        return bid

    for item in gr.get('books', []):
        title = item.get('title') or ''
        authors = item.get('authors') or []
        primary_author = authors[0] if authors else ''
        key = book_key(title, primary_author)
        b = by_key.get(key)
        if not b:
            # create new book entry
            base = 'bk_' + slug(title)
            bid = ensure_unique_id(base)
            b = {
                'id': bid,
                'title': title,
                'authors': authors,
                'year': item.get('year'),
                'pages': item.get('pages'),
                'genres': list(item.get('shelves') or []),
                'shelves': list(item.get('shelves') or []),
                'goodreadsId': item.get('goodreadsId'),
                'isbn': item.get('isbn'),
                'isbn13': item.get('isbn13'),
                'dateRead': item.get('dateRead'),
                'rating': item.get('rating'),
            }
            existing.append(b)
            by_id[bid] = b
            by_key[key] = b
        else:
            # merge non-destructively
            if not b.get('authors') and authors:
                b['authors'] = authors
            if not b.get('year') and item.get('year'):
                b['year'] = item.get('year')
            if not b.get('pages') and item.get('pages'):
                b['pages'] = item.get('pages')
            if 'goodreadsId' not in b and item.get('goodreadsId'):
                b['goodreadsId'] = item.get('goodreadsId')
            for k in ('isbn', 'isbn13'):
                if not b.get(k) and item.get(k):
                    b[k] = item.get(k)
            if not b.get('dateRead') and item.get('dateRead'):
                b['dateRead'] = item.get('dateRead')
            if (b.get('rating') is None or b.get('rating') == '') and (item.get('rating') is not None):
                b['rating'] = item.get('rating')
            # merge shelves to genres without duplicates and keep shelves list
            genres = list(b.get('genres') or [])
            add = [g for g in (item.get('shelves') or []) if g not in genres]
            if add:
                b['genres'] = genres + add
            shelves_existing = set(b.get('shelves') or [])
            for s in (item.get('shelves') or []):
                shelves_existing.add(s)
            b['shelves'] = sorted(list(shelves_existing))
    return existing


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--merge', action='store_true', help='also enrich data/books.json')
    args = parser.parse_args()

    if not os.path.exists(EXPORT_CSV):
        print(f"[goodreads] export not found: {EXPORT_CSV}")
        return

    rows = read_csv(EXPORT_CSV)
    gr = normalize_export(rows)
    os.makedirs(GOODREADS_DIR, exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(gr, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f"[goodreads] Wrote {OUT_JSON} with {len(gr['books'])} books")

    if args.merge:
        # load existing books
        try:
            with open(BOOKS_JSON, 'r', encoding='utf-8') as f:
                books = json.load(f)
        except Exception:
            books = []
        books = enrich_books(books, gr)
        with open(BOOKS_JSON, 'w', encoding='utf-8') as f:
            json.dump(books, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f"[goodreads] Enriched data/books.json; total books: {len(books)}")


if __name__ == '__main__':
    main()
