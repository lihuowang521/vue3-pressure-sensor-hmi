const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// MQTT客户端配置（连接到内网MQTT服务器）
const mqttClient = mqtt.connect("mqtt://192.168.1.200:1883", {
  clientId: "mqtt-proxy",
  clean: true,
});

// 存储WebSocket连接
const clients = new Set();

// MQTT连接成功
mqttClient.on("connect", () => {
  console.log("MQTT连接成功");
  // 订阅MQTT主题
  mqttClient.subscribe("gateway/uplink/data");
});

// 收到MQTT消息
mqttClient.on("message", (topic, message) => {
  // 转发消息给所有WebSocket客户端
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message.toString());
    }
  });
});

// 处理WebSocket连接
wss.on("connection", (ws) => {
  console.log("WebSocket客户端连接");
  clients.add(ws);

  // 发送连接成功消息
  ws.send(JSON.stringify({ type: "connected", message: "已连接到MQTT代理服务器" }));

  // 处理WebSocket消息
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      // 发布消息到MQTT
      if (data.topic && data.payload) {
        mqttClient.publish(data.topic, JSON.stringify(data.payload));
      }
    } catch (error) {
      console.error("处理WebSocket消息错误:", error);
    }
  });

  // 处理WebSocket断开
  ws.on("close", () => {
    console.log("WebSocket客户端断开");
    clients.delete(ws);
  });
});

// 启动服务器
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`MQTT代理服务器运行在 http://localhost:${PORT}`);
});
