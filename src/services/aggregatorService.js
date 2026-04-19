import { ProxyParser } from '../parsers/index.js';
import { serializeProxyToShareUri } from '../parsers/shareLinkSerializer.js';
import { InvalidPayloadError } from './errors.js';

function resolveProxyPort(proxy) {
    return Number(proxy?.server_port ?? proxy?.port ?? 0) || 0;
}

export class AggregatorService {
    static SOURCE_FETCH_TIMEOUT_MS = 15000;
    static DEFAULT_AIRPORT_USER_AGENT = 'clash-verge/v2.0.0';

    constructor(kv) {
        this.kv = kv;
    }

    _normalizeDirectNodeGroups(data = {}) {
        const groups = Array.isArray(data.directNodeGroups)
            ? data.directNodeGroups
            : [];
        const normalized = groups
            .map(group => ({
                name: group?.name || '',
                prefix: group?.prefix || '',
                content: group?.content || ''
            }))
            .filter(group => group.content.trim() || group.prefix.trim() || group.name.trim());

        if (normalized.length > 0) return normalized;

        const legacy = data.directNodes;
        if (legacy?.content?.trim() || legacy?.prefix?.trim()) {
            return [{
                name: '',
                prefix: legacy.prefix || '',
                content: legacy.content || ''
            }];
        }

        return [];
    }

    _legacyDirectNodesFromGroups(groups = []) {
        const first = groups.find(group => group?.content?.trim() || group?.prefix?.trim());
        return {
            content: first?.content || '',
            prefix: first?.prefix || ''
        };
    }

    _normalizeAirportSources(sources = []) {
        return (Array.isArray(sources) ? sources : []).map(source => ({
            url: source?.url || '',
            prefix: source?.prefix || '',
            name: source?.name || '',
            userAgent: source?.userAgent || ''
        }));
    }

    _normalizeAirportRefreshResults(results = []) {
        return (Array.isArray(results) ? results : []).map((result, index) => ({
            index: Number.isInteger(result?.index) ? result.index : index,
            url: result?.url || '',
            prefix: result?.prefix || '',
            name: result?.name || '',
            profileName: result?.profileName || '',
            userAgent: result?.userAgent || '',
            status: result?.status || 'pending',
            proxyCount: Number(result?.proxyCount) || 0,
            error: result?.error || '',
            refreshedAt: Number(result?.refreshedAt) || 0
        }));
    }

    _normalizePreferredIpGroups(groups = []) {
        return (Array.isArray(groups) ? groups : []).map(group => ({
            name: group?.name || '',
            prefix: group?.prefix || '',
            node: group?.node || '',
            ips: group?.ips || ''
        })).filter(group => group.name.trim() || group.prefix.trim() || group.node.trim() || group.ips.trim());
    }

    _normalizeKey(value) {
        return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
    }

    _requirePrefix(value, label) {
        if (!this._normalizeKey(value)) {
            throw new InvalidPayloadError(`${label}必须填写节点前缀`);
        }
    }

    _getAirportNodePrefix(source, index) {
        const explicitPrefix = source?.prefix?.trim();
        if (explicitPrefix) {
            return explicitPrefix;
        }

        const profileName = source?.profileName?.trim();
        if (profileName) {
            return profileName;
        }

        try {
            const hostname = new URL(source?.url || '').hostname;
            if (hostname) {
                return hostname;
            }
        } catch (_) {}

        return `airport-${index + 1}`;
    }

    _getAirportUserAgent(sourceUserAgent, fallbackUserAgent) {
        const explicitUserAgent = sourceUserAgent?.trim();
        if (explicitUserAgent) {
            return explicitUserAgent;
        }

        const requestUserAgent = fallbackUserAgent?.trim();
        if (requestUserAgent && /clash|verge|mihomo|meta|stash|shadowrocket|nekobox/i.test(requestUserAgent)) {
            return requestUserAgent;
        }

        return AggregatorService.DEFAULT_AIRPORT_USER_AGENT;
    }

    _getSourceDisplayName(kind, source, index) {
        const name = source?.name?.trim();
        if (name) return name;

        if (kind === 'airport') {
            return this._getAirportNodePrefix(source, index);
        }

        const prefix = source?.prefix?.trim();
        if (prefix) return prefix;

        if (kind === 'preferred-ip') {
            return `Preferred IP ${index + 1}`;
        }

        return `Custom ${index + 1}`;
    }

