
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';

export async function saveUrlToFile(
  url: string,
  folder: string,
  filename: string
): Promise<string> {

  const dir = join(__dirname, '..', '..', 'media', folder);
  await fs.mkdir(dir, { recursive: true });

  // 🔹 Определяем расширение из URL (по умолчанию jpg)
  let ext = 'jpg';
  const urlExt = url.split('.').pop()?.toLowerCase();
  if (urlExt && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExt)) {
    ext = urlExt === 'jpeg' ? 'jpg' : urlExt;
  }

  const filePath = join(dir, `${filename}.${ext}`);
  const publicPath = `/media/${folder}/${filename}.${ext}`;

  // ✅ ЕСЛИ ФАЙЛ УЖЕ ЕСТЬ — НИЧЕГО НЕ ДЕЛАЕМ
  if (existsSync(filePath)) {
    return publicPath;
  }

  // 🔻 Если файла нет — скачиваем
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'image/*',
      'Referer': new URL(url).origin,
    },
    timeout: 10000,
  });

  await fs.writeFile(filePath, Buffer.from(response.data));

  return publicPath;
}