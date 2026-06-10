import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react';
import { getUser } from '../lib/user';

interface UserMarksContextValue {
  markedUUIDs: Set<string>;
  isMarked: (itemUUID: string) => boolean;
  getNote: (itemUUID: string) => string | null;
  toggleMark: (itemUUID: string, currentNote?: string | null) => Promise<void>;
  saveMark: (itemUUID: string, note: string | null) => Promise<void>;
  removeMark: (itemUUID: string) => Promise<void>;
}

const UserMarksContext = createContext<UserMarksContextValue | null>(null);

export function UserMarksProvider({ children }: PropsWithChildren) {
  const [markedUUIDs, setMarkedUUIDs] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Map<string, string | null>>(new Map());

  const username = getUser().trim();

  useEffect(() => {
    if (!username) return;
    void fetch(`/api/user-marks?username=${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((data: { markedUUIDs?: string[] }) => {
        if (Array.isArray(data.markedUUIDs)) {
          setMarkedUUIDs(new Set(data.markedUUIDs));
        }
      })
      .catch((err) => console.error('[UserMarks] Failed to load marks', err));
  }, [username]);

  const isMarked = useCallback((itemUUID: string) => markedUUIDs.has(itemUUID), [markedUUIDs]);
  const getNote = useCallback((itemUUID: string) => notes.get(itemUUID) ?? null, [notes]);

  const saveMark = useCallback(async (itemUUID: string, note: string | null) => {
    if (!username) return;
    const res = await fetch('/api/user-marks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, itemUUID, note })
    });
    if (res.ok) {
      setMarkedUUIDs((prev) => new Set([...prev, itemUUID]));
      setNotes((prev) => new Map([...prev, [itemUUID, note]]));
    }
  }, [username]);

  const removeMark = useCallback(async (itemUUID: string) => {
    if (!username) return;
    const res = await fetch('/api/user-marks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, itemUUID })
    });
    if (res.ok) {
      setMarkedUUIDs((prev) => {
        const next = new Set(prev);
        next.delete(itemUUID);
        return next;
      });
      setNotes((prev) => {
        const next = new Map(prev);
        next.delete(itemUUID);
        return next;
      });
    }
  }, [username]);

  const toggleMark = useCallback(async (itemUUID: string, currentNote?: string | null) => {
    if (markedUUIDs.has(itemUUID)) {
      await removeMark(itemUUID);
    } else {
      await saveMark(itemUUID, currentNote ?? null);
    }
  }, [markedUUIDs, removeMark, saveMark]);

  return (
    <UserMarksContext.Provider value={{ markedUUIDs, isMarked, getNote, toggleMark, saveMark, removeMark }}>
      {children}
    </UserMarksContext.Provider>
  );
}

export function useUserMarks(): UserMarksContextValue {
  const ctx = useContext(UserMarksContext);
  if (!ctx) throw new Error('useUserMarks must be used within UserMarksProvider');
  return ctx;
}
