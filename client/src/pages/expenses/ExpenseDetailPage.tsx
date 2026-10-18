import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage, fileUrl } from '../../api/client';
import type { Expense } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useAsync, validationMessages } from '../../lib/hooks';
import {
  expenseCategoryLabel,
  expenseStatusLabel,
  formatAmount,
  formatDate,
  formatDateTime,
  formatFileSize,
  paymentMethodLabel,
  transferTypeLabel,
} from '../../lib/format';
import { Badge, Breadcrumbs, EmptyState, Field, Icon, LoadingBlock, Modal, PageHeader } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const VoidExpenseModal = ({ expense, onClose, onDone }: { expense: Expense; onClose: () => void; onDone: () => void }) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/expenses/${expense.id}/void`, { reason: reason.trim() });
      toast.success('تم إلغاء المصروف');
      onDone();
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر إلغاء المصروف'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="إلغاء مصروف"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            رجوع
          </button>
          <button type="button" className="btn danger" onClick={() => void submit()} disabled={submitting || reason.trim().length < 3}>
            {submitting ? 'جارٍ الإلغاء...' : 'تأكيد الإلغاء'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <div className="alert warning">
        يبقى المصروف ومرفقه في السجل معلَّماً «ملغى»، ولا يدخل في إجمالي المصروفات. لا يمكن التراجع عن الإلغاء.
      </div>
      <Field label="سبب الإلغاء" required hint="3 أحرف على الأقل" error={fieldErrors.reason}>
        <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </Modal>
  );
};

/** One expense: details, attachment, and (managers) the void action. */
export const ExpenseDetailPage = () => {
  const { id = '' } = useParams();
  const { isManager } = useAuth();
  const [voiding, setVoiding] = useState(false);
  const expense = useAsync<Expense>((signal) => api.get<Expense>(`/expenses/${id}`, undefined, signal), [id]);

  if (expense.loading && !expense.data)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (expense.error || !expense.data)
    return (
      <div className="page">
        <Breadcrumbs items={[{ label: 'المصروفات', to: '/expenses' }, { label: 'المصروف' }]} />
        <EmptyState icon="alert" title="تعذر تحميل المصروف" action={<Link className="btn secondary" to="/expenses">رجوع للمصروفات</Link>} />
      </div>
    );

  const e = expense.data;
  const voided = e.status === 'VOIDED';
  const attachmentPath = `/expenses/${e.id}/attachment`;
  const isImage = e.attachmentMimeType?.startsWith('image/');

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'المصروفات', to: '/expenses' }, { label: e.description }]} />
      <PageHeader
        title={e.description}
        subtitle={`${expenseCategoryLabel[e.category]} — ${formatDate(e.expenseDate)}`}
        actions={
          isManager && !voided ? (
            <button type="button" className="btn ghost danger-text" onClick={() => setVoiding(true)}>
              إلغاء المصروف
            </button>
          ) : undefined
        }
      />

      {voided ? (
        <div className="alert error" style={{ marginBottom: 16 }}>
          <div>
            <strong>هذا المصروف ملغى</strong> — لا يدخل في إجمالي المصروفات ويبقى في السجل.
            {isManager && e.voidReason ? (
              <dl className="kv compact" style={{ marginTop: 8 }}>
                <dt>سبب الإلغاء</dt>
                <dd>{e.voidReason}</dd>
                <dt>بواسطة</dt>
                <dd>{e.voidedBy?.fullName ?? '—'}</dd>
                <dt>التاريخ</dt>
                <dd className="mono">{e.voidedAt ? formatDateTime(e.voidedAt) : '—'}</dd>
              </dl>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-header">
            <h3>بيانات المصروف</h3>
            <Badge tone={voided ? 'danger' : 'success'}>{expenseStatusLabel[e.status]}</Badge>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>المبلغ</dt>
              <dd className={`mono${voided ? ' strike' : ''}`}>{formatAmount(e.amount)} جنيه</dd>
              <dt>التصنيف</dt>
              <dd>{expenseCategoryLabel[e.category]}</dd>
              <dt>تاريخ المصروف</dt>
              <dd className="mono">{formatDate(e.expenseDate)}</dd>
              <dt>طريقة الدفع</dt>
              <dd>
                {paymentMethodLabel[e.paymentMethod]}
                {e.transferType ? ` — ${transferTypeLabel[e.transferType]}` : ''}
              </dd>
              {e.referenceNumber ? (
                <>
                  <dt>الرقم المرجعي</dt>
                  <dd className="mono">{e.referenceNumber}</dd>
                </>
              ) : null}
              <dt>البيان</dt>
              <dd>{e.description}</dd>
              <dt>ملاحظات</dt>
              <dd className="pre-wrap">{e.notes || '—'}</dd>
              <dt>سجّله</dt>
              <dd>{e.createdBy.fullName}</dd>
              <dt>وقت التسجيل</dt>
              <dd className="mono">{formatDateTime(e.createdAt)}</dd>
            </dl>
          </div>
        </div>

        <div className="card doc-card">
          <div className="card-header">
            <h3>الفاتورة / الإيصال</h3>
            {e.hasAttachment ? <Badge tone="success">مرفقة</Badge> : <Badge>لا يوجد</Badge>}
          </div>
          <div className="card-body stack">
            {e.hasAttachment ? (
              <>
                {isImage ? (
                  <a href={fileUrl(attachmentPath)} target="_blank" rel="noreferrer" className="doc-preview">
                    <img src={fileUrl(attachmentPath)} alt="الفاتورة" loading="lazy" />
                  </a>
                ) : (
                  <div className="doc-preview is-file">
                    <Icon name="file" size={28} />
                    <span className="small muted">ملف PDF</span>
                  </div>
                )}
                <div>
                  <div className="doc-name" dir="auto">
                    {e.attachmentOriginalName}
                  </div>
                  {e.attachmentSizeBytes ? <div className="muted small">{formatFileSize(e.attachmentSizeBytes)}</div> : null}
                </div>
                <div className="row">
                  <a className="btn secondary sm" href={fileUrl(attachmentPath)} target="_blank" rel="noreferrer">
                    <Icon name="eye" size={14} /> عرض
                  </a>
                </div>
              </>
            ) : (
              <EmptyState icon="file" title="لم تُرفق فاتورة أو إيصال" />
            )}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <Link className="btn secondary" to="/expenses">
          <Icon name="arrow-right" size={15} /> رجوع للمصروفات
        </Link>
      </div>

      {voiding ? <VoidExpenseModal expense={e} onClose={() => setVoiding(false)} onDone={expense.reload} /> : null}
    </div>
  );
};
