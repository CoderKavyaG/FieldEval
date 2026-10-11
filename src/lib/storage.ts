import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Observation, ModelResult } from './schema';

const DB_NAME = 'fieldeval_db';
const DB_VERSION = 1;
const ACTIVE_SESSION_STORAGE_KEY = 'fieldeval_active_session_id';

export interface FieldSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  currentSceneIndex: number;
}

export interface PhotoBlobRecord {
  key: string;
  mimeType: string;
  data: Blob;
  hash: string;
  createdAt: string;
}

interface FieldEvalDB extends DBSchema {
  sessions: {
    key: string;
    value: FieldSession;
  };
  observations: {
    key: string;
    value: Observation;
    indexes: {
      by_session: string;
      by_task: string;
      by_hash: string;
    };
  };
  blobs: {
    key: string;
    value: PhotoBlobRecord;
    indexes: {
      by_hash: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<FieldEvalDB>> | null = null;
let persistRequested = false;

/**
 * Requests browser storage persistence once to protect field observations from eviction.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  if (typeof window !== 'undefined' && 'storage' in navigator && 'persist' in navigator.storage) {
    if (!persistRequested) {
      persistRequested = true;
      try {
        const isPersisted = await navigator.storage.persist();
        return isPersisted;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * Initializes and returns the shared IndexedDB connection.
 */
export async function getDb(): Promise<IDBPDatabase<FieldEvalDB>> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only accessible in client browser environments.');
  }

  // Request persistence in the background
  ensurePersistentStorage().catch(() => {});

  if (!dbPromise) {
    dbPromise = openDB<FieldEvalDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('observations')) {
          const obsStore = db.createObjectStore('observations', { keyPath: 'id' });
          obsStore.createIndex('by_session', 'sessionId');
          obsStore.createIndex('by_task', 'taskId');
          obsStore.createIndex('by_hash', 'imageHash');
        }

        if (!db.objectStoreNames.contains('blobs')) {
          const blobStore = db.createObjectStore('blobs', { keyPath: 'key' });
          blobStore.createIndex('by_hash', 'hash');
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Creates and registers a new fieldwork session, persisting its ID as the active session.
 */
export async function createSession(): Promise<FieldSession> {
  const db = await getDb();
  const session: FieldSession = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    currentSceneIndex: 0,
  };

  try {
    await db.put('sessions', session);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
    }
    return session;
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError') {
      throw new Error('Device storage is full. Please free storage on your phone.');
    }
    throw err;
  }
}

/**
 * Retrieves a session by its ID.
 */
export async function getSession(sessionId: string): Promise<FieldSession | undefined> {
  const db = await getDb();
  return db.get('sessions', sessionId);
}

/**
 * Retrieves the currently active session (resuming mid-session reloads at the same scene).
 */
export async function getActiveSession(): Promise<FieldSession | undefined> {
  if (typeof localStorage === 'undefined') return undefined;
  const activeId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  if (!activeId) return undefined;

  const session = await getSession(activeId);
  return session;
}

/**
 * Updates the active session's current scene progress.
 */
export async function updateSessionScene(sessionId: string, currentSceneIndex: number): Promise<void> {
  const db = await getDb();
  const session = await db.get('sessions', sessionId);
  if (session) {
    session.currentSceneIndex = currentSceneIndex;
    await db.put('sessions', session);
  }
}

/**
 * Saves or updates an observation in the local IndexedDB.
 */
export async function saveObservation(obs: Observation): Promise<void> {
  const db = await getDb();
  try {
    await db.put('observations', obs);
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError') {
      throw new Error('Device storage is full. Your photo is kept in memory. Please free storage on your phone.');
    }
    throw err;
  }
}

/**
 * Lists all observations recorded for a given session ID.
 */
export async function listObservations(sessionId: string): Promise<Observation[]> {
  const db = await getDb();
  return db.getAllFromIndex('observations', 'by_session', sessionId);
}

/**
 * Saves a normalized JPEG photo blob into the blobs store.
 */
export async function savePhotoBlob(
  key: string,
  blob: Blob,
  hash: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  const db = await getDb();
  const record: PhotoBlobRecord = {
    key,
    mimeType,
    data: blob,
    hash,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.put('blobs', record);
    return key;
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded. Your photo is kept in memory. Please free phone storage.');
    }
    throw err;
  }
}

/**
 * Retrieves a raw photo blob from local storage.
 */
