import React, { useCallback, useMemo } from 'react';
import { GoDeviceCameraVideo } from 'react-icons/go';
import { useLocation, useNavigate } from 'react-router-dom';
import { logError, logger } from '../utils/logger';

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
    <button className={['btn', className].filter(Boolean).join(' ')} onClick={handleClick} type="button">
      <GoDeviceCameraVideo />
      <span>{label}</span>
    </button>
  );
}
