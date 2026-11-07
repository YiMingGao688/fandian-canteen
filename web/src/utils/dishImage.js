/** 将用户照片规范成 JPEG 并压缩到现有上传请求限制以内，不改变全局上传配置。 */
export async function prepareDishImage(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片')
  if (file.size > 10 * 1024 * 1024) throw new Error('原图请控制在 10 MB 以内')
  let image
  try { image = await createImageBitmap(file) } catch { throw new Error('无法读取这张图片，请换一张图片') }
  try {
    if (image.width * image.height > 36000000) throw new Error('图片分辨率过高，请缩小后上传')
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [.88, .75, .6, .45]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= 850 * 1024) return new File([blob], 'dish.jpg', { type: 'image/jpeg' })
    }
    throw new Error('图片内容过大，请换一张较小的图片')
  } finally { image.close() }
}
