import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logError, logger } from '../utils/logger';
import qrIcon from '../assets/qrIcon.svg';

// TODO(qr-scan-button): Validate QR icon sizing with the circular button in every card layout.
// TODO(qr-scan-button): Confirm button contrast when rendered inside text inputs.

// TODO(qr-scan-button): Validate QR icon sizing with the circular button in every card layout.
// TODO(qr-scan-button): Confirm button contrast when rendered inside text inputs.
// TODO(qr-scan-button): Validate public asset loading for the QR icon in production builds.

interface QrScanButtonProps {
  returnTo?: string;
  callback?: string;
  scanIntent?: 'add-item' | 'relocate-box' | 'shelf-add-box';
  onBeforeNavigate?: () => void;
  className?: string;
  label?: string;
}

export default function QrScanButton({
  returnTo,
  callback,
  scanIntent,
  onBeforeNavigate,
  className,
  label = 'QR scannen'
}: QrScanButtonProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedReturnTo = returnTo ?? `${location.pathname}${location.search}`;

  const scanHref = useMemo(() => {
    const params = new URLSearchParams();
    if (resolvedReturnTo) {
      params.set('returnTo', resolvedReturnTo);
    }
    if (callback) {
      params.set('callback', callback);
    }
    if (scanIntent) {
      params.set('intent', scanIntent);
    }
    const query = params.toString();
    return query ? `/scan?${query}` : '/scan';
  }, [callback, resolvedReturnTo, scanIntent]);

  const handleClick = useCallback(() => {
    try {
      onBeforeNavigate?.();
    } catch (error) {
      logError('Failed to prepare for QR scan navigation', error);
    }

    try {
      logger.info('QrScanButton: opening QR scanner', { returnTo: resolvedReturnTo, callback, scanIntent });
      navigate(scanHref, {
        state: {
          returnTo: resolvedReturnTo,
          callback,
          intent: scanIntent
        }
      });
    } catch (error) {
      logError('Failed to open QR scanner', error, { returnTo: resolvedReturnTo, callback, scanIntent, scanHref });
    }
  }, [callback, navigate, onBeforeNavigate, resolvedReturnTo, scanHref, scanIntent]);

  return (
    <button
      aria-label={label}
      className={['btn', 'qr-scan-button', className].filter(Boolean).join(' ')}
      onClick={handleClick}
      type="button"
    >
      <img className="qr-scan-button__icon" src="/assets/qrIcon.svg" alt="" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </button>
  );
}
