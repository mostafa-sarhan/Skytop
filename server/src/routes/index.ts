import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import delegateRoutes from './delegate.routes';
import tripRoutes from './trip.routes';
import pilgrimRoutes from './pilgrim.routes';
import documentRoutes from './document.routes';
import paymentRoutes from './payment.routes';
import financeRoutes from './finance.routes';
import reportRoutes from './report.routes';
import dashboardRoutes from './dashboard.routes';
import auditRoutes from './audit.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

router.use('/auth', authRoutes);

router.use(authenticate);

router.use('/users', userRoutes);
router.use('/delegates', delegateRoutes);
router.use('/trips', tripRoutes);
router.use('/pilgrims', pilgrimRoutes);
router.use('/documents', documentRoutes);
router.use('/payments', paymentRoutes);
router.use('/finance', financeRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/audit', auditRoutes);

export default router;
