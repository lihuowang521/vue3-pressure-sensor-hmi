<script setup>
// 组件名称
defineOptions({
  name: "HistoryPage",
});
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useSensorStore } from "@/stores/sensorStore";
import * as echarts from "echarts";

const sensorStore = useSensorStore();

const router = useRouter();

const currentTime = ref("");

// 选择器绑定值
const selectedPipeId = ref("");
const selectedFlangeId = ref("");
const selectedSensor = ref("sensor1");
const startTime = ref("");
const endTime = ref("");

// 查询结果数据
const queryResult = ref([]);

// 计算属性：提取管道/法兰列表
const pipeIdList = computed(() => sensorStore.getUniquePipeIds);
const flangeIdList = computed(() => {
  if (!selectedPipeId.value) return [];
  return sensorStore.getFlangeIdsByPipeId(selectedPipeId.value);
});

// 快速时间范围选择
const setQuickTimeRange = (duration) => {
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

  // 使用本地时间格式，避免时区转换问题
  startTime.value = formatLocalDateTime(startDate);
  endTime.value = formatLocalDateTime(now);
};

// 辅助函数：格式化本地时间为 yyyy-MM-ddTHH:mm 格式
const formatLocalDateTime = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
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

const queryData = () => {
  if (!selectedPipeId.value || !selectedFlangeId.value || !startTime.value || !endTime.value) {
    alert("请先选择管道、法兰和时间范围");
    return;
  }

  const sensorPosition = parseInt(selectedSensor.value.replace("sensor", ""), 10);
  console.log("查询参数:", {
    pipeId: selectedPipeId.value,
    flangeId: selectedFlangeId.value,
    sensorPosition: sensorPosition,
    startTime: startTime.value,
    endTime: endTime.value,
  });

  queryResult.value = sensorStore.getHistoryData(
    selectedPipeId.value,
    selectedFlangeId.value,
    sensorPosition,
    startTime.value,
    endTime.value,
  );

  console.log("查询结果数据:", queryResult.value);
  console.log("数据长度:", queryResult.value.length);

  if (queryResult.value.length === 0) {
    alert("未找到符合条件的数据");
  }

  initChart(queryResult.value);
};

//初始化图表
let lineChart = null;
const initChart = (data) => {
  const chartDom = document.querySelector("#line-chart");
  if (!chartDom) {
    console.error("图表容器未找到");
    return;
  }

  // 销毁旧实例
  if (lineChart) {
    lineChart.dispose();
    lineChart = null;
  }

  lineChart = echarts.init(chartDom);

  // 处理数据
  const xAxisData = data.map((item) => item.parsed_time);
  const seriesData = data.map((item) => item.pressure);

  console.log("图表X轴数据:", xAxisData);
  console.log("图表系列数据:", seriesData);

  const option = {
    tooltip: {
      trigger: "axis",
      axisPointer: {
        animation: false,
      },
      formatter: function (params) {
        return `${params[0].name}<br/>${params[0].seriesName}: ${params[0].value} kPa`;
      },
    },
    xAxis: {
      type: "category",
      data: xAxisData,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
      },
    },
    yAxis: {
      type: "value",
      name: "压力 (kPa)",
      axisLabel: {
        formatter: "{value} kPa",
      },
    },
    series: [
      {
        data: seriesData,
        type: "line",
        name: "压力",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: {
          width: 2,
        },
        itemStyle: {
          color: "#667eea",
        },
      },
    ],
    grid: {
      left: "10%",
      right: "10%",
      bottom: "20%",
      top: "10%",
      containLabel: true,
    },
  };

  console.log("图表配置:", option);
  lineChart.setOption(option);
};

let timer = null;

