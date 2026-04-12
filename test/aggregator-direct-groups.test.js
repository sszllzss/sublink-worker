import { describe, it, expect } from 'vitest';
import { AggregatorService } from '../src/services/aggregatorService.js';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

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
        service._fetchSource = async (url, userAgent) => {
            calls.push({ url, userAgent });
            return [{ type: 'trojan', tag: 'Node', server: 'example.com', server_port: 443, password: 'pass' }];
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
            { url: 'https://example.com/b', userAgent: 'fallback-agent' }
        ]);
        expect(refreshed.cachedProxies.map(proxy => proxy.tag)).toEqual(['A Node', 'B Node']);
    });

    it('keeps direct groups before airport sources and preserves configured order', async () => {
        const service = new AggregatorService(new MemoryKVAdapter());
        service._fetchSource = async (url) => {
            const tag = url.endsWith('/first') ? 'SubFirst' : 'SubSecond';
            return [{ type: 'trojan', tag, server: 'example.com', server_port: 443, password: 'pass' }];
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
});
