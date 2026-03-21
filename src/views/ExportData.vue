<script setup>
import { ref, computed } from "vue";
import { useSensorStore } from "@/stores/sensorStore";

const sensorStore = useSensorStore();
const lastExportTime = ref("未导出过");

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

  startTime.value = startDate.toISOString().slice(0, 16);
  endTime.value = now.toISOString().slice(0, 16);
};

// 导出数据
const exportData = () => {
  const options = {
    pipeId: selectedPipeId.value,
    flangeId: selectedFlangeId.value,
    startTime: startTime.value ? new Date(startTime.value).getTime() : undefined,
    endTime: endTime.value ? new Date(endTime.value).getTime() : undefined,
  };

  const result = sensorStore.exportDataToCSV(options);
  if (result) {
    lastExportTime.value = new Date().toLocaleString();
  }
};
</script>

<template>
  <div class="export-container">
    <h2 class="page-title">导出数据</h2>

    <div class="export-panel">
      <div class="export-options">
        <h3>导出选项</h3>

        <div class="form-group">
          <label for="pipe-select">选择管道：</label>
          <select
            id="pipe-select"
            v-model="selectedPipeId"
            class="form-control"
            @change="selectedFlangeId = ''"
          >
            <option value="">全部管道</option>
            <option v-for="pipeId in pipeIdList" :key="pipeId" :value="pipeId">
              {{ pipeId }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="flange-select">选择法兰：</label>
          <select
            id="flange-select"
            v-model="selectedFlangeId"
            class="form-control"
            :disabled="!selectedPipeId"
          >
            <option value="">全部法兰</option>
            <option v-for="flangeId in flangeIdList" :key="flangeId" :value="flangeId">
              {{ flangeId }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="start-time">开始时间：</label>
          <input type="datetime-local" id="start-time" v-model="startTime" class="form-control" />
        </div>

        <div class="form-group">
          <label for="end-time">结束时间：</label>
          <input type="datetime-local" id="end-time" v-model="endTime" class="form-control" />
        </div>

        <div class="quick-time-ranges">
          <button class="quick-time-btn" @click="setQuickTimeRange('1h')">最近1小时</button>
          <button class="quick-time-btn" @click="setQuickTimeRange('6h')">最近6小时</button>
          <button class="quick-time-btn" @click="setQuickTimeRange('24h')">最近24小时</button>
          <button class="quick-time-btn" @click="setQuickTimeRange('7d')">最近7天</button>
          <button class="quick-time-btn" @click="setQuickTimeRange('30d')">最近30天</button>
        </div>

        <button class="export-btn" @click="exportData">导出数据</button>
      </div>

      <div class="export-info">
        <h3>导出信息</h3>
        <p>
          当前已收集 <span class="data-count">{{ sensorStore.rawMqttData.length }}</span> 条原始数据
        </p>
        <p>上次导出时间：{{ lastExportTime }}</p>
        <p>导出文件格式：CSV</p>
        <p>文件包含字段：时间戳、管线、法兰、传感器1-12</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.page-title {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 30px;
  font-size: 24px;
  font-weight: 600;
}

.export-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}

.export-options h3,
.export-info h3 {
  color: #2c3e50;
  margin-bottom: 20px;
  font-size: 18px;
  font-weight: 600;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #495057;
  font-weight: 500;
}

.form-control {
  width: 100%;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 8px;
  font-size: 14px;
  color: #495057;
  background-color: white;
  transition:
    border-color 0.15s ease-in-out,
    box-shadow 0.15s ease-in-out;
}

.form-control:focus {
  border-color: #667eea;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
}

.quick-time-ranges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 15px 0;
}

.quick-time-btn {
  padding: 6px 12px;
  border: 1px solid #667eea;
  background: white;
  color: #667eea;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.quick-time-btn:hover {
  background: #667eea;
  color: white;
  transform: translateY(-1px);
}

.export-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 20px;
}

.export-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.export-info {
  background: rgba(102, 126, 234, 0.05);
  padding: 20px;
  border-radius: 12px;
}

.export-info p {
  margin-bottom: 10px;
  color: #6c757d;
  line-height: 1.5;
}

.data-count {
  font-weight: 600;
  color: #667eea;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .export-panel {
    grid-template-columns: 1fr;
  }

  .export-container {
    padding: 15px;
  }

  .export-panel {
    padding: 20px;
  }
}
</style>
