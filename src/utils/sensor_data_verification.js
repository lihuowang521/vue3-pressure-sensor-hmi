/**
 * 传感器数据校验函数（仅支持单条JSON对象，无外部依赖）
 * @param {any} data - 解析后的单条传感器数据（JSON对象）
 * @returns {Object} 校验结果：{ valid: boolean, errors: Array<{ field: string, message: string }> }
 */
export function validateSensorData(data) {
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
  const parsedTime = item.parsed_time || "未知时间";

  const locationInfo = `[${pipeId} - ${flangeId} - ${parsedTime}]`;

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
      } else if (item[pressureField] < 0 || item[pressureField] > 5000) {
        errors.push({
          field: pressureField,
          message: `${locationInfo} ${pressureField} 必须在0-5000g之间（当前值：${item[pressureField]}）`,
        });
      }
    }
  }

  return errors;
}
