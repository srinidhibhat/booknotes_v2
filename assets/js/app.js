;(function () {
  console.info('[App] script evaluating')
  const tabs = {
    quotes: document.getElementById('tab-quotes'),
    insights: document.getElementById('tab-insights')
  }

  let quotes = []
  let books = []
  let browseIndex = 0
  let filteredQuotes = []
  let currentBookFilter = 'all'
  let currentSearch = ''
  let pageIndex = 0
  const pageSize = 10

  function toTitleCase(str) {
    if (!str) return ''
    const small = new Set(['a','an','the','and','but','or','for','nor','as','at','by','for','in','of','on','per','to','via'])
    const words = String(str).normalize('NFKD').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
    if (!words.length) return ''
    return words.map((w, i) => {
      const lower = w.toLowerCase()
      if (i !== 0 && i !== words.length - 1 && small.has(lower)) return lower
      // Keep apostrophes and internal punctuation, capitalize first letter of word characters
      return lower.replace(/^(\p{L})(.*)$/u, (_, a, b) => a.toUpperCase() + b)
    }).join(' ')
  }

  function todaySeed() {
    const d = new Date()
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    return y * 10000 + m * 100 + day
  }

  function pickDaily(quotesArr) {
    if (!quotesArr.length) return null
    const seed = todaySeed()
    const idx = seed % quotesArr.length
    return quotesArr[idx]
  }

  function showTab(name) {
    for (const btn of document.querySelectorAll('.tab')) {
      const active = btn.dataset.tab === name
      btn.classList.toggle('active', active)
      btn.setAttribute('aria-selected', String(active))
    }
    for (const [key, el] of Object.entries(tabs)) {
      const active = key === name
      el.classList.toggle('active', active)
      if (active) {
        el.removeAttribute('hidden')
      } else {
        el.setAttribute('hidden', 'true')
      }
    }
  }

  function bookLookup() {
    const map = new Map()
    for (const b of books) map.set(b.id, b)
    return map
  }

  function renderQuote(targetPrefix, q) {
    const textEl = document.getElementById(`${targetPrefix}-quote-text`)
    const metaEl = document.getElementById(`${targetPrefix}-quote-meta`)
    if (!q) {
      textEl.textContent = 'No quotes yet.'
      metaEl.textContent = ''
      return
    }
    // Ensure a single quote line if source contains multiple bullets/newlines
    let t = q.text || ''
    const parts = String(t).split(/\n\s*(?:-|\u2022)\s+/)
    if (parts.length > 1) t = parts[0]
    textEl.textContent = t
    const byBook = bookLookup().get(q.bookId)
    const titleRaw = byBook?.title || q.bookId || 'Unknown book'
    const title = toTitleCase(titleRaw)
    const authors = Data.authorsList(byBook).join(', ')
    const loc = q.location?.page || q.location?.raw || ''
    const bits = [title, authors && `by ${authors}`, loc && `@ ${loc}`].filter(Boolean)
    metaEl.textContent = bits.join(' • ')
  }

  function renderDaily() {
    renderQuote('daily', pickDaily(quotes))
  }

  function renderBrowse() {
    const singleWrap = document.getElementById('browse-single')
    const listWrap = document.getElementById('browse-list')
    const pager = document.getElementById('browse-pager')
    const countEl = document.getElementById('browse-count')
    const prevBtn = document.getElementById('prev-quote')
    const nextBtn = document.getElementById('next-quote')

    const setShown = (el, show, displayWhenShown = '') => {
      if (!el) return
      el.hidden = !show
      el.style.display = show ? displayWhenShown : 'none'
    }

    if (!filteredQuotes.length) {
      setShown(singleWrap, true)
      if (listWrap) { setShown(listWrap, false); listWrap.innerHTML = '' }
      setShown(pager, false)
      renderQuote('browse', null)
      if (countEl) countEl.textContent = '0 results'
      return
    }

    // If a specific book is selected, show paginated list of quotes (10 per page)
    const isSpecificBook = currentBookFilter !== 'all'
    if (isSpecificBook) {
      setShown(singleWrap, false)
      setShown(listWrap, true)
      // Pager should be flex when visible
      setShown(pager, true, 'flex')
      if (prevBtn) prevBtn.hidden = true
      if (nextBtn) nextBtn.hidden = true

      const total = filteredQuotes.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      if (pageIndex < 0) pageIndex = totalPages - 1
      if (pageIndex >= totalPages) pageIndex = 0
      const start = pageIndex * pageSize
      const end = Math.min(start + pageSize, total)
      const pageItems = filteredQuotes.slice(start, end)

      // Render a single card with a bulleted list of quotes (no repeated book/author)
      if (listWrap) {
        listWrap.innerHTML = ''
        const card = document.createElement('div')
        card.className = 'card'
        const body = document.createElement('div')
        body.className = 'card-body'
        const ul = document.createElement('ul')
        ul.className = 'mb-0 ps-3'
        ul.style.listStyle = 'disc'
        for (const q of pageItems) {
          const li = document.createElement('li')
          li.className = 'mb-2'
          let t = q.text || ''
          const parts = String(t).split(/\n\s*(?:-|\u2022)\s+/)
          if (parts.length > 1) t = parts[0]
          li.textContent = t
          ul.appendChild(li)
        }
        body.appendChild(ul)
        card.appendChild(body)
        listWrap.appendChild(card)
      }

      // Update count and page indicator
      if (countEl) countEl.textContent = `${total} result${total === 1 ? '' : 's'} • ${totalPages} page${totalPages === 1 ? '' : 's'}`
      const pageInd = document.getElementById('page-indicator')
      if (pageInd) pageInd.textContent = `Page ${pageIndex + 1} of ${totalPages}`
      return
    }

    // Otherwise (All Books), keep single-quote browse with prev/next
    setShown(singleWrap, true)
    if (listWrap) { setShown(listWrap, false); listWrap.innerHTML = '' }
    setShown(pager, false)
    if (prevBtn) prevBtn.hidden = false
    if (nextBtn) nextBtn.hidden = false
    if (browseIndex < 0) browseIndex = filteredQuotes.length - 1
    if (browseIndex >= filteredQuotes.length) browseIndex = 0
    renderQuote('browse', filteredQuotes[browseIndex])
    if (countEl) countEl.textContent = `${filteredQuotes.length} result${filteredQuotes.length === 1 ? '' : 's'}`
  }

  function applyFilters() {
    const search = currentSearch.toLowerCase()
    filteredQuotes = quotes.filter((q) => {
      if (currentBookFilter !== 'all' && q.bookId !== currentBookFilter) return false
      if (!search) return true
      const byBook = bookLookup().get(q.bookId)
      const hay = [q.text, byBook?.title, (Data.authorsList(byBook) || []).join(' ')].join(' ').toLowerCase()
      return hay.includes(search)
    })
    browseIndex = 0
    pageIndex = 0
    renderBrowse()
  }

  function populateFilters() {
    const sel = document.getElementById('filter-book')
    sel.innerHTML = ''
    // Only include books that have at least one quote
    const hasQuotes = new Set(quotes.map((q) => q.bookId))
    const booksWithQuotes = books.filter((b) => hasQuotes.has(b.id))
    const optAll = document.createElement('option')
    optAll.value = 'all'
    optAll.textContent = `All Books (${booksWithQuotes.length})`
    sel.appendChild(optAll)
    for (const b of booksWithQuotes) {
      const opt = document.createElement('option')
      opt.value = b.id
      opt.textContent = toTitleCase(b.title || b.id)
      sel.appendChild(opt)
    }
    // Preserve current selection if still present
    const values = new Set(Array.from(sel.options).map((o) => o.value))
    if (values.has(currentBookFilter)) sel.value = currentBookFilter
    else sel.value = 'all'
  }

  function renderInsights() {
    // Only consider: books with shelf 'read' OR books present in quotes
    const hasQuotes = new Set(quotes.map((q) => q.bookId))
    let considered = books.filter((b) => {
      const shelves = (b.shelves || [])
      return (shelves.includes('read')) || hasQuotes.has(b.id)
    })
    // Apply date range filter if provided (based on dateRead)
    try {
      const startVal = document.getElementById('insights-start')?.value || ''
      const endVal = document.getElementById('insights-end')?.value || ''
      let startDate = startVal ? new Date(startVal) : null
      let endDate = endVal ? new Date(endVal) : null
      // Make end date inclusive (end of day)
      if (endDate) endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999)
      if (startDate || endDate) {
        considered = considered.filter((b) => {
          if (!b.dateRead) return false
          const d = new Date(b.dateRead)
          if (Number.isNaN(d.getTime())) return false
          if (startDate && d < startDate) return false
          if (endDate && d > endDate) return false
          return true
        })
      }
      const summary = document.getElementById('insights-range-summary')
      if (summary) {
        if (startDate || endDate) {
          const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
          summary.textContent = `Range: ${startDate ? fmt(startDate) : '…'} to ${endDate ? fmt(endDate) : '…'}`
        } else {
          summary.textContent = ''
        }
      }
    } catch {}

    const bpy = Insights.booksPerYear(considered).sort((a, b) => String(a.year).localeCompare(String(b.year)))
    const ppy = Insights.pagesPerYear(considered).sort((a, b) => String(a.year).localeCompare(String(b.year)))
    const gd = Insights.genreDistribution(considered)
    const rd = Insights.ratingsDistribution(considered)
    const sh = Insights.shelvesDistribution(considered)
    const ad = Insights.authorsDistribution(considered, 8)
    const qb = Insights.quotesByBookDistribution(quotes, considered)

    // Tables removed per request

    // Charts if Chart.js is present
    if (window.Chart) {
      // Destroy prior charts to avoid duplicates on re-render
      try {
        (window.AppCharts || []).forEach((c) => c?.destroy && c.destroy())
      } catch {}
      window.AppCharts = []
      const brandStart = getComputedStyle(document.documentElement).getPropertyValue('--brand-start').trim() || '#20c997'
      const brandEnd = getComputedStyle(document.documentElement).getPropertyValue('--brand-end').trim() || '#0d6efd'
      const palette = [brandStart, brandEnd, '#17a2b8', '#66d9e8', '#228be6', '#63e6be', '#329af0']

      const ctx1 = document.getElementById('chart-books-per-year')
      if (ctx1) window.AppCharts.push(new Chart(ctx1, { type: 'bar', data: { labels: bpy.map((r) => r.year), datasets: [{ label: 'Books', data: bpy.map((r) => r.count), backgroundColor: brandEnd, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }))

      const ctx2 = document.getElementById('chart-pages-per-year')
      if (ctx2) window.AppCharts.push(new Chart(ctx2, { type: 'bar', data: { labels: ppy.map((r) => r.year), datasets: [{ label: 'Pages', data: ppy.map((r) => r.pages), backgroundColor: brandStart, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }))

      const ctxShelves = document.getElementById('chart-shelves')
      if (ctxShelves) window.AppCharts.push(new Chart(ctxShelves, { type: 'doughnut', data: { labels: sh.map((r) => r.shelf), datasets: [{ label: 'Books', data: sh.map((r) => r.count), backgroundColor: sh.map((_, i) => palette[i % palette.length]) }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }))

      const ctxRatings = document.getElementById('chart-ratings')
      if (ctxRatings) window.AppCharts.push(new Chart(ctxRatings, { type: 'pie', data: { labels: rd.map((r) => String(r.rating)), datasets: [{ label: 'Books', data: rd.map((r) => r.count), backgroundColor: rd.map((_, i) => palette[i % palette.length]) }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => { const total = ctx.dataset.data.reduce((a,b)=>a+b,0); const val = ctx.parsed; const pct = total ? Math.round(val*100/total) : 0; return `${ctx.label}: ${val} (${pct}%)` } } } } } }))

      const ctxAuthors = document.getElementById('chart-authors')
      if (ctxAuthors) window.AppCharts.push(new Chart(ctxAuthors, { type: 'pie', data: { labels: ad.map((r) => r.author), datasets: [{ label: 'Books', data: ad.map((r) => r.count), backgroundColor: ad.map((_, i) => palette[i % palette.length]) }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }))

      const ctxQuotes = document.getElementById('chart-quotes')
      if (ctxQuotes) window.AppCharts.push(new Chart(ctxQuotes, { type: 'pie', data: { labels: qb.map((r) => r.title), datasets: [{ label: 'Quotes', data: qb.map((r) => r.count), backgroundColor: qb.map((_, i) => palette[i % palette.length]) }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } }))
    }
  }

  async function init() {
    console.info('[App] init() called')
    // 1) Load data first so UI/theme errors don't block fetch
  try {
      books = await Data.loadBooks()
      quotes = await Data.loadQuotes()
      console.info('[App] Loaded data:', { books: books.length, quotes: quotes.length })
    } catch (e) {
      console.error('[App] data load failed', e)
      showDevWarning('Failed to load data: ' + (e && e.message ? e.message : String(e)))
    }

    // 2) Theme: fixed to Minty; update brand variables once
    try {
      setTimeout(() => {
        const root = document.documentElement
        const styles = getComputedStyle(root)
        const start = styles.getPropertyValue('--bs-teal').trim() || '#20c997'
        const end = styles.getPropertyValue('--bs-primary').trim() || styles.getPropertyValue('--bs-blue').trim() || '#0d6efd'
        root.style.setProperty('--brand-start', start)
        root.style.setProperty('--brand-end', end)
      }, 0)
    } catch (e) {
      console.warn('[App] theme var setup failed', e)
    }

    // 3) Wire controls (isolated)
    try {
      document.querySelectorAll('.tab').forEach((btn) => {
        btn.addEventListener('click', () => showTab(btn.dataset.tab))
      })
      const prevBtn = document.getElementById('prev-quote')
      if (prevBtn) prevBtn.addEventListener('click', () => { browseIndex -= 1; renderBrowse() })
      const nextBtn = document.getElementById('next-quote')
      if (nextBtn) nextBtn.addEventListener('click', () => { browseIndex += 1; renderBrowse() })
      // Pager for selected-book view
      const prevPage = document.getElementById('prev-page')
      if (prevPage) prevPage.addEventListener('click', () => { pageIndex -= 1; renderBrowse() })
      const nextPage = document.getElementById('next-page')
      if (nextPage) nextPage.addEventListener('click', () => { pageIndex += 1; renderBrowse() })
      const refreshBtn = document.getElementById('refresh-quote')
      if (refreshBtn) refreshBtn.addEventListener('click', () => {
        if (!quotes.length) return
        const idx = Math.floor(Math.random() * quotes.length)
        renderQuote('daily', quotes[idx])
      })
      const filterBook = document.getElementById('filter-book')
      if (filterBook) filterBook.addEventListener('change', (e) => { currentBookFilter = e.target.value; applyFilters() })
      const filterSearch = document.getElementById('filter-search')
      if (filterSearch) filterSearch.addEventListener('input', (e) => { currentSearch = e.target.value || ''; applyFilters() })

      // Insights date range
      const startEl = document.getElementById('insights-start')
      const endEl = document.getElementById('insights-end')
      const clearBtn = document.getElementById('insights-clear-range')
      if (startEl) startEl.addEventListener('change', () => renderInsights())
      if (endEl) endEl.addEventListener('change', () => renderInsights())
      if (clearBtn) clearBtn.addEventListener('click', () => { if (startEl) startEl.value=''; if (endEl) endEl.value=''; renderInsights() })
    } catch (e) {
      console.warn('[App] control wiring failed', e)
    }

    // 4) Render UI
    try {
      if ((!books || books.length === 0) || (!quotes || quotes.length === 0)) {
        showDevWarning('No data loaded. Ensure /data/books.json and /data/quotes.json exist and are reachable.')
      }
      renderDaily()
      populateFilters()
      applyFilters()
      renderInsights()
    } catch (e) {
      console.error('[App] render failed', e)
      showDevWarning('Render failed: ' + (e && e.message ? e.message : String(e)))
    }
  }

  function showDevWarning(msg) {
    let bar = document.getElementById('dev-warning')
    if (!bar) {
      bar = document.createElement('div')
      bar.id = 'dev-warning'
      bar.style.position = 'sticky'
      bar.style.top = '0'
      bar.style.zIndex = '1000'
      bar.style.background = '#fff3cd'
      bar.style.borderBottom = '1px solid #ffeeba'
      bar.style.color = '#856404'
      bar.style.padding = '8px 12px'
      bar.style.fontSize = '14px'
      document.body.prepend(bar)
    }
    bar.textContent = msg
  }

  if (document.readyState === 'loading') {
    console.info('[App] waiting for DOMContentLoaded')
    document.addEventListener('DOMContentLoaded', init)
  } else {
    console.info('[App] DOM already loaded, running init')
    init()
  }

  window.addEventListener('error', (e) => {
    console.error('[App] Uncaught error', e.error || e.message || e)
    try {
      const bar = document.getElementById('dev-warning') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'dev-warning' }))
      bar.textContent = 'Error: ' + (e.message || 'unknown')
      bar.style.position = 'sticky'; bar.style.top = '0'; bar.style.zIndex = '1000'; bar.style.background = '#fff3cd'; bar.style.borderBottom = '1px solid #ffeeba'; bar.style.color = '#856404'; bar.style.padding = '8px 12px'; bar.style.fontSize = '14px'
    } catch {}
  })
})()
