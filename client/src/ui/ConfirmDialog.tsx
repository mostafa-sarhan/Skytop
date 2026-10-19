import { useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { Modal } from './primitives';

/**
 * Confirmation for sensitive actions (the app never uses window.confirm /
 * alert / prompt). Focus starts on «رجوع» for destructive actions; while the
 * action runs the dialog cannot be dismissed and the confirm button cannot be
 * pressed twice. A failure stays in the dialog so the user can retry.
 */
export const ConfirmDialog = ({
  title,
  children,
  confirmLabel,
  busyLabel = 'جارٍ التنفيذ...',
  cancelLabel = 'رجوع',
  tone = 'danger',
  onConfirm,
  onClose,
}: {
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Runs the action; the dialog closes when it resolves. */
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'تعذر تنفيذ العملية'));
      running.current = false;
      setBusy(false);
    }
  };

  const danger = tone === 'danger';
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="narrow"
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy} data-autofocus={danger ? '' : undefined}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn${danger ? ' danger' : ''}`}
            onClick={() => void run()}
            disabled={busy}
            aria-busy={busy || undefined}
            data-autofocus={danger ? undefined : ''}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-body">{children}</div>
      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : null}
    </Modal>
  );
};
