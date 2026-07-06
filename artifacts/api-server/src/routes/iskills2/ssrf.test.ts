import { describe, it } from "node:test";
import assert from "node:assert";
import { isPrivateIp, extractUrls } from "./ssrf";

describe("isPrivateIp", () => {
  it("blocks IPv4 loopback", () => {
    assert.strictEqual(isPrivateIp("127.0.0.1"), true);
  });
  it("blocks IPv4 private ranges", () => {
    assert.strictEqual(isPrivateIp("10.0.0.1"), true);
    assert.strictEqual(isPrivateIp("192.168.1.1"), true);
    assert.strictEqual(isPrivateIp("172.16.0.1"), true);
  });
  it("blocks IPv4 broadcast", () => {
    assert.strictEqual(isPrivateIp("255.255.255.255"), true);
  });
  it("allows public IPv4", () => {
    assert.strictEqual(isPrivateIp("8.8.8.8"), false);
    assert.strictEqual(isPrivateIp("104.20.23.154"), false);
  });
  it("blocks IPv6 loopback", () => {
    assert.strictEqual(isPrivateIp("::1"), true);
    assert.strictEqual(isPrivateIp("0:0:0:0:0:0:0:1"), true);
  });
  it("blocks IPv6 link-local", () => {
    assert.strictEqual(isPrivateIp("fe80::1"), true);
  });
  it("blocks IPv6 unique-local", () => {
    assert.strictEqual(isPrivateIp("fd00::1"), true);
  });
  it("blocks IPv6 multicast", () => {
    assert.strictEqual(isPrivateIp("ff00::1"), true);
  });
  it("allows public IPv6", () => {
    assert.strictEqual(isPrivateIp("2606:4700:10::6814:179a"), false);
  });
  it("blocks IPv4-mapped loopback", () => {
    assert.strictEqual(isPrivateIp("::ffff:127.0.0.1"), true);
  });
  it("blocks IPv4-mapped private", () => {
    assert.strictEqual(isPrivateIp("::ffff:192.168.1.1"), true);
  });
  it("blocks IPv4-mapped broadcast", () => {
    assert.strictEqual(isPrivateIp("::ffff:255.255.255.255"), true);
  });
  it("allows IPv4-mapped public", () => {
    assert.strictEqual(isPrivateIp("::ffff:8.8.8.8"), false);
  });
  it("treats invalid IPs as unsafe", () => {
    assert.strictEqual(isPrivateIp("not-an-ip"), true);
  });
});

describe("extractUrls", () => {
  it("extracts public URLs", async () => {
    const urls = await extractUrls("check https://example.com and http://example.org");
    assert.deepStrictEqual(urls, ["https://example.com", "http://example.org"]);
  });
  it("drops localhost URLs", async () => {
    const urls = await extractUrls("local http://localhost:8080 and public https://example.com");
    assert.deepStrictEqual(urls, ["https://example.com"]);
  });
  it("drops private IPv4 literal URLs", async () => {
    const urls = await extractUrls("http://192.168.1.1 and https://example.com");
    assert.deepStrictEqual(urls, ["https://example.com"]);
  });
  it("drops IPv4-mapped loopback URLs", async () => {
    const urls = await extractUrls("http://[::ffff:127.0.0.1]:8080 and https://example.com");
    assert.deepStrictEqual(urls, ["https://example.com"]);
  });
});
