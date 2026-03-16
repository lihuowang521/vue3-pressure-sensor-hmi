/**
 * 传感器数据校验函数（内嵌轻量版，无外部依赖）
 * @param {any} data - 解析后的传感器数据（可能是单条/数组）
 * @returns {Object} 校验结果：{ valid: boolean, errors: Array<{ field: string, message: string }> }
 */
export function validateSensorData(data) {
  const result = { valid: true, errors: [] };

  // 第一步：判断数据类型（支持单条对象 / 数组）
  if (Array.isArray(data)) {
    // 场景1：数据是数组（批量传感器数据）
    data.forEach((item, index) => {
      const itemErrors = validateSingleSensorItem(item, index);
      if (itemErrors.length > 0) {
        result.valid = false;
        result.errors.push(...itemErrors);
      }
    });
  } else if (typeof data === "object" && data !== null) {
    // 场景2：数据是单条对象（单个传感器数据）
    const itemErrors = validateSingleSensorItem(data);
    if (itemErrors.length > 0) {
      result.valid = false;
      result.errors = itemErrors;
    }
  } else {
    // 场景3：数据既不是对象也不是数组 → 直接校验失败
    result.valid = false;
    result.errors.push({
      field: "root",
      message: `数据格式错误，必须是对象/数组（当前类型：${typeof data}）`,
    });
  }

  return result;
}

/**
 * 校验单条传感器数据项（核心校验规则）
 * @param {any} item - 单条传感器数据
 * @param {number} [index] - 数组场景下的索引（用于定位错误项）
 * @returns {Array} 错误信息数组
 */
function validateSingleSensorItem(item, index) {
  const errors = [];
  const prefix = index !== undefined ? `第${index + 1}条数据` : "单条数据";

  // 规则1：必须是非空普通对象（排除 null/数组）
  if (!(typeof item === "object" && item !== null && !Array.isArray(item))) {
    errors.push({
      field: `${prefix}-root`,
      message: `${prefix}必须为非空普通对象`,
    });
    return errors; // 基础结构错误，无需继续校验字段
  }

  // 规则2：sensor_position 必须是有效数字（1-12，可自定义范围）
  if (typeof item.sensor_position !== "number" || isNaN(item.sensor_position)) {
    errors.push({
      field: `${prefix}-sensor_position`,
      message: `${prefix}的传感器位置（sensor_position）必须为有效数字`,
    });
  } else if (item.sensor_position < 1 || item.sensor_position > 12) {
    errors.push({
      field: `${prefix}-sensor_position`,
      message: `${prefix}的传感器位置必须在1-12之间（当前值：${item.sensor_position}）`,
    });
  }

  // 规则3：pressure 必须是有效数字（0-200kPa，可自定义范围）
  if (typeof item.pressure !== "number" || isNaN(item.pressure)) {
    errors.push({
      field: `${prefix}-pressure`,
      message: `${prefix}的压力值（pressure）必须为有效数字（非NaN）`,
    });
  } else if (item.pressure < 0 || item.pressure > 200) {
    errors.push({
      field: `${prefix}-pressure`,
      message: `${prefix}的压力值必须在0-200kPa之间（当前值：${item.pressure}）`,
    });
  }
  return errors;
}
