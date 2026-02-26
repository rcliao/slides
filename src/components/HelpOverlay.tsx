interface HelpOverlayProps {
  onClose: () => void;
}

const SECTIONS = [
  {
    title: 'Navigation',
    keys: [
      { keys: ['l', 'j', 'Right', 'Space'], action: 'Next slide / step' },
      { keys: ['h', 'k', 'Left', 'Backspace'], action: 'Previous slide / step' },
      { keys: ['g'], action: 'First slide' },
      { keys: ['G', 'End'], action: 'Last slide' },
    ],
  },
  {
    title: 'View',
    keys: [
      { keys: ['f'], action: 'Toggle fullscreen' },
      { keys: ['o'], action: 'Toggle overview' },
      { keys: ['t'], action: 'Toggle timer' },
      { keys: ['d'], action: 'Cycle themes' },
    ],
  },
  {
    title: 'Other',
    keys: [
      { keys: ['?'], action: 'Toggle this help' },
      { keys: ['Esc'], action: 'Close overlay' },
    ],
  },
];

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="help-close" onClick={onClose}>
            Esc
          </button>
        </div>
        <div className="help-sections">
          {SECTIONS.map((section) => (
            <div key={section.title} className="help-section">
              <h3>{section.title}</h3>
              <div className="help-keys">
                {section.keys.map((entry) => (
                  <div key={entry.action} className="help-row">
                    <span className="help-key-group">
                      {entry.keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && <span className="help-sep"> / </span>}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </span>
                    <span className="help-action">{entry.action}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
