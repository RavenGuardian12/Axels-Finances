import { AppData, CloudSyncConfig } from '../types';

interface CloudSyncRecord {
  sync_key: string;
  payload?: AppData;
  updated_at?: string;
}

export interface CloudStateMeta {
  updatedAt: string | null;
}

export interface CloudState extends CloudStateMeta {
  data: AppData | null;
}

interface NormalizedCloudConfig {
  url: string;
  anonKey: string;
  syncKey: string;
}

function normalizeCloudConfig(config: CloudSyncConfig): NormalizedCloudConfig {
  return {
    url: config.url.trim(),
    anonKey: config.anonKey.trim(),
    syncKey: config.syncKey.trim(),
  };
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function buildHeaders(config: NormalizedCloudConfig): HeadersInit {
  return {
    'Content-Type': 'application/json',
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
  };
}

async function fetchCloudRows(
  config: NormalizedCloudConfig,
  endpoint: string,
): Promise<CloudSyncRecord[]> {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      ...buildHeaders(config),
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Cloud load failed (${response.status}).`);
  }

  const rows = (await response.json()) as CloudSyncRecord[] | null;
  return Array.isArray(rows) ? rows : [];
}

function normalizeUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function findMatchingRow(rows: CloudSyncRecord[], syncKey: string): CloudSyncRecord | null {
  if (!rows.length) {
    return null;
  }

  const normalizedKey = syncKey.trim().toLowerCase();
  const exact = rows.find(
    (row) => typeof row.sync_key === 'string' && row.sync_key.trim().toLowerCase() === normalizedKey,
  );
  return exact ?? null;
}

export function validateCloudSyncConfig(config: CloudSyncConfig): string | null {
  const normalized = normalizeCloudConfig(config);
  if (!normalized.url) {
    return 'Cloud URL is required.';
  }
  if (!normalized.anonKey) {
    return 'Cloud anon key is required.';
  }
  if (!normalized.syncKey) {
    return 'Sync key is required.';
  }
  if (!normalized.url.startsWith('https://')) {
    return 'Cloud URL must start with https://';
  }
  return null;
}

export async function pushAppDataToCloud(config: CloudSyncConfig, data: AppData): Promise<void> {
  await pushAppDataToCloudWithMeta(config, data);
}

export async function pushAppDataToCloudWithMeta(
  config: CloudSyncConfig,
  data: AppData,
): Promise<CloudStateMeta> {
  const normalized = normalizeCloudConfig(config);
  const baseUrl = normalizeBaseUrl(normalized.url);
  const endpoint = `${baseUrl}/rest/v1/app_states?on_conflict=sync_key`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...buildHeaders(normalized),
      Prefer: 'resolution=merge-duplicates,return=representation',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
    body: JSON.stringify({
      sync_key: normalized.syncKey,
      payload: data,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Cloud save failed (${response.status}).`);
  }

  const parsed = (await response.json()) as CloudSyncRecord | CloudSyncRecord[] | null;
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  if (!rows.length) {
    throw new Error('Cloud save failed: no row returned from upsert.');
  }

  return {
    updatedAt: normalizeUpdatedAt(rows[0].updated_at),
  };
}

export async function getCloudStateMeta(config: CloudSyncConfig): Promise<CloudStateMeta> {
  const normalized = normalizeCloudConfig(config);
  const baseUrl = normalizeBaseUrl(normalized.url);
  const exactEndpoint =
    `${baseUrl}/rest/v1/app_states` +
    `?select=updated_at,sync_key&sync_key=eq.${encodeURIComponent(normalized.syncKey)}&order=updated_at.desc&limit=1`;
  const exactRows = await fetchCloudRows(normalized, exactEndpoint);
  const exactMatch = findMatchingRow(exactRows, normalized.syncKey);
  if (exactMatch) {
    return { updatedAt: normalizeUpdatedAt(exactMatch.updated_at) };
  }

  const fallbackEndpoint =
    `${baseUrl}/rest/v1/app_states` +
    '?select=updated_at,sync_key&order=updated_at.desc&limit=200';
  const fallbackRows = await fetchCloudRows(normalized, fallbackEndpoint);
  const fallbackMatch = findMatchingRow(fallbackRows, normalized.syncKey);
  return { updatedAt: fallbackMatch ? normalizeUpdatedAt(fallbackMatch.updated_at) : null };
}

export async function pullCloudStateFromCloud(config: CloudSyncConfig): Promise<CloudState> {
  const normalized = normalizeCloudConfig(config);
  const baseUrl = normalizeBaseUrl(normalized.url);
  const exactEndpoint =
    `${baseUrl}/rest/v1/app_states` +
    `?select=payload,updated_at,sync_key&sync_key=eq.${encodeURIComponent(normalized.syncKey)}&order=updated_at.desc&limit=1`;
  const exactRows = await fetchCloudRows(normalized, exactEndpoint);
  const exactMatch = findMatchingRow(exactRows, normalized.syncKey);
  if (exactMatch?.payload) {
    return {
      data: exactMatch.payload,
      updatedAt: normalizeUpdatedAt(exactMatch.updated_at),
    };
  }

  const fallbackEndpoint =
    `${baseUrl}/rest/v1/app_states` +
    '?select=payload,updated_at,sync_key&order=updated_at.desc&limit=200';
  const fallbackRows = await fetchCloudRows(normalized, fallbackEndpoint);
  const fallbackMatch = findMatchingRow(fallbackRows, normalized.syncKey);

  if (!fallbackMatch?.payload) {
    return {
      data: null,
      updatedAt: null,
    };
  }

  return {
    data: fallbackMatch.payload,
    updatedAt: normalizeUpdatedAt(fallbackMatch.updated_at),
  };
}

export async function pullAppDataFromCloud(config: CloudSyncConfig): Promise<AppData | null> {
  const cloudState = await pullCloudStateFromCloud(config);
  return cloudState.data;
}
