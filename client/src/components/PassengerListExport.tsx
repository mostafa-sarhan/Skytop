import { useState } from 'react';
import { download } from '../api/client';
import { Icon, Modal } from '../ui/primitives';

/**
 * كشف المعتمرين export: the list always has م / الاسم / المهنة / العنوان;
 * passport number and national ID are optional columns.
 */
export const PassengerListExport = ({
  title,
  description,
  endpoint,
  query,
  onClose,
}: {
  title: string;
  description: string;
  /** e.g. /reports/delegate-trip-pilgrims — `/pdf` and `/excel` are appended. */
  endpoint: string;
  query: Record<string, string>;
  onClose: () => void;
}) => {
  const [passport, setPassport] = useState(true);
  const [nationalId, setNationalId] = useState(true);
  const params = { ...query, passport: passport ? '1' : '0', nationalId: nationalId ? '1' : '0' };

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إغلاق
          </button>
          <button type="button" className="btn secondary" onClick={() => download(`${endpoint}/excel`, params)}>
            <Icon name="download" size={15} /> Excel
          </button>
          <button type="button" className="btn" onClick={() => download(`${endpoint}/pdf`, params)}>
            <Icon name="download" size={15} /> تحميل PDF للطباعة
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        {description}
      </p>
      <div className="stack tight">
        <span className="small">
          الأعمدة الثابتة: <strong>م، الاسم، المهنة، العنوان</strong>
        </span>
        <label className="checkbox">
          <input type="checkbox" checked={passport} onChange={(event) => setPassport(event.target.checked)} />
          رقم جواز السفر
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={nationalId} onChange={(event) => setNationalId(event.target.checked)} />
          الرقم القومي
        </label>
      </div>
    </Modal>
  );
};
