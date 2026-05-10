import React, { useRef, useState, useEffect } from 'react';
import { StoryCard, type StoryCardProps } from './StoryCard';

export interface StoryStripProps {
  stories: StoryCardProps[];
}

export const StoryStrip: React.FC<StoryStripProps> = ({ stories }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const displayStories = stories.length > 0 ? stories : [
    {
      type: 'welcome' as const,
      title: 'Welcome to Driver Buddy',
      body: 'Log your first shift to unlock insights, predictions, and tax estimates.',
      cta: 'Log first shift',
      onCta: () => {},
    },
  ];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Array.from(el.children).indexOf(entry.target as HTMLElement);
            if (index >= 0) setActiveIndex(index);
          }
        });
      },
      { root: el, threshold: 0.5 }
    );

    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [displayStories.length]);

  return (
    <div className="space-y-3">
      <div
        ref={scrollRef}
        data-testid="story-strip-scroll"
        className="flex gap-3 overflow-x-auto scroll-snap-x snap-x snap-mandatory pb-2 no-scrollbar"
      >
        {displayStories.map((story, index) => (
          <div key={`${story.type}-${index}`} className="scroll-snap-align-start snap-start">
            <StoryCard {...story} />
          </div>
        ))}
      </div>

      {displayStories.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {displayStories.map((_, index) => (
            <div
              key={index}
              className={`story-dot h-1.5 w-1.5 rounded-full transition-colors ${
                index === activeIndex ? 'bg-brand' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
