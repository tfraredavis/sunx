// Convert an uploaded bill into { mediaType, data(base64) } for /api/parse-bill.
// PDFs are sent as-is. Any image the browser can decode (JPG, PNG, WebP, GIF, BMP, and HEIC
// on Safari) is redrawn to a JPEG so phone photos are a consistent type and a manageable size.

const MAX_EDGE = 2000; // px, long edge for images
const MAX_BASE64_BYTES = 4_000_000; // stays under Vercel's 4.5 MB request body limit

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image format could not be opened. Try a PDF, JPG, or PNG.'));
    };
    img.src = url;
  });
}

async function imageToJpeg(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  return readAsBase64(blob);
}

export async function fileToPayload(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const payload = isPdf
    ? { mediaType: 'application/pdf', data: await readAsBase64(file) }
    : { mediaType: 'image/jpeg', data: await imageToJpeg(file) };

  if (payload.data.length > MAX_BASE64_BYTES) {
    throw new Error('That file is too large. Try a smaller PDF or a photo of the bill.');
  }
  return payload;
}
