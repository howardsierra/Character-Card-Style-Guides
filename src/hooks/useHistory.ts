import { useState, useCallback, useRef, useEffect } from 'react';

export function useHistory<T>(initialState: T, debounceMs: number = 500) {
  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<T[]>([initialState]);
  const [pointer, setPointer] = useState<number>(0);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef<T>(initialState);
  const pointerRef = useRef<number>(0);
  
  // Keep pointerRef in sync with pointer
  useEffect(() => {
    pointerRef.current = pointer;
  }, [pointer]);

  const set = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const nextState = typeof value === 'function' ? (value as Function)(prev) : value;
      
      if (JSON.stringify(prev) === JSON.stringify(nextState)) {
        return prev;
      }

      // If we are making a change while not at the end of history,
      // we should immediately truncate the future history so Redo is disabled.
      setHistory((prevHistory) => {
        if (pointerRef.current < prevHistory.length - 1) {
          return prevHistory.slice(0, pointerRef.current + 1);
        }
        return prevHistory;
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(nextState)) {
          setHistory((prevHistory) => {
            const newHistory = prevHistory.slice(0, pointerRef.current + 1);
            newHistory.push(nextState);
            return newHistory;
          });
          setPointer((prevPointer) => prevPointer + 1);
          lastSavedStateRef.current = nextState;
        }
      }, debounceMs);

      return nextState;
    });
  }, [debounceMs]);

  // Force save current state to history immediately
  const saveHistory = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(state)) {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, pointerRef.current + 1);
        newHistory.push(state);
        return newHistory;
      });
      setPointer((prevPointer) => prevPointer + 1);
      lastSavedStateRef.current = state;
      return true; // Indicates history was saved
    }
    return false;
  }, [state]);

  const undo = useCallback(() => {
    const wasSaved = saveHistory(); // Save any pending changes before undoing
    
    setHistory(currentHistory => {
      const currentPointer = wasSaved ? pointerRef.current + 1 : pointerRef.current;
      if (currentPointer > 0) {
        const newPointer = currentPointer - 1;
        setPointer(newPointer);
        setState(currentHistory[newPointer]);
        lastSavedStateRef.current = currentHistory[newPointer];
      }
      return currentHistory;
    });
  }, [saveHistory]);

  const redo = useCallback(() => {
    const wasSaved = saveHistory();
    
    setHistory(currentHistory => {
      const currentPointer = wasSaved ? pointerRef.current + 1 : pointerRef.current;
      if (currentPointer < currentHistory.length - 1) {
        const newPointer = currentPointer + 1;
        setPointer(newPointer);
        setState(currentHistory[newPointer]);
        lastSavedStateRef.current = currentHistory[newPointer];
      }
      return currentHistory;
    });
  }, [saveHistory]);

  const canUndo = pointer > 0 || JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(state);
  const canRedo = pointer < history.length - 1;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return [state, set, { undo, redo, canUndo, canRedo }] as const;
}
