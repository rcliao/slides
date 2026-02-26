export interface SlidesMeta {
  title: string;
  theme: string;
  [key: string]: string;
}

export interface Slide {
  index: number;
  content: string;
  rawMarkdown: string;
  notes?: string;
  frontmatter: Record<string, string>;
  steps?: string[];     // HTML segments for incremental reveal (split by <!-- pause -->)
  totalSteps: number;   // always >= 1
}

export interface SlidesData {
  meta: SlidesMeta;
  slides: Slide[];
  live?: boolean;
}
