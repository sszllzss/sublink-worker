import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { parseVless } from '../src/parsers/protocols/vlessParser.js';
import { convertYamlProxyToObject } from '../src/parsers/convertYamlProxyToObject.js';
import { ProxyParser } from '../src/parsers/ProxyParser.js';

describe('UDP handling in proxy conversion', () => {
    describe('VLESS URL parsing with udp parameter', () => {
        it('should parse udp=true from VLESS URL', () => {
            const url = 'vless://test-uuid@example.com:443?security=tls&sni=example.com&udp=true#TestVless';
            const result = parseVless(url);

            expect(result.udp).toBe(true);
            expect(result.type).toBe('vless');
            expect(result.tag).toBe('TestVless');
        });

        it('should parse udp=false from VLESS URL', () => {
            const url = 'vless://test-uuid@example.com:443?security=tls&sni=example.com&udp=false#TestVless';
            const result = parseVless(url);

            expect(result.udp).toBe(false);
        });

        it('should not include udp when not specified in URL', () => {
            const url = 'vless://test-uuid@example.com:443?security=tls&sni=example.com#TestVless';
            const result = parseVless(url);

            expect(result.udp).toBeUndefined();
        });

        it('should preserve xhttp transport, fingerprint, alpn and tls booleans from VLESS URL', () => {
            const url = 'vless://test-uuid@example.com:443?security=tls&sni=cdn.example.com&fp=chrome&alpn=h2%2Chttp%2F1.1&allowInsecure=0&insecure=0&type=xhttp&host=cdn.example.com&path=%2Ftest&mode=auto#TestXhttp';
            const result = parseVless(url);

            expect(result.transport).toEqual({
                type: 'xhttp',
                path: '/test',
                headers: { host: 'cdn.example.com' },
                host: 'cdn.example.com',
                mode: 'auto'
            });
            expect(result.tls.insecure).toBe(false);
            expect(result.tls.utls.fingerprint).toBe('chrome');
            expect(result.alpn).toEqual(['h2', 'http/1.1']);
        });
    });

    describe('sing-box output should not contain udp field', () => {
        it('should strip udp field from proxy when converting for sing-box', () => {
            const proxyWithUdp = {
                tag: 'TestProxy',
                type: 'vless',
                server: 'example.com',
                server_port: 443,
                uuid: 'test-uuid',
                udp: true,
                tls: { enabled: true, server_name: 'example.com' }
            };

            const builder = new SingboxConfigBuilder('', [], [], null, 'zh-CN', null);
            const converted = builder.convertProxy(proxyWithUdp);

            expect(converted.udp).toBeUndefined();
            expect(converted.tag).toBe('TestProxy');
            expect(converted.type).toBe('vless');
        });

        it('should move root-level alpn into tls object for sing-box', () => {
            const proxyWithRootAlpn = {
                tag: 'TestProxy',
                type: 'vless',
                server: 'example.com',
                server_port: 443,
                uuid: 'test-uuid',
                alpn: ['h2', 'http/1.1'],
                tls: { enabled: true, server_name: 'example.com' }
            };

            const builder = new SingboxConfigBuilder('', [], [], null, 'zh-CN', null);
            const converted = builder.convertProxy(proxyWithRootAlpn);

            expect(converted.alpn).toBeUndefined();
            expect(converted.tls.alpn).toEqual(['h2', 'http/1.1']);
        });
    });

    describe('Clash output should preserve udp field', () => {
        it('should keep udp field in proxy when converting for Clash', () => {
            const proxyWithUdp = {
                tag: 'TestProxy',
                type: 'vless',
                server: 'example.com',
                server_port: 443,
                uuid: 'test-uuid',
                udp: true,
                tls: { enabled: true, server_name: 'example.com' }
            };

            const builder = new ClashConfigBuilder('', [], [], null, 'zh-CN', null);
            const converted = builder.convertProxy(proxyWithUdp);

            expect(converted.udp).toBe(true);
            expect(converted.name).toBe('TestProxy');
            expect(converted.type).toBe('vless');
        });

        it('should enable udp by default for Clash proxies built from URI subscriptions', async () => {
            const input = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#TestSS';
            const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', null);
            const built = yaml.load(await builder.build());

            expect(built.proxies).toHaveLength(1);
            expect(built.proxies[0].type).toBe('ss');
            expect(built.proxies[0].udp).toBe(true);
        });

        it('should keep explicit udp=false when generating Clash proxies', () => {
            const proxyWithDisabledUdp = {
                tag: 'TestProxy',
                type: 'vmess',
                server: 'example.com',
                server_port: 443,
                uuid: 'test-uuid',
                udp: false,
                tls: { enabled: true, server_name: 'example.com' }
            };

            const builder = new ClashConfigBuilder('', [], [], null, 'zh-CN', null);
            const converted = builder.convertProxy(proxyWithDisabledUdp);

            expect(converted.udp).toBe(false);
        });

        it('should emit xhttp-opts for VLESS xhttp nodes', () => {
            const proxyWithXhttp = {
                tag: 'TestXhttp',
                type: 'vless',
                server: 'www.web.com',
                server_port: 443,
                uuid: 'test-uuid',
                security: 'none',
                tls: {
                    enabled: true,
                    server_name: 'cdn.example.com',
                    insecure: false,
                    utls: {
                        enabled: true,
                        fingerprint: 'chrome'
                    }
                },
                transport: {
                    type: 'xhttp',
                    path: '/test',
                    host: 'cdn.example.com',
                    mode: 'auto'
                },
                alpn: ['h2', 'http/1.1']
            };

            const builder = new ClashConfigBuilder('', [], [], null, 'zh-CN', null);
            const converted = builder.convertProxy(proxyWithXhttp);

            expect(converted.network).toBe('xhttp');
            expect(converted.encryption).toBe('');
            expect(converted['xhttp-opts']).toEqual({
                path: '/test',
                host: 'cdn.example.com',
                mode: 'auto'
            });
            expect(converted['client-fingerprint']).toBe('chrome');
            expect(converted.alpn).toEqual(['h2', 'http/1.1']);
            expect(converted['skip-cert-verify']).toBe(false);
        });

        it('should fallback xhttp tls servername and host to server when source URI omits sni and host', async () => {
            const input = 'vless://72581b16-e1d5-4d44-836f-22524a0971c0@vps1.sszl.cc.cd:443?encryption=none&security=tls&insecure=0&allowInsecure=0&type=xhttp&path=%2F72581b16&mode=auto#xhttp%2Bcdn-cc.cd-';
            const parsed = await ProxyParser.parse(input);
            const builder = new ClashConfigBuilder('', [], [], null, 'zh-CN', null);
            const converted = builder.convertProxy(parsed);

            expect(converted.server).toBe('vps1.sszl.cc.cd');
            expect(converted.tls).toBe(true);
            expect(converted.servername).toBe('vps1.sszl.cc.cd');
            expect(converted.network).toBe('xhttp');
            expect(converted['xhttp-opts']).toEqual({
                path: '/72581b16',
                host: 'vps1.sszl.cc.cd',
                mode: 'auto'
            });
            expect(converted['skip-cert-verify']).toBe(false);
        });

        it('should flatten xhttp download-settings to mihomo proxy fields', () => {
            const proxyWithSplitXhttp = {
                tag: 'TestSplitXhttp',
                type: 'vless',
                server: 'www.web.com',
                server_port: 443,
                uuid: 'test-uuid',
                security: 'none',
                tls: {
                    enabled: true,
                    server_name: 'up.example.com',
                    insecure: false
                },
                transport: {
                    type: 'xhttp',
                    path: '/up',
                    mode: 'auto',
                    download_settings: {
                        path: '/down',
                        mode: 'auto',
                        server: '192.3.117.108',
                        port: 4436,
                        tls: true,
                        server_name: 'www.sony.com',
                        utls: {
                            enabled: true,
                            fingerprint: 'chrome'
                        },
                        reality: {
                            enabled: true,
                            public_key: 'pubkey',
                            short_id: '1b6939d9'
                        }
                    }
                }
            };

            const builder = new ClashConfigBuilder('', [], [], null, 'zh-CN', null);
            const converted = builder.convertProxy(proxyWithSplitXhttp);

            expect(converted['xhttp-opts']).toEqual({
                path: '/up',
                host: 'up.example.com',
                mode: 'auto',
                'download-settings': {
                    path: '/down',
                    mode: 'auto',
                    server: '192.3.117.108',
                    port: 4436,
                    servername: 'www.sony.com',
                    'client-fingerprint': 'chrome',
                    'reality-opts': {
                        'public-key': 'pubkey',
                        'short-id': '1b6939d9'
                    }
                }
            });
        });
    });

    describe('Clash YAML to sing-box conversion should strip udp', () => {
        it('should preserve udp when parsing Clash YAML but strip for sing-box output', () => {
            // Simulate a Clash YAML proxy with udp: true
            const clashProxy = {
                name: 'VLESS-Test',
                type: 'vless',
                server: 'example.com',
                port: 443,
                uuid: 'test-uuid',
                udp: true,
                tls: true,
                servername: 'example.com'
            };

            // Parse the Clash YAML proxy to internal format
            const parsed = convertYamlProxyToObject(clashProxy);

            // Verify the parsed object has udp
            expect(parsed.udp).toBe(true);

            // Now convert it for sing-box
            const builder = new SingboxConfigBuilder('', [], [], null, 'zh-CN', null);
            const singboxProxy = builder.convertProxy(parsed);

            // Verify udp is stripped for sing-box
            expect(singboxProxy.udp).toBeUndefined();
        });

        it('should parse VLESS xhttp Clash YAML back into internal transport structure', () => {
            const clashProxy = {
                name: 'VLESS-XHTTP',
                type: 'vless',
                server: 'www.web.com',
                port: 443,
                uuid: 'test-uuid',
                encryption: '',
                tls: true,
                servername: 'vps1.sszl.cc.cd',
                network: 'xhttp',
                'xhttp-opts': {
                    path: '/72581b16',
                    host: 'vps1.sszl.cc.cd',
                    mode: 'auto',
                    'download-settings': {
                        path: '/72581b16',
                        mode: 'auto',
                        server: '192.3.117.108',
                        port: 4436,
                        network: 'xhttp',
                        servername: 'www.sony.com',
                        'client-fingerprint': 'chrome',
                        'reality-opts': {
                            'public-key': 'pubkey',
                            'short-id': '1b6939d9'
                        }
                    }
                },
                udp: true,
                'skip-cert-verify': false
            };

            const parsed = convertYamlProxyToObject(clashProxy);

            expect(parsed.type).toBe('vless');
            expect(parsed.transport).toEqual({
                type: 'xhttp',
                path: '/72581b16',
                host: 'vps1.sszl.cc.cd',
                mode: 'auto',
                download_settings: {
                    path: '/72581b16',
                    mode: 'auto',
                    server: '192.3.117.108',
                    port: 4436,
                    network: 'xhttp',
                    server_name: 'www.sony.com',
                    utls: {
                        enabled: true,
                        fingerprint: 'chrome'
                    },
                    reality: {
                        enabled: true,
                        public_key: 'pubkey',
                        short_id: '1b6939d9'
                    }
                }
            });
        });
    });
});
