/**
 * Container Metrics Computation Helper
 * Calculates normalized CPU, Memory, and Network I/O metrics from Docker stats.
 */

export interface ContainerMetricPoint {
  timestamp: string;
  cpuPercent: number;
  memUsageMB: number;
  memLimitMB: number;
  memPercent: number;
  rxBytes: number;
  txBytes: number;
  rxRateKbps: number;
  txRateKbps: number;
  pids: number;
  pidsLimit: number;
}

export interface MetricSnapshot {
  totalUsage: number;
  systemUsage: number;
  rxBytes: number;
  txBytes: number;
  timestamp: number;
}

export function parseDockerStats(
  stats: any,
  prevSnapshot?: MetricSnapshot
): { metric: ContainerMetricPoint; snapshot: MetricSnapshot } {
  const now = Date.now();
  const currentTotal = stats.cpu_stats?.cpu_usage?.total_usage || 0;
  const currentSystem = stats.cpu_stats?.system_cpu_usage || 0;
  const onlineCpus = stats.cpu_stats?.online_cpus || stats.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;

  let cpuPercent = 0;
  if (prevSnapshot && prevSnapshot.totalUsage > 0 && prevSnapshot.systemUsage > 0) {
    const cpuDelta = currentTotal - prevSnapshot.totalUsage;
    const systemDelta = currentSystem - prevSnapshot.systemUsage;
    if (systemDelta > 0 && cpuDelta > 0) {
      cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100.0;
    }
  } else {
    const cpuDelta = currentTotal - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = currentSystem - (stats.precpu_stats?.system_cpu_usage || 0);
    if (systemDelta > 0 && cpuDelta > 0) {
      cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100.0;
    }
  }

  // Memory Calculation: subtract page cache (inactive_file) for true process RSS
  const rawUsage = stats.memory_stats?.usage || 0;
  const inactiveFile = stats.memory_stats?.stats?.inactive_file || stats.memory_stats?.stats?.total_inactive_file || 0;
  const usedBytes = Math.max(0, rawUsage - inactiveFile);
  const limitBytes = stats.memory_stats?.limit || (512 * 1024 * 1024);
  const memUsageMB = Number((usedBytes / (1024 * 1024)).toFixed(2));
  const memLimitMB = Number((limitBytes / (1024 * 1024)).toFixed(2));
  const memPercent = limitBytes > 0 ? Number(((usedBytes / limitBytes) * 100).toFixed(2)) : 0;

  // Network I/O
  let rxBytes = 0;
  let txBytes = 0;
  if (stats.networks) {
    for (const net of Object.values(stats.networks) as any[]) {
      rxBytes += net.rx_bytes || 0;
      txBytes += net.tx_bytes || 0;
    }
  }

  // Rate in KB/s
  let rxRateKbps = 0;
  let txRateKbps = 0;
  if (prevSnapshot && prevSnapshot.timestamp > 0) {
    const deltaSeconds = Math.max(0.5, (now - prevSnapshot.timestamp) / 1000);
    rxRateKbps = Number((Math.max(0, rxBytes - prevSnapshot.rxBytes) / deltaSeconds / 1024).toFixed(2));
    txRateKbps = Number((Math.max(0, txBytes - prevSnapshot.txBytes) / deltaSeconds / 1024).toFixed(2));
  }

  const pids = stats.pids_stats?.current || 0;
  const pidsLimit = stats.pids_stats?.limit || 128;

  const metric: ContainerMetricPoint = {
    timestamp: new Date(now).toISOString(),
    cpuPercent: Number(Math.max(0, cpuPercent).toFixed(2)),
    memUsageMB,
    memLimitMB,
    memPercent,
    rxBytes,
    txBytes,
    rxRateKbps,
    txRateKbps,
    pids,
    pidsLimit,
  };

  const snapshot: MetricSnapshot = {
    totalUsage: currentTotal,
    systemUsage: currentSystem,
    rxBytes,
    txBytes,
    timestamp: now,
  };

  return { metric, snapshot };
}
