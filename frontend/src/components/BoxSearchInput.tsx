import React, {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { GoPlus } from 'react-icons/go';

export interface BoxSuggestion {
  BoxID: string;
  Location?: string | null;
}

interface BoxSearchInputProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSuggestionSelected?: (suggestion: BoxSuggestion | null) => void;
  label?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  allowCreate?: boolean;
  onCreateBox?: () => Promise<string | void>;
  createLabel?: string;
}

const MIN_QUERY_LENGTH = 2;

export default function BoxSearchInput({
  id,
  value,
  onValueChange,
  onSuggestionSelected,
  label,
  placeholder,
  disabled,
  autoFocus,
  className,
  inputClassName,
  allowCreate,
  onCreateBox,
  createLabel
}: BoxSearchInputProps) {
  const [suggestions, setSuggestions] = useState<BoxSuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSuggestionVisible, setSuggestionVisible] = useState(false);
  const [isCreatingBox, setIsCreatingBox] = useState(false);
  const hideTimeoutRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmedValue = value.trim();
    if (trimmedValue.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    async function runSearch(searchTerm: string) {
      try {
        const response = await fetch('/api/search?scope=boxes&term=' + encodeURIComponent(searchTerm), {
          signal: controller.signal
        });
        if (!response.ok) {
          console.error('Box search HTTP error', response.status);
          return;
        }
        const data = await response.json().catch((parseError) => {
          console.error('Failed to parse box search response', parseError);
          return {} as { boxes?: BoxSuggestion[] };
        });
        const nextSuggestions = data.boxes ?? [];
        console.debug('Box search returned results', {
          query: searchTerm,
          count: nextSuggestions.length
        });
        setSuggestions(nextSuggestions);
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') {
          console.debug('Box search aborted', { query: searchTerm });
          return;
        }
        console.error('Box search failed', error);
      }
    }

    runSearch(trimmedValue);

    return () => {
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = undefined;
      }
    };
  }, []);

  const filteredSuggestions = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) {
      return suggestions;
    }
    return suggestions.filter((suggestion) => {
      const idValue = (suggestion.BoxID || '').toLowerCase();
      const locationValue = (suggestion.Location || '').toLowerCase();
      return idValue.includes(term) || locationValue.includes(term);
    });
  }, [suggestions, value]);

  useEffect(() => {
    if (!filteredSuggestions.length) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex((current) => {
      if (current < 0) {
        return -1;
      }
      if (current >= filteredSuggestions.length) {
        return filteredSuggestions.length - 1;
      }
      return current;
    });
  }, [filteredSuggestions]);

  const applySuggestion = (index: number) => {
    const suggestion = filteredSuggestions[index];
    if (!suggestion) {
      return;
    }
    try {
      onValueChange(suggestion.BoxID);
      if (onSuggestionSelected) {
        onSuggestionSelected(suggestion);
      }
    } catch (error) {
      console.error('Failed to apply box suggestion', error);
    }
    setSuggestionVisible(false);
    setHighlightedIndex(-1);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    try {
      onValueChange(nextValue);
      if (onSuggestionSelected) {
        onSuggestionSelected(null);
      }
    } catch (error) {
      console.error('Box search value change handler failed', error);
    }
    setSuggestionVisible(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filteredSuggestions.length) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSuggestionVisible(true);
      setHighlightedIndex((current) => {
        const next = current + 1;
        if (next >= filteredSuggestions.length) {
          return 0;
        }
        return next;
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSuggestionVisible(true);
      setHighlightedIndex((current) => {
        const next = current - 1;
        if (next < 0) {
          return filteredSuggestions.length - 1;
        }
        return next;
      });
    } else if (event.key === 'Enter') {
      if (highlightedIndex >= 0) {
        event.preventDefault();
        applySuggestion(highlightedIndex);
      } else {
        setSuggestionVisible(false);
      }
    } else if (event.key === 'Escape') {
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
    }
  };

  const handleFocus = () => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = undefined;
    }
    setSuggestionVisible(true);
  };

  const handleBlur = () => {
    hideTimeoutRef.current = window.setTimeout(() => {
      setSuggestionVisible(false);
      setHighlightedIndex(-1);
    }, 120);
  };

  const handleCreateClick = async () => {
    const canCreate = Boolean(onCreateBox) && allowCreate !== false;
    if (!canCreate || !onCreateBox) {
      return;
    }
    setIsCreatingBox(true);
    try {
      const createdId = await onCreateBox();
      if (typeof createdId === 'string' && createdId.trim()) {
        onValueChange(createdId);
        if (onSuggestionSelected) {
          onSuggestionSelected({ BoxID: createdId });
        }
      }
    } catch (error) {
      console.error('Box creation from search input failed', error);
    } finally {
      setIsCreatingBox(false);
    }
  };

  return (
    <div className={className ? `box-search ${className}` : 'box-search'}>
      {label ? (
        <label htmlFor={id} className="box-search__label">
          {label}
        </label>
      ) : null}
      <div className="box-search__field">
        <input
          id={id}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={inputClassName ? `box-search__input ${inputClassName}` : 'box-search__input'}
          aria-autocomplete="list"
          aria-expanded={isSuggestionVisible && filteredSuggestions.length > 0}
          aria-activedescendant={highlightedIndex >= 0 ? `box-suggestion-${highlightedIndex}` : undefined}
        />
        {onCreateBox && (allowCreate !== false) ? (
          <button
            type="button"
            className="box-search__create"
            onClick={() => { void handleCreateClick(); }}
            disabled={disabled || isCreatingBox}
            title={createLabel ?? 'Behälter anlegen'}
            aria-label={createLabel ?? 'Behälter anlegen'}
          >
            {createLabel ? (
              <span>{createLabel}</span>
            ) : (
              <GoPlus aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      {isSuggestionVisible && filteredSuggestions.length > 0 ? (
        <div className="box-search__suggestions card suggestion-list" role="listbox">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              type="button"
              key={`${suggestion.BoxID}-${index}`}
              id={`box-suggestion-${index}`}
              className={`card suggestion-option${index === highlightedIndex ? ' active' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                applySuggestion(index);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              role="option"
              aria-selected={index === highlightedIndex}
            >
              <div className="mono">{suggestion.BoxID}</div>
              {suggestion.Location ? <div className="muted">{suggestion.Location}</div> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
