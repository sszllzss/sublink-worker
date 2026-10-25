import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';
import { createTranslator } from '../src/i18n/index.js';
import { ProxyParser } from '../src/parsers/ProxyParser.js';
import { generateRules, generateRuleSets, generateClashRuleSets } from '../src/config/ruleGenerators.js';

const t = createTranslator('zh-CN');
const sourceA = '🧩 Custom A';
const sourceB = '✈️ Airport B';
const customRules = [{ name: 'Custom Route', site: ['google'], ip: [] }];

const cachedProxies = () => [sourceA, sourceB].map((source, index) => ({
    type: 'shadowsocks',
    tag: `${index === 0 ? 'A' : 'B'} US Node`,
    server: '127.0.0.1',
    server_port: 8388,
    method: 'aes-128-gcm',
    password: 'test-password',
    network: 'tcp',
    _aggregatorSourceGroupName: source,
    _aggregatorSourceName: source,
    _aggregatorSourcePrefix: index === 0 ? 'A' : 'B',
    _rawUri: 'ss://internal-bookkeeping',
    _shareUri: 'ss://internal-share'
}));

async function cachedApp(overrides = {}) {
    const kv = new MemoryKVAdapter();
    await kv.put('agg:compat', JSON.stringify({
        id: 'compat',
        userId: 'test-user',
        cachedProxies: cachedProxies(),
        lastRefresh: Date.now(),
        refreshInterval: 3600,
        selectedRules: ['Global'],
        customRules: structuredClone(customRules),
        groupByCountry: true,
        includeAutoSelect: true,
        ...overrides
    }));
    return { kv, app: createApp({ kv }) };
}

