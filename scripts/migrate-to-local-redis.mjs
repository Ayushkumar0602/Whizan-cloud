/**
 * Whizan Cloud Service — Redis Migration Tool
 * Replicates all keys, types, TTLs, and data from Upstash into the local VM Redis instance.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Redis = require("ioredis");

const SOURCE_URL = process.env.SOURCE_REDIS_URL || "rediss://default:gQAAAAAAAvFJAAIgcDI3ZmE1MzI1MzgyY2Y0NmI0YWYxNzNjYjE1OTNlNTI2NQ@saved-ox-192841.upstash.io:6379";
const TARGET_URL = process.env.TARGET_REDIS_URL || "redis://:whizan_redis_sec_2026_m89q@127.0.0.1:6379";

console.log("==================================================");
console.log("Whizan Redis Data Migration");
console.log(`Source (Upstash): ${SOURCE_URL.replace(/:[^:@]*@/, ":***@")}`);
console.log(`Target (VM Redis): ${TARGET_URL.replace(/:[^:@]*@/, ":***@")}`);
console.log("==================================================");

const source = new Redis(SOURCE_URL, { maxRetriesPerRequest: 3 });
const target = new Redis(TARGET_URL, { maxRetriesPerRequest: 3 });

async function migrate() {
  try {
    console.log("Connecting to both Redis instances...");
    await Promise.all([source.ping(), target.ping()]);
    console.log("✓ Connected successfully!\n");

    let cursor = "0";
    let totalMigrated = 0;
    let totalErrors = 0;

    do {
      const [nextCursor, keys] = await source.scan(cursor, "COUNT", 100);
      cursor = nextCursor;

      for (const key of keys) {
        try {
          const pttl = await source.pttl(key);
          const ttl = pttl > 0 ? pttl : 0;

          let restored = false;
          try {
            const dump = await source.dumpBuffer(key);
            if (dump) {
              await target.restore(key, ttl, dump, "REPLACE");
              restored = true;
            }
          } catch (err) {
            // Version mismatch or serialization fallback
          }

          if (!restored) {
            const type = await source.type(key);
            if (type === "string") {
              const val = await source.getBuffer(key);
              if (val !== null) {
                if (ttl > 0) await target.set(key, val, "PX", ttl);
                else await target.set(key, val);
              }
            } else if (type === "hash") {
              const data = await source.hgetallBuffer(key);
              if (Object.keys(data).length > 0) {
                await target.del(key);
                await target.hset(key, data);
                if (ttl > 0) await target.pexpire(key, ttl);
              }
            } else if (type === "list") {
              const items = await source.lrangeBuffer(key, 0, -1);
              if (items.length > 0) {
                await target.del(key);
                await target.rpush(key, ...items);
                if (ttl > 0) await target.pexpire(key, ttl);
              }
            } else if (type === "set") {
              const members = await source.smembersBuffer(key);
              if (members.length > 0) {
                await target.del(key);
                await target.sadd(key, ...members);
                if (ttl > 0) await target.pexpire(key, ttl);
              }
            } else if (type === "zset") {
              const items = await source.zrangeBuffer(key, 0, -1, "WITHSCORES");
              if (items.length > 0) {
                await target.del(key);
                const scoreMembers = [];
                for (let i = 0; i < items.length; i += 2) {
                  scoreMembers.push({ score: parseFloat(items[i + 1].toString()), member: items[i] });
                }
                const zaddArgs = [];
                for (const sm of scoreMembers) {
                  zaddArgs.push(sm.score, sm.member);
                }
                await target.zadd(key, ...zaddArgs);
                if (ttl > 0) await target.pexpire(key, ttl);
              }
            }
          }

          totalMigrated++;
        } catch (keyErr) {
          totalErrors++;
          console.warn(`[WARN] Failed key ${key}: ${keyErr.message}`);
        }
      }

      console.log(`[Progress] Migrated ${totalMigrated} keys (Cursor: ${cursor})...`);
    } while (cursor !== "0");

    const finalTargetCount = await target.dbsize();
    console.log("\n==================================================");
    console.log(`✓ Migration Complete!`);
    console.log(`Total Keys Migrated: ${totalMigrated}`);
    console.log(`Total Target DB Size: ${finalTargetCount} keys`);
    console.log(`Errors: ${totalErrors}`);
    console.log("==================================================");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await source.quit();
    await target.quit();
    process.exit(0);
  }
}

migrate();
