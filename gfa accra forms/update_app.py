import sys
import os

filepath = r'c:\Users\kenne\OneDrive\Desktop\gfa accra forms\app.js'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Replace initDatabase function (lines 20 to 27)
# 0-indexed: lines[19] to lines[26]
new_function = [
    "function initDatabase() {\n",
    "    if (!localStorage.getItem('gfa_database_v2')) {\n",
    "        if (typeof GFA_PINS !== 'undefined') {\n",
    "            localStorage.setItem('gfa_database_v2', JSON.stringify(GFA_PINS));\n",
    "            console.log('Database initialized from pins.js');\n",
    "        } else {\n",
    "            console.error('GFA_PINS not found! Please check pins.js');\n",
    "        }\n",
    "    }\n",
    "}\n"
]

# We need to find the exact range.
# Let's search for "function initDatabase() {" and the closing "}" for that block.
start_idx = -1
for i, line in enumerate(lines):
    if "function initDatabase() {" in line:
        start_idx = i
        break

if start_idx != -1:
    # Find the end of the function. It ends at the next "}" that is not indented.
    # Actually, let's just find the next line that is exactly "}" at the start.
    end_idx = -1
    for i in range(start_idx + 1, len(lines)):
        if lines[i].strip() == "}":
            end_idx = i
            break
    
    if end_idx != -1:
        # Perform replacement
        lines[start_idx:end_idx+1] = new_function
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f"Successfully updated app.js. Replaced lines {start_idx+1} to {end_idx+1}.")
    else:
        print("Could not find end of initDatabase function.")
else:
    print("Could not find initDatabase function.")
