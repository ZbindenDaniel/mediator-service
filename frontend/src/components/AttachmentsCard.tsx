import React from 'react';

interface AttachmentsCardProps {
  itemUUID: string;
  attachments: any[];
  onChanged: (next: any[]) => void;
}

export default function AttachmentsCard({ itemUUID, attachments, onChanged }: AttachmentsCardProps) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/item/${encodeURIComponent(itemUUID)}/attachments`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': file.name
        },
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
    <div className="card grid-span-2">
      <h3>Anhänge ({attachments.length})</h3>
      {attachments.length > 0 && (
        <table className="details">
          <tbody>
            {attachments.map((att: any) => (
              <tr key={att.Id}>
                <td>
                  <a href={`/media/${att.FilePath}`} target="_blank" rel="noopener noreferrer">
                    {att.Label || att.FileName}
                  </a>
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
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: '8px' }}>
        <input
          ref={fileRef}
          type="file"
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: 'none' }}
          id={`attachment-upload-${itemUUID}`}
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {uploading ? 'Lädt hoch…' : '+ Datei anhängen'}
        </button>
      </div>
    </div>
  );
}
