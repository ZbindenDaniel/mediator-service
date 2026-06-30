import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PrintLabelType } from '../../../models';
import { ensureUser, getSite } from '../lib/user';
import { logError, logger } from '../utils/logger';
import { requestPrintLabel } from '../utils/printLabelRequest';

interface Props {
  boxId?: string;
  itemId?: string;
  onPrintStart?: (context: { boxId?: string; itemId?: string }) => void;
  /** When true, renders only the trigger button with no card wrapper. */
  inline?: boolean;
}

function formatPrintReason(reason: string): string {
  const r = reason.toLowerCase();
  if (reason === 'printer_queue_not_configured' || reason === 'print_not_attempted') {
    return 'Kein Drucker konfiguriert';
  }
  if (r.includes('timeout') || r.includes('timed out') || r === 'status_timeout') {
    return 'Drucker antwortet nicht';
  }
  if (
    r.includes('connection refused') || r.includes('econnrefused') ||
    r.includes('network is unreachable') || r.includes('ehostunreach') || r.includes('enetunreach')
  ) {
    return 'Drucker nicht erreichbar';
  }
  return 'Druckfehler';
}

export default function PrintLabelButton({ boxId, itemId, onPrintStart, inline = false }: Props) {
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');
  const [printSent, setPrintSent] = useState<boolean | null>(null);
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const labelDialogRef = useRef<HTMLDivElement | null>(null);
  const labelResolverRef = useRef<((choice: PrintLabelType | null) => void) | null>(null);

  // TODO(ui): Reconfirm status spacing once the grid layout for print cards is finalized.
  // TODO(agent): Review spacing and status copy when embedding this button in success dialogs.
  // TODO(agent): Align print label payloads with backend actor + labelType expectations.
  // TODO(agent): Surface label type and entity metadata in status output for troubleshooting.
  // TODO(agent): Reconfirm gross/klein copy with warehouse to align with label roll naming.
  // TODO(agent): Confirm the label choice modal copy aligns with warehouse terminology.
  function resolveItemLabelType(): Promise<PrintLabelType | null> {
    return new Promise((resolve) => {
      labelResolverRef.current = resolve;
      setIsLabelDialogOpen(true);
    });
  }

  useEffect(() => {
    if (isLabelDialogOpen && labelDialogRef.current) {
      labelDialogRef.current.focus();
    }
  }, [isLabelDialogOpen]);

  const handleLabelDialogClose = useCallback((reason: 'cancel' | 'overlay' | 'escape') => {
    try {
      setIsLabelDialogOpen(false);
      labelResolverRef.current?.(null);
      labelResolverRef.current = null;
      setStatus('Druck abgebrochen.');
      logger.warn?.('Item label selection canceled', { reason, itemId });
    } catch (error) {
      logError('Failed to close item label selection dialog', error, { reason, itemId });
    }
  }, [itemId]);

  const handleLabelSelection = useCallback((type: PrintLabelType) => {
    try {
      setIsLabelDialogOpen(false);
      labelResolverRef.current?.(type);
      labelResolverRef.current = null;
      logger.info?.('Item label type selected', { type, itemId });
    } catch (error) {
      logError('Failed to resolve item label selection', error, { type, itemId });
    }
  }, [itemId]);

  useEffect(() => {
    if (!isLabelDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleLabelDialogClose('escape');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleLabelDialogClose, isLabelDialogOpen]);

  async function handleClick(event?: React.MouseEvent<HTMLElement>) {
    try {
      event?.preventDefault();
      setStatus('drucken...');
      setPrintSent(null);
      setPreview('');
      const actor = (await ensureUser()).trim();
      if (!actor) {
        logger.warn?.('Print request blocked: no actor resolved for label print');
        setStatus('Kein Benutzername gesetzt.');
        return;
      }

      const labelTypeOverride = itemId && !boxId ? await resolveItemLabelType() : undefined;
      if (itemId && !boxId && !labelTypeOverride) {
        return;
      }
      const resolvedLabelTypeOverride = labelTypeOverride ?? undefined;

      onPrintStart?.({ boxId, itemId });
      const result = await requestPrintLabel({
        boxId,
        itemId,
        actor,
        site: getSite().trim() || undefined,
        labelTypeOverride: resolvedLabelTypeOverride
      });
      if (!result.labelType || !result.entityId) {
        setStatus('Fehler: Ungültige ID.');
        return;
      }
      if (result.ok) {
        const data = result.data ?? {};
        setPreview(data.previewUrl || '');
        if (data.sent) {
          setPrintSent(true);
          setStatus('Gesendet an Drucker');
        } else if (data.reason) {
          setPrintSent(false);
          setStatus(formatPrintReason(data.reason));
        } else {
          setPrintSent(null);
          setStatus('Vorschau bereit');
        }
      } else {
        logger.error?.('Print request returned non-OK status', {
          status: result.status,
          labelType: result.labelType,
          entityId: result.entityId,
          error: result.data?.error || result.data?.reason
        });
        setPrintSent(false);
        setStatus('Fehler: ' + (result.data.error || result.data.reason || result.status));
      }
    } catch (err) {
      logError('Print failed', err, { boxId, itemId });
      setPrintSent(false);
      setStatus('Druckfehler');
    }
  }

  const labelDialog = isLabelDialogOpen ? (
    <div className="dialog-overlay" role="presentation" onClick={() => handleLabelDialogClose('overlay')}>
      <div
        className="dialog-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-choice-title"
        ref={labelDialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h4 id="label-choice-title" className="dialog-title">Label drucken</h4>
        <p className="dialog-message">Bitte wähle den Labeltyp.</p>
        <div className="dialog-buttons">
          <button type="button" className="btn" onClick={() => handleLabelSelection('item')}>Gross</button>
          <button type="button" className="btn" onClick={() => handleLabelSelection('smallitem')}>Klein</button>
          <button type="button" className="btn" onClick={() => handleLabelSelection('marketingsheet')}>A4 Produktblatt</button>
        </div>
      </div>
    </div>
  ) : null;

  const pdfLink = preview ? (
    <button>

      <a
        href={preview}
        target="_blank"
        rel="noopener"
        className={printSent === false ? 'btn btn--primary print-label-pdf-link' : 'mono print-label-pdf-link'}
      >
        {printSent === false ? 'Label als PDF öffnen' : 'PDF'}
      </a>
    </button>
  ) : null;

  if (inline) {
    return (
      <>
        <button type="button" className="btn" onClick={handleClick}>Label drucken</button>
        {pdfLink}
        {labelDialog}
      </>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ width: '70%', margin: 'auto', marginTop: '8px' }}>
          <button id='printlabelbutton' type="button" className="btn" onClick={handleClick}>
            Label drucken
          </button>
        </h3>
      </div>
      {status && (
        <div className="print-label-status">
          <span className={printSent === false ? 'print-label-status__error' : ''}>
            {status}
          </span>
          {pdfLink && <> – {pdfLink}</>}
        </div>
      )}
      {labelDialog}
    </div>
  );
}
