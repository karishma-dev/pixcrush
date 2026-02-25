import React from 'react';
import heroImg from './hero.webp';
import missing from './missing.png'; // doesn't exist on disk

export default function App() {
  const dynamic = '/dynamic' + '.png';
  return (
    <div>
      <img src="/logo.png" alt="Logo" />
      <img src={heroImg} alt="Hero" />
      <img src={dynamic} alt="Dynamic" />
      <img src="http://example.com/external.png" />
    </div>);

}