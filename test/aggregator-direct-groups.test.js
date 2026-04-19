import { describe, it, expect } from 'vitest';
import { AggregatorService } from '../src/services/aggregatorService.js';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { InvalidPayloadError } from '../src/services/errors.js';

describe('AggregatorService direct node groups', () => {
    it('parses multiple direct node groups with independent prefixes', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const agg = await service.create('user-1', {
            name: 'multi direct',
            directNodeGroups: [
                {
                    name: 'Group A',
                    prefix: 'A',
                    content: 'trojan://pass-a@example-a.com:443?sni=example-a.com#NodeA'
                },
                {
                    name: 'Group B',
                    prefix: 'B',
                    content: 'trojan://pass-b@example-b.com:443?sni=example-b.com#NodeB'
                }
            ]
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['A NodeA', 'B NodeB']);
        expect(refreshed.cachedProxies[0]).toMatchObject({
            type: 'trojan',
            server: 'example-a.com',
            tls: {
                enabled: true,
                server_name: 'example-a.com'
            }
        });
        expect(refreshed.cachedProxies[1]).toMatchObject({
            type: 'trojan',
            server: 'example-b.com',
            tls: {
                enabled: true,
                server_name: 'example-b.com'
            }
        });
    });

    it('keeps legacy directNodes compatible', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const agg = await service.create('user-1', {
            name: 'legacy direct',
            directNodes: {
                prefix: 'Legacy',
                content: 'trojan://pass@example.com:443?sni=example.com#Node'
            }
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.directNodeGroups).toEqual([
            {
                name: '',
                prefix: 'Legacy',
                content: 'trojan://pass@example.com:443?sni=example.com#Node'
            }
        ]);
        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['Legacy Node']);
    });

    it('continues refreshing other direct groups when one group fails', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const originalParse = service._parseDirectNodes.bind(service);
        service._parseDirectNodes = async (content, userAgent) => {
            if (content.includes('bad-group')) {
                throw new Error('bad group');
            }
            return originalParse(content, userAgent);
        };

        const agg = await service.create('user-1', {
            name: 'partial direct',
            directNodeGroups: [
                {
                    name: 'Bad',
                    prefix: 'Bad',
                    content: 'bad-group'
                },
                {
                    name: 'Good',
                    prefix: 'Good',
                    content: 'trojan://pass@example.com:443?sni=example.com#Node'
                }
            ]
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['Good Node']);
    });

    it('uses per-source User-Agent for airport subscriptions', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const calls = [];
        service._fetchSourceWithMeta = async (url, userAgent) => {
            calls.push({ url, userAgent });
            return {
                proxies: [{ type: 'trojan', tag: 'Node', server: 'example.com', server_port: 443, password: 'pass' }],
                profileName: undefined
            };
        };

        const agg = await service.create('user-1', {
            name: 'source ua',
            airportSources: [
                {
                    url: 'https://example.com/a',
                    prefix: 'A',
                    userAgent: 'clash.meta'
                },
                {
                    url: 'https://example.com/b',
                    prefix: 'B'
                }
            ]
        });

        const refreshed = await service.refresh(agg.id, 'fallback-agent');

        expect(calls).toEqual([
            { url: 'https://example.com/a', userAgent: 'clash.meta' },
            { url: 'https://example.com/b', userAgent: 'clash-verge/v2.0.0' }
        ]);
        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['A Node', 'B Node']);
    });

    it('keeps direct groups before airport sources and preserves configured order', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async (url) => {
            const tag = url.endsWith('/first') ? 'SubFirst' : 'SubSecond';
            return {
                proxies: [{ type: 'trojan', tag, server: 'example.com', server_port: 443, password: 'pass' }],
                profileName: undefined
            };
        };

        const agg = await service.create('user-1', {
            name: 'ordered',
            directNodeGroups: [
                {
                    prefix: 'Direct2',
                    content: 'trojan://pass@direct-2.example.com:443?sni=direct-2.example.com#Node'
                },
                {
                    prefix: 'Direct1',
                    content: 'trojan://pass@direct-1.example.com:443?sni=direct-1.example.com#Node'
                }
            ],
            airportSources: [
                {
                    url: 'https://example.com/second',
                    prefix: 'Airport2'
                },
                {
                    url: 'https://example.com/first',
                    prefix: 'Airport1'
                }
            ]
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual([
            'Direct2 Node',
            'Direct1 Node',
            'Airport2 SubSecond',
            'Airport1 SubFirst'
        ]);
    });

    it('attaches per-source group names for direct and airport entries', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async () => {
            return {
                proxies: [{ type: 'trojan', tag: 'SubNode', server: 'example.com', server_port: 443, password: 'pass' }],
                profileName: undefined
            };
        };

        const agg = await service.create('user-1', {
            name: 'group names',
            directNodeGroups: [
                {
                    name: '自定义香港',
                    prefix: 'HK',
                    content: 'trojan://pass@direct.example.com:443?sni=direct.example.com#Node'
                }
            ],
            airportSources: [
                {
                    name: '机场A',
                    url: 'https://example.com/sub'
                }
            ]
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.cachedProxies.map(proxy => proxy._aggregatorSourceGroupName)).toEqual([
            '🧩 自定义香港',
            '✈️ 机场A'
        ]);
    });

    it('expands preferred IP groups from one node into multiple IP nodes', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const agg = await service.create('user-1', {
            name: 'preferred ip',
            preferredIpGroups: [
                {
                    name: '优选入口',
                    prefix: 'VIP',
                    node: 'trojan://pass@example.com:443?sni=example.com#BaseNode',
                    ips: '1.1.1.1\n8.8.8.8'
                }
            ]
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.cachedProxies).toHaveLength(2);
        expect(refreshed.cachedProxies.map(proxy => proxy.server)).toEqual(['1.1.1.1', '8.8.8.8']);
        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual([
            'VIP BaseNode [1.1.1.1]',
            'VIP BaseNode [8.8.8.8]'
        ]);
        expect(refreshed.cachedProxies.map(proxy => proxy._aggregatorSourceGroupName)).toEqual([
            '🎯 优选入口',
            '🎯 优选入口'
        ]);
        expect(refreshed.cachedProxies[0].tls).toMatchObject({
            enabled: true,
            server_name: 'example.com'
        });
    });

    it('rejects duplicate prefixes across aggregator source groups', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());

        await expect(service.create('user-1', {
            name: 'duplicate prefix',
            directNodeGroups: [
                { name: 'Direct A', prefix: 'dup', content: 'trojan://pass@example.com:443?sni=example.com#NodeA' }
            ],
            airportSources: [
                { name: 'Airport A', prefix: 'dup', url: 'https://example.com/sub' }
            ]
        })).rejects.toBeInstanceOf(InvalidPayloadError);
    });

    it('rejects duplicate group names when updating aggregators', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const agg = await service.create('user-1', {
            name: 'unique names',
            directNodeGroups: [
                { name: 'Direct A', prefix: 'a', content: 'trojan://pass@example.com:443?sni=example.com#NodeA' }
            ],
            preferredIpGroups: [
                { name: 'Preferred B', prefix: 'b', node: 'trojan://pass@example.com:443?sni=example.com#NodeB', ips: '1.1.1.1' }
            ]
        });

        await expect(service.update(agg.id, 'user-1', {
            preferredIpGroups: [
                { name: 'Direct A', prefix: 'c', node: 'trojan://pass@example.com:443?sni=example.com#NodeB', ips: '1.1.1.1' }
            ]
        })).rejects.toBeInstanceOf(InvalidPayloadError);
    });

    it('requires prefix for direct node groups', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());

        await expect(service.create('user-1', {
            name: 'missing direct prefix',
            directNodeGroups: [
                { name: 'Direct A', prefix: '', content: 'trojan://pass@example.com:443?sni=example.com#NodeA' }
            ]
        })).rejects.toBeInstanceOf(InvalidPayloadError);
    });

    it('requires prefix for preferred IP groups', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());

        await expect(service.create('user-1', {
            name: 'missing preferred prefix',
            preferredIpGroups: [
                { name: 'Preferred A', prefix: '', node: 'trojan://pass@example.com:443?sni=example.com#NodeA', ips: '1.1.1.1' }
            ]
        })).rejects.toBeInstanceOf(InvalidPayloadError);
    });

    it('uses subscription hostname as airport prefix when prefix is empty', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async () => {
            return {
                proxies: [{ type: 'trojan', tag: 'Node', server: 'example.com', server_port: 443, password: 'pass' }],
                profileName: undefined
            };
        };

        const agg = await service.create('user-1', {
            name: 'airport hostname prefix',
            airportSources: [
                {
                    url: 'https://sub.example.com/path?token=1',
                    prefix: ''
                }
            ]
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['sub.example.com Node']);
    });

    it('uses subscription profile name as airport prefix when content-disposition provides one', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async () => {
            return {
                proxies: [{ type: 'trojan', tag: 'Node', server: 'example.com', server_port: 443, password: 'pass' }],
                profileName: '蓝莓桥'
            };
        };

        const agg = await service.create('user-1', {
            name: 'airport profile prefix',
            airportSources: [
                {
                    url: 'https://sub.berryzee.com:8443/path',
                    prefix: ''
                }
            ]
        });

        const refreshed = await service.refresh(agg.id);

        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['蓝莓桥 Node']);
        expect(refreshed.cachedProxies.map(proxy => proxy._aggregatorSourceGroupName)).toEqual(['✈️ 蓝莓桥']);
    });

    it('resolves airport meta for manual fetch buttons', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async () => {
            return {
                proxies: [],
                profileName: '蓝莓桥'
            };
        };

        const meta = await service.resolveAirportSourceMeta({
            url: 'https://sub.berryzee.com:8443/test',
            prefix: '',
            name: '',
            userAgent: 'clash-verge/v2.0.0'
        }, 'fallback-agent');

        expect(meta).toEqual({
            prefix: '蓝莓桥',
            name: '蓝莓桥',
            profileName: '蓝莓桥',
            userAgent: 'clash-verge/v2.0.0'
        });
    });

    it('records airport refresh results for success, empty, and failure states', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async (url) => {
            if (url.includes('success')) {
                return {
                    proxies: [{ type: 'trojan', tag: 'Node', server: 'success.example.com', server_port: 443, password: 'pass' }],
                    profileName: 'Success Source'
                };
            }
            if (url.includes('empty')) {
                return {
                    proxies: [],
                    profileName: 'Empty Source'
                };
            }
            throw new Error('HTTP error! status: 400');
        };

        const agg = await service.create('user-1', {
            name: 'airport refresh results',
            airportSources: [
                { url: 'https://example.com/success', prefix: '', name: '' },
                { url: 'https://example.com/empty', prefix: '', name: '' },
                { url: 'https://example.com/error', prefix: 'Error Source', name: '' }
            ]
        });

        const refreshed = await service.refresh(agg.id, 'clash-verge/v2.4.7');

        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['Success Source Node']);
        expect(refreshed.airportRefreshResults).toEqual([
            expect.objectContaining({
                index: 0,
                url: 'https://example.com/success',
                name: 'Success Source',
                prefix: 'Success Source',
                status: 'success',
                proxyCount: 1,
                error: ''
            }),
            expect.objectContaining({
                index: 1,
                url: 'https://example.com/empty',
                name: 'Empty Source',
                prefix: 'Empty Source',
                status: 'empty',
                proxyCount: 0,
                error: ''
            }),
            expect.objectContaining({
                index: 2,
                url: 'https://example.com/error',
                name: 'Error Source',
                prefix: 'Error Source',
                status: 'error',
                proxyCount: 0,
                error: 'HTTP error! status: 400'
            })
        ]);

        const listed = await service.list('user-1');
        expect(listed[0].airportRefreshResults).toEqual(refreshed.airportRefreshResults);
    });

    it('parses clash yaml airport subscriptions even when yaml contains http urls', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const originalFetch = globalThis.fetch;
        const clashYaml = `
proxies:
  - name: Berry Node
    type: trojan
    server: berry.example.com
    port: 443
    password: pass
    sni: berry.example.com
proxy-groups:
  - name: Auto
    type: url-test
    proxies:
      - Berry Node
    url: http://cp.cloudflare.com/generate_204
    interval: 300
rules:
  - MATCH,Auto
`.trim();

        globalThis.fetch = async () => new Response(clashYaml, {
            status: 200,
            headers: {
                'content-type': 'text/yaml; charset=utf-8',
                'content-disposition': "attachment;filename*=UTF-8''蓝莓桥"
            }
        });

        try {
            const agg = await service.create('user-1', {
                name: 'yaml airport parse',
                airportSources: [
                    {
                        url: 'https://airport.example.com/sub',
                        prefix: '',
                        name: ''
                    }
                ]
            });

            const refreshed = await service.refresh(agg.id, 'clash-verge/v2.4.7');

            expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['蓝莓桥 Berry Node']);
            expect(refreshed.airportRefreshResults).toEqual([
                expect.objectContaining({
                    index: 0,
                    url: 'https://airport.example.com/sub',
                    name: '蓝莓桥',
                    prefix: '蓝莓桥',
                    status: 'success',
                    proxyCount: 1,
                    error: ''
                })
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('keeps recognized subscription client user-agent when refreshing airports', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const calls = [];
        service._fetchSourceWithMeta = async (url, userAgent) => {
            calls.push({ url, userAgent });
            return { proxies: [], profileName: undefined };
        };

        const agg = await service.create('user-1', {
            name: 'recognized ua',
            airportSources: [
                { url: 'https://example.com/sub', prefix: '' }
            ]
        });

        await service.refresh(agg.id, 'mihomo/1.19.2');

        expect(calls).toEqual([
            { url: 'https://example.com/sub', userAgent: 'mihomo/1.19.2' }
        ]);
    });

    it('lists cached proxy details with source grouping metadata', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async () => {
            return {
                proxies: [{ type: 'trojan', tag: 'SubNode', server: 'airport.example.com', server_port: 443, password: 'pass' }],
                profileName: 'Berry'
            };
        };

        const agg = await service.create('user-1', {
            name: 'detail list',
            directNodeGroups: [
                { name: 'Manual', prefix: 'MAN', content: 'trojan://pass@direct.example.com:443?sni=direct.example.com#Node' }
            ],
            airportSources: [
                { url: 'https://airport.example.com/sub', prefix: '', name: '' }
            ]
        });

        await service.refresh(agg.id);
        const details = await service.listCachedProxyDetails(agg.id);

        expect(details).toEqual([
            expect.objectContaining({
                index: 0,
                name: 'MAN Node',
                shareUri: 'trojan://pass@direct.example.com:443?sni=direct.example.com#Node',
                sourceGroupName: '🧩 Manual',
                sourceName: 'Manual',
                sourcePrefix: 'MAN',
                server: 'direct.example.com',
                port: 443
            }),
            expect.objectContaining({
                index: 1,
                name: 'Berry SubNode',
                shareUri: 'trojan://pass@airport.example.com:443#Berry%20SubNode',
                sourceGroupName: '✈️ Berry',
                sourceName: 'Berry',
                sourcePrefix: 'Berry',
                server: 'airport.example.com',
                port: 443
            })
        ]);
    });

    it('builds share uri for preferred ip expanded nodes', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        const agg = await service.create('user-1', {
            name: 'preferred ip share',
            preferredIpGroups: [
                {
                    name: 'Preferred',
                    prefix: 'VIP',
                    node: 'trojan://pass@example.com:443?sni=example.com#Node',
                    ips: '1.1.1.1'
                }
            ]
        });

        await service.refresh(agg.id);
        const details = await service.listCachedProxyDetails(agg.id);

        expect(details[0]).toMatchObject({
            index: 0,
            server: '1.1.1.1',
            shareUri: 'trojan://pass@1.1.1.1:443?security=tls&sni=example.com&insecure=0&allowInsecure=0#VIP%20Node%20%5B1.1.1.1%5D'
        });
    });

    it('serializes airport vless xhttp objects into share links', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSourceWithMeta = async () => {
            return {
                proxies: [{
                    type: 'vless',
                    tag: 'Node',
                    server: 'www.web.com',
                    server_port: 443,
                    uuid: '72581b16-e1d5-4d44-836f-22524a0971c0',
                    security: 'none',
                    tls: {
                        enabled: true,
                        server_name: 'vps1.sszl.cc.cd'
                    },
                    transport: {
                        type: 'xhttp',
                        path: '/72581b16',
                        host: 'vps1.sszl.cc.cd',
                        mode: 'auto'
                    }
                }],
                profileName: 'Berry'
            };
        };

        const agg = await service.create('user-1', {
            name: 'airport vless share',
            airportSources: [
                { url: 'https://airport.example.com/sub', prefix: '', name: '' }
            ]
        });

        await service.refresh(agg.id);
        const details = await service.listCachedProxyDetails(agg.id);

        expect(details[0].shareUri).toContain('vless://72581b16-e1d5-4d44-836f-22524a0971c0@www.web.com:443');
        expect(details[0].shareUri).toContain('type=xhttp');
        expect(details[0].shareUri).toContain('path=%2F72581b16');
    });
});
