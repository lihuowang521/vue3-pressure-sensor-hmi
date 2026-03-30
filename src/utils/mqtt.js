import { ref } from "vue";
import { validateSensorData } from "@/utils/sensor_data_verification.js";

// 默认MQTT配置
export const defaultMqttConfig = ref({
  broker: "localhost",
  port: 3001,
  topic: "gateway/uplink/data",
  username: "",
  password: "",
});

// 连接状态
export const isConnected = ref(false);

// 最新传感器数据（单对象）
export const receivedSensorData = ref(null);
// 传感器历史数据
export const sensorDataHistory = ref([]);

// 更新MQTT配置
export const updateMqttConfig = (newConfig) => {
  Object.assign(defaultMqttConfig.value, newConfig);
};

// WebSocket客户端实例
export let client = null;

// 连接MQTT函数（适配单对象场景）
export const connectMqtt = () => {
  // 配置校验
  if (!defaultMqttConfig.value.broker) {
    alert("请填写MQTT连接地址！");
    return null;
  }
  if (
    isNaN(defaultMqttConfig.value.port) ||
    defaultMqttConfig.value.port < 0 ||
    defaultMqttConfig.value.port > 65535
  ) {
    alert("请填写合法的端口号（0-65535）！");
    return null;
  }

  // 断开已有连接
  if (client) {
    client.close();
    client = null;
  }

  try {
    // 创建WebSocket连接到代理服务器
    const wsUrl = `ws://${defaultMqttConfig.value.broker}:${defaultMqttConfig.value.port}`;
    client = new WebSocket(wsUrl);

    // 连接成功
    client.onopen = () => {
      console.log("MQTT代理连接成功！");
      isConnected.value = true;
      alert("MQTT代理连接成功！");
    };

    // 接收消息
    client.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("收到消息：", data);

        // 处理连接成功消息
        if (data.type === "connected") {
          console.log(data.message);
          return;
        }

        // 处理LoRaWAN数据格式
        let sensorData = data;
        if (data.data) {
          // 解析Base64编码的传感器数据
          sensorData = parseLoraData(data);
          if (!sensorData) {
            console.error("解析传感器数据失败");
            return;
          }
        }

        // 执行数据校验
        const { valid, errors } = validateSensorData(sensorData);
        if (!valid) {
          // 校验失败：记录日志+弹窗提示，终止后续处理
          const errorMsg = errors.map((e) => e.message).join("；");
          console.error(`数据校验失败：`, errors);
          alert(`【数据校验失败】${errorMsg}`);
          return; // 跳过无效数据，避免污染存储/Pinia
        }

        // 校验通过：更新最新数据
        receivedSensorData.value = sensorData;

        // 构建历史数据项
        const historyItem = {
          ...sensorData,
          // 兜底：确保parsed_time存在，格式统一为本地字符串
          parsed_time: sensorData.parsed_time || new Date().toLocaleString(),
        };
        sensorDataHistory.value.push(historyItem);
        // 只保留最新521条历史数据
        if (sensorDataHistory.value.length > 521) {
          sensorDataHistory.value.shift();
        }

        // 5. 持久化到本地存储（防止页面刷新丢失）
        localStorage.setItem("latestSensorData", JSON.stringify(receivedSensorData.value));
        localStorage.setItem("sensorDataHistory", JSON.stringify(sensorDataHistory.value));

        // 6. 同步到Pinia仓库（移除数组兼容，仅处理单对象）
        const sensorStore = await import("@/stores/sensorStore").then((mod) =>
          mod.useSensorStore(),
        );
        sensorStore.addRawMqttData(sensorData); // 直接传入单对象，无需遍历
      } catch (err) {
        // 解析失败/其他异常处理
        console.error("解析消息失败：", err);
        alert(`消息解析失败：${err.message}`);
      }
    };

    // 解析LoRaWAN数据
    function parseLoraData(loraData) {
      try {
        // 解码Base64数据
        const binaryData = atob(loraData.data);
        console.log("解码后的数据长度：", binaryData.length);
        console.log("解码后的数据：", binaryData);

        // 验证帧头帧尾（AA 55 和 55 AA）
        const frameHeader = binaryData.charCodeAt(0) + binaryData.charCodeAt(1);
        const frameFooter =
          binaryData.charCodeAt(binaryData.length - 2) +
          binaryData.charCodeAt(binaryData.length - 1);
        if (frameHeader !== 170 + 85 || frameFooter !== 85 + 170) {
          console.error("帧头帧尾验证失败");
          return null;
        }

        // 解析子帧标识
        const subframeId = binaryData.charCodeAt(2);
        let basePosition = 1;
        if (subframeId === 7) {
          basePosition = 7;
        }

        // 解析传感器数据（处理6个传感器）
        const sensorDataList = [];
        for (let i = 0; i < 6; i++) {
          const start = 3 + i * 6;
          if (start + 6 <= binaryData.length) {
            const sensorBytes = binaryData.substr(start, 6);
            const sensorPosition = basePosition + i;
            const positionAngle = (sensorPosition - 1) * 30;

            // 解析压力值（假设前4字节为压力数据）
            let pressure = 0;
            for (let j = 0; j < 4; j++) {
              pressure += sensorBytes.charCodeAt(j) * Math.pow(256, j);
            }
            pressure = pressure / 1000; // 转换为kPa

            sensorDataList.push({
              device_id: loraData.devEUI || "unknown",
              pipe_id: "P001",
              flange_id: "F01",
              sensor_position: sensorPosition,
              position_angle: positionAngle,
              pressure: pressure,
              raw_pressure: pressure,
              battery_voltage: 3.5, // 假设值
              signal_strength: -75, // 假设值
              parsed_time: new Date().toLocaleString(),
              is_abnormal: pressure > 300 ? 1 : 0,
            });
          }
        }

        // 返回第一个传感器数据（可根据需要返回所有数据）
        return sensorDataList[0] || null;
      } catch (error) {
        console.error("解析LoRa数据失败：", error);
        return null;
      }
    }

    // 连接错误处理
    client.onerror = (err) => {
      console.error("MQTT代理连接失败：", err);
      isConnected.value = false;
      alert(`MQTT代理连接失败：${err.message}`);
      client = null;
    };

    // 连接断开处理
    client.onclose = () => {
      console.log("MQTT代理连接已断开");
      isConnected.value = false;
      client = null;
    };

    return client;
  } catch (err) {
    console.error("创建连接失败：", err);
    alert(`创建连接失败：${err.message}`);
    return null;
  }
};

