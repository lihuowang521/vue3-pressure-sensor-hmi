<script setup>
import { ref } from "vue";
import { useSensorStore } from "@/stores/sensorStore";

const sensorStore = useSensorStore();
const lastExportTime = ref("未导出过");

const exportData = () => {
  sensorStore.exportDataToCSV();
  lastExportTime.value = new Date().toLocaleString();
};
</script>

<template>
  <div class="export-container">
    <h2 class="page-title">导出数据</h2>

    <div class="export-panel">
      <div class="export-options">
        <h3>导出选项</h3>

        <div class="form-group">
          <label for="export-type">导出类型：</label>
          <select id="export-type" class="form-control">
            <option value="csv">CSV格式</option>
          </select>
        </div>

        <div class="form-group">
          <label for="time-range">时间范围：</label>
          <select id="time-range" class="form-control">
            <option value="all">全部数据</option>
            <option value="1h">最近1小时</option>
            <option value="24h">最近24小时</option>
            <option value="7d">最近7天</option>
          </select>
        </div>

        <div class="form-group">
          <label for="data-type">数据类型：</label>
          <select id="data-type" class="form-control">
            <option value="all">所有传感器</option>
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

        <button class="export-btn" @click="exportData">导出数据</button>
      </div>

      <div class="export-info">
        <h3>导出信息</h3>
        <p>
          当前已收集 <span class="data-count">{{ sensorStore.historyData.length }}</span> 条数据
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
