# Third-party notices

Dependencies are installed through npm and pinned in `package-lock.json`. Preserve their package LICENSE/NOTICE files when redistributing dependencies or a bundle. The local dependency inventory is generated in `docs/dependency-licenses.json`.

Direct packages include React, React DOM, React Router, TanStack Query, Zustand, Framer Motion, Radix Slot, class-variance-authority, clsx, tailwind-merge, Express, Zod, diff, ignore, Tailwind CSS, Monaco, web-tree-sitter and tree-sitter-wasms. Lucide icons retain their ISC license. Monaco's VS Code-derived notices, DOMPurify's dual Apache-2.0/MPL-2.0 notices and Tree-sitter grammar licenses must be retained where applicable.

Tree-sitter JavaScript, TypeScript, Python and Java grammar WASM files come from tree-sitter-wasms. See their upstream grammar repositories for individual copyright and MIT notices. The npm package contains additional grammars; only the four supported language families are loaded by this application.

Git and Ollama are separate user-installed programs, not bundled into this distribution. The application does not redistribute AI model weights. Each model's license must be reviewed independently.
