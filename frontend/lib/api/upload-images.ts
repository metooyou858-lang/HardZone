const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

export function assertSupportedPhoto(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const supportedType = file.type ? ALLOWED_PHOTO_TYPES.has(file.type) : false;
  const supportedExtension = ALLOWED_PHOTO_EXTENSIONS.has(extension);

  if (!supportedType && !supportedExtension) {
    throw new Error("Поддерживаются JPG, PNG или WebP. Фото HEIC/HEIF с iPhone нужно сначала сохранить как JPEG.");
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    throw new Error("Фото слишком большое. Максимальный размер - 5 МБ.");
  }
}
