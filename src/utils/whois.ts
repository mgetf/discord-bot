import mysql from 'mysql2/promise';

// ---------------------------------------------------------------------------
// Steam ID normalisation
// ---------------------------------------------------------------------------

const STEAM64_BASE = 76561197960265728n;

function steam64ToSteam2(id64: bigint): string {
  const y = id64 % 2n;
  const w = (id64 - STEAM64_BASE - y) / 2n;
  return `STEAM_0:${String(y)}:${String(w)}`;
}

function steam2To64(steam2: string): bigint | null {
  const m = steam2.match(/^STEAM_\d+:(\d+):(\d+)$/i);
  if (!m || !m[1] || !m[2]) return null;
  return STEAM64_BASE + BigInt(m[2]) * 2n + BigInt(m[1]);
}

function steamUToSteam2(u: string): string | null {
  const m = u.match(/^\[U:1:(\d+)\]$/i);
  if (!m || !m[1]) return null;
  const combined = BigInt(m[1]);
  const y = combined % 2n;
  return `STEAM_0:${String(y)}:${String((combined - y) / 2n)}`;
}

export function normaliseSteamId(
  raw: string
): { steam2: string; steam64: string } | null {
  const s = raw.trim();
  if (/^STEAM_\d+:\d+:\d+$/i.test(s)) {
    const id64 = steam2To64(s);
    if (!id64) return null;
    return {
      steam2: s.replace(/^STEAM_\d+/, 'STEAM_0'),
      steam64: id64.toString()
    };
  }
  if (/^\[U:1:\d+\]$/i.test(s)) {
    const steam2 = steamUToSteam2(s);
    if (!steam2) return null;
    const id64 = steam2To64(steam2);
    if (!id64) return null;
    return { steam2, steam64: id64.toString() };
  }
  if (/^\d{17}$/.test(s)) {
    return { steam2: steam64ToSteam2(BigInt(s)), steam64: s };
  }
  return null;
}

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

export type IpType = 'home' | 'cloud-vpn' | 'private' | 'link-local';

export interface IpInfo {
  type: IpType;
  label: string;
  skip: boolean;
}

