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

### Prerequisites

Before using lokctl, you need a running Loki instance. Here are two ways to set it up:

#### Option 1: Local Loki Installation (Recommended)

1. **Download Loki Binary**:
   ```bash
   # Download the latest Loki release
   wget https://github.com/grafana/loki/releases/download/v3.5.1/loki-linux-amd64.zip
   unzip loki-linux-amd64.zip
   chmod +x loki-linux-amd64
   mv loki-linux-amd64 loki
   ```

2. **Create Loki Configuration**:
   ```bash
   # Download the default configuration
   wget https://raw.githubusercontent.com/grafana/loki/v3.5.1/cmd/loki/loki-local-config.yaml -O loki-config.yaml
   ```

3. **Start Loki**:
   ```bash
   ./loki --config.file=loki-config.yaml
   ```
   Loki will be available at `http://localhost:3100`

4. **Add Test Data** (Optional):
   ```bash
   # Send a test log entry
   curl -X POST -H "Content-Type: application/json" \
     -d '{"streams": [{"stream": {"job": "test", "level": "info"}, "values": [["'$(date +%s%N)'", "Test log message"]]}]}' \
     http://localhost:3100/loki/api/v1/push
   ```

#### Option 2: Docker (Alternative)

```bash
# Run Loki with Docker (requires Docker to be installed)
docker run -d --name loki -p 3100:3100 grafana/loki:latest
```

**Note**: The binary installation method above is recommended as it doesn't require Docker and works on any Linux system.

### Install lokctl

```bash
git clone https://github.com/tayyebi/lokctl
cd lokctl
npm install
npm run build
npm link
npx lokctl
```

## ⚙️ Configuration

You can configure lokctl using environment variables or by creating a `.env` file:

```bash
# Loki server URL
LOKI_URL=http://localhost:3100

# Default query (LogQL syntax)
LOKI_QUERY={job=~".+"}

# Number of log entries to fetch
LOKI_LIMIT=200

# Context lines around selected log
LOKI_CONTEXT=5

# Time range in minutes for queries
LOKI_RANGE_MINUTES=10
```

## 🚀 Usage

1. **Start lokctl**: `npx lokctl` or `npm start`
2. **Search logs**: Use `/term` to search and highlight terms
3. **Filter by labels**: Use LogQL syntax like `{app="myapp",level="error"}`
4. **View context**: Click on a log or press `c` to see surrounding logs
5. **Write logs**: Press `w` to write new log entries to Loki
6. **Export logs**: Press `e` to export current view to a file
7. **Navigate**: Use vim-like keys (`j`/`k` for up/down, `g`/`G` for top/bottom)
8. **Refresh**: Press `r` to reload current query
9. **Quit**: Press `q` or `Ctrl+C` to exit

### Keyboard Shortcuts

- `j` / `k` - Navigate up/down
- `g` / `G` - Jump to top/bottom
- `c` - Show context for selected log
- `v` - View full log detail in popup
- `w` - Write new log entry to Loki
- `e` - Export logs to file
- `r` - Refresh current query
- `/term` - Search and highlight terms
- `q` / `Ctrl+C` - Quit application

### Mouse Actions

- **Single click** - Show context for selected log
- **Double click** - View full log detail in popup

### Writing Logs

Press `w` to open the log writing form where you can:

- **Job**: Specify the job/service name (e.g., "myapp", "api-server")
- **Level**: Set the log level (info, warn, error, debug)
- **Message**: Enter the log message content

The form includes:
- **Submit** - Send the log to Loki server
- **Cancel** - Close the form without writing
- **Escape** - Close the form without writing

After successful submission, the log list will automatically refresh to show your new entry.

## 🔧 Troubleshooting

### Common Issues

**Connection Refused Error**:
- Make sure Loki is running: `curl http://localhost:3100/ready`
- Check if Loki is listening on the correct port: `netstat -tlnp | grep 3100`

**No Logs Found**:
- Verify your query syntax using LogQL
- Check if logs exist: `curl "http://localhost:3100/loki/api/v1/query_range?query={job=~\".+\"}&start=$(date -d '1 hour ago' +%s)000000000&end=$(date +%s)000000000"`
- Add test data if needed (see installation steps above)

**Module Errors**:
- Make sure to run `npm run build` after any changes
- Check that all dependencies are installed: `npm install`

### Getting Help

- Check Loki logs for server-side issues
- Use `curl` to test API endpoints directly
- Verify your LogQL queries in the Loki web interface (if available)