# vue3-sensor 项目:智能压力传感器人机交互界面设计（毕业设计）

small分支由于项目后端学长去搞别的项目去了，暂时停滞。main分支重启，自己处理单片机相关内容

项目已打包成app形式，android文件夹下可以下载
页面已部署到https://lihuowang521.github.io/vue3-pressure-sensor-page/

## 项目简介

本项目是一个基于Vue 3开发的智能压力传感器人机交互界面，主要用于实时监控和管理管道法兰上的压力传感器数据。系统支持实时数据展示、历史数据查询、数据可视化和导出等功能，为工业环境中的压力监测提供直观、高效的解决方案。
<img width="2549" height="1403" alt="image" src="https://github.com/user-attachments/assets/908be522-8614-4e22-85a7-22a9d825c96c" />


## 功能特性

### 📊 实时监控

- 12个传感器的圆形布局展示
- 实时压力数据更新（每秒）
- 管道/法兰选择器
- 系统参数显示

<img width="2549" height="1403" alt="image" src="https://github.com/user-attachments/assets/55d4ebb4-3985-44dc-985b-2a150bf77c64" />


### 📈 数据可视化

- 压力趋势图表（最近1小时数据）
- 支持传感器切换
- 动态Y轴范围调整
- 交互式 tooltip 提示

### 📋 历史数据

<img width="2549" height="1403" alt="image" src="https://github.com/user-attachments/assets/b67fa6d3-16d3-4712-a2e1-d74a6c28a4b1" />

- 按时间范围查询历史数据
- 支持管道/法兰/传感器筛选
- 数据表格展示

### 💾 数据导出

<img width="2549" height="1403" alt="image" src="https://github.com/user-attachments/assets/3c24eb30-c175-41fc-a4c0-ce74a58593cb" />


- CSV格式导出数据
- 支持按条件导出
- 自动生成时间戳文件名

### ⚙️ 系统设置

- MQTT连接配置
- 主题订阅管理
- 连接状态监控
- 手动发布测试消息
<img width="2549" height="1403" alt="image" src="https://github.com/user-attachments/assets/88d52620-23cb-46c8-800c-6c9f55ba5530" />


### 🔒 数据校验

- 输入数据合法性验证
- 错误提示和处理
- 数据去重和格式统一

## 技术栈

- **前端框架**：Vue 3 + Composition API
- **状态管理**：Pinia + 持久化插件
- **路由管理**：Vue Router
- **实时通信**：MQTT
- **数据可视化**：ECharts
- **构建工具**：Vite
- **代码规范**：ESLint

## 项目结构

```
src/
├── assets/          # 静态资源
├── components/      # 公共组件
│   ├── ControlPanel.vue
│   ├── HomeHeader.vue
│   └── HomePage.vue
├── views/           # 页面视图
│   ├── MonitoringInterface.vue   # 实时监控界面
│   ├── Setting.vue               # 系统设置
│   ├── History.vue               # 历史数据
│   └── ExportData.vue            # 数据导出
├── router/          # 路由配置
│   └── index.js
├── stores/          # 状态管理
│   └── sensorStore.js
├── utils/           # 工具函数
│   ├── mqtt.js                   # MQTT通信
│   └── sensor_data_verification.js  # 数据校验
├── App.vue          # 根组件
└── main.js          # 入口文件
```

## 快速开始

### 环境要求

- Node.js 16.0+
- pnpm 6.0+

### 安装依赖

```bash
pnpm install
```

### 开发模式运行

```bash
pnpm run dev
```

### 生产构建

```bash
pnpm run build
```

### 代码检查

```bash
pnpm run lint
```

## 使用说明

### 1. 实时监控界面

1. 在管道/法兰选择器中选择要监控的管道和法兰
2. 系统会自动加载并实时更新12个传感器的压力数据
3. 右侧图表会显示所选传感器的压力趋势
4. 底部显示系统参数和报警状态

### 2. 历史数据查询

1. 选择管道、法兰和传感器
2. 设置时间范围
3. 点击查询按钮查看历史数据
4. 数据会以表格形式展示

### 3. 数据导出

1. 选择导出条件（管道、法兰、时间范围）
2. 点击导出按钮
3. 系统会生成CSV文件并自动下载

### 4. 系统设置

1. 配置MQTT连接参数（服务器地址、端口、主题等）
2. 点击连接按钮建立MQTT连接
3. 可以手动发布测试消息验证连接状态

## 数据格式

### MQTT消息格式

```json
{
  "pipe_id": "P001", // 管道ID
  "flange_id": "F01", // 法兰ID
  "sensor_position": 1, // 传感器位置（1-12）
  "position_angle": 0.0, // 位置角度
  "pressure": 1.0, // 压力值（kPa）
  "raw_pressure": 1.0, // 原始压力值
  "battery_voltage": 3.5, // 电池电压
  "signal_strength": -70, // 信号强度
  "parsed_time": "2024-01-01 12:00:00", // 解析时间
  "is_abnormal": 0 // 是否异常（0-正常，1-异常）
}
```

## 浏览器兼容性

- Chrome 90+
- Edge 90+
- Firefox 88+
- Safari 14+

## 响应式设计

- 桌面端：左右布局，同时显示监控面板和趋势图表
- 平板端：自动调整为上下布局
- 移动端：优化布局，确保在小屏幕上正常显示

## 项目特点

1. **现代化技术栈**：使用Vue 3、Pinia等最新前端技术
2. **实时数据处理**：通过MQTT实现实时数据传输和处理
3. **直观的数据可视化**：使用ECharts创建交互式图表
4. **完善的错误处理**：提供友好的错误提示和异常处理
5. **响应式设计**：适配不同设备屏幕
6. **数据持久化**：使用本地存储和Pinia持久化确保数据不丢失

## 功能预留说明

本项目原计划实现用户在前端界面进行传感器参数修改功能，并已在前端界面预留了修改后端参数的接口及相关路由UI组件。但由于项目导师的研究生未在后端完成传感器参数接收功能的开发实现，因此该功能目前无法完整运行。现阶段仅保留了前端相关的路由UI界面作为功能预留，待后端接口完善后可进行功能整合。

## 注意事项

1. MQTT服务器地址需要根据实际环境进行配置
2. 确保网络连接正常，以便接收实时数据
3. 首次使用时，可能需要等待一段时间来积累历史数据
4. 数据导出功能需要浏览器支持文件下载

## 许可证

本项目为毕业设计作品，仅供学习和参考使用。

## 联系方式
2134562675@qq.com
如有问题或建议，请联系项目作者。

---

_项目版本：1.0.0_
_最后更新：2026-03-24_
