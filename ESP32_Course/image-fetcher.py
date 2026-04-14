import requests
from bs4 import BeautifulSoup
import os

sensors = [
    # Temperature
    "NTC Thermistor 10k",
    "PT100 MAX31865",
    "TMP36",
    "DS18B20",
    "SHT31",
    "MAX6675 thermocouple",
    "MLX90614 infrared temperature sensor",

    # Humidity
    "SHTC3 humidity sensor",
    "DHT22 humidity sensor",
    "BME280 sensor module",

    # Gas / Air
    "MQ-135 gas sensor module",
    "MH-Z19B CO2 sensor",
    "SGP30 VOC sensor",
    "BME680 gas sensor",
    "PMS5003 dust sensor",

    # Light / Optical
    "GL5528 LDR sensor",
    "BH1750 light sensor",
    "TSL2561 light sensor",
    "TCS34725 color sensor",
    "APDS9999 sensor module",
    "VEML6075 UV sensor",
    "AS7262 spectral sensor",

    # Soil
    "Capacitive soil moisture sensor v2.0",
    "DFRobot EC sensor",
    "Gravity pH sensor",

    # Motion / IMU
    "MPU6050 module",
    "MPU9250 module",
    "ADXL345 accelerometer",

    # Distance
    "HC-SR04 ultrasonic sensor",
    "VL53L0X ToF sensor",
    "GP2Y0A21 IR distance sensor",

    # Pressure / Force
    "BMP280 pressure sensor",
    "HX711 load cell amplifier",
    "FSR402 force sensor",

    # Magnetic / Current
    "A3144 hall sensor",
    "ACS712 current sensor",
    "INA219 current sensor",

    # Battery
    "MAX17048 fuel gauge",

    # Imaging
    "OV2640 camera module",
    "FLIR Lepton thermal camera",

    # Acoustic
    "Analog microphone module",
    "INMP441 MEMS microphone",

    # Touch
    "TTP223 touch sensor",
    "ESP32 capacitive touch",

    # Liquid / Flow
    "YF-S201 water flow sensor",
    "Float switch water level sensor",
    "Turbidity sensor module"
]

os.makedirs("sensor_images", exist_ok=True)

def download_image(query, index):
    url = f"https://www.bing.com/images/search?q={query}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.text, "html.parser")
    
    img_tags = soup.find_all("img")
    
    for i, img in enumerate(img_tags):
        src = img.get("src")
        if src and src.startswith("http"):
            try:
                img_data = requests.get(src).content
                filename = f"sensor_images/{query.replace(' ', '_')}.jpg"
                with open(filename, "wb") as f:
                    f.write(img_data)
                print(f"Downloaded: {filename}")
                break
            except:
                pass

for sensor in sensors:
    download_image(sensor, 0)