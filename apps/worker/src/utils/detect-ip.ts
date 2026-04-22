import os from 'os';

export interface DetectedIP {
  ip: string;
  interface: string;
  isWifi: boolean;
  weight: number;
}

export function detectLANIP(): string | null {
  const interfaces = os.networkInterfaces();

  const priorities: Array<{ key: string; weight: number }> = [
    { key: 'en0', weight: 100 },
    { key: 'en1', weight: 90 },
    { key: 'wlp', weight: 80 },
    { key: 'eth0', weight: 70 },
    { key: 'wlan0', weight: 60 },
  ];

  const candidates: DetectedIP[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    for (const addr of addrs) {
      if (addr.internal) continue;
      if (addr.family !== 'IPv4') continue;

      const weight =
        priorities.find((p) => name.startsWith(p.key))?.weight ??
        (name.startsWith('en') ? 50 : name.startsWith('lo') ? -100 : 40);

      candidates.push({
        ip: addr.address,
        interface: name,
        isWifi: name.startsWith('en') || name.startsWith('wl') || name.startsWith('wlan'),
        weight,
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.weight - a.weight);

  return candidates[0].ip;
}

export function buildWorkerUrl(port: number = 8787): string | null {
  const ip = detectLANIP();
  if (!ip) return null;
  return `http://${ip}:${port}`;
}