// 断开MQTT连接
export const disconnectMqtt = () => {
  if (client) {
    client.close();
    client = null;
    isConnected.value = false;
    console.log("手动断开MQTT代理连接");
  }
};

// 发布消息配置（示例模板，可根据实际需求调整字段）
const publish = ref({
  topic: defaultMqttConfig.value.topic,
  payload: {
    pipe_id: "P001",
    flange_id: "F01",
    sensor_position: 1,
    position_angle: 0.0,
    pressure: 1.0,
    raw_pressure: 1.0,
    battery_voltage: 3.5,
    signal_strength: -70,
    parsed_time: new Date().toLocaleString(), // 发布时用当前时间
    is_abnormal: 0,
  },
  qos: 0,
});

// 发布消息（适配单对象）
export const doPublish = () => {
  // 发布前先校验数据合法性
  const { valid, errors } = validateSensorData(publish.value.payload);
  if (!valid) {
    const errorMsg = errors.map((e) => e.message).join("；");
    alert(`【发布失败】数据校验不通过：${errorMsg}`);
    return;
  }

  try {
    const message = {
      topic: publish.value.topic,
      payload: publish.value.payload,
    };
    client.send(JSON.stringify(message));
    console.log("发布成功，原始数据：", publish.value.payload);
    alert("消息发布成功！");
  } catch (err) {
    console.error("发布失败:", err);
    alert(`发布失败：${err.message}`);
  }
};

// 初始化时从本地存储加载历史数据（仅处理单对象）
export const initSensorData = async () => {
  try {
    const latestData = localStorage.getItem("latestSensorData");
    const historyData = localStorage.getItem("sensorDataHistory");

    // 加载最新数据到响应式变量 + Pinia
    if (latestData) {
      const parsedData = JSON.parse(latestData);
      receivedSensorData.value = parsedData;

      // 同步到Pinia（仅单对象）
      const sensorStoreModule = await import("@/stores/sensorStore");
      const sensorStore = sensorStoreModule.useSensorStore();
      sensorStore.addRawMqttData(parsedData);
    }

    // 加载历史数据
    if (historyData) {
      sensorDataHistory.value = JSON.parse(historyData);
    }
    console.log("本地存储数据加载完成");
  } catch (err) {
    console.error("初始化传感器数据失败：", err);
    alert(`数据初始化失败：${err.message}`);
  }
};
