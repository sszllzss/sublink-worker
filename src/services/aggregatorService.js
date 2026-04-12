import { ProxyParser } from '../parsers/index.js';

export class AggregatorService {
    static SOURCE_FETCH_TIMEOUT_MS = 15000;

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

    _genId() {
        return 'agg_' + Math.random().toString(36).slice(2, 10);
    }

    async create(userId, data) {
        const id = this._genId();
        const directNodeGroups = this._normalizeDirectNodeGroups(data);
        const agg = {
            id,
            userId,
            name: data.name || '未命名聚合',
            directNodeGroups,
            directNodes: this._legacyDirectNodesFromGroups(directNodeGroups),
            airportSources: this._normalizeAirportSources(data.airportSources),
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

        // 注册到调度器用户索引
        await this._addUserToSchedulerIndex(userId);

        return agg;
    }

    async get(id) {
        const raw = await this.kv.get(`agg:${id}`);
        if (!raw) return null;
        return JSON.parse(raw);
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

    async update(id, userId, data) {
        const agg = await this.get(id);
        if (!agg || agg.userId !== userId) throw new Error('Not found');

        const directNodeGroups = data.directNodeGroups !== undefined || data.directNodes !== undefined
            ? this._normalizeDirectNodeGroups(data)
            : this._normalizeDirectNodeGroups(agg);
        const updated = {
            ...agg,
            name: data.name ?? agg.name,
            directNodeGroups,
            directNodes: this._legacyDirectNodesFromGroups(directNodeGroups),
            airportSources: data.airportSources !== undefined
                ? this._normalizeAirportSources(data.airportSources)
                : this._normalizeAirportSources(agg.airportSources),
            refreshInterval: data.refreshInterval != null ? Number(data.refreshInterval) : agg.refreshInterval,
            selectedRules: data.selectedRules ?? agg.selectedRules,
            customRules: data.customRules ?? agg.customRules,
            groupByCountry: data.groupByCountry != null ? !!data.groupByCountry : agg.groupByCountry,
            includeAutoSelect: data.includeAutoSelect != null ? data.includeAutoSelect !== false : agg.includeAutoSelect,
            configId: data.configId !== undefined ? data.configId : agg.configId,
            // Reset cache when config changes
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

        // Parse direct node groups
        const directGroups = this._normalizeDirectNodeGroups(agg);
        for (const group of directGroups) {
            if (!group.content?.trim()) continue;
            try {
                const proxies = await this._parseDirectNodes(group.content, userAgent);
                const prefix = group.prefix?.trim();
                for (const p of proxies) {
                    allProxies.push(prefix ? { ...p, tag: `${prefix} ${p.tag}` } : p);
                }
            } catch (e) {
                console.error(`[AggregatorService] Failed to parse direct node group ${group.name || group.prefix || 'unnamed'}:`, e.message);
            }
        }

        // Fetch and parse airport sources
        for (const source of (agg.airportSources || [])) {
            if (!source.url?.trim()) continue;
            try {
                const sourceUserAgent = source.userAgent?.trim() || userAgent;
                const proxies = await this._fetchSource(source.url.trim(), sourceUserAgent);
                const prefix = source.prefix?.trim();
                for (const p of proxies) {
                    allProxies.push(prefix ? { ...p, tag: `${prefix} ${p.tag}` } : p);
                }
            } catch (e) {
                console.error(`[AggregatorService] Failed to fetch ${source.url}:`, e.message);
            }
        }

        agg.cachedProxies = allProxies;
        agg.lastRefresh = Date.now();
        await this.kv.put(`agg:${id}`, JSON.stringify(agg));

        return agg;
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

        // 先尝试整体 base64 解码
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

        const directResult = parseSubscriptionContent(decoded);
        if (directResult && typeof directResult === 'object' && Array.isArray(directResult.proxies)) {
            return directResult.proxies.filter(p => p?.tag);
        }

        const lines = decoded.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // HTTP(S) URL — 当作订阅源拉取
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
        const { fetchSubscriptionWithFormat } = await import('../parsers/subscription/httpSubscriptionFetcher.js');
        const { parseSubscriptionContent } = await import('../parsers/subscription/subscriptionContentParser.js');

        const fetchResult = await this._withTimeout(
            fetchSubscriptionWithFormat(url, userAgent),
            AggregatorService.SOURCE_FETCH_TIMEOUT_MS,
            `Fetch timeout: ${url}`
        );
        if (!fetchResult) return [];

        const result = parseSubscriptionContent(fetchResult.content);
        if (!result) return [];

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
            return proxies;
        }

        if (result.proxies) return result.proxies.filter(p => p?.tag);
        return [];
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
