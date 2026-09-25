#!/usr/bin/env node
/**
 * Fetches every public repo for a GitHub user/org and writes data/repos.json.
 *
 * Usage:
 *   GITHUB_USERNAME=yourname node scripts/fetch-repos.js
 *   GITHUB_USERNAME=yourname GITHUB_TOKEN=ghp_xxx node scripts/fetch-repos.js
 *
 * GITHUB_TOKEN is optional but strongly recommended: unauthenticated requests
 * are capped at 60/hour, authenticated ones at 5000/hour. A token with no
 * scopes at all (just "public_repo" read access, or even a token with zero
 * scopes) is enough for public data. Create one at
 * https://github.com/settings/tokens
 *
 * Requires Node 18+ (uses the built-in fetch).
 */

const fs = require("fs")
const path = require("path")
const { unescape } = require("querystring")

const USERNAME = process.env.GITHUB_USERNAME
const TOKEN = process.env.GITHUB_TOKEN

if (!USERNAME) {
  console.error("ERROR: GITHUB_USERNAME env var is required.")
  console.error(
    "Usage: GITHUB_USERNAME=yourname node scripts/fetch-repos.js",
  )
  process.exit(1)
}

const API_ROOT = "https://api.github.com"
const OUT_DIR = path.join(__dirname, "..", "data")
const OUT_FILE = path.join(OUT_DIR, "repos.json")
const IMAGES_DIR = path.join(OUT_DIR, "images")

function headers() {
  const h = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${USERNAME}-repo-explorer-script`,
    "X-GitHub-Api-Version": "2022-11-28",
  }
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`
  return h
}

/**
 * @param {string | URL | Request} url
 */
