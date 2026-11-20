import { Redirect } from 'expo-router';
import React from 'react';

/** Placeholder route for the center Scan tab; the tab button opens the scanner instead of this screen. */
export default function ScanTab() {
  return <Redirect href="/scan" />;
}
