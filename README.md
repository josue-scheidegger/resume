# Resumé

My personal resumé, available here: https://cv.chevallier.io/

## Hosting

The site is built with VuePress and deployed to GitHub Pages by the
[`Deploy CV`](.github/workflows/deploy.yml) workflow when a `v*` tag is pushed.

It is served on the custom domain **cv.chevallier.io** via a CNAME record
pointing at GitHub Pages:

```dns
cv  600  IN  CNAME  yves-chevallier.github.io.
```

The domain is pinned in [`docs/.vuepress/public/CNAME`](docs/.vuepress/public/CNAME)
so GitHub Pages keeps it across deployments, and `base` is set to `/` in the
VuePress config accordingly.

## PDF

The PDF résumé and its preview image are generated from the data:

```sh
npx playwright install chromium   # once
npm run cv:build                  # → docs/.vuepress/public/resume.pdf + images/resume.png
```

| File | Content |
|---|---|
| [`docs/.vuepress/public/resume.yaml`](docs/.vuepress/public/resume.yaml) | Identity, address, work, education, mindset (also published as `/resume.yaml`) |
| [`cv/cv.yaml`](cv/cv.yaml) | PDF-only data: headline, sports, future, QR code, social links, overrides |
| [`cv/skills.yaml`](cv/skills.yaml) | Skills cloud: groups, mastery level (1–10) of each skill, group placement |
| [`cv/hobbies.yaml`](cv/hobbies.yaml) | Hobbies cloud, same format |

The page is laid out in HTML/CSS ([`cv/page.css`](cv/page.css),
[`cv/render.js`](cv/render.js)) and printed by headless Chromium, so the PDF
keeps real, selectable text in Open Sans.

The word clouds ([`cv/cloud.js`](cv/cloud.js)) keep each group of skills in
its own area of the panel (a treemap sized by the words of the group), size
every word by its mastery level, and place the words along a spiral with
pixel-exact collision tests, so they never overlap. The whole cloud is then
scaled to the largest size that still fits. `npm run cv:debug` draws the group
areas in red (`cv/debug.pdf`).

The previous Illustrator version is kept in
[`cv/legacy/resume-illustrator.pdf`](cv/legacy/resume-illustrator.pdf).
