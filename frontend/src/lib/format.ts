export function formatDateTime(s: string | Date): string {
  try {
    const d = typeof s === 'string' ? new Date(s) : s;
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleString('de-CH', {
      hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit', year: '2-digit'
    });
  } catch (err) {
    console.error('Failed to format date', err);
    return String(s);
  }
}

export function formatDate(s: string | Date): string {
  try {
    const d = typeof s === 'string' ? new Date(s) : s;
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString('de-CH', {
      hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch (err) {
    console.error('Failed to format date', err);
    return String(s);
  }
}
