;(function () {
  function readYear(b) {
    if (!b || !b.dateRead) return null
    const m = String(b.dateRead).match(/^(\d{4})/)
    return m ? m[1] : null
  }

  function booksPerYear(books) {
    const out = new Map()
    for (const b of books) {
      const y = readYear(b) || 'Unspecified'
      out.set(y, (out.get(y) || 0) + 1)
    }
    return Array.from(out, ([year, count]) => ({ year, count }))
  }

  function pagesPerYear(books) {
    const out = new Map()
    for (const b of books) {
      const y = readYear(b) || 'Unspecified'
      out.set(y, (out.get(y) || 0) + (b.pages || 0))
    }
    return Array.from(out, ([year, pages]) => ({ year, pages }))
  }

  function genreDistribution(books) {
    const out = new Map()
    for (const b of books) {
      for (const g of b.genres || []) out.set(g, (out.get(g) || 0) + 1)
    }
    return Array.from(out, ([genre, count]) => ({ genre, count }))
  }

  function ratingsDistribution(books) {
    const out = new Map()
    for (const b of books) {
      let r = b.rating
      if (r === undefined || r === null || r === '') r = 'Unrated'
      out.set(r, (out.get(r) || 0) + 1)
    }
    // Ensure consistent order: Unrated, 0..5
    const ordered = []
    if (out.has('Unrated')) ordered.push({ rating: 'Unrated', count: out.get('Unrated') })
    for (let i = 0; i <= 5; i++) if (out.has(i)) ordered.push({ rating: i, count: out.get(i) })
    // Add any other stray keys
    for (const [k, v] of out.entries()) {
      if ((k !== 'Unrated') && !(Number.isInteger(k) && k >= 0 && k <= 5)) {
        ordered.push({ rating: k, count: v })
      }
    }
    return ordered
  }

  function shelvesDistribution(books) {
    const out = new Map()
    for (const b of books) {
      for (const s of (b.shelves || [])) out.set(s, (out.get(s) || 0) + 1)
    }
    return Array.from(out, ([shelf, count]) => ({ shelf, count }))
  }

  function authorsDistribution(books, topN = 8) {
    const out = new Map()
    for (const b of books) {
      const authors = (window.Data?.authorsList(b) || [])
      for (const a of authors) out.set(a, (out.get(a) || 0) + 1)
    }
    const arr = Array.from(out, ([author, count]) => ({ author, count }))
    arr.sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
    return arr.slice(0, topN)
  }

  function quotesByBookDistribution(quotes, books) {
    const titleById = new Map()
    for (const b of (books || [])) titleById.set(b.id, b.title || b.id)
    const out = new Map()
    for (const q of (quotes || [])) {
      const t = titleById.get(q.bookId) || q.bookId || 'Unknown'
      out.set(t, (out.get(t) || 0) + 1)
    }
    const arr = Array.from(out, ([title, count]) => ({ title, count }))
    arr.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    return arr.slice(0, 8)
  }

  window.Insights = { booksPerYear, pagesPerYear, genreDistribution, ratingsDistribution, shelvesDistribution, authorsDistribution, quotesByBookDistribution }
})()
