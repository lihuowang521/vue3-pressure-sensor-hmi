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

export const receivedSensorData = ref(null);
export const sensorDataHistory = ref([]);

// 更新MQTT配置
export const updateMqttConfig = (newConfig) => {
  Object.assign(defaultMqttConfig.value, newConfig);
};

// MQTT客户端实例
export let client = null;

// 连接MQTT函数（最小改动适配Pinia）
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

    // 监听收到的消息
    client.on("message", async (topic, payload) => {
      try {
        // 将二进制payload转为JSON对象（传感器数据）
        const data = JSON.parse(payload.toString());
        console.log(`收到${topic}主题的消息：`, data);

        // 执行数据校验（核心逻辑）
        const { valid, errors } = validateSensorData(data);

        // 校验结果处理
        if (!valid) {
          // 校验失败：记录错误日志，跳过后续处理
          console.error(`【${topic}】数据校验失败：`, errors);
          alert(`【${topic}】数据校验失败：${errors.map((e) => e.message).join("；")}`);
          return; // 终止后续逻辑，避免无效数据污染
        }

        //保存到响应式变量
        receivedSensorData.value = data;

        const historyItem = {
          ...data,
          // 确保parsed_time存在，不存在则用当前时间兜底（避免报错）
          parsed_time: data.parsed_time || new Date().toLocaleString(),
        };
        sensorDataHistory.value.push(historyItem);
        if (sensorDataHistory.value.length > 521) {
          sensorDataHistory.value.shift(); // 只保留最新521条
        }

        // 浏览器本地存储对象（保存最新数据和历史记录）
        localStorage.setItem("latestSensorData", JSON.stringify(receivedSensorData.value));
        localStorage.setItem("sensorDataHistory", JSON.stringify(sensorDataHistory.value));

        // 同步到Pinia仓库（核心适配）
        const sensorStore = await import("@/stores/sensorStore").then((mod) =>
          mod.useSensorStore(),
        );
        // 兼容数组/单个对象格式
        if (Array.isArray(data)) {
          data.forEach((item) => sensorStore.addRawMqttData(item));
        } else {
          sensorStore.addRawMqttData(data);
        }
      } catch (err) {
        console.error("解析MQTT消息失败：", err);
      }
    });

    // 连接错误
    client.on("error", (err) => {
      console.error("MQTT连接失败：", err);
      isConnected.value = false;
      alert(`MQTT连接失败：${err.message}`);
      client = null;
    });

    // 连接断开
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

// 发布消息配置                   现在只是一个示例，需要根据需求修改
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
    parsed_time: "2026-03-11 10:00:00",
    is_abnormal: 0,
  },
  qos: 0,
});

// 发布消息
export const doPublish = () => {
  const { topic, qos, payload } = publish.value;

  try {
    const jsonPayload = JSON.stringify(payload);
    client.publish(topic, jsonPayload, { qos }, (error) => {
      if (error) {
        console.error("MQTT 发布失败:", error);
        return;
      }
      console.log("发布成功，原始数据：", payload);
      console.log("发布的 JSON 字符串：", jsonPayload);
    });
  } catch (err) {
    console.error("JSON 序列化失败:", err);
  }
};

// 初始化时从本地存储加载历史数据
// 异步函数
export const initSensorData = async () => {
  const latestData = localStorage.getItem("latestSensorData");
  const historyData = localStorage.getItem("sensorDataHistory");

  if (latestData) {
    receivedSensorData.value = JSON.parse(latestData);
    // 动态导入 Pinia 仓库（避免循环导入）
    const sensorStoreModule = await import("@/stores/sensorStore");
    const sensorStore = sensorStoreModule.useSensorStore();

    const parsedData = JSON.parse(latestData);
    if (Array.isArray(parsedData)) {
      parsedData.forEach((item) => sensorStore.addRawMqttData(item));
    } else {
      sensorStore.addRawMqttData(parsedData);
    }
  }

  if (historyData) {
    sensorDataHistory.value = JSON.parse(historyData);
  }
};
