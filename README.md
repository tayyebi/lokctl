# lokctl

**Fast, familiar Loki TUI — split-view logs, context, search, and export.**

Inspired by tools like `kubectl`, `htop`, and `jq`, `lokctl` gives you a powerful terminal interface to explore Loki logs without Grafana.

---

## ✨ Features

- 🔍 Search logs with `/term` highlighting
- 🧵 Filter by label: `{app="myapp"}`
- 🖱 Mouse click or `c` to view context logs
- 💾 Press `e` to export logs to file
- 🖥 Split view: main logs + context side-by-side
- ⚙️ Configurable via environment variables

---

## 📦 Install

```bash
git clone https://github.com/tayyebi/lokctl
cd lokctl
npm install
npm run build
npx lokctl
```