export async function getPhotoBlob(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  const record = await db.get('blobs', key);
  return record?.data;
}

/**
 * Checks if the exact image hash has already been stored for an observation in this session.
 */
export async function checkDuplicateHash(sessionId: string, hash: string): Promise<boolean> {
  const observations = await listObservations(sessionId);
  return observations.some(obs => obs.imageHash === hash);
}

/**
 * Complete deletion: purges all sessions, observations, and photo blobs from local storage.
 */
export async function deleteEverything(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['sessions', 'observations', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').clear(),
    tx.objectStore('observations').clear(),
    tx.objectStore('blobs').clear(),
    tx.done,
  ]);

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  }
}

// In-flight map protecting against double taps / duplicate concurrent submissions
const inFlightInference = new Map<string, Promise<Observation | null>>();

/**
 * Converts a Blob to a base64 string in client contexts.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Dispatches an observation's stored image to the inference API.
 * - Safe against double taps (keyed by observationId)
 * - Offline-aware: queues as 'pending_model' when offline
 * - Saves typed ModelResult onto Observation in IndexedDB
 */
export async function inferObservation(observationId: string): Promise<Observation | null> {
  if (inFlightInference.has(observationId)) {
    return inFlightInference.get(observationId)!;
  }

  const promise = (async () => {
    const db = await getDb();
    const obs = await db.get('observations', observationId);
    if (!obs) return null;

    // Offline check: queue observation locally
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      obs.status = 'pending_model';
      await saveObservation(obs);
      return obs;
    }

    // Retrieve photo blob
    const blob = await getPhotoBlob(obs.blobKey);
    if (!blob) {
      const errorResult: ModelResult = {
        status: 'error',
        answer: null,
        rationale: null,
        selfConfidence: null,
        latencyMs: 0,
        latency_ms: 0,
        attempts: 1,
        errorMessage: 'Local photo blob missing from IndexedDB.',
      };
      obs.modelResult = errorResult;
      obs.status = 'scored';
      await saveObservation(obs);
      return obs;
    }

    try {
      const imageBase64 = await blobToBase64(blob);

      const response = await fetch('/api/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
          taskId: obs.taskId,
          sessionId: obs.sessionId,
        }),
      });

      const modelResult: ModelResult = await response.json();
      obs.modelResult = modelResult;

      const { scoreObservation } = await import('./eval');
      const score = scoreObservation(obs.userAnswer || '', modelResult.answer, {
        isUnsure: obs.userUnsure,
        revisedAfterReveal: obs.revisedAfterReveal,
        modelStatus: modelResult.status,
      });

      obs.outcome = score.outcome;
      obs.matched = score.matched;
      obs.excluded = score.excluded;
      obs.status = 'scored';
      obs.completedAt = new Date().toISOString();

      await saveObservation(obs);
      return obs;
    } catch (err: unknown) {
      // If network dropped mid-request, queue as pending_model
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        obs.status = 'pending_model';
      } else {
        const message = err instanceof Error ? err.message : 'Network inference request failed';
        obs.modelResult = {
          status: 'error',
          answer: null,
          rationale: null,
          selfConfidence: null,
          latencyMs: 0,
          latency_ms: 0,
          attempts: 1,
          errorMessage: message,
        };
        obs.status = 'scored';
      }
      await saveObservation(obs);
      return obs;
    }
  })();

  inFlightInference.set(observationId, promise);
  try {
    return await promise;
  } finally {
    inFlightInference.delete(observationId);
  }
}

let syncListenerAttached = false;

/**
 * Configures automatic background synchronization for offline-queued observations.
 * Automatically runs when the browser regains online connectivity.
 */
export function setupOfflineQueueSync(onSyncComplete?: (obs: Observation) => void): () => void {
  if (typeof window === 'undefined' || syncListenerAttached) {
    return () => {};
  }

  const handleOnline = async () => {
    try {
      const db = await getDb();
      const allObs = await db.getAll('observations');
      const pending = allObs.filter(o => o.status === 'pending_model');

      for (const obs of pending) {
        const updated = await inferObservation(obs.id);
        if (updated && onSyncComplete) {
          onSyncComplete(updated);
        }
      }
    } catch {
      // Best-effort background queue processing
    }
  };

  window.addEventListener('online', handleOnline);
  syncListenerAttached = true;

  return () => {
    window.removeEventListener('online', handleOnline);
    syncListenerAttached = false;
  };
}
