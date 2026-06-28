import json
import random

pins = []
for i in range(1000):
    serialNumber = f"GFA-{10000 + i}"
    pin = f"{random.randint(0, 999999):06d}"
    pins.append({
        "serial": serialNumber,
        "pin": pin,
        "used": False,
        "formData": None
    })

file_content = f"const GFA_PINS = {json.dumps(pins, indent=2)};"

with open("data.js", "w") as f:
    f.write(file_content)

print("Created data.js with 1000 pins.")
