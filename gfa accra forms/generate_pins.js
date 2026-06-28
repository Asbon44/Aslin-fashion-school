const fs = require('fs');

const generatePins = () => {
    const pins = [];
    for (let i = 0; i < 1000; i++) {
        const serial = 'GFA-' + (10000 + i).toString();
        // Generate a random 6-digit pin
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        pins.push({
            serial,
            pin,
            used: false,
            formData: null
        });
    }
    
    const fileContent = `const GFA_PINS = ${JSON.stringify(pins, null, 2)};`;
    fs.writeFileSync('data.js', fileContent);
    console.log('Successfully generated data.js with 1000 pins.');
};

generatePins();
