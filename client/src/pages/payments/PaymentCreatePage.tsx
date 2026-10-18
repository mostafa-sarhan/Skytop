import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage, postForm } from '../../api/client';
import type { Delegate, DelegateAccount, DelegateDetail, Paginated, PaymentRow } from '../../api/types';
import { useAsync, validationMessages } from '../../lib/hooks';
import {
  formatAmount,
  formatDate,
  paymentMethodLabel,
  transferTypeLabel,
} from '../../lib/format';
import { Breadcrumbs, Field, Icon, PageHeader, SelectInput, Skeleton, TextInput } from '../../ui/primitives';
import { DocumentPicker } from '../../components/DocumentPicker';
import { useToast } from '../../ui/Toast';
import {
  AccountStatusBadge,
  AccountSummaryList,
  ReceiptScanLink,
} from '../../components/DelegateAccount';

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Records a payment the delegate already made against a physical company
 * paper receipt. The receipt number is copied from the paper receipt and a
 * scan/photo of it is required. The system never issues its own receipt.
 */
export const PaymentCreatePage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  // From a delegate account (/accounts/:delegateId/payments/new) the delegate
  // is fixed and the user returns to that account after saving.
  const { delegateId: accountDelegateId } = useParams();
  const fromAccount = Boolean(accountDelegateId);
  const preselected = accountDelegateId ?? params.get('delegateId') ?? '';

  const [delegateId, setDelegateId] = useState(preselected);
  const [amount, setAmount] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => today());
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [transferType, setTransferType] = useState<'INSTAPAY' | 'BANK_TRANSFER'>('INSTAPAY');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receiptScan, setReceiptScan] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<PaymentRow | null>(null);

  // Picker options only when the delegate is not fixed by the page.
  const delegates = useAsync<Paginated<Delegate> | null>(
    (signal) =>
      fromAccount
        ? Promise.resolve(null)
        : api.get<Paginated<Delegate>>('/delegates', { pageSize: 200, status: 'ACTIVE' }, signal),
    [fromAccount],
  );
  const fixedDelegate = useAsync<DelegateDetail | null>(
    (signal) =>
      fromAccount ? api.get<DelegateDetail>(`/delegates/${accountDelegateId}`, undefined, signal) : Promise.resolve(null),
    [accountDelegateId],
  );

  const account = useAsync<DelegateAccount | null>(
    (signal) =>
      delegateId
        ? api.get<DelegateAccount>(`/finance/delegates/${delegateId}/balance`, undefined, signal)
        : Promise.resolve(null),
    [delegateId, created],
  );

  const resetForNext = () => {
    setCreated(null);
    setAmount('');
    setReceiptNumber('');
    setReferenceNumber('');
    setReceiptScan(null);
    setNotes('');
  };

  const submit = async () => {
    setError('');
    setFieldErrors({});
    if (!receiptScan) {
      setFieldErrors({ receiptScan: 'يجب إرفاق صورة أو مسح ضوئي للإيصال الورقي' });
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('delegateId', delegateId);
      form.append('amount', amount.trim());
      form.append('receiptNumber', receiptNumber);
      form.append('paymentDate', paymentDate);
      form.append('paymentMethod', paymentMethod);
      if (paymentMethod === 'TRANSFER') {
        form.append('transferType', transferType);
        if (referenceNumber.trim()) form.append('referenceNumber', referenceNumber.trim());
      }
      if (notes.trim()) form.append('notes', notes.trim());
      form.append('file', receiptScan);

      const payment = await postForm<PaymentRow>('/payments', form);
      toast.success('تم تسجيل الدفعة بنجاح');
      if (fromAccount) {
        // Back to the account: it reloads its totals and highlights this payment.
        navigate(`/accounts/${accountDelegateId}`, { state: { paymentId: payment.id } });
        return;
      }
      setCreated(payment);
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر تسجيل الدفعة'));
    } finally {
      setSubmitting(false);
    }
  };

  const delegateName = (id: string) =>
    fixedDelegate.data?.name ?? delegates.data?.items.find((item) => item.id === id)?.name ?? '—';
  const backPath = fromAccount ? `/accounts/${accountDelegateId}` : '/payments';

  if (created) {
    return (
      <div className="page">
        <PageHeader title="تم تسجيل الدفعة بنجاح" />
        <div className="card" style={{ maxWidth: 620 }}>
          <div className="card-body stack">
            <div className="alert success">تم تسجيل الدفعة بنجاح</div>
            <dl className="kv">
              <dt>رقم الإيصال</dt>
              <dd className="mono">
                <strong>{created.receiptNumber}</strong>
              </dd>
              <dt>المبلغ</dt>
              <dd className="mono">{formatAmount(created.amount)}</dd>
              <dt>المندوب</dt>
              <dd>{created.delegate?.name ?? delegateName(created.delegateId)}</dd>
              <dt>التاريخ</dt>
              <dd className="mono">{formatDate(created.paymentDate)}</dd>
              <dt>طريقة الدفع</dt>
              <dd>
                {paymentMethodLabel[created.paymentMethod]}
                {created.transferType ? ` — ${transferTypeLabel[created.transferType]}` : ''}
              </dd>
              <dt>صورة الإيصال</dt>
              <dd>
                <ReceiptScanLink payment={created} />
              </dd>
            </dl>
            {account.data ? (
              <div className="stack tight">
                <div className="section-title">
                  حساب المندوب بعد الدفعة <AccountStatusBadge status={account.data.status} />
                </div>
                <AccountSummaryList summary={account.data} />
              </div>
            ) : null}
            <div className="row">
              <button type="button" className="btn" onClick={resetForNext}>
                تسجيل دفعة أخرى
              </button>
              <button type="button" className="btn secondary" onClick={() => navigate('/payments')}>
                سجل الدفعات
              </button>
              <Link className="btn ghost" to={`/accounts/${created.delegateId}`}>
                حساب المندوب
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {fromAccount ? (
        <Breadcrumbs
          items={[
            { label: 'حسابات المناديب', to: '/accounts' },
            { label: fixedDelegate.data?.name ?? 'المندوب', to: backPath },
            { label: 'تسجيل دفعة' },
          ]}
        />
      ) : null}
      <PageHeader
        title="تسجيل دفعة"
        subtitle="سجّل الدفعة بعد تسليم المندوب الإيصال الورقي من دفتر إيصالات الشركة"
        actions={
          <Link className="btn secondary" to={backPath}>
            {fromAccount ? 'رجوع لحساب المندوب' : 'رجوع لسجل الدفعات'}
          </Link>
        }
      />

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-body">
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {error ? <div className="alert error">{error}</div> : null}

              <section>
                <div className="section-title">
                  <Icon name="wallet" size={16} /> بيانات الدفعة
                </div>
                <div className="form-grid">
                  {fromAccount ? (
                    <Field label="المندوب" className="full">
                      <div style={{ padding: '6px 0' }}>
                        {fixedDelegate.data ? (
                          <strong>
                            {fixedDelegate.data.name} — <span className="mono">{fixedDelegate.data.phone}</span>
                          </strong>
                        ) : (
                          <Skeleton width={180} height={16} />
                        )}
                      </div>
                    </Field>
                  ) : (
                    <Field label="المندوب" required className="full" error={fieldErrors.delegateId}>
                      <SelectInput
                        value={delegateId}
                        onChange={(event) => setDelegateId(event.target.value)}
                      >
                        <option value="">اختر المندوب</option>
                        {(delegates.data?.items ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} — {item.phone}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  )}
                  <Field label="المبلغ" required error={fieldErrors.amount}>
                    <TextInput
                      className="input-amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </Field>
                  <Field
                    label="رقم الإيصال"
                    required
                    hint="الرقم المطبوع على الإيصال الورقي"
                    error={fieldErrors.receiptNumber}
                  >
                    <TextInput
                      value={receiptNumber}
                      onChange={(event) => setReceiptNumber(event.target.value)}
                      dir="ltr"
                      maxLength={40}
                    />
                  </Field>
                  <Field label="تاريخ الدفع" required error={fieldErrors.paymentDate}>
                    <TextInput
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                      dir="ltr"
                    />
                  </Field>
                  <Field label="طريقة الدفع" required error={fieldErrors.paymentMethod}>
                    <SelectInput
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as 'CASH' | 'TRANSFER')}
                    >
                      <option value="CASH">نقداً</option>
                      <option value="TRANSFER">تحويل</option>
                    </SelectInput>
                  </Field>

                  {paymentMethod === 'TRANSFER' ? (
                    <>
                      <Field label="نوع التحويل" required error={fieldErrors.transferType}>
                        <SelectInput
                          value={transferType}
                          onChange={(event) =>
                            setTransferType(event.target.value as 'INSTAPAY' | 'BANK_TRANSFER')
                          }
                        >
                          <option value="INSTAPAY">انستاباي</option>
                          <option value="BANK_TRANSFER">تحويل بنكي</option>
                        </SelectInput>
                      </Field>
                      <Field label="رقم مرجعي للتحويل" error={fieldErrors.referenceNumber}>
                        <TextInput
                          value={referenceNumber}
                          onChange={(event) => setReferenceNumber(event.target.value)}
                          dir="ltr"
                        />
                      </Field>
                    </>
                  ) : null}
                </div>
              </section>

              <section>
                <div className="section-title">
                  <Icon name="file" size={16} /> صورة / مسح الإيصال
                </div>
                <DocumentPicker
                  name="file"
                  label="صورة الإيصال الورقي"
                  required
                  file={receiptScan}
                  onChange={(file) => {
                    setReceiptScan(file);
                    setFieldErrors((current) => ({ ...current, receiptScan: '', file: '' }));
                  }}
                  error={fieldErrors.receiptScan || fieldErrors.file}
                />
              </section>

              <section>
                <div className="form-grid">
                  <Field label="ملاحظات" className="full" error={fieldErrors.notes}>
                    <textarea
                      className="textarea"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <div className="alert info small">
                بعد الحفظ لا يمكن تعديل الدفعة أو حذفها. أي تصحيح يتم عن طريق مدير النظام فقط.
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn"
                  disabled={submitting || !delegateId || !amount || !receiptNumber.trim() || !receiptScan}
                >
                  {submitting ? 'جارٍ التسجيل...' : 'تسجيل الدفعة'}
                </button>
                <Link className="btn secondary" to="/payments">
                  إلغاء
                </Link>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>حساب المندوب</h3>
            {account.data ? <AccountStatusBadge status={account.data.status} /> : null}
          </div>
          <div className="card-body">
            {!delegateId ? (
              <p className="muted">اختر المندوب لعرض المطلوب منه والمدفوع قبل تسجيل الدفعة.</p>
            ) : account.loading ? (
              <p className="muted">جارٍ تحميل حساب المندوب...</p>
            ) : account.data ? (
              <div className="stack tight">
                <dl className="kv">
                  <dt>المندوب</dt>
                  <dd>{delegateName(delegateId)}</dd>
                </dl>
                <AccountSummaryList summary={account.data} />
              </div>
            ) : (
              <p className="muted">تعذر تحميل حساب المندوب.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
