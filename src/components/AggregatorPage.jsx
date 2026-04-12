/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { aggregatorLogicFn } from './aggregatorLogic.js';
import { PREDEFINED_RULE_SETS, UNIFIED_RULES } from '../config/index.js';
import { CustomRules } from './CustomRules.jsx';
import { ValidatedTextarea } from './ValidatedTextarea.jsx';

const OUTPUT_FORMATS = [
  { key: 'clash', label: 'Clash' },
  { key: 'singbox', label: 'SingBox' },
  { key: 'surge', label: 'Surge' },
  { key: 'xray', label: 'Xray (Base64)' }
];

export const AggregatorPage = ({ t }) => {
  const i18n = {
    aggregatorTitle: t('aggregatorTitle'),
    aggregatorDesc: t('aggregatorDesc'),
    newAggregator: t('newAggregator'),
    editAggregator: t('editAggregator'),
    deleteAggregator: t('deleteAggregator'),
    saveAggregator: t('saveAggregator'),
    saving: t('saving'),
    saveConfig: t('saveConfig'),
    savingConfig: t('savingConfig'),
    saveConfigSuccess: t('saveConfigSuccess'),
    configContentRequired: t('configContentRequired'),
    configSaveFailed: t('configSaveFailed'),
    confirmClearConfig: t('confirmClearConfig'),
    validateConfig: t('validateConfig'),
    clearConfig: t('clearConfig'),
    validJsonConfig: t('validJsonConfig'),
    validYamlConfig: t('validYamlConfig'),
    parserUnavailable: t('parserUnavailable'),
    configValidationError: t('configValidationError'),
    advancedOptions: t('advancedOptions'),
    aggregatorName: t('aggregatorName'),
    aggregatorNamePlaceholder: t('aggregatorNamePlaceholder'),
    directNodes: t('directNodes'),
    directNodesDesc: t('directNodesDesc'),
    directNodesPlaceholder: t('directNodesPlaceholder'),
    directNodesPrefix: t('directNodesPrefix'),
    directNodesPrefixPlaceholder: t('directNodesPrefixPlaceholder'),
    directNodeGroupName: t('directNodeGroupName'),
    directNodeGroupNamePlaceholder: t('directNodeGroupNamePlaceholder'),
    addDirectNodeGroup: t('addDirectNodeGroup'),
    airportSources: t('airportSources'),
    airportSourcesDesc: t('airportSourcesDesc'),
    addAirportSource: t('addAirportSource'),
    airportUrl: t('airportUrl'),
    airportUrlPlaceholder: t('airportUrlPlaceholder'),
    airportPrefix: t('airportPrefix'),
    airportPrefixPlaceholder: t('airportPrefixPlaceholder'),
    airportName: t('airportName'),
    airportNamePlaceholder: t('airportNamePlaceholder'),
    airportUserAgent: t('airportUserAgent'),
    airportUserAgentPlaceholder: t('airportUserAgentPlaceholder'),
    airportUserAgentHint: t('airportUserAgentHint'),
    customHttpsPortWarning: t('customHttpsPortWarning'),
    moveUp: t('moveUp'),
    moveDown: t('moveDown'),
    removeSource: t('removeSource'),
    refreshInterval: t('refreshInterval'),
    refreshIntervalUnit: t('refreshIntervalUnit'),
    refreshIntervalHint: t('refreshIntervalHint'),
    ruleSelection: t('ruleSelection'),
    custom: t('custom'),
    minimal: t('minimal'),
    balanced: t('balanced'),
    comprehensive: t('comprehensive'),
    generalSettings: t('generalSettings'),
    baseConfigSettings: t('baseConfigSettings'),
    groupByCountry: t('groupByCountry'),
    includeAutoSelect: t('includeAutoSelect'),
    manualRefresh: t('manualRefresh'),
    refreshing: t('refreshing'),
    outputLinks: t('outputLinks'),
    outputLinksDesc: t('outputLinksDesc'),
    lastRefresh: t('lastRefresh'),
    never: t('never'),
    cachedProxies: t('cachedProxies'),
    noAggregators: t('noAggregators'),
    confirmDeleteAggregator: t('confirmDeleteAggregator'),
    backToList: t('backToList'),
    login: t('login'),
    register: t('register'),
    logout: t('logout'),
    username: t('username'),
    password: t('password'),
    loginTitle: t('loginTitle'),
    registerTitle: t('registerTitle'),
    noAccount: t('noAccount'),
    hasAccount: t('hasAccount'),
    registerSuccess: t('registerSuccess'),
  };

  const scriptContent = `
    window.AGG_I18N = ${JSON.stringify(i18n)};
    window.PREDEFINED_RULE_SETS = ${JSON.stringify(PREDEFINED_RULE_SETS)};
    if (typeof __name === 'undefined') { var __name = function(fn) { return fn; }; }
    (${aggregatorLogicFn.toString()})();
  `;

  return (
    <div x-data="aggData()" x-init="init()" class="max-w-4xl mx-auto px-4 py-8 pt-24">
      {/* Auth Section */}
      <div x-show="!isLoggedIn">
        <div class="max-w-md mx-auto">
          <div class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t('aggregatorTitle')}</h1>
            <p class="text-gray-500 dark:text-gray-400">{t('aggregatorDesc')}</p>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {/* Auth Tabs */}
            <div class="flex border-b border-gray-200 dark:border-gray-700 mb-6">
              <button
                type="button"
                x-on:click="authTab = 'login'"
                class="flex-1 py-2 text-sm font-medium transition-colors"
                x-bind:class="authTab === 'login' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'"
              >{t('login')}</button>
              <button
                type="button"
                x-on:click="authTab = 'register'"
                class="flex-1 py-2 text-sm font-medium transition-colors"
                x-bind:class="authTab === 'register' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'"
              >{t('register')}</button>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('username')}</label>
                <input type="text" x-model="authUsername" class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('password')}</label>
                <input type="password" x-model="authPassword" class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  {...{ 'x-on:keydown.enter': "authTab === 'login' ? doLogin() : doRegister()" }} />
              </div>
              <div x-show="authError" class="text-red-500 text-sm" x-text="authError"></div>
              <div x-show="authTab === 'login'">
                <button type="button" x-on:click="doLogin()" x-bind:disabled="authLoading"
                  class="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                  <span x-text="authLoading ? '...' : AGG_I18N.login"></span>
                </button>
              </div>
              <div x-show="authTab === 'register'">
                <button type="button" x-on:click="doRegister()" x-bind:disabled="authLoading"
                  class="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60">
                  <span x-text="authLoading ? '...' : AGG_I18N.register"></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main App (logged in) */}
      <div x-show="isLoggedIn">
        {/* Header */}
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{t('aggregatorTitle')}</h1>
            <p class="text-gray-500 dark:text-gray-400 mt-1">{t('aggregatorDesc')}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-500 dark:text-gray-400" x-text="currentUser"></span>
            <button type="button" x-on:click="doLogout()"
              class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              {t('logout')}
            </button>
          </div>
        </div>

        {/* List View */}
        <div x-show="view === 'list'">
          <div class="flex justify-end mb-4">
            <button type="button" x-on:click="openNew()"
              class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
              <i class="fas fa-plus text-sm"></i>
              {t('newAggregator')}
            </button>
          </div>

          <div x-show="listLoading" class="text-center py-12 text-gray-400">
            <i class="fas fa-spinner fa-spin text-2xl"></i>
          </div>

          <div x-show="!listLoading && aggregators.length === 0" class="text-center py-12 text-gray-400">
            <i class="fas fa-layer-group text-4xl mb-3 block"></i>
            <p>{t('noAggregators')}</p>
          </div>

          <div class="space-y-4">
            <template x-for="agg in aggregators" x-bind:key="agg.id">
              <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div class="flex items-start justify-between mb-4">
                  <div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white" x-text="agg.name"></h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      <span>{t('lastRefresh')}: </span>
                      <span x-text="formatDate(agg.lastRefresh)"></span>
                      <span class="mx-2">·</span>
                      <span>{t('cachedProxies')}: </span>
                      <span x-text="(agg.cachedProxyCount || 0) + ' 个'"></span>
                      <span class="mx-2">·</span>
                      <span x-text="agg.refreshInterval + 's'"></span>
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" x-on:click="refreshAgg(agg)" x-bind:disabled="refreshingId === agg.id"
                      class="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-60 flex items-center gap-1">
                      <i class="fas" x-bind:class="refreshingId === agg.id ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
                      <span x-text="refreshingId === agg.id ? AGG_I18N.refreshing : AGG_I18N.manualRefresh"></span>
                    </button>
                    <button type="button" x-on:click="openEdit(agg)"
                      class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" x-on:click="deleteAgg(agg)"
                      class="px-3 py-1.5 text-sm bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>

                {/* Output Links */}
                <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">{t('outputLinks')}</p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {OUTPUT_FORMATS.map(fmt => (
                      <div class="flex gap-2" key={fmt.key}>
                        <input type="text" readonly
                          x-bind:value={`getOutputUrl(agg, '${fmt.key}')`}
                          class="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 font-mono" />
                        <button type="button"
                          x-on:click={`copyUrl(getOutputUrl(agg, '${fmt.key}'), agg.id + '-${fmt.key}')`}
                          class="px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                          x-bind:class={`copied === agg.id + '-${fmt.key}' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'`}>
                          <i class="fas" x-bind:class={`copied === agg.id + '-${fmt.key}' ? 'fa-check' : 'fa-copy'`}></i>
                          <span class="ml-1">{fmt.label}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        {/* Edit View */}
        <div x-show="view === 'edit'">
          <div class="flex items-center gap-3 mb-6">
            <button type="button" x-on:click="view = 'list'"
              class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
              <i class="fas fa-arrow-left"></i>
            </button>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white"
              x-text="editingAgg ? AGG_I18N.editAggregator : AGG_I18N.newAggregator"></h2>
          </div>

          <div class="space-y-6">
            {/* Name */}
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('aggregatorName')}</label>
              <input type="text" x-model="form.name" placeholder={t('aggregatorNamePlaceholder')}
                class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
            </div>

            {/* Direct Nodes */}
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center justify-between mb-1">
                <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <i class="fas fa-server text-gray-400 text-sm"></i>
                  {t('directNodes')}
                </h3>
                <button type="button" x-on:click="addDirectNodeGroup()"
                  class="px-3 py-1.5 text-sm bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors flex items-center gap-1">
                  <i class="fas fa-plus text-xs"></i>
                  {t('addDirectNodeGroup')}
                </button>
              </div>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('directNodesDesc')}</p>
              <div class="space-y-4">
                <template x-for="(group, idx) in form.directNodeGroups" x-bind:key="idx">
	                  <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
	                    <div class="flex items-center justify-between mb-3">
	                      <span class="text-sm font-medium text-gray-600 dark:text-gray-400" x-text="`#${idx + 1} ` + (group.name || group.prefix || '')"></span>
	                      <div class="flex items-center gap-2">
	                        <button type="button" x-on:click="moveDirectNodeGroup(idx, -1)" x-bind:disabled="idx === 0" title={t('moveUp')}
	                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-sm">
	                          <i class="fas fa-arrow-up"></i>
	                        </button>
	                        <button type="button" x-on:click="moveDirectNodeGroup(idx, 1)" x-bind:disabled="idx === form.directNodeGroups.length - 1" title={t('moveDown')}
	                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-sm">
	                          <i class="fas fa-arrow-down"></i>
	                        </button>
	                        <button type="button" x-on:click="removeDirectNodeGroup(idx)" title={t('removeSource')}
	                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-700 transition-colors text-sm">
	                          <i class="fas fa-times"></i>
	                        </button>
	                      </div>
	                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('directNodeGroupName')}</label>
                        <input type="text" x-model="group.name" placeholder={t('directNodeGroupNamePlaceholder')}
                          class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('directNodesPrefix')}</label>
                        <input type="text" x-model="group.prefix" placeholder={t('directNodesPrefixPlaceholder')}
                          class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                      </div>
                    </div>
                    <textarea x-model="group.content" rows={6} placeholder={t('directNodesPlaceholder')}
                      class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"></textarea>
                  </div>
                </template>
              </div>
            </div>

            {/* Airport Sources */}
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center justify-between mb-1">
                <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <i class="fas fa-plane text-gray-400 text-sm"></i>
                  {t('airportSources')}
                </h3>
                <button type="button" x-on:click="addAirport()"
                  class="px-3 py-1.5 text-sm bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors flex items-center gap-1">
                  <i class="fas fa-plus text-xs"></i>
                  {t('addAirportSource')}
                </button>
              </div>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('airportSourcesDesc')}</p>

              <div class="space-y-4">
                <template x-for="(src, idx) in form.airportSources" x-bind:key="idx">
	                  <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
	                    <div class="flex items-center justify-between mb-3">
	                      <span class="text-sm font-medium text-gray-600 dark:text-gray-400" x-text="`#${idx + 1} ` + (src.name || '')"></span>
	                      <div class="flex items-center gap-2">
	                        <button type="button" x-on:click="moveAirport(idx, -1)" x-bind:disabled="idx === 0" title={t('moveUp')}
	                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-sm">
	                          <i class="fas fa-arrow-up"></i>
	                        </button>
	                        <button type="button" x-on:click="moveAirport(idx, 1)" x-bind:disabled="idx === form.airportSources.length - 1" title={t('moveDown')}
	                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-sm">
	                          <i class="fas fa-arrow-down"></i>
	                        </button>
	                        <button type="button" x-on:click="removeAirport(idx)" title={t('removeSource')}
	                          class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-700 transition-colors text-sm">
	                          <i class="fas fa-times"></i>
	                        </button>
	                      </div>
	                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div class="sm:col-span-2">
	                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('airportUrl')}</label>
	                        <input type="url" x-model="src.url" placeholder={t('airportUrlPlaceholder')}
	                          class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
	                        <p x-show="hasCustomHttpsPort(src.url)" class="mt-1 text-xs text-amber-600 dark:text-amber-400">{t('customHttpsPortWarning')}</p>
	                      </div>
                      <div>
                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('airportPrefix')}</label>
                        <input type="text" x-model="src.prefix" placeholder={t('airportPrefixPlaceholder')}
                          class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                      </div>
	                      <div class="sm:col-span-3">
	                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('airportName')}</label>
	                        <input type="text" x-model="src.name" placeholder={t('airportNamePlaceholder')}
	                          class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
	                      </div>
	                      <div class="sm:col-span-3">
	                        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('airportUserAgent')}</label>
	                        <input type="text" x-model="src.userAgent" placeholder={t('airportUserAgentPlaceholder')}
	                          class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
	                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('airportUserAgentHint')}</p>
	                      </div>
	                    </div>
                  </div>
                </template>
              </div>
            </div>

            {/* Advanced Options Toggle */}
            <div
              class="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              x-on:click="showAdvanced = !showAdvanced"
              role="button"
              tabindex="0"
              {...{
                'x-on:keydown.enter.prevent': 'showAdvanced = !showAdvanced',
                'x-on:keydown.space.prevent': 'showAdvanced = !showAdvanced'
              }}
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                  <i class="fas fa-sliders-h"></i>
                </div>
                <span class="font-semibold text-gray-900 dark:text-white">{t('advancedOptions')}</span>
              </div>
              <div
                class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition-transform duration-300"
                x-bind:class="{'rotate-180': showAdvanced}"
              >
                <i class="fas fa-chevron-down"></i>
              </div>
            </div>

            {/* Advanced Options Content */}
            <div x-show="showAdvanced" {...{'x-transition:enter': 'transition ease-out duration-300', 'x-transition:enter-start': 'opacity-0 transform -translate-y-4', 'x-transition:enter-end': 'opacity-100 transform translate-y-0', 'x-transition:leave': 'transition ease-in duration-200', 'x-transition:leave-start': 'opacity-100 transform translate-y-0', 'x-transition:leave-end': 'opacity-0 transform -translate-y-4'}} class="space-y-6">
	              <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
	                <div class="flex items-center justify-between mb-4">
	                  <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
	                    <i class="fas fa-filter text-gray-400 text-sm"></i>
	                    {t('ruleSelection')}
	                  </h3>
	                  <select x-model="selectedPredefinedRule" x-on:change="applyPredefinedRule()"
	                    class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
	                    <option value="custom">{t('custom')}</option>
	                    <option value="minimal">{t('minimal')}</option>
	                    <option value="balanced">{t('balanced')}</option>
	                    <option value="comprehensive">{t('comprehensive')}</option>
	                  </select>
	                </div>
	                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
	                  {UNIFIED_RULES.map((rule) => (
                    <label class="flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors group">
                      <input
	                        type="checkbox"
	                        value={rule.name}
	                        x-model="form.selectedRules"
	                        x-on:change="selectedPredefinedRule = 'custom'"
	                        class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
	                      />
                      <span class="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                        {t(`outboundNames.${rule.name}`)}
                      </span>
                    </label>
                  ))}
                </div>
	              </div>

	              <CustomRules t={t} />

	              <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <i class="fas fa-cog text-gray-400 text-sm"></i>
                  {t('generalSettings')}
                </h3>

                <div class="space-y-4">
                  <label class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                    <span class="font-medium text-gray-700 dark:text-gray-300">{t('groupByCountry')}</span>
                    <div class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" x-model="form.groupByCountry" class="sr-only peer" />
                      <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                    </div>
                  </label>

                  <label class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer">
                    <span class="font-medium text-gray-700 dark:text-gray-300">{t('includeAutoSelect')}</span>
                    <div class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" x-model="form.includeAutoSelect" class="sr-only peer" />
                      <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                    </div>
                  </label>

                  <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('refreshInterval')}</label>
                    <div class="flex items-center gap-3">
                      <input type="number" x-model="form.refreshInterval" min="60" step="60"
                        class="w-36 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                      <span class="text-sm text-gray-500 dark:text-gray-400">{t('refreshIntervalUnit')}</span>
                    </div>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">{t('refreshIntervalHint')}</p>
	                  </div>
	                </div>
	              </div>

	              <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
	                <div class="flex items-center justify-between mb-4">
	                  <h3 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
	                    <i class="fas fa-file-code text-gray-400 text-sm"></i>
	                    {t('baseConfigSettings')}
	                  </h3>
	                  <select x-model="configType"
	                    class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
	                    <option value="singbox">SingBox (JSON)</option>
	                    <option value="clash">Clash (YAML)</option>
	                    <option value="surge">Surge (JSON/INI)</option>
	                  </select>
	                </div>

	                <ValidatedTextarea
	                  id="aggregatorConfigEditor"
	                  name="aggregatorConfigEditor"
	                  model="configEditor"
	                  rows={5}
	                  placeholder="Paste your custom config here..."
	                  variant="mono"
	                  containerClass="mt-0 group"
	                  labelWrapperClass="flex items-center justify-end mb-2"
	                  labelActionsWrapperClass="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
	                  pasteLabel={t('paste')}
	                  clearLabel={t('clear')}
	                  validation={{
	                    button: {
	                      key: 'validate-aggregator-config',
	                      label: t('validateConfig'),
	                      className:
	                        'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2',
	                      attrs: {
	                        'x-on:click': 'validateBaseConfig()'
	                      }
	                    },
	                    success: {
	                      show: "configValidationState === 'success'",
	                      textExpr: 'configValidationMessage'
	                    },
	                    error: {
	                      show: "configValidationState === 'error'",
	                      textExpr: 'configValidationMessage'
	                    }
	                  }}
	                  inlineActionsWrapperClass="absolute bottom-4 right-4 flex gap-2"
	                  preserveLabelSpace={false}
	                />

	                <div x-show="form.configId" class="mt-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/30 text-xs text-gray-500 dark:text-gray-400 break-all">
	                  <span>Config ID: </span><span x-text="form.configId"></span>
	                </div>

	                <div class="flex justify-end gap-3 mt-4">
	                  <button type="button" x-on:click="saveBaseConfig()" x-bind:disabled="savingConfig"
	                    class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2">
	                    <i class="fas" x-bind:class="savingConfig ? 'fa-spinner fa-spin' : 'fa-save'"></i>
	                    <span x-text="savingConfig ? AGG_I18N.savingConfig : AGG_I18N.saveConfig">{t('saveConfig')}</span>
	                  </button>
	                  <button type="button" x-on:click="clearBaseConfig()"
	                    class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium text-sm">
	                    {t('clearConfig')}
	                  </button>
	                </div>
	              </div>
	            </div>

            {/* Error */}
            <div x-show="formError" class="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg" x-text="formError"></div>

            {/* Save Button */}
            <div class="flex justify-end gap-3">
              <button type="button" x-on:click="view = 'list'"
                class="px-6 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                {t('backToList')}
              </button>
              <button type="button" x-on:click="saveForm()" x-bind:disabled="formLoading"
                class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-60 flex items-center gap-2">
                <i class="fas" x-bind:class="formLoading ? 'fa-spinner fa-spin' : 'fa-save'"></i>
                <span x-text="formLoading ? AGG_I18N.saving : AGG_I18N.saveAggregator"></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </div>
  );
};
