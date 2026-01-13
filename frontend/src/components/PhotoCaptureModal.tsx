import React, { useCallback, useEffect, useRef, useState } from 'react';
import { captureMediaStreamFrame } from './forms/itemFormShared';
import { logger } from '../utils/logger';

interface PhotoCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  title?: string;
}

export default function PhotoCaptureModal({ isOpen, onClose, onCapture, title }: PhotoCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (!streamRef.current) {
      return;
    }
    try {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    } catch (error) {
      logger.error('Failed to stop media stream tracks', { error });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return () => stopStream();
    }

    let cancelled = false;
    const startStream = async () => {
      try {
        setStatusMessage(null);
        if (!navigator.mediaDevices?.getUserMedia) {
          logger.warn('Camera capture requested without mediaDevices support');
          setStatusMessage('Kamera nicht verfügbar.');
          return;
        }
        const nextStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = nextStream;
        if (videoRef.current) {
          videoRef.current.srcObject = nextStream;
          try {
            await videoRef.current.play();
          } catch (error) {
            logger.warn('Failed to autoplay camera preview', { error });
          }
        }
      } catch (error) {
        logger.error('Failed to start camera preview', { error });
        setStatusMessage('Kamera konnte nicht gestartet werden.');
      }
    };

    void startStream();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, stopStream]);

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  const handleCapture = useCallback(() => {
    try {
      const video = videoRef.current;
      if (!video) {
        logger.warn('Photo capture attempted without video element');
        return;
      }
      const dataUrl = captureMediaStreamFrame(video);
      if (!dataUrl) {
        logger.warn('Photo capture returned empty data URL');
        setStatusMessage('Foto konnte nicht aufgenommen werden.');
        return;
      }
      onCapture(dataUrl);
      handleClose();
    } catch (error) {
      logger.error('Failed to capture photo from camera', { error });
      setStatusMessage('Foto konnte nicht aufgenommen werden.');
    }
  }, [handleClose, onCapture]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-overlay photo-capture-modal__overlay" role="presentation" onClick={handleClose}>
      <div
        className="dialog-content photo-capture-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Kamera'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="photo-capture-modal__header">
          <h2 className="dialog-title">{title ?? 'Kamera'}</h2>
          <button type="button" className="photo-capture-modal__close" onClick={handleClose}>
            Schließen
          </button>
        </header>
        <div className="photo-capture-modal__body">
          <video ref={videoRef} className="photo-capture-modal__video" playsInline />
          {statusMessage ? <p className="photo-capture-modal__status">{statusMessage}</p> : null}
        </div>
        <footer className="photo-capture-modal__footer">
          <button type="button" onClick={handleCapture}>
            Capture
          </button>
        </footer>
      </div>
    </div>
  );
}
