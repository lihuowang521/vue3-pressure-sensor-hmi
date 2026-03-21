<script setup>
// 组件名称
defineOptions({
  name: "HistoryPage",
});
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useSensorStore } from "@/stores/sensorStore";

const sensorStore = useSensorStore();

const router = useRouter();

const currentTime = ref("");




// 选择器绑定值
const selectedPipeId = ref("");
const selectedFlangeId = ref("");
const startTime = ref("");
const endTime = ref("");

// 计算属性：提取管道/法兰列表
const pipeIdList = computed(() => sensorStore.getUniquePipeIds);
const flangeIdList = computed(() => {
  if (!selectedPipeId.value) return [];
  return sensorStore.getFlangeIdsByPipeId(selectedPipeId.value);
});


const setQuickFilter = (duration, event) => {
  const now = new Date();
  let startDate = new Date();

  switch (duration) {
    case "1h":
      startDate.setHours(now.getHours() - 1);
      break;
    case "6h":
      startDate.setHours(now.getHours() - 6);
      break;
    case "24h":
      startDate.setDate(now.getDate() - 1);
      break;
    case "7d":
      startDate.setDate(now.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(now.getDate() - 30);
      break;
  }

  startTime.value = startDate.toISOString().slice(0, 16);
  endTime.value = now.toISOString().slice(0, 16);

  // 更新活动按钮
  document.querySelectorAll(".quick-filter-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");

  sensorStore.queryData();
};


const goBack = () => {
  router.push("/monitoring-interface");
};

const updateTime = () => {
  const now = new Date();
  currentTime.value = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

let timer = null;

onMounted(() => {
  // 初始化默认时间范围为最近24小时
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - 1);
  startTime.value = startDate.toISOString().slice(0, 16);
  endTime.value = now.toISOString().slice(0, 16);

  // 初始化并开始更新时间
  updateTime();
  timer = setInterval(updateTime, 1000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
});
</script>

<template>
  <div>
    <!-- 页面头部区域 -->
    <header class="header">
      <!-- 头部左侧：返回按钮和页面标题 -->
      <div class="header-left">
        <button class="back-btn" @click="goBack()">← 返回监控</button>
        <h1>历史数据</h1>
      </div>
      <!-- 头部右侧：设备信息区域 -->
      <div class="device-info">
        <!-- 当前时间显示区域，通过JavaScript动态更新 -->
        <div class="current-time">{{ currentTime }}</div>
      </div>
    </header>

    <section class="filter-section">
      <h2 class="filter-title">📅 时间筛选</h2>
      <div class="filter-grid">
        <div class="form-group">
          <label class="form-label">开始时间</label>
          <input type="datetime-local" class="form-input" v-model="startTime" />
        </div>
        <div class="form-group">
          <label class="form-label">结束时间</label>
          <input type="datetime-local" class="form-input" v-model="endTime" />
        </div>
        <button class="btn-primary" @click="queryData()">🔍 查询数据</button>
      </div>
      <div class="quick-filters">
        <button class="quick-filter-btn active" @click="setQuickFilter('1h', $event)">
          最近1小时
        </button>
        <button class="quick-filter-btn" @click="setQuickFilter('6h', $event)">最近6小时</button>
        <button class="quick-filter-btn" @click="setQuickFilter('24h', $event)">最近24小时</button>
        <button class="quick-filter-btn" @click="setQuickFilter('7d', $event)">最近7天</button>
        <button class="quick-filter-btn" @click="setQuickFilter('30d', $event)">最近30天</button>
      </div>
    </section>

    <section class="content-section">
      <!-- 图表显示区域  需要进一步学习echarts -->
      <div class="chart-section">
        <h2 class="chart-title">📈 历史趋势图</h2>
        <!-- 图表容器，通过ID供JavaScript访问以渲染图表 -->
        <div class="chart-container" id="chartContainer">
          <!-- 图表占位符，在无数据时显示提示信息 -->
          <div class="chart-placeholder">
            📊 压力趋势折线图<br />
            <small>选择时间范围后显示数据</small>
          </div>
        </div>
      </div>

    </section>
  </div>
</template>

<style scoped>
.header {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.back-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
}

.back-btn:hover {
  background: #5a6268;
  transform: translateX(-2px);
}

.header-left h1 {
  color: #2c3e50;
  font-size: 24px;
}

.device-info {
  display: flex;
  gap: 20px;
  align-items: center;
}

.current-time {
  font-size: 14px;
  color: #2c3e50;
}

.filter-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 25px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.filter-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 20px;
  align-items: end;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #495057;
}

.form-input {
  padding: 12px 15px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s ease;
  background: white;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.btn-primary {
  padding: 12px 24px;
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.quick-filters {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  flex-wrap: wrap;
}

.quick-filter-btn {
  padding: 8px 16px;
  border: 2px solid #667eea;
  background: white;
  color: #667eea;
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.quick-filter-btn:hover,
.quick-filter-btn.active {
  background: #667eea;
  color: white;
}

.content-section {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

.chart-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 25px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.chart-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 20px;
  text-align: center;
}

.chart-container {
  height: 400px;
  background: #f8f9fa;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c757d;
  font-size: 16px;
  position: relative;
}

.chart-placeholder {
  text-align: center;
}

.data-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 25px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.data-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.export-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
}

.export-btn:hover {
  background: #218838;
  transform: translateY(-2px);
}

.data-table-container {
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid #e9ecef;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.data-table th {
  background: #f8f9fa;
  padding: 15px;
  text-align: left;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #e9ecef;
}

.data-table td {
  padding: 12px 15px;
  border-bottom: 1px solid #e9ecef;
  color: #212529;
}

.data-table tbody tr:hover {
  background: #f8f9fa;
}

.status-normal {
  color: #28a745;
  font-weight: 500;
}

.status-warning {
  color: #ffc107;
  font-weight: 500;
}

.status-alarm {
  color: #dc3545;
  font-weight: 500;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
}

.pagination button {
  padding: 8px 12px;
  border: 1px solid #dee2e6;
  background: white;
  color: #495057;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.pagination button:hover:not(:disabled) {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination .current-page {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.loading {
  display: none;
  text-align: center;
  padding: 20px;
  color: #6c757d;
}

.loading.show {
  display: block;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}

@media (max-width: 768px) {
  .container {
    padding: 10px;
  }

  .header {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }

  .filter-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .quick-filters {
    justify-content: center;
  }

  .section-header {
    flex-direction: column;
    gap: 15px;
    align-items: stretch;
  }

  .data-table-container {
    font-size: 12px;
  }
}
</style>
