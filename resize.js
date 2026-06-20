const Jimp = require('jimp');

async function resize() {
  try {
    const image = await Jimp.read('EnergyBae Logo - 2 png.png');
    image.resize(2000, 2000);
    await image.writeAsync('EnergyBae Logo - 2 png.png');
    console.log('Successfully resized to 2000x2000');
  } catch (err) {
    console.error(err);
  }
}

resize();
