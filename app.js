const els = {
  search: document.getElementById("search"),
  sortSelect: document.getElementById("sortSelect"),
  groupSelect: document.getElementById("groupSelect"),
  languageFilters: document.getElementById("languageFilters"),
  topicFilters: document.getElementById("topicFilters"),
  hideArchived: document.getElementById("hideArchived"),
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  dataMeta: document.getElementById("dataMeta"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
}

const state = {
  repos: [],
  activeLanguages: new Set(),
  excludedLanguages: new Set(),
  activeTopics: new Set(),
  excludedTopics: new Set(),
  activeRepoName: null,
}

init()

async function init() {
  const res = await fetch("data/repos.json")
  if (!res.ok) {
    els.status.textContent = `Could not load data/repos.json (HTTP ${res.status}). Run scripts/fetch-repos.js first.`
    return
  }
  const payload = await res.json()
  state.repos = payload.repos

  els.dataMeta.innerHTML = `generated<br>${new Date(payload.generated_at).toLocaleString()}<br><br>${payload.repos.length} repos &middot; ${payload.username}`

  loadStateFromURL()

  buildLanguageChips()
  buildTopicChips()

  els.search.addEventListener("input", () => {
    updateURLAndRender()
  })
  els.sortSelect.addEventListener("change", () => {
    updateURLAndRender()
  })
  els.groupSelect.addEventListener("change", () => {
    updateURLAndRender()
  })
  els.hideArchived.addEventListener("change", () => {
    updateURLAndRender()
  })

  els.modalClose.addEventListener("click", closeModal)
  els.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === els.modalBackdrop) closeModal()
  })
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal()
  })

  window.addEventListener("popstate", () => {
    loadStateFromURL()
    buildLanguageChips()
    buildTopicChips()
    render()
  })

  render()
}

function loadStateFromURL() {
  const params = new URLSearchParams(window.location.search)

  els.search.value = params.get("q") || ""
  els.sortSelect.value = params.get("sort") || "updated_desc"
  els.groupSelect.value = params.get("group") || "none"
  els.hideArchived.checked = params.get("hideArchived") === "true"

  state.activeLanguages = new Set(
    params.get("langs") ? params.get("langs").split(",") : [],
  )
  state.excludedLanguages = new Set(
    params.get("not_langs") ? params.get("not_langs").split(",") : [],
  )

  state.activeTopics = new Set(
    params.get("topics") ? params.get("topics").split(",") : [],
  )
  state.excludedTopics = new Set(
    params.get("not_topics") ?
      params.get("not_topics").split(",")
    : [],
  )

  state.activeRepoName = params.get("repo") || null
}

function updateURLAndRender() {
  const params = new URLSearchParams()

  if (els.search.value.trim())
    params.set("q", els.search.value.trim())
  if (els.sortSelect.value !== "updated_desc")
    params.set("sort", els.sortSelect.value)
  if (els.groupSelect.value !== "none")
    params.set("group", els.groupSelect.value)
  if (els.hideArchived.checked) params.set("hideArchived", "true")

  if (state.activeLanguages.size > 0) {
    params.set("langs", Array.from(state.activeLanguages).join(","))
  }
  if (state.excludedLanguages.size > 0) {
    params.set(
      "not_langs",
      Array.from(state.excludedLanguages).join(","),
    )
  }

  if (state.activeTopics.size > 0) {
    params.set("topics", Array.from(state.activeTopics).join(","))
  }
  if (state.excludedTopics.size > 0) {
    params.set(
      "not_topics",
      Array.from(state.excludedTopics).join(","),
    )
  }

  if (state.activeRepoName) {
    params.set("repo", state.activeRepoName)
  }

  const queryStr = params.toString()
  const newUrl =
    queryStr ?
      `${window.location.pathname}?${queryStr}`
    : window.location.pathname
  window.history.replaceState({}, "", newUrl)

  render()
}