onMounted(() => {
  // 初始化默认时间范围为最近24小时
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - 1);
  startTime.value = formatLocalDateTime(startDate);
  endTime.value = formatLocalDateTime(now);

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
        <div class="sensor-select-container">
          <div class="selector-item">
            <label for="pipe-select">选择管道：</label>
            <select id="pipe-select" v-model="selectedPipeId" @change="selectedFlangeId = ''">
              <option value="">请选择管道</option>
              <option v-for="pipeId in pipeIdList" :key="pipeId" :value="pipeId">
                {{ pipeId }}
              </option>
            </select>
          </div>
          <div class="selector-item">
            <label for="flange-select">选择法兰：</label>
            <select id="flange-select" v-model="selectedFlangeId" :disabled="!selectedPipeId">
              <option value="">请选择法兰</option>
              <option v-for="flangeId in flangeIdList" :key="flangeId" :value="flangeId">
                {{ flangeId }}
              </option>
            </select>
          </div>
          <div class="selector-item">
            <label for="sensor-select">选择传感器：</label>
            <select id="sensor-select" class="sensor-select" v-model="selectedSensor">
              <option value="sensor1">传感器1</option>
              <option value="sensor2">传感器2</option>
              <option value="sensor3">传感器3</option>
              <option value="sensor4">传感器4</option>
              <option value="sensor5">传感器5</option>
              <option value="sensor6">传感器6</option>
              <option value="sensor7">传感器7</option>
              <option value="sensor8">传感器8</option>
              <option value="sensor9">传感器9</option>
              <option value="sensor10">传感器10</option>
              <option value="sensor11">传感器11</option>
              <option value="sensor12">传感器12</option>
            </select>
          </div>
        </div>
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
        <button class="quick-time-btn" @click="setQuickTimeRange('1h')">最近1小时</button>
        <button class="quick-time-btn" @click="setQuickTimeRange('6h')">最近6小时</button>
        <button class="quick-time-btn" @click="setQuickTimeRange('24h')">最近24小时</button>
        <button class="quick-time-btn" @click="setQuickTimeRange('7d')">最近7天</button>
        <button class="quick-time-btn" @click="setQuickTimeRange('30d')">最近30天</button>
      </div>
    </section>

    <section class="content-section">
      <!-- 图表显示区域  需要进一步学习echarts -->
      <div class="chart-section">
        <h2 class="chart-title">📈 历史趋势图</h2>
        <!-- 图表容器，通过ID供JavaScript访问以渲染图表 -->
        <div class="chart-container" id="line-chart">
          <!-- 图表占位符，在无数据时显示提示信息 -->
          <div v-if="queryResult.length === 0" class="chart-placeholder">
            📊 压力趋势折线图<br />
            <small>选择时间范围后显示数据</small>
          </div>
        </div>
        <!-- 数据摘要，与图表容器同级 -->
        <div v-if="queryResult.length > 0" class="data-summary">
          <div class="summary-item">
            <span class="summary-label">数据条数：</span>
            <span class="summary-value">{{ queryResult.length }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">时间范围：</span>
            <span class="summary-value">{{ startTime }} 至 {{ endTime }}</span>
          </div>
        </div>
      </div>

      <!-- 数据表格区域 -->
      <div class="data-section" v-if="queryResult.length > 0">
        <div class="section-header">
          <h2 class="data-title">📋 详细数据</h2>
        </div>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>采集时间</th>
                <th>管道</th>
                <th>法兰</th>
                <th>传感器位置</th>
                <th>压力值 (kPa)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in queryResult" :key="index">
                <td>{{ item.parsed_time }}</td>
                <td>{{ item.pipe_id }}</td>
                <td>{{ item.flange_id }}</td>
                <td>{{ item.sensor_position }}</td>
                <td>{{ item.pressure }}</td>
              </tr>
            </tbody>
          </table>
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

/* 选择器容器样式 */
.sensor-select-container {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
  margin-left: 20px;
}

.selector-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-item label {
  font-size: 14px;
  font-weight: 500;
  color: #495057;
  white-space: nowrap;
}

.selector-item select {
  padding: 8px 12px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  color: #495057;
  background: white;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 120px;
}

.selector-item select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.selector-item select:disabled {
  background: #f8f9fa;
  cursor: not-allowed;
  opacity: 0.7;
}

.sensor-select {
  min-width: 150px;
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

.quick-time-btn {
  padding: 8px 16px;
  border: 2px solid #667eea;
  background: white;
  color: #667eea;
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.quick-time-btn:hover {
  background: #667eea;
  color: white;
  transform: translateY(-1px);
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

.data-summary {
  display: flex;
  justify-content: center;
  gap: 30px;
  padding: 20px;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.summary-label {
  font-size: 12px;
  color: #6c757d;
}

.summary-value {
  font-size: 18px;
  font-weight: 600;
  color: #667eea;
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

  .header-left {
    flex-direction: column;
    gap: 15px;
  }

  .sensor-select-container {
    flex-direction: column;
    gap: 15px;
    margin-left: 0;
    width: 100%;
  }

  .selector-item {
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
  }

  .selector-item select {
    width: 100%;
    min-width: auto;
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

  .data-summary {
    flex-direction: column;
    gap: 15px;
  }
}
</style>
