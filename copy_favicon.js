const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'EnergyBae Logo - 1 png.png');
const destDir = path.join(__dirname, 'public');
const destPath = path.join(destDir, 'favicon.png');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
}

fs.copyFileSync(srcPath, destPath);
console.log('Copied successfully!');
