import React from 'react';
import AttachmentBindingModal, { BindingOption } from './AttachmentBindingModal';
import type { ExternalDocSummary } from '../../../models/external-doc';

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

type UnifiedRow =
  | { kind: 'instance'; att: any }
  | { kind: 'external'; dirName: string; docType: string | null; deletable: boolean; fileName: string; url: string };

// Matches labels written on upload: "type:value"
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

function identValueForType(type: string, ids: AttachmentIdentifiers): string | null {
  switch (type) {
    case 'serialNumber': return ids.serialNumber ?? null;
    case 'macAddress': return ids.macAddress ?? null;
    case 'ean': return ids.ean ?? null;
    default: return null;
  }
}

function buildBindingOptions(itemUUID: string, ids: AttachmentIdentifiers, externalDocs: ExternalDocSummary[]): BindingOption[] {
  const options: BindingOption[] = [
    { type: 'instance', label: 'Diese Instanz', value: itemUUID, endpoint: { kind: 'instance' } }
  ];
  if (ids.artikelNummer) {
    options.push({ type: 'artikel', label: 'Artikel (Produktebene)', value: ids.artikelNummer, endpoint: { kind: 'instance' } });
  }
  for (const dir of externalDocs) {
    if (!dir.available || !dir.writable) continue;
    const identValue = identValueForType(dir.identifierType, ids);
    if (!identValue) continue;
    options.push({
      type: `external:${dir.name}`,
      label: dir.docType || dir.name,
      value: identValue,
      endpoint: { kind: 'external', dirName: dir.name }
    });
  }
  return options;
}

function buildRows(attachments: any[], externalDocs: ExternalDocSummary[]): UnifiedRow[] {
  const rows: UnifiedRow[] = attachments.map(att => ({ kind: 'instance', att }));
  for (const dir of externalDocs) {
    if (!dir.available) continue;
    for (const file of dir.files) {
      rows.push({
        kind: 'external',
        dirName: dir.name,
        docType: dir.docType,
        deletable: dir.deletable,
        fileName: file.fileName,
        url: file.url
      });
    }
  }
  return rows;
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
  const [externalDocs, setExternalDocs] = React.useState<ExternalDocSummary[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch(`/api/items/${encodeURIComponent(itemUUID)}/external-docs`)
      .then(r => r.ok ? r.json() : { docs: [] })
      .then(data => setExternalDocs(Array.isArray(data.docs) ? data.docs : []))
      .catch(() => setExternalDocs([]));
  }, [itemUUID]);

  async function doUpload(file: File, binding: BindingOption) {
    setUploading(true);
    try {
      if (binding.endpoint.kind === 'instance') {
        const label = binding.type === 'instance' ? null : `${binding.type}:${binding.value}`;
        const headers: Record<string, string> = {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': file.name
        };
        if (label) headers['X-Label'] = label;
        const res = await fetch(`/api/item/${encodeURIComponent(itemUUID)}/attachments`, {
          method: 'POST', headers, body: file
        });
        if (res.ok) {
          const listRes = await fetch(`/api/item/${encodeURIComponent(itemUUID)}/attachments`);
          if (listRes.ok) {
            const data = await listRes.json();
            onChanged(Array.isArray(data.attachments) ? data.attachments : []);
          }
        }
      } else {
        const { dirName } = binding.endpoint;
        const res = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/external-docs/${encodeURIComponent(dirName)}`, {
          method: 'POST',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Filename': file.name
          },
          body: file
        });
        if (res.ok) {
          const listRes = await fetch(`/api/items/${encodeURIComponent(itemUUID)}/external-docs`);
          if (listRes.ok) {
            const data = await listRes.json();
            setExternalDocs(Array.isArray(data.docs) ? data.docs : []);
          }
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
    const ids = { artikelNummer, serialNumber, macAddress, ean };
    const options = buildBindingOptions(itemUUID, ids, externalDocs);
    // only show the binding choice modal when there is at least one external dir to route to;
    // without ALT_DOC_DIRS all options share the same endpoint so the choice adds no value
    const hasExternalOption = options.some(o => o.endpoint.kind === 'external');
    if (!hasExternalOption) {
      doUpload(file, options[0]);
    } else {
      setPendingFile(file);
      setBindingOptions(options);
    }
  }

  function handleBindingConfirm(binding: BindingOption) {
    if (!pendingFile) return;
    doUpload(pendingFile, binding);
    setPendingFile(null);
    setBindingOptions([]);
  }

  function handleBindingCancel() {
    setPendingFile(null);
    setBindingOptions([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleInstanceDelete(id: number) {
    await fetch(`/api/item/${encodeURIComponent(itemUUID)}/attachments/${id}`, { method: 'DELETE' });
    onChanged(attachments.filter((a: any) => a.Id !== id));
  }

  async function handleExternalDelete(dirName: string, fileName: string) {
    await fetch(
      `/api/items/${encodeURIComponent(itemUUID)}/external-docs/${encodeURIComponent(dirName)}/${encodeURIComponent(fileName)}`,
      { method: 'DELETE' }
    );
    setExternalDocs(prev => prev.map(dir =>
      dir.name !== dirName ? dir : {
        ...dir,
        files: dir.files.filter(f => f.fileName !== fileName),
        fileCount: dir.fileCount - 1
      }
    ));
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const rows = buildRows(attachments, externalDocs);

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
        <h3>Anhänge ({rows.length})</h3>
        {rows.length > 0 && (
          <table className="details">
            <tbody>
              {rows.map((row, idx) => {
                if (row.kind === 'instance') {
                  const att = row.att;
                  const binding = parseBindingLabel(att.Label);
                  return (
                    <tr key={`i-${att.Id}`}>
                      <td>
                        <a href={`/media/${att.FilePath}`} target="_blank" rel="noopener noreferrer">
                          {att.FileName}
                        </a>
                      </td>
                      <td className="muted" style={{ fontSize: '0.85em' }}>
                        {binding ? bindingBadgeText(binding.type) : att.Label || null}
                      </td>
                      <td className="muted">{att.MimeType || ''}</td>
                      <td className="muted">{formatBytes(att.FileSize)}</td>
                      <td className="muted">{att.CreatedAt ? att.CreatedAt.slice(0, 10) : ''}</td>
                      <td>
                        <button
                          type="button"
                          className="sml-btn btn"
                          onClick={() => handleInstanceDelete(att.Id)}
                          title="Anhang löschen"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={`e-${idx}`}>
                    <td>
                      <a href={row.url} target="_blank" rel="noopener noreferrer">
                        {row.fileName}
                      </a>
                    </td>
                    <td className="muted" style={{ fontSize: '0.85em' }}>
                      {row.docType || row.dirName}
                    </td>
                    <td className="muted" colSpan={3} />
                    <td>
                      {row.deletable && (
                        <button
                          type="button"
                          className="sml-btn btn"
                          onClick={() => handleExternalDelete(row.dirName, row.fileName)}
                          title="Datei löschen"
                        >
                          ✕
                        </button>
                      )}
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
