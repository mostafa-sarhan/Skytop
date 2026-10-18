import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SYSTEM_DELEGATE_NAME } from '../src/config/app';

const prisma = new PrismaClient();


const env = (key: string, fallback: string): string => process.env[key] || fallback;

// Seed passwords have no fallback in source code: they must be provided.
const requiredSecret = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required to run the seed (set it in server/.env)`);
  if (value === 'CHANGE_ME') throw new Error(`${key} still has the placeholder value CHANGE_ME`);
  return value;
};

async function main(): Promise<void> {
  // Check both before touching the database.
  const managerPassword = requiredSecret('SEED_MANAGER_PASSWORD');
  const employeePassword = requiredSecret('SEED_EMPLOYEE_PASSWORD');
  const managerUsername = env('SEED_MANAGER_USERNAME', 'admin').toLowerCase();
  const managerName = env('SEED_MANAGER_FULL_NAME', 'مدير النظام');
  const employeeUsername = env('SEED_EMPLOYEE_USERNAME', 'employee').toLowerCase();

  const passwordHash = await bcrypt.hash(managerPassword, 12);

  const manager = await prisma.user.upsert({
    where: { username: managerUsername },
    update: { role: Role.MANAGER, isActive: true },
    create: {
      username: managerUsername,
      fullName: managerName,
      passwordHash,
      role: Role.MANAGER,
      mustChangePassword: false,
    },
  });

  const employeeHash = await bcrypt.hash(employeePassword, 12);
  const employee = await prisma.user.upsert({
    where: { username: employeeUsername },
    update: { role: Role.EMPLOYEE, isActive: true },
    create: {
      username: employeeUsername,
      fullName: env('SEED_EMPLOYEE_FULL_NAME', 'موظف العمليات'),
      passwordHash: employeeHash,
      role: Role.EMPLOYEE,
      mustChangePassword: false,
    },
  });

  const systemDelegate = await prisma.delegate.findFirst({
    where: { isSystem: true },
  });

  // Exactly one system delegate for direct company customers; re-running the
  // seed keeps its canonical name and active status.
  const systemNotes = 'حساب مخصص لعملاء الشركة المباشرين بدون مندوب خارجي';
  const delegate = systemDelegate
    ? await prisma.delegate.update({
        where: { id: systemDelegate.id },
        data: { name: SYSTEM_DELEGATE_NAME, status: 'ACTIVE', notes: systemNotes },
      })
    : await prisma.delegate.create({
        data: {
          name: SYSTEM_DELEGATE_NAME,
          phone: '0000000000',
          address: 'مقر الشركة',
          status: 'ACTIVE',
          isSystem: true,
          notes: systemNotes,
        },
      });

  console.log('Seed completed:');
  console.log(`  manager  -> ${manager.username} (${manager.role})`);
  console.log(`  employee -> ${employee.username} (${employee.role})`);
  console.log(`  system delegate -> ${delegate.name}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
