import { parseJsonlToExportRecords, exportRecordToObservation } from './export';
import { saveObservation, getDb, FieldSession } from './storage';

export interface LoadSampleResult {
  success: boolean;
  count?: number;
  error?: string;
}

/**
 * Loads the author's real field session from /sample-session.jsonl into IndexedDB.
 * Labels and registers the session so judges can inspect the results wall even if the daily cap is exhausted.
 */
export async function loadAuthorSampleSession(): Promise<LoadSampleResult> {
  try {
    const res = await fetch('/sample-session.jsonl');
    if (!res.ok) {
      return {
        success: false,
        error: `Could not fetch /sample-session.jsonl (HTTP ${res.status}).`,
      };
    }

    const rawText = await res.text();
    // Filter out comment lines and whitespace
    const validLines = rawText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'));

    if (validLines.length === 0) {
      return {
        success: false,
        error: 'No seed records found in /sample-session.jsonl yet. Author must provide field session records.',
      };
    }

    const cleanJsonl = validLines.join('\n');
    const records = parseJsonlToExportRecords(cleanJsonl);

    if (records.length === 0) {
      return {
        success: false,
        error: 'No valid records parsed from sample session.',
      };
    }

    const sessionId = records[0].session_id || 'author-field-session';
    const db = await getDb();

    // 1. Create or register the author's session
    const session: FieldSession = {
      id: sessionId,
      startedAt: records[0].timestamp || new Date().toISOString(),
      completedAt: records[records.length - 1].timestamp || new Date().toISOString(),
      currentSceneIndex: 6, // Completed walk
    };

    await db.put('sessions', session);

    // 2. Persist each observation into local IndexedDB
    for (const rec of records) {
      const obs = exportRecordToObservation(rec);
      await saveObservation(obs);
    }

    // 3. Mark as active session
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fieldeval_active_session_id', session.id);
    }

    return {
      success: true,
      count: records.length,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Error loading sample session: ${msg}`,
    };
  }
}
