import { describe, expect, it } from 'vitest';
import { isBlockedIp } from './ssrf.js';

describe('isBlockedIp', () => {
  it('blocks loopback and private IPv4', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('0.0.0.0')).toBe(true);
  });

  it('blocks cloud metadata and link-local', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('169.254.10.10')).toBe(true);
  });

  it('blocks IPv6 loopback and ULA', () => {
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('::')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
    expect(isBlockedIp('fe80::1')).toBe(true);
  });

  it('blocks IPv4-mapped private addresses', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:10.0.0.5')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false); // example.com
    expect(isBlockedIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('blocks non-IP strings', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
  });
});
