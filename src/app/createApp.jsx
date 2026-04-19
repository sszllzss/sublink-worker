/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { Hono } from 'hono';
import { Layout } from '../components/Layout.jsx';
import { Navbar } from '../components/Navbar.jsx';
import { Form } from '../components/Form.jsx';
import { Footer } from '../components/Footer.jsx';
import { UpdateChecker } from '../components/UpdateChecker.jsx';
import { AggregatorPage } from '../components/AggregatorPage.jsx';
import { SingboxConfigBuilder } from '../builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../builders/SurgeConfigBuilder.js';
import { createTranslator, resolveLanguage } from '../i18n/index.js';
import { encodeBase64, tryDecodeSubscriptionLines } from '../utils.js';
import { APP_NAME, APP_SUBTITLE } from '../constants.js';
import { ShortLinkService } from '../services/shortLinkService.js';
import { ConfigStorageService } from '../services/configStorageService.js';
import { AuthService } from '../services/authService.js';
import { AggregatorService } from '../services/aggregatorService.js';
import { ServiceError, MissingDependencyError } from '../services/errors.js';
import { serializeProxyToShareUri } from '../parsers/shareLinkSerializer.js';
import { normalizeRuntime } from '../runtime/runtimeConfig.js';
import { PREDEFINED_RULE_SETS, SING_BOX_CONFIG, SING_BOX_CONFIG_V1_11, generateSubconverterConfig } from '../config/index.js';
import { AggregatorScheduler } from '../services/aggregatorScheduler.js';

const DEFAULT_USER_AGENT = 'curl/7.74.0';

