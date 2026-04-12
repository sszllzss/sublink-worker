import { parseServerInfo, parseUrlParams, parseArray, parseBool, parseMaybeNumber } from '../../utils.js';

export function parseAnytls(url) {
    const { addressPart, params, name } = parseUrlParams(url);
    const atIndex = addressPart.indexOf('@');
    const password = atIndex >= 0 ? addressPart.slice(0, atIndex) : '';
    const serverInfo = atIndex >= 0 ? addressPart.slice(atIndex + 1) : addressPart;
    const { host, port } = parseServerInfo(serverInfo);

    const tls = {
        enabled: true,
        server_name: params.sni || params.servername || params.host,
        insecure: parseBool(params['skip-cert-verify'] ?? params.insecure ?? params.allowInsecure ?? params.allow_insecure, false),
        alpn: parseArray(params.alpn)
    };

    const fingerprint = params['client-fingerprint'] || params.fp || params.fingerprint;
    if (fingerprint) {
        tls.utls = {
            enabled: true,
            fingerprint
        };
    }

    return {
        type: 'anytls',
        tag: name,
        server: host,
        server_port: port,
        password: decodeURIComponent(password),
        udp: parseBool(params.udp, undefined),
        'idle-session-check-interval': parseMaybeNumber(params['idle-session-check-interval']),
        'idle-session-timeout': parseMaybeNumber(params['idle-session-timeout']),
        'min-idle-session': parseMaybeNumber(params['min-idle-session']),
        tls
    };
}
