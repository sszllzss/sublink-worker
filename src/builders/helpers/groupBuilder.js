const normalize = (value) => typeof value === 'string' ? value.trim() : value;

export function uniqueNames(names = []) {
    const seen = new Set();
    const result = [];
    names.forEach(name => {
        if (typeof name !== 'string') return;
        const normalized = normalize(name);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

export function withDirectReject(options = [], { includeReject = true } = {}) {
    return uniqueNames([
        ...options,
        'DIRECT',
        ...(includeReject ? ['REJECT'] : [])
    ]);
}

export function buildNodeSelectMembers({ proxyList = [], translator, groupByCountry = false, manualGroupName, sourceGroupNames = [], countryGroupNames = [], includeAutoSelect = true, includeReject = true }) {
    if (!translator) {
        throw new Error('buildNodeSelectMembers requires a translator function');
    }
    const autoName = translator('outboundNames.Auto Select');
    const hasGroupedSources = groupByCountry || sourceGroupNames.length > 0;
    const base = hasGroupedSources
        ? [
            ...(includeAutoSelect ? [autoName] : []),
            ...(manualGroupName ? [manualGroupName] : []),
            ...sourceGroupNames,
            ...countryGroupNames
        ]
        : [
            ...(includeAutoSelect ? [autoName] : []),
            ...proxyList
        ];
    return withDirectReject(base, { includeReject });
}

export function buildSelectorMembers({ proxyList = [], translator, groupByCountry = false, manualGroupName, sourceGroupNames = [], countryGroupNames = [], includeAutoSelect = true, includeReject = true }) {
    if (!translator) {
        throw new Error('buildSelectorMembers requires a translator function');
    }
    const hasGroupedSources = groupByCountry || sourceGroupNames.length > 0;
    const base = hasGroupedSources
        ? [
            translator('outboundNames.Node Select'),
            ...(includeAutoSelect ? [translator('outboundNames.Auto Select')] : []),
            ...(manualGroupName ? [manualGroupName] : []),
            ...sourceGroupNames,
            ...countryGroupNames
        ]
        : [
            translator('outboundNames.Node Select'),
            ...proxyList
        ];
    return withDirectReject(base, { includeReject });
}

export function buildCustomRuleMembers({ proxyList = [], translator, manualGroupName, sourceGroupNames = [], includeAutoSelect = true, includeReject = true }) {
    if (!translator) {
        throw new Error('buildCustomRuleMembers requires a translator function');
    }
    return withDirectReject([
        translator('outboundNames.Node Select'),
        ...(includeAutoSelect ? [translator('outboundNames.Auto Select')] : []),
        ...(manualGroupName ? [manualGroupName] : []),
        ...sourceGroupNames,
        ...proxyList
    ], { includeReject });
}
