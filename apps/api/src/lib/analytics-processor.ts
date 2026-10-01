import { redisClient } from "./redis.js";
import { prisma } from "./prisma.js";

interface AnalyticsEvent {
  projectId: string;
  date: string;
  path: string;
  bytesSent: number;
  ip: string;
}

export function startAnalyticsProcessor() {
  console.log("[Analytics] Starting background processor...");
  
  // Process events every 30 seconds
  setInterval(async () => {
    try {
      const batchSize = 1000;
      const eventsRaw = await redisClient.lrange("analytics:buffer", 0, batchSize - 1);
      if (eventsRaw.length === 0) return;

      const events: AnalyticsEvent[] = [];
      for (const raw of eventsRaw) {
        try {
          events.push(JSON.parse(raw));
        } catch {}
      }

      // Group by Project + Date
      const aggregated = new Map<string, { pageViews: number; bytesSent: number; uniqueIps: Set<string> }>();

      for (const event of events) {
        if (!event.projectId || !event.date) continue;
        const key = `${event.projectId}|${event.date}`;
        if (!aggregated.has(key)) {
          aggregated.set(key, { pageViews: 0, bytesSent: 0, uniqueIps: new Set() });
        }
        const stat = aggregated.get(key)!;
        
        // Count as page view if it's an HTML request (heuristic: no extension or .html)
        const isPageView = !event.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|map)$/i);
        if (isPageView) {
          stat.pageViews += 1;
        }
        
        const rawBytes = Number(event.bytesSent);
        const safeBytes = !isNaN(rawBytes) && rawBytes > 0 ? Math.floor(rawBytes) : 0;
        stat.bytesSent += safeBytes;
        if (event.ip && isPageView) {
          stat.uniqueIps.add(event.ip);
        }
      }

      // Upsert into Postgres with safe boundary handling
      for (const [key, stat] of aggregated.entries()) {
        const [projectId, dateStr] = key.split("|");
        const date = new Date(dateStr);
        
        if (isNaN(date.getTime())) continue;

        try {
          // Clamp to signed 32-bit integer range to avoid Postgres 'integer out of range' (code 22003)
          const safeIncrement = Math.max(0, Math.min(2_000_000_000, Math.floor(stat.bytesSent)));
          const safePageViews = Math.max(0, Math.min(2_000_000_000, Math.floor(stat.pageViews)));

          await prisma.projectAnalytics.upsert({
            where: {
              projectId_date: { projectId, date }
            },
            update: {
              pageViews: { increment: safePageViews },
              bandwidth: { increment: safeIncrement },
              visitors: { increment: stat.uniqueIps.size }
            },
            create: {
              projectId,
              date,
              pageViews: safePageViews,
              bandwidth: safeIncrement,
              visitors: stat.uniqueIps.size,
            }
          });
        } catch (dbErr: any) {
          console.error(`[Analytics] Failed to upsert stats for project ${projectId}:`, dbErr?.message || dbErr);
        }
      }

      // Always remove processed events from the list
      await redisClient.ltrim("analytics:buffer", eventsRaw.length, -1);
      
    } catch (err) {
      console.error("[Analytics] Error processing batch:", err);
    }

    // ── Process Edge Function Invocations ────────────────────────────────────
    try {
      const fnBatchSize = 1000;
      const fnEventsRaw = await redisClient.lrange("fn:invocations:buffer", 0, fnBatchSize - 1);
      if (fnEventsRaw && fnEventsRaw.length > 0) {
        const fnInvocations: any[] = [];
        for (const raw of fnEventsRaw) {
          try {
            const ev = JSON.parse(raw);
            if (ev.serviceId) {
              fnInvocations.push({
                serviceId: ev.serviceId,
                endpoint: ev.endpoint || "/",
                httpMethod: ev.httpMethod || "GET",
                statusCode: Number(ev.statusCode) || 200,
                durationMs: Number(ev.durationMs) || 0,
                memoryMb: Number(ev.memoryMb) || 0,
                clientIp: ev.clientIp || "127.0.0.1",
                timestamp: ev.timestamp ? new Date(ev.timestamp) : new Date(),
              });
            }
          } catch {}
        }

        if (fnInvocations.length > 0) {
          await prisma.functionInvocation.createMany({
            data: fnInvocations,
            skipDuplicates: true,
          });
        }

        await redisClient.ltrim("fn:invocations:buffer", fnEventsRaw.length, -1);
      }
    } catch (fnErr: any) {
      console.error("[Analytics] Error processing function invocations:", fnErr?.message || fnErr);
    }
  }, 15_000);
}
