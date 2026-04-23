# AgentFlow Landing Page

A standalone marketing page for AgentFlow.

## Contents

- `index.html` — fully self-contained HTML (≈744 KB). All CSS, fonts and JS inlined via the design-tool bundler. Works offline, no external resources other than Google Fonts.

## Running locally

```sh
# From repo root
cd landing
python3 -m http.server 8000
# or: npx serve .
```

Then open <http://localhost:8000>.

## Deploying

Serve `index.html` from any static host (Cloudflare Pages, Netlify, Vercel static, S3). No build step required.

## Source

Exported from Claude Design (`soma-design` project, April 2026). Original source files (JSX prototype) live in the design handoff bundle at `/tmp/soma-dashboard-design/handoff/soma-design/project/landing/` on the VPS. For a React rewrite, port from there.

## Rewrite plan

The standalone HTML is a prototype-grade artifact. A proper production landing page should:

1. Extract the combined variant (`components/index.jsx` in the source) as React components
2. Share tokens with the dashboard (`packages/dashboard/src/client/styles/tokens.css`)
3. Live in its own workspace (e.g. `packages/landing/`) with Vite SSG or Next.js

That's a follow-up. Today's ship is the designer-authored HTML as-is.
