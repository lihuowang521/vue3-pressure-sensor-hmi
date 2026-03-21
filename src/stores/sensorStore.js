import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useSensorStore = defineStore(
  "sensor",
  () => {
    // 原始MQTT数据
    //这个数据才是爹！！！！！！！！！！！！！
    const rawMqttData = ref([]);

    // 12个传感器实时数据（靠下面的loadLatestSensorData更新）
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
    // 从rawMqttData中获取指定管道法兰的最新传感器数据
    const loadLatestSensorData = (pipeId, flangeId) => {
      try {
        // 筛选出指定管道法兰的数据
        const filteredData = rawMqttData.value.filter(
          (item) => item.pipe_id === pipeId && item.flange_id === flangeId,
        );

        if (filteredData.length === 0) {
          // 如果没有数据，重置所有传感器值
          for (let i = 1; i <= 12; i++) {
            sensorData.value[`sensor${i}`] = "0.0 kPa";
          }
          return;
        }

        // 按时间排序，获取最新的数据
        filteredData.sort((a, b) => {
          const timeA = new Date(a.parsed_time || 0).getTime();
          const timeB = new Date(b.parsed_time || 0).getTime();
          return timeB - timeA;
        });

        // 初始化传感器数据对象
        const latestSensorData = {};
        for (let i = 1; i <= 12; i++) {
          latestSensorData[`sensor${i}`] = "0.0 kPa";
        }

        // 创建一个对象来存储每个传感器的最新数据
        const sensorLatestData = {};

        // 遍历所有数据，只保留每个传感器的最新数据
        filteredData.forEach((item) => {
          if (
            typeof item.sensor_position === "number" &&
            typeof item.pressure === "number" &&
            !isNaN(item.pressure) &&
            item.sensor_position >= 1 &&
            item.sensor_position <= 12
          ) {
            const sensorKey = `sensor${item.sensor_position}`;
            // 只有当这个传感器还没有数据时，才更新（因为数据已经按时间降序排序）
            if (!sensorLatestData[sensorKey]) {
              sensorLatestData[sensorKey] = item;
            }
          }
        });

        // 使用每个传感器的最新数据来更新传感器值
        Object.keys(sensorLatestData).forEach((sensorKey) => {
          const item = sensorLatestData[sensorKey];
          const pressureInKPa = item.pressure;
          latestSensorData[sensorKey] = `${pressureInKPa.toFixed(1)} kPa`;
        });

        // 更新sensorData
        sensorData.value = latestSensorData;
      } catch (error) {
        console.error("加载最新传感器数据失败:", error);
      }
    };

    // 当前选中的管线/法兰编号
    const selectedPipeline = ref("");
    const selectedFlange = ref("");

    // 历史数据（从rawMqttData中计算得出）
    const historyData = ref([]);
    const gethistoryData = function (pipeId, flangeId, sensorPosition, startTime, endTime) {
      historyData.value = rawMqttData.value.filter((item) => {
        return (
          item.pipe_id === pipeId &&
          item.flange_id === flangeId &&
          item.sensor_position === sensorPosition &&
          item.parsed_time >= startTime &&
          item.parsed_time <= endTime
        );
      });
      historyData.value.sort((a, b) => new Date(a.parsed_time) - new Date(b.parsed_time)); //历史数据按时间排序
      return historyData.value;
    };

    // 图表数据（从rawMqttData中计算得出）
    const chartData = computed(() => {
      const chartMap = new Map();

      rawMqttData.value.forEach((item) => {
        // 生成唯一key：时间_管道ID_法兰ID
        const key = `${item.parsed_time}_${item.pipe_id}_${item.flange_id}`;

        // 如果该key不存在，则创建新的数据对象
        if (!chartMap.has(key)) {
          chartMap.set(key, {
            parsed_time: item.parsed_time,
            displayTime: new Date(item.parsed_time).toLocaleTimeString(),
            pipeline: item.pipe_id,
            flange: item.flange_id,
          });
        }

        // 获取当前key对应的数据对象
        const chartItem = chartMap.get(key);

        // 动态添加传感器数据，如 sensor1, sensor2, ...
          const sensorKey = `sensor${item.sensor_position}`;
          chartItem[sensorKey] = item.pressure; // 存储压力值
      });

      // 将Map转换为数组
      const chartArray = Array.from(chartMap.values());
      chartArray.sort((a, b) => new Date(a.parsed_time) - new Date(b.parsed_time)); // 按时间升序排序
      return chartArray.slice(-60); // 只保留最近60条数据，用于图表展示
    });

    // ========== 基础方法 ==========

    // 提取所有唯一的管道ID列表
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
    //源头，开始嵌套
    const addRawMqttData = (data) => {
      // 跳过空数据
      if (!data || typeof data !== "object") return;

      // 去重规则：pipe_id + flange_id + parsed_time 唯一
      const isDuplicate = rawMqttData.value.some(
        (item) =>
          item.pipe_id === data.pipe_id &&
          item.flange_id === data.flange_id &&
          item.sensor_position === data.sensor_position &&
          item.parsed_time === data.parsed_time,
      );

      if (!isDuplicate) {
        rawMqttData.value.push(data);
        updateSensorData(data); // 同步更新传感器数值
      }
    };

    // 更新传感器数值
    const updateSensorData = (data) => {
      try {
        if (!data || typeof data !== "object") return;

        const currentPipeId = selectedPipeline.value;
        const currentFlangeId = selectedFlange.value;
        if (data.pipe_id !== currentPipeId || data.flange_id !== currentFlangeId) {
          return;
        }

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

        const pressureInKPa = data.pressure;
        const sensorKey = `sensor${data.sensor_position}`;

        sensorData.value[sensorKey] = `${pressureInKPa.toFixed(1)} kPa`;
      } catch (error) {
        console.error("更新传感器数据失败:", error);
      }
    };

    // ========== 管线/法兰选择 ==========
    // 根据管道ID更新选中的管线
    const setPipelineByPipeId = (pipeId) => {
      if (!pipeId) return;
      selectedPipeline.value = pipeId;
    };

    const setFlangeByFlangeId = (flangeId) => {
      if (!flangeId) return;
      selectedFlange.value = flangeId;
    };

    // 手动设置选中的管线/法兰
    const setSelectedPipeline = (pipeline) => {
      selectedPipeline.value = pipeline || "";
    };
    const setSelectedFlange = (flange) => {
      selectedFlange.value = flange || "";
    };

    // ========== 数据导出 ==========
    //根据导入的管线/法兰/时间范围，导出符合条件的历史数据
    // 导出CSV（使用parsed_time作为采集时间）
    const exportDataToCSV = (options = {}) => {
      const { pipeId, flangeId, startTime, endTime } = options;

      const exportMap = new Map();

      rawMqttData.value.forEach((item) => {
        if (pipeId && item.pipe_id !== pipeId) return;
        if (flangeId && item.flange_id !== flangeId) return;
        if (startTime) {
          const itemTime = new Date(item.parsed_time).getTime();
          if (itemTime < startTime) return;
        }
        if (endTime) {
          const itemTime = new Date(item.parsed_time).getTime();
          if (itemTime > endTime) return;
        }

        const key = `${item.parsed_time}_${item.pipe_id}_${item.flange_id}`;

        if (!exportMap.has(key)) {
          exportMap.set(key, {
            parsed_time: item.parsed_time,
            pipeline: item.pipe_id,
            flange: item.flange_id,
            data: {},
          });
        }

        const exportItem = exportMap.get(key);
        if (item.sensor_position >= 1 && item.sensor_position <= 12) {
          const sensorKey = `sensor${item.sensor_position}`;
          exportItem.data[sensorKey] = item.pressure;
        }
      });

      const exportData = Array.from(exportMap.values());
      if (exportData.length === 0) {
        alert("暂无符合条件的历史数据可导出");
        return null;
      }

      // 按时间排序
      exportData.sort((a, b) => new Date(a.parsed_time) - new Date(b.parsed_time));

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
      const rows = exportData.map((item) => [
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

      return true;
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
      getFlangeIdsByPipeId,
      addRawMqttData,
      setPipelineByPipeId,
      setFlangeByFlangeId,
      updateSensorData,
      setSelectedPipeline,
      setSelectedFlange,
      exportDataToCSV,
      loadLatestSensorData,
      gethistoryData,
    };
  },
  {
    // 开启状态持久化存储
    persist: true,
  },
);
