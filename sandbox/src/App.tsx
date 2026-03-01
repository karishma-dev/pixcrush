import hero from './hero.jpg';
export default function App() {
  return (
    <div>
      <img src={hero} alt="hero" />
      <picture>
        <source srcSet="/images/hero.jpg 1x, /images/hero-2x.jpg 2x" />
        <img src="/images/hero.jpg" alt="hero" />
      </picture>
    </div>
  );
}
