import type { DocType } from "../lib/types";

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number | undefined, className: string | undefined) {
  return {
    width: size ?? 18,
    height: size ?? 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export function LogoMark({ size, className }: IconProps) {
  return (
    <svg width={size ?? 26} height={size ?? 26} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect x="4" y="3" width="21" height="26" rx="3.5" fill="#161B24" stroke="#3A4353" strokeWidth="1.6" />
      <path d="M9 10h11M9 14.5h11M9 19h6" stroke="#5C6675" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.5 24.5 L21 10l3.6 3.6L10.2 28z" fill="#F0E14E" stroke="#F0E14E" strokeWidth="1" strokeLinejoin="round" />
      <path d="M6.5 24.5 L10.2 28 L6 29.2z" fill="#B7A83B" />
    </svg>
  );
}

export const IconUpload = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    <path d="M12 4v11M7.5 8.5 12 4l4.5 4.5" />
  </svg>
);

export const IconChat = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.6c-.5.4-1.4.1-1.4-.7z" />
    <path d="M8 9h8M8 12h5" />
  </svg>
);

export const IconSummary = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 5.5h16M4 10h16M4 14.5h9" />
    <path d="m16.5 15.5 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconShield = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3.5 5 6v5.2c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V6z" />
    <path d="m9 11.7 2.1 2.1L15.3 9.6" />
  </svg>
);

export const IconShieldAlert = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 3.5 5 6v5.2c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V6z" />
    <path d="M12 8v4.5" />
    <circle cx="12" cy="15.6" r="0.4" fill="currentColor" />
  </svg>
);

export const IconChunks = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="4" y="4" width="16" height="4.4" rx="1.2" />
    <rect x="4" y="10.2" width="11" height="4.4" rx="1.2" />
    <rect x="4" y="16.4" width="14" height="4" rx="1.2" />
  </svg>
);

export const IconSend = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m5 12 14-7-4.2 14L11 13.2z" />
    <path d="M11 13.2 19 5" />
  </svg>
);

export const IconTrash = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7" />
    <path d="M7 7l1 11.2A1.8 1.8 0 0 0 9.8 20h4.4a1.8 1.8 0 0 0 1.8-1.8L17 7" />
    <path d="M10.2 11v5M13.8 11v5" />
  </svg>
);

export const IconRefresh = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.8 3.6v3.6h-3.6" />
  </svg>
);

export const IconDownload = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 16.5V18.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-2" />
  </svg>
);

export const IconClose = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconMenu = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4 7h16M4 12h10M4 17h16" />
  </svg>
);

export const IconPanel = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M14.5 4.5v15" />
    <path d="M17 9h1.5M17 12h1.5" />
  </svg>
);

export const IconDb = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <ellipse cx="12" cy="6" rx="7" ry="2.6" />
    <path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
    <path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6" />
  </svg>
);

export const IconBolt = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H13z" />
  </svg>
);

export const IconSearch = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15.2 15.2 4.8 4.8" />
  </svg>
);

export const IconCheck = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconArrowRight = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />
  </svg>
);

export const IconVector = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="5.5" cy="18.5" r="2" />
    <circle cx="18.5" cy="5.5" r="2" />
    <circle cx="17.5" cy="17.5" r="2" />
    <path d="M7 17 16.8 6.8M8.8 18.2h6.7M17.9 8.4l-.2 6.6" strokeDasharray="2.4 2.2" />
  </svg>
);

export const IconIndex = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <path d="M16.5 13.8v5.4M13.8 16.5h5.4" />
  </svg>
);

export const IconScissors = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <circle cx="6.5" cy="6.5" r="2.3" />
    <circle cx="6.5" cy="17.5" r="2.3" />
    <path d="M8.6 8 20 18M8.6 16 20 6" />
  </svg>
);

export const IconFileContract = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 3.5h9l3 3V18a2.5 2.5 0 0 1-5 0v-.5H6z" />
    <path d="M15 3.5V7h3" />
    <circle cx="11" cy="12" r="2.2" />
    <path d="m9.8 13.8-.9 3.7 2.1-1.1 2.1 1.1-.9-3.7" />
  </svg>
);

export const IconFileChart = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 3.5h9l3 3V20.5H6z" />
    <path d="M15 3.5V7h3" />
    <path d="M9 16.5v-3M12 16.5v-6M15 16.5v-4.5" />
  </svg>
);

export const IconFileAcademic = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 3.5h9l3 3V20.5H6z" />
    <path d="M15 3.5V7h3" />
    <path d="m9 13 3-1.4 3 1.4-3 1.4z" />
    <path d="M10.4 13.8v1.7c0 .6 3.2.6 3.2 0v-1.7" />
  </svg>
);

export const IconFileGeneric = ({ size, className }: IconProps) => (
  <svg {...base(size, className)}>
    <path d="M6 3.5h9l3 3V20.5H6z" />
    <path d="M15 3.5V7h3" />
    <path d="M9 12h6M9 15.5h6" />
  </svg>
);

export function TypeIcon({ type, size, className }: IconProps & { type: DocType }) {
  if (type === "contract") return <IconFileContract size={size} className={className} />;
  if (type === "financial") return <IconFileChart size={size} className={className} />;
  if (type === "academic") return <IconFileAcademic size={size} className={className} />;
  return <IconFileGeneric size={size} className={className} />;
}
