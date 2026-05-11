- **Fix /about/ and /docs/ redirecting to the IDE**. The previous
  multi-page build emitted flat `about.html` and `docs.html` files
  while every link in the codebase used `./about/` and `./docs/`
  with trailing slashes. GitHub Pages doesn't rewrite
  trailing-slash URLs to `.html`, and the PWA service worker's
  navigation fallback then sent the request to the IDE's
  `index.html` — so opening "Docs" from the footer landed the user
  back on the editor. Move the source HTML into
  `about/index.html` and `docs/index.html` so the build emits
  proper directory indexes that match the link shape.
