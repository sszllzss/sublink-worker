import { createApp } from './app/createApp.jsx';
import { createCloudflareRuntime } from './runtime/cloudflare.js';
import { AggregatorScheduler } from './services/aggregatorScheduler.js';

let honoApp;

function getApp(env) {
    if (!honoApp) {
        const runtime = createCloudflareRuntime(env);
        honoApp = createApp(runtime);
    }
    return honoApp;
}

export default {
    fetch(request, env, ctx) {
        const app = getApp(env);
        return app.fetch(request, env, ctx);
    },

    // Cloudflare Cron Trigger — 定时刷新聚合器
    async scheduled(event, env, ctx) {
        const runtime = createCloudflareRuntime(env);
        if (!runtime.kv) return;
        const scheduler = new AggregatorScheduler(runtime.kv, runtime.logger);
        ctx.waitUntil(scheduler.tick());
    }
};
