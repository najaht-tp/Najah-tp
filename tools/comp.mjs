import sharp from 'sharp';
const img = sharp('../still.webp');
const {width,height} = await img.metadata();
const bg = await sharp({create:{width,height,channels:4,background:{r:70,g:12,b:18,alpha:1}}}).png().toBuffer();
const full = await sharp(bg).composite([{input: await img.png().toBuffer()}]).png().toBuffer();
await sharp(full).extract({left:0, top: Math.round(height*0.62), width, height: Math.round(height*0.38)}).resize({width:900}).png().toFile('../comp.png');
console.log(width,height);
