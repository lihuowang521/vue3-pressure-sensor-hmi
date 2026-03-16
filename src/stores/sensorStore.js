import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useSensorStore = defineStore("sensor", () => {
  // 保留你原有所有响应式状态
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

  const selectedPipeline = ref(1);
  const selectedFlange = ref(1);
  const historyData = ref([]);
  const chartData = ref([]);

  // 存储原始MQTT数据（用于提取管道/法兰列表）
  const rawMqttData = ref([]);

  // 获取传感器数值
  const getSensorValue = (sensorId) => {
    return sensorData.value[sensorId] || "0.0 kPa";
  };

  // 提取所有唯一的管道ID列表
  const getUniquePipeIds = computed(() => {
    const pipeIds = new Set();
    //此方法处理可能浪费性能，因为它遍历了所有数据，可能要改
    rawMqttData.value.forEach((item) => pipeIds.add(item.pipe_id));
    return Array.from(pipeIds).sort();
  });

  // 根据管道ID提取对应的法兰ID列表
  const getFlangeIdsByPipeId = (pipeId) => {
    const flangeIds = new Set();
    rawMqttData.value
      .filter((item) => item.pipe_id === pipeId)
      .forEach((item) => flangeIds.add(item.flange_id));
    return Array.from(flangeIds).sort();
  };

  // 保存原始MQTT数据，由mqtt.js调用
  const addRawMqttData = (data) => {
    // 去重：避免重复添加（按pipe_id+flange_id+parsed_time）
    const isDuplicate = rawMqttData.value.some(
      (item) =>
        item.pipe_id === data.pipe_id &&
        item.flange_id === data.flange_id &&
        item.parsed_time === data.parsed_time,
    );
    if (!isDuplicate) {
      rawMqttData.value.push(data);
      updateSensorData(data);
    }
  };

  // 根据管道ID更新selectedPipeline（如P001 → 1）
  const setPipelineByPipeId = (pipeId) => {
    // 提取管道编号（P001 → 1，P002 → 2）
    const num = pipeId.replace(/P/g, "");
    selectedPipeline.value = parseInt(num, 10) || 1;
  };

  // 根据法兰ID更新selectedFlange（如F01 → 1）
  const setFlangeByFlangeId = (flangeId) => {
    // 提取法兰编号（F01 → 1，F02 → 2）
    const num = flangeId.replace(/F/g, "");
    selectedFlange.value = parseInt(num, 10) || 1;
  };

  // 更新传感器数值
  const updateSensorData = (data) => {
    try {
      if (data != null) {
        if (Array.isArray(data)) {
          const sensorDataMap = {};
          let parsedTime = data[0]?.parsed_time || new Date().toISOString();
          data.forEach((item) => {
            if (
              item &&
              typeof item === "object" &&
              typeof item.sensor_position === "number" &&
              typeof item.pressure === "number" &&
              !isNaN(item.pressure)
            ) {
              const currentPipeId = `P${String(selectedPipeline.value).padStart(3, "0")}`;
              const currentFlangeId = `F${String(selectedFlange.value).padStart(2, "0")}`;

              if (item.pipe_id === currentPipeId && item.flange_id === currentFlangeId) {
                // 🔥 修改2：使用后端的parsed_time
                if (item.parsed_time) {
                  parsedTime = new Date(item.parsed_time).toISOString();
                }
                const sensorKey = `sensor${item.sensor_position}`;
                const pressureInKPa = item.pressure * 1000;
                if (!isNaN(pressureInKPa) && sensorData.value.hasOwnProperty(sensorKey)) {
                  sensorDataMap[sensorKey] = pressureInKPa;
                  sensorData.value[sensorKey] = `${pressureInKPa.toFixed(1)} kPa`;
                }
              }
            }
          });
          if (Object.keys(sensorDataMap).length > 0) {
            saveToHistory(sensorDataMap, parsedTime);
            updateChartData(sensorDataMap, parsedTime); // 传递parsed_time
          }
        } else if (typeof data === "object") {
          if (
            typeof data.sensor_position === "number" &&
            typeof data.pressure === "number" &&
            !isNaN(data.pressure)
          ) {
            const currentPipeId = `P${String(selectedPipeline.value).padStart(3, "0")}`;
            const currentFlangeId = `F${String(selectedFlange.value).padStart(2, "0")}`;

            if (data.pipe_id === currentPipeId && data.flange_id === currentFlangeId) {
              // 🔥 修改3：使用后端的parsed_time
              let parsedTime = data.parsed_time
                ? new Date(data.parsed_time).toISOString()
                : new Date().toISOString();
              const sensorKey = `sensor${data.sensor_position}`;
              const pressureInKPa = data.pressure * 1000;
              if (!isNaN(pressureInKPa) && sensorData.value.hasOwnProperty(sensorKey)) {
                sensorData.value[sensorKey] = `${pressureInKPa.toFixed(1)} kPa`;
                const sensorDataMap = {
                  [sensorKey]: pressureInKPa,
                };
                saveToHistory(sensorDataMap, parsedTime);
                updateChartData(sensorDataMap, parsedTime); // 传递parsed_time
              }
            }
          } else {
            // 🔥 修改4：兜底逻辑也优先用parsed_time
            let parsedTime = data.parsed_time
              ? new Date(data.parsed_time).toISOString()
              : new Date().toISOString();
            for (const key in data) {
              if (
                sensorData.value.hasOwnProperty(key) &&
                typeof data[key] === "number" &&
                !isNaN(data[key])
              ) {
                sensorData.value[key] = `${data[key].toFixed(1)} kPa`;
              }
            }
            saveToHistory(data, parsedTime);
            updateChartData(data, parsedTime); // 传递parsed_time
          }
        }
      }
    } catch (error) {
      console.error("更新传感器数据失败:", error);
    }
  };

  // 🔥 核心修改：saveToHistory 用 parsed_time 替换 timestamp
  const saveToHistory = (data, parsedTime = new Date().toISOString()) => {
    const historyItem = {
      // 替换：timestamp → parsedTime（后端的parsed_time）
      parsed_time: parsedTime,
      pipeline: selectedPipeline.value,
      flange: selectedFlange.value,
      data: { ...data },
    };

    historyData.value.push(historyItem);
    if (historyData.value.length > 1000) {
      historyData.value.shift();
    }
  };

  // 🔥 核心修改：updateChartData 用 parsed_time 替换前端生成的时间
  const updateChartData = (data, parsedTime) => {
    // 优先用后端的parsed_time格式化，没有则用当前时间
    const displayTime = parsedTime
      ? new Date(parsedTime).toLocaleTimeString()
      : new Date().toLocaleTimeString();

    const newData = {
      // 替换：timestamp → parsed_time（保留displayTime用于图表显示）
      parsed_time: parsedTime || new Date().toISOString(),
      displayTime: displayTime,
      ...data,
    };

    chartData.value.push(newData);
    if (chartData.value.length > 60) {
      chartData.value.shift();
    }
  };

  const setSelectedPipeline = (pipeline) => {
    selectedPipeline.value = pipeline;
  };

  const setSelectedFlange = (flange) => {
    selectedFlange.value = flange;
  };

  // 🔥 修改5：导出CSV时用 parsed_time 替换 timestamp
  const exportDataToCSV = () => {
    if (historyData.value.length === 0) {
      return null;
    }

    const headers = [
      "采集时间", // 表头从“时间戳”改为“采集时间”
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

    const rows = historyData.value.map((item) => {
      return [
        item.parsed_time, // 替换：timestamp → parsed_time
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
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `传感器数据_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    sensorData,
    selectedPipeline,
    selectedFlange,
    historyData,
    chartData,
    rawMqttData,
    getSensorValue,
    getUniquePipeIds,
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
