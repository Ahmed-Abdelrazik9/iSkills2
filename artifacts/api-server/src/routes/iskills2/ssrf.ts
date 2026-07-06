import ipaddr from "ipaddr.js";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { promisify } from "node:util";

const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);

export function isPrivateIp(ip: string): boolean {
  try {
    if (!ipaddr.isValid(ip)) return true;
    const parsed = ipaddr.parse(ip);
    if (parsed.kind() === "ipv4") {
      const range = parsed.range();
      return range !== "unicast";
    }
    const range = parsed.range();
    if (range === "loopback" || range === "linkLocal" || range === "uniqueLocal" || range === "multicast" || range === "unspecified") return true;
    if (range === "ipv4Mapped") {
      const ipv4 = (parsed as any).toIPv4Address();
      return ipv4.range() !== "unicast";
    }
    return false;
  } catch {
    return true;
  }
}

export async function isSafeUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1") return false;
    if (hostname === "metadata.google.internal" || hostname.endsWith(".metadata.google.internal")) return false;
    // Only literal IP addresses are checked here; hostnames are checked after DNS resolution.
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) {
      if (isPrivateIp(hostname)) return false;
    }
    const [v4, v6] = await Promise.allSettled([dnsResolve4(hostname), dnsResolve6(hostname)]);
    const ips = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];
    if (!ips.length) return false;
    return !ips.some(isPrivateIp);
  } catch {
    return false;
  }
}

export async function extractUrls(text: string): Promise<string[]> {
  const urlRegex = /https?:\/\/[^\s\)\]\>"]+/gi;
  const urls = [...new Set((text.match(urlRegex) || []))];
  const safe = await Promise.all(urls.map(async (url) => ({ url, safe: await isSafeUrl(url) })));
  return safe.filter((x) => x.safe).map((x) => x.url);
}

export async function fetchUrl(url: string): Promise<{ title: string; url: string; snippet: string } | null> {
  if (!(await isSafeUrl(url))) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const protocol = parsed.protocol;
    const port = parsed.port || (protocol === "https:" ? 443 : 80);
    const path = parsed.pathname + parsed.search;

    const [v4, v6] = await Promise.allSettled([dnsResolve4(hostname), dnsResolve6(hostname)]);
    const ips = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];
    if (!ips.length || ips.some(isPrivateIp)) return null;

    const validatedIp = ips[0];

    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const client = protocol === "https:" ? https : http;
      const req = client.request(
        {
          hostname: validatedIp,
          port,
          path,
          method: "GET",
          servername: hostname,
          headers: {
            Host: hostname,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          },
        },
        (response) => resolve(response),
      );
      req.on("error", reject);
      req.end();
    });

    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) return null;

    const html = await new Promise<string>((resolve, reject) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : url;
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    return { title, url, snippet: text };
  } catch (err: any) {
    console.error("[iSkills2] fetch URL failed:", err.message);
    return null;
  }
}
