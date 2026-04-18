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

    // Parse UDP setting - primarily used for Clash output
    // In sing-box, UDP is controlled by 'network' field, but we preserve this for Clash compatibility
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
        network: 'tcp',
        flow: params.flow ?? undefined,
        alpn: parseArray(params.alpn),
        packet_encoding: params.packetEncoding ?? params['packet-encoding'] ?? undefined,
        // Include udp if explicitly specified - will be used for Clash output
        // SingBoxConfigBuilder will strip this field for sing-box output
        ...(udp !== undefined ? { udp } : {})
    };
}
