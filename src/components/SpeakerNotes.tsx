interface SpeakerNotesProps {
  notes: string;
  onClose: () => void;
}

export function SpeakerNotes({ notes, onClose }: SpeakerNotesProps) {
  return (
    <div className="speaker-notes" onClick={onClose}>
      <div className="speaker-notes-content" onClick={(e) => e.stopPropagation()}>
        <div className="speaker-notes-header">
          <span>Speaker Notes</span>
          <button className="speaker-notes-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="speaker-notes-body">{notes}</div>
      </div>
    </div>
  );
}
