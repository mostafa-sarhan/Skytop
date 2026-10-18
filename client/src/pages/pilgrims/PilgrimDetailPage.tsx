import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, download, errorMessage, fileUrl, uploadDocument } from '../../api/client';
import type { DelegateTripRow, DocumentType, PilgrimDetail } from '../../api/types';
import { useAsync } from '../../lib/hooks';
import {
  documentStatusLabel,
  formatDate,
  formatDateTime,
  formatFileSize,
} from '../../lib/format';
import {
  Badge,
  EmptyState,
  Field,
  Icon,
  LoadingBlock,
  Modal,
  Breadcrumbs,
  PageHeader,
  SelectInput,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const documentLabel: Record<DocumentType, string> = {
  PASSPORT_IMAGE: 'صورة جواز السفر',
  PERSONAL_PHOTO: 'الصورة الشخصية',
};

const DocumentSlot = ({
  pilgrimId,
  type,
  document,
  onChanged,
  readOnly = false,
}: {
  pilgrimId: string;
  type: DocumentType;
  document: { id: string; originalName: string; sizeBytes: number; createdAt: string } | undefined;
  onChanged: () => void;
  /** Cancelled pilgrims keep their documents for viewing only. */
  readOnly?: boolean;
}) => {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadDocument(`/pilgrims/${pilgrimId}/documents`, file, { type });
      toast.success(`تم رفع ${documentLabel[type]}`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر رفع الملف'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!window.confirm(`حذف ${documentLabel[type]}؟`)) return;
    setBusy(true);
    try {
      await api.delete(`/pilgrims/${pilgrimId}/documents/${type}`);
      toast.success('تم حذف الملف');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'تعذر حذف الملف'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>{documentLabel[type]}</h3>
        <Badge tone={document ? 'success' : 'warning'}>{document ? 'موجود' : 'ناقص'}</Badge>
      </div>
      <div className="card-body">
        {document ? (
          <div className="stack">
            <div className="row between">
              <div>
                <div className="mono small">{document.originalName}</div>
                <div className="muted small">
                  {formatFileSize(document.sizeBytes)} — رُفع {formatDateTime(document.createdAt)}
                </div>
              </div>
            </div>
            <div className="row">
              <a
                className="btn secondary sm"
                href={fileUrl(`/documents/${pilgrimId}/${type}`)}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="eye" size={14} /> عرض
              </a>
              <button
                type="button"
                className="btn secondary sm"
                onClick={() => download(`/documents/${pilgrimId}/${type}`)}
              >
                <Icon name="download" size={14} /> تنزيل
              </button>
              {!readOnly ? (
                <button type="button" className="btn danger sm" onClick={() => void remove()} disabled={busy}>
                  <Icon name="trash" size={14} /> حذف
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>
              لم يتم رفع هذا الملف بعد.
            </p>
            {readOnly ? null : (
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.pdf"
              className="input"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            )}
            {busy ? <span className="small muted">جارٍ الرفع...</span> : null}
          </div>
        )}
      </div>
    </div>
  );
};

export interface TransferablePilgrim {
  id: string;
  name: string;
  trip?: { id: string; name: string } | null;
  delegate: { id: string };
}

/** Moves a pilgrim to another trip the same delegate is assigned to. */
export const TransferModal = ({
  pilgrim,
  onClose,
  onDone,
}: {
  pilgrim: TransferablePilgrim;
  onClose: () => void;
  onDone: () => void;
}) => {
  const toast = useToast();
  const [tripId, setTripId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only the delegate's own trips that have not finished are valid targets.
  const trips = useAsync<DelegateTripRow[]>(
    (signal) =>
      api.get<DelegateTripRow[]>(`/delegates/${pilgrim.delegate.id}/trips`, { scope: 'active' }, signal),
    [pilgrim.delegate.id],
  );

  // Only the delegate's trips whose list is still open can receive the pilgrim.
  const options = (trips.data ?? []).filter(
    (trip) => trip.tripId !== pilgrim.trip?.id && trip.capabilities.canChangeManifest,
  );

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/pilgrims/${pilgrim.id}/transfer`, {
        toTripId: tripId,
        reason: reason.trim() || undefined,
      });
      toast.success('تم نقل المعتمر إلى الرحلة الجديدة');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'تعذر نقل المعتمر'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`نقل المعتمر — ${pilgrim.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void submit()}
            disabled={submitting || !tripId}
          >
            {submitting ? 'جارٍ النقل...' : 'نقل'}
          </button>
        </>
      }
    >
      {error ? <div className="alert error">{error}</div> : null}
      <div className="alert info">
        الرحلة الحالية: <strong>{pilgrim.trip?.name ?? '—'}</strong>. يُنقل المعتمر إلى رحلة أخرى
        من رحلات نفس المندوب، ويُحفظ النقل في سجل المعتمر.
      </div>
      <Field label="الرحلة الجديدة" required>
        <SelectInput value={tripId} onChange={(event) => setTripId(event.target.value)}>
          <option value="">اختر الرحلة</option>
          {options.map((trip) => (
            <option key={trip.tripId} value={trip.tripId}>
              {trip.name} — {formatDate(trip.departureDate)}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="سبب النقل">
        <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {options.length === 0 && trips.data ? (
        <div className="alert warning">
          لا توجد رحلات مفتوحة أخرى مسند إليها هذا المندوب. أسند المندوب إلى رحلة مفتوحة أولاً من صفحة الرحلة.
        </div>
      ) : null}
    </Modal>
  );
};

export const PilgrimDetailPage = () => {
  // Opened either from /pilgrims/:id or from the delegate → trip workspace
  // (/delegates/:delegateId/trips/:tripId/pilgrims/:id).
  const { id = '', delegateId } = useParams();
  const inContext = Boolean(delegateId);
  const navigate = useNavigate();
  const [transferring, setTransferring] = useState(false);

  const pilgrim = useAsync<PilgrimDetail>(
    (signal) => api.get<PilgrimDetail>(`/pilgrims/${id}`, undefined, signal),
    [id],
  );

  // "المستندات" action in the workspace links to #documents.
  const location = useLocation();
  const loaded = Boolean(pilgrim.data);
  useEffect(() => {
    if (loaded && location.hash === '#documents') {
      document.getElementById('documents')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loaded, location.hash]);

  if (pilgrim.loading)
    return (
      <div className="page">
        <LoadingBlock />
      </div>
    );
  if (pilgrim.error || !pilgrim.data)
    return (
      <div className="page">
        <EmptyState title="تعذر تحميل ملف المعتمر" />
      </div>
    );

  const data = pilgrim.data;
  const docs = new Map(data.documents.map((doc) => [doc.type, doc]));
  // Always derive the workspace from the pilgrim's current delegate + trip.
  const workspace = data.trip ? `/delegates/${data.delegate.id}/trips/${data.trip.id}/pilgrims` : null;
  const editPath = inContext && workspace ? `${workspace}/${id}/edit` : `/pilgrims/${id}/edit`;
  const cancelled = data.status === 'CANCELLED';
  // Trip status rules from the API: CLOSED keeps edits but blocks transfers,
  // COMPLETED makes everything read-only.
  const canEdit = !cancelled && data.tripCapabilities.canEditPilgrims;
  const canTransfer = !cancelled && data.tripCapabilities.canChangeManifest;

  return (
    <div className="page">
      {inContext && workspace ? (
        <Breadcrumbs
          items={[
            { label: 'المناديب', to: '/delegates' },
            { label: data.delegate.name, to: `/delegates/${data.delegate.id}` },
            { label: data.trip?.name ?? '', to: workspace },
            { label: data.name },
          ]}
        />
      ) : null}
      <PageHeader
        title={data.name}
        subtitle={`جواز السفر: ${data.passportNumber} — ${data.trip?.name ?? ''}`}
        actions={
          <>
            <Link className="btn secondary" to={`/trips/${data.trip?.id ?? ''}`}>
              <Icon name="bus" size={15} /> الرحلة
            </Link>
            {workspace ? (
              <Link className="btn secondary" to={workspace}>
                <Icon name="users" size={15} /> معتمرو المندوب في الرحلة
              </Link>
            ) : null}
            {canTransfer ? (
              <button type="button" className="btn secondary" onClick={() => setTransferring(true)}>
                <Icon name="refresh" size={15} /> نقل معتمر
              </button>
            ) : null}
            {canEdit ? (
              <Link className="btn" to={editPath}>
                <Icon name="edit" size={15} /> تعديل
              </Link>
            ) : null}
          </>
        }
      />

      {cancelled ? (
        <div className="alert warning" style={{ marginBottom: 16 }}>
          <strong>مستبعد</strong> — بتاريخ {data.cancelledAt ? formatDateTime(data.cancelledAt) : '—'}
          {data.cancelledBy ? ` بواسطة ${data.cancelledBy.fullName}` : ''}. السبب: {data.cancelReason ?? '—'}.
          <br />
          لا يُحتسب ضمن المعتمرين النشطين. بياناته ومستنداته وسجل نقله محفوظة للعرض فقط.
        </div>
      ) : null}

      <div className="row" style={{ marginBottom: 16 }}>
        {cancelled ? <Badge tone="danger">مستبعد</Badge> : null}
        <Badge tone={data.documentStatus === 'COMPLETE' ? 'success' : 'warning'}>
          الوثائق: {documentStatusLabel[data.documentStatus]}
        </Badge>
        <Badge tone="primary">المندوب: {data.delegate.name}</Badge>
        <Badge>أُضيف في {formatDate(data.createdAt)}</Badge>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3>البيانات الأساسية</h3>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>الاسم</dt>
              <dd>{data.name}</dd>
              <dt>جواز السفر</dt>
              <dd className="mono">{data.passportNumber}</dd>
              <dt>رقم الهوية</dt>
              <dd className="mono">{data.nationalId ?? '—'}</dd>
              <dt>تاريخ الميلاد</dt>
              <dd className="mono">{data.birthDate ? formatDate(data.birthDate) : '—'}</dd>
              <dt>المهنة</dt>
              <dd>{data.job ?? '—'}</dd>
              <dt>الرحلة</dt>
              <dd>{data.trip?.name ?? '—'}</dd>
              <dt>المندوب</dt>
              <dd>{data.delegate.name}</dd>
              <dt>ملاحظات</dt>
              <dd>{data.notes || '—'}</dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>سجل النقل</h3>
          </div>
          <div className="card-body flush">
            {data.transfers.length === 0 ? (
              <EmptyState title="لم يتم نقل هذا المعتمر" />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>من</th>
                      <th>إلى</th>
                      <th>بواسطة</th>
                      <th className="wrap">السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transfers.map((transfer) => (
                      <tr key={transfer.id}>
                        <td className="mono">{formatDateTime(transfer.createdAt)}</td>
                        <td>{transfer.fromTrip?.name ?? '—'}</td>
                        <td>{transfer.toTrip.name}</td>
                        <td>{transfer.performedBy.fullName}</td>
                        <td className="wrap">{transfer.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid cols-2" id="documents">
        <DocumentSlot
          pilgrimId={id}
          type="PASSPORT_IMAGE"
          document={docs.get('PASSPORT_IMAGE')}
          onChanged={pilgrim.reload}
          readOnly={!canEdit}
        />
        <DocumentSlot
          pilgrimId={id}
          type="PERSONAL_PHOTO"
          document={docs.get('PERSONAL_PHOTO')}
          onChanged={pilgrim.reload}
          readOnly={!canEdit}
        />
      </div>

      {transferring ? (
        <TransferModal
          pilgrim={data}
          onClose={() => setTransferring(false)}
          onDone={() => {
            // In the workspace the pilgrim no longer belongs here: go back to it.
            if (inContext && workspace) navigate(workspace);
            else pilgrim.reload();
          }}
        />
      ) : null}

      <div className="row" style={{ marginTop: 16 }}>
        {inContext && workspace ? (
          <button type="button" className="btn secondary" onClick={() => navigate(workspace)}>
            <Icon name="arrow-right" size={15} /> رجوع لمعتمري المندوب في الرحلة
          </button>
        ) : (
          <button type="button" className="btn secondary" onClick={() => navigate('/pilgrims')}>
            <Icon name="arrow-right" size={15} /> رجوع للمعتمرين
          </button>
        )}
      </div>
    </div>
  );
};
