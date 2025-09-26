import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type BarcodeDetectionResult = { rawValue?: string; format?: string };

interface BarcodeDetectorInstance {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectionResult[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

type BoxQrPayload = {
  id: string;
  [key: string]: unknown;
};

type ScanStatus = 'idle' | 'scanning' | 'success' | 'error';

export default function QrScannerPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const detectionTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [message, setMessage] = useState('Kamera wird vorbereitet…');
  const [payload, setPayload] = useState<BoxQrPayload | null>(null);
  const [rawContent, setRawContent] = useState('');
  const [logError, setLogError] = useState<string | null>(null);
  const navigate = useNavigate();

  const stopCamera = useCallback(() => {
    if (detectionTimerRef.current !== null) {
      window.clearInterval(detectionTimerRef.current);
      detectionTimerRef.current = null;
    }
    detectorRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.error('Failed to stop media track', err);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const logScan = useCallback(async (qrPayload: BoxQrPayload) => {
    try {
      const res = await fetch('/api/qr-scan/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: qrPayload,
          scannedAt: new Date().toISOString()
        })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      setLogError(null);
    } catch (err) {
      console.error('Failed to log QR scan', err);
      setLogError('Scan konnte nicht protokolliert werden. Bitte später erneut versuchen.');
    }
  }, []);

  const handleDecoded = useCallback(async (raw: string) => {
    setRawContent(raw);
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') {
        throw new Error('QR-Code enthält kein gültiges JSON-Objekt.');
      }
      const id = typeof (data as { id?: unknown }).id === 'string' ? (data as { id?: string }).id.trim() : '';
      if (!id) {
        throw new Error('QR-Code enthält keine gültige "id".');
      }
      const normalized: BoxQrPayload = { ...(data as Record<string, unknown>), id };
      setPayload(normalized);
      setStatus('success');
      setMessage('Scan erfolgreich.');
      stopCamera();
      await logScan(normalized);
    } catch (err) {
      console.error('QR payload validation failed', err);
      stopCamera();
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unbekannter Fehler beim Lesen des QR-Codes.');
    }
  }, [logScan, stopCamera]);

  const startScanner = useCallback(async () => {
    stopCamera();
    setPayload(null);
    setRawContent('');
    setLogError(null);
    setStatus('scanning');
    setMessage('Kamera wird initialisiert… Bitte Zugriff erlauben.');

    try {
      if (typeof window === 'undefined') {
        throw new Error('Scanner kann nur im Browser verwendet werden.');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Kamerazugriff wird von diesem Gerät nicht unterstützt.');
      }

      const ctor = (window as typeof window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!ctor) {
        throw new Error('Dieser Browser unterstützt kein Live-Scanning (BarcodeDetector fehlt).');
      }

      detectorRef.current = new ctor({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        try {
          await videoRef.current.play();
        } catch (err) {
          console.error('Failed to start video playback', err);
        }
      }

      setMessage('Halte den QR-Code vor die Kamera.');

      detectionTimerRef.current = window.setInterval(async () => {
        if (!detectorRef.current || !videoRef.current) {
          return;
        }
        try {
          const detections = await detectorRef.current.detect(videoRef.current);
          if (!detections.length) {
            return;
          }
          const first = detections.find((d) => d.format === 'qr_code') || detections[0];
          if (first.rawValue) {
            await handleDecoded(first.rawValue);
          }
        } catch (err) {
          console.error('QR detection error', err);
          stopCamera();
          setStatus('error');
          setMessage('Fehler beim Lesen des QR-Codes. Bitte erneut versuchen.');
        }
      }, 400);
    } catch (err) {
      console.error('QR scanner initialisation failed', err);
      stopCamera();
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Kamera konnte nicht gestartet werden.');
    }
  }, [handleDecoded, stopCamera]);

  useEffect(() => {
    void startScanner();
    return () => {
      stopCamera();
    };
  }, [startScanner, stopCamera]);

  const handleRetry = useCallback(() => {
    void startScanner();
  }, [startScanner]);

  const handleNavigate = useCallback(() => {
    if (!payload) {
      return;
    }
    try {
      navigate(`/boxes/${encodeURIComponent(payload.id)}`);
    } catch (err) {
      console.error('Navigation to box failed', err);
      setMessage('Navigation fehlgeschlagen. Bitte Seite manuell öffnen.');
    }
  }, [navigate, payload]);

  return (
    <div className="container qr-scanner">
      <h1>QR-Scanner</h1>
      <div className="card">
        <div className="video-frame">
          <video ref={videoRef} className="qr-video" autoPlay playsInline muted />
        </div>
        <p className={`status ${status}`}>{message}</p>
        {logError && <p className="error">{logError}</p>}
        {payload ? (
          <div className="result">
            <h2>Behälter {payload.id}</h2>
            <pre>{JSON.stringify(payload, null, 2)}</pre>
            <div className="actions">
              <button type="button" onClick={handleNavigate}>Behälter öffnen</button>
              <button type="button" onClick={handleRetry}>Nochmal scannen</button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="button" onClick={handleRetry}>
              {status === 'scanning' ? 'Scanner neu starten' : 'Erneut versuchen'}
            </button>
          </div>
        )}
        {rawContent && (
          <details className="raw">
            <summary>Rohdaten anzeigen</summary>
            <pre>{rawContent}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