    _getSourceGroupName(kind, source, index) {
        const displayName = this._getSourceDisplayName(kind, source, index);
        if (kind === 'airport') return `✈️ ${displayName}`;
        if (kind === 'preferred-ip') return `🎯 ${displayName}`;
        return `🧩 ${displayName}`;
    }

    _attachSourceMeta(proxies, meta) {
        return (Array.isArray(proxies) ? proxies : []).map(proxy => ({
            ...proxy,
            _aggregatorSourceGroupName: meta?.groupName,
            _aggregatorSourceType: meta?.sourceType,
            _aggregatorSourceName: meta?.sourceName,
            _aggregatorSourcePrefix: meta?.sourcePrefix || ''
        }));
    }

    _attachRawUri(result, rawUri) {
        if (!rawUri || !result) return result;
        if (Array.isArray(result)) {
            return result.map(item => item?.tag ? { ...item, _rawUri: rawUri } : item);
        }
        if (result?.tag) {
            return { ...result, _rawUri: rawUri };
        }
        if (Array.isArray(result?.proxies)) {
            return {
                ...result,
                proxies: result.proxies.map(item => item?.tag ? { ...item, _rawUri: rawUri } : item)
            };
        }
        return result;
    }

    _splitIpLines(input = '') {
        return String(input)
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
    }

    _buildPreferredIpTag(baseTag, ip, prefix) {
        const name = [prefix?.trim(), baseTag].filter(Boolean).join(' ').trim();
        return `${name || 'Preferred IP'} [${ip}]`;
    }

    _buildAirportRefreshResult(source, index, extras = {}) {
        const runtimeSource = extras?.runtimeSource || source || {};
        return {
            index,
            url: source?.url?.trim() || '',
            prefix: extras?.prefix ?? this._getAirportNodePrefix(runtimeSource, index),
            name: extras?.name ?? this._getSourceDisplayName('airport', runtimeSource, index),
            profileName: extras?.profileName || runtimeSource?.profileName || '',
            userAgent: extras?.userAgent || this._getAirportUserAgent(source?.userAgent, ''),
            status: extras?.status || 'pending',
            proxyCount: Number(extras?.proxyCount) || 0,
            error: extras?.error || '',
            refreshedAt: Number(extras?.refreshedAt) || Date.now()
        };
    }

    _validateUniqueGroupFields({ directNodeGroups = [], airportSources = [], preferredIpGroups = [] }) {
        directNodeGroups.forEach((item, index) => {
            if (item?.content?.trim() || item?.name?.trim()) {
                this._requirePrefix(item?.prefix, `直接节点分组 #${index + 1} `);
            }
        });

        preferredIpGroups.forEach((item, index) => {
            if (item?.node?.trim() || item?.ips?.trim() || item?.name?.trim()) {
                this._requirePrefix(item?.prefix, `优选 IP 分组 #${index + 1} `);
            }
        });

        const seenPrefixes = new Map();
        const seenNames = new Map();
        const entries = [
            ...directNodeGroups.map((item, index) => ({ kind: 'directNodeGroups', index, prefix: item?.prefix, name: item?.name })),
            ...airportSources.map((item, index) => ({ kind: 'airportSources', index, prefix: item?.prefix, name: item?.name })),
            ...preferredIpGroups.map((item, index) => ({ kind: 'preferredIpGroups', index, prefix: item?.prefix, name: item?.name }))
        ];

        for (const entry of entries) {
            const prefix = this._normalizeKey(entry.prefix);
            const name = this._normalizeKey(entry.name);
            const label = `${entry.kind}[${entry.index + 1}]`;

            if (prefix) {
                if (seenPrefixes.has(prefix)) {
                    throw new InvalidPayloadError(`节点前缀重复: "${entry.prefix?.trim()}" 已在 ${seenPrefixes.get(prefix)} 使用`);
                }
                seenPrefixes.set(prefix, label);
            }

            if (name) {
                if (seenNames.has(name)) {
                    throw new InvalidPayloadError(`分组名称重复: "${entry.name?.trim()}" 已在 ${seenNames.get(name)} 使用`);
                }
                seenNames.set(name, label);
            }
        }
    }

