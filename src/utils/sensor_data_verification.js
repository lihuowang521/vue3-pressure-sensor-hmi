/**
 * 获取配置的报警阈值（从localStorage读取，有默认值）
 * @returns {Object} 包含lowerThreshold和upperThreshold的对象
 */
export function getAlarmThresholds() {
  try {
    const savedSettings = localStorage.getItem("sensorSettings");
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      return {
        lowerThreshold: parseFloat(settings.settings?.lowerThreshold) || 0,
        upperThreshold: parseFloat(settings.settings?.upperThreshold) || 5000,
      };
    }
  } catch (e) {
    console.error("读取报警阈值失败：", e);
  }
  // 默认值
  return {
    lowerThreshold: 0,
    upperThreshold: 5000,
  };
}

/**
 * 传感器数据校验函数（支持动态报警阈值）
 * @param {any} data - 解析后的单条传感器数据（JSON对象）
 * @param {Object} thresholds - 可选的阈值配置，不传则从localStorage读取
 * @returns {Object} 校验结果：{ valid: boolean, errors: Array<{ field: string, message: string }> }
 */
export function validateSensorData(data, thresholds = null) {
  const result = { valid: true, errors: [] };

  // 使用传入的阈值或从配置读取
  const { lowerThreshold, upperThreshold } = thresholds || getAlarmThresholds();

  // 第一步：判断数据类型（仅支持非空普通对象）
  if (!(typeof data === "object" && data !== null && !Array.isArray(data))) {
    // 数据不是有效对象 → 直接校验失败
    result.valid = false;
    result.errors.push({
      field: "root",
      message: `数据格式错误，必须是单条JSON对象（当前类型：${typeof data}）`,
    });
    return result;
  }

  // 第二步：校验单条数据的核心字段
  const itemErrors = validateSingleSensorItem(data, { lowerThreshold, upperThreshold });
  if (itemErrors.length > 0) {
    result.valid = false;
    result.errors = itemErrors;
  }

  return result;
}

/**
 * 校验单条传感器数据项（核心校验规则，支持动态阈值）
 * @param {object} item - 单条传感器JSON对象
 * @param {Object} thresholds - 阈值配置 { lowerThreshold, upperThreshold }
 * @returns {Array} 错误信息数组
 */
function validateSingleSensorItem(item, thresholds) {
  const errors = [];

  const pipeId = item.pipe_id || "未知管道";
  const flangeId = item.flange_id || "未知法兰";
  const parsedTime = item.parsed_time || "未知时间";

  const locationInfo = `[${pipeId} - ${flangeId} - ${parsedTime}]`;

  // 获取阈值，确保有效
  const lowerThreshold =
    typeof thresholds?.lowerThreshold === "number" && !isNaN(thresholds.lowerThreshold)
      ? thresholds.lowerThreshold
      : 0;
  const upperThreshold =
    typeof thresholds?.upperThreshold === "number" && !isNaN(thresholds.upperThreshold)
      ? thresholds.upperThreshold
      : 5000;

  // 规则1：检查至少有一个pressure字段
  let hasPressureField = false;
  for (let i = 1; i <= 12; i++) {
    if (typeof item[`pressure${i}`] === "number" && !isNaN(item[`pressure${i}`])) {
      hasPressureField = true;
      break;
    }
  }

  if (!hasPressureField) {
    errors.push({
      field: "pressure",
      message: `${locationInfo} 至少需要一个有效的压力值字段（pressure1-pressure12）`,
    });
  }

  // 规则2：校验所有pressure字段（如果存在）
  for (let i = 1; i <= 12; i++) {
    const pressureField = `pressure${i}`;
    if (item[pressureField] !== undefined) {
      if (typeof item[pressureField] !== "number" || isNaN(item[pressureField])) {
        errors.push({
          field: pressureField,
          message: `${locationInfo} ${pressureField} 必须为有效数字（非NaN）`,
        });
      } else if (item[pressureField] < lowerThreshold || item[pressureField] > upperThreshold) {
        errors.push({
          field: pressureField,
          message: `${locationInfo} ${pressureField} 必须在${lowerThreshold}-${upperThreshold}g之间（当前值：${item[pressureField]}）`,
        });
      }
    }
  }

  return errors;
}
