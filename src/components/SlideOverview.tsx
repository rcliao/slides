import type { Slide } from '../types';

interface SlideOverviewProps {
  slides: Slide[];
  current: number;
  onSelect: (index: number) => void;
}

export function SlideOverview({ slides, current, onSelect }: SlideOverviewProps) {
  return (
    <div className="overview">
      <div className="overview-grid">
        {slides.map((slide, i) => (
          <button
            key={i}
            className={`overview-card ${i === current ? 'overview-card-active' : ''}`}
            onClick={() => onSelect(i)}
          >
            <div className="overview-card-number">{i + 1}</div>
            <div
              className="overview-card-content"
              dangerouslySetInnerHTML={{ __html: slide.content }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
