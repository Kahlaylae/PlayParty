# PlayParty CMS — Claude Context

PlayParty is a browser-based indie games portal by KxHStudios. No build step — all files are raw HTML/CSS/JS deployed as static files.

## CMS files (touch these for content updates)

| File | What it controls |
|---|---|
| `index.html` | Homepage game cards, SEO meta, structured data (ld+json), SEO ghost section |
| `assets/design.css` | Shared design system for all pages |
| `assets/games.json` | Game catalog data (id, title, thumbnail, descriptions, path, status) |
| `sitemap.xml` | SEO sitemap — one `<url>` block per page |
| `manifest.json` | PWA manifest — `shortcuts` array lists launchable games |

## Game page directories

Each game lives in its own folder: `emojihunter/`, `batzyboy/`. Other sections: `arcade/`, `mobile/`, `houseparty/`. Each has its own `index.html`.

## Homepage card structure

```html
<article class="game-card" itemscope itemtype="https://schema.org/VideoGame">
    <a href="gamename/index.html" itemprop="url">
        <img src="..." class="game-thumbnail" itemprop="image">
        <h3 itemprop="name">Game Title</h3>
        <p itemprop="description" class="seo-only">Description for crawlers only.</p>
        <meta itemprop="genre" content="...">
        <meta itemprop="gamePlatform" content="Web Browser">
        <span class="play-badge">▶ Play Now</span>
    </a>
</article>
```

Cards fade up on scroll via IntersectionObserver — the script at the bottom of `<body>` adds `.in-view` to each `.game-card` when it enters the viewport.

## Adding a new game (checklist)

1. `index.html` — add `<article class="game-card">` in `#games-grid`
2. `index.html` — add `<script type="application/ld+json">` VideoGame block in `<head>`
3. `index.html` — add game name to `<meta name="keywords">`
4. `index.html` — add SEO description block in `<section class="seo-only" id="seo-content">`
5. `assets/games.json` — add entry to `"games"` array
6. `sitemap.xml` — add `<url>` block
7. `manifest.json` — add entry to `"shortcuts"` array
8. Update cross-links in other game pages (e.g. `batzyboy/index.html` "Also try" section)

## Removing a game (checklist)

Same 8 files in reverse — search for the game id/name across all of them.

## Design system notes

- Dark theme only; CSS variables defined in `:root` in `design.css`
- `main` is `position: fixed; overflow: hidden` — page scrolling happens inside `.landing-container`
- Card thumbnails are `aspect-ratio: 1/1`, edge-to-edge (no card padding), title + badge below
- Mobile grid: 2 columns. Desktop: `auto-fill, minmax(200px, 1fr)`
- `.seo-only` — visually hidden but crawlable (defined inline in `index.html <style>`)

## Current live games

| Game | Folder | Status |
|---|---|---|
| Emoji Hunter | `emojihunter/` | live |
| Batzy Boy | `batzyboy/` | live |
