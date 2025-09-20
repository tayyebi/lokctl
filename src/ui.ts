import blessed from 'blessed';
import fs from 'fs';
import path from 'path';
import { fetchLogs, fetchContext, writeLog, LokiLogEntry } from './lokiClient.js';
import { config } from './config.js';

type MenuItem = {
  label: string;
  action?: () => void | Promise<void>;
  submenu?: MenuItem[];
};

export function startUI() {
  const screen = blessed.screen({ smartCSR: true, title: 'lokctl' });

  // header
  const header = blessed.box({
    top: 1,
    left: 0,
    right: 0,
    height: 2,
    tags: true,
    style: { bg: 'black', fg: 'white' }
  });

  // logs and context
  const logsBox = blessed.list({
    top: 3,
    left: 0,
    width: '50%',
    height: '100%-4',
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    label: ' logs ',
    border: 'line',
    style: {
      border: { fg: 'green' },
      selected: { bg: 'green', fg: 'black' }
    }
  });

  const ctxBox = blessed.list({
    top: 3,
    right: 0,
    width: '50%',
    height: '100%-4',
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    label: ' context ',
    border: 'line',
    style: {
      border: { fg: 'cyan' },
      selected: { bg: 'cyan', fg: 'black' }
    }
  });

  // status
  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: { bg: 'blue', fg: 'white' }
  });

  // menu model
  const menus: MenuItem[] = [
    {
      label: 'file',
      submenu: [
        { label: 'refresh', action: loadLogs },
        { label: 'export', action: exportLogs },
        { label: 'quit', action: () => { screen.destroy(); process.exit(0); } }
      ]
    },
    {
      label: 'view',
      submenu: [
        { label: 'context for selected', action: () => loadContextForIndex((logsBox as any).selected || 0) },
        { label: 'detail for selected', action: () => viewDetail((logsBox as any).selected || 0) }
      ]
    },
    {
      label: 'actions',
      submenu: [
        { label: 'write log', action: writeLogFlow }
      ]
    },
    {
      label: 'query',
      submenu: [
        {
          label: 'set query',
          action: async () => {
            const q = await prompt('logql query', currentQuery);
            if (q !== null) {
              currentQuery = q.trim() || currentQuery;
              await loadLogs();
            }
          }
        }
      ]
    },
    {
      label: 'search',
      submenu: [
        {
          label: 'set search term',
          action: async () => {
            const term = await prompt('search term (highlight only)', searchTerm);
            if (term !== null) {
              searchTerm = term.trim();
              renderLogs(currentLogs);
              setStatus(searchTerm ? `highlighting "${searchTerm}"` : 'cleared highlights');
            }
          }
        },
        { label: 'clear highlight', action: () => { searchTerm = ''; renderLogs(currentLogs); setStatus('cleared highlights'); } }
      ]
    },
    {
      label: 'help',
      submenu: [
        {
          label: 'keybindings',
          action: () => {
            messageBox(
              'help',
`{bold}menus:{/bold} tab/shift+tab to move; enter to open; esc to close
{bold}navigation:{/bold} arrows or vi; page up/down
{bold}actions:{/bold} refresh, export, write log, context, detail
{bold}shortcuts:{/bold}
  c: load context for selected
  v: view detail for selected
  r: refresh logs
  /: set search term
  q or ctrl+c: quit`
            );
          }
        }
      ]
    }
  ];

  // listbar requires 'items' and sometimes 'commands' in @types/blessed; we provide both
  const topLabels = menus.map(m => m.label);
  const menuCommands = topLabels.map((label) => ({
    text: label,
    key: label[0], // single-char accelerator
    callback: () => {
      const m = menus.find(x => x.label === label);
      if (m?.submenu) showSubmenu(m.label, m.submenu);
    }
  }));

  const menuBar = blessed.listbar({
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    mouse: true,
    keys: true,
    autoCommandKeys: true,
    style: {
      bg: 'blue',
      item: { bg: 'blue', fg: 'white' },
      selected: { bg: 'cyan', fg: 'black' }
    },
    // both provided to satisfy different typings across versions
    items: menuCommands as any,
    commands: menuCommands as any
  });

  // append
  screen.append(menuBar);
  screen.append(header);
  screen.append(logsBox);
  screen.append(ctxBox);
  screen.append(statusBar);

  // state
  let currentQuery = config.defaultQuery || '{job=~".+"}';
  let currentLogs: LokiLogEntry[] = [];
  let searchTerm = '';

  // utils
  const setStatus = (msg: string) => {
    statusBar.setContent(` ${msg}`);
    screen.render();
  };

  const setHeader = () => {
    header.setContent(
      ` {bold}query:{/bold} ${currentQuery}  {bold}|{/bold}  {bold}server:{/bold} ${config.lokiUrl}`
    );
  };

  const highlight = (text: string, term: string) => {
    if (!term) return text;
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(
      new RegExp(`(${esc})`, 'gi'),
      '{black-bg}{yellow-fg}$1{/yellow-fg}{/black-bg}'
    );
  };

  const colorByLevel = (line: string) => {
    const lc = line.toLowerCase();
    if (lc.includes('error')) return `{red-fg}${line}{/red-fg}`;
    if (lc.includes('warn')) return `{yellow-fg}${line}{/yellow-fg}`;
    if (lc.includes('debug')) return `{gray-fg}${line}{/gray-fg}`;
    return line;
  };

  const renderLogs = (logs: LokiLogEntry[]) => {
    logsBox.clearItems();
    if (!logs.length) {
      logsBox.addItem('{gray-fg}(no logs){/gray-fg}');
    } else {
      for (const l of logs) {
        const t = new Date(l.timestamp).toLocaleTimeString();
        let line = `{bold}${t}{/bold} ${l.line}`;
        line = highlight(line, searchTerm);
        line = colorByLevel(line);
        logsBox.addItem(line);
      }
    }
    logsBox.select(0);
    screen.render();
  };

  const renderContext = (logs: LokiLogEntry[]) => {
    ctxBox.clearItems();
    if (!logs.length) {
      ctxBox.addItem('{gray-fg}(no context){/gray-fg}');
    } else {
      for (const l of logs) {
        const t = new Date(l.timestamp).toLocaleTimeString();
        let line = `{bold}${t}{/bold} ${l.line}`;
        line = highlight(line, searchTerm);
        line = colorByLevel(line);
        ctxBox.addItem(line);
      }
    }
    ctxBox.select(0);
    screen.render();
  };

  const prompt = (label: string, initial = ''): Promise<string | null> => {
    return new Promise(resolve => {
      const form = blessed.form({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '60%',
        height: 5,
        border: 'line',
        label,
        keys: true,
        mouse: true,
        style: { border: { fg: 'cyan' } }
      });
      const tb = blessed.textbox({
        parent: form,
        top: 1,
        left: 1,
        right: 1,
        height: 1,
        inputOnFocus: true,
        value: initial,
        border: 'line',
        style: { border: { fg: 'green' } }
      });
      form.key(['escape'], () => {
        screen.remove(form);
        screen.render();
        resolve(null);
      });
      tb.key(['enter'], () => {
        const v = tb.getValue();
        screen.remove(form);
        screen.render();
        resolve(v);
      });
      tb.focus();
      screen.render();
    });
  };

  const messageBox = (title: string, content: string) => {
    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: '60%',
      border: 'line',
      label: ` ${title} `,
      tags: true,
      keys: true,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      style: { border: { fg: 'cyan' } },
      content
    });
    box.key(['escape', 'q', 'enter', 'space'], () => {
      screen.remove(box);
      screen.render();
    });
    box.focus();
    screen.render();
  };

  // data ops
  async function loadLogs() {
    setHeader();
    setStatus('loading logs…');
    try {
      const logs = await fetchLogs(currentQuery);
      currentLogs = logs;
      renderLogs(currentLogs);
      ctxBox.clearItems();
      ctxBox.addItem('{gray-fg}(select a log to load context){/gray-fg}');
      setStatus(`loaded ${currentLogs.length} log entries`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      renderLogs([]);
      ctxBox.clearItems();
      setStatus(`error: ${msg}`);
    }
  }

  async function loadContextForIndex(idx: number) {
    const selected = currentLogs[idx];
    if (!selected) return;
    setStatus('loading context…');
    try {
      const tsNs = Date.parse(selected.timestamp) * 1_000_000 + '';
      const ctx = await fetchContext(currentQuery, tsNs);
      renderContext(ctx);
      setStatus(`context loaded: ${ctx.length} entries`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      renderContext([]);
      setStatus(`error: ${msg}`);
    }
  }

  function exportLogs() {
    const filePath = path.join(process.cwd(), `lokctl-logs-${Date.now()}.log`);
    const content = currentLogs.map(l => `${l.timestamp} ${l.line}`).join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    setStatus(`logs exported to ${filePath}`);
  }

  async function writeLogFlow() {
    const job = await prompt('job', '');
    if (!job) return;
    const level = await prompt('level (info|warn|error|debug)', '');
    if (!level) return;
    const message = await prompt('message', '');
    if (!message) return;

    setStatus('writing log…');
    try {
      await writeLog(job.trim(), level.trim(), message.trim());
      setStatus('log written, refreshing…');
      await loadLogs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`error: ${msg}`);
    }
  }

  function viewDetail(idx: number) {
    const selected = currentLogs[idx];
    if (!selected) return;
    const body = `{bold}timestamp:{/bold} ${selected.timestamp}\n\n{bold}log:{/bold}\n${selected.line}`;
    messageBox('log detail', body);
  }

  // cascading submenu popups
  function showSubmenu(title: string, items: MenuItem[]) {
    const list = blessed.list({
      parent: screen,
      top: 1,
      left: 0,
      width: 'shrink',
      height: 'shrink',
      label: ` ${title} `,
      tags: true,
      keys: true,
      mouse: true,
      border: 'line',
      style: { border: { fg: 'white' }, selected: { bg: 'blue', fg: 'white' } },
      items: items.map(i => i.label)
    });
    list.focus();
    screen.render();

    const close = () => {
      screen.remove(list);
      screen.render();
    };

    list.on('select', async (_item, index) => {
      const it = items[index];
      if (!it) return close();
      if (it.submenu) {
        close();
        showSubmenu(`${title}/${it.label}`, it.submenu);
      } else if (it.action) {
        close();
        await it.action();
      } else {
        close();
      }
    });

    list.key(['escape', 'q'], close);
  }

  // keys
  screen.key(['escape', 'q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });
  screen.key(['r'], () => { loadLogs(); });
  screen.key(['/'], async () => {
    const term = await prompt('search term (highlight only)', searchTerm);
    if (term !== null) {
      searchTerm = term.trim();
      renderLogs(currentLogs);
      setStatus(searchTerm ? `highlighting "${searchTerm}"` : 'cleared highlights');
    }
  });
  screen.key(['c'], () => loadContextForIndex((logsBox as any).selected || 0));
  screen.key(['v'], () => viewDetail((logsBox as any).selected || 0));

  logsBox.on('select', (_item: any, index: number) => loadContextForIndex(index));
  logsBox.on('click', () => loadContextForIndex((logsBox as any).selected || 0));

  // boot
  setHeader();
  setStatus('ready');
  loadLogs();
  screen.render();
}