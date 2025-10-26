# coding: utf-8
import csv
import os
import re
import sys

NOTES_COLUMN = 3  # Annotation column in the Kindle CSV table


def parse_kindle_csv(text):
    lines = text.splitlines()
    title = None
    author = None
    header_idx = None
    for i, raw in enumerate(lines):
        l0 = raw.strip().lstrip('\ufeff')
        if not l0:
            continue
        # Parse as CSV to reliably get the first cell without trailing ",,,"
        try:
            cells = next(csv.reader([l0]))
        except Exception:
            cells = [l0]
        cell0 = (cells[0] if cells else '').strip().strip('"')
        l = cell0
        ll = l.lower()
        raw_lower = l0.lower()
        if 'annotation type' in raw_lower and 'location' in raw_lower:
            header_idx = i
            break
        if not title and not ll.startswith('your kindle notes for') and not ll.startswith('free kindle') and not ll.startswith('http') and not re.match(r'^[-]{5,}$', l):
            title = l
        if not author and ll.startswith('by '):
            author = l[3:].strip()
    rows = []
    if header_idx is not None:
        reader = csv.reader(lines[header_idx + 1 :])
        for row in reader:
            if len(row) < 4:
                continue
            typ, location, _star, annotation = row[:4]
            if 'highlight' not in (typ or '').lower():
                continue
            if annotation:
                rows.append((location, annotation))
    # Clean up trailing commas/quotes in title/author (preamble lines may carry ",,,")
    def _clean(s):
        if not s:
            return s
        s = s.strip().strip('"')
        s = re.sub(r",+\s*$", "", s)
        return s.strip()
    title = _clean(title)
    author = _clean(author)
    return title, author, rows


def out_path_for(csv_path):
    # Write .txt next to the source .csv
    base, _ = os.path.splitext(csv_path)
    # Handle stray suffixes like ".csv?Zone.Identifier" by stripping after .csv
    if base.endswith('.csv'):
        base = base[: -len('.csv')]
    return base + '.txt'


def convert_csv_to_text(csv_path):
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            text = f.read()
    except FileNotFoundError:
        print(f"[csv_to_txt] Not found: {csv_path}")
        return False

    title, author, rows = parse_kindle_csv(text)
    if not rows:
        print(f"[csv_to_txt] No highlight rows in: {csv_path}")
        return False

    # Build bullet list with simple capitalization of first char
    bullets = []
    for _loc, anno in rows:
        if not anno:
            continue
        a = anno.strip()
        if a:
            bullets.append(f"- {a[0].upper() + a[1:]}" if len(a) > 1 else f"- {a}")

    outp = out_path_for(csv_path)
    os.makedirs(os.path.dirname(outp), exist_ok=True)
    with open(outp, 'w', encoding='utf-8') as w:
        w.write((title or '') + '\n')
        if author:
            w.write('by ' + author + '\n')
        else:
            w.write('\n')
        for b in bullets:
            w.write(b + '\n')
    print(f"[csv_to_txt] Wrote: {outp}")
    return True


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/csv_to_txt.py <file_or_directory>")
        sys.exit(1)
    target = sys.argv[1]
    if os.path.isdir(target):
        count = 0
        for name in os.listdir(target):
            if not name.lower().endswith('.csv'):
                continue
            if 'zone.identifier' in name.lower():
                continue
            p = os.path.join(target, name)
            if os.path.isfile(p):
                if convert_csv_to_text(p):
                    count += 1
        print(f"[csv_to_txt] Converted {count} CSV files in {target}")
    else:
        convert_csv_to_text(target)


if __name__ == '__main__':
    main()
