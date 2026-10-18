const toAsciiSlug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'download';

/**
 * HTTP headers must be Latin-1. Arabic file names travel in the RFC 5987
 * `filename*` parameter while a safe ASCII fallback keeps older clients happy.
 */
export const contentDisposition = (type: 'inline' | 'attachment', filename: string): string => {
  const ascii = toAsciiSlug(filename);
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};
