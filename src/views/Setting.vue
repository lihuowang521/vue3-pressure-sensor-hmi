<script setup>
import { ref, onMounted, onUnmounted, defineOptions } from "vue";
import { useRouter } from "vue-router";

defineOptions({
  name: "SettingPage",
});

const router = useRouter();
// 抽离默认配置常量（避免重复）
const DEFAULT_SETTINGS = {
  samplingRate: "100",
  lowerThreshold: "50",
  upperThreshold: "5000",
  baudRate: "115200",
  dataBits: "8",
  stopBits: "1",
  parity: "none",
  protocolAddress: "ws://127.0.0.1:8083/mqtt",
  zeroCalibration: "0.0",
  fullScaleCalibration: "5000.0",
};

// 响应式设置数据
const settings = ref({ ...DEFAULT_SETTINGS });
// 按钮加载状态
const buttonLoading = ref({
  save: false,
  reset: false,
});
// 状态消息
const statusMessage = ref({
  show: false,
  message: "",
  type: "", // 'success' or 'error'
});
// 定时器实例（用于清理）
let messageTimer = null;

// 数据校验函数
const validateSettings = () => {
  const lower = Number(settings.value.lowerThreshold);
  const upper = Number(settings.value.upperThreshold);
  const fullScale = Number(settings.value.fullScaleCalibration);
  // const samplingRate = Number(settings.value.samplingRate);

  // 校验阈值逻辑
  if (lower >= upper) {
    showStatusMessage("报警下限不能大于等于上限！", "error");
    return false;
  }
  // 校验数值范围
  if (lower < 0 || lower > 5000 || upper < 0 || upper > 5000) {
    showStatusMessage("报警阈值需在0-5000 g之间！", "error");
    return false;
  }
  // 校验采样频率
  const validRates = ["10", "50", "100", "500", "1000"];
  if (!validRates.includes(settings.value.samplingRate)) {
    showStatusMessage("采样频率只能选择10/50/100/500/1000 Hz！", "error");
    return false;
  }
  // 校验MQTT地址格式
  if (!/^ws(s)?:\/\/.+:\d+\/mqtt$/.test(settings.value.protocolAddress)) {
    showStatusMessage("MQTT地址格式错误（例：ws://127.0.0.1:8083/mqtt）！", "error");
    return false;
  }
  // 校验满量程值
  if (fullScale <= 0 || fullScale > 5000) {
    showStatusMessage("满量程校准值需在0-5000 g之间！", "error");
    return false;
  }
  return true;
};

// 保存配置（加校验+加载状态）
const saveSettings = async () => {
  if (buttonLoading.value.save) return;
  // 先校验
  if (!validateSettings()) return;

  buttonLoading.value.save = true;
  try {
    // 模拟异步保存（贴近真实接口场景）
    await new Promise((resolve) => setTimeout(resolve, 500));
    // 本地存储加版本标识
    const saveData = {
      version: "1.0", // 版本管理，后续变更可兼容
      settings: settings.value,
    };
    localStorage.setItem("sensorSettings", JSON.stringify(saveData));
    showStatusMessage("配置保存成功！", "success");
  } catch (error) {
    showStatusMessage("保存配置失败：" + error.message, "error");
  } finally {
    buttonLoading.value.save = false;
  }
};

// 恢复默认配置（加加载状态）
const resetToDefault = async () => {
  if (buttonLoading.value.reset) return;
  buttonLoading.value.reset = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    settings.value = { ...DEFAULT_SETTINGS };
    showStatusMessage("已恢复默认配置！", "success");
  } catch (error) {
    showStatusMessage("恢复默认失败：" + error.message, "error");
  } finally {
    buttonLoading.value.reset = false;
  }
};

// 显示状态消息（清理旧定时器）
const showStatusMessage = (message, type) => {
  // 清除旧定时器，避免多个提示叠加
  if (messageTimer) clearTimeout(messageTimer);

  statusMessage.value = {
    show: true,
    message,
    type,
  };
  // 3秒后自动隐藏
  messageTimer = setTimeout(() => {
    statusMessage.value.show = false;
  }, 3000);
};

// 返回首页
const goBack = () => {
  router.push("/");
};

// 页面加载时读取配置（兼容版本）
onMounted(() => {
  try {
    const savedData = localStorage.getItem("sensorSettings");
    if (savedData) {
      const { version, settings: savedSettings } = JSON.parse(savedData);
      // 兼容旧版本（无version字段）
      if (version === "1.0" || !version) {
        settings.value = { ...DEFAULT_SETTINGS, ...savedSettings }; // 合并默认值，避免字段缺失
      }
    }
  } catch (error) {
    console.error("读取配置失败：", error);
    showStatusMessage("读取配置失败，使用默认值！", "error");
  }
});

// 组件卸载时清理定时器
onUnmounted(() => {
  if (messageTimer) clearTimeout(messageTimer);
});
</script>

