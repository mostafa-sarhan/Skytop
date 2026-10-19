import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SYSTEM_DELEGATE_NAME } from '../src/config/app';
import { passwordProblems, usernameProblems } from '../src/utils/credentials';

const BCRYPT_ROUNDS = 12;

const prisma = new PrismaClient();


const env = (key: string, fallback: string): string => process.env[key] || fallback;

// Seed passwords have no fallback in source code: they must be provided.
const requiredSecret = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required to run the seed (set it in server/.env)`);
  if (value === 'CHANGE_ME') throw new Error(`${key} still has the placeholder value CHANGE_ME`);
  return value;
};

/**
 * Creates the account when it does not exist yet (the NEW username and
 * password must satisfy the credential policy). An existing account keeps its
 * username and password; it is only ensured active with the expected role.
 * Passwords are never printed.
 */
const ensureUser = async (input: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  passwordKey: string;
  usernameKey: string;
}) => {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) {
    return prisma.user.update({ where: { id: existing.id }, data: { role: input.role, isActive: true } });
  }
  const problems = [
    ...usernameProblems(input.username).map((m) => `${input.usernameKey}: ${m}`),
    ...passwordProblems(input.password, input.username).map((m) => `${input.passwordKey}: ${m}`),
  ];
  if (problems.length) throw new Error(`Refusing to create "${input.username}":\n- ${problems.join('\n- ')}`);
  return prisma.user.create({
    data: {
      username: input.username,
      fullName: input.fullName,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      role: input.role,
      mustChangePassword: false,
    },
  });
};

async function main(): Promise<void> {
  // First manager (production bootstrap). Username and password are required
  // and must follow the policy when the account is created.
  const managerUsername = (process.env.SEED_MANAGER_USERNAME ?? '').trim().toLowerCase();
  if (!managerUsername) throw new Error('SEED_MANAGER_USERNAME is required to run the seed (set it in server/.env)');
  const managerPassword = requiredSecret('SEED_MANAGER_PASSWORD');

  const manager = await ensureUser({
    username: managerUsername,
    password: managerPassword,
    fullName: env('SEED_MANAGER_FULL_NAME', 'مدير النظام'),
    role: Role.MANAGER,
    usernameKey: 'SEED_MANAGER_USERNAME',
    passwordKey: 'SEED_MANAGER_PASSWORD',
  });

  // Optional starter employee: only when SEED_EMPLOYEE_PASSWORD is set
  // (production can create employees from the Users page instead).
  const employeePassword = process.env.SEED_EMPLOYEE_PASSWORD;
  const employee = employeePassword
    ? await ensureUser({
        username: env('SEED_EMPLOYEE_USERNAME', 'employee').trim().toLowerCase(),
        password: requiredSecret('SEED_EMPLOYEE_PASSWORD'),
        fullName: env('SEED_EMPLOYEE_FULL_NAME', 'موظف العمليات'),
        role: Role.EMPLOYEE,
        usernameKey: 'SEED_EMPLOYEE_USERNAME',
        passwordKey: 'SEED_EMPLOYEE_PASSWORD',
      })
    : null;

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
  console.log(employee ? `  employee -> ${employee.username} (${employee.role})` : '  employee -> (not requested)');
  console.log(`  system delegate -> ${delegate.name}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
