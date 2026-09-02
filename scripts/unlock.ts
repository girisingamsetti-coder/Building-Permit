import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function unlockAll() {
  await prisma.user.updateMany({
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  console.log('Unlocked all users');
}

unlockAll().catch(console.error).finally(() => prisma.$disconnect());