<template>
  <main class="main-content">
    <!-- 状态提示：增加过渡动画 -->
    <div
      class="status-message"
      :class="[statusMessage.type, { show: statusMessage.show }]"
      transition="fade"
    >
      {{ statusMessage.message }}
    </div>

    <form class="settings-form">
      <div class="setting-section">
        <h2 class="section-title">
          <span class="section-icon">📊</span>
          采样配置
        </h2>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">采样频率</label>
            <select class="form-select" v-model="settings.samplingRate">
              <option value="10">10 Hz</option>
              <option value="50">50 Hz</option>
              <option value="100">100 Hz</option>
              <option value="500">500 Hz</option>
              <option value="1000">1000 Hz</option>
            </select>
            <div class="form-help">传感器数据采集频率</div>
          </div>
        </div>
      </div>

      <div class="setting-section">
        <h2 class="section-title">
          <span class="section-icon">⚠️</span>
          报警阈值
        </h2>
        <div class="threshold-group">
          <div class="form-group">
            <label class="form-label">报警下限 (g)</label>
            <input
              type="number"
              class="form-input"
              v-model="settings.lowerThreshold"
              min="0"
              max="5000"
              step="0.1"
            />
            <div class="form-help">低于此值将触发下限报警</div>
          </div>
          <div class="form-group">
            <label class="form-label">报警上限 (g)</label>
            <input
              type="number"
              class="form-input"
              v-model="settings.upperThreshold"
              min="0"
              max="5000"
              step="0.1"
            />
            <div class="form-help">高于此值将触发上限报警</div>
          </div>
        </div>
      </div>

      <div class="setting-section">
        <h2 class="section-title">
          <span class="section-icon">🔌</span>
          串口通信配置
        </h2>
        <div class="serial-config">
          <div class="form-group">
            <label class="form-label">波特率</label>
            <select class="form-select" v-model="settings.baudRate">
              <option value="9600">9600</option>
              <option value="19200">19200</option>
              <option value="38400">38400</option>
              <option value="57600">57600</option>
              <option value="115200">115200</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">数据位</label>
            <select class="form-select" v-model="settings.dataBits">
              <option value="7">7位</option>
              <option value="8">8位</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">停止位</label>
            <select class="form-select" v-model="settings.stopBits">
              <option value="1">1位</option>
              <option value="2">2位</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">校验位</label>
            <select class="form-select" v-model="settings.parity">
              <option value="none">无</option>
              <option value="even">偶校验</option>
              <option value="odd">奇校验</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">通信协议地址</label>
            <input
              type="text"
              class="form-input"
              v-model="settings.protocolAddress"
              placeholder="例如: ws://127.0.0.1:8083/mqtt"
            />
            <div class="form-help">MQTT 服务器连接地址</div>
          </div>
        </div>
      </div>

      <div class="setting-section">
        <h2 class="section-title">
          <span class="section-icon">📡</span>
          传感器校准
        </h2>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">零点校准值 (kPa)</label>
            <!-- 只读输入框增加样式区分 -->
            <input
              type="number"
              class="form-input form-input--readonly"
              v-model="settings.zeroCalibration"
              step="0.1"
              readonly
            />
            <div class="form-help">当前零点偏移值（不可修改）</div>
          </div>
          <div class="form-group">
            <label class="form-label">满量程校准值 (g)</label>
            <input
              type="number"
              class="form-input"
              v-model="settings.fullScaleCalibration"
              step="0.1"
              min="0"
              max="5000"
            />
            <div class="form-help">传感器满量程值</div>
          </div>
        </div>
      </div>
    </form>

    <div class="button-group">
      <button
        type="button"
        class="btn btn-success"
        @click="saveSettings()"
        :disabled="buttonLoading.save"
      >
        {{ buttonLoading.save ? "💾 保存中..." : "💾 保存配置" }}
      </button>
      <button
        type="button"
        class="btn btn-danger"
        @click="resetToDefault()"
        :disabled="buttonLoading.reset"
      >
        {{ buttonLoading.reset ? "🔄 恢复中..." : "🔄 恢复默认" }}
      </button>
      <button type="button" class="btn btn-secondary" @click="goBack()">↩️ 返回首页</button>
    </div>
  </main>
</template>

<style scoped>
/* 新增过渡动画 */
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.main-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.settings-form {
  display: grid;
  gap: 30px;
}

.setting-section {
  border: 1px solid #e9ecef;
  border-radius: 12px;
  padding: 25px;
  background: #f8f9fa;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 0; /* 重置默认margin */
}

.section-icon {
  width: 24px;
  height: 24px;
  background: linear-gradient(45deg, #667eea, #764ba2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #495057;
}

.form-input,
.form-select {
  padding: 12px 15px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.3s ease;
  background: white;
}

/* 只读输入框样式区分 */
.form-input--readonly {
  background: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
  border-color: #dee2e6;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1); /* 缩小阴影，更精致 */
}

.form-input.error {
  border-color: #dc3545;
}

.form-help {
  font-size: 12px;
  color: #6c757d;
}

.threshold-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.serial-config {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.button-group {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e9ecef;
  flex-wrap: wrap; /* 适配小屏幕换行 */
}

.btn {
  padding: 12px 30px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 120px;
}

.btn-primary {
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); /* 减轻阴影，更协调 */
}

.btn:active {
  transform: translateY(0);
  box-shadow: none;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.status-message {
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  opacity: 0;
  transform: translateY(10px);
  text-align: center;
  transition: all 0.3s ease;
}

.status-message.success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.status-message.error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.status-message.show {
  opacity: 1;
  transform: translateY(0);
}

/* 响应式优化：移除无效的container/header样式，优化布局 */
@media (max-width: 768px) {
  .main-content {
    padding: 20px;
  }

  .form-grid,
  .serial-config {
    grid-template-columns: 1fr;
  }

  .threshold-group {
    grid-template-columns: 1fr;
  }

  .button-group {
    gap: 10px;
  }

  .btn {
    min-width: unset;
    width: 100%;
  }
}

@media (max-width: 480px) {
  .main-content {
    padding: 15px;
  }

  .setting-section {
    padding: 20px 15px;
  }
}
</style>