function classifyIp(ip: string): IpInfo {
  if (ip.startsWith('169.254.'))
    return { type: 'link-local', label: 'SDR relay', skip: true };
  if (
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('192.168.')
  )
    return { type: 'private', label: 'private', skip: true };
  if (
    ip.startsWith('20.') ||
    ip.startsWith('40.') ||
    ip.startsWith('52.') ||
    ip.startsWith('13.')
  )
    return { type: 'cloud-vpn', label: 'Azure', skip: false };
  if (ip.startsWith('34.') || ip.startsWith('35.'))
    return { type: 'cloud-vpn', label: 'GCP', skip: false };
  if (ip.startsWith('3.') || ip.startsWith('18.') || ip.startsWith('54.'))
    return { type: 'cloud-vpn', label: 'AWS', skip: false };
  if (
    ip.startsWith('95.216.') ||
    ip.startsWith('65.108.') ||
    ip.startsWith('157.90.') ||
    ip.startsWith('116.202.')
  )
    return { type: 'cloud-vpn', label: 'Hetzner', skip: false };
  if (
    ip.startsWith('194.163.') ||
    ip.startsWith('195.201.') ||
    ip.startsWith('85.215.')
  )
    return { type: 'cloud-vpn', label: 'Contabo', skip: false };
  return { type: 'home', label: 'residential', skip: false };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AltVerdict =
  | 'CONFIRMED ALT'
  | 'LIKELY ALT'
  | 'POSSIBLE ALT'
  | 'WEAK SIGNAL'
  | 'LOW SIGNAL';

export interface RegionCreds {
  name: string;
  host: string;
  port: number;
  password: string;
}

export interface AltCandidate {
  steamId: string;
  score: number;
  verdict: AltVerdict;
  sharedIps: Array<{
    ip: string;
    accounts: number;
    label: string;
    type: IpType;
  }>;
  names: string[];
  firstSeen: string;
  lastSeen: string;
  connections: number;
  temporalOverlaps: number;
  copresences: number;
  confirmed: boolean;
}

export interface RegionResult {
  name: string;
  records: number;
  sdr: boolean;
  ips: Array<{ ip: string; connections: number; label: string; type: IpType }>;
  candidates: AltCandidate[];
  links: Array<{ steamId: string; mainId: string; at: string; by: string }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const CLOUD_PENALTY = 0.3;
const TEMPORAL_WINDOW_H = 72;

function verdict(score: number): AltVerdict {
  if (score >= 85) return 'LIKELY ALT';
  if (score >= 50) return 'POSSIBLE ALT';
  if (score >= 20) return 'WEAK SIGNAL';
  return 'LOW SIGNAL';
}

async function analyseRegion(
  creds: RegionCreds,
  targetSteam2: string
): Promise<RegionResult> {
  const result: RegionResult = {
    name: creds.name,
    records: 0,
    sdr: false,
    ips: [],
    candidates: [],
    links: []
  };

  const conn = await mysql.createConnection({
    host: creds.host,
    port: creds.port,
    user: 'whois',
    password: creds.password,
    database: 'whois',
    connectTimeout: 12_000
  });

  try {
    const [countRows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM whois_logs WHERE steam_id = ?',
      [targetSteam2]
    );
    result.records = (countRows[0]?.total as number) ?? 0;

    const [linkRows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT steam_id, main_steam_id, linked_at, linked_by FROM whois_alt_links WHERE main_steam_id = ? OR steam_id = ?',
      [targetSteam2, targetSteam2]
    );
    result.links = (linkRows as mysql.RowDataPacket[]).map((r) => ({
      steamId: r.steam_id as string,
      mainId: r.main_steam_id as string,
      at: r.linked_at as string,
      by: r.linked_by as string
    }));

    if (result.records === 0) return result;

    // All IPs
    const [ipRows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT ip, COUNT(*) AS c FROM whois_logs WHERE steam_id = ? AND ip IS NOT NULL AND ip != "" GROUP BY ip ORDER BY c DESC',
      [targetSteam2]
    );
    for (const r of ipRows as (mysql.RowDataPacket & {
      ip: string;
      c: number;
    })[]) {
      const info = classifyIp(r.ip);
      if (info.type === 'link-local') {
        result.sdr = true;
        continue;
      }
      result.ips.push({
        ip: r.ip,
        connections: r.c,
        label: info.label,
        type: info.type
      });
    }

    const usable = result.ips
      .filter((i) => !classifyIp(i.ip).skip)
      .map((i) => i.ip);
    if (usable.length === 0) return result;

    const ph = usable.map(() => '?').join(',');

    // IP exclusivity counts
    const [freqRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT ip, COUNT(DISTINCT steam_id) AS cnt FROM whois_logs WHERE ip IN (${ph}) GROUP BY ip`,
      usable
    );
    const freq: Record<string, number> = {};
    for (const r of freqRows as (mysql.RowDataPacket & {
      ip: string;
      cnt: number;
    })[])
      freq[r.ip] = r.cnt;

    // Candidate accounts sharing those IPs
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT l.steam_id,
              COUNT(DISTINCT l.ip) AS sic,
              GROUP_CONCAT(DISTINCT l.ip ORDER BY l.ip SEPARATOR ',') AS sips,
              MIN(l.timestamp) AS fs, MAX(l.timestamp) AS ls,
              COUNT(*) AS tc,
              GROUP_CONCAT(DISTINCT l.name ORDER BY l.timestamp DESC SEPARATOR '|') AS nm
       FROM whois_logs l
       WHERE l.ip IN (${ph}) AND l.steam_id != ? AND l.steam_id IS NOT NULL AND l.steam_id != ''
       GROUP BY l.steam_id
       ORDER BY sic DESC, tc DESC`,
      [...usable, targetSteam2]
    );

    const confirmedSet = new Set(result.links.map((l) => l.steamId));

    // Target sessions for co-presence check
    const [tSess] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT server_name, timestamp AS ts,
              LEAD(timestamp) OVER (PARTITION BY server_name ORDER BY timestamp) AS end_ts
       FROM whois_logs WHERE steam_id = ? AND action IN ('connect','connect-late')`,
      [targetSteam2]
    );
    const targetSessions = tSess as (mysql.RowDataPacket & {
      server_name: string;
      ts: number;
      end_ts: number | null;
    })[];

    for (const row of rows as mysql.RowDataPacket[]) {
      const sharedList: string[] = (row.sips as string).split(',');

      let baseScore = 0;
      const sharedIps = sharedList.map((ip) => {
        const accounts = freq[ip] ?? 1;
        const info = classifyIp(ip);
        let w = 1 / Math.log2(accounts + 1);
        if (info.type === 'cloud-vpn') w *= CLOUD_PENALTY;
        baseScore += w;
        return { ip, accounts, label: info.label, type: info.type as IpType };
      });

      const coverage = sharedList.length / usable.length;
      const ipScore = Math.min(100, Math.round(baseScore * coverage * 100));

      // Temporal proximity
      const [cTs] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT ip, timestamp FROM whois_logs WHERE steam_id = ? AND ip IN (${ph})`,
        [row.steam_id as string, ...usable]
      );
      const [tTs] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT ip, timestamp FROM whois_logs WHERE steam_id = ? AND ip IN (${ph})`,
        [targetSteam2, ...usable]
      );
      const overlapIps = new Set<string>();
      for (const c of cTs as (mysql.RowDataPacket & {
        ip: string;
        timestamp: number;
      })[]) {
        for (const t of tTs as (mysql.RowDataPacket & {
          ip: string;
          timestamp: number;
        })[]) {
          if (
            c.ip === t.ip &&
            Math.abs(c.timestamp - t.timestamp) / 3600 <= TEMPORAL_WINDOW_H
          ) {
            overlapIps.add(c.ip);
          }
        }
      }
      const temporalBonus = Math.min(20, overlapIps.size * 10);

      // Co-presence
      let copresences = 0;
      if (targetSessions.length > 0) {
        const [cSess] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT server_name, timestamp AS ts,
                  LEAD(timestamp) OVER (PARTITION BY server_name ORDER BY timestamp) AS end_ts
           FROM whois_logs WHERE steam_id = ? AND action IN ('connect','connect-late')`,
          [row.steam_id as string]
        );
        for (const ts of targetSessions) {
          const tEnd = ts.end_ts ?? ts.ts + 3600;
          for (const cs of cSess as (mysql.RowDataPacket & {
            server_name: string;
            ts: number;
            end_ts: number | null;
          })[]) {
            if (cs.server_name !== ts.server_name) continue;
            const cEnd = cs.end_ts ?? cs.ts + 3600;
            if (Math.min(tEnd, cEnd) > Math.max(ts.ts, cs.ts)) copresences++;
          }
        }
      }
      const copresenceBonus = Math.min(30, copresences * 15);

      const finalScore = Math.min(
        100,
        ipScore + temporalBonus + copresenceBonus
      );
      const isConfirmed = confirmedSet.has(row.steam_id as string);

      result.candidates.push({
        steamId: row.steam_id as string,
        score: finalScore,
        verdict: isConfirmed ? 'CONFIRMED ALT' : verdict(finalScore),
        sharedIps,
        names: row.nm
          ? [...new Set((row.nm as string).split('|'))].slice(0, 6)
          : [],
        firstSeen: row.fs
          ? new Date((row.fs as number) * 1000).toISOString().slice(0, 10)
          : 'N/A',
        lastSeen: row.ls
          ? new Date((row.ls as number) * 1000).toISOString().slice(0, 10)
          : 'N/A',
        connections: row.tc as number,
        temporalOverlaps: overlapIps.size,
        copresences,
        confirmed: isConfirmed
      });
    }

    result.candidates.sort((a, b) => {
      if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
      return b.score - a.score;
    });
  } finally {
    await conn.end();
  }

  return result;
}

export async function runAltCheck(
  regions: RegionCreds[],
  rawSteamId: string
): Promise<{
  target: { steam2: string; steam64: string };
  regions: RegionResult[];
}> {
  const target = normaliseSteamId(rawSteamId);
  if (!target) throw new Error(`Cannot parse Steam ID: "${rawSteamId}"`);

  const results = await Promise.all(
    regions.map((r) =>
      analyseRegion(r, target.steam2).catch(
        (err: unknown) =>
          ({
            name: r.name,
            records: 0,
            sdr: false,
            ips: [],
            candidates: [],
            links: [],
            error: err instanceof Error ? err.message : String(err)
          }) satisfies RegionResult
      )
    )
  );

  return { target, regions: results };
}
