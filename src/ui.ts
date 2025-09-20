import blessed from 'blessed';
import contrib from 'blessed-contrib';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fetchLogs, fetchContext, writeLog, LokiLogEntry } from './lokiClient.js';
import { config } from './config.js';

export function startUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Lokctl - Loki Log Viewer'
  });

  // Header
  const header = blessed.box({
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    border: 'line',
    style: {
      fg: 'white',
      bg: 'blue',
      border: {
        fg: 'cyan'
      }
    },
    content: `
${chalk.bold.cyan('🔍 Lokctl')} - Loki Log Viewer
${chalk.gray('Query:')} {job=~".+"} ${chalk.gray('|')} ${chalk.gray('Server:')} ${config.lokiUrl}
${chalk.gray('Press')} ${chalk.white.bold('?')} ${chalk.gray('for help')} ${chalk.gray('|')} ${chalk.gray('Press')} ${chalk.white.bold('w')} ${chalk.gray('to write logs')}`
  });

  // Logs panel (left side)
  const logBox = blessed.list({
    top: 3,
    left: 0,
    width: '50%',
    height: '100%-4',
    border: 'line',
    label: ' Logs ',
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'green'
      },
      selected: {
        fg: 'black',
        bg: 'green'
      },
      item: {
        fg: 'white'
      }
    },
    tags: true
  });

  // Context panel (right side)
  const contextBox = blessed.list({
    top: 3,
    right: 0,
    width: '50%',
    height: '100%-4',
    border: 'line',
    label: ' Context ',
    keys: true,
    vi: true,
    mouse: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'cyan'
      },
      selected: {
        fg: 'black',
        bg: 'cyan'
      },
      item: {
        fg: 'white'
      }
    },
    tags: true
  });

  // Status bar
  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });

  // Help panel (hidden by default)
  const helpPanel = blessed.box({
    top: 'center',
    left: 'center',
    width: '80%',
    height: '70%',
    border: 'line',
    label: ' Help ',
    keys: true,
    mouse: true,
    hidden: true,
    scrollable: true,
    alwaysScroll: true,
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'cyan'
      }
    }
  });

  const helpContent = blessed.text({
    parent: helpPanel,
    top: 1,
    left: 1,
    right: 1,
    content: `
${chalk.bold.cyan('Lokctl - Loki Log Viewer')}

${chalk.bold.yellow('Navigation:')}
  ${chalk.white('j/k')}     - Move up/down
  ${chalk.white('g/G')}     - Go to top/bottom
  ${chalk.white('↑/↓')}     - Move up/down
  ${chalk.white('Page Up/Down')} - Page up/down

${chalk.bold.yellow('Actions:')}
  ${chalk.white('c')}       - Show context for selected log
  ${chalk.white('v')}       - View full log detail
  ${chalk.white('w')}       - Write new log entry
  ${chalk.white('e')}       - Export logs to file
  ${chalk.white('r')}       - Refresh current query
  ${chalk.white('/')}       - Search mode

${chalk.bold.yellow('Search & Filter:')}
  ${chalk.white('/term')}   - Search and highlight terms
  ${chalk.white('Enter')}   - Apply LogQL filter
  ${chalk.white('Esc')}     - Clear search/filter

${chalk.bold.yellow('Mouse:')}
  ${chalk.white('Click')}   - Select log and show context
  ${chalk.white('Double-click')} - View full log detail

${chalk.bold.yellow('General:')}
  ${chalk.white('?')}       - Show/hide this help
  ${chalk.white('q')}       - Quit application
  ${chalk.white('Ctrl+C')}  - Quit application

${chalk.bold.yellow('LogQL Examples:')}
  ${chalk.gray('{job="myapp"}')}                    - Filter by job
  ${chalk.gray('{level="error"}')}                  - Filter by level
  ${chalk.gray('{job="api",level="error"}')}        - Multiple filters
  ${chalk.gray('{job=~".*api.*"}')}                 - Regex matching
  ${chalk.gray('{job="myapp"} |= "error"')}         - Text search
`
  });

  helpPanel.key(['escape', 'q', '?'], () => {
    helpPanel.hide();
    screen.render();
  });

  let currentQuery = config.defaultQuery;
  let currentLogs: LokiLogEntry[] = [];
  let searchTerm = '';
  let searchMode = false;

  // Update status bar
  function updateStatus(message: string) {
    statusBar.setContent(` ${message}`);
    screen.render();
  }

  // Update header with current query
  function updateHeader(query: string) {
    header.setContent(`
${chalk.bold.cyan('🔍 Lokctl')} - Loki Log Viewer
${chalk.gray('Query:')} ${query} ${chalk.gray('|')} ${chalk.gray('Server:')} ${config.lokiUrl}
${chalk.gray('Press')} ${chalk.white.bold('?')} ${chalk.gray('for help')} ${chalk.gray('|')} ${chalk.gray('Press')} ${chalk.white.bold('w')} ${chalk.gray('to write logs')}`);
    screen.render();
  }

  // Global key handlers
  screen.key(['escape', 'q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['?'], () => {
    helpPanel.toggle();
    screen.render();
  });

  screen.key(['/'], () => {
    searchMode = true;
    updateStatus('Search mode: Type search term and press Enter');
  });

  // Navigation keys
  screen.key(['j', 'down'], () => {
    logBox.down(1);
    screen.render();
  });

  screen.key(['k', 'up'], () => {
    logBox.up(1);
    screen.render();
  });

  screen.key(['g'], () => {
    logBox.select(0);
    screen.render();
  });

  screen.key(['G'], () => {
    logBox.select(currentLogs.length - 1);
    screen.render();
  });

  screen.key(['pageup'], () => {
    for (let i = 0; i < 10; i++) {
      logBox.up(1);
    }
    screen.render();
  });

  screen.key(['pagedown'], () => {
    for (let i = 0; i < 10; i++) {
      logBox.down(1);
    }
    screen.render();
  });

  screen.key(['r'], () => {
    updateStatus('Refreshing logs...');
    loadLogs(currentQuery);
  });

  screen.key(['w'], () => {
    showWriteLogForm();
  });

  screen.key(['e'], () => {
    const filePath = path.join(process.cwd(), `lokctl-logs-${Date.now()}.log`);
    const content = currentLogs.map(l => `${l.timestamp} ${l.line}`).join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    updateStatus(`Logs exported to ${filePath}`);
  });

  const loadContext = async (idx: number) => {
    const selected = currentLogs[idx];
    if (!selected) return;
    updateStatus(`Loading context for ${selected.timestamp}...`);
    const contextLogs = await fetchContext(currentQuery, Date.parse(selected.timestamp) * 1_000_000 + '');
    renderContext(contextLogs, searchTerm);
    updateStatus(`Context loaded: ${contextLogs.length} entries`);
  };

  logBox.on('select', (item: any, index: number) => {
    loadContext(index);
  });

  logBox.on('click', () => {
    const idx = (logBox as any).selected || 0;
    loadContext(idx);
  });

  logBox.on('doubleclick', () => {
    const idx = (logBox as any).selected || 0;
    const selected = currentLogs[idx];
    if (!selected) return;
    showLogDetail(selected);
  });

  screen.key(['c'], () => {
    const idx = (logBox as any).selected || 0;
    loadContext(idx);
  });

  screen.key(['v'], () => {
    const idx = (logBox as any).selected || 0;
    const selected = currentLogs[idx];
    if (!selected) return;
    showLogDetail(selected);
  });

  function showLogDetail(log: LokiLogEntry) {
    const logDetail = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '60%',
      border: 'line',
      label: ' Log Detail ',
      keys: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      }
    });

    const content = blessed.text({
      parent: logDetail,
      top: 1,
      left: 1,
      right: 1,
      content: `${chalk.bold.cyan('Timestamp:')} ${log.timestamp}

${chalk.bold.yellow('Log Content:')}
${log.line}

${chalk.gray('Press Escape, q, Enter, or Space to close')}`,
      tags: true
    });

    logDetail.key(['escape', 'q', 'enter', 'space'], () => {
      screen.remove(logDetail);
      screen.render();
    });

    logDetail.focus();
    screen.render();
  }

  async function loadLogs(query: string) {
    try {
      updateStatus('Loading logs...');
      updateHeader(query);
      currentLogs = await fetchLogs(query);
      renderLogs(currentLogs, searchTerm);
      contextBox.clearItems();
      updateStatus(`Loaded ${currentLogs.length} log entries`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateStatus(`Error: ${errorMessage}`);
    }
  }

  function renderLogs(logs: LokiLogEntry[], highlight: string) {
    logBox.clearItems();
    logs.forEach((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      let line = `{bold}${time}{/bold} ${log.line}`;
      
      if (highlight) {
        const regex = new RegExp(`(${highlight})`, 'gi');
        line = line.replace(regex, `{bold}${chalk.bgYellow.black('$1')}{/bold}`);
      }
      
      // Color code by log level
      if (log.line.toLowerCase().includes('error')) {
        line = `{red-fg}${line}{/red-fg}`;
      } else if (log.line.toLowerCase().includes('warn')) {
        line = `{yellow-fg}${line}{/yellow-fg}`;
      } else if (log.line.toLowerCase().includes('debug')) {
        line = `{gray-fg}${line}{/gray-fg}`;
      }
      
      logBox.addItem(line);
    });
    screen.render();
  }

  function renderContext(logs: LokiLogEntry[], highlight: string) {
    contextBox.clearItems();
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      let line = `{bold}${time}{/bold} ${log.line}`;
      
      if (highlight) {
        const regex = new RegExp(`(${highlight})`, 'gi');
        line = line.replace(regex, `{bold}${chalk.bgYellow.black('$1')}{/bold}`);
      }
      
      // Color code by log level
      if (log.line.toLowerCase().includes('error')) {
        line = `{red-fg}${line}{/red-fg}`;
      } else if (log.line.toLowerCase().includes('warn')) {
        line = `{yellow-fg}${line}{/yellow-fg}`;
      } else if (log.line.toLowerCase().includes('debug')) {
        line = `{gray-fg}${line}{/gray-fg}`;
      }
      
      contextBox.addItem(line);
    });
    screen.render();
  }

  function showWriteLogForm() {
    const form = blessed.form({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: '50%',
      border: 'line',
      label: ' Write Log Entry ',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'green'
        }
      }
    });

    const jobLabel = blessed.text({
      parent: form,
      top: 1,
      left: 1,
      content: 'Job:'
    });

    const jobInput = blessed.textbox({
      parent: form,
      top: 2,
      left: 1,
      right: 1,
      height: 1,
      inputOnFocus: true,
      border: 'line',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        },
        focus: {
          border: {
            fg: 'green'
          }
        }
      }
    });

    const levelLabel = blessed.text({
      parent: form,
      top: 4,
      left: 1,
      content: 'Level (info, warn, error, debug):'
    });

    const levelInput = blessed.textbox({
      parent: form,
      top: 5,
      left: 1,
      right: 1,
      height: 1,
      inputOnFocus: true,
      border: 'line',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        },
        focus: {
          border: {
            fg: 'green'
          }
        }
      }
    });

    const messageLabel = blessed.text({
      parent: form,
      top: 7,
      left: 1,
      content: 'Message:'
    });

    const messageInput = blessed.textbox({
      parent: form,
      top: 8,
      left: 1,
      right: 1,
      height: 3,
      inputOnFocus: true,
      border: 'line',
      multiline: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        },
        focus: {
          border: {
            fg: 'green'
          }
        }
      }
    });

    const submitButton = blessed.button({
      parent: form,
      top: 12,
      left: 1,
      width: 12,
      height: 1,
      content: ' Submit ',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'green',
        focus: {
          bg: 'blue'
        }
      }
    });

    const cancelButton = blessed.button({
      parent: form,
      top: 12,
      left: 14,
      width: 12,
      height: 1,
      content: ' Cancel ',
      mouse: true,
      keys: true,
      style: {
        fg: 'white',
        bg: 'red',
        focus: {
          bg: 'blue'
        }
      }
    });

    const statusText = blessed.text({
      parent: form,
      top: 14,
      left: 1,
      right: 1,
      content: '',
      style: {
        fg: 'yellow'
      }
    });

    form.key(['escape'], () => {
      screen.remove(form);
      screen.render();
    });

    cancelButton.on('press', () => {
      screen.remove(form);
      screen.render();
    });

    submitButton.on('press', async () => {
      const job = jobInput.getValue().trim();
      const level = levelInput.getValue().trim();
      const message = messageInput.getValue().trim();

      if (!job || !level || !message) {
        statusText.setContent('All fields are required!');
        screen.render();
        return;
      }

      try {
        await writeLog(job, level, message);
        statusText.setContent('Log written successfully! Refreshing...');
        screen.render();
        
        setTimeout(() => {
          screen.remove(form);
          updateStatus('Refreshing logs...');
          loadLogs(currentQuery);
        }, 1000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        statusText.setContent(`Error: ${errorMessage}`);
        screen.render();
      }
    });

    jobInput.focus();
    screen.render();
  }

  // Handle process signals for clean exit
  process.on('SIGINT', () => {
    screen.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    screen.destroy();
    process.exit(0);
  });

  // Initialize the application
  updateStatus('Ready - Press ? for help');
  loadLogs(currentQuery);
}