#include <WiFi.h> 
#include <PubSubClient.h> 

#define MQTT_MAX_PACKET_SIZE 1024 

#include <NTPClient.h> 
#include <WiFiUdp.h> 
#include <WiFiClientSecure.h> 
#include <time.h> 
#include <OneWire.h> 
#include <DallasTemperature.h> 

const char* wifiSSID = "chen"; 
const char* wifiPwd  = "123456789"; 

const char* mqttBroker = "va1af2fe.ala.cn-hangzhou.emqxsl.cn"; 
const uint16_t mqttPort = 8883; 
const char* mqttTopic = "sensor/data"; 
const char* mqttClientID = "ESP32_FSR_CLIENT_001"; 

const char* mqttUser = "qqqqwwww"; 
const char* mqttPass = "123456"; 

const int fsrPin1 = 36; 
const int fsrPin2 = 39; 
const int fsrPin3 = 32; 
const int tempPin = 4; 

OneWire oneWire(tempPin); 
DallasTemperature sensors(&oneWire); 

WiFiUDP ntpUDP; 
NTPClient timeClient(ntpUDP, "ntp.ntsc.ac.cn", 8 * 3600); 
WiFiClientSecure espClient; 
PubSubClient mqttClient(espClient); 

void setup() { 
  Serial.begin(115200); 

  analogSetAttenuation(ADC_0db); 
  analogSetWidth(12); 

  // 1. 连接 WiFi
  WiFi.begin(wifiSSID, wifiPwd); 
  while (WiFi.status() != WL_CONNECTED) { 
    delay(500); 
    Serial.print("."); 
  } 
  Serial.println("\nWiFi 连接成功"); 

  // 2. TLS 配置
  espClient.setInsecure(); 

  // 3. 等待 NTP 同步完成（关键修复！）
  Serial.println("正在同步NTP时间..."); 
  timeClient.begin(); 
  int ntpAttempts = 0; 
  const int maxNtpAttempts = 30; // 最多等待15秒
  
  while (!timeClient.update() && ntpAttempts < maxNtpAttempts) { 
    delay(500); 
    ntpAttempts++; 
    Serial.printf("NTP同步中 (%d/%d)...\n", ntpAttempts, maxNtpAttempts); 
  } 
  
  if (ntpAttempts >= maxNtpAttempts) { 
    Serial.println("警告: NTP同步超时，继续启动但时间可能不准确"); 
  } else { 
    Serial.printf("NTP同步成功: %s\n", timeClient.getFormattedTime().c_str()); 
  } 

  // 4. 初始化传感器和MQTT
  sensors.begin(); 
  mqttClient.setServer(mqttBroker, mqttPort); 
  // 当 JSON 长度超过默认 128 字节时， mqttClient.publish() 会静默失败，所以需要下面的设置
  mqttClient.setBufferSize(1024);

  Serial.println("系统初始化完成"); 
} 

void loop() { 
  if (!mqttClient.connected()) reconnectMQTT(); 
  mqttClient.loop(); 

  // 更新时间（持续同步）
  timeClient.update(); 

  // 检查时间是否有效
  unsigned long epoch = timeClient.getEpochTime(); 
  if (epoch < 1000000000) { // 小于2001年的时间视为无效
    Serial.println("警告: 时间尚未同步"); 
    delay(1000); 
    return; 
  } 

  struct tm* timeinfo = localtime((time_t*)&epoch); 
  char parsed_time[30]; 
  strftime(parsed_time, sizeof(parsed_time), "%Y-%m-%d %H:%M:%S", timeinfo); 

  int raw1 = analogRead(fsrPin1); 
  int raw2 = analogRead(fsrPin2); 
  int raw3 = analogRead(fsrPin3); 

  auto calcPressure = [](int raw) { 
    if (raw < 40)      return 0.0f; 
    if (raw > 2800)    return 5000.0f; 
    float value = (float)(raw - 40) / (2800 - 40) * 5000.0f; 
    if (value < 300) { 
      return 0.0f; 
    } 
    return constrain(value, 0.0f, 5000.0f); 
  }; 

  float p1 = calcPressure(raw1); 
  float p2 = calcPressure(raw2); 
  float p3 = calcPressure(raw3); 

  sensors.requestTemperatures(); 
  float temp = sensors.getTempCByIndex(0); 

  String json = "{"; 
  json += "\"pipe_id\":\"P001\","; 
  json += "\"flange_id\":\"F01\","; 
  json += "\"pressure1\":" + String(p1, 1) + ","; 
  json += "\"pressure2\":" + String(p2, 1) + ","; 
  json += "\"pressure3\":" + String(p3, 1) + ","; 
  json += "\"pressure4\":" + String(p3, 1) + ","; 
  json += "\"pressure5\":" + String(p3, 1) + ","; 
  json += "\"pressure6\":" + String(p3, 1) + ","; 
  json += "\"pressure7\":" + String(p3, 1) + ","; 
  json += "\"pressure8\":" + String(p3, 1) + ","; 
  json += "\"pressure9\":" + String(p3, 1) + ","; 
  json += "\"pressure10\":" + String(p3, 1) + ","; 
  json += "\"pressure11\":" + String(p3, 1) + ","; 
  json += "\"pressure12\":" + String(p3, 1) + ","; 
  json += "\"temperature\":" + String(temp, 1) + ","; 
  json += "\"parsed_time\":\"" + String(parsed_time) + "\","; 
  json += "\"rssi\":" + String(WiFi.RSSI()) + ","; 
  json += "\"battery_voltage\":3.2"; 
  json += "}"; 

  Serial.println(json); 
  mqttClient.publish(mqttTopic, json.c_str()); 

  delay(2000); 
} 

void reconnectMQTT() { 
  while (!mqttClient.connected()) { 
    Serial.print("尝试连接MQTT..."); 
    if (mqttClient.connect(mqttClientID, mqttUser, mqttPass)) { 
      Serial.println("成功"); 
    } else { 
      Serial.printf("失败, rc=%d, 2秒后重试\n", mqttClient.state()); 
      delay(1000); 
    } 
  } 
}