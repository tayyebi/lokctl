import axios from 'axios';
import { config } from './config';

export interface LokiLogEntry {
  timestamp: string;
  line: string;
}

export async function fetchLogs(query: string): Promise<LokiLogEntry[]> {
  const res = await axios.get(`${config.lokiUrl}/loki/api/v1/query`, {
    params: { query, limit: config.limit }
  });
  return parseResult(res.data.data.result);
}

export async function fetchContext(query: string, centerTs: string): Promise<LokiLogEntry[]> {
  const start = BigInt(centerTs) - BigInt(config.contextLines) * 1_000_000_000n;
  const end = BigInt(centerTs) + BigInt(config.contextLines) * 1_000_000_000n;

  const res = await axios.get(`${config.lokiUrl}/loki/api/v1/query_range`, {
    params: {
      query,
      start: start.toString(),
      end: end.toString(),
      limit: config.limit
    }
  });
  return parseResult(res.data.data.result);
}

function parseResult(results: any[]): LokiLogEntry[] {
  const logs: LokiLogEntry[] = [];
  results.forEach(stream => {
    stream.values.forEach(([ts, line]: [string, string]) => {
      logs.push({
        timestamp: new Date(parseInt(ts) / 1e6).toISOString(),
        line
      });
    });
  });
  return logs;
}
