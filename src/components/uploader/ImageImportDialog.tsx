import { Image, X } from 'lucide-react'
import type { ImagePageOrientation } from '../../lib/imagePdfLoader'

interface ImageImportDialogProps {
  files: File[]
  orientation: ImagePageOrientation
  onOrientationChange: (orientation: ImagePageOrientation) => void
  onImport: () => void
  onCancel: () => void
}

function isImagePageOrientation(value: string): value is ImagePageOrientation {
  return value === 'auto' || value === 'portrait' || value === 'landscape'
}

export function ImageImportDialog({
  files,
  orientation,
  onOrientationChange,
  onImport,
  onCancel,
}: ImageImportDialogProps) {
  return (
    <div
      className="image-import-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        className="image-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-import-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <header className="image-import-header">
          <span className="image-import-icon"><Image size={19} /></span>
          <button type="button" aria-label="Cancel image import" onClick={onCancel}>
            <X size={17} />
          </button>
        </header>
        <h2 id="image-import-title">Add images as PDF pages</h2>
        <p className="image-import-description">
          {files.length} {files.length === 1 ? 'image will' : 'images will'} become
          separate pages. Each image is centered and scaled to fit without cropping.
        </p>
        <label className="image-import-orientation">
          <span>Page orientation</span>
          <select
            value={orientation}
            onChange={(event) => {
              if (isImagePageOrientation(event.target.value)) {
                onOrientationChange(event.target.value)
              }
            }}
          >
            <option value="auto">Automatic per image</option>
            <option value="portrait">Portrait for all images</option>
            <option value="landscape">Landscape for all images</option>
          </select>
        </label>
        <p className="image-import-note">
          Automatic uses each image’s shape. You can change a page’s orientation later in its inspector.
        </p>
        <footer className="image-import-actions">
          <button type="button" className="image-import-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="image-import-submit" onClick={onImport}>
            Add {files.length === 1 ? 'image' : `${files.length} images`}
          </button>
        </footer>
      </section>
    </div>
  )
}
