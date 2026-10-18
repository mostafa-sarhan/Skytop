import type { DocumentType } from '../api/types';

/** Same types and limit the API accepts for pilgrim documents. */
export const ACCEPTED_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export const documentLabel: Record<DocumentType, string> = {
  PASSPORT_IMAGE: 'صورة جواز السفر',
  PERSONAL_PHOTO: 'الصورة الشخصية',
};

/** Local check before upload (the server re-validates). Returns an error or null. */
export const documentFileError = (file: File): string | null => {
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) return 'نوع الملف غير مدعوم، المسموح: JPG, PNG, WEBP, PDF';
  if (file.size > MAX_DOCUMENT_BYTES) return 'حجم الملف يتجاوز الحد المسموح (8 ميجابايت)';
  return null;
};
