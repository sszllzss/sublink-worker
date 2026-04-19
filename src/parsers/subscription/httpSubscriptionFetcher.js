import { decodeBase64 } from '../../utils.js';
import { parseSubscriptionContent } from './subscriptionContentParser.js';

function shouldPreferNodeHttp(url) {
    try {
        const parsed = new URL(url);
        if (!parsed.port) return false;
        if (parsed.protocol === 'https:') return parsed.port !== '443';
        if (parsed.protocol === 'http:') return parsed.port !== '80';
        return false;
    } catch {
        return false;
    }
}

async function fetchViaNodeHttp(url, userAgent, redirectCount = 0) {
    if (redirectCount > 3) {
        throw new Error('Too many redirects');
    }

    const target = new URL(url);
    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? await import('node:https') : await import('node:http');

    const headers = {};
    if (userAgent) {
        headers['User-Agent'] = userAgent;
    }
    headers['Accept'] = '*/*';
    headers['Accept-Encoding'] = 'identity';
    headers['Connection'] = 'close';

    return new Promise((resolve, reject) => {
        const req = transport.request(target, {
            method: 'GET',
            headers
        }, (res) => {
            const statusCode = res.statusCode || 0;
            const location = res.headers.location;

            if (statusCode >= 300 && statusCode < 400 && location) {
                res.resume();
                const redirectedUrl = new URL(location, target).toString();
                fetchViaNodeHttp(redirectedUrl, userAgent, redirectCount + 1).then(resolve).catch(reject);
                return;
            }

            const chunks = [];
            res.setEncoding('utf8');
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    ok: statusCode >= 200 && statusCode < 300,
                    status: statusCode,
                    text: chunks.join(''),
                    headers: {
                        get(name) {
                            const value = res.headers?.[String(name).toLowerCase()];
                            return Array.isArray(value) ? value[0] : value ?? null;
                        }
                    }
                });
            });
        });

        req.on('error', reject);
        req.setTimeout(25000, () => {
            req.destroy(new Error('Network connection lost.'));
        });
        req.end();
    });
}

/**
 * Decode content, trying Base64 only when content looks like Base64
 * @param {string} text - Raw text content
 * @returns {string} - Decoded content
 */
function decodeContent(text) {
    const trimmed = text.trim();

    // 如果内容明显是文本格式（含 YAML/JSON/URI 特征），直接返回
    if (
        trimmed.startsWith('{') ||          // JSON
        trimmed.startsWith('proxies:') ||   // Clash YAML
        trimmed.startsWith('[') ||          // JSON array
        trimmed.includes('://') ||          // URI list
        trimmed.includes('\n') && trimmed.includes(':')  // YAML/INI
    ) {
        return trimmed;
    }

    // 只有内容看起来像纯 base64（仅含 base64 字符且无空格换行外的特殊字符）才尝试解码
    const base64Only = trimmed.replace(/[\r\n]/g, '');
    const looksLikeBase64 = /^[A-Za-z0-9+/]+=*$/.test(base64Only) && base64Only.length % 4 === 0;

    if (looksLikeBase64) {
        try {
            const decoded = decodeBase64(base64Only);
            // 解码结果必须包含可读文本特征才采用
            if (decoded && (decoded.includes('://') || decoded.includes('proxies:') || decoded.includes('outbounds'))) {
                return decoded;
            }
        } catch (_) {}
    }

    // URL 编码
    if (trimmed.includes('%')) {
        try {
            return decodeURIComponent(trimmed);
        } catch (_) {}
    }

    return trimmed;
}

/**
 * Detect the format of subscription content
 * @param {string} content - Decoded subscription content
 * @returns {'clash'|'singbox'|'unknown'} - Detected format
 */
function detectFormat(content) {
    const trimmed = content.trim();

    // Try JSON (Sing-Box format)
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed.outbounds || parsed.inbounds || parsed.route) {
                return 'singbox';
            }
        } catch {
            // Not valid JSON
        }
    }

    // Try YAML (Clash format) - check for proxies: key
    if (trimmed.includes('proxies:')) {
        return 'clash';
    }

    return 'unknown';
}

function decodeHeaderValue(value) {
    if (!value) return undefined;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function parseProfileNameFromContentDisposition(contentDisposition) {
    if (!contentDisposition) return undefined;

    const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        const decoded = decodeHeaderValue(utf8Match[1]).trim();
        if (decoded) return decoded;
    }

    const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^\";]+)"?/i);
    if (plainMatch?.[1]) {
        const decoded = decodeHeaderValue(plainMatch[1]).trim();
        if (decoded) return decoded;
    }

    return undefined;
}

/**
 * Fetch subscription content from a URL and parse it
 * @param {string} url - The subscription URL to fetch
 * @param {string} userAgent - Optional User-Agent header
 * @returns {Promise<object|string[]|null>} - Parsed subscription content
 */
export async function fetchSubscription(url, userAgent) {
    try {
        const { content } = await fetchSubscriptionWithFormat(url, userAgent) || {};
        if (!content) return null;
        const decodedText = decodeContent(content);

        return parseSubscriptionContent(decodedText);
    } catch (error) {
        console.error('Error fetching or parsing HTTP(S) content:', error);
        return null;
    }
}

/**
 * Fetch subscription content and detect its format without parsing
 * @param {string} url - The subscription URL to fetch
 * @param {string} userAgent - Optional User-Agent header
 * @returns {Promise<{content: string, format: 'clash'|'singbox'|'unknown', url: string, subscriptionUserinfo?: string, profileName?: string}|null>}
 */
export async function fetchSubscriptionWithFormat(url, userAgent, options = {}) {
    const { throwOnError = false } = options;
    const requestWithFetch = async () => {
        const headers = new Headers();
        if (userAgent) {
            headers.set('User-Agent', userAgent);
        }
        headers.set('Accept', '*/*');

        return fetch(url, {
            method: 'GET',
            headers
        });
    };

    try {
        let response;
        const primaryRequester = shouldPreferNodeHttp(url)
            ? () => fetchViaNodeHttp(url, userAgent)
            : requestWithFetch;
        const fallbackRequester = shouldPreferNodeHttp(url)
            ? requestWithFetch
            : () => fetchViaNodeHttp(url, userAgent);

        try {
            response = await primaryRequester();
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (primaryError) {
            try {
                response = await fallbackRequester();
            } catch {
                throw primaryError;
            }
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = typeof response.text === 'function' ? await response.text() : response.text;
        const content = decodeContent(text);
        const format = detectFormat(content);

        const subscriptionUserinfo = response.headers.get('subscription-userinfo') || undefined;
        const profileName = parseProfileNameFromContentDisposition(response.headers.get('content-disposition')) || undefined;

        return { content, format, url, subscriptionUserinfo, profileName };
    } catch (error) {
        console.error('Error fetching subscription:', error);
        if (throwOnError) {
            throw error;
        }
        return null;
    }
}