function handleChipClicks(chip, value, activeSet, excludedSet) {
  // Left Click: Cycle None -> Included -> None
  chip.addEventListener("click", () => {
    if (excludedSet.has(value)) {
      excludedSet.delete(value)
    } else if (activeSet.has(value)) {
      activeSet.delete(value)
    } else {
      activeSet.add(value)
    }
    updateChipClass(chip, value, activeSet, excludedSet)
    updateURLAndRender()
  })

  // Right Click: Cycle None -> Excluded -> None
  chip.addEventListener("contextmenu", (e) => {
    e.preventDefault()
    if (activeSet.has(value)) {
      activeSet.delete(value)
    } else if (excludedSet.has(value)) {
      excludedSet.delete(value)
    } else {
      excludedSet.add(value)
    }
    updateChipClass(chip, value, activeSet, excludedSet)
    updateURLAndRender()
  })
}

function updateChipClass(chip, value, activeSet, excludedSet) {
  chip.classList.remove("active", "excluded")
  if (activeSet.has(value)) {
    chip.classList.add("active")
  } else if (excludedSet.has(value)) {
    chip.classList.add("excluded")
  }
}

function buildLanguageChips() {
  const counts = new Map()
  for (const r of state.repos) {
    if (!r.language) continue
    counts.set(r.language, (counts.get(r.language) || 0) + 1)
  }
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1])
  els.languageFilters.innerHTML = ""
  for (const [lang, count] of langs) {
    const chip = document.createElement("span")
    chip.className = "chip"
    chip.textContent = `${lang} (${count})`

    updateChipClass(
      chip,
      lang,
      state.activeLanguages,
      state.excludedLanguages,
    )
    handleChipClicks(
      chip,
      lang,
      state.activeLanguages,
      state.excludedLanguages,
    )

    els.languageFilters.appendChild(chip)
  }
}

function buildTopicChips() {
  const counts = new Map()
  for (const r of state.repos) {
    for (const t of r.topics) {
      counts.set(t, (counts.get(t) || 0) + 1)
    }
  }
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
  els.topicFilters.innerHTML = ""
  for (const [topic, count] of topics) {
    const chip = document.createElement("span")
    chip.className = "chip"
    chip.textContent = `${topic} (${count})`

    updateChipClass(
      chip,
      topic,
      state.activeTopics,
      state.excludedTopics,
    )
    handleChipClicks(
      chip,
      topic,
      state.activeTopics,
      state.excludedTopics,
    )

    els.topicFilters.appendChild(chip)
  }
}

