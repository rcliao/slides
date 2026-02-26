const REACTIONS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F389}', '\u{1F914}', '\u{1F44F}', '\u{1F525}'];

interface AudienceBarProps {
  onReaction: (emoji: string) => void;
}

export function AudienceBar({ onReaction }: AudienceBarProps) {
  return (
    <div className="audience-bar">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          className="reaction-btn"
          onClick={() => onReaction(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
