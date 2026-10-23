import { FileStack, LockKeyhole } from 'lucide-react'

interface HeaderProps {
  pageCount: number
  pdfCount: number
  onAddFiles: () => void
}

export function Header({ pageCount, pdfCount, onAddFiles }: HeaderProps) {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="PDF Studio home">
        <span className="brand-mark">
          <FileStack size={19} strokeWidth={1.8} />
        </span>
        <span className="brand-name">PDF <strong>Studio</strong></span>
      </a>
      <div className="header-subtitle">Private local PDF organizer</div>
      <div className="header-status">
        <span className="status-lock">
          <LockKeyhole size={13} />
        </span>
        <span className="status-text">
          {pageCount > 0
            ? `${pdfCount} ${pdfCount === 1 ? 'PDF' : 'PDFs'} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`
            : 'All files stay local'}
        </span>
        <span className="status-dot" />
      </div>
      <button className="header-add-button" type="button" onClick={onAddFiles}>
        Add PDFs or Images
      </button>
    </header>
  )
}
