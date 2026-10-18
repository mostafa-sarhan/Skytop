import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, postForm } from '../../api/client';
import type { Expense, ExpenseCategory } from '../../api/types';
import { validationMessages } from '../../lib/hooks';
import { expenseCategoryLabel, paymentMethodLabel, transferTypeLabel } from '../../lib/format';
import { Breadcrumbs, Field, Icon, PageHeader, SelectInput, TextInput } from '../../ui/primitives';
import { DocumentPicker } from '../../components/DocumentPicker';
import { useToast } from '../../ui/Toast';

const today = (): string => new Date().toISOString().slice(0, 10);
const CATEGORIES = Object.keys(expenseCategoryLabel) as ExpenseCategory[];

/** إضافة مصروف — once saved an expense cannot be edited (only voided by a manager). */
export const ExpenseCreatePage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => today());
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [transferType, setTransferType] = useState<'INSTAPAY' | 'BANK_TRANSFER'>('INSTAPAY');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Same checks as the server, shown before sending.
  const localErrors = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!category) errors.category = 'اختر تصنيف المصروف';
    if (!amount.trim()) errors.amount = 'المبلغ مطلوب';
    else if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) errors.amount = 'يجب إدخال مبلغ رقمي صحيح بحد أقصى خانتين عشريتين';
    else if (Number(amount) <= 0) errors.amount = 'المبلغ يجب أن يكون أكبر من صفر';
    if (!expenseDate) errors.expenseDate = 'تاريخ المصروف مطلوب';
    if (description.trim().length < 2) errors.description = 'اكتب بيان المصروف (حرفان على الأقل)';
    return errors;
  };

  const submit = async () => {
    const errors = localErrors();
    setFieldErrors(errors);
    setError('');
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('category', category);
      form.append('amount', amount.trim());
      form.append('expenseDate', expenseDate);
      form.append('paymentMethod', paymentMethod);
      if (paymentMethod === 'TRANSFER') {
        form.append('transferType', transferType);
        if (referenceNumber.trim()) form.append('referenceNumber', referenceNumber.trim());
      }
      form.append('description', description.trim());
      if (notes.trim()) form.append('notes', notes.trim());
      if (attachment) form.append('file', attachment);
      const expense = await postForm<Expense>('/expenses', form);
      toast.success('تم تسجيل المصروف');
      navigate(`/expenses/${expense.id}`, { state: { created: true } });
    } catch (err) {
      setFieldErrors(validationMessages(err));
      setError(errorMessage(err, 'تعذر تسجيل المصروف'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'المصروفات', to: '/expenses' }, { label: 'إضافة مصروف' }]} />
      <PageHeader
        title="إضافة مصروف"
        subtitle="مصروف تشغيلي للشركة — لا يرتبط بحسابات المناديب"
        actions={
          <Link className="btn secondary" to="/expenses">
            إلغاء
          </Link>
        }
      />
      <div className="card" style={{ maxWidth: 860 }}>
        <div className="card-body">
          <form
            className="stack"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {error ? <div className="alert error">{error}</div> : null}
            <div className="form-grid">
              <Field label="التصنيف" required error={fieldErrors.category}>
                <SelectInput value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>
                  <option value="">اختر التصنيف</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {expenseCategoryLabel[c]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="المبلغ" required error={fieldErrors.amount} hint="بالجنيه، حتى خانتين عشريتين">
                <TextInput value={amount} onChange={(event) => setAmount(event.target.value)} dir="ltr" inputMode="decimal" placeholder="0.00" />
              </Field>
              <Field label="تاريخ المصروف" required error={fieldErrors.expenseDate}>
                <TextInput type="date" dir="ltr" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
              </Field>
              <Field label="طريقة الدفع" required error={fieldErrors.paymentMethod}>
                <SelectInput value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'CASH' | 'TRANSFER')}>
                  <option value="CASH">{paymentMethodLabel.CASH}</option>
                  <option value="TRANSFER">{paymentMethodLabel.TRANSFER}</option>
                </SelectInput>
              </Field>
              {paymentMethod === 'TRANSFER' ? (
                <>
                  <Field label="نوع التحويل" required error={fieldErrors.transferType}>
                    <SelectInput value={transferType} onChange={(event) => setTransferType(event.target.value as 'INSTAPAY' | 'BANK_TRANSFER')}>
                      <option value="INSTAPAY">{transferTypeLabel.INSTAPAY}</option>
                      <option value="BANK_TRANSFER">{transferTypeLabel.BANK_TRANSFER}</option>
                    </SelectInput>
                  </Field>
                  <Field label="الرقم المرجعي" error={fieldErrors.referenceNumber} hint="اختياري">
                    <TextInput value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} dir="ltr" />
                  </Field>
                </>
              ) : null}
              <Field label="البيان / الوصف" required className="full" error={fieldErrors.description} hint="مثال: فاتورة كهرباء شهر أكتوبر">
                <TextInput value={description} onChange={(event) => setDescription(event.target.value)} />
              </Field>
              <Field label="ملاحظات" className="full" error={fieldErrors.notes}>
                <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>
            </div>
            <DocumentPicker
              name="file"
              label="إرفاق فاتورة أو إيصال"
              file={attachment}
              onChange={setAttachment}
              error={fieldErrors.file}
            />
            <div className="alert info">بعد الحفظ لا يمكن تعديل المصروف. إذا سُجّل بالخطأ يلغيه مدير النظام مع ذكر السبب، ويبقى في السجل.</div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={submitting}>
                <Icon name="check" size={15} /> {submitting ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
              </button>
              <Link className="btn secondary" to="/expenses">
                رجوع
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
