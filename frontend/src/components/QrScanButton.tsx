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
  onBeforeNavigate?: () => void;
  className?: string;
  label?: string;
}

export default function QrScanButton({
  returnTo,
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
    const query = params.toString();
    return query ? `/scan?${query}` : '/scan';
  }, [resolvedReturnTo]);

  const handleClick = useCallback(() => {
    try {
      onBeforeNavigate?.();
    } catch (error) {
      logError('Failed to prepare for QR scan navigation', error);
    }

    try {
      logger.info('QrScanButton: opening QR scanner', { returnTo: resolvedReturnTo });
      navigate(scanHref);
    } catch (error) {
      logError('Failed to open QR scanner', error, { returnTo: resolvedReturnTo, scanHref });
    }
  }, [navigate, onBeforeNavigate, resolvedReturnTo, scanHref]);

  return (
    <button
      aria-label={label}
      className={['btn', 'qr-scan-button', className].filter(Boolean).join(' ')}
      onClick={handleClick}
      type="button"
    >
      <img className="qr-scan-button__icon" src="/qrIcon.svg" alt="" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </button>
  );
}
