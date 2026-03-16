import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useSensorStore = defineStore("sensor", () => {
  // 传感器实时数据（1-12号传感器）
  const sensorData = ref({
    sensor1: "0.0 kPa",
    sensor2: "0.0 kPa",
    sensor3: "0.0 kPa",
    sensor4: "0.0 kPa",
    sensor5: "0.0 kPa",
    sensor6: "0.0 kPa",
    sensor7: "0.0 kPa",
    sensor8: "0.0 kPa",
    sensor9: "0.0 kPa",
    sensor10: "0.0 kPa",
    sensor11: "0.0 kPa",
    sensor12: "0.0 kPa",
  });

  // 当前选中的管线/法兰编号
  const selectedPipeline = ref(1);
  const selectedFlange = ref(1);

  // 历史数据/图表数据（均使用后端parsed_time）
  const historyData = ref([]);
  const chartData = ref([]);

  // 原始MQTT数据（用于提取管道/法兰列表）
  const rawMqttData = ref([]);

  // ========== 基础方法 ==========
  // 获取指定传感器的数值
  const getSensorValue = (sensorId) => {
    return sensorData.value[sensorId] || "0.0 kPa";
  };

  // 提取所有唯一的管道ID列表（优化性能：使用Set去重）
  const getUniquePipeIds = computed(() => {
    const pipeIds = new Set();
    rawMqttData.value.forEach((item) => item.pipe_id && pipeIds.add(item.pipe_id));
    return Array.from(pipeIds).sort();
  });

  // 根据管道ID提取对应的法兰ID列表
  const getFlangeIdsByPipeId = (pipeId) => {
    const flangeIds = new Set();
    rawMqttData.value
      .filter((item) => item.pipe_id === pipeId && item.flange_id)
      .forEach((item) => flangeIds.add(item.flange_id));
    return Array.from(flangeIds).sort();
  };

  // ========== 数据存储与更新 ==========
  // 保存原始MQTT数据（去重+更新传感器数据）
  const addRawMqttData = (data) => {
    // 跳过空数据
    if (!data || typeof data !== "object") return;

    // 去重规则：pipe_id + flange_id + parsed_time 唯一
    const isDuplicate = rawMqttData.value.some(
      (item) =>
        item.pipe_id === data.pipe_id &&
        item.flange_id === data.flange_id &&
        item.parsed_time === data.parsed_time,
    );

    if (!isDuplicate) {
      rawMqttData.value.push(data);
      updateSensorData(data); // 同步更新传感器数值
    }
  };

  // 更新传感器数值（仅处理单对象，移除数组逻辑）
  const updateSensorData = (data) => {
    try {
      // 仅处理合法的单对象数据
      if (!data || typeof data !== "object") return;

      // 1. 校验当前数据是否匹配选中的管线/法兰
      const currentPipeId = `P${String(selectedPipeline.value).padStart(3, "0")}`;
      const currentFlangeId = `F${String(selectedFlange.value).padStart(2, "0")}`;
      if (data.pipe_id !== currentPipeId || data.flange_id !== currentFlangeId) {
        return; // 不匹配则跳过更新
      }

      // 2. 校验核心字段（sensor_position/pressure）
      if (
        typeof data.sensor_position !== "number" ||
        typeof data.pressure !== "number" ||
        isNaN(data.pressure) ||
        data.sensor_position < 1 ||
        data.sensor_position > 12
      ) {
        console.warn("传感器数据字段不合法，跳过更新", data);
        return;
      }

      // 3. 计算压力值（转换为kPa，保留1位小数）
      const pressureInKPa = data.pressure * 1000;
      const sensorKey = `sensor${data.sensor_position}`;

      // 4. 更新传感器数值
      sensorData.value[sensorKey] = `${pressureInKPa.toFixed(1)} kPa`;

      // 5. 格式化后端的parsed_time（确保为ISO格式）
      const parsedTime = data.parsed_time
        ? new Date(data.parsed_time).toISOString()
        : new Date().toISOString();

      // 6. 保存到历史数据和图表数据
      const sensorDataMap = { [sensorKey]: pressureInKPa };
      saveToHistory(sensorDataMap, parsedTime);
      updateChartData(sensorDataMap, parsedTime);
    } catch (error) {
      console.error("更新传感器数据失败:", error);
    }
  };

  // 保存历史数据（仅用后端parsed_time）
  const saveToHistory = (data, parsedTime = new Date().toISOString()) => {
    const historyItem = {
      parsed_time: parsedTime, // 仅保留后端采集时间
      pipeline: selectedPipeline.value,
      flange: selectedFlange.value,
      data: { ...data },
    };

    historyData.value.push(historyItem);
    // 限制历史数据最大条数（避免内存溢出）
    if (historyData.value.length > 1000) {
      historyData.value.shift();
    }
  };

  // 更新图表数据（适配ECharts显示）
  const updateChartData = (data, parsedTime) => {
    // 格式化显示时间（时分秒）
    const displayTime = parsedTime
      ? new Date(parsedTime).toLocaleTimeString()
      : new Date().toLocaleTimeString();

    const newData = {
      parsed_time: parsedTime || new Date().toISOString(), // 原始采集时间
      displayTime: displayTime, // 图表显示用的格式化时间
      ...data,
    };

    chartData.value.push(newData);
    // 图表仅保留最新60条数据
    if (chartData.value.length > 60) {
      chartData.value.shift();
    }
  };

  // ========== 管线/法兰选择 ==========
  // 根据管道ID更新选中的管线（如P001 → 1）
  const setPipelineByPipeId = (pipeId) => {
    if (!pipeId) return;
    const num = pipeId.replace(/P/g, "");
    selectedPipeline.value = parseInt(num, 10) || 1;
  };

  // 根据法兰ID更新选中的法兰（如F01 → 1）
  const setFlangeByFlangeId = (flangeId) => {
    if (!flangeId) return;
    const num = flangeId.replace(/F/g, "");
    selectedFlange.value = parseInt(num, 10) || 1;
  };

  // 手动设置选中的管线/法兰
  const setSelectedPipeline = (pipeline) => {
    selectedPipeline.value = pipeline;
  };
  const setSelectedFlange = (flange) => {
    selectedFlange.value = flange;
  };

  // ========== 数据导出 ==========
  // 导出CSV（使用parsed_time作为采集时间）
  const exportDataToCSV = () => {
    if (historyData.value.length === 0) {
      alert("暂无历史数据可导出");
      return null;
    }

    // CSV表头
    const headers = [
      "采集时间",
      "管线",
      "法兰",
      "传感器1",
      "传感器2",
      "传感器3",
      "传感器4",
      "传感器5",
      "传感器6",
      "传感器7",
      "传感器8",
      "传感器9",
      "传感器10",
      "传感器11",
      "传感器12",
    ];

    // 构建CSV行数据
    const rows = historyData.value.map((item) => [
      item.parsed_time, // 后端采集时间
      item.pipeline,
      item.flange,
      item.data.sensor1 || 0,
      item.data.sensor2 || 0,
      item.data.sensor3 || 0,
      item.data.sensor4 || 0,
      item.data.sensor5 || 0,
      item.data.sensor6 || 0,
      item.data.sensor7 || 0,
      item.data.sensor8 || 0,
      item.data.sensor9 || 0,
      item.data.sensor10 || 0,
      item.data.sensor11 || 0,
      item.data.sensor12 || 0,
    ]);

    // 生成CSV内容并下载
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = `传感器数据_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}.csv`;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // 释放URL对象
  };

  return {
    // 响应式状态
    sensorData,
    selectedPipeline,
    selectedFlange,
    historyData,
    chartData,
    rawMqttData,
    // 计算属性
    getUniquePipeIds,
    // 方法
    getSensorValue,
    getFlangeIdsByPipeId,
    addRawMqttData,
    setPipelineByPipeId,
    setFlangeByFlangeId,
    updateSensorData,
    setSelectedPipeline,
    setSelectedFlange,
    exportDataToCSV,
  };
});