    _genId() {
        return 'agg_' + Math.random().toString(36).slice(2, 10);
    }

    async create(userId, data) {
        const id = this._genId();
        const directNodeGroups = this._normalizeDirectNodeGroups(data);
        const airportSources = this._normalizeAirportSources(data.airportSources);
        const preferredIpGroups = this._normalizePreferredIpGroups(data.preferredIpGroups);

        this._validateUniqueGroupFields({ directNodeGroups, airportSources, preferredIpGroups });

        const agg = {
            id,
            userId,
            name: data.name || 'Untitled Aggregator',
            directNodeGroups,
            directNodes: this._legacyDirectNodesFromGroups(directNodeGroups),
            airportSources,
            airportRefreshResults: [],
            preferredIpGroups,
            refreshInterval: Number(data.refreshInterval) || 3600,
            selectedRules: data.selectedRules || [],
            customRules: data.customRules || [],
            groupByCountry: !!data.groupByCountry,
            includeAutoSelect: data.includeAutoSelect !== false,
            configId: data.configId || null,
            lastRefresh: 0,
            cachedProxies: []
        };

        await this.kv.put(`agg:${id}`, JSON.stringify(agg));

        const listRaw = await this.kv.get(`user_aggs:${userId}`);
        const list = listRaw ? JSON.parse(listRaw) : [];
        list.push(id);
        await this.kv.put(`user_aggs:${userId}`, JSON.stringify(list));

        await this._addUserToSchedulerIndex(userId);

        return agg;
    }

