/** 16px stroke icons as React SVG (no icon library, no external requests). */
import type { ReactNode } from "react";

function Icon({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      {children}
    </svg>
  );
}

export const IconOverview = () => <Icon><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></Icon>;
export const IconQueue = () => <Icon><path d="M2 9.5h3l1 2h4l1-2h3" /><path d="M3.5 3h9L14 9.5V13H2V9.5z" /></Icon>;
export const IconFindings = () => <Icon><path d="M3 14V2.5" /><path d="M3 3h8.5l-1.5 3 1.5 3H3" /></Icon>;
export const IconPlan = () => <Icon><rect x="3" y="2.5" width="10" height="11.5" rx="1.5" /><path d="M6 2.5V1.5h4v1" /><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" /></Icon>;
export const IconDocuments = () => <Icon><path d="M4 1.5h5L12.5 5v9.5h-8.5z" /><path d="M9 1.5V5h3.5" /><path d="M6 8.5h4.5M6 11h4.5" /></Icon>;
export const IconActivity = () => <Icon><path d="M1.5 8h3l2-5 3 10 2-5h3" /></Icon>;
export const IconLock = () => <Icon><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Icon>;
export const IconRefresh = () => <Icon><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2v3h-3" /></Icon>;
export const IconMenu = () => <Icon><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></Icon>;
export const IconClose = () => <Icon><path d="M4 4l8 8M12 4l-8 8" /></Icon>;
export const IconSearch = () => <Icon><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></Icon>;
export const IconArrow = () => <Icon><path d="M3 8h10M9 4l4 4-4 4" /></Icon>;
export const IconPlus = () => <Icon><path d="M8 3v10M3 8h10" /></Icon>;
export const IconList = () => <Icon><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.75" cy="4" r=".75" /><circle cx="2.75" cy="8" r=".75" /><circle cx="2.75" cy="12" r=".75" /></Icon>;
export const IconKey = () => <Icon><circle cx="5.5" cy="10.5" r="3" /><path d="M7.7 8.3L13.5 2.5M11.5 4.5l1.5 1.5M10 6l1.2 1.2" /></Icon>;
export const IconCheck = () => <Icon><path d="M3 8.5l3 3 7-7" /></Icon>;
export const IconInfo = () => <Icon><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2V11M8 5h.01" /></Icon>;
export const IconUsers = () => <Icon><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c.5-2.3 2.3-3.5 4.5-3.5s4 1.2 4.5 3.5" /><path d="M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 10.3c1.3.5 2.2 1.6 2.5 3.2" /></Icon>;
export const IconSignOut = () => <Icon><path d="M6 2.5H3.5v11H6" /><path d="M10 5l3 3-3 3M13 8H6.5" /></Icon>;
export const IconShield = () => <Icon><path d="M8 1.5l5.5 2v4c0 3.5-2.5 6-5.5 7-3-1-5.5-3.5-5.5-7v-4z" /><path d="M5.5 8l1.8 1.8L10.5 6.5" /></Icon>;

export function Mark() {
  return (
    <svg className="mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" className="mark-bg" />
      <path d="M8 18.5l4-4 3 3 5-7" className="mark-line" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="10.5" r="1.8" className="mark-dot" />
    </svg>
  );
}
