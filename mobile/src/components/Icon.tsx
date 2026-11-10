import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type IconName =
  | 'home' | 'receipt' | 'users' | 'user' | 'camera' | 'upload' | 'edit' | 'plus' | 'trash' | 'check'
  | 'alert' | 'x' | 'share' | 'qr' | 'download' | 'copy' | 'star' | 'starFilled' | 'chevronRight'
  | 'chevronLeft' | 'percent' | 'refresh' | 'help' | 'chart' | 'lock' | 'whatsapp' | 'wallet' | 'search' | 'trip' | 'image';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** Minimal line icons drawn with SVG so no icon font is needed. */
export function Icon({ name, size = 22, color, strokeWidth = 2 }: Props) {
  const p = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'home':
        return <><Path {...p} d="M3 10.5 12 3l9 7.5" /><Path {...p} d="M5 9.5V21h14V9.5" /><Path {...p} d="M10 21v-6h4v6" /></>;
      case 'receipt':
        return <><Path {...p} d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" /><Line {...p} x1="8.5" y1="8" x2="15.5" y2="8" /><Line {...p} x1="8.5" y1="12" x2="15.5" y2="12" /><Line {...p} x1="8.5" y1="16" x2="12.5" y2="16" /></>;
      case 'users':
        return <><Circle {...p} cx="9" cy="8" r="3.5" /><Path {...p} d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><Path {...p} d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4" /><Path {...p} d="M17.5 14.8c2 .6 3.4 2.4 4 5.2" /></>;
      case 'user':
        return <><Circle {...p} cx="12" cy="8" r="4" /><Path {...p} d="M4 21c1-4.2 4.1-6.5 8-6.5s7 2.3 8 6.5" /></>;
      case 'camera':
        return <><Path {...p} d="M3 8.5A2 2 0 0 1 5 6.5h2.5L9 4h6l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><Circle {...p} cx="12" cy="13" r="3.8" /></>;
      case 'upload':
        return <><Path {...p} d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><Polyline {...p} points="7.5,8 12,3.5 16.5,8" /><Line {...p} x1="12" y1="3.5" x2="12" y2="15" /></>;
      case 'download':
        return <><Path {...p} d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><Polyline {...p} points="7.5,10.5 12,15 16.5,10.5" /><Line {...p} x1="12" y1="3.5" x2="12" y2="15" /></>;
      case 'edit':
        return <><Path {...p} d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><Line {...p} x1="14" y1="7" x2="17" y2="10" /></>;
      case 'plus':
        return <><Line {...p} x1="12" y1="5" x2="12" y2="19" /><Line {...p} x1="5" y1="12" x2="19" y2="12" /></>;
      case 'trash':
        return <><Polyline {...p} points="4,7 20,7" /><Path {...p} d="M9 7V4h6v3" /><Path {...p} d="M6 7l1 13h10l1-13" /></>;
      case 'check':
        return <Polyline {...p} points="4.5,12.5 9.5,17.5 19.5,6.5" />;
      case 'alert':
        return <><Path {...p} d="M12 3.5 2.5 20h19z" /><Line {...p} x1="12" y1="10" x2="12" y2="14" /><Circle cx="12" cy="17" r="1.1" fill={color} /></>;
      case 'help':
        return <><Circle {...p} cx="12" cy="12" r="9" /><Path {...p} d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" /><Circle cx="12" cy="17" r="1.1" fill={color} /></>;
      case 'x':
        return <><Line {...p} x1="6" y1="6" x2="18" y2="18" /><Line {...p} x1="18" y1="6" x2="6" y2="18" /></>;
      case 'share':
        return <><Circle {...p} cx="18" cy="5.5" r="2.5" /><Circle {...p} cx="6" cy="12" r="2.5" /><Circle {...p} cx="18" cy="18.5" r="2.5" /><Line {...p} x1="8.2" y1="10.8" x2="15.8" y2="6.7" /><Line {...p} x1="8.2" y1="13.2" x2="15.8" y2="17.3" /></>;
      case 'qr':
        return <><Rect {...p} x="3.5" y="3.5" width="7" height="7" rx="1" /><Rect {...p} x="13.5" y="3.5" width="7" height="7" rx="1" /><Rect {...p} x="3.5" y="13.5" width="7" height="7" rx="1" /><Path {...p} d="M13.5 13.5h3v3h-3zM20.5 13.5v3M16.5 20.5h4v-3" /></>;
      case 'copy':
        return <><Rect {...p} x="8.5" y="8.5" width="12" height="12" rx="2" /><Path {...p} d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></>;
      case 'star':
        return <Path {...p} d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />;
      case 'starFilled':
        return <Path {...p} fill={color} d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />;
      case 'chevronRight':
        return <Polyline {...p} points="9,5 16,12 9,19" />;
      case 'chevronLeft':
        return <Polyline {...p} points="15,5 8,12 15,19" />;
      case 'percent':
        return <><Line {...p} x1="19" y1="5" x2="5" y2="19" /><Circle {...p} cx="7" cy="7" r="2.5" /><Circle {...p} cx="17" cy="17" r="2.5" /></>;
      case 'refresh':
        return <><Path {...p} d="M20 12a8 8 0 1 1-2.3-5.6" /><Polyline {...p} points="20,4 20,8.5 15.5,8.5" /></>;
      case 'chart':
        return <><Line {...p} x1="4" y1="20" x2="20" y2="20" /><Rect {...p} x="6" y="11" width="3" height="6" rx="0.5" /><Rect {...p} x="11" y="6" width="3" height="11" rx="0.5" /><Rect {...p} x="16" y="13" width="3" height="4" rx="0.5" /></>;
      case 'lock':
        return <><Rect {...p} x="5" y="10.5" width="14" height="10" rx="2" /><Path {...p} d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>;
      case 'whatsapp':
        return <><Path {...p} d="M4 20l1.3-4A8.5 8.5 0 1 1 8.4 19z" /><Path {...p} d="M9 8.8c.2 2.6 2.6 5 5.2 5.3l1.2-1.3-1.8-.9-.8.8c-1-.4-1.9-1.3-2.4-2.4l.8-.8-.9-1.8z" /></>;
      case 'wallet':
        return <><Rect {...p} x="3" y="6" width="18" height="14" rx="2.5" /><Path {...p} d="M16 13h2.5" /><Path {...p} d="M5 6 15.5 3.5 17 6" /></>;
      case 'trip':
        return <><Path {...p} d="M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><Path {...p} d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8" /><Line {...p} x1="8" y1="8" x2="8" y2="20" /><Line {...p} x1="16" y1="8" x2="16" y2="20" /></>;
      case 'image':
        return <><Path {...p} d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><Circle {...p} cx="9" cy="9.5" r="1.8" /><Path {...p} d="m21 16-5-5-9 9" /></>;
      case 'search':
        return <><Circle {...p} cx="11" cy="11" r="6.5" /><Line {...p} x1="16" y1="16" x2="20.5" y2="20.5" /></>;
    }
  })();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
