import { PrismaClient } from "@prisma/client";

async function tryUrl(label, url) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const start = Date.now();
  try {
    const n = await db.user.count();
    console.log(`[${label}] OK in ${Date.now() - start}ms, users=${n}`);
  } catch (e) {
    console.log(`[${label}] FAIL in ${Date.now() - start}ms: ${e.message}`);
  } finally {
    await db.$disconnect();
  }
}

await tryUrl("pooler", process.env.DATABASE_URL);
await tryUrl("direct", process.env.DIRECT_URL);
