import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import type { Delegate, FinancialAdjustment, Paginated } from '../../api/types';
import { useAsync, useListState, validationMessages } from '../../lib/hooks';
import {
  adjustmentDirectionLabel,
  adjustmentTypeLabel,
  formatAmount,
  formatDate,
  receiptNumberOf,
} from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  SelectInput,
  TextInput,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

type Mode = 'REFUND' | 'CORRECTION';

const modeLabel: Record<Mode, string> = {
  REFUND: 'استرداد مبلغ للمندوب',
  CORRECTION: 'تسوية على حساب المندوب',
};

const AdjustmentModal = ({
  mode,
  delegates,
  onClose,
  onDone,
}: {
  mode: Mode;
  delegates: Delegate[];
  onClose: () => void;
  onDone: () => void;
}) => {
  const toast = useToast();
  const [delegateId, setDelegateId] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [reason, setReason] = useState('');
  const [refundDate, setRefundDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      if (mode === 'REFUND') {
        await api.post('/finance/refunds', {
          delegateId,
          amount,
          reason: reason.trim(),
          refundDate,
        });
        toast.success('تم تسجيل الاسترداد');
      } else {
        await api.post('/finance/corrections', {
          delegateId,
          amount,
          direction,
          reason: reason.trim(),
        });
        toast.success('تم تسجيل التسوية المالية');
      }
      onDone();
      onClose();
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر تنفيذ العملية'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={modeLabel[mode]}
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || !delegateId || !amount || reason.trim().length < 3}
          >
            {submitting ? 'جارٍ التنفيذ...' : 'تنفيذ'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <div className="alert warning">
        العملية مالية غير قابلة للحذف، وتُسجَّل في حساب المندوب مع سبب إلزامي.
      </div>
      <Field label="المندوب" required error={fieldErrors.delegateId}>
        <SelectInput value={delegateId} onChange={(event) => setDelegateId(event.target.value)}>
          <option value="">اختر المندوب</option>
          {delegates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.phone}
            </option>
          ))}
        </SelectInput>
      </Field>
      <div className="form-grid">
        <Field label="المبلغ" required error={fieldErrors.amount}>
          <TextInput
            className="input-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            dir="ltr"
            inputMode="decimal"
            latinDigits
            placeholder="0.00"
          />
        </Field>
        {mode === 'REFUND' ? (
          <Field label="تاريخ الاسترداد" required error={fieldErrors.refundDate}>
            <TextInput
              type="date"
              value={refundDate}
              onChange={(event) => setRefundDate(event.target.value)}
              dir="ltr"
            />
          </Field>
        ) : (
          <Field label="نوع التسوية" required error={fieldErrors.direction}>
            <SelectInput
              value={direction}
              onChange={(event) => setDirection(event.target.value as 'INCREASE' | 'DECREASE')}
            >
              <option value="INCREASE">{adjustmentDirectionLabel.INCREASE}</option>
              <option value="DECREASE">{adjustmentDirectionLabel.DECREASE}</option>
            </SelectInput>
          </Field>
        )}
      </div>
      <Field label="السبب" required error={fieldErrors.reason} hint="3 أحرف على الأقل">
        <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {mode === 'REFUND' ? (
        <p className="muted small" style={{ margin: 0 }}>
          لا يمكن استرداد مبلغ أكبر من رصيد المندوب الحالي (له رصيد).
        </p>
      ) : null}
    </Modal>
  );
};

export const AdjustmentsPage = () => {
  const list = useListState();
  const [modal, setModal] = useState<Mode | null>(null);

  const delegates = useAsync<Paginated<Delegate>>(
    (signal) => api.get<Paginated<Delegate>>('/delegates', { pageSize: 200 }, signal),
    [],
  );

  const adjustments = useAsync<Paginated<FinancialAdjustment>>(
    (signal) =>
      api.get<Paginated<FinancialAdjustment>>(
        '/finance/adjustments',
        { page: list.page, pageSize: list.pageSize },
        signal,
      ),
    [list.page, list.pageSize],
  );

  return (
    <div className="page">
      <PageHeader
        title="التسويات والاستردادات"
        subtitle="عمليات مدير النظام على حسابات المناديب. إلغاء الدفعات يظهر في سجل الدفعات وسجل الحركات المالية"
        actions={
          <>
            <button type="button" className="btn secondary" onClick={() => setModal('CORRECTION')}>
              <Icon name="plus" size={15} /> تسوية
            </button>
            <button type="button" className="btn" onClick={() => setModal('REFUND')}>
              <Icon name="wallet" size={15} /> استرداد
            </button>
          </>
        }
      />

      <div className="card">
        {adjustments.loading ? <LoadingBlock /> : null}
        {adjustments.error ? <EmptyState title="تعذر تحميل التسويات والاستردادات" /> : null}
        {adjustments.data ? (
          adjustments.data.items.length === 0 ? (
            <EmptyState
              title="لا توجد تسويات أو استردادات"
              description="تظهر هنا عمليات الاسترداد والتسويات التي يسجلها مدير النظام"
            />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data stack-on-phone stack-on-tablet">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>النوع</th>
                      <th>المندوب</th>
                      <th className="num">المبلغ</th>
                      <th>الأثر على الحساب</th>
                      <th className="wrap">السبب</th>
                      <th>بواسطة</th>
                      <th>مرتبط بـ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.data.items.map((row) => (
                      <tr key={row.id}>
                        <td className="mono">{formatDate(row.effectiveDate)}</td>
                        <td>
                          <Badge tone={row.type === 'REFUND' ? 'info' : 'warning'}>{adjustmentTypeLabel[row.type]}</Badge>
                          {row.direction ? <div className="muted small">{adjustmentDirectionLabel[row.direction]}</div> : null}
                        </td>
                        <td className="primary-cell">{row.delegate.name}</td>
                        <td className="num mono">
                          <strong>{formatAmount(row.amount)}</strong>
                        </td>
                        <td>{row.effect === 'INCREASE' ? 'يزيد المتبقي عليه' : 'يقلل المتبقي عليه'}</td>
                        <td className="wrap">{row.reason}</td>
                        <td>{row.performedBy.fullName}</td>
                        <td className="mono">{row.relatedPayment ? receiptNumberOf(row.relatedPayment) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...adjustments.data.meta} onPage={list.setPage} />
            </>
          )
        ) : null}
      </div>

      {modal ? (
        <AdjustmentModal
          mode={modal}
          delegates={delegates.data?.items ?? []}
          onClose={() => setModal(null)}
          onDone={adjustments.reload}
        />
      ) : null}
    </div>
  );
};
