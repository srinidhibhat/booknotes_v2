;(function () {
  console.info('[App] script evaluating')
  const tabs = {
    daily: document.getElementById('tab-daily'),
    browse: document.getElementById('tab-browse'),
    insights: document.getElementById('tab-insights')
  }

  let quotes = []
  let books = []
  let goodreadsBooks = []
  let browseIndex = 0
  let filteredQuotes = []
  let currentBookFilter = 'all'
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
    // Fallback to first known tab when a bad name is provided
    if (!tabs[name]) name = Object.keys(tabs).find((k) => tabs[k]) || name
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
    // Keep original text for possible truncation fallback
    textEl.textContent = t
    textEl.dataset.originalText = t
    const byBook = bookLookup().get(q.bookId)
    const titleRaw = byBook?.title || q.bookId || 'Unknown book'
    const title = toTitleCase(titleRaw)
    const authors = Data.authorsList(byBook).join(', ')
    const loc = q.location?.page || q.location?.raw || ''
    if (targetPrefix === 'daily') {
      // Daily hero: title on one line, author below (no "by"). Omit location for hero.
      const titleHTML = `<div class="hero-title">${escapeHTML(title)}</div>`
      const authorHTML = authors ? `<div class="hero-author">${escapeHTML(authors)}</div>` : ''
      metaEl.innerHTML = titleHTML + authorHTML
    } else {
      // Browse: keep compact meta line with title • by authors • @ loc
      const bits = [title, authors && `by ${authors}`, loc && `@ ${loc}`].filter(Boolean)
      metaEl.textContent = bits.join(' • ')
    }

    // After render, adjust font size if needed to fit container
    requestAnimationFrame(() => {
      try {
        fitQuoteToContainer(targetPrefix)
      } catch {}
    })
  }

  function renderDaily() {
    renderQuote('daily', pickDaily(quotes))
  }

  function fitQuoteToContainer(prefix) {
    const textEl = document.getElementById(`${prefix}-quote-text`)
    const metaEl = document.getElementById(`${prefix}-quote-meta`)
    if (!textEl) return
    const isDaily = prefix === 'daily'
    const container = isDaily
      ? document.querySelector('#daily-quote .hero-inner') || textEl.parentElement
      : document.querySelector('#browse-single .card-body') || textEl.parentElement
    if (!container) return
    // Reset to computed size first
    const computed = parseFloat(getComputedStyle(textEl).fontSize || '20')
    textEl.style.fontSize = computed + 'px'
    const minPx = isDaily ? 16 : 12
    const pad = 24
    // Available vertical space inside the container; for browse we rely on max-height in CSS
    let avail = container.clientHeight - (metaEl ? metaEl.clientHeight : 0) - pad
    // Fallback if container isn't sized yet
    if (!Number.isFinite(avail) || avail <= 0) {
      const frac = isDaily ? 0.6 : 0.55
      avail = Math.max(120, Math.floor(window.innerHeight * frac))
    }
    let size = computed
    let attempts = 0
    while (attempts < 12) {
      const h = textEl.scrollHeight
      if (h <= avail || size <= minPx) break
      size = Math.max(minPx, Math.floor(size * 0.9))
      textEl.style.fontSize = size + 'px'
      attempts += 1
    }

    // If still overflowing at minimum size, fall back to truncation
    if (textEl.scrollHeight > avail - 2) {
      const original = textEl.dataset.originalText || textEl.textContent || ''
      const maxChars = isDaily ? 320 : 200
      if (original.length > maxChars) {
        const truncated = truncateAtWord(original, maxChars)
        textEl.textContent = truncated + '…'
      }
    }
  }

  function truncateAtWord(s, max) {
    if (s.length <= max) return s
    const cut = s.slice(0, max)
    const lastSpace = cut.lastIndexOf(' ')
    return lastSpace > 40 ? cut.slice(0, lastSpace) : cut
  }

  function renderBrowse() {
    const singleWrap = document.getElementById('browse-single')
    const listWrap = document.getElementById('browse-list')
    const controls = document.getElementById('browse-controls')
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
      renderQuote('browse', null)
      if (countEl) countEl.textContent = '0 results'
      if (controls) controls.hidden = true
      return
    }

    // If a specific book is selected, show paginated list of quotes (10 per page)
    const isSpecificBook = currentBookFilter !== 'all'
    if (isSpecificBook) {
      setShown(singleWrap, false)
      setShown(listWrap, true)
      if (controls) { controls.hidden = false }
      // Switch the two buttons to page navigation labels
      if (prevBtn) prevBtn.textContent = 'Prev Page'
      if (nextBtn) nextBtn.textContent = 'Next Page'

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

      // Update count with page indicator
      if (countEl) countEl.textContent = `${total} result${total === 1 ? '' : 's'} • Page ${pageIndex + 1} of ${totalPages}`
      return
    }

    // Otherwise (All Books), keep single-quote browse with prev/next
    setShown(singleWrap, true)
    if (listWrap) { setShown(listWrap, false); listWrap.innerHTML = '' }
    if (controls) { controls.hidden = false }
    if (prevBtn) prevBtn.textContent = 'Prev'
    if (nextBtn) nextBtn.textContent = 'Next'
    if (browseIndex < 0) browseIndex = filteredQuotes.length - 1
    if (browseIndex >= filteredQuotes.length) browseIndex = 0
    renderQuote('browse', filteredQuotes[browseIndex])
    if (countEl) countEl.textContent = `${filteredQuotes.length} result${filteredQuotes.length === 1 ? '' : 's'}`
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function applyFilters() {
    filteredQuotes = quotes.filter((q) => {
      if (currentBookFilter !== 'all' && q.bookId !== currentBookFilter) return false
      return true
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
    const booksWithQuotes = books
      .filter((b) => hasQuotes.has(b.id))
      .slice()
      .sort((a, b) => toTitleCase(a.title || a.id).localeCompare(toTitleCase(b.title || b.id)))
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
    // Insights are powered by Goodreads export (authoritative for pages/year/shelves/dateRead)
    // Only consider books marked as 'read'. Date range further filters based on dateRead.
    let considered = (goodreadsBooks || []).filter((b) => (b?.shelves || []).includes('read'))
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

    // Exclude missing-year entries from per-year charts
    const withYear = considered.filter((b) => b && b.year)
    const bpy = Insights.booksPerYear(withYear).sort((a, b) => String(a.year).localeCompare(String(b.year)))
    const ppy = Insights.pagesPerYear(withYear).sort((a, b) => String(a.year).localeCompare(String(b.year)))

    const topRated = considered
      .filter((b) => (b?.rating || 0) > 0)
      .slice()
      .sort((a, b) => (b.rating - a.rating) || (b.averageRating - a.averageRating) || String(a.title || '').localeCompare(String(b.title || '')))
      .slice(0, 10)

    const recentReads = considered
      .filter((b) => b?.dateRead)
      .slice()
      .sort((a, b) => String(b.dateRead).localeCompare(String(a.dateRead)))
      .slice(0, 10)

    // Stat cards
    try {
      const statBooks = document.getElementById('insights-stat-books')
      const statPages = document.getElementById('insights-stat-pages')
      const statQuotes = document.getElementById('insights-stat-quotes')
      const statAuthors = document.getElementById('insights-stat-authors')
      if (statBooks) statBooks.textContent = String(considered.length)
      if (statPages) statPages.textContent = String(considered.reduce((sum, b) => sum + (b.pages || 0), 0))
      if (statQuotes) statQuotes.textContent = String((quotes || []).length)
      if (statAuthors) {
        const authorsSet = new Set()
        for (const b of considered) {
          for (const a of (window.Data?.authorsList(b) || [])) authorsSet.add(a)
        }
        statAuthors.textContent = String(authorsSet.size)
      }
    } catch {}

    // Tables
    try {
      const topRatedBody = document.getElementById('insights-top-rated-body')
      if (topRatedBody) {
        topRatedBody.innerHTML = ''
        for (const b of topRated) {
          const tr = document.createElement('tr')
          const title = toTitleCase(b.title || '')
          const authors = (window.Data?.authorsList(b) || []).join(', ')
          tr.innerHTML = `<td><div>${escapeHTML(title)}</div><div class="text-muted small">${escapeHTML(authors)}</div></td><td>${escapeHTML(String(b.rating || 0))}</td><td>${escapeHTML(String(b.year || ''))}</td>`
          topRatedBody.appendChild(tr)
        }
        if (!topRated.length) {
          const tr = document.createElement('tr')
          tr.innerHTML = `<td colspan="3" class="text-muted">No rated read books found (My Rating &gt; 0).</td>`
          topRatedBody.appendChild(tr)
        }
      }
    } catch {}

    try {
      const recentReadsBody = document.getElementById('insights-recent-reads-body')
      if (recentReadsBody) {
        recentReadsBody.innerHTML = ''
        for (const b of recentReads) {
          const tr = document.createElement('tr')
          const title = toTitleCase(b.title || '')
          const authors = (window.Data?.authorsList(b) || []).join(', ')
          tr.innerHTML = `<td>${escapeHTML(title)}</td><td>${escapeHTML(String(b.dateRead || ''))}</td><td class="text-muted">${escapeHTML(authors)}</td>`
          recentReadsBody.appendChild(tr)
        }
        if (!recentReads.length) {
          const tr = document.createElement('tr')
          tr.innerHTML = `<td colspan="3" class="text-muted">No recent reads found (missing dateRead).</td>`
          recentReadsBody.appendChild(tr)
        }
      }
    } catch {}

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

      const titleCaseLabels = (arr) => arr.map((s) => toTitleCase(String(s || '')))

      const ctx1 = document.getElementById('chart-books-per-year')
      if (ctx1) window.AppCharts.push(new Chart(ctx1, { type: 'bar', data: { labels: bpy.map((r) => r.year), datasets: [{ label: 'Books', data: bpy.map((r) => r.count), backgroundColor: brandEnd, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }))

      const ctx2 = document.getElementById('chart-pages-per-year')
      if (ctx2) window.AppCharts.push(new Chart(ctx2, { type: 'bar', data: { labels: ppy.map((r) => r.year), datasets: [{ label: 'Pages', data: ppy.map((r) => r.pages), backgroundColor: brandStart, borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }))
    }
  }

  async function init() {
    console.info('[App] init() called')
    // 1) Load data first so UI/theme errors don't block fetch
  try {
      books = await Data.loadBooks()
      quotes = await Data.loadQuotes()
      goodreadsBooks = await (Data.loadGoodreads ? Data.loadGoodreads() : [])
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
      if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentBookFilter !== 'all') { pageIndex -= 1 } else { browseIndex -= 1 }
        renderBrowse()
      })
      const nextBtn = document.getElementById('next-quote')
      if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentBookFilter !== 'all') { pageIndex += 1 } else { browseIndex += 1 }
        renderBrowse()
      })
      const refreshBtn = document.getElementById('refresh-quote')
      if (refreshBtn) refreshBtn.addEventListener('click', () => {
        if (!quotes.length) return
        const idx = Math.floor(Math.random() * quotes.length)
        renderQuote('daily', quotes[idx])
      })
      const filterBook = document.getElementById('filter-book')
      if (filterBook) filterBook.addEventListener('change', (e) => { currentBookFilter = e.target.value; applyFilters() })
      // Search removed per request

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

      // Ensure default tab is visible after initial render
      showTab('daily')
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

  // Re-fit quotes on resize for better responsiveness (debounced)
  let _resizeTimer = null
  window.addEventListener('resize', () => {
    if (_resizeTimer) clearTimeout(_resizeTimer)
    _resizeTimer = setTimeout(() => {
      try { fitQuoteToContainer('daily') } catch {}
      try { fitQuoteToContainer('browse') } catch {}
      _resizeTimer = null
    }, 120)
  })

  window.addEventListener('error', (e) => {
    console.error('[App] Uncaught error', e.error || e.message || e)
    try {
      const bar = document.getElementById('dev-warning') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'dev-warning' }))
      bar.textContent = 'Error: ' + (e.message || 'unknown')
      bar.style.position = 'sticky'; bar.style.top = '0'; bar.style.zIndex = '1000'; bar.style.background = '#fff3cd'; bar.style.borderBottom = '1px solid #ffeeba'; bar.style.color = '#856404'; bar.style.padding = '8px 12px'; bar.style.fontSize = '14px'
    } catch {}
  })
})()
