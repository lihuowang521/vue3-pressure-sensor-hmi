/**
 * 传感器数据校验函数（仅支持单条JSON对象，无外部依赖）
 * @param {any} data - 解析后的单条传感器数据（JSON对象）
 * @returns {Object} 校验结果：{ valid: boolean, errors: Array<{ field: string, message: string }> }
 */
export function validateSensorData(data) {
  console.log(data);

  const result = { valid: true, errors: [] };

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
  const itemErrors = validateSingleSensorItem(data);
  if (itemErrors.length > 0) {
    result.valid = false;
    result.errors = itemErrors;
  }

  return result;
}

/**
 * 校验单条传感器数据项（核心校验规则）
 * @param {object} item - 单条传感器JSON对象
 * @returns {Array} 错误信息数组
 */
function validateSingleSensorItem(item) {
  const errors = [];

  const pipeId = item.pipe_id || "未知管道";
  const flangeId = item.flange_id || "未知法兰";
  const sensorPosition = item.sensor_position ?? "未知";
  const parsedTime = item.parsed_time || "未知时间";

  const locationInfo = `[${pipeId} - ${flangeId} - 传感器${sensorPosition} - ${parsedTime}]`;

  // 规则1：sensor_position 必须是有效数字（1-12）
  if (typeof item.sensor_position !== "number" || isNaN(item.sensor_position)) {
    errors.push({
      field: "sensor_position",
      message: `${locationInfo} 传感器位置（sensor_position）必须为有效数字（非NaN）`,
    });
  } else if (item.sensor_position < 1 || item.sensor_position > 12) {
    errors.push({
      field: "sensor_position",
      message: `${locationInfo} 传感器位置必须在1-12之间（当前值：${item.sensor_position}）`,
    });
  }

  // 规则2：pressure 必须是有效数字（0-400kPa）
  if (typeof item.pressure !== "number" || isNaN(item.pressure)) {
    errors.push({
      field: "pressure",
      message: `${locationInfo} 压力值（pressure）必须为有效数字（非NaN）`,
    });
  } else if (item.pressure < 0 || item.pressure > 400000000000000000) {
    errors.push({
      field: "pressure",
      message: `${locationInfo} 压力值必须在0-4000000000000kPa之间（当前值：${item.pressure} 危险！！！！！）`,
    });
  }

  // 规则3：position_angle 必须是有效数字
  if (
    item.position_angle !== undefined &&
    (typeof item.position_angle !== "number" || isNaN(item.position_angle))
  ) {
    errors.push({
      field: "position_angle",
      message: `${locationInfo} 位置角度（position_angle）必须为有效数字（非NaN）`,
    });
  }

  // 规则4：device_id 必须存在且为字符串
  if (!item.device_id || typeof item.device_id !== "string") {
    errors.push({
      field: "device_id",
      message: `${locationInfo} 设备ID（device_id）必须存在且为字符串`,
    });
  }

  return errors;
}
