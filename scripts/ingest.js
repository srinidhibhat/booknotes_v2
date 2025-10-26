#!/usr/bin/env node
/**
 * Ingest raw highlights from data/raw/*.csv and *.txt into:
 *  - data/books.json (append/update)
 *  - data/quotes.json (append, de-duplicate by stable hash)
 * No external deps; Node 16+.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = process.cwd()
const RAW_DIR = path.join(ROOT, 'data', 'raw')
const DATA_DIR = path.join(ROOT, 'data')
const BOOKS_PATH = path.join(DATA_DIR, 'books.json')
const QUOTES_PATH = path.join(DATA_DIR, 'quotes.json')

main().catch((err) => {
  console.error('[ingest] ERROR', err)
  process.exit(1)
})

async function main() {
  const now = new Date()
  const addedAt = now.toISOString().slice(0, 10)

  ensureDir(DATA_DIR)

  const books = loadJSON(BOOKS_PATH, [])
  const quotes = loadJSON(QUOTES_PATH, [])

  const bookIndex = indexBooks(books)
  const existingQuoteIds = new Set(quotes.map((q) => q.id))

  const files = fs.existsSync(RAW_DIR) ? fs.readdirSync(RAW_DIR) : []
  if (!files.length) {
    console.log(`[ingest] No files found in ${rel(RAW_DIR)}. Nothing to do.`)
    return
  }

  let newQuotes = 0
  let newBooks = 0

  for (const f of files) {
    const full = path.join(RAW_DIR, f)
    if (fs.statSync(full).isDirectory()) continue
    const ext = path.extname(f).toLowerCase()
    const raw = fs.readFileSync(full, 'utf8')
    if (ext === '.csv') {
      const { title, author, rows } = parseKindleCSV(raw)
      if (!rows.length) continue
      const book = ensureBook(bookIndex, books, title || guessTitleFromFilename(f), author)
      if (book.newlyAdded) newBooks += 1
      for (const r of rows) {
        if (!r.annotation || !r.annotation.trim()) continue
        const text = sanitizeText(r.annotation)
        const id = quoteId(book.id, text)
        if (existingQuoteIds.has(id)) continue
        quotes.push({
          id,
          bookId: book.id,
          text,
          location: { raw: r.location || r.locationRaw || r.locationPage || r.locationLoc || null },
          tags: [],
          addedAt
        })
        existingQuoteIds.add(id)
        newQuotes += 1
      }
    } else if (ext === '.txt') {
      const { title, author, items } = parsePlainTextBullets(raw)
      if (!items.length) continue
      const book = ensureBook(bookIndex, books, title || guessTitleFromFilename(f), author)
      if (book.newlyAdded) newBooks += 1
      for (const textRaw of items) {
        const text = sanitizeText(textRaw)
        if (!text) continue
        const id = quoteId(book.id, text)
        if (existingQuoteIds.has(id)) continue
        quotes.push({ id, bookId: book.id, text, location: {}, tags: [], addedAt })
        existingQuoteIds.add(id)
        newQuotes += 1
      }
    } else {
      console.log(`[ingest] Skipping unsupported file: ${f}`)
    }
  }

  saveJSON(BOOKS_PATH, books)
  saveJSON(QUOTES_PATH, quotes)

  console.log(`[ingest] Added ${newQuotes} quotes, ${newBooks} new books.`)
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function rel(p) {
  return path.relative(ROOT, p) || '.'
}

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw)
    return data
  } catch (e) {
    console.warn(`[ingest] Could not parse ${rel(file)} — resetting.`, e.message)
    return fallback
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function indexBooks(books) {
  const mapById = new Map()
  const mapByKey = new Map()
  for (const b of books) {
    mapById.set(b.id, b)
    mapByKey.set(bookKey(b.title, (b.authors && b.authors[0]) || ''), b)
  }
  return { byId: mapById, byKey: mapByKey }
}

function ensureBook(index, books, title, author) {
  const t = (title || 'Untitled').trim()
  const a = (author || '').replace(/^by\s+/i, '').trim()
  const key = bookKey(t, a)
  let b = index.byKey.get(key)
  if (b) return { ...b, newlyAdded: false }

  const idBase = 'bk_' + slug(t)
  let id = idBase
  let i = 2
  while (index.byId.has(id)) {
    id = `${idBase}_${i++}`
  }
  b = { id, title: t, authors: a ? [a] : [], year: null, pages: null, genres: [] }
  books.push(b)
  index.byId.set(id, b)
  index.byKey.set(key, b)
  return { ...b, newlyAdded: true }
}

function bookKey(title, author) {
  return slug(title) + '|' + slug(author)
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function quoteId(bookId, text) {
  const h = crypto.createHash('sha1').update(bookId + '|' + text).digest('hex').slice(0, 12)
  return 'q_' + h
}

function sanitizeText(s) {
  if (!s) return ''
  let out = String(s)
  // Replace mojibake replacement chars
  out = out.replace(/[\uFFFD]/g, '')
  // Normalize fancy quotes/dashes to ASCII
  out = out
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
  // Collapse whitespace
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

// --- Parsers ---

function parseKindleCSV(raw) {
  const lines = raw.split(/\r?\n/)
  let headerIdx = -1
  let title = null
  let author = null
  for (let i = 0; i < lines.length; i++) {
    const l = stripQuotes(lines[i]).trim()
    if (!l) continue
    const lower = l.toLowerCase()
    if (lower.includes('annotation type') && lower.includes('location')) {
      headerIdx = i
      break
    }
    if (!title && !/^your kindle notes for/i.test(l) && !/^free kindle/i.test(l) && !/^https?:/i.test(l) && !/^[-]{5,}$/.test(l)) {
      title = stripOuterQuotes(l)
    }
    if (!author && /^by\s+/i.test(l)) author = l.replace(/^by\s+/i, '')
  }
  const rows = []
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i])
      if (!row || row.length < 4) continue
      const [type, location, _star, annotation] = row
      if (!/highlight/i.test(type || '')) continue
      rows.push({ annotation, location })
    }
  }
  return { title, author, rows }
}

function stripOuterQuotes(s) {
  return s.replace(/^"(.*)"$/, '$1')
}

function stripQuotes(s) {
  return s.replace(/^\"+|\"+$/g, '')
}

function parsePlainTextBullets(raw) {
  const lines = raw.split(/\r?\n/)
  let title = null
  let author = null
  const items = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (!l) continue
    if (!title) {
      title = stripDecorations(l)
      continue
    }
    if (!author && /^by\s+/i.test(l)) {
      author = l.replace(/^by\s+/i, '').trim()
      continue
    }
    if (l.startsWith('- ')) {
      items.push(l.slice(2).trim())
    }
  }
  return { title, author, items }
}

function stripDecorations(s) {
  // Remove leading/trailing = or - decorations
  return s.replace(/^=+\s*|\s*=+$/g, '').replace(/^-+\s*|\s*-+$/g, '').trim()
}

function parseCSVLine(line) {
  const out = []
  let i = 0
  let cur = ''
  let inQuotes = false
  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        } else {
          inQuotes = false
          i++
          continue
        }
      } else {
        cur += ch
        i++
        continue
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
        continue
      }
      if (ch === ',') {
        out.push(cur)
        cur = ''
        i++
        continue
      }
      cur += ch
      i++
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function guessTitleFromFilename(name) {
  const base = name.replace(/\.[^/.]+$/, '')
  return base.replace(/[._-]+/g, ' ').trim()
}

