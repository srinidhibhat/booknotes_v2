;(function () {
  const cache = {}

  async function fetchJSON(path) {
    if (cache[path]) return cache[path]
    const bust = (path.includes('?') ? `&v=${Date.now()}` : `?v=${Date.now()}`)
    const url = path + bust
    const key = 'json:' + path
    try {
      const res = await fetch(url, { cache: 'no-store' })
      console.debug('[Data.fetchJSON] GET', url, 'status=', res.status)
      if (res.ok) {
        const data = await res.json()
        cache[path] = data
        try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
        return data
      }
      if (res.status === 304) {
        console.warn('[Data.fetchJSON] 304 for', path, 'falling back to localStorage')
        const cached = localStorage.getItem(key)
        if (cached) {
          const data = JSON.parse(cached)
          cache[path] = data
          return data
        }
      }
    } catch (e) {
      console.error('[Data.fetchJSON] error for', path, e)
      // network error; fall back to persisted cache if available
      const cached = localStorage.getItem(key)
      if (cached) {
        const data = JSON.parse(cached)
        cache[path] = data
        return data
      }
    }
    return []
  }

  function normalizeAuthor(a) {
    return (a || '').trim()
  }

  function byId(items) {
    const map = new Map()
    for (const it of items) map.set(it.id, it)
    return map
  }

  async function loadBooks() {
    const books = await fetchJSON('data/books.json')
    return Array.isArray(books) ? books : []
  }

  async function loadQuotes() {
    const quotes = await fetchJSON('data/quotes.json')
    return Array.isArray(quotes) ? quotes : []
  }

  async function loadGoodreads() {
    const gr = await fetchJSON('data/goodreads/goodreads.json')
    if (gr && typeof gr === 'object' && Array.isArray(gr.books)) return gr.books
    return []
  }

  function authorsList(book) {
    const a = book?.authors
    if (!a) return []
    if (Array.isArray(a)) {
      if (a.length === 1 && typeof a[0] === 'string' && a[0].includes(',')) {
        return a[0].split(',').map((s) => s.trim()).filter(Boolean)
      }
      return a
    }
    if (typeof a === 'string') return a.split(',').map((s) => s.trim()).filter(Boolean)
    return []
  }

  window.Data = { fetchJSON, loadBooks, loadQuotes, loadGoodreads, normalizeAuthor, byId, authorsList }
})()
