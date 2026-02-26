import { formatTime } from '../hooks/useTimer';

interface TimerProps {
  totalElapsed: number;
  slideElapsed: number;
  visible: boolean;
}

export function Timer({ totalElapsed, slideElapsed, visible }: TimerProps) {
  if (!visible) return null;

  return (
    <div className="timer">
      <div className="timer-total" title="Total elapsed">
        {formatTime(totalElapsed)}
      </div>
      <div className="timer-slide" title="Time on this slide">
        {formatTime(slideElapsed)}
      </div>
    </div>
  );
}
