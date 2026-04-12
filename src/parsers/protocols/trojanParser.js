import { parseServerInfo, parseUrlParams, createTransportConfig, parseArray, parseBool } from '../../utils.js';

export function parseTrojan(url) {
    const { addressPart, params, name } = parseUrlParams(url);
    const [password, serverInfo] = addressPart.split('@');
    const { host, port } = parseServerInfo(serverInfo);

    const parsedURL = parseServerInfo(addressPart);
    const security = params.security || params.tls;
    const tls = security === 'none'
        ? { enabled: false }
        : {
            enabled: true,
            server_name: params.sni || params.peer || params.host,
            insecure: parseBool(params.allowInsecure ?? params.insecure ?? params.allow_insecure ?? params['skip-cert-verify'], false),
            alpn: parseArray(params.alpn)
        };
    if (params.security === 'reality') {
        tls.reality = {
            enabled: true,
            public_key: params.pbk,
            short_id: params.sid,
        };
    }
    const fingerprint = params['client-fingerprint'] || params.fp || params.fingerprint;
    if (fingerprint) {
        tls.utls = {
            enabled: true,
            fingerprint
        };
    }
    const transport = params.type && params.type !== 'tcp' ? createTransportConfig(params) : undefined;
    return {
        type: 'trojan',
        tag: name,
        server: host,
        server_port: port,
        password: decodeURIComponent(password) || parsedURL.username,
        network: 'tcp',
        tcp_fast_open: false,
        tls,
        transport,
        flow: params.flow ?? undefined
    };
}
