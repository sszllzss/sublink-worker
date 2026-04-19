import { encodeBase64 } from '../utils.js';

function formatHost(host) {
    if (!host) return '';
    return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function addParam(params, key, value) {
    if (!key) return;
    if (value === undefined || value === null || value === '') return;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
}

function addBoolParams(params, key, value) {
    if (!key) return;
    if (value === undefined || value === null) return;
    params.set(key, value ? '1' : '0');
}

function buildUrl(scheme, userInfo, host, port, params, tag) {
    const authority = userInfo ? `${userInfo}@` : '';
    const query = params.toString();
    return `${scheme}://${authority}${formatHost(host)}:${port}${query ? `?${query}` : ''}#${encodeURIComponent(tag || 'proxy')}`;
}

function getFingerprint(proxy) {
    return proxy?.tls?.utls?.fingerprint;
}

function getAlpn(proxy) {
    return proxy?.alpn || proxy?.tls?.alpn;
}

function getTransportType(proxy) {
    return proxy?.transport?.type || (proxy?.network && proxy.network !== 'tcp' ? proxy.network : 'tcp');
}

function getTransportHost(transport) {
    if (!transport) return undefined;
    const headerHost = transport?.headers?.host;
    if (Array.isArray(headerHost)) return headerHost.join(',');
    if (headerHost) return headerHost;
    if (Array.isArray(transport.host)) return transport.host.join(',');
    return transport.host;
}

function serializeDownloadSettings(downloadSettings) {
    if (!downloadSettings) return undefined;

    const payload = {};
    if (downloadSettings.server) payload.address = downloadSettings.server;
    if (downloadSettings.port !== undefined) payload.port = downloadSettings.port;
    if (downloadSettings.network) payload.network = downloadSettings.network;

    const xhttpSettings = {};
    if (downloadSettings.path) xhttpSettings.path = downloadSettings.path;
    if (downloadSettings.host) xhttpSettings.host = downloadSettings.host;
    if (downloadSettings.mode) xhttpSettings.mode = downloadSettings.mode;
    if (Object.keys(xhttpSettings).length > 0) {
        payload.xhttpSettings = xhttpSettings;
    }

    if (downloadSettings.reality?.enabled) {
        payload.security = 'reality';
        payload.realitySettings = {
            ...(downloadSettings.server_name ? { serverName: downloadSettings.server_name } : {}),
            ...(downloadSettings.utls?.fingerprint ? { fingerprint: downloadSettings.utls.fingerprint } : {}),
            ...(downloadSettings.reality.public_key ? { publicKey: downloadSettings.reality.public_key } : {}),
            ...(downloadSettings.reality.short_id ? { shortId: downloadSettings.reality.short_id } : {})
        };
    } else if (downloadSettings.tls) {
        payload.security = 'tls';
        payload.tlsSettings = {
            ...(downloadSettings.server_name ? { serverName: downloadSettings.server_name } : {}),
            ...(downloadSettings.insecure !== undefined ? { allowInsecure: !!downloadSettings.insecure } : {})
        };
    }

    return Object.keys(payload).length > 0 ? payload : undefined;
}

function serializeVlessLike(proxy, scheme) {
    const params = new URLSearchParams();
    const tls = proxy?.tls || {};
    const transport = proxy?.transport;

    addParam(params, scheme === 'vless' ? 'encryption' : undefined, proxy?.security || 'none');
    if (tls.reality?.enabled) {
        addParam(params, 'security', 'reality');
        addParam(params, 'pbk', tls.reality.public_key);
        addParam(params, 'sid', tls.reality.short_id);
    } else if (tls.enabled) {
        addParam(params, 'security', 'tls');
    } else if (scheme === 'vless') {
        addParam(params, 'security', 'none');
    }

    addParam(params, 'sni', tls.server_name);
    addParam(params, 'fp', getFingerprint(proxy));
    addParam(params, 'alpn', getAlpn(proxy));
    addBoolParams(params, 'insecure', tls.insecure);
    addBoolParams(params, 'allowInsecure', tls.insecure);

    const transportType = getTransportType(proxy);
    if (transportType && transportType !== 'tcp') {
        addParam(params, 'type', transportType);
    }
    addParam(params, 'host', getTransportHost(transport));
    addParam(params, 'path', Array.isArray(transport?.path) ? transport.path[0] : transport?.path);
    addParam(params, 'mode', transport?.mode);
    addParam(params, 'serviceName', transport?.service_name);
    addParam(params, 'flow', proxy?.flow);
    addParam(params, 'packetEncoding', proxy?.packet_encoding);
    if (proxy?.udp !== undefined) {
        addBoolParams(params, 'udp', proxy.udp);
    }

    const downloadSettings = serializeDownloadSettings(transport?.download_settings);
    if (downloadSettings) {
        addParam(params, 'extra', JSON.stringify({ downloadSettings }));
    }

    const userInfo = scheme === 'vless'
        ? encodeURIComponent(proxy?.uuid || '')
        : encodeURIComponent(proxy?.password || '');
    return buildUrl(scheme, userInfo, proxy?.server, proxy?.server_port, params, proxy?.tag);
}

function serializeVmess(proxy) {
    const transport = proxy?.transport;
    const config = {
        v: '2',
        ps: proxy?.tag || 'proxy',
        add: proxy?.server,
        port: String(proxy?.server_port || ''),
        id: proxy?.uuid,
        aid: String(proxy?.alter_id ?? 0),
        scy: proxy?.security || 'auto',
        net: getTransportType(proxy),
        type: transport?.type === 'http' ? 'http' : 'none',
        host: getTransportHost(transport) || '',
        path: Array.isArray(transport?.path) ? transport.path[0] : (transport?.path || transport?.service_name || ''),
        tls: proxy?.tls?.enabled ? 'tls' : ''
    };
    if (proxy?.tls?.server_name) config.sni = proxy.tls.server_name;
    if (getAlpn(proxy)) config.alpn = Array.isArray(getAlpn(proxy)) ? getAlpn(proxy).join(',') : getAlpn(proxy);
    if (getFingerprint(proxy)) config.fp = getFingerprint(proxy);
    return `vmess://${encodeBase64(JSON.stringify(config))}`;
}

function serializeShadowsocks(proxy) {
    if (!proxy?.method || !proxy?.password) return '';
    const params = new URLSearchParams();
    if (proxy?.plugin) {
        const parts = [proxy.plugin === 'obfs' ? 'simple-obfs' : proxy.plugin];
        const opts = proxy.plugin_opts || {};
        for (const [key, value] of Object.entries(opts)) {
            if (value === undefined || value === null || value === '') continue;
            if (key === 'mode') parts.push(`obfs=${value}`);
            else if (key === 'host') parts.push(`obfs-host=${value}`);
            else if (key === 'path') parts.push(`obfs-uri=${value}`);
            else parts.push(`${key}=${value}`);
        }
        addParam(params, 'plugin', parts.join(';'));
    }
    const auth = encodeBase64(`${proxy.method}:${proxy.password}`);
    return buildUrl('ss', auth, proxy?.server, proxy?.server_port, params, proxy?.tag);
}

function serializeHysteria2(proxy) {
    const params = new URLSearchParams();
    addParam(params, 'security', proxy?.tls?.enabled ? 'tls' : undefined);
    addParam(params, 'sni', proxy?.tls?.server_name);
    addBoolParams(params, 'insecure', proxy?.tls?.insecure);
    addBoolParams(params, 'allowInsecure', proxy?.tls?.insecure);
    addParam(params, 'alpn', getAlpn(proxy));
    addParam(params, 'obfs', proxy?.obfs?.type);
    addParam(params, 'obfs-password', proxy?.obfs?.password);
    addParam(params, 'auth', proxy?.auth);
    addParam(params, 'up', proxy?.up);
    addParam(params, 'down', proxy?.down);
    addParam(params, 'ports', proxy?.ports);
    addParam(params, 'hop-interval', proxy?.hop_interval);
    const userInfo = encodeURIComponent(proxy?.password || '');
    return buildUrl('hysteria2', userInfo, proxy?.server, proxy?.server_port, params, proxy?.tag);
}

function serializeTuic(proxy) {
    const params = new URLSearchParams();
    addParam(params, 'congestion_control', proxy?.congestion_control);
    addParam(params, 'udp_relay_mode', proxy?.udp_relay_mode);
    addParam(params, 'alpn', getAlpn(proxy));
    addParam(params, 'sni', proxy?.tls?.server_name);
    addBoolParams(params, 'insecure', proxy?.tls?.insecure);
    addBoolParams(params, 'allowInsecure', proxy?.tls?.insecure);
    addParam(params, 'flow', proxy?.flow);
    addBoolParams(params, 'zero-rtt', proxy?.zero_rtt);
    addBoolParams(params, 'reduce-rtt', proxy?.reduce_rtt);
    addBoolParams(params, 'fast-open', proxy?.fast_open);
    addBoolParams(params, 'disable-sni', proxy?.disable_sni);
    const userInfo = `${encodeURIComponent(proxy?.uuid || '')}:${encodeURIComponent(proxy?.password || '')}`;
    return buildUrl('tuic', userInfo, proxy?.server, proxy?.server_port, params, proxy?.tag);
}

function serializeAnytls(proxy) {
    const params = new URLSearchParams();
    addParam(params, 'sni', proxy?.tls?.server_name);
    addBoolParams(params, 'insecure', proxy?.tls?.insecure);
    addBoolParams(params, 'allowInsecure', proxy?.tls?.insecure);
    addParam(params, 'alpn', getAlpn(proxy));
    addParam(params, 'client-fingerprint', getFingerprint(proxy));
    if (proxy?.udp !== undefined) {
        addBoolParams(params, 'udp', proxy.udp);
    }
    addParam(params, 'idle-session-check-interval', proxy?.['idle-session-check-interval']);
    addParam(params, 'idle-session-timeout', proxy?.['idle-session-timeout']);
    addParam(params, 'min-idle-session', proxy?.['min-idle-session']);
    return buildUrl('anytls', encodeURIComponent(proxy?.password || ''), proxy?.server, proxy?.server_port, params, proxy?.tag);
}

export function serializeProxyToShareUri(proxy) {
    if (!proxy?.type || !proxy?.server || !proxy?.server_port) return '';
    switch (String(proxy.type).toLowerCase()) {
        case 'shadowsocks':
            return serializeShadowsocks(proxy);
        case 'vmess':
            return serializeVmess(proxy);
        case 'vless':
            return serializeVlessLike(proxy, 'vless');
        case 'trojan':
            return serializeVlessLike(proxy, 'trojan');
        case 'hysteria2':
            return serializeHysteria2(proxy);
        case 'tuic':
            return serializeTuic(proxy);
        case 'anytls':
            return serializeAnytls(proxy);
        default:
            return '';
    }
}
