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

// Custom event key for username changes within the same tab.
export const USERNAME_CHANGED_EVENT = 'mediator:username-changed';

export function UserMarksProvider({ children }: PropsWithChildren) {
  const [markedUUIDs, setMarkedUUIDs] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Map<string, string | null>>(new Map());
  // Tracks the username the context last loaded marks for.
  const [loadedForUser, setLoadedForUser] = useState('');

  const loadMarks = useCallback(() => {
    const username = getUser().trim();
    if (!username || username === loadedForUser) return;
    void fetch(`/api/user-marks?username=${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((data: { marks?: Array<{ itemUUID: string; note: string | null }> }) => {
        if (Array.isArray(data.marks)) {
          setMarkedUUIDs(new Set(data.marks.map((m) => m.itemUUID)));
          setNotes(new Map(data.marks.map((m) => [m.itemUUID, m.note])));
          setLoadedForUser(username);
        }
      })
      .catch((err) => console.error('[UserMarks] Failed to load marks', err));
  }, [loadedForUser]);

  // Load on mount and whenever the username changes (same-tab dispatch from setUser).
  useEffect(() => {
    loadMarks();
    const handleUsernameChange = () => loadMarks();
    window.addEventListener(USERNAME_CHANGED_EVENT, handleUsernameChange);
    window.addEventListener('storage', handleUsernameChange);
    return () => {
      window.removeEventListener(USERNAME_CHANGED_EVENT, handleUsernameChange);
      window.removeEventListener('storage', handleUsernameChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMarked = useCallback((itemUUID: string) => markedUUIDs.has(itemUUID), [markedUUIDs]);
  const getNote = useCallback((itemUUID: string) => notes.get(itemUUID) ?? null, [notes]);

  const saveMark = useCallback(async (itemUUID: string, note: string | null) => {
    const username = getUser().trim();
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
  }, []);

  const removeMark = useCallback(async (itemUUID: string) => {
    const username = getUser().trim();
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
  }, []);

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