describe('aggregators after upstream compatibility sync', () => {
    it.each(['clash', 'singbox', 'surge'])('keeps source groups and custom rule choices in %s', async format => {
        const builder = format === 'clash'
            ? new ClashConfigBuilder('', ['Global'], structuredClone(customRules), null, 'zh-CN', '', true)
            : format === 'singbox'
                ? new SingboxConfigBuilder('', ['Global'], structuredClone(customRules), null, 'zh-CN', '', true)
                : new SurgeConfigBuilder('', ['Global'], structuredClone(customRules), null, 'zh-CN', '', true);
        const input = cachedProxies();
        builder.setPreParsedProxies(input);
        const output = await builder.build();
        const config = format === 'clash' ? yaml.load(output) : builder.config;
        const groups = format === 'singbox' ? config.outbounds : config['proxy-groups'];
        const getMembers = name => {
            if (format === 'surge') {
                return groups.find(group => group.startsWith(`${name} = `))
                    ?.split(',').slice(1).map(member => member.trim());
            }
            const group = groups.find(group => (group.tag || group.name) === name);
            return group?.outbounds || group?.proxies;
        };

        expect(getMembers(sourceA)).toEqual(['A US Node']);
        expect(getMembers(sourceB)).toEqual(['B US Node']);
        expect(getMembers(t('outboundNames.Node Select'))).toEqual(expect.arrayContaining([sourceA, sourceB]));
        expect(getMembers('Custom Route')).toEqual(expect.arrayContaining([sourceA, sourceB, 'A US Node', 'B US Node']));
        expect(getMembers('Custom Route')).not.toContain('🇺🇸 United States');
        if (format === 'singbox') expect(getMembers('Custom Route')).not.toContain('REJECT');
        expect(input[0]._rawUri).toBe('ss://internal-bookkeeping');
    });

    it.each(['1.11', '1.12', '1.14'])('uses the matching sing-box %s rules and DNS schema on aggregate routes', async version => {
        const { app } = await cachedApp();
        const response = await app.request(`http://localhost/agg/compat/singbox?singbox_version=${version}`);
        expect(response.status).toBe(200);
        const config = await response.json();
        expect(config).not.toHaveProperty('outbound_providers');
        const nodes = config.outbounds.filter(outbound => outbound.server);
        expect(nodes.map(node => node.tag)).toEqual(['A US Node', 'B US Node']);
        for (const node of nodes) {
            expect(Object.keys(node).some(key => key.startsWith('_'))).toBe(false);
            expect(node).not.toHaveProperty('network');
            expect(node).not.toHaveProperty('providers');
        }
        if (version === '1.11') {
            expect(config.route).not.toHaveProperty('default_domain_resolver');
            expect(config.dns.servers[0]).toHaveProperty('address');
        } else {
            expect(config.route.default_domain_resolver).toBe('dns_resolver');
            expect(config.dns.servers[0]).toHaveProperty('type');
        }
        for (const ruleSet of config.route.rule_set) {
            if (version === '1.14') {
                expect(config.route.default_http_client).toBe('rule-set-download');
                expect(config.http_clients).toEqual([{ tag: 'rule-set-download', detour: 'DIRECT' }]);
                expect(ruleSet).not.toHaveProperty('http_client');
                expect(ruleSet).not.toHaveProperty('download_detour');
            } else {
                expect(ruleSet.download_detour).toBe('DIRECT');
                expect(ruleSet).not.toHaveProperty('http_client');
            }
        }
    });

    it('normalizes cached AnyTLS options without exposing aggregator metadata', async () => {
        const { app } = await cachedApp({ cachedProxies: [{
            ...cachedProxies()[0], type: 'anytls',
            tls: { enabled: true, server_name: 'example.com' },
            'idle-session-check-interval': 30,
            'idle-session-timeout': 120,
            'min-idle-session': 2,
            method: undefined
        }] });
        const response = await app.request('http://localhost/agg/compat/singbox?singbox_version=1.14');
        const config = await response.json();
        const proxy = config.outbounds.find(outbound => outbound.type === 'anytls');
        expect(proxy).toMatchObject({ idle_session_check_interval: '30s', idle_session_timeout: '120s', min_idle_session: 2 });
        expect(Object.keys(proxy).some(key => key.startsWith('_') || key.includes('-'))).toBe(false);
    });

    it('keeps VLESS WebSocket settings without emitting the URI encryption field', async () => {
        const proxy = await ProxyParser.parse('vless://00000000-0000-0000-0000-000000000000@127.0.0.1:443?security=tls&sni=example.com&type=ws&path=%2Ftest#VLESS');
        const { app } = await cachedApp({ cachedProxies: [{ ...proxy, _aggregatorSourceGroupName: sourceA }] });
        const response = await app.request('http://localhost/agg/compat/singbox?singbox_version=1.14');
        expect(response.status).toBe(200);
        const config = await response.json();
        const node = config.outbounds.find(outbound => outbound.type === 'vless');
        expect(node).not.toHaveProperty('security');
        expect(node).not.toHaveProperty('network');
        expect(node.transport).toMatchObject({ type: 'ws', path: '/test' });
        expect(node.tls).toMatchObject({ enabled: true, server_name: 'example.com' });
    });

    it.each(['clash', 'singbox', 'surge'])('ignores base configs for other formats on the %s aggregate route', async format => {
        const { app, kv } = await cachedApp({ configId: 'other_config' });
        await kv.put('other_config', JSON.stringify({ compatibilityMarker: 'SHOULD_NOT_APPEAR' }));
        const response = await app.request(`http://localhost/agg/compat/${format}`);
        expect(response.status).toBe(200);
        expect(await response.text()).not.toContain('SHOULD_NOT_APPEAR');
    });

    it('keeps registration, login, ownership checks and refresh working', async () => {
        const app = createApp({ kv: new MemoryKVAdapter() });
        const jsonRequest = (path, body, cookie) => app.request(`http://localhost${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
            body: JSON.stringify(body)
        });
        const credentials = { username: 'compat-user', password: 'test-password' };
        expect((await jsonRequest('/api/auth/register', credentials)).status).toBe(200);
        const login = await jsonRequest('/api/auth/login', credentials);
        expect(login.status).toBe(200);
        const cookie = login.headers.get('set-cookie').split(';')[0];
        const created = await jsonRequest('/api/aggregators', {
            name: 'Compatibility',
            directNodeGroups: [{ name: 'Direct', prefix: 'D', content: 'ss://YWVzLTEyOC1nY206dGVzdA==@127.0.0.1:8388#Local' }]
        }, cookie);
        expect(created.status).toBe(200);
        const aggregator = await created.json();
        expect((await app.request(`http://localhost/api/aggregators/${aggregator.id}/proxies`)).status).toBe(401);
        const refreshed = await jsonRequest(`/api/aggregators/${aggregator.id}/refresh`, {}, cookie);
        expect(refreshed.status).toBe(200);
        expect((await refreshed.json()).cachedProxyCount).toBe(1);
        const output = await app.request(`http://localhost/agg/${aggregator.id}/singbox?singbox_version=1.14`);
        expect(output.status).toBe(200);
        expect((await output.json()).outbounds).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'D Local' })]));
    });
});

describe('custom rule identifiers', () => {
    it('keeps valid rules while excluding URL injection and traversal in all outputs', () => {
        const invalid = ['../private', 'https://127.0.0.1/secret', 'google?redirect=1', '.hidden', 'a..b'];
        const custom = [{ name: 'Safe', site: ['example.test', ...invalid], ip: ['custom-ip', ...invalid] }];
        const rule = generateRules(['Global'], structuredClone(custom)).find(rule => rule.outbound === 'Safe');
        expect(rule.site_rules).toEqual(['example.test']);
        expect(rule.ip_rules).toEqual(['custom-ip']);
        const singbox = generateRuleSets(['Global'], custom);
        const clash = generateClashRuleSets(['Global'], custom);
        const serialized = JSON.stringify([singbox, clash]);
        expect(serialized).toContain('example.test');
        expect(serialized).toContain('custom-ip');
        for (const identifier of invalid) expect(serialized).not.toContain(identifier);
    });
});
