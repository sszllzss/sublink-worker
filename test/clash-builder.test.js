import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { createTranslator } from '../src/i18n/index.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { sanitizeClashProxyGroups } from '../src/builders/helpers/clashConfigUtils.js';

// Create translator for tests
const t = createTranslator('zh-CN');

describe('Clash Builder Tests', () => {
  it('should clean up proxy-groups and remove non-existent proxies', async () => {
    const input = `
proxies:
  - name: Valid-SS
    type: ss
    server: example.com
    port: 443
    cipher: aes-128-gcm
    password: test
proxy-groups:
  - name: 自定义选择
    type: select
    proxies:
      - DIRECT
      - REJECT
      - Valid-SS
      - NotExist
    `;

    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'test-agent');
    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const grp = (built['proxy-groups'] || []).find(g => g && g.name === '自定义选择');
    expect(grp).toBeDefined();

    const expected = ['DIRECT', 'REJECT', 'Valid-SS'];
    const actual = grp.proxies || [];

    expect(actual).toEqual(expected);
  });

  it('should reference user-defined proxy-providers in generated proxy-groups', async () => {
    const input = `
proxy-providers:
  my-provider:
    type: http
    url: https://example.com/sub
    path: ./my.yaml
    interval: 3600

proxies:
  - name: local
    type: ss
    server: 127.0.0.1
    port: 1080
    cipher: aes-256-gcm
    password: test
`;

    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'test-agent');
    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const nodeSelect = (built['proxy-groups'] || []).find(g => g && g.name === '🚀 节点选择');
    expect(nodeSelect).toBeDefined();
    expect(nodeSelect.use).toContain('my-provider');
  });

  it('sanitizeClashProxyGroups should not remove provider node references when group uses providers', () => {
    const config = {
      proxies: [],
      'proxy-groups': [
        {
          name: 'Custom Group',
          type: 'select',
          use: ['my-provider'],
          proxies: ['node-from-provider']
        }
      ]
    };

    sanitizeClashProxyGroups(config);

    const grp = (config['proxy-groups'] || [])[0];
    expect(grp).toBeDefined();
    expect(grp.proxies).toContain('node-from-provider');
  });

  it('should default Private and Location:CN groups to DIRECT', async () => {
    const input = `
ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Node-1
ss://YWVzLTEyOC1nY206dGVzdA@example.com:444#US-Node-1
    `;

    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'test-agent');
    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const privateName = t('outboundNames.Private');
    const cnName = t('outboundNames.Location:CN');

    const privateGroup = (built['proxy-groups'] || []).find(g => g && g.name === privateName);
    const cnGroup = (built['proxy-groups'] || []).find(g => g && g.name === cnName);

    expect(privateGroup).toBeDefined();
    expect(cnGroup).toBeDefined();

    // DIRECT should be the first option (default selected)
    expect(privateGroup.proxies[0]).toBe('DIRECT');
    expect(cnGroup.proxies[0]).toBe('DIRECT');

    // Other groups should NOT default to DIRECT
    const fallbackName = t('outboundNames.Fall Back');
    const fallbackGroup = (built['proxy-groups'] || []).find(g => g && g.name === fallbackName);
    expect(fallbackGroup).toBeDefined();
    expect(fallbackGroup.proxies[0]).not.toBe('DIRECT');
  });

  it('should create source-based groups for aggregated proxies', async () => {
    const builder = new ClashConfigBuilder('', 'minimal', [], null, 'zh-CN', 'test-agent');
    builder.setPreParsedProxies([
      {
        type: 'trojan',
        tag: 'A Node-1',
        server: 'a.example.com',
        server_port: 443,
        password: 'pass',
        tls: { enabled: true, server_name: 'a.example.com' },
        _aggregatorSourceGroupName: '🧩 自定义 A'
      },
      {
        type: 'trojan',
        tag: 'A Node-2',
        server: 'a2.example.com',
        server_port: 443,
        password: 'pass',
        tls: { enabled: true, server_name: 'a2.example.com' },
        _aggregatorSourceGroupName: '🧩 自定义 A'
      },
      {
        type: 'trojan',
        tag: 'B Node-1',
        server: 'b.example.com',
        server_port: 443,
        password: 'pass',
        tls: { enabled: true, server_name: 'b.example.com' },
        _aggregatorSourceGroupName: '✈️ 机场 B'
      }
    ]);

    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    const manualName = t('outboundNames.Manual Switch');
    const nodeSelectName = t('outboundNames.Node Select');
    const sourceGroupA = (built['proxy-groups'] || []).find(g => g?.name === '🧩 自定义 A');
    const sourceGroupB = (built['proxy-groups'] || []).find(g => g?.name === '✈️ 机场 B');
    const nodeSelect = (built['proxy-groups'] || []).find(g => g?.name === nodeSelectName);

    expect(sourceGroupA?.proxies).toEqual(['A Node-1', 'A Node-2']);
    expect(sourceGroupB?.proxies).toEqual(['B Node-1']);
    expect(nodeSelect).toBeDefined();
    expect(nodeSelect.proxies).toEqual(expect.arrayContaining([manualName, '🧩 自定义 A', '✈️ 机场 B']));
    expect(nodeSelect.proxies).not.toEqual(expect.arrayContaining(['A Node-1', 'B Node-1']));
  });
  it('should preserve aggregated proxies with different source groups even when configs are identical', async () => {
    const builder = new ClashConfigBuilder('', 'minimal', [], null, 'zh-CN', 'test-agent');
    builder.setPreParsedProxies([
      {
        type: 'vless',
        tag: '反代IP2 vlees+ws-cnd [154.194.0.235]',
        server: '154.194.0.235',
        server_port: 2053,
        uuid: '97508eb2-2ab0-4a62-9941-995c3412d255',
        security: 'none',
        tls: {
          enabled: true,
          server_name: 'vps.sszl.cc.cd',
          insecure: false,
          utls: {
            enabled: true,
            fingerprint: 'chrome'
          }
        },
        transport: {
          type: 'ws',
          path: '/97508eb2',
          headers: {
            host: 'vps.sszl.cc.cd'
          }
        },
        network: 'tcp',
        alpn: ['h2', 'http/1.1'],
        _aggregatorSourceGroupName: '🎯 反代IP2',
        _aggregatorSourceType: 'preferred-ip',
        _aggregatorSourceName: '反代IP2',
        _aggregatorSourcePrefix: '反代IP2'
      },
      {
        type: 'vless',
        tag: '反代IP5 vlees+ws-cnd [154.194.0.235]',
        server: '154.194.0.235',
        server_port: 2053,
        uuid: '97508eb2-2ab0-4a62-9941-995c3412d255',
        security: 'none',
        tls: {
          enabled: true,
          server_name: 'vps.sszl.cc.cd',
          insecure: false,
          utls: {
            enabled: true,
            fingerprint: 'chrome'
          }
        },
        transport: {
          type: 'ws',
          path: '/97508eb2',
          headers: {
            host: 'vps.sszl.cc.cd'
          }
        },
        network: 'tcp',
        alpn: ['h2', 'http/1.1'],
        _aggregatorSourceGroupName: '🎯 反代IP5',
        _aggregatorSourceType: 'preferred-ip',
        _aggregatorSourceName: '反代IP5',
        _aggregatorSourcePrefix: '反代IP5'
      }
    ]);

    const yamlText = await builder.build();
    const built = yaml.load(yamlText);

    expect((built.proxies || []).map(proxy => proxy.name)).toEqual(expect.arrayContaining([
      '反代IP2 vlees+ws-cnd [154.194.0.235]',
      '反代IP5 vlees+ws-cnd [154.194.0.235]'
    ]));

    const sourceGroup2 = (built['proxy-groups'] || []).find(group => group?.name === '🎯 反代IP2');
    const sourceGroup5 = (built['proxy-groups'] || []).find(group => group?.name === '🎯 反代IP5');

    expect(sourceGroup2?.proxies).toEqual(['反代IP2 vlees+ws-cnd [154.194.0.235]']);
    expect(sourceGroup5?.proxies).toEqual(['反代IP5 vlees+ws-cnd [154.194.0.235]']);
  });
});
