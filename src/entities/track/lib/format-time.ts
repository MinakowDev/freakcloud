export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationMs(ms: number): string {
  return formatTime(ms / 1000);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Б';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} ГБ`;
  }
  return `${mb.toFixed(1)} МБ`;
}
