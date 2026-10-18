import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DocumentType } from '../api/types';
import { documentLabel } from '../lib/documents';
import { Icon, Modal } from '../ui/primitives';
import { useToast } from '../ui/Toast';
import { PilgrimDocumentCard } from './PilgrimDocumentCard';

export interface IncompletePilgrim {
  pilgrimId: string;
  name: string;
  tripName: string;
  delegateName: string;
  hasPassportImage: boolean;
  hasPersonalPhoto: boolean;
}

/**
 * استكمال النواقص — upload only the documents this pilgrim is missing, straight
 * from the missing-documents report. Each upload goes through the same card
 * (and the same protected endpoint + checks) as the pilgrim file; the report
 * reloads after every upload and the dialog closes once nothing is missing.
 */
export const CompleteDocumentsModal = ({
  pilgrim,
  onUploaded,
  onClose,
}: {
  pilgrim: IncompletePilgrim;
  /** Called after each successful upload (refresh the report + counters). */
  onUploaded: () => void;
  onClose: () => void;
}) => {
  const toast = useToast();
  const [missing] = useState<DocumentType[]>(() => [
    ...(!pilgrim.hasPassportImage ? (['PASSPORT_IMAGE'] as const) : []),
    ...(!pilgrim.hasPersonalPhoto ? (['PERSONAL_PHOTO'] as const) : []),
  ]);
  const [uploaded, setUploaded] = useState<DocumentType[]>([]);
  const remaining = missing.filter((type) => !uploaded.includes(type));

  const markUploaded = (type: DocumentType) => {
    const next = [...uploaded, type];
    setUploaded(next);
    onUploaded();
    if (missing.every((t) => next.includes(t))) {
      toast.success(`اكتمل ملف ${pilgrim.name}`);
      onClose();
    }
  };

  return (
    <Modal
      title={`استكمال النواقص — ${pilgrim.name}`}
      onClose={onClose}
      footer={
        <>
          <Link className="btn ghost" to={`/pilgrims/${pilgrim.pilgrimId}`}>
            فتح ملف المعتمر
          </Link>
          <button type="button" className="btn secondary" onClick={onClose}>
            إغلاق
          </button>
        </>
      }
    >
      <div className="stack complete-docs">
        <p className="muted small">
          {pilgrim.tripName} — {pilgrim.delegateName}
        </p>
        {uploaded.map((type) => (
          <div key={type} className="alert success" role="status">
            <Icon name="check" size={14} /> تم رفع {documentLabel[type]}
          </div>
        ))}
        {remaining.map((type) => (
          <PilgrimDocumentCard
            key={type}
            pilgrimId={pilgrim.pilgrimId}
            type={type}
            document={undefined}
            canEdit
            onChanged={() => markUploaded(type)}
          />
        ))}
      </div>
    </Modal>
  );
};
