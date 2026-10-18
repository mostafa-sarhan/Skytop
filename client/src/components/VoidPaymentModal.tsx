import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { PaymentRow } from '../api/types';
import { receiptNumberOf } from '../lib/format';
import { Field, Modal } from '../ui/primitives';
import { useToast } from '../ui/Toast';

/** Manager-only: void a payment with a reason (the API enforces the role). */
export const VoidPaymentModal = ({
  payment,
  onClose,
  onDone,
}: {
  payment: PaymentRow;
  onClose: () => void;
  onDone: () => void;
}) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/payments/${payment.id}/void`, { reason: reason.trim() });
      toast.success('تم إلغاء الدفعة وتحديث حساب المندوب');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'تعذر إلغاء الدفعة'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`إلغاء دفعة إيصال رقم ${receiptNumberOf(payment)}`}
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => void submit()}
            disabled={submitting || reason.trim().length < 3}
          >
            {submitting ? 'جارٍ الإلغاء...' : 'تأكيد إلغاء الدفعة'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <div className="alert warning">
        ستبقى الدفعة محفوظة في السجل بحالة «ملغاة» ولن تُحتسب ضمن المدفوع. يبقى رقم الإيصال محجوزاً
        ولا يمكن استخدامه مرة أخرى؛ أي دفعة بديلة تحتاج إيصالاً ورقياً جديداً. لا يمكن التراجع عن هذه العملية.
      </div>
      <Field label="سبب الإلغاء" required hint="3 أحرف على الأقل">
        <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Modal>
  );
};
