export function aggregatorLogicFn() {
  function aggData() {
    const emptyDirectNodeGroup = () => ({ name: '', prefix: '', content: '' });
    const emptyPreferredIpGroup = () => ({ name: '', prefix: '', node: '', ips: '' });
    const normalizeDirectNodeGroups = (agg = {}) => {
      if (Array.isArray(agg.directNodeGroups) && agg.directNodeGroups.length > 0) {
        return agg.directNodeGroups.map(group => ({
          name: group?.name || '',
          prefix: group?.prefix || '',
          content: group?.content || ''
        }));
      }
      if (agg.directNodes?.content || agg.directNodes?.prefix) {
        return [{
          name: '',
          prefix: agg.directNodes.prefix || '',
          content: agg.directNodes.content || ''
        }];
      }
      return [emptyDirectNodeGroup()];
    };
    const normalizeAirportSource = (source = {}) => ({
      url: source.url || '',
      prefix: source.prefix || '',
      name: source.name || '',
      userAgent: source.userAgent || ''
    });
    const normalizePreferredIpGroup = (group = {}) => ({
      name: group.name || '',
      prefix: group.prefix || '',
      node: group.node || '',
      ips: group.ips || ''
    });
    const normalizeAirportRefreshResult = (result = {}, index = 0) => ({
      index: Number.isInteger(result?.index) ? result.index : index,
      url: result?.url || '',
      prefix: result?.prefix || '',
      name: result?.name || '',
      profileName: result?.profileName || '',
      userAgent: result?.userAgent || '',
      status: result?.status || 'pending',
      proxyCount: Number(result?.proxyCount) || 0,
      error: result?.error || '',
      refreshedAt: Number(result?.refreshedAt) || 0
    });
    const normalizeKey = (value) => typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
    const hostnameFromUrl = (url) => {
      try {
        return new URL(url).hostname || '';
      } catch (_) {
        return '';
      }
    };
    const groupProxyItems = (items = []) => {
      const sourceMap = new Map();
      for (const item of items) {
        const sourceKey = item.sourceGroupName || item.sourceName || 'Ungrouped';
        if (!sourceMap.has(sourceKey)) {
          sourceMap.set(sourceKey, {
            key: sourceKey,
            label: item.sourceGroupName || item.sourceName || 'Ungrouped',
            sourceName: item.sourceName || '',
            prefixes: []
          });
        }
        const sourceGroup = sourceMap.get(sourceKey);
        const prefixKey = item.sourcePrefix || 'no-prefix';
        let prefixGroup = sourceGroup.prefixes.find(group => group.key === prefixKey);
        if (!prefixGroup) {
          prefixGroup = {
            key: prefixKey,
            label: item.sourcePrefix || (window.AGG_I18N?.noPrefixGroup || 'No Prefix'),
            items: []
          };
          sourceGroup.prefixes.push(prefixGroup);
        }
        prefixGroup.items.push(item);
      }
      return Array.from(sourceMap.values());
    };

    return {
      // Auth state
      isLoggedIn: false,
      currentUser: null,
      authTab: 'login',
      authUsername: '',
      authPassword: '',
      authError: '',
      authLoading: false,

      // Aggregator list
      aggregators: [],
      listLoading: false,
      proxyLists: {},
      proxyListLoadingId: null,
      expandedAggIds: {},

      // Current view: 'list' | 'edit'
      view: 'list',
      editingAgg: null,
      showAdvanced: false,
      selectedPredefinedRule: 'balanced',
      configType: 'singbox',
      configEditor: '',
      savingConfig: false,
      configValidationState: '',
      configValidationMessage: '',

      // Edit form
      form: {
        name: '',
        directNodes: { content: '', prefix: '' },
        directNodeGroups: [emptyDirectNodeGroup()],
        airportSources: [],
        preferredIpGroups: [],
        refreshInterval: 3600,
        selectedRules: [],
        customRules: [],
        configId: null,
        groupByCountry: false,
        includeAutoSelect: true
      },
      formLoading: false,
      formError: '',

      // Refresh state per agg id
      refreshingId: null,
      resolvingAirportIndex: null,

      async init() {
        await this.checkAuth();
        if (this.isLoggedIn) await this.loadList();
      },

      async checkAuth() {
        try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
            const data = await res.json();
            this.isLoggedIn = true;
            this.currentUser = data.username;
          }
        } catch (_) {}
      },

      async doLogin() {
        this.authError = '';
        this.authLoading = true;
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: this.authUsername, password: this.authPassword })
          });
          const text = await res.text();
          if (!res.ok) { this.authError = text; return; }
          this.isLoggedIn = true;
          this.currentUser = this.authUsername;
          this.authUsername = '';
          this.authPassword = '';
          await this.loadList();
        } catch (e) {
          this.authError = e.message;
        } finally {
          this.authLoading = false;
        }
      },

      async doRegister() {
        this.authError = '';
        this.authLoading = true;
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: this.authUsername, password: this.authPassword })
          });
          const text = await res.text();
          if (!res.ok) { this.authError = text; return; }
          alert(window.AGG_I18N?.registerSuccess || '注册成功，请登录');
          this.authTab = 'login';
          this.authError = '';
        } catch (e) {
          this.authError = e.message;
        } finally {
          this.authLoading = false;
        }
      },

      async doLogout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.isLoggedIn = false;
        this.currentUser = null;
        this.aggregators = [];
        this.view = 'list';
      },

      async loadList() {
        this.listLoading = true;
        try {
          const res = await fetch('/api/aggregators');
          if (res.ok) {
            const items = await res.json();
            this.aggregators = Array.isArray(items) ? items.map(agg => ({
              ...agg,
              airportRefreshResults: (agg.airportRefreshResults || []).map(normalizeAirportRefreshResult)
            })) : [];
          }
        } catch (_) {}
        this.listLoading = false;
      },

      openNew() {
        this.editingAgg = null;
        this.showAdvanced = false;
        this.form = {
          name: '',
          directNodes: { content: '', prefix: '' },
          directNodeGroups: [emptyDirectNodeGroup()],
          airportSources: [],
          preferredIpGroups: [],
          refreshInterval: 3600,
          selectedRules: [],
          customRules: [],
          configId: null,
          groupByCountry: false,
          includeAutoSelect: true
        };
        this.selectedPredefinedRule = 'balanced';
        this.applyPredefinedRule();
        this.configEditor = '';
        this.configType = 'singbox';
        this.configValidationState = '';
        this.configValidationMessage = '';
        this.restoreCustomRules([]);
        this.formError = '';
        this.view = 'edit';
      },

      openEdit(agg) {
        this.editingAgg = agg;
        this.showAdvanced = false;
        this.form = {
          name: agg.name,
          directNodes: { ...agg.directNodes },
          directNodeGroups: normalizeDirectNodeGroups(agg),
          airportSources: (agg.airportSources || []).map(normalizeAirportSource),
          preferredIpGroups: (agg.preferredIpGroups || []).map(normalizePreferredIpGroup),
          refreshInterval: agg.refreshInterval,
          selectedRules: agg.selectedRules || [],
          customRules: agg.customRules || [],
          configId: agg.configId || null,
          groupByCountry: agg.groupByCountry,
          includeAutoSelect: agg.includeAutoSelect
        };
        this.selectedPredefinedRule = 'custom';
        this.configEditor = '';
        this.configType = 'singbox';
        this.configValidationState = '';
        this.configValidationMessage = '';
        this.restoreCustomRules(this.form.customRules);
        this.formError = '';
        this.view = 'edit';
      },

      applyPredefinedRule() {
        if (this.selectedPredefinedRule === 'custom') return;
        const rules = window.PREDEFINED_RULE_SETS;
        if (rules && rules[this.selectedPredefinedRule]) {
          this.form.selectedRules = rules[this.selectedPredefinedRule];
        }
      },

      restoreCustomRules(rules) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('restore-custom-rules', {
            detail: { rules: Array.isArray(rules) ? rules : [] }
          }));
        }, 0);
      },

      readCustomRules() {
        try {
          const input = document.querySelector('input[name="customRules"]');
          const parsed = input && input.value ? JSON.parse(input.value) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      },

      addDirectNodeGroup() {
        this.form.directNodeGroups.push(emptyDirectNodeGroup());
      },

      removeDirectNodeGroup(idx) {
        if (this.form.directNodeGroups.length <= 1) {
          this.form.directNodeGroups[0] = emptyDirectNodeGroup();
          return;
        }
        this.form.directNodeGroups.splice(idx, 1);
      },

      moveItem(list, idx, direction) {
        if (!Array.isArray(list)) return;
        const nextIdx = idx + direction;
        if (idx < 0 || nextIdx < 0 || idx >= list.length || nextIdx >= list.length) return;
        const item = list[idx];
        list.splice(idx, 1);
        list.splice(nextIdx, 0, item);
      },

      moveDirectNodeGroup(idx, direction) {
        this.moveItem(this.form.directNodeGroups, idx, direction);
      },

      addAirport() {
        this.form.airportSources.push(normalizeAirportSource());
      },

      addPreferredIpGroup() {
        this.form.preferredIpGroups.push(emptyPreferredIpGroup());
      },

      removeAirport(idx) {
        this.form.airportSources.splice(idx, 1);
      },

      moveAirport(idx, direction) {
        this.moveItem(this.form.airportSources, idx, direction);
      },

      async resolveAirportMeta(idx) {
        const source = this.form.airportSources?.[idx];
        if (!source || !(source.url || '').trim()) {
          this.formError = '请先填写机场订阅地址';
          return;
        }

        this.formError = '';
        this.resolvingAirportIndex = idx;
        try {
          const res = await fetch('/api/aggregators/resolve-airport-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(source)
          });
          const text = await res.text();
          if (!res.ok) {
            this.formError = text || '获取机场信息失败';
            return;
          }
          const meta = JSON.parse(text);
          if (meta?.prefix) {
            this.form.airportSources[idx].prefix = meta.prefix;
          }
          if (meta?.name) {
            this.form.airportSources[idx].name = meta.name;
          }
          if (meta?.userAgent && !this.form.airportSources[idx].userAgent) {
            this.form.airportSources[idx].userAgent = meta.userAgent;
          }
        } catch (e) {
          this.formError = e.message;
        } finally {
          this.resolvingAirportIndex = null;
        }
      },

      removePreferredIpGroup(idx) {
        this.form.preferredIpGroups.splice(idx, 1);
      },

      movePreferredIpGroup(idx, direction) {
        this.moveItem(this.form.preferredIpGroups, idx, direction);
      },

      hasCustomHttpsPort(url) {
        if (!url) return false;
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'https:' && parsed.port && parsed.port !== '443';
        } catch (_) {
          return false;
        }
      },

      validateUniqueGroupFields() {
        for (const [index, item] of (this.form.directNodeGroups || []).entries()) {
          if ((item?.content || '').trim() || (item?.name || '').trim()) {
            if (!normalizeKey(item?.prefix)) {
              return `直接节点分组 #${index + 1} 必须填写节点前缀`;
            }
          }
        }

        for (const [index, item] of (this.form.preferredIpGroups || []).entries()) {
          if ((item?.node || '').trim() || (item?.ips || '').trim() || (item?.name || '').trim()) {
            if (!normalizeKey(item?.prefix)) {
              return `优选 IP 分组 #${index + 1} 必须填写节点前缀`;
            }
          }
        }

        const seenPrefixes = new Map();
        const seenNames = new Map();
        const entries = [
          ...(this.form.directNodeGroups || []).map((item, index) => ({ kind: 'directNodeGroups', index, prefix: item?.prefix, name: item?.name })),
          ...(this.form.airportSources || []).map((item, index) => ({ kind: 'airportSources', index, prefix: item?.prefix, name: item?.name })),
          ...(this.form.preferredIpGroups || []).map((item, index) => ({ kind: 'preferredIpGroups', index, prefix: item?.prefix, name: item?.name }))
        ];

        for (const entry of entries) {
          const prefix = normalizeKey(entry.prefix);
          const name = normalizeKey(entry.name);

          if (prefix) {
            if (seenPrefixes.has(prefix)) {
              return `节点前缀重复: "${entry.prefix.trim()}"`;
            }
            seenPrefixes.set(prefix, true);
          }

          if (name) {
            if (seenNames.has(name)) {
              return `分组名称重复: "${entry.name.trim()}"`;
            }
            seenNames.set(name, true);
          }
        }

        return '';
      },

      async saveForm() {
        this.formError = '';
        this.formLoading = true;
        try {
          this.form.customRules = this.readCustomRules();
          const uniqueFieldError = this.validateUniqueGroupFields();
          if (uniqueFieldError) {
            this.formError = uniqueFieldError;
            return;
          }
          const url = this.editingAgg ? `/api/aggregators/${this.editingAgg.id}` : '/api/aggregators';
          const method = this.editingAgg ? 'PUT' : 'POST';
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.form)
          });
          const text = await res.text();
          if (!res.ok) { this.formError = text; return; }
          await this.loadList();
          this.view = 'list';
        } catch (e) {
          this.formError = e.message;
        } finally {
          this.formLoading = false;
        }
      },

      resetConfigValidation() {
        this.configValidationState = '';
        this.configValidationMessage = '';
      },

      validateBaseConfig() {
        const content = (this.configEditor || '').trim();
        if (!content) {
          this.configValidationState = 'error';
          this.configValidationMessage = window.AGG_I18N?.configContentRequired || 'Configuration content is required';
          return;
        }

        try {
          if (this.configType === 'clash') {
            if (!window.jsyaml || !window.jsyaml.load) {
              throw new Error(window.AGG_I18N?.parserUnavailable || 'Parser unavailable. Please refresh and try again.');
            }
            window.jsyaml.load(content);
            this.configValidationMessage = window.AGG_I18N?.validYamlConfig || 'YAML config is valid';
          } else if (this.configType === 'surge') {
            if (content.startsWith('{')) JSON.parse(content);
            this.configValidationMessage = content.startsWith('{')
              ? (window.AGG_I18N?.validJsonConfig || 'JSON config is valid')
              : (window.AGG_I18N?.validYamlConfig || 'Config looks valid');
          } else {
            JSON.parse(content);
            this.configValidationMessage = window.AGG_I18N?.validJsonConfig || 'JSON config is valid';
          }
          this.configValidationState = 'success';
        } catch (e) {
          this.configValidationState = 'error';
          const prefix = window.AGG_I18N?.configValidationError || 'Config validation error: ';
          this.configValidationMessage = `${prefix}${e?.message || ''}`;
        }
      },

      async saveBaseConfig() {
        const content = (this.configEditor || '').trim();
        if (!content) {
          alert(window.AGG_I18N?.configContentRequired || 'Configuration content is required');
          return;
        }

        this.savingConfig = true;
        try {
          const res = await fetch('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: this.configType, content: this.configEditor })
          });
          const text = await res.text();
          if (!res.ok) throw new Error(text || res.statusText || 'Request failed');
          this.form.configId = text.trim();
          alert(`${window.AGG_I18N?.saveConfigSuccess || 'Configuration saved successfully!'}\nID: ${this.form.configId}`);
        } catch (e) {
          const prefix = window.AGG_I18N?.configSaveFailed || 'Failed to save configuration';
          alert(`${prefix}: ${e?.message || 'Unknown error'}`);
        } finally {
          this.savingConfig = false;
        }
      },

      clearBaseConfig() {
        if (!confirm(window.AGG_I18N?.confirmClearConfig || 'Clear config?')) return;
        this.configEditor = '';
        this.form.configId = null;
        this.resetConfigValidation();
      },

      async deleteAgg(agg) {
        if (!confirm(window.AGG_I18N?.confirmDeleteAggregator || 'Delete?')) return;
        await fetch(`/api/aggregators/${agg.id}`, { method: 'DELETE' });
        await this.loadList();
      },

      async refreshAgg(agg) {
        this.refreshingId = agg.id;
        try {
          const res = await fetch(`/api/aggregators/${agg.id}/refresh`, { method: 'POST' });
          if (res.ok) {
            const updated = await res.json();
            const idx = this.aggregators.findIndex(a => a.id === agg.id);
            if (idx >= 0) this.aggregators[idx] = {
              ...this.aggregators[idx],
              ...updated,
              airportRefreshResults: (updated.airportRefreshResults || []).map(normalizeAirportRefreshResult)
            };
            delete this.proxyLists[agg.id];
            if (this.expandedAggIds[agg.id]) {
              await this.loadAggProxies(agg.id);
            }
          }
        } catch (_) {
        } finally {
          this.refreshingId = null;
        }
      },

      async toggleAggProxies(agg) {
        const expanded = !!this.expandedAggIds[agg.id];
        this.expandedAggIds = { ...this.expandedAggIds, [agg.id]: !expanded };
        if (!expanded && !this.proxyLists[agg.id]) {
          await this.loadAggProxies(agg.id);
        }
      },

      async loadAggProxies(aggId) {
        this.proxyListLoadingId = aggId;
        try {
          const res = await fetch(`/api/aggregators/${aggId}/proxies`);
          const text = await res.text();
          if (!res.ok) {
            throw new Error(text || 'Failed to load proxies');
          }
          const items = JSON.parse(text);
          this.proxyLists = {
            ...this.proxyLists,
            [aggId]: {
              items,
              groups: groupProxyItems(items)
            }
          };
        } catch (e) {
          this.formError = e.message;
        } finally {
          this.proxyListLoadingId = null;
        }
      },

      getAggProxyGroups(aggId) {
        return this.proxyLists?.[aggId]?.groups || [];
      },

      getAirportRefreshItems(agg) {
        const sourceMap = new Map(
          (agg.airportRefreshResults || []).map((item, index) => {
            const normalized = normalizeAirportRefreshResult(item, index);
            return [normalized.index, normalized];
          })
        );

        return (agg.airportSources || []).map((source, index) => {
          const result = sourceMap.get(index) || normalizeAirportRefreshResult({ index, url: source?.url || '' }, index);
          const label = result.name || result.prefix || result.profileName || source?.name || source?.prefix || hostnameFromUrl(source?.url) || `Airport ${index + 1}`;
          return {
            ...result,
            label,
            url: result.url || source?.url || '',
            userAgent: result.userAgent || source?.userAgent || '',
            status: result.status || 'pending'
          };
        });
      },

      getAirportRefreshBadgeClass(status) {
        if (status === 'success') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
        if (status === 'empty') return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
        if (status === 'error') return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
      },

      getAirportRefreshStatusText(item) {
        if (item?.status === 'success') {
          return `${window.AGG_I18N?.airportRefreshSuccess || '成功'} ${item.proxyCount || 0}`;
        }
        if (item?.status === 'empty') {
          return window.AGG_I18N?.airportRefreshEmpty || '解析为空';
        }
        if (item?.status === 'error') {
          return window.AGG_I18N?.airportRefreshError || '抓取失败';
        }
        return window.AGG_I18N?.airportRefreshPending || '未刷新';
      },

      getAirportRefreshDetail(item) {
        if (item?.status === 'success') {
          return `${window.AGG_I18N?.airportRefreshNodeCount || '节点数'}: ${item.proxyCount || 0}`;
        }
        if (item?.status === 'empty') {
          return window.AGG_I18N?.airportRefreshEmptyDetail || '抓取成功，但未解析出任何节点';
        }
        if (item?.status === 'error') {
          return item?.error || (window.AGG_I18N?.airportRefreshErrorDetail || '抓取机场订阅失败');
        }
        return window.AGG_I18N?.airportRefreshPendingDetail || '保存后请手动刷新以获取最新结果';
      },

      getOutputUrl(agg, format) {
        return `${location.origin}/agg/${agg.id}/${format}`;
      },

      formatDate(ts) {
        if (!ts) return window.AGG_I18N?.never || 'Never';
        return new Date(ts).toLocaleString();
      },

      copied: null,
      async copyUrl(text, key) {
        await navigator.clipboard.writeText(text);
        this.copied = key;
        setTimeout(() => { if (this.copied === key) this.copied = null; }, 2000);
      },

      async copyShareUri(uri, key) {
        if (!uri) return;
        await navigator.clipboard.writeText(uri);
        this.copied = key;
        setTimeout(() => { if (this.copied === key) this.copied = null; }, 2000);
      }
    };
  }

  window.aggData = aggData;
}
