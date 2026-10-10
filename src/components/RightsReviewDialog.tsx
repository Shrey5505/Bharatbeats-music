import { useState } from "react";
import { ExternalLink, ShieldCheck, X } from "lucide-react";
import { licenseLabel, type ArchiveRecord } from "../lib/archive";

export function RightsReviewDialog({
  record,
  onConfirm,
  onCancel,
}: {
  record: ArchiveRecord;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="rights-dialog" role="dialog" aria-modal="true" aria-labelledby="rights-title">
        <button className="dialog-close" type="button" aria-label="Close rights review" onClick={onCancel}><X size={18} /></button>
        <span className="rights-icon"><ShieldCheck size={24} /></span>
        <p className="eyebrow">REQUIRED BEFORE FIRST PLAY</p>
        <h2 id="rights-title">Check this recording's rights</h2>
        <p className="rights-track-title">{record.title}</p>
        <p className="rights-artist">{record.creator}{record.album ? ` · ${record.album}` : ""}</p>
        <div className="rights-source-links">
          <a href={`https://archive.org/details/${encodeURIComponent(record.id)}`} target="_blank" rel="noreferrer">
            Review Archive item <ExternalLink size={14} />
          </a>
          <a href={record.licenseUrl} target="_blank" rel="noreferrer">
            Declared license: {licenseLabel(record.licenseUrl) ?? "Unsupported"} <ExternalLink size={14} />
          </a>
        </div>
        <p className="rights-warning">The Archive's license is supplied by the uploader; BharatBeats cannot independently confirm the uploader owns these recording rights. Review the item, attribution, and license for your intended use. Playback remains blocked unless you confirm.</p>
        <label className="rights-checkbox">
          <input autoFocus type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I reviewed the source and confirm this recording may legally be streamed under its declared license.</span>
        </label>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Not now</button>
          <button className="primary-button" type="button" disabled={!confirmed} onClick={onConfirm}>Verify file & play</button>
        </div>
      </section>
    </div>
  );
}