export function createApp(bindings = {}) {
    const runtime = normalizeRuntime(bindings);
    const services = {
        shortLinks: runtime.kv ? new ShortLinkService(runtime.kv, { shortLinkTtlSeconds: runtime.config.shortLinkTtlSeconds }) : null,
        configStorage: runtime.kv ? new ConfigStorageService(runtime.kv, { configTtlSeconds: runtime.config.configTtlSeconds }) : null,
        auth: runtime.kv ? new AuthService(runtime.kv) : null,
        aggregator: runtime.kv ? new AggregatorService(runtime.kv) : null,
        scheduler: runtime.kv ? new AggregatorScheduler(runtime.kv, runtime.logger) : null
    };

    // 请求驱动的后台刷新：限制最多每 30 秒扫描一次，不阻塞请求
    let _lastSchedulerRun = 0;
    const SCHEDULER_COOLDOWN_MS = 30_000;

    const app = new Hono();

    app.use('*', async (c, next) => {
        const acceptLanguage = getRequestHeader(c.req, 'Accept-Language');
        const lang = c.req.query('lang') || acceptLanguage?.split(',')[0] || 'zh-CN';
        c.set('lang', lang);
        c.set('t', createTranslator(lang));

        // 非阻塞后台刷新：每 30 秒最多触发一次扫描
        if (services.scheduler) {
            const now = Date.now();
            if (now - _lastSchedulerRun > SCHEDULER_COOLDOWN_MS) {
                _lastSchedulerRun = now;
                // fire-and-forget，不阻塞当前请求
                services.scheduler.tick().catch(() => {});
            }
        }

        await next();
    });

    app.get('/', (c) => {
        const t = c.get('t');
        const lang = resolveLanguage(c.get('lang'));
        const subtitle = APP_SUBTITLE[lang] || APP_SUBTITLE['zh-CN'];

        return c.html(
            <Layout title={t('pageTitle')} description={t('pageDescription')} keywords={t('pageKeywords')}>
                <div class="flex flex-col min-h-screen">
                    <Navbar />
                    <main class="flex-1">
                        <div class="container mx-auto px-4 py-8 pt-24">
                            <div class="max-w-4xl mx-auto">
                                <div class="text-center mb-12 pt-8">
                                    <h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
                                        {APP_NAME}
                                    </h1>
                                    <p class="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                                        {subtitle}
                                    </p>
                                </div>
                                <Form t={t} lang={lang} />
                            </div>
                        </div>
                    </main>
                    <Footer />
                    <UpdateChecker />
                </div>
            </Layout>
        );
    });

    app.get('/singbox', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            const requestedSingboxVersion = c.req.query('singbox_version') || c.req.query('sb_version') || c.req.query('sb_ver');
            const requestUserAgent = getRequestHeader(c.req, 'User-Agent');
            const singboxConfigVersion = resolveSingboxConfigVersion(requestedSingboxVersion, requestUserAgent);

            let baseConfig = singboxConfigVersion === '1.11' ? SING_BOX_CONFIG_V1_11 : SING_BOX_CONFIG;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                const storedConfig = await storage.getConfigById(configId);
                if (storedConfig) {
                    baseConfig = storedConfig;
                }
            }

            const builder = new SingboxConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                singboxConfigVersion,
                includeAutoSelect
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.json(builder.config);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/clash', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const enableClashUI = parseBooleanFlag(c.req.query('enable_clash_ui'));
            const externalController = c.req.query('external_controller');
            const externalUiDownloadUrl = c.req.query('external_ui_download_url');
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new ClashConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                enableClashUI,
                externalController,
                externalUiDownloadUrl,
                includeAutoSelect
            );
            await builder.build();
            const userinfo = builder.getSubscriptionUserinfo();
            const headers = { 'Content-Type': 'text/yaml; charset=utf-8' };
            if (userinfo) {
                headers['subscription-userinfo'] = userinfo;
            }
            return c.text(builder.formatConfig(), 200, headers);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/surge', async (c) => {
        try {
            const config = c.req.query('config');
            if (!config) {
                return c.text('Missing config parameter', 400);
            }

            const selectedRules = parseSelectedRules(c.req.query('selectedRules'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const configId = c.req.query('configId');
            const lang = c.get('lang');

            let baseConfig;
            if (configId) {
                const storage = requireConfigStorage(services.configStorage);
                baseConfig = await storage.getConfigById(configId);
            }

            const builder = new SurgeConfigBuilder(
                config,
                selectedRules,
                customRules,
                baseConfig,
                lang,
                ua,
                groupByCountry,
                includeAutoSelect
            );
            builder.setSubscriptionUrl(c.req.url);
            await builder.build();

            const userinfo = builder.getSubscriptionUserinfo();
            if (userinfo) {
                c.header('subscription-userinfo', userinfo);
            }
            return c.text(builder.formatConfig());
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/subconverter', (c) => {
        try {
            const rawSelectedRules = c.req.query('selectedRules');
            let selectedRules;

            if (!rawSelectedRules) {
                selectedRules = PREDEFINED_RULE_SETS.balanced;
            } else if (PREDEFINED_RULE_SETS[rawSelectedRules]) {
                selectedRules = PREDEFINED_RULE_SETS[rawSelectedRules];
            } else {
                try {
                    const parsed = JSON.parse(rawSelectedRules);
                    if (Array.isArray(parsed)) {
                        selectedRules = parsed;
                    } else {
                        return c.text('Invalid selectedRules: must be a preset name (minimal, balanced, comprehensive) or a JSON array', 400);
                    }
                } catch {
                    return c.text(`Invalid selectedRules: "${rawSelectedRules}" is not a valid preset name or JSON array. Valid presets: minimal, balanced, comprehensive`, 400);
                }
            }

            const includeAutoSelect = c.req.query('include_auto_select') !== 'false';
            const groupByCountry = parseBooleanFlag(c.req.query('group_by_country'));
            const customRules = parseJsonArray(c.req.query('customRules'));
            const lang = c.get('lang');

            const config = generateSubconverterConfig({
                selectedRules,
                customRules,
                lang,
                includeAutoSelect,
                groupByCountry
            });

            return c.text(config, 200, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/xray', async (c) => {
        const inputString = c.req.query('config');
        if (!inputString) {
            return c.text('Missing config parameter', 400);
        }

        const proxylist = inputString.split('\n');
        const finalProxyList = [];
        const userAgent = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
        const headers = { 'User-Agent': userAgent };

        for (const proxy of proxylist) {
            const trimmedProxy = proxy.trim();
            if (!trimmedProxy) continue;

            if (trimmedProxy.startsWith('http://') || trimmedProxy.startsWith('https://')) {
                try {
                    const response = await fetch(trimmedProxy, { method: 'GET', headers });
                    const text = await response.text();
                    let processed = tryDecodeSubscriptionLines(text, { decodeUriComponent: true });
                    if (!Array.isArray(processed)) processed = [processed];
                    finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
                } catch (e) {
                    runtime.logger.warn('Failed to fetch the proxy', e);
                }
            } else {
                let processed = tryDecodeSubscriptionLines(trimmedProxy);
                if (!Array.isArray(processed)) processed = [processed];
                finalProxyList.push(...processed.filter(item => typeof item === 'string' && item.trim() !== ''));
            }
        }

        const finalString = finalProxyList.join('\n');
        if (!finalString) {
            return c.text('Missing config parameter', 400);
        }

        return c.text(encodeBase64(finalString));
    });

    app.get('/shorten-v2', async (c) => {
        try {
            const url = c.req.query('url');
            if (!url) {
                return c.text('Missing URL parameter', 400);
            }
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                return c.text('Invalid URL parameter', 400);
            }
            const queryString = parsedUrl.search;

            const shortLinks = requireShortLinkService(services.shortLinks);
            const code = await shortLinks.createShortLink(queryString, c.req.query('shortCode'));
            return c.text(code);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    const redirectHandler = (prefix) => async (c) => {
        try {
            const code = c.req.param('code');
            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(code);
            if (!originalParam) return c.text('Short URL not found', 404);

            const url = new URL(c.req.url);
            return c.redirect(`${url.origin}/${prefix}${originalParam}`);
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    };

    app.get('/s/:code', redirectHandler('surge'));
    app.get('/b/:code', redirectHandler('singbox'));
    app.get('/c/:code', redirectHandler('clash'));
    app.get('/x/:code', redirectHandler('xray'));

    app.post('/config', async (c) => {
        try {
            const { type, content } = await c.req.json();
            const storage = requireConfigStorage(services.configStorage);
            const configId = await storage.saveConfig(type, content);
            return c.text(configId);
        } catch (error) {
            if (error instanceof SyntaxError) {
                return c.text(`Invalid format: ${error.message}`, 400);
            }
            return handleError(c, error, runtime.logger);
        }
    });

    app.get('/resolve', async (c) => {
        try {
            const shortUrl = c.req.query('url');
            const t = c.get('t');
            if (!shortUrl) return c.text(t('missingUrl'), 400);

            let urlObj;
            try {
                urlObj = new URL(shortUrl);
            } catch {
                return c.text(t('invalidShortUrl'), 400);
            }
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length < 3) return c.text(t('invalidShortUrl'), 400);

            const prefix = pathParts[1];
            const shortCode = pathParts[2];
            if (!['b', 'c', 'x', 's'].includes(prefix)) return c.text(t('invalidShortUrl'), 400);

            const shortLinks = requireShortLinkService(services.shortLinks);
            const originalParam = await shortLinks.resolveShortCode(shortCode);
            if (!originalParam) return c.text(t('shortUrlNotFound'), 404);

            const mapping = { b: 'singbox', c: 'clash', x: 'xray', s: 'surge' };
            const originalUrl = `${urlObj.origin}/${mapping[prefix]}${originalParam}`;
            return c.json({ originalUrl });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });

    // ── Aggregator UI ──────────────────────────────────────────────────────────
    app.get('/agg', (c) => {
        const t = c.get('t');
        const lang = resolveLanguage(c.get('lang'));
        return c.html(
            <Layout title={t('aggregatorPage') + ' - ' + APP_NAME}>
                <div class="flex flex-col min-h-screen">
                    <Navbar />
                    <main class="flex-1">
                        <AggregatorPage t={t} lang={lang} />
                    </main>
                    <Footer />
                </div>
            </Layout>
        );
    });

    // ── Auth API ───────────────────────────────────────────────────────────────
    app.post('/api/auth/register', async (c) => {
        try {
            const auth = requireService(services.auth, 'Auth');
            const { username, password } = await c.req.json();
            await auth.register(username, password);
            return c.text('ok');
        } catch (e) {
            return c.text(e.message, 400);
        }
    });

    app.post('/api/auth/login', async (c) => {
        try {
            const auth = requireService(services.auth, 'Auth');
            const { username, password } = await c.req.json();
            const token = await auth.login(username, password);
            c.header('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
            return c.text('ok');
        } catch (e) {
            return c.text(e.message, 401);
        }
    });

    app.post('/api/auth/logout', async (c) => {
        const auth = services.auth;
        if (auth) {
            const token = auth.getTokenFromRequest(c.req);
            await auth.logout(token);
        }
        c.header('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0');
        return c.text('ok');
    });

    app.get('/api/auth/me', async (c) => {
        const auth = services.auth;
        if (!auth) return c.json(null, 401);
        const token = auth.getTokenFromRequest(c.req);
        const session = await auth.getSession(token);
        if (!session) return c.json(null, 401);
        return c.json({ username: session.username });
    });

    // ── Aggregator API ─────────────────────────────────────────────────────────
    app.get('/api/aggregators', async (c) => {
        try {
            const { session } = await requireAuth(c, services.auth);
            const agg = requireService(services.aggregator, 'Aggregator');
            const list = await agg.list(session.userId);
            return c.json(list);
        } catch (e) {
            return c.text(e.message, e.status || 401);
        }
    });

    app.post('/api/aggregators', async (c) => {
        try {
            const { session } = await requireAuth(c, services.auth);
            const agg = requireService(services.aggregator, 'Aggregator');
            const data = await c.req.json();
            const created = await agg.create(session.userId, data);
            return c.json(created);
        } catch (e) {
            return c.text(e.message, e.status || 400);
        }
    });

    app.put('/api/aggregators/:id', async (c) => {
        try {
            const { session } = await requireAuth(c, services.auth);
            const agg = requireService(services.aggregator, 'Aggregator');
            const data = await c.req.json();
            const updated = await agg.update(c.req.param('id'), session.userId, data);
            return c.json(updated);
        } catch (e) {
            return c.text(e.message, e.status || 400);
        }
    });

    app.post('/api/aggregators/resolve-airport-meta', async (c) => {
        try {
            await requireAuth(c, services.auth);
            const agg = requireService(services.aggregator, 'Aggregator');
            const data = await c.req.json();
            const fallbackUa = getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const meta = await agg.resolveAirportSourceMeta(data, fallbackUa);
            return c.json(meta);
        } catch (e) {
            return c.text(e.message, e.status || 400);
        }
    });

    app.delete('/api/aggregators/:id', async (c) => {
        try {
            const { session } = await requireAuth(c, services.auth);
            const agg = requireService(services.aggregator, 'Aggregator');
            await agg.delete(c.req.param('id'), session.userId);
            return c.text('ok');
        } catch (e) {
            return c.text(e.message, e.status || 400);
        }
    });

    app.post('/api/aggregators/:id/refresh', async (c) => {
        try {
            const { session } = await requireAuth(c, services.auth);
            const aggSvc = requireService(services.aggregator, 'Aggregator');
            const aggData = await aggSvc.get(c.req.param('id'));
            if (!aggData || aggData.userId !== session.userId) return c.text('Not found', 404);
            const ua = getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const refreshed = await aggSvc.refresh(c.req.param('id'), ua);
            return c.json({
                lastRefresh: refreshed.lastRefresh,
                cachedProxyCount: refreshed.cachedProxies?.length || 0,
                airportRefreshResults: refreshed.airportRefreshResults || []
            });
        } catch (e) {
            return c.text(e.message, e.status || 400);
        }
    });

    app.get('/api/aggregators/:id/proxies', async (c) => {
        try {
            const { session } = await requireAuth(c, services.auth);
            const aggSvc = requireService(services.aggregator, 'Aggregator');
            const aggData = await aggSvc.get(c.req.param('id'));
            if (!aggData || aggData.userId !== session.userId) return c.text('Not found', 404);
            const proxies = await aggSvc.listCachedProxyDetails(c.req.param('id'));
            return c.json(proxies);
        } catch (e) {
            return c.text(e.message, e.status || 400);
        }
    });

    // ── Aggregator Output Routes ───────────────────────────────────────────────
    const aggOutputHandler = (format) => async (c) => {
        try {
            const aggSvc = requireService(services.aggregator, 'Aggregator');
            const id = c.req.param('id');
            const ua = c.req.query('ua') || getRequestHeader(c.req, 'User-Agent') || DEFAULT_USER_AGENT;
            const aggData = await aggSvc.getOrRefresh(id, ua);
            if (!aggData) return c.text('Aggregator not found', 404);

            const proxies = aggData.cachedProxies || [];
            const selectedRules = aggData.selectedRules?.length ? aggData.selectedRules : parseSelectedRules(c.req.query('selectedRules'));
            const customRules = aggData.customRules?.length ? aggData.customRules : parseJsonArray(c.req.query('customRules'));
            const groupByCountry = aggData.groupByCountry ?? parseBooleanFlag(c.req.query('group_by_country'));
            const includeAutoSelect = aggData.includeAutoSelect ?? (c.req.query('include_auto_select') !== 'false');
            const lang = c.get('lang');

            let baseConfig;
            if (aggData.configId && services.configStorage) {
                baseConfig = await services.configStorage.getConfigById(aggData.configId);
            }

            if (format === 'clash') {
                const builder = new ClashConfigBuilder('', selectedRules, customRules, baseConfig, lang, ua, groupByCountry, false, null, null, includeAutoSelect);
                builder.setPreParsedProxies(proxies);
                await builder.build();
                return c.text(builder.formatConfig(), 200, { 'Content-Type': 'text/yaml; charset=utf-8' });
            }

            if (format === 'singbox') {
                const singboxVersion = resolveSingboxConfigVersion(c.req.query('singbox_version'), getRequestHeader(c.req, 'User-Agent'));
                const sbBase = baseConfig || (singboxVersion === '1.11' ? SING_BOX_CONFIG_V1_11 : SING_BOX_CONFIG);
                const builder = new SingboxConfigBuilder('', selectedRules, customRules, sbBase, lang, ua, groupByCountry, false, null, null, singboxVersion, includeAutoSelect);
                builder.setPreParsedProxies(proxies);
                await builder.build();
                return c.json(builder.config);
            }

            if (format === 'surge') {
                const builder = new SurgeConfigBuilder('', selectedRules, customRules, baseConfig, lang, ua, groupByCountry, includeAutoSelect);
                builder.setPreParsedProxies(proxies);
                builder.setSubscriptionUrl(c.req.url);
                await builder.build();
                return c.text(builder.formatConfig());
            }

            if (format === 'xray') {
                const uriLines = proxies.map(p => {
                    // Re-serialize proxy objects to URI strings for xray output
                    return p._rawUri || serializeProxyToShareUri(p) || null;
                }).filter(Boolean);
                return c.text(encodeBase64(uriLines.join('\n')));
            }

            return c.text('Unknown format', 400);
        } catch (e) {
            return handleError(c, e, runtime.logger);
        }
    };

    app.get('/agg/:id/clash', aggOutputHandler('clash'));
    app.get('/agg/:id/singbox', aggOutputHandler('singbox'));
    app.get('/agg/:id/surge', aggOutputHandler('surge'));
    app.get('/agg/:id/xray', aggOutputHandler('xray'));

    app.get('/favicon.ico', async (c) => {
        if (!runtime.assetFetcher) {
            return c.notFound();
        }
        try {
            return await runtime.assetFetcher(c.req.raw);
        } catch (error) {
            runtime.logger.warn('Asset fetch failed', error);
            return c.notFound();
        }
    });

    return app;
}

export function parseSelectedRules(raw) {
    if (!raw) return [];

    // 首先检查是否是预设名称 (minimal, balanced, comprehensive)
    // 这确保向后兼容主分支的 API 行为
    if (typeof raw === 'string' && PREDEFINED_RULE_SETS[raw]) {
        return PREDEFINED_RULE_SETS[raw];
    }

    // 尝试解析为 JSON 数组
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // 解析失败，回退到 minimal 预设
        console.warn(`Failed to parse selectedRules: ${raw}, falling back to minimal`);
        return PREDEFINED_RULE_SETS.minimal;
    }
}

function parseJsonArray(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseBooleanFlag(value) {
    return value === 'true' || value === true;
}

function parseSemverLike(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const match = trimmed.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) {
        return null;
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: match[3] ? Number(match[3]) : 0
    };
}

function isSingboxLegacyConfig(version) {
    if (!version || Number.isNaN(version.major) || Number.isNaN(version.minor)) {
        return false;
    }
    if (version.major !== 1) {
        return version.major < 1;
    }
    return version.minor < 12;
}

function resolveSingboxConfigVersion(requestedVersion, userAgent) {
    const normalizedRequested = typeof requestedVersion === 'string' ? requestedVersion.trim().toLowerCase() : '';
    if (normalizedRequested && normalizedRequested !== 'auto') {
        if (normalizedRequested === 'legacy') return '1.11';
        if (normalizedRequested === 'latest') return '1.12';
        const parsed = parseSemverLike(normalizedRequested);
        if (parsed) {
            return isSingboxLegacyConfig(parsed) ? '1.11' : '1.12';
        }
    }

    if (typeof userAgent === 'string' && userAgent) {
        const uaMatch = userAgent.match(/sing-box\/(\d+\.\d+(?:\.\d+)?)/i) || userAgent.match(/sing-box\s+(\d+\.\d+(?:\.\d+)?)/i);
        const versionString = uaMatch?.[1];
        const parsed = versionString ? parseSemverLike(versionString) : null;
        if (parsed) {
            return isSingboxLegacyConfig(parsed) ? '1.11' : '1.12';
        }
    }

    return '1.12';
}

function getRequestHeader(request, name) {
    if (!request || !name) {
        return undefined;
    }

    try {
        const value = request.header(name);
        if (value !== undefined) {
            return value;
        }
    } catch {
        // Fallback if HonoRequest.header cannot read from the raw request.
    }

    const headers = request.raw?.headers;
    if (!headers) {
        return undefined;
    }

    if (typeof headers.get === 'function') {
        return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
    }

    if (typeof headers === 'object') {
        const lowerName = name.toLowerCase();
        const headerValue = headers[lowerName] ?? headers[name];
        if (Array.isArray(headerValue)) {
            return headerValue[0];
        }
        return headerValue;
    }

    return undefined;
}

function requireShortLinkService(service) {
    if (!service) {
        throw new MissingDependencyError('Short link functionality is unavailable');
    }
    return service;
}

function requireConfigStorage(service) {
    if (!service) {
        throw new MissingDependencyError('Config storage functionality is unavailable');
    }
    return service;
}

function requireService(service, name) {
    if (!service) {
        const err = new MissingDependencyError(`${name} functionality is unavailable`);
        throw err;
    }
    return service;
}

async function requireAuth(c, authService) {
    if (!authService) {
        const err = new Error('Auth unavailable');
        err.status = 501;
        throw err;
    }
    const token = authService.getTokenFromRequest(c.req);
    const session = await authService.getSession(token);
    if (!session) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }
    return { session };
}

function handleError(c, error, logger) {
    if (error instanceof ServiceError) {
        return c.text(error.message, error.status);
    }
    logger.error?.('Unhandled error', error);
    return c.text(`Error: ${error.message}`, 500);
}
