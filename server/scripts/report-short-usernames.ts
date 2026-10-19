/**
 * Read-only: lists accounts whose username is shorter than the current
 * minimum (6). They keep logging in normally; a manager can rename them from
 * the Users page («تعديل»). Prints usernames, roles and status only.
 *
 *   npm run report:usernames            (uses DATABASE_URL / server/.env)
 */
import { prisma } from '../src/config/database';
import { USERNAME_MIN_LENGTH } from '../src/utils/credentials';

const main = async () => {
  const users = await prisma.user.findMany({
    select: { username: true, fullName: true, role: true, isActive: true },
    orderBy: { username: 'asc' },
  });
  const short = users.filter((u) => u.username.length < USERNAME_MIN_LENGTH);
  if (short.length === 0) {
    console.log(`All ${users.length} usernames have at least ${USERNAME_MIN_LENGTH} characters.`);
    return;
  }
  console.log(`${short.length} of ${users.length} usernames are shorter than ${USERNAME_MIN_LENGTH} characters (they still log in):`);
  for (const u of short) console.log(`  ${u.username.padEnd(12)} ${u.role.padEnd(9)} ${u.isActive ? 'active' : 'inactive'}  ${u.fullName}`);
};

main()
  .catch((error: unknown) => {
    console.error('report failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