async function apiGet(url) {
  const res = await fetch(url, { headers: headers() })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub API ${res.status} for ${url}: ${body}`)
  }
  return res.json()
}

async function fetchAllRepos() {
  const repos = []
  let page = 1
  for (;;) {
    const url = `${API_ROOT}/users/${encodeURIComponent(
      // @ts-ignore
      USERNAME,
    )}/repos?per_page=100&page=${page}&type=owner&sort=updated`
    const batch = await apiGet(url)
    if (!batch || batch.length === 0) break
    repos.push(...batch)
    if (batch.length < 100) break
    page += 1
  }
  return repos
}

// Find every image referenced in a README, as either Markdown ![alt](src)
// or an <img src="..."> tag, in document order. Returns an array of
// { raw, index } where raw is exactly the string that appeared in the
// source (used later to find/replace it) and index is where it starts.
/**
 * @param {string} readmeMarkdown
 */
function extractImageRefs(readmeMarkdown) {
  if (!readmeMarkdown) return []

  const refs = []
  const mdRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  const htmlRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi

  let m
  while ((m = mdRe.exec(readmeMarkdown))) {
    refs.push({ raw: m[1], fullMatch: m[0], index: m.index })
  }
  while ((m = htmlRe.exec(readmeMarkdown))) {
    refs.push({ raw: m[1], fullMatch: m[0], index: m.index })
  }
  refs.sort((a, b) => a.index - b.index)
  return refs
}

/**
 * @param {string} raw
 * @param {any} owner
 * @param {any} repo
 * @param {any} defaultBranch
 */
function resolveImageUrl(raw, owner, repo, defaultBranch) {
  if (raw.startsWith("http://") || raw.startsWith("https://"))
    return raw
  if (raw.startsWith("data:")) return null // inline data URIs, nothing to download
  const cleanPath = raw.replace(/^\.?\//, "")
  return `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${cleanPath}`
}

// Turn a repo-relative image path into a filesystem-safe, collision-free
// filename: the full relative path with slashes flattened to underscores,
// so ./gh_images/a.png and ./other/a.png (same repo) can't collide, and a
// per-repo subfolder keeps different repos' images apart even if they
// reference identically-named files.
/**
 * @param {string} raw
 */
function localImageName(raw) {
  const noQuery = raw.split(/[?#]/)[0]
  const cleanPath = noQuery.replace(/^\.?\//, "")
  return unescape(cleanPath.replace(/[\\/]/g, "_"))
}

/**
 * @param {string | URL | Request} url
 * @param {fs.PathOrFileDescriptor} destPath
 */
async function downloadImage(url, destPath) {
  const res = await fetch(url, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buf)
}

// Downloads every image a README references, saves them under
// data/images/<owner>-<repo>/, and returns the README text rewritten so
// each image reference points at the saved local file instead of the
// original (possibly relative, possibly remote) path.
/**
 * @param {string} readmeMarkdown
 * @param {any} owner
 * @param {any} repo
 * @param {any} defaultBranch
 */
async function localizeReadmeImages(
  readmeMarkdown,
  owner,
  repo,
  defaultBranch,
) {
  const refs = extractImageRefs(readmeMarkdown)
  if (refs.length === 0) return { readme: readmeMarkdown, images: [] }

  const repoSlug = `${owner}-${repo}`
  const repoImageDir = path.join(IMAGES_DIR, repoSlug)
  fs.mkdirSync(repoImageDir, { recursive: true })

  let rewritten = readmeMarkdown
  const savedImages = []
  const seen = new Map() // raw -> local web path, so repeated refs to the same image reuse one file

  for (const ref of refs) {
    if (seen.has(ref.raw)) continue

    const sourceUrl = resolveImageUrl(
      ref.raw,
      owner,
      repo,
      defaultBranch,
    )
    if (!sourceUrl) continue

    const filename = localImageName(ref.raw)
    const destPath = path.join(repoImageDir, filename)
    const webPath = `data/images/${repoSlug}/${filename}`

    try {
      await downloadImage(sourceUrl, destPath)
      seen.set(ref.raw, webPath)
      savedImages.push(webPath)
    } catch (err) {
      // @ts-ignore
      console.log(`\n    image failed (${ref.raw}): ${err.message}`)
      continue
    }
  }

  for (const [raw, webPath] of seen) {
    // Replace every literal occurrence of this exact raw path with the
    // local one. Escape regex metacharacters since raw is arbitrary text.
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    rewritten = rewritten.replace(new RegExp(escaped, "g"), webPath)
  }

  return { readme: rewritten, images: savedImages }
}

/**
 * @param {any} owner
 * @param {any} repo
 */
async function fetchReadme(owner, repo) {
  const meta = await apiGet(
    `${API_ROOT}/repos/${owner}/${repo}/readme`,
  )
  if (!meta || !meta.content) return null
  return Buffer.from(
    meta.content,
    meta.encoding || "base64",
  ).toString("utf-8")
}

async function main() {
  // Load existing repos into a map if the output file exists
  const existingReposMap = new Map()
  if (fs.existsSync(OUT_FILE)) {
    try {
      const existingData = JSON.parse(
        fs.readFileSync(OUT_FILE, "utf-8"),
      )
      if (Array.isArray(existingData.repos)) {
        for (const item of existingData.repos) {
          existingReposMap.set(item.name, item)
        }
      }
    } catch (e) {
      console.log(
        "Could not parse existing repos.json, fetching fresh copy.",
      )
    }
  }

  console.log(`Fetching repo list for ${USERNAME}...`)
  const rawRepos = await fetchAllRepos()
  console.log(`Found ${rawRepos.length} repos. Fetching READMEs...`)

  const results = []
  for (const r of rawRepos) {
    // if (r.fork) continue

    const cached = existingReposMap.get(r.name)
    // Check if the pushed_at date matches the stored cached record
    const isUnchanged = cached && cached.pushed_at === r.pushed_at

    process.stdout.write(`  ${r.name}... `)

    let readme = null
    let image = null

    if (isUnchanged) {
      readme = cached.readme
      image = cached.image
      console.log("cached (unchanged)")
    } else {
      try {
        readme = await fetchReadme(r.owner.login, r.name)
      } catch (err) {
        // @ts-ignore
        console.log(`README fetch failed: ${err.message}`)
      }

      if (readme) {
        const localized = await localizeReadmeImages(
          readme,
          r.owner.login,
          r.name,
          r.default_branch,
        )
        readme = localized.readme
        image = localized.images[0] || null
      }
      console.log("done")
    }

    results.push({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      html_url: r.html_url,
      homepage: r.homepage || null,
      language: r.language,
      topics: r.topics || [],
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      archived: r.archived,
      created_at: r.created_at,
      updated_at: r.updated_at,
      pushed_at: r.pushed_at,
      default_branch: r.default_branch,
      image,
      readme,
    })
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        username: USERNAME,
        repos: results,
      },
      null,
      2,
    ),
  )
  console.log(`\nWrote ${results.length} repos to ${OUT_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
