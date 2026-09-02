import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function measure() {
  console.log('Connecting to database...');
  const startConnect = Date.now();
  await prisma.$connect();
  const connectTime = Date.now() - startConnect;
  console.log(`Connection time: ${connectTime}ms`);

  console.log('Running query 1...');
  const startQuery1 = Date.now();
  await prisma.user.findFirst();
  const query1Time = Date.now() - startQuery1;
  console.log(`Query 1 time: ${query1Time}ms`);

  console.log('Running query 2...');
  const startQuery2 = Date.now();
  await prisma.user.findFirst();
  const query2Time = Date.now() - startQuery2;
  console.log(`Query 2 time: ${query2Time}ms`);
}

measure().catch(console.error).finally(() => prisma.$disconnect());
