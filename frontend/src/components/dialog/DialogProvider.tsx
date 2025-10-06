// TODO: Ensure dialog queue management and service registration remain consistent with new requirements.
import React, {
  PropsWithChildren,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { dialogService } from './dialogService';
import {
  DialogButtons,
  DialogContent,
  DialogOverlay
} from './presentational';

export type DialogType = 'alert' | 'confirm' | 'prompt';

export interface BaseDialogOptions {
  title?: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
}

export interface ConfirmDialogOptions extends BaseDialogOptions {
  cancelLabel?: string;
}

export interface PromptDialogOptions extends ConfirmDialogOptions {
  defaultValue?: string;
  placeholder?: string;
}

export interface DialogContextValue {
  alert: (options: BaseDialogOptions) => Promise<void>;
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

interface AlertRequest {
  id: string;
  type: 'alert';
  options: BaseDialogOptions;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

interface ConfirmRequest {
  id: string;
  type: 'confirm';
  options: ConfirmDialogOptions;
  resolve: (value: boolean) => void;
  reject: (reason?: unknown) => void;
}

interface PromptRequest {
  id: string;
  type: 'prompt';
  options: PromptDialogOptions;
  resolve: (value: string | null) => void;
  reject: (reason?: unknown) => void;
}

type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest;

type DialogResolvers = {
  alert: AlertRequest;
  confirm: ConfirmRequest;
  prompt: PromptRequest;
};

export const DialogContext = React.createContext<DialogContextValue | undefined>(
  undefined
);

function createRequestId() {
  return `dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DialogProvider({ children }: PropsWithChildren<{}>) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const activeRequest = queue[0] ?? null;
  const registeredRef = useRef(false);
  const promptValueRef = useRef('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const removeActiveRequest = useCallback(() => {
    try {
      setQueue((current) => current.slice(1));
    } catch (error) {
      console.error('Failed to remove dialog request from queue', error);
    }
  }, []);

  const enqueue = useCallback(<T extends DialogType>(
    type: T,
    options: DialogResolvers[T]['options'],
    resolve: DialogResolvers[T]['resolve'],
    reject: DialogResolvers[T]['reject']
  ) => {
    const request: DialogRequest = {
      id: createRequestId(),
      type,
      options: options as DialogRequest['options'],
      // @ts-expect-error generic mapping ensures correct types per request
      resolve,
      reject
    };

    try {
      setQueue((current) => {
        const nextQueue = [...current, request];
        console.log('Dialog request enqueued', {
          type: request.type,
          size: nextQueue.length
        });
        return nextQueue;
      });
    } catch (error) {
      console.error('Failed to enqueue dialog request', error);
      try {
        reject(error);
      } catch (rejectError) {
        console.error('Dialog request rejection failed', rejectError);
      }
    }
  }, []);

  const alert = useCallback<DialogContextValue['alert']>((options) => {
    return new Promise<void>((resolve, reject) => {
      enqueue('alert', options, () => {
        console.log('Dialog alert resolved');
        resolve();
      }, reject);
    });
  }, [enqueue]);

  const confirm = useCallback<DialogContextValue['confirm']>((options) => {
    return new Promise<boolean>((resolve, reject) => {
      enqueue('confirm', options, (result) => {
        console.log('Dialog confirm resolved', result);
        resolve(result);
      }, reject);
    });
  }, [enqueue]);

  const prompt = useCallback<DialogContextValue['prompt']>((options) => {
    return new Promise<string | null>((resolve, reject) => {
      enqueue('prompt', options, (result) => {
        console.log('Dialog prompt resolved', result);
        resolve(result);
      }, reject);
    });
  }, [enqueue]);

  const contextValue = useMemo<DialogContextValue>(() => ({
    alert,
    confirm,
    prompt
  }), [alert, confirm, prompt]);

  if (!registeredRef.current) {
    try {
      dialogService.register(contextValue);
      registeredRef.current = true;
      console.log('Dialog service registered');
    } catch (error) {
      console.error('Failed to register dialog service', error);
    }
  }

  useEffect(() => {
    return () => {
      try {
        dialogService.unregister(contextValue);
        console.log('Dialog service unregistered');
      } catch (error) {
        console.error('Failed to unregister dialog service', error);
      }
    };
  }, [contextValue]);

  useEffect(() => {
    if (activeRequest?.type === 'prompt') {
      promptValueRef.current = activeRequest.options.defaultValue ?? '';
    } else {
      promptValueRef.current = '';
    }
  }, [activeRequest]);

  const handleConfirm = useCallback((value?: boolean | string | null) => {
    if (!activeRequest) {
      return;
    }
    try {
      if (activeRequest.type === 'alert') {
        activeRequest.resolve();
      } else if (activeRequest.type === 'confirm') {
        activeRequest.resolve(Boolean(value));
      } else {
        activeRequest.resolve((value ?? promptValueRef.current) as string | null);
      }
    } catch (error) {
      console.error('Failed to confirm dialog', error);
      try {
        activeRequest.reject(error);
      } catch (rejectError) {
        console.error('Failed to reject dialog after confirm error', rejectError);
      }
    } finally {
      removeActiveRequest();
    }
  }, [activeRequest, removeActiveRequest]);

  const handleCancel = useCallback(() => {
    if (!activeRequest) {
      return;
    }
    try {
      if (activeRequest.type === 'prompt') {
        activeRequest.resolve(null);
      } else if (activeRequest.type === 'confirm') {
        activeRequest.resolve(false);
      } else {
        activeRequest.reject(new Error('Alert dialog cancelled'));
      }
      console.log('Dialog cancelled', { type: activeRequest.type });
    } catch (error) {
      console.error('Failed to cancel dialog', error);
    } finally {
      removeActiveRequest();
    }
  }, [activeRequest, removeActiveRequest]);

  const handlePromptChange = useCallback((value: string) => {
    promptValueRef.current = value;
  }, []);

  useEffect(() => {
    if (!activeRequest) {
      return;
    }
    const node = dialogRef.current;
    if (!node) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    previousFocusRef.current = previouslyFocused ?? null;

    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([type="hidden"]):not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const getFocusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
        (element) =>
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.tabIndex !== -1
      );

    const focusables = getFocusable();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      node.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
        return;
      }

      if (event.key === 'Tab') {
        const elements = getFocusable();
        if (elements.length === 0) {
          event.preventDefault();
          node.focus();
          return;
        }

        const first = elements[0];
        const last = elements[elements.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (activeElement === first || activeElement === node) {
            event.preventDefault();
            last.focus();
          }
        } else if (activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    node.addEventListener('keydown', handleKeyDown);

    return () => {
      node.removeEventListener('keydown', handleKeyDown);
      try {
        previousFocusRef.current?.focus?.();
      } catch (error) {
        console.error('Failed to restore focus after dialog close', error);
      }
    };
  }, [activeRequest, handleCancel]);

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {activeRequest && (
        <DialogOverlay onDismiss={handleCancel}>
          <DialogContent
            ref={(node) => {
              dialogRef.current = node;
            }}
            title={activeRequest.options.title}
            message={activeRequest.options.message}
            role="dialog"
          >
            {activeRequest.type === 'prompt' && (
              <input
                aria-label="Dialog prompt input"
                defaultValue={activeRequest.options.defaultValue ?? ''}
                onChange={(event) => handlePromptChange(event.target.value)}
                placeholder={activeRequest.options.placeholder}
              />
            )}
            <DialogButtons
              type={activeRequest.type}
              confirmLabel={activeRequest.options.confirmLabel}
              cancelLabel={
                activeRequest.type === 'alert'
                  ? undefined
                  : activeRequest.options.cancelLabel
              }
              onConfirm={() =>
                handleConfirm(
                  activeRequest.type === 'prompt'
                    ? promptValueRef.current
                    : true
                )
              }
              onCancel={handleCancel}
            />
          </DialogContent>
        </DialogOverlay>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}
