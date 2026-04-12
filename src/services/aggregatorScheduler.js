import { AggregatorService } from './aggregatorService.js';

/**
 * 后台定时刷新所有到期的聚合器
 * 扫描 KV 中所有聚合，检查是否需要刷新
 */
export class AggregatorScheduler {
    constructor(kv, logger = console) {
        this.kv = kv;
        this.aggService = new AggregatorService(kv);
        this.logger = logger;
        this._timer = null;
    }

    /**
     * 执行一次扫描刷新
     * 遍历所有用户的聚合器，刷新过期的
     */
    async tick() {
        try {
            const userListRaw = await this.kv.get('agg_scheduler:user_index');
            if (!userListRaw) return;

            const userIds = JSON.parse(userListRaw);
            for (const userId of userIds) {
                try {
                    const aggs = await this._getUserAggs(userId);
                    for (const agg of aggs) {
                        if (this.aggService.needsRefresh(agg)) {
                            this.logger.info?.(`[Scheduler] Refreshing aggregator ${agg.id} (${agg.name})`);
                            try {
                                const refreshed = await this.aggService.refresh(agg.id);
                                this.logger.info?.(`[Scheduler] Refreshed ${agg.id}: ${refreshed.cachedProxies?.length || 0} proxies`);
                            } catch (e) {
                                this.logger.error?.(`[Scheduler] Failed to refresh ${agg.id}:`, e.message);
                            }
                        }
                    }
                } catch (e) {
                    this.logger.error?.(`[Scheduler] Error processing user ${userId}:`, e.message);
                }
            }
        } catch (e) {
            this.logger.error?.('[Scheduler] Tick error:', e.message);
        }
    }

    async _getUserAggs(userId) {
        const listRaw = await this.kv.get(`user_aggs:${userId}`);
        if (!listRaw) return [];
        const ids = JSON.parse(listRaw);
        const aggs = await Promise.all(ids.map(id => this.aggService.get(id)));
        return aggs.filter(Boolean);
    }

    /**
     * Node.js 环境：启动 setInterval 定时器
     * @param {number} intervalMs - 扫描间隔（毫秒），默认 60 秒
     */
    startInterval(intervalMs = 60_000) {
        this.stopInterval();
        this.logger.info?.(`[Scheduler] Starting with interval ${intervalMs}ms`);
        // 启动后立即执行一次
        this.tick();
        this._timer = setInterval(() => this.tick(), intervalMs);
        // 允许 Node.js 进程正常退出
        if (this._timer.unref) this._timer.unref();
    }

    stopInterval() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }
}
