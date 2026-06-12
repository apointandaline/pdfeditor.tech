import type { SVGProps } from 'react';

const baseProps: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const SelectIcon = () => (
  <svg {...baseProps}>
    <path d="M4 3 L4 15 L8 11 L11 17 L13 16 L10 10 L15 10 Z" />
  </svg>
);

export const TextIcon = () => (
  <svg {...baseProps}>
    <path d="M5 5 L15 5" />
    <path d="M10 5 L10 16" />
    <path d="M7.5 16 L12.5 16" />
  </svg>
);

export const EditTextIcon = () => (
  <svg {...baseProps}>
    {/* Underlined T — "modify existing text" */}
    <path d="M3 5 L13 5" />
    <path d="M8 5 L8 13" />
    <path d="M3 16 L17 16" />
    {/* Tiny edit caret */}
    <path d="M14 7 L17 4 L17 7 Z" fill="currentColor" />
  </svg>
);

export const ImageIcon = () => (
  <svg {...baseProps}>
    <rect x="3" y="4" width="14" height="12" rx="1" />
    <circle cx="7" cy="8" r="1.2" fill="currentColor" />
    <path d="M3 13 L8 9 L13 13 L17 11" />
  </svg>
);

export const PenIcon = () => (
  <svg {...baseProps}>
    <path d="M3 17 L7 13 L14 6 L17 9 L10 16 Z" />
    <path d="M11 7 L13 9" />
  </svg>
);

export const HighlighterIcon = () => (
  <svg {...baseProps}>
    <path d="M4 17 L8 17 L14 11 L11 8 L5 14 Z" />
    <path d="M11 8 L14 5 L17 8 L14 11" />
  </svg>
);

export const LineIcon = () => (
  <svg {...baseProps}>
    <path d="M4 16 L16 4" />
  </svg>
);

export const ArrowIcon = () => (
  <svg {...baseProps}>
    <path d="M4 16 L16 4" />
    <path d="M11 4 L16 4 L16 9" />
  </svg>
);

export const RectIcon = () => (
  <svg {...baseProps}>
    <rect x="4" y="5" width="12" height="10" />
  </svg>
);

export const EllipseIcon = () => (
  <svg {...baseProps}>
    <ellipse cx="10" cy="10" rx="6.5" ry="5" />
  </svg>
);
