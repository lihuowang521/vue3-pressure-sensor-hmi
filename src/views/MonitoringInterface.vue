<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from "vue";
import { useSensorStore } from "@/stores/sensorStore";
import * as echarts from "echarts";

const sensorStore = useSensorStore();

// 管道/法兰选择器绑定值（字符串型：P001/F01）
const selectedPipeId = ref("");
const selectedFlangeId = ref("");
// 传感器选择
const selectedSensor = ref("sensor1");
// 定时刷新定时器
let refreshTimer = null;

// 计算属性：提取管道/法兰列表（从Pinia的rawMqttData）
const pipeIdList = computed(() => sensorStore.getUniquePipeIds);
const flangeIdList = computed(() => {
  if (!selectedPipeId.value) return [];
  return sensorStore.getFlangeIdsByPipeId(selectedPipeId.value);
});

// 初始化图表
let lineChart = null;
let isMounted = false;

const initChart = () => {
  if (!isMounted) return;
  const chartDom = document.querySelector("#line-chart");
  if (!chartDom) return;
  lineChart = echarts.init(chartDom);
  const option = {
    tooltip: {
      trigger: "axis",
      formatter: function (params) {
        const time = new Date(params[0].data[0]);
        const timeStr = time.toLocaleString(); // 显示年月日时分秒
        return `${timeStr}：${params[0].data[1].toFixed(1)} kPa`;
      },
      axisPointer: {
        animation: false,
      },
    },
    xAxis: {
      type: "time",
      splitLine: { show: false },
      // 修改核心：配置X轴只显示时分秒
      axisLabel: {
        formatter: function (value) {
          // value是时间戳，转为时分秒
          return new Date(value).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        },
        fontSize: 12,
      },
      min: "dataMin",
      max: "dataMax",
    },
    yAxis: {
      type: "value",
      name: "压力 (kPa)",
      boundaryGap: [0, "10%"], // 缩小边距，更紧凑
      splitLine: { show: false },
      minInterval: 1, // 强制显示最小刻度间隔为1
      axisLabel: {
        formatter: "{value} kPa",
      },
    },
    series: [
      {
        name: "压力值",
        type: "line",
        showSymbol: true,
        symbolSize: 4,
        smooth: true, // 折线平滑
        data: [],
      },
    ],
    grid: { left: "8%", right: "4%", bottom: "15%", top: "10%", containLabel: true },
  };
  lineChart.setOption(option);
};

