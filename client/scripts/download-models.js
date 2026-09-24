import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.resolve(__dirname, '../public/models');

const COCO_SSD_FILES = [
  'model.json',
  'group1-shard1of5',
  'group1-shard2of5',
  'group1-shard3of5',
  'group1-shard4of5',
  'group1-shard5of5',
];
const COCO_SSD_BASE_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2';

const MOVENET_FILES = [
  'model.json',
  'group1-shard1of2.bin',
  'group1-shard2of2.bin',
];
const MOVENET_BASE_URL = 'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4';

async function downloadFile(url, destPath) {
  console.log(`Downloading: ${url} -> ${destPath}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`Saved ${destPath} (${buffer.length} bytes)`);
}

async function ensureModels() {
  const cocoDir = path.join(MODELS_DIR, 'coco-ssd');
  const movenetDir = path.join(MODELS_DIR, 'movenet');

  fs.mkdirSync(cocoDir, { recursive: true });
  fs.mkdirSync(movenetDir, { recursive: true });

  let missingCoco = COCO_SSD_FILES.filter(f => !fs.existsSync(path.join(cocoDir, f)));
  let missingMovenet = MOVENET_FILES.filter(f => !fs.existsSync(path.join(movenetDir, f)));

  if (missingCoco.length === 0 && missingMovenet.length === 0) {
    console.log('✓ All on-device ML models are present.');
    return;
  }

  for (const file of missingCoco) {
    const url = `${COCO_SSD_BASE_URL}/${file}`;
    await downloadFile(url, path.join(cocoDir, file));
  }

  for (const file of missingMovenet) {
    const url = `${MOVENET_BASE_URL}/${file}?tfjs-format=file`;
    await downloadFile(url, path.join(movenetDir, file));
  }

  console.log('✓ Model download completed successfully.');
}

ensureModels().catch(err => {
  console.error('Error downloading models:', err);
  process.exit(1);
});
