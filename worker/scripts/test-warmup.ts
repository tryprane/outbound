import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379/0', {
  maxRetriesPerRequest: null,
});

const warmupQueue = new Queue('warmup-queue', {
  connection: redisConnection,
});

async function main() {
  console.log('--- Warmup System Test Script ---');

  // 1. Find a WARMING account
  const account = await prisma.mailAccount.findFirst({
    where: {
      warmupStatus: 'WARMING',
      warmupAutoEnabled: true,
    },
  });

  if (!account) {
    console.log('❌ No account found with warmupStatus="WARMING" and warmupAutoEnabled=true.');
    console.log('Please ensure at least one email account is set to "WARMING" and Auto is "ON" in the dashboard.');
    process.exit(1);
  }

  console.log(`✅ Found eligible account: ${account.email} (ID: ${account.id})`);

  // 2. Bypass cooldown by resetting lastMailSentAt
  console.log('⏱ Bypassing cooldown by clearing lastMailSentAt...');
  await prisma.mailAccount.update({
    where: { id: account.id },
    data: { lastMailSentAt: null },
  });

  // 3. Ensure we have at least one recipient
  const recipientCount = await prisma.warmupRecipient.count({
    where: { isActive: true },
  });

  if (recipientCount === 0) {
    console.log('⚠️ No active warmup recipients found. The worker might fail to find a recipient.');
    console.log('Make sure to add at least one recipient in the Warmup Control Panel.');
  } else {
    console.log(`✅ Found ${recipientCount} active warmup recipient(s).`);
  }

  // 4. Enqueue the warmup job manually
  console.log('🚀 Enqueuing a manual warmup job...');
  const job = await warmupQueue.add(
    'process-warmup',
    { mailAccountId: account.id },
    { jobId: `warmup-test-${account.id}-${Date.now()}` }
  );

  console.log(`✅ Job enqueued successfully! Job ID: ${job.id}`);
  console.log('\nTo verify it worked, please check:');
  console.log('1. The worker logs for "[Warmup] Sent from..." or completion messages.');
  console.log('2. The "Recent Warmup Mail" section in the Sender Accounts dashboard.');
  
  await prisma.$disconnect();
  await redisConnection.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error running test script:', err);
  process.exit(1);
});
