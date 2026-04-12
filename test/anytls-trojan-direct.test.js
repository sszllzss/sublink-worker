import { describe, it, expect } from 'vitest';
import { ProxyParser } from '../src/parsers/index.js';
import { parseTrojan } from '../src/parsers/protocols/trojanParser.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { SING_BOX_CONFIG } from '../src/config/index.js';

describe('direct proxy URI parsing', () => {
    it('parses anytls URI nodes', async () => {
        const proxy = await ProxyParser.parse('anytls://pass@example.com:443?udp=true&sni=example.com&alpn=h2,http%2F1.1&client-fingerprint=chrome&idle-session-check-interval=30&idle-session-timeout=120&min-idle-session=5#ANYTLS-main');

        expect(proxy).toMatchObject({
            type: 'anytls',
            tag: 'ANYTLS-main',
            server: 'example.com',
            server_port: 443,
            password: 'pass',
            udp: true,
            'idle-session-check-interval': 30,
            'idle-session-timeout': 120,
            'min-idle-session': 5,
            tls: {
                enabled: true,
                server_name: 'example.com',
                insecure: false,
                alpn: ['h2', 'http/1.1'],
                utls: {
                    enabled: true,
                    fingerprint: 'chrome'
                }
            }
        });
    });

    it('treats trojan URI nodes as TLS by default', () => {
        const proxy = parseTrojan('trojan://password@example.com:443?sni=example.com#Trojan-main');

        expect(proxy).toMatchObject({
            type: 'trojan',
            tag: 'Trojan-main',
            server: 'example.com',
            server_port: 443,
            password: 'password',
            tls: {
                enabled: true,
                server_name: 'example.com',
                insecure: false
            }
        });
        expect(proxy.transport).toBeUndefined();
    });

    it('keeps URI fragments as names when there is no query string', async () => {
        const proxy = await ProxyParser.parse('anytls://pass@example.com:443#ANYTLS-no-query');

        expect(proxy.tag).toBe('ANYTLS-no-query');
        expect(proxy.server).toBe('example.com');
        expect(proxy.server_port).toBe(443);
    });
});

describe('sing-box anytls conversion', () => {
    it('converts Clash-style anytls idle-session fields to sing-box fields', () => {
        const builder = new SingboxConfigBuilder('', [], [], SING_BOX_CONFIG, 'en', 'test-agent');
        const converted = builder.convertProxy({
            type: 'anytls',
            tag: 'ANYTLS-main',
            server: 'example.com',
            server_port: 443,
            password: 'pass',
            udp: true,
            'idle-session-check-interval': 30,
            'idle-session-timeout': 120,
            'min-idle-session': 5,
            tls: {
                enabled: true,
                server_name: 'example.com'
            }
        });

        expect(converted).toMatchObject({
            type: 'anytls',
            tag: 'ANYTLS-main',
            server: 'example.com',
            server_port: 443,
            password: 'pass',
            idle_session_check_interval: 30,
            idle_session_timeout: 120,
            min_idle_session: 5,
            tls: {
                enabled: true,
                server_name: 'example.com'
            }
        });
        expect(converted.udp).toBeUndefined();
        expect(converted['idle-session-check-interval']).toBeUndefined();
        expect(converted['idle-session-timeout']).toBeUndefined();
        expect(converted['min-idle-session']).toBeUndefined();
    });
});

describe('clash trojan conversion', () => {
    it('does not emit client-fingerprint for ordinary trojan ws tls nodes', () => {
        const builder = new ClashConfigBuilder('', [], [], null, 'en', 'test-agent');
        const converted = builder.convertProxy({
            type: 'trojan',
            tag: 'edgetunnel',
            server: 'sszl.ccwu.cc',
            server_port: 443,
            password: 'test-password',
            tls: {
                enabled: true,
                server_name: 'sszl.ccwu.cc',
                insecure: false,
                utls: {
                    enabled: true,
                    fingerprint: 'chrome'
                }
            },
            transport: {
                type: 'ws',
                path: '/',
                headers: {
                    host: 'sszl.ccwu.cc'
                }
            },
            tcp_fast_open: false,
            udp: true
        });

        expect(converted).toMatchObject({
            name: 'edgetunnel',
            type: 'trojan',
            server: 'sszl.ccwu.cc',
            port: 443,
            password: 'test-password',
            tls: true,
            sni: 'sszl.ccwu.cc',
            network: 'ws',
            'ws-opts': {
                path: '/',
                headers: {
                    host: 'sszl.ccwu.cc'
                }
            },
            tfo: false,
            'skip-cert-verify': false,
            udp: true
        });
        expect(converted['client-fingerprint']).toBeUndefined();
    });
});
