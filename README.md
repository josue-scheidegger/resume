# Resumé

My personal resumé, available here: https://josue-scheidegger.github.io/resume/

Forked from [yves-chevallier/resume](https://github.com/yves-chevallier/resume).

## Layout

```
data/   what you edit: the résumé data and the photo
pdf/    the PDF engine (page layout, word clouds, icons)
site/   the VuePress site
out/    everything generated (ignored by git): resume.pdf, resume.png, site/
```

| File | Content |
|---|---|
| [`data/resume.yaml`](data/resume.yaml) | Identity, address, work, education, mindset, flaws (also shown on the site's YAML page) |
| [`data/pdf.yaml`](data/pdf.yaml) | PDF-only data: headline, sports, future, QR code, social links, overrides |
| [`data/skills.yaml`](data/skills.yaml) | Skills cloud: groups, mastery level (1–10) of each skill, group placement |
| [`data/hobbies.yaml`](data/hobbies.yaml) | Hobbies cloud, same format |
| [`data/photo.jpg`](data/photo.jpg) | Photo of the sidebar (square) |

## PDF

```sh
npx playwright install chromium   # once
npm run pdf                       # → out/resume.pdf + out/resume.png
```

The page is laid out in HTML/CSS ([`pdf/page.css`](pdf/page.css),
[`pdf/render.js`](pdf/render.js)) and printed by headless Chromium, so the PDF
keeps real, selectable text in Open Sans.

The word clouds ([`pdf/cloud.js`](pdf/cloud.js)) keep each group of skills in
its own area of the panel (a treemap sized by the words of the group), size
every word by its mastery level, and place the words along a spiral with
pixel-exact collision tests, so they never overlap. The whole cloud is then
scaled to the largest size that still fits. `npm run pdf:debug` draws the group
areas in red (`out/debug.pdf`).

## Site

```sh
npm run site:dev     # http://localhost:4000/resume/ (run `npm run pdf` first)
npm run build        # PDF + site → out/site/
```

The PDF and its preview are not committed: the site copies them from `out/`
(see [`site/.vuepress/config.js`](site/.vuepress/config.js)).

The [`Deploy CV`](.github/workflows/deploy.yml) workflow builds the PDF and the
site and deploys them to GitHub Pages when a `v*` tag is pushed (repository
settings → Pages → Source: GitHub Actions). The site is served from the
project path `/resume/`, so `base` is set to `/resume/` in the VuePress config.
