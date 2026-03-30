import time
import sqlite3
import serial
import json
import base64
import paho.mqtt.client as mqtt
from datetime import datetime, date
from typing import Dict, List, Optional, Any, Tuple
from threading import Thread
from contextlib import contextmanager


class LoraPressureProcessor:
    """Lora压力传感器数据处理框架（修复数据重复+异常值版本）"""

    def __init__(self,
                 # 数据库配置
                 db_name: str = "pressure_data.db",
                 # 串口配置
                 serial_port: str = "COM4",
                 baudrate: int = 9600,
                 serial_data_bits: int = 8,
                 serial_parity=serial.PARITY_NONE,
                 serial_stop_bits=serial.STOPBITS_ONE,
                 # MQTT配置
                 mqtt_enable: bool = True,
                 mqtt_broker: str = "192.168.1.200",
                 mqtt_port: int = 1883,
                 mqtt_topic: str = "gateway/uplink/data",
                 mqtt_username: Optional[str] = None,
                 mqtt_password: Optional[str] = None,
                 # 传感器配置
                 sensor_count: int = 12,
                 # 算法参数配置
                 algorithm_params_path: str = "algorithm_params.json"):

        # 基础属性初始化
        self.db_name = db_name
        self.sensor_count = sensor_count
        self.algorithm_params = self._load_algorithm_params(algorithm_params_path)
        self.last_pressure: Dict[str, Any] = {}
        self._init_database()
        # 新增：启动时清理历史数据（仅保留当天数据）
        self._clean_old_data()

        # 串口模式初始化
        self.serial_port = serial_port
        self.baudrate = baudrate
        self.serial_data_bits = serial_data_bits
        self.serial_parity = serial_parity
        self.serial_stop_bits = serial_stop_bits

        # MQTT模式初始化
        self.mqtt_enable = mqtt_enable
        self.mqtt_broker = mqtt_broker
        self.mqtt_port = mqtt_port
        self.mqtt_topic = mqtt_topic
        self.mqtt_username = mqtt_username
        self.mqtt_password = mqtt_password
        self.mqtt_client: Optional[mqtt.Client] = None

        if self.mqtt_enable:
            self.mqtt_client = self._init_mqtt_client()
            print(f"[MQTT初始化] 已连接UG65网关（IP：{self.mqtt_broker}，主题：{self.mqtt_topic}）")
        else:
            print(f"[串口模式] 已初始化UG65 Type-C串口（端口：{self.serial_port}，波特率：{self.baudrate}）")

    @contextmanager
    def _db_connection(self):
        """数据库连接上下文管理，避免连接泄露"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_name)
            yield conn
        except Exception as e:
            print(f"[数据库连接错误] {str(e)}")
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()

    def _init_database(self) -> None:
        """初始化数据库表结构"""
        with self._db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute('''
            CREATE TABLE IF NOT EXISTS raw_pressure_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                sensor_position INTEGER NOT NULL,
                raw_data BLOB NOT NULL,
                receive_time DATETIME NOT NULL,
                signal_strength REAL,
                rssi INTEGER
            )
            ''')

            cursor.execute('''
            CREATE TABLE IF NOT EXISTS parsed_pressure_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                raw_data_id INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                sensor_position INTEGER NOT NULL,
                position_angle INTEGER NOT NULL,
                parsed_time DATETIME NOT NULL,
                data_type TEXT,
                pressure REAL,
                raw_pressure REAL,
                pressure_unit TEXT,
                battery_voltage REAL,
                signal_strength INTEGER,
                is_abnormal INTEGER,
                FOREIGN KEY (raw_data_id) REFERENCES raw_pressure_data(id)
            )
            ''')

            conn.commit()

    def _clean_old_data(self) -> None:
        """新增：清理非当天的历史数据，避免表格数据重复/异常"""
        try:
            with self._db_connection() as conn:
                cursor = conn.cursor()
                today = date.today().strftime("%Y-%m-%d")
                # 删除非当天的解析数据
                cursor.execute('''
                DELETE FROM parsed_pressure_data WHERE DATE(parsed_time) != ?
                ''', (today,))
                # 删除非当天的原始数据
                cursor.execute('''
                DELETE FROM raw_pressure_data WHERE DATE(receive_time) != ?
                ''', (today,))
                conn.commit()
                print(f"[数据清理] 已删除非{today}的历史数据")
        except Exception as e:
            print(f"[数据清理错误] {str(e)}")

    def _load_algorithm_params(self, path: str) -> Dict[str, Any]:
        """加载传感器算法参数"""
        try:
            with open(path, "r", encoding='utf-8') as f:
                params = json.load(f)
                if "default" not in params:
                    params["default"] = {"k": 1.0, "b": 0.0, "filter_alpha": 0.5, "max_deviation": 5.0}
                return params
        except Exception as e:
            print(f"[算法参数] 未加载参数文件，使用默认值: {str(e)}")
            return {"default": {"k": 1.0, "b": 0.0, "filter_alpha": 0.5, "max_deviation": 5.0}}

    def _safe_base64_decode(self, base64_str: str) -> bytes:
        """安全的Base64解码"""
        if not base64_str:
            return b''

        try:
            base64_str = base64_str.strip().replace(' ', '').replace('\n', '')
            return base64.b64decode(base64_str, validate=True)
        except base64.binascii.Error as e:
            print(f"[Base64解码错误] 无效的Base64字符串: {str(e)}")
            return b''
        except Exception as e:
            print(f"[Base64解码异常] {str(e)}")
            return b''

    def _extract_sensor_data_safely(self, base64_str: str) -> List[Dict[str, Any]]:
        """【修复版】提取单片机子帧数据 - 准确识别12个传感器"""
        try:
            base64_bytes = self._safe_base64_decode(base64_str)
            if not base64_bytes:
                return []

            sensor_data_list = []
            subframe_size = 40

            for i in range(0, len(base64_bytes), subframe_size):
                subframe_bytes = base64_bytes[i:i + subframe_size]
                if len(subframe_bytes) < 10:
                    continue

                # 验证单片机帧头帧尾
                if subframe_bytes[:2] != b'\xAA\x55' or subframe_bytes[-2:] != b'\x55\xAA':
                    continue

                # 【核心修复】基于子帧ID准确计算传感器位置（适配实际子帧标识0x07）
                subframe_id = subframe_bytes[2]  # 第3字节是子帧标识

                if subframe_id == 1:
                    base_position = 1  # 子帧1: 传感器1-6
                elif subframe_id == 7:  # 替换原0x02为实际的0x07
                    base_position = 7  # 子帧2: 传感器7-12
                else:
                    print(f"[未知子帧] ID: {subframe_id}，跳过")
                    continue

                # 解析子帧内6组传感器数据
                sensor_count = 0
                for sensor_idx in range(6):
                    start = 3 + sensor_idx * 6
                    end = start + 6
                    if end > len(subframe_bytes):
                        break

                    sensor_bytes = subframe_bytes[start:end]
                    if len(sensor_bytes) == 6:
                        sensor_position = base_position + sensor_idx
                        position_angle = (sensor_position - 1) * 30

                        sensor_data_list.append({
                            "sensor_position": sensor_position,
                            "position_angle": position_angle,
                            "raw_data": subframe_bytes,
                            "subframe_id": subframe_id
                        })
                        sensor_count += 1

                print(f"[数据提取] 子帧{subframe_id} -> 传感器{base_position}-{base_position + 5} (共{sensor_count}个)")

            return sensor_data_list

        except Exception as e:
            print(f"[数据提取异常] {str(e)}")
            return []

    def _validate_sensor_frame(self, data_bytes: bytes) -> bool:
        """验证单片机子帧格式"""
        if len(data_bytes) < 10:
            return False
        if data_bytes[:2] != b'\xAA\x55' or data_bytes[-2:] != b'\x55\xAA':
            return False
        return False

    def _safe_int_conversion(self, value: Any, default: int = 0) -> int:
        """安全整数转换"""
        try:
            if value is None:
                return default
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                return int(float(value))
            return default
        except (ValueError, TypeError):
            return default

    def _init_mqtt_client(self) -> mqtt.Client:
        """初始化MQTT客户端"""
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)

        if self.mqtt_username and self.mqtt_password:
            client.username_pw_set(self.mqtt_username, self.mqtt_password)
        
        # 启用TLS/SSL连接
        client.tls_set()
        client.tls_insecure_set(False)

        def on_connect(client, userdata, flags, rc, properties=None):
            if rc == 0:
                client.subscribe(self.mqtt_topic)
                print(f"[MQTT连接成功] 已订阅主题：{self.mqtt_topic}")
            else:
                error_codes = {
                    1: "协议版本错误", 2: "客户端标识无效", 3: "服务器不可用",
                    4: "用户名密码错误", 5: "未授权"
                }
                error_msg = error_codes.get(rc, f"未知错误({rc})")
                print(f"[MQTT连接失败] {error_msg}")

        def on_disconnect(client, userdata, rc):
            if rc != 0:
                print(f"[MQTT断开连接] 错误代码: {rc}，正在尝试重连...")

        def on_message(client, userdata, msg):
            try:
                mqtt_msg = json.loads(msg.payload.decode('utf-8'))

                device_id = mqtt_msg.get("deviceEUI") or mqtt_msg.get("devEUI") or mqtt_msg.get(
                    "device_id") or "ug65_unknown"
                base64_str = mqtt_msg.get("data", "")

                if not base64_str:
                    print("[MQTT消息错误] 未找到有效的data字段")
                    return

                sensor_data_list = self._extract_sensor_data_safely(base64_str)

                for sensor_data in sensor_data_list:
                    rssi_value = self._safe_int_conversion(mqtt_msg.get("rssi"), -85)

                    raw_data = {
                        "device_id": device_id,
                        "sensor_position": sensor_data["sensor_position"],
                        "position_angle": sensor_data["position_angle"],
                        "raw_data": sensor_data["raw_data"],
                        "receive_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "signal_strength": rssi_value,
                        "rssi": rssi_value
                    }
                    self._core_process_flow(raw_data)

            except json.JSONDecodeError as e:
                print(f"[MQTT消息JSON解析错误] {str(e)}")
            except Exception as e:
                print(f"[MQTT消息处理异常] {str(e)}")

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = on_message
        
        # 设置重连参数
        client.reconnect_delay_set(min_delay=1, max_delay=120)

        try:
            client.connect(self.mqtt_broker, self.mqtt_port, 60)
            return client
        except Exception as e:
            print(f"[MQTT连接异常] {str(e)}")
            raise

    def receive_data_serial(self) -> Optional[List[Dict[str, Any]]]:
        """串口接收单片机40字节子帧数据"""
        try:
            with serial.Serial(
                    port=self.serial_port,
                    baudrate=self.baudrate,
                    bytesize=self.serial_data_bits,
                    parity=self.serial_parity,
                    stopbits=self.serial_stop_bits,
                    timeout=2
            ) as ser:
                # 读取单片机40字节子帧
                subframe_size = 40
                raw_data = ser.read(subframe_size)
                if not raw_data:
                    return None

                # 验证单片机帧头帧尾
                if raw_data[:2] != b'\xAA\x55' or raw_data[-2:] != b'\x55\xAA':
                    print("[串口数据] 非单片机子帧数据，跳过")
                    return None

                # 【同步修复】串口模式的传感器识别（适配实际子帧标识0x07）
                subframe_id = raw_data[2]

                if subframe_id == 1:
                    base_position = 1
                elif subframe_id == 7:  # 替换原0x02为实际的0x07
                    base_position = 7
                else:
                    return None

                sensor_data_list = []
                for sensor_idx in range(6):
                    start = 3 + sensor_idx * 6
                    end = start + 6
                    if end > len(raw_data):
                        break
                    sensor_bytes = raw_data[start:end]
                    if len(sensor_bytes) == 6:
                        sensor_position = base_position + sensor_idx
                        position_angle = (sensor_position - 1) * 30

                        sensor_data_list.append({
                            "device_id": "ug65_serial",
                            "sensor_position": sensor_position,
                            "position_angle": position_angle,
                            "raw_data": raw_data,
                            "receive_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            "signal_strength": -75,
                            "rssi": -75
                        })

                return sensor_data_list if sensor_data_list else None

        except serial.SerialException as e:
            print(f"[串口错误] {str(e)}")
            return None
        except Exception as e:
            print(f"[串口接收异常] {str(e)}")
            return None

    def parse_data(self, raw_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """解析单片机传感器数据 - 压力值缩小10倍"""
        try:
            data_bytes = raw_data.get("raw_data", b'')
            sensor_position = raw_data.get("sensor_position", 0)
            position_angle = raw_data.get("position_angle", 0)

            if not data_bytes or sensor_position == 0:
                raise ValueError("缺失传感器基础信息")

            # 计算传感器在子帧内的索引
            subframe_id = 1 if sensor_position <= 6 else 7  # 同步修改为0x07
            sensor_idx_in_subframe = (sensor_position - 1) % 6
            # 提取该传感器的6字节数据
            start = 3 + sensor_idx_in_subframe * 6
            end = start + 6
            if end > len(data_bytes):
                raise ValueError(f"传感器{sensor_position}数据越界")
            sensor_bytes = data_bytes[start:end]

            # 压力值缩小10倍（/1000.0）
            raw_pressure = int.from_bytes(sensor_bytes[1:3], byteorder='big', signed=False) / 1000.0
            battery_voltage = int.from_bytes(sensor_bytes[3:5], byteorder='big', signed=False) / 1000.0
            signal_strength = sensor_bytes[5] if len(sensor_bytes) > 5 else 0

            device_id = f"mcu_sensor_{sensor_position}_{data_bytes[2:6].hex()[:4]}"

            return {
                "raw_data_id": None,
                "device_id": device_id,
                "sensor_position": sensor_position,
                "position_angle": position_angle,
                "parsed_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "data_type": "pressure",
                "raw_pressure": raw_pressure,
                "pressure": raw_pressure,
                "pressure_unit": "MPa",
                "battery_voltage": battery_voltage,
                "signal_strength": int(signal_strength),
                "is_abnormal": 0
            }

        except Exception as e:
            print(f"[数据解析错误] {str(e)}")
            return None

    def process_with_algorithm(self, parsed_data: Dict[str, Any]) -> Dict[str, Any]:
        """算法处理"""
        try:
            device_id = parsed_data["device_id"]
            sensor_position = parsed_data["sensor_position"]
            raw_pressure = parsed_data["raw_pressure"]

            position_key = f"{device_id}_pos{sensor_position}"
            params = self.algorithm_params.get(position_key, self.algorithm_params["default"])

            # 校准补偿
            calibrated = raw_pressure * params["k"] + params["b"]

            # 异常检测
            if position_key in self.last_pressure:
                history_pressure = self.last_pressure[position_key]
                deviation = abs(calibrated - history_pressure)
                if deviation > params["max_deviation"]:
                    print(
                        f"[异常值] 设备{device_id}位置{sensor_position}({parsed_data['position_angle']}°)：当前{calibrated:.2f}MPa，历史{history_pressure:.2f}MPa，偏差{deviation:.2f}MPa")
                    parsed_data["pressure"] = None
                    parsed_data["is_abnormal"] = 1
                    return parsed_data

            # 平滑滤波
            filtered = params["filter_alpha"] * calibrated + (1 - params["filter_alpha"]) * self.last_pressure.get(
                position_key, calibrated)

            self.last_pressure[position_key] = filtered
            parsed_data["pressure"] = filtered
            parsed_data["is_abnormal"] = 0
            return parsed_data

        except Exception as e:
            print(f"[算法处理错误] {str(e)}，使用原始压力值")
            parsed_data["pressure"] = parsed_data["raw_pressure"]
            parsed_data["is_abnormal"] = 1
            return parsed_data

    def store_raw_data(self, raw_data: Dict[str, Any]) -> Optional[int]:
        """存储原始数据到数据库"""
        try:
            with self._db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                INSERT INTO raw_pressure_data 
                (device_id, sensor_position, raw_data, receive_time, signal_strength, rssi)
                VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    raw_data.get("device_id", "unknown"),
                    raw_data.get("sensor_position", 0),
                    raw_data.get("raw_data", b''),
                    raw_data.get("receive_time", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                    raw_data.get("signal_strength", 0),
                    raw_data.get("rssi", 0)
                ))
                raw_id = cursor.lastrowid
                conn.commit()
                return raw_id
        except Exception as e:
            print(f"[原始数据存储错误] {str(e)}")
            return None

    def store_parsed_data(self, parsed_data: Dict[str, Any], raw_id: int) -> Optional[int]:
        """存储解析后数据到数据库"""
        try:
            parsed_data["raw_data_id"] = raw_id
            with self._db_connection() as conn:
                cursor = conn.cursor()
                fields = [k for k in parsed_data.keys() if k != "id"]
                placeholders = ", ".join(["?"] * len(fields))
                values = [parsed_data[k] for k in fields]

                cursor.execute(f'''
                INSERT INTO parsed_pressure_data 
                ({", ".join(fields)})
                VALUES ({placeholders})
                ''', values)

                parsed_id = cursor.lastrowid
                conn.commit()
                return parsed_id
        except Exception as e:
            print(f"[解析数据存储错误] {str(e)}")
            return None

    def query_data(self, device_id: Optional[str] = None,
                   sensor_position: Optional[int] = None,
                   start_time: Optional[str] = None,
                   end_time: Optional[str] = None,
                   limit: int = 12) -> List[Dict[str, Any]]:
        """查询数据库数据 - 仅显示当天的12个传感器最新数据"""
        try:
            with self._db_connection() as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                query = "SELECT * FROM parsed_pressure_data WHERE 1=1"
                params = []

                # 强制过滤当天数据，避免历史数据干扰
                today = date.today().strftime("%Y-%m-%d")
                query += " AND DATE(parsed_time) = ?"
                params.append(today)

                if device_id:
                    query += " AND device_id = ?"
                    params.append(device_id)
                if sensor_position:
                    query += " AND sensor_position = ?"
                    params.append(sensor_position)
                if start_time:
                    query += " AND parsed_time >= ?"
                    params.append(start_time)
                if end_time:
                    query += " AND parsed_time <= ?"
                    params.append(end_time)

                # 按传感器位置升序+时间降序，确保每个传感器只显示最新一条
                query += " ORDER BY sensor_position ASC, parsed_time DESC"
                # 按传感器位置去重，每个位置只取最新一条
                query = f'''
                SELECT * FROM (
                    {query}
                ) GROUP BY sensor_position
                '''
                if limit > 0:
                    query += f" LIMIT {limit}"

                cursor.execute(query, params)
                rows = cursor.fetchall()
                return [dict(row) for row in rows]

        except Exception as e:
            print(f"[数据查询错误] {str(e)}")
            return []

    def format_data_to_table(self, device_id=None, sensor_position=None, start_time=None, end_time=None,
                             limit=12) -> str:
        """格式化数据为表格"""
        data = self.query_data(device_id, sensor_position, start_time, end_time, limit)
        if not data:
            return "暂无当天传感器数据"

        columns = ["设备ID", "位置", "角度", "解析时间", "压力(MPa)", "电池电压(V)", "信号强度", "状态"]
        rows = []
        for item in data:
            rows.append([
                item["device_id"],
                f"{item['sensor_position']}号",
                f"{item['position_angle']}°",
                item["parsed_time"],
                f"{item['pressure']:.2f}" if item["pressure"] is not None else "无",
                f"{item['battery_voltage']:.2f}" if item["battery_voltage"] is not None else "无",
                item["signal_strength"] or "无",
                "正常" if item["is_abnormal"] == 0 else "异常"
            ])

        col_widths = [max(len(col), max(len(str(row[i])) for row in rows)) for i, col in enumerate(columns)]
        header = "  ".join([col.ljust(width) for col, width in zip(columns, col_widths)])
        separator = "-" * (sum(col_widths) + len(columns) * 2 - 2)
        body = "\n".join(["  ".join([str(cell).ljust(width) for cell, width in zip(row, col_widths)]) for row in rows])

        return f"\n{header}\n{separator}\n{body}\n"

    def print_table_periodically(self, interval=30, limit=12):
        """定时打印数据表格"""
        while True:
            try:
                table = self.format_data_to_table(limit=limit)
                print("===== 12传感器压力数据表格（当天最新） =====")
                print(table)
                time.sleep(interval)
            except Exception as e:
                print(f"[表格打印错误] {str(e)}")
                time.sleep(interval)

    def export_to_excel(self, file_path="public/gateway_data.xlsx", device_id=None, sensor_position=None, start_time=None,
                        end_time=None, limit=12):
        """导出数据为Excel"""
        try:
            import pandas as pd
            import os

            data = self.query_data(device_id, sensor_position, start_time, end_time, limit)
            if not data:
                print("无当天传感器数据可导出")
                return

            df = pd.DataFrame(data)
            df = df[["device_id", "sensor_position", "position_angle", "parsed_time", "pressure", "battery_voltage",
                     "signal_strength", "is_abnormal"]]
            df.columns = ["设备ID", "位置编号", "角度位置", "解析时间", "压力(MPa)", "电池电压(V)", "信号强度", "状态"]
            df["状态"] = df["状态"].map({0: "正常", 1: "异常"})
            df["压力(MPa)"] = df["压力(MPa)"].apply(lambda x: f"{x:.2f}" if pd.notnull(x) else "无")
            df["电池电压(V)"] = df["电池电压(V)"].apply(lambda x: f"{x:.2f}" if pd.notnull(x) else "无")

            if not os.path.exists(os.path.dirname(file_path)) and os.path.dirname(file_path):
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
            df.to_excel(file_path, index=False, engine="openpyxl")
            print(f"当天12传感器最新数据已导出至：{os.path.abspath(file_path)}")
        except ImportError:
            print("导出Excel需安装：pip install pandas openpyxl")
        except Exception as e:
            print(f"导出Excel失败：{str(e)}")

    def export_excel_periodically(self, interval=300, limit=12):
        """定时导出Excel"""
        while True:
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                self.export_to_excel(
                    file_path=f"public/gateway_data_{timestamp}.xlsx",
                    limit=limit
                )
                time.sleep(interval)
            except Exception as e:
                print(f"[定时导出错误] {str(e)}")
                time.sleep(interval)

    def _core_process_flow(self, raw_data: Dict[str, Any]) -> None:
        """核心处理流程"""
        try:
            required_fields = ["device_id", "sensor_position", "raw_data"]
            for field in required_fields:
                if field not in raw_data:
                    print(f"[核心流程] 缺失必要字段: {field}")
                    return

            raw_id = self.store_raw_data(raw_data)
            if not raw_id:
                return

            parsed_data = self.parse_data(raw_data)
            if not parsed_data:
                return

            processed_data = self.process_with_algorithm(parsed_data)
            if not processed_data:
                return

            parsed_id = self.store_parsed_data(processed_data, raw_id)
            if parsed_id:
                print(f"[处理完成] 设备:{processed_data['device_id']} "
                      f"位置:{processed_data['sensor_position']}号({processed_data['position_angle']}°) "
                      f"压力:{processed_data['pressure']:.2f}MPa "
                      f"状态:{'正常' if processed_data['is_abnormal'] == 0 else '异常'}")
                
                # 发布数据到MQTT服务器
                if self.mqtt_enable:
                    self.publish_data(processed_data)

        except Exception as e:
            print(f"[核心流程异常] {str(e)}")

    def process_cycle_serial(self) -> None:
        """串口模式处理循环"""
        sensor_data_list = self.receive_data_serial()
        if sensor_data_list:
            for sensor_data in sensor_data_list:
                self._core_process_flow(sensor_data)

    def publish_data(self, processed_data: Dict[str, Any]) -> bool:
        """发布处理后的数据到MQTT服务器"""
        if not self.mqtt_client:
            print("[MQTT发布错误] 未初始化MQTT客户端")
            return False

        try:
            # 构建指定格式的JSON消息
            mqtt_message = {
                "pipe_id": "P002",
                "flange_id": "F02",
                "sensor_position": processed_data.get("sensor_position", 0),
                "position_angle": processed_data.get("position_angle", 0.0),
                "pressure": processed_data.get("pressure", 0.0),
                "raw_pressure": processed_data.get("raw_pressure", 0.0),
                "battery_voltage": processed_data.get("battery_voltage", 0.0),
                "signal_strength": processed_data.get("signal_strength", -85),
                "parsed_time": processed_data.get("parsed_time", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                "is_abnormal": processed_data.get("is_abnormal", 0)
            }

            # 序列化JSON
            payload = json.dumps(mqtt_message)

            # 发布消息
            result = self.mqtt_client.publish(
                topic="sensor/data",
                payload=payload,
                qos=1,
                retain=False
            )

            # 等待发布完成
            result.wait_for_publish()

            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                print(f"[MQTT发布成功] 传感器位置: {processed_data.get('sensor_position', 0)}，压力: {processed_data.get('pressure', 0.0):.2f}MPa")
                return True
            else:
                print(f"[MQTT发布失败] 错误代码: {result.rc}")
                return False

        except Exception as e:
            print(f"[MQTT发布异常] {str(e)}")
            return False

    def process_cycle_mqtt(self) -> None:
        """MQTT模式处理循环"""
        if self.mqtt_client:
            self.mqtt_client.loop_forever()
        else:
            raise RuntimeError("[MQTT模式错误] 未初始化MQTT客户端")


if __name__ == "__main__":
    processor = None
    try:
        # 初始化处理器
        processor = LoraPressureProcessor(
            mqtt_enable=True,
            mqtt_broker="va1af2fe.ala.cn-hangzhou.emqxsl.cn",
            mqtt_port=8883,
            mqtt_topic="sensor/data",
            mqtt_username="qqqqwwww",
            mqtt_password="123456",
            serial_port="COM4",
            baudrate=9600,
            sensor_count=12
        )

        print("===== 修复版12传感器压力监测系统启动 =====")
        print("系统特性：")
        print("1. 压力值已缩小10倍")
        print("2. 表格仅显示当天12个传感器的最新数据（无重复/异常）")
        print("3. 11/12号传感器会正常显示在表格中")

        # 启动后台线程
        Thread(target=processor.print_table_periodically, args=(30, 12), daemon=True).start()
        Thread(target=processor.export_excel_periodically, args=(300, 12), daemon=True).start()

        if processor.mqtt_enable:
            processor.process_cycle_mqtt()
        else:
            while True:
                processor.process_cycle_serial()
                time.sleep(2)

    except KeyboardInterrupt:
        print("\n程序已手动终止")
    except Exception as e:
        print(f"\n程序异常终止：{str(e)}")
    finally:
        if processor and hasattr(processor, 'mqtt_client') and processor.mqtt_client:
            processor.mqtt_client.disconnect()
        print("===== 系统运行结束 =====")