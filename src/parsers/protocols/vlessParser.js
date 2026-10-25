import { parseServerInfo, parseUrlParams, createTlsConfig, createTransportConfig, parseArray, parseBool } from '../../utils.js';

export function parseVless(url) {
    const { addressPart, params, name } = parseUrlParams(url);
    const [uuid, serverInfo] = addressPart.split('@');
    const { host, port } = parseServerInfo(serverInfo);

    const tls = createTlsConfig(params);
    if (tls.reality) {
        tls.utls = {
            enabled: true,
            fingerprint: 'chrome'
        };
    }
    const fingerprint = params['client-fingerprint'] || params.fp || params.fingerprint;
    if (fingerprint) {
        tls.utls = {
            enabled: true,
            fingerprint
        };
    }
    const transport = params.type !== 'tcp' ? createTransportConfig(params) : undefined;

    // `udp` is a Clash-only flag; ClashConfigBuilder reads it, SingboxConfigBuilder strips it.
    const udp = params.udp !== undefined ? parseBool(params.udp) : undefined;

    return {
        type: 'vless',
        tag: name,
        server: host,
        server_port: port,
        uuid: decodeURIComponent(uuid),
        security: params.encryption ?? 'none',
        tcp_fast_open: false,
        tls,
        transport,
        flow: params.flow ?? undefined,
        alpn: parseArray(params.alpn),
        packet_encoding: params.packetEncoding ?? params['packet-encoding'] ?? undefined,
        // Include udp if explicitly specified - will be used for Clash output
        // SingBoxConfigBuilder will strip this field for sing-box output
        ...(udp !== undefined ? { udp } : {})
    };
}
