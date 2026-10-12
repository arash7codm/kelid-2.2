import Dexie, { Table } from 'dexie';
import { Property, Applicant, Collaborator, ReminderTask } from '../types';

export interface StoredBlob {
  hash: string;
  mimeType: string;
  data: string; // Base64
  size: number;
  createdAt: string;
}

export interface StoredHistory {
  id: string;
  recordId: string;
  recordType: 'property' | 'applicant' | 'collaborator' | 'reminder';
  version: number;
  dataSnapshot: string;
  diffSummary?: string;
  author: string;
  timestamp: string;
}

export interface StoredSetting {
  key: string;
  value: any;
}

export class KelidDatabase extends Dexie {
  properties!: Table<Property, string>;
  applicants!: Table<Applicant, string>;
  collaborators!: Table<Collaborator, string>;
  reminders!: Table<ReminderTask, string>;
  blobs!: Table<StoredBlob, string>;
  history!: Table<StoredHistory, string>;
  settings!: Table<StoredSetting, string>;

  constructor() {
    super('KelidDB');
    this.version(1).stores({
      properties: 'id, code, status, city, propertyType, createdAt, updatedAt, deleted',
      applicants: 'id, code, followUpStatus, creditLevel, priority, createdAt, updatedAt, deleted',
      collaborators: 'id, code, cooperationStatus, performanceLevel, primaryCity, createdAt, updatedAt, deleted',
      reminders: 'id, category, priority, status, dueDateTimeIso, createdAt, updatedAt',
      blobs: 'hash, mimeType, createdAt',
      history: 'id, recordId, recordType, version, timestamp',
      settings: 'key'
    });
  }
}

export const db = new KelidDatabase();

// Counter utilities for generating F-001, C-001, H-001
export async function getNextPropertyCode(): Promise<string> {
  const existing = await db.properties.toArray();
  const validCodes = existing
    .map(p => {
      const match = p.code.match(/^F-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  const max = validCodes.length > 0 ? Math.max(...validCodes) : 0;
  const nextNum = max + 1;
  return `F-${String(nextNum).padStart(3, '0')}`;
}

export async function getNextApplicantCode(): Promise<string> {
  const existing = await db.applicants.toArray();
  const validCodes = existing
    .map(a => {
      const match = a.code.match(/^C-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  const max = validCodes.length > 0 ? Math.max(...validCodes) : 0;
  const nextNum = max + 1;
  return `C-${String(nextNum).padStart(3, '0')}`;
}

export async function getNextCollaboratorCode(): Promise<string> {
  const existing = await db.collaborators.toArray();
  const validCodes = existing
    .map(c => {
      const match = c.code.match(/^H-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  const max = validCodes.length > 0 ? Math.max(...validCodes) : 0;
  const nextNum = max + 1;
  return `H-${String(nextNum).padStart(3, '0')}`;
}

// Settings helper
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const item = await db.settings.get(key);
    return item ? (item.value as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch (err) {
    console.error('Error saving setting', err);
  }
}

// In-memory cache of IndexedDB blobs so UI components can synchronously resolve blob references
const blobMemoryCache = new Map<string, string>();

/**
 * Stores a data URL or base64 payload in IndexedDB `db.blobs` and returns its reference ID.
 * Large binary data is kept out of localStorage and out of the main record JSON.
 */
export async function saveBlob(dataUrl: string, mimeType = 'application/octet-stream'): Promise<string> {
  if (!dataUrl) return '';
  if (dataUrl.startsWith('blob_')) return dataUrl;

  let actualMime = mimeType;
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  if (match) {
    actualMime = match[1];
  }

  const hash = `blob_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const size = Math.round((dataUrl.length * 3) / 4);

  await db.blobs.put({
    hash,
    mimeType: actualMime,
    data: dataUrl,
    size,
    createdAt: new Date().toISOString(),
  });

  blobMemoryCache.set(hash, dataUrl);
  return hash;
}

/**
 * Loads a blob's data URL from IndexedDB `db.blobs` by reference ID (or returns the URL directly if already a data/http URL).
 */
export async function getBlobDataUrl(refOrUrl?: string): Promise<string> {
  if (!refOrUrl) return '';
  if (blobMemoryCache.has(refOrUrl)) {
    return blobMemoryCache.get(refOrUrl)!;
  }
  if (refOrUrl.startsWith('data:') || refOrUrl.startsWith('http://') || refOrUrl.startsWith('https://') || refOrUrl.startsWith('blob:')) {
    return refOrUrl;
  }
  try {
    const stored = await db.blobs.get(refOrUrl);
    if (stored && stored.data) {
      const fullDataUrl = stored.data.startsWith('data:')
        ? stored.data
        : `data:${stored.mimeType || 'application/octet-stream'};base64,${stored.data}`;
      blobMemoryCache.set(refOrUrl, fullDataUrl);
      return fullDataUrl;
    }
  } catch (err) {
    console.error('Error reading blob from IndexedDB:', err);
  }
  return '';
}

/**
 * Synchronously resolves a blob reference from the in-memory cache, or returns direct URLs as-is.
 */
export function resolveBlobUrl(refOrUrl?: string): string {
  if (!refOrUrl) return '';
  if (blobMemoryCache.has(refOrUrl)) {
    return blobMemoryCache.get(refOrUrl)!;
  }
  if (refOrUrl.startsWith('data:') || refOrUrl.startsWith('http://') || refOrUrl.startsWith('https://') || refOrUrl.startsWith('blob:')) {
    return refOrUrl;
  }
  return '';
}

/**
 * Preloads all blobs stored in IndexedDB into the fast in-memory lookup map.
 */
export async function preloadAllBlobs(): Promise<void> {
  try {
    const allBlobs = await db.blobs.toArray();
    for (const b of allBlobs) {
      if (b.hash && b.data) {
        const fullDataUrl = b.data.startsWith('data:')
          ? b.data
          : `data:${b.mimeType || 'application/octet-stream'};base64,${b.data}`;
        blobMemoryCache.set(b.hash, fullDataUrl);
      }
    }
  } catch (err) {
    console.error('Error preloading blobs:', err);
  }
}