function getFiltered() {
  const q = els.search.value.trim().toLowerCase()
  const hideArchived = els.hideArchived.checked

  return state.repos.filter((r) => {
    if (hideArchived && r.archived) return false

    // Language inclusions & exclusions
    if (state.excludedLanguages.has(r.language)) return false
    if (
      state.activeLanguages.size &&
      !state.activeLanguages.has(r.language)
    )
      return false

    // Topic inclusions & exclusions
    if (state.excludedTopics.size) {
      const hasExcludedTopic = r.topics.some((t) =>
        state.excludedTopics.has(t),
      )
      if (hasExcludedTopic) return false
    }
    if (state.activeTopics.size) {
      const hasActiveTopic = r.topics.some((t) =>
        state.activeTopics.has(t),
      )
      if (!hasActiveTopic) return false
    }

    if (q) {
      const haystack = [r.name, r.description || "", ...r.topics]
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

function getSorted(list) {
  const mode = els.sortSelect.value
  const sorted = [...list]
  switch (mode) {
    case "updated_desc":
      sorted.sort(
        (a, b) => new Date(b.pushed_at) - new Date(a.pushed_at),
      )
      break
    case "created_desc":
      sorted.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      )
      break
    case "created_asc":
      sorted.sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at),
      )
      break
    case "stars_desc":
      sorted.sort((a, b) => b.stars - a.stars)
      break
    case "name_asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name))
      break
  }
  return sorted
}

function getGroupKey(r) {
  const mode = els.groupSelect.value
  if (mode === "language") return r.language || "unlabeled"
  if (mode === "topic") return r.topics[0] || "untagged"
  if (mode === "year")
    return String(new Date(r.created_at).getFullYear())
  return null
}

function render() {
  const filtered = getSorted(getFiltered())
  els.status.textContent = `${filtered.length} of ${state.repos.length} repos`
  els.board.innerHTML = ""

  const groupMode = els.groupSelect.value

  if (groupMode === "none") {
    els.board.appendChild(renderGrid(filtered))
  } else {
    const groups = new Map()
    for (const r of filtered) {
      const key = getGroupKey(r)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(r)
    }
    const sortedKeys = [...groups.keys()].sort((a, b) =>
      groupMode === "year" ? b.localeCompare(a) : a.localeCompare(b),
    )

    for (const key of sortedKeys) {
      const heading = document.createElement("div")
      heading.className = "group-heading"
      heading.textContent = `${key} (${groups.get(key).length})`
      els.board.appendChild(heading)
      els.board.appendChild(renderGrid(groups.get(key)))
    }
  }

  if (state.activeRepoName) {
    const targetRepo = state.repos.find(
      (r) => r.name === state.activeRepoName,
    )
    if (targetRepo) {
      displayModal(targetRepo)
    } else {
      closeModal()
    }
  } else {
    els.modalBackdrop.classList.remove("open")
  }
}

function renderGrid(repos) {
  const grid = document.createElement("div")
  grid.className = "grid"
  for (const r of repos) {
    grid.appendChild(renderCard(r))
  }
  return grid
}

function renderCard(r) {
  const card = document.createElement("div")
  card.className = "card"
  card.addEventListener("click", () => openModal(r))

  if (r.image) {
    const img = document.createElement("img")
    img.className = "card-image"
    img.src = r.image
    img.loading = "lazy"
    img.alt = ""
    img.onerror = () => {
      img.replaceWith(placeholderImage(r))
    }
    card.appendChild(img)
  } else {
    card.appendChild(placeholderImage(r))
  }

  const body = document.createElement("div")
  body.className = "card-body"

  const name = document.createElement("h3")
  name.className = "card-name"
  name.textContent = r.name
  body.appendChild(name)

  const desc = document.createElement("p")
  desc.className = "card-desc"
  desc.textContent = r.description || "no description"
  body.appendChild(desc)

  const meta = document.createElement("div")
  meta.className = "card-meta"
  meta.innerHTML = `
    ${r.language ? `<span><span class="lang-dot"></span>${r.language}</span>` : ""}
    <span>&#9733; ${r.stars}</span>
    <span>updated ${timeAgo(r.pushed_at)}</span>
    ${r.archived ? `<span class="archived-tag">archived</span>` : ""}
  `
  body.appendChild(meta)

  card.appendChild(body)
  return card
}

function placeholderImage(r) {
  const div = document.createElement("div")
  div.className = "card-image placeholder"
  div.textContent = r.language || "no preview"
  return div
}

function openModal(r) {
  state.activeRepoName = r.name
  updateURLAndRender()
}

function displayModal(r) {
  els.modalBody.innerHTML = `
    <h1>${escapeHtml(r.name)}</h1>
    <div class="modal-sub">${r.language || "\u2014"} &middot; \u2605 ${r.stars} &middot; ${r.forks} forks &middot; created ${new Date(r.created_at).toLocaleDateString()}</div>
    <div class="modal-links">
      <a href="${r.html_url}" target="_blank" rel="noopener">view on github</a>
      ${r.homepage ? `<a href="${r.homepage}" target="_blank" rel="noopener">homepage</a>` : ""}
    </div>
    <div class="modal-readme">${r.readme ? marked.parse(r.readme) : "<em>no README found</em>"}</div>
  `
  els.modalBackdrop.classList.add("open")
}

function closeModal() {
  state.activeRepoName = null
  updateURLAndRender()
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  )
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return "today"
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}
