import { decodeBase64 } from '../../utils.js';
import { parseSubscriptionContent } from './subscriptionContentParser.js';

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

/**
 * Fetch subscription content from a URL and parse it
 * @param {string} url - The subscription URL to fetch
 * @param {string} userAgent - Optional User-Agent header
 * @returns {Promise<object|string[]|null>} - Parsed subscription content
 */
export async function fetchSubscription(url, userAgent) {
    try {
        const headers = new Headers();
        if (userAgent) {
            headers.set('User-Agent', userAgent);
        }
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const decodedText = decodeContent(text);

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
 * @returns {Promise<{content: string, format: 'clash'|'singbox'|'unknown', url: string, subscriptionUserinfo?: string}|null>}
 */
export async function fetchSubscriptionWithFormat(url, userAgent) {
    try {
        const headers = new Headers();
        if (userAgent) {
            headers.set('User-Agent', userAgent);
        }
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const content = decodeContent(text);
        const format = detectFormat(content);

        const subscriptionUserinfo = response.headers.get('subscription-userinfo') || undefined;

        return { content, format, url, subscriptionUserinfo };
    } catch (error) {
        console.error('Error fetching subscription:', error);
        return null;
    }
}
