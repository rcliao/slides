import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import slidesData from 'virtual:slides-data';
import { SlideRenderer } from './components/SlideRenderer';
import { Timer } from './components/Timer';
import { ProgressBar } from './components/ProgressBar';
import { SlideOverview } from './components/SlideOverview';
import { HelpOverlay } from './components/HelpOverlay';
import { ReactionOverlay } from './components/ReactionOverlay';
import { AudienceBar } from './components/AudienceBar';
import { useKeyboard } from './hooks/useKeyboard';
import { useTimer } from './hooks/useTimer';
import { useLiveSync } from './hooks/useLiveSync';

const THEMES = ['default', 'dark', 'retro'];

export function App() {
  const isAudience = useMemo(
    () => new URLSearchParams(window.location.search).has('audience'),
    [],
  );
  const isLive = slidesData.live === true;

  const [currentSlide, setCurrentSlide] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    const n = parseInt(hash, 10);
    return n >= 1 && n <= slidesData.slides.length ? n - 1 : 0;
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [showOverview, setShowOverview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTimer, setShowTimer] = useState(true);
  const [theme, setTheme] = useState(slidesData.meta.theme || 'default');
  const direction = useRef<'next' | 'prev' | 'none'>('none');

  const { totalElapsed, slideElapsed } = useTimer(currentSlide);

  const total = slidesData.slides.length;
  const slide = slidesData.slides[currentSlide];
  const layout = slide?.frontmatter?.layout || 'default';
  const totalSteps = slide?.totalSteps || 1;

  // Sync slide number to URL hash
  const goTo = useCallback(
    (index: number, step?: number) => {
      const clamped = Math.max(0, Math.min(index, total - 1));
      direction.current = clamped > currentSlide ? 'next' : clamped < currentSlide ? 'prev' : 'none';
      setCurrentSlide(clamped);
      setCurrentStep(step ?? 0);
      window.location.hash = `${clamped + 1}`;
    },
    [total, currentSlide],
  );

  // Confetti on slides with confetti: true frontmatter
  useEffect(() => {
    if (slide?.frontmatter?.confetti === 'true') {
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        // Second burst for extra fun
        setTimeout(() => {
          confetti({ particleCount: 50, spread: 120, origin: { y: 0.5 } });
        }, 250);
      });
    }
  }, [currentSlide, slide?.frontmatter?.confetti]);

  // Live sync
  const onLiveSlideChange = useCallback(
    (slideIdx: number, step: number) => {
      const clamped = Math.max(0, Math.min(slideIdx, total - 1));
      setCurrentSlide(clamped);
      setCurrentStep(step);
      window.location.hash = `${clamped + 1}`;
    },
    [total],
  );

  const { audienceCount, reactions, sendReaction } = useLiveSync({
    enabled: isLive,
    isAudience,
    currentSlide,
    currentStep,
    onSlideChange: onLiveSlideChange,
  });

  const handlers = useMemo(
    () => ({
      onNext: () => {
        if (isAudience) return; // audience can't navigate
        if (currentStep < totalSteps - 1) {
          setCurrentStep((s) => s + 1);
        } else {
          goTo(currentSlide + 1);
        }
      },
      onPrev: () => {
        if (isAudience) return;
        if (currentStep > 0) {
          setCurrentStep((s) => s - 1);
        } else if (currentSlide > 0) {
          const prevSlide = slidesData.slides[currentSlide - 1];
          const lastStep = (prevSlide?.totalSteps || 1) - 1;
          goTo(currentSlide - 1, lastStep);
        }
      },
      onFirst: () => {
        if (isAudience) return;
        goTo(0);
      },
      onLast: () => {
        if (isAudience) return;
        goTo(total - 1);
      },
      onOverview: () => {
        if (isAudience) return;
        setShowOverview((v) => !v);
      },
      onFullscreen: () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      },
      onTimer: () => setShowTimer((v) => !v),
      onThemeCycle: () =>
        setTheme((t: string) => {
          const idx = THEMES.indexOf(t);
          return THEMES[(idx + 1) % THEMES.length];
        }),
      onHelp: () => setShowHelp((v) => !v),
      onEscape: () => {
        if (showHelp) setShowHelp(false);
        else if (showOverview) setShowOverview(false);
        else if (document.fullscreenElement) document.exitFullscreen();
      },
    }),
    [currentSlide, currentStep, totalSteps, total, goTo, showOverview, showHelp, isAudience],
  );

  useKeyboard(handlers);

  // Touch/swipe support
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current || isAudience) return;
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = e.changedTouches[0].clientY - touchStart.current.y;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0) handlers.onNext();
        else handlers.onPrev();
      }
      touchStart.current = null;
    },
    [handlers, isAudience],
  );

  return (
    <div
      className="slides-app"
      data-theme={theme}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      {/* Floating reactions */}
      <ReactionOverlay reactions={reactions} />

      {showOverview ? (
        <SlideOverview
          slides={slidesData.slides}
          current={currentSlide}
          onSelect={(i) => {
            goTo(i);
            setShowOverview(false);
          }}
        />
      ) : (
        <>
          <SlideRenderer
            html={slide.content}
            steps={slide.steps}
            currentStep={currentStep}
            layout={layout}
            bg={slide.frontmatter?.bg}
            direction={direction.current}
          />

          {!isAudience && (
            <Timer
              totalElapsed={totalElapsed}
              slideElapsed={slideElapsed}
              visible={showTimer}
            />
          )}

          <ProgressBar current={currentSlide} total={total} />

          <div className="slide-number">
            {currentSlide + 1} / {total}
          </div>

          {/* Step indicator dots */}
          {totalSteps > 1 && (
            <div className="step-indicator">
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={`step-dot ${i <= currentStep ? 'step-dot-active' : ''}`}
                />
              ))}
            </div>
          )}

          {slide.notes && !isAudience && (
            <div className="slide-notes-indicator" title={slide.notes}>
              notes
            </div>
          )}

          {/* Audience count for presenter */}
          {isLive && !isAudience && audienceCount > 0 && (
            <div className="audience-count">
              {audienceCount} viewer{audienceCount !== 1 ? 's' : ''}
            </div>
          )}

          {/* Audience reaction bar */}
          {isAudience && <AudienceBar onReaction={sendReaction} />}
        </>
      )}
    </div>
  );
}
