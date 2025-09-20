import dotenv from 'dotenv';
dotenv.config();

export const config = {
  lokiUrl: process.env.LOKI_URL || 'http://localhost:3100',
  defaultQuery: process.env.LOKI_QUERY || '{job="varlogs"}',
  limit: Number(process.env.LOKI_LIMIT) || 200,
  contextLines: Number(process.env.LOKI_CONTEXT) || 5,
  defaultRangeMinutes: Number(process.env.LOKI_RANGE_MINUTES) || 10
};
