# repo log

A static, searchable/filterable/sortable/groupable index of your GitHub repos,
built for GitHub Pages. No backend, no client-side API calls, no rate limits
for visitors — everything is pre-fetched into `data/repos.json` by a script
you run yourself.

## 1. Generate the data

Requires Node 18+ (for built-in `fetch`).

```bash
cd scripts
GITHUB_USERNAME=your-username node fetch-repos.js
```

Optional but recommended — add a token to avoid the 60/hour unauthenticated
rate limit (5000/hour with a token). A classic token with **no scopes checked**
is enough for public repo data: create one at
https://github.com/settings/tokens

```bash
GITHUB_USERNAME=your-username GITHUB_TOKEN=ghp_xxxxx node scripts/fetch-repos.js
```

This writes `data/repos.json`, containing for every non-fork repo: name,
description, language, topics, stars, forks, dates, and the README markdown.

Every image the README references (`![](./path.png)`, `<img src="...">`,
relative or absolute) is downloaded to `data/images/<owner>-<repo>/`, and the
README text is rewritten so those references point at the local copy instead
of GitHub. Two images with the same filename in different folders of the
same repo can't collide — the local filename is the full relative path with
slashes flattened (`gh_images/foo.png` → `gh_images_foo.png`); different
repos get their own subfolder regardless. The first saved image is used as
the card's cover image. Re-run this script whenever you want to refresh the
list — there's no automation wired up, by design. `data/images/` needs to be
committed along with `data/repos.json` for the images to show up on Pages.

## 2. Preview locally

Because the page `fetch()`s `data/repos.json`, you need to serve it over
HTTP (opening `index.html` directly via `file://` will fail due to CORS).

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

## 3. Deploy to GitHub Pages

Commit `index.html`, `style.css`, `app.js`, and `data/repos.json` to a repo,
then in that repo's Settings → Pages, set the source to the branch/folder
containing these files (e.g. `main` / `/root`, or push them to a `gh-pages`
branch). The `scripts/` folder doesn't need to be deployed — it's only used
locally to generate the data.

## What you get

- **Search** — matches name, description, and topics.
- **Filter** — by language and by topic (chips in the sidebar), plus a
  hide-archived toggle.
- **Sort** — recently pushed, newest, oldest, most stars, name.
- **Group** — by language, primary topic, or creation year.
- **Detail view** — click a card to open a modal with the full rendered
  README (via `marked`) and links to GitHub / homepage.

## Notes / limitations

- Forks are skipped by default (see the `if (r.fork) continue` line in
  `scripts/fetch-repos.js` — delete it if you want them included).
- The "first image in README" heuristic looks for the first Markdown
  `![]()` or HTML `<img src="">` in the README text, in document order, and
  resolves relative paths against `raw.githubusercontent.com` on the repo's
  default branch. If a README has no image, the card shows a plain
  language-labeled placeholder instead — nothing is faked.
- Private repos aren't included; the script hits the public
  `/users/{username}/repos` endpoint. If you want private repos too, switch
  it to the authenticated `/user/repos` endpoint (requires a token with
  `repo` scope) — ask if you'd like that version.
