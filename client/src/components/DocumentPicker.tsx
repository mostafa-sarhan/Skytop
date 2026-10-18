import { useEffect, useMemo, useRef, useState } from 'react';
import { formatFileSize } from '../lib/format';
import { Icon } from '../ui/primitives';

/** Same types and limit the API accepts for pilgrim documents. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Selects one document before saving: shows the file name, size and a
 * thumbnail (images), with change / remove actions. Validates type and size
 * locally so obvious mistakes never reach the server (which re-validates).
 */
export const DocumentPicker = ({
  name,
  label,
  required = false,
  file,
  onChange,
  error,
  disabled = false,
}: {
  name: string;
  label: string;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState('');

  const previewUrl = useMemo(
    () => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pick = (selected: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!selected) return;
    if (!ACCEPTED.includes(selected.type)) {
      setLocalError('نوع الملف غير مدعوم، المسموح: JPG, PNG, WEBP, PDF');
      return;
    }
    if (selected.size > MAX_BYTES) {
      setLocalError('حجم الملف يتجاوز الحد المسموح (8 ميجابايت)');
      return;
    }
    setLocalError('');
    onChange(selected);
  };

  const shownError = localError || error;

  return (
    <div className="field">
      <label>
        {label} {required ? <span className="required">*</span> : null}{' '}
        <span className="muted small">— {required ? 'مطلوبة' : 'اختيارية'}</span>
      </label>
      <div className={`upload-box${file ? ' is-filled' : ''}${shownError ? ' has-error' : ''}`}>
        {previewUrl ? (
          <img className="upload-preview" src={previewUrl} alt={label} />
        ) : (
          <span className="upload-preview" aria-hidden="true">
            <Icon name="file" size={22} />
          </span>
        )}
        <div className="upload-meta">
          {file ? (
            <>
              <div className="upload-title" dir="auto">{file.name}</div>
              <div className="upload-hint">{formatFileSize(file.size)}</div>
            </>
          ) : (
            <>
              <div className="upload-title">لم يتم اختيار ملف</div>
              <div className="upload-hint">JPG أو PNG أو WEBP أو PDF — حتى 8 ميجابايت</div>
            </>
          )}
        </div>
        <div className="upload-actions">
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <Icon name={file ? 'refresh' : 'plus'} size={14} /> {file ? 'تغيير' : 'اختيار ملف'}
          </button>
          {file ? (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setLocalError('');
                onChange(null);
              }}
              disabled={disabled}
            >
              <Icon name="trash" size={14} /> إزالة
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={ACCEPTED.join(',')}
          hidden
          onChange={(event) => pick(event.target.files?.[0])}
        />
      </div>
      {shownError ? <span className="error">{shownError}</span> : null}
    </div>
  );
};
