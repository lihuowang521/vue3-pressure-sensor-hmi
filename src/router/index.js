import { createRouter, createWebHashHistory } from "vue-router";

import HomePage from "@/components/HomePage.vue";
import MonitoringInterface from "@/views/MonitoringInterface.vue";
import Setting from "@/views/Setting.vue";
import History from "@/views/History.vue";
import ExportData from "@/views/ExportData.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/monitoring-interface", component: MonitoringInterface },
    { path: "/setting", component: Setting },
    { path: "/history", component: History },
    { path: "/export-data", component: ExportData },
    // 通配符路由，确保所有未匹配的路由都重定向到首页
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

export default router;
