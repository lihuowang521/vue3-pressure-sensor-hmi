// 引入了vue包用来实现前端页面的渲染和交互。实现了页面的展示和操作。
// 引入了vue-router包用来实现路由功能。实现了页面的跳转和导航。
// 引入了pinia包用来管理全局状态。实现了状态的共享和管理。
// 引入了mqtt包用来连接MQTT服务器。实现了订阅和发布消息的功能。

// 引入了pinia-plugin-persistedstate插件用来实现pinia状态的持久化存储。
//实现了状态刷新后保持不变。
import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

import App from "./App.vue";
import router from "./router";

const app = createApp(App);

app.use(createPinia().use(piniaPluginPersistedstate));
app.use(router);

app.mount("#app");
