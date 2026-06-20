const Jimp = require('jimp');

const srcPath = 'c:\\Users\\vj937\\Downloads\\energybae-solar-platform (2)\\EnergyBae Logo - 1 png.png';
const destPath = 'c:\\Users\\vj937\\Downloads\\energybae-solar-platform (2)\\public\\favicon.png';

async function processImage() {
  const image = await Jimp.read(srcPath);
  
  // Autocrop the original image with a tolerance of 5%
  image.autocrop(0.05);
  
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  
  console.log(`Original dimensions after autocrop: ${width}x${height}`);
  
  // Crop the bottom part which likely contains the text.
  // Let's assume the text takes up the bottom 20%
  const newHeight = Math.floor(height * 0.82);
  image.crop(0, 0, width, newHeight);
  
  // Autocrop again to remove any remaining whitespace
  image.autocrop(0.05);
  
  console.log(`Final dimensions after removing text: ${image.bitmap.width}x${image.bitmap.height}`);
  
  await image.writeAsync(destPath);
  console.log('Favicon cropped and saved successfully!');
}

processImage().catch(console.error);
