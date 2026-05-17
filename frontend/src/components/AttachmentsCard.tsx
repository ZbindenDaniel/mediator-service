import React from 'react';
import AttachmentBindingModal, { BindingOption } from './AttachmentBindingModal';

export interface AttachmentIdentifiers {
  artikelNummer?: string | null;
  serialNumber?: string | null;
  macAddress?: string | null;
  ean?: string | null;
}

interface AttachmentsCardProps extends AttachmentIdentifiers {
  itemUUID: string;
  attachments: any[];
  onChanged: (next: any[]) => void;
}

function buildBindingOptions(itemUUID: string, ids: AttachmentIdentifiers): BindingOption[] {
  const options: BindingOption[] = [
    { type: 'instance', label: 'Diese Instanz', value: itemUUID }
  ];
  if (ids.artikelNummer) {
    options.push({ type: 'artikel', label: 'Artikel (Produktebene)', value: ids.artikelNummer });
  }
  if (ids.serialNumber) {
    options.push({ type: 'serialNumber', label: 'Seriennummer', value: ids.serialNumber });
  }
  if (ids.macAddress) {
    options.push({ type: 'macAddress', label: 'MAC-Adresse', value: ids.macAddress });
  }
  if (ids.ean) {
    options.push({ type: 'ean', label: 'EAN', value: ids.ean });
  }
  return options;
}

// Matches the label format written on upload: "type:value"
const BINDING_RE = /^(instance|artikel|serialNumber|macAddress|ean):(.+)$/;

function parseBindingLabel(label: string | null): { type: string; value: string } | null {
  if (!label) return null;
  const m = label.match(BINDING_RE);
  return m ? { type: m[1], value: m[2] } : null;
}

function bindingBadgeText(type: string): string {
  switch (type) {
    case 'instance': return 'Instanz';
    case 'artikel': return 'Artikel';
    case 'serialNumber': return 'SN';
    case 'macAddress': return 'MAC';
    case 'ean': return 'EAN';
    default: return type;
  }
}

export default function AttachmentsCard({
  itemUUID,
  attachments,
  onChanged,
  artikelNummer,
  serialNumber,
  macAddress,
  ean
}: AttachmentsCardProps) {
  const [uploading, setUploading] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [bindingOptions, setBindingOptions] = React.useState<BindingOption[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function doUpload(file: File, label?: string) {
    setUploading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': file.name
      };
      if (label) headers['X-Label'] = label;

      const res = await fetch(`/api/item/${encodeURIComponent(itemUUID)}/attachments`, {
        method: 'POST',
        headers,
        body: file
      });
      if (res.ok) {
        const listRes = await fetch(`/api/item/${encodeURIComponent(itemUUID)}/attachments`);
        if (listRes.ok) {
          const data = await listRes.json();
          onChanged(Array.isArray(data.attachments) ? data.attachments : []);
        }
      }
    } catch { /* noop */ } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const options = buildBindingOptions(itemUUID, { artikelNummer, serialNumber, macAddress, ean });
    if (options.length < 2) {
      doUpload(file);
    } else {
      setPendingFile(file);
      setBindingOptions(options);
    }
  }

  function handleBindingConfirm(binding: BindingOption) {
    if (!pendingFile) return;
    doUpload(pendingFile, `${binding.type}:${binding.value}`);
    setPendingFile(null);
    setBindingOptions([]);
  }

  function handleBindingCancel() {
    setPendingFile(null);
    setBindingOptions([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDelete(id: number) {
    await fetch(`/api/item/${encodeURIComponent(itemUUID)}/attachments/${id}`, { method: 'DELETE' });
    onChanged(attachments.filter((a: any) => a.Id !== id));
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <>
      {pendingFile && (
        <AttachmentBindingModal
          file={pendingFile}
          options={bindingOptions}
          onConfirm={handleBindingConfirm}
          onCancel={handleBindingCancel}
        />
      )}
      <div className="card">
        <h3>Anhänge ({attachments.length})</h3>
        {attachments.length > 0 && (
          <table className="details">
            <tbody>
              {attachments.map((att: any) => {
                const binding = parseBindingLabel(att.Label);
                return (
                  <tr key={att.Id}>
                    <td>
                      <a href={`/media/${att.FilePath}`} target="_blank" rel="noopener noreferrer">
                        {att.FileName}
                      </a>
                    </td>
                    <td className="muted" style={{ fontSize: '0.85em' }}>
                      {binding ? (
                        bindingBadgeText(binding.type)
                      ) : att.Label ? (
                        att.Label
                      ) : null}
                    </td>
                    <td className="muted">{att.MimeType || ''}</td>
                    <td className="muted">{formatBytes(att.FileSize)}</td>
                    <td className="muted">{att.CreatedAt ? att.CreatedAt.slice(0, 10) : ''}</td>
                    <td>
                      <button
                        type="button"
                        className="sml-btn btn"
                        onClick={() => handleDelete(att.Id)}
                        title="Anhang löschen"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: '8px' }}>
          <input
            ref={fileRef}
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ display: 'none' }}
            id={`attachment-upload-${itemUUID}`}
          />
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {uploading ? 'Lädt hoch…' : '+ Datei anhängen'}
          </button>
        </div>
      </div>
    </>
  );
}
