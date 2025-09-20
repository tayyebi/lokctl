import blessed from 'blessed';
import contrib from 'blessed-contrib';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fetchLogs, fetchContext, LokiLogEntry } from './lokiClient';
import { config } from './config';

export function startUI() {
  const screen = blessed.screen();
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });

  const logBox = grid.set(0, 0, 10, 6, contrib.log, {
    label: 'Loki Logs',
    fg: 'green',
    selectedFg: 'white',
    tags: true,
    mouse: true,
    keys: true,
    vi: true
  });

  const contextBox = grid.set(0, 6, 10, 6, contrib.log, {
    label: 'Context View',
    fg: 'cyan',
    selectedFg: 'white',
    tags: true,
    mouse: true,
    keys: true,
    vi: true
  });

  const input = grid.set(10, 0, 2, 12, blessed.textbox, {
    label: 'Search / Filter (/term for highlight)',
    inputOnFocus: true,
    border: 'line',
    mouse: true
  });

  let currentQuery = config.defaultQuery;
  let currentLogs: LokiLogEntry[] = [];
  let searchTerm = '';

  screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

  screen.key(['e'], () => {
    const filePath = path.join(process.cwd(), `lokctl-logs-${Date.now()}.log`);
    const content = currentLogs.map(l => `${l.timestamp} ${l.line}`).join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    logBox.log(chalk.blue(`Logs exported to ${filePath}`));
    screen.render();
  });

  const loadContext = async (idx: number) => {
    const selected = currentLogs[idx];
    if (!selected) return;
    contextBox.setLabel(`Context: ${selected.timestamp}`);
    const contextLogs = await fetchContext(currentQuery, Date.parse(selected.timestamp) * 1_000_000 + '');
    renderContext(contextLogs, searchTerm);
  };

  logBox.on('click', () => {
    const idx = logBox.getScroll();
    loadContext(idx);
  });

  screen.key(['c'], () => {
    const idx = logBox.getScroll();
    loadContext(idx);
  });

  input.on('submit', (value: string) => {
    if (value.startsWith('/')) {
      searchTerm = value.slice(1);
      renderLogs(currentLogs, searchTerm);
    } else {
      currentQuery = value.trim() || config.defaultQuery;
      loadLogs(currentQuery);
    }
    input.clearValue();
    screen.render();
    input.focus();
  });

  async function loadLogs(query: string) {
    logBox.setLabel(`Loki Logs: ${query}`);
    currentLogs = await fetchLogs(query);
    renderLogs(currentLogs, searchTerm);
    contextBox.setContent('');
    contextBox.setLabel('Context View');
    screen.render();
  }

  function renderLogs(logs: LokiLogEntry[], highlight: string) {
    logBox.setContent('');
    logs.forEach(log => {
      let line = `${log.timestamp} ${log.line}`;
      if (highlight) {
        const regex = new RegExp(`(${highlight})`, 'gi');
        line = line.replace(regex, chalk.bgYellow.black('$1'));
      }
      logBox.log(line);
    });
    screen.render();
  }

  function renderContext(logs: LokiLogEntry[], highlight: string) {
    contextBox.setContent('');
    logs.forEach(log => {
      let line = `${log.timestamp} ${log.line}`;
      if (highlight) {
        const regex = new RegExp(`(${highlight})`, 'gi');
        line = line.replace(regex, chalk.bgYellow.black('$1'));
      }
      contextBox.log(line);
    });
    screen.render();
  }

  input.focus();
  loadLogs(currentQuery);
}
