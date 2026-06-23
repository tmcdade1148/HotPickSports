import React from 'react';
import {View} from 'react-native';
import Svg, {Path, Rect} from 'react-native-svg';

interface GamesTagFlameProps {
  /** Height in points — width auto-scales to preserve aspect ratio. */
  size?: number;
}

// Full-color HotPick flame for the "GAMES" tag on the picks CTA.
//
// Unlike the white lucide Flame it replaces, this is a brand mark: its colors
// are baked into the artwork (like a logo) rather than driven by useTheme().
// This component is the one sanctioned home for those hex values — the
// surrounding button chrome still reads from the theme.
//
// Source: exported from Adobe Illustrator. The original referenced CSS classes
// (.st0–.st5) in a <style> block, which react-native-svg does NOT support, so
// each path's fill is inlined here as a presentation attribute. Two empty
// single-moveto paths from the export (no drawable geometry) were dropped.
// viewBox 0 0 16.57 23.62 (aspect ~0.70:1 — taller than wide).
const VIEWBOX_W = 16.57;
const VIEWBOX_H = 23.62;

export function GamesTagFlame({size = 28}: GamesTagFlameProps) {
  const width = size * (VIEWBOX_W / VIEWBOX_H);
  return (
    <View accessible={false} focusable={false} collapsable={false}>
      <Svg width={width} height={size} viewBox="0 0 16.57 23.62">
        {/* Paint order preserved from the source so layering matches the
            Illustrator artwork. */}
        <Path fill="#a1572b" d="M1.22,16.84s-.02-.04-.03-.07h.03s0,.07,0,.07Z" />
        <Path fill="#a1572b" d="M1.78,11.32s-.02-.04-.03-.07h.03s0,.07,0,.07Z" />
        <Path
          fill="#f06b23"
          d="M13.78,22.19h-1.06s-.03-.06-.03-.06c1.13-1.32,1.16-3.14.22-4.6-.42,1.26-1.76,1.98-3.01,2.16-.14.02-.68.1-.74,0,0-.02.01-.05.04-.09.82-.85,1.5-1.89,1.65-3.09.16-1.32-.25-2.85-.8-4.02-.28,1.09-1.29,1.79-2.22,2.32-1.49.73-3.16,1.72-3.62,3.43-.35,1.29-.14,2.62.49,3.79l.02.15h-1.9s-.11-.05-.11-.05c-1.82-2.51-1.13-6.19,1.12-8.21.77-.6,1.49-1.19,2-2.05.07-.11.11-.06.17.05.11.36.19.72.25,1.09-.05.11-.05.11.01,0,.89-.79,1.71-1.69,2.24-2.75s.75-2.23.79-3.43c.02-.21.14-.8.26-.94.09-.1.13-.14.18,0,.49,1.54,1.16,3.02,1.95,4.43.56,1.15.91,2.47.84,3.76-.09,1.63-.8,3.07-1.61,4.45.62-.65,1.25-1.31,1.78-2.04.46-.63.99-1.39.93-2.2.03-.16.05-.17.19-.05.81.69,1.22,1.68,1.42,2.72.36,1.88-.21,3.69-1.34,5.19l-.12.05Z"
        />
        <Path
          fill="#dd5427"
          d="M11.86,6.26c.37.71.67,1.46.95,2.23.38,1.03.55,2.07.58,3.18.42-.56.72-1.15.81-1.86.36.45.61.91.81,1.43.54,1.43,1.3,3.82,1.49,5.29.05.39.06.79.06,1.21-.03,1.69-.77,3.23-1.88,4.45h-.9c.08-.08.16-.17.24-.28.71-1.04,1.28-2.43,1.29-3.72,0-.8-.14-1.58-.42-2.33-.25-.65-.64-1.21-1.19-1.67.05.37,0,.71-.16,1.05-.49,1.11-1.57,2.29-2.41,3.17-.16.17-.29.33-.46.46.72-1.25,1.39-2.41,1.68-3.79.19-.9.19-1.79,0-2.69s-.49-1.69-.92-2.48-.83-1.57-1.16-2.41c-.22-.56-.42-1.09-.61-1.69-.2.38-.3.79-.32,1.22-.03.58-.08,1.12-.22,1.69-.23.97-.65,1.86-1.25,2.66-.49.64-1.04,1.21-1.66,1.74-.09-.45-.14-.86-.3-1.28-.19.31-.4.59-.63.87-.31.38-.66.65-1.04.95-.74.58-1.34,1.31-1.78,2.15-.86,1.64-.98,3.66-.25,5.37.16.38.37.7.62,1.01h-1.17c-.88-.89-1.38-2.04-1.52-3.27,0-.05,0-.13,0-.17,0-.28-.02-.56,0-.83.06-.04.02-.13.02-.21.14-1.41.55-2.79,1.31-3.97l.37-.57s.08-.09.12-.14c.37-.52.78-1.01,1.2-1.51,1.99-2.4,2.72-3.69,3.4-6.67l.45-1.97c.08-.34.19-.66.31-.99.15-.38.34-.73.6-1.04s.51-.59.84-.85c-.28.98.05,1.56.56,2.33l.84,1.18c.63.89,1.23,1.79,1.73,2.75Z"
        />
        <Path
          fill="#b94526"
          d="M1.45,13.73l-.05.18c-.72,1.2-1.12,2.62-1.21,3.99h-.07c.02-.23-.04-.45-.05-.67-.06-.88-.11-1.77,0-2.65s.39-2.14.8-2.86c.09.68.23,1.3.51,1.9.02.05.04.09.09.1Z"
        />
        <Path
          fill="#f68f23"
          d="M12.72,22.18H4.72c-.69-1.23-.95-2.63-.54-4.02.33-1.15,1.3-2.07,2.3-2.68.73-.44,1.5-.75,2.19-1.27.67-.51,1.23-1.05,1.37-1.93.53,1.1.82,2.24.89,3.42.05.76-.09,1.48-.43,2.16-.31.68-.75,1.24-1.3,1.82,1.43.04,3.33-.79,3.7-2.31.87,1.36,1.08,3.04.14,4.38l-.31.43Z"
        />
        <Path fill="#483119" d="M.06,17.24s-.03.02-.03.01.01-.01.03-.01Z" />
        {/* Rounded base bar. No fill in the source → SVG-spec default (black),
            preserved here for fidelity. */}
        <Rect x="0.24" y="22.19" width="16.19" height="1.43" rx="0.65" ry="0.65" fill="#000000" />
      </Svg>
    </View>
  );
}
