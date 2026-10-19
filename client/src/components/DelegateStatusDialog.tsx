import { api } from '../api/client';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

/** Confirms activating / deactivating a delegate (list and detail pages). */
export const DelegateStatusDialog = ({
  delegate,
  onClose,
  onDone,
}: {
  delegate: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' };
  onClose: () => void;
  onDone: () => void;
}) => {
  const toast = useToast();
  const deactivating = delegate.status === 'ACTIVE';
  const label = deactivating ? 'إيقاف' : 'تفعيل';
  return (
    <ConfirmDialog
      title={`${label} المندوب`}
      confirmLabel={`${label} المندوب`}
      tone={deactivating ? 'danger' : 'primary'}
      onClose={onClose}
      onConfirm={async () => {
        await api.post(`/delegates/${delegate.id}/status`, { status: deactivating ? 'INACTIVE' : 'ACTIVE' });
        toast.success(`تم ${label} المندوب`);
        onDone();
      }}
    >
      {deactivating ? (
        <p>
          سيتم إيقاف المندوب <strong>«{delegate.name}»</strong>. لن يمكن إسناده إلى رحلات جديدة أو إضافة معتمرين له،
          وتبقى بياناته وحساباته كما هي. يمكن إعادة تفعيله في أي وقت.
        </p>
      ) : (
        <p>
          سيتم تفعيل المندوب <strong>«{delegate.name}»</strong> ليصبح متاحاً للرحلات والمعتمرين من جديد.
        </p>
      )}
    </ConfirmDialog>
  );
};
