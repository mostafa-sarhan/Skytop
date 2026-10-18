import { useEffect, useMemo, useRef, useState } from 'react';
import { api, download, errorMessage, fileUrl, uploadDocument } from '../api/client';
import type { DocumentType, PilgrimDocument } from '../api/types';
import { formatDateTime, formatFileSize } from '../lib/format';
import { Badge, Icon } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { ACCEPTED_DOCUMENT_TYPES, documentFileError, documentLabel } from '../lib/documents';

/**
 * One pilgrim document on the pilgrim file: preview, file details, view /
 * download, and upload / replace with a confirm step (same look and checks as
 * the Add Pilgrim picker). The passport image can be replaced but not removed.
 */
export const PilgrimDocumentCard = ({
  pilgrimId,
  type,
  document,
  canEdit,
  readOnlyReason,
  onChanged,
}: {
  pilgrimId: string;
  type: DocumentType;
  document: PilgrimDocument | undefined;
  canEdit: boolean;
  /** Shown instead of the upload actions when the file cannot be changed. */
  readOnlyReason?: string;
  onChanged: () => void;
}) => {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const label = documentLabel[type];
  const isPassport = type === 'PASSPORT_IMAGE';

  const pendingUrl = useMemo(
    () => (pending && pending.type.startsWith('image/') ? URL.createObjectURL(pending) : null),
    [pending],
  );
  useEffect(() => () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
  }, [pendingUrl]);

  const path = `/documents/${pilgrimId}/${type}`;
  const uploadedAt = document?.updatedAt ?? document?.createdAt;
  // The version query makes the preview refresh after a replace.
  const storedPreview =
    document && document.mimeType.startsWith('image/') ? fileUrl(path, { v: uploadedAt }) : null;

  const choose = (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const problem = documentFileError(file);
    setError(problem ?? '');
    setPending(problem ? null : file);
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await uploadDocument(`/pilgrims/${pilgrimId}/documents`, pending, { type });
      toast.success(document ? `تم استبدال ${label}` : `تم رفع ${label}`);
      setPending(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, 'تعذر رفع الملف'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`حذف ${label}؟`)) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/pilgrims/${pilgrimId}/documents/${type}`);
      toast.success(`تم حذف ${label}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, 'تعذر حذف الملف'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card doc-card" data-doc={type}>
      <div className="card-header">
        <h3>{label}</h3>
        {document ? (
          <Badge tone="success">مرفوعة</Badge>
        ) : (
          <Badge tone={isPassport ? 'danger' : 'warning'}>ناقصة</Badge>
        )}
      </div>
      <div className="card-body stack">
        {pending ? (
          <div className="upload-box is-filled">
            {pendingUrl ? (
              <img className="upload-preview" src={pendingUrl} alt={label} />
            ) : (
              <span className="upload-preview" aria-hidden="true">
                <Icon name="file" size={22} />
              </span>
            )}
            <div className="upload-meta">
              <div className="upload-title" dir="auto">
                {pending.name}
              </div>
              <div className="upload-hint">
                {formatFileSize(pending.size)} — {document ? 'ستحل محل الملف الحالي' : 'جاهز للرفع'}
              </div>
            </div>
            <div className="upload-actions">
              <button type="button" className="btn sm" onClick={() => void save()} disabled={busy}>
                <Icon name="check" size={14} /> {busy ? 'جارٍ الرفع...' : 'حفظ الملف'}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setPending(null)} disabled={busy}>
                إلغاء
              </button>
            </div>
          </div>
        ) : document ? (
          <>
            {storedPreview ? (
              <a href={fileUrl(path)} target="_blank" rel="noreferrer" className="doc-preview">
                <img src={storedPreview} alt={label} loading="lazy" />
              </a>
            ) : (
              <div className="doc-preview is-file">
                <Icon name="file" size={28} />
                <span className="small muted">ملف PDF</span>
              </div>
            )}
            <div>
              <div className="doc-name" dir="auto">
                {document.originalName}
              </div>
              <div className="muted small">
                {formatFileSize(document.sizeBytes)}
                {uploadedAt ? ` — آخر رفع ${formatDateTime(uploadedAt)}` : ''}
                {document.uploadedBy ? ` بواسطة ${document.uploadedBy.fullName}` : ''}
              </div>
            </div>
            <div className="row">
              <a className="btn secondary sm" href={fileUrl(path)} target="_blank" rel="noreferrer">
                <Icon name="eye" size={14} /> عرض
              </a>
              <button type="button" className="btn secondary sm" onClick={() => download(path)}>
                <Icon name="download" size={14} /> تنزيل
              </button>
              {canEdit ? (
                <button type="button" className="btn secondary sm" onClick={() => inputRef.current?.click()} disabled={busy}>
                  <Icon name="refresh" size={14} /> استبدال
                </button>
              ) : null}
              {canEdit && !isPassport ? (
                <button type="button" className="btn ghost sm" onClick={() => void remove()} disabled={busy}>
                  <Icon name="trash" size={14} /> حذف
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className={`upload-box doc-missing${isPassport ? ' is-required' : ''}`}>
            <span className="upload-preview" aria-hidden="true">
              <Icon name={isPassport ? 'alert' : 'file'} size={22} />
            </span>
            <div className="upload-meta">
              <div className="upload-title">لم تُرفع {label}</div>
              <div className="upload-hint">
                {isPassport
                  ? 'صورة جواز السفر مطلوبة — سجل قديم بدونها، ارفعها لاستكمال الملف'
                  : 'اختيارية — JPG أو PNG أو WEBP أو PDF حتى 8 ميجابايت'}
              </div>
            </div>
            {canEdit ? (
              <div className="upload-actions">
                <button type="button" className="btn secondary sm" onClick={() => inputRef.current?.click()}>
                  <Icon name="plus" size={14} /> رفع الملف
                </button>
              </div>
            ) : null}
          </div>
        )}

        {!canEdit && readOnlyReason ? <div className="muted small">{readOnlyReason}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_DOCUMENT_TYPES.join(',')}
          hidden
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </div>
    </div>
  );
};