const updateChart = () => {
  if (!isMounted || !lineChart || !selectedSensor.value) {
    return;
  }

  const currentPipeId = selectedPipeId.value;
  const currentFlangeId = selectedFlangeId.value;

  // 计算5分钟前的时间戳
  const fiveMinutesAgo = new Date();
  fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
  const fiveMinutesAgoTimestamp = fiveMinutesAgo.getTime();

  const validChartData = sensorStore.chartData
    .filter((item) => item.parsed_time)
    .filter((item) => {
      if (!currentPipeId || !currentFlangeId) return true;
      return item.pipeline === currentPipeId && item.flange === currentFlangeId;
    })
    .map((item) => {
      const timeStamp = new Date(item.parsed_time).getTime();
      const value = item[selectedSensor.value] || 0;
      return [timeStamp, value];
    })
    .filter((item) => !isNaN(item[0]))
    // 只保留最近5分钟的数据
    .filter((item) => item[0] >= fiveMinutesAgoTimestamp);

  let yAxisMin = 0;
  let yAxisMax = 10;
  if (validChartData.length > 0) {
    const values = validChartData.map((item) => item[1]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const padding = (maxVal - minVal) * 0.1 || 2;
    yAxisMin = Math.max(0, minVal - padding);
    yAxisMax = maxVal + padding;
  }

  try {
    lineChart.setOption({
      series: [{ data: validChartData }],
      yAxis: { min: yAxisMin, max: yAxisMax },
    });
  } catch (error) {
    console.warn("图表更新失败：", error);
  }
};

// 启动定时刷新
const startRefreshTimer = () => {
  if (refreshTimer) clearInterval(refreshTimer);

  if (isMounted && selectedPipeId.value && selectedFlangeId.value) {
    refreshTimer = setInterval(() => {
      if (isMounted) {
        sensorStore.loadLatestSensorData(selectedPipeId.value, selectedFlangeId.value);
        updateChart();
      }
    }, 1000);
  }
};

// 处理窗口 resize 事件
const handleResize = () => {
  if (isMounted && lineChart) {
    try {
      lineChart.resize();
    } catch (error) {
      console.warn("图表 resize 失败：", error);
    }
  }
};

// 监听选择器变化
watch([selectedPipeId, selectedFlangeId], () => {
  if (!isMounted) return;

  if (selectedPipeId.value) sensorStore.setPipelineByPipeId(selectedPipeId.value);
  if (selectedFlangeId.value) sensorStore.setFlangeByFlangeId(selectedFlangeId.value);

  if (selectedPipeId.value && selectedFlangeId.value) {
    sensorStore.loadLatestSensorData(selectedPipeId.value, selectedFlangeId.value);
    startRefreshTimer();
  } else {
    if (refreshTimer) clearInterval(refreshTimer);
  }
  // 延迟更新图表，确保数据加载完成
  setTimeout(() => {
    if (isMounted) updateChart();
  }, 100);
});

// 传感器选择变化
const handleSensorChange = () => {
  if (isMounted) updateChart();
};

// 监听chartData变化，自动更新图表
watch(
  () => sensorStore.chartData,
  () => {
    if (isMounted && selectedPipeId.value && selectedFlangeId.value) {
      updateChart();
    }
  },
  { deep: true },
);

// 页面初始化
onMounted(() => {
  isMounted = true;
  initChart();
  // 默认选中第一个管道/法兰
  if (pipeIdList.value.length > 0) {
    selectedPipeId.value = pipeIdList.value[0];
    setTimeout(() => {
      if (isMounted && flangeIdList.value.length > 0) {
        selectedFlangeId.value = flangeIdList.value[0];
        sensorStore.loadLatestSensorData(selectedPipeId.value, selectedFlangeId.value);
        startRefreshTimer();
        // 初始化图表数据
        setTimeout(() => {
          if (isMounted) updateChart();
        }, 200);
      }
    }, 100);
  }
  window.addEventListener("resize", handleResize);
});

// 组件卸载时清除定时器
onUnmounted(() => {
  isMounted = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  window.removeEventListener("resize", handleResize);
  if (lineChart) {
    try {
      lineChart.dispose(); // 释放图表资源
    } catch (error) {
      console.warn("图表销毁失败：", error);
    }
    lineChart = null;
  }
});
</script>

<template>
  <div class="container">
    <!-- 管道/法兰选择器 -->
    <section class="selector-panel">
      <div class="pipe-flange-selector">
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
      </div>
    </section>
    <!-- 实时压力监控 -->
    <div class="main-content">
      <section class="gauge-panel">
        <h2 class="panel-title">实时压力监控</h2>
        <div class="gauge-container">
          <div class="sensor-circle">
            <!-- 传感器1 (0°) -->
            <div class="sensor-item" style="--angle: 0deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器1</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor1 }}</div>
            </div>
            <!-- 传感器2 (30°) -->
            <div class="sensor-item" style="--angle: 30deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器2</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor2 }}</div>
            </div>
            <!-- 传感器3 (60°) -->
            <div class="sensor-item" style="--angle: 60deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器3</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor3 }}</div>
            </div>
            <!-- 传感器4 (90°) -->
            <div class="sensor-item" style="--angle: 90deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器4</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor4 }}</div>
            </div>
            <!-- 传感器5 (120°) -->
            <div class="sensor-item" style="--angle: 120deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器5</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor5 }}</div>
            </div>
            <!-- 传感器6 (150°) -->
            <div class="sensor-item" style="--angle: 150deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器6</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor6 }}</div>
            </div>
            <!-- 传感器7 (180°) -->
            <div class="sensor-item" style="--angle: 180deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器7</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor7 }}</div>
            </div>
            <!-- 传感器8 (210°) -->
            <div class="sensor-item" style="--angle: 210deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器8</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor8 }}</div>
            </div>
            <!-- 传感器9 (240°) -->
            <div class="sensor-item" style="--angle: 240deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器9</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor9 }}</div>
            </div>
            <!-- 传感器10 (270°) -->
            <div class="sensor-item" style="--angle: 270deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器10</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor10 }}</div>
            </div>
            <!-- 传感器11 (300°) -->
            <div class="sensor-item" style="--angle: 300deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器11</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor11 }}</div>
            </div>
            <!-- 传感器12 (330°) -->
            <div class="sensor-item" style="--angle: 330deg">
              <div class="sensor-dot"></div>
              <div class="sensor-label">传感器12</div>
              <div class="sensor-value">{{ sensorStore.sensorData.sensor12 }}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="chart-panel">
        <h2 class="panel-title">压力趋势图</h2>
        <div class="time-range">最近5分钟数据</div>
        <div class="sensor-selector">
          <label for="sensor-select">选择传感器：</label>
          <select
            id="sensor-select"
            class="sensor-select"
            v-model="selectedSensor"
            @change="handleSensorChange"
          >
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
        <!-- 图表容器 -->
        <div class="chart-container" id="line-chart"></div>
      </section>
    </div>
    <!-- 系统参数 -->
    <section class="bottom-section">
      <div class="parameters-panel">
        <h2 class="panel-title">系统参数</h2>
        <div class="parameters-grid">
          <div class="param-item">
            <div class="param-label">采样频率</div>
            <div class="param-value">100 Hz</div>
          </div>
          <div class="param-item">
            <div class="param-label">报警上限</div>
            <div class="param-value">400 kPa</div>
          </div>
          <div class="param-item">
            <div class="param-label">报警下限</div>
            <div class="param-value">0 kPa</div>
          </div>
          <div class="param-item">
            <div class="param-label">通信波特率</div>
            <div class="param-value">115200</div>
          </div>
        </div>
        <div class="alert-area" id="alertArea">
          <strong>⚠️ 压力报警</strong><br />
          当前压力未超出设定阈值范围
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 管道/法兰选择器容器：衔接全局渐变风格 */
.selector-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px 25px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.pipe-flange-selector {
  display: flex;
  gap: 20px;
  justify-content: center;
  align-items: center;
}

.selector-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-item label {
  font-size: 14px;
  color: #2c3e50;
  font-weight: 500;
}

.selector-item select {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 14px;
  color: #495057;
  background-color: white;
  cursor: pointer;
  transition:
    border-color 0.15s ease-in-out,
    box-shadow 0.15s ease-in-out;
}

.selector-item select:focus {
  border-color: #667eea;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
}

.selector-item select:disabled {
  background-color: #e9ecef;
  cursor: not-allowed;
}

/* 🔥 关键：左右布局 */
.main-content {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

/* 左边：实时压力监控 */
.gauge-panel {
  flex: 0 0 50%;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.panel-title {
  font-size: 18px;
  color: #2c3e50;
  margin-bottom: 20px;
  text-align: center;
  font-weight: 600;
}

.gauge-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.sensor-circle {
  position: relative;
  width: 100%;
  max-width: 380px;
  height: 380px;
  border-radius: 50%;
  border: 2px solid #e0e0e0;
  background: rgba(248, 249, 250, 0.5);
}

.sensor-item {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center;
  transform: translate(-50%, -50%) rotate(-90deg) rotate(var(--angle)) translateX(150px)
    rotate(calc(-1 * var(--angle))) rotate(90deg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 80px;
  text-align: center;
}

.sensor-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: linear-gradient(45deg, #667eea, #764ba2);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}

.sensor-label {
  font-size: 12px;
  color: #6c757d;
}

.sensor-value {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
}

/* 右边：压力趋势图 */
.chart-panel {
  flex: 1;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.time-range {
  font-size: 14px;
  color: #6c757d;
  text-align: center;
  margin-bottom: 10px;
}

.sensor-selector {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
}

.sensor-select {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 14px;
  color: #495057;
  background-color: white;
  cursor: pointer;
}

.chart-container {
  width: 100%;
  height: 380px;
  border-radius: 8px;
  flex: 1;
  justify-content: center;
  align-items: center;
}

/* 底部参数面板 */
.bottom-section {
  margin-top: 20px;
}

.parameters-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.parameters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 15px;
}

.param-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.param-label {
  font-size: 14px;
  color: #6c757d;
}

.param-value {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.alert-area {
  background: rgba(255, 77, 77, 0.1);
  border-left: 4px solid #ff4d4d;
  padding: 10px 15px;
  border-radius: 6px;
  color: #d32f2f;
  font-size: 14px;
  text-align: center;
  margin-top: 10px;
}

/* 响应式：小屏幕自动上下布局 */
@media (max-width: 992px) {
  .main-content {
    flex-direction: column;
  }
  .gauge-panel,
  .chart-panel {
    flex: auto;
  }
}

@media (max-width: 768px) {
  .pipe-flange-selector {
    flex-direction: column;
    gap: 10px;
  }
  .sensor-circle {
    max-width: 300px;
    height: 300px;
  }
  .sensor-item {
    transform: translate(-50%, -50%) rotate(-90deg) rotate(var(--angle)) translateX(120px)
      rotate(calc(-1 * var(--angle))) rotate(90deg);
  }
  .chart-container {
    height: 300px;
  }
  .parameters-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