    async get(id) {
        const raw = await this.kv.get(`agg:${id}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            ...parsed,
            airportRefreshResults: this._normalizeAirportRefreshResults(parsed.airportRefreshResults)
        };
    }

    async list(userId) {
        const listRaw = await this.kv.get(`user_aggs:${userId}`);
        if (!listRaw) return [];
        const ids = JSON.parse(listRaw);
        const aggs = await Promise.all(ids.map(id => this.get(id)));
        return aggs.filter(Boolean).map(a => ({
            ...a,
            cachedProxyCount: a.cachedProxies?.length || 0,
            cachedProxies: undefined
        }));
    }

    async listCachedProxyDetails(id) {
        const agg = await this.get(id);
        if (!agg) return [];
        return (agg.cachedProxies || []).map((proxy, index) => ({
            index,
            name: proxy?.tag || `Proxy ${index + 1}`,
            type: proxy?.type || '',
            server: proxy?.server || '',
            port: resolveProxyPort(proxy),
            shareUri: proxy?._shareUri || proxy?._rawUri || serializeProxyToShareUri(proxy),
            sourceGroupName: proxy?._aggregatorSourceGroupName || '',
            sourceName: proxy?._aggregatorSourceName || '',
            sourcePrefix: proxy?._aggregatorSourcePrefix || ''
        }));
    }

    async update(id, userId, data) {
        const agg = await this.get(id);
        if (!agg || agg.userId !== userId) throw new Error('Not found');

        const directNodeGroups = data.directNodeGroups !== undefined || data.directNodes !== undefined
            ? this._normalizeDirectNodeGroups(data)
            : this._normalizeDirectNodeGroups(agg);
        const airportSources = data.airportSources !== undefined
            ? this._normalizeAirportSources(data.airportSources)
            : this._normalizeAirportSources(agg.airportSources);
        const preferredIpGroups = data.preferredIpGroups !== undefined
            ? this._normalizePreferredIpGroups(data.preferredIpGroups)
            : this._normalizePreferredIpGroups(agg.preferredIpGroups);

        this._validateUniqueGroupFields({ directNodeGroups, airportSources, preferredIpGroups });

        const updated = {
            ...agg,
            name: data.name ?? agg.name,
            directNodeGroups,
            directNodes: this._legacyDirectNodesFromGroups(directNodeGroups),
            airportSources,
            airportRefreshResults: [],
            preferredIpGroups,
            refreshInterval: data.refreshInterval != null ? Number(data.refreshInterval) : agg.refreshInterval,
            selectedRules: data.selectedRules ?? agg.selectedRules,
            customRules: data.customRules ?? agg.customRules,
            groupByCountry: data.groupByCountry != null ? !!data.groupByCountry : agg.groupByCountry,
            includeAutoSelect: data.includeAutoSelect != null ? data.includeAutoSelect !== false : agg.includeAutoSelect,
            configId: data.configId !== undefined ? data.configId : agg.configId,
            lastRefresh: 0,
            cachedProxies: []
        };

        await this.kv.put(`agg:${id}`, JSON.stringify(updated));
        return updated;
    }

    async delete(id, userId) {
        const agg = await this.get(id);
        if (!agg || agg.userId !== userId) throw new Error('Not found');

        await this.kv.delete(`agg:${id}`);

        const listRaw = await this.kv.get(`user_aggs:${userId}`);
        if (listRaw) {
            const list = JSON.parse(listRaw).filter(i => i !== id);
            await this.kv.put(`user_aggs:${userId}`, JSON.stringify(list));
        }
    }

    needsRefresh(agg) {
        if (!agg.lastRefresh || !agg.cachedProxies?.length) return true;
        const interval = (agg.refreshInterval || 3600) * 1000;
        return Date.now() - agg.lastRefresh > interval;
    }

    async refresh(id, userAgent = 'curl/7.74.0') {
        const agg = await this.get(id);
        if (!agg) throw new Error('Not found');

        const allProxies = [];
        const airportRefreshResults = [];

        const directGroups = this._normalizeDirectNodeGroups(agg);
        for (const [index, group] of directGroups.entries()) {
            if (!group.content?.trim()) continue;
            try {
                const proxies = await this._parseDirectNodes(group.content, userAgent);
                const sourceGroupName = this._getSourceGroupName('direct', group, index);
                const prefix = group.prefix?.trim();
                const sourceName = this._getSourceDisplayName('direct', group, index);
                const attached = this._attachSourceMeta(proxies, {
                    groupName: sourceGroupName,
                    sourceType: 'direct',
                    sourceName,
                    sourcePrefix: prefix
                });
                for (const p of attached) {
                    allProxies.push(prefix ? { ...p, tag: `${prefix} ${p.tag}` } : p);
                }
            } catch (e) {
                console.error(`[AggregatorService] Failed to parse direct node group ${group.name || group.prefix || 'unnamed'}:`, e.message);
            }
        }

        for (const [index, source] of (agg.airportSources || []).entries()) {
            if (!source.url?.trim()) continue;
            try {
                const sourceUserAgent = this._getAirportUserAgent(source.userAgent, userAgent);
                const fetched = await this._fetchSourceWithMeta(source.url.trim(), sourceUserAgent);
                const runtimeSource = fetched?.profileName ? { ...source, profileName: fetched.profileName } : source;
                const proxies = fetched?.proxies || [];
                const sourceGroupName = this._getSourceGroupName('airport', runtimeSource, index);
                const prefix = this._getAirportNodePrefix(runtimeSource, index);
                const sourceName = this._getSourceDisplayName('airport', runtimeSource, index);
                airportRefreshResults.push(this._buildAirportRefreshResult(source, index, {
                    runtimeSource,
                    prefix,
                    name: sourceName,
                    profileName: fetched?.profileName || '',
                    userAgent: sourceUserAgent,
                    status: proxies.length > 0 ? 'success' : 'empty',
                    proxyCount: proxies.length
                }));
                const attached = this._attachSourceMeta(proxies, {
                    groupName: sourceGroupName,
                    sourceType: 'airport',
                    sourceName,
                    sourcePrefix: prefix
                });
                for (const p of attached) {
                    allProxies.push(prefix ? { ...p, tag: `${prefix} ${p.tag}` } : p);
                }
            } catch (e) {
                const sourceUserAgent = this._getAirportUserAgent(source.userAgent, userAgent);
                airportRefreshResults.push(this._buildAirportRefreshResult(source, index, {
                    userAgent: sourceUserAgent,
                    status: 'error',
                    error: e?.message || 'Unknown error'
                }));
                console.error(`[AggregatorService] Failed to fetch ${source.url}:`, e.message);
            }
        }

        for (const [index, group] of (agg.preferredIpGroups || []).entries()) {
            if (!group.node?.trim() || !group.ips?.trim()) continue;
            try {
                const proxies = await this._parsePreferredIpGroup(group, userAgent);
                const sourceGroupName = this._getSourceGroupName('preferred-ip', group, index);
                const sourceName = this._getSourceDisplayName('preferred-ip', group, index);
                allProxies.push(...this._attachSourceMeta(proxies, {
                    groupName: sourceGroupName,
                    sourceType: 'preferred-ip',
                    sourceName,
                    sourcePrefix: group.prefix?.trim()
                }));
            } catch (e) {
                console.error(`[AggregatorService] Failed to parse preferred IP group ${group.name || group.prefix || 'unnamed'}:`, e.message);
            }
        }

        agg.cachedProxies = allProxies;
        agg.airportRefreshResults = airportRefreshResults;
        agg.lastRefresh = Date.now();
        await this.kv.put(`agg:${id}`, JSON.stringify(agg));

        return agg;
    }

    async resolveAirportSourceMeta(source, userAgent = 'curl/7.74.0') {
        const url = source?.url?.trim();
        if (!url) {
            throw new InvalidPayloadError('机场订阅地址不能为空');
        }

        const sourceUserAgent = this._getAirportUserAgent(source?.userAgent, userAgent);
        const fetched = await this._fetchSourceWithMeta(url, sourceUserAgent);
        const runtimeSource = fetched?.profileName ? { ...source, profileName: fetched.profileName } : source;
        const prefix = this._getAirportNodePrefix(runtimeSource, 0);
        const displayName = this._getSourceDisplayName('airport', runtimeSource, 0);

        return {
            prefix,
            name: displayName,
            profileName: fetched?.profileName,
            userAgent: sourceUserAgent
        };
    }

    async getOrRefresh(id, userAgent) {
        const agg = await this.get(id);
        if (!agg) return null;
        if (this.needsRefresh(agg)) {
            return await this.refresh(id, userAgent);
        }
        return agg;
    }

    async _parseDirectNodes(content, userAgent) {
        const proxies = [];
        const { parseSubscriptionContent } = await import('../parsers/subscription/subscriptionContentParser.js');
        const { tryDecodeSubscriptionLines } = await import('../utils.js');

        let decoded = content;
        const trimmedAll = content.replace(/\s+/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(trimmedAll) && trimmedAll.length % 4 === 0) {
            try {
                const { decodeBase64 } = await import('../utils.js');
                const d = decodeBase64(trimmedAll);
                if (d && typeof d === 'string' && (d.includes('://') || d.includes('\n'))) {
                    decoded = d;
                }
            } catch (_) {}
        }

        const structuredResult = parseSubscriptionContent(decoded);
        if (structuredResult && typeof structuredResult === 'object' && Array.isArray(structuredResult.proxies)) {
            return structuredResult.proxies.filter(p => p?.tag);
        }

        const subscriptionLines = tryDecodeSubscriptionLines(decoded, { decodeUriComponent: true });
        if (Array.isArray(subscriptionLines) || (typeof subscriptionLines === 'string' && subscriptionLines.includes('://'))) {
            const lines = Array.isArray(subscriptionLines)
                ? subscriptionLines
                : subscriptionLines.split('\n').filter(line => line.trim());
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                    try {
                        const fetched = await this._fetchSource(trimmed, userAgent);
                        proxies.push(...fetched);
                    } catch (_) {}
                    continue;
                }

                try {
                    const result = this._attachRawUri(await ProxyParser.parse(trimmed, userAgent), trimmed);
                    if (!result) continue;
                    if (Array.isArray(result)) {
                        proxies.push(...result.filter(r => r?.tag));
                    } else if (result.tag) {
                        proxies.push(result);
                    } else if (result.proxies && Array.isArray(result.proxies)) {
                        proxies.push(...result.proxies.filter(r => r?.tag));
                    }
                } catch (_) {}
            }
            return proxies;
        }

        const lines = decoded.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                try {
                    const fetched = await this._fetchSource(trimmed, userAgent);
                    proxies.push(...fetched);
                } catch (_) {}
                continue;
            }

            try {
                const result = await ProxyParser.parse(trimmed, userAgent);
                if (!result) continue;
                if (Array.isArray(result)) {
                    proxies.push(...result.filter(r => r?.tag));
                } else if (result.tag) {
                    proxies.push(result);
                } else if (result.proxies && Array.isArray(result.proxies)) {
                    proxies.push(...result.proxies.filter(r => r?.tag));
                }
            } catch (_) {}
        }
        return proxies;
    }

    async _fetchSource(url, userAgent) {
        const result = await this._fetchSourceWithMeta(url, userAgent);
        return result.proxies;
    }

    async _fetchSourceWithMeta(url, userAgent) {
        const { fetchSubscriptionWithFormat } = await import('../parsers/subscription/httpSubscriptionFetcher.js');
        const { parseSubscriptionContent } = await import('../parsers/subscription/subscriptionContentParser.js');
        const { tryDecodeSubscriptionLines } = await import('../utils.js');

        const fetchResult = await this._withTimeout(
            fetchSubscriptionWithFormat(url, userAgent, { throwOnError: true }),
            AggregatorService.SOURCE_FETCH_TIMEOUT_MS,
            `Fetch timeout: ${url}`
        );
        if (!fetchResult) return { proxies: [], profileName: undefined };

        const structuredResult = parseSubscriptionContent(fetchResult.content);
        if (structuredResult && typeof structuredResult === 'object' && Array.isArray(structuredResult.proxies)) {
            return {
                proxies: structuredResult.proxies.filter(p => p?.tag),
                profileName: fetchResult.profileName
            };
        }

        const subscriptionLines = tryDecodeSubscriptionLines(fetchResult.content, { decodeUriComponent: true });
        if (Array.isArray(subscriptionLines) || (typeof subscriptionLines === 'string' && subscriptionLines.includes('://'))) {
            const lines = Array.isArray(subscriptionLines)
                ? subscriptionLines
                : subscriptionLines.split('\n').filter(line => line.trim());
            const proxies = [];
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const parsed = this._attachRawUri(await ProxyParser.parse(trimmed, userAgent), trimmed);
                    if (!parsed) continue;
                    if (Array.isArray(parsed)) {
                        proxies.push(...parsed.filter(item => item?.tag));
                    } else if (parsed?.tag) {
                        proxies.push(parsed);
                    } else if (Array.isArray(parsed?.proxies)) {
                        proxies.push(...parsed.proxies.filter(item => item?.tag));
                    }
                } catch (_) {}
            }
            return { proxies, profileName: fetchResult.profileName };
        }

        const result = structuredResult;
        if (!result) return { proxies: [], profileName: fetchResult.profileName };

        if (Array.isArray(result)) {
            const proxies = [];
            for (const item of result) {
                if (item?.tag) {
                    proxies.push(item);
                } else if (typeof item === 'string') {
                    const parsed = await ProxyParser.parse(item, userAgent);
                    if (parsed?.tag) proxies.push(parsed);
                }
            }
            return { proxies, profileName: fetchResult.profileName };
        }

        if (result.proxies) {
            return { proxies: result.proxies.filter(p => p?.tag), profileName: fetchResult.profileName };
        }
        return { proxies: [], profileName: fetchResult.profileName };
    }

    async _parsePreferredIpGroup(group, userAgent) {
        const node = group?.node?.trim();
        if (!node) return [];

        const result = await ProxyParser.parse(node, userAgent);
        const candidates = Array.isArray(result)
            ? result
            : Array.isArray(result?.proxies)
                ? result.proxies
                : result
                    ? [result]
                    : [];
        const baseProxy = candidates.find(item => item?.tag && item?.server);
        if (!baseProxy) return [];

        return this._splitIpLines(group.ips).map(ip => ({
            ...baseProxy,
            server: ip,
            tag: this._buildPreferredIpTag(baseProxy.tag, ip, group.prefix),
            _rawUri: undefined
        }));
    }

    async _withTimeout(promise, timeoutMs, message) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
        });

        try {
            return await Promise.race([promise, timeout]);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async _addUserToSchedulerIndex(userId) {
        const raw = await this.kv.get('agg_scheduler:user_index');
        const userIds = raw ? JSON.parse(raw) : [];
        if (!userIds.includes(userId)) {
            userIds.push(userId);
            await this.kv.put('agg_scheduler:user_index', JSON.stringify(userIds));
        }
    }
}
