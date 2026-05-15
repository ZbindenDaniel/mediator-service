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
  scanIntent?: 'add-item' | 'relocate-box' | 'shelf-add-box' | 'search';
  searchTarget?: string;
  searchLabel?: string;
  onBeforeNavigate?: () => void;
  className?: string;
  label?: string;
}

export default function QrScanButton({
  returnTo,
  callback,
  scanIntent,
  searchTarget,
  searchLabel,
  onBeforeNavigate,
  className,
  label = 'QR scannen'
}: QrScanButtonProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedReturnTo = returnTo ?? `${location.pathname}${location.search}`;

  const resolvedIntent = searchTarget ? 'search' : scanIntent;

  const scanHref = useMemo(() => {
    const params = new URLSearchParams();
    if (resolvedReturnTo) {
      params.set('returnTo', resolvedReturnTo);
    }
    if (callback) {
      params.set('callback', callback);
    }
    if (resolvedIntent) {
      params.set('intent', resolvedIntent);
    }
    if (searchTarget) {
      params.set('searchTarget', searchTarget);
    }
    if (searchLabel) {
      params.set('searchLabel', searchLabel);
    }
    const query = params.toString();
    return query ? `/scan?${query}` : '/scan';
  }, [callback, resolvedReturnTo, resolvedIntent, searchTarget, searchLabel]);

  const handleClick = useCallback(() => {
    try {
      onBeforeNavigate?.();
    } catch (error) {
      logError('Failed to prepare for QR scan navigation', error);
    }

    try {
      logger.info('QrScanButton: opening QR scanner', { returnTo: resolvedReturnTo, callback, intent: resolvedIntent, searchTarget });
      navigate(scanHref, {
        state: {
          returnTo: resolvedReturnTo,
          callback,
          intent: resolvedIntent,
          searchTarget,
          searchLabel
        }
      });
    } catch (error) {
      logError('Failed to open QR scanner', error, { returnTo: resolvedReturnTo, callback, scanIntent, scanHref });
    }
  }, [callback, navigate, onBeforeNavigate, resolvedReturnTo, scanHref, resolvedIntent, searchTarget, searchLabel]);

  return (
    <button
      aria-label={label}
      className={['btn', 'qr-scan-button', 'mobile-only', className].filter(Boolean).join(' ')}
      onClick={handleClick}
      type="button"
    >
      <img className="qr-scan-button__icon" src="/assets/qrIcon.svg" alt="" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </button>
  );
}
