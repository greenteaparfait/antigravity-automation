import docx
import json
doc = docx.Document('ESP32_Sensor_Catalog_KR.docx')
with open('docx_dump.txt', 'w', encoding='utf-8') as f:
    for p in doc.paragraphs:
        f.write(p.text + '\n')
