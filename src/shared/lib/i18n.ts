import ru from '../../messages/ru.json';

type MessageSchema = typeof ru;

export function getTranslation(path: string): string {
  const parts = path.split('.');
  let current: unknown = ru;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

export function useTranslation() {
  return {
    t: (path: string) => getTranslation(path),
    messages: ru as MessageSchema,
  };
}
