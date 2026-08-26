/** Max upload before we refuse to even decode it. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024
const SIZE = 500 // recipe photos are square everywhere in the app
const QUALITY = 0.82

export class ImageError extends Error {}

/**
 * Read a user's photo and return a square data URL small enough to live in the
 * database. Centre-cropped to match the square boxes the UI already uses.
 */
export function fileToSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new ImageError("That file isn't an image"))
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      reject(new ImageError("That image is too large (max 12MB)"))
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement("canvas")
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new ImageError("Couldn't process that image"))
        return
      }
      // centre-crop the short edge, then scale
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const sx = (img.naturalWidth - side) / 2
      const sy = (img.naturalHeight - side) / 2
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
      resolve(canvas.toDataURL("image/jpeg", QUALITY))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageError("Couldn't read that image"))
    }
    img.src = url
  })
}
