import { useCallback } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { FileUp, LoaderCircle } from 'lucide-react'
import type { UploadError } from '../../types/pdf'

interface UploadZoneProps {
  isProcessing: boolean
  onFiles: (files: File[]) => void
  onRejected: (errors: UploadError[]) => void
}

function rejectionMessage(rejection: FileRejection): string {
  if (rejection.errors.some((error) => error.code === 'file-invalid-type')) {
    return 'Only PDF, JPEG, and PNG files are supported.'
  }
  return rejection.errors.map((error) => error.message).join(' ')
}

export function UploadZone({ isProcessing, onFiles, onRejected }: UploadZoneProps) {
  const handleDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (acceptedFiles.length > 0) onFiles(acceptedFiles)
      if (rejectedFiles.length > 0) {
        onRejected(
          rejectedFiles.map((rejection, index) => ({
            id: crypto.randomUUID(),
            fileName: rejection.file.name || `File ${index + 1}`,
            message: rejectionMessage(rejection),
          })),
        )
      }
    },
    [onFiles, onRejected],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
  })

  return (
    <div
      {...getRootProps({
        className: `upload-zone${isDragActive ? ' is-dragging' : ''}${isProcessing ? ' is-disabled' : ''}`,
        'aria-label': 'PDF and image upload area',
      })}
    >
      <input {...getInputProps({ className: 'upload-input' })} />
      <div className="upload-content" aria-live="polite">
        <span className="upload-icon-wrap">
          {isProcessing ? (
            <LoaderCircle className="loading-spinner-icon" size={25} />
          ) : (
            <FileUp size={25} strokeWidth={1.7} />
          )}
        </span>
        <p className="upload-title">
          {isDragActive
            ? 'Drop PDFs or images here'
            : isProcessing
              ? 'Your pages are on their way'
              : 'Drop PDFs or images here'}
        </p>
        <p className="upload-help">
          or{' '}
          <button
            className="browse-button"
            type="button"
            disabled={isProcessing}
            onClick={(event) => {
              event.stopPropagation()
              open()
            }}
          >
            browse files
          </button>{' '}
          from your device
        </p>
        <span className="upload-formats">PDF, JPEG, PNG · select multiple</span>
      </div>
    </div>
  )
}
