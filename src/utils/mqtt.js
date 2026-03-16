import mqtt from "mqtt";
import { ref } from "vue";
import { validateSensorData } from "@/utils/sensor_data_verification.js";

// 默认MQTT配置
export const defaultMqttConfig = ref({
  broker: "va1af2fe.ala.cn-hangzhou.emqxsl.cn",
  port: 8084,
  topic: "sensor/data",
  username: "qqqqwwww",
  password: "123456",
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

// MQTT客户端实例
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

  // 生成clientId
  const clientId = "emqx_vue3_" + Math.random().toString(16).substring(2, 8);

  // 断开已有连接
  if (client) {
    client.end();
    client = null;
  }

  try {
    client = mqtt.connect(
      `wss://${defaultMqttConfig.value.broker}:${defaultMqttConfig.value.port}/mqtt`,
      {
        clientId: clientId,
        username: defaultMqttConfig.value.username,
        password: defaultMqttConfig.value.password,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
      },
    );

    // 连接成功
    client.on("connect", () => {
      console.log("MQTT连接成功！");
      isConnected.value = true;
      // 订阅主题
      client.subscribe(defaultMqttConfig.value.topic, (err) => {
        if (!err) {
          console.log(`订阅主题 ${defaultMqttConfig.value.topic} 成功`);
          alert(`订阅主题 ${defaultMqttConfig.value.topic} 成功`);
        }
      });
    });

    // 监听收到的消息（仅处理单JSON对象）
    client.on("message", async (topic, payload) => {
      try {
        // 1. 解析二进制payload为JSON对象
        const data = JSON.parse(payload.toString());
        console.log(`收到${topic}主题的消息：`, data);

        // 2. 执行数据校验（核心逻辑）
        const { valid, errors } = validateSensorData(data);
        if (!valid) {
          // 校验失败：记录日志+弹窗提示，终止后续处理
          const errorMsg = errors.map((e) => e.message).join("；");
          console.error(`【${topic}】数据校验失败：`, errors);
          alert(`【数据校验失败】${errorMsg}`);
          return; // 跳过无效数据，避免污染存储/Pinia
        }

        // 3. 校验通过：更新最新数据
        receivedSensorData.value = data;

        // 4. 构建历史数据项（仅保留后端parsed_time，无前端时间戳）
        const historyItem = {
          ...data,
          // 兜底：确保parsed_time存在，格式统一为本地字符串
          parsed_time: data.parsed_time || new Date().toLocaleString(),
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
        sensorStore.addRawMqttData(data); // 直接传入单对象，无需遍历
      } catch (err) {
        // 解析失败/其他异常处理
        console.error("解析MQTT消息失败：", err);
        alert(`消息解析失败：${err.message}`);
      }
    });

    // 连接错误处理
    client.on("error", (err) => {
      console.error("MQTT连接失败：", err);
      isConnected.value = false;
      alert(`MQTT连接失败：${err.message}`);
      client = null;
    });

    // 连接断开处理
    client.on("close", () => {
      console.log("MQTT连接已断开");
      isConnected.value = false;
      client = null;
    });

    return client;
  } catch (err) {
    console.error("创建MQTT连接失败：", err);
    alert(`创建连接失败：${err.message}`);
    return null;
  }
};

// 断开MQTT连接
export const disconnectMqtt = () => {
  if (client) {
    client.end();
    client = null;
    isConnected.value = false;
    console.log("手动断开MQTT连接");
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

  const { topic, qos, payload } = publish.value;
  try {
    const jsonPayload = JSON.stringify(payload);
    client.publish(topic, jsonPayload, { qos }, (error) => {
      if (error) {
        console.error("MQTT 发布失败:", error);
        alert(`发布失败：${error.message}`);
        return;
      }
      console.log("发布成功，原始数据：", payload);
      console.log("发布的 JSON 字符串：", jsonPayload);
      alert("消息发布成功！");
    });
  } catch (err) {
    console.error("JSON 序列化失败:", err);
    alert(`序列化失败：${err.message}`);
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
