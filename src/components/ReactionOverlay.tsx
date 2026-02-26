interface ReactionOverlayProps {
  reactions: { id: number; emoji: string; left: number }[];
}

export function ReactionOverlay({ reactions }: ReactionOverlayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="reaction-overlay">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="reaction-emoji"
          style={{ left: `${r.left}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
